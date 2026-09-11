import { FabricObject, Line, Rect, Pattern } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { isChildLayout, type ChildLayout } from "./layout/types";
import { scaledSize, topLeft } from "./layout/geometry";

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

    this.strokeColor = colorAlpha(color, 0.4);
    this.fillLight = colorAlpha(color, 0.05);
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
      fill: this.fillLight,
      stroke: this.strokeColor,
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
    });
  }

  /**
   * Show layout guides: a dashed outline around the container and
   * hatched overlays for each non-zero margin zone.
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

    // Margin zones (hatched)
    const layout = child.get?.("layout") as ChildLayout | undefined;
    if (!layout || !isChildLayout(layout)) return;
    const m = layout.margins;

    const hatch = this.hatchPattern;
    const border = colorAlpha(this.color, 0.3);

    if (m.left > 0)
      this.addRect({ left: ctl.x, top: ctl.y, width: m.left, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (m.right > 0)
      this.addRect({ left: ctl.x + cw - m.right, top: ctl.y, width: m.right, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (m.top > 0)
      this.addRect({ left: ctl.x + m.left, top: ctl.y, width: cw - m.left - m.right, height: m.top, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (m.bottom > 0)
      this.addRect({ left: ctl.x + m.left, top: ctl.y + ch - m.bottom, width: cw - m.left - m.right, height: m.bottom, fill: hatch, stroke: border, strokeWidth: 0.5 });
  }

  /**
   * Show snap alignment lines (horizontal/vertical) spanning the full canvas.
   */
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

// ── Color utilities (module-private) ────────────────────────────────

/**
 * Parse a hex color (#rgb or #rrggbb) into [r, g, b].
 */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Return an rgba() string from a hex color + alpha. */
function colorAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  ctx.strokeStyle = colorAlpha(hex, 0.3);
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
