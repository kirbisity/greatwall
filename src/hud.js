import { AUDIO_VOLUME_STEP, INITIAL_SOUND_LEVEL, SEASONS } from './config.js';

const SOUND_LEVEL_STEP = 20;
const MAX_SOUND_LEVEL = 100;
const TOAST_DURATION_MS = 5200;

/** Which button lights up for each tool. */
const TOOL_BUTTONS = {
  move: 'move',
  zoom: 'zoom',
  build: 'buildTool',
  destroy: 'destroyTool',
  upgrade: 'upgradeTool',
};

function element(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element: #${id}`);
  }
  return node;
}

/** Owns every DOM node outside the canvases: HUD, overlays, modals, audio. */
export class Hud {
  constructor() {
    this.tokenLabel = element('token0');
    this.timeLabel = element('time0');
    this.seasonLabel = element('season0');
    this.menu = element('myNav');
    this.menuInfo = element('navinfo');
    this.startButton = element('startBtn2');
    this.settings = element('settingMenu');
    this.helpModal = element('helpInfo');
    this.messageModal = element('gameInfo');
    this.messageText = element('infoP');
    this.soundButton = element('soundBtn');
    this.atmosphereButton = element('atmosphereBtn');
    this.routesButton = element('routesBtn');
    this.music = element('backgroundmusic');

    this.soundLevel = INITIAL_SOUND_LEVEL;
    this.shownTokens = null;
    this.shownSeconds = null;
    this.shownSeason = null;
    this.toastTimer = null;

    this.music.loop = true;
    this.music.volume = AUDIO_VOLUME_STEP * this.soundLevel;
    this.messageModal.addEventListener('click', (event) => {
      if (event.target === this.messageModal) {
        this.closeMessage();
      }
    });
  }

  hideLoader() {
    element('loaderbg').style.display = 'none';
    element('loader').style.display = 'none';
  }

  setCursor(cursor) {
    document.body.style.cursor = cursor;
  }

  /** Writes only when the value changed; called every frame. */
  update(game) {
    const tokens = Math.trunc(game.tokens);
    if (tokens !== this.shownTokens) {
      this.shownTokens = tokens;
      this.tokenLabel.innerText = `$${tokens}`;
    }
    if (game.seconds !== this.shownSeconds) {
      this.shownSeconds = game.seconds;
      this.timeLabel.innerText = String(game.seconds);
    }
    if (game.season !== this.shownSeason) {
      this.shownSeason = game.season;
      this.seasonLabel.innerText = SEASONS[game.season % SEASONS.length].name;
    }
  }

  /** Light up the button for the active tool and dim the rest. */
  setActiveTool(tool) {
    for (const [name, id] of Object.entries(TOOL_BUTTONS)) {
      const button = document.getElementById(id);
      if (button) {
        button.classList.toggle('is-active', name === tool && tool !== 'move');
      }
    }
  }

  // --- overlays -----------------------------------------------------------

  openMenu() {
    this.menu.style.height = '100%';
  }

  closeMenu() {
    this.menu.style.height = '0%';
  }

  openSettings() {
    this.settings.style.height = '100%';
  }

  closeSettings() {
    this.settings.style.height = '0%';
  }

  showHelp() {
    this.helpModal.style.display = 'block';
  }

  closeHelp() {
    this.helpModal.style.display = 'none';
  }

  showMessage(text) {
    this.messageText.innerText = text;
    this.messageModal.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.closeMessage(), TOAST_DURATION_MS);
  }

  closeMessage() {
    clearTimeout(this.toastTimer);
    this.messageModal.style.display = 'none';
  }

  showGameOver(score, best) {
    this.startButton.innerText = 'Start';
    this.menuInfo.innerText = `Score: ${score}\nBest: ${best}`;
    this.openMenu();
  }

  markStarted() {
    this.startButton.innerText = 'Continue';
  }

  // --- audio --------------------------------------------------------------

  playMusic() {
    this.music.play().catch((error) => {
      console.warn('Background music blocked until the page is clicked:', error.message);
    });
  }

  setAtmosphereLabel(enabled) {
    this.atmosphereButton.innerText = `Atmosphere: ${enabled ? 'On' : 'Off'}`;
  }

  setRoutesLabel(enabled) {
    this.routesButton.innerText = `Show Routes: ${enabled ? 'On' : 'Off'}`;
  }

  cycleSoundLevel() {
    this.soundLevel = this.soundLevel > 0 ? this.soundLevel - SOUND_LEVEL_STEP : MAX_SOUND_LEVEL;
    this.music.volume = AUDIO_VOLUME_STEP * this.soundLevel;
    this.soundButton.innerText = this.soundLevel === 0 ? 'Sound Off' : `Sound: ${this.soundLevel}`;
  }
}
