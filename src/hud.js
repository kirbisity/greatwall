import {
  AUDIO_VOLUME_STEP, AVATARS, BATTLE, BATTLE_MAPS, FACTIONS, INITIAL_SOUND_LEVEL, SEASONS, UNIT_TYPES,
} from './config.js';
import { paintLevelThumbnail } from './levelThumbnail.js';
import { iconSource } from './menuIcons.js';
import { unitSize } from './units.js';
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
// How long into a level before the threat markers appear at all -- the
// player's own first few seconds to get their bearings, not another thing
// competing with the story banner for their eye right at the start.
const THREAT_DELAY_MS = 5000;
// A beat solid before the threat markers start fading, then the fade itself
// (see greatwall.css's own .threatMarker) -- a flash, not a fixture.
const THREAT_HOLD_MS = 400;
const THREAT_FADE_MS = 700;
// Long enough to act on, short enough to get out of the way on its own if
// the player does not -- see Input's own selectTool/openDispatchMenu.
const ACTION_HINT_DURATION_MS = 5000;

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

/**
 * Companies destroyed and lost, then the finer-grained count of individual
 * soldiers lost on each side -- see Game#trackBattleLosses for how that is
 * worked out, and Hud#renderBattleBreakdown for the same figure broken down
 * by which type it came from. K/D is over soldiers, not companies: a company
 * ground to a sliver counts for most of its troops.
 */
export function formatBattleStats(stats) {
  const kd = stats.playerLoss === 0
    ? (stats.enemyLoss > 0 ? '∞' : '0.00')
    : (stats.enemyLoss / stats.playerLoss).toFixed(2);
  const outOf = (fielded) => (fielded > 0 ? ` of ${fielded}` : '');
  return `Enemy companies destroyed ${stats.kills} · Your companies lost ${stats.deaths}\n`
    + `Enemy soldiers lost: ${Math.round(stats.enemyLoss)}${outOf(stats.enemyFielded)}\n`
    + `Your soldiers lost: ${Math.round(stats.playerLoss)}${outOf(stats.playerFielded)}\n`
    + `K/D ${kd}`;
}

/** The setup page's steps, and which one each of its four sections (map, size, player, enemy) sits on. */
const SETUP_STEPS = ['The ground', 'Your army', 'The enemy'];
const SETUP_STEP_OF_SECTION = [0, 1, 1, 2];

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
    this.levelsView = element('levelsView');
    this.specialList = element('specialList');
    this.levelsButton = element('levelsBtn');
    this.restartButton = element('restartBtn');
    this.battleSetupPage = element('battleSetupPage');
    this.battleSetupStory = element('battleSetupStory');
    this.battleSetupBody = element('battleSetupBody');
    this.battleSetupSteps = element('battleSetupSteps');
    this.battleSetupNext = element('battleSetupStart');
    this.battleSetupBack = element('battleSetupBack');
    this.setupStep = 0;
    this.helpPage = 0;
    this.helpPrevButton = element('helpPrev');
    this.helpNextButton = element('helpNext');
    this.helpPageLabel = element('helpPageLabel');
    this.settings = element('settingMenu');
    this.helpModal = element('helpInfo');
    this.messageModal = element('gameInfo');
    this.messageText = element('infoP');
    this.storyBanner = element('storyBanner');
    this.storyText = element('storyText');
    this.threatLayer = element('threatMarkers');
    this.actionHint = element('actionHint');
    this.actionHintText = element('actionHintText');
    this.soundButton = element('soundBtn');
    this.atmosphereButton = element('atmosphereBtn');
    this.routesButton = element('routesBtn');
    this.gameSpeedButton = element('gameSpeedBtn');
    this.debugButtons = {
      infiniteMoney: element('debugMoneyBtn'),
      invulnerable: element('debugInvulnerableBtn'),
      spawnRaiders: element('debugSpawnsBtn'),
      raiderSpeed: element('debugSpeedBtn'),
    };
    this.music = element('backgroundmusic');
    this.buildToolButton = element('buildTool');
    this.attackToolButton = element('attackTool');
    this.upgradeToolButton = element('upgradeTool');
    this.dispatchMenu = element('dispatchMenu');
    this.holdToggle = element('holdToggle');
    this.shownHoldLabel = null;
    this.dispatchButtons = [
      element('dispatchOption0'),
      element('dispatchOption1'),
      element('dispatchOption2'),
    ];
    // The open battleground mode's own dock: a roster of companies to place,
    // a budget readout, and the button that closes placement and starts the
    // fight -- see showBattlePrep/hideBattlePrep.
    this.battleDock = element('battleDock');
    this.battleBudgetReadout = element('battleBudgetReadout');
    this.battleBudgetValue = element('battleBudgetValue');
    this.startBattleButton = element('startBattleBtn');
    // Every tool that means nothing without a castle, plus Attack: the open
    // battleground mode has nothing to muster once the fight starts, so
    // commanding a company is just how tapping the field always behaves
    // there -- see Input#handleClick. No button to pick that behaviour, so
    // none needed to show it is on.
    // The top bar's undo and help buttons have nothing to offer a battle: the
    // field is set out with a tap, and its one hint sits over the dock.
    this.siegeOnlyViewToolIds = ['undo', 'help'];
    this.siegeOnlyToolIds = ['upgradeTool', 'fortifyTool', 'repairTool', 'destroyTool', 'attackTool'];
    this.battleResultModal = element('battleResult');
    this.battleResultTitle = element('battleResultTitle');
    this.battleResultSummary = element('battleResultSummary');
    this.battleResultBreakdown = element('battleResultBreakdown');

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
    this.threatDelayTimer = null;
    this.threatTimer = null;
    this.threatFadeTimer = null;
    this.actionHintTimer = null;

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
    let formula = `${breakdown.cityIncome} + ${breakdown.housePerHouse}×${breakdown.houseCount}`;
    if (breakdown.corruption < 1) {
      formula = `(${formula}) ×${breakdown.corruption.toFixed(2)}`;
    }
    formula += ` - ${breakdown.upkeepPerWall}×${breakdown.upkeepUnits}`;
    if (breakdown.guardUpkeep > 0) {
      formula += ` - ${breakdown.guardUpkeep}`;
    }
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
    if (game.mode === 'battle') {
      // Nothing here costs coin, so nothing here greys out for want of it.
      this.buildToolButton.classList.remove('is-disabled');
      this.attackToolButton.classList.remove('is-disabled');
    } else {
      // Greyed rather than hidden or blocked: a poor treasury is a reason to
      // wait, not a reason the tool should stop working the moment it can.
      this.buildToolButton.classList.toggle('is-disabled', !game.canAffordToBuild);
      this.attackToolButton.classList.toggle('is-disabled', !game.canAffordToAttack);
      this.upgradeToolButton.classList.toggle('is-disabled', !game.canAffordToUpgrade);
    }
    this.applyMode(game);
  }

  /**
   * The open battleground mode swaps out a good part of the chrome: no
   * treasury or income or season to show, no upgrade/fortify/repair/raze
   * tools (there is no castle and no stone to work), and no Attack tool
   * either -- once the fight starts there is nothing left to muster, so
   * commanding a placed company is just how tapping the field behaves the
   * whole time, with no button needed to turn that on (see Input#handleClick).
   * The Build tool -- earthworks here, not stone -- only makes sense before
   * that, during placement.
   */
  applyMode(game) {
    const isBattle = game.mode === 'battle';
    document.body?.classList?.toggle('is-battleMode', isBattle);
    for (const id of [...this.siegeOnlyToolIds, ...this.siegeOnlyViewToolIds]) {
      const button = document.getElementById(id);
      if (button) {
        button.style.display = isBattle ? 'none' : '';
      }
    }
    this.buildToolButton.style.display = (isBattle && game.started) ? 'none' : '';
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
    this.showMenuView('home');
    this.stopMusic();
    this.closeStory();
    this.clearThreats();
    this.clearActionHint();
  }

  closeMenu() {
    this.menu.style.height = '0%';
  }

  /** The main menu is two levels deep: 'home' (play, settings...) and 'levels' (the picker). */
  showMenuView(view) {
    this.menu.dataset.view = view;
  }

  /**
   * The level picker in the main menu, built from the level configs rather
   * than the markup, so adding a level stays a matter of levels.js alone.
   * The numbered campaign goes in one list; a level with its own mode (the
   * open battleground) sits apart under Special, unnumbered.
   */
  showLevels(levels, chosen, onPick, sidesOf) {
    this.levelList.replaceChildren();
    this.specialList.replaceChildren();
    let campaignNumber = 0;
    levels.forEach((level, index) => {
      const isSpecial = level.mode === 'battle';
      const label = isSpecial ? level.name : `${++campaignNumber}. ${level.name}`;
      const button = this.levelCard(level, label, index === chosen, sidesOf(level));
      button.addEventListener('click', () => onPick(index));
      (isSpecial ? this.specialList : this.levelList).append(button);
    });
    this.levelsView.classList.toggle('has-special', this.specialList.children.length > 0);
  }

  levelCard(level, label, isChosen, sides) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isChosen ? 'levelItem is-chosen' : 'levelItem';

    // A pixelated preview of the level's own ground, not a generic icon --
    // see levelThumbnail.js.
    const thumb = document.createElement('canvas');
    thumb.className = 'levelThumb';
    paintLevelThumbnail(thumb, level);

    const text = document.createElement('span');
    text.className = 'levelText';
    const name = document.createElement('span');
    name.className = 'levelName';
    name.innerText = label;
    const blurb = document.createElement('span');
    blurb.className = 'levelBlurb';
    blurb.innerText = level.blurb;
    text.append(name, blurb, this.matchup(sides));

    button.append(thumb, text);
    return button;
  }

  /**
   * The two armies of a level, one to a line: a portrait, its name and
   * what it does there. `sides.labels` names the two roles (defender
   * first) where the defaults do not fit.
   */
  matchup(sides) {
    const [defenderLabel, attackerLabel] = sides.labels ?? ['Defends', 'Attacks'];
    const row = document.createElement('span');
    row.className = 'levelMatchup';
    const side = (factionId, role) => {
      const faction = FACTIONS[factionId];
      const portrait = document.createElement('img');
      portrait.className = 'levelSideAvatar';
      portrait.alt = '';
      portrait.src = faction.avatar;
      const label = document.createElement('span');
      label.className = 'levelSideName';
      label.innerText = faction.name;
      const roleTag = document.createElement('span');
      roleTag.className = 'levelSideRole';
      roleTag.innerText = role;
      const holder = document.createElement('span');
      holder.className = 'levelSide';
      holder.append(portrait, label, roleTag);
      return holder;
    };
    row.append(side(sides.defender, defenderLabel), side(sides.attacker, attackerLabel));
    return row;
  }

  /**
   * The open battleground's own page: the level's story, then a card to
   * pick for the map and for each side's army. `choice` is `{ factions,
   * map }` as currently chosen and `onPick(kind, id)` is told about every
   * change, kind being 'map', 'player' or 'enemy'; this only redraws what
   * it is handed back.
   */
  showBattleSetup(level, choice, onPick) {
    this.battleSetupStory.innerText = level.story ?? '';
    this.battleSetupBody.replaceChildren();
    const sections = [
      this.buildSetupSection(
        'setupSection-map', 'The ground', this.buildMapCards(level, choice.map, onPick), this.mapCaption(choice.map),
      ),
      this.buildSetupSection('setupSection-budget', 'Army size', this.buildBudgetSlider(choice.budget, onPick)),
      this.buildSetupSection(
        'setupSection-player', 'Your army', this.buildFactionCards('player', choice.factions.player, onPick),
        this.buildRosterStrip(choice.factions.player),
      ),
      this.buildSetupSection(
        'setupSection-enemy', 'The enemy', this.buildFactionCards('enemy', choice.factions.enemy, onPick),
        this.buildRosterStrip(choice.factions.enemy),
      ),
    ];
    // Each step shows only its own sections, so nothing on the page ever
    // needs scrolling: the ground; then the player's army and its size;
    // then the enemy's.
    sections.forEach((section, index) => {
      section.dataset.step = String(SETUP_STEP_OF_SECTION[index]);
    });
    this.battleSetupBody.append(...sections);
    this.buildSetupSteps();
    this.applySetupStep();
  }

  buildSetupSteps() {
    this.battleSetupSteps.replaceChildren();
    SETUP_STEPS.forEach((title, index) => {
      const step = document.createElement('button');
      step.type = 'button';
      step.className = 'setupStep';
      step.dataset.step = String(index);
      step.innerText = `${index + 1} \u00b7 ${title}`;
      step.addEventListener('click', () => {
        this.setupStep = index;
        this.applySetupStep();
      });
      this.battleSetupSteps.append(step);
    });
  }

  applySetupStep() {
    const last = SETUP_STEPS.length - 1;
    const step = String(this.setupStep);
    this.battleSetupPage.dataset.step = step;
    this.battleSetupBody.dataset.step = step;
    this.battleSetupNext.innerText = this.setupStep === last ? 'Start Battle' : 'Next';
    this.battleSetupBack.innerText = this.setupStep === 0 ? 'Menu' : 'Back';
    for (const button of this.battleSetupSteps.children) {
      button.classList.toggle('is-current', button.dataset.step === step);
    }
  }

  /** Next on the setup page: moves to the following step, and says true once it is time to begin. */
  advanceBattleSetup() {
    if (this.setupStep < SETUP_STEPS.length - 1) {
      this.setupStep += 1;
      this.applySetupStep();
      return false;
    }
    return true;
  }

  /** Back on the setup page: the step before, or out to the menu from the first. */
  retreatBattleSetup() {
    if (this.setupStep === 0) {
      this.closeBattleSetup();
      return;
    }
    this.setupStep -= 1;
    this.applySetupStep();
  }

  openBattleSetup() {
    this.setupStep = 0;
    this.applySetupStep();
    this.battleSetupPage.style.height = '100%';
  }

  closeBattleSetup() {
    this.battleSetupPage.style.height = '0%';
  }

  buildSetupSection(className, heading, cards, ...extras) {
    const section = document.createElement('section');
    section.className = `setupSection ${className}`;
    const title = document.createElement('h3');
    title.className = 'setupHeading';
    title.innerText = heading;
    section.append(title, cards, ...extras);
    return section;
  }

  buildSetupCard(chosen, kind, id, tooltip = '') {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = chosen ? 'setupCard is-chosen' : 'setupCard';
    card.dataset.kind = kind;
    card.dataset.id = id;
    card.title = tooltip;
    return card;
  }

  /** Both sides field this many points -- the enemy line is drawn up to match. */
  buildBudgetSlider(value, onPick) {
    const { min, max, step } = BATTLE.budgetRange;
    const row = document.createElement('div');
    row.className = 'budgetRow';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'budgetSlider';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.setAttribute?.('aria-label', 'Points each side fields');
    const readout = document.createElement('span');
    readout.className = 'budgetValue';
    readout.innerText = `${value} points a side`;
    slider.addEventListener('input', () => {
      readout.innerText = `${slider.value} points a side`;
      onPick('budget', slider.value);
    });
    row.append(slider, readout);
    return row;
  }

  buildCaption(text) {
    const caption = document.createElement('p');
    caption.className = 'setupCaption';
    caption.innerText = text;
    return caption;
  }

  buildMapCards(level, chosen, onPick) {
    const row = document.createElement('div');
    row.className = 'setupCards setupCards-maps';
    for (const [id, map] of Object.entries(BATTLE_MAPS)) {
      const card = this.buildSetupCard(id === chosen, 'map', id, map.blurb);
      card.className += ' mapCard';
      const frame = document.createElement('span');
      frame.className = 'mapFrame';
      const thumb = document.createElement('canvas');
      thumb.className = 'levelThumb setupThumb';
      paintLevelThumbnail(
        thumb,
        { land: { ...level.land, ...map.land }, weather: map.weather },
        { marked: false, relief: true, detail: 3 },
      );
      frame.append(thumb);
      const icon = iconSource(map.weather?.icon);
      if (icon) {
        const badge = document.createElement('img');
        badge.className = 'weatherBadge';
        badge.src = icon;
        badge.alt = map.weather.label;
        frame.append(badge);
      }
      const name = document.createElement('span');
      name.className = 'setupCardName';
      name.innerText = map.name;
      card.append(frame, name);
      card.addEventListener('click', () => onPick('map', id));
      row.append(card);
    }
    return row;
  }

  mapCaption(chosen) {
    const map = BATTLE_MAPS[chosen];
    return this.buildCaption(map ? `${map.tag} \u00b7 ${map.weather?.label ?? ''}` : '');
  }

  buildFactionCards(side, chosen, onPick) {
    const row = document.createElement('div');
    row.className = 'setupCards setupCards-armies';
    for (const [id, faction] of Object.entries(FACTIONS)) {
      const card = this.buildSetupCard(id === chosen, side, id, faction.blurb);
      card.className += ' armyCard';
      const portrait = document.createElement('img');
      portrait.className = 'armyPortrait';
      portrait.src = faction.avatar;
      portrait.alt = '';
      const name = document.createElement('span');
      name.className = 'setupCardName';
      name.innerText = faction.name;
      const tag = document.createElement('span');
      tag.className = 'setupCardTag';
      tag.innerText = faction.tag;
      const text = document.createElement('span');
      text.className = 'setupCardText';
      text.append(name, tag);
      card.append(portrait, text);
      card.addEventListener('click', () => onPick(side, id));
      row.append(card);
    }
    return row;
  }

  /** How many soldiers muster in one company of this type. */
  buildSizeBadge(typeId) {
    const badge = document.createElement('span');
    badge.className = 'unitSizeBadge';
    badge.innerText = `${unitSize(typeId)}`;
    return badge;
  }

  /** The chosen army's companies, one portrait apiece with its point cost. */
  buildRosterStrip(factionId) {
    const strip = document.createElement('div');
    strip.className = 'rosterStrip';
    for (const entry of FACTIONS[factionId]?.roster ?? []) {
      const type = UNIT_TYPES[entry.id];
      const chip = document.createElement('span');
      chip.className = 'rosterChip';
      chip.title = `${type?.name ?? entry.id} - ${entry.cost} points, ${unitSize(entry.id)} soldiers`;
      chip.append(this.buildUnitPortrait(entry.id, 'rosterPortrait'), this.buildSizeBadge(entry.id));
      const cost = document.createElement('span');
      cost.className = 'rosterCost';
      cost.innerText = entry.cost === 0 ? 'free' : `${entry.cost}`;
      chip.append(cost);
      strip.append(chip);
    }
    return strip;
  }

  /** A unit's portrait -- the imperial heavy's stands in where a type has none yet. */
  buildUnitPortrait(typeId, className) {
    const portrait = document.createElement('img');
    portrait.className = className;
    portrait.alt = '';
    portrait.src = UNIT_TYPES[typeId]?.avatar ?? AVATARS.imperialHeavy;
    portrait.onerror = () => {
      portrait.onerror = null;
      portrait.src = AVATARS.imperialHeavy;
    };
    return portrait;
  }

  openSettings() {
    this.showSettingsView('main');
    this.settings.style.height = '100%';
  }

  /** Settings has two views: 'main' and 'debug'. */
  showSettingsView(view) {
    this.settings.dataset.view = view;
  }

  closeSettings() {
    this.settings.style.height = '0%';
  }

  showHelp() {
    this.helpPage = 0;
    this.applyHelpPage();
    this.helpModal.style.display = 'block';
  }

  helpPages() {
    return [...this.helpModal.querySelectorAll('.helpPage')];
  }

  applyHelpPage() {
    const pages = this.helpPages();
    pages.forEach((page, index) => page.classList.toggle('is-shown', index === this.helpPage));
    const last = Math.max(0, pages.length - 1);
    this.helpPageLabel.innerText = `${this.helpPage + 1} / ${last + 1}`;
    this.helpPrevButton.style.visibility = this.helpPage === 0 ? 'hidden' : 'visible';
    this.helpNextButton.innerText = this.helpPage >= last ? 'Got it' : 'Next';
  }

  /** Turn the help by one page; true when this was the last page and it should close. */
  turnHelpPage(direction) {
    const last = Math.max(0, this.helpPages().length - 1);
    if (direction > 0 && this.helpPage >= last) {
      return true;
    }
    this.helpPage = Math.min(last, Math.max(0, this.helpPage + direction));
    this.applyHelpPage();
    return false;
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
   * A dark red marker at the edge of the view for each bearing raiders are
   * expected from (see Game#threatBearings) -- not the moment a level opens,
   * but THREAT_DELAY_MS into it, once the player has had a beat to get their
   * bearings, and even then only as a flash rather than a fixture.
   */
  showThreats(bearings) {
    clearTimeout(this.threatDelayTimer);
    this.threatDelayTimer = setTimeout(() => this.revealThreats(bearings), THREAT_DELAY_MS);
  }

  revealThreats(bearings) {
    this.threatLayer.replaceChildren();
    for (const bearing of bearings) {
      this.threatLayer.append(this.buildThreatMarker(bearing));
    }
    clearTimeout(this.threatTimer);
    this.threatTimer = setTimeout(() => {
      this.threatLayer.querySelectorAll('.threatMarker').forEach((marker) => {
        marker.classList.add('is-fading');
      });
    }, THREAT_HOLD_MS);
    this.threatFadeTimer = setTimeout(() => this.clearThreats(), THREAT_HOLD_MS + THREAT_FADE_MS);
  }

  /**
   * Placed by direction from the centre of the view rather than on the
   * ground itself -- the camera never turns, so a bearing (see
   * projection.js: x east, y north) maps straight onto a fixed screen
   * angle without needing the camera's own perspective math at all.
   */
  buildThreatMarker(bearingDegrees) {
    const radians = (bearingDegrees * Math.PI) / 180;
    // North (+y, world) is up the screen (-y, screen), not down it.
    const outward = { x: Math.cos(radians), y: -Math.sin(radians) };
    const rotation = (Math.atan2(-outward.x, outward.y) * 180) / Math.PI;
    const marker = document.createElement('div');
    marker.className = 'threatMarker';
    marker.style.left = `${50 + outward.x * 42}%`;
    marker.style.top = `${50 + outward.y * 42}%`;
    marker.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    return marker;
  }

  clearThreats() {
    clearTimeout(this.threatDelayTimer);
    clearTimeout(this.threatTimer);
    clearTimeout(this.threatFadeTimer);
    this.threatLayer.replaceChildren();
  }

  /** A one-line nudge toward what a freshly picked tool wants next. */
  showActionHint(text) {
    this.actionHintText.innerText = text;
    this.actionHint.classList.add('is-shown');
    clearTimeout(this.actionHintTimer);
    this.actionHintTimer = setTimeout(() => this.clearActionHint(), ACTION_HINT_DURATION_MS);
  }

  clearActionHint() {
    clearTimeout(this.actionHintTimer);
    this.actionHint.classList.remove('is-shown');
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

  /**
   * The Hold button, floated over whatever companies are selected: "Hold"
   * to plant them where they stand, "Release" once every one of them
   * already is. `screen` is where over them to put it, or null to hide it.
   */
  updateHoldToggle(selected, screen) {
    // A routed company can be sent somewhere but not told to stand its ground.
    const guards = selected.filter((guard) => !guard.routed);
    if (guards.length === 0 || !screen) {
      this.holdToggle.style.display = 'none';
      return;
    }
    const allHolding = guards.every((guard) => guard.holding);
    const label = allHolding ? 'Release' : 'Hold';
    if (label !== this.shownHoldLabel) {
      this.shownHoldLabel = label;
      this.holdToggle.innerText = label;
      this.holdToggle.classList.toggle('is-holding', allHolding);
    }
    this.holdToggle.style.display = 'block';
    this.placeOnScreen(this.holdToggle, screen);
  }

  hideDispatchMenu() {
    this.dispatchMenu.style.display = 'none';
  }

  showGameOver(score, best) {
    this.markUnstarted();
    this.menuInfo.innerText = `Score: ${score}\nBest: ${best}`;
    this.openMenu();
  }

  /**
   * The open battleground mode's own placement dock: one button per roster
   * entry, each carrying its own point cost, plus the budget readout and
   * the Start Battle button. `onPick` is Input's own selectPendingUnit, so
   * a tap here only ever picks what the next tap on the field will place.
   */
  showBattlePrep(game, onPick) {
    this.battleDock.replaceChildren();
    for (const entry of game.battleRoster) {
      const type = UNIT_TYPES[entry.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toolButton battleUnitButton';
      button.dataset.unit = entry.id;
      button.title = `${type?.name ?? entry.id} - ${entry.cost} points, ${unitSize(entry.id)} soldiers`;
      const cost = document.createElement('span');
      cost.className = 'battleCost';
      cost.innerText = entry.cost === 0 ? 'free' : `${entry.cost}`;
      button.append(this.buildUnitPortrait(entry.id, 'battlePortrait'), this.buildSizeBadge(entry.id), cost);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        onPick(entry.id);
      });
      this.battleDock.append(button);
    }
    this.battleDock.style.display = 'flex';
    this.startBattleButton.style.display = 'inline-flex';
    this.updateBattleBudget(game);
  }

  hideBattlePrep() {
    this.battleDock.style.display = 'none';
    this.startBattleButton.style.display = 'none';
  }

  setBattleSelection(typeId) {
    this.battleDock.querySelectorAll('.battleUnitButton').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.unit === typeId);
    });
  }

  updateBattleBudget(game) {
    this.battleBudgetValue.innerText = `${Math.max(0, Math.trunc(game.battleBudget))} / ${game.battleBudgetLimit}`;
  }

  /**
   * The open battleground mode's own end-of-round screen: shown over the
   * field itself -- see #battleResult in the markup -- rather than the main
   * menu, so the line as it stood at the last moment is still visible
   * behind it. Start's own label is set here too, ready for whenever the
   * player does go back to the menu (see App#continueFromBattleResult).
   */
  showBattleResult(won, seconds, stats) {
    this.markUnstarted();
    this.battleResultTitle.innerText = won ? 'Victory' : 'Defeat';
    const headline = won
      ? `The enemy line broke after ${seconds}s.`
      : `Your line was overrun after ${seconds}s.`;
    this.battleResultSummary.innerText = `${headline}\n${formatBattleStats(stats)}`;
    this.renderBattleBreakdown(stats);
    this.battleResultModal.style.display = 'block';
  }

  closeBattleResult() {
    this.battleResultModal.style.display = 'none';
  }

  /** Each side's losses, broken down by type -- a small avatar per type, and how many of it fell. */
  renderBattleBreakdown(stats) {
    this.battleResultBreakdown.replaceChildren(
      this.buildBattleBreakdownColumn('Enemy losses', stats.enemyLossByType, UNIT_TYPES),
      this.buildBattleBreakdownColumn('Your losses', stats.playerLossByType, UNIT_TYPES),
    );
  }

  buildBattleBreakdownColumn(title, lossByType, typeTable) {
    const column = document.createElement('div');
    column.className = 'battleBreakdownColumn';
    const heading = document.createElement('h3');
    heading.innerText = title;
    column.append(heading);

    // Under half a soldier is a graze, not a loss worth a line of its own.
    const entries = Object.entries(lossByType)
      .filter(([, lost]) => lost >= 0.5)
      .sort((first, second) => second[1] - first[1]);
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'battleBreakdownEmpty';
      empty.innerText = 'None';
      column.append(empty);
      return column;
    }

    const rows = document.createElement('div');
    rows.className = 'battleBreakdownRow';
    for (const [typeId, lost] of entries) {
      const type = typeTable[typeId];
      const row = document.createElement('div');
      row.className = 'battleBreakdownItem';
      if (type?.avatar) {
        const avatar = document.createElement('img');
        // A portrait that has not actually shipped yet (see AVATARS in
        // config.js) quietly goes undrawn, the same as everywhere else a
        // company's avatar is shown -- not a broken-image icon.
        avatar.addEventListener('error', () => avatar.remove(), { once: true });
        avatar.src = type.avatar;
        avatar.alt = '';
        row.append(avatar);
      }
      const label = document.createElement('span');
      label.innerText = `${type?.name ?? typeId} ×${Math.round(lost)}`;
      row.append(label);
      rows.append(row);
    }
    column.append(rows);
    return column;
  }

  /** A game is under way: the menu offers to continue it, restart it or pick another. */
  markStarted() {
    this.startButton.innerText = 'Continue';
    this.showGameControls(true);
  }

  /** Nothing to continue: Start leads to the level picker, and Levels and Restart have nothing to act on. */
  markUnstarted() {
    this.startButton.innerText = 'Start';
    this.showGameControls(false);
  }

  showGameControls(visible) {
    this.levelsButton.style.display = visible ? 'block' : 'none';
    this.restartButton.style.display = visible ? 'block' : 'none';
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

  setGameSpeedLabel(name) {
    this.gameSpeedButton.innerText = `Game Speed: ${name}`;
  }

  /** Redraws the debug buttons from `debug` (a Game's debug state), so what they say is what is on. */
  setDebugLabels(debug) {
    const onOff = (enabled) => (enabled ? 'On' : 'Off');
    this.debugButtons.infiniteMoney.innerText = `Infinite Money: ${onOff(debug.infiniteMoney)}`;
    this.debugButtons.invulnerable.innerText = `Invulnerable: ${onOff(debug.invulnerable)}`;
    this.debugButtons.spawnRaiders.innerText = `Raider Spawns: ${onOff(debug.spawnRaiders)}`;
    this.debugButtons.raiderSpeed.innerText = `Attacker Speed: ${debug.raiderSpeed}x`;
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
