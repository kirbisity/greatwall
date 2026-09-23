import test from 'node:test';
import assert from 'node:assert/strict';
import {
  centroid,
  createView,
  facesCamera,
  groundAt,
  groundJacobian,
  groundTransform,
  lightingFor,
  normalOf,
  projectPoint,
} from '../src/projection.js';
import { Camera } from '../src/camera.js';
import { AMBIENT_LIGHT, CAMERA } from '../src/config.js';

function view(overrides = {}) {
  return createView({
    focus: { x: 0, y: 0 }, distance: 400, elevation: 52, width: 1200, height: 800, ...overrides,
  });
}

test('the focus point projects to the centre of the screen', () => {
  const v = view();
  const screen = projectPoint(v, 0, 0, 0);
  assert.ok(Math.abs(screen.x - 600) < 1e-9);
  assert.ok(Math.abs(screen.y - 400) < 1e-9);
});

test('screen to ground and back round-trips exactly', () => {
  const v = view({ focus: { x: 30, y: -80 }, elevation: 47 });
  let worst = 0;
  for (let x = -500; x <= 500; x += 50) {
    for (let y = -500; y <= 500; y += 50) {
      const screen = projectPoint(v, x, y, 0);
      if (!screen) {
        continue;
      }
      const back = groundAt(v, screen.x, screen.y);
      worst = Math.max(worst, Math.hypot(back.x - x, back.y - y));
    }
  }
  assert.ok(worst < 1e-6, `worst round-trip error ${worst}`);
});

test('points behind the near plane do not project', () => {
  const v = view({ elevation: 40 });
  assert.equal(projectPoint(v, 0, -100000, 0), null);
});

test('height lifts a point up the screen', () => {
  const v = view();
  const ground = projectPoint(v, 0, 0, 0);
  const raised = projectPoint(v, 0, 0, 20);
  assert.ok(raised.y < ground.y, 'a raised point draws higher');
  assert.equal(raised.x, ground.x, 'and directly above its footprint');
});

test('nearer ground is drawn larger than distant ground', () => {
  const v = view();
  const near = groundJacobian(v, 0, -260);
  const far = groundJacobian(v, 0, 260);
  assert.ok(Math.hypot(near.east.x, near.east.y) > Math.hypot(far.east.x, far.east.y));
});

test('a wall side faces the camera from one direction only', () => {
  const v = view();
  const southFace = [
    { x: -50, y: -10, z: 0 }, { x: 50, y: -10, z: 0 },
    { x: 50, y: -10, z: 10 }, { x: -50, y: -10, z: 10 },
  ];
  const northFace = [
    { x: 50, y: 10, z: 0 }, { x: -50, y: 10, z: 0 },
    { x: -50, y: 10, z: 10 }, { x: 50, y: 10, z: 10 },
  ];
  assert.equal(facesCamera(v, normalOf(...southFace.slice(0, 3)), centroid(southFace)), true);
  assert.equal(facesCamera(v, normalOf(...northFace.slice(0, 3)), centroid(northFace)), false);
});

// Guards the bug that made the spike cull every roof.
test('a counter-clockwise footprint gives an upward roof normal', () => {
  const roof = [
    { x: -5, y: -5, z: 6 }, { x: 5, y: -5, z: 6 }, { x: 5, y: 5, z: 6 }, { x: -5, y: 5, z: 6 },
  ];
  const normal = normalOf(roof[0], roof[1], roof[2]);
  assert.ok(normal.z > 0.99, `roof normal points up, got z=${normal.z}`);
  assert.equal(facesCamera(view(), normal, centroid(roof)), true);
});

test('lighting stays between the ambient floor and full sun', () => {
  for (const normal of [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }]) {
    const light = lightingFor(normal);
    assert.ok(light >= AMBIENT_LIGHT - 1e-9 && light <= 1 + 1e-9, `light ${light}`);
  }
});

test('a ground sprite facing north keeps its top towards north', () => {
  const v = view();
  const jacobian = groundJacobian(v, 0, 0);
  const [a, b, c, d, e, f] = groundTransform(jacobian, Math.PI / 2);
  // The image's top edge is local -y, which should land north of the origin,
  // and north is up the screen.
  const topEdgeScreenY = f + d * -1;
  assert.ok(topEdgeScreenY < f, 'sprite top draws above its centre');
  const rightEdgeScreenX = e + a * 1;
  assert.ok(rightEdgeScreenX > e, 'sprite right draws right of its centre');
  assert.ok(Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9, 'no skew when facing north');
});

/** Run the camera forward until it stops moving. */
function settle(camera, seconds = 1 / 60, limit = 600) {
  for (let step = 0; step < limit && camera.update(seconds); step += 1) {
    // settling
  }
}

test('the camera keeps the anchor under the cursor throughout a zoom', () => {
  const camera = new Camera(1200, 800);
  const anchor = { x: 820, y: 300 };
  const before = camera.toWorld(anchor);
  camera.zoomAt(anchor, 1.6);

  // The whole glide must hold it, not just the end.
  for (let step = 0; step < 40; step += 1) {
    camera.update(1 / 60);
    const now = camera.toWorld(anchor);
    assert.ok(Math.hypot(now.x - before.x, now.y - before.y) < 1e-6, `drifted at step ${step}`);
  }
});

test('panning drags the ground point under the cursor', () => {
  const camera = new Camera(1200, 800);
  const from = { x: 400, y: 500 };
  const to = { x: 700, y: 420 };
  const grabbed = camera.toWorld(from);
  camera.panFrom(from, to);
  camera.update(1 / 60);
  const released = camera.toWorld(to);
  assert.ok(Math.hypot(released.x - grabbed.x, released.y - grabbed.y) < 1e-6);
});

test('a released drag carries on and then stops', () => {
  const camera = new Camera(1200, 800);
  camera.panFrom({ x: 700, y: 400 }, { x: 400, y: 400 });
  camera.update(1 / 60);
  const atRelease = { ...camera.focus };
  camera.release();

  camera.update(1 / 60);
  const carried = Math.hypot(camera.focus.x - atRelease.x, camera.focus.y - atRelease.y);
  assert.ok(carried > 0, 'momentum keeps it moving after the button is up');

  settle(camera);
  assert.equal(camera.update(1 / 60), false, 'and it comes to rest');
});

test('zoom and tilt settle inside their limits', () => {
  const camera = new Camera(1200, 800);
  for (let i = 0; i < 100; i += 1) {
    camera.zoomAt({ x: 600, y: 400 }, 2);
  }
  settle(camera);
  assert.equal(camera.distance, CAMERA.minDistance);

  for (let i = 0; i < 100; i += 1) {
    camera.zoomAt({ x: 600, y: 400 }, 0.5);
  }
  settle(camera);
  assert.equal(camera.distance, CAMERA.maxDistance);

  for (let i = 0; i < 100; i += 1) {
    camera.tilt(-10);
  }
  settle(camera);
  assert.equal(camera.elevation, CAMERA.minElevation);
});

test('the ground resists further the harder it is pushed, and never passes the limit', () => {
  const camera = new Camera(1200, 800);
  const covered = [];
  for (let shove = 0; shove < 40; shove += 1) {
    const before = Math.hypot(camera.focus.x, camera.focus.y);
    camera.panFrom({ x: 900, y: 400 }, { x: 300, y: 400 });
    camera.update(1 / 60);
    covered.push(Math.hypot(camera.focus.x, camera.focus.y) - before);
  }
  assert.ok(covered.at(-1) < covered[0], 'each shove moves less ground than the last');
  assert.ok(Math.hypot(camera.focus.x, camera.focus.y) < CAMERA.hardLimit, 'stays inside the edge');
});

// Below roughly this angle the horizon enters the viewport and the ground
// stops filling the canvas.
test('the horizon stays off screen at the lowest allowed tilt', () => {
  const height = 1200;
  const v = view({ elevation: CAMERA.minElevation, height });
  const horizonY = v.centreY - v.focal * Math.tan(CAMERA.minElevation * Math.PI / 180);
  assert.ok(horizonY < 0, `horizon at ${horizonY.toFixed(0)}px should be above the viewport`);
});
