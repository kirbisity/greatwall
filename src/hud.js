import { AUDIO_VOLUME_STEP, INITIAL_SOUND_LEVEL, SEASONS } from './config.js';
import { paintLevelThumbnail } from './levelThumbnail.js';
import { Sfx } from './sfx.js';

const SOUND_LEVEL_STEP = 20;
const MAX_SOUND_LEVEL = 100;
// The hint toast carries no close button -- it is meant to be glanced at,
// not read, so it clears itself almost immediately.
const TOAST_DURATION_MS = 900;
// Long enough to read the longest of the level stories at a relaxed pace,
// on top of the fade-in (see greatwall.css's own .storyBanner) it takes to
// appear -- but any game action (see main.js's own onEffect) clears it early.
const STORY_DURATION_MS = 15000;

/** Which button lights up for each tool. */
const TOOL_BUTTONS = {
  move: 'move',
  zoom: 'zoom',
  build: 'buildTool',
  destroy: 'destroyTool',
  repair: 'repairTool',
  fortify: 'fortifyTool',
  upgrade: 'upgradeTool',
  attack: 'attackTool',
};

/**
 * How far to shift a box so it sits inside the view: clear of the screen's
 * edges by `margin`, and below the top bar rather than under it.
 *
 * The start edge wins where the box is too wide to fit, since that is where
 * the first option sits. Measured on a phone before this existed, the tier
 * picker ran 110px off the left edge whenever the castle was near it, and
 * the cheapest company could not be picked at all.
 */
export function clampIntoView(box, view, margin) {
  let dx = 0;
  if (box.right > view.width - margin) {
    dx = view.width - margin - box.right;
  }
  if (box.left + dx < margin) {
    dx = margin - box.left;
  }
  const dy = box.top < view.top + margin ? view.top + margin - box.top : 0;
  return { dx, dy };
}

// How far the tier picker keeps from the edges of the screen.
const MENU_MARGIN = 8;

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
    this.incomeLabel = element('income0');
    this.incomeFormula = element('incomeFormula0');
    this.timeLabel = element('time0');
    this.seasonLabel = element('season0');
    this.menu = element('myNav');
    this.menuInfo = element('navinfo');
    this.startButton = element('startBtn2');
    this.levelList = element('levelList');
    this.settings = element('settingMenu');
    this.helpModal = element('helpInfo');
    this.messageModal = element('gameInfo');
    this.messageText = element('infoP');
    this.storyBanner = element('storyBanner');
    this.storyText = element('storyText');
    this.soundButton = element('soundBtn');
    this.atmosphereButton = element('atmosphereBtn');
    this.routesButton = element('routesBtn');
    this.music = element('backgroundmusic');
    this.dispatchMenu = element('dispatchMenu');
    this.dispatchButtons = [
      element('dispatchOption0'),
      element('dispatchOption1'),
      element('dispatchOption2'),
    ];

    this.sfx = new Sfx();
    this.soundLevel = INITIAL_SOUND_LEVEL;
    this.sfx.setVolume(this.soundLevel / MAX_SOUND_LEVEL);
    this.shownTokens = null;
    this.shownIncome = null;
    this.shownIncomeFormula = null;
    this.shownSeconds = null;
    this.shownSeason = null;
    this.toastTimer = null;
    this.storyTimer = null;

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
    const breakdown = game.incomeBreakdown;
    const income = Math.trunc(breakdown.total * game.harvestMultiplier);
    if (income !== this.shownIncome) {
      this.shownIncome = income;
      this.incomeLabel.innerText = `$${income}`;
    }
    // Upkeep counts units, not sections: a fortified wall is worth several.
    const formula = `${breakdown.cityIncome} + ${breakdown.housePerHouse}×${breakdown.houseCount}`
      + ` - ${breakdown.upkeepPerWall}×${breakdown.upkeepUnits}`;
    if (formula !== this.shownIncomeFormula) {
      this.shownIncomeFormula = formula;
      this.incomeFormula.innerText = formula;
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

  /**
   * The single choke point for landing back on the menu -- a deliberate
   * Menu click, and Game Over's own call to it (see showGameOver) both
   * come through here, so leaving the level -- its music, its own opening
   * line if it is still up -- is handled once here rather than at each
   * call site, where a future one could forget it.
   */
  openMenu() {
    this.menu.style.height = '100%';
    this.stopMusic();
    this.closeStory();
  }

  closeMenu() {
    this.menu.style.height = '0%';
  }

  /**
   * The level picker in the main menu, built from the level configs rather
   * than the markup, so adding a level stays a matter of levels.js alone.
   */
  showLevels(levels, chosen, onPick) {
    if (!this.levelList) {
      return;
    }
    this.levelList.replaceChildren();
    levels.forEach((level, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === chosen ? 'levelItem is-chosen' : 'levelItem';

      // A pixelated preview of the level's own ground, not a generic icon --
      // see levelThumbnail.js.
      const thumb = document.createElement('canvas');
      thumb.className = 'levelThumb';
      paintLevelThumbnail(thumb, level);

      const text = document.createElement('span');
      text.className = 'levelText';
      const name = document.createElement('span');
      name.className = 'levelName';
      name.innerText = `${index + 1}. ${level.name}`;
      const blurb = document.createElement('span');
      blurb.className = 'levelBlurb';
      blurb.innerText = level.blurb;
      text.append(name, blurb);

      button.append(thumb, text);
      button.addEventListener('click', () => onPick(index));
      this.levelList.append(button);
    });
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

  /**
   * A level's own opening line -- see LEVELS' own `story` field. Left in
   * the DOM throughout rather than toggled with display, so the opacity
   * change it starts is a transition (see greatwall.css's own
   * .storyBanner) rather than a cut.
   */
  showStory(text) {
    if (!text) {
      return;
    }
    this.storyText.innerText = text;
    this.storyBanner.classList.toggle('is-shown', true);
    clearTimeout(this.storyTimer);
    this.storyTimer = setTimeout(() => this.closeStory(), STORY_DURATION_MS);
  }

  closeStory() {
    clearTimeout(this.storyTimer);
    this.storyBanner.classList.toggle('is-shown', false);
  }

  /**
   * The tier picker, pinned above the castle. Each button carries its own
   * click handler and stops the event there, or it would also bubble up to
   * the map's click listener and dispatch a company to wherever the button
   * happened to be drawn.
   */
  showDispatchMenu(options, screen, onPick) {
    this.dispatchMenu.style.display = 'flex';
    this.dispatchButtons.forEach((button, index) => {
      const option = options[index];
      if (!option) {
        button.style.display = 'none';
        button.onclick = null;
        return;
      }
      button.style.display = 'flex';
      button.innerText = `${option.name}\n$${option.cost} · ${option.maxHealth}hp`;
      button.onclick = (event) => {
        event.stopPropagation();
        onPick(option.id);
      };
    });
    // Placed once its buttons are filled in, so its size is known and it can
    // be kept on the screen.
    this.placeOnScreen(this.dispatchMenu, screen);
  }

  /** Put an element at a screen point, then slide it back inside the view. */
  placeOnScreen(node, screen) {
    node.style.left = `${Math.round(screen.x)}px`;
    node.style.top = `${Math.round(screen.y)}px`;
    if (typeof node.getBoundingClientRect !== 'function') {
      return;
    }
    const topBar = document.getElementById('topMenu');
    const view = {
      width: window.innerWidth,
      height: window.innerHeight,
      top: topBar?.getBoundingClientRect ? topBar.getBoundingClientRect().bottom : 0,
    };
    const { dx, dy } = clampIntoView(node.getBoundingClientRect(), view, MENU_MARGIN);
    node.style.left = `${Math.round(screen.x + dx)}px`;
    node.style.top = `${Math.round(screen.y + dy)}px`;
  }

  hideDispatchMenu() {
    this.dispatchMenu.style.display = 'none';
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

  /**
   * Swap in a level's own track and start it from the top -- called on
   * every entry into a level (a fresh start or a restart), never left to
   * an opt-in button, so music is on by default rather than something a
   * player has to go find in Settings.
   */
  playLevelMusic(src) {
    if (!src) {
      this.stopMusic();
      return;
    }
    this.music.src = src;
    this.music.currentTime = 0;
    this.playMusic();
  }

  /** Leaves the level: the music leaves with it. */
  stopMusic() {
    this.music.pause();
    this.music.currentTime = 0;
  }

  playMusic() {
    this.music.play().catch((error) => {
      console.warn('Music blocked until the page is clicked:', error.message);
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
    this.sfx.setVolume(this.soundLevel / MAX_SOUND_LEVEL);
    this.soundButton.innerText = this.soundLevel === 0 ? 'Sound Off' : `Sound: ${this.soundLevel}`;
  }

  /**
   * Sound effects for game actions -- see sfx.js for the clips and main.js's
   * own onEffect for how `proximity` (0 to 1) is worked out from the event's
   * world position.
   */
  playEffect(name, proximity) {
    this.sfx.play(name, proximity);
  }
}
