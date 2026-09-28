import {
  CLOUD_ENGULF_WIDTH,
  CLOUD_FADE_HEIGHT,
  CLOUD_FIELD,
  CLOUD_LAYERS,
  CLOUD_SPRITE,
  FOG,
  SEASONS,
  SNOW_COUNT,
  SNOW_DRIFT,
  SNOW_MAX_FALL,
  SNOW_MAX_SIZE,
  SNOW_MIN_FALL,
  SNOW_MIN_SIZE,
} from './config.js';
import { groundAt, projectPoint } from './projection.js';
import { mixChannels, seasonBlend } from './season.js';

/** Positive remainder, so wrapping works for negative offsets too. */
function wrap(value, span) {
  return ((value % span) + span) % span;
}

const MAX_CLOUD_BOOST = Math.max(...SEASONS.map((season) => season.cloudBoost));

/**
 * Distance haze and drifting cloud decks.
 *
 * The fog is one screen-space gradient fill. The clouds are world objects at
 * altitude, projected through the same camera as everything else, so they
 * slide past faster than the ground on a pan and swell faster on a zoom
 * without any of that being faked. Each is still a single drawImage, so the
 * whole effect costs the same no matter how much is on the map.
 */
export class Atmosphere {
  constructor(camera, { random = Math.random, now = () => performance.now() } = {}) {
    this.camera = camera;
    // Drift runs on the wall clock, not on game ticks, so the sky keeps moving
    // while the game is paused and needs no per-frame bookkeeping.
    this.now = now;
    this.startedAt = now();
    this.sprite = new Image();
    this.sprite.src = CLOUD_SPRITE;
    const makeCloud = (layer) => ({
      layer,
      x: random(),
      y: random(),
      scale: 0.7 + random() * 0.6,
      fade: 0.75 + random() * 0.5,
    });
    this.clouds = CLOUD_LAYERS.flatMap((layer, index) => {
      const core = Array.from({ length: layer.count }, () => makeCloud(index));
      // A deck's own count is what shows the rest of the year; a handful
      // more stand ready and reveal themselves one at a time as cloudBoost
      // rises towards winter, each at its own point in that climb, so the
      // sky gains clouds gradually rather than all at once.
      const extra = Array.from({ length: layer.winterExtra ?? 0 }, (_, i) => ({
        ...makeCloud(index),
        revealsAt: 1 + (MAX_CLOUD_BOOST - 1) * ((i + 1) / (layer.winterExtra + 1)),
      }));
      return [...core, ...extra];
    });
    // Screen-space and re-seeded once, not per level: winter looks the same
    // over a desert as over the mainland, the way the sky's haze already
    // does.
    this.snowflakes = Array.from({ length: SNOW_COUNT }, () => ({
      x: random(),
      y: random(),
      size: SNOW_MIN_SIZE + random() * (SNOW_MAX_SIZE - SNOW_MIN_SIZE),
      fall: SNOW_MIN_FALL + random() * (SNOW_MAX_FALL - SNOW_MIN_FALL),
      driftPhase: random() * Math.PI * 2,
      driftRate: 0.3 + random() * 0.4,
      alpha: 0.4 + random() * 0.5,
    }));
  }

  /** Seconds of sky time elapsed. */
  get drift() {
    return (this.now() - this.startedAt) / 1000;
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

  /**
   * `mist` is a level's standing haze, if it has one (see levels.js).
   * `seasonPhase` blends the haze's colour and density across the year --
   * see seasonBlend. Fog also thickens with the camera's own height, so
   * pulling back and tilting up into a higher view reads as more atmosphere
   * between the eye and the ground, the way real haze does.
   */
  drawFog(context, seasonPhase, mist = null) {
    const { width, height } = this.camera;
    const season = seasonBlend(seasonPhase);
    // A level's own mist pulls the season's haze towards its colour and
    // thickens it, rather than replacing it -- winter is still the densest
    // month of a dusty year.
    const haze = mist ? mixChannels(season.haze, mist.color, mist.blend) : season.haze;
    const hazeDensity = season.hazeDensity * (mist ? mist.density : 1);
    // Where the haze starts matters more than how thick it is allowed to
    // get: the far band is already near FOG.maxOpacity, so thickening alone
    // has nowhere to go. Bringing the start in is what puts dust across the
    // middle distance too.
    const startDistance = FOG.startDistance * (mist ? mist.start : 1);
    const altitude = 1 + this.camera.view.position.z * FOG.altitudeFactor;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    for (let step = 0; step <= FOG.samples; step += 1) {
      const offset = step / FOG.samples;
      const distance = this.groundDistanceAt(offset * height);
      const beyond = Math.max(0, distance - startDistance);
      const density = 1 - Math.exp(-beyond * FOG.falloff);
      const alpha = Math.min(FOG.maxOpacity, density * FOG.maxAlpha * hazeDensity * altitude);
      gradient.addColorStop(offset, `rgba(${haze},${alpha.toFixed(3)})`);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  /**
   * Where each cloud currently sits on screen. Decks above the camera, and
   * those outside the viewport, are dropped here rather than drawn.
   *
   * `mist` is a level's own standing weather, if it has one (see levels.js):
   * `windSpeed` multiplies how fast the whole sky drifts, so a sandstorm's
   * cloud can race past overhead while an ordinary sky drifts at its own
   * pace, without either level's clouds needing a count or size of their
   * own.
   */
  placeClouds(seasonPhase = 0, mist = null) {
    if (!this.sprite.width) {
      return [];
    }
    const view = this.camera.view;
    const { width, height } = this.camera;
    const aspect = this.sprite.height / this.sprite.width;
    const focus = this.camera.focus;
    const drift = this.drift * (mist?.windSpeed ?? 1);
    const cameraHeight = view.position.z;
    const half = CLOUD_FIELD / 2;
    const { cloudBoost } = seasonBlend(seasonPhase);
    const placed = [];

    for (const cloud of this.clouds) {
      if (cloud.revealsAt !== undefined && cloud.revealsAt > cloudBoost) {
        continue;
      }
      const layer = CLOUD_LAYERS[cloud.layer];
      const headroom = cameraHeight - layer.altitude;
      if (headroom <= 0) {
        continue;
      }

      // Tile the deck around wherever the view is, so it never runs out.
      const worldX = focus.x
        + wrap(cloud.x * CLOUD_FIELD + drift * layer.drift - focus.x + half, CLOUD_FIELD) - half;
      const worldY = focus.y
        + wrap(cloud.y * CLOUD_FIELD - focus.y + half, CLOUD_FIELD) - half;

      const screen = projectPoint(view, worldX, worldY, layer.altitude);
      if (!screen) {
        continue;
      }
      const cloudWidth = layer.worldSize * cloud.scale * view.focal / screen.depth;
      const cloudHeight = cloudWidth * aspect;
      if (screen.x < -cloudWidth || screen.x > width + cloudWidth
        || screen.y < -cloudHeight || screen.y > height + cloudHeight) {
        continue;
      }

      // Thin the deck out as the camera drops towards it, so flying through
      // one is a fade rather than a cloud blinking away. A cloud that has
      // swollen to fill the view is one the camera is practically inside.
      const closing = Math.min(1, headroom / CLOUD_FADE_HEIGHT)
        * Math.min(1, width * CLOUD_ENGULF_WIDTH / cloudWidth);
      placed.push({
        cloud,
        world: { x: worldX, y: worldY, z: layer.altitude },
        screen,
        width: cloudWidth,
        height: cloudHeight,
        alpha: layer.opacity * cloud.fade * closing,
      });
    }
    return placed;
  }

  /**
   * A wash of the season's own colour over the whole view -- summer's
   * orange heat, and nothing at all the rest of the year. One fill, laid
   * over the haze and cloud so it colours them too.
   */
  drawTint(context, seasonPhase) {
    const { tint, tintStrength } = seasonBlend(seasonPhase);
    if (tintStrength <= 0) {
      return;
    }
    context.fillStyle = `rgba(${tint},${tintStrength.toFixed(3)})`;
    context.fillRect(0, 0, this.camera.width, this.camera.height);
  }

  drawClouds(context, seasonPhase = 0, mist = null) {
    for (const placed of this.placeClouds(seasonPhase, mist)) {
      context.globalAlpha = placed.alpha;
      context.drawImage(this.sprite,
        placed.screen.x - placed.width / 2, placed.screen.y - placed.height / 2,
        placed.width, placed.height);
    }
    context.globalAlpha = 1;
  }

  /**
   * Where each flake currently sits on screen, falling and looping back to
   * the top rather than being replaced -- cheap enough that winter's flakes
   * and summer's cloudless sky cost the same to hold in memory, and empty
   * outside winter's own reach costs nothing at all to draw.
   */
  placeSnow(seasonPhase = 0) {
    const { cloudBoost } = seasonBlend(seasonPhase);
    const snowfall = Math.max(0, (cloudBoost - 1) / (MAX_CLOUD_BOOST - 1));
    if (snowfall <= 0) {
      return [];
    }
    const { width, height } = this.camera;
    const drift = this.drift;
    const placed = [];
    for (const flake of this.snowflakes) {
      const y = wrap(flake.y * height + drift * flake.fall, height);
      const sway = Math.sin(drift * flake.driftRate + flake.driftPhase) * SNOW_DRIFT;
      const x = wrap(flake.x * width + sway, width);
      placed.push({ x, y, size: flake.size, alpha: flake.alpha * snowfall });
    }
    return placed;
  }

  drawSnow(context, seasonPhase = 0) {
    for (const flake of this.placeSnow(seasonPhase)) {
      context.globalAlpha = flake.alpha;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}
