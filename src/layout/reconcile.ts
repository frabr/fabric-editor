/**
 * Layout reconciliation — Flexbox model backed by Yoga.
 *
 * Takes the declared layout state (container/child relationships, size modes,
 * margins, flex props) and resolves concrete positions and dimensions.
 * Idempotent: running it twice on the same state produces the same result.
 *
 * Supports two size modes per axis (`layout.sizing`):
 * - "hug": container adapts to content (bottom-up), floored by `minSize`
 * - "fixed": container keeps its size, content adapts
 *
 * The container only gives room: a text child receives the box Yoga computed
 * and decides itself what to do with it (wrap, autofit, clip — see
 * CustomTextbox). The container never touches a text's font size.
 *
 * One pass per root container: its whole subtree is one Yoga tree (see
 * yoga-engine), so a nested container's hug axis is fit-content — constrained
 * by the room above it, sized by the content below it — in the same pass.
 * Single pass, deterministic, no solver.
 *
 * Note: user-initiated resize is handled by ResizeSession, not here.
 * This module only handles programmatic relayout (content changes, mode
 * changes, move, etc.).
 */
import type { FabricObject } from "#fabric";
import { type LayoutData, type ContainerData, type ChildData, sizingOf } from "./types";
import {
  scaledSize,
  setShapeSize,
  syncCoords,
  topLeft,
  resolveContainerChildren,
  sortChildrenByOrder,
} from "./geometry";
import { yogaLayout } from "./yoga-engine";

// ── public entry point ───────────────────────────────────────────────

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place. This is for programmatic relayout only
 * (content changes, mode/margin/anchor changes, move).
 */
export function runLayout(objects: FabricObject[]): void {
  for (const obj of objects) {
    const layout = obj.get("layout") as LayoutData | undefined;
    if (!layout?.container) continue;
    // A nested container is laid out by its root's pass
    if (parentContainerOf(obj, objects)) continue;

    const children = sortChildrenByOrder(resolveContainerChildren(objects, obj));
    if (children.length === 0) continue;
    layoutContainer(obj, layout.container, children, objects);
  }
}

/**
 * Run layout on a single container and its subtree (not the full canvas).
 * Used during drag sessions when we need to update a container's
 * children without triggering a global relayout.
 */
export function relayoutSingle(
  container: FabricObject,
  cd: ContainerData,
  allObjects: FabricObject[],
): void {
  const children = sortChildrenByOrder(resolveContainerChildren(allObjects, container));
  if (children.length === 0) return;
  layoutContainer(container, cd, children, allObjects);
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
    const parent = parentContainerOf(current, allObjects);
    if (!parent) return;
    relayoutSingle(parent, (parent.get("layout") as LayoutData).container!, allObjects);
    current = parent;
  }
}

/** The container `obj` is a child of — when it is in `objects` and really is a container. */
export function parentContainerOf(obj: FabricObject, objects: FabricObject[]): FabricObject | null {
  const layout = obj.get?.("layout") as LayoutData | undefined;
  const parentId = layout?.child?.parentId;
  if (!parentId) return null;
  const parent = objects.find((o) => o.get("layerId") === parentId);
  if (!parent || parent === obj) return null;
  const pLayout = parent.get?.("layout") as LayoutData | undefined;
  return pLayout?.container ? parent : null;
}

// ── orchestrator ─────────────────────────────────────────────────────

function layoutContainer(
  container: FabricObject,
  cd: ContainerData,
  children: { obj: FabricObject; cl: ChildData }[],
  allObjects: FabricObject[],
): void {
  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;

  const { w: visW, h: visH } = scaledSize(container);
  const currentW = sizing.x === "hug" ? Math.max(visW, minW) : visW;
  const currentH = sizing.y === "hug" ? Math.max(visH, minH) : visH;

  // Use true top-left (handles center-origin shapes like FabRect)
  const tl = topLeft(container);

  // Yoga computes positions + sizes in a single pass (text measure via setMeasureFunc)
  const { w: requiredW, h: requiredH } = yogaLayout(
    children, tl.x, tl.y, currentW, currentH, cd, sizing, allObjects,
  );

  const finalW = sizing.x === "hug" ? Math.max(requiredW, minW) : currentW;
  const finalH = sizing.y === "hug" ? Math.max(requiredH, minH) : currentH;

  setShapeSize(container, finalW, finalH);

  // Re-run with final dimensions if hug mode changed the size
  if (finalW !== currentW || finalH !== currentH) {
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd, sizing, allObjects);
  }

  syncCoords(container, children);
}
