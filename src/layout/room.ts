/**
 * The room a child may take inside its ancestors — what stops its resize handles.
 *
 * A child's handles can't push it out of its parent: on a fixed parent axis the
 * room is the parent's inner size; on a hug axis it is whatever the parent may
 * itself grow to (unbounded at the top of the tree). On the parent's main axis
 * the siblings keep their place — at their minimum, the same one that stops the
 * parent's own handles (a text at its longest word, a rigid shape at its size,
 * a nested container at its own minimum) — and the gaps too.
 */
import type { FabricObject } from "#fabric";
import { type LayoutData, sizingOf } from "./types";
import { scaledSize, resolveContainerChildren } from "./geometry";
import { parentContainerOf } from "./reconcile";
import { minSizeOf } from "./resize-session";

export interface Room {
  w: number;
  h: number;
}

export const UNBOUNDED: Room = { w: Infinity, h: Infinity };

/** The largest box `obj` may take without overflowing its ancestors. */
export function availableRoom(obj: FabricObject, objects: FabricObject[]): Room {
  const parent = parentContainerOf(obj, objects);
  if (!parent) return UNBOUNDED;

  const cd = (parent.get("layout") as LayoutData).container!;
  const sizing = sizingOf(parent);
  const own = scaledSize(parent);
  const above = availableRoom(parent, objects);
  const pad = cd.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };

  let w = (sizing.x === "fixed" ? own.w : above.w) - pad.left - pad.right;
  let h = (sizing.y === "fixed" ? own.h : above.h) - pad.top - pad.bottom;

  const siblings = resolveContainerChildren(objects, parent).filter((c) => c.obj !== obj);
  const gaps = (cd.gap ?? 0) * siblings.length;
  const taken = siblings.map(({ obj: s }) => minSizeOf(s, objects));
  if (cd.flexDirection === "row") w -= taken.reduce((sum, s) => sum + s.w, 0) + gaps;
  else h -= taken.reduce((sum, s) => sum + s.h, 0) + gaps;

  return { w: Math.max(0, w), h: Math.max(0, h) };
}
