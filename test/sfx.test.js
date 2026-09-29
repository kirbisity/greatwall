import test from 'node:test';
import assert from 'node:assert/strict';
import { Sfx } from '../src/sfx.js';
import { Game } from '../src/game.js';
import { Castle, Raider, Wall } from '../src/entities.js';
import { buildNavigation } from '../src/navigation.js';

function fixedRandom() {
  let value = 0.42;
  return () => value;
}

/** A stub AudioContext that records what it was asked to play, but plays nothing for real. */
function stubContext() {
  const started = [];
  return {
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createBufferSource() {
      const node = { buffer: null, connect() {}, start: () => started.push(node) };
      return node;
    },
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    },
    started,
  };
}

/** Records which URLs were fetched instead of actually loading anything. */
function stubLoadAudio(urlsLoaded) {
  return async (url) => {
    urlsLoaded.push(url);
    return { url };
  };
}

// --- the Sfx class itself --------------------------------------------------

test('each mapped effect fetches its own clip and plays it', async () => {
  const context = stubContext();
  const urls = [];
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio(urls), now: () => 0 });

  await sfx.play('build');
  await sfx.play('fortify');
  await sfx.play('raze');
  await sfx.play('upgrade');
  await sfx.play('destroyed');

  assert.deepEqual(urls, ['sounds/fx/building.mp3', 'sounds/fx/destroyed.mp3'], 'the shared building clip is fetched once');
  assert.equal(context.started.length, 5, 'but still played once per action');
});

test('the building clip is fetched once and reused for every building action', async () => {
  const context = stubContext();
  const urls = [];
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio(urls) });

  await sfx.play('build');
  await sfx.play('fortify');

  assert.deepEqual(urls, ['sounds/fx/building.mp3'], 'fetched only on the first play');
  assert.equal(context.started.length, 2, 'but still played both times');
});

test('repair and the muster/attack action carry no clip and stay silent', async () => {
  const context = stubContext();
  const urls = [];
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio(urls) });

  await sfx.play('repair');
  await sfx.play('attack');
  await sfx.play('nonsense');

  assert.equal(urls.length, 0);
  assert.equal(context.started.length, 0);
});

test('a muted sound level silences every effect without touching the audio context', async () => {
  const context = stubContext();
  const urls = [];
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio(urls) });
  sfx.setVolume(0);

  await sfx.play('build');

  assert.equal(urls.length, 0);
  assert.equal(context.started.length, 0);
});

test('an event at zero proximity -- too far from the camera to hear -- stays silent', async () => {
  const context = stubContext();
  const urls = [];
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio(urls) });

  await sfx.play('build', 0);

  assert.equal(urls.length, 0);
  assert.equal(context.started.length, 0);
});

test('proximity scales the gain applied to the clip', async () => {
  const context = stubContext();
  let lastGain = null;
  context.createGain = () => {
    const node = { connect() {} };
    node.gain = new Proxy({ value: 0 }, {
      set(target, key, value) {
        if (key === 'value') {
          lastGain = value;
        }
        target[key] = value;
        return true;
      },
    });
    return node;
  };
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio([]) });

  await sfx.play('build', 0.4);

  assert.equal(lastGain, 0.4);
});

test('engaging and fighting are throttled, but a discrete action like build is not', async () => {
  let now = 0;
  const context = stubContext();
  const sfx = new Sfx({ contextFactory: () => context, loadAudio: stubLoadAudio([]), now: () => now });

  await sfx.play('engaging');
  await sfx.play('engaging'); // same instant: dropped
  assert.equal(context.started.length, 1);

  now += 500; // past the throttle window
  await sfx.play('engaging');
  assert.equal(context.started.length, 2);

  await sfx.play('build');
  await sfx.play('build'); // discrete actions are never throttled
  assert.equal(context.started.length, 4);
});

test('a missing Web Audio API is a silent no-op rather than a crash', () => {
  const sfx = new Sfx({ contextFactory: () => { throw new TypeError('no AudioContext'); } });
  assert.doesNotThrow(() => sfx.play('build'));
});

// --- wired into Game --------------------------------------------------------

function gameWith(tokens = 100000) {
  const game = new Game({ random: fixedRandom() });
  game.castles = [new Castle('CC0')];
  game.tokens = tokens;
  return game;
}

function trackEffects(game) {
  const effects = [];
  game.onEffect = (name, position) => effects.push({ name, position });
  return effects;
}

test('building a section plays the build effect at the wall', () => {
  const game = gameWith();
  const effects = trackEffects(game);
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  assert.equal(effects.length, 1);
  assert.equal(effects[0].name, 'build');
  assert.deepEqual(effects[0].position, { x: 200, y: 0 });
});

test('repairing a damaged section plays the repair effect', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  wall.health -= 10;
  const effects = trackEffects(game);
  game.repairWall(wall);
  assert.equal(effects.at(-1).name, 'repair');
});

test('fortifying a standing section plays the fortify effect', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  const effects = trackEffects(game);
  game.upgradeWall(wall);
  assert.equal(effects.at(-1).name, 'fortify');
});

test('razing a section plays the raze effect', () => {
  const game = gameWith();
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  const effects = trackEffects(game);
  assert.equal(game.removeWallAt({ x: 200, y: 0 }), true);
  assert.equal(effects.at(-1).name, 'raze');
});

test('upgrading the castle plays the upgrade effect', () => {
  const game = gameWith();
  const effects = trackEffects(game);
  assert.equal(game.upgradeCastleAt({ x: 0, y: 0 }), true);
  assert.equal(effects.at(-1).name, 'upgrade');
});

test('sending a company out plays the attack effect', () => {
  const game = gameWith();
  const [option] = game.dispatchOptions();
  const effects = trackEffects(game);
  const result = game.sendGuard(option.id);
  assert.equal(result.sent, true);
  assert.equal(effects.at(-1).name, 'attack');
});

test('a raider battering a wall plays the engaging effect', () => {
  const game = gameWith();
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  wall.finish();
  game.walls = [wall];
  const navigation = buildNavigation(game.walls, { x: 0, y: 0 }, 'v1');
  const raider = new Raider('CR0', { x: 50, y: 0 });

  const effects = trackEffects(game);
  game.resolveWallContact(navigation, raider);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].name, 'engaging');
  assert.deepEqual(effects[0].position, { x: 50, y: 0 });
});

test('a raider battering the same wall on and on only sounds engaging once', () => {
  const game = gameWith();
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  wall.finish();
  wall.health = 100000; // never dies mid-test
  game.walls = [wall];
  const navigation = buildNavigation(game.walls, { x: 0, y: 0 }, 'v1');
  const raider = new Raider('CR0', { x: 50, y: 0 });

  const effects = trackEffects(game);
  game.resolveWallContact(navigation, raider);
  game.resolveWallContact(navigation, raider);
  game.resolveWallContact(navigation, raider);
  assert.equal(effects.length, 1, 'still battering the same section -- no repeat');

  // A frame with no contact at all (see Game#moveRaiders) ends the engagement.
  raider.soundedEngage = false;
  game.resolveWallContact(navigation, raider);
  assert.equal(effects.length, 2, 'contact broke and resumed -- a fresh engagement sounds again');
});

test('a raider reaching the castle plays the engaging effect', () => {
  const game = gameWith();
  const castle = game.castles[0];
  const raider = new Raider('CR0', { ...castle.position });

  const effects = trackEffects(game);
  game.resolveCastleContact(raider, castle);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].name, 'engaging');
});

test('a wall falling in battle plays the destroyed effect once', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  wall.health = -1;

  const effects = trackEffects(game);
  game.step();
  assert.equal(effects.at(-1).name, 'destroyed');
  assert.equal(game.walls.length, 0, 'the fallen wall is gone from the field');
});

test('our guards trading blows with a raider plays the fighting effect', () => {
  const game = gameWith();
  const guard = game.sendGuard(game.dispatchOptions()[0].id).guard;
  const raider = new Raider('CR0', { ...guard.position });
  game.raiders = [raider];

  const effects = trackEffects(game);
  game.step();
  assert.ok(effects.some((effect) => effect.name === 'fighting'), 'a locked guard plays the fighting effect');
});

test('a guard staying locked in the same melee only sounds fighting once', () => {
  const game = gameWith();
  const guard = game.sendGuard(game.dispatchOptions()[0].id).guard;
  const raider = new Raider('CR0', { ...guard.position });
  raider.health = 100000; // outlasts a handful of frames so the bout stays locked
  game.raiders = [raider];

  const effects = trackEffects(game);
  for (let frame = 0; frame < 10; frame += 1) {
    game.step();
  }
  const fighting = effects.filter((effect) => effect.name === 'fighting');
  assert.equal(fighting.length, 1, 'still the same bout -- no repeat across frames');
});

test('the city falling plays the destroyed effect once, at the castle', () => {
  const game = gameWith();
  const castle = game.castles[0];

  const effects = trackEffects(game);
  castle.health = -1;
  game.step();
  game.step();

  const destroyed = effects.filter((effect) => effect.name === 'destroyed');
  assert.equal(destroyed.length, 1, 'fires once, not every frame the city stays fallen');
  assert.deepEqual(destroyed[0].position, castle.position);
});
