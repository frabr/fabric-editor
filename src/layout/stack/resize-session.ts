/**
 * StackResizeSession — one user-initiated resize of a stack container (a group: see
 * free/resize-session).
 *
 * Created by the LayoutManager on the first `object:resizing` event,
 * fed with each subsequent scaling frame, and dropped on `object:modified`.
 *
 * Separates the user's resize intent (which axes, what size) from
 * the programmatic layout reconciliation that runs on every frame.
 */
import type { FabricObject } from "#fabric";
import { type ContainerData, type ResolvedChild, type SizingData } from "../types";
import { scaledSize, setShapeSize, syncCoords, topLeft, cornerToAxes, type ResizeAxes } from "../geometry";
import { yogaLayout } from "./engine";
import { availableRoom, type Room } from "./room";
import { layoutSubtree, relayoutAncestors } from "../run";
import { layoutOf, sizingOf } from "../model";
import { isTextObject, type LayoutText } from "../text";
import { flowChildrenOf, parentContainerOf } from "../hierarchy";
import { minContentSize } from "./min-size";

// ── StackResizeSession ───────────────────────────────────────────────────

/**
 * Handle rules (same as texts, see CustomTextbox):
 * - dragging a left/right edge fixes the width (hug → fixed);
 * - dragging a top/bottom edge on a hug height sets the floor `minSize.h`
 *   (the mode doesn't change); on a fixed height, sets the height;
 * - a corner applies both rules;
 * - the content stops the handle on the way in, the parent's room on the way
 *   out (see room.ts): a child never grows out of its container, and its
 *   ancestors follow on every frame (it stays in its flex slot, siblings move).
 */
export class StackResizeSession {
  private container: FabricObject;
  private containerData: ContainerData;
  private sizing: SizingData;
  private axes: ResizeAxes;
  private corner?: string;

  /** User-intended size — only updated on axes the user controls. */
  private userW: number;
  private userH: number;

  /**
   * Fixed widths of the text children at grab time: the container pushes them
   * when it gets narrower, and they grow back if the user widens it again
   * within the same drag. What remains at release is kept.
   */
  private textWidths = new Map<FabricObject, number>();

  /** Smallest box the content fits in (computed at grab): the handles stop there. */
  private minContent: { w: number; h: number } | null = null;

  /** Largest box the ancestors allow (computed at grab): the handles stop there too. */
  private room: Room | null = null;

  constructor(container: FabricObject, corner?: string) {
    this.container = container;
    const layout = layoutOf(container)!;
    this.containerData = layout.container!;
    this.axes = cornerToAxes(corner);
    this.corner = corner;

    // Touching the width fixes it, for the whole interaction
    const current = sizingOf(container);
    this.sizing = this.axes.x && current.x === "hug" ? { ...current, x: "fixed" } : { ...current };
    container.set("layout", { ...layout, sizing: this.sizing });

    const { w, h } = scaledSize(container);
    this.userW = w;
    this.userH = h;
  }

  /**
   * Resize keeping the edge opposite to the dragged handle in place — when the
   * content stops the handle, the grabbed edge stops, not the other one.
   */
  private setSizeKeepingAnchor(w: number, h: number): void {
    const { container, corner } = this;
    const originX = corner?.includes("l") ? "right" : corner?.includes("r") ? "left" : "center";
    const originY = corner?.includes("t") ? "bottom" : corner?.includes("b") ? "top" : "center";
    const anchor = container.getPositionByOrigin(originX, originY);
    setShapeSize(container, w, h);
    container.setPositionByOrigin(anchor, originX, originY);
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

    this.room ??= availableRoom(container, objects);
    const { w: currentW, h: currentH } = scaledSize(container);

    // Update user size only on axes the user is dragging — within the room.
    if (axes.x) this.userW = Math.min(currentW, this.room.w);
    if (axes.y) this.userH = Math.min(currentH, this.room.h);

    const children = flowChildrenOf(objects, container);
    if (children.length === 0) {
      this.setSizeKeepingAnchor(this.userW, this.userH);
      this.settle(objects);
      return;
    }
    this.restoreTextWidths(children);
    this.minContent ??= minContentSize(children, cd, objects);

    // Live, the floor is what the user drags — not the previous minSize
    const live: SizingData = { x: sizing.x, y: sizing.y };
    const tl = topLeft(container);
    const { w: requiredW, h: requiredH } = yogaLayout(
      children, tl.x, tl.y, currentW, currentH, cd, live, objects,
    );

    // Hug axis: content = floor, the user can grow beyond on the dragged axis.
    // Fixed axis: the user decides entirely.
    const prevMinW = sizing.minSize?.w ?? 0;
    const prevMinH = sizing.minSize?.h ?? 0;
    const finalW = sizing.x === "hug"
      ? Math.max(axes.x ? this.userW : prevMinW, requiredW)
      : Math.max(Math.min(currentW, this.room.w), this.minContent.w);
    const finalH = sizing.y === "hug"
      ? Math.max(axes.y ? this.userH : prevMinH, requiredH)
      : Math.max(Math.min(currentH, this.room.h), this.minContent.h);

    this.setSizeKeepingAnchor(finalW, finalH);
    // Place the children inside the box being dragged, not inside the content
    // box: the hug floor is this frame's size (alignment center / end needs it)
    const placed: SizingData = { ...live, minSize: { w: finalW, h: finalH } };
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd, placed, objects);
    syncCoords(container, children);
    this.settle(objects);
  }

  /**
   * On a hug axis the user drags, what they drag is the floor — under the content
   * it's harmless (the box is max(content, floor)). Written on every frame, so the
   * ancestors' pass sees the same box as this one.
   */
  private persistFloor(): void {
    const { container, sizing, axes } = this;
    const dragsHugX = sizing.x === "hug" && axes.x;
    const dragsHugY = sizing.y === "hug" && axes.y;
    if (!dragsHugX && !dragsHugY) return;

    const minSize = { w: sizing.minSize?.w ?? 0, h: sizing.minSize?.h ?? 0 };
    if (dragsHugX) minSize.w = this.userW;
    if (dragsHugY) minSize.h = this.userH;
    this.sizing = { ...sizing, minSize };

    const layout = layoutOf(container)!;
    container.set("layout", { ...layout, sizing: this.sizing });
  }

  /** A child container: its ancestors take its new size in, and it sits in its slot. */
  private settle(objects: FabricObject[]): void {
    this.persistFloor();
    const parent = parentContainerOf(this.container, objects);
    if (!parent) return;
    layoutSubtree(parent, objects);
    relayoutAncestors(parent, objects);
  }
}

/** @deprecated Use `StackResizeSession`. */
export const ResizeSession = StackResizeSession;
