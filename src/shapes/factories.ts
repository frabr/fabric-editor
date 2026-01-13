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
} from "fabric";
import { HEART_PATH, HEXAGON_PATH } from "./paths";
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
  return new Circle({
    id: "circle",
    originX: "center",
    originY: "center",
    ...options,
  });
}

/**
 * Crée une forme cœur à partir d'un path SVG
 */
export function createHeart(options?: Partial<TOptions<PathProps>>): Path {
  const minSize = Math.min(options?.height || 40, options?.width || 40) / 2;
  const scaleFactor = minSize / 14; // Hauteur totale du cœur ~28 unités

  return new Path(HEART_PATH, {
    id: "heart",
    originX: "center",
    originY: "center",
    stroke: "#000000",
    fill: "",
    scaleX: scaleFactor,
    scaleY: scaleFactor,
    ...options,
  });
}

/**
 * Crée une forme hexagone à partir d'un path SVG
 */
export function createHexagon(options?: Partial<TOptions<PathProps>>): Path {
  return new Path(HEXAGON_PATH, {
    id: "hexagon",
    originX: "center",
    originY: "center",
    ...options,
  });
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

interface CreateShapeOptions {
  fill?: string;
  stroke?: string;
  left?: number;
  top?: number;
  height?: number;
  width?: number;
  radius?: number;
}

/**
 * Factory générique pour créer une forme par son type
 */
export function createShape(
  shapeType: ShapeType,
  options: CreateShapeOptions
): FabricObject {
  const { fill, stroke, left, top, height, width, radius } = options;
  const strokeWidth = stroke ? 4 : 0;

  switch (shapeType) {
    case "rect":
      return createRect({ fill, stroke, left, top, height, width, strokeWidth });

    case "rounded":
      return createRoundedRect({ fill, stroke, left, top, height, width, strokeWidth });

    case "circle":
      return createCircle({ radius, fill, stroke, left, top, strokeWidth });

    case "heart":
      return createHeart({
        fill,
        stroke,
        left,
        top,
        height,
        width,
        strokeWidth: radius ? strokeWidth / (radius / 14) : strokeWidth,
        scaleY: radius ? radius / 14 : 1,
        scaleX: radius ? radius / 14 : 1,
      });

    case "hexagon":
      return createHexagon({
        fill,
        stroke,
        left,
        top,
        height,
        width,
        strokeWidth: radius ? strokeWidth / (radius / 24) : strokeWidth,
        scaleY: radius ? radius / 24 : 1,
        scaleX: radius ? radius / 24 : 1,
      });

    default:
      return createRect({ fill, stroke, left, top, height, width, strokeWidth });
  }
}

/**
 * Convertit un objet existant vers une nouvelle forme
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
    radius,
  });
}
