/**
 * ResizeSession — encapsulates one user-initiated resize interaction.
 *
 * Created by the LayoutManager on the first `object:scaling` event,
 * fed with each subsequent scaling frame, and committed on `object:modified`.
 *
 * Separates the user's resize intent (which axes, what size) from
 * the programmatic layout reconciliation that runs on every frame.
 */
import type { FabricObject, FabricText } from "#fabric";
import {
  isChildLayout,
  type LayoutData,
  type ChildLayout,
  type ContainerLayout,
  type ResolvedChild,
  type SizeMode,
} from "./types";
import {
  scaledSize,
  isTextObject,
  measureChildren,
  syncCoords,
  cornerToAxes,
  type ResizeAxes,
} from "./geometry";

// ── ResizeSession ───────────────────────────────────────────────────

export class ResizeSession {
  private container: FabricObject;
  private layout: ContainerLayout;
  private axes: ResizeAxes;

  /** User-intended size — only updated on axes the user controls. */
  private userW: number;
  private userH: number;

  constructor(container: FabricObject, corner?: string) {
    this.container = container;
    this.layout = container.get("layout") as ContainerLayout;
    this.axes = cornerToAxes(corner);

    // Initial user size = current scaled size
    const { w, h } = scaledSize(container);
    this.userW = w;
    this.userH = h;
  }

  /**
   * Called on each `object:scaling` frame.
   * Reads the user's resize intent, runs layout, and adjusts the
   * container's scale to reflect the resolved size.
   */
  handleScaling(objects: FabricObject[]): void {
    const { container, layout, axes } = this;
    const modeX = layout.sizeMode.x;
    const modeY = layout.sizeMode.y;

    const { w: scaledW, h: scaledH } = scaledSize(container);

    // Update user size only on axes the user is dragging.
    // On other axes, scaleY may be our residual from the previous frame.
    if (axes.x) this.userW = scaledW;
    if (axes.y) this.userH = scaledH;

    const children = resolveContainerChildren(objects, container);
    if (children.length === 0) return;

    prepareTextChildren(children, modeX, scaledW);
    const { w: requiredW, h: requiredH } = measureChildren(children);

    // Axes hug: content = floor. User can grow beyond if dragging that axis.
    // Axes fixed: user decides entirely.
    let finalW: number;
    if (modeX === "hug") {
      finalW = axes.x ? Math.max(this.userW, requiredW) : requiredW;
    } else {
      finalW = scaledW;
    }

    let finalH: number;
    if (modeY === "hug") {
      finalH = axes.y ? Math.max(this.userH, requiredH) : requiredH;
    } else {
      finalH = scaledH;
    }

    // Adjust scale for rendering (Fabric re-computes it next frame).
    if (finalW !== scaledW || finalH !== scaledH) {
      container.set({
        scaleX: finalW / container.width,
        scaleY: finalH / container.height,
      });
    }

    positionChildren(children, container.left, container.top, finalW, finalH);
    syncCoords(container, children);
  }

  /**
   * Called on `object:modified`. Absorbs the scale into width/height,
   * captures minSize from the user's intent, and runs a final layout pass.
   */
  commit(objects: FabricObject[]): void {
    const { container, layout } = this;

    // Absorb scale into dimensions
    const sx = container.scaleX || 1;
    const sy = container.scaleY || 1;
    if (sx !== 1 || sy !== 1) {
      container.set({
        width: container.width * sx,
        height: container.height * sy,
        scaleX: 1,
        scaleY: 1,
      });
    }

    // Capture minSize from user intent (not from the potentially
    // hug-adjusted scale, but from the tracked userW/userH).
    const modeX = layout.sizeMode.x;
    const modeY = layout.sizeMode.y;
    if (!layout.minSize) layout.minSize = { w: 0, h: 0 };
    if (modeX === "hug") layout.minSize.w = this.userW;
    if (modeX === "fixed") layout.minSize.w = container.width;
    if (modeY === "hug") layout.minSize.h = this.userH;
    if (modeY === "fixed") layout.minSize.h = container.height;
  }
}

// ── Shared layout operations (used by both ResizeSession and runLayout) ──

export function resolveContainerChildren(
  objects: FabricObject[],
  container: FabricObject,
): ResolvedChild[] {
  const containerId = container.get("layerId") as string;
  const out: ResolvedChild[] = [];
  for (const obj of objects) {
    const cl = obj.get("layout") as LayoutData | undefined;
    if (cl && isChildLayout(cl) && cl.parentId === containerId) {
      out.push({ obj, cl });
    }
  }
  return out;
}

export function prepareTextChildren(
  children: ResolvedChild[],
  modeX: SizeMode,
  containerW: number,
): void {
  for (const { obj, cl } of children) {
    if (!isTextObject(obj)) continue;

    const t = obj as unknown as FabricText;
    const anchorX = cl.anchorX ?? "left";

    t.set({ textAlign: anchorX === "right" ? "right" : "left" });

    if (modeX === "fixed") {
      const availW = containerW - cl.margins.left - cl.margins.right;
      obj.set({ width: availW / (obj.scaleX || 1) });
    } else {
      obj.set({ width: 10000 });
    }

    t.initDimensions();

    if (modeX === "hug") {
      const realW = Math.ceil(t.calcTextWidth());
      obj.set({ width: realW });
      t.initDimensions();
    }
  }
}

export function positionChildren(
  children: ResolvedChild[],
  containerLeft: number,
  containerTop: number,
  containerW: number,
  containerH: number,
): void {
  for (const { obj, cl } of children) {
    const anchorX = cl.anchorX ?? "left";
    const anchorY = cl.anchorY ?? "top";
    const { w: childW, h: childH } = scaledSize(obj);

    const left = anchorX === "left"
      ? containerLeft + cl.margins.left
      : containerLeft + containerW - cl.margins.right - childW;

    const top = anchorY === "top"
      ? containerTop + cl.margins.top
      : containerTop + containerH - cl.margins.bottom - childH;

    obj.set({ left, top });
  }
}
