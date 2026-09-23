import { Camera } from './camera.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { loadSettings, saveSettings, settings } from './settings.js';

// A long stall must not teleport the camera or fast-forward the game.
const MAX_FRAME_SECONDS = 0.05;

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
    this.game = new Game({ onMessage: (text) => this.hud.showMessage(text) });
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
      hud: this.hud,
      onChange: () => { this.needsDraw = true; },
      onMenu: () => this.openMenu(),
    });

    this.running = false;
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
    bind('infoClose', () => this.hud.closeMessage());
    bind('move', () => this.input.resetTool());
    bind('zoom', () => this.input.selectTool('zoom'));
    bind('buildTool', () => {
      this.game.wallHintShown = true;
      this.input.selectTool('build');
    });
    bind('destroyTool', () => this.input.selectTool('destroy'));
    bind('upgradeTool', () => this.input.selectTool('upgrade'));
    bind('attackTool', (event) => {
      // Without this, the same click bubbles to the map's own click handler,
      // which reads the tool as already 'attack' and fires an order at
      // wherever this button happens to sit on screen — before the tier
      // picker it just opened has had a chance to be used.
      event.stopPropagation();
      this.input.selectTool('attack');
    });
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
    this.resume();
  }

  restart() {
    this.input.resetTool();
    this.newGame();
    this.hud.markStarted();
    this.hud.closeMenu();
    this.resume();
  }

  newGame() {
    this.game.restart();
    this.camera.centerOn({ x: 0, y: 0 });
    this.needsNewGame = false;
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
    // The city keeps burning on screen for BREACH.collapseSeconds before the
    // game actually ends — game.step() freezes the field the moment it falls,
    // but drawing carries on so the fire and the blackening play out.
    if (this.running && this.game.breachComplete) {
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
    this.resume();
  }
}

export const app = new App();
app.init();

window.addEventListener('load', () => {
  app.hud.hideLoader();
  app.hud.openMenu();
});
