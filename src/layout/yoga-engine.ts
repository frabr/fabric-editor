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
 * - Text nodes use setMeasureFunc() for intrinsic sizing
 */
import type { FabricObject, FabricText } from "#fabric";
import type { ResolvedChild, SizeMode, ContainerData } from "./types";
import { scaledSize, isTextObject } from "./geometry";

// ── Yoga singleton ─────────────────────────────────────────────────

type Yoga = Awaited<ReturnType<typeof import("yoga-layout/load").loadYoga>>;
type YogaNode = ReturnType<Yoga["Node"]["create"]>;

let yoga: Yoga | null = null;

export async function initYoga(): Promise<void> {
  if (yoga) return;
  const { loadYoga } = await import("yoga-layout/load");
  yoga = await loadYoga();
}

export function isYogaReady(): boolean {
  return yoga !== null;
}

function getYoga(): Yoga {
  if (!yoga) throw new Error("Yoga not initialized. Call initYoga() first.");
  return yoga;
}

// ── Core layout function ───────────────────────────────────────────

/**
 * Compute layout positions for children within a container using Yoga.
 *
 * Children must be sorted by `order` (lower first, then insertion order).
 * Each child is positioned and its Fabric object is updated in-place.
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
): { w: number; h: number } {
  if (children.length === 0) return { w: 0, h: 0 };

  const Y = getYoga();
  const modeX = cd.sizeMode.x;
  const modeY = cd.sizeMode.y;
  const direction = cd.flexDirection ?? "column";
  const isColumn = direction === "column";

  // ── Build root node (container) ──────────────────────────────
  const root = Y.Node.create();

  root.setFlexDirection(
    isColumn ? Y.FLEX_DIRECTION_COLUMN : Y.FLEX_DIRECTION_ROW,
  );

  // alignItems
  const alignItems = cd.alignItems ?? "flex-start";
  root.setAlignItems(mapAlignItems(alignItems, Y));

  // justifyContent
  const justify = cd.justifyContent ?? "flex-start";
  root.setJustifyContent(mapJustifyContent(justify, Y));

  // Gap (between children in main axis)
  const gap = cd.gap ?? 0;
  if (gap > 0) {
    if (isColumn) {
      root.setGap(Y.GUTTER_ROW, gap);
    } else {
      root.setGap(Y.GUTTER_COLUMN, gap);
    }
  }

  // Container padding
  const pad = cd.padding;
  if (pad) {
    root.setPadding(Y.EDGE_TOP, pad.top);
    root.setPadding(Y.EDGE_RIGHT, pad.right);
    root.setPadding(Y.EDGE_BOTTOM, pad.bottom);
    root.setPadding(Y.EDGE_LEFT, pad.left);
  }

  // Container size from mode
  if (modeX === "fixed") {
    root.setWidth(containerW);
  } else {
    root.setWidthAuto();
  }

  if (modeY === "fixed") {
    root.setHeight(containerH);
  } else {
    root.setHeightAuto();
  }

  // ── Build child nodes ────────────────────────────────────────
  const yogaNodes: YogaNode[] = [];

  for (let i = 0; i < children.length; i++) {
    const { obj, cl } = children[i];
    const node = Y.Node.create();

    // alignSelf
    const alignSelf = cl.alignSelf ?? "auto";
    if (alignSelf !== "auto") {
      node.setAlignSelf(mapAlignSelf(alignSelf, Y));
    }

    // flexGrow
    const flexGrow = cl.flexGrow ?? 0;
    if (flexGrow > 0) {
      node.setFlexGrow(flexGrow);
    }

    // flexShrink: allow children to compress when container is too small
    node.setFlexShrink(1);

    // Size: text uses measure func, others use explicit size
    if (isTextObject(obj)) {
      setupTextMeasure(node, obj, Y);
    } else {
      const { w, h } = scaledSize(obj);

      // Determine if this child will be stretched in the cross axis.
      // Stretch happens when: alignSelf is "stretch" or ("auto" and alignItems is "stretch")
      const effectiveAlign = alignSelf !== "auto" ? alignSelf : alignItems;
      const willStretch = effectiveAlign === "stretch";

      if (isColumn) {
        node.setHeight(h);
        // Cross axis (width): set explicit if not stretching or hug mode
        if (!willStretch || modeX === "hug") {
          node.setWidth(w);
        }
      } else {
        node.setWidth(w);
        // Cross axis (height): set explicit if not stretching or hug mode
        if (!willStretch || modeY === "hug") {
          node.setHeight(h);
        }
      }

      // flexGrow children: don't set size in main axis (let Yoga compute it)
      if (flexGrow > 0) {
        if (isColumn) {
          node.setHeightAuto();
        } else {
          node.setWidthAuto();
        }
      }
    }

    root.insertChild(node, i);
    yogaNodes.push(node);
  }

  // ── Calculate layout ─────────────────────────────────────────
  root.calculateLayout(
    modeX === "fixed" ? containerW : undefined,
    modeY === "fixed" ? containerH : undefined,
  );

  // ── Read back positions ──────────────────────────────────────
  for (let i = 0; i < children.length; i++) {
    const { obj } = children[i];
    const node = yogaNodes[i];

    const left = containerLeft + node.getComputedLeft();
    const top = containerTop + node.getComputedTop();

    // Update the child's width/height if Yoga stretched it
    const computedW = node.getComputedWidth();
    const computedH = node.getComputedHeight();
    const currentSize = scaledSize(obj);

    if (!isTextObject(obj)) {
      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      if (Math.abs(computedW - currentSize.w) > 0.5) {
        obj.set({ width: computedW / scaleX });
      }
      if (Math.abs(computedH - currentSize.h) > 0.5) {
        obj.set({ height: computedH / scaleY });
      }
    }

    // Apply to Fabric object, adjusting for originX/originY
    const { w: childW, h: childH } = scaledSize(obj);
    const objLeft = obj.originX === "center" ? left + childW / 2
      : obj.originX === "right" ? left + childW : left;
    const objTop = obj.originY === "center" ? top + childH / 2
      : obj.originY === "bottom" ? top + childH : top;
    obj.set({ left: objLeft, top: objTop });
  }

  // ── Read required size ───────────────────────────────────────
  const w = root.getComputedWidth();
  const h = root.getComputedHeight();

  // ── Cleanup ──────────────────────────────────────────────────
  root.freeRecursive();

  return { w, h };
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
  const t = obj as unknown as FabricText;

  node.setMeasureFunc(
    (width: number, widthMode: number, _height: number, _heightMode: number) => {
      if (widthMode === Y.MEASURE_MODE_EXACTLY) {
        // Fixed width — wrap text to this width
        t.set({ width } as any);
        t.initDimensions();
      } else if (widthMode === Y.MEASURE_MODE_AT_MOST) {
        // Max width — use natural width clamped to max
        t.set({ width: 10000 } as any);
        t.initDimensions();
        const naturalW = Math.ceil((t as any).calcTextWidth());
        t.set({ width: Math.min(naturalW, width) } as any);
        t.initDimensions();
      } else {
        // Undefined — use natural width
        t.set({ width: 10000 } as any);
        t.initDimensions();
        const naturalW = Math.ceil((t as any).calcTextWidth());
        t.set({ width: naturalW } as any);
        t.initDimensions();
      }

      const { w, h } = scaledSize(obj);
      return { width: w, height: h };
    },
  );
}
