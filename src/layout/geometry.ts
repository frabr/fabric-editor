/**
 * Shared geometry helpers for layout computations.
 *
 * Used by both the layout engine (steady-state relayout) and the
 * LayoutManager (drag-to-layout interactions).
 */
import type { FabricObject } from "#fabric";

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
