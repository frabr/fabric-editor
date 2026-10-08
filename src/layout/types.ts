/**
 * Layout system types — Flexbox model backed by Yoga.
 *
 * Every participating Fabric object carries a single `layout: LayoutData`
 * property with independent, optional blocks:
 *
 * - `sizing`: how the object sizes itself, per axis — shared by containers
 *   and texts (a text's "content" is its text, a container's is its children)
 * - `container`: present when the object has children (is a parent)
 * - `child`: present when the object is inside another container
 * - `overflow`: what a text does when its box is smaller than its content
 *
 * Container and child can coexist — a nested container is both.
 *
 * Outside a container, objects are positioned absolutely by Fabric.
 * Inside a container, objects follow Flexbox rules (Yoga engine).
 */

/**
 * Size mode per axis:
 * - "hug": the object adapts to its content (text, or children)
 * - "fixed": the object keeps its size, content must adapt (wrap/shrink/clip)
 */
export type SizeMode = "hug" | "fixed";

/** "How I size myself" — on containers and texts. */
export interface SizingData {
  x: SizeMode;
  y: SizeMode;
  /**
   * Floor set by the resize handles on a "hug" axis: the object is
   * `max(content, minSize)`. Ignored on a "fixed" axis.
   */
  minSize?: { w: number; h: number };
}

/**
 * What a text does when its box is smaller than its content (fixed height,
 * or a height constrained by its container):
 * - "shrink": font size goes down (to MIN_FONT_SIZE) until it fits
 * - "clip": the text is cut at the box edge
 * - "visible": the text overflows the box
 */
export type TextOverflow = "shrink" | "clip" | "visible";

/** Cross-axis alignment for a single child (maps to Yoga alignSelf). */
export type AlignSelf = "auto" | "stretch" | "flex-start" | "flex-end" | "center";

/** Main-axis distribution (maps to Yoga justifyContent). */
export type JustifyContent = "flex-start" | "flex-end" | "center" | "space-between" | "space-around";

/** Cross-axis alignment for all children (maps to Yoga alignItems). */
export type AlignItems = "stretch" | "flex-start" | "flex-end" | "center";

/** Flex direction (maps to Yoga flexDirection). */
export type FlexDirection = "column" | "row";

/**
 * How a container places its children:
 * - "stack": Flexbox (Yoga) — direction, gap, alignment (default)
 * - "free": children keep the place they were put at; the container's box
 *   follows them (their union, plus the padding) — a group
 */
export type Arrangement = "stack" | "free";

/** "I am a parent" — present when the object has children. */
export interface ContainerData {
  /** How the children are placed (default: "stack"). */
  arrangement?: Arrangement;
  /**
   * "group": the container was created by grouping (⌘G) — a carrier with nothing of
   * its own, removed when its children are ungrouped.
   */
  origin?: "group";
  /** Flex direction: column (vertical, default) or row (horizontal). */
  flexDirection?: FlexDirection;
  /** Gap between children in the main axis direction (pixels). */
  gap?: number;
  /** Padding between container edges and children. */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Cross-axis alignment for children (default: "flex-start"). */
  alignItems?: AlignItems;
  /** Main-axis distribution (default: "flex-start"). */
  justifyContent?: JustifyContent;
}

/** "I am a child" — present when the object is inside a container. */
export interface ChildData {
  parentId: string;
  /** Override the container's alignItems for this child. */
  alignSelf?: AlignSelf;
  /** How much this child grows to fill remaining space (default: 0). */
  flexGrow?: number;
  /** Position in the flex flow (lower = earlier). Children without order go by insertion order. */
  order?: number;
}

/** The `layout` property on any participating Fabric object. */
export interface LayoutData {
  sizing?: SizingData;
  container?: ContainerData;
  child?: ChildData;
  /** Texts only (default "shrink"). */
  overflow?: TextOverflow;
}

/** Resolved child: a Fabric object paired with its ChildData. */
export interface ResolvedChild {
  obj: import("#fabric").FabricObject;
  cl: ChildData;
}



// ── Layout constants ────────────────────────────────────────────────

/** Minimum padding between a child and its container edges. */
export const MIN_PAD = 8;

/** Floor of the "shrink" text overflow. */
export const MIN_FONT_SIZE = 8;


