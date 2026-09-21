import { clamp } from './geometry.js';
import { INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, PIXELS_PER_WORLD_UNIT } from './config.js';

/** Maps between world coordinates (y up) and canvas pixels (y down). */
export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.scale = INITIAL_ZOOM;
    this.offsetX = width * 0.5;
    this.offsetY = height * 0.5;
  }

  get pixelsPerUnit() {
    return this.scale * PIXELS_PER_WORLD_UNIT;
  }

  toScreen(point) {
    const pixelsPerUnit = this.pixelsPerUnit;
    return {
      x: Math.trunc(pixelsPerUnit * point.x + this.offsetX),
      y: Math.trunc(this.height - pixelsPerUnit * point.y - this.offsetY),
    };
  }

  toWorld(point) {
    const pixelsPerUnit = this.pixelsPerUnit;
    return {
      x: (point.x - this.offsetX) / pixelsPerUnit,
      y: -(point.y + this.offsetY - this.height) / pixelsPerUnit,
    };
  }

  pan(deltaX, deltaY) {
    this.offsetX += deltaX;
    this.offsetY -= deltaY;
  }

  /** Zoom by `factor`, keeping the world point under `anchor` in place. */
  zoomAt(anchor, factor) {
    const worldAnchor = this.toWorld(anchor);
    this.scale = clamp(this.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const shifted = this.toScreen(worldAnchor);
    this.offsetX += anchor.x - shifted.x;
    this.offsetY -= anchor.y - shifted.y;
  }

  centerOn(point) {
    this.offsetX = this.width * 0.5 - point.x * PIXELS_PER_WORLD_UNIT;
    this.offsetY = this.height * 0.5 - point.y * PIXELS_PER_WORLD_UNIT;
  }

  resize(width, height) {
    this.offsetX += (width - this.width) * 0.5;
    this.offsetY += (height - this.height) * 0.5;
    this.width = width;
    this.height = height;
  }
}
