import { Camera } from './camera.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { loadSprites } from './sprites.js';
import { loadSettings, saveSettings, settings } from './settings.js';

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
      loadSprites(),
    );
    this.input = new Input({
      game: this.game,
      camera: this.camera,
      hud: this.hud,
      onChange: () => this.draw(),
      onMenu: () => this.openMenu(),
    });

    this.running = false;
    this.needsNewGame = true;
    this.bestScore = 0;
  }

  init() {
    this.renderer.resize(this.camera.width, this.camera.height);
    this.input.listen();
    this.bindButtons();
    window.addEventListener('resize', () => this.resize());
    this.hud.setCursor('move');
    this.hud.setAtmosphereLabel(settings.atmosphere);
    this.draw();
  }

  bindButtons() {
    bind('startBtn2', () => this.start());
    bind('restartBtn', () => this.restart());
    bind('settingsBtn', () => this.hud.openSettings());
    bind('settingsBackBtn', () => this.hud.closeSettings());
    bind('soundBtn', () => this.hud.cycleSoundLevel());
    bind('atmosphereBtn', () => this.toggleAtmosphere());
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
  }

  toggleAtmosphere() {
    settings.atmosphere = !settings.atmosphere;
    saveSettings();
    this.hud.setAtmosphereLabel(settings.atmosphere);
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
    if (this.running) {
      return;
    }
    this.running = true;
    this.loop();
  }

  pause() {
    this.running = false;
  }

  loop() {
    if (!this.running) {
      return;
    }
    this.game.step();
    this.draw();
    if (this.game.isDefeated) {
      this.gameOver();
      return;
    }
    window.requestAnimationFrame(() => this.loop());
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
