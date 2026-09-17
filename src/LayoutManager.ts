import { FabricObject, Rect } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { runLayout, relayoutSingle } from "./layout/reconcile";
import { ResizeSession } from "./layout/resize-session";
import {
  type LayoutData,
  type LayoutSession,
} from "./layout/types";
import { pointInObject, isTextObject } from "./layout/geometry";
import { resolveContainerChildren } from "./layout/resize-session";
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

// ── Discriminated union for drag-to-layout state ────────────────────

interface IdleState {
  phase: "idle";
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
}

type DtlState = IdleState | PendingState | AnchoredState;

// ── Constants ───────────────────────────────────────────────────────

const ANCHOR_DELAY_MS = 300;

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

  /** Update layout mode on the currently selected container. */
  setMode(obj: FabricObject, mode: "hug" | "hug-y" | "fixed"): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    switch (mode) {
      case "hug":
        layout.container.sizeMode = { x: "hug", y: "hug" };
        break;
      case "hug-y":
        layout.container.sizeMode = { x: "fixed", y: "hug" };
        break;
      case "fixed":
        layout.container.sizeMode = { x: "fixed", y: "fixed" };
        break;
    }
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update padding on a container. */
  setPadding(obj: FabricObject, side: string, value: number): void {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    if (!layout.container.padding) layout.container.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    (layout.container.padding as Record<string, number>)[side] = value;
    obj.set("layout", { ...layout });

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

  /** Clean up event listeners. */
  dispose(): void {
    this.resetToIdle();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:resizing", this.onResizingBound);
  }

  // ── Event wiring ──────────────────────────────────────────────────

  private onMovingBound = (e: any) => this.onMoving(e);
  private onModifiedBound = (e: any) => this.onModified(e);
  private onResizingBound = (e: any) => this.onResizing(e);

  private setupEventListeners(): void {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:resizing", this.onResizingBound);
  }

  // ── Canvas event handlers ─────────────────────────────────────────

  private onMoving(e: any): void {
    const obj = e.target;

    const layout = obj.get?.("layout") as LayoutData | undefined;

    // Container being dragged → reposition its children (not the full canvas,
    // otherwise runLayout would snap this container back to its flex position
    // if it's also a child of another container).
    if (layout?.container) {
      const isSessionChild = this.dtl.phase === "anchored" && this.dtl.session.child === obj;
      if (!isSessionChild) {
        relayoutSingle(obj, layout.container, this.canvas.getObjects());
        this.canvas.renderAll();
      }
      // Don't return — the container can also be dragged into another shape
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
          this.dtl = { phase: "anchored", session, cooldownUntil: 0 };
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
      case "idle":
        this.handleIdleMoving(obj, cursor);
        break;
    }
  }

  private onModified(e: any): void {
    const obj = e.target;

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
        this.doAnchor();
        this.doCommit();
        return;
      }
    }

    this.resetToIdle();
  }

  private onResizing(e: any): void {
    const target = e.target;
    const layout = target?.get?.("layout") as LayoutData | undefined;
    if (!layout?.container) return;

    // Create session on first resizing frame
    if (!this.resizeSession) {
      this.resizeSession = new ResizeSession(target, e.transform?.corner);
    }

    this.resizeSession.handleResizing(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  // ── State machine: IDLE → PENDING ─────────────────────────────────

  private handleIdleMoving(draggedObj: FabricObject, cursor: { x: number; y: number }): void {
    if (Date.now() < this.dtl.cooldownUntil) return;

    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (shape) {
      this.startPending(draggedObj, shape, cursor);
    }
  }

  // ── State machine: PENDING ────────────────────────────────────────

  private handlePendingMoving(_draggedObj: FabricObject, cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "pending") return;

    const shape = this.findShapeUnderPoint(cursor, _draggedObj);
    if (shape !== this.dtl.target) {
      this.resetToIdle();
      return;
    }

    this.dtl.cursor = cursor;
  }

  private startPending(draggedObj: FabricObject, shape: FabricObject, cursor: { x: number; y: number }): void {
    this.guides.showHintHighlight(shape);
    this.canvas.renderAll();

    const timer = setTimeout(() => this.doAnchor(), ANCHOR_DELAY_MS);

    this.dtl = {
      phase: "pending",
      timer,
      target: shape,
      source: draggedObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil,
    };
  }

  // ── State machine: ANCHOR (PENDING → ANCHORED) ───────────────────

  private doAnchor(): void {
    if (this.dtl.phase !== "pending") return;
    const { target: shape, source: child, cursor } = this.dtl;

    const shapeLayout = shape.get?.("layout") as LayoutData | undefined;
    const alreadyContainer = shapeLayout?.container != null;
    const existingChildren = alreadyContainer
      ? resolveContainerChildren(this.canvas.getObjects(), shape)
      : [];

    let session: LayoutSession;
    if (alreadyContainer && existingChildren.length > 0) {
      session = new InsertChildSession(this.canvas, shape, child, cursor);
    } else {
      session = new ContainerizeSession(this.canvas, shape, child, cursor);
    }

    this.showSessionGuides(session);
    this.canvas.renderAll();

    this.dtl = {
      phase: "anchored",
      session,
      cooldownUntil: this.dtl.cooldownUntil,
    };
  }

  // ── State machine: ANCHORED (during drag) ─────────────────────────

  private handleAnchoredMoving(cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "anchored") return;
    const { session } = this.dtl;

    const result = session.handleMoving(cursor);
    if (result === "exited") {
      this.resetToIdle(Date.now() + 1000);
      return;
    }

    this.showSessionGuides(session);
    this.canvas.renderAll();
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
    if (this.dtl.phase === "pending") {
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
      if ((obj as any).excludeFromExport) continue;
      const layout = obj.get?.("layout") as LayoutData | undefined;
      if (layout?.child) {
        // Allow child shapes as targets when in group-edit mode
        // (enables nesting: drag into a child shape to make it a sub-container)
        if (!activeGroup || layout.child.parentId !== activeGroup) continue;
      }
      if ((obj.get?.("layerId") as string) === "originalImage") continue;
      const layerType = (obj as any).layerType;
      if (layerType !== "shape" && !(obj instanceof Rect)) continue;

      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
}
