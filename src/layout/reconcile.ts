/**
 * Layout reconciliation — "springs & struts" model.
 *
 * Takes the declared layout state (container/child relationships, size modes,
 * margins) and resolves concrete positions and dimensions. Idempotent:
 * running it twice on the same state produces the same result.
 *
 * Supports two size modes per axis:
 * - "hug": container adapts to content (bottom-up)
 * - "fixed": container keeps its size, content adapts
 *
 * When X is fixed: text wraps at the available width (Textbox behavior).
 * When both X and Y are fixed: text also shrinks (fontSize) if it overflows.
 *
 * Single pass, deterministic, no solver.
 *
 * Note: user-initiated resize is handled by ResizeSession, not here.
 * This module only handles programmatic relayout (content changes, mode
 * changes, move, etc.).
 */
import type { FabricObject, FabricText } from "#fabric";
import {
  isContainerLayout,
  type LayoutData,
  type ContainerLayout,
} from "./types";
import { scaledSize, isTextObject, measureChildren, syncCoords } from "./geometry";
import {
  resolveContainerChildren,
  prepareTextChildren,
  positionChildren,
} from "./resize-session";

// ── public entry point ───────────────────────────────────────────────

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place. This is for programmatic relayout only
 * (content changes, mode/margin/anchor changes, move).
 */
export function runLayout(objects: FabricObject[]): void {
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout || !isContainerLayout(layout)) continue;

    const children = resolveContainerChildren(objects, obj);
    if (children.length === 0) continue;

    layoutContainer(obj, layout, children);
  }
}

// ── orchestrator ─────────────────────────────────────────────────────

function layoutContainer(
  container: FabricObject,
  layout: ContainerLayout,
  children: { obj: FabricObject; cl: import("./types").ChildLayout }[],
): void {
  const modeX = layout.sizeMode.x;
  const modeY = layout.sizeMode.y;

  const minW = layout.minSize?.w ?? 0;
  const minH = layout.minSize?.h ?? 0;

  const currentW = Math.max(container.width, minW);
  const currentH = Math.max(container.height, minH);

  const bothFixed = modeX === "fixed" && modeY === "fixed";

  if (!bothFixed) restoreTextFontSizes(children);

  prepareTextChildren(children, modeX, currentW);

  const { w: requiredW, h: requiredH } = measureChildren(children);

  const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
  const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;

  container.set({ width: finalW, height: finalH });

  if (bothFixed) {
    shrinkOverflowingText(children, finalW, finalH);
  }

  positionChildren(children, container.left, container.top, finalW, finalH);

  syncCoords(container, children);
}


/** Shrink text children that overflow when both axes are fixed. */
function shrinkOverflowingText(
  children: { obj: FabricObject; cl: import("./types").ChildLayout }[],
  containerW: number,
  containerH: number
): void {
  for (const { obj, cl } of children) {
    if (!isTextObject(obj)) continue;

    const availW = containerW - cl.margins.left - cl.margins.right;
    const availH = containerH - cl.margins.top - cl.margins.bottom;
    const { h: childH } = scaledSize(obj);

    if (childH > availH) {
      shrinkTextToFit(obj, availW, availH);
    }
  }
}

// ── text shrinking ───────────────────────────────────────────────────

/** Restaurer la fontSize originale des textes qui avaient été shrinkés. */
function restoreTextFontSizes(
  children: { obj: FabricObject; cl: import("./types").ChildLayout }[],
): void {
  for (const { obj } of children) {
    if (!isTextObject(obj)) continue;

    const t = obj as unknown as FabricText & { _layoutOriginalFontSize?: number };
    if (t._layoutOriginalFontSize == null) continue;

    t.fontSize = t._layoutOriginalFontSize;
    delete t._layoutOriginalFontSize;
    t.initDimensions();
  }
}

/**
 * Shrink a text object's fontSize until it fits within availW × availH.
 * Stores the original fontSize as `_layoutOriginalFontSize` so we can
 * grow back if space becomes available (e.g. switching back to hug).
 */
function shrinkTextToFit(
  obj: FabricObject,
  availW: number,
  availH: number
): void {
  const t = obj as unknown as FabricText & { _layoutOriginalFontSize?: number };
  const originalSize = t._layoutOriginalFontSize ?? t.fontSize;
  t._layoutOriginalFontSize = originalSize;

  // Reset to original before measuring
  t.fontSize = originalSize;
  t.initDimensions();

  const minFontSize = 8;
  let fontSize = originalSize;

  for (let i = 0; i < 20; i++) {
    const { w: textW, h: textH } = scaledSize(obj);

    if (textW <= availW && textH <= availH) break;
    if (fontSize <= minFontSize) break;

    const ratioW = availW / Math.max(textW, 1);
    const ratioH = availH / Math.max(textH, 1);
    fontSize = Math.max(minFontSize, Math.floor(fontSize * Math.min(ratioW, ratioH)));

    t.fontSize = fontSize;
    obj.set({ width: availW });
    t.initDimensions();
  }
}
