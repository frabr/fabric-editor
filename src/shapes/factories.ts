import {
  FabricImage,
  FabricObject,
  type TOptions,
  type PathProps,
  type RectProps,
  type CircleProps,
} from "#fabric";
import { SHAPE_PATHS, type ShapePath } from "./generated/paths";
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
): FabRect | FabCircle | FabPath {
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

    default:
      if (SHAPE_PATHS.some((s) => s.id === shapeType)) {
        return createPathShape(shapeType, { fill, stroke, left, top, height: options.height, width: options.width, strokeWidth });
      }
      return createRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });
  }
}

export interface ShapeCatalogEntry {
  id: ShapeType;
  /** SVG path `d` attribute for preview rendering, or null for built-in primitives. */
  path: string | null;
  /** viewBox to use when rendering the preview SVG (e.g. "0 0 100 100"). */
  viewBox: string;
}

/** All shapes available for creation via createShape(), with preview data. */
export function getShapeCatalog(): ShapeCatalogEntry[] {
  return [
    { id: "rect", path: "M0 0H100V100H0Z", viewBox: "0 0 100 100" },
    { id: "circle", path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z", viewBox: "0 0 100 100" },
    ...SHAPE_PATHS.map((s) => ({ id: s.id, path: s.d, viewBox: "0 0 100 100" })),
  ];
}

/**
 * @legacy Shape switching is no longer supported.
 */
export function switchShape(obj: FabricObject, nextShapeType: ShapeType): FabRect | FabCircle | FabPath {
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
