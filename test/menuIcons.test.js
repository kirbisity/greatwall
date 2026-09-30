import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_MAPS } from '../src/config.js';
import { iconSource } from '../src/menuIcons.js';

test('every weather a map shows has an icon', () => {
  for (const map of Object.values(BATTLE_MAPS)) {
    assert.match(iconSource(map.weather.icon), /^data:image\/svg\+xml/);
  }
});
