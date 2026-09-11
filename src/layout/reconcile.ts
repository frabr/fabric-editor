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
import { scaledSize, isTextObject } from "./geometry";

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

/**
 * Absorbe le scale dans width/height et remet scaleX/Y à 1.
 * En mode hug, met à jour minSize car un resize manuel = nouveau plancher.
 */
function normalizeScale(obj: FabricObject, layout: ContainerLayout): void {
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  if (sx === 1 && sy === 1) return;

  const newW = obj.width * sx;
  const newH = obj.height * sy;

  obj.set({ width: newW, height: newH, scaleX: 1, scaleY: 1 });

  // Resize manuel → mettre à jour le plancher sur les axes hug
  const modeX = layout.sizeMode.x;
  const modeY = layout.sizeMode.y;
  if (modeX === "hug" || modeY === "hug") {
    if (!layout.minSize) layout.minSize = { w: 0, h: 0 };
    if (modeX === "hug") layout.minSize.w = newW;
    if (modeY === "hug") layout.minSize.h = newH;
  }
}

// ── public entry point ───────────────────────────────────────────────

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place.
 *
 * @param preview — si true, skip normalizeScale (pour le live preview pendant un resize)
 */
export function runLayout(objects: FabricObject[], preview = false): void {
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout || !isContainerLayout(layout)) continue;

    const containerId = obj.get("layerId") as string;
    const children = resolveChildren(objects, containerId);
    if (children.length === 0) continue;

    layoutContainer(obj, layout, children, preview);
  }
}

// ── orchestrator ─────────────────────────────────────────────────────

function layoutContainer(
  container: FabricObject,
  layout: ContainerLayout,
  children: ResolvedChild[],
  preview = false
): void {
  // Preview (pendant le scaling) : juste repositionner les enfants
  if (preview) {
    const { w, h } = scaledSize(container);
    positionChildren(children, container.left, container.top, w, h);
    syncCoords(container, children);
    return;
  }

  const modeX = layout.sizeMode.x;
  const modeY = layout.sizeMode.y;

  normalizeScale(container, layout);

  const { w: rawW, h: rawH } = scaledSize(container);
  const minW = layout.minSize?.w ?? 0;
  const minH = layout.minSize?.h ?? 0;

  // En mode fixed, la largeur/hauteur effective est au moins minSize
  const currentW = Math.max(rawW, minW);
  const currentH = Math.max(rawH, minH);

  const bothFixed = modeX === "fixed" && modeY === "fixed";

  // Restaurer la fontSize originale si on n'est plus en shrink
  if (!bothFixed) restoreTextFontSizes(children);

  prepareTextChildren(children, modeX, currentW);

  const { w: requiredW, h: requiredH } = measureChildren(children);

  const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
  const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;

  applyContainerSize(container, finalW, finalH);

  if (bothFixed) {
    shrinkOverflowingText(children, finalW, finalH);
  }

  positionChildren(children, container.left, container.top, finalW, finalH);

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
    const anchorX = cl.anchorX ?? "left";

    // Alignement du texte selon l'anchor
    t.set({ textAlign: anchorX === "right" ? "right" : "left" });

    if (modeX === "fixed") {
      const availW = containerW - cl.margins.left - cl.margins.right;
      obj.set({ width: availW / (obj.scaleX || 1) });
    } else {
      // Libérer la largeur pour mesurer la taille naturelle
      obj.set({ width: 10000 });
    }

    t.initDimensions();

    if (modeX === "hug") {
      // ceil pour éviter qu'un arrondi flottant ne fasse wrapper le dernier mot
      const realW = Math.ceil(t.calcTextWidth());
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

/** Position each child relative to the container, selon ses anchors. */
function positionChildren(
  children: ResolvedChild[],
  containerLeft: number,
  containerTop: number,
  containerW: number,
  containerH: number
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
