var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/PendingUploadsManager.ts
var PendingUploadsManager_exports = {};
__export(PendingUploadsManager_exports, {
  PendingUploadsManager: () => PendingUploadsManager
});
var _PendingUploadsManager, PendingUploadsManager;
var init_PendingUploadsManager = __esm({
  "src/PendingUploadsManager.ts"() {
    "use strict";
    _PendingUploadsManager = class _PendingUploadsManager {
      constructor(uploadFn) {
        /** Map blob URL → File original */
        this.pending = /* @__PURE__ */ new Map();
        this.uploadFn = uploadFn;
      }
      /**
       * Ajoute un fichier en attente d'upload
       * @returns URL blob locale utilisable immédiatement
       */
      add(file) {
        let blobUrl;
        if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          blobUrl = URL.createObjectURL(file);
        } else {
          blobUrl = `node-blob://${++_PendingUploadsManager.nodeIdCounter}`;
        }
        this.pending.set(blobUrl, file);
        return blobUrl;
      }
      /**
       * Vérifie si une URL est un blob en attente
       */
      isPending(url) {
        return this.pending.has(url);
      }
      /**
       * Vérifie si des fichiers sont en attente
       */
      hasPending() {
        return this.pending.size > 0;
      }
      /**
       * Nombre de fichiers en attente
       */
      get count() {
        return this.pending.size;
      }
      /**
       * Upload tous les fichiers en attente vers Cloudinary
       * @returns Map blob URL → Cloudinary URL
       */
      async uploadAll() {
        const results = /* @__PURE__ */ new Map();
        if (this.pending.size === 0) {
          return results;
        }
        const entries = Array.from(this.pending.entries());
        const uploads = entries.map(async ([blobUrl, file]) => {
          const cloudinaryUrl = await this.uploadFn(file);
          return { blobUrl, cloudinaryUrl };
        });
        const uploaded = await Promise.all(uploads);
        for (const { blobUrl, cloudinaryUrl } of uploaded) {
          results.set(blobUrl, cloudinaryUrl);
          if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(blobUrl);
          }
          this.pending.delete(blobUrl);
        }
        return results;
      }
      /**
       * Remplace les blob URLs par les URLs Cloudinary dans un objet JSON
       * @param obj Objet contenant potentiellement des blob URLs (layers, etc.)
       * @param urlMap Map blob URL → Cloudinary URL
       * @returns Nouvel objet avec URLs remplacées
       */
      static replaceUrls(obj, urlMap) {
        if (urlMap.size === 0) return obj;
        const json = JSON.stringify(obj);
        let replaced = json;
        for (const [blobUrl, cloudinaryUrl] of urlMap) {
          const escaped = blobUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          replaced = replaced.replace(new RegExp(escaped, "g"), cloudinaryUrl);
        }
        return JSON.parse(replaced);
      }
      /**
       * Nettoie toutes les ressources (blob URLs) sans uploader
       * À appeler si l'utilisateur abandonne
       */
      clear() {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          for (const blobUrl of this.pending.keys()) {
            URL.revokeObjectURL(blobUrl);
          }
        }
        this.pending.clear();
      }
    };
    /** Compteur pour générer des IDs uniques en environnement Node.js */
    _PendingUploadsManager.nodeIdCounter = 0;
    PendingUploadsManager = _PendingUploadsManager;
  }
});

// src/FabricEditor.ts
import { Canvas as Canvas5, FabricObject as FabricObject6, FabricImage as FabricImage6, Point as Point2, Control as Control2, controlsUtils } from "fabric";

// src/LayerManager.ts
import {
  FabricImage as FabricImage4,
  Group as Group2,
  Rect as Rect3,
  Path as Path2,
  Circle as Circle2
} from "fabric";

// src/controls/CustomTextbox.ts
import { IText, Point } from "fabric";
var CustomTextbox = class extends IText {
  /**
   * Override pour ajouter le textarea au canvas container
   * au lieu du body (comportement par défaut de Fabric.js).
   */
  initHiddenTextarea() {
    super.initHiddenTextarea();
    if (this.hiddenTextarea && this.canvas) {
      const wrapper = this.canvas.getElement()?.parentElement;
      if (wrapper && this.hiddenTextarea.parentElement !== wrapper) {
        wrapper.appendChild(this.hiddenTextarea);
      }
    }
  }
  /**
   * Override de la méthode de positionnement du textarea caché.
   * On force la position à (0, 0) pour éviter les problèmes de layout
   * quand le textarea est dans le canvas container.
   */
  _calcTextareaPosition() {
    if (!this.canvas) {
      return { left: "1px", top: "1px", fontSize: "1px", charHeight: 1 };
    }
    const desiredPosition = this.inCompositionMode ? this.compositionStart : this.selectionStart;
    const boundaries = this._getCursorBoundaries(desiredPosition);
    const cursorLocation = this.get2DCursorLocation(desiredPosition);
    const lineIndex = cursorLocation.lineIndex;
    const charIndex = cursorLocation.charIndex;
    const charHeight = this.getValueOfPropertyAt(lineIndex, charIndex, "fontSize") * this.lineHeight;
    const leftOffset = boundaries.leftOffset;
    const retinaScaling = this.getCanvasRetinaScaling();
    const upperCanvas = this.canvas.upperCanvasEl;
    const upperCanvasWidth = upperCanvas.width / retinaScaling;
    const upperCanvasHeight = upperCanvas.height / retinaScaling;
    const p = new Point(
      boundaries.left + leftOffset,
      boundaries.top + boundaries.topOffset + charHeight
    ).transform(this.calcTransformMatrix()).transform(this.canvas.viewportTransform).multiply(
      new Point(
        upperCanvas.clientWidth / upperCanvasWidth,
        upperCanvas.clientHeight / upperCanvasHeight
      )
    );
    p.y = 0;
    p.x = 0;
    return {
      left: `${p.x}px`,
      top: `${p.y}px`,
      fontSize: `${charHeight}px`,
      charHeight
    };
  }
};

// src/shapes/factories.ts
import {
  Path,
  FabricImage as FabricImage2,
  Rect,
  Circle
} from "fabric";

// src/shapes/paths.ts
var HEART_PATH = "M 0 13 Q -1 13 -4 11 C -12 5 -17 -3 -12 -10 C -9 -14 -2 -13 0 -7 C 2 -13 9 -14 12 -10 C 17 -3 11 5 4 11 Q 1 13 0 13 Z";
var HEXAGON_PATH = "M-2 -23.3453C-0.7624 -24.0598 0.7624 -24.0598 2 -23.3453L19.2176 -13.4047C20.4552 -12.6902 21.2176 -11.3697 21.2176 -9.9406V10.4406C21.2176 11.8697 20.4552 13.1902 19.2176 13.9047L2 23.8453C0.7624 24.5598 -0.7624 24.5598 -2 23.8453L-19.2176 13.9047C-20.4552 13.1902 -21.2176 11.8697 -21.2176 10.4406V-9.9406C-21.2176 -11.3697 -20.4552 -12.6902 -19.2176 -13.4047L-2 -23.3453Z";

// src/controls/cropControls.ts
import {
  Control
} from "fabric";
var CROP_CONFIGS = {
  left: {
    dimension: "width",
    position: "left",
    crop: "cropX",
    anchor: "tr",
    sign: 1
  },
  right: {
    dimension: "width",
    position: "left",
    crop: "cropX",
    anchor: "tl",
    sign: -1
  },
  top: {
    dimension: "height",
    position: "top",
    crop: "cropY",
    anchor: "bl",
    sign: 1
  },
  bottom: {
    dimension: "height",
    position: "top",
    crop: "cropY",
    anchor: "tl",
    sign: -1
  }
};
var CONTROL_POSITIONS = {
  left: { x: -0.5, y: 0 },
  right: { x: 0.5, y: 0 },
  top: { x: 0, y: -0.5 },
  bottom: { x: 0, y: 0.5 }
};
var CONTROL_NAMES = {
  left: "ml",
  right: "mr",
  top: "mt",
  bottom: "mb"
};
function createCropActionHandler(side) {
  return function actionHandler(eventData, transform) {
    const target = transform.target;
    const canvas = target.canvas;
    if (!canvas) return true;
    target.fire("scaling");
    const config = CROP_CONFIGS[side];
    const anchorPoint = target.aCoords?.[config.anchor];
    if (!anchorPoint) return true;
    const pointer = canvas.getScenePoint(eventData);
    const currentPos = target[config.position] || 0;
    const currentDim = target[config.dimension] || 0;
    let delta;
    if (side === "left" || side === "top") {
      delta = (side === "left" ? pointer.x : pointer.y) - currentPos;
    } else {
      delta = side === "right" ? (currentPos + (currentDim * target.scaleX - pointer.x)) / target.scaleX : (currentPos + (currentDim * target.scaleY - pointer.y)) / target.scaleY;
    }
    const currentCrop = target[config.crop] || 0;
    const newCrop = side === "left" || side === "top" ? currentCrop + delta : currentCrop;
    const newDimension = currentDim - delta;
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
function createCursorStyleHandler(side) {
  return function cursorStyleHandler(_eventData, _control, fabricObject) {
    const angle = (fabricObject.angle || 0) % 180;
    const isHorizontalControl = side === "left" || side === "right";
    if (angle >= 45 && angle <= 135) {
      return isHorizontalControl ? "ns-resize" : "ew-resize";
    }
    return isHorizontalControl ? "ew-resize" : "ns-resize";
  };
}
function addCropControls(obj) {
  const sides = ["left", "right", "top", "bottom"];
  sides.forEach((side) => {
    const position = CONTROL_POSITIONS[side];
    const controlName = CONTROL_NAMES[side];
    obj.controls[controlName] = new Control({
      x: position.x,
      y: position.y,
      actionHandler: createCropActionHandler(side),
      cursorStyleHandler: createCursorStyleHandler(side)
    });
  });
  return obj;
}
function removeCropControls(obj) {
  const sides = ["left", "right", "top", "bottom"];
  sides.forEach((side) => {
    const controlName = CONTROL_NAMES[side];
    delete obj.controls[controlName];
  });
}

// src/shapes/factories.ts
function createRect(options) {
  return new Rect({
    id: "rect",
    originX: "center",
    originY: "center",
    ...options
  });
}
function createRoundedRect(options) {
  const width = options?.width || 40;
  const height = options?.height || 40;
  const rect = new Rect({
    id: "rounded",
    originX: "center",
    originY: "center",
    ry: height * 0.15,
    rx: width * 0.15,
    ...options
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
function createCircle(options) {
  return new Circle({
    id: "circle",
    originX: "center",
    originY: "center",
    ...options
  });
}
function createHeart(options) {
  const minSize = Math.min(options?.height || 40, options?.width || 40) / 2;
  const scaleFactor = minSize / 14;
  return new Path(HEART_PATH, {
    id: "heart",
    originX: "center",
    originY: "center",
    stroke: "#000000",
    fill: "",
    scaleX: scaleFactor,
    scaleY: scaleFactor,
    ...options
  });
}
function createHexagon(options) {
  return new Path(HEXAGON_PATH, {
    id: "hexagon",
    originX: "center",
    originY: "center",
    ...options
  });
}
async function createImage(url, options) {
  const img = await FabricImage2.fromURL(url, { crossOrigin: "anonymous" });
  let scale = 1;
  if (img.width > 300 || img.height > 300) {
    scale = Math.min(300 / img.width, 300 / img.height);
  }
  img.set({
    scaleX: scale,
    scaleY: scale,
    id: "image",
    layerType: "image",
    ...options
  });
  addCropControls(img);
  return img;
}
function createShape(shapeType, options) {
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
        scaleX: radius ? radius / 14 : 1
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
        scaleX: radius ? radius / 24 : 1
      });
    default:
      return createRect({ fill, stroke, left, top, height, width, strokeWidth });
  }
}
function switchShape(obj, nextShapeType) {
  const { fill, stroke, left, top } = obj;
  const strokeWidth = obj.strokeWidth || 0;
  let width = obj.width * obj.scaleX;
  let height = obj.height * obj.scaleY;
  const minSize = Math.min(height, width);
  let radius = obj.radius || minSize / 2;
  if (!width && radius) {
    width = radius * 2;
    height = radius * 2;
  } else {
    radius = minSize / 2;
  }
  return createShape(nextShapeType, {
    fill,
    stroke,
    left,
    top,
    height,
    width,
    radius
  });
}

// src/locking.ts
var LOCK_MODES = ["free", "position", "full"];
function getLockMode(obj) {
  return obj.lockMode || "free";
}
function getNextLockMode(currentMode) {
  const currentIndex = LOCK_MODES.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % LOCK_MODES.length;
  return LOCK_MODES[nextIndex];
}
function applyLockMode(obj, mode) {
  obj.lockMode = mode;
  const lockPosition = mode === "position" || mode === "full";
  obj.lockMovementX = lockPosition;
  obj.lockMovementY = lockPosition;
  obj.lockRotation = lockPosition;
  obj.lockScalingX = lockPosition;
  obj.lockScalingY = lockPosition;
  obj.hasControls = mode === "free";
  obj.lockContent = mode === "full";
  if (obj.type === "i-text" || obj.type === "textbox") {
    obj.editable = mode !== "full";
  }
}
function isStyleLocked(obj) {
  const mode = getLockMode(obj);
  return mode === "position" || mode === "full";
}
function isContentLocked(obj) {
  return obj.lockContent === true;
}
function isPositionLocked(obj) {
  const mode = getLockMode(obj);
  return mode === "position" || mode === "full";
}

// src/ImageFrame.ts
import {
  Group,
  Rect as Rect2,
  FabricImage as FabricImage3,
  classRegistry,
  LayoutManager,
  FixedLayout
} from "fabric";
function rotatePoint(dx, dy, angleDeg) {
  const angle = -angleDeg * Math.PI / 180;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle)
  };
}
var ImageFrame = class _ImageFrame extends Group {
  constructor(image, options = {}) {
    const frameScale = options.frameScale ?? 1;
    const frameWidth = options.frameWidth ?? image.width * frameScale;
    const frameHeight = options.frameHeight ?? image.height * frameScale;
    const coverScale = Math.max(frameWidth / image.width, frameHeight / image.height);
    image.set({
      scaleX: coverScale,
      scaleY: coverScale,
      originX: "center",
      originY: "center",
      clipPath: null,
      // enlever tout clipPath existant
      left: 0,
      top: 0
    });
    super([image], {
      originX: "center",
      originY: "center",
      left: options.left ?? 100,
      top: options.top ?? 100,
      angle: options.angle ?? 0,
      scaleX: 1,
      scaleY: 1,
      width: frameWidth,
      height: frameHeight,
      subTargetCheck: false,
      interactive: false,
      layoutManager: new LayoutManager(new FixedLayout()),
      // Désactiver le cache pour que le clipPath soit redessiné à chaque frame
      objectCaching: false
    });
    this._imageOffsetX = 0;
    this._imageOffsetY = 0;
    this._imageScale = 1;
    this._image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this._imageOffsetX = options.imageOffsetX ?? 0;
    this._imageOffsetY = options.imageOffsetY ?? 0;
    this._imageScale = options.imageScale ?? 1;
    if (options.layerId) {
      this.set("layerId", options.layerId);
    }
    this.set("layerType", "imageFrame");
    this._applyClip(options.clipShape || "rect");
    this._setupControls();
    this._setupScaleAbsorption();
    this._applyImageOffset();
  }
  get image() {
    return this._image;
  }
  get imageSrc() {
    return this._image.getSrc() || "";
  }
  get imageOffsetX() {
    return this._imageOffsetX;
  }
  get imageOffsetY() {
    return this._imageOffsetY;
  }
  /**
   * Vérifie si l'image peut être repositionnée dans le cadre.
   * Retourne true si l'image déborde du cadre (avec une marge de tolérance).
   * @param tolerancePercent - Marge de tolérance en pourcentage (défaut: 5%)
   */
  canRepositionImage(tolerancePercent = 5) {
    const imgWidth = this._image.width * this._image.scaleX;
    const imgHeight = this._image.height * this._image.scaleY;
    const toleranceX = this.frameWidth * (tolerancePercent / 100);
    const toleranceY = this.frameHeight * (tolerancePercent / 100);
    const canMoveX = imgWidth > this.frameWidth + toleranceX;
    const canMoveY = imgHeight > this.frameHeight + toleranceY;
    return canMoveX || canMoveY;
  }
  /**
   * Repositionne l'image dans le frame (pan)
   */
  setImageOffset(offsetX, offsetY) {
    const clamped = this._clampOffset(offsetX, offsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();
    this.dirty = true;
  }
  /**
   * Change le zoom de l'image (min = cover)
   */
  setImageScale(scale) {
    const coverScale = Math.max(this.frameWidth / this._image.width, this.frameHeight / this._image.height);
    this._imageScale = Math.max(1, scale);
    this._image.set({
      scaleX: coverScale * this._imageScale,
      scaleY: coverScale * this._imageScale
    });
    const clamped = this._clampOffset(this._imageOffsetX, this._imageOffsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();
    this.dirty = true;
  }
  /**
   * Remplace l'image du frame en mode cover
   */
  replaceImage(newImage) {
    const savedClipShape = this.clipShape || "rect";
    const coverScale = Math.max(this.frameWidth / newImage.width, this.frameHeight / newImage.height);
    newImage.set({
      scaleX: coverScale,
      scaleY: coverScale,
      originX: "center",
      originY: "center",
      left: 0,
      top: 0
    });
    const index = this._objects.indexOf(this._image);
    this._image.group = void 0;
    if (index !== -1) {
      this._objects.splice(index, 1, newImage);
    } else {
      this._objects[0] = newImage;
    }
    newImage.group = this;
    this._image = newImage;
    this.width = this.frameWidth;
    this.height = this.frameHeight;
    this._applyClip(savedClipShape);
    this.setCoords();
    this._imageOffsetX = 0;
    this._imageOffsetY = 0;
    this._imageScale = 1;
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }
  /**
   * Redimensionne le frame (l'image s'adapte en cover)
   */
  resizeFrame(newWidth, newHeight) {
    const coverScale = Math.max(newWidth / this._image.width, newHeight / this._image.height);
    this.frameWidth = newWidth;
    this.frameHeight = newHeight;
    this.width = newWidth;
    this.height = newHeight;
    this._image.set({
      scaleX: coverScale * this._imageScale,
      scaleY: coverScale * this._imageScale
    });
    const clamped = this._clampOffset(this._imageOffsetX, this._imageOffsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();
    this._applyClip(this.clipShape || "rect");
    if (this.clipPath) {
      this.clipPath.setCoords();
      this.clipPath.dirty = true;
    }
    this.setCoords();
    this.dirty = true;
  }
  /**
   * Applique une forme de clip au frame
   */
  applyClipShape(shapeType) {
    this._applyClip(shapeType);
    this.dirty = true;
  }
  /**
   * Cycle vers la forme de clip suivante
   */
  nextClipShape() {
    const shapes = ["rect", "rounded", "circle", "heart", "hexagon"];
    const currentIndex = this.clipShape ? shapes.indexOf(this.clipShape) : -1;
    this.applyClipShape(shapes[(currentIndex + 1) % shapes.length]);
  }
  // ─────────────────────────────────────────────────────────────
  // Méthodes privées
  // ─────────────────────────────────────────────────────────────
  _applyImageOffset() {
    this._image.set({ left: this._imageOffsetX, top: this._imageOffsetY });
  }
  _clampOffset(offsetX, offsetY) {
    const imgWidth = this._image.width * this._image.scaleX;
    const imgHeight = this._image.height * this._image.scaleY;
    const maxOffsetX = Math.max(0, (imgWidth - this.frameWidth) / 2);
    const maxOffsetY = Math.max(0, (imgHeight - this.frameHeight) / 2);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY))
    };
  }
  _applyClip(shapeType) {
    this.clipShape = shapeType;
    const minSize = Math.min(this.frameWidth, this.frameHeight);
    switch (shapeType) {
      case "rect":
        this.clipPath = new Rect2({
          width: this.frameWidth,
          height: this.frameHeight,
          originX: "center",
          originY: "center",
          left: 0,
          top: 0
        });
        break;
      case "circle":
        this.clipPath = createCircle({ radius: minSize / 2 });
        break;
      case "rounded":
        this.clipPath = createRoundedRect({
          width: this.frameWidth,
          height: this.frameHeight,
          rx: minSize * 0.15,
          ry: minSize * 0.15
        });
        break;
      case "heart":
        this.clipPath = createHeart({
          scaleX: minSize / 28,
          scaleY: minSize / 28
        });
        break;
      case "hexagon":
        this.clipPath = createHexagon({
          scaleX: minSize / 48,
          scaleY: minSize / 48
        });
        break;
    }
  }
  /**
   * Fallback : absorbe le scale si les contrôles natifs sont utilisés
   */
  _setupScaleAbsorption() {
    this.on("modified", () => {
      const canvas = this.canvas;
      if (canvas?.snappingManager) {
        canvas.snappingManager.resetResizeSnap();
      }
      if (Math.abs(this.scaleX - 1) < 1e-3 && Math.abs(this.scaleY - 1) < 1e-3) {
        return;
      }
      const newWidth = this.frameWidth * this.scaleX;
      const newHeight = this.frameHeight * this.scaleY;
      this.scaleX = 1;
      this.scaleY = 1;
      this.resizeFrame(newWidth, newHeight);
      this.canvas?.requestRenderAll();
    });
  }
  _setupControls() {
    const resizeHandler = (changeX, changeY) => {
      return (eventData, transform) => {
        const target = transform.target;
        const canvas = target.canvas;
        if (!canvas) return false;
        const pointer = canvas.getScenePoint(eventData);
        if (transform._startWidth === void 0) {
          transform._startWidth = target.frameWidth;
          transform._startHeight = target.frameHeight;
          transform._startPointerX = pointer.x;
          transform._startPointerY = pointer.y;
          transform._startLeft = target.left;
          transform._startTop = target.top;
        }
        const rotated = rotatePoint(
          pointer.x - transform._startPointerX,
          pointer.y - transform._startPointerY,
          target.angle
        );
        let newWidth = Math.max(20, transform._startWidth + rotated.x * changeX);
        let newHeight = Math.max(20, transform._startHeight + rotated.y * changeY);
        const startCenterX = transform._startLeft;
        const startCenterY = transform._startTop;
        const startHalfWidth = transform._startWidth / 2;
        const startHalfHeight = transform._startHeight / 2;
        const fixedCornerLocalX = -changeX * startHalfWidth;
        const fixedCornerLocalY = -changeY * startHalfHeight;
        const fixedCornerRotated = rotatePoint(fixedCornerLocalX, fixedCornerLocalY, -target.angle);
        const fixedCornerX = startCenterX + fixedCornerRotated.x;
        const fixedCornerY = startCenterY + fixedCornerRotated.y;
        let bounds;
        if (Math.abs(target.angle % 90) < 1) {
          if (changeX === 1) {
            bounds = {
              left: fixedCornerX,
              right: fixedCornerX + newWidth,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY
            };
          } else if (changeX === -1) {
            bounds = {
              left: fixedCornerX - newWidth,
              right: fixedCornerX,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY
            };
          } else {
            bounds = {
              left: startCenterX - newWidth / 2,
              right: startCenterX + newWidth / 2,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY
            };
          }
        } else {
          const halfW = newWidth / 2;
          const halfH = newHeight / 2;
          const centerX = startCenterX + (newWidth - transform._startWidth) / 2 * changeX;
          const centerY = startCenterY + (newHeight - transform._startHeight) / 2 * changeY;
          bounds = {
            left: centerX - halfW,
            right: centerX + halfW,
            top: centerY - halfH,
            bottom: centerY + halfH
          };
        }
        const snappingManager = canvas.snappingManager;
        if (snappingManager) {
          const snapResult = snappingManager.calculateResizeSnap(bounds, changeX, changeY, pointer);
          if (snapResult.width !== null) {
            newWidth = snapResult.width;
          }
          if (snapResult.height !== null) {
            newHeight = snapResult.height;
          }
        }
        const deltaWidth = newWidth - transform._startWidth;
        const deltaHeight = newHeight - transform._startHeight;
        const offsetX = deltaWidth / 2 * changeX;
        const offsetY = deltaHeight / 2 * changeY;
        const rotatedOffset = rotatePoint(offsetX, offsetY, -target.angle);
        target.left = transform._startLeft + rotatedOffset.x;
        target.top = transform._startTop + rotatedOffset.y;
        target.resizeFrame(newWidth, newHeight);
        canvas.requestRenderAll();
        return true;
      };
    };
    ["tl", "tr", "bl", "br"].forEach((key) => {
      if (this.controls[key]) {
        const x = key.includes("l") ? -1 : 1;
        const y = key.includes("t") ? -1 : 1;
        this.controls[key].actionHandler = resizeHandler(x, y);
        this.controls[key].actionName = "resizeFrame";
      }
    });
    [
      { key: "mt", x: 0, y: -1 },
      { key: "mb", x: 0, y: 1 },
      { key: "ml", x: -1, y: 0 },
      { key: "mr", x: 1, y: 0 }
    ].forEach(({ key, x, y }) => {
      if (this.controls[key]) {
        this.controls[key].actionHandler = resizeHandler(x, y);
        this.controls[key].actionName = "resizeFrame";
      }
    });
  }
  // ─────────────────────────────────────────────────────────────
  // Sérialisation
  // ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toObject(propertiesToInclude) {
    const base = super.toObject(propertiesToInclude);
    return {
      type: "ImageFrame",
      left: this.left,
      top: this.top,
      angle: this.angle,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      clipShape: this.clipShape,
      layerId: base.layerId,
      lockMode: base.lockMode,
      lockContent: base.lockContent,
      opacity: this.opacity,
      image: {
        src: this.imageSrc,
        offsetX: this._imageOffsetX,
        offsetY: this._imageOffsetY,
        scale: this._imageScale
      }
    };
  }
  static async fromObject(data) {
    const img = await FabricImage3.fromURL(data.image.src, { crossOrigin: "anonymous" });
    const frame = new _ImageFrame(img, {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      imageOffsetX: data.image.offsetX,
      imageOffsetY: data.image.offsetY,
      imageScale: data.image.scale
    });
    frame.frameWidth = data.frameWidth;
    frame.frameHeight = data.frameHeight;
    frame.width = data.frameWidth;
    frame.height = data.frameHeight;
    const coverScale = Math.max(data.frameWidth / img.width, data.frameHeight / img.height);
    frame._image.set({
      scaleX: coverScale * data.image.scale,
      scaleY: coverScale * data.image.scale,
      left: data.image.offsetX,
      top: data.image.offsetY
    });
    if (data.clipShape) {
      frame.applyClipShape(data.clipShape);
    }
    frame.scaleX = data.scaleX;
    frame.scaleY = data.scaleY;
    if (data.opacity !== void 0) {
      frame.opacity = data.opacity;
    }
    return frame;
  }
  /**
   * Convertit une image legacy (FabricImage avec scale/clipPath) en ImageFrame
   * Préserve les dimensions affichées et le clip shape
   */
  static fromLegacyImage(img, options) {
    const displayedWidth = img.width * (img.scaleX || 1);
    const displayedHeight = img.height * (img.scaleY || 1);
    const center = img.getCenterPoint();
    return new _ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: img.angle,
      layerId: options?.layerId || img.layerId,
      lockMode: options?.lockMode,
      clipShape: options?.clipShape,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight
    });
  }
};
classRegistry.setClass(ImageFrame);
classRegistry.setClass(ImageFrame, "ImageFrame");

// src/LayerManager.ts
var BACKGROUND_LAYER_ID = "originalImage";
var LayerManager = class {
  constructor(canvas) {
    this.canvas = canvas;
  }
  /**
   * Retourne tous les calques (excluant l'image de fond)
   */
  get all() {
    return this.canvas.getObjects().filter((obj) => obj.get("layerId") !== BACKGROUND_LAYER_ID);
  }
  /**
   * Retourne l'image de fond
   */
  get background() {
    return this.canvas.getObjects().find((obj) => obj.get("layerId") === BACKGROUND_LAYER_ID);
  }
  /**
   * Trouve un calque par son ID
   */
  findById(layerId) {
    return this.canvas.getObjects().find((obj) => obj.get("layerId") === layerId);
  }
  /**
   * Charge l'image de fond
   */
  async loadBackgroundImage(url, ratio) {
    const img = await FabricImage4.fromURL(url, { crossOrigin: "anonymous" });
    img.set({
      originX: "center",
      originY: "center",
      scaleX: ratio,
      scaleY: ratio,
      left: this.canvas.width / 2,
      top: this.canvas.height / 2,
      selectable: false,
      layerId: BACKGROUND_LAYER_ID
    });
    this.canvas.add(img);
    return img;
  }
  /**
   * Charge plusieurs calques depuis leurs données JSON
   */
  async loadLayers(layers) {
    const objects = await Promise.all(layers.map((l) => this.deserialize(l)));
    objects.forEach((obj) => {
      if (obj) this.add(obj);
    });
    return objects.filter(Boolean);
  }
  /**
   * Ajoute un objet au canvas et le sélectionne
   */
  add(obj) {
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
    return obj;
  }
  /**
   * Supprime un objet du canvas
   */
  remove(obj) {
    this.canvas.remove(obj);
  }
  /**
   * Supprime plusieurs objets
   */
  removeMany(objects) {
    objects.forEach((obj) => this.canvas.remove(obj));
  }
  /**
   * Monte l'objet d'un niveau (vers l'avant)
   */
  bringForward(obj) {
    this.canvas.bringObjectForward(obj, true);
    this.canvas.renderAll();
  }
  /**
   * Descend l'objet d'un niveau (vers l'arrière)
   * Ne peut pas descendre en dessous de l'image de fond
   */
  sendBackward(obj) {
    const index = this.canvas._objects.indexOf(obj);
    if (index > 1) {
      this.canvas.sendObjectBackwards(obj);
      this.canvas.renderAll();
    }
  }
  /**
   * Crée et ajoute un calque texte
   */
  addText(options = {}) {
    const {
      text = "Tapez votre texte ici",
      left = 100,
      top = 100,
      fontFamily = "InterRegular",
      fontSize = 32,
      fill = "#000000",
      layerId = this.generateId()
    } = options;
    const textObj = new CustomTextbox(text, {
      left,
      top,
      fontFamily,
      fontSize,
      fill
    });
    textObj.set("layerId", layerId);
    this.add(textObj);
    return textObj;
  }
  /**
   * Crée et ajoute un calque image dans un ImageFrame
   */
  async addImage(url, options = {}) {
    const { left = 100, top = 100, layerId = this.generateId() } = options;
    const img = await FabricImage4.fromURL(url, { crossOrigin: "anonymous" });
    let frameScale = 1;
    if (img.width > 300 || img.height > 300) {
      frameScale = Math.min(300 / img.width, 300 / img.height);
    }
    const frame = new ImageFrame(img, { left, top, layerId, frameScale });
    this.add(frame);
    return frame;
  }
  /**
   * Crée et ajoute une image simple (legacy, sans frame)
   * Utilisé pour le background ou cas spéciaux
   */
  async addImageLegacy(url, options = {}) {
    const { left = 100, top = 100, originX, originY, layerId = this.generateId() } = options;
    const img = await createImage(url, { left, top, originX, originY, layerId });
    this.add(img);
    return img;
  }
  /**
   * Remplace la source d'une image existante en conservant toutes ses propriétés
   * Supporte à la fois ImageFrame et FabricImage legacy
   *
   * @param options.opacity - Opacité à appliquer (utile si target.opacity est temporairement modifiée)
   */
  async replaceImageSource(target, newUrl, options) {
    const layerType = target.layerType;
    if (layerType === "imageFrame" || target instanceof ImageFrame) {
      const frame = target;
      const newImg = await FabricImage4.fromURL(newUrl, { crossOrigin: "anonymous" });
      await frame.replaceImage(newImg);
      if (options?.opacity !== void 0) {
        frame.opacity = options.opacity;
      }
      this.canvas.setActiveObject(frame);
      this.canvas.renderAll();
      return frame;
    }
    return this._replaceImageSourceLegacy(target, newUrl, options);
  }
  /**
   * Remplace la source d'une image legacy (FabricImage sans frame)
   * @internal
   */
  async _replaceImageSourceLegacy(target, newUrl, options) {
    const oldCenter = target.getCenterPoint();
    const props = {
      angle: target.angle,
      flipX: target.flipX,
      flipY: target.flipY,
      opacity: options?.opacity ?? target.opacity,
      layerId: target.get("layerId"),
      layerType: target.get("layerType")
    };
    const lockMode = getLockMode(target);
    const newImg = await FabricImage4.fromURL(newUrl, { crossOrigin: "anonymous" });
    const oldWidth = target.width * target.scaleX;
    const oldHeight = target.height * target.scaleY;
    const coverScale = Math.max(oldWidth / newImg.width, oldHeight / newImg.height);
    let adjustedClipPath = target.clipPath;
    if (target.clipPath) {
      adjustedClipPath = await target.clipPath.clone();
      const clipScaleX = (adjustedClipPath.scaleX || 1) * (target.scaleX / coverScale);
      const clipScaleY = (adjustedClipPath.scaleY || 1) * (target.scaleY / coverScale);
      adjustedClipPath.set({ scaleX: clipScaleX, scaleY: clipScaleY });
    }
    newImg.set({
      ...props,
      scaleX: coverScale,
      scaleY: coverScale,
      clipPath: adjustedClipPath,
      originX: "center",
      originY: "center",
      left: oldCenter.x,
      top: oldCenter.y
    });
    const index = this.canvas._objects.indexOf(target);
    this.canvas.remove(target);
    this.canvas.add(newImg);
    if (index >= 0 && index < this.canvas._objects.length) {
      this.canvas.moveObjectTo(newImg, index);
    }
    if (lockMode !== "free") {
      applyLockMode(newImg, lockMode);
    }
    this.canvas.setActiveObject(newImg);
    this.canvas.renderAll();
    return newImg;
  }
  /**
   * Crée et ajoute un calque forme (rectangle par défaut)
   */
  addShape(options = {}) {
    const {
      left = 100,
      top = 100,
      width = 300,
      height = 300,
      fill = "#ffffff",
      layerId = this.generateId()
    } = options;
    const rect = createRect({
      left,
      top,
      width,
      height,
      fill,
      layerId,
      layerType: "shape"
    });
    this.add(rect);
    return rect;
  }
  /**
   * Groupe plusieurs objets ensemble
   */
  groupObjects(objects) {
    const group = new Group2(objects);
    objects.forEach((obj) => this.canvas.remove(obj));
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();
    return group;
  }
  /**
   * Sérialise tous les calques en JSON
   * Inclut les propriétés custom : layerId, lockMode, lockContent
   */
  serialize() {
    return this.all.map((obj) => obj.toObject(["layerId", "lockMode", "lockContent"]));
  }
  /**
   * Désérialise un calque depuis ses données JSON
   * Les images legacy (type "Image") sont automatiquement migrées vers ImageFrame
   */
  async deserialize(layer) {
    let obj = null;
    switch (layer.type) {
      case "IText":
      case "i-text": {
        const text = await CustomTextbox.fromObject(layer);
        text.charSpacing = text.charSpacing || 1;
        obj = text;
        break;
      }
      case "ImageFrame":
      case "imageFrame": {
        obj = await ImageFrame.fromObject(layer);
        break;
      }
      case "Image":
      case "image": {
        const img = await FabricImage4.fromObject({
          ...layer,
          crossOrigin: "anonymous"
        });
        const clipShape = this.detectLegacyClipShape(layer.clipPath);
        obj = ImageFrame.fromLegacyImage(img, {
          clipShape,
          layerId: layer.layerId,
          lockMode: layer.lockMode
        });
        break;
      }
      case "Group":
      case "group":
        obj = await Group2.fromObject(layer);
        break;
      case "Rect":
      case "rect":
        obj = await Rect3.fromObject(layer);
        break;
      case "Path":
      case "path":
        obj = await Path2.fromObject(layer);
        break;
      case "Circle":
      case "circle":
        obj = await Circle2.fromObject(layer);
        break;
      default:
        console.warn(`Type de calque inconnu: ${layer.type}`);
        return null;
    }
    if (obj && layer.lockMode) {
      applyLockMode(obj, layer.lockMode);
    }
    console.log(obj);
    return obj;
  }
  /**
   * Applique un mode de verrouillage à un objet
   * Délègue à la fonction du module locking.ts
   */
  applyLockMode(obj, mode) {
    applyLockMode(obj, mode);
  }
  /**
   * Génère un ID unique pour un calque
   */
  generateId() {
    return `layer_${Date.now()}_${Math.floor(Math.random() * 1e3)}`;
  }
  /**
   * Détecte le type de clip depuis un clipPath legacy sérialisé
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectLegacyClipShape(clipPath) {
    if (!clipPath) return void 0;
    if (clipPath.id && ["rounded", "circle", "heart", "hexagon"].includes(clipPath.id)) {
      return clipPath.id;
    }
    const type = clipPath.type?.toLowerCase();
    if (type === "circle") {
      return "circle";
    }
    if (type === "rect") {
      if (clipPath.rx || clipPath.ry) {
        return "rounded";
      }
      return "rect";
    }
    if (type === "path") {
      return this.detectClipPath(clipPath);
    }
    return void 0;
  }
  /* Pour détecter les anciens clippath (dans les signatures notamment)*/
  detectClipPath(clipPath) {
    if (clipPath.type.toLowerCase() !== "path") {
      return "heart";
    }
    const path = clipPath.path;
    if (!Array.isArray(path)) {
      return "heart";
    }
    let count = {
      M: 0,
      L: 0,
      C: 0,
      Q: 0,
      Z: 0
    };
    for (const cmd of path) {
      const type = cmd[0];
      if (type in count) {
        count[type]++;
      }
    }
    if (count.Q === 0 && count.L === 6 && count.C === 6 && count.M === 1 && count.Z === 1) {
      return "hexagon";
    }
    return "heart";
  }
};

// src/SelectionManager.ts
import { ActiveSelection } from "fabric";
var OBJECT_CONTROLS = {
  // Formes créées par l'éditeur (layerType: "shape")
  shape: ["outline", "clip", "color"],
  // Types Fabric.js natifs (fallback)
  rect: ["outline", "clip", "color"],
  circle: ["outline", "clip", "color"],
  path: ["outline", "clip", "color"],
  image: ["clip"],
  imageframe: ["clip"],
  // ImageFrame : permet de changer la forme du clip
  group: [],
  "i-text": ["color", "font"]
};
var SelectionManager = class {
  constructor(canvas) {
    this.canvas = canvas;
    this._current = null;
    this.callbacks = {};
    this.isTransforming = false;
    this.setupListeners();
  }
  /**
   * L'objet actuellement sélectionné (ou tableau si sélection multiple)
   */
  get current() {
    if (Array.isArray(this._current)) {
      return null;
    }
    return this._current;
  }
  /**
   * Les objets sélectionnés (toujours un tableau)
   */
  get selected() {
    if (!this._current) return [];
    if (Array.isArray(this._current)) return this._current;
    return [this._current];
  }
  /**
   * Vérifie si quelque chose est sélectionné
   */
  get hasSelection() {
    return this._current !== null;
  }
  /**
   * Vérifie si c'est une sélection multiple
   */
  get isMultipleSelection() {
    return Array.isArray(this._current) && this._current.length > 1;
  }
  /**
   * Configure les callbacks de sélection
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  /**
   * Définit le callback onSelect
   */
  set onSelect(callback) {
    this.callbacks.onSelect = callback;
  }
  /**
   * Définit le callback onDeselect
   */
  set onDeselect(callback) {
    this.callbacks.onDeselect = callback;
  }
  /**
   * Définit le callback onTransformStart
   */
  set onTransformStart(callback) {
    this.callbacks.onTransformStart = callback;
  }
  /**
   * Définit le callback onModified
   */
  set onModified(callback) {
    this.callbacks.onModified = callback;
  }
  /**
   * Retourne les contrôles disponibles pour l'objet sélectionné
   */
  getAvailableControls() {
    const obj = this.current;
    if (!obj) return [];
    const layerType = obj.layerType;
    const type = (layerType || obj.type || "").toLowerCase();
    return OBJECT_CONTROLS[type] || [];
  }
  /**
   * Vérifie si un contrôle est disponible pour l'objet sélectionné
   */
  hasControl(control) {
    return this.getAvailableControls().includes(control);
  }
  /**
   * Désélectionne tout
   */
  clear() {
    this.canvas.discardActiveObject();
    this._current = null;
  }
  /**
   * Sélectionne un objet
   */
  select(obj) {
    this.canvas.setActiveObject(obj);
    this._current = obj;
  }
  /**
   * Configure les écouteurs d'événements du canvas
   */
  setupListeners() {
    this.canvas.on("selection:created", this.handleSelection.bind(this));
    this.canvas.on("selection:updated", this.handleSelection.bind(this));
    this.canvas.on("selection:cleared", this.handleDeselection.bind(this));
    this.canvas.on("object:moving", this.handleTransformStart.bind(this));
    this.canvas.on("object:scaling", this.handleTransformStart.bind(this));
    this.canvas.on("object:rotating", this.handleTransformStart.bind(this));
    this.canvas.on("object:modified", this.handleModified.bind(this));
  }
  /**
   * Gère la création/mise à jour de sélection
   * Les objets verrouillés sont exclus des sélections multiples
   */
  handleSelection(e) {
    const activeObject = this.canvas.getActiveObject();
    if (!activeObject) return;
    if (activeObject.type === "activeselection" && e.selected) {
      const unlocked = e.selected.filter((obj) => !isPositionLocked(obj));
      if (unlocked.length === 0) {
        this.canvas.discardActiveObject();
        this._current = null;
        if (this.callbacks.onDeselect) {
          this.callbacks.onDeselect();
        }
        return;
      }
      if (unlocked.length === 1) {
        this.canvas.discardActiveObject();
        this.canvas.setActiveObject(unlocked[0]);
        this._current = unlocked[0];
        if (this.callbacks.onSelect) {
          this.callbacks.onSelect(unlocked[0]);
        }
        return;
      }
      if (unlocked.length < e.selected.length) {
        this.canvas.discardActiveObject();
        const newSelection = new ActiveSelection(unlocked, { canvas: this.canvas });
        this.canvas.setActiveObject(newSelection);
        this._current = unlocked;
        if (this.callbacks.onSelect && unlocked[0]) {
          this.callbacks.onSelect(unlocked[0]);
        }
        return;
      }
      this._current = e.selected;
      if (this.callbacks.onSelect && e.selected[0]) {
        this.callbacks.onSelect(e.selected[0]);
      }
      return;
    }
    this._current = activeObject;
    if (this.callbacks.onSelect) {
      this.callbacks.onSelect(activeObject);
    }
  }
  /**
   * Gère la désélection
   */
  handleDeselection() {
    this._current = null;
    if (this.callbacks.onDeselect) {
      this.callbacks.onDeselect();
    }
  }
  /**
   * Gère le début d'une transformation (déplacement, rotation, redimensionnement)
   * Appelé une seule fois au début de la transformation
   */
  handleTransformStart() {
    if (this.isTransforming) return;
    this.isTransforming = true;
    if (this.callbacks.onTransformStart) {
      this.callbacks.onTransformStart();
    }
  }
  /**
   * Gère la fin d'une modification d'objet
   */
  handleModified(e) {
    this.isTransforming = false;
    if (this.callbacks.onModified) {
      this.callbacks.onModified(e.target || null);
    }
  }
  /**
   * Nettoie les écouteurs
   */
  dispose() {
    this.canvas.off("selection:created");
    this.canvas.off("selection:updated");
    this.canvas.off("selection:cleared");
    this.canvas.off("object:moving");
    this.canvas.off("object:scaling");
    this.canvas.off("object:rotating");
    this.canvas.off("object:modified");
  }
};

// src/MaskManager.ts
import { FabricImage as FabricImage5 } from "fabric";
var MASK_LAYER_ID = "mask";
var BACKGROUND_LAYER_ID2 = "originalImage";
var MaskManager = class {
  constructor(canvas) {
    this.canvas = canvas;
  }
  /**
   * Vérifie si un masque est appliqué
   */
  get hasMask() {
    return this.findMask() !== void 0;
  }
  /**
   * Retourne le masque actuel s'il existe
   */
  findMask() {
    return this.canvas.getObjects().find((obj) => obj.get("layerId") === MASK_LAYER_ID);
  }
  /**
   * Retourne l'image de fond
   */
  findBackground() {
    return this.canvas.getObjects().find((obj) => obj.get("layerId") === BACKGROUND_LAYER_ID2);
  }
  /**
   * Configure le masque existant (au chargement)
   */
  async setup(container, maxSize) {
    const mask = this.findMask();
    const bgImage = this.findBackground();
    if (mask && bgImage) {
      this.cropCanvasToMask(mask, bgImage.height);
      mask.set({ selectable: false, evented: false });
      this.canvas.discardActiveObject();
    } else {
      await this.resizeCanvasToFit(container, maxSize);
    }
  }
  /**
   * Applique un nouveau masque depuis une URL
   */
  async applyMask(maskUrl) {
    const bgImage = this.findBackground();
    if (!bgImage) {
      throw new Error("Pas d'image de fond pour appliquer le masque");
    }
    const maskImage = await FabricImage5.fromURL(maskUrl, {
      crossOrigin: "anonymous"
    });
    this.cropCanvasToMask(maskImage, bgImage.height);
    const { width, height } = this.canvas;
    const scaleX = width / maskImage.width;
    const scaleY = height / maskImage.height;
    maskImage.set({
      left: 0,
      top: 0,
      originX: "left",
      scaleX,
      scaleY,
      selectable: false,
      evented: false,
      layerId: MASK_LAYER_ID
    });
    this.canvas.add(maskImage);
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    return maskImage;
  }
  /**
   * Retire le masque actuel
   */
  removeMask() {
    const mask = this.findMask();
    if (mask) {
      this.canvas.remove(mask);
      this.canvas.renderAll();
    }
  }
  /**
   * Redimensionne le canvas et l'image de fond pour correspondre au masque
   */
  cropCanvasToMask(mask, minimalSize) {
    const newWidth = mask.width;
    const newHeight = mask.height;
    this.canvas.setDimensions({ width: newWidth, height: newHeight });
    this.resizeCanvasToFitSync(minimalSize);
    this.canvas.setDimensions({ width: newWidth, height: newHeight });
    this.canvas.getObjects().forEach((obj) => {
      if (obj.get("layerId") === BACKGROUND_LAYER_ID2) {
        const scale = Math.max(newWidth / obj.width, newHeight / obj.height);
        obj.set({
          scaleX: scale,
          scaleY: scale,
          left: this.canvas.width / 2,
          top: this.canvas.height / 2,
          originX: "center",
          originY: "center"
        });
        obj.setCoords();
      }
    });
    this.canvas.renderAll();
  }
  /**
   * Redimensionne le canvas pour s'adapter au viewport
   */
  async resizeCanvasToFit(container, maxSize) {
    let counter = 1;
    while (Math.min(container.clientHeight, container.clientWidth) <= 0 && counter < 20) {
      counter += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.resizeCanvasToFitSync(maxSize, container);
  }
  /**
   * Version synchrone du redimensionnement
   */
  resizeCanvasToFitSync(maxSize, container) {
    const hasWindow = typeof window !== "undefined";
    const vw = Math.min(
      maxSize,
      hasWindow ? window.innerWidth || document.documentElement.clientWidth : maxSize
    );
    const vh = Math.min(
      maxSize,
      hasWindow ? window.innerHeight || document.documentElement.clientHeight : maxSize
    );
    const xPadding = hasWindow && window.innerWidth >= 768 ? 80 : 20;
    const scaleX = (vw - xPadding) / this.canvas.width;
    const scaleY = (vh - 138) / this.canvas.height;
    const zoom = Math.min(scaleX, scaleY);
    this.canvas.setZoom(zoom);
    if (container) {
      container.style.width = `${this.canvas.width * zoom}px`;
      container.style.height = `${this.canvas.height * zoom}px`;
    }
    this.canvas.renderAll();
  }
};

// src/PersistenceManager.ts
import { Group as Group3 } from "fabric";
var PersistenceManager = class {
  constructor(canvas, layers) {
    this.canvas = canvas;
    this.layers = layers;
    this.pendingUploads = null;
  }
  /**
   * Configure le gestionnaire d'uploads en attente
   */
  setPendingUploads(manager) {
    this.pendingUploads = manager;
  }
  /**
   * Sauvegarde l'état actuel de l'éditeur
   *
   * Si des fichiers sont en attente d'upload, ils sont uploadés en parallèle
   * du rendu canvas pour optimiser le temps total.
   */
  async save(options = {}) {
    const { rasterize = false } = options;
    this.canvas.discardActiveObject();
    const [urlMap, dataUrl] = await Promise.all([
      this.uploadPendingFiles(),
      rasterize ? this.rasterize() : Promise.resolve(void 0)
    ]);
    let layersData = this.layers.serialize();
    let uploadedAssets;
    if (urlMap.size > 0) {
      const { PendingUploadsManager: PendingUploadsManager2 } = await Promise.resolve().then(() => (init_PendingUploadsManager(), PendingUploadsManager_exports));
      layersData = PendingUploadsManager2.replaceUrls(layersData, urlMap);
      uploadedAssets = Array.from(urlMap.values());
    }
    return {
      layers: layersData,
      dataUrl,
      uploadedAssets
    };
  }
  /**
   * Upload les fichiers en attente vers Cloudinary
   */
  async uploadPendingFiles() {
    if (!this.pendingUploads) {
      return /* @__PURE__ */ new Map();
    }
    return this.pendingUploads.uploadAll();
  }
  /**
   * Rasterise le canvas en image base64
   */
  async rasterize() {
    const currentZoom = this.canvas.getZoom();
    this.canvas.setZoom(1);
    const dataUrl = this.canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1
    });
    this.canvas.setZoom(currentZoom);
    return dataUrl;
  }
  /**
   * Compacte le canvas autour des calques (pour le mode standalone)
   */
  compactAroundLayers() {
    const layerObjects = this.layers.all;
    if (layerObjects.length === 0) return;
    const group = new Group3(layerObjects);
    this.canvas.clear();
    group.left = 0;
    group.top = 0;
    group.getObjects().forEach((obj) => {
      this.canvas.add(obj);
    });
    this.canvas.setDimensions({
      width: group.width,
      height: group.height
    });
  }
  /**
   * Exporte les données des calques en JSON
   */
  exportLayersJSON() {
    return JSON.stringify(this.layers.serialize());
  }
  /**
   * Importe des calques depuis du JSON
   */
  async importLayersJSON(json) {
    const layersData = JSON.parse(json);
    await this.layers.loadLayers(layersData);
  }
  /**
   * Réinitialise l'éditeur (supprime tous les calques sauf le fond)
   */
  reset() {
    const background = this.layers.background;
    this.canvas.clear();
    if (background) {
      this.canvas.add(background);
    }
    this.canvas.renderAll();
  }
};

// src/HistoryManager.ts
var HistoryManager = class {
  constructor(canvas, layers, options = {}) {
    this.canvas = canvas;
    this.layers = layers;
    this.stack = [];
    this.index = -1;
    this.callbacks = {};
    this.isRestoring = false;
    this.maxSize = options.maxSize ?? 50;
  }
  /**
   * Configure les callbacks
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  /**
   * Définit le callback onStateChange
   */
  set onStateChange(callback) {
    this.callbacks.onStateChange = callback;
  }
  /**
   * Vérifie si on peut annuler
   */
  get canUndo() {
    return this.index > 0;
  }
  /**
   * Vérifie si on peut refaire
   */
  get canRedo() {
    return this.index < this.stack.length - 1;
  }
  /**
   * Retourne l'état actuel
   */
  get state() {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo
    };
  }
  /**
   * Enregistre l'état actuel dans l'historique
   * Appelé après chaque modification
   */
  push() {
    if (this.isRestoring) return;
    const snapshot = JSON.stringify(this.layers.serialize());
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    if (this.stack[this.stack.length - 1] === snapshot) {
      return;
    }
    this.stack.push(snapshot);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index++;
    }
    this.notifyStateChange();
  }
  /**
   * Annule la dernière modification (Ctrl+Z)
   * @returns true si l'annulation a réussi
   */
  async undo() {
    if (!this.canUndo) return false;
    this.index--;
    await this.restore();
    this.notifyStateChange();
    return true;
  }
  /**
   * Refait la dernière modification annulée (Ctrl+Y / Ctrl+Shift+Z)
   * @returns true si le redo a réussi
   */
  async redo() {
    if (!this.canRedo) return false;
    this.index++;
    await this.restore();
    this.notifyStateChange();
    return true;
  }
  /**
   * Réinitialise l'historique
   * Utile après un chargement initial ou une sauvegarde
   */
  clear() {
    this.stack = [];
    this.index = -1;
    this.notifyStateChange();
  }
  /**
   * Initialise l'historique avec l'état actuel
   * À appeler après le chargement initial des calques
   */
  initialize() {
    this.clear();
    this.push();
  }
  /**
   * Restaure l'état à l'index actuel
   */
  async restore() {
    const snapshot = this.stack[this.index];
    if (!snapshot) return;
    this.isRestoring = true;
    const previousRenderOnAddRemove = this.canvas.renderOnAddRemove;
    this.canvas.renderOnAddRemove = false;
    try {
      const layersData = JSON.parse(snapshot);
      const currentLayers = this.layers.all;
      currentLayers.forEach((obj) => this.layers.remove(obj));
      await this.layers.loadLayers(layersData);
    } finally {
      this.canvas.renderOnAddRemove = previousRenderOnAddRemove;
      this.canvas.requestRenderAll();
      this.isRestoring = false;
    }
  }
  /**
   * Notifie les callbacks du changement d'état
   */
  notifyStateChange() {
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }
};

// src/SnappingManager.ts
import { Line } from "fabric";
var SnappingManager = class {
  constructor(canvas, config = {}) {
    this.guides = [];
    this.enabled = true;
    this.snapState = null;
    this.resizeSnapState = null;
    /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
    this.exitMultiplier = 2;
    this.canvas = canvas;
    this.config = {
      threshold: config.threshold ?? 10,
      snapToCenter: config.snapToCenter ?? true,
      snapToEdges: config.snapToEdges ?? true,
      guideColor: config.guideColor ?? "#ff00ff"
    };
    this.setupEventListeners();
  }
  /**
   * Active ou désactive le snapping
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.clearGuides();
    }
  }
  /**
   * Retourne si le snapping est activé
   */
  isEnabled() {
    return this.enabled;
  }
  /**
   * Met à jour la configuration
   */
  updateConfig(config) {
    Object.assign(this.config, config);
  }
  setupEventListeners() {
    this.canvas.on("object:moving", (e) => this.handleObjectMoving(e));
    this.canvas.on("object:scaling", (e) => this.handleObjectScaling(e.target));
    this.canvas.on("object:modified", () => {
      this.clearGuides();
      this.snapState = null;
    });
    this.canvas.on("selection:cleared", () => {
      this.clearGuides();
      this.snapState = null;
    });
    this.canvas.on("mouse:down", () => {
      this.snapState = null;
    });
  }
  handleObjectMoving(e) {
    const obj = e.target;
    if (!obj || !this.enabled) return;
    if (obj.get("layerId") === "originalImage") return;
    const activeGuides = [];
    const bound = obj.getBoundingRect();
    const pointer = e.pointer || { x: obj.left || 0, y: obj.top || 0 };
    const objCenterX = bound.left + bound.width / 2;
    const objCenterY = bound.top + bound.height / 2;
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    if (!this.snapState) {
      this.snapState = {
        snappedX: null,
        snappedY: null,
        lastPointerX: pointer.x,
        lastPointerY: pointer.y
      };
    }
    const pointerDeltaX = pointer.x - this.snapState.lastPointerX;
    const pointerDeltaY = pointer.y - this.snapState.lastPointerY;
    const enterThreshold = this.config.threshold;
    const exitThreshold = this.config.threshold * this.exitMultiplier;
    let snapX = null;
    let snapY = null;
    let newSnappedX = null;
    let newSnappedY = null;
    if (this.config.snapToCenter) {
      const distToCenter = Math.abs(objCenterX - canvasCenterX);
      const wasSnappedToCenter = this.snapState.snappedX === "center";
      if (wasSnappedToCenter) {
        if (Math.abs(pointerDeltaX) < exitThreshold) {
          snapX = canvasCenterX - bound.width / 2;
          newSnappedX = "center";
          activeGuides.push({ orientation: "vertical", position: canvasCenterX });
        }
      } else if (distToCenter < enterThreshold) {
        snapX = canvasCenterX - bound.width / 2;
        newSnappedX = "center";
        activeGuides.push({ orientation: "vertical", position: canvasCenterX });
        this.snapState.lastPointerX = pointer.x;
      }
    }
    if (this.config.snapToEdges && newSnappedX === null) {
      const distToLeft = Math.abs(bound.left);
      const distToRight = Math.abs(bound.left + bound.width - this.canvas.width);
      const wasSnappedToLeft = this.snapState.snappedX === "left";
      const wasSnappedToRight = this.snapState.snappedX === "right";
      if (wasSnappedToLeft) {
        if (Math.abs(pointerDeltaX) < exitThreshold) {
          snapX = 0;
          newSnappedX = "left";
          activeGuides.push({ orientation: "vertical", position: 0 });
        }
      } else if (wasSnappedToRight) {
        if (Math.abs(pointerDeltaX) < exitThreshold) {
          snapX = this.canvas.width - bound.width;
          newSnappedX = "right";
          activeGuides.push({ orientation: "vertical", position: this.canvas.width });
        }
      } else if (distToLeft < enterThreshold) {
        snapX = 0;
        newSnappedX = "left";
        activeGuides.push({ orientation: "vertical", position: 0 });
        this.snapState.lastPointerX = pointer.x;
      } else if (distToRight < enterThreshold) {
        snapX = this.canvas.width - bound.width;
        newSnappedX = "right";
        activeGuides.push({ orientation: "vertical", position: this.canvas.width });
        this.snapState.lastPointerX = pointer.x;
      }
    }
    if (this.config.snapToCenter) {
      const distToCenter = Math.abs(objCenterY - canvasCenterY);
      const wasSnappedToCenter = this.snapState.snappedY === "center";
      if (wasSnappedToCenter) {
        if (Math.abs(pointerDeltaY) < exitThreshold) {
          snapY = canvasCenterY - bound.height / 2;
          newSnappedY = "center";
          activeGuides.push({ orientation: "horizontal", position: canvasCenterY });
        }
      } else if (distToCenter < enterThreshold) {
        snapY = canvasCenterY - bound.height / 2;
        newSnappedY = "center";
        activeGuides.push({ orientation: "horizontal", position: canvasCenterY });
        this.snapState.lastPointerY = pointer.y;
      }
    }
    if (this.config.snapToEdges && newSnappedY === null) {
      const distToTop = Math.abs(bound.top);
      const distToBottom = Math.abs(bound.top + bound.height - this.canvas.height);
      const wasSnappedToTop = this.snapState.snappedY === "top";
      const wasSnappedToBottom = this.snapState.snappedY === "bottom";
      if (wasSnappedToTop) {
        if (Math.abs(pointerDeltaY) < exitThreshold) {
          snapY = 0;
          newSnappedY = "top";
          activeGuides.push({ orientation: "horizontal", position: 0 });
        }
      } else if (wasSnappedToBottom) {
        if (Math.abs(pointerDeltaY) < exitThreshold) {
          snapY = this.canvas.height - bound.height;
          newSnappedY = "bottom";
          activeGuides.push({ orientation: "horizontal", position: this.canvas.height });
        }
      } else if (distToTop < enterThreshold) {
        snapY = 0;
        newSnappedY = "top";
        activeGuides.push({ orientation: "horizontal", position: 0 });
        this.snapState.lastPointerY = pointer.y;
      } else if (distToBottom < enterThreshold) {
        snapY = this.canvas.height - bound.height;
        newSnappedY = "bottom";
        activeGuides.push({ orientation: "horizontal", position: this.canvas.height });
        this.snapState.lastPointerY = pointer.y;
      }
    }
    this.snapState.snappedX = newSnappedX;
    this.snapState.snappedY = newSnappedY;
    if (snapX !== null || snapY !== null) {
      if (obj.originX === "center" && obj.originY === "center") {
        obj.set({
          left: snapX !== null ? snapX + bound.width / 2 : obj.left,
          top: snapY !== null ? snapY + bound.height / 2 : obj.top
        });
      } else {
        obj.set({
          left: snapX ?? obj.left,
          top: snapY ?? obj.top
        });
      }
    }
    this.updateGuides(activeGuides);
  }
  handleObjectScaling(obj) {
    if (!obj || !this.enabled) return;
    if (obj.get("layerId") === "originalImage") return;
    const activeGuides = [];
    const bound = obj.getBoundingRect();
    if (this.config.snapToEdges) {
      if (Math.abs(bound.left + bound.width - this.canvas.width) < this.config.threshold) {
        activeGuides.push({ orientation: "vertical", position: this.canvas.width });
      }
      if (Math.abs(bound.top + bound.height - this.canvas.height) < this.config.threshold) {
        activeGuides.push({ orientation: "horizontal", position: this.canvas.height });
      }
      if (Math.abs(bound.left) < this.config.threshold) {
        activeGuides.push({ orientation: "vertical", position: 0 });
      }
      if (Math.abs(bound.top) < this.config.threshold) {
        activeGuides.push({ orientation: "horizontal", position: 0 });
      }
    }
    this.updateGuides(activeGuides);
  }
  updateGuides(activeGuides) {
    this.clearGuides();
    for (const guide of activeGuides) {
      const line = this.createGuideLine(guide);
      this.guides.push(line);
      this.canvas.add(line);
    }
    this.canvas.requestRenderAll();
  }
  createGuideLine(guide) {
    const coords = guide.orientation === "vertical" ? [guide.position, 0, guide.position, this.canvas.height] : [0, guide.position, this.canvas.width, guide.position];
    return new Line(coords, {
      stroke: this.config.guideColor,
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
  }
  clearGuides() {
    for (const guide of this.guides) {
      this.canvas.remove(guide);
    }
    this.guides = [];
  }
  /**
   * Calcule le snap pendant le redimensionnement d'un objet
   *
   * @param bounds - Les bords de l'objet (left, top, right, bottom)
   * @param changeX - Direction du resize horizontal (-1 = gauche, 1 = droite, 0 = pas de changement)
   * @param changeY - Direction du resize vertical (-1 = haut, 1 = bas, 0 = pas de changement)
   * @param pointer - Position actuelle du pointeur
   * @returns Les dimensions ajustées et les guides à afficher
   */
  calculateResizeSnap(bounds, changeX, changeY, pointer) {
    if (!this.enabled) {
      return { width: null, height: null, guides: [] };
    }
    const activeGuides = [];
    const enterThreshold = this.config.threshold;
    const exitThreshold = this.config.threshold * this.exitMultiplier;
    if (!this.resizeSnapState) {
      this.resizeSnapState = {
        snappedEdgeX: null,
        snappedEdgeY: null,
        lastPointerX: pointer.x,
        lastPointerY: pointer.y
      };
    }
    const pointerDeltaX = pointer.x - this.resizeSnapState.lastPointerX;
    const pointerDeltaY = pointer.y - this.resizeSnapState.lastPointerY;
    let snapWidth = null;
    let snapHeight = null;
    let newSnappedEdgeX = null;
    let newSnappedEdgeY = null;
    const currentWidth = bounds.right - bounds.left;
    const currentHeight = bounds.bottom - bounds.top;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    if (changeX !== 0) {
      const movingEdgeX = changeX === 1 ? bounds.right : bounds.left;
      const fixedEdgeX = changeX === 1 ? bounds.left : bounds.right;
      if (this.config.snapToEdges) {
        const targetEdge = changeX === 1 ? canvasWidth : 0;
        const edgeName = changeX === 1 ? "right" : "left";
        const distToEdge = Math.abs(movingEdgeX - targetEdge);
        const wasSnapped = this.resizeSnapState.snappedEdgeX === edgeName;
        if (wasSnapped) {
          if (Math.abs(pointerDeltaX) < exitThreshold) {
            snapWidth = Math.abs(targetEdge - fixedEdgeX);
            newSnappedEdgeX = edgeName;
            activeGuides.push({ orientation: "vertical", position: targetEdge });
          }
        } else if (distToEdge < enterThreshold) {
          snapWidth = Math.abs(targetEdge - fixedEdgeX);
          newSnappedEdgeX = edgeName;
          activeGuides.push({ orientation: "vertical", position: targetEdge });
          this.resizeSnapState.lastPointerX = pointer.x;
        }
      }
      if (this.config.snapToCenter && newSnappedEdgeX === null) {
        const distToCenter = Math.abs(movingEdgeX - canvasCenterX);
        const wasSnappedToCenter = this.resizeSnapState.snappedEdgeX === "center";
        if (wasSnappedToCenter) {
          if (Math.abs(pointerDeltaX) < exitThreshold) {
            snapWidth = Math.abs(canvasCenterX - fixedEdgeX);
            newSnappedEdgeX = "center";
            activeGuides.push({ orientation: "vertical", position: canvasCenterX });
          }
        } else if (distToCenter < enterThreshold) {
          snapWidth = Math.abs(canvasCenterX - fixedEdgeX);
          newSnappedEdgeX = "center";
          activeGuides.push({ orientation: "vertical", position: canvasCenterX });
          this.resizeSnapState.lastPointerX = pointer.x;
        }
      }
    }
    if (changeY !== 0) {
      const movingEdgeY = changeY === 1 ? bounds.bottom : bounds.top;
      const fixedEdgeY = changeY === 1 ? bounds.top : bounds.bottom;
      if (this.config.snapToEdges) {
        const targetEdge = changeY === 1 ? canvasHeight : 0;
        const edgeName = changeY === 1 ? "bottom" : "top";
        const distToEdge = Math.abs(movingEdgeY - targetEdge);
        const wasSnapped = this.resizeSnapState.snappedEdgeY === edgeName;
        if (wasSnapped) {
          if (Math.abs(pointerDeltaY) < exitThreshold) {
            snapHeight = Math.abs(targetEdge - fixedEdgeY);
            newSnappedEdgeY = edgeName;
            activeGuides.push({ orientation: "horizontal", position: targetEdge });
          }
        } else if (distToEdge < enterThreshold) {
          snapHeight = Math.abs(targetEdge - fixedEdgeY);
          newSnappedEdgeY = edgeName;
          activeGuides.push({ orientation: "horizontal", position: targetEdge });
          this.resizeSnapState.lastPointerY = pointer.y;
        }
      }
      if (this.config.snapToCenter && newSnappedEdgeY === null) {
        const distToCenter = Math.abs(movingEdgeY - canvasCenterY);
        const wasSnappedToCenter = this.resizeSnapState.snappedEdgeY === "center";
        if (wasSnappedToCenter) {
          if (Math.abs(pointerDeltaY) < exitThreshold) {
            snapHeight = Math.abs(canvasCenterY - fixedEdgeY);
            newSnappedEdgeY = "center";
            activeGuides.push({ orientation: "horizontal", position: canvasCenterY });
          }
        } else if (distToCenter < enterThreshold) {
          snapHeight = Math.abs(canvasCenterY - fixedEdgeY);
          newSnappedEdgeY = "center";
          activeGuides.push({ orientation: "horizontal", position: canvasCenterY });
          this.resizeSnapState.lastPointerY = pointer.y;
        }
      }
    }
    this.resizeSnapState.snappedEdgeX = newSnappedEdgeX;
    this.resizeSnapState.snappedEdgeY = newSnappedEdgeY;
    this.updateGuides(activeGuides);
    return {
      width: snapWidth,
      height: snapHeight,
      guides: activeGuides
    };
  }
  /**
   * Réinitialise l'état du snap de resize (à appeler quand le resize est terminé)
   */
  resetResizeSnap() {
    this.resizeSnapState = null;
    this.clearGuides();
  }
  /**
   * Nettoie les ressources
   */
  dispose() {
    this.clearGuides();
    this.canvas.off("object:moving");
    this.canvas.off("object:scaling");
    this.canvas.off("object:modified");
    this.canvas.off("selection:cleared");
  }
};

// src/clipping/antiScale.ts
function antiScale(obj) {
  const ratio = obj.scaleY / obj.scaleX;
  if (ratio < 1) {
    return [ratio, 1];
  } else {
    return [1, 1 / ratio];
  }
}

// src/shapes/shapeWheel.ts
var SHAPE_WHEEL = [
  "rect",
  "rounded",
  "circle",
  "heart",
  "hexagon"
];
function nextShape(currentId) {
  if (!currentId) return "rounded";
  const currentIndex = SHAPE_WHEEL.indexOf(currentId);
  if (currentIndex === -1) return "rounded";
  const nextIndex = (currentIndex + 1) % SHAPE_WHEEL.length;
  return SHAPE_WHEEL[nextIndex];
}
function isValidShape(id) {
  return SHAPE_WHEEL.includes(id);
}
function getAvailableShapes() {
  return SHAPE_WHEEL;
}

// src/clipping/clipStrategies.ts
function addCircleClip(obj) {
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
function addHeartClip(obj) {
  function scale() {
    const minSize = Math.min(obj.height, obj.width) / 2;
    const scaleFactor = minSize / 14;
    const heart = createHeart({ scaleX: scaleFactor, scaleY: scaleFactor });
    obj.clipPath = heart;
  }
  scale();
  obj.on("scaling", scale);
}
function addHexagonClip(obj) {
  function scale() {
    const minSize = Math.min(obj.height, obj.width) / 2;
    const scaleFactor = minSize / 24;
    const hexa = createHexagon({ scaleX: scaleFactor, scaleY: scaleFactor });
    obj.clipPath = hexa;
  }
  scale();
  obj.on("scaling", scale);
}
function addRoundedClip(obj) {
  obj.noScaleCache = false;
  function scale() {
    if (!obj.clipPath) return;
    const [scaleX, scaleY] = antiScale(obj);
    const minSize = Math.min(obj.height, obj.width);
    obj.clipPath.set({
      height: obj.height,
      width: obj.width,
      ry: minSize * 0.15 * scaleY,
      rx: minSize * 0.15 * scaleX
    });
  }
  obj.clipPath = createRoundedRect({});
  scale();
  obj.on("scaling", scale);
}
function switchClip(obj) {
  obj.off("scaling");
  const clipPath = obj.clipPath;
  const currentShape = clipPath?.id;
  const nextShapeType = nextShape(currentShape);
  switch (nextShapeType) {
    case "rect":
      obj.clipPath = void 0;
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
function applyClip(obj, shapeType) {
  obj.off("scaling");
  switch (shapeType) {
    case "rect":
      obj.clipPath = void 0;
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

// src/FabricEditor.ts
function computeDimensions(width, height, constraint) {
  if (width > height) {
    const ratio = constraint / width;
    return [constraint, height * ratio, ratio];
  } else {
    const ratio = constraint / height;
    return [width * ratio, constraint, ratio];
  }
}
var FabricEditor = class {
  constructor(canvasElement, config) {
    this.config = config;
    this.state = {
      ratio: 1,
      maxSize: config.standAlone ? 500 : 1e3
    };
    this.canvas = this.initCanvas(canvasElement);
    this.layers = new LayerManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas);
    this.canvas.snappingManager = this.snapping;
    this.extendFabricObject();
    this.configureRotationControl();
  }
  /**
   * Le ratio de redimensionnement appliqué à l'image de fond
   */
  get ratio() {
    return this.state.ratio;
  }
  /**
   * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
   *
   * Le canvas Fabric a une taille "interne" (ex: 1000x800) utilisée pour les calculs,
   * mais il est affiché dans le container avec une taille CSS différente via zoom.
   * Cette méthode applique le ratio pour positionner des éléments HTML par-dessus le canvas.
   */
  canvasToDisplayCoords(rect) {
    const container = this.config.container;
    if (!container) {
      return rect;
    }
    const ratioX = container.clientWidth / this.canvas.width;
    const ratioY = container.clientHeight / this.canvas.height;
    return {
      left: rect.left * ratioX,
      top: rect.top * ratioY,
      width: rect.width * ratioX,
      height: rect.height * ratioY
    };
  }
  /**
   * Positionne un élément HTML par-dessus un objet Fabric.
   *
   * @param element - L'élément HTML à positionner (doit être dans le DOM, dans le container)
   * @param obj - L'objet Fabric sur lequel positionner l'élément
   * @param options.anchor - Point d'ancrage : "center", "top", "bottom", "left", "right"
   * @param options.offset - Espacement en pixels entre l'élément et l'objet (défaut: 0)
   * @param options.autoFlip - Bascule automatiquement top↔bottom ou left↔right si pas assez d'espace,
   *                           et passe à l'intérieur si pas de place des deux côtés (défaut: false)
   * @param options.clampToContainer - Contraint la position finale aux limites du container (défaut: false)
   */
  positionElementOverObject(element, obj, options = {}) {
    const { anchor = "center", offset = 0, autoFlip = false, clampToContainer = false } = options;
    const displayRect = this.canvasToDisplayCoords(obj.getBoundingRect());
    const containerWidth = this.config.container?.clientWidth || this.canvas.width;
    const containerHeight = this.config.container?.clientHeight || this.canvas.height;
    const elementWidth = element.offsetWidth || 100;
    const elementHeight = element.offsetHeight || 40;
    let effectiveAnchor = anchor;
    if (autoFlip) {
      if (anchor === "top" || anchor === "bottom") {
        const spaceAbove = displayRect.top;
        const spaceBelow = containerHeight - (displayRect.top + displayRect.height);
        const needsSpace = elementHeight + offset;
        if (anchor === "top") {
          if (spaceAbove >= needsSpace) {
            effectiveAnchor = "top";
          } else if (spaceBelow >= needsSpace) {
            effectiveAnchor = "bottom";
          } else {
            effectiveAnchor = "inside-top";
          }
        } else {
          if (spaceBelow >= needsSpace) {
            effectiveAnchor = "bottom";
          } else if (spaceAbove >= needsSpace) {
            effectiveAnchor = "top";
          } else {
            effectiveAnchor = "inside-bottom";
          }
        }
      } else if (anchor === "left" || anchor === "right") {
        const spaceLeft = displayRect.left;
        const spaceRight = containerWidth - (displayRect.left + displayRect.width);
        const needsSpace = elementWidth + offset;
        if (anchor === "left") {
          if (spaceLeft >= needsSpace) {
            effectiveAnchor = "left";
          } else if (spaceRight >= needsSpace) {
            effectiveAnchor = "right";
          } else {
            effectiveAnchor = "inside-left";
          }
        } else {
          if (spaceRight >= needsSpace) {
            effectiveAnchor = "right";
          } else if (spaceLeft >= needsSpace) {
            effectiveAnchor = "left";
          } else {
            effectiveAnchor = "inside-right";
          }
        }
      }
    }
    element.style.position = "absolute";
    let left;
    let top;
    let transformX = "0";
    let transformY = "0";
    switch (effectiveAnchor) {
      case "top":
        left = displayRect.left + displayRect.width / 2;
        top = displayRect.top - offset;
        transformX = "-50%";
        transformY = "-100%";
        break;
      case "bottom":
        left = displayRect.left + displayRect.width / 2;
        top = displayRect.top + displayRect.height + offset;
        transformX = "-50%";
        transformY = "0";
        break;
      case "inside-top":
        left = displayRect.left + displayRect.width / 2;
        top = displayRect.top + offset;
        transformX = "-50%";
        transformY = "0";
        break;
      case "inside-bottom":
        left = displayRect.left + displayRect.width / 2;
        top = displayRect.top + displayRect.height - offset;
        transformX = "-50%";
        transformY = "-100%";
        break;
      case "left":
        left = displayRect.left - offset;
        top = displayRect.top + displayRect.height / 2;
        transformX = "-100%";
        transformY = "-50%";
        break;
      case "right":
        left = displayRect.left + displayRect.width + offset;
        top = displayRect.top + displayRect.height / 2;
        transformX = "0";
        transformY = "-50%";
        break;
      case "inside-left":
        left = displayRect.left + offset;
        top = displayRect.top + displayRect.height / 2;
        transformX = "0";
        transformY = "-50%";
        break;
      case "inside-right":
        left = displayRect.left + displayRect.width - offset;
        top = displayRect.top + displayRect.height / 2;
        transformX = "-100%";
        transformY = "-50%";
        break;
      case "center":
      default:
        left = displayRect.left + displayRect.width / 2;
        top = displayRect.top + displayRect.height / 2;
        transformX = "-50%";
        transformY = "-50%";
        break;
    }
    if (clampToContainer) {
      const offsetX = transformX === "-100%" ? -elementWidth : transformX === "-50%" ? -elementWidth / 2 : 0;
      const offsetY = transformY === "-100%" ? -elementHeight : transformY === "-50%" ? -elementHeight / 2 : 0;
      const finalLeft = left + offsetX;
      const finalTop = top + offsetY;
      const finalRight = finalLeft + elementWidth;
      const finalBottom = finalTop + elementHeight;
      if (finalLeft < 0) {
        left -= finalLeft;
      } else if (finalRight > containerWidth) {
        left -= finalRight - containerWidth;
      }
      if (finalTop < 0) {
        top -= finalTop;
      } else if (finalBottom > containerHeight) {
        top -= finalBottom - containerHeight;
      }
    }
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.transform = `translate(${transformX}, ${transformY})`;
  }
  /**
   * Initialise l'éditeur avec une image de fond et des calques optionnels
   */
  async initialize(backgroundImageUrl, layers = []) {
    await this.layers.loadBackgroundImage(backgroundImageUrl, this.state.ratio);
    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }
    if (this.config.standAlone) {
      this.centerAllObjects();
    }
    if (this.config.container) {
      await this.masks.setup(this.config.container, this.state.maxSize);
    }
    this.canvas.renderAll();
    this.history.initialize();
  }
  /**
   * Charge les polices personnalisées
   */
  async loadFonts(fonts) {
    const fontFaces = await Promise.all(
      Object.entries(fonts).map(([, values]) => {
        return new FontFace(values.family, values.url, {
          style: "normal",
          weight: values.weight || "normal"
        }).load();
      })
    );
    fontFaces?.forEach((f) => document?.fonts?.add(f));
  }
  /**
   * Bascule le clip de l'objet sélectionné vers la forme suivante
   */
  switchClip() {
    const obj = this.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.nextClipShape();
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (obj instanceof FabricImage6) {
      switchClip(obj);
      obj.dirty = true;
      this.canvas.remove(obj);
      this.layers.add(obj);
    }
  }
  /**
   * Bascule la forme de l'objet sélectionné vers la forme suivante
   */
  switchShape() {
    const obj = this.selection.current;
    if (!obj || obj instanceof FabricImage6) return;
    const currentShapeId = obj.id;
    const nextShapeType = nextShape(currentShapeId);
    const newObj = switchShape(obj, nextShapeType);
    this.layers.add(newObj);
    this.canvas.remove(obj);
  }
  /**
   * Bascule entre remplissage et contour pour l'objet sélectionné
   */
  toggleOutline() {
    const obj = this.selection.current;
    if (!obj) return;
    const { stroke, fill } = obj;
    obj.set({ fill: stroke, stroke: fill });
    obj.strokeWidth = obj.stroke ? 4 / obj.scaleY : 0;
    this.canvas.renderAll();
  }
  /**
   * Change la couleur de l'objet sélectionné
   */
  changeColor(color) {
    const obj = this.selection.current;
    if (!obj) return;
    if (obj.type === "i-text") {
      obj.set("fill", color);
    } else {
      const property = obj.stroke ? "stroke" : "fill";
      obj.set(property, color);
    }
    this.canvas.renderAll();
  }
  /**
   * Change l'opacité de l'objet sélectionné
   */
  changeOpacity(opacity) {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set({ opacity: opacity / 100 });
    this.canvas.renderAll();
  }
  /**
   * Change la police de l'objet texte sélectionné
   */
  changeFont(fontFamily, fontWeight) {
    const obj = this.selection.current;
    if (!obj || obj.type !== "i-text") return;
    obj.set({ fontFamily, fontWeight: fontWeight || "normal" });
    this.canvas.requestRenderAll();
  }
  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés
   */
  deleteSelection() {
    const selected = this.selection.selected;
    if (selected.length === 0) return;
    const deletable = selected.filter((obj) => !isPositionLocked(obj));
    if (deletable.length === 0) return;
    this.layers.removeMany(deletable);
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }
  /**
   * Trouve l'image ou ImageFrame situé sous un point donné (coordonnées canvas)
   * Retourne null si aucune image n'est trouvée
   */
  findImageAtPoint(x, y) {
    const point = new Point2(x, y);
    const objects = this.canvas.getObjects().slice().reverse();
    for (const obj of objects) {
      if (obj.get("layerId") === "originalImage") continue;
      const layerType = obj.layerType;
      if (layerType === "imageFrame" && obj.containsPoint(point)) {
        return obj;
      }
      if (obj instanceof FabricImage6 && obj.containsPoint(point)) {
        return obj;
      }
    }
    return null;
  }
  /**
   * Nettoie les ressources
   */
  dispose() {
    this.snapping.dispose();
    this.selection.dispose();
    this.canvas.dispose();
  }
  /**
   * Initialise le canvas Fabric
   */
  initCanvas(canvasElement) {
    const [width, height, ratio] = computeDimensions(
      this.config.width,
      this.config.height,
      this.state.maxSize
    );
    this.state.ratio = ratio;
    return new Canvas5(canvasElement, {
      width,
      height,
      preserveObjectStacking: true
    });
  }
  /**
   * Centre tous les objets sur le canvas (mode standalone)
   */
  centerAllObjects() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.canvas.forEachObject((obj) => {
      const bound = obj.getBoundingRect();
      minX = Math.min(minX, bound.left);
      minY = Math.min(minY, bound.top);
      maxX = Math.max(maxX, bound.left + bound.width);
      maxY = Math.max(maxY, bound.top + bound.height);
    });
    const groupCenterX = (minX + maxX) / 2;
    const groupCenterY = (minY + maxY) / 2;
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    const deltaX = canvasCenterX - groupCenterX;
    const deltaY = canvasCenterY - groupCenterY;
    this.canvas.forEachObject((obj) => {
      obj.set({
        left: obj.left + deltaX,
        top: obj.top + deltaY
      });
      obj.setCoords();
    });
    this.canvas.renderAll();
  }
  /**
   * Étend FabricObject pour inclure layerId dans la sérialisation
   */
  extendFabricObject() {
    const originalToObject = FabricObject6.prototype.toObject;
    FabricObject6.prototype.toObject = function(propertiesToInclude) {
      return originalToObject.call(
        this,
        ["layerId"].concat(propertiesToInclude || [])
      );
    };
  }
  /**
   * Déplace le contrôle de rotation (mtr) sur le côté droit de l'objet
   * pour éviter le conflit avec la barre de contrôles positionnée au-dessus
   *
   * En Fabric.js v6, les contrôles sont créés par instance, donc on écoute
   * l'événement object:added pour modifier chaque nouvel objet.
   */
  configureRotationControl() {
    const createSideRotationControl = () => new Control2({
      x: 0.5,
      y: 0,
      offsetX: 30,
      offsetY: 0,
      actionHandler: controlsUtils.rotationWithSnapping,
      cursorStyleHandler: controlsUtils.rotationStyleHandler,
      withConnection: true,
      actionName: "rotate"
    });
    this.canvas.on("object:added", (e) => {
      if (e.target?.controls?.mtr) {
        e.target.controls.mtr = createSideRotationControl();
      }
    });
  }
};

// src/ImageDropHandler.ts
import { Rect as Rect4 } from "fabric";
var HIGHLIGHT_COLOR = "#3b82f6";
var ImageDropHandler = class {
  constructor(editor, config) {
    this.editor = editor;
    this.state = {
      hoveredImage: null,
      pendingImage: null,
      timer: null,
      replaceMode: false,
      originalColors: null,
      fabricOverlay: null,
      htmlOverlay: null
    };
    this.dropZone = null;
    this.config = {
      hoverDelay: 1e3,
      overlayElement: void 0,
      overlayContent: "Remplacer",
      onSuccess: () => {
      },
      onError: console.error,
      ...config
    };
    this.boundHandleDragOver = this.handleDragOver.bind(this);
    this.boundHandleDragLeave = this.handleDragLeave.bind(this);
    this.boundHandleDrop = this.handleDrop.bind(this);
  }
  /**
   * Attache les event listeners sur l'élément drop zone
   */
  attach(dropZone) {
    this.dropZone = dropZone;
    dropZone.addEventListener("dragover", this.boundHandleDragOver);
    dropZone.addEventListener("dragleave", this.boundHandleDragLeave);
    dropZone.addEventListener("drop", this.boundHandleDrop);
  }
  /**
   * Détache les event listeners et nettoie l'état
   */
  detach() {
    if (this.dropZone) {
      this.dropZone.removeEventListener("dragover", this.boundHandleDragOver);
      this.dropZone.removeEventListener("dragleave", this.boundHandleDragLeave);
      this.dropZone.removeEventListener("drop", this.boundHandleDrop);
      this.dropZone = null;
    }
    this.reset();
  }
  /**
   * Réinitialise l'état complet
   */
  reset() {
    this.clearTimer();
    this.clearHighlight();
    this.state.pendingImage = null;
  }
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    const pointer = this.editor.canvas.getScenePoint(e);
    const imageAtPoint = this.editor.findImageAtPoint(pointer.x, pointer.y);
    if (imageAtPoint !== this.state.pendingImage) {
      this.clearTimer();
      this.clearHighlight();
      this.state.pendingImage = imageAtPoint;
      if (imageAtPoint) {
        this.state.timer = setTimeout(() => {
          this.activateReplaceMode(imageAtPoint);
        }, this.config.hoverDelay);
      }
    }
  }
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.reset();
  }
  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const file = this.extractImageFile(e);
    if (!file) {
      this.reset();
      return;
    }
    const shouldReplace = this.state.replaceMode && this.state.hoveredImage;
    const targetImage = this.state.hoveredImage;
    this.clearTimer();
    this.state.pendingImage = null;
    if (shouldReplace && targetImage) {
      await this.replaceImage(file, targetImage);
    } else {
      this.clearHighlight();
      const pointer = this.editor.canvas.getScenePoint(e);
      await this.addImage(file, pointer.x, pointer.y);
    }
  }
  extractImageFile(e) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;
    const file = files[0];
    if (!file.type.startsWith("image/")) return null;
    return file;
  }
  activateReplaceMode(image) {
    if (isContentLocked(image)) {
      return;
    }
    this.state.replaceMode = true;
    this.state.hoveredImage = image;
    this.highlightImage(image);
  }
  clearTimer() {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
    this.state.replaceMode = false;
  }
  clearHighlight() {
    if (this.state.hoveredImage) {
      this.restoreImageStyle(this.state.hoveredImage);
      this.state.hoveredImage = null;
    }
  }
  /**
   * Met en surbrillance une image via les contrôles de sélection Fabric
   * et un overlay HTML sombre avec texte personnalisable
   */
  highlightImage(target) {
    this.state.originalColors = {
      border: target.borderColor,
      corner: target.cornerColor
    };
    target.set({
      borderColor: HIGHLIGHT_COLOR,
      cornerColor: HIGHLIGHT_COLOR
    });
    this.createOverlay(target);
    this.editor.canvas.setActiveObject(target);
    this.editor.canvas.renderAll();
  }
  /**
   * Crée les overlays : un Rect Fabric (pour épouser le clipPath) + un élément HTML (pour le texte)
   */
  createOverlay(target) {
    let width;
    let height;
    let clipPath;
    if (target instanceof ImageFrame) {
      width = target.frameWidth;
      height = target.frameHeight;
      clipPath = target.clipPath;
    } else {
      width = target.width;
      height = target.height;
      clipPath = target.clipPath;
    }
    const fabricOverlay = new Rect4({
      left: target.left,
      top: target.top,
      width,
      height,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      angle: target.angle,
      originX: target.originX,
      originY: target.originY,
      fill: "rgba(0, 0, 0, 0.5)",
      selectable: false,
      evented: false,
      clipPath
    });
    this.editor.canvas.add(fabricOverlay);
    this.state.fabricOverlay = fabricOverlay;
    if (!this.dropZone) return;
    const htmlOverlay = this.config.overlayElement ? this.config.overlayElement.cloneNode(true) : this.createDefaultOverlay();
    htmlOverlay.style.pointerEvents = "none";
    htmlOverlay.style.zIndex = "1000";
    htmlOverlay.classList.remove("hidden");
    this.dropZone.appendChild(htmlOverlay);
    this.editor.positionElementOverObject(htmlOverlay, target);
    this.state.htmlOverlay = htmlOverlay;
  }
  /**
   * Crée l'overlay par défaut si aucun élément n'est fourni
   */
  createDefaultOverlay() {
    const overlay = document.createElement("div");
    overlay.innerHTML = this.config.overlayContent;
    overlay.style.cssText = `
      padding: 0.5rem 1rem;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 0.5rem;
      color: white;
      font-family: Inter, system-ui, sans-serif;
      font-weight: bold;
    `;
    return overlay;
  }
  /**
   * Restaure le style original d'une image/frame et supprime l'overlay
   */
  restoreImageStyle(target) {
    if (this.state.originalColors) {
      target.set({
        borderColor: this.state.originalColors.border,
        cornerColor: this.state.originalColors.corner
      });
      this.state.originalColors = null;
    }
    this.removeOverlay();
    this.editor.canvas.discardActiveObject();
    this.editor.canvas.renderAll();
  }
  /**
   * Supprime les overlays (Fabric + HTML)
   */
  removeOverlay() {
    if (this.state.fabricOverlay) {
      this.editor.canvas.remove(this.state.fabricOverlay);
      this.state.fabricOverlay = null;
    }
    if (this.state.htmlOverlay) {
      this.state.htmlOverlay.remove();
      this.state.htmlOverlay = null;
    }
  }
  async replaceImage(file, target) {
    this.clearHighlight();
    try {
      const imageUrl = this.config.getImageUrl(file);
      await this.editor.layers.replaceImageSource(target, imageUrl);
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }
  async addImage(file, left, top) {
    try {
      const imageUrl = this.config.getImageUrl(file);
      await this.editor.layers.addImage(imageUrl, {
        left,
        top,
        originX: "center",
        originY: "center"
      });
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }
};

// src/index.ts
init_PendingUploadsManager();
export {
  CustomTextbox,
  FabricEditor,
  HEART_PATH,
  HEXAGON_PATH,
  HistoryManager,
  ImageDropHandler,
  ImageFrame,
  LayerManager,
  MaskManager,
  PendingUploadsManager,
  PersistenceManager,
  SelectionManager,
  SnappingManager,
  addCircleClip,
  addCropControls,
  addHeartClip,
  addHexagonClip,
  addRoundedClip,
  antiScale,
  applyClip,
  applyLockMode,
  createCircle,
  createHeart,
  createHexagon,
  createImage,
  createRect,
  createRoundedRect,
  createShape,
  getAvailableShapes,
  getLockMode,
  getNextLockMode,
  isContentLocked,
  isPositionLocked,
  isStyleLocked,
  isValidShape,
  nextShape,
  removeCropControls,
  switchClip,
  switchShape
};
//# sourceMappingURL=index.mjs.map