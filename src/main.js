import { Camera } from './camera.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { LEVELS } from './levels.js';
import {
  BATTLE, BATTLE_MAPS, DEFAULT_BATTLE_MAP, DEFAULT_FACTIONS, FACTIONS,
} from './config.js';
import { loadSettings, saveSettings, settings } from './settings.js';
import { clamp, distance } from './geometry.js';

// A long stall must not teleport the camera or fast-forward the game.
const MAX_FRAME_SECONDS = 0.05;

// How far south of a selected group's middle the Hold button sits, in ground
// units: just past the selection ring (see renderer.js), clear of the
// portraits drawn above the companies themselves.
const HOLD_TOGGLE_SOUTH = 16;

// How far a sound effect's own world position can sit from the camera's
// focus before it fades out entirely, in the same ground units as the map.
const EFFECT_HEARING_RADIUS = 600;

function bind(id, handler) {
  const node = document.getElementById(id);
  if (node) {
    node.addEventListener('click', handler);
  }
}

class App {
  constructor() {
    loadSettings();
    this.hud = new Hud();
    this.camera = new Camera(window.innerWidth, window.innerHeight);
    this.game = new Game({
      onMessage: (text) => this.hud.showMessage(text),
      onEffect: (name, position) => {
        this.hud.playEffect(name, this.effectProximity(position));
        this.hud.closeStory();
      },
    });
    this.renderer = new Renderer(
      {
        terrain: document.getElementById('background'),
        units: document.getElementById('canvas1'),
        structures: document.getElementById('canvas2'),
      },
      this.camera,
    );
    this.input = new Input({
      game: this.game,
      camera: this.camera,
      renderer: this.renderer,
      hud: this.hud,
      onChange: () => { this.needsDraw = true; },
      onMenu: () => this.openMenu(),
    });

    this.running = false;
    this.chosenLevel = 0;
    this.needsNewGame = true;
    this.setupConfirmed = false;
    this.needsDraw = true;
    this.lastFrameAt = 0;
    this.bestScore = 0;
  }

  init() {
    this.renderer.resize(this.camera.width, this.camera.height);
    this.input.listen();
    this.bindButtons();
    window.addEventListener('resize', () => this.resize());
    this.hud.setCursor('move');
    this.hud.setAtmosphereLabel(settings.atmosphere);
    this.hud.setRoutesLabel(settings.showRoutes);
    this.showLevels();
    this.draw();
    this.lastFrameAt = performance.now();
    window.requestAnimationFrame(() => this.frame());
  }

  bindButtons() {
    bind('startBtn2', () => this.start());
    bind('battleSetupBtn', () => this.openBattleSetup());
    bind('battleSetupBack', () => this.hud.closeBattleSetup());
    bind('battleSetupStart', () => {
      this.hud.closeBattleSetup();
      this.setupConfirmed = true;
      this.start();
    });
    bind('restartBtn', () => this.restart());
    bind('settingsBtn', () => this.hud.openSettings());
    bind('settingsBackBtn', () => this.hud.closeSettings());
    bind('soundBtn', () => this.hud.cycleSoundLevel());
    bind('atmosphereBtn', () => this.toggleAtmosphere());
    bind('routesBtn', () => this.toggleRoutes());
    bind('bgmusicBtn', () => this.hud.playMusic());
    bind('menuBtn', () => this.openMenu());
    bind('help', () => this.openHelp());
    bind('helpClose', () => this.closeHelp());
    bind('storyClose', () => this.hud.closeStory());
    bind('move', () => this.input.resetTool());
    bind('zoom', () => this.input.selectTool('zoom'));
    bind('undo', () => this.input.undo());
    bind('buildTool', () => {
      this.game.wallHintShown = true;
      this.input.selectTool('build');
    });
    bind('destroyTool', () => this.input.selectTool('destroy'));
    bind('repairTool', () => this.input.selectTool('repair'));
    bind('fortifyTool', () => this.input.selectTool('fortify'));
    bind('upgradeTool', () => this.input.selectTool('upgrade'));
    bind('startBattleBtn', () => this.beginBattle());
    bind('battleResultContinue', () => this.continueFromBattleResult());
    bind('holdToggle', (event) => {
      // Kept off the map's own click handler, which would otherwise read the
      // same tap as an order for the group this button just held.
      event.stopPropagation();
      this.game.toggleHold(this.game.selectedGuards);
      this.game.deselectGuards();
      this.needsDraw = true;
    });
    bind('attackTool', (event) => {
      // Without this, the same click bubbles to the map's own click handler,
      // which reads the tool as already 'attack' and fires an order at
      // wherever this button happens to sit on screen — before the tier
      // picker it just opened has had a chance to be used.
      event.stopPropagation();
      this.input.selectTool('attack');
    });
  }

  /**
   * Picking a siege level starts it: there is nothing to unlock, so nothing
   * to wait for. The open battleground opens its setup page instead, since
   * it has a map and armies to choose first -- see openBattleSetup.
   */
  showLevels() {
    this.hud.showLevels(LEVELS, this.chosenLevel, (index) => {
      this.chosenLevel = index;
      this.showLevels();
      if (LEVELS[index].mode === 'battle') {
        this.needsNewGame = true;
        this.hud.markUnstarted();
        this.openBattleSetup();
        return;
      }
      this.restart();
    });
    this.hud.showBattleSetupButton(LEVELS[this.chosenLevel].mode === 'battle');
  }

  /** The open battleground's setup page: its story, the map and both armies. */
  openBattleSetup() {
    this.showBattleSetup();
    this.hud.openBattleSetup();
  }

  showBattleSetup() {
    this.hud.showBattleSetup(LEVELS[this.chosenLevel], this.chosenSetup(), (kind, id) => {
      if (kind === 'map') {
        settings.battleMap = id;
      } else if (kind === 'budget') {
        settings.battleBudget = Number(id);
      } else {
        settings.factions = { ...this.chosenFactions(), [kind]: id };
      }
      saveSettings();
      // The ground and the enemy line are laid out when a game begins, so a
      // new choice means a new game -- but only once Start is pressed.
      this.needsNewGame = true;
      this.hud.markUnstarted();
      // The slider is still under the finger; redrawing it would drop the grip.
      if (kind !== 'budget') {
        this.showBattleSetup();
      }
    });
  }

  chosenSetup() {
    return { factions: this.chosenFactions(), map: this.chosenMap(), budget: this.chosenBudget() };
  }

  /** The saved map, with anything unrecognised put back to the default. */
  chosenMap() {
    return BATTLE_MAPS[settings.battleMap] ? settings.battleMap : DEFAULT_BATTLE_MAP;
  }

  /** The saved points budget, kept inside the slider's own range. */
  chosenBudget() {
    const { min, max } = BATTLE.budgetRange;
    const saved = Number(settings.battleBudget);
    return Number.isFinite(saved) ? clamp(saved, min, max) : BATTLE.budget;
  }

  /** The saved army choices, with anything unrecognised put back to the default. */
  chosenFactions() {
    const saved = settings.factions ?? {};
    return {
      player: FACTIONS[saved.player] ? saved.player : DEFAULT_FACTIONS.player,
      enemy: FACTIONS[saved.enemy] ? saved.enemy : DEFAULT_FACTIONS.enemy,
    };
  }

  /** 1 at the camera's own focus point, fading to 0 by EFFECT_HEARING_RADIUS out. */
  effectProximity(position) {
    if (!position) {
      return 1;
    }
    return clamp(1 - distance(position, this.camera.focus) / EFFECT_HEARING_RADIUS, 0, 1);
  }

  toggleAtmosphere() {
    settings.atmosphere = !settings.atmosphere;
    saveSettings();
    this.hud.setAtmosphereLabel(settings.atmosphere);
    this.hud.setRoutesLabel(settings.showRoutes);
    this.draw();
  }

  toggleRoutes() {
    settings.showRoutes = !settings.showRoutes;
    saveSettings();
    this.hud.setRoutesLabel(settings.showRoutes);
    this.draw();
  }

  resize() {
    this.camera.resize(window.innerWidth, window.innerHeight);
    this.renderer.resize(this.camera.width, this.camera.height);
    this.draw();
  }

  draw() {
    this.renderer.render(this.game);
    this.hud.update(this.game);
    const selected = this.game.selectedGuards;
    this.hud.updateHoldToggle(selected, this.holdToggleAnchor(selected));
  }

  /** Just below a selected group, on screen -- or null with nothing selected. */
  holdToggleAnchor(guards) {
    if (guards.length === 0) {
      return null;
    }
    let x = 0;
    let y = 0;
    for (const guard of guards) {
      x += guard.position.x / guards.length;
      y += guard.position.y / guards.length;
    }
    const southY = y - HOLD_TOGGLE_SOUTH;
    return this.camera.toScreen({ x, y: southY, z: this.game.terrain.heightAt(x, southY) });
  }

  start() {
    // A battle not yet set up goes through its setup page first: that page's
    // own Start Battle button is what brings us back here.
    if (this.needsNewGame && LEVELS[this.chosenLevel].mode === 'battle' && !this.setupConfirmed) {
      this.openBattleSetup();
      return;
    }
    this.setupConfirmed = false;
    if (this.needsNewGame) {
      this.newGame();
      this.hud.markStarted();
      if (this.game.mode === 'battle') {
        // The welcome text and the wall-building help both live elsewhere for
        // this mode (the setup page), so straight on to placement.
        this.hud.closeMenu();
        this.enterField();
        return;
      }
      this.openHelp();
      this.hud.closeMenu();
      return;
    }
    this.hud.closeMenu();
    this.enterField();
  }

  restart() {
    this.input.resetTool();
    this.newGame();
    this.hud.markStarted();
    this.hud.closeMenu();
    this.enterField();
  }

  /**
   * Resumes play -- except the open battleground mode gets its placement
   * phase first (see beginPlacement), the same whether this is a first
   * Start, a Restart, or picking a fresh level straight off the menu.
   */
  enterField() {
    if (this.game.mode === 'battle' && !this.game.started) {
      this.input.beginPlacement();
      return;
    }
    this.resume();
  }

  newGame() {
    this.game.loadLevel(LEVELS[this.chosenLevel], this.chosenFactions(), this.chosenMap(), this.chosenBudget());
    this.camera.centerOn({ x: 0, y: 0 });
    this.needsNewGame = false;
    this.hud.playLevelMusic(this.game.level.music);
    // The open battleground's story is told in the menu instead -- see
    // the setup page -- so it never pops up over the field itself.
    if (this.game.mode !== 'battle') {
      this.hud.showStory(this.game.level.story);
    }
    this.hud.showThreats(this.game.threatBearings);
    this.draw();
  }

  resume() {
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  /**
   * One display frame. The camera settles whether or not the simulation is
   * running, so panning and zooming stay smooth behind a menu, and drawing is
   * skipped entirely once everything is still.
   */
  frame() {
    const now = performance.now();
    const elapsed = Math.min((now - this.lastFrameAt) / 1000, MAX_FRAME_SECONDS);
    this.lastFrameAt = now;

    const cameraMoved = this.camera.update(elapsed);
    if (this.running) {
      this.game.step();
    }
    if (this.running || cameraMoved || this.needsDraw) {
      this.needsDraw = false;
      this.draw();
    }
    if (this.running && this.game.mode === 'battle') {
      // No slow breach to wait out here -- the line breaks or it holds.
      if (this.game.isDefeated) {
        this.battleOver(false);
      } else if (this.game.isVictorious) {
        this.battleOver(true);
      }
    } else if (this.running && this.game.breachComplete) {
      // The city keeps burning on screen for BREACH.collapseSeconds before
      // the game actually ends — game.step() freezes the field the moment
      // it falls, but drawing carries on so the fire and blackening play out.
      this.gameOver();
    }
    window.requestAnimationFrame(() => this.frame());
  }

  gameOver() {
    this.pause();
    this.needsNewGame = true;
    this.bestScore = Math.max(this.bestScore, this.game.seconds);
    this.hud.showGameOver(this.game.seconds, this.bestScore);
  }

  battleOver(won) {
    this.pause();
    this.needsNewGame = true;
    this.input.resetTool();
    this.hud.showBattleResult(won, this.game.seconds, this.game.battleStats);
  }

  /** Continue past the battle result screen and back to the main menu. */
  continueFromBattleResult() {
    this.openMenu();
  }

  /** Start Battle: closes the placement phase and lets the line advance. */
  beginBattle() {
    if (!this.game.startBattle()) {
      return;
    }
    this.input.endPlacement();
    this.resume();
  }

  openMenu() {
    this.pause();
    this.input.resetTool();
    this.hud.closeHelp();
    this.hud.closeMessage();
    this.hud.closeBattleResult();
    this.hud.openMenu();
  }

  openHelp() {
    this.pause();
    this.hud.showHelp();
  }

  closeHelp() {
    this.hud.closeHelp();
    this.enterField();
  }
}

export const app = new App();
app.init();

window.addEventListener('load', () => {
  app.hud.hideLoader();
  app.hud.openMenu();
});
