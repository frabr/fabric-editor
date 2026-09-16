import {
  Path,
  FabricImage,
  FabricObject,
  Rect,
  Circle,
  type TOptions,
  type PathProps,
  type RectProps,
  type CircleProps,
} from "#fabric";
import { SHAPE_PATHS, type ShapePath } from "./generated/paths";
import type { ShapeType } from "../types";
import { addCropControls } from "../controls/cropControls";

/**
 * Crée un rectangle basique
 */
export function createRect(options?: Partial<TOptions<RectProps>>): Rect {
  return new Rect({
    id: "rect",
    originX: "center",
    originY: "center",
    ...options,
  });
}

/**
 * Crée un rectangle avec coins arrondis
 * Gère le scaling en modifiant width/height plutôt que scale
 */
export function createRoundedRect(options?: Partial<TOptions<RectProps>>): Rect {
  const width = options?.width || 40;
  const height = options?.height || 40;

  const rect = new Rect({
    id: "rounded",
    originX: "center",
    originY: "center",
    ry: height * 0.15,
    rx: width * 0.15,
    ...options,
  });

  rect.noScaleCache = false;
  rect.on("scaling", () => {
    const sX = rect.scaleX;
    const sY = rect.scaleY;
    rect.width *= sX;
    rect.height *= sY;
    rect.scaleX = 1;
    rect.scaleY = 1;
  });

  return rect;
}

/**
 * Crée un cercle
 */
export function createCircle(options?: Partial<TOptions<CircleProps>>): Circle {
  const circle = new Circle({
    id: "circle",
    originX: "center",
    originY: "center",
    ...options,
  });

  circle.on("resizing", () => {
    const size = Math.min(circle.width, circle.height);
    circle.radius = size / 2;
    circle.width = size;
    circle.height = size;
  });

  return circle;
}

/**
 * @legacy Use createPathShape("heart", ...) instead.
 */
export function createHeart(options?: Partial<TOptions<PathProps>>): Path {
  return createPathShape("heart", options);
}

/**
 * @legacy Use createPathShape("hexagon", ...) instead.
 */
export function createHexagon(options?: Partial<TOptions<PathProps>>): Path {
  return createPathShape("hexagon", options);
}

/**
 * Install the resizing handler on a Path shape so that width/height changes
 * from the resize controls are converted back to scaleX/scaleY.
 * Can be called on paths created by factories or deserialized via Path.fromObject().
 */
export function installPathResizeHandler(path: Path): void {
  const naturalW = path.width;
  const naturalH = path.height;
  path.on("resizing", () => {
    path.scaleX *= path.width / naturalW;
    path.scaleY *= path.height / naturalH;
    path.width = naturalW;
    path.height = naturalH;
  });
}

/**
 * Crée une forme Path à partir d'un ShapePath normalisé.
 * Factory générique — remplace createHeart/createHexagon.
 *
 * - Sans dimension : proportions naturelles de la forme.
 * - Une seule dimension (width ou height) : scale uniforme, l'autre est calculée.
 * - Les deux : scale par axe pour remplir la box demandée.
 */
export function createPathShape(
  shapeId: string,
  options?: Partial<TOptions<PathProps>>,
): Path {
  const shapePath = SHAPE_PATHS.find((s) => s.id === shapeId);
  if (!shapePath) {
    throw new Error(`Unknown path shape: "${shapeId}". Available: ${SHAPE_PATHS.map((s) => s.id).join(", ")}`);
  }

  const path = new Path(shapePath.d, {
    id: shapeId,
    originX: "center",
    originY: "center",
    ...options,
  });

  // path.width / path.height = dimensions naturelles parsées par Fabric
  const naturalW = path.width;
  const naturalH = path.height;

  const hasW = options?.width != null;
  const hasH = options?.height != null;
  const ratio = naturalW / naturalH;

  let targetW: number;
  let targetH: number;

  if (hasW && hasH) {
    targetW = options!.width!;
    targetH = options!.height!;
  } else if (hasW) {
    targetW = options!.width!;
    targetH = targetW / ratio;
  } else if (hasH) {
    targetH = options!.height!;
    targetW = targetH * ratio;
  } else {
    // No dimension specified: scale so the longest axis = DEFAULT_SIZE
    const scale = DEFAULT_SIZE / Math.max(naturalW, naturalH);
    targetW = naturalW * scale;
    targetH = naturalH * scale;
  }

  path.scaleX = targetW / naturalW;
  path.scaleY = targetH / naturalH;

  installPathResizeHandler(path);
  return path;
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
): FabricObject {
  const { fill, stroke, left, top } = options;
  const strokeWidth = stroke ? 4 : 0;
  const w = options.width ?? DEFAULT_SIZE;
  const h = options.height ?? DEFAULT_SIZE;


  switch (shapeType) {
    case "rect":
      return createRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });

    case "rounded":
      return createRoundedRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });

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
    { id: "rounded", path: "M15 0H85Q100 0 100 15V85Q100 100 85 100H15Q0 100 0 85V15Q0 0 15 0Z", viewBox: "0 0 100 100" },
    { id: "circle", path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z", viewBox: "0 0 100 100" },
    ...SHAPE_PATHS.map((s) => ({ id: s.id, path: s.d, viewBox: "0 0 100 100" })),
  ];
}

/**
 * @legacy Shape switching is no longer supported.
 */
export function switchShape(obj: FabricObject, nextShapeType: ShapeType): FabricObject {
  const { fill, stroke, left, top } = obj;
  const strokeWidth = obj.strokeWidth || 0;

  let width = obj.width * obj.scaleX;
  let height = obj.height * obj.scaleY;
  const minSize = Math.min(height, width);

  let radius = (obj as Circle).radius || minSize / 2;

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
