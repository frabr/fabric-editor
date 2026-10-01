/**
 * ResizeSession — encapsulates one user-initiated resize interaction.
 *
 * Created by the LayoutManager on the first `object:resizing` event,
 * fed with each subsequent scaling frame, and committed on `object:modified`.
 *
 * Separates the user's resize intent (which axes, what size) from
 * the programmatic layout reconciliation that runs on every frame.
 */
import type { FabricObject } from "#fabric";
import {
  type LayoutData,
  type ContainerData,
  type ResolvedChild,
  type SizingData,
  sizingOf,
} from "./types";
import {
  scaledSize,
  setShapeSize,
  syncCoords,
  topLeft,
  cornerToAxes,
  isTextObject,
  type LayoutText,
  type ResizeAxes,
} from "./geometry";
import { yogaLayout } from "./yoga-engine";

// ── ResizeSession ───────────────────────────────────────────────────

/**
 * Handle rules (same as texts, see CustomTextbox):
 * - dragging a left/right edge fixes the width (hug → fixed);
 * - dragging a top/bottom edge on a hug height sets the floor `minSize.h`
 *   (the mode doesn't change); on a fixed height, sets the height;
 * - a corner applies both rules.
 */
export class ResizeSession {
  private container: FabricObject;
  private containerData: ContainerData;
  private sizing: SizingData;
  private axes: ResizeAxes;

  /** User-intended size — only updated on axes the user controls. */
  private userW: number;
  private userH: number;

  /**
   * Fixed widths of the text children at grab time: the container pushes them
   * when it gets narrower, and they grow back if the user widens it again
   * within the same drag. What remains at release is kept.
   */
  private textWidths = new Map<FabricObject, number>();

  constructor(container: FabricObject, corner?: string) {
    this.container = container;
    const layout = container.get("layout") as LayoutData;
    this.containerData = layout.container!;
    this.axes = cornerToAxes(corner);

    // Touching the width fixes it, for the whole interaction
    const current = sizingOf(container);
    this.sizing = this.axes.x && current.x === "hug" ? { ...current, x: "fixed" } : { ...current };
    container.set("layout", { ...layout, sizing: this.sizing });

    const { w, h } = scaledSize(container);
    this.userW = w;
    this.userH = h;
  }

  private restoreTextWidths(children: ResolvedChild[]): void {
    for (const { obj } of children) {
      if (!isTextObject(obj) || sizingOf(obj).x !== "fixed") continue;
      const grabbed = this.textWidths.get(obj);
      if (grabbed == null) this.textWidths.set(obj, obj.width);
      else if (obj.width !== grabbed) {
        // Lift the previous frame's constraint, or it would clamp it again right away
        // (this frame's pass sets the new one)
        (obj as unknown as LayoutText).layoutWith({});
        obj.set({ width: grabbed });
      }
    }
  }

  /**
   * Called on each `object:resizing` frame.
   * Controls already set width/height directly (no scale involved).
   */
  handleResizing(objects: FabricObject[]): void {
    const { container, containerData: cd, sizing, axes } = this;

    const { w: currentW, h: currentH } = scaledSize(container);

    // Update user size only on axes the user is dragging.
    if (axes.x) this.userW = currentW;
    if (axes.y) this.userH = currentH;

    const children = sortChildrenByOrder(resolveContainerChildren(objects, container));
    if (children.length === 0) return;
    this.restoreTextWidths(children);

    // Live, the floor is what the user drags — not the previous minSize
    const live: SizingData = { x: sizing.x, y: sizing.y };
    const tl = topLeft(container);
    const { w: requiredW, h: requiredH } = yogaLayout(
      children, tl.x, tl.y, currentW, currentH, cd, live,
    );

    // Hug axis: content = floor, the user can grow beyond on the dragged axis.
    // Fixed axis: the user decides entirely.
    const prevMinW = sizing.minSize?.w ?? 0;
    const prevMinH = sizing.minSize?.h ?? 0;
    const finalW = sizing.x === "hug"
      ? Math.max(axes.x ? this.userW : prevMinW, requiredW)
      : currentW;
    const finalH = sizing.y === "hug"
      ? Math.max(axes.y ? this.userH : prevMinH, requiredH)
      : currentH;

    setShapeSize(container, finalW, finalH);
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd, live);
    syncCoords(container, children);
  }

  /**
   * Called on `object:modified`. On a hug axis the user dragged, what they
   * dragged becomes the floor — under the content it's harmless (the box is
   * max(content, floor)).
   */
  commit(_objects: FabricObject[]): void {
    const { container, sizing, axes } = this;
    const dragsHugX = sizing.x === "hug" && axes.x;
    const dragsHugY = sizing.y === "hug" && axes.y;
    if (!dragsHugX && !dragsHugY) return;

    const minSize = { w: sizing.minSize?.w ?? 0, h: sizing.minSize?.h ?? 0 };
    if (dragsHugX) minSize.w = this.userW;
    if (dragsHugY) minSize.h = this.userH;

    const layout = container.get("layout") as LayoutData;
    container.set("layout", { ...layout, sizing: { ...sizing, minSize } });
  }
}

// ── Shared helpers (used by sessions and reconcile) ─────────────────

/**
 * Find all children of a container from the canvas objects.
 */
export function resolveContainerChildren(
  objects: FabricObject[],
  container: FabricObject,
): ResolvedChild[] {
  const containerId = container.get("layerId") as string;
  const out: ResolvedChild[] = [];
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.child) continue;
    if (layout.child.parentId === containerId) {
      out.push({ obj, cl: layout.child });
    }
  }
  return out;
}

/**
 * Sort children by their `order` property (lower first).
 * Children without `order` keep their relative position (stable sort).
 */
export function sortChildrenByOrder(children: ResolvedChild[]): ResolvedChild[] {
  if (children.length <= 1) return children;
  return [...children].sort((a, b) => {
    const orderA = a.cl.order ?? Infinity;
    const orderB = b.cl.order ?? Infinity;
    return orderA - orderB;
  });
}
