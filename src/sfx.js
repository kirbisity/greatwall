// Procedurally synthesized sound effects. No audio asset files exist for
// these actions and none can be sourced as real audio by hand, so every
// effect here is built from oscillators and filtered noise at the moment it
// plays, rather than loaded from a file the way the level music is.

// Clashes fire once per contact per raider per frame, so a raider pressed
// against a wall for seconds at a time would otherwise retrigger the sound
// sixty times a second. This is the minimum gap between two clash sounds.
const CLASH_THROTTLE_MS = 120;

function noiseBuffer(context, seconds) {
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function tone(context, { frequency, duration, type = 'sine', gain = 0.3, sweepTo, delay = 0 }) {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (sweepTo) {
    oscillator.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  }
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function noiseBurst(context, {
  duration, gain = 0.3, filterType = 'lowpass', filterFrequency = 2000, filterQ, filterSweepTo, delay = 0,
}) {
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, duration);
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFrequency, start);
  if (filterQ) {
    filter.Q.setValueAtTime(filterQ, start);
  }
  if (filterSweepTo) {
    filter.frequency.exponentialRampToValueAtTime(filterSweepTo, start + duration);
  }
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(context.destination);
  source.start(start);
  source.stop(start + duration);
}

const EFFECTS = {
  // Mason's mallet on a fresh peg: a low thud with a bright tap right behind it.
  build(context, volume) {
    tone(context, { frequency: 180, sweepTo: 120, duration: 0.09, type: 'triangle', gain: 0.35 * volume });
    tone(context, { frequency: 900, duration: 0.05, type: 'square', gain: 0.12 * volume, delay: 0.03 });
  },
  // The same mallet, lighter and doubled: patching rather than laying stone.
  repair(context, volume) {
    tone(context, { frequency: 500, duration: 0.06, type: 'triangle', gain: 0.2 * volume });
    tone(context, { frequency: 650, duration: 0.06, type: 'triangle', gain: 0.18 * volume, delay: 0.09 });
  },
  // Stone grinding upward into a taller, thicker shape.
  fortify(context, volume) {
    tone(context, { frequency: 90, sweepTo: 220, duration: 0.4, type: 'sawtooth', gain: 0.22 * volume });
    noiseBurst(context, { duration: 0.3, gain: 0.15 * volume, filterFrequency: 800, filterSweepTo: 2200 });
  },
  // A section pulled down deliberately: shorter and lower than a wall dying in battle.
  raze(context, volume) {
    noiseBurst(context, { duration: 0.35, gain: 0.3 * volume, filterFrequency: 1800, filterSweepTo: 200 });
    tone(context, { frequency: 140, sweepTo: 60, duration: 0.3, type: 'sawtooth', gain: 0.2 * volume });
  },
  // A triumphant rising chime for the castle growing into its next tier.
  upgrade(context, volume) {
    tone(context, { frequency: 523.25, duration: 0.15, type: 'sine', gain: 0.25 * volume });
    tone(context, { frequency: 659.25, duration: 0.15, type: 'sine', gain: 0.25 * volume, delay: 0.12 });
    tone(context, { frequency: 783.99, duration: 0.25, type: 'sine', gain: 0.28 * volume, delay: 0.24 });
  },
  // A ragged battle cry from the company as it musters: a few rasping
  // throat tones rising together under a shout-shaped noise formant, rather
  // than a horn call.
  attack(context, volume) {
    tone(context, { frequency: 170, sweepTo: 340, duration: 0.26, type: 'sawtooth', gain: 0.16 * volume });
    tone(context, { frequency: 145, sweepTo: 300, duration: 0.28, type: 'sawtooth', gain: 0.14 * volume, delay: 0.015 });
    tone(context, { frequency: 200, sweepTo: 380, duration: 0.24, type: 'sawtooth', gain: 0.12 * volume, delay: 0.03 });
    noiseBurst(context, {
      duration: 0.3,
      gain: 0.22 * volume,
      filterType: 'bandpass',
      filterFrequency: 700,
      filterSweepTo: 1700,
      filterQ: 3,
    });
  },
  // A quick metallic clang: blade or arrow striking stone or flesh.
  clash(context, volume) {
    noiseBurst(context, { duration: 0.06, gain: 0.2 * volume, filterFrequency: 4000, filterSweepTo: 1200 });
    tone(context, { frequency: 1800, sweepTo: 900, duration: 0.05, type: 'square', gain: 0.08 * volume });
  },
  // A wall falling in battle: bigger and lower than a deliberate raze.
  wallDestroyed(context, volume) {
    noiseBurst(context, { duration: 0.5, gain: 0.35 * volume, filterFrequency: 2500, filterSweepTo: 150 });
    tone(context, { frequency: 80, sweepTo: 35, duration: 0.45, type: 'sawtooth', gain: 0.3 * volume });
  },
};

/**
 * Plays short procedural sound effects for game actions. Volume mirrors the
 * HUD's own sound level rather than owning a separate mute control, and the
 * AudioContext is created lazily on the first effect -- creating one earlier
 * would be silently blocked by the same autoplay policy that blocks music
 * until the page has been clicked.
 */
export class Sfx {
  constructor({
    contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(),
    now = () => performance.now(),
  } = {}) {
    this.contextFactory = contextFactory;
    this.now = now;
    this.context = null;
    this.volume = 1;
    this.lastClashAt = -Infinity;
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

  play(name) {
    if (this.volume <= 0 || !EFFECTS[name]) {
      return;
    }
    if (name === 'clash') {
      const at = this.now();
      if (at - this.lastClashAt < CLASH_THROTTLE_MS) {
        return;
      }
      this.lastClashAt = at;
    }
    const context = this.ensureContext();
    if (context) {
      EFFECTS[name](context, this.volume);
    }
  }
}
