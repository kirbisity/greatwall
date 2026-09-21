import { CAMERA, SIDE_BAR_WIDTH, TOP_BAR_HEIGHT, WALL, ZOOM_STEP } from './config.js';
import { distance } from './geometry.js';

const CURSORS = {
  move: 'move',
  zoom: 'zoom-in',
  build: 'url(images/buildBtn.png), default',
  destroy: 'url(images/destroyBtn.png), default',
  upgrade: 'url(images/castleBtn.png), default',
};

const DRAG_ZOOM_SENSITIVITY = 5;
const MAX_DRAG_ZOOM_STEPS = 3;

/** Translates pointer and keyboard events into camera moves and game actions. */
export class Input {
  constructor({ game, camera, hud, onChange, onMenu }) {
    this.game = game;
    this.camera = camera;
    this.hud = hud;
    this.onChange = onChange;
    this.onMenu = onMenu;

    this.tool = 'move';
    this.pointerDown = false;
    this.pointer = { x: 0, y: 0 };
    this.zoomAnchor = null;
    this.chainPoint = null;
  }

  listen() {
    document.addEventListener('mousedown', (event) => {
      // Sync first so the initial drag delta is zero instead of a jump from (0, 0).
      this.trackPointer(event);
      this.pointerDown = true;
    });
    document.addEventListener('mouseup', () => {
      this.pointerDown = false;
      this.zoomAnchor = null;
      this.chainPoint = null;
    });
    document.addEventListener('click', (event) => this.handleClick(event));
    document.addEventListener('mousemove', (event) => this.handleMove(event));
    document.addEventListener('wheel', (event) => this.handleWheel(event));
    document.addEventListener('keydown', (event) => this.handleKey(event));
  }

  selectTool(tool) {
    this.tool = this.tool === tool ? 'move' : tool;
    this.applyTool();
  }

  resetTool() {
    this.tool = 'move';
    this.applyTool();
  }

  applyTool() {
    this.hud.setCursor(CURSORS[this.tool]);
    this.hud.setActiveTool(this.tool);
  }

  isOverMap(event) {
    return event.clientY >= TOP_BAR_HEIGHT && event.clientX <= this.camera.width - SIDE_BAR_WIDTH;
  }

  trackPointer(event) {
    const previous = { ...this.pointer };
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    return previous;
  }

  handleClick(event) {
    if (!this.isOverMap(event) || this.tool !== 'upgrade') {
      return;
    }
    this.trackPointer(event);
    if (this.game.upgradeCastleAt(this.camera.toWorld(this.pointer))) {
      this.resetTool();
    }
    this.onChange();
  }

  handleMove(event) {
    if (!this.isOverMap(event)) {
      return;
    }
    const previous = this.trackPointer(event);
    if (!this.pointerDown) {
      return;
    }
    switch (this.tool) {
      case 'zoom':
        this.dragZoom(previous);
        break;
      case 'build':
        this.dragBuild();
        break;
      case 'destroy':
        this.dragDestroy();
        break;
      default:
        this.camera.panFrom(previous, this.pointer);
    }
    this.onChange();
  }

  dragZoom(previous) {
    if (!this.zoomAnchor) {
      this.zoomAnchor = { ...this.pointer };
    }
    const steps = Math.max(
      -MAX_DRAG_ZOOM_STEPS,
      Math.min(MAX_DRAG_ZOOM_STEPS, (previous.y - this.pointer.y) / DRAG_ZOOM_SENSITIVITY),
    );
    this.hud.setCursor(steps < 0 ? 'zoom-out' : 'zoom-in');
    this.camera.zoomAt(this.zoomAnchor, 1 + ZOOM_STEP * steps);
  }

  dragBuild() {
    const target = this.camera.toWorld(this.pointer);
    if (!this.chainPoint) {
      this.chainPoint = target;
      return;
    }
    const span = distance(this.chainPoint, target);
    if (span <= WALL.minLength || span >= WALL.maxLength) {
      return;
    }
    const result = this.game.buildWall(this.chainPoint, target);
    if (result.built) {
      this.chainPoint = target;
      return;
    }
    if (result.reason === 'castle') {
      this.chainPoint = null;
    }
    if (result.reason === 'tooPoor') {
      this.hud.showMessage('Not enough money');
    }
  }

  dragDestroy() {
    this.game.removeWallAt(this.camera.toWorld(this.pointer));
  }

  handleWheel(event) {
    if (!this.isOverMap(event)) {
      return;
    }
    const steps = -Math.sign(event.deltaY);
    if (steps === 0) {
      return;
    }
    this.camera.zoomAt(this.pointer, 1 + ZOOM_STEP * steps);
    this.onChange();
  }

  handleKey(event) {
    if (event.key === 'Escape') {
      this.onMenu();
      return;
    }
    if (event.key === '[' || event.key === ']') {
      this.camera.tilt(event.key === '[' ? -CAMERA.elevationStep : CAMERA.elevationStep);
      this.onChange();
      return;
    }
    if (event.ctrlKey && event.code === 'KeyZ') {
      this.game.undoLastWall();
      this.onChange();
    }
  }
}
