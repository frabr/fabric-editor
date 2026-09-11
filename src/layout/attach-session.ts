/**
 * AttachSession — encapsulates one drag-to-layout interaction.
 *
 * Created by the LayoutManager when a text enters a shape, destroyed
 * after commit or rollback. The LayoutManager never sees the internals
 * (snapshot, clamp offsets, etc.) — it just drives the session.
 */
import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";
import {
  type ContainerLayout,
  type ChildLayout,
  type AttachSnapshot,
  MIN_PAD,
} from "./types";
import {
  scaledSize,
  topLeft,
  clampTopLeft,
  hasExceededOffset,
  pointInObject,
} from "./geometry";
import { runLayout } from "./reconcile";

// ── Constants ────────────────────────────────────────────────────────

const EXIT_MARGIN = 5;

// ── AttachSession ────────────────────────────────────────────────────

export class AttachSession {
  private canvas: DesignCanvas;
  private shape: FabricObject;
  private text: FabricObject;

  private snapshot: AttachSnapshot;
  private clampDx: number;
  private clampDy: number;
  private anchorCursor: { x: number; y: number };

  constructor(canvas: DesignCanvas, shape: FabricObject, text: FabricObject, cursor: { x: number; y: number }) {
    this.canvas = canvas;
    this.shape = shape;
    this.text = text;
    this.anchorCursor = cursor;

    this.snapshot = takeSnapshot(shape, text);
    normalizeShapeOrigin(shape);

    const { containerLayout, childLayout } = computeInitialLayout(shape, text);
    shape.set("layout", containerLayout);
    text.set("layout", childLayout);

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
    return "anchored";
  }

  /** Finalize the attach. Returns a cleanup function for the "changed" listener. */
  commit(): () => void {
    const tTL = topLeft(this.text);
    this.text.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    this.text.setCoords();

    runLayout(this.canvas.getObjects());

    const relayout = () => {
      runLayout(this.canvas.getObjects());
      this.canvas.renderAll();
    };
    (this.text as any).on("changed", relayout);

    this.canvas.renderAll();

    return () => (this.text as any).off("changed", relayout);
  }

  /** Undo anchor: restore snapshot, reverse grab offset. */
  rollback(): void {
    this.shape.set({
      left: this.snapshot.shape.left, top: this.snapshot.shape.top,
      originX: this.snapshot.shape.originX, originY: this.snapshot.shape.originY,
      width: this.snapshot.shape.width, height: this.snapshot.shape.height,
      scaleX: this.snapshot.shape.scaleX, scaleY: this.snapshot.shape.scaleY,
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

    this.canvas.adjustGrabOffset(-this.clampDx, -this.clampDy);

    (this.text as any).off("changed");
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
      layout: shape.get?.("layout") ?? undefined,
    },
    text: {
      left: text.left, top: text.top,
      originX: text.originX, originY: text.originY,
      width: text.width,
      scaleX: text.scaleX, scaleY: text.scaleY,
      textAlign: (text as any).textAlign,
      layout: text.get?.("layout") ?? undefined,
    },
  };
}

function normalizeShapeOrigin(shape: FabricObject): void {
  const sTL = topLeft(shape);
  const sx = shape.scaleX || 1;
  const sy = shape.scaleY || 1;
  shape.set({
    left: sTL.x, top: sTL.y,
    originX: "left", originY: "top",
    width: shape.width * sx, height: shape.height * sy,
    scaleX: 1, scaleY: 1,
  });
  shape.setCoords();
}

function computeInitialLayout(shape: FabricObject, text: FabricObject): {
  containerLayout: ContainerLayout;
  childLayout: ChildLayout;
} {
  const sTL = topLeft(shape);
  const tTL = topLeft(text);
  const shapeW = shape.width;
  const shapeH = shape.height;
  const textW = text.width * (text.scaleX || 1);

  const padX = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padY = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));

  const naturalW = (text as any).calcTextWidth
    ? Math.ceil((text as any).calcTextWidth()) : textW;
  const textWraps = textW < naturalW - 2;
  const modeX: "fixed" | "hug" = textWraps ? "fixed" : "hug";

  const containerId = shape.get?.("layerId") as string;

  return {
    containerLayout: {
      role: "container",
      sizeMode: { x: modeX, y: "hug" },
      minSize: { w: shapeW, h: shapeH },
    },
    childLayout: {
      parentId: containerId,
      margins: { left: padX, right: padX, top: padY, bottom: padY },
      anchorX: "left",
      anchorY: "top",
    },
  };
}

/** Resize container to wrap around its child, updating margins from current position. */
export function wrapContainerAroundChild(child: FabricObject, container: FabricObject): void {
  const cl = child.get?.("layout") as ChildLayout | undefined;
  const containerLayout = container.get?.("layout") as ContainerLayout | undefined;
  if (!cl || !containerLayout) return;

  const { w: childW, h: childH } = scaledSize(child);
  const sTL = topLeft(container);
  const tTL = topLeft(child);

  const padLeft = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padTop = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));

  cl.margins = { left: padLeft, right: padLeft, top: padTop, bottom: padTop };
  cl.anchorX = "left";
  cl.anchorY = "top";
  child.set("layout", { ...cl });

  const minW = containerLayout.minSize?.w ?? 0;
  const minH = containerLayout.minSize?.h ?? 0;
  const requiredW = padLeft + childW + padLeft;
  const requiredH = padTop + childH + padTop;

  container.set({ width: Math.max(requiredW, minW), height: Math.max(requiredH, minH) });
  container.setCoords();
}
