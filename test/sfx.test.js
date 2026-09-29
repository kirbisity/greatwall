import test from 'node:test';
import assert from 'node:assert/strict';
import { Sfx } from '../src/sfx.js';
import { Game } from '../src/game.js';
import { Castle, Raider, Wall } from '../src/entities.js';
import { buildNavigation } from '../src/navigation.js';

const EFFECT_NAMES = ['build', 'repair', 'fortify', 'raze', 'upgrade', 'attack', 'clash', 'wallDestroyed'];

function fixedRandom() {
  let value = 0.42;
  return () => value;
}

/** A stub AudioContext that records what it was asked to build, but plays nothing. */
function stubAudioContext() {
  const calls = { oscillators: 0, buffers: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createOscillator() {
      calls.oscillators += 1;
      return { type: 'sine', frequency: param(), connect() {}, start() {}, stop() {} };
    },
    createGain() {
      return { gain: param(), connect() {} };
    },
    createBufferSource() {
      calls.buffers += 1;
      return { buffer: null, connect() {}, start() {}, stop() {} };
    },
    createBiquadFilter() {
      return { type: 'lowpass', frequency: param(), connect() {} };
    },
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    },
    calls,
  };
}

// --- the Sfx class itself --------------------------------------------------

test('every known effect plays without throwing', () => {
  const context = stubAudioContext();
  const sfx = new Sfx({ contextFactory: () => context, now: () => 0 });
  for (const name of EFFECT_NAMES) {
    sfx.lastClashAt = -Infinity;
    assert.doesNotThrow(() => sfx.play(name));
  }
  assert.ok(context.calls.oscillators > 0, 'at least one oscillator was used');
});

test('an unknown effect name is a silent no-op', () => {
  const context = stubAudioContext();
  const sfx = new Sfx({ contextFactory: () => context });
  sfx.play('nonsense');
  assert.equal(context.calls.oscillators, 0);
  assert.equal(context.calls.buffers, 0);
});

test('a muted sound level silences every effect without touching the audio context', () => {
  const context = stubAudioContext();
  const sfx = new Sfx({ contextFactory: () => context });
  sfx.setVolume(0);
  sfx.play('build');
  assert.equal(context.calls.oscillators, 0);
});

test('two clashes in quick succession only sound once', () => {
  let now = 0;
  const context = stubAudioContext();
  const sfx = new Sfx({ contextFactory: () => context, now: () => now });

  sfx.play('clash');
  const afterFirst = context.calls.oscillators;
  assert.ok(afterFirst > 0);

  now += 10; // well inside the throttle window
  sfx.play('clash');
  assert.equal(context.calls.oscillators, afterFirst, 'the second clash is dropped');

  now += 500; // past the throttle window
  sfx.play('clash');
  assert.ok(context.calls.oscillators > afterFirst, 'a clash after the window plays again');
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
  game.onEffect = (name) => effects.push(name);
  return effects;
}

test('building a section plays the build effect', () => {
  const game = gameWith();
  const effects = trackEffects(game);
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  assert.deepEqual(effects, ['build']);
});

test('repairing a damaged section plays the repair effect', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  wall.health -= 10;
  const effects = trackEffects(game);
  game.repairWall(wall);
  assert.deepEqual(effects, ['repair']);
});

test('fortifying a standing section plays the fortify effect', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  const effects = trackEffects(game);
  game.upgradeWall(wall);
  assert.deepEqual(effects, ['fortify']);
});

test('razing a section plays the raze effect', () => {
  const game = gameWith();
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  const effects = trackEffects(game);
  assert.equal(game.removeWallAt({ x: 200, y: 0 }), true);
  assert.deepEqual(effects, ['raze']);
});

test('upgrading the castle plays the upgrade effect', () => {
  const game = gameWith();
  const effects = trackEffects(game);
  assert.equal(game.upgradeCastleAt({ x: 0, y: 0 }), true);
  assert.deepEqual(effects, ['upgrade']);
});

test('sending a company out plays the attack effect', () => {
  const game = gameWith();
  const [option] = game.dispatchOptions();
  const effects = trackEffects(game);
  const result = game.sendGuard(option.id, { x: 300, y: 0 });
  assert.equal(result.sent, true);
  assert.deepEqual(effects, ['attack']);
});

test('a raider battering a wall plays the clash effect', () => {
  const game = gameWith();
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  wall.finish();
  game.walls = [wall];
  const navigation = buildNavigation(game.walls, { x: 0, y: 0 }, 'v1');
  const raider = new Raider('CR0', { x: 50, y: 0 });

  const effects = trackEffects(game);
  game.resolveWallContact(navigation, raider);
  assert.deepEqual(effects, ['clash']);
});

test('a raider reaching the castle plays the clash effect', () => {
  const game = gameWith();
  const castle = game.castles[0];
  const raider = new Raider('CR0', { ...castle.position });

  const effects = trackEffects(game);
  game.resolveCastleContact(raider, castle);
  assert.deepEqual(effects, ['clash']);
});

test('a wall falling in battle plays the wallDestroyed effect once', () => {
  const game = gameWith();
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  wall.health = -1;

  const effects = trackEffects(game);
  game.step();
  assert.deepEqual(effects, ['wallDestroyed']);
  assert.equal(game.walls.length, 0, 'the fallen wall is gone from the field');
});
