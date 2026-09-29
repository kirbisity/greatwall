import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  'fillText', 'setTransform', 'setLineDash',
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

test('the app boots, plays frames and reacts to input without touching a missing element', async () => {
  const dom = installDom();
  const { app } = await import('../src/main.js');

  // Pointer events, so a finger reaches the same handlers a mouse does.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.ok(dom.documentListeners.has(type), `input is listening for ${type}`);
  }
  assert.ok(dom.windowListeners.has('load'), 'load handler registered');

  dom.windowListeners.get('load')();
  assert.equal(dom.elements.get('loader').style.display, 'none');

  // Start the game, then run the frames the loop queues up.
  dom.elements.get('startBtn2').listeners.get('click')();
  dom.elements.get('helpClose').listeners.get('click')();
  const music = dom.elements.get('backgroundmusic');
  assert.match(music.src, /sounds\/level_1\.mp3$/, 'starting a level cues that level\'s own track');
  assert.equal(music.paused, false, 'music plays once a level has started');
  for (let frame = 0; frame < 200 && dom.frames.length > 0; frame += 1) {
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
