import {
  FabricImage,
  FabricObject,
  Control,
  type TPointerEvent,
  type Transform,
} from "#fabric";

type Side = "left" | "right" | "top" | "bottom";

interface CropConfig {
  dimension: "width" | "height";
  position: "left" | "top";
  crop: "cropX" | "cropY";
  anchor: "tr" | "tl" | "bl" | "br";
  sign: 1 | -1;
}

const CROP_CONFIGS: Record<Side, CropConfig> = {
  left: {
    dimension: "width",
    position: "left",
    crop: "cropX",
    anchor: "tr",
    sign: 1,
  },
  right: {
    dimension: "width",
    position: "left",
    crop: "cropX",
    anchor: "tl",
    sign: -1,
  },
  top: {
    dimension: "height",
    position: "top",
    crop: "cropY",
    anchor: "bl",
    sign: 1,
  },
  bottom: {
    dimension: "height",
    position: "top",
    crop: "cropY",
    anchor: "tl",
    sign: -1,
  },
};

const CONTROL_POSITIONS: Record<Side, { x: number; y: number }> = {
  left: { x: -0.5, y: 0 },
  right: { x: 0.5, y: 0 },
  top: { x: 0, y: -0.5 },
  bottom: { x: 0, y: 0.5 },
};

const CONTROL_NAMES: Record<Side, string> = {
  left: "ml",
  right: "mr",
  top: "mt",
  bottom: "mb",
};

/**
 * Crée un handler d'action pour le crop d'un côté spécifique
 */
function createCropActionHandler(side: Side) {
  return function actionHandler(
    eventData: TPointerEvent,
    transform: Transform
  ): boolean {
    const target = transform.target as FabricImage;
    const canvas = target.canvas;
    if (!canvas) return true;

    target.fire("scaling");

    const config = CROP_CONFIGS[side];
    const anchorPoint = target.aCoords?.[config.anchor];
    if (!anchorPoint) return true;

    const pointer = canvas.getScenePoint(eventData);
    const currentPos = target[config.position] || 0;
    const currentDim = target[config.dimension] || 0;

    let delta: number;

    if (side === "left" || side === "top") {
      delta = (side === "left" ? pointer.x : pointer.y) - currentPos;
    } else {
      delta =
        side === "right"
          ? (currentPos + (currentDim * target.scaleX - pointer.x)) / target.scaleX
          : (currentPos + (currentDim * target.scaleY - pointer.y)) / target.scaleY;
    }

    const currentCrop = target[config.crop] || 0;
    const newCrop =
      side === "left" || side === "top" ? currentCrop + delta : currentCrop;
    const newDimension = currentDim - delta;

    // Vérifier si les nouvelles dimensions sont valides
    if (newDimension > 1 && newCrop >= 0) {
      target[config.crop] = newCrop;
      target[config.dimension] = newDimension;

      target.setCoords();
      const newAnchorPoint = target.aCoords?.[config.anchor];

      if (newAnchorPoint) {
        target.left += anchorPoint.x - newAnchorPoint.x;
        target.top += anchorPoint.y - newAnchorPoint.y;
        target.setCoords();
      }

      canvas.requestRenderAll();
    }

    return true;
  };
}

/**
 * Crée un handler de style de curseur pour un côté
 */
function createCursorStyleHandler(side: Side) {
  return function cursorStyleHandler(
    _eventData: TPointerEvent,
    _control: Control,
    fabricObject: FabricObject
  ): string {
    const angle = (fabricObject.angle || 0) % 180;
    const isHorizontalControl = side === "left" || side === "right";

    // Si l'angle est entre 45° et 135°, inverser les curseurs
    if (angle >= 45 && angle <= 135) {
      return isHorizontalControl ? "ns-resize" : "ew-resize";
    }
    return isHorizontalControl ? "ew-resize" : "ns-resize";
  };
}

/**
 * Ajoute les contrôles de crop personnalisés à un objet image
 */
export function addCropControls(obj: FabricObject): FabricObject {
  const sides: Side[] = ["left", "right", "top", "bottom"];

  sides.forEach((side) => {
    const position = CONTROL_POSITIONS[side];
    const controlName = CONTROL_NAMES[side];

    obj.controls[controlName] = new Control({
      x: position.x,
      y: position.y,
      actionHandler: createCropActionHandler(side),
      cursorStyleHandler: createCursorStyleHandler(side),
    });
  });

  return obj;
}

/**
 * Retire les contrôles de crop d'un objet
 */
export function removeCropControls(obj: FabricObject): void {
  const sides: Side[] = ["left", "right", "top", "bottom"];

  sides.forEach((side) => {
    const controlName = CONTROL_NAMES[side];
    delete obj.controls[controlName];
  });
}
