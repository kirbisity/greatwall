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
  'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'stroke',
  'arc', 'fill', 'drawImage', 'save', 'translate', 'rotate', 'restore', 'fillText',
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
  return {
    id,
    style: {},
    classList: { toggle: () => {} },
    innerText: '',
    loop: false,
    volume: 0,
    listeners: new Map(),
    getContext: () => stubContext(),
    play: () => Promise.resolve(),
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

  assert.ok(dom.documentListeners.has('mousemove'), 'input is listening');
  assert.ok(dom.windowListeners.has('load'), 'load handler registered');

  dom.windowListeners.get('load')();
  assert.equal(dom.elements.get('loader').style.display, 'none');

  // Start the game, then run the frames the loop queues up.
  dom.elements.get('startBtn2').listeners.get('click')();
  dom.elements.get('helpClose').listeners.get('click')();
  for (let frame = 0; frame < 200 && dom.frames.length > 0; frame += 1) {
    dom.frames.shift()();
  }
  assert.ok(dom.frames.length > 0, 'the loop keeps requesting frames');
  assert.match(dom.elements.get('token0').innerText, /^\$\d+$/);
  assert.match(dom.elements.get('season0').innerText, /Autumn|Winter|Spring|Summer/);

  // A drag that starts without a prior mousemove must not jump the map.
  const originBefore = { x: app.camera.offsetX, y: app.camera.offsetY };
  dom.documentListeners.get('mousedown')({ clientX: 600, clientY: 300 });
  dom.documentListeners.get('mousemove')({ clientX: 600, clientY: 300 });
  dom.documentListeners.get('mouseup')({ clientX: 600, clientY: 300 });
  assert.equal(app.camera.offsetX, originBefore.x, 'no pan jump on first drag');
  assert.equal(app.camera.offsetY, originBefore.y, 'no pan jump on first drag');

  // Every tool button, then a build drag and a wheel zoom.
  for (const id of ['buildTool', 'destroyTool', 'upgradeTool', 'zoom', 'move', 'menuBtn']) {
    dom.elements.get(id).listeners.get('click')();
  }
  dom.elements.get('buildTool').listeners.get('click')();
  dom.documentListeners.get('mousedown')({ clientX: 400, clientY: 400 });
  for (let x = 400; x < 900; x += 50) {
    dom.documentListeners.get('mousemove')({ clientX: x, clientY: 400 });
  }
  dom.documentListeners.get('mouseup')({ clientX: 900, clientY: 400 });
  assert.ok(app.game.walls.length > 0, 'the build drag laid wall sections');

  const builtWalls = app.game.walls.length;
  dom.documentListeners.get('keydown')({ key: 'z', code: 'KeyZ', ctrlKey: true });
  assert.equal(app.game.walls.length, builtWalls - 1, 'ctrl+z removed one section');
  const zoomBefore = app.camera.scale;
  dom.documentListeners.get('wheel')({ clientX: 400, clientY: 400, deltaY: -1 });
  assert.ok(app.camera.scale > zoomBefore, 'scrolling up zooms in');

  dom.documentListeners.get('keydown')({ key: 'Escape' });
  assert.equal(app.running, false, 'escape pauses and opens the menu');
});
