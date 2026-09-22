import { CAMERA, IMPERIAL, SIDE_BAR_WIDTH, TOP_BAR_HEIGHT, WALL, ZOOM_STEP } from './config.js';
import { distance } from './geometry.js';

const CURSORS = {
  move: 'move',
  zoom: 'zoom-in',
  build: 'url(images/buildBtn.png), default',
  destroy: 'url(images/destroyBtn.png), default',
  upgrade: 'url(images/castleBtn.png), default',
  attack: 'url(images/attackBtn.png), crosshair',
};

// Outcomes that leave a usable end to keep drawing from.
const CHAIN_CONTINUES = new Set(['built', 'repaired', 'intact']);

const DRAG_ZOOM_SENSITIVITY = 5;
const MAX_DRAG_ZOOM_STEPS = 2;

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
      this.camera.release();
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
    if (!this.isOverMap(event)) {
      return;
    }
    if (this.tool === 'upgrade') {
      this.trackPointer(event);
      if (this.game.upgradeCastleAt(this.camera.toWorld(this.pointer))) {
        this.resetTool();
      }
      this.onChange();
      return;
    }
    if (this.tool === 'attack') {
      this.trackPointer(event);
      this.orderAttack(this.camera.toWorld(this.pointer));
      this.onChange();
    }
  }

  orderAttack(target) {
    const result = this.game.sendGuard(target);
    if (result.status === 'poor') {
      this.hud.showMessage(`A company costs $${IMPERIAL.cost} to muster`);
    }
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
    if (CHAIN_CONTINUES.has(result.status)) {
      // Carry on from the snapped end so chains follow walls and city edges.
      this.chainPoint = result.end ?? target;
      return;
    }
    if (result.status === 'blocked') {
      this.chainPoint = null;
      this.hud.showMessage('Walls cannot cross the city');
      return;
    }
    if (result.status === 'poor') {
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
