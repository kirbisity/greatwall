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
