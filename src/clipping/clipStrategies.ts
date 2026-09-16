/**
 * @legacy Replaced by ImageFrame's own clip system (_applyClip, applyClipShape, cycleClipShape).
 * These standalone clip functions use on("scaling") (old model).
 * Rewired to use the new shape factories underneath.
 */
import type { FabricObject } from "#fabric";
import { antiScale } from "./antiScale";
import {
  createCircle,
  createPathShape,
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
    obj.clipPath = createPathShape("heart", {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0,
    });
  }

  scale();
  obj.on("scaling", scale);
}

/**
 * Applique un clip hexagonal à un objet
 */
export function addHexagonClip(obj: FabricObject): void {
  function scale() {
    obj.clipPath = createPathShape("hexagon", {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0,
    });
  }

  scale();
  obj.on("scaling", scale);
}

/**
 * Applique un clip path shape générique à un objet
 */
function addPathClip(obj: FabricObject, shapeId: string): void {
  function scale() {
    obj.clipPath = createPathShape(shapeId, {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0,
    });
  }

  scale();
  obj.on("scaling", scale);
}

/**
 * Passe au clip suivant dans le cycle des formes
 */
export function switchClip(obj: FabricObject): void {
  obj.off("scaling");

  const clipPath = obj.clipPath;
  const currentShape = (clipPath as (FabricObject & { id?: string }) | undefined)?.id as ShapeType | undefined;
  applyClip(obj, nextShape(currentShape));
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
    case "circle":
      addCircleClip(obj);
      break;
    default:
      addPathClip(obj, shapeType);
      break;
  }
}
