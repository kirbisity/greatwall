import {
  HEALTH_COLORS,
  PALETTE,
  SEASONS,
  SPRITE_SCALE,
  WALL,
  WALL_NODE_RADIUS_UNITS,
  WALL_THICKNESS_UNITS,
} from './config.js';

const DAMAGE_STRIPE_FRACTION = 0.45;
// Bars track zoom but stay within a legible range. `lift` is the fraction of
// sprite height to clear: castle art sits inside generous transparent padding,
// so its bar tucks in rather than riding the sprite's bounding box.
const CASTLE_BAR = { width: 0.26, minWidth: 44, maxWidth: 120, height: 7, gap: 6, lift: 0.4 };
const RAIDER_BAR = { width: 0.55, minWidth: 14, maxWidth: 44, height: 4, gap: 3, lift: 0.5 };
const SPRITE_FRAME_LENGTH = 10;
const SPRITE_FRAME_SWITCH = 6;

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
    this.canvases = [terrain, units, structures];
    this.terrain = terrain.getContext('2d');
    this.units = units.getContext('2d');
    this.structures = structures.getContext('2d');
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
    this.units.clearRect(0, 0, width, height);
    this.structures.clearRect(0, 0, width, height);
    this.drawTerrain(game.season);
    this.drawRaiders(game.raiders, game.frame);
    this.drawWalls(game.walls);
    this.drawCastles(game.castles);
  }

  /** The terrain wash only changes with the season, so it is cached until then. */
  drawTerrain(season) {
    if (this.paintedSeason === season) {
      return;
    }
    this.paintedSeason = season;
    const { width, height } = this.camera;
    const palette = SEASONS[season % SEASONS.length];
    const wash = this.terrain.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.1,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    wash.addColorStop(0, palette.light);
    wash.addColorStop(1, palette.dark);
    this.terrain.fillStyle = wash;
    this.terrain.fillRect(0, 0, width, height);
  }

  // --- walls --------------------------------------------------------------

  drawWalls(walls) {
    if (walls.length === 0) {
      return;
    }
    const pixelsPerUnit = this.camera.pixelsPerUnit;
    const screenWalls = walls.map((wall) => ({
      start: this.camera.toScreen(wall.start),
      end: this.camera.toScreen(wall.end),
      health: wall.health,
    }));

    // A dark sweep under a lighter one reads as a bevelled stone rampart.
    this.strokeAll(screenWalls, PALETTE.wallEdge, WALL_THICKNESS_UNITS * pixelsPerUnit);
    this.strokeAll(screenWalls, PALETTE.wallCore, WALL_THICKNESS_UNITS * pixelsPerUnit * 0.68);
    this.drawDamageStripes(screenWalls, pixelsPerUnit);
    this.drawTowers(screenWalls, pixelsPerUnit);
  }

  strokeAll(screenWalls, color, lineWidth) {
    const context = this.structures;
    context.beginPath();
    for (const wall of screenWalls) {
      context.moveTo(wall.start.x, wall.start.y);
      context.lineTo(wall.end.x, wall.end.y);
    }
    context.lineCap = 'round';
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();
  }

  /** One stroke per distinct damage colour instead of one per wall. */
  drawDamageStripes(screenWalls, pixelsPerUnit) {
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
    const width = WALL_THICKNESS_UNITS * pixelsPerUnit * DAMAGE_STRIPE_FRACTION;
    for (const [color, group] of byColor) {
      this.strokeAll(group, color, width);
    }
  }

  drawTowers(screenWalls, pixelsPerUnit) {
    const radius = WALL_NODE_RADIUS_UNITS * pixelsPerUnit;
    const nodes = [];
    for (const wall of screenWalls) {
      nodes.push(wall.start, wall.end);
    }
    this.fillCircles(nodes, radius, PALETTE.towerEdge);
    this.fillCircles(nodes, radius * 0.66, PALETTE.towerFill);
  }

  fillCircles(nodes, radius, color) {
    const context = this.structures;
    context.beginPath();
    for (const node of nodes) {
      context.moveTo(node.x + radius, node.y);
      context.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    }
    context.fillStyle = color;
    context.fill();
  }

  // --- units and castles --------------------------------------------------

  drawRaiders(raiders, frame) {
    const context = this.units;
    const scale = this.camera.scale;
    const spriteIndex = frame % SPRITE_FRAME_LENGTH < SPRITE_FRAME_SWITCH ? 0 : 1;
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

      // Only wounded raiders carry a bar, so a healthy field stays uncluttered.
      const fraction = raider.health / raider.type.maxHealth;
      if (fraction < 1) {
        this.drawHealthBar(context, position, width, height, RAIDER_BAR, fraction);
      }
    }
  }

  drawCastles(castles) {
    const context = this.structures;
    const scale = this.camera.scale;
    for (const castle of castles) {
      const position = this.camera.toScreen(castle.position);
      const image = this.sprites.get(castle.type.sprite);
      if (!image || !image.width) {
        continue;
      }
      const width = image.width * SPRITE_SCALE * scale;
      const height = image.height * SPRITE_SCALE * scale;
      context.drawImage(image, position.x - width / 2, position.y - height / 2, width, height);
      this.drawHealthBar(context, position, width, height, CASTLE_BAR, castle.healthFraction);
    }
  }

  /** A bronze-framed bar resting just above the sprite it belongs to. */
  drawHealthBar(context, position, spriteWidth, spriteHeight, spec, fraction) {
    const barWidth = Math.min(Math.max(spriteWidth * spec.width, spec.minWidth), spec.maxWidth);
    const barHeight = spec.height;
    const left = position.x - barWidth / 2;
    const y = position.y - spriteHeight * spec.lift - barHeight - spec.gap;
    const filled = Math.max(0, Math.min(1, fraction));

    context.fillStyle = PALETTE.barFill;
    context.fillRect(left - 1, y - 1, barWidth + 2, barHeight + 2);
    context.fillStyle = healthColor(filled);
    context.fillRect(left, y, barWidth * filled, barHeight);
    context.lineWidth = 1;
    context.strokeStyle = PALETTE.barEdge;
    context.strokeRect(left - 1.5, y - 1.5, barWidth + 3, barHeight + 3);
  }
}
