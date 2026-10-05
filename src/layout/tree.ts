/**
 * L'arbre de layout, lu sur des calques SÉRIALISÉS : qui est l'enfant de qui, la racine
 * d'un objet, la descendance d'un ensemble. Fonctions pures sur `{ layerId, layout }` —
 * un calque exporté (`toObject`), ou un objet vivant réduit à ces deux champs.
 *
 * Le rattachement est porté par l'enfant (`layout.child.parentId`). Un parent absent de
 * la liste ou un calque qui se désigne lui-même ne font pas de lien : l'objet est traité
 * comme une racine. Les parcours se protègent des cycles.
 *
 * Les consommateurs : l'éditeur vidéo d'apibots (barres imbriquées, suppression d'un
 * conteneur avec sa descendance) et le rendu de creatorstudio (reconstruction de l'arbre
 * pour `runLayout`), qui lisaient chacun l'arbre à leur façon.
 */
/** Le strict nécessaire d'un calque pour lire l'arbre — un `LayoutData` complet convient. */
export interface TreeLayer {
  layerId?: string | null;
  layout?: { child?: { parentId?: string | null } | null } | null;
}

/** enfant → parent direct. */
export type LayoutParents = Map<string, string>;

/** Les liens de parenté d'un ensemble de calques, limités aux parents présents dedans. */
export function layoutParents(layers: Iterable<TreeLayer>): LayoutParents {
  const all = Array.from(layers);
  const ids = new Set(all.map((l) => l.layerId).filter(Boolean) as string[]);
  const parents: LayoutParents = new Map();
  for (const layer of all) {
    const parentId = layer.layout?.child?.parentId;
    if (layer.layerId && parentId && parentId !== layer.layerId && ids.has(parentId)) {
      parents.set(layer.layerId, parentId);
    }
  }
  return parents;
}

/** La racine d'un objet — lui-même s'il est libre, ou si le lien boucle. */
export function layoutRoot(parents: LayoutParents, id: string): string {
  const seen = new Set<string>();
  while (parents.has(id) && !seen.has(id)) {
    seen.add(id);
    id = parents.get(id)!;
  }
  return id;
}

/** Les enfants directs d'un objet, dans l'ordre des calques. */
export function layoutChildren(parents: LayoutParents, id: string): string[] {
  const children: string[] = [];
  for (const [child, parent] of parents) if (parent === id && child !== id) children.push(child);
  return children;
}

/** Toute la descendance d'un ensemble d'objets (eux exclus), à n'importe quelle profondeur. */
export function layoutDescendants(parents: LayoutParents, ids: Iterable<string>): Set<string> {
  const roots = new Set(ids);
  const descendants = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parents) {
      if (descendants.has(child) || roots.has(child)) continue;
      if (roots.has(parent) || descendants.has(parent)) {
        descendants.add(child);
        grew = true;
      }
    }
  }
  return descendants;
}
