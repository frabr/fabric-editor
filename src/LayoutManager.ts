import { ActiveSelection, FabricObject, Point } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { runLayout, relayoutSingle, bubbleUpLayout } from "./layout/reconcile";
import { ResizeSession } from "./layout/resize-session";
import {
  type LayoutData,
  type LayoutSession,
  type SizingData,
  type TextOverflow,
  sizingOf,
  isFreeContainer,
  type Arrangement,
} from "./layout/types";
import { arrangeAsStack, arrangeFree } from "./grouping";
import { syncGroupControls } from "./ui/controls";
import { pointInObject, isTextObject } from "./layout/geometry";
import type { CustomTextbox } from "./controls/CustomTextbox";
import { rulesOf } from "./capabilities";

/** Size presets of the UI (same vocabulary for containers and texts). */
export type SizePreset = "hug" | "hug-y" | "fixed";
import { resolveContainerChildren, scaledSize, setShapeSize } from "./layout/geometry";
import { availableRoom } from "./layout/room";
import { placeBlockAbove } from "./layout/stacking";
import { descendantsOf, fitFreeContainer, FreeResizeSession } from "./layout/free";
import { ContainerizeSession } from "./layout/containerize-session";
import { InsertChildSession } from "./layout/insert-child-session";

// ── Types ───────────────────────────────────────────────────────────

export interface LayoutManagerCallbacks {
  /** Called after a layout relationship is committed (drag-to-layout or panel edit). */
  onLayoutCreated?: () => void;
  /** Called after any layout change (relayout, margin/anchor/mode change). */
  onLayoutChanged?: () => void;
  /** Returns the active group layerId if we're in group-edit mode, null otherwise. */
  getActiveGroupId?: () => string | null;
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
  private resizeSession: ResizeSession | null = null;
  /** Le redimensionnement d'un groupe en cours (ouvert à before:transform). */
  private freeResize: FreeResizeSession | null = null;
  /** Les descendants d'une sélection multiple en cours de déplacement, et leur départ. */
  private followers: { transform: unknown; left: number; top: number; objects: Array<{ obj: FabricObject; left: number; top: number }> } | null = null;

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

  /**
   * Set the size mode of a container or a text:
   * - "hug": width and height follow the content
   * - "hug-y": fixed width (texts wrap), height follows the content
   * - "fixed": fixed width and height (texts apply their overflow)
   * Choosing a mode drops the floor set by the handles (`minSize`): the box fits its
   * content again, as the mode says.
   */
  setMode(obj: FabricObject, mode: SizePreset): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    const isText = isTextObject(obj);
    if (!layout?.container && !isText) return;

    const { minSize: _floor, ...current } = sizingOf(obj);
    const axes: Record<SizePreset, Pick<SizingData, "x" | "y">> = {
      "hug": { x: "hug", y: "hug" },
      "hug-y": { x: "fixed", y: "hug" },
      "fixed": { x: "fixed", y: "fixed" },
    };
    const sizing: SizingData = { ...current, ...axes[mode] };

    if (isText) (obj as unknown as CustomTextbox).setSizing(sizing);
    else obj.set("layout", { ...layout, sizing });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** What a text does when its box is smaller than its content. */
  setOverflow(obj: FabricObject, overflow: TextOverflow): void {
    if (!isTextObject(obj)) return;
    (obj as unknown as CustomTextbox).setTextOverflow(overflow);

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update padding on a container — one side, or "all" four. */
  setPadding(obj: FabricObject, side: string, value: number): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    if (!layout.container.padding) layout.container.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    const sides = side === "all" ? ["top", "right", "bottom", "left"] : [side];
    for (const s of sides) (layout.container.padding as Record<string, number>)[s] = value;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /**
   * Un groupe libre ou rangé (une pile) — la bascule ne fait rien sauter (cf. grouping).
   */
  setArrangement(obj: FabricObject, arrangement: Arrangement): void {
    const cd = (obj.get("layout") as LayoutData | undefined)?.container;
    if (!cd || (cd.arrangement ?? "stack") === arrangement) return;

    const objects = this.canvas.getObjects();
    if (arrangement === "stack") arrangeAsStack(obj, objects);
    else arrangeFree(obj, objects);
    syncGroupControls(obj);

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update alignSelf on a child layout object. */
  setAlignSelf(obj: FabricObject, value: string): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.child) return;

    layout.child.alignSelf = value as any;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update gap on a container. */
  setGap(obj: FabricObject, value: number): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    layout.container.gap = Math.max(0, value);
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update flex direction on a container. */
  setFlexDirection(obj: FabricObject, direction: "column" | "row"): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    layout.container.flexDirection = direction;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update alignItems on a container. */
  setAlignItems(obj: FabricObject, value: string): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    layout.container.alignItems = value as any;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update justifyContent on a container. */
  setJustifyContent(obj: FabricObject, value: string): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    layout.container.justifyContent = value as any;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
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

    const layout = obj.get?.("layout") as LayoutData | undefined;

    // Container being dragged → reposition its children (not the full canvas,
    // otherwise runLayout would snap this container back to its flex position
    // if it's also a child of another container).
    if (layout?.container) {
      const isSessionChild = this.dtl.phase === "anchored" && this.dtl.session.child === obj;
      if (isFreeContainer(obj)) {
        // A group's content follows it, untouched
        this.moveFollowers(obj, [obj], e.transform);
      } else if (!isSessionChild) {
        relayoutSingle(obj, layout.container, this.canvas.getObjects());
        this.canvas.renderAll();
      }
      // Don't return — the container can also be dragged into another shape
    }

    // Child of a group, moved inside it: it goes where it is put, the group's box follows
    if (layout?.child && this.dtl.phase !== "anchored") {
      const parent = this.findParentContainer(obj);
      if (parent && isFreeContainer(parent)) {
        this.fitGroupChain(parent);
        this.canvas.renderAll();
        return;
      }
    }

    // Child being dragged inside active group → start reattach session
    if (layout?.child && this.dtl.phase !== "anchored") {
      const activeGroup = this.callbacks.getActiveGroupId?.();
      if (activeGroup === layout.child.parentId) {
        const container = this.canvas.getObjects().find(
          (o) => o.get("layerId") === layout.child!.parentId,
        );
        if (container) {
          const cursor = this.canvas.getScenePoint(e.e);
          // Check if container has other children → use InsertChildSession for reorder
          const siblings = resolveContainerChildren(this.canvas.getObjects(), container)
            .filter(c => c.obj !== obj);
          let session: LayoutSession;
          if (siblings.length > 0) {
            session = InsertChildSession.reattach(this.canvas, container, obj, cursor);
          } else {
            session = ContainerizeSession.reattach(this.canvas, container, obj, cursor);
          }
          this.showSessionGuides(session);
          this.canvas.renderAll();
          this.dtl = { phase: "anchored", session, cooldownUntil: 0, source: obj, root: null };
        }
        return;
      }
    }

    // Already-attached child that isn't in group-edit mode → ignore
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
    let start = this.followers;
    if (!start || start.transform !== transform) {
      start = this.followers = {
        transform,
        left: transform?.original?.left ?? target.left,
        top: transform?.original?.top ?? target.top,
        objects: descendantsOf(this.canvas.getObjects(), moved).map((o) => ({ obj: o, left: o.left, top: o.top })),
      };
    }

    const dx = target.left - start.left;
    const dy = target.top - start.top;
    for (const f of start.objects) {
      f.obj.set({ left: f.left + dx, top: f.top + dy });
      f.obj.setCoords();
    }
  }

  /**
   * La boîte d'un groupe suit ses enfants, et celle des groupes qui le contiennent — pas
   * au-delà d'une pile pendant le geste (elle déplacerait le groupe, donc l'objet tenu) :
   * la pile se recale à la fin (relayout).
   */
  private fitGroupChain(group: FabricObject): void {
    const objects = this.canvas.getObjects();
    for (let current: FabricObject | null = group; current && isFreeContainer(current); current = this.findParentContainer(current)) {
      fitFreeContainer(current, objects);
    }
  }

  /** Le début d'une transformation : un groupe qu'on redimensionne garde son état de départ. */
  private onBeforeTransform(e: any): void {
    const target = e.transform?.target;
    this.freeResize = null;
    if (!target || !isFreeContainer(target) || e.transform.action !== "resizing") return;

    const tl = target.getPositionByOrigin("left", "top");
    const { w, h } = scaledSize(target);
    this.freeResize = new FreeResizeSession(target, this.canvas.getObjects(), { left: tl.x, top: tl.y, width: w, height: h });
  }

  /** A text inside a container was edited → its ancestors adapt. */
  private onTextChanged(e: any): void {
    const layout = e.target?.get?.("layout") as LayoutData | undefined;
    if (!layout?.child) return;
    this.relayout();
    this.callbacks.onLayoutChanged?.();
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
      this.relayout();
      this.callbacks.onLayoutChanged?.();
      return;
    }

    // Text child resized → its container settles (outside any drag session)
    const childLayout = obj?.get?.("layout") as LayoutData | undefined;
    if (childLayout?.child && isTextObject(obj) && this.dtl.phase === "idle" &&
        e.transform?.action === "resizing") {
      this.relayout();
      this.callbacks.onLayoutChanged?.();
      return;
    }

    // Container modified → commit resize session if active, then relayout
    const layout = obj.get?.("layout") as LayoutData | undefined;
    if (layout?.container) {
      if (this.resizeSession) {
        this.resizeSession.commit(this.canvas.getObjects());
        this.resizeSession = null;
      }
      this.relayout();
      this.callbacks.onLayoutChanged?.();
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
    const layout = target?.get?.("layout") as LayoutData | undefined;

    // Text, shape or image child resized live → the room stops it (a text is
    // pushed by the layout itself), and its container chain follows
    if (layout?.child && !layout.container) {
      const objects = this.canvas.getObjects();
      const parent = this.findParentContainer(target);
      // In a group, there is no room to respect: the group follows
      if (parent && isFreeContainer(parent)) {
        this.fitGroupChain(parent);
        this.canvas.renderAll();
        return;
      }
      if (!isTextObject(target)) clampToRoom(target, e.transform, objects);
      const pLayout = parent?.get?.("layout") as LayoutData | undefined;
      if (parent && pLayout?.container) {
        relayoutSingle(parent, pLayout.container, objects);
        bubbleUpLayout(parent, objects);
        this.canvas.renderAll();
      }
      return;
    }

    if (!layout?.container) return;

    // A group: its content absorbs the resize, uniformly, around the fixed corner
    const groupResize = this.freeResize;
    if (groupResize && groupResize.container === target) {
      this.resizeGroup(groupResize, e.transform);
      return;
    }

    // Create session on first resizing frame
    if (!this.resizeSession) {
      this.resizeSession = new ResizeSession(target, e.transform?.corner);
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
    const layout = container.get?.("layout") as LayoutData | undefined;
    if (!layout?.container) return null;
    const children = resolveContainerChildren(this.canvas.getObjects(), container);
    for (const { obj } of children) {
      if (obj === exclude) continue;
      if (!rulesOf(obj).hosts) continue;
      if (pointInObject(cursor, obj)) return obj;
    }
    return null;
  }

  /** Find the parent container of `obj` by looking up its `child.parentId`. */
  private findParentContainer(obj: FabricObject): FabricObject | null {
    const layout = obj.get?.("layout") as LayoutData | undefined;
    if (!layout?.child) return null;
    return this.canvas.getObjects().find(
      (o) => o.get("layerId") === layout.child!.parentId,
    ) ?? null;
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

    const session = this.createSession(target, child, cursor);

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

  /**
   * Un pas du redimensionnement d'un groupe : le facteur est la moyenne des deux axes
   * (uniforme, un texte ne se déforme pas), le coin opposé à la poignée reste en place.
   */
  private resizeGroup(session: FreeResizeSession, transform: any): void {
    const { start, container } = session;
    const { w, h } = scaledSize(container);
    const k = Math.max(0.05, (w / start.width + h / start.height) / 2);
    const fx = transform.originX === "left" ? 0 : transform.originX === "right" ? 1 : 0.5;
    const fy = transform.originY === "top" ? 0 : transform.originY === "bottom" ? 1 : 0.5;

    session.apply(k, { x: start.left + start.width * fx, y: start.top + start.height * fy });
    // Les piles du groupe se rangent dans leurs nouvelles dimensions
    for (const obj of descendantsOf(this.canvas.getObjects(), [container])) {
      const cd = (obj.get("layout") as LayoutData | undefined)?.container;
      if (cd && cd.arrangement !== "free") relayoutSingle(obj, cd, this.canvas.getObjects());
    }
    fitFreeContainer(container, this.canvas.getObjects());
    this.canvas.renderAll();
  }

  /** Create the appropriate session type for a target container. */
  private createSession(
    target: FabricObject,
    child: FabricObject,
    cursor: { x: number; y: number },
  ): LayoutSession {
    const targetLayout = target.get?.("layout") as LayoutData | undefined;
    const alreadyContainer = targetLayout?.container != null;
    const existingChildren = alreadyContainer
      ? resolveContainerChildren(this.canvas.getObjects(), target)
      : [];

    if (alreadyContainer && existingChildren.length > 0) {
      return new InsertChildSession(this.canvas, target, child, cursor);
    }
    return new ContainerizeSession(this.canvas, target, child, cursor);
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
      const allChildren = resolveContainerChildren(this.canvas.getObjects(), session.container);
      const childObjs = allChildren.map(c => c.obj);
      const layout = session.container.get?.("layout") as LayoutData | undefined;
      const direction = layout?.container?.flexDirection ?? "column";
      this.guides.showInsertGuides(session.container, childObjs, direction);
    } else {
      // ContainerizeSession: show margin guides
      this.guides.showLayoutGuides(session.container, session.child);
    }
  }

  // ── Shape hit-testing ─────────────────────────────────────────────

  private findShapeUnderPoint(point: { x: number; y: number }, exclude?: FabricObject): FabricObject | null {
    const objects = this.canvas.getObjects().slice().reverse();
    const activeGroup = this.callbacks.getActiveGroupId?.();

    for (const obj of objects) {
      if (obj === exclude) continue;
      if (!rulesOf(obj).hosts) continue;
      const layout = obj.get?.("layout") as LayoutData | undefined;
      if (layout?.child) {
        // Allow child shapes as targets when in group-edit mode
        // (enables nesting: drag into a child shape to make it a sub-container)
        if (!activeGroup || layout.child.parentId !== activeGroup) continue;
      }

      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
}

/** A child's handles stop at the room its ancestors give (the grabbed edge moves, not the other). */
function clampToRoom(obj: FabricObject, transform: any, objects: FabricObject[]): void {
  const room = availableRoom(obj, objects);
  const { w, h } = scaledSize(obj);
  if (w <= room.w && h <= room.h) return;
  const originX = transform?.originX ?? "left";
  const originY = transform?.originY ?? "top";
  const anchor = obj.getPositionByOrigin(originX, originY);
  setShapeSize(obj, Math.min(w, room.w), Math.min(h, room.h));
  obj.setPositionByOrigin(anchor, originX, originY);
}
