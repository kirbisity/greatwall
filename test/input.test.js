import test from 'node:test';
import assert from 'node:assert/strict';

const { Input } = await import('../src/input.js');

function makeInput({ wallAt = () => null } = {}) {
  const changes = [];
  const hud = {
    setCursor: () => {},
    setActiveTool: () => {},
    hideDispatchMenu: () => {},
    showMessage: () => {},
  };
  const camera = { toWorld: (point) => point, width: 1200, height: 800 };
  const renderer = { hoveredWall: null };
  const game = { wallAt, castles: [], dispatchOptions: () => [] };
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
