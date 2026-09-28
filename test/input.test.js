import test from 'node:test';
import assert from 'node:assert/strict';

const { Input } = await import('../src/input.js');

function makeInput({ wallAt = () => null, game: gameOverrides = {} } = {}) {
  const changes = [];
  const hud = {
    setCursor: () => {},
    setActiveTool: () => {},
    hideDispatchMenu: () => {},
    showMessage: () => {},
  };
  const camera = { toWorld: (point) => point, width: 1200, height: 800 };
  const renderer = { hoveredWall: null };
  const game = {
    wallAt, castles: [], dispatchOptions: () => [], terrain: { heightAt: () => 0 }, ...gameOverrides,
  };
  const input = new Input({
    game,
    camera,
    renderer,
    hud,
    onChange: () => changes.push(true),
    onMenu: () => {},
  });
  return { input, renderer, changes };
}

test('hovering with the repair tool picks out the wall under the cursor', () => {
  const wall = { id: 'wall-1' };
  const { input, renderer } = makeInput({ wallAt: () => wall });
  input.selectTool('repair');
  input.updateHover();
  assert.equal(renderer.hoveredWall, wall);
});

test('hovering with the fortify tool picks out the wall under the cursor', () => {
  const wall = { id: 'wall-1' };
  const { input, renderer } = makeInput({ wallAt: () => wall });
  input.selectTool('fortify');
  input.updateHover();
  assert.equal(renderer.hoveredWall, wall);
});

test('hovering with any other tool never highlights a wall', () => {
  const wall = { id: 'wall-1' };
  const { input, renderer } = makeInput({ wallAt: () => wall });
  input.selectTool('build');
  input.updateHover();
  assert.equal(renderer.hoveredWall, null);
});

test('switching tools drops whatever was highlighted', () => {
  const wall = { id: 'wall-1' };
  const { input, renderer } = makeInput({ wallAt: () => wall });
  input.selectTool('fortify');
  input.updateHover();
  assert.equal(renderer.hoveredWall, wall);

  input.selectTool('move');
  assert.equal(renderer.hoveredWall, null, 'leaving the tool should drop the highlight, not just stop updating it');
});

test('updateHover only signals a change when the hovered wall actually changes', () => {
  const wall = { id: 'wall-1' };
  const { input, changes } = makeInput({ wallAt: () => wall });
  input.selectTool('repair');
  changes.length = 0;

  input.updateHover();
  assert.equal(changes.length, 1, 'first hover over a wall should notify once');

  input.updateHover();
  assert.equal(changes.length, 1, 'hovering the same wall again should not notify again');
});

test('moving off a section to open ground clears the highlight', () => {
  const wall = { id: 'wall-1' };
  let onWall = true;
  const { input, renderer } = makeInput({ wallAt: () => (onWall ? wall : null) });
  input.selectTool('repair');
  input.updateHover();
  assert.equal(renderer.hoveredWall, wall);

  onWall = false;
  input.updateHover();
  assert.equal(renderer.hoveredWall, null);
});

// --- ordering an attack -------------------------------------------------

/** An Input wired to a game that records the companies it is asked to send. */
function attackReady({ options = [{ id: 'IG0', name: 'Guardsman', cost: 260 }], sent = { sent: true } } = {}) {
  const orders = [];
  const { input } = makeInput({
    game: {
      dispatchOptions: () => options,
      sendGuard: (typeId, target) => {
        orders.push({ typeId, target });
        return sent;
      },
    },
  });
  return { input, orders };
}

test('clicking the map with the attack tool musters a company', () => {
  const { input, orders } = attackReady();
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });

  assert.equal(orders.length, 1, 'the click should have sent a company');
  assert.equal(orders[0].typeId, 'IG0');
  assert.deepEqual(orders[0].target, { x: 400, y: 300 });
});

test('the attack order carries the tier the player picked, not just the first', () => {
  const options = [
    { id: 'IG_LIGHT', name: 'Light Guard', cost: 260 },
    { id: 'IG_HEAVY', name: 'Heavy Guard', cost: 680 },
  ];
  const { input, orders } = attackReady({ options });
  input.selectTool('attack');
  input.selectedGuardType = 'IG_HEAVY';
  input.handleClick({ clientX: 500, clientY: 350 });

  assert.equal(orders[0].typeId, 'IG_HEAVY');
});

test('an attack the treasury cannot afford says so and sends nobody', () => {
  const messages = [];
  const orders = [];
  const { input } = makeInput({
    game: {
      dispatchOptions: () => [{ id: 'IG0', name: 'Guardsman', cost: 260 }],
      sendGuard: (typeId) => {
        orders.push(typeId);
        return { sent: false, status: 'poor' };
      },
    },
  });
  input.hud.showMessage = (text) => messages.push(text);
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });

  assert.equal(orders.length, 1, 'it still asks');
  assert.match(messages.join(' '), /costs \$260/);
});

test('with no company available the attack click is simply ignored', () => {
  const { input, orders } = attackReady({ options: [] });
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });
  assert.equal(orders.length, 0);
});

test('the attack tool stays up, so several companies can be sent in a row', () => {
  const { input, orders } = attackReady();
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });
  input.handleClick({ clientX: 500, clientY: 320 });

  assert.equal(input.tool, 'attack', 'ordering should not put the tool away');
  assert.equal(orders.length, 2);
  assert.deepEqual(orders[1].target, { x: 500, y: 320 });
});

// --- touch and pointer gestures -----------------------------------------

/**
 * An Input whose camera records what it was asked to do, so a gesture can be
 * checked by the moves it produced rather than by pixels.
 */
function gestureInput({ tool = 'move', game = {} } = {}) {
  const calls = { pan: [], zoom: [], release: 0 };
  const { input } = makeInput({ game });
  // A fresh point every time, as the real camera gives: handing back the
  // live pointer would let a wall's start slide along with the finger.
  input.camera.toWorld = (point) => ({ ...point });
  input.camera.panFrom = (from, to, options = {}) => calls.pan.push({
    from: { ...from }, to: { ...to }, direct: Boolean(options.direct),
  });
  input.camera.zoomAt = (anchor, factor) => calls.zoom.push({ anchor: { ...anchor }, factor });
  input.camera.release = () => { calls.release += 1; };
  if (tool !== 'move') {
    input.selectTool(tool);
  }
  return { input, calls };
}

const finger = (pointerId, clientX, clientY) => ({ pointerId, pointerType: 'touch', clientX, clientY });

test('one finger dragging the map pans it, the way the mouse does', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 300, 300));
  input.handlePointerMove(finger(1, 340, 310));
  input.handlePointerUp(finger(1, 340, 310));

  assert.equal(calls.pan.length, 1);
  assert.deepEqual(calls.pan[0].from, { x: 300, y: 300 });
  assert.deepEqual(calls.pan[0].to, { x: 340, y: 310 });
  assert.equal(calls.release, 1, 'lifting the finger lets the camera coast');
});

test('one finger with the build tool lays wall along the drag', () => {
  const built = [];
  const { input } = gestureInput({
    tool: 'build',
    game: { buildWall: (from, to) => { built.push({ from, to }); return { status: 'built', end: to }; } },
  });
  input.handlePointerDown(finger(1, 100, 100));
  input.handlePointerMove(finger(1, 110, 100));
  input.handlePointerMove(finger(1, 200, 100));
  input.handlePointerUp(finger(1, 200, 100));

  assert.equal(built.length, 1, 'a drag long enough for one section should lay one');
  assert.deepEqual(built[0].to, { x: 200, y: 100 });
});

test('two fingers pinching apart zoom in around the point between them', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 200, 300));
  input.handlePointerDown(finger(2, 300, 300));
  // Spread from 100 apart to 200 apart, about the same midpoint.
  input.handlePointerMove(finger(1, 150, 300));
  input.handlePointerMove(finger(2, 350, 300));

  assert.ok(calls.zoom.length >= 1, 'the pinch should zoom');
  const factor = calls.zoom.reduce((total, call) => total * call.factor, 1);
  assert.ok(Math.abs(factor - 2) < 1e-9, `spreading to twice the gap should zoom 2x, got ${factor}`);
  assert.deepEqual(calls.zoom.at(-1).anchor, { x: 250, y: 300 });
});

test('two fingers moving together pan the map in any tool', () => {
  const built = [];
  const { input, calls } = gestureInput({
    tool: 'build',
    game: { buildWall: (from, to) => { built.push({ from, to }); return { status: 'built', end: to }; } },
  });
  input.handlePointerDown(finger(1, 200, 300));
  input.handlePointerDown(finger(2, 300, 300));
  input.handlePointerMove(finger(1, 240, 300));
  input.handlePointerMove(finger(2, 340, 300));

  const moved = calls.pan.reduce((total, call) => total + (call.to.x - call.from.x), 0);
  assert.equal(moved, 40, 'the map should follow the midpoint of the two fingers');
  assert.equal(built.length, 0, 'a two-finger drag is a camera move, never a wall');
});

test('a second finger landing abandons the wall the first was drawing', () => {
  const built = [];
  const { input } = gestureInput({
    tool: 'build',
    game: { buildWall: (from, to) => { built.push({ from, to }); return { status: 'built', end: to }; } },
  });
  input.handlePointerDown(finger(1, 100, 100));
  input.handlePointerMove(finger(1, 110, 100));
  assert.ok(input.chainPoint, 'the first finger has started a wall');

  input.handlePointerDown(finger(2, 400, 400));
  assert.equal(input.chainPoint, null, 'the second finger should drop it');

  // Lifting one finger and dragging the other must not resume building.
  input.handlePointerUp(finger(2, 400, 400));
  input.handlePointerMove(finger(1, 300, 100));
  assert.equal(built.length, 0);
});

test('a gesture that starts on the interface never moves the map', () => {
  const { input, calls } = gestureInput();
  const onButton = { ...finger(1, 300, 700), target: { closest: (selector) => (selector ? {} : null) } };
  input.handlePointerDown(onButton);
  input.handlePointerMove({ ...onButton, clientX: 360 });
  input.handlePointerUp({ ...onButton, clientX: 360 });
  assert.equal(calls.pan.length, 0, 'dragging off a button should not pan');
});

test('a tap on the interface does not also land on the map', () => {
  const orders = [];
  const { input } = makeInput({
    game: {
      dispatchOptions: () => [{ id: 'IG0', name: 'Guardsman', cost: 260 }],
      sendGuard: (typeId, target) => { orders.push(target); return { sent: true }; },
    },
  });
  input.selectTool('attack');
  input.handleClick({ clientX: 300, clientY: 700, target: { closest: () => ({}) } });
  assert.equal(orders.length, 0, 'tapping a button must not send a company to it');
});

test('the mouse still hovers, and still drags, through the same handlers', () => {
  const wall = { id: 'wall-1' };
  const { input, renderer } = makeInput({ wallAt: () => wall });
  input.selectTool('repair');
  const mouse = { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 };
  input.handlePointerMove(mouse);
  assert.equal(renderer.hoveredWall, wall, 'hovering with no button down still picks out a section');
});

test('undo takes back the last section, from the keyboard or the button alike', () => {
  let undone = 0;
  const { input, changes } = makeInput({ game: { undoLastWall: () => { undone += 1; return true; } } });
  input.handleKey({ key: 'z', code: 'KeyZ', ctrlKey: true });
  input.undo();
  assert.equal(undone, 2, 'Ctrl+Z and the undo button should reach the same place');
  assert.ok(changes.length >= 2, 'and each should redraw');
});

test('a finger holds the ground it grabs; a mouse drag keeps its weight', () => {
  const touch = gestureInput();
  touch.input.handlePointerDown(finger(1, 300, 300));
  touch.input.handlePointerMove(finger(1, 340, 300));
  assert.equal(touch.calls.pan[0].direct, true, 'a finger should drag the ground directly');

  const mouse = gestureInput();
  const cursor = (x) => ({ pointerId: 1, pointerType: 'mouse', clientX: x, clientY: 300 });
  mouse.input.handlePointerDown(cursor(300));
  mouse.input.handlePointerMove(cursor(340));
  assert.equal(mouse.calls.pan[0].direct, false, 'a mouse should keep the eased feel it was tuned with');
});

test('two fingers panning hold the ground as well', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 200, 300));
  input.handlePointerDown(finger(2, 300, 300));
  input.handlePointerMove(finger(1, 240, 300));
  assert.ok(calls.pan.length > 0 && calls.pan.every((call) => call.direct));
});
