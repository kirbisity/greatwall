import {
  AMBIENT_LIGHT,
  AVATAR,
  CASTLE_REBUILD,
  DAMAGE_EFFECTS,
  FLAG,
  HEALTH_COLORS,
  HOUSES,
  PALETTE,
  SEASONS,
  SUN,
  TERRAIN,
  TOWER_HEIGHT_UNITS,
  TOWER_RADIUS_UNITS,
  WALL_HEIGHT_UNITS,
  WALL_THICKNESS_UNITS,
} from './config.js';
import { clamp } from './geometry.js';
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

/**
 * One tiny building, run through the same compiler as a castle. A single
 * untiered roof keeps it to about a dozen faces, cheap enough for two dozen
 * of them to sit in the scene at once.
 */
const HOUSE_DEFINITION = {
  name: 'House',
  radius: Math.max(HOUSES.footprint.width, HOUSES.footprint.depth) / 2 + HOUSES.footprint.overhang,
  parts: [{
    type: 'building', x: 0, y: 0,
    width: HOUSES.footprint.width, depth: HOUSES.footprint.depth, height: HOUSES.footprint.height,
    material: 'plaster',
    roof: { height: HOUSES.footprint.roofHeight, overhang: HOUSES.footprint.overhang, tiers: 1, material: 'roofTile' },
  }],
};
// Licks and smoke puffs a burning house draws each frame — a few is enough
// to read as flame without costing more than the ambient damage effects do.
const HOUSE_FLAME_LICKS = 3;
const HOUSE_SMOKE_PUFFS = 2;

const ROUTE_OPEN = '#7fd4ff';
const ROUTE_SHUT = '#8a8a8a';
const ROUTE_SIEGE = '#ff8a5c';

// How far the ground mesh may reach from the focus, as a multiple of camera
// distance. Stops a low tilt asking for half the world.
const GROUND_SPAN = 1.05;
const TRUNK_DISTANCE = 420;
const PLAN_LINE = 'rgba(232, 196, 68, 0.95)';
const PLAN_TOOL = 'images/buildBtn.png';
const PLAN_TOOL_SIZE = 22;
const TRUNK_FILL = 'rgb(84,62,42)';
const CANOPY_FILL = 'rgb(74,96,58)';

/** Parse a '#rrggbb' season colour into the channels shade() wants. */
function shadeOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

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

/** A stable pseudo-random value in [0, 1) for a given number, no state kept. */
function hash(seed) {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const FILL_PATTERN = /rgb\((\d+),(\d+),(\d+)\)/;

/** A pre-shaded fill, darkened towards black — the city burning down. */
function darkenFill(fill, amount) {
  if (amount <= 0) {
    return fill;
  }
  const match = fill.match(FILL_PATTERN);
  if (!match) {
    return fill;
  }
  const scale = 1 - Math.min(1, amount);
  return `rgb(${Math.round(match[1] * scale)},${Math.round(match[2] * scale)},${Math.round(match[3] * scale)})`;
}

/**
 * How grown a part is, given how far through the build phase the whole
 * structure is (`overall`, 0 to 1) and how far the part sits from the centre
 * (`radiusFraction`, 0 to 1). A part near the centre finishes early; one on
 * the rim does not begin until `staggerFraction` of the phase has passed —
 * which is what makes the building read as rising outward rather than
 * inflating as one piece.
 */
function staggeredGrowth(overall, radiusFraction, staggerFraction) {
  const start = radiusFraction * staggerFraction;
  const span = 1 - staggerFraction;
  if (span <= 0) {
    return overall >= start ? 1 : 0;
  }
  return clamp((overall - start) / span, 0, 1);
}

/**
 * How battered a section is, judged against how much of it stands rather than
 * against a finished wall. A section still going up is sound, not ruined.
 */
function wallCondition(wall) {
  const raised = wall.maxHealth * Math.max(wall.built, 0.01);
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
function wallPrism(start, end, halfWidth, height, ground = null) {
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
  return prismFrom(footprint, height, ground);
}

function squarePrism(centre, halfWidth, height, base = 0) {
  return prismFrom([
    { x: centre.x - halfWidth, y: centre.y - halfWidth },
    { x: centre.x + halfWidth, y: centre.y - halfWidth },
    { x: centre.x + halfWidth, y: centre.y + halfWidth },
    { x: centre.x - halfWidth, y: centre.y + halfWidth },
  ], height, [base, base, base, base]);
}

function prismFrom(footprint, height, ground = null) {
  const base = footprint.map((point, i) => ({ x: point.x, y: point.y, z: ground ? ground[i] : 0 }));
  const top = footprint.map((point, i) => ({
    x: point.x,
    y: point.y,
    z: (ground ? ground[i] : 0) + height,
  }));
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
    this.ground = terrain.getContext('2d');
    this.scene = units.getContext('2d');
    this.overlay = structures.getContext('2d');
    this.camera = camera;
    this.paintedGround = null;
    this.units = new Map();
    this.images = new Map();
    this.startedAt = performance.now();
    this.atmosphere = new Atmosphere(camera);
    // Building geometry never changes, so each type is compiled and shaded once.
    this.structures = new Map();
  }

  /** Bitmaps are loaded once and drawn only when they have arrived. */
  imageFor(path) {
    let image = this.images.get(path);
    if (!image) {
      image = new Image();
      image.src = path;
      this.images.set(path, image);
    }
    return image.naturalWidth > 0 ? image : null;
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
    for (const faces of [model.geometry.detail, model.geometry.plain, model.geometry.speck]) {
      for (const face of faces) {
        face.shades = Array.from({ length: LIGHT_BANDS + 1 }, (unused, band) => (
          shade(face.material, AMBIENT_LIGHT + (1 - AMBIENT_LIGHT) * (band / LIGHT_BANDS))
        ));
      }
    }
    this.units.set(typeId, model);
    return model;
  }

  /** Faces plus how far the furthest part sits from the centre, for a rebuild. */
  structureFor(typeId) {
    const cached = this.structures.get(typeId);
    if (cached) {
      return cached;
    }
    const definition = BUILDINGS[typeId];
    const faces = definition ? compileStructure(definition).map((face) => {
      const normal = normalOf(face.points[0], face.points[1], face.points[2]);
      return {
        points: face.points,
        normal,
        centre: centroid(face.points),
        fill: shade(face.material, lightingFor(normal)),
        ground: face.ground === true,
        growRadius: face.growRadius ?? 0,
        partBase: face.partBase ?? 0,
      };
    }) : [];
    const maxGrowRadius = Math.max(1, ...faces.filter((face) => !face.ground).map((face) => face.growRadius));
    const result = { faces, maxGrowRadius };
    this.structures.set(typeId, result);
    return result;
  }

  /** The one house shape, compiled and shaded once and shared by every house. */
  get houseModel() {
    if (!this._houseModel) {
      this._houseModel = compileStructure(HOUSE_DEFINITION).map((face) => {
        const normal = normalOf(face.points[0], face.points[1], face.points[2]);
        return {
          points: face.points,
          normal,
          centre: centroid(face.points),
          fill: shade(face.material, lightingFor(normal)),
          ground: face.ground === true,
          partBase: face.partBase ?? 0,
        };
      });
    }
    return this._houseModel;
  }

  resize(width, height) {
    for (const canvas of this.canvases) {
      canvas.width = width;
      canvas.height = height;
    }
    this.paintedGround = null;
  }

  render(game) {
    const { width, height } = this.camera;
    this.scene.clearRect(0, 0, width, height);
    this.overlay.clearRect(0, 0, width, height);
    this.drawGround(game);

    const view = this.camera.view;
    const items = [];
    const paving = [];
    // Once the last castle falls, the city blackens over BREACH.collapseSeconds
    // before the game actually ends.
    const blacken = game.isDefeated ? clamp(game.breachFraction, 0, 1) : 0;
    this.collectCastles(items, paving, view, game.castles, game.terrain, blacken);
    this.collectWalls(items, view, game.walls, game.terrain);
    this.collectTowers(items, view, game.walls, game.terrain);
    this.collectHouses(items, view, game.houses, game.terrain);
    this.collectRaiders(items, view, game.raiders, game.terrain);
    this.collectRaiders(items, view, game.guards, game.terrain);
    items.sort((a, b) => b.depth - a.depth);
    this.paint(paving);
    this.paint(items);

    // Haze and cloud sit above the world but below the readouts.
    if (settings.atmosphere) {
      this.atmosphere.drawFog(this.overlay, game.season);
      this.atmosphere.drawClouds(this.overlay);
    }
    this.drawPeggedWalls(view, game);
    this.drawWorkingWalls(view, game);
    this.drawDamageEffects(view, game);
    this.drawBurningHouses(view, game);
    this.drawCityFlags(view, game);
    if (settings.showRoutes) {
      this.drawRoutes(view, game);
    }
    this.drawBars(view, game);
  }

  /**
   * The ground: a shaded mesh of the landscape with its woodland standing on
   * it, painted onto its own layer.
   *
   * None of it moves, so it is only repainted when the view does. While the
   * camera is still — which is most of a fight — the whole landscape costs
   * nothing at all.
   */
  drawGround(game) {
    const { width, height, focus, distance, elevation } = this.camera;
    const key = `${game.season}|${Math.round(focus.x)}|${Math.round(focus.y)}`
      + `|${Math.round(distance)}|${Math.round(elevation * 4)}|${width}x${height}`;
    if (this.paintedGround === key) {
      return;
    }
    this.paintedGround = key;

    const palette = SEASONS[game.season % SEASONS.length];
    const wash = this.ground.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.1,
      width / 2, height / 2, Math.max(width, height) * 0.8,
    );
    wash.addColorStop(0, palette.light);
    wash.addColorStop(1, palette.dark);
    this.ground.fillStyle = wash;
    this.ground.fillRect(0, 0, width, height);

    const bounds = this.groundBounds();
    this.drawLandscape(game.terrain, palette, bounds);
    this.drawWoods(game, bounds);
  }

  /** The patch of ground the view covers, clamped so a low tilt cannot run away. */
  groundBounds() {
    const { width, height } = this.camera;
    const corners = [
      this.camera.toWorld({ x: 0, y: height }),
      this.camera.toWorld({ x: width, y: height }),
      this.camera.toWorld({ x: 0, y: 0 }),
      this.camera.toWorld({ x: width, y: 0 }),
    ];
    const span = this.camera.distance * GROUND_SPAN;
    const clamp = (value, middle) => Math.max(middle - span, Math.min(middle + span, value));
    const xs = corners.map((corner) => clamp(corner.x, this.camera.focus.x));
    const ys = corners.map((corner) => clamp(corner.y, this.camera.focus.y));
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }

  drawLandscape(terrain, palette, bounds) {
    const context = this.ground;
    const view = this.camera.view;
    // Pick a cell that lands about the same size on screen at any zoom.
    const cell = Math.max(TERRAIN.minCell, Math.min(TERRAIN.maxCell,
      TERRAIN.meshCellPixels * this.camera.distance / view.focal));
    const tint = shadeOf(palette.light);

    for (let x = Math.floor(bounds.minX / cell) * cell; x < bounds.maxX; x += cell) {
      for (let y = Math.floor(bounds.minY / cell) * cell; y < bounds.maxY; y += cell) {
        const corners = [
          { x, y }, { x: x + cell, y }, { x: x + cell, y: y + cell }, { x, y: y + cell },
        ];
        const points = [];
        let usable = true;
        for (const corner of corners) {
          const screen = projectPoint(view, corner.x, corner.y, terrain.heightAt(corner.x, corner.y));
          if (!screen) {
            usable = false;
            break;
          }
          points.push(screen);
        }
        if (!usable) {
          continue;
        }
        // Shade by how the cell leans, which is what reads as a hill.
        const a = terrain.heightAt(x, y);
        const slopeX = (terrain.heightAt(x + cell, y) - a) / cell;
        const slopeY = (terrain.heightAt(x, y + cell) - a) / cell;
        const normal = { x: -slopeX * TERRAIN.slopeRelief, y: -slopeY * TERRAIN.slopeRelief, z: 1 };
        const length = Math.hypot(normal.x, normal.y, normal.z);
        const light = lightingFor({ x: normal.x / length, y: normal.y / length, z: normal.z / length });

        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 4; i += 1) {
          context.lineTo(points[i].x, points[i].y);
        }
        context.closePath();
        context.fillStyle = shade(tint, light);
        context.fill();
      }
    }
  }

  /** Woodland, drawn with the ground because it never moves either. */
  drawWoods(game, bounds) {
    const context = this.ground;
    const view = this.camera.view;
    const trees = game.treesWithin(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    const trunks = this.camera.distance < TRUNK_DISTANCE;

    for (const tree of trees) {
      const top = projectPoint(view, tree.x, tree.y, tree.z + tree.size * 2.2);
      const foot = projectPoint(view, tree.x, tree.y, tree.z);
      if (!top || !foot) {
        continue;
      }
      const spread = view.focal / foot.depth * tree.size;
      if (foot.x < -spread || foot.x > this.camera.width + spread
        || foot.y < -spread || foot.y > this.camera.height + spread) {
        continue;
      }
      if (trunks) {
        context.fillStyle = TRUNK_FILL;
        context.fillRect(foot.x - spread * 0.12, top.y, spread * 0.24, foot.y - top.y);
      }
      // A four-sided cone: cheap, and it still reads as a canopy from above.
      const skirt = projectPoint(view, tree.x, tree.y, tree.z + tree.size * 0.9);
      const base = skirt ? skirt.y : foot.y;
      context.beginPath();
      context.moveTo(top.x, top.y);
      context.lineTo(foot.x + spread * 0.8, base);
      context.lineTo(foot.x, base + spread * 0.35);
      context.lineTo(foot.x - spread * 0.8, base);
      context.closePath();
      context.fillStyle = CANOPY_FILL;
      context.fill();
    }
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

  collectWalls(items, view, walls, terrain) {
    for (const wall of walls) {
      if (wall.isPlanned) {
        continue;
      }
      // Fortifying grows the section in place, so its tier is a scale on the
      // one prism rather than a second one stacked on top.
      const halfWidth = WALL_THICKNESS_UNITS * wall.widthScale / 2;
      // Height is how much has been raised; damage slumps what is standing.
      const condition = wallCondition(wall);
      const height = WALL_HEIGHT_UNITS * wall.heightScale * wall.built
        * (DAMAGE_SLUMP + (1 - DAMAGE_SLUMP) * condition);
      if (!this.isOnScreen(view, [
        wall.start, wall.end,
        { x: wall.start.x, y: wall.start.y, z: height },
        { x: wall.end.x, y: wall.end.y, z: height },
      ])) {
        continue;
      }
      // Footprint corners 0 and 3 belong to the start, 1 and 2 to the end, so
      // a section laid across a slope follows it rather than floating.
      const startGround = terrain.heightAt(wall.start.x, wall.start.y);
      const endGround = terrain.heightAt(wall.end.x, wall.end.y);
      const ground = [startGround, endGround, endGround, startGround];
      const quads = wallPrism(wall.start, wall.end, halfWidth, height, ground);
      const flat = this.flankPixels(view, wall.start, height) < MIN_FLANK_PIXELS;
      this.collectPrism(items, view, flat ? [quads[0]] : quads, wallTint(condition));
    }
  }

  /**
   * Snapped wall ends share a point object, so a Map gives one tower per
   * node. A node takes the scale of the boldest section meeting it, which is
   * what carries a fortified stretch through its own corners.
   */
  collectTowers(items, view, walls, terrain) {
    const nodes = new Map();
    for (const wall of walls) {
      if (wall.isPlanned) {
        continue;
      }
      for (const node of [wall.start, wall.end]) {
        const grown = nodes.get(node);
        nodes.set(node, {
          height: Math.max(grown?.height ?? 1, wall.heightScale),
          width: Math.max(grown?.width ?? 1, wall.widthScale),
        });
      }
    }
    for (const [node, scale] of nodes) {
      const height = TOWER_HEIGHT_UNITS * scale.height;
      const radius = TOWER_RADIUS_UNITS * scale.width;
      if (!this.isOnScreen(view, [node, { x: node.x, y: node.y, z: height }])) {
        continue;
      }
      const footing = projectPoint(view, node.x, node.y, 0);
      if (!footing || view.focal / footing.depth * radius < MIN_TOWER_PIXELS) {
        continue;
      }
      const quads = squarePrism(node, radius, height, terrain.heightAt(node.x, node.y));
      const flat = this.flankPixels(view, node, height) < MIN_FLANK_PIXELS;
      this.collectPrism(items, view, flat ? [quads[0]] : quads, TOWER);
    }
  }

  /**
   * Houses behind the walls. A burning one is skipped here entirely — it is
   * drawn instead as a burst of fire in drawBurningHouses, on the overlay.
   */
  collectHouses(items, view, houses, terrain) {
    const faces = this.houseModel;
    for (const house of houses) {
      if (house.burning || !this.onScreenFor(view, house.position, HOUSE_DEFINITION.radius)) {
        continue;
      }
      const ground = terrain.heightAt(house.position.x, house.position.y);
      for (const face of faces) {
        this.collectStructureFace(items, view, face, house.position, ground, { grow: house.growth });
      }
    }
  }

  /** Screen bounding box of a footprint square, for the on-screen cull. */
  onScreenFor(view, position, reach) {
    const { x, y } = position;
    return this.isOnScreen(view, [
      { x: x - reach, y: y - reach }, { x: x + reach, y: y - reach },
      { x: x + reach, y: y + reach }, { x: x - reach, y: y + reach },
    ]);
  }

  /**
   * Castles, plus the two states either side of an upgrade: the old
   * structure sinking into the ground, then the new one rising back out of
   * it, part by part, centre first. `blacken` mixes every face towards
   * black, for the city burning down once the game is lost.
   */
  collectCastles(items, paving, view, castles, terrain, blacken = 0) {
    for (const castle of castles) {
      const { x, y } = castle.position;
      const ground = terrain.heightAt(x, y);

      if (castle.rebuild && castle.rebuild.demolishSeconds > 0) {
        const definition = BUILDINGS[castle.rebuild.fromTypeId];
        if (!definition || !this.onScreenFor(view, castle.position, definition.radius)) {
          continue;
        }
        const grow = castle.demolishProgress;
        for (const face of this.structureFor(castle.rebuild.fromTypeId).faces) {
          this.collectStructureFace(face.ground ? paving : items, view, face, castle.position, ground, { grow, blacken });
        }
        continue;
      }

      const definition = BUILDINGS[castle.typeId];
      if (!definition || !this.onScreenFor(view, castle.position, definition.radius)) {
        continue;
      }
      const { faces, maxGrowRadius } = this.structureFor(castle.typeId);
      const overall = castle.rebuild ? castle.buildProgress : 1;
      for (const face of faces) {
        const grow = castle.rebuild && !face.ground
          ? staggeredGrowth(overall, face.growRadius / maxGrowRadius, CASTLE_REBUILD.staggerFraction)
          : 1;
        this.collectStructureFace(face.ground ? paving : items, view, face, castle.position, ground, { grow, blacken });
      }
    }
  }

  collectStructureFace(items, view, face, offset, ground = 0, options = {}) {
    const { grow = 1, blacken = 0 } = options;
    // Shrunk toward its own footing rather than the world origin, so a part
    // reads as rising out of the ground instead of the whole city swelling.
    const localZ = grow < 1 && !face.ground
      ? (z) => face.partBase + (z - face.partBase) * grow
      : (z) => z;
    const centre = {
      x: face.centre.x + offset.x,
      y: face.centre.y + offset.y,
      z: localZ(face.centre.z) + ground,
    };
    if (!facesCamera(view, face.normal, centre)) {
      return;
    }
    const points = [];
    let depth = 0;
    for (const corner of face.points) {
      const screen = projectPoint(view, corner.x + offset.x, corner.y + offset.y, localZ(corner.z) + ground);
      if (!screen) {
        return;
      }
      points.push(screen);
      depth += screen.depth;
    }
    items.push({
      kind: 'face',
      depth: depth / points.length,
      points,
      fill: blacken > 0 ? darkenFill(face.fill, blacken) : face.fill,
    });
  }

  collectRaiders(items, view, raiders, terrain) {
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
      const faces = model.geometry[build];

      const ground = terrain.heightAt(x, y);
      for (const figure of model.figures) {
        const swayX = figure.place.x + Math.sin(seconds * 2.3 * rate + figure.phase) * UNIT_SWAY * shake;
        const swayY = figure.place.y + Math.sin(seconds * 1.7 * rate + figure.phase * 1.7) * UNIT_SURGE * shake;
        const bob = Math.abs(Math.sin(seconds * 3.1 * rate + figure.phase)) * UNIT_BOB * shake;
        for (const face of faces) {
          this.collectUnitFace(items, view, face, raider.position, { cos, sin, swayX, swayY, bob: bob + ground });
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

  /**
   * Sections that have been paid for but not begun: a marked line on the
   * ground with a tool over it. Nothing is standing there yet, which is the
   * point — a wall cannot be conjured in front of a breach.
   */
  drawPeggedWalls(view, game) {
    const context = this.overlay;
    const tool = this.imageFor(PLAN_TOOL);
    context.save();
    context.lineWidth = 2;
    context.setLineDash([9, 7]);
    context.strokeStyle = PLAN_LINE;

    for (const wall of game.walls) {
      if (!wall.isPlanned) {
        continue;
      }
      const from = projectPoint(view, wall.start.x, wall.start.y,
        game.terrain.heightAt(wall.start.x, wall.start.y));
      const to = projectPoint(view, wall.end.x, wall.end.y,
        game.terrain.heightAt(wall.end.x, wall.end.y));
      if (!from || !to) {
        continue;
      }
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      if (tool) {
        // Fade the tool in and out so a pegged line reads as pending work.
        const pulse = 0.55 + 0.45 * Math.sin(this.clock * 4);
        const size = PLAN_TOOL_SIZE;
        context.globalAlpha = pulse;
        context.drawImage(tool, (from.x + to.x) / 2 - size / 2,
          (from.y + to.y) / 2 - size, size, size);
        context.globalAlpha = 1;
      }
    }
    context.restore();
  }

  /**
   * Masons at work: a section paid to repair, or one growing into its next
   * tier. Both are already standing, so they get the pulsing tool hovering
   * over the stone rather than the dashed line a pegged section gets. The
   * anchor rides the section's own height, so it clears a raised wall.
   */
  drawWorkingWalls(view, game) {
    const tool = this.imageFor(PLAN_TOOL);
    if (!tool) {
      return;
    }
    const context = this.overlay;
    const pulse = 0.55 + 0.45 * Math.sin(this.clock * 4);
    const size = PLAN_TOOL_SIZE;
    for (const wall of game.walls) {
      if (!wall.isRepairing && !wall.isUpgrading) {
        continue;
      }
      const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const ground = game.terrain.heightAt(midpoint.x, midpoint.y);
      const top = ground + WALL_HEIGHT_UNITS * wall.heightScale + 1.5;
      const anchor = projectPoint(view, midpoint.x, midpoint.y, top);
      if (!anchor) {
        continue;
      }
      context.globalAlpha = pulse;
      context.drawImage(tool, anchor.x - size / 2, anchor.y - size, size, size);
      context.globalAlpha = 1;
    }
  }

  /**
   * Smoke, then fire, on any castle or standing wall that is badly battered.
   * Puffs are placed by a cheap positional hash rather than kept as live
   * particles, so the cost is a handful of gradient fills only where
   * something is actually burning, and nothing at all otherwise.
   */
  drawDamageEffects(view, game) {
    const breaching = game.isDefeated;
    for (const castle of game.castles) {
      const definition = BUILDINGS[castle.typeId];
      if (!definition) {
        continue;
      }
      const ground = game.terrain.heightAt(castle.position.x, castle.position.y);
      const fraction = breaching ? -1 : castle.healthFraction;
      const seed = castle.position.x * 7.31 + castle.position.y * 13.7;
      this.drawStructureDamage(view, castle.position, definition.radius, fraction, seed, ground);
    }
    for (const wall of game.walls) {
      if (wall.isPlanned) {
        continue;
      }
      const condition = wallCondition(wall);
      if (condition >= DAMAGE_EFFECTS.smokeThreshold) {
        continue;
      }
      const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const ground = game.terrain.heightAt(mid.x, mid.y);
      const seed = mid.x * 7.31 + mid.y * 13.7;
      this.drawStructureDamage(view, mid, Math.max(10, wall.length / 2), condition, seed, ground);
    }
  }

  drawStructureDamage(view, centre, spread, healthFraction, seed, ground) {
    if (healthFraction >= DAMAGE_EFFECTS.smokeThreshold) {
      return;
    }
    const smokeIntensity = clamp(
      (DAMAGE_EFFECTS.smokeThreshold - healthFraction) / DAMAGE_EFFECTS.smokeThreshold, 0, 1);
    const smokeCount = Math.ceil(smokeIntensity * DAMAGE_EFFECTS.maxSmokePuffs);
    for (let i = 0; i < smokeCount; i += 1) {
      this.drawPuff(view, centre, spread, seed + i * 17.3, ground, 'smoke');
    }
    if (healthFraction >= DAMAGE_EFFECTS.fireThreshold) {
      return;
    }
    const fireIntensity = clamp(
      (DAMAGE_EFFECTS.fireThreshold - healthFraction) / DAMAGE_EFFECTS.fireThreshold, 0, 1);
    const fireCount = Math.ceil(fireIntensity * DAMAGE_EFFECTS.maxFirePuffs);
    for (let i = 0; i < fireCount; i += 1) {
      this.drawPuff(view, centre, spread, seed + 101 + i * 23.9, ground, 'fire');
    }
  }

  /** One smoke or fire puff, its position and phase both derived from `seed`. */
  drawPuff(view, centre, spread, seed, ground, kind) {
    const rx = (hash(seed) - 0.5) * 2 * spread;
    const ry = (hash(seed + 1) - 0.5) * 2 * spread;
    const phase = hash(seed + 2) * DAMAGE_EFFECTS.puffLifeSeconds;
    const life = DAMAGE_EFFECTS.puffLifeSeconds;
    const p = ((this.clock + phase) % life) / life;

    const rise = kind === 'smoke' ? p * 10 : Math.sin(p * Math.PI) * 1.2;
    const worldZ = ground + rise + (kind === 'smoke' ? 2 : 0.5);
    const screen = projectPoint(view, centre.x + rx, centre.y + ry, worldZ);
    if (!screen) {
      return;
    }

    const baseRadius = kind === 'smoke' ? DAMAGE_EFFECTS.smokeRadius : DAMAGE_EFFECTS.fireRadius;
    const growth = kind === 'smoke' ? (0.4 + p * 0.9) : (0.6 + Math.sin(p * Math.PI) * 0.5);
    const pixelRadius = Math.max(1, view.focal / screen.depth * baseRadius * growth);
    const alpha = kind === 'smoke'
      ? (1 - p) * 0.5
      : 0.35 + 0.35 * Math.sin(p * Math.PI * 3 + seed);

    const context = this.overlay;
    const gradient = context.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, pixelRadius);
    if (kind === 'smoke') {
      gradient.addColorStop(0, `rgba(68,66,62,${alpha.toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(68,66,62,0)');
    } else {
      gradient.addColorStop(0, `rgba(255,214,120,${alpha.toFixed(3)})`);
      gradient.addColorStop(0.5, `rgba(224,102,40,${(alpha * 0.85).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(224,102,40,0)');
    }
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(screen.x, screen.y, pixelRadius, 0, 2 * Math.PI);
    context.fill();
  }

  /**
   * A house does not smoulder like a battered wall — it catches all at once,
   * burns hard for HOUSES.burnSeconds, and is gone. The flame is several
   * licks wandering and flickering on the clock rather than one static
   * blob, so it reads as burning rather than glowing; smoke rises above it
   * once it has properly caught, and both fade together in the last stretch.
   */
  drawBurningHouses(view, game) {
    for (const house of game.houses) {
      if (!house.burning) {
        continue;
      }
      const ground = game.terrain.heightAt(house.position.x, house.position.y);
      const progress = clamp(house.burnElapsed / HOUSES.burnSeconds, 0, 1);
      this.drawHouseFire(view, house.position, ground, progress);
    }
  }

  drawHouseFire(view, position, ground, progress) {
    const context = this.overlay;
    const clock = this.clock;
    const seed = position.x * 7.31 + position.y * 13.7;
    // Full strength through most of the burn, then dies down in the last
    // fifth rather than cutting off with the house still roaring.
    const fade = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;

    for (let i = 0; i < HOUSE_FLAME_LICKS; i += 1) {
      const phase = seed + i * 41.7;
      const flicker = 0.7 + 0.3 * Math.sin(clock * 11 + phase * 2.1);
      const worldX = position.x + Math.sin(clock * 6 + phase) * 0.5;
      const worldY = position.y + Math.cos(clock * 5.2 + phase * 1.4) * 0.5;
      const worldZ = ground + 0.6 + i * 0.3 + Math.sin(clock * 4.3 + phase * 1.3) * 0.3;
      const screen = projectPoint(view, worldX, worldY, worldZ);
      if (!screen) {
        continue;
      }
      const worldRadius = (1.5 + i * 0.5) * flicker;
      const pixelRadius = Math.max(1, view.focal / screen.depth * worldRadius);
      const alpha = 0.85 * fade * flicker;
      const gradient = context.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, pixelRadius);
      gradient.addColorStop(0, `rgba(255,224,140,${alpha.toFixed(3)})`);
      gradient.addColorStop(0.5, `rgba(224,102,40,${(alpha * 0.85).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(224,102,40,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(screen.x, screen.y, pixelRadius, 0, 2 * Math.PI);
      context.fill();
    }

    // Smoke only once the fire has properly caught, rising above the licks
    // and thickening as the burn goes on.
    if (progress < 0.12) {
      return;
    }
    for (let i = 0; i < HOUSE_SMOKE_PUFFS; i += 1) {
      const phase = seed + 90 + i * 53.1;
      const rise = 2.4 + progress * 5.5 + i * 1.6;
      const worldX = position.x + Math.sin(clock * 1.6 + phase) * 1.4;
      const worldY = position.y + Math.cos(clock * 1.3 + phase) * 1.1;
      const screen = projectPoint(view, worldX, worldY, ground + rise);
      if (!screen) {
        continue;
      }
      const worldRadius = 1.6 + progress * 2.6 + i * 0.7;
      const pixelRadius = Math.max(1, view.focal / screen.depth * worldRadius);
      const alpha = 0.42 * fade * (0.5 + 0.5 * progress);
      const gradient = context.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, pixelRadius);
      gradient.addColorStop(0, `rgba(70,68,64,${alpha.toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(70,68,64,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(screen.x, screen.y, pixelRadius, 0, 2 * Math.PI);
      context.fill();
    }
  }

  /** One banner over each castle, planted above roughly where its hall stands tallest. */
  drawCityFlags(view, game) {
    const image = this.imageFor(FLAG.sprite);
    if (!image) {
      return;
    }
    for (const castle of game.castles) {
      const definition = BUILDINGS[castle.typeId];
      if (!definition) {
        continue;
      }
      const ground = game.terrain.heightAt(castle.position.x, castle.position.y);
      const staffHeight = definition.radius * FLAG.heightPerFootprint;
      const anchor = projectPoint(view, castle.position.x, castle.position.y, ground + staffHeight);
      if (!anchor) {
        continue;
      }
      const scale = this.camera.view.focal / this.camera.distance;
      const width = Math.min(FLAG.maxWidth, Math.max(FLAG.minWidth, FLAG.width * scale / 2));
      const height = width * image.naturalHeight / image.naturalWidth;
      this.overlay.drawImage(image, anchor.x, anchor.y - height, width, height);
    }
  }

  /** The portrait a company carries, over its head. */
  drawAvatar(company, centreX, bottomY) {
    const path = company.type.avatar;
    if (!path) {
      return bottomY;
    }
    const image = this.imageFor(path);
    if (!image) {
      return bottomY;
    }
    const scale = Math.hypot(this.camera.view.focal / this.camera.distance, 0);
    const width = Math.min(AVATAR.maxWidth, Math.max(AVATAR.minWidth, AVATAR.width * scale / 2));
    const height = width * image.naturalHeight / image.naturalWidth;
    const top = bottomY - height;
    this.overlay.drawImage(image, centreX - width / 2, top, width, height);
    return top - AVATAR.gap;
  }

  drawBars(view, game) {
    for (const castle of game.castles) {
      const definition = BUILDINGS[castle.typeId];
      if (definition) {
        this.drawCastleBar(view, castle, definition);
      }
    }
    for (const company of [...game.raiders, ...game.guards]) {
      const model = this.unitFor(company.typeId);
      if (!model) {
        continue;
      }
      const fraction = company.health / company.type.maxHealth;
      const top = this.drawCompanyBar(view, game, company, model.radius, fraction);
      if (top !== null) {
        this.drawAvatar(company, top.x, top.y);
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

  /**
   * Above the formation's far edge, sized to how wide it is on screen. A full
   * strength company shows no bar, but still carries its portrait.
   */
  drawCompanyBar(view, game, company, radius, fraction) {
    const { x, y } = company.position;
    const ground = game.terrain.heightAt(x, y);
    const anchor = projectPoint(view, x, y + radius, ground);
    const jacobian = this.camera.jacobianAt(company.position);
    if (!anchor || !jacobian) {
      return null;
    }
    let top = anchor.y - RAIDER_BAR.gap;
    if (fraction < 1) {
      const across = Math.hypot(jacobian.east.x, jacobian.east.y) * radius * 2;
      const width = Math.min(Math.max(across * 0.5, RAIDER_BAR.minWidth), RAIDER_BAR.maxWidth);
      top = anchor.y - RAIDER_BAR.height - RAIDER_BAR.gap;
      this.drawBar(anchor.x, top, width, RAIDER_BAR.height, fraction);
    }
    return { x: anchor.x, y: top - AVATAR.gap };
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
