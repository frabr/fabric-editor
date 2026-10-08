/**
 * Le container libre (un groupe) : ses enfants restent où on les a posés, sa boîte les
 * suit — leur union, plus la marge (`padding`). Rien n'est calculé par Yoga dedans ; dans
 * une pile, un groupe est un bloc rigide (cf. yoga-engine), que ses enfants suivent quand
 * la pile le déplace.
 *
 * Le redimensionner : free/resize-session.ts.
 */
import type { FabricObject } from "#fabric";
import { boxOf, outsetBox, placeTopLeft, setShapeSize, unionBox } from "../geometry";
import { containerDataOf, isFreeContainer, paddingOf } from "../model";
import { childrenOf, parentContainerOf } from "../hierarchy";


/**
 * La boîte d'un groupe se recale sur ses enfants : leur union, plus la marge. Sans
 * enfant, rien ne bouge. Les groupes imbriqués d'abord (leur boîte compte dans la sienne).
 */
export function fitFreeContainer(container: FabricObject, objects: FabricObject[]): void {
  const children = childrenOf(objects, container).map((c) => c.obj);
  if (children.length === 0) return;
  for (const child of children) if (isFreeContainer(child)) fitFreeContainer(child, objects);

  const box = outsetBox(unionBox(children.map(boxOf)), paddingOf(containerDataOf(container)));
  setShapeSize(container, box.width, box.height);
  placeTopLeft(container, box.left, box.top);
}

/**
 * La boîte d'un groupe suit ses enfants, et celle des groupes qui le contiennent — pas
 * au-delà d'une pile pendant un geste (elle déplacerait le groupe, donc l'objet tenu) :
 * la pile se recale à la fin (relayout).
 */
export function fitFreeAncestors(group: FabricObject, objects: FabricObject[]): void {
  for (let current: FabricObject | null = group; current && isFreeContainer(current); current = parentContainerOf(current, objects)) {
    fitFreeContainer(current, objects);
  }
}
