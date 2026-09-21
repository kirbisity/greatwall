import {
  HEALTH_COLORS,
  PALETTE,
  SEASONS,
  SPRITE_UNITS_PER_PIXEL,
  TOWER_HEIGHT_UNITS,
  TOWER_RADIUS_UNITS,
  WALL,
  WALL_HEIGHT_UNITS,
  WALL_THICKNESS_UNITS,
} from './config.js';
import {
  centroid,
  facesCamera,
  groundTransform,
  lightingFor,
  normalOf,
  projectPoint,
} from './projection.js';

const NORTH = Math.PI / 2;
const SPRITE_FRAME_LENGTH = 10;
const SPRITE_FRAME_SWITCH = 6;
// Off-screen geometry is rejected on a four-corner bounding box before the
// full prism is built, and prisms too short to show a flank draw as a flat roof.
const CULL_MARGIN = 80;
const MIN_FLANK_PIXELS = 2.5;
// Towers this small on screen are indistinguishable from the wall they sit on.
const MIN_TOWER_PIXELS = 1.5;

const CASTLE_BAR = { minWidth: 44, maxWidth: 120, height: 7, gap: 7 };
const RAIDER_BAR = { minWidth: 14, maxWidth: 44, height: 4, gap: 4 };

const STONE = [214, 203, 178];
const RUINED = [168, 64, 47];
const TOWER = [186, 173, 143];

function healthColor(fraction) {
  for (const step of HEALTH_COLORS) {
    if (fraction > step.above) {
      return step.color;
    }
  }
  return HEALTH_COLORS[HEALTH_COLORS.length - 1].color;
}

function shade(tint, light) {
  return `rgb(${Math.round(tint[0] * light)},${Math.round(tint[1] * light)},${Math.round(tint[2] * light)})`;
}

/** Damaged masonry darkens towards scorched red. */
function wallTint(wall) {
  const health = Math.max(0, wall.health) / WALL.maxHealth;
  return STONE.map((channel, index) => channel * health + RUINED[index] * (1 - health));
}

/**
 * The prism a wall segment occupies. Wound counter-clockwise seen from above so
 * face normals point outwards and back-face culling keeps the roof.
 */
function wallPrism(start, end, halfWidth, height) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = -dy / length * halfWidth;
  const offsetY = dx / length * halfWidth;
  const footprint = [
    { x: start.x - offsetX, y: start.y - offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
    { x: start.x + offsetX, y: start.y + offsetY },
  ];
  return prismFrom(footprint, height);
}

function squarePrism(centre, halfWidth, height) {
  return prismFrom([
    { x: centre.x - halfWidth, y: centre.y - halfWidth },
    { x: centre.x + halfWidth, y: centre.y - halfWidth },
    { x: centre.x + halfWidth, y: centre.y + halfWidth },
    { x: centre.x - halfWidth, y: centre.y + halfWidth },
  ], height);
}

function prismFrom(footprint, height) {
  const base = footprint.map((point) => ({ x: point.x, y: point.y, z: 0 }));
  const top = footprint.map((point) => ({ x: point.x, y: point.y, z: height }));
  const quads = [top];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    quads.push([base[i], base[j], top[j], top[i]]);
  }
  return quads;
}

/** Draws the world with a perspective camera: terrain, sorted scene, overlays. */
export class Renderer {
  constructor({ terrain, units, structures }, camera, sprites) {
    this.canvases = [terrain, units, structures];
    this.terrain = terrain.getContext('2d');
    this.scene = units.getContext('2d');
    this.overlay = structures.getContext('2d');
    this.camera = camera;
    this.sprites = sprites;
    this.paintedSeason = null;
  }

  resize(width, height) {
    for (const canvas of this.canvases) {
      canvas.width = width;
      canvas.height = height;
    }
    this.paintedSeason = null;
  }

  render(game) {
    const { width, height } = this.camera;
    this.scene.clearRect(0, 0, width, height);
    this.overlay.clearRect(0, 0, width, height);
    this.drawTerrain(game.season);

    const view = this.camera.view;
    const items = [];
    this.collectWalls(items, view, game.walls);
    this.collectTowers(items, view, game.walls);
    this.collectCastles(items, view, game.castles);
    this.collectRaiders(items, view, game.raiders, game.frame);
    items.sort((a, b) => b.depth - a.depth);
    this.paint(items);

    this.drawBars(view, game);
  }

  /** The ground fills the canvas, so the wash only changes with the season. */
  drawTerrain(season) {
    if (this.paintedSeason === season) {
      return;
    }
    this.paintedSeason = season;
    const { width, height } = this.camera;
    const palette = SEASONS[season % SEASONS.length];
    const wash = this.terrain.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.1,
      width / 2, height / 2, Math.max(width, height) * 0.8,
    );
    wash.addColorStop(0, palette.light);
    wash.addColorStop(1, palette.dark);
    this.terrain.fillStyle = wash;
    this.terrain.fillRect(0, 0, width, height);
  }

  // --- scene collection ---------------------------------------------------

  /** Screen bounding box of a few probe points against the viewport. */
  isOnScreen(view, probes) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let projected = false;
    for (const probe of probes) {
      const screen = projectPoint(view, probe.x, probe.y, probe.z ?? 0);
      if (!screen) {
        continue;
      }
      projected = true;
      minX = Math.min(minX, screen.x);
      maxX = Math.max(maxX, screen.x);
      minY = Math.min(minY, screen.y);
      maxY = Math.max(maxY, screen.y);
    }
    return projected
      && maxX >= -CULL_MARGIN && minX <= this.camera.width + CULL_MARGIN
      && maxY >= -CULL_MARGIN && minY <= this.camera.height + CULL_MARGIN;
  }

  /** Pixels between a footprint point and the same point at `height`. */
  flankPixels(view, point, height) {
    const base = projectPoint(view, point.x, point.y, 0);
    const top = projectPoint(view, point.x, point.y, height);
    return base && top ? Math.abs(base.y - top.y) : 0;
  }

  collectPrism(items, view, quads, tint) {
    for (const quad of quads) {
      const normal = normalOf(quad[0], quad[1], quad[2]);
      const centre = centroid(quad);
      if (!facesCamera(view, normal, centre)) {
        continue;
      }
      const points = [];
      let depth = 0;
      let visible = true;
      for (const corner of quad) {
        const screen = projectPoint(view, corner.x, corner.y, corner.z);
        if (!screen) {
          visible = false;
          break;
        }
        points.push(screen);
        depth += screen.depth;
      }
      if (!visible) {
        continue;
      }
      items.push({
        kind: 'face',
        depth: depth / quad.length,
        points,
        fill: shade(tint, lightingFor(normal)),
      });
    }
  }

  collectWalls(items, view, walls) {
    const halfWidth = WALL_THICKNESS_UNITS / 2;
    for (const wall of walls) {
      const height = WALL_HEIGHT_UNITS * Math.max(0.35, wall.health / WALL.maxHealth);
      if (!this.isOnScreen(view, [
        wall.start, wall.end,
        { x: wall.start.x, y: wall.start.y, z: height },
        { x: wall.end.x, y: wall.end.y, z: height },
      ])) {
        continue;
      }
      const quads = wallPrism(wall.start, wall.end, halfWidth, height);
      const flat = this.flankPixels(view, wall.start, height) < MIN_FLANK_PIXELS;
      this.collectPrism(items, view, flat ? [quads[0]] : quads, wallTint(wall));
    }
  }

  /** Snapped wall ends share a point object, so a Set gives one tower per node. */
  collectTowers(items, view, walls) {
    const nodes = new Set();
    for (const wall of walls) {
      nodes.add(wall.start);
      nodes.add(wall.end);
    }
    for (const node of nodes) {
      if (!this.isOnScreen(view, [node, { x: node.x, y: node.y, z: TOWER_HEIGHT_UNITS }])) {
        continue;
      }
      const footing = projectPoint(view, node.x, node.y, 0);
      if (!footing || view.focal / footing.depth * TOWER_RADIUS_UNITS < MIN_TOWER_PIXELS) {
        continue;
      }
      const quads = squarePrism(node, TOWER_RADIUS_UNITS, TOWER_HEIGHT_UNITS);
      const flat = this.flankPixels(view, node, TOWER_HEIGHT_UNITS) < MIN_FLANK_PIXELS;
      this.collectPrism(items, view, flat ? [quads[0]] : quads, TOWER);
    }
  }

  collectSprite(items, view, image, position, heading) {
    const jacobian = this.camera.jacobianAt(position);
    if (!jacobian) {
      return null;
    }
    items.push({
      kind: 'sprite',
      depth: jacobian.origin.depth,
      image,
      transform: groundTransform(jacobian, heading),
      width: image.width * SPRITE_UNITS_PER_PIXEL,
      height: image.height * SPRITE_UNITS_PER_PIXEL,
    });
    return jacobian;
  }

  collectCastles(items, view, castles) {
    for (const castle of castles) {
      const image = this.sprites.get(castle.type.sprite);
      if (image && image.width) {
        this.collectSprite(items, view, image, castle.position, NORTH);
      }
    }
  }

  collectRaiders(items, view, raiders, frame) {
    const spriteIndex = frame % SPRITE_FRAME_LENGTH < SPRITE_FRAME_SWITCH ? 0 : 1;
    for (const raider of raiders) {
      const image = this.sprites.get(raider.type.sprites[spriteIndex]);
      if (image && image.width) {
        this.collectSprite(items, view, image, raider.position, raider.heading);
      }
    }
  }

  paint(items) {
    const context = this.scene;
    for (const item of items) {
      if (item.kind === 'face') {
        context.beginPath();
        context.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i += 1) {
          context.lineTo(item.points[i].x, item.points[i].y);
        }
        context.closePath();
        context.fillStyle = item.fill;
        context.fill();
      } else {
        context.setTransform(...item.transform);
        context.drawImage(item.image, -item.width / 2, -item.height / 2, item.width, item.height);
        context.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  }

  // --- screen-space overlays ----------------------------------------------

  drawBars(view, game) {
    for (const castle of game.castles) {
      const image = this.sprites.get(castle.type.sprite);
      this.drawBarOver(view, castle.position, image, CASTLE_BAR, castle.healthFraction);
    }
    for (const raider of game.raiders) {
      const fraction = raider.health / raider.type.maxHealth;
      if (fraction >= 1) {
        continue;
      }
      const image = this.sprites.get(raider.type.sprites[0]);
      this.drawBarOver(view, raider.position, image, RAIDER_BAR, fraction);
    }
  }

  /** Rest the bar above the sprite's far edge, measured in world units. */
  drawBarOver(view, position, image, spec, fraction) {
    if (!image || !image.width) {
      return;
    }
    const halfDepth = image.height * SPRITE_UNITS_PER_PIXEL / 2;
    const anchor = projectPoint(view, position.x, position.y + halfDepth, 0);
    const jacobian = this.camera.jacobianAt(position);
    if (!anchor || !jacobian) {
      return;
    }
    const spriteWidth = Math.hypot(jacobian.east.x, jacobian.east.y) * image.width * SPRITE_UNITS_PER_PIXEL;
    const width = Math.min(Math.max(spriteWidth * 0.5, spec.minWidth), spec.maxWidth);
    this.drawBar(anchor.x, anchor.y - spec.height - spec.gap, width, spec.height, fraction);
  }

  drawBar(centreX, top, width, height, fraction) {
    const context = this.overlay;
    const left = centreX - width / 2;
    const filled = Math.max(0, Math.min(1, fraction));
    context.fillStyle = PALETTE.barFill;
    context.fillRect(left - 1, top - 1, width + 2, height + 2);
    context.fillStyle = healthColor(filled);
    context.fillRect(left, top, width * filled, height);
    context.lineWidth = 1;
    context.strokeStyle = PALETTE.barEdge;
    context.strokeRect(left - 1.5, top - 1.5, width + 3, height + 3);
  }
}
