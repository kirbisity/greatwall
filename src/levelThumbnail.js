import { mixChannels, seasonBlend, snowCoverAt } from './season.js';
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
// How much of a mist's own blend reaches the thumbnail: a hint of weather,
// not the murk itself.
const MIST_WASH = 0.45;

function reliefTint(terrain, x, y, tint) {
  const light = Math.min(1.5, Math.max(0.6, 1 + terrain.heightAt(x, y) / HEIGHT_LIGHTENING));
  const wood = Math.min(1, terrain.forestAt(x, y) * 1.5);
  return tint.map((channel, index) => Math.round(
    Math.min(255, channel * light) * (1 - wood) + WOOD_GREEN[index] * wood,
  ));
}

/**
 * A map's weather as the thumbnail can show it: the season's own autumn gold
 * and winter snow on the ground, and the standing mist washed lightly over
 * the whole picture. A level with no weather of its own reads as plain
 * ground, exactly as before.
 */
function weatherLook(weather) {
  if (!weather) {
    return { gold: 0, snowCover: 0, mist: null };
  }
  const phase = (weather.season ?? 0) + 0.5;
  return {
    gold: seasonBlend(phase).groundGold,
    snowCover: snowCoverAt(phase, weather.climate),
    mist: weather.mist ?? null,
  };
}

function washedWithMist(channels, mist) {
  if (!mist) {
    return channels;
  }
  const wash = Math.min(0.5, mist.blend * MIST_WASH);
  return mixChannels(channels.join(', '), mist.color, wash).split(', ').map(Number);
}

/**
 * A grid of `rgb()` fills for a level, sampled from the same terrain colour
 * the real ground uses (see Terrain#groundTintAt) -- so the thumbnail is a
 * genuine, if coarse, preview of the level's own palette and shape rather
 * than a guess at it. Pure data, with no canvas of its own, so it can be
 * checked without one.
 */
export function levelThumbnailGrid(level, { relief = false, detail = 1 } = {}) {
  const columns = THUMBNAIL_COLUMNS * detail;
  const rows = THUMBNAIL_ROWS * detail;
  const terrain = new Terrain(1, level.land, level.river ?? null, level.sea ?? null);
  const { gold, snowCover, mist } = weatherLook(level.weather);
  const grid = [];
  for (let row = 0; row < rows; row += 1) {
    const line = [];
    for (let column = 0; column < columns; column += 1) {
      const x = ((column + 0.5) / columns - 0.5) * 2 * REACH;
      const y = ((row + 0.5) / rows - 0.5) * 2 * REACH;
      const tint = terrain.groundTintAt(x, y, [0, 0, 0], gold, snowCover);
      const shaded = relief ? reliefTint(terrain, x, y, tint) : tint;
      const [red, green, blue] = washedWithMist(shaded, mist);
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
export function paintLevelThumbnail(canvas, level, { marked = true, relief = false, detail = 1 } = {}) {
  const grid = levelThumbnailGrid(level, { relief, detail });
  canvas.width = grid[0].length;
  canvas.height = grid.length;
  const context = canvas.getContext('2d');
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
