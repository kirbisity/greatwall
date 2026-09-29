import {
  CAMERA, EARTHWORK, SIDE_BAR_WIDTH, TOP_BAR_HEIGHT, WALL, ZOOM_STEP,
} from './config.js';
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

// What a freshly picked tool wants next -- see Hud#showActionHint. Attack
// has two stages of its own (see openDispatchMenu/showDispatchMenu below),
// so it is left out here and set explicitly at each stage instead.
const TOOL_HINTS = {
  build: 'Drag on the ground to raise a wall',
  destroy: 'Drag over a wall to tear it down',
  repair: 'Drag over a damaged wall to mend it',
  fortify: 'Drag over a wall to reinforce it',
  upgrade: 'Tap the castle to grow it',
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

// How much of a finger's newest reported position replaces the smoothed one
// each sample, once the gesture is under way -- 1 would be no smoothing at
// all, and this is deliberately close to that: just enough to round off
// sample noise, not slow enough to feel like the ground is trailing the
// finger. See Input#panMap.
const TOUCH_PAN_SMOOTHING = 0.55;
// A touch landing is the least steady moment of a drag -- a thumb settling
// still reads as a few pixels of back-and-forth before it commits to a
// direction. Starting this gently and ramping up to TOUCH_PAN_SMOOTHING
// over PAN_RAMP_SAMPLES samples absorbs that shake instead of panning the
// camera along with it, without adding any lag a deliberate swipe can feel.
const PAN_RAMP_START = 0.12;
const PAN_RAMP_SAMPLES = 6;

// Anything a gesture can start on that is interface rather than map. A drag
// that begins on a button, the dock or a menu must not move the camera or
// lay stone, and a tap on one must not also land on the ground beneath it.
const INTERFACE = 'button, a, input, #topMenu, #toolDock, #battleDock, #dispatchMenu, .overlay, .modal';

/** Translates pointer and keyboard events into camera moves and game actions. */
export class Input {
  constructor({ game, camera, renderer, hud, onChange, onMenu }) {
    this.game = game;
    this.camera = camera;
    this.renderer = renderer;
    this.hud = hud;
    this.onChange = onChange;
    this.onMenu = onMenu;

    // Read through the game rather than captured, so a level change swaps
    // the landscape under the cursor along with everything else.
    this.groundHeight = (x, y) => this.game.terrain.heightAt(x, y);

    this.tool = 'move';
    this.pointerDown = false;
    this.pointer = { x: 0, y: 0 };
    // Every finger or pointer currently down on the map, by pointer id. Two
    // at once is a pinch: see beginPinch.
    this.contacts = new Map();
    this.pinch = null;
    // Whether the drag in hand is a finger or stylus, which holds the ground
    // it grabbed, rather than a mouse, which eases after it -- see
    // Camera#panFrom.
    this.holdsGround = false;
    // A light low-pass filter on a finger's own reported position, so the
    // small per-sample noise real touch digitizers report does not turn
    // straight into visible micro-jerks in the pan -- see handleMove. Reset
    // at the start of every drag so a new gesture starts from exactly where
    // the finger landed, not wherever the last one left off.
    this.smoothedTouch = null;
    // How many pan samples into the current drag -- see panMap's own ramp
    // from PAN_RAMP_START up to TOUCH_PAN_SMOOTHING.
    this.panRampStep = 0;
    this.zoomAnchor = null;
    this.chainPoint = null;
    // Every point along the Build tool's current drag, in world ground
    // coordinates -- see dragBuild/Renderer#setBuildTrail.
    this.trail = [];
    // The open battleground mode's placement phase: which roster type a tap
    // on the field will place next, picked from the battle dock -- see
    // selectPendingUnit/handleClick. Null the rest of the time.
    this.pendingUnit = null;
  }

  /**
   * Pointer events rather than mouse events, so a finger and a mouse arrive
   * through the same handlers: one contact behaves exactly as the mouse
   * always has, and a second one turns the gesture into a pinch.
   */
  listen() {
    document.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    document.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    document.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    document.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
    document.addEventListener('click', (event) => this.handleClick(event));
    document.addEventListener('wheel', (event) => this.handleWheel(event));
    document.addEventListener('keydown', (event) => this.handleKey(event));
  }

  /** Whether a gesture begins on the map rather than on the interface over it. */
  startsOnMap(event) {
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest(INTERFACE)) {
      return false;
    }
    return this.isOverMap(event);
  }

  handlePointerDown(event) {
    if (!this.startsOnMap(event)) {
      return;
    }
    // Without this, a finger that drifts over a button mid-drag can lose the
    // gesture to it instead -- captured, every later event for this pointer
    // keeps coming here regardless of what it is currently over.
    if (event.pointerType !== 'mouse' && event.target?.setPointerCapture) {
      event.target.setPointerCapture(event.pointerId);
    }
    this.contacts.set(event.pointerId ?? 0, { x: event.clientX, y: event.clientY });
    if (this.contacts.size === 1) {
      // Sync first so the initial drag delta is zero instead of a jump from (0, 0).
      this.trackPointer(event);
      this.pointerDown = true;
      this.holdsGround = event.pointerType === 'touch' || event.pointerType === 'pen';
      this.smoothedTouch = null;
      return;
    }
    this.beginPinch();
  }

  handlePointerMove(event) {
    const id = event.pointerId ?? 0;
    if (this.contacts.has(id)) {
      this.contacts.set(id, { x: event.clientX, y: event.clientY });
    }
    if (this.pinch) {
      if (this.contacts.size >= 2) {
        this.updatePinch();
      }
      return;
    }
    this.handleMove(event);
  }

  handlePointerUp(event) {
    this.contacts.delete(event.pointerId ?? 0);
    if (this.pinch) {
      // The finger left behind does nothing until it too is lifted: picking
      // a wall back up mid-gesture would lay stone the player never drew.
      if (this.contacts.size < 2) {
        this.pinch = null;
        this.camera.release();
      }
      return;
    }
    if (this.contacts.size > 0) {
      return;
    }
    this.pointerDown = false;
    this.zoomAnchor = null;
    this.chainPoint = null;
    this.smoothedTouch = null;
    this.renderer.releaseBuildTrail();
    this.camera.release();
  }

  /**
   * A second finger turns whatever the first was doing into a camera move.
   * A wall half drawn by the first finger is dropped rather than finished,
   * since the player has plainly stopped drawing it.
   */
  beginPinch() {
    this.pointerDown = false;
    this.chainPoint = null;
    this.renderer.releaseBuildTrail();
    this.zoomAnchor = null;
    this.pinch = this.measurePinch();
  }

  /** The gap between the first two contacts, and the point halfway between them. */
  measurePinch() {
    const [first, second] = this.contacts.values();
    return {
      gap: Math.hypot(second.x - first.x, second.y - first.y),
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  }

  /**
   * Zoom by how far the fingers have spread since the last move, about the
   * point between them, and pan by how far that point has travelled -- the
   * ground under the fingers stays under the fingers.
   */
  updatePinch() {
    const now = this.measurePinch();
    if (this.pinch.gap > 0 && now.gap > 0) {
      this.camera.zoomAt(now.midpoint, now.gap / this.pinch.gap, { direct: true });
    }
    this.camera.panFrom(this.pinch.midpoint, now.midpoint, { direct: true });
    this.pinch = now;
    this.onChange();
  }

  selectTool(tool) {
    this.tool = this.tool === tool ? 'move' : tool;
    this.applyTool();
    if (this.tool === 'attack') {
      this.openDispatchMenu();
    } else {
      this.hud.hideDispatchMenu();
      this.game.deselectGuards();
    }
    const hint = TOOL_HINTS[this.tool];
    if (hint) {
      this.hud.showActionHint(hint);
    } else if (this.tool !== 'attack') {
      this.hud.clearActionHint();
    }
  }

  resetTool() {
    this.tool = 'move';
    this.applyTool();
    this.hud.hideDispatchMenu();
    this.hud.clearActionHint();
    this.game.deselectGuards();
    this.renderer.releaseBuildTrail();
  }

  /**
   * The open battleground mode's placement phase: shows the roster dock and
   * wires each button to pick out what a tap on the field places next (see
   * handleClick). The Build tool still works throughout, for earthworks.
   */
  beginPlacement() {
    this.resetTool();
    this.hud.showBattlePrep(this.game, (typeId) => this.selectPendingUnit(typeId));
    this.hud.showActionHint('Tap a company below, then tap the field to place it');
  }

  selectPendingUnit(typeId) {
    this.pendingUnit = this.pendingUnit === typeId ? null : typeId;
    this.hud.setBattleSelection(this.pendingUnit);
  }

  /** Start Battle pressed: the roster dock comes down and no more placing happens. */
  endPlacement() {
    this.pendingUnit = null;
    this.hud.hideBattlePrep();
    this.resetTool();
  }

  /** Show the tier picker above the castle, so an order carries a company. */
  openDispatchMenu() {
    if (this.game.dispatchOptions().length === 0) {
      return;
    }
    // Anchored to the Attack button itself, not the castle -- a fixed
    // screen point the player's eye is already on, rather than a world
    // point that can drift off-screen as the camera pans or zooms.
    const button = typeof document !== 'undefined' ? document.getElementById('attackTool') : null;
    const rect = button?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.left + rect.width / 2, y: rect.top }
      : { x: this.camera.width / 2, y: this.camera.height / 2 };
    this.hud.showActionHint('Choose a company to muster');
    this.refreshDispatchMenu(screen);
  }

  /**
   * (Re)draws the tier picker against whatever is on offer right now, so a
   * one-time option -- the Emperor among them -- disappears the moment it
   * is spent rather than sitting there clickable with nothing left to give.
   * Left open after a pick rather than hidden, so several companies can be
   * mustered in a row -- tapping the map (see handleAttackTap) is what
   * closes it, once the player has moved on to selecting and sending them.
   */
  refreshDispatchMenu(screen) {
    const options = this.game.dispatchOptions();
    if (options.length === 0) {
      this.hud.hideDispatchMenu();
      return;
    }
    this.hud.showDispatchMenu(options, screen, (typeId) => {
      const option = options.find((candidate) => candidate.id === typeId);
      const result = this.game.sendGuard(typeId);
      if (!result.sent) {
        const reason = result.status === 'unique'
          ? `Only one ${option.name} can ever be mustered`
          : `${option.name} costs $${option.cost} to muster`;
        this.hud.showMessage(reason);
        return;
      }
      this.hud.showActionHint('Tap a company to select it, then tap again to send it');
      this.onChange();
      this.refreshDispatchMenu(screen);
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

  /**
   * Where the cursor is pointing on the ground, following whatever hill is
   * under it. Everything the player aims at -- a wall, a company's orders,
   * the castle -- stands on the landscape, so reading the cursor against a
   * flat plane put it somewhere else entirely wherever the ground was not
   * at sea level.
   */
  pointerOnGround() {
    return this.camera.toWorld(this.pointer, this.groundHeight);
  }

  trackPointer(event) {
    const previous = { ...this.pointer };
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    return previous;
  }

  handleClick(event) {
    if (!this.startsOnMap(event)) {
      return;
    }
    if (this.pendingUnit && this.tool === 'move') {
      this.trackPointer(event);
      this.placePendingUnit();
      this.onChange();
      return;
    }
    if (this.tool === 'upgrade') {
      this.trackPointer(event);
      if (this.game.upgradeCastleAt(this.pointerOnGround())) {
        this.resetTool();
      }
      this.onChange();
      return;
    }
    if (this.tool === 'attack') {
      this.trackPointer(event);
      this.handleAttackTap(this.pointerOnGround());
      this.onChange();
      return;
    }
    // Repair and Fortify no longer need a drag across the section -- a
    // single tap in its vicinity (see WALL.pickRadius) is enough, which
    // matters far more on a touchscreen than a mouse: sweeping precisely
    // along a thin wall with a fingertip is genuinely hard.
    if (this.tool === 'repair') {
      this.trackPointer(event);
      this.dragRepair();
      this.onChange();
      return;
    }
    if (this.tool === 'fortify') {
      this.trackPointer(event);
      this.dragFortify();
      this.onChange();
    }
  }

  /**
   * The Attack tool's own two-step order: an empty-handed tap picks out
   * whatever companies are nearby (see Game#selectGuardsNear), and a tap
   * with something already selected sends that group to hold the new
   * ground (see Game#orderGuards) instead. A tap always closes the tier
   * picker -- mustering is done, this tap is about commanding.
   */
  handleAttackTap(point) {
    this.hud.hideDispatchMenu();
    const selected = this.game.selectedGuards;
    if (selected.length > 0) {
      const starts = selected.map((guard) => ({ ...guard.position }));
      this.game.orderGuards(selected, point);
      const destinations = selected.map((guard) => ({ ...guard.orders }));
      this.renderer.pingMoveOrder(starts, destinations, point, this.groundHeight(point.x, point.y));
      this.hud.showActionHint('Tap a company to select it, then tap again to send it');
      return;
    }
    const found = this.game.selectGuardsNear(point);
    const ground = this.groundHeight(point.x, point.y);
    this.renderer.pingSelection(point.x, point.y, ground);
    if (found.length > 0) {
      this.hud.showActionHint('Tap again to send them there');
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
        this.panMap(previous);
    }
    this.onChange();
  }

  /**
   * A finger's own reported position is noisier, sample to sample, than a
   * mouse's -- panned exactly as reported, that noise shows up as a visible
   * jitter with every step. Smoothing it here, before it ever reaches the
   * camera, takes the jitter out while staying tight enough that the
   * ground still reads as held rather than trailing behind the finger --
   * see Camera#panFrom's own note on why touch tracks directly at all.
   */
  panMap(previous) {
    if (!this.holdsGround) {
      this.camera.panFrom(previous, this.pointer, { direct: false });
      return;
    }
    if (!this.smoothedTouch) {
      this.smoothedTouch = { ...previous };
      this.panRampStep = 0;
    }
    const ramp = Math.min(1, this.panRampStep / PAN_RAMP_SAMPLES);
    const smoothing = PAN_RAMP_START + (TOUCH_PAN_SMOOTHING - PAN_RAMP_START) * ramp;
    this.panRampStep += 1;
    const from = { ...this.smoothedTouch };
    this.smoothedTouch.x += (this.pointer.x - this.smoothedTouch.x) * smoothing;
    this.smoothedTouch.y += (this.pointer.y - this.smoothedTouch.y) * smoothing;
    this.camera.panFrom(from, this.smoothedTouch, { direct: true });
  }

  /**
   * Which section the repair or fortify tool would act on right now, so the
   * renderer can pick it out before a click commits to anything. Any other
   * tool leaves nothing highlighted.
   */
  updateHover() {
    const hovered = HOVER_TOOLS.has(this.tool)
      ? this.game.wallAt(this.pointerOnGround())
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

  /** Places whatever roster type is pending at the tapped point -- see selectPendingUnit. */
  placePendingUnit() {
    const result = this.game.placeGuard(this.pendingUnit, this.pointerOnGround());
    if (result.placed) {
      this.hud.updateBattleBudget(this.game);
      return;
    }
    if (result.status === 'poor') {
      this.hud.showMessage('Not enough points left');
      return;
    }
    if (result.status === 'zone') {
      this.hud.showMessage('Place your troops south of the start line');
      return;
    }
    if (result.status === 'unique') {
      this.hud.showMessage('Only one Emperor can be fielded');
    }
  }

  /**
   * Traces the drag itself, point by point, rather than reducing it to a
   * straight line -- gold while the latest attempt along it could actually
   * be built, red the moment one could not. See Renderer#setBuildTrail.
   *
   * In the open battleground mode this lays earthworks instead of stone --
   * shorter ones, since a ramp of dirt is a far smaller undertaking than a
   * wall -- see EARTHWORK.
   */
  dragBuild() {
    const bounds = this.game.mode === 'battle' ? EARTHWORK : WALL;
    const target = this.pointerOnGround();
    if (!this.chainPoint) {
      this.chainPoint = target;
      this.trail = [target];
      this.renderer.setBuildTrail(this.trail, true);
      return;
    }
    this.trail.push(target);
    const span = distance(this.chainPoint, target);
    if (span <= bounds.minLength || span >= bounds.maxLength) {
      this.renderer.setBuildTrail(this.trail, true);
      return;
    }

    const result = this.game.mode === 'battle'
      ? this.game.buildEarthwork(this.chainPoint, target)
      : this.game.buildWall(this.chainPoint, target);
    const valid = CHAIN_CONTINUES.has(result.status);
    this.renderer.setBuildTrail(this.trail, valid);
    if (valid) {
      // Carry on from the snapped end so chains follow walls and city edges.
      this.chainPoint = result.end ?? target;
      return;
    }
    // Blocked, wet or too poor: the trail itself has already turned red at
    // the point the drag actually reached, but chainPoint is deliberately
    // left alone -- a refused segment does not throw away the chain, so the
    // very next drag can still snap on and try a different end without
    // starting over.
    if (result.status === 'blocked') {
      this.hud.showMessage('Walls cannot cross the city');
      return;
    }
    if (result.status === 'water') {
      this.hud.showMessage('Walls cannot be laid in water');
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
    this.game.removeWallAt(this.pointerOnGround());
  }

  dragRepair() {
    const result = this.game.repairWallAt(this.pointerOnGround());
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
    const result = this.game.upgradeWallAt(this.pointerOnGround());
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
      this.undo();
    }
  }

  /** Take back the last section laid -- Ctrl+Z, or the undo button on a touchscreen. */
  undo() {
    if (this.game.mode === 'battle') {
      this.game.undoLastPlacement();
      this.hud.updateBattleBudget(this.game);
    } else {
      this.game.undoLastWall();
    }
    this.onChange();
  }
}
