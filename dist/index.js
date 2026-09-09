"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CustomTextbox: () => CustomTextbox,
  FabricEditor: () => FabricEditor,
  HEART_PATH: () => HEART_PATH,
  HEXAGON_PATH: () => HEXAGON_PATH,
  HistoryManager: () => HistoryManager,
  ImageDropHandler: () => ImageDropHandler,
  ImageFrame: () => ImageFrame,
  LayerManager: () => LayerManager,
  MaskManager: () => MaskManager,
  PendingUploadsManager: () => PendingUploadsManager,
  PersistenceManager: () => PersistenceManager,
  SelectionManager: () => SelectionManager,
  SnappingManager: () => SnappingManager,
  addCircleClip: () => addCircleClip,
  addCropControls: () => addCropControls,
  addHeartClip: () => addHeartClip,
  addHexagonClip: () => addHexagonClip,
  addRoundedClip: () => addRoundedClip,
  antiScale: () => antiScale,
  applyClip: () => applyClip,
  applyLockMode: () => applyLockMode,
  createCircle: () => createCircle,
  createHeart: () => createHeart,
  createHexagon: () => createHexagon,
  createImage: () => createImage,
  createRect: () => createRect,
  createRoundedRect: () => createRoundedRect,
  createShape: () => createShape,
  fabricToHtml: () => fabricToHtml,
  getAvailableShapes: () => getAvailableShapes,
  getLockMode: () => getLockMode,
  getNextLockMode: () => getNextLockMode,
  isContentLocked: () => isContentLocked,
  isPositionLocked: () => isPositionLocked,
  isStyleLocked: () => isStyleLocked,
  isValidShape: () => isValidShape,
  layerToHtmlStandalone: () => layerToHtmlStandalone,
  nextShape: () => nextShape,
  removeCropControls: () => removeCropControls,
  switchClip: () => switchClip,
  switchShape: () => switchShape
});
module.exports = __toCommonJS(index_exports);

// src/FabricEditor.ts
var import_fabric9 = require("#fabric");

// src/LayerManager.ts
var import_fabric5 = require("#fabric");

// src/controls/CustomTextbox.ts
var import_fabric = require("#fabric");
var CustomTextbox = class extends import_fabric.IText {
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
    const p = new import_fabric.Point(
      boundaries.left + leftOffset,
      boundaries.top + boundaries.topOffset + charHeight
    ).transform(this.calcTransformMatrix()).transform(this.canvas.viewportTransform).multiply(
      new import_fabric.Point(
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
var import_fabric3 = require("#fabric");

// src/shapes/paths.ts
var HEART_PATH = "M 0 13 Q -1 13 -4 11 C -12 5 -17 -3 -12 -10 C -9 -14 -2 -13 0 -7 C 2 -13 9 -14 12 -10 C 17 -3 11 5 4 11 Q 1 13 0 13 Z";
var HEXAGON_PATH = "M-2 -23.3453C-0.7624 -24.0598 0.7624 -24.0598 2 -23.3453L19.2176 -13.4047C20.4552 -12.6902 21.2176 -11.3697 21.2176 -9.9406V10.4406C21.2176 11.8697 20.4552 13.1902 19.2176 13.9047L2 23.8453C0.7624 24.5598 -0.7624 24.5598 -2 23.8453L-19.2176 13.9047C-20.4552 13.1902 -21.2176 11.8697 -21.2176 10.4406V-9.9406C-21.2176 -11.3697 -20.4552 -12.6902 -19.2176 -13.4047L-2 -23.3453Z";

// src/controls/cropControls.ts
var import_fabric2 = require("#fabric");
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
    obj.controls[controlName] = new import_fabric2.Control({
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
  return new import_fabric3.Rect({
    id: "rect",
    originX: "center",
    originY: "center",
    ...options
  });
}
function createRoundedRect(options) {
  const width = options?.width || 40;
  const height = options?.height || 40;
  const rect = new import_fabric3.Rect({
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
  return new import_fabric3.Circle({
    id: "circle",
    originX: "center",
    originY: "center",
    ...options
  });
}
function createHeart(options) {
  const minSize = Math.min(options?.height || 40, options?.width || 40) / 2;
  const scaleFactor = minSize / 14;
  return new import_fabric3.Path(HEART_PATH, {
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
  return new import_fabric3.Path(HEXAGON_PATH, {
    id: "hexagon",
    originX: "center",
    originY: "center",
    ...options
  });
}
async function createImage(url, options) {
  const img = await import_fabric3.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
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
var import_fabric4 = require("#fabric");
function rotatePoint(dx, dy, angleDeg) {
  const angle = -angleDeg * Math.PI / 180;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle)
  };
}
var ImageFrame = class _ImageFrame extends import_fabric4.Group {
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
      layoutManager: new import_fabric4.LayoutManager(new import_fabric4.FixedLayout()),
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
        this.clipPath = new import_fabric4.Rect({
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
    const img = await import_fabric4.FabricImage.fromURL(data.image.src, { crossOrigin: "anonymous" });
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
import_fabric4.classRegistry.setClass(ImageFrame);
import_fabric4.classRegistry.setClass(ImageFrame, "ImageFrame");

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
  async loadBackgroundImage(url) {
    const img = await import_fabric5.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const scaleX = this.canvas.width / img.width;
    const scaleY = this.canvas.height / img.height;
    const scale = Math.max(scaleX, scaleY);
    img.set({
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
      left: this.canvas.width / 2,
      top: this.canvas.height / 2,
      selectable: false,
      evented: false,
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
    objects.forEach((obj, i) => {
      if (!obj) return;
      const data = layers[i];
      if (data.selectable === false) obj.selectable = false;
      if (data.evented === false) obj.evented = false;
      this.add(obj);
    });
    return objects.filter(Boolean);
  }
  /**
   * Ajoute un objet au canvas et le sélectionne (si interactif)
   */
  add(obj) {
    this.canvas.add(obj);
    if (obj.selectable !== false && typeof this.canvas.setActiveObject === "function") {
      this.canvas.setActiveObject(obj);
    }
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
    const img = await import_fabric5.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
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
      const newImg = await import_fabric5.FabricImage.fromURL(newUrl, { crossOrigin: "anonymous" });
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
    const newImg = await import_fabric5.FabricImage.fromURL(newUrl, { crossOrigin: "anonymous" });
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
   * Remplace une forme (shape) par un ImageFrame contenant l'image donnée.
   * La forme sert de masque : l'image épouse ses dimensions et son clipShape.
   * L'ImageFrame est inséré au même z-index que la forme d'origine.
   */
  async replaceShapeWithImage(shape, imageUrl) {
    const shapeId = shape.id || "";
    const clipShape = isValidShape(shapeId) ? shapeId : "rect";
    const displayedWidth = shape.width * (shape.scaleX || 1);
    const displayedHeight = shape.height * (shape.scaleY || 1);
    const center = shape.getCenterPoint();
    const zIndex = this.canvas._objects.indexOf(shape);
    const img = await import_fabric5.FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });
    const frame = new ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: shape.angle,
      layerId: shape.layerId || this.generateId(),
      clipShape,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight
    });
    this.canvas.remove(shape);
    this.canvas.add(frame);
    if (zIndex >= 0 && zIndex < this.canvas._objects.length) {
      this.canvas.moveObjectTo(frame, zIndex);
    }
    this.canvas.setActiveObject(frame);
    this.canvas.renderAll();
    return frame;
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
      shapeType = "rect",
      layerId = this.generateId()
    } = options;
    const shape = createShape(shapeType, { fill, left, top, width, height, radius: Math.min(width, height) / 2 });
    shape.set({ layerId, layerType: "shape" });
    this.add(shape);
    return shape;
  }
  /**
   * Groupe plusieurs objets ensemble
   */
  groupObjects(objects) {
    const group = new import_fabric5.Group(objects);
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
        const img = await import_fabric5.FabricImage.fromObject({
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
        obj = await import_fabric5.Group.fromObject(layer);
        break;
      case "Rect":
      case "rect":
        obj = await import_fabric5.Rect.fromObject(layer);
        break;
      case "Path":
      case "path":
        obj = await import_fabric5.Path.fromObject(layer);
        break;
      case "Circle":
      case "circle":
        obj = await import_fabric5.Circle.fromObject(layer);
        break;
      default:
        console.warn(`Type de calque inconnu: ${layer.type}`);
        return null;
    }
    if (obj && layer.lockMode) {
      applyLockMode(obj, layer.lockMode);
    }
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
var import_fabric6 = require("#fabric");
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
    this._silenced = false;
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
   * Désélectionne tout et re-rend le canvas
   */
  clear() {
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this._current = null;
  }
  /**
   * Suspend tous les callbacks de sélection (onSelect, onDeselect, etc.).
   * Utilisé par changeShape() qui fait un remove+add synchrone : sans suppression,
   * les contrôleurs externes (toolbox) interpréteraient les événements intermédiaires
   * comme de vraies actions utilisateur.
   */
  silenceCallbacks() {
    this._silenced = true;
  }
  /**
   * Réactive les callbacks de sélection après une suppression.
   */
  restoreCallbacks() {
    this._silenced = false;
  }
  /**
   * Sélectionne un objet
   */
  select(obj) {
    this.canvas.setActiveObject(obj);
    this._current = obj;
    this.canvas.renderAll();
  }
  /**
   * Sélectionne un objet par son layerId
   */
  selectByLayerId(layerId) {
    const obj = this.canvas.getObjects().find(
      (o) => o.get("layerId") === layerId
    );
    if (!obj) return false;
    this.select(obj);
    return true;
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
    if (this._silenced) return;
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
        const newSelection = new import_fabric6.ActiveSelection(unlocked, { canvas: this.canvas });
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
    if (this._silenced) return;
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
var import_fabric7 = require("#fabric");
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
  async setup(container) {
    const mask = this.findMask();
    const bgImage = this.findBackground();
    if (mask && bgImage) {
      this.cropCanvasToMask(mask, bgImage.height);
      mask.set({ selectable: false, evented: false });
      this.canvas.discardActiveObject();
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
    const maskImage = await import_fabric7.FabricImage.fromURL(maskUrl, {
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
};

// src/PersistenceManager.ts
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
   *
   * Calcule le bounding box manuellement sans Group, car Fabric.js 7
   * transforme les coordonnées des enfants en relatif au centre du groupe.
   */
  compactAroundLayers() {
    const layerObjects = this.layers.all;
    if (layerObjects.length === 0) return;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const obj of layerObjects) {
      const rect = obj.getBoundingRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.left + rect.width);
      maxY = Math.max(maxY, rect.top + rect.height);
    }
    for (const obj of layerObjects) {
      obj.set({
        left: obj.left - minX,
        top: obj.top - minY
      });
      obj.setCoords();
    }
    this.canvas.clear();
    for (const obj of layerObjects) {
      this.canvas.add(obj);
    }
    this.canvas.setDimensions({
      width: maxX - minX,
      height: maxY - minY
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
var import_fabric8 = require("#fabric");
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
    return new import_fabric8.Line(coords, {
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
var _FabricEditor = class _FabricEditor {
  constructor(canvasElement, config) {
    this._displayScale = 1;
    this._userZoom = 1;
    this._resizeObserver = null;
    this._resizeCallbacks = [];
    this._initialized = false;
    this.config = config;
    this.canvas = new import_fabric9.Canvas(canvasElement, {
      width: config.width,
      height: config.height,
      preserveObjectStacking: true
    });
    this.layers = new LayerManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas);
    this.canvas.snappingManager = this.snapping;
    this.extendFabricObject();
    this.configureRotationControl();
    if (config.transparent) {
      this.canvas.backgroundColor = "transparent";
    }
  }
  /**
   * Async initialization: loads fonts from config if present.
   * Idempotent — safe to call multiple times.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    if (this.config.fonts && Object.keys(this.config.fonts).length > 0) {
      await this.loadFonts(this.config.fonts);
    }
    if (this.config.container) {
      this.observeResize();
    }
  }
  /**
   * Register a callback to be called after each container resize (and initial fit).
   */
  onResize(callback) {
    this._resizeCallbacks.push(callback);
  }
  /**
   * Clear all layers, ensure fonts are loaded, load new layers, and render.
   * Single entry point for both initial load and undo/redo restore.
   */
  async replaceAllLayers(layers) {
    await this.init();
    this.layers.all.forEach((obj) => this.layers.remove(obj));
    await this.layers.loadLayers(layers);
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }
  /**
   * Current CSS scale applied by fitToContainer.
   */
  get displayScale() {
    return this._displayScale;
  }
  /**
   * CSS-scale the canvas to fit inside its container.
   *
   * The canvas stays at native resolution (config.width × config.height);
   * a CSS `transform: scale()` on the .canvas-container wrapper makes it
   * fit the container element.  Returns the computed scale factor.
   */
  fitToContainer() {
    const container = this.config.container;
    if (!container) return 1;
    const compW = this.config.width;
    const compH = this.config.height;
    const boxW = container.clientWidth;
    const boxH = container.clientHeight;
    const fitScale = Math.min(boxW / compW, boxH / compH);
    const scale = fitScale * this._userZoom;
    this.canvas.setDimensions({ width: compW, height: compH });
    const canvasEl = container.querySelector(".canvas-container") || container;
    canvasEl.style.transformOrigin = "top left";
    canvasEl.style.transform = `scale(${scale})`;
    const scaledW = compW * scale;
    const scaledH = compH * scale;
    const offsetX = Math.max(0, (boxW - scaledW) / 2);
    const offsetY = Math.max(0, (boxH - scaledH) / 2);
    canvasEl.style.marginLeft = `${offsetX}px`;
    canvasEl.style.marginTop = `${offsetY}px`;
    container.style.overflow = this._userZoom > 1 ? "auto" : "hidden";
    this._displayScale = scale;
    return scale;
  }
  /**
   * Set user zoom level (1 = fit to container, >1 = zoom in).
   * Re-runs fitToContainer to apply the new scale.
   */
  setUserZoom(zoom) {
    this._userZoom = Math.max(0.1, zoom);
    this.fitToContainer();
    this._resizeCallbacks.forEach((cb) => cb());
  }
  get userZoom() {
    return this._userZoom;
  }
  /**
   * Observe the container for size changes and automatically re-fit.
   * Called automatically by init() when a container is configured.
   */
  observeResize() {
    const container = this.config.container;
    if (!container) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      this.fitToContainer();
      this._resizeCallbacks.forEach((cb) => cb());
    });
    this._resizeObserver.observe(container);
    this.fitToContainer();
  }
  /**
   * Returns positioning config for external controls (e.g. FabricControls).
   *
   * @param anchorEl - The positioned ancestor in which controls live.
   *                   Typically the flex-centering wrapper around the canvas box.
   */
  getControlsConfig(anchorEl) {
    return {
      getContainer: () => anchorEl,
      getDisplayScale: () => this._displayScale,
      getCanvasOffset: () => {
        const container = this.config.container;
        if (!container) return { left: 0, top: 0 };
        const canvasEl = container.querySelector(".canvas-container") || container;
        const anchorRect = anchorEl.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        return {
          left: canvasRect.left - anchorRect.left,
          top: canvasRect.top - anchorRect.top
        };
      }
    };
  }
  /**
   * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
   * Utilise le displayScale mis à jour par fitToContainer.
   */
  canvasToDisplayCoords(rect) {
    const s = this._displayScale;
    return {
      left: rect.left * s,
      top: rect.top * s,
      width: rect.width * s,
      height: rect.height * s
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
    const s = this._displayScale;
    const containerWidth = this.config.width * s;
    const containerHeight = this.config.height * s;
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
   * Returns the bounding rect of a Fabric object as rounded pixel coordinates.
   */
  getObjectBounds(obj) {
    const bound = obj.getBoundingRect();
    return {
      x: Math.round(bound.left),
      y: Math.round(bound.top),
      width: Math.round(bound.width),
      height: Math.round(bound.height)
    };
  }
  /**
   * Enable or disable canvas interactivity.
   * When disabled, discards selection and marks the canvas as non-interactive.
   * When enabled, discards selection (clean state) and optionally syncs visibility.
   */
  setInteractive(enabled) {
    if (enabled) {
      this.canvas.discardActiveObject();
    } else {
      this.canvas.discardActiveObject();
    }
    this.canvas.renderAll();
  }
  /**
   * Initialise l'éditeur avec une image de fond et des calques optionnels
   */
  async initialize(backgroundImageUrl, layers = []) {
    await this.layers.loadBackgroundImage(backgroundImageUrl);
    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }
    if (this.config.container) {
      await this.masks.setup(this.config.container);
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
    } else if (obj instanceof import_fabric9.FabricImage) {
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
    if (!obj || obj instanceof import_fabric9.FabricImage) return;
    const currentShapeId = obj.id;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }
  /**
   * Change la forme de l'objet sélectionné vers un type précis.
   * Pour les shapes : remplace l'objet. Pour les ImageFrames : change le clipShape.
   */
  changeShape(shapeType) {
    const obj = this.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.applyClipShape(shapeType);
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (!(obj instanceof import_fabric9.FabricImage)) {
      const newObj = switchShape(obj, shapeType);
      const layerId = obj.get("layerId");
      const layerType = obj.get("layerType");
      if (layerId) newObj.set("layerId", layerId);
      if (layerType) newObj.set("layerType", layerType);
      this.selection.silenceCallbacks();
      const zIndex = this.canvas._objects.indexOf(obj);
      this.canvas.remove(obj);
      this.canvas.add(newObj);
      if (zIndex >= 0 && zIndex < this.canvas._objects.length) {
        this.canvas.moveObjectTo(newObj, zIndex);
      }
      this.canvas.setActiveObject(newObj);
      this.canvas.requestRenderAll();
      this.selection.restoreCallbacks();
    }
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
    const target = this.findDropTargetAtPoint(x, y);
    if (!target || target.layerType === "shape") return null;
    return target;
  }
  /**
   * Trouve l'objet "droppable" sous un point : ImageFrame, FabricImage, ou shape.
   * Utilisé par ImageDropHandler pour le drop d'images sur images ET sur formes.
   */
  findDropTargetAtPoint(x, y) {
    const point = new import_fabric9.Point(x, y);
    const objects = this.canvas.getObjects().slice().reverse();
    for (const obj of objects) {
      if (obj.get("layerId") === "originalImage") continue;
      const layerType = obj.layerType;
      if (layerType === "imageFrame" && obj.containsPoint(point)) {
        return obj;
      }
      if (layerType === "shape" && obj.containsPoint(point)) {
        return obj;
      }
      if (obj instanceof import_fabric9.FabricImage && obj.containsPoint(point)) {
        return obj;
      }
    }
    return null;
  }
  /**
   * Nettoie les ressources
   */
  dispose() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._resizeCallbacks = [];
    this.snapping.dispose();
    this.selection.dispose();
    this.canvas.dispose();
  }
  extendFabricObject() {
    if (_FabricEditor._toObjectExtended) return;
    _FabricEditor._toObjectExtended = true;
    const originalToObject = import_fabric9.FabricObject.prototype.toObject;
    import_fabric9.FabricObject.prototype.toObject = function(propertiesToInclude) {
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
    const createSideRotationControl = () => new import_fabric9.Control({
      x: 0.5,
      y: 0,
      offsetX: 30,
      offsetY: 0,
      actionHandler: import_fabric9.controlsUtils.rotationWithSnapping,
      cursorStyleHandler: import_fabric9.controlsUtils.rotationStyleHandler,
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
/**
 * Étend FabricObject pour inclure layerId dans la sérialisation
 */
_FabricEditor._toObjectExtended = false;
var FabricEditor = _FabricEditor;

// src/ImageDropHandler.ts
var import_fabric10 = require("#fabric");
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
  // ==================== Public API (for external drag sources) ====================
  /**
   * Track the pointer during an external drag (e.g. from a toolbox panel).
   * Manages the hover timer and replace overlay — same behaviour as native file drag.
   * The caller is responsible for calling preventDefault() on the event.
   */
  trackPointer(e) {
    this._trackPointer(e);
  }
  /**
   * Drop an image by URL. Replaces the hovered image if the timer has armed,
   * otherwise adds a new image at the drop position.
   *
   * Returns the result so the caller can act on it (e.g. register the new object).
   */
  async dropUrl(url, e) {
    const shouldReplace = this.state.replaceMode && this.state.hoveredImage;
    const target = this.state.hoveredImage;
    this.clearTimer();
    this.state.pendingImage = null;
    if (shouldReplace && target) {
      this.clearHighlight();
      const isShape = target.layerType === "shape";
      try {
        if (isShape) {
          const frame = await this.editor.layers.replaceShapeWithImage(target, url);
          this.config.onSuccess();
          return { kind: "replace", object: frame };
        } else {
          await this.editor.layers.replaceImageSource(target, url);
          this.config.onSuccess();
          return { kind: "replace" };
        }
      } catch (error) {
        this.config.onError(error);
        return null;
      }
    } else {
      this.clearHighlight();
      const opts = {};
      if (e) {
        const pointer = this.editor.canvas.getScenePoint(e);
        opts.left = pointer.x;
        opts.top = pointer.y;
        opts.originX = "center";
        opts.originY = "center";
      }
      try {
        const object = await this.editor.layers.addImage(url, opts);
        this.config.onSuccess();
        return { kind: "add", object };
      } catch (error) {
        this.config.onError(error);
        return null;
      }
    }
  }
  /**
   * Cancel an in-progress external drag. Resets timer, overlay, and state.
   */
  cancelDrag() {
    this.reset();
  }
  // ==================== Internal ====================
  reset() {
    this.clearTimer();
    this.clearHighlight();
    this.state.pendingImage = null;
  }
  _trackPointer(e) {
    const pointer = this.editor.canvas.getScenePoint(e);
    const imageAtPoint = this.editor.findDropTargetAtPoint(pointer.x, pointer.y);
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
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    this._trackPointer(e);
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
    const fabricOverlay = new import_fabric10.Rect({
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
      const isShape = target.layerType === "shape";
      if (isShape) {
        await this.editor.layers.replaceShapeWithImage(target, imageUrl);
      } else {
        await this.editor.layers.replaceImageSource(target, imageUrl);
      }
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

// src/html/cssUtils.ts
function originXToCss(originX) {
  switch (originX) {
    case "center":
      return "center";
    case "right":
      return "right";
    case "left":
    default:
      return "left";
  }
}
function originYToCss(originY) {
  switch (originY) {
    case "center":
      return "center";
    case "bottom":
      return "bottom";
    case "top":
    default:
      return "top";
  }
}
function getTransformOrigin(originX, originY) {
  return `${originXToCss(originX)} ${originYToCss(originY)}`;
}
function calculatePositionOffset(width, height, originX, originY) {
  let offsetX = 0;
  let offsetY = 0;
  if (originX === "center") {
    offsetX = -width / 2;
  } else if (originX === "right") {
    offsetX = -width;
  }
  if (originY === "center") {
    offsetY = -height / 2;
  } else if (originY === "bottom") {
    offsetY = -height;
  }
  return { offsetX, offsetY };
}
function buildTransform(options) {
  const transforms = [];
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  const angle = options.angle ?? 0;
  if (angle !== 0) {
    transforms.push(`rotate(${angle}deg)`);
  }
  if (scaleX !== 1 || scaleY !== 1) {
    transforms.push(`scale(${scaleX}, ${scaleY})`);
  }
  return transforms.length > 0 ? transforms.join(" ") : "none";
}
function buildPositionStyles(left, top, zIndex, options) {
  const styles = {
    position: "absolute",
    "z-index": String(zIndex)
  };
  if (options?.width && options?.height) {
    const { offsetX, offsetY } = calculatePositionOffset(
      options.width,
      options.height,
      options.originX,
      options.originY
    );
    styles.left = `${left + offsetX}px`;
    styles.top = `${top + offsetY}px`;
  } else {
    styles.left = `${left}px`;
    styles.top = `${top}px`;
  }
  return styles;
}
function stylesToString(styles) {
  return Object.entries(styles).map(([key, value]) => `${key}: ${value}`).join("; ");
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function buildGoogleFontsUrl(fonts) {
  if (fonts.length === 0) return "";
  const families = fonts.map((font) => font.replace(/ /g, "+")).map((font) => `family=${font}:wght@400;700`).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

// src/html/converters/textConverter.ts
function textToHtml(layer, zIndex) {
  const {
    text,
    left = 0,
    top = 0,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "#000000",
    fontFamily = "Arial",
    fontSize = 16,
    fontWeight = "normal",
    fontStyle = "normal",
    textAlign = "left",
    lineHeight = 1.16,
    charSpacing = 0,
    underline = false,
    linethrough = false,
    overline = false,
    originX = "left",
    originY = "top",
    width,
    height
  } = layer;
  const styles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY
  });
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }
  styles.color = fill;
  styles["font-family"] = `'${fontFamily}', sans-serif`;
  styles["font-size"] = `${fontSize}px`;
  styles["font-weight"] = fontWeight;
  styles["font-style"] = fontStyle;
  styles["text-align"] = textAlign;
  styles["line-height"] = String(lineHeight);
  styles["white-space"] = "nowrap";
  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }
  if (charSpacing !== 0) {
    styles["letter-spacing"] = `${charSpacing / 1e3}em`;
  }
  const decorations = [];
  if (underline) decorations.push("underline");
  if (linethrough) decorations.push("line-through");
  if (overline) decorations.push("overline");
  if (decorations.length > 0) {
    styles["text-decoration"] = decorations.join(" ");
  }
  const htmlText = escapeHtml(text).replace(/\n/g, "<br>");
  const html = `<div style="${stylesToString(styles)}">${htmlText}</div>`;
  return {
    html,
    fonts: [fontFamily]
  };
}

// src/html/converters/rectConverter.ts
function rectToHtml(layer, zIndex) {
  const {
    left = 0,
    top = 0,
    width,
    height,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 0,
    rx = 0,
    ry = 0,
    originX = "left",
    originY = "top"
  } = layer;
  const styles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY
  });
  styles.width = `${width}px`;
  styles.height = `${height}px`;
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }
  styles.background = fill || "transparent";
  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }
  if (rx > 0 || ry > 0) {
    styles["border-radius"] = rx === ry ? `${rx}px` : `${rx}px / ${ry}px`;
  }
  if (stroke && strokeWidth > 0) {
    styles.border = `${strokeWidth}px solid ${stroke}`;
    styles["box-sizing"] = "border-box";
  }
  const html = `<div style="${stylesToString(styles)}"></div>`;
  return { html };
}

// src/html/converters/circleConverter.ts
function circleToHtml(layer, zIndex) {
  const {
    left = 0,
    top = 0,
    radius,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 0,
    originX = "center",
    originY = "center"
  } = layer;
  const diameter = radius * 2;
  const styles = buildPositionStyles(left, top, zIndex, {
    width: diameter,
    height: diameter,
    originX,
    originY
  });
  styles.width = `${diameter}px`;
  styles.height = `${diameter}px`;
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }
  styles["border-radius"] = "50%";
  styles.background = fill || "transparent";
  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }
  if (stroke && strokeWidth > 0) {
    styles.border = `${strokeWidth}px solid ${stroke}`;
    styles["box-sizing"] = "border-box";
  }
  const html = `<div style="${stylesToString(styles)}"></div>`;
  return { html };
}

// src/html/converters/pathConverter.ts
function pathArrayToString(path) {
  return path.map((segment) => {
    if (Array.isArray(segment)) {
      return segment.join(" ");
    }
    return String(segment);
  }).join(" ");
}
function pathToHtml(layer, zIndex) {
  const {
    left = 0,
    top = 0,
    path,
    width = 100,
    height = 100,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 1,
    originX = "center",
    originY = "center",
    pathCenterY = 0
  } = layer;
  const pathString = Array.isArray(path) ? pathArrayToString(path) : path;
  const containerStyles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY
  });
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    containerStyles.transform = transform;
    containerStyles["transform-origin"] = getTransformOrigin(originX, originY);
  }
  if (opacity !== 1) {
    containerStyles.opacity = String(opacity);
  }
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const html = `<div style="${stylesToString(containerStyles)}">
  <svg width="${width}" height="${height}" viewBox="${-halfWidth} ${-halfHeight + pathCenterY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <path d="${pathString}" fill="${fill || "none"}" stroke="${stroke || "none"}" stroke-width="${strokeWidth}" />
  </svg>
</div>`;
  return { html };
}

// src/html/clipPaths.ts
function getClipPathCss(shapeType, width, height) {
  if (!shapeType || shapeType === "rect") {
    return void 0;
  }
  const w = width ?? 100;
  const h = height ?? 100;
  const minSize = Math.min(w, h);
  switch (shapeType) {
    case "circle": {
      const radius = minSize / 2;
      return `circle(${radius}px at ${w / 2}px ${h / 2}px)`;
    }
    case "rounded": {
      const radius = minSize * 0.15;
      return `inset(0 round ${radius}px)`;
    }
    case "heart":
    case "hexagon":
      return void 0;
    default:
      return void 0;
  }
}
var SVG_PATH_INFO = {
  heart: {
    path: HEART_PATH,
    // Dans Fabric: scaleX = minSize / 28, donc la taille de référence est 28
    // Le path est carré (28x28) pour le scaling
    width: 28,
    height: 28,
    centerX: 0,
    centerY: -0.5
    // (13 + -14) / 2 = -0.5
  },
  hexagon: {
    path: HEXAGON_PATH,
    // Dans Fabric: scaleX = minSize / 48, donc la taille de référence est 48
    width: 48,
    height: 48,
    centerX: 0,
    centerY: 0
  }
};
function getInlineSvgClip(shapeType, frameWidth, frameHeight, clipId) {
  const pathInfo = SVG_PATH_INFO[shapeType];
  if (!pathInfo) return void 0;
  const scaleX = frameWidth / pathInfo.width;
  const scaleY = frameHeight / pathInfo.height;
  const scaleFactor = Math.min(scaleX, scaleY);
  const frameCenterX = frameWidth / 2;
  const frameCenterY = frameHeight / 2;
  const transform = `translate(${frameCenterX}, ${frameCenterY}) scale(${scaleFactor}) translate(${-pathInfo.centerX}, ${-pathInfo.centerY})`;
  return `<svg width="${frameWidth}" height="${frameHeight}" style="position: absolute; top: 0; left: 0; pointer-events: none;">
  <defs>
    <clipPath id="${clipId}">
      <path d="${pathInfo.path}" transform="${transform}" />
    </clipPath>
  </defs>
</svg>`;
}

// src/html/converters/imageFrameConverter.ts
function imageFrameToHtml(layer, zIndex) {
  const {
    left = 0,
    top = 0,
    frameWidth,
    frameHeight,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    clipShape,
    image,
    layerId
  } = layer;
  const scaledWidth = frameWidth * scaleX;
  const scaledHeight = frameHeight * scaleY;
  const adjustedLeft = left - scaledWidth / 2;
  const adjustedTop = top - scaledHeight / 2;
  const containerStyles = buildPositionStyles(adjustedLeft, adjustedTop, zIndex);
  containerStyles.width = `${frameWidth}px`;
  containerStyles.height = `${frameHeight}px`;
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    containerStyles.transform = transform;
    containerStyles["transform-origin"] = "center center";
  }
  if (opacity !== 1) {
    containerStyles.opacity = String(opacity);
  }
  let inlineSvgClip = "";
  const clipId = `clip-${layerId || Math.random().toString(36).substr(2, 9)}`;
  let useOverflowHidden = true;
  const clipPathCss = getClipPathCss(clipShape, frameWidth, frameHeight);
  if (clipPathCss) {
    containerStyles["clip-path"] = clipPathCss;
    useOverflowHidden = false;
  } else if (clipShape === "heart" || clipShape === "hexagon") {
    inlineSvgClip = getInlineSvgClip(clipShape, frameWidth, frameHeight, clipId) || "";
    if (inlineSvgClip) {
      containerStyles["clip-path"] = `url(#${clipId})`;
      useOverflowHidden = false;
    }
  }
  if (useOverflowHidden) {
    containerStyles.overflow = "hidden";
  }
  const { offsetX = 0, offsetY = 0, scale: imageScale = 1 } = image;
  const imageStyles = {
    position: "absolute",
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    top: `${offsetY}px`,
    left: `${offsetX}px`
  };
  if (imageScale !== 1) {
    imageStyles.width = `${imageScale * 100}%`;
    imageStyles.height = `${imageScale * 100}%`;
    const offsetFromScale = (1 - imageScale) * 50;
    imageStyles.left = `calc(${offsetFromScale}% + ${offsetX}px)`;
    imageStyles.top = `calc(${offsetFromScale}% + ${offsetY}px)`;
  }
  const html = `<div style="${stylesToString(containerStyles)}">
  ${inlineSvgClip}
  <img src="${image.src}" style="${stylesToString(imageStyles)}" alt="" />
</div>`;
  return {
    html
    // Plus besoin de clipPathDefs globaux, on utilise des SVG inline
  };
}

// src/html/htmlRenderer.ts
function layerToHtml(layer, zIndex) {
  switch (layer.type) {
    case "IText":
      return textToHtml(layer, zIndex);
    case "Rect":
      return rectToHtml(layer, zIndex);
    case "Circle":
      return circleToHtml(layer, zIndex);
    case "Path":
      return pathToHtml(layer, zIndex);
    case "ImageFrame":
      return imageFrameToHtml(layer, zIndex);
    default:
      console.warn(`Unknown layer type: ${layer.type}`);
      return { html: `<!-- Unknown layer type: ${layer.type} -->` };
  }
}
function renderBackgroundImage(backgroundImage, width, height) {
  const styles = {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    "z-index": "0"
  };
  return `<img src="${backgroundImage}" style="${stylesToString(styles)}" alt="" />`;
}
function renderFontImports(fonts, includeGoogleFonts) {
  if (!includeGoogleFonts || fonts.size === 0) {
    return "";
  }
  const url = buildGoogleFontsUrl(Array.from(fonts));
  return `<link rel="stylesheet" href="${url}" />`;
}
function fabricToHtml(layers, options) {
  const {
    width,
    height,
    backgroundImage,
    containerClass = "",
    includeGoogleFonts = true
  } = options;
  const allFonts = /* @__PURE__ */ new Set();
  const htmlParts = [];
  layers.forEach((layer, index) => {
    const output = layerToHtml(layer, index + 1);
    htmlParts.push(output.html);
    output.fonts?.forEach((font) => {
      allFonts.add(font);
    });
  });
  const fontImports = renderFontImports(allFonts, includeGoogleFonts);
  const containerStyles = {
    position: "relative",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden"
  };
  const backgroundHtml = backgroundImage ? renderBackgroundImage(backgroundImage, width, height) : "";
  const classAttr = containerClass ? ` class="${containerClass}"` : "";
  return `${fontImports}
<div${classAttr} style="${stylesToString(containerStyles)}">
  ${backgroundHtml}
  ${htmlParts.join("\n  ")}
</div>`.trim();
}
function layerToHtmlStandalone(layer, zIndex) {
  return layerToHtml(layer, zIndex);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
  fabricToHtml,
  getAvailableShapes,
  getLockMode,
  getNextLockMode,
  isContentLocked,
  isPositionLocked,
  isStyleLocked,
  isValidShape,
  layerToHtmlStandalone,
  nextShape,
  removeCropControls,
  switchClip,
  switchShape
});
//# sourceMappingURL=index.js.map