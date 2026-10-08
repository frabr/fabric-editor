/**
 * Yoga layout engine — Flexbox computation for containers.
 *
 * Builds a temporary Yoga node tree from the declared layout state,
 * runs calculateLayout(), reads back computed positions, and frees
 * the tree. Stateless: no persistent Yoga nodes are kept.
 *
 * Key behaviors:
 * - flexDirection: Column or Row (from ContainerData)
 * - alignItems: from ContainerData (default FlexStart)
 * - justifyContent: from ContainerData (default FlexStart)
 * - gap: from ContainerData (uniform spacing between children)
 * - Per-child alignSelf, flexGrow, flexShrink
 * - Text nodes use setMeasureFunc() for intrinsic sizing: the text measures
 *   itself under the width Yoga offers, then receives the box Yoga computed
 *   (see CustomTextbox.layoutWith) — its own sizing and overflow do the rest
 * - A nested container is a node of its own, with its children under it
 *   (when the caller hands over the canvas objects to find them): the whole
 *   subtree is one Yoga tree, so a hug axis means "fit-content" — as wide as
 *   its content, never wider than the room its parent gives (a text three
 *   levels down wraps at the top container's width), and heights flow up
 *   in the same pass. Without the objects, a nested container is a rigid box.
 * - A group (free container) is always a rigid box — its size is its content's, fitted
 *   before the pass (see reconcile) — and its descendants follow when Yoga moves it.
 */
import type { FabricObject } from "#fabric";
import { type ResolvedChild, type ContainerData, type SizingData } from "../types";
import { scaledSize, setShapeSize, topLeft } from "../geometry";
import { layoutOf, isFreeContainer, sizingOf, directionOf } from "../model";
import { flowChildrenOf, descendantsOf, translateObjects } from "../hierarchy";
import { isTextObject, type LayoutText } from "../text";

// ── Yoga singleton ─────────────────────────────────────────────────

type Yoga = Awaited<ReturnType<typeof import("yoga-layout/load").loadYoga>>;
type YogaNode = ReturnType<Yoga["Node"]["create"]>;
type YogaConfig = ReturnType<Yoga["Config"]["create"]>;

let yoga: Yoga | null = null;

/**
 * No pixel rounding: a text measured at 68.3px must come back at 68.3px, or
 * the rounded size would read as a box imposed by the container (and lock the
 * text against its own resize handles).
 */
let yogaConfig: YogaConfig | null = null;

export async function initYoga(): Promise<void> {
  if (yoga) return;
  const { loadYoga } = await import("yoga-layout/load");
  yoga = await loadYoga();
  yogaConfig = yoga.Config.create();
  yogaConfig.setPointScaleFactor(0);
}

export function isYogaReady(): boolean {
  return yoga !== null;
}

function getYoga(): Yoga {
  if (!yoga) throw new Error("Yoga not initialized. Call initYoga() first.");
  return yoga;
}

// ── Core layout function ───────────────────────────────────────────

/** A built node: the Fabric object, its Yoga node, and its own children when nested. */
interface Built {
  obj: FabricObject;
  node: YogaNode;
  children?: Built[];
  /** A group's descendants: they follow it where Yoga puts it. */
  followers?: FabricObject[];
}

/**
 * Compute layout positions for children within a container using Yoga.
 *
 * Children must be sorted by `order` (lower first, then insertion order).
 * Each child is positioned and its Fabric object is updated in-place.
 * With `allObjects`, children that are containers are laid out too, as
 * subtrees of this one (see the module doc).
 *
 * Returns the required container size (for hug mode).
 */
export function yogaLayout(
  children: ResolvedChild[],
  containerLeft: number,
  containerTop: number,
  containerW: number,
  containerH: number,
  cd: ContainerData,
  sizing: SizingData,
  allObjects?: FabricObject[],
): { w: number; h: number } {
  if (children.length === 0) return { w: 0, h: 0 };

  const Y = getYoga();
  const modeX = sizing.x;
  const modeY = sizing.y;

  // ── Build root node (container) ──────────────────────────────
  const root = Y.Node.create(yogaConfig!);
  applyContainerStyle(root, cd, Y);

  // Container size from mode
  if (modeX === "fixed") root.setWidth(containerW);
  else root.setWidthAuto();
  if (modeY === "fixed") root.setHeight(containerH);
  else root.setHeightAuto();
  applyHugFloor(root, sizing);

  // ── Build child nodes ────────────────────────────────────────
  const built = buildChildren(root, children, cd, sizing, allObjects, Y);

  // ── Calculate layout ─────────────────────────────────────────
  root.calculateLayout(
    modeX === "fixed" ? containerW : undefined,
    modeY === "fixed" ? containerH : undefined,
  );

  // ── Read back positions ──────────────────────────────────────
  placeChildren(built, containerLeft, containerTop, 0);

  // ── Read required size ───────────────────────────────────────
  const w = root.getComputedWidth();
  const h = root.getComputedHeight();

  // ── Cleanup ──────────────────────────────────────────────────
  root.freeRecursive();

  return { w, h };
}

// ── Tree building ──────────────────────────────────────────────────

/** Direction, alignment, gap and padding of a container, on its node. */
function applyContainerStyle(node: YogaNode, cd: ContainerData, Y: Yoga): void {
  const isColumn = directionOf(cd) === "column";
  node.setFlexDirection(isColumn ? Y.FLEX_DIRECTION_COLUMN : Y.FLEX_DIRECTION_ROW);
  node.setAlignItems(mapAlignItems(cd.alignItems ?? "flex-start", Y));
  node.setJustifyContent(mapJustifyContent(cd.justifyContent ?? "flex-start", Y));

  const gap = cd.gap ?? 0;
  if (gap > 0) node.setGap(isColumn ? Y.GUTTER_ROW : Y.GUTTER_COLUMN, gap);

  const pad = cd.padding;
  if (pad) {
    node.setPadding(Y.EDGE_TOP, pad.top);
    node.setPadding(Y.EDGE_RIGHT, pad.right);
    node.setPadding(Y.EDGE_BOTTOM, pad.bottom);
    node.setPadding(Y.EDGE_LEFT, pad.left);
  }
}

/**
 * Hug floor (set by the resize handles): Yoga must know it, so that children
 * align (center, flex-end) inside the real box, not inside the content box.
 */
function applyHugFloor(node: YogaNode, sizing: SizingData): void {
  const minSize = sizing.minSize;
  if (!minSize) return;
  if (sizing.x === "hug" && minSize.w > 0) node.setMinWidth(minSize.w);
  if (sizing.y === "hug" && minSize.h > 0) node.setMinHeight(minSize.h);
}

/** The children of a nested container, when the caller lets us look them up. */
function nestedChildren(obj: FabricObject, allObjects?: FabricObject[]): ResolvedChild[] | null {
  if (!allObjects || isTextObject(obj) || isFreeContainer(obj)) return null;
  const layout = layoutOf(obj);
  if (!layout?.container) return null;
  const children = flowChildrenOf(allObjects, obj);
  return children.length > 0 ? children : null;
}

function buildChildren(
  parent: YogaNode,
  children: ResolvedChild[],
  cd: ContainerData,
  sizing: SizingData,
  allObjects: FabricObject[] | undefined,
  Y: Yoga,
): Built[] {
  const isColumn = directionOf(cd) === "column";
  const alignItems = cd.alignItems ?? "flex-start";

  // Restore intrinsic sizes: children that were shrunk in a previous pass need
  // their original size back so Yoga can measure the true space requirement.
  // Yoga may shrink them again if space is still tight.
  for (const { obj } of children) {
    if (isTextObject(obj)) continue;
    const ext = obj as { _layoutIntrinsic?: { w: number; h: number } };
    if (ext._layoutIntrinsic) {
      setShapeSize(obj, ext._layoutIntrinsic.w, ext._layoutIntrinsic.h);
      delete ext._layoutIntrinsic;
    }
  }

  const built: Built[] = [];
  for (let i = 0; i < children.length; i++) {
    const { obj, cl } = children[i];
    const node = Y.Node.create(yogaConfig!);

    const alignSelf = cl.alignSelf ?? "auto";
    if (alignSelf !== "auto") node.setAlignSelf(mapAlignSelf(alignSelf, Y));

    const flexGrow = cl.flexGrow ?? 0;
    if (flexGrow > 0 && !isFreeContainer(obj)) node.setFlexGrow(flexGrow);

    // Stretch happens when: alignSelf is "stretch" or ("auto" and alignItems is "stretch")
    const effectiveAlign = alignSelf !== "auto" ? alignSelf : alignItems;
    const willStretch = effectiveAlign === "stretch";

    const entry: Built = { obj, node };
    const nested = nestedChildren(obj, allObjects);

    // flexShrink: only what has content to fold absorbs a lack of room — a text
    // (it wraps, or autofits), a nested container hugging its main axis (its
    // content folds inside, down to its floor); shapes, images and fixed
    // containers keep their size and overflow
    const mainHug = nested && (isColumn ? sizingOf(obj).y : sizingOf(obj).x) === "hug";
    node.setFlexShrink(isTextObject(obj) || mainHug ? 1 : 0);

    if (isTextObject(obj)) {
      setupTextMeasure(node, obj, Y);
    } else if (isFreeContainer(obj)) {
      // A group never stretches nor grows: its box is its content's
      setRigidSize(node, obj, { isColumn, willStretch: false, parentSizing: sizing, flexGrow: 0 });
      if (allObjects) entry.followers = descendantsOf(allObjects, [obj]);
    } else if (nested) {
      const childCd = layoutOf(obj)!.container!;
      const childSizing = sizingOf(obj);
      applyContainerStyle(node, childCd, Y);
      setNestedSize(node, obj, childSizing, { isColumn, willStretch, parentSizing: sizing, flexGrow });
      entry.children = buildChildren(node, nested, childCd, childSizing, allObjects, Y);
    } else {
      setRigidSize(node, obj, { isColumn, willStretch, parentSizing: sizing, flexGrow });
    }

    parent.insertChild(node, i);
    built.push(entry);
  }
  return built;
}

interface SlotInfo {
  isColumn: boolean;
  willStretch: boolean;
  parentSizing: SizingData;
  flexGrow: number;
}

/** A shape, image or (without the objects) a container: its current size, as is. */
function setRigidSize(node: YogaNode, obj: FabricObject, slot: SlotInfo): void {
  const { isColumn, willStretch, parentSizing, flexGrow } = slot;
  const { w, h } = scaledSize(obj);

  if (isColumn) {
    node.setHeight(h);
    // Cross axis (width): explicit unless it stretches (in a hug parent, stretch has nothing to fill)
    if (!willStretch || parentSizing.x === "hug") node.setWidth(w);
  } else {
    node.setWidth(w);
    if (!willStretch || parentSizing.y === "hug") node.setHeight(h);
  }

  // flexGrow children: don't set size in main axis (let Yoga compute it)
  if (flexGrow > 0) {
    if (isColumn) node.setHeightAuto();
    else node.setWidthAuto();
  }
}

/**
 * A nested container: a fixed axis is its size (and stretches like a shape);
 * a hug axis is left to Yoga, floored by its minSize — fit-content.
 */
function setNestedSize(node: YogaNode, obj: FabricObject, sizing: SizingData, slot: SlotInfo): void {
  const { isColumn, willStretch, parentSizing, flexGrow } = slot;
  const { w, h } = scaledSize(obj);
  const parentCrossIsHug = isColumn ? parentSizing.x === "hug" : parentSizing.y === "hug";

  const main = isColumn ? sizing.y : sizing.x;
  const cross = isColumn ? sizing.x : sizing.y;
  const setMain = (v: number) => (isColumn ? node.setHeight(v) : node.setWidth(v));
  const setCross = (v: number) => (isColumn ? node.setWidth(v) : node.setHeight(v));

  if (main === "fixed" && flexGrow === 0) setMain(isColumn ? h : w);
  if (cross === "fixed" && (!willStretch || parentCrossIsHug)) setCross(isColumn ? w : h);
  applyHugFloor(node, sizing);
}

// ── Read back ──────────────────────────────────────────────────────

/**
 * Apply Yoga's result: sizes (through each object's own sizing) and positions,
 * Yoga's being relative to the parent's top-left. Nested children follow,
 * from their container's new top-left.
 */
function placeChildren(built: Built[], parentLeft: number, parentTop: number, depth: number): void {
  for (const { obj, node, children, followers } of built) {
    const before = followers && topLeft(obj);
    const left = parentLeft + node.getComputedLeft();
    const top = parentTop + node.getComputedTop();

    const computedW = node.getComputedWidth();
    const computedH = node.getComputedHeight();
    const currentSize = scaledSize(obj);
    const changedW = Math.abs(computedW - currentSize.w) > 0.5;
    const changedH = Math.abs(computedH - currentSize.h) > 0.5;

    if (isTextObject(obj)) {
      // Yoga may have stretched, grown or shrunk the measured box — the text
      // takes it (wrap, min height, autofit happen inside the text).
      if (changedW || changedH) (obj as unknown as LayoutText).layoutWith({ w: computedW, h: computedH });
    } else {
      // Preserve intrinsic size when Yoga shrinks a rigid child, so it can grow
      // back when space becomes available. A nested container is sized by its
      // content, it has no intrinsic size to keep.
      const ext = obj as { _layoutIntrinsic?: { w: number; h: number } };
      if (!children && (computedW < currentSize.w - 0.5 || computedH < currentSize.h - 0.5) && !ext._layoutIntrinsic) {
        ext._layoutIntrinsic = currentSize;
      }

      // Through the object's own sizing (a circle or a path sizes by its scale, an
      // image frame by its frame), never a raw width/height
      if (changedW || changedH) {
        setShapeSize(obj, changedW ? computedW : currentSize.w, changedH ? computedH : currentSize.h);
      }
    }

    // Apply to Fabric object, adjusting for originX/originY
    const { w: childW, h: childH } = scaledSize(obj);
    const objLeft = obj.originX === "center" ? left + childW / 2
      : obj.originX === "right" ? left + childW : left;
    const objTop = obj.originY === "center" ? top + childH / 2
      : obj.originY === "bottom" ? top + childH : top;
    obj.set({ left: objLeft, top: objTop });
    if (before) {
      const after = topLeft(obj);
      translateObjects(followers!, after.x - before.x, after.y - before.y);
    }

    // Direct children are synced by the caller (syncCoords); deeper ones here
    if (depth > 0) obj.setCoords();
    if (children) placeChildren(children, left, top, depth + 1);
  }
}

// ── Yoga enum mapping helpers ──────────────────────────────────────

function mapAlignItems(align: string, Y: Yoga): number {
  switch (align) {
    case "stretch": return Y.ALIGN_STRETCH;
    case "flex-start": return Y.ALIGN_FLEX_START;
    case "flex-end": return Y.ALIGN_FLEX_END;
    case "center": return Y.ALIGN_CENTER;
    default: return Y.ALIGN_FLEX_START;
  }
}

function mapAlignSelf(align: string, Y: Yoga): number {
  switch (align) {
    case "stretch": return Y.ALIGN_STRETCH;
    case "flex-start": return Y.ALIGN_FLEX_START;
    case "flex-end": return Y.ALIGN_FLEX_END;
    case "center": return Y.ALIGN_CENTER;
    default: return Y.ALIGN_AUTO;
  }
}

function mapJustifyContent(justify: string, Y: Yoga): number {
  switch (justify) {
    case "flex-start": return Y.JUSTIFY_FLEX_START;
    case "flex-end": return Y.JUSTIFY_FLEX_END;
    case "center": return Y.JUSTIFY_CENTER;
    case "space-between": return Y.JUSTIFY_SPACE_BETWEEN;
    case "space-around": return Y.JUSTIFY_SPACE_AROUND;
    default: return Y.JUSTIFY_FLEX_START;
  }
}

// ── Text measure function ──────────────────────────────────────────

function setupTextMeasure(node: YogaNode, obj: FabricObject, Y: Yoga): void {
  const t = obj as unknown as LayoutText;

  node.setMeasureFunc((width: number, widthMode: number) => {
    // Exactly: the container imposes the width (stretch, row flex). At most: the
    // text's own sizing decides, wrapping at the available width. Undefined: free.
    if (widthMode === Y.MEASURE_MODE_EXACTLY) t.layoutWith({ w: width });
    else if (widthMode === Y.MEASURE_MODE_AT_MOST) t.layoutWith({ maxW: width });
    else t.layoutWith({});

    const { w, h } = scaledSize(obj);
    return { width: w, height: h };
  });
}
