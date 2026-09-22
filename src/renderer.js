import {
  AMBIENT_LIGHT,
  HEALTH_COLORS,
  PALETTE,
  SEASONS,
  SUN,
  TOWER_HEIGHT_UNITS,
  TOWER_RADIUS_UNITS,
  WALL,
  WALL_HEIGHT_UNITS,
  WALL_THICKNESS_UNITS,
} from './config.js';
import {
  centroid,
  facesCamera,
  lightingFor,
  normalOf,
  projectPoint,
} from './projection.js';
import { Atmosphere } from './atmosphere.js';
import { settings } from './settings.js';
import { BUILDINGS } from './buildings/index.js';
import { compileStructure } from './structures.js';
import { compileUnit } from './units.js';

const NORTH = Math.PI / 2;

// Below this many pixels across, a company draws as plain blocks. At play zoom
// a formation is only a few dozen pixels wide, so that is the usual case and
// the detailed build is reserved for when someone zooms in to look.
const UNIT_DETAIL_PIXELS = 130;
const UNIT_PLAIN_PIXELS = 26;
const UNIT_SWAY = 0.55;
const UNIT_SURGE = 0.72;
const UNIT_BOB = 0.6;
// Locked in a fight, ranks shudder against each other rather than march.
const MELEE_SHAKE = 2.1;
const MELEE_RATE = 7.5;
// Shading is quantised so every face colour can be pre-built at compile time
// instead of formatting a colour string per face per frame.
const LIGHT_BANDS = 12;
// Off-screen geometry is rejected on a four-corner bounding box before the
// full prism is built, and prisms too short to show a flank draw as a flat roof.
const CULL_MARGIN = 80;
const MIN_FLANK_PIXELS = 2.5;
// Towers this small on screen are indistinguishable from the wall they sit on.
const MIN_TOWER_PIXELS = 1.5;
// A wrecked section still stands this much of its raised height.
const DAMAGE_SLUMP = 0.55;

const CASTLE_BAR = { minWidth: 44, maxWidth: 120, height: 7, gap: 7 };
const RAIDER_BAR = { minWidth: 14, maxWidth: 44, height: 4, gap: 4 };

const ROUTE_OPEN = '#7fd4ff';
const ROUTE_SHUT = '#8a8a8a';
const ROUTE_SIEGE = '#ff8a5c';

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

/**
 * How battered a section is, judged against how much of it stands rather than
 * against a finished wall. A section still going up is sound, not ruined.
 */
function wallCondition(wall) {
  const raised = WALL.maxHealth * Math.max(wall.built, 0.01);
  return Math.max(0, Math.min(1, wall.health / raised));
}

/** Damaged masonry darkens towards scorched red. */
function wallTint(condition) {
  return STONE.map((channel, index) => channel * condition + RUINED[index] * (1 - condition));
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
  constructor({ terrain, units, structures }, camera) {
    this.canvases = [terrain, units, structures];
    this.terrain = terrain.getContext('2d');
    this.scene = units.getContext('2d');
    this.overlay = structures.getContext('2d');
    this.camera = camera;
    this.paintedSeason = null;
    this.units = new Map();
    this.startedAt = performance.now();
    this.atmosphere = new Atmosphere(camera);
    // Building geometry never changes, so each type is compiled and shaded once.
    this.structures = new Map();
  }

  /** Seconds of animation time, shared by every company on the field. */
  get clock() {
    return (performance.now() - this.startedAt) / 1000;
  }

  /** Formation geometry with every face colour pre-shaded per light band. */
  unitFor(typeId) {
    const cached = this.units.get(typeId);
    if (cached) {
      return cached;
    }
    const model = compileUnit(typeId);
    if (!model) {
      return null;
    }
    for (const figure of model.figures) {
      for (const faces of [figure.detail, figure.plain, figure.speck]) {
        for (const face of faces) {
          face.shades = Array.from({ length: LIGHT_BANDS + 1 }, (unused, band) => (
            shade(face.material, AMBIENT_LIGHT + (1 - AMBIENT_LIGHT) * (band / LIGHT_BANDS))
          ));
        }
      }
    }
    this.units.set(typeId, model);
    return model;
  }

  structureFor(typeId) {
    const cached = this.structures.get(typeId);
    if (cached) {
      return cached;
    }
    const faces = compileStructure(BUILDINGS[typeId]).map((face) => {
      const normal = normalOf(face.points[0], face.points[1], face.points[2]);
      return {
        points: face.points,
        normal,
        centre: centroid(face.points),
        fill: shade(face.material, lightingFor(normal)),
        ground: face.ground === true,
      };
    });
    this.structures.set(typeId, faces);
    return faces;
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
    const paving = [];
    this.collectCastles(items, paving, view, game.castles);
    this.collectWalls(items, view, game.walls);
    this.collectTowers(items, view, game.walls);
    this.collectRaiders(items, view, game.raiders);
    this.collectRaiders(items, view, game.guards);
    items.sort((a, b) => b.depth - a.depth);
    this.paint(paving);
    this.paint(items);

    // Haze and cloud sit above the world but below the readouts.
    if (settings.atmosphere) {
      this.atmosphere.drawFog(this.overlay, game.season);
      this.atmosphere.drawClouds(this.overlay);
    }
    if (settings.showRoutes) {
      this.drawRoutes(view, game);
    }
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
      // Height is how much has been raised; damage slumps what is standing.
      const condition = wallCondition(wall);
      const height = WALL_HEIGHT_UNITS * wall.built * (DAMAGE_SLUMP + (1 - DAMAGE_SLUMP) * condition);
      if (!this.isOnScreen(view, [
        wall.start, wall.end,
        { x: wall.start.x, y: wall.start.y, z: height },
        { x: wall.end.x, y: wall.end.y, z: height },
      ])) {
        continue;
      }
      const quads = wallPrism(wall.start, wall.end, halfWidth, height);
      const flat = this.flankPixels(view, wall.start, height) < MIN_FLANK_PIXELS;
      this.collectPrism(items, view, flat ? [quads[0]] : quads, wallTint(condition));
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

  collectCastles(items, paving, view, castles) {
    for (const castle of castles) {
      const definition = BUILDINGS[castle.typeId];
      if (!definition) {
        continue;
      }
      const { x, y } = castle.position;
      const reach = definition.radius;
      if (!this.isOnScreen(view, [
        { x: x - reach, y: y - reach }, { x: x + reach, y: y - reach },
        { x: x + reach, y: y + reach }, { x: x - reach, y: y + reach },
      ])) {
        continue;
      }
      for (const face of this.structureFor(castle.typeId)) {
        this.collectStructureFace(face.ground ? paving : items, view, face, castle.position);
      }
    }
  }

  collectStructureFace(items, view, face, offset) {
    const centre = {
      x: face.centre.x + offset.x,
      y: face.centre.y + offset.y,
      z: face.centre.z,
    };
    if (!facesCamera(view, face.normal, centre)) {
      return;
    }
    const points = [];
    let depth = 0;
    for (const corner of face.points) {
      const screen = projectPoint(view, corner.x + offset.x, corner.y + offset.y, corner.z);
      if (!screen) {
        return;
      }
      points.push(screen);
      depth += screen.depth;
    }
    items.push({ kind: 'face', depth: depth / points.length, points, fill: face.fill });
  }

  collectRaiders(items, view, raiders) {
    const seconds = this.clock;
    for (const raider of raiders) {
      const model = this.unitFor(raider.typeId);
      if (!model) {
        continue;
      }
      const { x, y } = raider.position;
      const reach = model.radius;
      if (!this.isOnScreen(view, [
        { x: x - reach, y: y - reach }, { x: x + reach, y: y - reach },
        { x: x + reach, y: y + reach }, { x: x - reach, y: y + reach },
      ])) {
        continue;
      }
      const footing = projectPoint(view, x, y, 0);
      if (!footing) {
        continue;
      }
      const across = view.focal / footing.depth * reach * 2;
      const build = across > UNIT_DETAIL_PIXELS ? 'detail'
        : across > UNIT_PLAIN_PIXELS ? 'plain' : 'speck';

      // Local +y is the way a formation faces, so turn it onto the heading.
      const turn = raider.heading - NORTH;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);

      const fighting = raider.inMelee;
      const shake = fighting ? MELEE_SHAKE : 1;
      const rate = fighting ? MELEE_RATE : 1;

      for (const figure of model.figures) {
        const swayX = Math.sin(seconds * 2.3 * rate + figure.phase) * UNIT_SWAY * shake;
        const swayY = Math.sin(seconds * 1.7 * rate + figure.phase * 1.7) * UNIT_SURGE * shake;
        const bob = Math.abs(Math.sin(seconds * 3.1 * rate + figure.phase)) * UNIT_BOB * shake;
        for (const face of figure[build]) {
          this.collectUnitFace(items, view, face, raider.position, { cos, sin, swayX, swayY, bob });
        }
      }
    }
  }

  collectUnitFace(items, view, face, origin, pose) {
    const world = face.points.map((point) => {
      const localX = point.x + pose.swayX;
      const localY = point.y + pose.swayY;
      return {
        x: origin.x + localX * pose.cos - localY * pose.sin,
        y: origin.y + localX * pose.sin + localY * pose.cos,
        z: point.z + pose.bob,
      };
    });
    const normal = normalOf(world[0], world[1], world[2]);
    if (!facesCamera(view, normal, centroid(world))) {
      return;
    }
    const points = [];
    let depth = 0;
    for (const corner of world) {
      const screen = projectPoint(view, corner.x, corner.y, corner.z);
      if (!screen) {
        return;
      }
      points.push(screen);
      depth += screen.depth;
    }
    const lit = Math.max(0, normal.x * SUN.x + normal.y * SUN.y + normal.z * SUN.z);
    items.push({
      kind: 'face',
      depth: depth / points.length,
      points,
      fill: face.shades[Math.round(lit * LIGHT_BANDS)],
    });
  }

  paint(items) {
    const context = this.scene;
    for (const item of items) {
      context.beginPath();
      context.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i += 1) {
        context.lineTo(item.points[i].x, item.points[i].y);
      }
      context.closePath();
      context.fillStyle = item.fill;
      context.fill();
    }
  }

  // --- screen-space overlays ----------------------------------------------

  /** Debug view: the gateways raiders navigate by, and the waypoint each holds. */
  drawRoutes(view, game) {
    const context = this.overlay;
    const navigation = game.navigation();
    context.save();
    context.font = '11px monospace';

    for (const [index, gateway] of navigation.gateways.entries()) {
      const screen = projectPoint(view, gateway.x, gateway.y, 0);
      if (!screen) {
        continue;
      }
      const reachable = Number.isFinite(navigation.distances[index]);
      context.fillStyle = reachable ? ROUTE_OPEN : ROUTE_SHUT;
      context.beginPath();
      context.arc(screen.x, screen.y, 5, 0, 2 * Math.PI);
      context.fill();
      context.fillText(
        reachable ? String(Math.round(navigation.distances[index])) : 'x',
        screen.x + 8,
        screen.y - 6,
      );
    }

    context.lineWidth = 1;
    for (const raider of game.raiders) {
      const from = projectPoint(view, raider.position.x, raider.position.y, 0);
      const to = projectPoint(view, raider.waypoint.x, raider.waypoint.y, 0);
      if (!from || !to) {
        continue;
      }
      context.strokeStyle = raider.siegeTarget ? ROUTE_SIEGE : ROUTE_OPEN;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    context.restore();
  }

  drawBars(view, game) {
    for (const castle of game.castles) {
      const definition = BUILDINGS[castle.typeId];
      if (definition) {
        this.drawCastleBar(view, castle, definition);
      }
    }
    for (const company of [...game.raiders, ...game.guards]) {
      const fraction = company.health / company.type.maxHealth;
      if (fraction >= 1) {
        continue;
      }
      const model = this.unitFor(company.typeId);
      if (model) {
        this.drawRaiderBar(view, company.position, model.radius, fraction);
      }
    }
  }

  /** Above the building's far edge, widening with the compound itself. */
  drawCastleBar(view, castle, definition) {
    const anchor = projectPoint(view, castle.position.x, castle.position.y + definition.radius, 0);
    const jacobian = this.camera.jacobianAt(castle.position);
    if (!anchor || !jacobian) {
      return;
    }
    const footprint = Math.hypot(jacobian.east.x, jacobian.east.y) * definition.radius * 2;
    const width = Math.min(Math.max(footprint * 0.4, CASTLE_BAR.minWidth), CASTLE_BAR.maxWidth);
    this.drawBar(anchor.x, anchor.y - CASTLE_BAR.height - CASTLE_BAR.gap, width, CASTLE_BAR.height,
      castle.healthFraction);
  }

  /** Above the formation's far edge, sized to how wide it is on screen. */
  drawRaiderBar(view, position, radius, fraction) {
    const anchor = projectPoint(view, position.x, position.y + radius, 0);
    const jacobian = this.camera.jacobianAt(position);
    if (!anchor || !jacobian) {
      return;
    }
    const across = Math.hypot(jacobian.east.x, jacobian.east.y) * radius * 2;
    const width = Math.min(Math.max(across * 0.5, RAIDER_BAR.minWidth), RAIDER_BAR.maxWidth);
    this.drawBar(anchor.x, anchor.y - RAIDER_BAR.height - RAIDER_BAR.gap, width, RAIDER_BAR.height, fraction);
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
