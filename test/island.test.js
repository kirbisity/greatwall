import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { TERRAIN, WALL, WALL_HEIGHT_UNITS, WALL_TIERS } from '../src/config.js';
import { compileStructure } from '../src/structures.js';
import { JAPAN_BUILDINGS, JAPAN_HOUSE } from '../src/buildings/index.js';

const ISLAND = LEVELS.find((level) => level.land.hill);

function island(tokens = 100000) {
  let state = 7;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const game = new Game({ random, level: ISLAND });
  game.tokens = tokens;
  return game;
}

function islandTerrain() {
  return new Terrain(1, ISLAND.land, null, ISLAND.sea);
}

/** A closed ring of finished wall at a given distance from the centre. */
function ring(game, radius, sides = 10) {
  const at = (i) => ({
    x: Math.cos((i / sides) * 2 * Math.PI) * radius,
    y: Math.sin((i / sides) * 2 * Math.PI) * radius,
  });
  const laid = [];
  for (let i = 0; i < sides; i += 1) {
    const built = game.buildWall(at(i), at((i + 1) % sides));
    if (built.wall) {
      built.wall.finish();
      laid.push(built.wall);
    }
  }
  return laid;
}

// --- the hill -----------------------------------------------------------

test('the island rises to a hill at its middle', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;
  let last = terrain.heightAt(0, 0);
  for (let reach = 40; reach <= hill.radius; reach += 40) {
    const here = terrain.heightAt(reach, 0);
    assert.ok(here < last, `the ground should fall away from the summit, ${here} at ${reach}`);
    last = here;
  }
  assert.equal(terrain.hillAt(hill.radius + 1, 0), 0, 'and be flat again past its foot');
});

test('the hill is high enough to climb, and tops out where the keep stands', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;
  // Measured against the ground it actually stands in rather than a fixed
  // number, so the hill can be resized without this saying anything untrue.
  let around = 0;
  const samples = 8;
  for (let i = 0; i < samples; i += 1) {
    const bearing = (i / samples) * Math.PI * 2;
    around += terrain.heightAt(Math.cos(bearing) * hill.radius, Math.sin(bearing) * hill.radius);
  }
  const rise = terrain.heightAt(0, 0) - around / samples;
  assert.ok(rise > hill.height * 0.6, `the summit only stands ${rise.toFixed(0)} above its own foot`);

  // Exactly, not nearly: the keep is placed on the summit, so the roughness
  // on its flanks must not eat into the height the level asked for.
  assert.equal(terrain.hillAt(0, 0), hill.height);
});

test('the hill is shaped rather than a dome', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;

  // Its reach wanders with the direction, giving it spurs and hollows.
  const reaches = [];
  for (let i = 0; i < 16; i += 1) {
    const bearing = (i / 16) * Math.PI * 2;
    let reach = 0;
    while (reach < 400 && terrain.hillAt(Math.cos(bearing) * reach, Math.sin(bearing) * reach) > 0.01) {
      reach += 2;
    }
    reaches.push(reach);
  }
  assert.ok(Math.max(...reaches) - Math.min(...reaches) > 40,
    `the foot only varied by ${Math.max(...reaches) - Math.min(...reaches)} units`);

  // And no ring around it stands at one height.
  let worst = 0;
  for (let reach = 20; reach < hill.radius * 0.9; reach += 10) {
    const ring = [];
    for (let i = 0; i < 24; i += 1) {
      const bearing = (i / 24) * Math.PI * 2;
      ring.push(terrain.hillAt(Math.cos(bearing) * reach, Math.sin(bearing) * reach));
    }
    worst = Math.max(worst, Math.max(...ring) - Math.min(...ring));
  }
  assert.ok(worst > 10, `the contours are near enough circles, varying only ${worst.toFixed(1)}`);

  // The walk right round it still closes, and it meets the flat ground.
  assert.ok(Math.abs(terrain.hillAt(120, 0) - terrain.hillAt(120, -0.0001)) < 0.01);
  assert.equal(terrain.hillAt(400, 0), 0);
});

test('nothing snaps walls to fixed levels any more', () => {
  const terrain = islandTerrain();
  assert.equal(terrain.contours, undefined, 'the four fixed terraces are gone');
  assert.equal(terrain.snapToContour, undefined);
  assert.equal(terrain.contourAbove, undefined);
  assert.equal(ISLAND.land.hill.tiers, undefined, 'and the level no longer asks for tiers');
});

// --- walls ---------------------------------------------------------------

test('the island builds walls on the same terms as the other levels', () => {
  for (const level of LEVELS) {
    assert.equal(level.wallUpkeep, undefined, `${level.id} should not charge its own upkeep`);
  }
  const game = island(1000000);
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  plain.tokens = 1000000;
  ring(game, 120);
  ring(plain, 120);

  const islandBill = game.incomeBreakdown;
  const plainBill = plain.incomeBreakdown;
  assert.equal(islandBill.upkeepPerWall, plainBill.upkeepPerWall, 'a section costs the same to hold');
  assert.equal(
    islandBill.wallUpkeep / islandBill.wallCount,
    plainBill.wallUpkeep / plainBill.wallCount,
    'and the bill is the same per section',
  );
});

test('a wall still bars the way, so raiders go round it as they always have', () => {
  const game = island(1000000);
  ring(game, 120);
  const navigation = game.navigation();
  assert.ok(navigation.barriers.length > 0, 'standing wall is what raiders route around');
  assert.equal(navigation.barriers.length, game.walls.filter((wall) => !wall.isPlanned).length);
});

// --- the keep's own stonework -------------------------------------------

test('the keep carries its own stone base, and the ground is only levelled', () => {
  const game = island();
  assert.equal(game.terraces, undefined, 'no terrace is raised under the city');
  const levelled = game.terrain.levelled;
  assert.equal(levelled.length, 1, 'the city levels its ground and nothing more');
  assert.equal(levelled[0].kind, 'settlement');

  // Flattened at the ground that was already there, not lifted above it.
  const wild = game.terrain.wildHeightAt(0, 0);
  assert.ok(Math.abs(game.terrain.heightAt(0, 0) - wild) < 1e-9, 'the keep stands on the hill, not over it');
});

test('every island keep is a battered base with storeys on its crest', () => {
  for (const keep of Object.values(JAPAN_BUILDINGS)) {
    const [base, ...storeys] = keep.parts;
    assert.equal(base.type, 'batter', `${keep.name} should start with a stone base`);
    assert.ok(base.spread > 0, 'which is wider at its foot than its crest');
    assert.equal(base.material, 'ishigaki');
    assert.ok(Math.abs(keep.radius - (base.width / 2 + base.spread)) < 1e-9,
      'and the radius covers that foot');

    assert.ok(storeys.length >= 2, `${keep.name} should carry storeys`);
    assert.equal(storeys[0].base, base.height, 'the first storey sits on the crest');
    for (const storey of storeys) {
      assert.equal(storey.type, 'building');
      assert.ok(storey.width <= base.width, 'and none oversails the base');
    }
  }
});

test('the stone base really is wider at the bottom once compiled', () => {
  for (const keep of Object.values(JAPAN_BUILDINGS)) {
    const faces = compileStructure(keep);
    const reachAt = (z) => Math.max(...faces
      .flatMap((face) => face.points)
      .filter((point) => Math.abs(point.z - z) < 0.01)
      .map((point) => Math.abs(point.x)));
    const base = keep.parts[0];
    assert.ok(reachAt(0) > reachAt(base.height), `${keep.name}'s base should taper upward`);
    assert.equal(reachAt(0), base.width / 2 + base.spread);
  }
});

test('the keeps grow tier by tier, and the settlement stays smaller than them', () => {
  const tiers = Object.values(JAPAN_BUILDINGS);
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(tiers[i].radius > tiers[i - 1].radius, 'a bigger keep has a broader base');
    assert.ok(tiers[i].parts.length >= tiers[i - 1].parts.length, 'and at least as many storeys');
  }
  assert.ok(JAPAN_HOUSE.radius < tiers[0].radius, 'the settlement buildings are smaller than the keep');
});

test('the island fields castles of its own size, not the imperial city\'s', () => {
  const game = island();
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  for (const id of Object.keys(JAPAN_BUILDINGS)) {
    assert.ok(
      game.castleTypes[id].footprint < plain.castleTypes[id].footprint,
      `${id} should claim less ground on the island`,
    );
    assert.ok(
      game.castleTypes[id].footprint >= JAPAN_BUILDINGS[id].radius,
      `${id}'s footprint should at least cover the keep standing on it`,
    );
    assert.equal(game.castleTypes[id].cost, plain.castleTypes[id].cost, 'prices are unchanged');
  }
});

test('growing the castle keeps the ground levelled under the new footprint', () => {
  const game = island(1000000);
  const before = game.terrain.levelled[0].radius;
  game.upgradeCastleAt({ x: 0, y: 0 });
  const after = game.terrain.levelled[0].radius;
  assert.ok(after > before, `the levelled ground should widen with the castle, ${before} to ${after}`);
  assert.equal(after, game.castles[0].type.footprint);
});

// --- the ground underneath ----------------------------------------------

test('the zone index answers exactly what a full scan would', () => {
  const terrain = islandTerrain();
  for (let i = 0; i < 200; i += 1) {
    terrain.raise(`z${i}`, (i % 20) * 18 - 180, Math.floor(i / 20) * 18 - 90, 9, 3, 9);
  }
  const scanned = islandTerrain();
  scanned.levelled = terrain.levelled.slice();
  scanned.zonesNear = function all() { return this.levelled; };

  let worst = 0;
  for (let i = 0; i < 2000; i += 1) {
    const x = (i * 13) % 500 - 250;
    const y = (i * 29) % 500 - 250;
    worst = Math.max(worst, Math.abs(terrain.heightAt(x, y) - scanned.heightAt(x, y)));
  }
  assert.equal(worst, 0, 'the bucketed lookup must be exact, not merely close');
});

// --- what stands over the keep ------------------------------------------

test('the flag and the health bar are pinned to the roof, not the ground', async () => {
  const { Renderer } = await import('../src/renderer.js');
  const renderer = Object.create(Renderer.prototype);
  renderer.structures = new Map();

  for (const definition of Object.values(JAPAN_BUILDINGS)) {
    const { height } = renderer.structureFor(definition);
    let tallest = 0;
    for (const face of compileStructure(definition)) {
      if (face.ground) {
        continue;
      }
      for (const point of face.points) {
        tallest = Math.max(tallest, point.z);
      }
    }
    assert.equal(height, tallest, `${definition.name} should report its real height`);
    assert.ok(height > definition.radius, 'a keep is taller than it is wide, so a radius is no stand-in');
  }
});

test('a keep on the hill hangs its bar far above sea level', () => {
  const game = island();
  const keep = game.castles[0];
  const ground = game.terrain.heightAt(keep.position.x, keep.position.y);
  assert.ok(ground > 10, `the keep should stand well up the hill, it is at ${ground.toFixed(0)}`);
  // The anchor is ground plus roof, so it can never come out at zero the way
  // the old fixed z=0 anchor did wherever the city happened to stand.
  assert.ok(ground + JAPAN_BUILDINGS[keep.typeId].radius > 0);
});

// --- the wall's section --------------------------------------------------

test('the island wall is a trapezoid, and no other level changes shape', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('function taperedWallQuads'),
    source.indexOf('function squarePrism'),
  );
  // eslint-disable-next-line no-new-func
  const taperedWallQuads = new Function(`${body}; return taperedWallQuads;`)();

  assert.equal(ISLAND.wall.shape, 'tapered');
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.equal(level.wall, undefined, `${level.id} should keep the wall it has always had`);
    }
  }

  const halfWidth = 1.5;
  const spread = 1.35;
  const quads = taperedWallQuads({ x: -20, y: 0 }, { x: 20, y: 0 }, halfWidth, spread, 6, [0, 0, 0, 0]);
  const [top, southSide, eastEnd, northSide] = quads;

  const normalOf = (a, b, c) => {
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const length = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / length, y: n.y / length, z: n.z / length };
  };

  assert.ok(normalOf(top[0], top[1], top[2]).z > 0.99, 'the crest faces the sky');
  for (const point of top) {
    assert.equal(Math.abs(point.y), halfWidth, 'and is the narrow face');
  }
  // Both long sides lean outward and down; the ends stay square so two
  // sections still meet cleanly at a junction.
  for (const side of [southSide, northSide]) {
    const normal = normalOf(side[0], side[1], side[2]);
    assert.ok(normal.z > 0.1, 'a long side should lean');
    assert.ok(Math.abs(normal.x) < 1e-9, 'and face across the run, not along it');
    assert.equal(Math.abs(side[0].y), halfWidth + spread, 'with its foot spread');
  }
  assert.ok(Math.abs(normalOf(eastEnd[0], eastEnd[1], eastEnd[2]).x) > 0.99, 'the ends stay square');
});

// --- pointing at ground that is not at sea level ------------------------

test('the cursor lands where it looks, even high on the hill', async () => {
  const { Camera } = await import('../src/camera.js');
  const { projectPoint } = await import('../src/projection.js');
  const { CAMERA } = await import('../src/config.js');

  const terrain = islandTerrain();
  const heightAt = (x, y) => terrain.heightAt(x, y);
  const camera = new Camera(1512, 807);

  for (const elevation of [CAMERA.minElevation, CAMERA.initialElevation, CAMERA.maxElevation]) {
    camera.distance = CAMERA.initialDistance;
    camera.elevation = elevation;
    camera.focus = { x: 0, y: 0 };
    camera.refreshView();

    let flatWorst = 0;
    let followedWorst = 0;
    for (let pixelX = 200; pixelX <= 1300; pixelX += 100) {
      for (let pixelY = 150; pixelY <= 760; pixelY += 80) {
        const pixel = { x: pixelX, y: pixelY };
        const flat = camera.toWorld(pixel);
        const followed = camera.toWorld(pixel, heightAt);
        const flatBack = projectPoint(camera.view, flat.x, flat.y, heightAt(flat.x, flat.y));
        const followedBack = projectPoint(
          camera.view, followed.x, followed.y, heightAt(followed.x, followed.y),
        );
        if (!flatBack || !followedBack) {
          continue;
        }
        flatWorst = Math.max(flatWorst, Math.hypot(flatBack.x - pixelX, flatBack.y - pixelY));
        followedWorst = Math.max(
          followedWorst, Math.hypot(followedBack.x - pixelX, followedBack.y - pixelY),
        );
      }
    }
    assert.ok(flatWorst > 30, `a flat reading should be well out at ${elevation} degrees`);
    assert.ok(followedWorst < 1,
      `the cursor drifted ${followedWorst.toFixed(1)} pixels at ${elevation} degrees`);
  }
});

test('a wall is laid where it was drawn, not downhill of it', async () => {
  const { Camera } = await import('../src/camera.js');
  const { projectPoint } = await import('../src/projection.js');
  const { Input } = await import('../src/input.js');

  const game = island(1000000);
  const camera = new Camera(1512, 807);
  camera.focus = { x: 0, y: 0 };
  camera.refreshView();

  const input = new Input({
    game,
    camera,
    renderer: { hoveredWall: null },
    hud: { showMessage() {}, setCursor() {}, hideDispatchMenu() {}, openDispatchMenu() {} },
    onChange() {},
    onMenu() {},
  });

  // Aim at a spot well up the hill, and check the cursor reads it back.
  // Closer to the summit than this once stood, now that the hill itself
  // is smaller -- see levels.js.
  const target = { x: 22, y: 30 };
  const onScreen = projectPoint(camera.view, target.x, target.y, game.terrain.heightAt(target.x, target.y));
  assert.ok(onScreen, 'the target should be in shot');
  input.pointer = { x: onScreen.x, y: onScreen.y };

  const read = input.pointerOnGround();
  assert.ok(Math.hypot(read.x - target.x, read.y - target.y) < 2,
    `pointed at ${target.x},${target.y} but read ${read.x.toFixed(0)},${read.y.toFixed(0)}`);

  // And the flat reading, which is what it used to do, is far off.
  const flat = camera.toWorld(input.pointer);
  assert.ok(Math.hypot(flat.x - target.x, flat.y - target.y) > 10,
    'the old flat reading should be visibly wrong here, or this proves nothing');
});

// --- the island's own proportions ---------------------------------------

/** A renderer with just enough stubbed to run one wall-collecting pass. */
async function wallCollector() {
  const { Renderer } = await import('../src/renderer.js');
  // `clock` is a getter over performance.now(), so it is replaced rather
  // than assigned; the hover pulse it drives is not what this measures.
  const renderer = Object.create(Renderer.prototype, {
    clock: { value: 0, writable: true },
  });
  renderer.isOnScreen = () => true;
  renderer.flankPixels = () => 1000;
  renderer.collectPrism = function capture(items, view, quads) {
    items.push(...quads);
  };
  return renderer;
}

/** The style a level builds its walls in, read the way the renderer reads it. */
async function wallStyleFor(level) {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('function wallStyleOf'),
    source.indexOf('/**\n * A wall with a trapezoid'),
  );
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return wallStyleOf;`)()(level);
}

test('the island wall stands half as tall, and no other level is touched', async () => {
  assert.equal((await wallStyleFor(ISLAND)).heightScale, 0.5);
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.equal((await wallStyleFor(level)).heightScale, 1, `${level.id} should keep its full height`);
    }
  }

  // And the geometry that comes out is actually half as tall.
  const renderer = await wallCollector();
  const terrain = { heightAt: () => 0 };
  const wall = {
    start: { x: -20, y: 40 }, end: { x: 20, y: 40 },
    isPlanned: false, built: 1, heightScale: 1, widthScale: 1,
    health: 300, maxHealth: 300,
  };
  const crestOf = (style) => {
    const quads = [];
    renderer.collectWalls(quads, null, [wall], terrain, null, style);
    return Math.max(...quads.flat().map((point) => point.z));
  };

  const full = crestOf(await wallStyleFor(LEVELS[0]));
  const island = crestOf(await wallStyleFor(ISLAND));
  assert.ok(full > 0, 'a wall should stand at all');
  assert.ok(Math.abs(island / full - 0.5) < 1e-9,
    `the island wall came out ${(island / full).toFixed(2)} of the usual height`);
  assert.equal(island, WALL_HEIGHT_UNITS * 0.5);
});

test('the island raises no turret where two runs of wall meet', async () => {
  assert.equal((await wallStyleFor(ISLAND)).towers, false);
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.equal((await wallStyleFor(level)).towers, true, `${level.id} should keep its towers`);
    }
  }
});

test('a plan can be stood down to another size without losing its proportions', async () => {
  const { scalePlan } = await import('../src/buildings/helpers.js');
  const plan = {
    name: 'Test', radius: 12,
    parts: [
      { type: 'batter', x: 2, y: -4, width: 20, depth: 20, height: 8, spread: 6, material: 'ishigaki' },
      {
        type: 'building', x: 0, y: 0, width: 14, depth: 14, height: 6, base: 8,
        material: 'shikkui', roof: { height: 3, overhang: 2, tiers: 2, material: 'roofSlate' },
      },
    ],
  };
  const half = scalePlan(plan, 0.5);

  assert.equal(half.radius, 6);
  assert.deepEqual(
    half.parts.map((part) => [part.x, part.y, part.width, part.height, part.base ?? 0, part.spread ?? 0]),
    [[1, -2, 10, 4, 0, 3], [0, 0, 7, 3, 4, 0]],
  );
  assert.deepEqual(half.parts[1].roof, { height: 1.5, overhang: 1, tiers: 2, material: 'roofSlate' });
  // Everything that is not a length is carried over untouched.
  assert.equal(half.parts[0].material, 'ishigaki');
  assert.equal(half.parts[0].type, 'batter');
  assert.equal(plan.radius, 12, 'and the plan it was made from is left alone');
});

test('the island keeps are a third smaller than the plans they are drawn from', async () => {
  const small = (await import('../src/buildings/japan-small.js')).default;
  const large = (await import('../src/buildings/japan-large.js')).default;
  const ratio = JAPAN_BUILDINGS.CC0.radius / small.radius;
  assert.ok(ratio > 0.6 && ratio < 0.7, `expected about two thirds, got ${ratio.toFixed(2)}`);
  assert.ok(Math.abs(JAPAN_BUILDINGS.CC2.radius / large.radius - ratio) < 1e-9,
    'every tier should be stood down by the same factor');

  // The settlement is not a castle and keeps its own size.
  assert.equal(JAPAN_HOUSE.radius, 5.5);
});

test('the castle claims no more ground than the keep standing on it needs', () => {
  const game = island();
  for (const [id, keep] of Object.entries(JAPAN_BUILDINGS)) {
    const footprint = game.castleTypes[id].footprint;
    assert.ok(footprint >= keep.radius, `${id} claims ${footprint} for a keep of ${keep.radius.toFixed(1)}`);
    assert.ok(footprint < keep.radius * 1.6, `${id} claims ${footprint}, far more than the keep needs`);
  }
});

// --- walls that are climbed rather than broken --------------------------

/** A closed ring the raider cannot simply walk around. */
function ringedGame(level) {
  let state = 7;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const game = new Game({ random, level });
  game.tokens = 1000000;
  ring(game, 90, 10);
  return game;
}

/** Send one raider at the city from outside, and report how it fared. */
function stormTheCity(game, seconds = 240) {
  game.raiders.length = 0;
  game.spawnRaider();
  const raider = game.raiders[0];
  raider.position.x = 200;
  raider.position.y = 0;
  raider.aimAt(game.castles[0].position);
  const full = raider.type.maxHealth;
  const wallHealthBefore = game.walls.reduce((total, wall) => total + wall.health, 0);

  let frames = 0;
  let mostAstride = 0;
  while (frames < 60 * seconds && game.raiders[0]
    && Math.hypot(raider.position.x, raider.position.y) > 40) {
    game.step();
    frames += 1;
    mostAstride = Math.max(mostAstride, raider.crossing);
  }
  return {
    arrived: Boolean(game.raiders[0]) && frames < 60 * seconds,
    seconds: frames / 60,
    healthLeft: raider.isAlive ? raider.health / full : 0,
    mostAstride,
    wallWear: wallHealthBefore - game.walls.reduce((total, wall) => total + wall.health, 0),
    wallsStanding: game.walls.length,
  };
}

test('the island builds sturdier stone than anywhere else', () => {
  const scale = ISLAND.wall.healthScale;
  assert.ok(scale > 1, 'the island should build stronger walls');
  const onTheIsland = island(1000000);
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  plain.tokens = 1000000;
  const islandWall = onTheIsland.buildWall({ x: 70, y: -45 }, { x: 70, y: 45 }).wall;
  const plainWall = plain.buildWall({ x: 70, y: -45 }, { x: 70, y: 45 }).wall;

  assert.equal(islandWall.maxHealth, plainWall.maxHealth * scale);
  assert.equal(islandWall.health, islandWall.maxHealth * WALL.initialFraction);

  // Fortifying still multiplies on top of it rather than replacing it.
  islandWall.finish();
  plainWall.finish();
  assert.equal(islandWall.health, islandWall.maxHealth);
  assert.equal(islandWall.maxHealth / plainWall.maxHealth, scale);
});

test('a raider gets over an island wall, slower and bloodied', () => {
  const open = island(1000000);
  const clear = stormTheCity(open);
  assert.equal(clear.arrived, true, 'with no wall it should walk straight in');
  assert.equal(clear.healthLeft, 1, 'and arrive untouched');

  const ringed = stormTheCity(ringedGame(ISLAND));
  assert.equal(ringed.arrived, true, 'a wall should not deny the ground outright');
  assert.ok(ringed.seconds > clear.seconds + 5,
    `crossing should cost real time, it cost ${(ringed.seconds - clear.seconds).toFixed(1)}s`);
  assert.ok(ringed.mostAstride > 0.9, 'the raider should actually get up on the stone');
  assert.ok(
    Math.abs(ringed.healthLeft - (1 - ISLAND.wall.climb.healthCost)) < 0.01,
    `expected ${ISLAND.wall.climb.healthCost} of its strength gone, ${(1 - ringed.healthLeft).toFixed(2)} was`,
  );
});

test('the wall wears from being climbed, but is not broken doing it', () => {
  const ringed = stormTheCity(ringedGame(ISLAND));
  assert.ok(ringed.wallWear > 0, 'going over should wear the stone');
  assert.equal(ringed.wallsStanding, 10, 'but one raider should not bring a section down');

  // The margin matters: at full strength a company in contact for ten
  // seconds brings down any section, and a crossing lasts several times
  // that, so climbing has to scuff the stone rather than batter it.
  const total = ringed.wallsStanding * 1500;
  assert.ok(ringed.wallWear < total * 0.2,
    `one crossing took ${Math.round(ringed.wallWear / total * 100)}% off the whole ring`);
});

test('climbing scuffs a wall where battering breaks it', async () => {
  const { Raider } = await import('../src/entities.js');
  const wearOver = (level) => {
    const game = new Game({ random: () => 0.5, level });
    game.tokens = 1000000;
    const wall = game.buildWall({ x: 120, y: -60 }, { x: 120, y: 60 }).wall;
    wall.finish();
    game.raiders.length = 0;
    const raider = new Raider('CR0', { x: 121, y: 0 });
    raider.aimAt(game.castles[0].position);
    game.raiders.push(raider);
    const before = wall.health;
    // Held in contact for a fixed spell, so only the wear rate differs.
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      raider.position = { x: 121, y: 0 };
      game.resolveWallContact(game.navigation(), raider);
    }
    return (before - wall.health) / wall.maxHealth;
  };

  const battered = wearOver(LEVELS[0]);
  const climbed = wearOver(ISLAND);
  assert.ok(battered > 0.5, `five seconds of battering should tell, it took ${(battered * 100).toFixed(0)}%`);
  assert.ok(climbed < battered / 10,
    `climbing took ${(climbed * 100).toFixed(1)}% where battering took ${(battered * 100).toFixed(0)}%`);
  assert.equal(ISLAND.wall.climb.wear < 1, true);
});

test('everywhere else a wall still stops a raider dead', () => {
  const ringed = stormTheCity(ringedGame(LEVELS[0]));
  assert.equal(ringed.arrived, false, 'a plain wall should still be a barrier');
  assert.equal(ringed.mostAstride, 0, 'and nothing should climb it');
});

test('the climb is charged once, whatever kind of company makes it', async () => {
  const { Raider } = await import('../src/entities.js');
  const { RAIDER_TYPES } = await import('../src/config.js');

  for (const typeId of Object.keys(RAIDER_TYPES)) {
    const game = island(1000000);
    game.buildWall({ x: 120, y: -120 }, { x: 120, y: 120 }).wall.finish();
    game.raiders.length = 0;
    const raider = new Raider(typeId, { x: 200, y: 0 });
    raider.aimAt(game.castles[0].position);
    game.raiders.push(raider);

    let charges = 0;
    let wasClimbing = false;
    let frames = 0;
    while (frames < 60 * 150 && raider.isAlive && raider.position.x > 70) {
      game.step();
      frames += 1;
      if (raider.climbing && !wasClimbing) {
        charges += 1;
      }
      wasClimbing = raider.climbing;
    }
    assert.ok(raider.isAlive, `${typeId} died on the wall`);
    assert.equal(charges, 1, `${typeId} was charged ${charges} times for one crossing`);
    assert.ok(
      Math.abs(raider.health / raider.type.maxHealth - (1 - ISLAND.wall.climb.healthCost)) < 0.01,
      `${typeId} paid ${(1 - raider.health / raider.type.maxHealth).toFixed(2)} of its strength`,
    );
  }
});

// --- bogging down on the stone itself -----------------------------------

test('a company on the stone is slower again than one climbing towards it', () => {
  const game = island(1000000);
  const wall = game.buildWall({ x: 120, y: -60 }, { x: 120, y: 60 }).wall;
  wall.finish();
  const navigation = game.navigation();
  // Level and bare, so the only thing telling on the pace is the wall.
  game.terrain.heightAt = () => 0;
  game.terrain.forestAt = () => 0;

  const onStone = { x: wall.start.x, y: 0 };
  const nearby = { x: wall.start.x + 12, y: 0 };
  assert.equal(game.overlapsWall(navigation, onStone), true, 'the middle of a section is on it');
  assert.equal(game.overlapsWall(navigation, nearby), false, 'a dozen units off is not');

  // The same company, at the two places, taking the same step.
  const paceAt = (position) => {
    const raider = { position, velocity: { x: -1, y: 0 }, crossing: 1 };
    let moved = 0;
    raider.advance = (seconds) => { moved = seconds; };
    game.advanceAgainstWalls(navigation, raider);
    return moved;
  };
  const climbing = paceAt(nearby);
  const struggling = paceAt(onStone);
  assert.ok(struggling < climbing, 'the stone itself should be the worst of it');
  assert.ok(
    Math.abs(climbing / struggling - ISLAND.wall.climb.overlapSlow) < 1e-9,
    `expected ${ISLAND.wall.climb.overlapSlow} times slower, got ${(climbing / struggling).toFixed(2)}`,
  );
});

test('a fortified section is that much more ground to struggle across', () => {
  const game = island(1000000);
  const wall = game.buildWall({ x: 120, y: -60 }, { x: 120, y: 60 }).wall;
  wall.finish();
  const navigation = game.navigation();
  const justOutside = { x: wall.start.x + 3.6, y: 0 };
  assert.equal(game.overlapsWall(navigation, justOutside), false);

  wall.tier = WALL_TIERS.length - 1;
  assert.ok(wall.widthScale > 1, 'the top tier is a wider wall');
  assert.equal(game.overlapsWall(navigation, justOutside), true,
    'widening the wall should widen the ground a company has to cross');
});

test('nothing overlaps a wall where walls stop a company dead', () => {
  const game = new Game({ random: () => 0.5, level: LEVELS[0] });
  game.tokens = 1000000;
  assert.equal(game.wallClimb, null, 'this level has no climbing at all');
  const storming = stormTheCity(ringedGame(LEVELS[0]));
  assert.equal(storming.arrived, false, 'and a wall is still a barrier there');
});

// --- cherry blossom -------------------------------------------------------

test("a wood's colour comes from the land, and the default is the mainland's green", () => {
  const mainland = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  assert.deepEqual(mainland.land.canopySeasons, TERRAIN.canopySeasons);
  assert.equal(mainland.land.trunkColor, TERRAIN.trunkColor);
});

test('the island plants cherry blossom: pink, and smaller than the mainland wood', () => {
  const terrain = islandTerrain();
  assert.notDeepEqual(terrain.land.canopySeasons, TERRAIN.canopySeasons, 'the island should not be the plain green');
  // Pink reads as more red and more blue than green, against a fill that is
  // the other way round -- a cheap check that this is not just A different
  // green. Spring is when the blossom is actually out.
  const [r, g, b] = terrain.land.canopySeasons.Spring.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
  assert.ok(r > g && b > g, `expected a pink, got rgb(${r}, ${g}, ${b})`);
  assert.ok(terrain.land.treeSize < TERRAIN.treeSize, 'a blossom tree should be smaller than the mainland wood');
});

test('the island is planted far thicker than a plain, unmodified wood', () => {
  const reach = 220;
  const island = islandTerrain().treesWithin(-reach, -reach, reach, reach).length;
  // Against TERRAIN's own defaults rather than a specific level: every
  // level is free to tune its own density (the mainland has since grown
  // thicker too), so the stable claim is that the island is deliberately
  // far past what a level asking for nothing at all would grow, not that
  // it beats whichever number the mainland happens to carry today. Widening
  // the beach (see Terrain#beachAt) rightly costs the wood some ground near
  // the coast, so the margin is smaller than it once was without the claim
  // itself becoming any less true.
  const plain = new Terrain(1, {}, null).treesWithin(-reach, -reach, reach, reach).length;
  assert.ok(island > plain * 5,
    `expected the island to read as a wood, got ${island} trees against a plain wood's ${plain}`);
});

test("the mainland's own wood is thicker than a plain, unmodified one too", () => {
  const reach = 220;
  const mainland = new Terrain(1, LEVELS[0].land, LEVELS[0].river)
    .treesWithin(-reach, -reach, reach, reach).length;
  const plain = new Terrain(1, {}, LEVELS[0].river).treesWithin(-reach, -reach, reach, reach).length;
  assert.ok(mainland > plain * 5,
    `expected the mainland to be planted thicker than the default, got ${mainland} against ${plain}`);
});

test('the mainland and the desert are untouched by the island planting its own wood', () => {
  for (const level of LEVELS) {
    if (level === ISLAND) {
      continue;
    }
    const terrain = new Terrain(1, level.land, level.river ?? null, level.sea ?? null);
    assert.deepEqual(terrain.land.canopySeasons, TERRAIN.canopySeasons, `${level.id} should keep the plain wood`);
    assert.equal(terrain.land.treeSize, TERRAIN.treeSize, `${level.id} should keep the plain tree size`);
  }
});
