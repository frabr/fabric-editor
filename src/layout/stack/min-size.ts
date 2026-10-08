/**
 * The least room a stack's content needs: a text its longest word, a rigid shape or a
 * group its size, a nested stack its own minimum. What stops resize handles (see
 * resize-session) and what siblings keep in a stack (see room).
 */
import type { FabricObject } from "#fabric";
import type { ContainerData, ResolvedChild } from "../types";
import { scaledSize } from "../geometry";
import { isFreeContainer, layoutOf, paddingOf, sizingOf } from "../model";
import { flowChildrenOf } from "../hierarchy";
import { asLayoutText, isTextObject } from "../text";

/**
 * Smallest container box its children fit in, without squeezing anything:
 * padding, gaps, rigid children at their size, texts at their longest word
 * (they can wrap) and at no height (they can autofit or clip), nested
 * containers at their own minimum on a hug axis (floored by their minSize)
 * and at their size on a fixed one.
 */
export function minContentSize(
  children: ResolvedChild[],
  cd: ContainerData,
  objects: FabricObject[],
): { w: number; h: number } {
  const pad = paddingOf(cd);
  const gaps = (cd.gap ?? 0) * Math.max(0, children.length - 1);
  const sizes = children.map(({ obj }) => minSizeOf(obj, objects));
  const sum = (key: "w" | "h") => sizes.reduce((total, s) => total + s[key], 0);
  const max = (key: "w" | "h") => Math.max(0, ...sizes.map((s) => s[key]));

  const row = cd.flexDirection === "row";
  return {
    w: pad.left + pad.right + (row ? sum("w") + gaps : max("w")),
    h: pad.top + pad.bottom + (row ? max("h") : sum("h") + gaps),
  };
}

/** What an object takes at the very least: its minimum content (see minContentSize), or its size. */
export function minSizeOf(obj: FabricObject, objects: FabricObject[]): { w: number; h: number } {
  if (isTextObject(obj)) return { w: asLayoutText(obj).minContentWidth(), h: 0 };
  const size = scaledSize(obj);
  // Un groupe est un bloc rigide : sa taille est celle de son contenu, tel qu'il est posé
  if (isFreeContainer(obj)) return size;
  const layout = layoutOf(obj);
  if (!layout?.container) return size;
  const children = flowChildrenOf(objects, obj);
  if (children.length === 0) return size;

  const sizing = sizingOf(obj);
  const min = minContentSize(children, layout.container, objects);
  return {
    w: sizing.x === "hug" ? Math.max(min.w, sizing.minSize?.w ?? 0) : size.w,
    h: sizing.y === "hug" ? Math.max(min.h, sizing.minSize?.h ?? 0) : size.h,
  };
}
