import test from 'node:test';
import assert from 'node:assert/strict';

const { Terrain } = await import('../src/terrain.js');
const { TERRAIN } = await import('../src/config.js');

function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const BANDS = [TERRAIN.grassColor, TERRAIN.mossColor, TERRAIN.dirtColor, TERRAIN.rockColor].map(channels);

/** Which band a mottled colour was drawn from, or -1 if it matches none. */
function bandOf(hex) {
  const color = channels(hex);
  return BANDS.findIndex((band) => band.every((c, i) => Math.abs(color[i] - c) <= c * TERRAIN.mottleStrength + 1));
}

test('ground colour stays within a mottle of one of the four configured bands', () => {
  const terrain = new Terrain(1);
  for (let x = 0; x < 2000; x += 37) {
    assert.ok(bandOf(terrain.groundColorAt(x, x * 1.3)) >= 0, `unexpected colour at ${x}`);
  }
});

test('all four bands turn up across a wide enough patch', () => {
  const terrain = new Terrain(1);
  const seen = new Set();
  for (let x = 0; x < 4000; x += 53) {
    for (let y = 0; y < 4000; y += 53) {
      seen.add(bandOf(terrain.groundColorAt(x, y)));
    }
  }
  assert.equal(seen.size, BANDS.length, `expected all ${BANDS.length} bands, saw ${seen.size}`);
});

test('ground colour is stable for the same spot and seed', () => {
  const terrain = new Terrain(5);
  const first = terrain.groundColorAt(123, 456);
  const second = terrain.groundColorAt(123, 456);
  assert.equal(first, second);
});

test('ground reads as patches, not one flat colour', () => {
  const terrain = new Terrain(1);
  const seen = new Set();
  for (let x = 0; x < 4000; x += 53) {
    for (let y = 0; y < 4000; y += 53) {
      seen.add(terrain.groundColorAt(x, y));
    }
  }
  assert.ok(seen.size > 1, 'expected more than one ground colour across the map');
});

test('a different seed grows a different patchwork', () => {
  const a = new Terrain(1);
  const b = new Terrain(2);
  let differs = false;
  for (let x = 0; x < 2000 && !differs; x += 31) {
    if (a.groundColorAt(x, x * 0.7) !== b.groundColorAt(x, x * 0.7)) {
      differs = true;
    }
  }
  assert.ok(differs, 'expected the two seeds to disagree somewhere');
});

// --- ridges and dune lines --------------------------------------------

test('with no ridge at all, a level\'s height is untouched by it', () => {
  const terrain = new Terrain(1);
  assert.equal(terrain.ridgeAt(40, 40), 0);
});

test('a ridge running along the x axis varies across it, not along it', () => {
  const terrain = new Terrain(1, { ridge: { angle: 0, scale: 100, alongScale: 900, height: 12 } });
  // Two points a long way apart along the ridge's own length (x) should
  // read close to each other; the same step across it (y) should not.
  const alongA = terrain.ridgeAt(0, 0);
  const alongB = terrain.ridgeAt(400, 0);
  const across = terrain.ridgeAt(0, 400);
  assert.ok(Math.abs(alongA - alongB) < Math.abs(alongA - across),
    `expected less change along the ridge (${Math.abs(alongA - alongB)}) than across it (${Math.abs(alongA - across)})`);
});

test('a ridge stays within the height it was given', () => {
  const terrain = new Terrain(1, { ridge: { angle: 20, scale: 80, alongScale: 500, height: 15 } });
  for (let x = -500; x < 500; x += 37) {
    for (let y = -500; y < 500; y += 53) {
      const bump = terrain.ridgeAt(x, y);
      assert.ok(bump >= -15 && bump <= 15, `expected -15..15, got ${bump} at (${x}, ${y})`);
    }
  }
});

test('a ridge folds into the ground a level already has, not a separate layer', () => {
  const flat = new Terrain(1, { hillHeight: 0, detailHeight: 0, mountainChance: 0 });
  const ridged = new Terrain(1, { hillHeight: 0, detailHeight: 0, mountainChance: 0, ridge: { angle: 15, scale: 90, alongScale: 600, height: 14 } });
  let differs = false;
  for (let x = -400; x < 400 && !differs; x += 41) {
    if (Math.abs(flat.wildHeightAt(x, 0) - ridged.wildHeightAt(x, 0)) > 1) {
      differs = true;
    }
  }
  assert.ok(differs, 'expected the ridge to actually shape the ground');
});

test('there are a few mountains, not none and not a range', () => {
  const terrain = new Terrain(1);
  const mountains = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  assert.ok(mountains.length > 0, 'expected at least one mountain in a 2000x2000 span');
  assert.ok(mountains.length < 60, `expected a handful, not ${mountains.length} -- that reads as a mountain range`);
});

test('mountainsWithin is stable for the same span and seed', () => {
  const terrain = new Terrain(3);
  const first = terrain.mountainsWithin(0, 0, 1500, 1500);
  const second = terrain.mountainsWithin(0, 0, 1500, 1500);
  assert.deepEqual(first, second);
});

test('a mountain peak stands well above the rolling hills around it', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const peakHeight = terrain.wildHeightAt(mountain.x, mountain.y);
  const farHeight = terrain.wildHeightAt(mountain.x + 5000, mountain.y);
  assert.ok(peakHeight > farHeight + TERRAIN.mountainMinHeight - 5,
    `expected the peak (${peakHeight.toFixed(1)}) to clear ordinary ground (${farHeight.toFixed(1)}) by a mountain's worth`);
});

test('height eases back to the ordinary ground past a mountain\'s reach', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const farAway = { x: mountain.x + 3000, y: mountain.y };
  const atDistance = terrain.wildHeightAt(farAway.x, farAway.y);
  const bareGround = terrain.wildHeightAt(farAway.x + 1, farAway.y);
  assert.ok(Math.abs(atDistance - bareGround) < 5, 'well clear of any peak, height should read as ordinary hills');
});

test('the ground reads as bare rock on a mountain\'s slope', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const ROCK_BAND = BANDS.length - 1;
  assert.equal(bandOf(terrain.groundColorAt(mountain.x, mountain.y)), ROCK_BAND);
});

test('trees only stand on one of the ground\'s two greens, never dirt or rock', () => {
  const terrain = new Terrain(1);
  const trees = terrain.treesWithin(-1500, -1500, 1500, 1500);
  assert.ok(trees.length > 0, 'expected some trees over a span this size');
  for (const tree of trees) {
    const band = terrain.groundBandAt(tree.x, tree.y);
    assert.ok(band === TERRAIN.grassColor || band === TERRAIN.mossColor,
      `a tree grew on neither green at (${tree.x}, ${tree.y}), band ${band}`);
  }
});

test('the two greens scale the wood oppositely: grass sparse, moss dense', () => {
  const terrain = new Terrain(1);
  let grassPoint = null;
  let mossPoint = null;
  for (let x = 0; x < 1000 && (!grassPoint || !mossPoint); x += 5) {
    for (let y = 0; y < 1000 && (!grassPoint || !mossPoint); y += 5) {
      const band = terrain.groundBandAt(x, y);
      if (!grassPoint && band === TERRAIN.grassColor) {
        grassPoint = { x, y };
      }
      if (!mossPoint && band === TERRAIN.mossColor) {
        mossPoint = { x, y };
      }
    }
  }
  assert.ok(grassPoint && mossPoint, 'expected to find both greens nearby');
  assert.equal(terrain.treeDensityScaleAt(grassPoint.x, grassPoint.y), TERRAIN.grassTreeDensity);
  assert.equal(terrain.treeDensityScaleAt(mossPoint.x, mossPoint.y), TERRAIN.mossTreeDensity);
  assert.ok(TERRAIN.mossTreeDensity > TERRAIN.grassTreeDensity,
    'the lighter green should scale the wood down, the darker one up');
});

test('a real wood plants far denser on moss than on the same reach of grass', () => {
  const reach = 800;
  const terrain = new Terrain(1, { forestThreshold: 0, grassTreeDensity: 0.05, mossTreeDensity: 1 });
  const trees = terrain.treesWithin(-reach, -reach, reach, reach);
  const onGrass = trees.filter((tree) => terrain.groundBandAt(tree.x, tree.y) === TERRAIN.grassColor).length;
  const onMoss = trees.filter((tree) => terrain.groundBandAt(tree.x, tree.y) === TERRAIN.mossColor).length;

  // A rate against how much of each green there is to plant on at all, not
  // a raw count either band could win just by covering more ground.
  const cell = terrain.land.treeSpacing;
  let grassCells = 0;
  let mossCells = 0;
  for (let x = -reach; x < reach; x += cell) {
    for (let y = -reach; y < reach; y += cell) {
      const band = terrain.groundBandAt(x, y);
      if (band === TERRAIN.grassColor) {
        grassCells += 1;
      } else if (band === TERRAIN.mossColor) {
        mossCells += 1;
      }
    }
  }
  const grassRate = onGrass / grassCells;
  const mossRate = onMoss / mossCells;
  assert.ok(mossRate > grassRate * 5,
    `expected moss (${mossRate.toFixed(2)}) to read far denser than grass (${grassRate.toFixed(2)})`);
});

test('no tree grows on a mountain\'s slope, even where the band beneath is grass', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const trees = terrain.treesWithin(
    mountain.x - mountain.radius, mountain.y - mountain.radius,
    mountain.x + mountain.radius, mountain.y + mountain.radius,
  );
  for (const tree of trees) {
    const dist = Math.hypot(tree.x - mountain.x, tree.y - mountain.y);
    assert.ok(dist >= mountain.radius * 0.5, `a tree grew practically on the peak at distance ${dist.toFixed(1)}`);
  }
});

test('no tree grows within the city\'s clear radius, whatever the forest noise says', () => {
  // A threshold of 0 means every point where grass grows would otherwise
  // take some cover -- the clearest possible test that the radius, not the
  // noise, is what is keeping this patch open.
  const terrain = new Terrain(1, { forestThreshold: 0, cityClearRadius: 80, cityClearFeather: 0 });
  const trees = terrain.treesWithin(-80, -80, 80, 80);
  for (const tree of trees) {
    const distance = Math.hypot(tree.x, tree.y);
    assert.ok(distance >= 80, `a tree grew at distance ${distance.toFixed(1)}, inside the clear radius`);
  }
});

test('a city\'s clearing is a default of no clearing at all', () => {
  const cleared = new Terrain(1, { forestThreshold: 0, cityClearRadius: 80, cityClearFeather: 0 });
  const plain = new Terrain(1, { forestThreshold: 0 });
  assert.equal(cleared.forestAt(10, 10), 0, 'expected the clearing to hold at (10, 10)');
  assert.ok(plain.forestAt(10, 10) > 0, 'expected the same point to carry cover with no clearing set');
});

test('the tree line grows in gradually across the feather, not as a hard edge', () => {
  const terrain = new Terrain(1, { forestThreshold: 0, cityClearRadius: 80, cityClearFeather: 40 });
  const atEdge = terrain.forestAt(80, 0);
  const partway = terrain.forestAt(100, 0);
  const beyond = terrain.forestAt(120, 0);
  assert.equal(atEdge, 0, 'expected the clearing itself to still be bare right at its own radius');
  assert.ok(partway > 0 && partway < beyond,
    `expected the cover partway across the feather (${partway}) to sit strictly between the edge and beyond it (${beyond})`);
});

test('past the feather, the clearing leaves the noise\'s own cover untouched', () => {
  const cleared = new Terrain(1, { forestThreshold: 0, cityClearRadius: 80, cityClearFeather: 40 });
  const plain = new Terrain(1, { forestThreshold: 0 });
  assert.equal(cleared.forestAt(300, 300), plain.forestAt(300, 300),
    'well clear of the city, the two should read exactly the same cover');
});

test('a pond is open water at its centre and dry ground past its field', () => {
  const terrain = new Terrain(1, { ponds: [{ x: 50, y: 0, radius: 6, fieldRadius: 20 }] });
  assert.equal(terrain.pondAt(50, 0), 1, 'expected open water dead centre');
  assert.equal(terrain.pondAt(50 + 30, 0), 0, 'expected dry ground well past the field');
});

test('the field around a pond is green right at the water and fades out by its own edge', () => {
  const terrain = new Terrain(1, { ponds: [{ x: 50, y: 0, radius: 6, fieldRadius: 20 }] });
  assert.equal(terrain.oasisAt(50, 0), 1, 'expected full green at the water');
  assert.equal(terrain.oasisAt(50 + 6, 0), 1, 'expected full green right at the water\'s edge too');
  const partway = terrain.oasisAt(50 + 13, 0);
  assert.ok(partway > 0 && partway < 1, `expected the field partway out (${partway}) strictly between full and none`);
  assert.equal(terrain.oasisAt(50 + 20, 0), 0, 'expected dry ground exactly at the field\'s own edge');
});

test('a pond paints as water and its field as green, not the desert underneath either', () => {
  const desert = { grassColor: '#d9c188', forestThreshold: 1, ponds: [{ x: 50, y: 0, radius: 6, fieldRadius: 20 }] };
  const terrain = new Terrain(1, desert);
  const [waterR, waterG, waterB] = terrain.groundTintAt(50, 0);
  assert.ok(waterB > waterR, `expected the pond's centre to read as water, got rgb(${waterR}, ${waterG}, ${waterB})`);
  const [fieldR, fieldG, fieldB] = terrain.groundTintAt(50 + 10, 0);
  assert.ok(fieldG > fieldR && fieldG > fieldB,
    `expected the field to read as green, got rgb(${fieldR}, ${fieldG}, ${fieldB})`);
});

test('a pond sits in a shallow dip, not flush with the ground around it', () => {
  const land = { ponds: [{ x: 50, y: 0, radius: 6, fieldRadius: 20 }] };
  const withPond = new Terrain(1, land);
  const plain = new Terrain(1, {});
  assert.ok(withPond.heightAt(50, 0) < plain.heightAt(50, 0) - 1,
    'expected the pond to dip the ground it sits on');
});

test('no tree takes root inside a pond, whatever the forest noise says', () => {
  const land = { forestThreshold: 0, treeSpacing: 4, ponds: [{ x: 50, y: 0, radius: 10, fieldRadius: 20 }] };
  const terrain = new Terrain(1, land);
  const trees = terrain.treesWithin(30, -20, 70, 20);
  for (const tree of trees) {
    const distance = Math.hypot(tree.x - 50, tree.y);
    assert.ok(distance >= 10, `a tree grew at distance ${distance.toFixed(1)}, inside the pond`);
  }
});

test('with no ponds at all, a level pays nothing for the feature', () => {
  const terrain = new Terrain(1);
  assert.equal(terrain.pondAt(50, 0), 0);
  assert.equal(terrain.oasisAt(50, 0), 0);
});

// --- a sea's own beach -----------------------------------------------------

function beachTerrain(overrides = {}) {
  return new Terrain(1, {}, null, {
    shore: 200, coast: 0, coastScale: 1, beachWidth: 40, shelf: 100, depth: 10,
    color: '#2f5f86', bankColor: '#cbb98d', ...overrides,
  });
}

test('a beach is full sand right at the waterline, and bare past its own width', () => {
  const terrain = beachTerrain();
  assert.equal(terrain.beachAt(200, 0), 1, 'expected full sand exactly at the shore');
  assert.equal(terrain.beachAt(200 - 40, 0), 0, 'expected nothing right at the beach\'s own inland edge');
  assert.equal(terrain.beachAt(0, 0), 0, 'expected the shore\'s own centre to be well past any beach at all');
});

test('a beach fades inland rather than cutting from sand to turf', () => {
  const terrain = beachTerrain();
  const near = terrain.beachAt(190, 0); // 10 inland
  const far = terrain.beachAt(170, 0); // 30 inland
  assert.ok(near > 0 && far > 0 && near > far,
    `expected the beach to fade with distance inland, got ${near} at 10 and ${far} at 30`);
});

test('the wet side and the dry side of a shore meet without a seam', () => {
  const terrain = beachTerrain();
  // Just short of the shore (dry, full sand) against just past it (wet,
  // barely off the bank) -- Terrain#waterTint's own channel*1.6 means the
  // wet side is already most of the way to full water tint one unit in,
  // so the two colours should already read close rather than jumping.
  const dryTint = terrain.groundTintAt(200 - 0.5, 0);
  const wetTint = terrain.groundTintAt(200 + 0.5, 0);
  const jump = Math.max(...dryTint.map((channel, i) => Math.abs(channel - wetTint[i])));
  assert.ok(jump < 40, `expected the shore to blend rather than cut, got a jump of ${jump}`);
});

test('with no beachWidth at all, a sea behaves exactly as it did before', () => {
  const terrain = beachTerrain({ beachWidth: 0 });
  assert.equal(terrain.beachAt(190, 0), 0, 'expected no beach at all without a width for it');
});

test('a beach never reaches the trees, whatever the forest noise says', () => {
  const terrain = new Terrain(1, { forestThreshold: 0, treeSpacing: 4 }, null, {
    shore: 200, coast: 0, coastScale: 1, beachWidth: 40, shelf: 100, depth: 10,
    color: '#2f5f86', bankColor: '#cbb98d',
  });
  const trees = terrain.treesWithin(150, -30, 210, 30);
  for (const tree of trees) {
    assert.equal(terrain.beachAt(tree.x, tree.y), 0, `a tree grew on the beach at (${tree.x}, ${tree.y})`);
  }
});

test('groundTintAt and groundColorAt describe the same colour', () => {
  const terrain = new Terrain(1);
  for (let x = -600; x < 600; x += 37) {
    const y = x * 0.6;
    const tint = terrain.groundTintAt(x, y);
    const hex = terrain.groundColorAt(x, y);
    assert.deepEqual(tint, channels(hex), `mismatch at ${x}, ${y}`);
  }
});

test('groundTintAt fills an array it is handed rather than making one', () => {
  const terrain = new Terrain(1);
  const scratch = [0, 0, 0];
  const returned = terrain.groundTintAt(120, -80, scratch);
  assert.equal(returned, scratch, 'should hand back the very array it was given');
  assert.deepEqual(scratch, terrain.groundTintAt(120, -80));
});

test('the mountain cache answers the same as working it out afresh', () => {
  const cached = new Terrain(1);
  for (let x = -900; x < 900; x += 97) {
    for (let y = -900; y < 900; y += 97) {
      // A terrain with an empty cache has to derive the neighbourhood; one
      // that has been walked over already reads it back. Both must agree.
      const fresh = new Terrain(1);
      assert.equal(cached.heightAt(x, y), fresh.heightAt(x, y), `height at ${x}, ${y}`);
      assert.equal(cached.groundColorAt(x, y), fresh.groundColorAt(x, y), `colour at ${x}, ${y}`);
    }
  }
});
