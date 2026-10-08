import { ActiveSelection, FabricObject, Point } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { runLayout, layoutSubtree, relayoutAncestors } from "./layout/run";
import { StackResizeSession } from "./layout/stack/resize-session";
import { MIN_PAD, type AlignItems, type AlignSelf, type Arrangement, type ChildData, type ContainerData, type JustifyContent, type SizingData, type TextOverflow } from "./layout/types";
import { arrangeAsStack, arrangeFree } from "./layout/arrangement";
import { syncGroupControls } from "./ui/controls";
import { placeTopLeft, pointInObject, topLeft } from "./layout/geometry";
import type { CustomTextbox } from "./controls/CustomTextbox";
import { rulesOf } from "./capabilities";

/** Size presets of the UI (same vocabulary for containers and texts). */
export type SizePreset = "hug" | "hug-y" | "fixed";

const SIZE_PRESETS: Record<SizePreset, Pick<SizingData, "x" | "y">> = {
  "hug": { x: "hug", y: "hug" },
  "hug-y": { x: "fixed", y: "hug" },
  "fixed": { x: "fixed", y: "fixed" },
};
import { clampToRoom } from "./layout/stack/room";
import { placeBlockAbove } from "./layout/z-order";
import { fitFreeAncestors } from "./layout/free/fit";
import { SubtreeDrag } from "./layout/subtree-drag";
import { FreeResizeSession } from "./layout/free/resize-session";
import { InsertChildSession } from "./layout/stack/sessions/insert-child";
import { createDropSession } from "./layout/stack/sessions/drop";
import type { LayoutSession } from "./layout/stack/sessions/session";
import { layoutOf, containerDataOf, childDataOf, isContainerObject, isFreeContainer, sizingOf, paddingOf, directionOf, updateContainer, updateChild, updateLayout, uniformPadding, isStackContainer } from "./layout/model";
import { childrenOf, parentContainerOf, findById } from "./layout/hierarchy";
import { isTextObject } from "./layout/text";

// ── Types ───────────────────────────────────────────────────────────

export interface LayoutManagerCallbacks {
  /** Called after a layout relationship is committed (drag-to-layout or panel edit). */
  onLayoutCreated?: () => void;
  /** Called after any layout change (relayout, margin/anchor/mode change). */
  onLayoutChanged?: () => void;
  /** The layerId of the container the user entered (clicked into), null otherwise. */
  getEnteredContainerId?: () => string | null;
}

/**
 * Drag-to-layout state machine
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
 *   - native Fabric drags → object:moving / mouse events;
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

// ── LayoutManager ───────────────────────────────────────────────────

/**
 * Manages layout relationships between canvas objects.
 *
 * Two responsibilities:
 * 1. **Drag-to-layout**: when a text is dragged over a shape, creates a
 *    container/child layout relationship after a short delay, with live
 *    preview, rollback support, and visual guides.
 * 2. **Automatic relayout**: keeps container/child dimensions in sync
 *    when text content changes or containers are moved/resized.
 */
export class LayoutManager {
  private canvas: DesignCanvas;
  private callbacks: LayoutManagerCallbacks;
  private guides: CanvasGuides;
  private dtl: DtlState = { phase: "idle", cooldownUntil: 0 };
  private resizeSession: StackResizeSession | null = null;
  /** Le redimensionnement d'un groupe en cours (ouvert à before:transform). */
  private freeResize: FreeResizeSession | null = null;
  /** Les descendants qui suivent les objets déplacés (un groupe, une sélection multiple). */
  private followers: SubtreeDrag | null = null;

  constructor(canvas: DesignCanvas, callbacks: LayoutManagerCallbacks = {}, guideColor?: string) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.guides = new CanvasGuides(canvas, guideColor);
    this.setupEventListeners();
  }

  /** Set or update callbacks after construction (merges with existing). */
  setCallbacks(callbacks: LayoutManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Run layout on all canvas objects (programmatic relayout). */
  relayout(): void {
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  /** A layout change: everything settles, then the host hears about it. */
  private changed(): void {
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** A panel edit on a container's own block (ignored on anything else). */
  private editContainer(obj: FabricObject, patch: Partial<ContainerData>): void {
    if (!isContainerObject(obj)) return;
    updateContainer(obj, patch);
    this.changed();
  }

  /** A panel edit on a child's block (ignored outside a container). */
  private editChild(obj: FabricObject, patch: Partial<ChildData>): void {
    if (!childDataOf(obj)) return;
    updateChild(obj, patch);
    this.changed();
  }

  /**
   * Set the size mode of a container or a text:
   * - "hug": width and height follow the content
   * - "hug-y": fixed width (texts wrap), height follows the content
   * - "fixed": fixed width and height (texts apply their overflow)
   * Choosing a mode drops the floor set by the handles (`minSize`): the box fits its
   * content again, as the mode says.
   */
  setMode(obj: FabricObject, mode: SizePreset): void {
    const isText = isTextObject(obj);
    if (!isContainerObject(obj) && !isText) return;

    const { minSize: _floor, ...current } = sizingOf(obj);
    const sizing: SizingData = { ...current, ...SIZE_PRESETS[mode] };

    if (isText) (obj as unknown as CustomTextbox).setSizing(sizing);
    else updateLayout(obj, { sizing });
    this.changed();
  }

  /** What a text does when its box is smaller than its content. */
  setOverflow(obj: FabricObject, overflow: TextOverflow): void {
    if (!isTextObject(obj)) return;
    (obj as unknown as CustomTextbox).setTextOverflow(overflow);
    this.changed();
  }

  /** Padding of a container — one side, or "all" four. */
  setPadding(obj: FabricObject, side: string, value: number): void {
    const sides = side === "all" ? ["top", "right", "bottom", "left"] : [side];
    const padding = { ...paddingOf(containerDataOf(obj)) };
    for (const s of sides) (padding as Record<string, number>)[s] = value;
    this.editContainer(obj, { padding });
  }

  /** Un groupe libre ou rangé (une pile) — la bascule ne fait rien sauter (cf. arrangement). */
  setArrangement(obj: FabricObject, arrangement: Arrangement): void {
    const cd = containerDataOf(obj);
    if (!cd || (cd.arrangement ?? "stack") === arrangement) return;

    const objects = this.canvas.getObjects();
    if (arrangement === "stack") arrangeAsStack(obj, objects);
    else arrangeFree(obj, objects);
    syncGroupControls(obj);
    this.changed();
  }

  /**
   * Une forme devient un bloc : un container vide, à sa taille, en colonne — les objets
   * qu'on y glisse s'y rangent. Glisser un objet sur une forme simple ne la change plus
   * en container : c'est ce geste-ci, ou grouper puis ranger. Dégrouper la rend simple.
   */
  makeContainer(obj: FabricObject): void {
    if (isContainerObject(obj) || !rulesOf(obj).hosts) return;
    const tl = topLeft(obj);
    obj.set({ originX: "left", originY: "top" });
    placeTopLeft(obj, tl.x, tl.y);
    updateLayout(obj, { sizing: { x: "fixed", y: "fixed" }, container: { padding: uniformPadding(MIN_PAD) } });
    this.changed();
  }

  /** Cross-axis alignment of one child in its stack. */
  setAlignSelf(obj: FabricObject, value: string): void {
    this.editChild(obj, { alignSelf: value as AlignSelf });
  }

  /** Space between the children of a stack. */
  setGap(obj: FabricObject, value: number): void {
    this.editContainer(obj, { gap: Math.max(0, value) });
  }

  /** Direction of a stack. */
  setFlexDirection(obj: FabricObject, direction: "column" | "row"): void {
    this.editContainer(obj, { flexDirection: direction });
  }

  /** Cross-axis alignment of a stack's children. */
  setAlignItems(obj: FabricObject, value: string): void {
    this.editContainer(obj, { alignItems: value as AlignItems });
  }

  /** Main-axis distribution of a stack's children. */
  setJustifyContent(obj: FabricObject, value: string): void {
    this.editContainer(obj, { justifyContent: value as JustifyContent });
  }

  // ── External drag API ──────────────────────────────────────────────
  //
  // These methods let an external drag source (e.g. DropHandler during
  // an HTML drag) drive the same DTL state machine that object:moving
  // normally drives. The source object does NOT need to be on the canvas
  // yet — it will be added automatically when the session anchors.

  /**
   * Advance the DTL state machine for an externally-dragged object.
   * Call this on every dragover frame with the source object and the
   * cursor position in scene coordinates.
   *
   * The source's position is updated to follow the cursor.
   */
  tickExternalDrag(source: FabricObject, cursor: { x: number; y: number }): void {
    // Keep the source centered on the cursor, whatever its origin
    source.setPositionByOrigin(new Point(cursor.x, cursor.y), "center", "center");
    source.setCoords();

    switch (this.dtl.phase) {
      case "anchored":
        this.handleAnchoredMoving(cursor);
        break;
      case "pending":
        this.handlePendingMoving(source, cursor);
        break;
      case "hovering":
        this.handleHoveringMoving(source, cursor);
        break;
      case "idle":
        this.handleIdleMoving(source, cursor);
        break;
    }

    // Native drags are rendered by Fabric on mouse:move; external drags
    // have no such driver, so render here once the source is on canvas.
    if (this.canvas.getObjects().includes(source)) {
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Commit the current DTL session from an external drag.
   * Call this on drop. No-op if no session is active (the caller should
   * handle the "simple add" case itself).
   *
   * Returns true if a session was committed, false otherwise.
   */
  commitExternalDrag(): boolean {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return true;
    }
    // If we're in hovering/pending, just clean up
    this.resetToIdle();
    return false;
  }

  /**
   * Rollback any in-progress DTL state from an external drag.
   * Call this on dragleave / cancel. Rolls back the session if anchored,
   * clears timers otherwise. The caller owns the source object and is
   * responsible for removing it from the canvas.
   */
  rollbackExternalDrag(): void {
    if (this.dtl.phase === "anchored") {
      this.dtl.session.rollback();
    }
    this.resetToIdle();
  }

  /** Whether the DTL state machine is currently in ANCHORED phase. */
  get isAnchored(): boolean {
    return this.dtl.phase === "anchored";
  }

  /** Clean up event listeners. */
  dispose(): void {
    this.resetToIdle();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:resizing", this.onResizingBound);
    this.canvas.off("text:changed", this.onTextChangedBound);
    this.canvas.off("before:transform", this.onBeforeTransformBound);
  }

  // ── Event wiring ──────────────────────────────────────────────────

  private onMovingBound = (e: any) => this.onMoving(e);
  private onModifiedBound = (e: any) => this.onModified(e);
  private onResizingBound = (e: any) => this.onResizing(e);
  private onTextChangedBound = (e: any) => this.onTextChanged(e);
  private onBeforeTransformBound = (e: any) => this.onBeforeTransform(e);

  private setupEventListeners(): void {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:resizing", this.onResizingBound);
    this.canvas.on("text:changed", this.onTextChangedBound);
    this.canvas.on("before:transform", this.onBeforeTransformBound);
  }

  // ── Canvas event handlers ─────────────────────────────────────────

  private onMoving(e: any): void {
    const obj = e.target;

    // Plusieurs objets déplacés : pas de dépôt dans un container (une session ne prend
    // qu'un enfant), leurs descendants suivent
    if (obj instanceof ActiveSelection) {
      this.moveFollowers(obj, obj.getObjects(), e.transform);
      return;
    }

    const layout = layoutOf(obj);

    // Container being dragged → reposition its children (not the full canvas,
    // otherwise runLayout would snap this container back to its flex position
    // if it's also a child of another container).
    if (layout?.container) {
      const isSessionChild = this.dtl.phase === "anchored" && this.dtl.session.child === obj;
      if (isFreeContainer(obj)) {
        // A group's content follows it, untouched
        this.moveFollowers(obj, [obj], e.transform);
      } else if (!isSessionChild) {
        layoutSubtree(obj, this.canvas.getObjects());
        this.canvas.renderAll();
      }
      // Don't return — the container can also be dragged into another shape
    }

    // Child of a group, moved inside it: it goes where it is put, the group's box follows
    if (layout?.child && this.dtl.phase !== "anchored") {
      const parent = this.findParentContainer(obj);
      if (parent && isFreeContainer(parent)) {
        fitFreeAncestors(parent, this.canvas.getObjects());
        this.canvas.renderAll();
        return;
      }
    }

    // Child dragged inside its entered container → start reattach session
    if (layout?.child && this.dtl.phase !== "anchored") {
      const entered = this.callbacks.getEnteredContainerId?.();
      if (entered === layout.child.parentId) {
        const container = findById(this.canvas.getObjects(), entered);
        if (container) {
          const cursor = this.canvas.getScenePoint(e.e);
          const session = createDropSession(this.canvas, container, obj, cursor, { reattach: true });
          this.showSessionGuides(session);
          this.canvas.renderAll();
          this.dtl = { phase: "anchored", session, cooldownUntil: 0, source: obj, root: null };
        }
        return;
      }
    }

    // Already-attached child outside its entered container → ignore
    if (layout?.child && this.dtl.phase !== "anchored") return;

    const cursor = this.canvas.getScenePoint(e.e);

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

  /**
   * Les descendants des objets déplacés (un groupe, ou les objets d'une sélection multiple
   * — jamais dans la sélection, cf. SelectionManager) suivent la translation de `target`
   * depuis le début du geste. Sans relayout : dans une sélection, les positions des
   * containers sont relatives à elle.
   */
  private moveFollowers(target: FabricObject, moved: FabricObject[], transform: any): void {
    if (!this.followers || this.followers.transform !== transform) {
      this.followers = SubtreeDrag.begin(target, moved, transform, this.canvas.getObjects());
    }
    this.followers.follow(target);
  }

  /** Le début d'une transformation : un groupe qu'on redimensionne garde son état de départ. */
  private onBeforeTransform(e: any): void {
    const target = e.transform?.target;
    this.freeResize = null;
    if (!target || !isFreeContainer(target) || e.transform.action !== "resizing") return;
    this.freeResize = FreeResizeSession.begin(target, this.canvas.getObjects());
  }

  /** A text inside a container was edited → its ancestors adapt. */
  private onTextChanged(e: any): void {
    const layout = layoutOf(e.target);
    if (!layout?.child) return;
    this.changed();
  }

  private onModified(e: any): void {
    const obj = e.target;

    // Le magnétisme a pu décaler l'objet après le dernier object:moving
    if (this.followers) {
      const moved = obj instanceof ActiveSelection ? obj.getObjects() : [obj];
      this.moveFollowers(obj, moved, this.followers.transform);
    }
    this.followers = null;

    if (obj instanceof ActiveSelection) {
      this.resetToIdle();
      return;
    }

    // A group resized, or something moved / resized inside a group: everything settles
    const parent = this.findParentContainer(obj);
    const resizedGroup = this.freeResize;
    this.freeResize = null;
    if (this.dtl.phase === "idle" && (resizedGroup || (parent && isFreeContainer(parent)))) {
      this.changed();
      return;
    }

    // Text child resized → its container settles (outside any drag session)
    const childLayout = layoutOf(obj);
    if (childLayout?.child && isTextObject(obj) && this.dtl.phase === "idle" &&
        e.transform?.action === "resizing") {
      this.changed();
      return;
    }

    // Container modified → its resize session ends, then relayout
    const layout = layoutOf(obj);
    if (layout?.container) {
      this.resizeSession = null;
      this.changed();
      // Don't return if we have an active dtl session — fall through to commit it
      if (this.dtl.phase !== "anchored" && this.dtl.phase !== "pending") return;
    }

    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return;
    }

    if (this.dtl.phase === "pending") {
      const cursor = this.canvas.getScenePoint(e.e);
      if (pointInObject(cursor, this.dtl.target)) {
        clearTimeout(this.dtl.timer);
        this.dtl = { ...this.dtl, source: obj, cursor };
        this.guides.clear();
        this.promoteToAnchored();
        this.doCommit();
        return;
      }
    }

    this.resetToIdle();
  }

  private onResizing(e: any): void {
    const target = e.target;
    const layout = layoutOf(target);

    // Text, shape or image child resized live → the room stops it (a text is
    // pushed by the layout itself), and its container chain follows
    if (layout?.child && !layout.container) {
      const objects = this.canvas.getObjects();
      const parent = this.findParentContainer(target);
      // In a group, there is no room to respect: the group follows
      if (parent && isFreeContainer(parent)) {
        fitFreeAncestors(parent, this.canvas.getObjects());
        this.canvas.renderAll();
        return;
      }
      if (!isTextObject(target)) clampToRoom(target, e.transform, objects);
      const pLayout = layoutOf(parent);
      if (parent && pLayout?.container) {
        layoutSubtree(parent, objects);
        relayoutAncestors(parent, objects);
        this.canvas.renderAll();
      }
      return;
    }

    if (!layout?.container) return;

    // A group: its content absorbs the resize, uniformly, around the fixed corner
    const groupResize = this.freeResize;
    if (groupResize && groupResize.container === target) {
      groupResize.step(e.transform);
      this.canvas.renderAll();
      return;
    }

    // Create session on first resizing frame
    if (!this.resizeSession) {
      this.resizeSession = new StackResizeSession(target, e.transform?.corner);
    }

    this.resizeSession.handleResizing(this.canvas.getObjects());
    this.canvas.renderAll();
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

    this.callbacks.onLayoutChanged?.();
    this.callbacks.onLayoutCreated?.();

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
    const entered = this.callbacks.getEnteredContainerId?.();

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
