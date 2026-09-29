// Sound effects for game actions, played from the recorded clips in
// sounds/fx rather than synthesized -- one clip is shared by every kind of
// building work but repair, one plays whenever a raider is in contact with
// a wall or the castle, one plays for our own guards trading blows, and one
// marks a wall or the city itself falling.
const EFFECT_FILES = {
  build: 'sounds/fx/building.mp3',
  fortify: 'sounds/fx/building.mp3',
  raze: 'sounds/fx/building.mp3',
  upgrade: 'sounds/fx/building.mp3',
  engaging: 'sounds/fx/engaging.mp3',
  fighting: 'sounds/fx/fighting.mp3',
  destroyed: 'sounds/fx/destroyed.mp3',
};

// Contact and melee fire every frame the raider or guard stays locked in,
// so left unthrottled they would retrigger the clip sixty times a second.
const THROTTLE_MS = { engaging: 150, fighting: 150 };

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

async function loadAudioBuffer(url, context) {
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  return context.decodeAudioData(data);
}

/**
 * Plays the recorded sound effects for game actions. Volume mirrors the
 * HUD's own sound level, scaled again by how close the event's world
 * position is to the camera's own focus (see main.js's own onEffect), and
 * the AudioContext is created lazily on the first effect -- creating one
 * earlier would be silently blocked by the same autoplay policy that blocks
 * music until the page has been clicked.
 */
export class Sfx {
  constructor({
    contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(),
    now = () => performance.now(),
    loadAudio = loadAudioBuffer,
  } = {}) {
    this.contextFactory = contextFactory;
    this.now = now;
    this.loadAudio = loadAudio;
    this.context = null;
    this.volume = 1;
    this.buffers = new Map();
    this.lastPlayedAt = {};
  }

  setVolume(level) {
    this.volume = level;
  }

  /** Null in a headless test, or any environment with no Web Audio API. */
  ensureContext() {
    if (!this.context) {
      try {
        this.context = this.contextFactory();
      } catch (error) {
        return null;
      }
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
    return this.context;
  }

  /**
   * Fetched and decoded once per file, then reused for every later play --
   * several effect names share the one building clip, so this is keyed by
   * URL rather than by name.
   */
  bufferFor(url, context) {
    if (!this.buffers.has(url)) {
      this.buffers.set(url, this.loadAudio(url, context).catch(() => null));
    }
    return this.buffers.get(url);
  }

  /** `proximity` is 0 (inaudible) to 1 (at the camera's own focus point). */
  play(name, proximity = 1) {
    if (this.volume <= 0 || proximity <= 0 || !EFFECT_FILES[name]) {
      return;
    }
    const throttle = THROTTLE_MS[name];
    if (throttle) {
      const at = this.now();
      if (at - (this.lastPlayedAt[name] ?? -Infinity) < throttle) {
        return;
      }
      this.lastPlayedAt[name] = at;
    }
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    const gain = clamp01(this.volume * proximity);
    return this.bufferFor(EFFECT_FILES[name], context).then((buffer) => {
      if (!buffer) {
        return;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const envelope = context.createGain();
      envelope.gain.value = gain;
      source.connect(envelope);
      envelope.connect(context.destination);
      source.start();
    });
  }
}
