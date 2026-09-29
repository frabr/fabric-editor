import {
  FabricImage,
  FabricObject,
  Group,
  type TOptions,
  type PathProps,
  type RectProps,
  type CircleProps,
} from "#fabric";
import { getCatalogShape, isMonoPath, registeredShapes, type ShapePathData } from "./registry";
import type { ShapeType } from "../types";
import { addCropControls } from "../controls/cropControls";
import { FabRect } from "./FabRect";
import { FabCircle } from "./FabCircle";
import { FabPath } from "./FabPath";

/**
 * Crée un FabRect, optionnellement avec coins arrondis via rx/ry.
 */
export function createRect(options?: Partial<TOptions<RectProps>>): FabRect {
  return new FabRect(options);
}

/**
 * Crée un FabCircle
 */
export function createCircle(options?: Partial<TOptions<CircleProps>>): FabCircle {
  return new FabCircle(options);
}

/**
 * @legacy Use createPathShape("heart", ...) instead.
 */
export function createHeart(options?: Partial<TOptions<PathProps>>): FabPath {
  return createPathShape("heart", options);
}

/**
 * @legacy Use createPathShape("hexagon", ...) instead.
 */
export function createHexagon(options?: Partial<TOptions<PathProps>>): FabPath {
  return createPathShape("hexagon", options);
}

/**
 * Crée un FabPath à partir d'un ShapePath normalisé.
 * Factory générique — remplace createHeart/createHexagon.
 */
export function createPathShape(
  shapeId: string,
  options?: Partial<TOptions<PathProps>>,
): FabPath {
  return FabPath.createFromCatalog(shapeId, options);
}

/**
 * Crée une image avec les contrôles de crop
 */
export async function createImage(
  url: string,
  options?: Record<string, unknown>
): Promise<FabricImage> {
  const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

  let scale = 1;
  if (img.width > 300 || img.height > 300) {
    scale = Math.min(300 / img.width, 300 / img.height);
  }

  img.set({
    scaleX: scale,
    scaleY: scale,
    id: "image",
    layerType: "image",
    ...options,
  });

  addCropControls(img);
  return img;
}

const DEFAULT_SIZE = 300;

interface CreateShapeOptions {
  fill?: string;
  stroke?: string;
  left?: number;
  top?: number;
  height?: number;
  width?: number;
}

/**
 * Crée une forme depuis ses données de paths (le payload de la toolbox les porte
 * inline — l'asset devient du contenu à l'insertion, jamais une référence).
 *
 * 1 path → FabPath ordinaire (fill d'auteur prioritaire, recolorable, cf.
 * FabPath.fromPathData). N paths → Group de FabPath : l'œuvre polychrome, figée à
 * ses couleurs d'auteur, sélectionnée/scalée d'un bloc. Les positions relatives
 * viennent des coordonnées des paths (espace normalisé 100x100 partagé) : chaque
 * enfant est replacé sur son pathOffset — le centre de sa bbox dans cet espace.
 */
export function createPathsShape(
  paths: ShapePathData[],
  options: CreateShapeOptions & { id?: string; strokeWidth?: number } = {},
): FabPath | Group {
  if (paths.length === 0) throw new Error("createPathsShape: empty paths");
  const { fill, stroke, left, top, id } = options;
  // Même convention que createShape : sans stroke, pas d'épaisseur (le défaut
  // fabric de 1 fausserait la bbox du groupe).
  const strokeWidth = options.strokeWidth ?? (stroke ? 4 : 0);

  if (paths.length === 1) {
    return FabPath.fromPathData(paths[0], withoutUndefined({
      id, fill, stroke, strokeWidth, left, top,
      width: options.width, height: options.height,
    }));
  }

  const children = paths.map((p) => {
    // withoutUndefined : une clé undefined explicite écrase le défaut fabric
    // (strokeWidth: undefined → dimensions NaN). Mêmes précédences d'apparence que
    // FabPath.fromPathData (contour d'auteur = fill transparent).
    const child = new FabPath(p.d, withoutUndefined({
      fill: p.fill ?? (p.stroke ? "" : fill),
      stroke: p.stroke ?? stroke,
      strokeWidth: p.strokeWidth ?? strokeWidth,
    }));
    child.set({ left: child.pathOffset.x, top: child.pathOffset.y });
    child.setCoords();
    return child;
  });

  const group = new Group(children, { originX: "center", originY: "center", ...withoutUndefined({ left, top }) });
  if (id) group.set({ id });

  const target = targetDims(group.width, group.height, options.width, options.height);
  group.set({ scaleX: target.width / group.width, scaleY: target.height / group.height });
  group.setCoords();
  return group;
}

function withoutUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** La logique de dimension partagée (cf. FabPath.fitTo) : contain sur l'axe long. */
function targetDims(naturalW: number, naturalH: number, width?: number, height?: number) {
  const ratio = naturalW / naturalH;
  if (width != null && height != null) return { width, height };
  if (width != null) return { width, height: width / ratio };
  if (height != null) return { width: height * ratio, height };

  const scale = DEFAULT_SIZE / Math.max(naturalW, naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

/**
 * Factory générique pour créer une forme par son type.
 *
 * width/height sont optionnels :
 * - rect/rounded/circle : default 300x300
 * - path shapes : une seule dimension donnée → l'autre est calculée
 *   proportionnellement ; aucune → axe principal = 300
 */
export function createShape(
  shapeType: ShapeType,
  options: CreateShapeOptions = {}
): FabRect | FabCircle | FabPath | Group {
  const { fill, stroke, left, top } = options;
  const strokeWidth = stroke ? 4 : 0;
  const w = options.width ?? DEFAULT_SIZE;
  const h = options.height ?? DEFAULT_SIZE;


  switch (shapeType) {
    case "rect":
      return createRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });

    case "circle": {
      const radius = Math.min(w, h) / 2;
      return createCircle({ radius, fill, stroke, left, top, strokeWidth });
    }

    default: {
      const entry = getCatalogShape(shapeType);
      if (entry) {
        return createPathsShape(entry.paths, {
          id: shapeType, fill, stroke, left, top,
          height: options.height, width: options.width, strokeWidth,
        });
      }
      return createRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });
    }
  }
}

export interface ShapeCatalogEntry {
  id: ShapeType;
  /** SVG path `d` attribute for preview rendering, or null for built-in primitives. */
  path: string | null;
  /** viewBox to use when rendering the preview SVG (e.g. "0 0 100 100"). */
  viewBox: string;
}

/**
 * Built-ins + mono-path registry entries, with preview data. Multi-path artwork
 * is deliberately absent: this catalog feeds the clip cycling (a clip wants ONE
 * region) and the legacy shape wheel — the insertion palette lives host-side.
 */
export function getShapeCatalog(): ShapeCatalogEntry[] {
  return [
    { id: "rect", path: "M0 0H100V100H0Z", viewBox: "0 0 100 100" },
    { id: "circle", path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z", viewBox: "0 0 100 100" },
    ...registeredShapes().filter(isMonoPath).map((s) => ({ id: s.id, path: s.paths[0].d, viewBox: "0 0 100 100" })),
  ];
}

/**
 * @legacy Shape switching is no longer supported.
 */
export function switchShape(obj: FabricObject, nextShapeType: ShapeType): FabRect | FabCircle | FabPath | Group {
  const { fill, stroke, left, top } = obj;
  const strokeWidth = obj.strokeWidth || 0;

  let width = obj.width * obj.scaleX;
  let height = obj.height * obj.scaleY;
  const minSize = Math.min(height, width);

  let radius = (obj as any).radius || minSize / 2;

  if (!width && radius) {
    width = radius * 2;
    height = radius * 2;
  } else {
    radius = minSize / 2;
  }

  return createShape(nextShapeType, {
    fill: fill as string,
    stroke: stroke as string,
    left,
    top,
    height,
    width,
  });
}
