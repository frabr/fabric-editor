import { Canvas, FabricObject, Line, Rect } from "#fabric";
import { isChildLayout, type ChildLayout } from "./layout/types";
import { scaledSize, topLeft } from "./layout/geometry";

/**
 * Manages ephemeral visual guides (overlays) on a Fabric canvas.
 *
 * Provides both low-level primitives (addLine, addRect) and
 * high-level presets for common guide patterns (layout margins,
 * snap lines, hover hints).
 *
 * Each consumer gets its own CanvasGuides instance — guides from
 * different owners don't interfere with each other.
 */
export class CanvasGuides {
  private canvas: Canvas;
  private objects: FabricObject[] = [];

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  // ── Low-level primitives ──────────────────────────────────────────

  /** Add a line guide. */
  addLine(coords: [number, number, number, number], opts: {
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[];
  } = {}): void {
    const line = new Line(coords, {
      stroke: opts.stroke ?? "#ff00ff",
      strokeWidth: opts.strokeWidth ?? 1,
      strokeDashArray: opts.strokeDashArray ?? [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    this.objects.push(line);
    this.canvas.add(line);
  }

  /** Add a rectangle guide (highlight zone, margin indicator, etc.). */
  addRect(opts: {
    left: number;
    top: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[];
  }): void {
    const rect = new Rect({
      left: opts.left,
      top: opts.top,
      originX: "left",
      originY: "top",
      width: opts.width,
      height: opts.height,
      fill: opts.fill ?? "transparent",
      stroke: opts.stroke ?? "transparent",
      strokeWidth: opts.strokeWidth ?? 0,
      strokeDashArray: opts.strokeDashArray,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    this.objects.push(rect);
    this.canvas.add(rect);
  }

  /** Remove all guides added by this instance. */
  clear(): void {
    for (const obj of this.objects) {
      this.canvas.remove(obj);
    }
    this.objects = [];
  }

  /** Clear + render in one call (common pattern). */
  clearAndRender(): void {
    this.clear();
    this.canvas.requestRenderAll();
  }

  /** Whether this instance currently has guides on the canvas. */
  get hasGuides(): boolean {
    return this.objects.length > 0;
  }

  // ── High-level presets ────────────────────────────────────────────

  /**
   * Show a dashed hover hint around a shape (used during PENDING state
   * in drag-to-layout to signal that anchoring is about to happen).
   */
  showHintHighlight(shape: FabricObject): void {
    this.clear();
    const { w, h } = scaledSize(shape);
    const tl = topLeft(shape);
    this.addRect({
      left: tl.x, top: tl.y,
      width: w, height: h,
      fill: "rgba(59, 130, 246, 0.05)",
      stroke: "rgba(59, 130, 246, 0.4)",
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
    });
  }

  /**
   * Show layout guides: a dashed outline around the container and
   * colored overlays for each non-zero margin zone.
   */
  showLayoutGuides(container: FabricObject, child: FabricObject): void {
    this.clear();

    const { w: cw, h: ch } = scaledSize(container);
    const ctl = topLeft(container);

    // Dashed container outline
    this.addRect({
      left: ctl.x, top: ctl.y,
      width: cw, height: ch,
      fill: "transparent",
      stroke: "#3b82f6", strokeWidth: 2,
      strokeDashArray: [6, 4],
    });

    // Margin zones
    const layout = child.get?.("layout") as ChildLayout | undefined;
    if (!layout || !isChildLayout(layout)) return;
    const m = layout.margins;

    const FILL = "rgba(59, 130, 246, 0.08)";
    const STROKE = "rgba(59, 130, 246, 0.3)";

    if (m.left > 0)
      this.addRect({ left: ctl.x, top: ctl.y, width: m.left, height: ch, fill: FILL, stroke: STROKE, strokeWidth: 0.5 });
    if (m.right > 0)
      this.addRect({ left: ctl.x + cw - m.right, top: ctl.y, width: m.right, height: ch, fill: FILL, stroke: STROKE, strokeWidth: 0.5 });
    if (m.top > 0)
      this.addRect({ left: ctl.x + m.left, top: ctl.y, width: cw - m.left - m.right, height: m.top, fill: FILL, stroke: STROKE, strokeWidth: 0.5 });
    if (m.bottom > 0)
      this.addRect({ left: ctl.x + m.left, top: ctl.y + ch - m.bottom, width: cw - m.left - m.right, height: m.bottom, fill: FILL, stroke: STROKE, strokeWidth: 0.5 });
  }

  /**
   * Show snap alignment lines (horizontal/vertical) spanning the full canvas.
   */
  showSnapLines(
    guides: Array<{ orientation: "horizontal" | "vertical"; position: number }>,
    opts: { stroke?: string } = {},
  ): void {
    this.clear();
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    for (const guide of guides) {
      const coords: [number, number, number, number] =
        guide.orientation === "vertical"
          ? [guide.position, 0, guide.position, canvasH]
          : [0, guide.position, canvasW, guide.position];

      this.addLine(coords, {
        stroke: opts.stroke ?? "#ff00ff",
        strokeDashArray: [5, 5],
      });
    }
  }
}
