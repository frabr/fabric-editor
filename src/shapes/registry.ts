// Le registre des formes du catalogue — injecté à l'init par l'application hôte
// (EditorConfig.shapes ou registerShapes()), jamais compilé dans la lib : les formes
// sont du métier, la lib ne garde que le mécanisme. Les entrées viennent du
// normaliseur (scripts/normalize-shapes.ts) : paths dans une boîte 100x100, fill
// optionnel par path (absent = forme recolorable, présent = couleur d'auteur).
//
// Consommateurs : factories (création), ImageFrame/clipPaths (clips par id — les
// documents en stock référencent "heart" & co, le registre doit savoir les résoudre ;
// les nouveaux clips inlinent leur `d`, cf. ImageFrame.clipData).

/**
 * Un path du catalogue : géométrie normalisée 100x100, apparence d'auteur optionnelle.
 * Sans fill ni stroke = géométrie recolorable (le défaut de l'appelant s'applique) ;
 * stroke sans fill = forme en contour (fill transparent, jamais le défaut).
 */
export interface ShapePathData {
  d: string;
  fill?: string;
  stroke?: string;
  /** Normalisé dans l'espace 100x100, comme le `d`. */
  strokeWidth?: number;
}

export interface CatalogShape {
  id: string;
  paths: ShapePathData[];
  /** Largeur réelle du dessin dans la boîte 100x100. */
  width: number;
  /** Hauteur réelle du dessin dans la boîte 100x100. */
  height: number;
}

/** Forme legacy du catalog.json historique (mono-path à plat). */
interface LegacyCatalogShape {
  id: string;
  d: string;
  width?: number;
  height?: number;
}

export type CatalogShapeInput = CatalogShape | LegacyCatalogShape;

let registry: CatalogShape[] = [];

/** Remplace le catalogue courant (idempotent — un seul catalogue par page). */
export function registerShapes(shapes: CatalogShapeInput[]): void {
  registry = shapes.map(normalizeEntry);
}

export function registeredShapes(): CatalogShape[] {
  return registry;
}

export function getCatalogShape(id: string): CatalogShape | undefined {
  return registry.find((s) => s.id === id);
}

/** Mono-path = géométrie : recolorable et éligible au cadrage (clip). */
export function isMonoPath(shape: CatalogShape): boolean {
  return shape.paths.length === 1;
}

/**
 * Le clip inliné d'un ImageFrame : le `d` voyage DANS le document (autoporteur),
 * l'id de catalogue n'est plus qu'un affichage/cycle. width/height = dims du
 * dessin dans la boîte 100x100 (le rendu HTML en a besoin pour son contain).
 */
export interface ClipData {
  d: string;
  width: number;
  height: number;
}

/** Le clip d'une forme du registre — mono-path uniquement (un clip veut UNE région). */
export function clipDataFor(id: string): ClipData | undefined {
  const shape = getCatalogShape(id);
  if (!shape || !isMonoPath(shape)) return undefined;

  return { d: shape.paths[0].d, width: shape.width, height: shape.height };
}

function normalizeEntry(entry: CatalogShapeInput): CatalogShape {
  if ("paths" in entry && Array.isArray(entry.paths)) {
    return { id: entry.id, paths: entry.paths, width: entry.width ?? 100, height: entry.height ?? 100 };
  }
  const legacy = entry as LegacyCatalogShape;
  return { id: legacy.id, paths: [{ d: legacy.d }], width: legacy.width ?? 100, height: legacy.height ?? 100 };
}
