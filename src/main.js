import { Camera } from './camera.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { LEVELS } from './levels.js';
import { loadSettings, saveSettings, settings } from './settings.js';
import { clamp, distance } from './geometry.js';

// A long stall must not teleport the camera or fast-forward the game.
const MAX_FRAME_SECONDS = 0.05;

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
    bind('attackTool', (event) => {
      // Without this, the same click bubbles to the map's own click handler,
      // which reads the tool as already 'attack' and fires an order at
      // wherever this button happens to sit on screen — before the tier
      // picker it just opened has had a chance to be used.
      event.stopPropagation();
      this.input.selectTool('attack');
    });
  }

  /** Picking a level starts it: there is nothing to unlock, so nothing to wait for. */
  showLevels() {
    this.hud.showLevels(LEVELS, this.chosenLevel, (index) => {
      this.chosenLevel = index;
      this.showLevels();
      this.restart();
    });
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
  }

  start() {
    if (this.needsNewGame) {
      this.newGame();
      this.hud.markStarted();
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
    this.game.loadLevel(LEVELS[this.chosenLevel]);
    this.camera.centerOn({ x: 0, y: 0 });
    this.needsNewGame = false;
    this.hud.playLevelMusic(this.game.level.music);
    this.hud.showStory(this.game.level.story);
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
    this.hud.showBattleResult(won, this.game.seconds, this.game.battleStats);
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
