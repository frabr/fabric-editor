/**
 * Layout reconciliation — Flexbox model backed by Yoga.
 *
 * Takes the declared layout state (container/child relationships, size modes,
 * margins, flex props) and resolves concrete positions and dimensions.
 * Idempotent: running it twice on the same state produces the same result.
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
import { type LayoutData, type ContainerData, type ChildData } from "./types";
import { scaledSize, setShapeSize, isTextObject, syncCoords, topLeft } from "./geometry";
import { resolveContainerChildren, sortChildrenByOrder } from "./resize-session";
import { yogaLayout } from "./yoga-engine";

// ── public entry point ───────────────────────────────────────────────

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place. This is for programmatic relayout only
 * (content changes, mode/margin/anchor changes, move).
 */
export function runLayout(objects: FabricObject[]): void {
  // Collect all containers
  const containers: { obj: FabricObject; cd: ContainerData }[] = [];
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (layout?.container) {
      containers.push({ obj, cd: layout.container });
    }
  }

  // Sort bottom-up: nested containers (those with child block) go first,
  // so their size is resolved before their parent lays them out.
  containers.sort((a, b) => {
    const aLayout = a.obj.get("layout") as LayoutData;
    const bLayout = b.obj.get("layout") as LayoutData;
    const aIsNested = aLayout.child ? 1 : 0;
    const bIsNested = bLayout.child ? 1 : 0;
    return bIsNested - aIsNested;
  });

  for (const { obj, cd } of containers) {
    const children = sortChildrenByOrder(resolveContainerChildren(objects, obj));
    if (children.length === 0) continue;

    layoutContainer(obj, cd, children);
    relayoutSubContainers(children, objects);
  }
}

/**
 * Run layout on a single container (not the full canvas).
 * Used during drag sessions when we need to update a sub-container's
 * children without triggering a global relayout.
 */
export function relayoutSingle(
  container: FabricObject,
  cd: ContainerData,
  allObjects: FabricObject[],
): void {
  const children = sortChildrenByOrder(resolveContainerChildren(allObjects, container));
  if (children.length === 0) return;
  layoutContainer(container, cd, children);
  relayoutSubContainers(children, allObjects);
}

/**
 * Bubble layout changes upward through the entire ancestor chain.
 * Starting from `container`, walks up via child→parentId links,
 * calling relayoutSingle on each ancestor so it accommodates the
 * new size of its child.
 */
export function bubbleUpLayout(container: FabricObject, allObjects: FabricObject[]): void {
  let current = container;
  for (;;) {
    const layout = current.get?.("layout") as LayoutData | undefined;
    if (!layout?.child) return;

    const parent = allObjects.find(
      (o) => o.get("layerId") === layout.child!.parentId,
    );
    if (!parent) return;

    const pLayout = parent.get?.("layout") as LayoutData | undefined;
    if (!pLayout?.container) return;

    relayoutSingle(parent, pLayout.container, allObjects);
    current = parent;
  }
}

/**
 * Recursively reposition children that are themselves containers.
 * After a parent is laid out, each sub-container's children need
 * repositioning because the sub-container's position changed.
 */
export function relayoutSubContainers(
  children: { obj: FabricObject; cl: ChildData }[],
  allObjects: FabricObject[],
): void {
  for (const { obj } of children) {
    const childLayout = obj.get("layout") as LayoutData | undefined;
    if (!childLayout?.container) continue;
    const subChildren = sortChildrenByOrder(resolveContainerChildren(allObjects, obj));
    if (subChildren.length === 0) continue;

    const tl = topLeft(obj);
    const { w, h } = scaledSize(obj);
    yogaLayout(subChildren, tl.x, tl.y, w, h, childLayout.container);
    syncCoords(obj, subChildren);
    // Recurse deeper
    relayoutSubContainers(subChildren, allObjects);
  }
}

// ── orchestrator ─────────────────────────────────────────────────────

function layoutContainer(
  container: FabricObject,
  cd: ContainerData,
  children: { obj: FabricObject; cl: ChildData }[],
): void {
  const modeX = cd.sizeMode.x;
  const modeY = cd.sizeMode.y;

  const minW = cd.minSize?.w ?? 0;
  const minH = cd.minSize?.h ?? 0;

  const { w: visW, h: visH } = scaledSize(container);
  const currentW = Math.max(visW, minW);
  const currentH = Math.max(visH, minH);

  const bothFixed = modeX === "fixed" && modeY === "fixed";

  if (!bothFixed) restoreTextFontSizes(children);

  // Use true top-left (handles center-origin shapes like FabRect)
  const tl = topLeft(container);

  // Yoga computes positions + sizes in a single pass (text measure via setMeasureFunc)
  const { w: requiredW, h: requiredH } = yogaLayout(
    children, tl.x, tl.y, currentW, currentH, cd,
  );

  const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
  const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;

  setShapeSize(container, finalW, finalH);

  if (bothFixed) {
    shrinkOverflowingText(children, finalW, finalH, cd);
  }

  // Re-run with final dimensions if hug mode changed the size
  if (finalW !== currentW || finalH !== currentH) {
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd);
  }

  syncCoords(container, children);
}


/** Shrink text children that overflow when both axes are fixed. */
function shrinkOverflowingText(
  children: { obj: FabricObject; cl: ChildData }[],
  containerW: number,
  containerH: number,
  cd: ContainerData,
): void {
  const pad = cd.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const availW = containerW - pad.left - pad.right;
  const availH = containerH - pad.top - pad.bottom;

  for (const { obj } of children) {
    if (!isTextObject(obj)) continue;

    const { h: childH } = scaledSize(obj);

    if (childH > availH) {
      shrinkTextToFit(obj, availW, availH);
    }
  }
}

// ── text shrinking ───────────────────────────────────────────────────

/** Restaurer la fontSize originale des textes qui avaient été shrinkés. */
function restoreTextFontSizes(
  children: { obj: FabricObject; cl: ChildData }[],
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
