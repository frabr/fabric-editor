import type { FabricObject } from "#fabric";
import { antiScale } from "./antiScale";
import {
  createCircle,
  createHeart,
  createHexagon,
  createRoundedRect,
} from "../shapes/factories";
import { nextShape } from "../shapes/shapeWheel";
import type { ShapeType } from "../types";

/**
 * Applique un clip circulaire à un objet
 */
export function addCircleClip(obj: FabricObject): void {
  obj.noScaleCache = false;
  const minSize = Math.min(obj.height, obj.width);

  function scale() {
    if (!obj.clipPath) return;
    const [scaleX, scaleY] = antiScale(obj);
    obj.clipPath.set({ scaleY, scaleX });
    obj.clipPath.dirty = true;
  }

  obj.clipPath = createCircle({ radius: minSize / 2 });
  scale();
  obj.on("scaling", scale);
}

/**
 * Applique un clip en forme de cœur à un objet
 */
export function addHeartClip(obj: FabricObject): void {
  function scale() {
    const minSize = Math.min(obj.height, obj.width) / 2;
    const scaleFactor = minSize / 14;
    const heart = createHeart({ scaleX: scaleFactor, scaleY: scaleFactor });
    obj.clipPath = heart;
  }

  scale();
  obj.on("scaling", scale);
}

/**
 * Applique un clip hexagonal à un objet
 */
export function addHexagonClip(obj: FabricObject): void {
  function scale() {
    const minSize = Math.min(obj.height, obj.width) / 2;
    const scaleFactor = minSize / 24;
    const hexa = createHexagon({ scaleX: scaleFactor, scaleY: scaleFactor });
    obj.clipPath = hexa;
  }

  scale();
  obj.on("scaling", scale);
}

/**
 * Applique un clip avec coins arrondis à un objet
 */
export function addRoundedClip(obj: FabricObject): void {
  obj.noScaleCache = false;

  function scale() {
    if (!obj.clipPath) return;
    const [scaleX, scaleY] = antiScale(obj);
    const minSize = Math.min(obj.height, obj.width);
    obj.clipPath.set({
      height: obj.height,
      width: obj.width,
      ry: minSize * 0.15 * scaleY,
      rx: minSize * 0.15 * scaleX,
    });
  }

  obj.clipPath = createRoundedRect({});
  scale();
  obj.on("scaling", scale);
}

/**
 * Passe au clip suivant dans le cycle des formes
 */
export function switchClip(obj: FabricObject): void {
  // Retirer les listeners de scaling précédents
  obj.off("scaling");

  const clipPath = obj.clipPath;
  const currentShape = (clipPath as (FabricObject & { id?: string }) | undefined)?.id as ShapeType | undefined;
  const nextShapeType = nextShape(currentShape);

  switch (nextShapeType) {
    case "rect":
      obj.clipPath = undefined;
      break;
    case "rounded":
      addRoundedClip(obj);
      break;
    case "circle":
      addCircleClip(obj);
      break;
    case "heart":
      addHeartClip(obj);
      break;
    case "hexagon":
      addHexagonClip(obj);
      break;
  }
}

/**
 * Applique un clip spécifique à un objet
 */
export function applyClip(obj: FabricObject, shapeType: ShapeType): void {
  obj.off("scaling");

  switch (shapeType) {
    case "rect":
      obj.clipPath = undefined;
      break;
    case "rounded":
      addRoundedClip(obj);
      break;
    case "circle":
      addCircleClip(obj);
      break;
    case "heart":
      addHeartClip(obj);
      break;
    case "hexagon":
      addHexagonClip(obj);
      break;
  }
}
