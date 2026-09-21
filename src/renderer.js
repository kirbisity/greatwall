import {
  HEALTH_COLORS,
  SEASON_COLORS,
  SPRITE_SCALE,
  WALL,
  WALL_NODE_RADIUS_UNITS,
  WALL_THICKNESS_UNITS,
} from './config.js';

const WALL_COLOR = '#CCC';
const WALL_NODE_FILL = '#AAA';
const DAMAGE_STRIPE_WIDTH = 40;
const NODE_STROKE_WIDTH = 40;
const CASTLE_FONT = '16px Trebuchet MS';
const SEASONS_PER_YEAR = SEASON_COLORS.length;

function healthColor(fraction) {
  for (const step of HEALTH_COLORS) {
    if (fraction > step.above) {
      return step.color;
    }
  }
  return HEALTH_COLORS[HEALTH_COLORS.length - 1].color;
}

/** Draws the game onto three stacked canvases: terrain, units, structures. */
export class Renderer {
  constructor({ terrain, units, structures }, camera, sprites) {
    this.terrainCanvas = terrain;
    this.unitsCanvas = units;
    this.structuresCanvas = structures;
    this.terrain = terrain.getContext('2d');
    this.units = units.getContext('2d');
    this.structures = structures.getContext('2d');
    this.camera = camera;
    this.sprites = sprites;
    this.paintedSeason = null;
  }

  resize(width, height) {
    for (const canvas of [this.terrainCanvas, this.unitsCanvas, this.structuresCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    this.paintedSeason = null;
  }

  render(game) {
    const { width, height } = this.camera;
    this.units.clearRect(0, 0, width, height);
    this.structures.clearRect(0, 0, width, height);
    this.drawTerrain(game.season);
    this.drawRaiders(game.raiders, game.frame);
    this.drawWalls(game.walls);
    this.drawCastles(game.castles);
  }

  /** The terrain layer is a flat fill, so it only needs repainting on change. */
  drawTerrain(season) {
    if (this.paintedSeason === season) {
      return;
    }
    this.paintedSeason = season;
    this.terrain.fillStyle = SEASON_COLORS[season % SEASONS_PER_YEAR];
    this.terrain.fillRect(0, 0, this.camera.width, this.camera.height);
  }

  drawWalls(walls) {
    if (walls.length === 0) {
      return;
    }
    const context = this.structures;
    const pixelsPerUnit = this.camera.pixelsPerUnit;
    const screenWalls = walls.map((wall) => ({
      start: this.camera.toScreen(wall.start),
      end: this.camera.toScreen(wall.end),
      health: wall.health,
    }));

    context.beginPath();
    for (const wall of screenWalls) {
      context.moveTo(wall.start.x, wall.start.y);
      context.lineTo(wall.end.x, wall.end.y);
    }
    context.lineWidth = WALL_THICKNESS_UNITS * pixelsPerUnit;
    context.strokeStyle = WALL_COLOR;
    context.stroke();

    this.drawDamageStripes(screenWalls);
    this.drawWallNodes(screenWalls, pixelsPerUnit);
  }

  /** One stroke per distinct damage colour instead of one per wall. */
  drawDamageStripes(screenWalls) {
    const context = this.structures;
    const byColor = new Map();
    for (const wall of screenWalls) {
      if (wall.health >= WALL.maxHealth) {
        continue;
      }
      const color = healthColor(wall.health / WALL.maxHealth);
      if (!byColor.has(color)) {
        byColor.set(color, []);
      }
      byColor.get(color).push(wall);
    }
    context.lineWidth = DAMAGE_STRIPE_WIDTH * this.camera.scale;
    for (const [color, group] of byColor) {
      context.beginPath();
      for (const wall of group) {
        context.moveTo(wall.start.x, wall.start.y);
        context.lineTo(wall.end.x, wall.end.y);
      }
      context.strokeStyle = color;
      context.stroke();
    }
  }

  drawWallNodes(screenWalls, pixelsPerUnit) {
    const context = this.structures;
    const radius = WALL_NODE_RADIUS_UNITS * pixelsPerUnit;
    context.beginPath();
    for (const wall of screenWalls) {
      for (const node of [wall.start, wall.end]) {
        context.moveTo(node.x + radius, node.y);
        context.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      }
    }
    context.fillStyle = WALL_NODE_FILL;
    context.fill();
    context.lineWidth = NODE_STROKE_WIDTH * this.camera.scale;
    context.strokeStyle = WALL_COLOR;
    context.stroke();
  }

  drawRaiders(raiders, frame) {
    const context = this.units;
    const scale = this.camera.scale;
    const spriteIndex = frame % 10 < 6 ? 0 : 1;
    for (const raider of raiders) {
      const image = this.sprites.get(raider.type.sprites[spriteIndex]);
      if (!image || !image.width) {
        continue;
      }
      const position = this.camera.toScreen(raider.position);
      const width = image.width * SPRITE_SCALE * scale;
      const height = image.height * SPRITE_SCALE * scale;
      context.save();
      context.translate(position.x, position.y);
      context.rotate(-Math.atan2(-raider.velocity.x, raider.velocity.y));
      context.drawImage(image, -width / 2, -height / 2, width, height);
      context.restore();
    }
  }

  drawCastles(castles) {
    const context = this.structures;
    const scale = this.camera.scale;
    context.font = CASTLE_FONT;
    context.shadowColor = 'black';
    for (const castle of castles) {
      const position = this.camera.toScreen(castle.position);
      const image = this.sprites.get(castle.type.sprite);
      if (image && image.width) {
        const width = image.width * SPRITE_SCALE * scale;
        const height = image.height * SPRITE_SCALE * scale;
        context.shadowBlur = 0;
        context.drawImage(image, position.x - width / 2, position.y - height / 2, width, height);
      }
      context.fillStyle = healthColor(castle.healthFraction);
      context.shadowBlur = 7;
      context.fillText(
        String(Math.trunc(castle.health)),
        position.x - 30 * scale - 11,
        position.y - 800 * scale,
      );
    }
    context.shadowBlur = 0;
  }
}
