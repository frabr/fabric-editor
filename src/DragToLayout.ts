/**
 * Glisser un objet dans une pile : la machine à états du dépôt avec temporisation
 * (DTL, drag-to-layout), ses minuteries, ses guides et sa session. Pilotée par
 * LayoutManager (les gestes Fabric) et par la toolbox (le glisser externe).
 *
 * Seule une pile reçoit un dépôt : une forme simple devient un bloc par makeContainer,
 * un groupe ne reçoit rien (on dégroupe, on regroupe).
 */
import { Point, type FabricObject } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import type { CanvasGuides } from "./ui/guides";
import type { LayoutManagerCallbacks } from "./LayoutManager";
import { pointInObject } from "./layout/geometry";
import { rulesOf } from "./capabilities";
import { placeBlockAbove } from "./layout/z-order";
import { InsertChildSession } from "./layout/stack/sessions/insert-child";
import { createDropSession } from "./layout/stack/sessions/drop";
import type { LayoutSession } from "./layout/stack/sessions/session";
import { layoutOf, isStackContainer, directionOf } from "./layout/model";
import { childrenOf, parentContainerOf } from "./layout/hierarchy";

/**
 * The state machine
 * ─────────────────────────────
 * Governs what happens when a dragged object hovers over a potential
 * container. Four phases, strictly sequential:
 *
 *   IDLE → HOVERING → PENDING → ANCHORED
 *
 * IDLE      Nothing happening. Hit-test runs each frame to detect
 *           a shape under the cursor.
 *
 * HOVERING  A shape was detected but we wait silently (no visual
 *           feedback) for HOVER_DELAY_MS. This lets the user drag
 *           across containers without triggering anything. If the
 *           cursor leaves the shape, we go back to IDLE.
 *
 * PENDING   The hover timer fired. We show the hint highlight
 *           (hatched overlay + dashed border) and start a second
 *           timer (ANCHOR_DELAY_MS). The user sees "this shape is
 *           about to become the target". If the deepest target
 *           changes, the pending timer restarts. If the cursor
 *           leaves, we go back to IDLE.
 *
 * ANCHORED  The pending timer fired. A layout session is created
 *           (ContainerizeSession or InsertChildSession) and the
 *           child snaps into the container with live layout. On
 *           exit: if nested, we pop to the parent (back to
 *           ANCHORED on the parent); otherwise back to IDLE with
 *           a cooldown.
 *
 * Depth resolution: during HOVERING and PENDING, we resolve the
 * deepest drop target under the cursor (bottom-up) so the most
 * nested valid target is always preferred.
 *
 * Drivers: the machine advances on cursor ticks, which come from two
 * interchangeable sources:
 *   - native Fabric drags → object:moving (LayoutManager calls move());
 *   - external drags (HTML dragover from a toolbox) → tickExternalDrag,
 *     ended by commitExternalDrag (drop) or rollbackExternalDrag
 *     (dragleave / cancel). The external source object is owned by the
 *     caller (DropHandler), which adds/removes it from the canvas.
 */

interface IdleState {
  phase: "idle";
  cooldownUntil: number;
}

interface HoveringState {
  phase: "hovering";
  timer: ReturnType<typeof setTimeout>;
  target: FabricObject;
  source: FabricObject;
  cursor: { x: number; y: number };
  cooldownUntil: number;
}

interface PendingState {
  phase: "pending";
  timer: ReturnType<typeof setTimeout>;
  target: FabricObject;
  source: FabricObject;
  cursor: { x: number; y: number };
  cooldownUntil: number;
}

interface AnchoredState {
  phase: "anchored";
  session: LayoutSession;
  cooldownUntil: number;
  /** The dragged object (needed to recreate sessions on depth pop). */
  source: FabricObject;
  /** The outermost container from the original hit-test (for depth pop). */
  root: FabricObject | null;
}

type DtlState = IdleState | HoveringState | PendingState | AnchoredState;

// ── Constants ───────────────────────────────────────────────────────

/** Silent hover before any visual feedback. */
const HOVER_DELAY_MS = 700;
/** Visual hint before anchoring. */
const ANCHOR_DELAY_MS = 500;

export class DragToLayout {
  private dtl: DtlState = { phase: "idle", cooldownUntil: 0 };

  constructor(
    private readonly canvas: DesignCanvas,
    private readonly guides: CanvasGuides,
    private readonly callbacks: () => LayoutManagerCallbacks,
  ) {}

  /** A session is live: the dragged object is in a container. */
  get isAnchored(): boolean {
    return this.dtl.phase === "anchored";
  }

  /** Nothing is being dropped (no timer, no session). */
  get isIdle(): boolean {
    return this.dtl.phase === "idle";
  }

  /** A drop is armed: anchored, or its hint is showing. */
  get isArmed(): boolean {
    return this.dtl.phase === "anchored" || this.dtl.phase === "pending";
  }

  /** The object a live session is placing (the dragged one). */
  get sessionChild(): FabricObject | null {
    return this.dtl.phase === "anchored" ? this.dtl.session.child : null;
  }

  /** A pointer step of a native drag. */
  move(obj: FabricObject, cursor: { x: number; y: number }): void {
    switch (this.dtl.phase) {
      case "anchored":
        this.handleAnchoredMoving(cursor);
        break;
      case "pending":
        this.handlePendingMoving(obj, cursor);
        break;
      case "hovering":
        this.handleHoveringMoving(obj, cursor);
        break;
      case "idle":
        this.handleIdleMoving(obj, cursor);
        break;
    }
  }

  /** A child dragged inside its entered container: it is moved in it, live. */
  startReattach(container: FabricObject, child: FabricObject, cursor: { x: number; y: number }): void {
    const session = createDropSession(this.canvas, container, child, cursor, { reattach: true });
    this.showSessionGuides(session);
    this.canvas.renderAll();
    this.dtl = { phase: "anchored", session, cooldownUntil: 0, source: child, root: null };
  }

  /**
   * The drag ended (object:modified): a live session commits; a showing hint whose
   * target is under the pointer commits at once; anything else is dropped.
   */
  release(obj: FabricObject, cursor: { x: number; y: number }): void {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return;
    }
    if (this.dtl.phase === "pending" && pointInObject(cursor, this.dtl.target)) {
      clearTimeout(this.dtl.timer);
      this.dtl = { ...this.dtl, source: obj, cursor };
      this.guides.clear();
      this.promoteToAnchored();
      this.doCommit();
      return;
    }
    this.reset();
  }

  /**
   * Advance the machine for an externally-dragged object (toolbox), each dragover
   * frame, cursor in scene coordinates. The source follows the cursor; it does NOT
   * need to be on the canvas yet — it is added when the session anchors.
   */
  tick(source: FabricObject, cursor: { x: number; y: number }): void {
    // Keep the source centered on the cursor, whatever its origin
    source.setPositionByOrigin(new Point(cursor.x, cursor.y), "center", "center");
    source.setCoords();
    this.move(source, cursor);

    // Native drags are rendered by Fabric on mouse:move; external drags
    // have no such driver, so render here once the source is on canvas.
    if (this.canvas.getObjects().includes(source)) this.canvas.requestRenderAll();
  }

  /** On drop: commits a live session (true), or just cleans up (false). */
  commit(): boolean {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return true;
    }
    this.reset();
    return false;
  }

  /** On dragleave / cancel: rolls a live session back, clears timers otherwise. */
  rollback(): void {
    if (this.dtl.phase === "anchored") this.dtl.session.rollback();
    this.reset();
  }

  /** Back to idle (guides and timers cleared), with an optional cooldown. */
  reset(cooldownUntil = 0): void {
    this.resetToIdle(cooldownUntil);
  }

  // ── State machine: IDLE → HOVERING ────────────────────────────────

  private handleIdleMoving(draggedObj: FabricObject, cursor: { x: number; y: number }): void {
    if (Date.now() < this.dtl.cooldownUntil) return;

    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (shape) {
      const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
      this.startHovering(draggedObj, deepest, cursor);
    }
  }

  // ── State machine: HOVERING (silent) ─────────────────────────────

  private handleHoveringMoving(draggedObj: FabricObject, cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "hovering") return;

    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (!shape) {
      this.resetToIdle();
      return;
    }

    const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
    if (deepest !== this.dtl.target) {
      clearTimeout(this.dtl.timer);
      this.startHovering(draggedObj, deepest, cursor);
      return;
    }

    this.dtl.cursor = cursor;
  }

  private startHovering(
    draggedObj: FabricObject,
    target: FabricObject,
    cursor: { x: number; y: number },
  ): void {
    const timer = setTimeout(() => this.promoteToPending(), HOVER_DELAY_MS);

    this.dtl = {
      phase: "hovering",
      timer,
      target,
      source: draggedObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil,
    };
  }

  /** HOVERING timer fired → show guides and move to PENDING. */
  private promoteToPending(): void {
    if (this.dtl.phase !== "hovering") return;
    const { target, source, cursor } = this.dtl;
    this.startPending(source, target, cursor);
  }

  // ── State machine: PENDING (visual hint) ─────────────────────────

  private handlePendingMoving(draggedObj: FabricObject, cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "pending") return;

    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (!shape) {
      this.resetToIdle();
      return;
    }
    const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
    if (deepest !== this.dtl.target) {
      // Target changed — restart pending on the new target
      clearTimeout(this.dtl.timer);
      this.startPending(draggedObj, deepest, cursor);
      return;
    }

    this.dtl.cursor = cursor;
  }

  private startPending(
    draggedObj: FabricObject,
    target: FabricObject,
    cursor: { x: number; y: number },
  ): void {
    this.guides.showHintHighlight(target, target);
    this.canvas.renderAll();

    const timer = setTimeout(() => this.promoteToAnchored(), ANCHOR_DELAY_MS);

    this.dtl = {
      phase: "pending",
      timer,
      target,
      source: draggedObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil,
    };
  }

  // ── State machine: ANCHOR (PENDING → ANCHORED) ────────────────────

  /** PENDING timer fired → create a session and move to ANCHORED. */
  private promoteToAnchored(): void {
    if (this.dtl.phase !== "pending") return;
    const { target, source: child, cursor } = this.dtl;

    // Find the root (outermost container) for depth-pop support
    const root = this.findShapeUnderPoint(cursor, child);
    this.anchorOn(target, child, cursor, root);
  }

  // ── State machine: ANCHORED (during drag) ─────────────────────────

  private handleAnchoredMoving(cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "anchored") return;
    const { session, source, root } = this.dtl;

    const result = session.handleMoving(cursor);
    if (result === "exited") {
      // Session already rolled back internally.
      // If we're nested inside a root container, pop up to the parent.
      if (root && session.container !== root) {
        const parent = this.findParentContainer(session.container);
        if (parent && pointInObject(cursor, parent)) {
          this.anchorOn(parent, source, cursor, root);
          return;
        }
      }
      this.resetToIdle(Date.now() + 1000);
      return;
    }

    this.showSessionGuides(session);
    this.canvas.renderAll();
  }

  // ── Depth helpers ─────────────────────────────────────────────────

  /**
   * Walk down from `root` to find the deepest drop target under the
   * cursor. Returns `root` itself if no children qualify.
   */
  private findDeepestDropTarget(
    cursor: { x: number; y: number },
    root: FabricObject,
    exclude: FabricObject,
  ): FabricObject {
    let current = root;
    for (;;) {
      const child = this.findChildDropTarget(cursor, current, exclude);
      if (!child) return current;
      current = child;
    }
  }

  /**
   * Among the children of `container`, find the first one under the cursor
   * that can host (see rulesOf) — it would become a sub-container.
   */
  private findChildDropTarget(
    cursor: { x: number; y: number },
    container: FabricObject,
    exclude: FabricObject,
  ): FabricObject | null {
    const layout = layoutOf(container);
    if (!layout?.container) return null;
    const children = childrenOf(this.canvas.getObjects(), container);
    for (const { obj } of children) {
      if (obj === exclude) continue;
      if (!isDropTarget(obj)) continue;
      if (pointInObject(cursor, obj)) return obj;
    }
    return null;
  }

  /** The container `obj` is a child of. */
  private findParentContainer(obj: FabricObject): FabricObject | null {
    return parentContainerOf(obj, this.canvas.getObjects());
  }

  /** Transition to ANCHORED: create a session on the target and go live. */
  private anchorOn(
    target: FabricObject,
    child: FabricObject,
    cursor: { x: number; y: number },
    root: FabricObject | null = null,
  ): void {
    // If the child is not yet on the canvas (external drag), add it now
    const objects = this.canvas.getObjects();
    if (!objects.includes(child)) {
      this.canvas.add(child);
    }

    // Ensure the child renders above the container (z-index) — with its own
    // descendants, or a container child would pass over its own content
    const stack = this.canvas.getObjects();
    const containerIdx = stack.indexOf(target);
    const childIdx = stack.indexOf(child);
    if (containerIdx >= 0 && childIdx >= 0 && childIdx < containerIdx) {
      placeBlockAbove(stack, child, target).forEach((obj, index) => this.canvas.moveObjectTo(obj, index));
    }

    const session = createDropSession(this.canvas, target, child, cursor);

    this.guides.clear();
    this.showSessionGuides(session);
    this.canvas.renderAll();

    this.dtl = {
      phase: "anchored",
      session,
      cooldownUntil: this.dtl.cooldownUntil,
      source: child,
      root,
    };
  }

  // ── State machine: COMMIT ─────────────────────────────────────────

  private doCommit(): void {
    if (this.dtl.phase !== "anchored") return;
    const { session } = this.dtl;

    this.guides.clear();
    session.commit();

    this.callbacks().onLayoutChanged?.();
    this.callbacks().onLayoutCreated?.();

    this.dtl = { phase: "idle", cooldownUntil: 0 };
  }

  // ── Reset ─────────────────────────────────────────────────────────

  private resetToIdle(cooldownUntil = 0): void {
    this.guides.clear();
    if (this.dtl.phase === "pending" || this.dtl.phase === "hovering") {
      clearTimeout(this.dtl.timer);
    }
    this.dtl = { phase: "idle", cooldownUntil: cooldownUntil || this.dtl.cooldownUntil };
  }

  // ── Guide rendering ───────────────────────────────────────────────

  private showSessionGuides(session: LayoutSession): void {
    if (session instanceof InsertChildSession) {
      // InsertChildSession: show gap between children
      const allChildren = childrenOf(this.canvas.getObjects(), session.container);
      const childObjs = allChildren.map(c => c.obj);
      const layout = layoutOf(session.container);
      const direction = directionOf(layout?.container);
      this.guides.showInsertGuides(session.container, childObjs, direction);
    } else {
      // ContainerizeSession: show margin guides
      this.guides.showLayoutGuides(session.container, session.child);
    }
  }

  // ── Shape hit-testing ─────────────────────────────────────────────

  private findShapeUnderPoint(point: { x: number; y: number }, exclude?: FabricObject): FabricObject | null {
    const objects = this.canvas.getObjects().slice().reverse();
    const entered = this.callbacks().getEnteredContainerId?.();

    for (const obj of objects) {
      if (obj === exclude) continue;
      if (!isDropTarget(obj)) continue;
      const layout = layoutOf(obj);
      if (layout?.child) {
        // Allow child containers as targets inside the entered container
        if (!entered || layout.child.parentId !== entered) continue;
      }

      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
}

/**
 * Ce qui reçoit un objet qu'on glisse dessus : une pile (un container rangé), jamais une
 * forme simple ni un groupe — une forme devient un bloc par makeContainer.
 */
function isDropTarget(obj: FabricObject): boolean {
  return rulesOf(obj).hosts && isStackContainer(obj);
}
