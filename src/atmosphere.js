import { CLOUD_LAYERS, CLOUD_SPRITE, FOG, SEASONS } from './config.js';
import { groundAt } from './projection.js';

/** Positive remainder, so wrapping works for negative offsets too. */
function wrap(value, span) {
  return ((value % span) + span) % span;
}

/**
 * Distance haze and drifting cloud layers. Both are screen-space passes drawn
 * over the finished scene: the fog is one gradient fill and each cloud is one
 * drawImage, so the whole effect is a fixed cost per frame regardless of how
 * much is on the map.
 */
export class Atmosphere {
  constructor(camera, random = Math.random) {
    this.camera = camera;
    this.drift = 0;
    this.sprite = new Image();
    this.sprite.src = CLOUD_SPRITE;
    this.clouds = CLOUD_LAYERS.flatMap((layer, index) => (
      Array.from({ length: layer.count }, () => ({
        layer: index,
        x: random(),
        y: random(),
        scale: 0.7 + random() * 0.6,
        fade: 0.75 + random() * 0.5,
      }))
    ));
  }

  /** Advance the drift by one frame's worth of seconds. */
  update(seconds) {
    this.drift += seconds;
  }

  /**
   * Ground distance from the camera at a screen row, used to turn depth into
   * haze. Clamped because rows near the horizon run away towards infinity.
   */
  groundDistanceAt(screenY) {
    const view = this.camera.view;
    const ground = groundAt(view, this.camera.width / 2, screenY);
    const distance = Math.hypot(
      ground.x - view.position.x,
      ground.y - view.position.y,
      view.position.z,
    );
    return Number.isFinite(distance) ? distance : Number.MAX_SAFE_INTEGER;
  }

  drawFog(context, season) {
    const { width, height } = this.camera;
    const haze = SEASONS[season % SEASONS.length].haze;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    for (let step = 0; step <= FOG.samples; step += 1) {
      const offset = step / FOG.samples;
      const distance = this.groundDistanceAt(offset * height);
      const beyond = Math.max(0, distance - FOG.startDistance);
      const density = 1 - Math.exp(-beyond * FOG.falloff);
      gradient.addColorStop(offset, `rgba(${haze},${(density * FOG.maxAlpha).toFixed(3)})`);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  drawClouds(context) {
    if (!this.sprite.width) {
      return;
    }
    const { width, height } = this.camera;
    const aspect = this.sprite.height / this.sprite.width;
    const focus = this.camera.focus;

    for (const cloud of this.clouds) {
      const layer = CLOUD_LAYERS[cloud.layer];
      const cloudWidth = layer.size * cloud.scale;
      const cloudHeight = cloudWidth * aspect;
      const spanX = width + cloudWidth * 2;
      const spanY = height + cloudHeight * 2;

      const shiftX = this.drift * layer.drift - focus.x * layer.parallax;
      const shiftY = focus.y * layer.parallax;
      const x = wrap(cloud.x * spanX + shiftX, spanX) - cloudWidth;
      const y = wrap(cloud.y * spanY + shiftY, spanY) - cloudHeight;

      context.globalAlpha = layer.opacity * cloud.fade;
      context.drawImage(this.sprite, x, y, cloudWidth, cloudHeight);
    }
    context.globalAlpha = 1;
  }
}
