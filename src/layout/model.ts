/**
 * Le layout d'UN objet : lire ses blocs (`container`, `child`, `sizing`), savoir ce qu'il
 * est (une pile, un groupe), et le mettre à jour sans muter ce qu'il portait — un objet
 * reçoit toujours un `layout` neuf, jamais une modification en place.
 *
 * Les relations entre objets (parent, enfants, descendance) sont dans hierarchy.ts ; sur
 * des calques sérialisés, dans tree.ts.
 */
import type { FabricObject } from "#fabric";
import type { ChildData, ContainerData, FlexDirection, LayoutData, SizingData } from "./types";
import { asLayoutText, isTextObject } from "./text";

/** Ce qu'il faut d'un objet pour lire son layout (un objet Fabric, ou un calque réduit). */
type Readable = { get?(key: string): unknown } | null | undefined;

/** Le layout d'un objet (absent : il ne participe à aucun layout). */
export function layoutOf(obj: Readable): LayoutData | undefined {
  return obj?.get?.("layout") as LayoutData | undefined;
}

/** L'id de calque d'un objet. */
export function idOf(obj: { get(key: string): unknown }): string {
  return obj.get("layerId") as string;
}

/** Le bloc « je suis un parent » — présent sur un container. */
export function containerDataOf(obj: Readable): ContainerData | undefined {
  return layoutOf(obj)?.container;
}

/** Le bloc « je suis un enfant » — présent dans un container. */
export function childDataOf(obj: Readable): ChildData | undefined {
  return layoutOf(obj)?.child;
}

/** L'id du container de l'objet, s'il est dans un container. */
export function parentIdOf(obj: Readable): string | undefined {
  return childDataOf(obj)?.parentId;
}

/** A-t-il des enfants à placer (une pile ou un groupe) ? */
export function isContainerObject(obj: Readable): boolean {
  return containerDataOf(obj) != null;
}

/** Un groupe : ses enfants restent où on les a posés, sa boîte les suit. */
export function isFreeContainer(obj: Readable): boolean {
  return containerDataOf(obj)?.arrangement === "free";
}

/** Une pile : ses enfants sont rangés par Yoga (Flexbox). */
export function isStackContainer(obj: Readable): boolean {
  const cd = containerDataOf(obj);
  return cd != null && cd.arrangement !== "free";
}

/** Le sens d'une pile (en colonne par défaut). */
export function directionOf(cd: ContainerData | undefined): FlexDirection {
  return cd?.flexDirection ?? "column";
}

export type Padding = NonNullable<ContainerData["padding"]>;

/** Aucune marge. */
export const ZERO_PADDING: Readonly<Padding> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** Les marges d'un container (aucune par défaut). */
export function paddingOf(cd: ContainerData | undefined): Padding {
  return cd?.padding ?? { ...ZERO_PADDING };
}

/** La même marge des quatre côtés. */
export function uniformPadding(value: number): Padding {
  return { top: value, right: value, bottom: value, left: value };
}

/** Taille d'un objet sans bloc `sizing` (nouveaux containers, données legacy). */
export const DEFAULT_SIZING: SizingData = { x: "hug", y: "hug" };

/** Le mode de taille de l'objet — DEFAULT_SIZING s'il n'en déclare pas. */
export function sizingOf(obj: Readable): SizingData {
  return layoutOf(obj)?.sizing ?? DEFAULT_SIZING;
}

// ── Mises à jour ────────────────────────────────────────────────────

/** Pose un layout neuf : l'ancien, `patch` par-dessus. */
export function updateLayout(obj: FabricObject, patch: Partial<LayoutData>): void {
  obj.set("layout", { ...layoutOf(obj), ...patch });
}

/** Pose un bloc `container` neuf : l'ancien, `patch` par-dessus. */
export function updateContainer(obj: FabricObject, patch: Partial<ContainerData>): void {
  updateLayout(obj, { container: { ...containerDataOf(obj), ...patch } });
}

/** Pose un bloc `child` neuf : l'ancien, `patch` par-dessus. */
export function updateChild(obj: FabricObject, patch: Partial<ChildData>): void {
  updateLayout(obj, { child: { ...childDataOf(obj), ...patch } as ChildData });
}

/** Retire un bloc du layout ; un layout vide disparaît. */
export function removeLayoutBlock(obj: FabricObject, block: keyof LayoutData): void {
  const layout = layoutOf(obj);
  if (!layout || !(block in layout)) return;
  const { [block]: _removed, ...rest } = layout;
  obj.set("layout", Object.keys(rest).length ? rest : undefined);
}

/**
 * Sort un objet de son container : le bloc `child` part, le reste du layout reste
 * (sizing, container, overflow). Un texte quitte la boîte que son container lui imposait.
 */
export function detachChild(obj: FabricObject): void {
  removeLayoutBlock(obj, "child");
  if (isTextObject(obj)) asLayoutText(obj).layoutWith(null);
}

/** Copie profonde du layout, pour un instantané. */
export function cloneLayout(obj: Readable): LayoutData | undefined {
  const layout = layoutOf(obj);
  return layout ? JSON.parse(JSON.stringify(layout)) : undefined;
}
