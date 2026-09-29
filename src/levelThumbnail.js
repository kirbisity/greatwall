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

/**
 * A grid of `rgb()` fills for a level, sampled from the same terrain colour
 * the real ground uses (see Terrain#groundTintAt) -- so the thumbnail is a
 * genuine, if coarse, preview of the level's own palette and shape rather
 * than a guess at it. Pure data, with no canvas of its own, so it can be
 * checked without one.
 */
export function levelThumbnailGrid(level) {
  const terrain = new Terrain(1, level.land, level.river ?? null, level.sea ?? null);
  const grid = [];
  for (let row = 0; row < THUMBNAIL_ROWS; row += 1) {
    const line = [];
    for (let column = 0; column < THUMBNAIL_COLUMNS; column += 1) {
      const x = ((column + 0.5) / THUMBNAIL_COLUMNS - 0.5) * 2 * REACH;
      const y = ((row + 0.5) / THUMBNAIL_ROWS - 0.5) * 2 * REACH;
      const [red, green, blue] = terrain.groundTintAt(x, y);
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
export function paintLevelThumbnail(canvas, level) {
  canvas.width = THUMBNAIL_COLUMNS;
  canvas.height = THUMBNAIL_ROWS;
  const context = canvas.getContext('2d');
  const grid = levelThumbnailGrid(level);
  grid.forEach((line, row) => {
    line.forEach((fill, column) => {
      context.fillStyle = fill;
      context.fillRect(column, row, 1, 1);
    });
  });
  const midColumn = Math.floor(THUMBNAIL_COLUMNS / 2);
  const midRow = Math.floor(THUMBNAIL_ROWS / 2);
  context.fillStyle = CASTLE_MARK;
  context.fillRect(midColumn - 1, midRow - 1, 2, 2);
}
