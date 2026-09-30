import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { BATTLE_MAPS } from '../src/config.js';
import { THUMBNAIL_COLUMNS, THUMBNAIL_ROWS, levelThumbnailGrid } from '../src/levelThumbnail.js';

/** Parse an `rgb(r, g, b)` string back into its channels. */
function channels(fill) {
  return fill.match(/\d+/g).map(Number);
}

test('every level gets a full grid of real colours, not a placeholder', () => {
  for (const level of LEVELS) {
    const grid = levelThumbnailGrid(level);
    assert.equal(grid.length, THUMBNAIL_ROWS);
    for (const line of grid) {
      assert.equal(line.length, THUMBNAIL_COLUMNS);
      for (const fill of line) {
        const [red, green, blue] = channels(fill);
        for (const value of [red, green, blue]) {
          assert.ok(value >= 0 && value <= 255, `${fill} is not a channel triple`);
        }
      }
    }
  }
});

test("a level's thumbnail is its own palette, not a copy of another level's", () => {
  const grids = LEVELS.map((level) => levelThumbnailGrid(level).flat().join('|'));
  const distinct = new Set(grids);
  assert.equal(distinct.size, LEVELS.length, 'two levels produced an identical thumbnail');
});

test("the island's thumbnail shows open water; the desert's does not", () => {
  const island = LEVELS.find((level) => level.sea);
  const desert = LEVELS.find((level) => level.id === 'dust-sea');
  const isBlue = (fill) => {
    const [red, green, blue] = channels(fill);
    return blue > red && blue > green;
  };
  assert.ok(levelThumbnailGrid(island).flat().some(isBlue), "the island's coast should read as water");
  assert.ok(!levelThumbnailGrid(desert).flat().some(isBlue), 'the desert has no water to show');
});

test('the same level thumbnails the same way twice, so it can be cached at menu-build time', () => {
  const level = LEVELS[0];
  assert.deepEqual(levelThumbnailGrid(level), levelThumbnailGrid(level));
});

test('a map preview shows the ground it is fought over: the maps do not all look alike', () => {
  const grids = Object.values(BATTLE_MAPS).map((map) => {
    const level = { land: { ...LEVELS.find((entry) => entry.mode === 'battle').land, ...map.land } };
    return levelThumbnailGrid(level, { relief: true }).flat().join('|');
  });
  assert.equal(new Set(grids).size, grids.length);
});
