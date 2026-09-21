import { clamp } from './geometry.js';
import { CAMERA } from './config.js';
import { createView, groundAt, groundJacobian, project } from './projection.js';

/**
 * A perspective camera looking down at a focus point on the ground. Panning
 * moves the focus; zooming changes the distance rather than a flat scale.
 */
export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.focus = { x: 0, y: 0 };
    this.distance = CAMERA.initialDistance;
    this.elevation = CAMERA.initialElevation;
    this.refreshView();
  }

  /** Rebuild the cached frame snapshot after any camera change. */
  refreshView() {
    this.view = createView({
      focus: this.focus,
      distance: this.distance,
      elevation: this.elevation,
      width: this.width,
      height: this.height,
    });
  }

  toScreen(point) {
    return project(this.view, point);
  }

  toWorld(pixel) {
    return groundAt(this.view, pixel.x, pixel.y);
  }

  jacobianAt(point) {
    return groundJacobian(this.view, point.x, point.y);
  }

  /** Drag the ground so the point under `from` ends up under `to`. */
  panFrom(from, to) {
    const before = this.toWorld(from);
    const after = this.toWorld(to);
    this.focus.x -= after.x - before.x;
    this.focus.y -= after.y - before.y;
    this.refreshView();
  }

  /** Zoom by `factor`, keeping the ground point under `anchor` in place. */
  zoomAt(anchor, factor) {
    const held = this.toWorld(anchor);
    this.distance = clamp(this.distance / factor, CAMERA.minDistance, CAMERA.maxDistance);
    this.refreshView();
    const moved = this.toWorld(anchor);
    this.focus.x += held.x - moved.x;
    this.focus.y += held.y - moved.y;
    this.refreshView();
  }

  tilt(degrees) {
    this.elevation = clamp(this.elevation + degrees, CAMERA.minElevation, CAMERA.maxElevation);
    this.refreshView();
  }

  centerOn(point) {
    this.focus = { x: point.x, y: point.y };
    this.refreshView();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.refreshView();
  }
}
