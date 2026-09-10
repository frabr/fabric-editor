/**
 * Layout system types — "springs & struts" model.
 *
 * A container is a regular Fabric object with `layout.role === "container"`.
 * A child is any Fabric object with `layout.parentId` pointing to a container's layerId.
 *
 * The layout block is stored as a custom property on each Fabric object and
 * survives serialization via toObject(["layout"]).
 */

/**
 * Size mode per axis:
 * - "hug": container adapts to content
 * - "fixed": container keeps its size, content must adapt (shrink/clip)
 */
export type SizeMode = "hug" | "fixed";

/** Layout block carried by a **container**. */
export interface ContainerLayout {
  role: "container";
  sizeMode: { x: SizeMode; y: SizeMode };
  /** Overflow behavior when content exceeds fixed size */
  overflow?: "clip" | "shrink";
}

/** Layout block carried by a **child** (element inside a container). */
export interface ChildLayout {
  parentId: string;
  margins: { left: number; right: number; top: number; bottom: number };
}

/** Union — the `layout` property on any participating Fabric object. */
export type LayoutData = ContainerLayout | ChildLayout;

export function isContainerLayout(l: LayoutData): l is ContainerLayout {
  return "role" in l && l.role === "container";
}

export function isChildLayout(l: LayoutData): l is ChildLayout {
  return "parentId" in l;
}
