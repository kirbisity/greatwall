import { Terrain } from './terrain.js';

// How far from the castle the thumbnail samples, in world units -- wide
// enough to take in the coast on the island and the river on the mainland,
// without needing a different reach per level.
const REACH = 260;

// The thumbnail's own resolution. Small on purpose: this is a whole map
// distilled into a handful of chunky pixels for a menu card, not a minimap
// kept warm for play, and it is built once when the level list is drawn.
export const THUMBNAIL_COLUMNS = 16;
export const THUMBNAIL_ROWS = 12;

// Where the castle always founds itself, marked in the level's own bronze
// rather than anything read off the ground -- see paintLevelThumbnail.
const CASTLE_MARK = '#e0b840';

// A map preview shows what the tint alone cannot -- hills and woodland --
// by lightening high ground and darkening wood towards this green.
const WOOD_GREEN = [28, 62, 32];
const HEIGHT_LIGHTENING = 50;

function reliefTint(terrain, x, y, tint) {
  const light = Math.min(1.5, Math.max(0.6, 1 + terrain.heightAt(x, y) / HEIGHT_LIGHTENING));
  const wood = Math.min(1, terrain.forestAt(x, y) * 1.5);
  return tint.map((channel, index) => Math.round(
    Math.min(255, channel * light) * (1 - wood) + WOOD_GREEN[index] * wood,
  ));
}

/**
 * A grid of `rgb()` fills for a level, sampled from the same terrain colour
 * the real ground uses (see Terrain#groundTintAt) -- so the thumbnail is a
 * genuine, if coarse, preview of the level's own palette and shape rather
 * than a guess at it. Pure data, with no canvas of its own, so it can be
 * checked without one.
 */
export function levelThumbnailGrid(level, { relief = false } = {}) {
  const terrain = new Terrain(1, level.land, level.river ?? null, level.sea ?? null);
  const grid = [];
  for (let row = 0; row < THUMBNAIL_ROWS; row += 1) {
    const line = [];
    for (let column = 0; column < THUMBNAIL_COLUMNS; column += 1) {
      const x = ((column + 0.5) / THUMBNAIL_COLUMNS - 0.5) * 2 * REACH;
      const y = ((row + 0.5) / THUMBNAIL_ROWS - 0.5) * 2 * REACH;
      const tint = terrain.groundTintAt(x, y);
      const [red, green, blue] = relief ? reliefTint(terrain, x, y, tint) : tint;
      line.push(`rgb(${red}, ${green}, ${blue})`);
    }
    grid.push(line);
  }
  return grid;
}

/**
 * Paint a level's grid onto a canvas, with the castle marked at the centre
 * -- every level founds its city at the origin. One fillRect per cell, at
 * the canvas's own tiny resolution; CSS stretches the result blocky (see
 * .levelThumb in greatwall.css), which is what makes it read as pixel art
 * rather than a photo blurred up.
 */
export function paintLevelThumbnail(canvas, level, { marked = true, relief = false } = {}) {
  canvas.width = THUMBNAIL_COLUMNS;
  canvas.height = THUMBNAIL_ROWS;
  const context = canvas.getContext('2d');
  const grid = levelThumbnailGrid(level, { relief });
  grid.forEach((line, row) => {
    line.forEach((fill, column) => {
      context.fillStyle = fill;
      context.fillRect(column, row, 1, 1);
    });
  });
  if (!marked) {
    return;
  }
  const midColumn = Math.floor(THUMBNAIL_COLUMNS / 2);
  const midRow = Math.floor(THUMBNAIL_ROWS / 2);
  context.fillStyle = CASTLE_MARK;
  context.fillRect(midColumn - 1, midRow - 1, 2, 2);
}
