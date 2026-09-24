import { CAMERA, SIDE_BAR_WIDTH, TOP_BAR_HEIGHT, WALL, ZOOM_STEP } from './config.js';
import { distance } from './geometry.js';

const CURSORS = {
  move: 'move',
  zoom: 'zoom-in',
  build: 'url(images/buildBtn.png), default',
  destroy: 'url(images/destroyBtn.png), default',
  repair: 'url(images/buildBtn.png), cell',
  fortify: 'url(images/buildBtn.png), copy',
  upgrade: 'url(images/castleBtn.png), default',
  attack: 'url(images/attackBtn.png), crosshair',
};

// Outcomes that leave a usable end to keep drawing from. Drawing over a
// section that already stands does nothing, but the chain carries on from
// it, so a new run can branch off a wall that is already up.
const CHAIN_CONTINUES = new Set(['built', 'exists']);

// Tools that pick out a single section rather than acting on open ground, so
// hovering is worth showing before a click commits to anything.
const HOVER_TOOLS = new Set(['repair', 'fortify']);

const DRAG_ZOOM_SENSITIVITY = 5;
const MAX_DRAG_ZOOM_STEPS = 2;

/** Translates pointer and keyboard events into camera moves and game actions. */
export class Input {
  constructor({ game, camera, renderer, hud, onChange, onMenu }) {
    this.game = game;
    this.camera = camera;
    this.renderer = renderer;
    this.hud = hud;
    this.onChange = onChange;
    this.onMenu = onMenu;

    this.tool = 'move';
    this.pointerDown = false;
    this.pointer = { x: 0, y: 0 };
    this.zoomAnchor = null;
    this.chainPoint = null;
    // Which guard tier the dispatch menu last picked. Sticky across sends,
    // so repeat orders of the same company do not reopen the menu.
    this.selectedGuardType = null;
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
    if (this.tool === 'attack') {
      this.openDispatchMenu();
    } else {
      this.hud.hideDispatchMenu();
    }
  }

  resetTool() {
    this.tool = 'move';
    this.applyTool();
    this.hud.hideDispatchMenu();
  }

  /** Show the tier picker above the castle, so an order carries a company. */
  openDispatchMenu() {
    const castle = this.game.castles[0];
    const options = this.game.dispatchOptions();
    if (!castle || options.length === 0) {
      return;
    }
    const screen = this.camera.toScreen({ ...castle.position, z: 0 })
      ?? { x: this.camera.width / 2, y: this.camera.height / 2 };
    this.hud.showDispatchMenu(options, screen, (typeId) => {
      this.selectedGuardType = typeId;
      this.hud.hideDispatchMenu();
    });
  }

  applyTool() {
    this.hud.setCursor(CURSORS[this.tool]);
    this.hud.setActiveTool(this.tool);
    // Leaving a picking tool drops whatever it had picked out, rather than
    // leaving a stale section glowing under a different tool.
    this.renderer.hoveredWall = null;
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
    const options = this.game.dispatchOptions();
    const chosen = options.find((option) => option.id === this.selectedGuardType) ?? options[0];
    if (!chosen) {
      return;
    }
    const result = this.game.sendGuard(chosen.id, target);
    if (result.status === 'poor') {
      this.hud.showMessage(`${chosen.name} costs $${chosen.cost} to muster`);
    }
  }

  handleMove(event) {
    if (!this.isOverMap(event)) {
      return;
    }
    const previous = this.trackPointer(event);
    this.updateHover();
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
      case 'repair':
        this.dragRepair();
        break;
      case 'fortify':
        this.dragFortify();
        break;
      default:
        this.camera.panFrom(previous, this.pointer);
    }
    this.onChange();
  }

  /**
   * Which section the repair or fortify tool would act on right now, so the
   * renderer can pick it out before a click commits to anything. Any other
   * tool leaves nothing highlighted.
   */
  updateHover() {
    const hovered = HOVER_TOOLS.has(this.tool)
      ? this.game.wallAt(this.camera.toWorld(this.pointer))
      : null;
    if (hovered !== this.renderer.hoveredWall) {
      this.renderer.hoveredWall = hovered;
      this.onChange();
    }
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
    if (result.status === 'crowded') {
      // A junction already at its limit — no message, just let go of the
      // tool the way it would if the player had simply let up on it.
      this.chainPoint = null;
      this.resetTool();
      return;
    }
    if (result.status === 'poor') {
      this.hud.showMessage('Not enough money');
    }
  }

  dragDestroy() {
    this.game.removeWallAt(this.camera.toWorld(this.pointer));
  }

  dragRepair() {
    const result = this.game.repairWallAt(this.camera.toWorld(this.pointer));
    if (result.status === 'poor') {
      this.hud.showMessage('Not enough money to repair it');
    }
  }

  /**
   * Sweeping the tool over a stretch fortifies each section under it. Only
   * the outcomes worth interrupting for are announced: passing over stone
   * that is already reinforced, or already growing, says nothing.
   */
  dragFortify() {
    const result = this.game.upgradeWallAt(this.camera.toWorld(this.pointer));
    if (result.status === 'poor') {
      this.hud.showMessage(`${result.name} costs $${result.cost}`);
    }
    if (result.status === 'max') {
      this.hud.showMessage('This wall is as strong as stone gets');
    }
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
