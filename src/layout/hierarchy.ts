/**
 * L'arbre des objets VIVANTS du canvas : qui est le parent de qui, les enfants d'un
 * container, la descendance, les ancêtres — et déplacer un sous-arbre d'un bloc.
 *
 * Le lien est porté par l'enfant (`layout.child.parentId`). Un parent absent ou un objet
 * qui se désigne lui-même ne font pas de lien. Sur des calques sérialisés (apibots,
 * creatorstudio), les mêmes questions se posent à tree.ts.
 */
import type { FabricObject } from "#fabric";
import type { ResolvedChild } from "./types";
import { childDataOf, idOf, isContainerObject, isStackContainer, parentIdOf } from "./model";

/** Les objets du canvas d'un objet (vide s'il n'est sur aucun). */
function canvasObjects(obj: FabricObject): FabricObject[] {
  return obj.canvas?.getObjects() ?? [];
}

/** L'objet d'id `layerId`. */
export function findById(objects: FabricObject[], layerId: string): FabricObject | undefined {
  return objects.find((o) => o.get("layerId") === layerId);
}

/** Le parent d'un objet, s'il est dans `objects` (par défaut : les objets de son canvas). */
export function parentOf(obj: FabricObject, objects = canvasObjects(obj)): FabricObject | undefined {
  const parentId = parentIdOf(obj);
  if (!parentId) return undefined;
  const parent = findById(objects, parentId);
  return parent === obj ? undefined : parent;
}

/** Le container d'un objet — son parent, s'il est bien un container. */
export function parentContainerOf(obj: FabricObject, objects = canvasObjects(obj)): FabricObject | null {
  const parent = parentOf(obj, objects);
  return parent && isContainerObject(parent) ? parent : null;
}

/**
 * La pile qui place `obj`, s'il est dans une pile (pas dans un groupe) : sa place est
 * celle que la pile lui donne — il ne se déplace, ne s'aligne ni ne change de plan seul.
 */
export function stackParentOf(obj: FabricObject, objects = canvasObjects(obj)): FabricObject | undefined {
  const parent = parentOf(obj, objects);
  return isStackContainer(parent) ? parent : undefined;
}

/** Les ancêtres d'un objet, du parent à la racine (protégé des cycles). */
export function ancestorsOf(obj: FabricObject, objects = canvasObjects(obj)): FabricObject[] {
  const ancestors: FabricObject[] = [];
  for (let current = parentOf(obj, objects); current && !ancestors.includes(current) && current !== obj;
    current = parentOf(current, objects)) {
    ancestors.push(current);
  }
  return ancestors;
}

/** Les enfants directs d'un container, avec leur bloc `child`, dans l'ordre de la pile. */
export function childrenOf(objects: FabricObject[], container: FabricObject): ResolvedChild[] {
  const id = idOf(container);
  const out: ResolvedChild[] = [];
  for (const obj of objects) {
    const cl = childDataOf(obj);
    if (cl?.parentId === id && obj !== container) out.push({ obj, cl });
  }
  return out;
}

/**
 * Trie des enfants par `order` (le plus petit d'abord). Ceux qui n'en ont pas gardent
 * leur position relative (tri stable).
 */
export function sortChildrenByOrder(children: ResolvedChild[]): ResolvedChild[] {
  if (children.length <= 1) return children;
  return [...children].sort((a, b) => (a.cl.order ?? Infinity) - (b.cl.order ?? Infinity));
}

/** Les enfants d'une pile dans l'ordre où elle les range. */
export function flowChildrenOf(objects: FabricObject[], container: FabricObject): ResolvedChild[] {
  return sortChildrenByOrder(childrenOf(objects, container));
}

/** La descendance d'objets (eux exclus), à n'importe quelle profondeur, protégée des cycles. */
function descendantSet(objects: FabricObject[], roots: FabricObject[]): Set<FabricObject> {
  const byParent = new Map<string, FabricObject[]>();
  for (const obj of objects) {
    const parentId = parentIdOf(obj);
    if (parentId) byParent.set(parentId, [...(byParent.get(parentId) ?? []), obj]);
  }
  const found = new Set<FabricObject>();
  const queue = [...roots];
  while (queue.length) {
    for (const child of byParent.get(idOf(queue.shift()!)) ?? []) {
      if (found.has(child) || roots.includes(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}

/** Toute la descendance d'objets (eux exclus), dans l'ordre de la pile. */
export function descendantsOf(objects: FabricObject[], roots: FabricObject[]): FabricObject[] {
  const found = descendantSet(objects, roots);
  return objects.filter((o) => found.has(o));
}

/** Des objets et toute leur descendance, dans l'ordre de la pile. */
export function subtreeOf(objects: FabricObject[], roots: FabricObject[]): FabricObject[] {
  const found = descendantSet(objects, roots);
  return objects.filter((o) => roots.includes(o) || found.has(o));
}

/** Déplace des objets d'un même vecteur (positions absolues). */
export function translateObjects(objects: FabricObject[], dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const obj of objects) {
    obj.set({ left: obj.left + dx, top: obj.top + dy });
    obj.setCoords();
  }
}

/** Déplace des objets et toute leur descendance. */
export function translateSubtree(objects: FabricObject[], roots: FabricObject[], dx: number, dy: number): void {
  translateObjects(subtreeOf(objects, roots), dx, dy);
}
