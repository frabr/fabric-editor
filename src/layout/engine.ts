/**
 * Layout engine — "springs & struts" model.
 *
 * Supports two size modes per axis:
 * - "hug": container adapts to content (bottom-up)
 * - "fixed": container keeps its size, content adapts
 *
 * When X is fixed: text wraps at the available width (Textbox behavior).
 * When both X and Y are fixed: text also shrinks (fontSize) if it overflows.
 *
 * Single pass, deterministic, no solver.
 */
import type { FabricObject, FabricText } from "#fabric";
import {
  isContainerLayout,
  isChildLayout,
  type LayoutData,
  type ChildLayout,
  type ContainerLayout,
  type SizeMode,
} from "./types";

const TEXT_TYPES = ["i-text", "textbox"];

function isTextObject(obj: FabricObject): boolean {
  return TEXT_TYPES.includes(obj.type);
}

// ── helpers ──────────────────────────────────────────────────────────

/** Resolved child: the Fabric object paired with its ChildLayout. */
interface ResolvedChild {
  obj: FabricObject;
  cl: ChildLayout;
}

function resolveChildren(
  objects: FabricObject[],
  containerId: string
): ResolvedChild[] {
  const out: ResolvedChild[] = [];
  for (const obj of objects) {
    const cl = obj.get("layout") as LayoutData | undefined;
    if (cl && isChildLayout(cl) && cl.parentId === containerId) {
      out.push({ obj, cl });
    }
  }
  return out;
}

function scaledSize(obj: FabricObject): { w: number; h: number } {
  return {
    w: obj.width * (obj.scaleX || 1),
    h: obj.height * (obj.scaleY || 1),
  };
}

// ── public entry point ───────────────────────────────────────────────

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place.
 */
export function runLayout(objects: FabricObject[]): void {
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout || !isContainerLayout(layout)) continue;

    const containerId = obj.get("layerId") as string;
    const children = resolveChildren(objects, containerId);
    if (children.length === 0) continue;

    layoutContainer(obj, layout, children);
  }
}

// ── orchestrator ─────────────────────────────────────────────────────

function layoutContainer(
  container: FabricObject,
  layout: ContainerLayout,
  children: ResolvedChild[]
): void {
  const modeX = layout.sizeMode.x;
  const modeY = layout.sizeMode.y;
  const { w: currentW, h: currentH } = scaledSize(container);

  const bothFixed = modeX === "fixed" && modeY === "fixed";

  // Restaurer la fontSize originale si on n'est plus en shrink
  if (!bothFixed) restoreTextFontSizes(children);

  prepareTextChildren(children, modeX, currentW);

  const { w: requiredW, h: requiredH } = measureChildren(children);

  const finalW = modeX === "hug" ? requiredW : currentW;
  const finalH = modeY === "hug" ? requiredH : currentH;

  applyContainerSize(container, finalW, finalH);

  if (bothFixed) {
    shrinkOverflowingText(children, finalW, finalH);
  }

  positionChildren(children, container.left, container.top);

  syncCoords(container, children);
}

// ── steps ────────────────────────────────────────────────────────────

/**
 * Constrain or release text width depending on the X size mode.
 * Only affects text objects — shapes/images keep their dimensions.
 */
function prepareTextChildren(
  children: ResolvedChild[],
  modeX: SizeMode,
  containerW: number
): void {
  for (const { obj, cl } of children) {
    if (!isTextObject(obj)) continue;

    const t = obj as unknown as FabricText;

    if (modeX === "fixed") {
      const availW = containerW - cl.margins.left - cl.margins.right;
      obj.set({ width: availW / (obj.scaleX || 1) });
    } else {
      // Libérer la largeur pour mesurer la taille naturelle
      obj.set({ width: 10000 });
    }

    t.initDimensions();

    if (modeX === "hug") {
      const realW = t.calcTextWidth();
      obj.set({ width: realW });
      t.initDimensions();
    }
  }
}

/** Measure the bounding box that children need (margins included). */
function measureChildren(
  children: ResolvedChild[]
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

/** Apply the resolved size to the container. */
function applyContainerSize(
  container: FabricObject,
  finalW: number,
  finalH: number
): void {
  container.set({
    width: finalW / (container.scaleX || 1),
    height: finalH / (container.scaleY || 1),
  });
}

/** Shrink text children that overflow when both axes are fixed. */
function shrinkOverflowingText(
  children: ResolvedChild[],
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

/** Position each child relative to the container's top-left corner. */
function positionChildren(
  children: ResolvedChild[],
  containerLeft: number,
  containerTop: number
): void {
  for (const { obj, cl } of children) {
    obj.set({
      left: containerLeft + cl.margins.left,
      top: containerTop + cl.margins.top,
    });
  }
}

/** Refresh Fabric's internal coordinate caches. */
function syncCoords(
  container: FabricObject,
  children: ResolvedChild[]
): void {
  container.setCoords();
  for (const { obj } of children) {
    obj.setCoords();
  }
}

// ── text shrinking ───────────────────────────────────────────────────

/** Restaurer la fontSize originale des textes qui avaient été shrinkés. */
function restoreTextFontSizes(children: ResolvedChild[]): void {
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
    obj.set({ width: availW / (obj.scaleX || 1) });
    t.initDimensions();
  }
}
