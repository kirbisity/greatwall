import { clamp } from './geometry.js';
import { CAMERA } from './config.js';
import { createView, groundAt, groundJacobian, project } from './projection.js';

/**
 * A perspective camera orbiting a focus point on the ground.
 *
 * Nothing moves the camera directly. Input records intent — a drag delta, a
 * zoom target, a tilt target — and `update` settles towards it once a frame,
 * which is what makes panning carry momentum and zooming glide instead of
 * jumping.
 */
export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.focus = { x: 0, y: 0 };
    this.distance = CAMERA.initialDistance;
    this.targetDistance = this.distance;
    this.elevation = CAMERA.initialElevation;
    this.targetElevation = this.elevation;
    this.dragDelta = { x: 0, y: 0 };
    this.drift = { x: 0, y: 0 };
    this.dragging = false;
    this.zoomAnchor = null;
    this.refreshView();
  }

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

  // --- intent -------------------------------------------------------------

  /** Queue the ground movement needed to keep `from` under `to`. */
  panFrom(from, to) {
    const before = this.toWorld(from);
    const after = this.toWorld(to);
    this.dragDelta.x += before.x - after.x;
    this.dragDelta.y += before.y - after.y;
    this.dragging = true;
  }

  /** Let go, so whatever speed the drag had becomes momentum. */
  release() {
    this.dragging = false;
  }

  /** Zoom by `factor`, holding the ground under `anchor` in place throughout. */
  zoomAt(anchor, factor) {
    this.zoomAnchor = { screen: { ...anchor }, world: this.toWorld(anchor) };
    this.targetDistance = clamp(
      this.targetDistance / factor,
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );
  }

  tilt(degrees) {
    this.targetElevation = clamp(
      this.targetElevation + degrees,
      CAMERA.minElevation,
      CAMERA.maxElevation,
    );
  }

  centerOn(point) {
    this.focus = { x: point.x, y: point.y };
    this.drift = { x: 0, y: 0 };
    this.dragDelta = { x: 0, y: 0 };
    this.zoomAnchor = null;
    this.refreshView();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.refreshView();
  }

  // --- settling -----------------------------------------------------------

  /**
   * Past the soft limit the ground pushes back on outward movement, easing to
   * a standstill at the hard limit. Only the outward part is resisted, so
   * turning back towards the middle always feels free.
   *
   * The resistance applies to the movement, not to the position: damping a
   * position that is already damped compounds every frame and turns a gentle
   * edge into a brick wall.
   */
  resisted(deltaX, deltaY) {
    const radius = Math.hypot(this.focus.x, this.focus.y);
    if (radius <= CAMERA.softLimit) {
      return { x: deltaX, y: deltaY };
    }
    const outX = this.focus.x / radius;
    const outY = this.focus.y / radius;
    const outward = deltaX * outX + deltaY * outY;
    if (outward <= 0) {
      return { x: deltaX, y: deltaY };
    }
    const pastSoft = (radius - CAMERA.softLimit) / (CAMERA.hardLimit - CAMERA.softLimit);
    const give = (1 - clamp(pastSoft, 0, 1)) ** 2;
    const held = outward * (give - 1);
    return { x: deltaX + outX * held, y: deltaY + outY * held };
  }

  /** Backstop for a single huge delta; resistance normally gets there first. */
  containFocus() {
    const radius = Math.hypot(this.focus.x, this.focus.y);
    if (radius > CAMERA.hardLimit) {
      const scale = CAMERA.hardLimit / radius;
      this.focus.x *= scale;
      this.focus.y *= scale;
    }
  }

  /** Keep the point grabbed at the start of a zoom under the same pixel. */
  holdZoomAnchor() {
    const now = this.toWorld(this.zoomAnchor.screen);
    this.focus.x += this.zoomAnchor.world.x - now.x;
    this.focus.y += this.zoomAnchor.world.y - now.y;
  }

  settleZoom(ease) {
    let moved = false;
    if (Math.abs(this.targetDistance - this.distance) > 0.05) {
      this.distance += (this.targetDistance - this.distance) * ease;
      moved = true;
    } else {
      this.distance = this.targetDistance;
      this.zoomAnchor = null;
    }
    if (Math.abs(this.targetElevation - this.elevation) > 0.01) {
      this.elevation += (this.targetElevation - this.elevation) * ease;
      moved = true;
    } else {
      this.elevation = this.targetElevation;
    }
    return moved;
  }

  settlePan(seconds) {
    if (this.dragDelta.x !== 0 || this.dragDelta.y !== 0) {
      const move = this.resisted(this.dragDelta.x, this.dragDelta.y);
      this.focus.x += move.x;
      this.focus.y += move.y;
      if (seconds > 0) {
        this.drift.x = move.x / seconds;
        this.drift.y = move.y / seconds;
      }
      this.dragDelta.x = 0;
      this.dragDelta.y = 0;
      return true;
    }
    if (this.dragging) {
      // Held still mid-drag, so there is no throw to carry on release.
      this.drift.x = 0;
      this.drift.y = 0;
      return false;
    }
    if (Math.hypot(this.drift.x, this.drift.y) <= CAMERA.driftCutoff) {
      this.drift.x = 0;
      this.drift.y = 0;
      return false;
    }
    const move = this.resisted(this.drift.x * seconds, this.drift.y * seconds);
    this.focus.x += move.x;
    this.focus.y += move.y;
    const decay = Math.exp(-CAMERA.driftDamping * seconds);
    this.drift.x *= decay;
    this.drift.y *= decay;
    return true;
  }

  /** Advance one frame. Returns whether the view changed. */
  update(seconds) {
    const ease = 1 - Math.exp(-CAMERA.smoothing * seconds);
    const zoomed = this.settleZoom(ease);
    const panned = this.settlePan(seconds);
    if (!zoomed && !panned) {
      return false;
    }
    this.refreshView();
    if (zoomed && this.zoomAnchor) {
      this.holdZoomAnchor();
    }
    this.containFocus();
    this.refreshView();
    return true;
  }
}
