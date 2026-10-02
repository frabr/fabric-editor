/**
 * Shared geometry helpers for layout computations.
 *
 * Used by both the layout engine (steady-state relayout) and the
 * LayoutManager (drag-to-layout interactions).
 */
import type { FabricObject } from "#fabric";
import type { LayoutData, ResolvedChild } from "./types";

/** Scaled dimensions (width × scaleX, height × scaleY). */
export function scaledSize(obj: FabricObject): { w: number; h: number } {
  return {
    w: obj.width * (obj.scaleX || 1),
    h: obj.height * (obj.scaleY || 1),
  };
}

/**
 * Set the visual size of an object through its own setSize() (a rect sets its
 * width/height, a circle or a path its scale, an image frame its frame). Without
 * one (a group of paths), scale it.
 */
export function setShapeSize(obj: FabricObject, w: number, h: number): void {
  const sized = obj as FabricObject & { setSize?: (w: number, h: number) => void };
  if (typeof sized.setSize === "function") sized.setSize(w, h);
  else obj.set({ scaleX: w / (obj.width || 1), scaleY: h / (obj.height || 1) });
}

/** Top-left corner in canvas coordinates, regardless of originX/Y. */
export function topLeft(obj: FabricObject): { x: number; y: number } {
  const { w, h } = scaledSize(obj);
  const center = obj.getRelativeCenterPoint();
  return { x: center.x - w / 2, y: center.y - h / 2 };
}

/** Hit-test: is a point inside an object's bounding box (with optional margin)? */
export function pointInObject(
  point: { x: number; y: number },
  obj: FabricObject,
  margin = 0,
): boolean {
  const tl = topLeft(obj);
  const { w, h } = scaledSize(obj);
  return (
    point.x >= tl.x - margin && point.x <= tl.x + w + margin &&
    point.y >= tl.y - margin && point.y <= tl.y + h + margin
  );
}

const TEXT_TYPES = ["i-text", "textbox"];

/** The layout-facing surface of a text object (implemented by CustomTextbox). */
export interface LayoutText {
  /** Narrowest the text can get: its longest word. */
  minContentWidth(): number;
  /** A layout pass: the container's constraint (null: the text left its container). */
  layoutWith(constraint: { maxW?: number; w?: number; h?: number } | null): void;
}

export function isTextObject(obj: FabricObject): boolean {
  return TEXT_TYPES.includes(obj.type);
}

/**
 * Clamp the top-left of `obj` so it doesn't go above/left of
 * `reference`'s top-left + padding. Returns the clamped position.
 */
export function clampTopLeft(
  obj: FabricObject,
  reference: FabricObject,
  padding: number,
): { x: number; y: number } {
  const tl = topLeft(obj);
  const refTl = topLeft(reference);
  return {
    x: Math.max(refTl.x + padding, tl.x),
    y: Math.max(refTl.y + padding, tl.y),
  };
}

/**
 * Has a point moved back past a threshold distance from an origin,
 * on the axis/direction where an initial offset was applied?
 *
 * Used to detect when a user "undoes" a clamp by dragging away.
 */
export function hasExceededOffset(
  current: { x: number; y: number },
  origin: { x: number; y: number },
  offsetX: number,
  offsetY: number,
  margin: number,
): boolean {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  return (
    (offsetX > 0 && dx < -(offsetX + margin)) ||
    (offsetX < 0 && dx > (-offsetX + margin)) ||
    (offsetY > 0 && dy < -(offsetY + margin)) ||
    (offsetY < 0 && dy > (-offsetY + margin))
  );
}

/**
 * Remove an object's `child` block, keeping the rest of its layout (sizing,
 * container, overflow). A text also drops the box its container imposed.
 */
export function detachChild(obj: FabricObject): void {
  const layout = obj.get?.("layout") as LayoutData | undefined;
  if (layout?.child) {
    const { child: _child, ...rest } = layout;
    obj.set("layout", Object.keys(rest).length ? rest : undefined);
  }
  if (isTextObject(obj)) (obj as unknown as LayoutText).layoutWith(null);
}

/** Deep-clone a Fabric object's layout data for snapshot/rollback. */
export function cloneLayout(obj: FabricObject): LayoutData | undefined {
  const layout = obj.get?.("layout") as LayoutData | undefined;
  return layout ? JSON.parse(JSON.stringify(layout)) : undefined;
}

/** Refresh Fabric's internal coordinate caches. */
export function syncCoords(
  container: FabricObject,
  children: ResolvedChild[],
): void {
  container.setCoords();
  for (const { obj } of children) {
    obj.setCoords();
  }
}

/** Which axes the user is actively dragging (derived from Fabric corner). */
export interface ResizeAxes {
  x: boolean;
  y: boolean;
}

/** Translate a Fabric control corner id to the axes it controls. */
export function cornerToAxes(corner?: string): ResizeAxes {
  if (!corner) return { x: true, y: true };
  const hasX = corner.includes("l") || corner.includes("r");
  const hasY = corner.includes("t") || corner.includes("b");
  // ml/mr → x only, mt/mb → y only, tl/tr/bl/br → both
  return { x: hasX, y: hasY };
}
