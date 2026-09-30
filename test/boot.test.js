import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/levels.js';
import { BATTLE_MAPS } from '../src/config.js';

/**
 * Boots main.js against a stub DOM whose element ids come from the real page,
 * so any id the code reaches for but the markup lacks fails here.
 */
const pageIds = new Set(
  [...readFileSync(new URL('../greatwall.html', import.meta.url), 'utf8')
    .matchAll(/id="([^"]+)"/g)].map((match) => match[1]),
);

const CONTEXT_METHODS = [
  'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath',
  'stroke', 'arc', 'fill', 'drawImage', 'save', 'translate', 'rotate', 'restore',
  'fillText', 'strokeText', 'setTransform', 'setLineDash',
];

function stubContext() {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  for (const name of CONTEXT_METHODS) {
    context[name] = () => {};
  }
  return context;
}

function stubElement(id) {
  const classes = new Set();
  return {
    id,
    style: {},
    dataset: {},
    className: '',
    classList: {
      toggle: (name, on) => { if (on) { classes.add(name); } else { classes.delete(name); } },
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren() { this.children = []; },
    querySelectorAll: () => [],
    innerText: '',
    loop: false,
    volume: 0,
    src: '',
    currentTime: 0,
    paused: true,
    listeners: new Map(),
    getContext: () => stubContext(),
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
  };
}

function installDom() {
  const elements = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const frames = [];

  globalThis.document = {
    body: { style: {} },
    getElementById: (id) => {
      if (!pageIds.has(id)) {
        return null;
      }
      if (!elements.has(id)) {
        elements.set(id, stubElement(id));
      }
      return elements.get(id);
    },
    addEventListener: (type, handler) => documentListeners.set(type, handler),
    createElement: (tag) => stubElement(tag),
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (type, handler) => windowListeners.set(type, handler),
    requestAnimationFrame: (callback) => frames.push(callback),
  };
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.Image = class {
    constructor() {
      this.src = '';
      this.width = 16;
      this.height = 16;
    }
  };
  return { elements, documentListeners, windowListeners, frames };
}

let bootedDom = null;
let clock = 0;

test('the app boots, plays frames and reacts to input without touching a missing element', async () => {
  const dom = installDom();
  bootedDom = dom;
  const { app } = await import('../src/main.js');

  // Pointer events, so a finger reaches the same handlers a mouse does.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.ok(dom.documentListeners.has(type), `input is listening for ${type}`);
  }
  assert.ok(dom.windowListeners.has('load'), 'load handler registered');

  dom.windowListeners.get('load')();
  assert.equal(dom.elements.get('loader').style.display, 'none');

  // Start the game, then run the frames the loop queues up.
  const startButton = dom.elements.get('startBtn2');
  const menu = dom.elements.get('myNav');
  startButton.listeners.get('click')();
  assert.equal(menu.dataset.view, 'levels', 'Start on a fresh menu shows the levels rather than assuming one');
  assert.equal(dom.elements.get('levelsBtn').style.display, 'none', 'nothing to switch away from yet');
  assert.equal(dom.elements.get('restartBtn').style.display, 'none', 'nothing to restart yet');
  dom.elements.get('levelList').children[0].listeners.get('click')();
  assert.equal(startButton.innerText, 'Continue');
  assert.equal(dom.elements.get('levelsBtn').style.display, 'block');
  assert.equal(dom.elements.get('restartBtn').style.display, 'block');
  dom.elements.get('helpClose').listeners.get('click')();
  const music = dom.elements.get('backgroundmusic');
  assert.match(music.src, /sounds\/level_1\.mp3$/, 'starting a level cues that level\'s own track');
  assert.equal(music.paused, false, 'music plays once a level has started');
  // Frames run back to back here, so a clock that ticks one 60Hz frame at a
  // time stands in for real time -- the simulation is paced by elapsed time.
  clock = performance.now();
  mock.method(performance, 'now', () => clock);
  for (let frame = 0; frame < 200 && dom.frames.length > 0; frame += 1) {
    clock += 1000 / 60;
    dom.frames.shift()();
  }
  assert.ok(dom.frames.length > 0, 'the loop keeps requesting frames');
  assert.match(dom.elements.get('token0').innerText, /^\$\d+$/);
  assert.match(dom.elements.get('season0').innerText, /Autumn|Winter|Spring|Summer/);

  // A drag that starts without a prior pointer move must not jump the map.
  const focusBefore = { ...app.camera.focus };
  dom.documentListeners.get('pointerdown')({ pointerId: 1, clientX: 600, clientY: 300 });
  dom.documentListeners.get('pointermove')({ pointerId: 1, clientX: 600, clientY: 300 });
  dom.documentListeners.get('pointerup')({ pointerId: 1, clientX: 600, clientY: 300 });
  app.camera.update(1 / 60);
  assert.equal(app.camera.focus.x, focusBefore.x, 'no pan jump on first drag');
  assert.equal(app.camera.focus.y, focusBefore.y, 'no pan jump on first drag');

  // Every tool button, then a build drag and a wheel zoom.
  for (const id of ['buildTool', 'destroyTool', 'upgradeTool', 'zoom', 'move', 'menuBtn']) {
    dom.elements.get(id).listeners.get('click')();
  }
  assert.equal(music.paused, true, 'leaving to the menu stops the level\'s music');
  dom.elements.get('buildTool').listeners.get('click')();
  // Clear of the city footprint the whole way, so the drag lays a section
  // instead of being rejected as crossing the castle.
  dom.documentListeners.get('pointerdown')({ pointerId: 1, clientX: 850, clientY: 400 });
  for (let x = 850; x < 1250; x += 50) {
    dom.documentListeners.get('pointermove')({ pointerId: 1, clientX: x, clientY: 400 });
  }
  dom.documentListeners.get('pointerup')({ pointerId: 1, clientX: 1250, clientY: 400 });
  assert.ok(app.game.walls.length > 0, 'the build drag laid wall sections');

  const builtWalls = app.game.walls.length;
  dom.documentListeners.get('keydown')({ key: 'z', code: 'KeyZ', ctrlKey: true });
  assert.equal(app.game.walls.length, builtWalls - 1, 'ctrl+z removed one section');
  // Zooming in pulls the camera closer, and the glide settles over a few frames.
  const distanceBefore = app.camera.distance;
  dom.documentListeners.get('wheel')({ clientX: 400, clientY: 400, deltaY: -1 });
  for (let step = 0; step < 60; step += 1) {
    app.camera.update(1 / 60);
  }
  assert.ok(app.camera.distance < distanceBefore, 'scrolling up zooms in');

  const tiltBefore = app.camera.elevation;
  dom.documentListeners.get('keydown')({ key: '[' });
  for (let step = 0; step < 60; step += 1) {
    app.camera.update(1 / 60);
  }
  assert.ok(app.camera.elevation < tiltBefore, 'bracket keys tilt the camera');

  dom.documentListeners.get('keydown')({ key: 'Escape' });
  assert.equal(app.running, false, 'escape pauses and opens the menu');
});

test('the open field has its own setup page -- story, map and both armies -- and begins without a popup', async () => {
  const dom = bootedDom;
  const { app } = await import('../src/main.js');
  const openFieldIndex = LEVELS.findIndex((level) => level.mode === 'battle');
  const cardsFor = (title) => dom.elements.get('battleSetupBody').children
    .find((section) => section.className.includes(title)).children[1].children;
  const cardFor = (title, id) => cardsFor(title).find((card) => card.dataset.id === id);

  assert.equal(dom.elements.get('levelList').children.length, LEVELS.length - 1, 'the campaign lists every ordinary level');
  assert.equal(dom.elements.get('specialList').children.length, 1, 'the open field is set apart');
  assert.ok(LEVELS.filter((level) => level.mode !== 'battle').every((level) => level.sides?.defender && level.sides?.attacker), 'every siege level names its two armies');
  dom.elements.get('specialList').children[0].listeners.get('click')();
  assert.equal(dom.elements.get('battleSetupPage').style.height, '100%', 'picking the open field opens its page');
  assert.equal(app.game.mode, 'siege', 'picking the level waits for Start rather than beginning it');
  assert.equal(dom.elements.get('battleSetupStory').innerText, LEVELS[openFieldIndex].story, 'the story is told on the page');
  assert.equal(cardsFor('setupSection-map').length, Object.keys(BATTLE_MAPS).length, 'a card for every map');

  const slider = dom.elements.get('battleSetupBody').children
    .find((section) => section.className.includes('setupSection-budget')).children[1].children[0];
  slider.value = '48';
  slider.listeners.get('input')();
  assert.equal(app.chosenBudget(), 48, 'the slider sets the points each side fields');

  cardFor('setupSection-map', 'greenwood').listeners.get('click')();
  cardFor('setupSection-player', 'japan').listeners.get('click')();
  cardFor('setupSection-enemy', 'imperial').listeners.get('click')();
  assert.deepEqual(app.chosenFactions(), { player: 'japan', enemy: 'imperial' });
  assert.equal(app.chosenMap(), 'greenwood');
  assert.ok(cardFor('setupSection-map', 'greenwood').className.includes('is-chosen'));

  // The page is a wizard: Back on its first step leaves to the menu.
  const page = dom.elements.get('battleSetupPage');
  const next = dom.elements.get('battleSetupStart');
  const back = dom.elements.get('battleSetupBack');
  back.listeners.get('click')();
  assert.equal(page.style.height, '0%');
  dom.elements.get('startBtn2').listeners.get('click')();
  assert.equal(dom.elements.get('myNav').dataset.view, 'levels', 'Start on a fresh battle asks which level');
  dom.elements.get('specialList').children[0].listeners.get('click')();
  assert.equal(page.style.height, '100%', 'the open field goes through its page');
  assert.equal(page.dataset.step, '0', 'reopening begins at the first step');
  assert.equal(app.game.mode, 'siege');

  next.listeners.get('click')();
  assert.equal(page.dataset.step, '1');
  assert.equal(page.style.height, '100%', 'Next moves on rather than starting');
  back.listeners.get('click')();
  assert.equal(page.dataset.step, '0', 'Back returns a step');
  next.listeners.get('click')();
  next.listeners.get('click')();
  assert.equal(page.dataset.step, '2');
  assert.equal(next.innerText, 'Start Battle', 'the last step begins the battle');
  assert.equal(app.game.mode, 'siege');

  next.listeners.get('click')();
  assert.equal(page.style.height, '0%');
  assert.equal(app.game.mode, 'battle');
  assert.equal(app.game.battleMap, 'greenwood');
  assert.equal(app.game.battleBudget, 48, 'the player gets the chosen budget');
  assert.deepEqual(app.game.factions, { player: 'japan', enemy: 'imperial' });
  assert.ok(app.game.raiders.every((raider) => raider.typeId.startsWith('IG_') || raider.typeId === 'IG0'));
  assert.equal(dom.elements.get('storyBanner').classList.contains('is-shown'), false, 'no story popup over the field');
  assert.notEqual(dom.elements.get('helpInfo').style.display, 'block', 'no wall-building help over the field');

  assert.equal(dom.elements.get('battleDock').style.display, 'flex', 'the open field shows its placement dock');
  assert.equal(dom.elements.get('startBattleBtn').style.display, 'inline-flex', 'and its Start Battle button');

  dom.elements.get('menuBtn').listeners.get('click')();
  dom.elements.get('levelList').children[0].listeners.get('click')();
  assert.equal(app.game.mode, 'siege', 'a siege level starts straight away');
  assert.equal(dom.elements.get('battleDock').style.display, 'none', 'no unit dock left over in a siege level');
  assert.equal(dom.elements.get('startBattleBtn').style.display, 'none', 'no Start Battle button left over either');
  assert.equal(page.style.height, '0%', 'and has no armies to pick');
});

test('the menu has a levels view and the help turns through pages', async () => {
  const dom = bootedDom;
  const menu = dom.elements.get('myNav');
  dom.elements.get('levelsBtn').listeners.get('click')();
  assert.equal(menu.dataset.view, 'levels');
  dom.elements.get('levelsBackBtn').listeners.get('click')();
  assert.equal(menu.dataset.view, 'home');

  const pages = ['a', 'b', 'c'].map(() => stubElement('page'));
  const help = dom.elements.get('helpInfo');
  help.querySelectorAll = () => pages;
  const { app } = await import('../src/main.js');
  app.hud.showHelp();
  assert.equal(pages[0].classList.contains('is-shown'), true);
  assert.equal(dom.elements.get('helpPageLabel').innerText, '1 / 3');
  dom.elements.get('helpNext').listeners.get('click')();
  dom.elements.get('helpNext').listeners.get('click')();
  assert.equal(pages[2].classList.contains('is-shown'), true);
  assert.equal(dom.elements.get('helpNext').innerText, 'Got it');
  dom.elements.get('helpNext').listeners.get('click')();
  assert.notEqual(help.style.display, 'block', 'the last page closes the help');
});

test('game speed paces the simulation and the debug page changes the running game', async () => {
  const dom = bootedDom;
  const { app } = await import('../src/main.js');
  const click = (id) => dom.elements.get(id).listeners.get('click')();
  const settingsMenu = dom.elements.get('settingMenu');

  dom.elements.get('levelList').children[0].listeners.get('click')();
  dom.elements.get('helpClose').listeners.get('click')();
  app.resume();

  const stepsOver = (frames) => {
    let counted = 0;
    const realStep = app.game.step.bind(app.game);
    app.game.step = () => {
      counted += 1;
      realStep();
    };
    for (let frame = 0; frame < frames; frame += 1) {
      clock += 1000 / 60;
      dom.frames.shift()();
    }
    app.game.step = realStep;
    return counted;
  };

  assert.equal(dom.elements.get('gameSpeedBtn').innerText, 'Game Speed: Medium');
  assert.equal(stepsOver(60), 60, 'medium is one step a frame');
  click('gameSpeedBtn');
  assert.equal(dom.elements.get('gameSpeedBtn').innerText, 'Game Speed: Fast');
  assert.equal(stepsOver(60), 120, 'fast is two');
  click('gameSpeedBtn');
  assert.equal(dom.elements.get('gameSpeedBtn').innerText, 'Game Speed: Slow');
  assert.equal(stepsOver(60), 30, 'slow is half');
  click('gameSpeedBtn');
  assert.equal(dom.elements.get('gameSpeedBtn').innerText, 'Game Speed: Medium');

  click('settingsBtn');
  assert.equal(settingsMenu.dataset.view, 'main');
  click('debugOpenBtn');
  assert.equal(settingsMenu.dataset.view, 'debug');

  click('debugMoneyBtn');
  assert.equal(app.game.debug.infiniteMoney, true);
  assert.equal(dom.elements.get('debugMoneyBtn').innerText, 'Infinite Money: On');
  const before = app.game.tokens;
  click('debugGrantBtn');
  assert.ok(app.game.tokens > before, 'Add Money adds to the treasury');

  click('debugSpeedBtn');
  assert.equal(app.game.debug.raiderSpeed, 1.5);
  assert.equal(dom.elements.get('debugSpeedBtn').innerText, 'Attacker Speed: 1.5x');
  click('debugSpawnsBtn');
  assert.equal(app.game.debug.spawnRaiders, false);
  click('debugInvulnerableBtn');
  assert.equal(app.game.debug.invulnerable, true);

  const season = app.game.season;
  click('debugSeasonBtn');
  assert.notEqual(app.game.season, season, 'Next Season moves the calendar on');

  click('debugBackBtn');
  assert.equal(settingsMenu.dataset.view, 'main');
  assert.equal(app.gameSpeed().name, 'Medium');
});
