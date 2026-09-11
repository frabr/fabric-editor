import { FabricObject, Rect } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { runLayout } from "./layout/reconcile";
import {
  isContainerLayout,
  isChildLayout,
  type ContainerLayout,
  type ChildLayout,
  type LayoutData,
} from "./layout/types";
import { pointInObject, isTextObject } from "./layout/geometry";
import { AttachSession } from "./layout/attach-session";

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
  session: AttachSession;
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

  /** Run layout on all canvas objects. */
  relayout(preview = false): void {
    runLayout(this.canvas.getObjects(), preview);
    this.canvas.renderAll();
  }

  /** Update layout mode on the currently selected container. */
  setMode(obj: FabricObject, mode: "hug" | "hug-y" | "fixed"): void {
    const layout = obj.get("layout") as ContainerLayout | undefined;
    if (!layout || !isContainerLayout(layout)) return;

    switch (mode) {
      case "hug":
        layout.sizeMode = { x: "hug", y: "hug" };
        break;
      case "hug-y":
        layout.sizeMode = { x: "fixed", y: "hug" };
        break;
      case "fixed":
        layout.sizeMode = { x: "fixed", y: "fixed" };
        break;
    }
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update a margin on a child layout object. */
  setMargin(obj: FabricObject, side: string, value: number): void {
    const layout = obj.get("layout") as ChildLayout | undefined;
    if (!layout || !isChildLayout(layout)) return;

    (layout.margins as Record<string, number>)[side] = value;
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Update anchor on a child layout object. */
  setAnchor(obj: FabricObject, anchorX: string, anchorY: string): void {
    const layout = obj.get("layout") as ChildLayout | undefined;
    if (!layout || !isChildLayout(layout)) return;

    layout.anchorX = anchorX as "left" | "right";
    layout.anchorY = anchorY as "top" | "bottom";
    obj.set("layout", { ...layout });

    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** Clean up event listeners. */
  dispose(): void {
    this.resetToIdle();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:scaling", this.onScalingBound);
  }

  // ── Event wiring ──────────────────────────────────────────────────

  private onMovingBound = (e: any) => this.onMoving(e);
  private onModifiedBound = (e: any) => this.onModified(e);
  private onScalingBound = (e: any) => this.onScaling(e);

  private setupEventListeners(): void {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:scaling", this.onScalingBound);
  }

  // ── Canvas event handlers ─────────────────────────────────────────

  private onMoving(e: any): void {
    const obj = e.target;

    // Container being dragged → reposition children (preview mode)
    const layout = obj.get?.("layout") as LayoutData | undefined;
    if (layout && isContainerLayout(layout)) {
      this.relayout(true);
      return;
    }

    // Child being dragged inside active group → start reattach session
    if (layout && isChildLayout(layout) && this.dtl.phase !== "anchored") {
      const activeGroup = this.callbacks.getActiveGroupId?.();
      if (activeGroup === layout.parentId) {
        const container = this.canvas.getObjects().find(
          (o) => o.get("layerId") === layout.parentId,
        );
        if (container) {
          const cursor = this.canvas.getScenePoint(e.e);
          const session = AttachSession.reattach(this.canvas, container, obj, cursor);
          this.guides.showLayoutGuides(session.container, session.child);
          this.canvas.renderAll();
          this.dtl = { phase: "anchored", session, cooldownUntil: 0 };
        }
        return;
      }
    }

    // Only handle text objects for drag-to-layout
    if (!isTextObject(obj)) return;

    // Already-attached text that isn't in group-edit mode → ignore
    const textLayout = obj.get?.("layout");
    if (textLayout && "parentId" in textLayout && this.dtl.phase !== "anchored") return;

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

    // Container modified → clean relayout
    const layout = obj.get?.("layout") as LayoutData | undefined;
    if (layout && isContainerLayout(layout)) {
      this.relayout();
      this.callbacks.onLayoutChanged?.();
      return;
    }

    // Only handle text objects for drag-to-layout
    if (!isTextObject(obj)) return;

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

  private onScaling(e: any): void {
    const layout = e.target?.get?.("layout");
    if (layout && isContainerLayout(layout)) {
      this.relayout(true);
    }
  }

  // ── State machine: IDLE → PENDING ─────────────────────────────────

  private handleIdleMoving(textObj: FabricObject, cursor: { x: number; y: number }): void {
    if (Date.now() < this.dtl.cooldownUntil) return;

    const shape = this.findShapeUnderPoint(cursor);
    if (shape) {
      this.startPending(textObj, shape, cursor);
    }
  }

  // ── State machine: PENDING ────────────────────────────────────────

  private handlePendingMoving(_textObj: FabricObject, cursor: { x: number; y: number }): void {
    if (this.dtl.phase !== "pending") return;

    const shape = this.findShapeUnderPoint(cursor);
    if (shape !== this.dtl.target) {
      this.resetToIdle();
      return;
    }

    this.dtl.cursor = cursor;
  }

  private startPending(textObj: FabricObject, shape: FabricObject, cursor: { x: number; y: number }): void {
    this.guides.showHintHighlight(shape);
    this.canvas.renderAll();

    const timer = setTimeout(() => this.doAnchor(), ANCHOR_DELAY_MS);

    this.dtl = {
      phase: "pending",
      timer,
      target: shape,
      source: textObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil,
    };
  }

  // ── State machine: ANCHOR (PENDING → ANCHORED) ───────────────────

  private doAnchor(): void {
    if (this.dtl.phase !== "pending") return;
    const { target: shape, source: text, cursor } = this.dtl;

    const session = new AttachSession(this.canvas, shape, text, cursor);

    this.guides.showLayoutGuides(session.container, session.child);
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

    this.guides.showLayoutGuides(session.container, session.child);
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

  // ── Shape hit-testing ─────────────────────────────────────────────

  private findShapeUnderPoint(point: { x: number; y: number }): FabricObject | null {
    const objects = this.canvas.getObjects().slice().reverse();

    for (const obj of objects) {
      if ((obj as any).excludeFromExport) continue;
      const layout = obj.get?.("layout");
      if (layout && "parentId" in layout) continue;
      if ((obj.get?.("layerId") as string) === "originalImage") continue;
      const layerType = (obj as any).layerType;
      if (layerType !== "shape" && !(obj instanceof Rect)) continue;

      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
}
