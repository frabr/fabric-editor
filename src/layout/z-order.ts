/**
 * Ordre de la pile (z-order) en blocs : un container et tous ses descendants
 * forment un bloc qui se déplace d'un seul tenant, ses enfants toujours au-dessus
 * de lui. Un enfant ne se déplace que parmi les enfants de son container.
 *
 * Fonctions pures sur la liste ordonnée des objets (du fond vers le dessus).
 */
import type { FabricObject } from "#fabric";
import { isBackground, parentIdOf } from "./model";
import { subtreeOf } from "./hierarchy";
import { isEclipsed } from "../ghost";

/** `root` et ses descendants, dans l'ordre de la pile. */
export function stackBlock(objects: FabricObject[], root: FabricObject): FabricObject[] {
  return subtreeOf(objects, [root]);
}

/**
 * Les objets de même niveau qu'`obj` (même container, ou racines), dans l'ordre de la pile.
 * Un éclipsé n'y figure pas : passer devant ou derrière lui ne changerait rien à l'écran.
 */
function siblingsOf(objects: FabricObject[], obj: FabricObject): FabricObject[] {
  const parentId = parentIdOf(obj);
  return objects.filter((o) => o === obj || (parentIdOf(o) === parentId && !isEclipsed(o)));
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
 * chevauche, ou devant le voisin immédiat si aucun ne le chevauche. Null : rien ne bouge.
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
 * `sendObjectBackwards` de Fabric). Jamais sous le fond de page. Null : rien ne bouge.
 */
export function sendBlockBackward(objects: FabricObject[], obj: FabricObject): FabricObject[] | null {
  return sendBlocksBackward(objects, [obj]);
}

/**
 * Monte plusieurs blocs d'un plan, chacun devant le premier bloc de même niveau qui le
 * chevauche et n'est pas lui-même monté — des objets sélectionnés ensemble ne se
 * doublent pas. Sans chevauchement, devant le voisin immédiat : le bouton fait toujours
 * quelque chose, comme « reculer ». Le plus haut d'abord. Null : rien ne bouge.
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
    const above = siblings.slice(siblings.indexOf(obj) + 1).filter((s) => !moved.includes(s));
    const next = above.find((s) => overlaps(obj, s)) ?? above[0];
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
    if (!prev || isBackground(prev)) continue;
    order = placeBelow(order, obj, prev);
    changed = true;
  }
  return changed ? order : null;
}
