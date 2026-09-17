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
  type SizeMode,
} from "./types";
import {
  scaledSize,
  setShapeSize,
  syncCoords,
  topLeft,
  cornerToAxes,
  type ResizeAxes,
} from "./geometry";
import { yogaLayout } from "./yoga-engine";

// ── ResizeSession ───────────────────────────────────────────────────

export class ResizeSession {
  private container: FabricObject;
  private containerData: ContainerData;
  private axes: ResizeAxes;

  /** User-intended size — only updated on axes the user controls. */
  private userW: number;
  private userH: number;

  constructor(container: FabricObject, corner?: string) {
    this.container = container;
    const layout = container.get("layout") as LayoutData;
    this.containerData = layout.container!;
    this.axes = cornerToAxes(corner);

    const { w, h } = scaledSize(container);
    this.userW = w;
    this.userH = h;
  }

  /**
   * Called on each `object:resizing` frame.
   * Controls already set width/height directly (no scale involved).
   */
  handleResizing(objects: FabricObject[]): void {
    const { container, containerData, axes } = this;
    const cd = containerData;

    const { w: currentW, h: currentH } = scaledSize(container);

    // Update user size only on axes the user is dragging.
    if (axes.x) this.userW = currentW;
    if (axes.y) this.userH = currentH;

    const children = sortChildrenByOrder(resolveContainerChildren(objects, container));
    if (children.length === 0) return;

    // Use true top-left (handles center-origin shapes like FabRect)
    const tl = topLeft(container);

    const { w: requiredW, h: requiredH } = yogaLayout(
      children, tl.x, tl.y, currentW, currentH, cd,
    );

    const modeX = cd.sizeMode.x;
    const modeY = cd.sizeMode.y;

    // Axes hug: content = floor. User can grow beyond if dragging that axis.
    // Axes fixed: user decides entirely.
    let finalW: number;
    if (modeX === "hug") {
      finalW = axes.x ? Math.max(this.userW, requiredW) : requiredW;
    } else {
      finalW = currentW;
    }

    let finalH: number;
    if (modeY === "hug") {
      finalH = axes.y ? Math.max(this.userH, requiredH) : requiredH;
    } else {
      finalH = currentH;
    }

    // Apply resolved size and re-position with final dimensions.
    setShapeSize(container, finalW, finalH);
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd);
    syncCoords(container, children);
  }

  /**
   * Called on `object:modified`. Captures minSize from the user's intent.
   */
  commit(objects: FabricObject[]): void {
    const { container, containerData } = this;
    const modeX = containerData.sizeMode.x;
    const modeY = containerData.sizeMode.y;

    const { w: containerW, h: containerH } = scaledSize(container);
    if (!containerData.minSize) containerData.minSize = { w: 0, h: 0 };
    if (modeX === "hug") containerData.minSize.w = this.userW;
    if (modeX === "fixed") containerData.minSize.w = containerW;
    if (modeY === "hug") containerData.minSize.h = this.userH;
    if (modeY === "fixed") containerData.minSize.h = containerH;
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
