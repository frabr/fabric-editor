/**
 * Layout system types — Flexbox model backed by Yoga.
 *
 * Every participating Fabric object carries a single `layout: LayoutData`
 * property with two independent, optional blocks:
 *
 * - `container`: present when the object has children (is a parent)
 * - `child`: present when the object is inside another container
 *
 * Both can coexist — a nested container is both a parent and a child.
 *
 * Outside a container, objects are positioned absolutely by Fabric.
 * Inside a container, objects follow Flexbox rules (Yoga engine).
 */

/**
 * Size mode per axis:
 * - "hug": container adapts to content
 * - "fixed": container keeps its size, content must adapt (shrink/clip)
 */
export type SizeMode = "hug" | "fixed";

/** Cross-axis alignment for a single child (maps to Yoga alignSelf). */
export type AlignSelf = "auto" | "stretch" | "flex-start" | "flex-end" | "center";

/** Main-axis distribution (maps to Yoga justifyContent). */
export type JustifyContent = "flex-start" | "flex-end" | "center" | "space-between" | "space-around";

/** Cross-axis alignment for all children (maps to Yoga alignItems). */
export type AlignItems = "stretch" | "flex-start" | "flex-end" | "center";

/** Flex direction (maps to Yoga flexDirection). */
export type FlexDirection = "column" | "row";

/** "I am a parent" — present when the object has children. */
export interface ContainerData {
  sizeMode: { x: SizeMode; y: SizeMode };
  /** Minimum size set by manual resize. Container never shrinks below this. */
  minSize?: { w: number; h: number };
  /** Overflow behavior when content exceeds fixed size. */
  overflow?: "clip" | "shrink";
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
  container?: ContainerData;
  child?: ChildData;
}

/** Resolved child: a Fabric object paired with its ChildData. */
export interface ResolvedChild {
  obj: import("#fabric").FabricObject;
  cl: ChildData;
}

// ── Type guards ────────────────────────────────────────────────────

export function isContainer(l: LayoutData): boolean {
  return l.container != null;
}

export function isChild(l: LayoutData): boolean {
  return l.child != null;
}

// ── Deprecated aliases (to be removed) ─────────────────────────────

/** @deprecated Use `layout.container != null` instead. */
export type ContainerLayout = LayoutData & { container: ContainerData };
/** @deprecated Use `layout.child != null` instead. */
export type ChildLayout = ChildData;

/** @deprecated Use `isContainer` instead. */
export function isContainerLayout(l: LayoutData): boolean {
  return isContainer(l);
}

/** @deprecated Use `isChild` instead. */
export function isChildLayout(l: LayoutData): boolean {
  return isChild(l);
}

// ── Session interface ───────────────────────────────────────────────

/** Common interface for layout sessions (ContainerizeSession, InsertChildSession). */
export interface LayoutSession {
  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited";
  commit(): () => void;
  rollback(): void;
  readonly container: import("#fabric").FabricObject;
  readonly child: import("#fabric").FabricObject;
}

// ── Layout constants ────────────────────────────────────────────────

/** Minimum padding between a child and its container edges. */
export const MIN_PAD = 8;

// ── Attach types ────────────────────────────────────────────────────

/** Snapshot of shape + text properties before attach, used for rollback. */
export interface AttachSnapshot {
  shape: Record<string, any>;
  text: Record<string, any>;
}
