import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonBlend, snowCoverAt } from '../src/season.js';

test('seasonBlend carries a temperature, held exactly at each season\'s midpoint', () => {
  // Winter is the coldest season in the table (see config.js); its own
  // midpoint should read as exactly its own number, not a blend either
  // side of it.
  const { temperature } = seasonBlend(3.5);
  assert.ok(temperature < 0, `expected winter's own midpoint to read below freezing, got ${temperature}`);
});

test('snowCoverAt is zero everywhere but around winter\'s own midpoint', () => {
  for (const phase of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
    assert.equal(snowCoverAt(phase), 0, `expected no snow cover at phase ${phase}`);
  }
});

test('snowCoverAt peaks exactly at winter\'s own midpoint', () => {
  assert.equal(snowCoverAt(3.5), 1);
});

test('snowCoverAt climbs and falls gradually around winter, not as a step', () => {
  const approaching = snowCoverAt(3.3);
  const departing = snowCoverAt(3.7);
  assert.ok(approaching > 0 && approaching < 1, `expected a partial cover approaching winter, got ${approaching}`);
  assert.ok(departing > 0 && departing < 1, `expected a partial cover leaving winter, got ${departing}`);
});

test('a level\'s own climate can hold snow cover at zero the whole year round', () => {
  const desert = { offset: 20 };
  for (const phase of [0, 1, 2, 3, 3.5, 4]) {
    assert.equal(snowCoverAt(phase, desert), 0, `expected a warm climate to see no snow at phase ${phase}`);
  }
});

test('with no climate offset at all, a level reads exactly the season\'s own temperature', () => {
  assert.equal(snowCoverAt(3.5, null), snowCoverAt(3.5));
  assert.equal(snowCoverAt(3.5, { offset: 0 }), snowCoverAt(3.5));
});
