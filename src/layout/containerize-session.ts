/**
 * ContainerizeSession — encapsulates the "first attach" interaction.
 *
 * Transforms a plain shape into a layout container when any object (text,
 * shape, or another container) is dragged into it. Establishes padding,
 * size mode, and the initial container/child relationship.
 * Created by the LayoutManager, destroyed after commit or rollback.
 */
import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";
import {
  type LayoutData,
  type AttachSnapshot,
  MIN_PAD,
  sizingOf,
} from "./types";
import {
  scaledSize,
  setShapeSize,
  topLeft,
  clampTopLeft,
  hasExceededOffset,
  isTextObject,
  pointInObject,
  detachChild,
  cloneLayout,
  type LayoutText,
} from "./geometry";
import { runLayout, relayoutSingle, bubbleUpLayout } from "./reconcile";

// ── Constants ────────────────────────────────────────────────────────

const EXIT_MARGIN = 5;

// ── ContainerizeSession ─────────────────────────────────────────────

export class ContainerizeSession {
  private canvas: DesignCanvas;
  private shape: FabricObject;
  private text: FabricObject;

  private snapshot: AttachSnapshot;
  private clampDx: number;
  private clampDy: number;
  private anchorCursor: { x: number; y: number };

  /** If true, rollback detaches the child instead of restoring the snapshot. */
  private _isReattach: boolean;

  constructor(canvas: DesignCanvas, shape: FabricObject, text: FabricObject, cursor: { x: number; y: number }) {
    this.canvas = canvas;
    this.shape = shape;
    this.text = text;
    this.anchorCursor = cursor;
    this._isReattach = false;

    this.snapshot = takeSnapshot(shape, text);
    normalizeShapeOrigin(shape);

    applyInitialLayout(shape, text);

    const clampedPos = clampTopLeft(text, shape, MIN_PAD);
    const preTL = topLeft(text);
    this.clampDx = clampedPos.x - preTL.x;
    this.clampDy = clampedPos.y - preTL.y;

    canvas.adjustGrabOffset(this.clampDx, this.clampDy);

    if (this.clampDx !== 0 || this.clampDy !== 0) {
      text.left += this.clampDx;
      text.top += this.clampDy;
      text.setCoords();
    }

    wrapContainerAroundChild(text, shape);

    // If the child is itself a container, reposition its own children
    const textLayout = text.get?.("layout") as LayoutData | undefined;
    if (textLayout?.container) {
      relayoutSingle(text, textLayout.container, canvas.getObjects());
    }
  }

  /**
   * Create a session for repositioning a child that is already attached.
   * Skips layout creation, origin normalization, and clamp/grab offset.
   * On exit (rollback), the child is detached instead of restored.
   */
  static reattach(canvas: DesignCanvas, shape: FabricObject, text: FabricObject, cursor: { x: number; y: number }): ContainerizeSession {
    const session = Object.create(ContainerizeSession.prototype) as ContainerizeSession;
    session.canvas = canvas;
    session.shape = shape;
    session.text = text;
    session.anchorCursor = cursor;
    session._isReattach = true;
    session.snapshot = takeSnapshot(shape, text);
    session.clampDx = 0;
    session.clampDy = 0;
    return session;
  }

  /** During drag: clamp text, resize container, check for exit. */
  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited" {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }

    const clamped = clampTopLeft(this.text, this.shape, MIN_PAD);
    const currentTL = topLeft(this.text);
    const dx = clamped.x - currentTL.x;
    const dy = clamped.y - currentTL.y;

    if (dx !== 0 || dy !== 0) {
      this.text.left += dx;
      this.text.top += dy;
      this.text.setCoords();
    }

    wrapContainerAroundChild(this.text, this.shape);

    // If the child is itself a container, reposition its own children
    const childLayout = this.text.get?.("layout") as LayoutData | undefined;
    if (childLayout?.container) {
      relayoutSingle(this.text, childLayout.container, this.canvas.getObjects());
    }

    // Bubble up the entire ancestor chain so all parents accommodate the new size
    bubbleUpLayout(this.shape, this.canvas.getObjects());

    return "anchored";
  }

  /**
   * Finalize the attach. Text edits relayout through the LayoutManager's
   * canvas-wide `text:changed` listener — nothing to clean up here.
   */
  commit(): () => void {
    const tTL = topLeft(this.text);
    this.text.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    this.text.setCoords();

    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
    return () => {};
  }

  /** Undo anchor: restore snapshot, reverse grab offset. */
  rollback(): void {
    if (this._isReattach) {
      detachChild(this.text);

      // Restore container to snapshot (before the drag resized it)
      restoreShapeSize(this.shape, this.snapshot.shape);
      this.shape.set("layout", this.snapshot.shape.layout ?? undefined);

      this.shape.setCoords();
      this.text.setCoords();
      this.canvas.renderAll();
      return;
    }

    restoreShapeSize(this.shape, this.snapshot.shape);
    this.shape.set({
      left: this.snapshot.shape.left, top: this.snapshot.shape.top,
      originX: this.snapshot.shape.originX, originY: this.snapshot.shape.originY,
      stroke: this.snapshot.shape.stroke, strokeWidth: this.snapshot.shape.strokeWidth,
    });
    this.shape.set("layout", this.snapshot.shape.layout ?? undefined);

    this.text.set({
      left: this.snapshot.text.left, top: this.snapshot.text.top,
      originX: this.snapshot.text.originX, originY: this.snapshot.text.originY,
      width: this.snapshot.text.width,
      scaleX: this.snapshot.text.scaleX, scaleY: this.snapshot.text.scaleY,
      textAlign: this.snapshot.text.textAlign,
    } as any);
    this.text.set("layout", this.snapshot.text.layout ?? undefined);
    if (isTextObject(this.text)) (this.text as unknown as LayoutText).layoutWith(null);

    this.canvas.adjustGrabOffset(-this.clampDx, -this.clampDy);

    this.shape.setCoords();
    this.text.setCoords();
    this.canvas.renderAll();
  }

  /** The shape this session is attached to (for guide rendering). */
  get container(): FabricObject { return this.shape; }
  /** The text being attached (for guide rendering). */
  get child(): FabricObject { return this.text; }

  private shouldExit(cursor: { x: number; y: number }): boolean {
    if (!pointInObject(cursor, this.shape, EXIT_MARGIN)) return true;
    return hasExceededOffset(cursor, this.anchorCursor, this.clampDx, this.clampDy, EXIT_MARGIN);
  }
}

// ── Helpers (module-private) ─────────────────────────────────────────

function takeSnapshot(shape: FabricObject, text: FabricObject): AttachSnapshot {
  return {
    shape: {
      left: shape.left, top: shape.top,
      originX: shape.originX, originY: shape.originY,
      width: shape.width, height: shape.height,
      scaleX: shape.scaleX, scaleY: shape.scaleY,
      stroke: (shape as any).stroke, strokeWidth: (shape as any).strokeWidth,
      layout: cloneLayout(shape),
    },
    text: {
      left: text.left, top: text.top,
      originX: text.originX, originY: text.originY,
      width: text.width,
      scaleX: text.scaleX, scaleY: text.scaleY,
      textAlign: (text as any).textAlign,
      layout: cloneLayout(text),
    },
  };
}

/**
 * Back to the snapshot's visual size, through the shape's own sizing (a rect sets
 * width/height, a circle or a path its scale, an image frame its frame).
 */
function restoreShapeSize(shape: FabricObject, snap: AttachSnapshot["shape"]): void {
  setShapeSize(shape, snap.width * (snap.scaleX || 1), snap.height * (snap.scaleY || 1));
}

function normalizeShapeOrigin(shape: FabricObject): void {
  const center = shape.getRelativeCenterPoint();
  const { w, h } = scaledSize(shape);
  shape.set({
    left: center.x - w / 2,
    top: center.y - h / 2,
    originX: "left",
    originY: "top",
  });
  shape.setCoords();
}

/**
 * Set up the initial layout relationship between a shape (future container)
 * and a child being dragged into it.
 *
 * - Adds `container` block to the shape's layout (preserves existing `child` block)
 * - Adds `child` block to the child's layout (preserves existing `container` block)
 */
function applyInitialLayout(shape: FabricObject, child: FabricObject): void {
  const sTL = topLeft(shape);
  const cTL = topLeft(child);
  const { w: shapeW, h: shapeH } = scaledSize(shape);

  const padX = Math.max(MIN_PAD, Math.round(cTL.x - sTL.x));
  const padY = Math.max(MIN_PAD, Math.round(cTL.y - sTL.y));

  const containerId = shape.get?.("layerId") as string;

  // Add container block to shape (preserve existing child block if nested).
  // The container hugs its child — a text brings its own sizing (a wrapping
  // text is fixed-width on its own), nothing to guess. The shape's current
  // size is the floor.
  const shapeLayout = (shape.get?.("layout") as LayoutData) ?? {};
  shape.set("layout", {
    ...shapeLayout,
    sizing: shapeLayout.sizing ?? { x: "hug", y: "hug", minSize: { w: shapeW, h: shapeH } },
    container: { padding: { top: padY, right: padX, bottom: padY, left: padX } },
  });

  // Add child block to child (preserve existing container block if it has children)
  const childLayout = (child.get?.("layout") as LayoutData) ?? {};
  child.set("layout", { ...childLayout, child: { parentId: containerId } });
}

/** Resize container to wrap around its child, updating padding from current position. */
export function wrapContainerAroundChild(child: FabricObject, container: FabricObject): void {
  const childLayout = child.get?.("layout") as LayoutData | undefined;
  const containerLayout = container.get?.("layout") as LayoutData | undefined;
  if (!childLayout?.child || !containerLayout?.container) return;

  const cd = containerLayout.container;

  const { w: childW, h: childH } = scaledSize(child);
  const sTL = topLeft(container);
  const tTL = topLeft(child);

  const padLeft = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padTop = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));

  cd.padding = { top: padTop, right: padLeft, bottom: padTop, left: padLeft };
  container.set("layout", { ...containerLayout });

  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;
  const requiredW = padLeft + childW + padLeft;
  const requiredH = padTop + childH + padTop;

  setShapeSize(container, Math.max(requiredW, minW), Math.max(requiredH, minH));
  container.setCoords();
}
