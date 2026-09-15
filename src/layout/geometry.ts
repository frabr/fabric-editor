/**
 * Shared geometry helpers for layout computations.
 *
 * Used by both the layout engine (steady-state relayout) and the
 * LayoutManager (drag-to-layout interactions).
 */
import type { FabricObject } from "#fabric";
import type { ResolvedChild } from "./types";

/** Scaled dimensions (width × scaleX, height × scaleY). */
export function scaledSize(obj: FabricObject): { w: number; h: number } {
  return {
    w: obj.width * (obj.scaleX || 1),
    h: obj.height * (obj.scaleY || 1),
  };
}

/** Top-left corner in canvas coordinates, regardless of originX/Y. */
export function topLeft(obj: FabricObject): { x: number; y: number } {
  const { w, h } = scaledSize(obj);
  let x = obj.left;
  let y = obj.top;
  if (obj.originX === "center") x -= w / 2;
  else if (obj.originX === "right") x -= w;
  if (obj.originY === "center") y -= h / 2;
  else if (obj.originY === "bottom") y -= h;
  return { x, y };
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

/** Measure the bounding box that children need (margins included). */
export function measureChildren(
  children: ResolvedChild[],
): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const { obj, cl } of children) {
    const { w: childW, h: childH } = scaledSize(obj);
    w = Math.max(w, cl.margins.left + childW + cl.margins.right);
    h = Math.max(h, cl.margins.top + childH + cl.margins.bottom);
  }
  return { w, h };
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
