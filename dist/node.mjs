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

// src/node.ts
import { createRequire } from "module";
import { StaticCanvas, FabricObject as FabricObject4 } from "#fabric";

// src/LayerManager.ts
import {
  FabricImage as FabricImage4,
  Group as Group3,
  util
} from "#fabric";

// src/controls/CustomTextbox.ts
import { Textbox, Point, controlsUtils } from "#fabric";

// src/layout/types.ts
var MIN_FONT_SIZE = 8;

// src/layout/text-box.ts
function resolveTextBox(input, measure) {
  const { sizing, overflow, constraint } = input;
  if (constraint === "as-stored") {
    const m2 = measure.wrapped(input.width, input.fontSize);
    return { width: m2.width, height: Math.max(m2.height, input.height), fontSize: input.fontSize, overflowing: false };
  }
  const maxW = constraint.maxW ?? Infinity;
  const width = constraint.w ?? (sizing.x === "hug" ? Math.min(measure.natural(input.fontSizeIntent), maxW) : Math.min(input.width, maxW));
  const boundH = constraint.h ?? (sizing.y === "fixed" ? input.height : void 0);
  let fontSize = input.fontSizeIntent;
  let m = measure.wrapped(width, fontSize);
  if (boundH != null && m.height > boundH + 0.5 && overflow === "shrink") {
    fontSize = largestFittingFont(width, boundH, input.fontSizeIntent, measure);
    m = measure.wrapped(width, fontSize);
  }
  const minH = sizing.y === "hug" ? sizing.minSize?.h ?? 0 : 0;
  const height = boundH ?? Math.max(m.height, minH);
  return { width: m.width, height, fontSize, overflowing: m.height > height + 0.5 };
}
function largestFittingFont(width, boundH, intent, measure) {
  let lo = Math.min(MIN_FONT_SIZE, intent);
  let hi = intent;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (measure.wrapped(width, mid).height <= boundH + 0.5) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}

// src/controls/CustomTextbox.ts
var { changeObjectWidth, changeObjectHeight } = controlsUtils;
var UNBOUNDED_WIDTH = 1e4;
var CustomTextbox = class extends Textbox {
  constructor(text, options) {
    super(text, options);
    if (typeof options?.fontSizeIntent === "number") this.fontSizeIntent = options.fontSizeIntent;
    this.fontSizeIntent ?? (this.fontSizeIntent = this.fontSize);
    this._bakeLegacyScale();
    this._ensureSizing(options?.width != null);
    this.initDimensions();
    this.setCoords();
  }
  // ── Sizing ─────────────────────────────────────────────────────────
  /**
   * Sans bloc `sizing` (le temps de la construction, avant _ensureSizing), la boîte
   * stockée fait foi : largeur fixe.
   */
  get sizing() {
    return this.get("layout")?.sizing ?? { x: "fixed", y: "hug" };
  }
  get textOverflow() {
    return this.get("layout")?.overflow ?? "shrink";
  }
  /** Remplace le bloc `sizing` (nouvel objet `layout`, jamais muté en place). */
  setSizing(sizing) {
    const layout = this.get("layout") ?? {};
    this.set("layout", { ...layout, sizing });
    this.initDimensions();
    this.setCoords();
  }
  setTextOverflow(overflow) {
    const layout = this.get("layout") ?? {};
    this.set("layout", { ...layout, overflow });
    this.initDimensions();
    this.setCoords();
  }
  /** Largeur naturelle à la police courante : la plus longue ligne, sans wrap. */
  naturalWidth() {
    this.width = UNBOUNDED_WIDTH;
    super.initDimensions();
    return Math.ceil(this.calcTextWidth());
  }
  /**
   * Largeur minimale du texte : son mot le plus long (le min-content de CSS). Le
   * découpage des mots trop longs (break-word) n'est qu'un repli, pas un minimum.
   */
  minContentWidth() {
    const { lines } = this._splitTextIntoLines(this.text);
    return Math.ceil(super.getGraphemeDataForRender(lines).largestWordWidth);
  }
  /**
   * Une passe de layout : calcule la boîte sous la contrainte du container et la
   * retient. `null` : le texte a quitté son container.
   */
  layoutWith(constraint) {
    if (constraint) this._constraint = constraint;
    else delete this._constraint;
    this.initDimensions();
  }
  /** Recalcul (Fabric, ou layoutWith) sous la contrainte courante. */
  initDimensions() {
    if (!this.initialized) {
      super.initDimensions();
      return;
    }
    if (!this._isChild()) this._applyBox({});
    else this._applyBox(this._constraint ?? "as-stored");
  }
  _applyBox(constraint) {
    const before = { width: this.width, height: this.height, fontSize: this.fontSize };
    const box = resolveTextBox({
      sizing: this.sizing,
      overflow: this.textOverflow,
      constraint,
      fontSizeIntent: this.fontSizeIntent ?? this.fontSize,
      fontSize: this.fontSize,
      width: this.width,
      height: this.height
    }, this._measure());
    this.fontSize = box.fontSize;
    this._wrapAt(box.width);
    this.height = box.height;
    this._overflowing = box.overflowing;
    if (before.width !== this.width || before.height !== this.height || before.fontSize !== this.fontSize) {
      this.dirty = true;
    }
    this.objectCaching = !(box.overflowing && this.textOverflow === "visible");
  }
  /**
   * Mesure via Fabric (mute l'objet ; _applyBox pose l'état final ensuite). Méthode et
   * non champ : Fabric mesure déjà pendant le super() du constructeur.
   */
  _measure() {
    return {
      wrapped: (width, fontSize) => {
        this.fontSize = fontSize;
        this._wrapAt(width);
        return { width: this.width, height: this.height };
      },
      natural: (fontSize) => {
        this.fontSize = fontSize;
        return this.naturalWidth();
      }
    };
  }
  /** Wrap à `width` puis mesure (la largeur peut grandir au mot le plus long). */
  _wrapAt(width) {
    this.width = width;
    super.initDimensions();
  }
  /** Toute nouvelle `fontSize` posée via set() est une intention de l'utilisateur. */
  _set(key, value) {
    if (key === "fontSize") this.fontSizeIntent = value;
    return super._set(key, value);
  }
  /** overflow "clip" : le texte est coupé au bord de sa boîte. */
  _render(ctx) {
    if (!this._overflowing || this.textOverflow !== "clip") {
      super._render(ctx);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.clip();
    super._render(ctx);
    ctx.restore();
  }
  // ── Poignées ───────────────────────────────────────────────────────
  /**
   * Bord gauche/droit : la largeur passe en fixe et prend la valeur tirée.
   * Bord haut/bas : en hauteur contenu, pose le plancher `minSize.h` ; en hauteur fixe,
   * change la hauteur.
   */
  handleEdgeResize(transform, x, y) {
    const corner = transform.corner;
    return corner === "ml" || corner === "mr" ? this._withAnchor(transform, () => this._resizeWidth(transform, x, y)) : this._withAnchor(transform, () => this._resizeHeight(transform, x, y));
  }
  /** Coin : les deux règles des bords à la fois. */
  handleCornerResize(transform, x, y) {
    return this._withAnchor(transform, () => {
      const changedW = this._resizeWidth(transform, x, y);
      const changedH = this._resizeHeight(transform, x, y);
      return changedW || changedH;
    });
  }
  _isChild() {
    return this.get("layout")?.child != null;
  }
  _withAnchor(transform, resize) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const changed = resize();
    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }
  _resizeWidth(transform, x, y) {
    if (this.sizing.x !== "fixed") {
      const layout = this.get("layout") ?? {};
      this.set("layout", { ...layout, sizing: { ...this.sizing, x: "fixed" } });
    }
    return changeObjectWidth({}, transform, x, y);
  }
  _resizeHeight(transform, x, y) {
    const before = this.height;
    if (!changeObjectHeight({}, transform, x, y)) return false;
    const sizing = this.sizing;
    if (sizing.y === "hug") {
      const minSize = { w: sizing.minSize?.w ?? 0, h: this.height };
      const layout = this.get("layout") ?? {};
      this.set("layout", { ...layout, sizing: { ...sizing, minSize } });
    }
    this.initDimensions();
    return before !== this.height;
  }
  // ── Données legacy ─────────────────────────────────────────────────
  /**
   * Un texte étiré (scaleX/scaleY) est ramené à scale 1 : le scale passe dans la
   * largeur et la police. Exact pour un scale uniforme ; un étirement non uniforme est
   * perdu (les glyphes reprennent leurs proportions).
   */
  _bakeLegacyScale() {
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    if (sx === 1 && sy === 1) return;
    this.width *= sx;
    this.height *= sy;
    this.fontSize *= sy;
    this.fontSizeIntent *= sy;
    for (const line of Object.values(this.styles ?? {})) {
      for (const style of Object.values(line)) {
        if (style.fontSize) style.fontSize *= sy;
      }
    }
    this.scaleX = 1;
    this.scaleY = 1;
  }
  /**
   * Un texte sans `layout.sizing` (nouveau, ou document d'avant les modes de taille)
   * reçoit un mode explicite :
   * - nouveau texte, ou enfant de container (sa largeur était dictée par le container) :
   *   largeur contenu ;
   * - sinon : largeur contenu si la boîte épouse le texte sur une ligne, fixe sinon
   *   (texte qui wrappe, ou boîte élargie pour un alignement).
   */
  _ensureSizing(hasExplicitWidth) {
    const layout = this.get("layout");
    if (layout?.sizing) return;
    let x = "hug";
    if (hasExplicitWidth && !layout?.child) {
      const width = this.width;
      const natural = this.naturalWidth();
      this.width = width;
      if (Math.abs(width - natural) > 2) x = "fixed";
    }
    this.set("layout", { ...layout ?? {}, sizing: { x, y: "hug" } });
  }
  /**
   * overflow-wrap: break-word — pré-découpe les mots trop longs
   * en chunks et les marque pour que _wrapLine ne mette pas
   * d'espace entre eux.
   */
  getGraphemeDataForRender(lines) {
    const data = super.getGraphemeDataForRender(lines);
    if (!this.width) return data;
    const maxWidth = this.width;
    let newLargest = 0;
    data.wordsData = data.wordsData.map(
      (lineWords, lineIndex) => lineWords.flatMap((entry) => {
        if (entry.width <= maxWidth) {
          newLargest = Math.max(newLargest, entry.width);
          return [entry];
        }
        const chunks = [];
        let chunk = [];
        let chunkWidth = 0;
        let offset = 0;
        for (const grapheme of entry.word) {
          const gWidth = this._measureWord([grapheme], lineIndex, offset);
          if (chunkWidth + gWidth > maxWidth && chunk.length > 0) {
            chunks.push({ word: chunk, width: chunkWidth, _isChunk: chunks.length > 0 });
            newLargest = Math.max(newLargest, chunkWidth);
            chunk = [];
            chunkWidth = 0;
          }
          chunk.push(grapheme);
          chunkWidth += gWidth;
          offset++;
        }
        if (chunk.length > 0) {
          chunks.push({ word: chunk, width: chunkWidth, _isChunk: chunks.length > 0 });
          newLargest = Math.max(newLargest, chunkWidth);
        }
        return chunks;
      })
    );
    data.largestWordWidth = newLargest;
    return data;
  }
  /**
   * Copie fidèle de Textbox._wrapLine, sauf :
   * - pas d'espace (infix) entre les chunks d'un même mot (_isChunk)
   * - pas d'incrément d'offset pour l'espace entre chunks
   */
  _wrapLine(lineIndex, desiredWidth, { largestWordWidth, wordsData }, reservedSpace = 0) {
    const additionalSpace = this._getWidthOfCharSpacing();
    const graphemeLines = [];
    let lineWidth = 0;
    let line = [];
    let offset = 0;
    let infixWidth = 0;
    let lineJustStarted = true;
    desiredWidth -= reservedSpace;
    const maxWidth = Math.max(desiredWidth, largestWordWidth, this.dynamicMinWidth);
    const data = wordsData[lineIndex];
    offset = 0;
    let i;
    for (i = 0; i < data.length; i++) {
      const entry = data[i];
      const { word, width: wordWidth } = entry;
      const isChunk = !!entry._isChunk;
      offset += word.length;
      lineWidth += (isChunk ? 0 : infixWidth) + wordWidth - additionalSpace;
      if (lineWidth > maxWidth && !lineJustStarted) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
      } else {
        lineWidth += additionalSpace;
      }
      if (!lineJustStarted && !isChunk) {
        line.push(" ");
      }
      line = line.concat(word);
      if (isChunk) {
        infixWidth = 0;
      } else {
        infixWidth = this._measureWord([" "], lineIndex, offset);
        offset++;
      }
      lineJustStarted = false;
    }
    i && graphemeLines.push(line);
    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    }
    return graphemeLines;
  }
  /**
   * Fix curseur : missingNewlineOffset retourne toujours 1 en mode
   * non-splitByGrapheme car Fabric suppose que chaque wrap mange un
   * espace. Pour les coupures mid-word, il n'y a pas d'espace → 0.
   */
  missingNewlineOffset(lineIndex, skipWrapping) {
    if (skipWrapping) return 1;
    if (!this._styleMap[lineIndex + 1]) return 1;
    if (this._styleMap[lineIndex + 1].line !== this._styleMap[lineIndex].line) {
      return 1;
    }
    const currentOffset = this._styleMap[lineIndex].offset;
    const currentLen = this._textLines[lineIndex].length;
    const nextOffset = this._styleMap[lineIndex + 1].offset;
    if (nextOffset === currentOffset + currentLen) {
      return 0;
    }
    return 1;
  }
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
CustomTextbox.customProperties = ["fontSizeIntent"];

// src/layout/legacy.ts
function migrateLegacyLayout(layout) {
  const legacy = layout?.container;
  if (!layout || !legacy) return null;
  if (!("sizeMode" in legacy) && !("minSize" in legacy) && !("overflow" in legacy)) return null;
  const { sizeMode, minSize, overflow: _overflow, ...container } = legacy;
  const sizing = layout.sizing ?? {
    x: sizeMode?.x ?? "hug",
    y: sizeMode?.y ?? "hug",
    ...minSize ? { minSize } : {}
  };
  return { ...layout, sizing, container };
}

// src/layout/stacking.ts
function parentIdOf(obj) {
  return obj.get("layout")?.child?.parentId;
}
function stackBlock(objects, root) {
  const ids = /* @__PURE__ */ new Set([root.get("layerId")]);
  const block = [];
  for (const obj of objects) {
    if (obj === root) block.push(obj);
    else if (ids.has(parentIdOf(obj))) {
      block.push(obj);
      ids.add(obj.get("layerId"));
    }
  }
  return block;
}
function siblingsOf(objects, obj) {
  const parentId = parentIdOf(obj);
  return objects.filter((o) => parentIdOf(o) === parentId);
}
function placeAbove(objects, root, above) {
  const block = stackBlock(objects, root);
  const rest = objects.filter((o) => !block.includes(o));
  const anchor = stackBlock(rest, above);
  const at = rest.indexOf(anchor[anchor.length - 1]) + 1;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
function placeBelow(objects, root, below) {
  const block = stackBlock(objects, root);
  const rest = objects.filter((o) => !block.includes(o));
  const at = rest.indexOf(below);
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
function bringBlockForward(objects, obj, overlaps) {
  const siblings = siblingsOf(objects, obj);
  const next = siblings.slice(siblings.indexOf(obj) + 1).find((s) => overlaps(obj, s));
  return next ? placeAbove(objects, obj, next) : null;
}
function sendBlockBackward(objects, obj) {
  const siblings = siblingsOf(objects, obj);
  const prev = siblings[siblings.indexOf(obj) - 1];
  if (!prev || prev === objects[0]) return null;
  return placeBelow(objects, obj, prev);
}

// src/shapes/factories.ts
import {
  FabricImage as FabricImage2,
  Group
} from "#fabric";

// src/shapes/registry.ts
var registry = [];
function registeredShapes() {
  return registry;
}
function getCatalogShape(id) {
  return registry.find((s) => s.id === id);
}
function isMonoPath(shape) {
  return shape.paths.length === 1;
}
function clipDataFor(id) {
  const shape = getCatalogShape(id);
  if (!shape || !isMonoPath(shape)) return void 0;
  return { d: shape.paths[0].d, width: shape.width, height: shape.height };
}

// src/controls/cropControls.ts
import {
  Control
} from "#fabric";
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

// src/shapes/FabRect.ts
import { Rect, classRegistry, controlsUtils as controlsUtils2 } from "#fabric";

// src/shapes/lockMixin.ts
var LOCK_MODES = ["free", "position", "full"];
function installLockMethods(proto) {
  proto.applyLockMode = function(mode) {
    this.lockMode = mode;
    const lockPosition = mode === "position" || mode === "full";
    this.lockMovementX = lockPosition;
    this.lockMovementY = lockPosition;
    this.lockRotation = lockPosition;
    this.lockScalingX = lockPosition;
    this.lockScalingY = lockPosition;
    this.hasControls = mode === "free";
    this.lockContent = mode === "full";
  };
  proto.getLockMode = function() {
    return this.lockMode || "free";
  };
  proto.getNextLockMode = function() {
    const currentIndex = LOCK_MODES.indexOf(this.getLockMode());
    return LOCK_MODES[(currentIndex + 1) % LOCK_MODES.length];
  };
  proto.isPositionLocked = function() {
    const mode = this.getLockMode();
    return mode === "position" || mode === "full";
  };
  proto.isStyleLocked = function() {
    const mode = this.getLockMode();
    return mode === "position" || mode === "full";
  };
  proto.isContentLocked = function() {
    return this.lockContent === true;
  };
}

// src/shapes/FabRect.ts
var { changeObjectWidth: changeObjectWidth2, changeObjectHeight: changeObjectHeight2 } = controlsUtils2;
var FabRect = class extends Rect {
  constructor(options) {
    super({
      originX: "center",
      originY: "center",
      ...options
    });
    this.set("id", "rect");
  }
  setCornerRadius(radius) {
    const maxRadius = Math.min(this.width, this.height) / 2;
    const r = Math.max(0, Math.min(radius, maxRadius));
    this.set({ rx: r, ry: r });
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }
  getCornerRadius() {
    return this.rx ?? 0;
  }
  /** Corner resize: free resize on both axes (no ratio lock). */
  handleCornerResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const changedW = changeObjectWidth2({}, transform, x, y);
    const changedH = changeObjectHeight2({}, transform, x, y);
    this.setPositionByOrigin(anchor, originX, originY);
    return changedW || changedH;
  }
  /** Edge resize: single-axis width or height change. */
  handleEdgeResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const corner = transform.corner;
    const changed = corner === "ml" || corner === "mr" ? changeObjectWidth2({}, transform, x, y) : changeObjectHeight2({}, transform, x, y);
    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }
  setSize(w, h) {
    this.set({ width: w, height: h });
  }
};
FabRect.type = "Rect";
FabRect.customProperties = ["layerId", "layerType", "lockMode", "lockContent"];
installLockMethods(FabRect.prototype);
classRegistry.setClass(FabRect, "Rect");

// src/shapes/FabCircle.ts
import { Circle, classRegistry as classRegistry2, controlsUtils as controlsUtils3 } from "#fabric";

// src/shapes/resizeUtils.ts
function isTransformCentered(transform) {
  return transform.originX === "center" && transform.originY === "center";
}

// src/shapes/FabCircle.ts
var { changeObjectWidth: changeObjectWidth3, changeObjectHeight: changeObjectHeight3, getLocalPoint } = controlsUtils3;
var FabCircle = class extends Circle {
  constructor(options) {
    super({
      originX: "center",
      originY: "center",
      ...options
    });
    this.set("id", "circle");
    const size = Math.min(this.width, this.height);
    this.radius = size / 2;
    this.width = size;
    this.height = size;
    this._naturalSize = size;
  }
  /** Corner resize: uniform scaling (aspect ratio locked). */
  handleCornerResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const localPoint = getLocalPoint(transform, originX, originY, x, y);
    const dim = this._getTransformedDimensions();
    const distance = Math.abs(localPoint.x) + Math.abs(localPoint.y);
    const originalDistance = Math.abs(dim.x * transform.original.scaleX / this.scaleX) + Math.abs(dim.y * transform.original.scaleY / this.scaleY);
    if (originalDistance === 0) return false;
    let scale = distance / originalDistance;
    if (isTransformCentered(transform)) scale *= 2;
    const oldScaleX = this.scaleX;
    const oldScaleY = this.scaleY;
    this.set("scaleX", transform.original.scaleX * scale);
    this.set("scaleY", transform.original.scaleY * scale);
    this.setPositionByOrigin(anchor, originX, originY);
    return oldScaleX !== this.scaleX || oldScaleY !== this.scaleY;
  }
  /** Edge resize: single-axis stretch, absorbed into scale. */
  handleEdgeResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const corner = transform.corner;
    const changed = corner === "ml" || corner === "mr" ? changeObjectWidth3({}, transform, x, y) : changeObjectHeight3({}, transform, x, y);
    this.scaleX *= this.width / this._naturalSize;
    this.scaleY *= this.height / this._naturalSize;
    this.width = this._naturalSize;
    this.height = this._naturalSize;
    this.radius = this._naturalSize / 2;
    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }
  setSize(w, h) {
    this.set({
      scaleX: w / this._naturalSize,
      scaleY: h / this._naturalSize
    });
  }
};
FabCircle.type = "Circle";
FabCircle.customProperties = ["layerId", "layerType", "lockMode", "lockContent"];
installLockMethods(FabCircle.prototype);
classRegistry2.setClass(FabCircle, "Circle");

// src/shapes/FabPath.ts
import { Path, classRegistry as classRegistry3, controlsUtils as controlsUtils4 } from "#fabric";
var { changeObjectWidth: changeObjectWidth4, changeObjectHeight: changeObjectHeight4, getLocalPoint: getLocalPoint2 } = controlsUtils4;
var DEFAULT_SIZE = 300;
var _FabPath = class _FabPath extends Path {
  constructor(path, options) {
    super(path, {
      originX: "center",
      originY: "center",
      ...options
    });
    this._naturalW = this.width;
    this._naturalH = this.height;
  }
  /** Corner resize: uniform scaling (aspect ratio locked). */
  handleCornerResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const localPoint = getLocalPoint2(transform, originX, originY, x, y);
    const dim = this._getTransformedDimensions();
    const distance = Math.abs(localPoint.x) + Math.abs(localPoint.y);
    const originalDistance = Math.abs(dim.x * transform.original.scaleX / this.scaleX) + Math.abs(dim.y * transform.original.scaleY / this.scaleY);
    if (originalDistance === 0) return false;
    let scale = distance / originalDistance;
    if (isTransformCentered(transform)) scale *= 2;
    const oldScaleX = this.scaleX;
    const oldScaleY = this.scaleY;
    this.set("scaleX", transform.original.scaleX * scale);
    this.set("scaleY", transform.original.scaleY * scale);
    this.setPositionByOrigin(anchor, originX, originY);
    return oldScaleX !== this.scaleX || oldScaleY !== this.scaleY;
  }
  /** Edge resize: single-axis stretch, absorbed into scale. */
  handleEdgeResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const corner = transform.corner;
    const changed = corner === "ml" || corner === "mr" ? changeObjectWidth4({}, transform, x, y) : changeObjectHeight4({}, transform, x, y);
    this.scaleX *= this.width / this._naturalW;
    this.scaleY *= this.height / this._naturalH;
    this.width = this._naturalW;
    this.height = this._naturalH;
    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }
  setSize(w, h) {
    this.set({ scaleX: w / this._naturalW, scaleY: h / this._naturalH });
  }
  /**
   * Create a FabPath from raw path data (normalized `d` + optional authored fill).
   * The authored fill wins over options.fill: callers pass their GENERIC default
   * there (LayerManager's "#ffffff") — a colorless path takes it, an authored one
   * keeps its charte color. Recoloring happens on the object afterwards, never here.
   *
   * Dimension logic:
   * - Both width & height: scale to fill both
   * - Only width: scale height proportionally
   * - Only height: scale width proportionally
   * - Neither: longest axis = 300px
   */
  static fromPathData(pathData, options) {
    const fill = pathData.fill ?? (pathData.stroke ? "" : options?.fill);
    const stroke = pathData.stroke ?? options?.stroke;
    const strokeWidth = pathData.strokeWidth ?? options?.strokeWidth;
    const path = new _FabPath(pathData.d, {
      ...options,
      ...fill != null ? { fill } : {},
      ...stroke != null ? { stroke } : {},
      ...strokeWidth != null ? { strokeWidth } : {}
    });
    path.fitTo(options?.width, options?.height);
    return path;
  }
  /** Scale to the requested box (see fromPathData) — natural dims stay untouched. */
  fitTo(width, height) {
    const ratio = this._naturalW / this._naturalH;
    let targetW;
    let targetH;
    if (width != null && height != null) {
      targetW = width;
      targetH = height;
    } else if (width != null) {
      targetW = width;
      targetH = targetW / ratio;
    } else if (height != null) {
      targetH = height;
      targetW = targetH * ratio;
    } else {
      const scale = DEFAULT_SIZE / Math.max(this._naturalW, this._naturalH);
      targetW = this._naturalW * scale;
      targetH = this._naturalH * scale;
    }
    this.scaleX = targetW / this._naturalW;
    this.scaleY = targetH / this._naturalH;
  }
  /**
   * Create a FabPath from the injected shape registry (mono-path entries only —
   * multi-path artwork goes through createPathsShape, and is never a clip).
   */
  static createFromCatalog(shapeId, options) {
    const shape = getCatalogShape(shapeId);
    if (!shape) {
      throw new Error(
        `Unknown path shape: "${shapeId}". Did the host app call registerShapes()?`
      );
    }
    if (shape.paths.length !== 1) {
      throw new Error(`Shape "${shapeId}" is multi-path artwork \u2014 not usable as a single path.`);
    }
    return _FabPath.fromPathData(shape.paths[0], { id: shapeId, ...options });
  }
};
_FabPath.type = "Path";
_FabPath.customProperties = ["layerId", "layerType", "lockMode", "lockContent"];
var FabPath = _FabPath;
installLockMethods(FabPath.prototype);
classRegistry3.setClass(FabPath, "Path");

// src/shapes/factories.ts
function createRect(options) {
  return new FabRect(options);
}
function createCircle(options) {
  return new FabCircle(options);
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
var DEFAULT_SIZE2 = 300;
function createPathsShape(paths, options = {}) {
  if (paths.length === 0) throw new Error("createPathsShape: empty paths");
  const { fill, stroke, left, top, id } = options;
  const strokeWidth = options.strokeWidth ?? (stroke ? 4 : 0);
  if (paths.length === 1) {
    return FabPath.fromPathData(paths[0], withoutUndefined({
      id,
      fill,
      stroke,
      strokeWidth,
      left,
      top,
      width: options.width,
      height: options.height
    }));
  }
  const children = paths.map((p) => {
    const child = new FabPath(p.d, withoutUndefined({
      fill: p.fill ?? (p.stroke ? "" : fill),
      stroke: p.stroke ?? stroke,
      strokeWidth: p.strokeWidth ?? strokeWidth
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
function withoutUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== void 0));
}
function targetDims(naturalW, naturalH, width, height) {
  const ratio = naturalW / naturalH;
  if (width != null && height != null) return { width, height };
  if (width != null) return { width, height: width / ratio };
  if (height != null) return { width: height * ratio, height };
  const scale = DEFAULT_SIZE2 / Math.max(naturalW, naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}
function createShape(shapeType, options = {}) {
  const { fill, stroke, left, top } = options;
  const strokeWidth = stroke ? 4 : 0;
  const w = options.width ?? DEFAULT_SIZE2;
  const h = options.height ?? DEFAULT_SIZE2;
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
          id: shapeType,
          fill,
          stroke,
          left,
          top,
          height: options.height,
          width: options.width,
          strokeWidth
        });
      }
      return createRect({ fill, stroke, left, top, height: h, width: w, strokeWidth });
    }
  }
}
function getShapeCatalog() {
  return [
    { id: "rect", path: "M0 0H100V100H0Z", viewBox: "0 0 100 100" },
    { id: "circle", path: "M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z", viewBox: "0 0 100 100" },
    ...registeredShapes().filter(isMonoPath).map((s) => ({ id: s.id, path: s.paths[0].d, viewBox: "0 0 100 100" }))
  ];
}

// src/shapes/shapeWheel.ts
function shapeIds() {
  return getShapeCatalog().map((s) => s.id);
}
function isValidShape(id) {
  return shapeIds().includes(id);
}

// src/layout/geometry.ts
function scaledSize(obj) {
  return {
    w: obj.width * (obj.scaleX || 1),
    h: obj.height * (obj.scaleY || 1)
  };
}

// src/locking.ts
function getLockMode(obj) {
  return obj.lockMode || "free";
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

// src/ImageFrame.ts
import {
  Group as Group2,
  FabricImage as FabricImage3,
  classRegistry as classRegistry4,
  LayoutManager,
  FixedLayout
} from "#fabric";
function rotatePoint(dx, dy, angleDeg) {
  const angle = -angleDeg * Math.PI / 180;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle)
  };
}
var ImageFrame = class _ImageFrame extends Group2 {
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
    /** Corner radius in pixels for "rect" clip shape. 0 = sharp corners. */
    this.cornerRadius = 0;
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
    this.cornerRadius = options.cornerRadius ?? 0;
    this.clipData = options.clipData;
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
  /** Taille visuelle (contrat des formes, utilisé par le layout) : le frame, image en cover. */
  setSize(w, h) {
    this.set({ scaleX: 1, scaleY: 1 });
    this.resizeFrame(w, h);
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
    const shapes = getShapeCatalog().map((s) => s.id);
    const currentIndex = this.clipShape ? shapes.indexOf(this.clipShape) : -1;
    this.applyClipShape(shapes[(currentIndex + 1) % shapes.length]);
  }
  /**
   * Set the corner radius (in pixels) for the "rect" clip shape.
   * Automatically switches to "rect" if another clip shape is active.
   */
  setCornerRadius(radius) {
    this.cornerRadius = Math.max(0, radius);
    if (this.clipShape !== "rect") {
      this.clipShape = "rect";
    }
    this._applyClip("rect");
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }
  getCornerRadius() {
    return this.cornerRadius;
  }
  /**
   * Contour (capacité de forme) : un Group ne dessine pas de trait — on trace la forme
   * de découpe par-dessus, hors clip, trait centré sur le bord comme pour une forme.
   */
  render(ctx) {
    super.render(ctx);
    const outline = this.clipPath;
    if (!this.visible || !outline || !this.stroke || !this.strokeWidth) return;
    const saved = { fill: outline.fill, stroke: outline.stroke, strokeWidth: outline.strokeWidth };
    ctx.save();
    this.transform(ctx);
    outline.set({ fill: "transparent", stroke: this.stroke, strokeWidth: this.strokeWidth });
    outline.render(ctx);
    outline.set(saved);
    ctx.restore();
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
        this.clipData = void 0;
        this.clipPath = this._rectClip(minSize);
        break;
      case "circle":
        this.clipData = void 0;
        this.clipPath = createCircle({ radius: minSize / 2 });
        break;
      default: {
        this.clipData = clipDataFor(shapeType) ?? this.clipData;
        if (this.clipData) {
          this.clipPath = FabPath.fromPathData(this.clipData, {
            width: this.frameWidth,
            height: this.frameHeight,
            left: 0,
            top: 0
          });
        } else {
          console.warn(`[ImageFrame] clip "${shapeType}" inconnu (registre non inject\xE9 ?) \u2014 affichage rect`);
          this.clipPath = this._rectClip(minSize);
        }
        break;
      }
    }
  }
  _rectClip(minSize) {
    const r = Math.min(this.cornerRadius, minSize / 2);
    return createRect({
      width: this.frameWidth,
      height: this.frameHeight,
      rx: r,
      ry: r,
      left: 0,
      top: 0
    });
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
        const anchorX = changeX === 1 ? "left" : changeX === -1 ? "right" : "center";
        const anchorY = changeY === 1 ? "top" : changeY === -1 ? "bottom" : "center";
        if (transform._startWidth === void 0) {
          const center = target.getCenterPoint();
          transform._startWidth = target.frameWidth;
          transform._startHeight = target.frameHeight;
          transform._startPointerX = pointer.x;
          transform._startPointerY = pointer.y;
          transform._startLeft = center.x;
          transform._startTop = center.y;
          transform._anchor = target.getPositionByOrigin(anchorX, anchorY);
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
        target.resizeFrame(newWidth, newHeight);
        target.setPositionByOrigin(transform._anchor, anchorX, anchorY);
        target.setCoords();
        target.fire("resizing");
        canvas.fire?.("object:resizing", { target, e: eventData, transform, pointer });
        canvas.requestRenderAll();
        return true;
      };
    };
    ["tl", "tr", "bl", "br"].forEach((key) => {
      if (this.controls[key]) {
        const x = key.includes("l") ? -1 : 1;
        const y = key.includes("t") ? -1 : 1;
        this.controls[key].actionHandler = resizeHandler(x, y);
        this.controls[key].actionName = "resizing";
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
        this.controls[key].actionName = "resizing";
      }
    });
  }
  // ─────────────────────────────────────────────────────────────
  // Sérialisation
  // ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toObject(propertiesToInclude) {
    const base = super.toObject(propertiesToInclude);
    const extras = {};
    (propertiesToInclude || []).forEach((key) => {
      if (base[key] !== void 0) extras[key] = base[key];
    });
    if (this.selectable === false) extras.selectable = false;
    if (this.evented === false) extras.evented = false;
    return {
      ...extras,
      type: "ImageFrame",
      left: this.left,
      top: this.top,
      originX: this.originX,
      originY: this.originY,
      angle: this.angle,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      clipShape: this.clipShape,
      clipData: this.clipData,
      cornerRadius: this.cornerRadius || void 0,
      layerId: base.layerId,
      lockMode: base.lockMode,
      lockContent: base.lockContent,
      opacity: this.opacity,
      stroke: this.stroke || void 0,
      strokeWidth: this.stroke ? this.strokeWidth : void 0,
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
    if (data.layout) frame.set("layout", data.layout);
    if (data.originX) frame.set({ originX: data.originX, originY: data.originY ?? data.originX });
    if (data.stroke) frame.set({ stroke: data.stroke, strokeWidth: data.strokeWidth ?? 4 });
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
    if (data.clipData) frame.clipData = data.clipData;
    let clipShape = data.clipShape;
    if (clipShape === "rounded") {
      frame.cornerRadius = data.cornerRadius ?? Math.min(data.frameWidth, data.frameHeight) * 0.15;
      clipShape = "rect";
    } else {
      frame.cornerRadius = data.cornerRadius ?? 0;
    }
    if (clipShape) {
      frame.applyClipShape(clipShape);
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
classRegistry4.setClass(ImageFrame);
classRegistry4.setClass(ImageFrame, "ImageFrame");

// src/bindings.ts
function pendingBindings(obj) {
  const bindings = obj.get("bindings") || {};
  return Object.fromEntries(Object.entries(bindings).filter(([, spec]) => spec?.resolved !== true));
}
function restoreBindings(obj, data) {
  if (!data.bindings) return;
  obj.set("bindings", data.bindings);
  lockBoundText(obj);
}
function lockBoundText(obj) {
  if (pendingBindings(obj)["text"] && "editable" in obj) {
    obj.editable = false;
  }
}

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
    const img = await FabricImage4.fromURL(url, { crossOrigin: "anonymous" });
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
   * Désérialise plusieurs calques sans les ajouter au canvas — la moitié asynchrone
   * (chargement d'images compris) du chargement, pour que l'appelant puisse faire le swap
   * ancien/nouveau contenu de façon synchrone (anti-flicker).
   */
  async deserializeAll(layers) {
    const objects = await Promise.all(layers.map((l) => this.deserialize(l)));
    objects.forEach((obj, i) => {
      if (!obj) return;
      const data = layers[i];
      const isBackground = data.layerId === "bg";
      if (isBackground || data.selectable === false) obj.selectable = false;
      if (isBackground || data.evented === false) obj.evented = false;
      restoreBindings(obj, data);
    });
    return objects;
  }
  /**
   * Charge plusieurs calques depuis leurs données JSON
   */
  async loadLayers(layers) {
    const objects = await this.deserializeAll(layers);
    objects.forEach((obj) => obj && this.add(obj));
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
   * Monte l'objet devant le premier objet de même niveau qui le chevauche. Un
   * container emmène ses descendants (toujours au-dessus de lui) ; un enfant reste
   * parmi les enfants de son container.
   */
  bringForward(obj) {
    const order = bringBlockForward(this.canvas.getObjects(), obj, (a, b) => a.isOverlapping(b));
    if (order) this.applyStackOrder(order);
  }
  /**
   * Descend l'objet d'un niveau, mêmes règles de blocs que bringForward. Ne peut pas
   * descendre en dessous de l'image de fond.
   */
  sendBackward(obj) {
    const order = sendBlockBackward(this.canvas.getObjects(), obj);
    if (order) this.applyStackOrder(order);
  }
  applyStackOrder(order) {
    order.forEach((obj, index) => this.canvas.moveObjectTo(obj, index));
    this.canvas.renderAll();
  }
  /**
   * Crée et ajoute un calque texte
   */
  /**
   * Crée un calque texte sans l'ajouter au canvas.
   * Source unique des défauts texte — utilisé par addText et par le
   * drag externe (DropHandler).
   */
  createText(options = {}) {
    const {
      text = "Tapez votre texte ici",
      left = 100,
      top = 100,
      fontFamily = "Inter",
      fontSize = 32,
      fontWeight = "normal",
      fill = "#000000",
      layerId = this.generateId()
    } = options;
    const textObj = new CustomTextbox(text, {
      left,
      top,
      fontFamily,
      fontSize,
      fontWeight,
      fill
    });
    textObj.set("layerId", layerId);
    return textObj;
  }
  addText(options = {}) {
    const textObj = this.createText(options);
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
    const index = this.canvas.getObjects().indexOf(target);
    this.canvas.remove(target);
    this.canvas.add(newImg);
    if (index >= 0 && index < this.canvas.getObjects().length) {
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
    const { clipShape, clipData, cornerRadius } = clipOfShape(shape);
    const { w: displayedWidth, h: displayedHeight } = scaledSize(shape);
    const center = shape.getRelativeCenterPoint();
    const zIndex = this.canvas.getObjects().indexOf(shape);
    const img = await FabricImage4.fromURL(imageUrl, { crossOrigin: "anonymous" });
    const frame = new ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: shape.angle,
      layerId: shape.layerId || this.generateId(),
      clipShape,
      clipData,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight,
      cornerRadius
    });
    const layout = shape.get("layout");
    if (layout) frame.set("layout", JSON.parse(JSON.stringify(layout)));
    const lockMode = getLockMode(shape);
    if (lockMode !== "free") applyLockMode(frame, lockMode);
    const bindings = shape.get("bindings");
    if (bindings) frame.set("bindings", bindings);
    this.canvas.remove(shape);
    this.canvas.add(frame);
    if (zIndex >= 0 && zIndex < this.canvas.getObjects().length) {
      this.canvas.moveObjectTo(frame, zIndex);
    }
    this.canvas.setActiveObject(frame);
    this.canvas.renderAll();
    return frame;
  }
  /**
   * Crée et ajoute un calque forme (rectangle par défaut)
   */
  /**
   * Crée un calque forme sans l'ajouter au canvas.
   * Source unique des défauts forme — utilisé par addShape et par le
   * drag externe (DropHandler).
   */
  createShape(options = {}) {
    const {
      left = 100,
      top = 100,
      fill = "#ffffff",
      stroke,
      shapeType = "rect",
      layerId = this.generateId()
    } = options;
    const common = { fill, stroke, left, top, width: options.width, height: options.height };
    const shape = options.paths?.length ? createPathsShape(options.paths, { id: shapeType, ...common }) : createShape(shapeType, common);
    shape.set({ layerId, layerType: "shape" });
    return shape;
  }
  addShape(options = {}) {
    const shape = this.createShape(options);
    this.add(shape);
    return shape;
  }
  /**
   * Groupe plusieurs objets ensemble
   */
  groupObjects(objects) {
    const group = new Group3(objects);
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
    return this.all.map((obj) => obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"]));
  }
  /**
   * Désérialise un calque depuis ses données JSON
   * Les images legacy (type "Image") sont automatiquement migrées vers ImageFrame
   */
  async deserialize(layer) {
    let obj = null;
    switch (layer.type) {
      case "IText":
      case "i-text":
      case "Textbox":
      case "textbox": {
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
        obj = await Group3.fromObject(layer);
        break;
      case "Rect":
      case "rect":
        obj = await FabRect.fromObject(layer);
        break;
      case "Path":
      case "path":
        obj = await FabPath.fromObject(layer);
        break;
      case "Circle":
      case "circle":
        obj = await FabCircle.fromObject(layer);
        break;
      default:
        console.warn(`Type de calque inconnu: ${layer.type}`);
        return null;
    }
    const migrated = obj && migrateLegacyLayout(obj.get("layout"));
    if (obj && migrated) obj.set("layout", migrated);
    if (obj && layer.lockMode) {
      const mode = layer.lockMode;
      if ("applyLockMode" in obj && typeof obj.applyLockMode === "function") {
        obj.applyLockMode(mode);
      } else {
        applyLockMode(obj, mode);
      }
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
    if (clipPath.id && isValidShape(clipPath.id)) {
      return clipPath.id;
    }
    const type = clipPath.type?.toLowerCase();
    if (type === "circle") {
      return "circle";
    }
    if (type === "rect") {
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
function clipOfShape(shape) {
  if (shape instanceof FabRect) return { clipShape: "rect", cornerRadius: shape.getCornerRadius() };
  if (shape instanceof FabCircle) return { clipShape: "circle", cornerRadius: 0 };
  if (shape instanceof FabPath) {
    const id = shape.id;
    const clipData = { d: util.joinPath(shape.path), width: shape.width, height: shape.height };
    return { clipShape: id && isValidShape(id) ? id : id || "custom", clipData, cornerRadius: 0 };
  }
  return { clipShape: "rect", cornerRadius: 0 };
}

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

// src/layout/yoga-engine.ts
var yoga = null;
var yogaConfig = null;
async function initYoga() {
  if (yoga) return;
  const { loadYoga } = await import("yoga-layout/load");
  yoga = await loadYoga();
  yogaConfig = yoga.Config.create();
  yogaConfig.setPointScaleFactor(0);
}

// src/node.ts
var require2 = createRequire(import.meta.url);
var _NodeEditor = class _NodeEditor {
  constructor(config) {
    this.config = config;
    this.canvas = new StaticCanvas(void 0, {
      width: config.width,
      height: config.height
    });
    this.layers = new LayerManager(this.canvas);
    this.persistence = new PersistenceManager(
      this.canvas,
      this.layers
    );
    this.history = new HistoryManager(
      this.canvas,
      this.layers
    );
    this.extendFabricObject();
  }
  /**
   * Initialise l'éditeur avec une image de fond et des calques optionnels
   */
  async initialize(backgroundImageUrl, layers = []) {
    await initYoga();
    await this.layers.loadBackgroundImage(backgroundImageUrl);
    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }
    this.canvas.renderAll();
    this.history.initialize();
  }
  /**
   * Exporte le canvas en PNG (data URL)
   */
  toDataURL(options) {
    return this.canvas.toDataURL({
      format: options?.format ?? "png",
      quality: options?.quality ?? 1,
      multiplier: options?.multiplier ?? 1
    });
  }
  /**
   * Exporte le canvas en Buffer PNG
   * Utile pour sauvegarder directement dans un fichier
   */
  toBuffer() {
    const nodeCanvas = this.canvas.lowerCanvasEl;
    if (nodeCanvas && typeof nodeCanvas.toBuffer === "function") {
      return nodeCanvas.toBuffer("image/png");
    }
    const dataUrl = this.toDataURL();
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64, "base64");
  }
  /**
   * Nettoie les ressources
   */
  dispose() {
    this.canvas.dispose();
  }
  extendFabricObject() {
    if (_NodeEditor._toObjectExtended) return;
    _NodeEditor._toObjectExtended = true;
    const originalToObject = FabricObject4.prototype.toObject;
    FabricObject4.prototype.toObject = function(propertiesToInclude) {
      return originalToObject.call(
        this,
        ["layerId"].concat(propertiesToInclude || [])
      );
    };
  }
};
/**
 * Étend FabricObject pour inclure layerId dans la sérialisation
 */
_NodeEditor._toObjectExtended = false;
var NodeEditor = _NodeEditor;
function registerFonts(fonts) {
  try {
    const { registerFont } = require2("canvas");
    for (const font of fonts) {
      registerFont(font.path, {
        family: font.family,
        weight: font.weight,
        style: font.style
      });
    }
  } catch {
    throw new Error(
      "Le package 'canvas' est requis pour utiliser les polices en Node.js. Installez-le avec: npm install canvas"
    );
  }
}
function createNodeEditor(config) {
  return new NodeEditor(config);
}
export {
  HistoryManager,
  ImageFrame,
  LayerManager,
  NodeEditor,
  PersistenceManager,
  createNodeEditor,
  registerFonts
};
//# sourceMappingURL=node.mjs.map