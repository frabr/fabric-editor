/**
 * Ordre de la pile (z-order) en blocs : un container et tous ses descendants
 * forment un bloc qui se déplace d'un seul tenant, ses enfants toujours au-dessus
 * de lui. Un enfant ne se déplace que parmi les enfants de son container.
 *
 * Fonctions pures sur la liste ordonnée des objets (du fond vers le dessus).
 */
import type { FabricObject } from "#fabric";
import type { LayoutData } from "./types";

function parentIdOf(obj: FabricObject): string | undefined {
  return (obj.get("layout") as LayoutData | undefined)?.child?.parentId;
}

/** `root` et ses descendants, dans l'ordre de la pile. */
export function stackBlock(objects: FabricObject[], root: FabricObject): FabricObject[] {
  const ids = new Set([root.get("layerId") as string]);
  const block: FabricObject[] = [];
  // Un descendant est au-dessus de son container : un seul passage suffit
  for (const obj of objects) {
    if (obj === root) block.push(obj);
    else if (ids.has(parentIdOf(obj) as string)) {
      block.push(obj);
      ids.add(obj.get("layerId") as string);
    }
  }
  return block;
}

/** Les objets de même niveau qu'`obj` (même container, ou racines), dans l'ordre de la pile. */
function siblingsOf(objects: FabricObject[], obj: FabricObject): FabricObject[] {
  const parentId = parentIdOf(obj);
  return objects.filter((o) => parentIdOf(o) === parentId);
}

/**
 * `objects` avec le bloc de `root` placé juste au-dessus du bloc de `above` — un objet
 * qui entre dans un container passe au-dessus de lui avec ses propres descendants,
 * sinon un container enfant passerait par-dessus son propre contenu.
 */
export function placeBlockAbove(objects: FabricObject[], root: FabricObject, above: FabricObject): FabricObject[] {
  const block = stackBlock(objects, root);
  const rest = objects.filter((o) => !block.includes(o));
  const anchor = stackBlock(rest, above);
  const at = rest.indexOf(anchor[anchor.length - 1]) + 1;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** `objects` avec le bloc de `root` placé juste sous le bloc de `below`. */
function placeBelow(objects: FabricObject[], root: FabricObject, below: FabricObject): FabricObject[] {
  const block = stackBlock(objects, root);
  const rest = objects.filter((o) => !block.includes(o));
  const at = rest.indexOf(below);
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/**
 * Monte le bloc d'`obj` devant le premier bloc de même niveau au-dessus qui le
 * chevauche (comme `bringObjectForward(obj, true)` de Fabric). Null : rien ne bouge.
 */
export function bringBlockForward(
  objects: FabricObject[],
  obj: FabricObject,
  overlaps: (a: FabricObject, b: FabricObject) => boolean,
): FabricObject[] | null {
  return bringBlocksForward(objects, [obj], overlaps);
}

/**
 * Descend le bloc d'`obj` sous le bloc de même niveau juste en dessous (comme
 * `sendObjectBackwards` de Fabric). Jamais sous le premier objet de la pile (le
 * fond). Null : rien ne bouge.
 */
export function sendBlockBackward(objects: FabricObject[], obj: FabricObject): FabricObject[] | null {
  return sendBlocksBackward(objects, [obj]);
}

/**
 * Monte plusieurs blocs d'un plan, chacun devant le premier bloc de même niveau qui le
 * chevauche et n'est pas lui-même monté — des objets sélectionnés ensemble ne se
 * doublent pas. Le plus haut d'abord. Null : rien ne bouge.
 */
export function bringBlocksForward(
  objects: FabricObject[],
  moved: FabricObject[],
  overlaps: (a: FabricObject, b: FabricObject) => boolean,
): FabricObject[] | null {
  let order = objects;
  let changed = false;
  for (const obj of [...moved].sort((a, b) => objects.indexOf(b) - objects.indexOf(a))) {
    const siblings = siblingsOf(order, obj);
    const next = siblings
      .slice(siblings.indexOf(obj) + 1)
      .find((s) => !moved.includes(s) && overlaps(obj, s));
    if (!next) continue;
    order = placeBlockAbove(order, obj, next);
    changed = true;
  }
  return changed ? order : null;
}

/**
 * Descend plusieurs blocs d'un plan, chacun sous le bloc de même niveau juste en dessous
 * qui n'est pas lui-même descendu. Le plus bas d'abord, jamais sous le fond. Null : rien
 * ne bouge.
 */
export function sendBlocksBackward(objects: FabricObject[], moved: FabricObject[]): FabricObject[] | null {
  let order = objects;
  let changed = false;
  for (const obj of [...moved].sort((a, b) => objects.indexOf(a) - objects.indexOf(b))) {
    const siblings = siblingsOf(order, obj);
    const prev = siblings.slice(0, siblings.indexOf(obj)).reverse().find((s) => !moved.includes(s));
    if (!prev || prev === order[0]) continue;
    order = placeBelow(order, obj, prev);
    changed = true;
  }
  return changed ? order : null;
}
