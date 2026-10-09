import { FabricObject, Line, Rect, Pattern } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";
import { scaledSize, topLeft } from "../layout/geometry";
import { hexAlpha } from "./color";
import { layoutOf } from "../layout/model";
import type { SnapGuide } from "../snap";

/**
 * Manages ephemeral visual guides (overlays) on a Fabric canvas.
 *
 * All colors are derived from a single base color passed at construction.
 *
 * Provides both low-level primitives (addLine, addRect) and
 * high-level presets for common guide patterns (layout margins,
 * snap lines, hover hints).
 *
 * Each consumer gets its own CanvasGuides instance — guides from
 * different owners don't interfere with each other.
 */
export class CanvasGuides {
  private canvas: DesignCanvas;
  private objects: FabricObject[] = [];
  private color: string;

  /** Derived colors (computed once from base color). */
  private strokeColor: string;
  private fillLight: string;
  private hatchPattern: Pattern;

  constructor(canvas: DesignCanvas, color = "#ff00ff") {
    this.canvas = canvas;
    this.color = color;

    this.strokeColor = hexAlpha(color, 0.4);
    this.fillLight = hexAlpha(color, 0.05);
    this.hatchPattern = createHatchPattern(color);
  }

  // ── Low-level primitives ──────────────────────────────────────────

  /** Add a line guide. */
  addLine(coords: [number, number, number, number], opts: {
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[];
  } = {}): void {
    const line = new Line(coords, {
      stroke: opts.stroke ?? this.color,
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
    fill?: string | Pattern;
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[];
  }, insertAbove?: FabricObject): void {
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
    if (insertAbove) {
      const idx = this.canvas.getObjects().indexOf(insertAbove);
      if (idx >= 0) {
        this.canvas.insertAt(idx + 1, rect);
        return;
      }
    }
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
   * Draw a hatched overlay (same style as margin guides) covering an
   * arbitrary rectangle.  Useful anywhere a region needs to be visually
   * "claimed" — e.g. hinting that a shape is about to become a container.
   */
  showHatchOverlay(rect: { left: number; top: number; width: number; height: number }, insertAbove?: FabricObject): void {
    const border = hexAlpha(this.color, 0.3);
    this.addRect({
      left: rect.left, top: rect.top,
      width: rect.width, height: rect.height,
      fill: this.hatchPattern,
      stroke: border,
      strokeWidth: 0.5,
    }, insertAbove);
  }

  /**
   * Show a dashed hover hint around a shape (used during PENDING state
   * in drag-to-layout to signal that anchoring is about to happen).
   *
   * When `insertAbove` is provided, guides are inserted in the z-order
   * just above that object instead of on top of everything — this
   * prevents the overlay from covering the shape's children.
   */
  showHintHighlight(shape: FabricObject, insertAbove?: FabricObject): void {
    this.clear();
    const { w, h } = scaledSize(shape);
    const tl = topLeft(shape);
    const above = insertAbove ?? undefined;
    this.showHatchOverlay({ left: tl.x, top: tl.y, width: w, height: h }, above);
    // Dashed border on top for extra visibility
    this.addRect({
      left: tl.x, top: tl.y,
      width: w, height: h,
      stroke: this.strokeColor,
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
    }, above);
  }

  /**
   * Show layout guides: a dashed outline around the container,
   * hatched overlays for each non-zero margin zone, and anchor
   * indicators (`<-->`) on the edges where the child is pinned.
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
      stroke: this.color, strokeWidth: 2,
      strokeDashArray: [6, 4],
    });

    // Padding zones (hatched)
    const containerLayout = layoutOf(container);
    const p = containerLayout?.container?.padding;
    if (!p) return;

    const hatch = this.hatchPattern;
    const border = hexAlpha(this.color, 0.3);

    if (p.left > 0)
      this.addRect({ left: ctl.x, top: ctl.y, width: p.left, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.right > 0)
      this.addRect({ left: ctl.x + cw - p.right, top: ctl.y, width: p.right, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.top > 0)
      this.addRect({ left: ctl.x + p.left, top: ctl.y, width: cw - p.left - p.right, height: p.top, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.bottom > 0)
      this.addRect({ left: ctl.x + p.left, top: ctl.y + ch - p.bottom, width: cw - p.left - p.right, height: p.bottom, fill: hatch, stroke: border, strokeWidth: 0.5 });

    // Padding arrows
    const childTL = topLeft(child);
    const { w: childW, h: childH } = scaledSize(child);

    if (p.left > 0) {
      this.addAnchorArrow("horizontal", ctl.x, childTL.y + childH / 2, p.left);
    }
    if (p.top > 0) {
      this.addAnchorArrow("vertical", childTL.x + childW / 2, ctl.y, p.top);
    }
  }

  /**
   * Show insert-session guides: a dashed container outline + a hatched
   * gap indicator between the new child and its nearest neighbor.
   * No margin-to-edge indicators (those are for ContainerizeSession).
   */
  showInsertGuides(
    container: FabricObject,
    children: FabricObject[],
    direction: "column" | "row",
  ): void {
    this.clear();

    const { w: cw, h: ch } = scaledSize(container);
    const ctl = topLeft(container);

    // Dashed container outline
    this.addRect({
      left: ctl.x, top: ctl.y,
      width: cw, height: ch,
      fill: "transparent",
      stroke: this.color, strokeWidth: 2,
      strokeDashArray: [6, 4],
    });

    if (children.length < 2) return;

    const isColumn = direction === "column";
    const hatch = this.hatchPattern;
    const border = hexAlpha(this.color, 0.3);

    // Sort children by position in main axis
    const sorted = [...children]
      .map(obj => ({ obj, tl: topLeft(obj), size: scaledSize(obj) }))
      .sort((a, b) => isColumn
        ? a.tl.y - b.tl.y
        : a.tl.x - b.tl.x,
      );

    // Draw gap zones between consecutive children
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];

      if (isColumn) {
        const gapTop = curr.tl.y + curr.size.h;
        const gapBottom = next.tl.y;
        const gapH = gapBottom - gapTop;
        if (gapH > 1) {
          this.addRect({
            left: ctl.x, top: gapTop,
            width: cw, height: gapH,
            fill: hatch, stroke: border, strokeWidth: 0.5,
          });
          // Arrow showing the gap distance
          this.addAnchorArrow("vertical", ctl.x + cw / 2, gapTop, gapH);
        }
      } else {
        const gapLeft = curr.tl.x + curr.size.w;
        const gapRight = next.tl.x;
        const gapW = gapRight - gapLeft;
        if (gapW > 1) {
          this.addRect({
            left: gapLeft, top: ctl.y,
            width: gapW, height: ch,
            fill: hatch, stroke: border, strokeWidth: 0.5,
          });
          // Arrow showing the gap distance
          this.addAnchorArrow("horizontal", gapLeft, ctl.y + ch / 2, gapW);
        }
      }
    }
  }

  /**
   * Draw a `<-->` anchor indicator: a line with chevrons at each end.
   *
   * - "horizontal": draws left-to-right from (x, y) with given length
   * - "vertical": draws top-to-bottom from (x, y) with given length
   */
  private addAnchorArrow(
    orientation: "horizontal" | "vertical",
    x: number,
    y: number,
    length: number,
  ): void {
    if (length < 4) return;

    const chevron = Math.min(5, length / 3);
    const stroke = this.color;
    const sw = 1.5;
    const opts = { stroke, strokeWidth: sw, strokeDashArray: [] as number[] };

    if (orientation === "horizontal") {
      // Main line
      this.addLine([x, y, x + length, y], opts);
      // Left chevron <
      this.addLine([x + chevron, y - chevron, x, y], opts);
      this.addLine([x + chevron, y + chevron, x, y], opts);
      // Right chevron >
      this.addLine([x + length - chevron, y - chevron, x + length, y], opts);
      this.addLine([x + length - chevron, y + chevron, x + length, y], opts);
    } else {
      // Main line
      this.addLine([x, y, x, y + length], opts);
      // Top chevron ^
      this.addLine([x - chevron, y + chevron, x, y], opts);
      this.addLine([x + chevron, y + chevron, x, y], opts);
      // Bottom chevron v
      this.addLine([x - chevron, y + length - chevron, x, y + length], opts);
      this.addLine([x + chevron, y + length - chevron, x, y + length], opts);
    }
  }

  /**
   * Show snap alignment lines (horizontal/vertical) spanning the full canvas.
   */
  /**
   * Les guides de l'aimant d'un déplacement (SnappingManager, src/snap.ts) : un pointillé
   * fin à l'écran quel que soit le zoom, qui joint l'objet et sa cible et dépasse un peu
   * de chaque côté.
   */
  showSnapGuides(guides: SnapGuide[], zoom: number): void {
    this.clear();
    const overshoot = 8 / zoom;
    for (const guide of guides) {
      const from = guide.from - overshoot;
      const to = guide.to + overshoot;
      const coords: [number, number, number, number] =
        guide.axis === "x" ? [guide.at, from, guide.at, to] : [from, guide.at, to, guide.at];
      this.addLine(coords, { strokeWidth: 1 / zoom, strokeDashArray: [4 / zoom, 4 / zoom] });
    }
  }

  showSnapLines(
    guides: Array<{ orientation: "horizontal" | "vertical"; position: number }>,
  ): void {
    this.clear();
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    for (const guide of guides) {
      const coords: [number, number, number, number] =
        guide.orientation === "vertical"
          ? [guide.position, 0, guide.position, canvasH]
          : [0, guide.position, canvasW, guide.position];

      this.addLine(coords, { strokeDashArray: [5, 5] });
    }
  }
}

/**
 * Create a diagonal hatch Pattern from a base color.
 * Uses an offscreen canvas to draw repeating diagonal lines.
 */
function createHatchPattern(hex: string): Pattern {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.strokeStyle = hexAlpha(hex, 0.3);
  ctx.lineWidth = 1;

  // Diagonal line from bottom-left to top-right, repeated
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  // Wrap-around lines for seamless tiling
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(size / 2, size + size / 2);
  ctx.lineTo(size + size / 2, size / 2);
  ctx.stroke();

  return new Pattern({ source: canvas, repeat: "repeat" });
}
