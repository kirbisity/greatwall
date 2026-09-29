import test from 'node:test';
import assert from 'node:assert/strict';

const { Input } = await import('../src/input.js');

function makeInput({ wallAt = () => null, game: gameOverrides = {} } = {}) {
  const changes = [];
  const hud = {
    setCursor: () => {},
    setActiveTool: () => {},
    hideDispatchMenu: () => {},
    showDispatchMenu: () => {},
    showMessage: () => {},
    showActionHint: () => {},
    clearActionHint: () => {},
  };
  const camera = {
    toWorld: (point) => point, toScreen: () => ({ x: 600, y: 400 }), width: 1200, height: 800,
  };
  const renderer = { hoveredWall: null, flashInvalidWall: () => {}, pingSelection: () => {} };
  const game = {
    wallAt,
    castles: [],
    dispatchOptions: () => [],
    terrain: { heightAt: () => 0 },
    selectedGuards: [],
    deselectGuards: () => {},
    selectGuardsNear: () => [],
    orderGuards: () => {},
    ...gameOverrides,
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

// --- tapping repair or fortify, without a swipe across the section --------

test('a single tap with the repair tool mends whatever is under it', () => {
  const repaired = [];
  const { input } = makeInput({
    game: {
      repairWallAt: (point) => { repaired.push(point); return { status: 'repairing' }; },
    },
  });
  input.selectTool('repair');
  input.handleClick({ clientX: 300, clientY: 200 });
  assert.equal(repaired.length, 1, 'a plain tap should act, not just a drag');
  assert.deepEqual(repaired[0], { x: 300, y: 200 });
});

test('a single tap with the fortify tool works the same way', () => {
  const fortified = [];
  const { input } = makeInput({
    game: {
      upgradeWallAt: (point) => { fortified.push(point); return { status: 'working' }; },
    },
  });
  input.selectTool('fortify');
  input.handleClick({ clientX: 250, clientY: 180 });
  assert.equal(fortified.length, 1);
});

test('tapping repair on open ground with nothing to mend is a quiet no-op', () => {
  const { input } = makeInput({ game: { repairWallAt: () => ({ status: 'none' }) } });
  input.selectTool('repair');
  assert.doesNotThrow(() => input.handleClick({ clientX: 100, clientY: 100 }));
});

// --- mustering, selecting and ordering an attack -------------------------

/** An Input wired to a game that records every company it is asked to muster. */
function attackReady({ options = [{ id: 'IG0', name: 'Guardsman', cost: 260 }], sent = { sent: true } } = {}) {
  const spawned = [];
  const selected = [];
  const orders = [];
  const guards = [];
  const { input } = makeInput({
    game: {
      dispatchOptions: () => options,
      castles: [{ position: { x: 0, y: 0 }, typeId: 'CC0' }],
      sendGuard: (typeId) => { spawned.push(typeId); return sent; },
      selectGuardsNear: (point) => { selected.push(point); return guards; },
      orderGuards: (group, target) => orders.push({ group, target }),
      get selectedGuards() { return guards; },
    },
  });
  return { input, spawned, selected, orders, guards };
}

test('the attack tool asks for a company first, then to tap one to select it', () => {
  const options = [{ id: 'IG0', name: 'Guardsman', cost: 260 }];
  const hints = [];
  const { input } = makeInput({
    game: {
      dispatchOptions: () => options,
      castles: [{ position: { x: 0, y: 0 }, typeId: 'CC0' }],
      sendGuard: () => ({ sent: true }),
    },
  });
  input.hud.showActionHint = (text) => hints.push(text);
  input.hud.showDispatchMenu = (opts, screen, onPick) => onPick(options[0].id);

  input.selectTool('attack');

  assert.deepEqual(hints, [
    'Choose a company above the castle',
    'Tap a company to select it, then tap again to send it',
  ]);
});

test('picking a tier spawns a company right away, without needing a map tap', () => {
  const { input, spawned } = attackReady();
  input.hud.showDispatchMenu = (opts, screen, onPick) => onPick('IG0');
  input.selectTool('attack');
  assert.deepEqual(spawned, ['IG0']);
});

test('picking a tier the treasury cannot afford says so and musters nobody', () => {
  const messages = [];
  const { input } = attackReady({ sent: { sent: false, status: 'poor' } });
  input.hud.showMessage = (text) => messages.push(text);
  input.hud.showDispatchMenu = (opts, screen, onPick) => onPick('IG0');
  input.selectTool('attack');
  assert.match(messages.join(' '), /costs \$260/);
});

test('the tier picker stays open after a pick, so several companies can be mustered in a row', () => {
  const hidden = [];
  const { input } = attackReady();
  input.hud.hideDispatchMenu = () => hidden.push(true);
  input.hud.showDispatchMenu = (opts, screen, onPick) => { onPick('IG0'); onPick('IG0'); };
  input.selectTool('attack');
  assert.equal(hidden.length, 0, 'mustering should not close the picker');
});

test('an empty-handed tap selects whatever companies are nearby', () => {
  const { input, selected } = attackReady();
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], { x: 400, y: 300 });
});

test('a tap with something selected sends that group instead of selecting again', () => {
  const { input, selected, orders, guards } = attackReady();
  guards.push({ selected: true });
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 });
  assert.equal(selected.length, 0, 'already have a group -- this tap commands, not selects');
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].target, { x: 400, y: 300 });
});

test('a tap always closes the tier picker, since tapping the map means mustering is done', () => {
  const hidden = [];
  const { input } = attackReady();
  input.hud.hideDispatchMenu = () => hidden.push(true);
  input.selectTool('attack');
  hidden.length = 0;
  input.handleClick({ clientX: 400, clientY: 300 });
  assert.equal(hidden.length, 1);
});

test('a tool with nothing of its own to say clears whatever hint was showing', () => {
  const cleared = [];
  const { input } = makeInput();
  input.hud.clearActionHint = () => cleared.push(true);
  input.selectTool('zoom');
  assert.equal(cleared.length, 1);
});

test('every other tool names what to do with it', () => {
  const { input } = makeInput();
  const hints = [];
  input.hud.showActionHint = (text) => hints.push(text);
  for (const tool of ['build', 'destroy', 'repair', 'fortify', 'upgrade']) {
    input.selectTool(tool);
    input.selectTool(tool); // back to move, so the next iteration is a fresh pick
  }
  assert.equal(hints.length, 5, 'one hint per tool picked');
  assert.ok(hints.every((text) => text.length > 0));
});

test('the attack tool stays up through a full select-then-command cycle', () => {
  const { input, guards } = attackReady();
  guards.push({ selected: true });
  input.selectTool('attack');
  input.handleClick({ clientX: 400, clientY: 300 }); // commands the group already in guards
  assert.equal(input.tool, 'attack', 'ordering should not put the tool away');
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

test('a finger landing on the map captures the pointer, so a drag cannot be lost to a button it crosses', () => {
  const { input } = gestureInput();
  const captured = [];
  const target = { setPointerCapture: (id) => captured.push(id) };
  input.handlePointerDown({ ...finger(7, 300, 300), target });
  assert.deepEqual(captured, [7]);
});

test('a mouse click does not bother capturing the pointer', () => {
  const { input } = gestureInput();
  const captured = [];
  const target = { setPointerCapture: (id) => captured.push(id) };
  input.handlePointerDown({ pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300, target });
  assert.equal(captured.length, 0);
});

test('one finger dragging the map pans it, smoothed to iron out touch jitter', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 300, 300));
  input.handlePointerMove(finger(1, 340, 310));
  input.handlePointerUp(finger(1, 340, 310));

  assert.equal(calls.pan.length, 1);
  assert.deepEqual(calls.pan[0].from, { x: 300, y: 300 });
  // Eased towards the new point rather than snapping straight onto it --
  // see TOUCH_PAN_SMOOTHING -- but still most of the way there in one step.
  assert.ok(calls.pan[0].to.x > 310 && calls.pan[0].to.x < 340, `x landed at ${calls.pan[0].to.x}`);
  assert.ok(calls.pan[0].to.y > 302 && calls.pan[0].to.y < 310, `y landed at ${calls.pan[0].to.y}`);
  assert.equal(calls.release, 1, 'lifting the finger lets the camera coast');
});

test('a finger held still after a move settles onto it within a few samples', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 0, 0));
  for (let sample = 0; sample < 8; sample += 1) {
    input.handlePointerMove(finger(1, 100, 0));
  }
  const last = calls.pan.at(-1).to;
  assert.ok(Math.abs(last.x - 100) < 1, `should have converged onto the finger, landed at ${last.x}`);
});

test('a new drag starts smoothing fresh from wherever the finger actually lands', () => {
  const { input, calls } = gestureInput();
  input.handlePointerDown(finger(1, 0, 0));
  input.handlePointerMove(finger(1, 100, 0));
  input.handlePointerUp(finger(1, 100, 0));

  calls.pan.length = 0;
  input.handlePointerDown(finger(2, 500, 500));
  input.handlePointerMove(finger(2, 540, 500));

  assert.deepEqual(calls.pan[0].from, { x: 500, y: 500 }, 'not wherever the last drag left off');
});

test('a mouse drag is never smoothed -- it tracks exactly, the way it always has', () => {
  const { input, calls } = gestureInput();
  const mouse = (clientX, clientY) => ({ pointerId: 1, pointerType: 'mouse', clientX, clientY });
  input.handlePointerDown(mouse(300, 300));
  input.handlePointerMove(mouse(340, 310));

  assert.deepEqual(calls.pan[0].to, { x: 340, y: 310 });
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

test('a refused build attempt blinks the tried line red', () => {
  const flashes = [];
  const { input } = gestureInput({
    tool: 'build',
    game: { buildWall: () => ({ status: 'poor', start: { x: 1, y: 1 }, end: { x: 2, y: 2 } }) },
  });
  input.renderer.flashInvalidWall = (start, end) => flashes.push({ start, end });
  input.handlePointerDown(finger(1, 100, 100));
  input.handlePointerMove(finger(1, 110, 100));
  input.handlePointerMove(finger(1, 200, 100));

  assert.equal(flashes.length, 1);
  assert.deepEqual(flashes[0], { start: { x: 1, y: 1 }, end: { x: 2, y: 2 } });
});

test('a wall blocked by the city, in the water, or onto a crowded node all blink red the same way', () => {
  for (const status of ['blocked', 'water', 'crowded']) {
    const flashes = [];
    const { input } = gestureInput({
      tool: 'build',
      game: { buildWall: () => ({ status, start: { x: 0, y: 0 }, end: { x: 40, y: 0 } }) },
    });
    input.renderer.flashInvalidWall = (start, end) => flashes.push({ start, end });
    input.handlePointerDown(finger(1, 100, 100));
    input.handlePointerMove(finger(1, 110, 100));
    input.handlePointerMove(finger(1, 200, 100));

    assert.equal(flashes.length, 1, status);
  }
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

test('the tier picker hangs over the roof, not the ground at sea level', () => {
  const asked = [];
  const { input } = makeInput({
    game: {
      castles: [{ position: { x: 5, y: 7 }, typeId: 'CC0' }],
      buildings: { CC0: { name: 'keep' } },
      dispatchOptions: () => [{ id: 'IG0', name: 'Guardsman', cost: 260 }],
      terrain: { heightAt: () => 40 },
    },
  });
  input.renderer.structureFor = () => ({ height: 16 });
  input.camera.toScreen = (point) => { asked.push(point); return { x: 100, y: 100 }; };
  input.hud.showDispatchMenu = () => {};
  input.selectTool('attack');
  assert.deepEqual(asked[0], { x: 5, y: 7, z: 56 }, 'ground 40 up the hill plus a roof 16 high');
});
