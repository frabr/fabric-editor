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
  /** Taille minimum définie par resize manuel. Le container ne descendra
   *  jamais en dessous, même si le contenu est plus petit. */
  minSize?: { w: number; h: number };
  /** Overflow behavior when content exceeds fixed size */
  overflow?: "clip" | "shrink";
}

export type AnchorX = "left" | "right";
export type AnchorY = "top" | "bottom";

/** Layout block carried by a **child** (element inside a container). */
export interface ChildLayout {
  parentId: string;
  margins: { left: number; right: number; top: number; bottom: number };
  /** Point d'ancrage horizontal (défaut: "left") */
  anchorX?: AnchorX;
  /** Point d'ancrage vertical (défaut: "top") */
  anchorY?: AnchorY;
}

/** Union — the `layout` property on any participating Fabric object. */
export type LayoutData = ContainerLayout | ChildLayout;

/** Resolved child: a Fabric object paired with its ChildLayout. */
export interface ResolvedChild {
  obj: import("#fabric").FabricObject;
  cl: ChildLayout;
}

export function isContainerLayout(l: LayoutData): l is ContainerLayout {
  return "role" in l && l.role === "container";
}

export function isChildLayout(l: LayoutData): l is ChildLayout {
  return "parentId" in l;
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
