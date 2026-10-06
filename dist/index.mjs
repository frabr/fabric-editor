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
import { FabricObject as FabricObject8, FabricImage as FabricImage7, Point as Point5, Gradient, Shadow } from "#fabric";

// src/DesignCanvas.ts
import { Canvas, Point } from "#fabric";
var DesignCanvas = class {
  constructor(canvasElement, opts) {
    this._scale = 1;
    this._frame = { left: 0, top: 0, width: 0, height: 0 };
    this._workspace = null;
    this._pan = { x: 0, y: 0 };
    this._lastFit = { containerW: 0, containerH: 0, userZoom: 1 };
    this._checker = null;
    const { width, height, ...canvasOpts } = opts;
    this._width = width;
    this._height = height;
    this.originalFabricCanvas = new Canvas(canvasElement, {
      width,
      height,
      ...canvasOpts
    });
  }
  /** Dimensions logiques de l'espace design (mutables : le format se décide, cf. resizeDesign). */
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  /**
   * Redimensionne l'espace design : le contenu reste en place, seul le cadre change —
   * l'appelant refait un fitToSize pour recalculer l'affichage.
   */
  resizeDesign(width, height) {
    this._width = width;
    this._height = height;
  }
  /** Current viewport scale factor (set by fitToSize). */
  get scale() {
    return this._scale;
  }
  /** Le cadre du document à l'écran (px CSS, relatifs à l'élément canvas). */
  get frameRect() {
    return { ...this._frame };
  }
  get isWorkspace() {
    return this._workspace !== null;
  }
  /**
   * Passe en plan de travail : le rendu peint le fond du plan de travail sous les objets,
   * puis le voile et le liseré par-dessus. L'intérieur du cadre reste transparent (sauf
   * couleur de fond du document) : ce qui est posé SOUS le canvas (iframe vidéo, fonds
   * HTML, damier) s'y voit. Les exports (autre contexte de dessin) n'ont ni fond de plan
   * de travail ni voile.
   */
  enableWorkspace(options = {}) {
    this._workspace = {
      margin: 32,
      veilOpacity: 0.7,
      // Le damier de l'app (tailwind `bg-transparency-grid bg-checker`) : 3 % de noir sur
      // une case de 8px sur deux, sur fond blanc
      color: "#ffffff",
      veil: "checker",
      checkerColor: "rgba(0, 0, 0, 0.03)",
      checkerSize: 8,
      frameColor: "#d946ef",
      ...options
    };
    const fc = this.originalFabricCanvas;
    const renderBackground = fc._renderBackground.bind(fc);
    const renderObjects = fc._renderObjects.bind(fc);
    const onScreen = (ctx) => this._workspace !== null && ctx === fc.getContext();
    fc._renderBackground = (ctx) => {
      if (onScreen(ctx)) this._paintWorkspace(ctx);
      else renderBackground(ctx);
    };
    fc._renderObjects = (ctx, objects) => {
      if (!onScreen(ctx)) {
        renderObjects(ctx, objects);
        return;
      }
      const isEditorObject = (obj) => obj.excludeFromExport === true;
      renderObjects(ctx, objects.filter((obj) => !isEditorObject(obj)));
      ctx.save();
      const retina = fc.getRetinaScaling();
      ctx.setTransform(retina, 0, 0, retina, 0, 0);
      this._paintVeil(ctx);
      ctx.restore();
      renderObjects(ctx, objects.filter(isEditorObject));
    };
  }
  /**
   * Plan de travail : le canvas prend toute la taille du panneau, le cadre y est centré
   * (marge à zoom 1), décalé du déplacement en cours. Returns the computed scale.
   */
  fitWorkspace(containerW, containerH, userZoom = 1) {
    const margin = this._workspace?.margin ?? 0;
    const fitScale = Math.max(0.01, Math.min(
      (containerW - 2 * margin) / this.width,
      (containerH - 2 * margin) / this.height
    ));
    const scale = fitScale * userZoom;
    const width = this.width * scale;
    const height = this.height * scale;
    const left = (containerW - width) / 2 + this._pan.x;
    const top = (containerH - height) / 2 + this._pan.y;
    this.originalFabricCanvas.setDimensions({ width: containerW, height: containerH });
    this.originalFabricCanvas.setViewportTransform([scale, 0, 0, scale, left, top]);
    this._lastFit = { containerW, containerH, userZoom };
    this._frame = { left, top, width, height };
    this._scale = scale;
    return scale;
  }
  /** Déplace la vue (px écran). */
  panBy(dx, dy) {
    this._pan = { x: this._pan.x + dx, y: this._pan.y + dy };
    const { containerW, containerH, userZoom } = this._lastFit;
    this.fitWorkspace(containerW, containerH, userZoom);
  }
  resetPan() {
    this._pan = { x: 0, y: 0 };
  }
  /**
   * Le cadre seul, à la résolution du document (multiplier 1 = taille du document),
   * quelle que soit la vue — sans plan de travail ni voile.
   */
  toFrameDataURL(opts = {}) {
    const f = this._frame;
    return this.originalFabricCanvas.toDataURL({
      format: opts.format ?? "png",
      quality: opts.quality ?? 1,
      multiplier: (opts.multiplier ?? 1) / this._scale,
      left: f.left,
      top: f.top,
      width: f.width,
      height: f.height
    });
  }
  /** Centre un objet dans le cadre du document (pas dans le canvas). */
  centerObject(obj) {
    obj.setPositionByOrigin(new Point(this.width / 2, this.height / 2), "center", "center");
    obj.setCoords();
  }
  /** Fond du plan de travail hors cadre ; couleur de fond du document dans le cadre. */
  _paintWorkspace(ctx) {
    const ws = this._workspace;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.save();
    this._fillOutsideFrame(ctx);
    const background = fc.backgroundColor;
    if (typeof background === "string" && background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(f.left, f.top, f.width, f.height);
    }
    ctx.restore();
  }
  /** Le damier du voile, en px écran (indépendant du zoom) — construit une fois par couleurs. */
  _checkerPattern(ctx) {
    const ws = this._workspace;
    const key = `${ws.color}|${ws.checkerColor}|${ws.checkerSize}`;
    if (this._checker?.key === key) return this._checker.pattern;
    const cell = ws.checkerSize;
    const tile = this.originalFabricCanvas.getElement().ownerDocument.createElement("canvas");
    tile.width = cell * 2;
    tile.height = cell * 2;
    const tctx = tile.getContext("2d");
    tctx.fillStyle = ws.color;
    tctx.fillRect(0, 0, cell * 2, cell * 2);
    tctx.fillStyle = ws.checkerColor;
    tctx.fillRect(cell, 0, cell, cell);
    tctx.fillRect(0, cell, cell, cell);
    this._checker = { key, pattern: ctx.createPattern(tile, "repeat") };
    return this._checker.pattern;
  }
  /**
   * Peint tout le canvas sauf le cadre — en damier calé sur le coin du cadre (le
   * quadrillage continue celui du cadre de part et d'autre du liseré), ou uni.
   */
  _fillOutsideFrame(ctx) {
    const ws = this._workspace;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.translate(f.left, f.top);
    ctx.beginPath();
    ctx.rect(-f.left, -f.top, fc.width, fc.height);
    ctx.rect(0, 0, f.width, f.height);
    ctx.fillStyle = ws.veil === "checker" && this._checkerPattern(ctx) || ws.color;
    ctx.fill("evenodd");
    ctx.translate(-f.left, -f.top);
  }
  /** Voile sur ce qui dépasse du cadre, puis le liseré (1px écran, quel que soit le zoom). */
  _paintVeil(ctx) {
    const ws = this._workspace;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.save();
    ctx.globalAlpha = ws.veilOpacity;
    this._fillOutsideFrame(ctx);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ws.frameColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(f.left) - 0.5, Math.round(f.top) - 0.5, Math.round(f.width) + 1, Math.round(f.height) + 1);
    ctx.restore();
  }
  /**
   * Resize the canvas buffer to fit a container and scale content
   * via Fabric's viewportTransform. Returns the computed scale.
   */
  fitToSize(containerW, containerH, userZoom = 1) {
    const fitScale = Math.min(containerW / this.width, containerH / this.height);
    const scale = fitScale * userZoom;
    const bufferW = Math.round(this.width * scale);
    const bufferH = Math.round(this.height * scale);
    this.originalFabricCanvas.setDimensions({ width: bufferW, height: bufferH });
    this.originalFabricCanvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    this._frame = { left: 0, top: 0, width: bufferW, height: bufferH };
    this._scale = scale;
    return scale;
  }
  /**
   * Shift the active drag's grab offset by (dx, dy).
   *
   * During a drag, Fabric places the object at `cursor + offset`.
   * Adjusting the offset "teleports" the object without breaking
   * the drag delta calculation.
   */
  adjustGrabOffset(dx, dy) {
    if (dx === 0 && dy === 0) return;
    const transform = this.originalFabricCanvas._currentTransform;
    if (!transform) return;
    transform.offsetX -= dx;
    transform.offsetY -= dy;
  }
  // ── Delegation methods ──────────────────────────────────────────────
  getObjects() {
    return this.originalFabricCanvas.getObjects();
  }
  add(...objects) {
    this.originalFabricCanvas.add(...objects);
  }
  insertAt(index, ...objects) {
    this.originalFabricCanvas.insertAt(index, ...objects);
  }
  remove(...objects) {
    this.originalFabricCanvas.remove(...objects);
  }
  renderAll() {
    this.originalFabricCanvas.renderAll();
  }
  requestRenderAll() {
    this.originalFabricCanvas.requestRenderAll();
  }
  on(eventName, handler) {
    this.originalFabricCanvas.on(eventName, handler);
  }
  off(eventName, handler) {
    this.originalFabricCanvas.off(eventName, handler);
  }
  getActiveObject() {
    return this.originalFabricCanvas.getActiveObject() ?? null;
  }
  setActiveObject(obj) {
    this.originalFabricCanvas.setActiveObject(obj);
  }
  discardActiveObject() {
    this.originalFabricCanvas.discardActiveObject();
  }
  getScenePoint(e) {
    return this.originalFabricCanvas.getScenePoint(e);
  }
  setDimensions(dims) {
    this.originalFabricCanvas.setDimensions(dims);
  }
  bringObjectForward(obj, intersecting) {
    this.originalFabricCanvas.bringObjectForward(obj, intersecting);
  }
  sendObjectBackwards(obj) {
    this.originalFabricCanvas.sendObjectBackwards(obj);
  }
  moveObjectTo(obj, index) {
    this.originalFabricCanvas.moveObjectTo(obj, index);
  }
  getZoom() {
    return this.originalFabricCanvas.getZoom();
  }
  setZoom(zoom) {
    this.originalFabricCanvas.setZoom(zoom);
  }
  toDataURL(opts) {
    return this.originalFabricCanvas.toDataURL(opts);
  }
  clear() {
    this.originalFabricCanvas.clear();
  }
  dispose() {
    this.originalFabricCanvas.dispose();
  }
  set backgroundColor(color) {
    this.originalFabricCanvas.backgroundColor = color;
  }
  get backgroundColor() {
    return this.originalFabricCanvas.backgroundColor;
  }
  set renderOnAddRemove(value) {
    this.originalFabricCanvas.renderOnAddRemove = value;
  }
  get renderOnAddRemove() {
    return this.originalFabricCanvas.renderOnAddRemove;
  }
};

// src/LayerManager.ts
import {
  FabricImage as FabricImage5,
  Group as Group4,
  util as util2
} from "#fabric";

// src/controls/CustomTextbox.ts
import { Textbox, Point as Point2, controlsUtils } from "#fabric";

// src/layout/types.ts
function isContainer(l) {
  return l.container != null;
}
function isChild(l) {
  return l.child != null;
}
function isContainerLayout(l) {
  return isContainer(l);
}
function isChildLayout(l) {
  return isChild(l);
}
var MIN_PAD = 8;
var MIN_FONT_SIZE = 8;
var DEFAULT_SIZING = { x: "hug", y: "hug" };
function sizingOf(obj) {
  return obj.get("layout")?.sizing ?? DEFAULT_SIZING;
}

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
   * découpage des mots trop longs (break-word) n'est qu'un repli, pas un minimum :
   * la mesure se fait hors contrainte (les lignes wrappées sont déjà découpées, un
   * morceau passerait pour un mot), puis la boîte est remise telle quelle.
   */
  minContentWidth() {
    const { width, height } = this;
    this.width = UNBOUNDED_WIDTH;
    super.initDimensions();
    const min = Math.ceil(super.getGraphemeDataForRender(this.textLines).largestWordWidth);
    this._wrapAt(width);
    this.height = height;
    return min;
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
    const p = new Point2(
      boundaries.left + leftOffset,
      boundaries.top + boundaries.topOffset + charHeight
    ).transform(this.calcTransformMatrix()).transform(this.canvas.viewportTransform).multiply(
      new Point2(
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

// src/capabilities.ts
import { FabricImage, Group, Rect as Rect2 } from "#fabric";

// src/layout/geometry.ts
function resolveContainerChildren(objects, container) {
  const containerId = container.get("layerId");
  const out = [];
  for (const obj of objects) {
    const layout = obj.get("layout");
    if (!layout?.child) continue;
    if (layout.child.parentId === containerId) {
      out.push({ obj, cl: layout.child });
    }
  }
  return out;
}
function sortChildrenByOrder(children) {
  if (children.length <= 1) return children;
  return [...children].sort((a, b) => {
    const orderA = a.cl.order ?? Infinity;
    const orderB = b.cl.order ?? Infinity;
    return orderA - orderB;
  });
}
function scaledSize(obj) {
  return {
    w: obj.width * (obj.scaleX || 1),
    h: obj.height * (obj.scaleY || 1)
  };
}
function setShapeSize(obj, w, h) {
  const sized = obj;
  if (typeof sized.setSize === "function") sized.setSize(w, h);
  else obj.set({ scaleX: w / (obj.width || 1), scaleY: h / (obj.height || 1) });
}
function topLeft(obj) {
  const { w, h } = scaledSize(obj);
  const center = obj.getRelativeCenterPoint();
  return { x: center.x - w / 2, y: center.y - h / 2 };
}
function pointInObject(point, obj, margin = 0) {
  const tl = topLeft(obj);
  const { w, h } = scaledSize(obj);
  return point.x >= tl.x - margin && point.x <= tl.x + w + margin && point.y >= tl.y - margin && point.y <= tl.y + h + margin;
}
var TEXT_TYPES = ["i-text", "textbox"];
function isTextObject(obj) {
  return TEXT_TYPES.includes(obj.type);
}
function clampTopLeft(obj, reference, padding) {
  const tl = topLeft(obj);
  const refTl = topLeft(reference);
  return {
    x: Math.max(refTl.x + padding, tl.x),
    y: Math.max(refTl.y + padding, tl.y)
  };
}
function hasExceededOffset(current, origin, offsetX, offsetY, margin) {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  return offsetX > 0 && dx < -(offsetX + margin) || offsetX < 0 && dx > -offsetX + margin || offsetY > 0 && dy < -(offsetY + margin) || offsetY < 0 && dy > -offsetY + margin;
}
function detachChild(obj) {
  const layout = obj.get?.("layout");
  if (layout?.child) {
    const { child: _child, ...rest } = layout;
    obj.set("layout", Object.keys(rest).length ? rest : void 0);
  }
  if (isTextObject(obj)) obj.layoutWith(null);
}
function cloneLayout(obj) {
  const layout = obj.get?.("layout");
  return layout ? JSON.parse(JSON.stringify(layout)) : void 0;
}
function syncCoords(container, children) {
  container.setCoords();
  for (const { obj } of children) {
    obj.setCoords();
  }
}
function cornerToAxes(corner) {
  if (!corner) return { x: true, y: true };
  const hasX = corner.includes("l") || corner.includes("r");
  const hasY = corner.includes("t") || corner.includes("b");
  return { x: hasX, y: hasY };
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

// src/userSlots.ts
import { Pattern, util } from "#fabric";

// src/ui/badges.ts
var BADGE_HEIGHT = 15;
var BADGE_PAD = 5;
var BADGE_FONT = "500 10px ui-sans-serif, system-ui, sans-serif";
function drawFrameBadge(ctx, obj, label, color) {
  const corner = obj.oCoords?.tl;
  if (!corner) return;
  ctx.save();
  ctx.font = BADGE_FONT;
  const width = ctx.measureText(label).width + BADGE_PAD * 2;
  const left = corner.x - 1;
  const top = corner.y - BADGE_HEIGHT;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, BADGE_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + BADGE_PAD, top + BADGE_HEIGHT / 2);
  ctx.restore();
}
function badgeLabel(obj, labelers) {
  const labels = labelers.map((labeler) => labeler(obj)).filter((label) => Boolean(label));
  return labels.length ? [...new Set(labels)].join(" ") : null;
}
function installBadgeLayer(fabricCanvas, color, labelers, targets) {
  const drawControls = fabricCanvas.drawControls.bind(fabricCanvas);
  fabricCanvas.drawControls = (ctx) => {
    targets().forEach((obj) => {
      const label = badgeLabel(obj, labelers);
      if (label) drawFrameBadge(ctx, obj, label, color);
    });
    drawControls(ctx);
  };
}

// src/bindings.ts
function pendingBindings(obj) {
  const bindings = obj.get("bindings") || {};
  return Object.fromEntries(Object.entries(bindings).filter(([, spec]) => spec?.resolved !== true));
}
function hasPendingBindings(obj) {
  return Object.keys(pendingBindings(obj)).length > 0;
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
function setTextContent(obj, text) {
  if (!("text" in obj)) return;
  obj.set("text", text);
  obj.initDimensions?.();
  obj.setCoords();
  obj.fire("changed");
}
function bindingBadgeLabel(obj, userSlotLabel = DEFAULT_USER_SLOT_LABEL) {
  if (!hasPendingBindings(obj)) return null;
  return bindingLabel(obj, userSlotLabel);
}
function drawBindingBadge(ctx, obj, color, userSlotLabel = DEFAULT_USER_SLOT_LABEL) {
  const label = bindingBadgeLabel(obj, userSlotLabel);
  if (label) drawFrameBadge(ctx, obj, label, color);
}
var DEFAULT_USER_SLOT_LABEL = "\xC0 fournir";
function bindingLabel(obj, userSlotLabel) {
  const labels = Object.values(pendingBindings(obj)).flatMap((spec) => {
    if (spec?.scope === "user") return [userSlotLabel];
    const expr = String(spec?.expr ?? "");
    const tokens = expr.match(/\$\w+/g) || [];
    return tokens.length ? tokens : expr.match(/^media\[/) ? [expr] : [];
  });
  return labels.length ? [...new Set(labels)].join(" ") : "$";
}
function drawDynamicMediaOutline(ctx, obj, color) {
  const pending = pendingBindings(obj);
  if (!Object.keys(pending).some((field) => field.startsWith("image."))) return;
  const coords = obj.oCoords;
  if (!coords) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(coords.tl.x, coords.tl.y);
  ctx.lineTo(coords.tr.x, coords.tr.y);
  ctx.lineTo(coords.br.x, coords.br.y);
  ctx.lineTo(coords.bl.x, coords.bl.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// src/userSlots.ts
var USER_SCOPE = "user";
var USER_SLOT_FIELD = "image.src";
function userSlotBinding(obj) {
  const spec = pendingBindings(obj)[USER_SLOT_FIELD];
  return spec?.scope === USER_SCOPE ? spec : null;
}
function isUserSlot(obj) {
  return userSlotBinding(obj) !== null;
}
function userSlotHint(obj) {
  return String(userSlotBinding(obj)?.hint ?? "");
}
function resolveUserSlot(bindings) {
  const spec = bindings?.[USER_SLOT_FIELD];
  if (spec?.scope !== USER_SCOPE) return bindings;
  return { ...bindings, [USER_SLOT_FIELD]: { ...spec, resolved: true } };
}
function collectUserSlots(objects) {
  return objects.filter(isUserSlot).map((object) => {
    const { left, top, width, height } = object.getBoundingRect();
    return {
      object,
      layerId: object.get("layerId"),
      hint: userSlotHint(object),
      rect: { left, top, width, height }
    };
  });
}
var CELL = 16;
var CHECKER_LIGHT = "#f9fafb";
var CHECKER_DARK = "#e5e7eb";
var checkerSource = null;
function checkerTile() {
  if (checkerSource) return checkerSource;
  const tile = util.createCanvasElement();
  tile.width = tile.height = CELL * 2;
  const ctx = tile.getContext("2d");
  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(0, 0, CELL * 2, CELL * 2);
  ctx.fillStyle = CHECKER_DARK;
  ctx.fillRect(0, 0, CELL, CELL);
  ctx.fillRect(CELL, CELL, CELL, CELL);
  checkerSource = tile;
  return tile;
}
function checkerCanvas(width, height) {
  const el = util.createCanvasElement();
  el.width = Math.max(1, Math.round(width));
  el.height = Math.max(1, Math.round(height));
  const ctx = el.getContext("2d");
  ctx.fillStyle = ctx.createPattern(checkerTile(), "repeat") ?? CHECKER_LIGHT;
  ctx.fillRect(0, 0, el.width, el.height);
  return el;
}
function checkerPattern(obj) {
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  return new Pattern({ source: checkerTile(), repeat: "repeat", patternTransform: [1 / sx, 0, 0, 1 / sy, 0, 0] });
}
var USER_SLOT_STYLE_KEY = "userSlotStyle";
var DEFAULT_COLOR = "#d946ef";
var BASE = { icon: 20, font: 10, line: 13, gap: 6, pad: 8 };
var SCALES = [4, 3.5, 3, 2.5, 2, 1.6];
var fontAt = (scale) => `500 ${BASE.font * scale}px ui-sans-serif, system-ui, sans-serif`;
function slotLayout(ctx, text, w, h) {
  for (const scale2 of text ? SCALES : []) {
    ctx.font = fontAt(scale2);
    const pad = BASE.pad * scale2;
    const lines = wrapLines(ctx, text, w - pad * 2);
    const height = (BASE.icon + BASE.gap + lines.length * BASE.line) * scale2 + pad * 2;
    if (lines.length && height <= h) return { scale: scale2, lines };
  }
  const scale = SCALES.find((s) => (BASE.icon + BASE.pad * 2) * s <= Math.min(w, h));
  return scale ? { scale, lines: [] } : null;
}
function drawSlotContent(ctx, obj) {
  const style = obj.canvas?.[USER_SLOT_STYLE_KEY];
  const { x: zx, y: zy } = obj.getTotalObjectScaling();
  ctx.save();
  ctx.scale(1 / zx, 1 / zy);
  const layout = slotLayout(ctx, userSlotHint(obj) || style?.prompt || "", obj.width * zx, obj.height * zy);
  if (!layout) return ctx.restore();
  const { scale, lines } = layout;
  const icon = BASE.icon * scale;
  const line = BASE.line * scale;
  const gap = BASE.gap * scale;
  const top = -(icon + (lines.length ? gap + lines.length * line : 0)) / 2;
  const color = style?.color ?? DEFAULT_COLOR;
  drawUploadIcon(ctx, top, icon, color);
  ctx.font = fontAt(scale);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((text, i) => ctx.fillText(text, 0, top + icon + gap + line * (i + 0.5)));
  ctx.restore();
}
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width > maxWidth) return [];
    const last = lines[lines.length - 1];
    const joined = last ? `${last} ${word}` : word;
    if (last && ctx.measureText(joined).width <= maxWidth) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines;
}
function drawUploadIcon(ctx, top, size, color) {
  ctx.save();
  ctx.translate(-size / 2, top);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(3, 16.5);
  ctx.lineTo(3, 18.75);
  ctx.quadraticCurveTo(3, 21, 5.25, 21);
  ctx.lineTo(18.75, 21);
  ctx.quadraticCurveTo(21, 21, 21, 18.75);
  ctx.lineTo(21, 16.5);
  ctx.moveTo(7.5, 7.5);
  ctx.lineTo(12, 3);
  ctx.lineTo(16.5, 7.5);
  ctx.moveTo(12, 3);
  ctx.lineTo(12, 16.5);
  ctx.stroke();
  ctx.restore();
}
function installUserSlotRendering(target) {
  const proto = target;
  const original = proto._render;
  const originalIsCacheDirty = proto.isCacheDirty;
  proto.isCacheDirty = function(skipCanvas) {
    const slot = isUserSlot(this);
    if (slot !== Boolean(this._wasUserSlot)) {
      this._wasUserSlot = slot;
      this.dirty = true;
    }
    return originalIsCacheDirty.call(this, skipCanvas);
  };
  proto._render = function(ctx) {
    if (!isUserSlot(this)) return original.call(this, ctx);
    const fill = this.fill;
    this.fill = checkerPattern(this);
    try {
      original.call(this, ctx);
    } finally {
      this.fill = fill;
    }
    drawSlotContent(ctx, this);
  };
}

// src/shapes/FabRect.ts
import { Rect, classRegistry, controlsUtils as controlsUtils2 } from "#fabric";

// src/shapes/lockMixin.ts
var LOCK_MODES2 = ["free", "position", "full"];
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
    const currentIndex = LOCK_MODES2.indexOf(this.getLockMode());
    return LOCK_MODES2[(currentIndex + 1) % LOCK_MODES2.length];
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
installUserSlotRendering(FabRect.prototype);
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
installUserSlotRendering(FabCircle.prototype);
classRegistry2.setClass(FabCircle, "Circle");

// src/shapes/FabPath.ts
import { Path, classRegistry as classRegistry3, controlsUtils as controlsUtils4 } from "#fabric";

// src/shapes/registry.ts
var registry = [];
function registerShapes(shapes) {
  registry = shapes.map(normalizeEntry);
}
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
function normalizeEntry(entry) {
  if ("paths" in entry && Array.isArray(entry.paths)) {
    return { id: entry.id, paths: entry.paths, width: entry.width ?? 100, height: entry.height ?? 100 };
  }
  const legacy = entry;
  return { id: legacy.id, paths: [{ d: legacy.d }], width: legacy.width ?? 100, height: legacy.height ?? 100 };
}

// src/shapes/FabPath.ts
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
installUserSlotRendering(FabPath.prototype);
classRegistry3.setClass(FabPath, "Path");

// src/capabilities.ts
function kindOf(obj) {
  const layerType = obj.layerType;
  if (isTextObject(obj)) return "text";
  if (layerType === "imageFrame") return "imageShape";
  if (obj instanceof FabricImage) return "legacyImage";
  if (layerType === "shape" || obj instanceof Rect2) return "shape";
  return "other";
}
function rulesOf(obj, { ignoreLock = false } = {}) {
  const rules = kindRules(obj, kindOf(obj));
  if (isOutOfPlay(obj)) Object.assign(rules, { onToolboxImage: null, hosts: false });
  const locked = lockedRules(rules, ignoreLock ? "free" : getLockMode(obj));
  if (rules.onToolboxImage !== "fill" || !isUserSlot(obj)) return locked;
  return { ...locked, onToolboxImage: "fill", options: [...locked.options, "image"] };
}
function lockedRules(rules, lockMode) {
  switch (lockMode) {
    case "position":
      return {
        ...rules,
        options: rules.options.filter((option) => option === "image"),
        restyles: false,
        restacks: false,
        deletes: false
      };
    case "full":
      return {
        ...rules,
        onToolboxImage: null,
        hosts: false,
        options: [],
        restyles: false,
        restacks: false,
        deletes: false
      };
    default:
      return rules;
  }
}
function kindRules(obj, kind) {
  const free = { restyles: true, restacks: true, deletes: true };
  switch (kind) {
    case "text":
      return { kind, onToolboxImage: null, hosts: false, options: ["color", "font"], ...free };
    case "shape":
      return {
        kind,
        onToolboxImage: obj instanceof Group ? null : "fill",
        hosts: true,
        options: shapeOptions(obj),
        ...free
      };
    case "imageShape":
      return {
        kind,
        onToolboxImage: "replaceImage",
        hosts: true,
        options: ["outline", "clip", "corner_radius", "image"],
        ...free
      };
    case "legacyImage":
      return { kind, onToolboxImage: "replaceImage", hosts: false, options: [], ...free };
    default:
      return { kind, onToolboxImage: null, hosts: false, options: [], ...free };
  }
}
function shapeOptions(obj) {
  if (obj instanceof FabRect) return ["outline", "clip", "color", "corner_radius"];
  if (obj instanceof FabCircle || obj instanceof FabPath) return ["outline", "clip", "color"];
  return [];
}
function isOutOfPlay(obj) {
  return obj.get("layerId") === "originalImage" || obj.evented === false || obj.excludeFromExport === true;
}

// src/shapes/factories.ts
import {
  FabricImage as FabricImage3,
  Group as Group2
} from "#fabric";

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
function removeCropControls(obj) {
  const sides = ["left", "right", "top", "bottom"];
  sides.forEach((side) => {
    const controlName = CONTROL_NAMES[side];
    delete obj.controls[controlName];
  });
}

// src/shapes/factories.ts
function createRect(options) {
  return new FabRect(options);
}
function createCircle(options) {
  return new FabCircle(options);
}
function createHeart(options) {
  return createPathShape("heart", options);
}
function createHexagon(options) {
  return createPathShape("hexagon", options);
}
function createPathShape(shapeId, options) {
  return FabPath.createFromCatalog(shapeId, options);
}
async function createImage(url, options) {
  const img = await FabricImage3.fromURL(url, { crossOrigin: "anonymous" });
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
  const group = new Group2(children, { originX: "center", originY: "center", ...withoutUndefined({ left, top }) });
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
    width
  });
}

// src/shapes/paths.ts
var HEART_PATH = "M 0 13 Q -1 13 -4 11 C -12 5 -17 -3 -12 -10 C -9 -14 -2 -13 0 -7 C 2 -13 9 -14 12 -10 C 17 -3 11 5 4 11 Q 1 13 0 13 Z";
var HEXAGON_PATH = "M-2 -23.3453C-0.7624 -24.0598 0.7624 -24.0598 2 -23.3453L19.2176 -13.4047C20.4552 -12.6902 21.2176 -11.3697 21.2176 -9.9406V10.4406C21.2176 11.8697 20.4552 13.1902 19.2176 13.9047L2 23.8453C0.7624 24.5598 -0.7624 24.5598 -2 23.8453L-19.2176 13.9047C-20.4552 13.1902 -21.2176 11.8697 -21.2176 10.4406V-9.9406C-21.2176 -11.3697 -20.4552 -12.6902 -19.2176 -13.4047L-2 -23.3453Z";

// src/shapes/shapeWheel.ts
function shapeIds() {
  return getShapeCatalog().map((s) => s.id);
}
function nextShape(currentId) {
  const ids = shapeIds();
  if (!currentId) return ids[1] ?? ids[0];
  const idx = ids.indexOf(currentId);
  if (idx === -1) return ids[1] ?? ids[0];
  return ids[(idx + 1) % ids.length];
}
function isValidShape(id) {
  return shapeIds().includes(id);
}
function getAvailableShapes() {
  return shapeIds();
}

// src/ImageFrame.ts
import {
  Group as Group3,
  FabricImage as FabricImage4,
  classRegistry as classRegistry4,
  LayoutManager,
  FixedLayout
} from "#fabric";
var IMAGE_KEYS = ["src", "offsetX", "offsetY", "scale"];
function imageMetaOf(image) {
  const meta = { ...image };
  IMAGE_KEYS.forEach((key) => delete meta[key]);
  return meta;
}
function rotatePoint(dx, dy, angleDeg) {
  const angle = -angleDeg * Math.PI / 180;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle)
  };
}
var ImageFrame = class _ImageFrame extends Group3 {
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
    this._imageMeta = {};
    this._pending = false;
    this._image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this._imageOffsetX = options.imageOffsetX ?? 0;
    this._imageOffsetY = options.imageOffsetY ?? 0;
    this._imageScale = options.imageScale ?? 1;
    this._imageMeta = { ...options.imageMeta ?? {} };
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
    return this._pending ? "" : this._image.getSrc() || "";
  }
  /** Les clés de `image` qui ne sont pas à la lib (cf. ImageFrameOptions.imageMeta). */
  get imageMeta() {
    return this._imageMeta;
  }
  /** Cadre en attente de son fichier : pas de `src` au save (damier, ou l'aperçu de session
   *  d'un upload en cours). `replaceImage` le sort de l'attente. */
  get pending() {
    return this._pending;
  }
  /** Un cadre en attente : l'image est le damier, aux dimensions du cadre. */
  static pending(options) {
    const img = new FabricImage4(checkerCanvas(options.frameWidth, options.frameHeight));
    const frame = new _ImageFrame(img, options);
    frame._pending = true;
    return frame;
  }
  /** L'image affichée n'est pas celle du document (une url de session, le temps d'un
   *  upload) : le cadre se sauve sans `src` jusqu'à ce que la vraie source la remplace. */
  markSourcePending() {
    this._pending = true;
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
   * Remplace l'image du frame en mode cover. Les clés `imageMeta` sont celles de la NOUVELLE
   * source — jamais héritées : une image remplacée qui garderait l'identité de l'ancienne
   * est exactement le bug qu'elles servent à éviter.
   */
  replaceImage(newImage, imageMeta = {}) {
    const savedClipShape = this.clipShape || "rect";
    this._imageMeta = { ...imageMeta };
    this._pending = false;
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
        ...this._imageMeta,
        ...this._pending ? {} : { src: this.imageSrc },
        offsetX: this._imageOffsetX,
        offsetY: this._imageOffsetY,
        scale: this._imageScale
      }
    };
  }
  static async fromObject(data) {
    const { src, offsetX = 0, offsetY = 0, scale = 1 } = data.image;
    const options = {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      imageOffsetX: offsetX,
      imageOffsetY: offsetY,
      imageScale: scale,
      imageMeta: imageMetaOf(data.image)
    };
    const frame = src ? new _ImageFrame(await FabricImage4.fromURL(src, { crossOrigin: "anonymous" }), options) : _ImageFrame.pending({ ...options, frameWidth: data.frameWidth, frameHeight: data.frameHeight });
    const img = frame._image;
    if (data.layout) frame.set("layout", data.layout);
    if (data.originX) frame.set({ originX: data.originX, originY: data.originY ?? data.originX });
    if (data.stroke) frame.set({ stroke: data.stroke, strokeWidth: data.strokeWidth ?? 4 });
    frame.frameWidth = data.frameWidth;
    frame.frameHeight = data.frameHeight;
    frame.width = data.frameWidth;
    frame.height = data.frameHeight;
    const coverScale = Math.max(data.frameWidth / img.width, data.frameHeight / img.height);
    frame._image.set({
      scaleX: coverScale * scale,
      scaleY: coverScale * scale,
      left: offsetX,
      top: offsetY
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
    const img = await FabricImage5.fromURL(url, { crossOrigin: "anonymous" });
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
    const { left = 100, top = 100, layerId = this.generateId(), imageMeta } = options;
    const img = await FabricImage5.fromURL(url, { crossOrigin: "anonymous" });
    let frameScale = 1;
    if (img.width > 300 || img.height > 300) {
      frameScale = Math.min(300 / img.width, 300 / img.height);
    }
    const frame = new ImageFrame(img, { left, top, layerId, frameScale, imageMeta });
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
   * @param options.imageMeta - Les clés de la nouvelle source (une forme-image seulement)
   */
  async replaceImageSource(target, newUrl, options) {
    if (kindOf(target) === "imageShape") {
      const frame = target;
      const newImg = await FabricImage5.fromURL(newUrl, { crossOrigin: "anonymous" });
      frame.replaceImage(newImg, options?.imageMeta);
      if (options?.opacity !== void 0) {
        frame.opacity = options.opacity;
      }
      if (frame.selectable !== false) this.canvas.setActiveObject(frame);
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
    const newImg = await FabricImage5.fromURL(newUrl, { crossOrigin: "anonymous" });
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
  async replaceShapeWithImage(shape, imageUrl, imageMeta) {
    const { clipShape, clipData, cornerRadius } = clipOfShape(shape);
    const { w: displayedWidth, h: displayedHeight } = scaledSize(shape);
    const center = shape.getRelativeCenterPoint();
    const img = await FabricImage5.fromURL(imageUrl, { crossOrigin: "anonymous" });
    const frame = new ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: shape.angle,
      layerId: shape.layerId || this.generateId(),
      clipShape,
      clipData,
      imageMeta,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight,
      cornerRadius
    });
    const bindings = resolveUserSlot(shape.get("bindings"));
    if (bindings) frame.set("bindings", bindings);
    this.takeOver(shape, frame);
    return frame;
  }
  /**
   * Demande l'image à l'utilisateur final (userSlots) : le calque devient une forme liée à
   * une image à fournir, avec sa consigne. Une forme le reste ; une forme-image redevient la
   * forme de sa découpe, aux mêmes dimensions — son image est abandonnée (pas d'exemple :
   * le damier dit « à fournir »), ses autres bindings la suivent.
   *
   * Rend la forme, ou null si le calque ne peut pas recevoir d'image (texte, groupe de paths).
   */
  requestUserImage(obj, hint = "") {
    const bindings = {
      ...obj.get("bindings") || {},
      [USER_SLOT_FIELD]: { scope: USER_SCOPE, hint }
    };
    if (obj instanceof ImageFrame) {
      const shape = shapeOfFrame(obj);
      shape.set({
        layerId: obj.get("layerId") || this.generateId(),
        layerType: "shape",
        angle: obj.angle,
        bindings
      });
      shape.setPositionByOrigin(obj.getRelativeCenterPoint(), "center", "center");
      this.takeOver(obj, shape);
      return shape;
    }
    if (rulesOf(obj, { ignoreLock: true }).onToolboxImage !== "fill") return null;
    obj.set({ bindings });
    this.canvas.requestRenderAll();
    return obj;
  }
  /**
   * Un calque en remplace un autre à sa place : son layout (container, enfant) et son
   * verrouillage — sinon ses enfants restent orphelins, ou il sort de son container — et
   * son rang dans la pile (sous ses enfants).
   */
  takeOver(previous, next) {
    const layout = previous.get("layout");
    if (layout) next.set("layout", JSON.parse(JSON.stringify(layout)));
    const lockMode = getLockMode(previous);
    if (lockMode !== "free") applyLockMode(next, lockMode);
    const zIndex = this.canvas.getObjects().indexOf(previous);
    this.canvas.remove(previous);
    this.canvas.add(next);
    if (zIndex >= 0 && zIndex < this.canvas.getObjects().length) {
      this.canvas.moveObjectTo(next, zIndex);
    }
    this.canvas.setActiveObject(next);
    this.canvas.renderAll();
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
  /** Crée un cadre à fournir (un rect lié, cf. userSlots) sans l'ajouter au canvas. */
  createUserSlot(options = {}) {
    const { hint = "", ...shapeOptions2 } = options;
    const shape = this.createShape({ fill: "#ffffff", ...shapeOptions2, shapeType: "rect" });
    shape.set({ bindings: { [USER_SLOT_FIELD]: { scope: USER_SCOPE, hint } } });
    return shape;
  }
  addUserSlot(options = {}) {
    const shape = this.createUserSlot(options);
    this.add(shape);
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
    const group = new Group4(objects);
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
        const img = await FabricImage5.fromObject({
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
        obj = await Group4.fromObject(layer);
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
function shapeOfFrame(frame) {
  const { w, h } = scaledSize(frame);
  const fill = "#ffffff";
  const strokeWidth = 0;
  const clipShape = frame.clipShape || "rect";
  if (clipShape === "circle") {
    const circle = new FabCircle({ radius: Math.min(w, h) / 2, fill, strokeWidth });
    circle.setSize(w, h);
    return circle;
  }
  const clipData = clipShape === "rect" ? void 0 : frame.clipData ?? clipDataFor(clipShape);
  if (clipData) return FabPath.fromPathData({ d: clipData.d }, { id: clipShape, fill, strokeWidth, width: w, height: h });
  return new FabRect({ width: w, height: h, rx: frame.cornerRadius, ry: frame.cornerRadius, fill, strokeWidth });
}
function clipOfShape(shape) {
  if (shape instanceof FabRect) return { clipShape: "rect", cornerRadius: shape.getCornerRadius() };
  if (shape instanceof FabCircle) return { clipShape: "circle", cornerRadius: 0 };
  if (shape instanceof FabPath) {
    const id = shape.id;
    const clipData = { d: util2.joinPath(shape.path), width: shape.width, height: shape.height };
    return { clipShape: id && isValidShape(id) ? id : id || "custom", clipData, cornerRadius: 0 };
  }
  return { clipShape: "rect", cornerRadius: 0 };
}

// src/SelectionManager.ts
import { ActiveSelection, Point as Point3 } from "#fabric";
var SelectionManager = class {
  constructor(canvas) {
    this.canvas = canvas;
    this._current = null;
    this.callbacks = {};
    this.isTransforming = false;
    this._silenced = false;
    /**
     * When set, we are "inside" a layout group: hover and click target
     * children directly instead of redirecting to the container.
     */
    this._activeGroupId = null;
    /** What was selected before this press — Fabric selects before firing mouse:down. */
    this._selectedBeforePress = null;
    this.setupListeners();
  }
  /** The layerId of the container we're currently editing inside, or null. */
  get activeGroupId() {
    return this._activeGroupId;
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
   * Given a Fabric target (the object under the cursor), return the object
   * that should actually be hovered / selected / dragged: a layout child
   * outside the active group resolves to its container, up the chain (a
   * grandchild resolves to the outermost container that isn't the active
   * group's child).
   */
  resolveTarget(obj) {
    let current = obj;
    for (; ; ) {
      const parentId = current.get("layout")?.child?.parentId;
      if (!parentId || parentId === this._activeGroupId) return current;
      const parent = this.canvas.getObjects().find((o) => o.get("layerId") === parentId);
      if (!parent) return current;
      current = parent;
    }
  }
  /**
   * Retourne les contrôles disponibles pour l'objet sélectionné
   */
  getAvailableControls() {
    const obj = this.current;
    return obj ? rulesOf(obj).options : [];
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
    this.redirectTargetSearch();
    this.canvas.on("mouse:down:before", this.handleMouseDownBefore.bind(this));
    this.canvas.on("mouse:down", this.handleMouseDown.bind(this));
    this.canvas.on("mouse:up", this.handleMouseUp.bind(this));
    this.canvas.on("mouse:dblclick", this.handleDoubleClick.bind(this));
    this.canvas.on("selection:created", this.handleSelection.bind(this));
    this.canvas.on("selection:updated", this.handleSelection.bind(this));
    this.canvas.on("selection:cleared", this.handleDeselection.bind(this));
    this.canvas.on("object:moving", this.handleTransformStart.bind(this));
    this.canvas.on("object:resizing", this.handleTransformStart.bind(this));
    this.canvas.on("object:rotating", this.handleTransformStart.bind(this));
    this.canvas.on("object:modified", this.handleModified.bind(this));
  }
  /**
   * Fabric picks the target of a press (and of hover) in searchPossibleTargets:
   * redirecting there — not after the selection — makes a press on a child
   * outside its group a press on its container, so that a click + drag moves
   * the container right away instead of grabbing the child.
   */
  redirectTargetSearch() {
    const fc = this.canvas.originalFabricCanvas;
    const search = fc.searchPossibleTargets.bind(fc);
    fc.searchPossibleTargets = (objects, pointer) => {
      const info = search(objects, pointer);
      if (info.target) {
        const resolved = this.resolveTarget(info.target);
        if (resolved !== info.target) {
          info.target = resolved;
          info.container = resolved;
        }
      }
      return info;
    };
  }
  handleMouseDownBefore() {
    this._selectedBeforePress = this.current;
  }
  /**
   * Group exit: a press outside the active group (or on empty canvas) leaves it.
   * Entering is decided on release (see handleMouseUp), so that a drag on a
   * selected container still moves it.
   */
  handleMouseDown(e) {
    if (!this._activeGroupId) return;
    const target = e.target;
    const isTheContainer = target?.get("layerId") === this._activeGroupId;
    const isChildOfGroup = target?.get("layout")?.child?.parentId === this._activeGroupId;
    if (!target || !isTheContainer && !isChildOfGroup) this._activeGroupId = null;
  }
  /**
   * Group enter: a click (no drag) on a container that was already selected
   * enters it and selects its child under the pointer.
   */
  handleMouseUp(e) {
    const before = this._selectedBeforePress;
    this._selectedBeforePress = null;
    if (!e.isClick || !before || e.target !== before) return;
    if (!before.get("layout")?.container) return;
    this.enterGroup(before, this.canvas.getScenePoint(e.e));
  }
  /** Enter `container`'s group and select its topmost child under `point`. */
  enterGroup(container, point) {
    const id = container.get("layerId");
    this._activeGroupId = id;
    const child = this.canvas.getObjects().slice().reverse().find(
      (o) => o.get("layout")?.child?.parentId === id && o.containsPoint(new Point3(point.x, point.y))
    );
    if (child) this.canvas.setActiveObject(child);
    this.canvas.requestRenderAll();
  }
  /**
   * Double-click on a text inside a container: its two clicks entered the
   * group and selected the text (the press targeted the container, so
   * Fabric's own double-click editing didn't run) — edit it now, word under
   * the pointer selected, like Fabric does.
   */
  handleDoubleClick(e) {
    const text = this.current;
    if (!text || !isTextObject(text) || text.isEditing || text.editable === false) return;
    if (text.get("layout")?.child?.parentId !== this._activeGroupId) return;
    text.enterEditing(e.e);
    text.selectWord(text.getSelectionStartFromPointer(e.e));
    this.canvas.requestRenderAll();
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
        const newSelection = new ActiveSelection(unlocked, { canvas: this.canvas.originalFabricCanvas });
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
    const resolved = this.resolveTarget(activeObject);
    if (resolved !== activeObject) {
      this.canvas.discardActiveObject();
      this.canvas.setActiveObject(resolved);
      this._current = resolved;
      if (this.callbacks.onSelect) {
        this.callbacks.onSelect(resolved);
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
    this._activeGroupId = null;
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
    this.canvas.off("object:resizing");
    this.canvas.off("object:rotating");
    this.canvas.off("object:modified");
  }
};

// src/MaskManager.ts
import { FabricImage as FabricImage6 } from "#fabric";
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
    const maskImage = await FabricImage6.fromURL(maskUrl, {
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
    return this.canvas.toFrameDataURL({ format: "png", quality: 1, multiplier: 1 });
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

// src/ui/guides.ts
import { Line, Rect as Rect5, Pattern as Pattern2 } from "#fabric";

// src/ui/color.ts
function parseHex(hex) {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16)
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function hexAlpha(hex, alpha) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// src/ui/guides.ts
var CanvasGuides = class {
  constructor(canvas, color = "#ff00ff") {
    this.objects = [];
    this.canvas = canvas;
    this.color = color;
    this.strokeColor = hexAlpha(color, 0.4);
    this.fillLight = hexAlpha(color, 0.05);
    this.hatchPattern = createHatchPattern(color);
  }
  // ── Low-level primitives ──────────────────────────────────────────
  /** Add a line guide. */
  addLine(coords, opts = {}) {
    const line = new Line(coords, {
      stroke: opts.stroke ?? this.color,
      strokeWidth: opts.strokeWidth ?? 1,
      strokeDashArray: opts.strokeDashArray ?? [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    this.objects.push(line);
    this.canvas.add(line);
  }
  /** Add a rectangle guide (highlight zone, margin indicator, etc.). */
  addRect(opts, insertAbove) {
    const rect = new Rect5({
      left: opts.left,
      top: opts.top,
      originX: "left",
      originY: "top",
      width: opts.width,
      height: opts.height,
      fill: opts.fill ?? "transparent",
      stroke: opts.stroke ?? "transparent",
      strokeWidth: opts.strokeWidth ?? 0,
      strokeDashArray: opts.strokeDashArray,
      selectable: false,
      evented: false,
      excludeFromExport: true
    });
    this.objects.push(rect);
    if (insertAbove) {
      const idx = this.canvas.getObjects().indexOf(insertAbove);
      if (idx >= 0) {
        this.canvas.insertAt(idx + 1, rect);
        return;
      }
    }
    this.canvas.add(rect);
  }
  /** Remove all guides added by this instance. */
  clear() {
    for (const obj of this.objects) {
      this.canvas.remove(obj);
    }
    this.objects = [];
  }
  /** Clear + render in one call (common pattern). */
  clearAndRender() {
    this.clear();
    this.canvas.requestRenderAll();
  }
  /** Whether this instance currently has guides on the canvas. */
  get hasGuides() {
    return this.objects.length > 0;
  }
  // ── High-level presets ────────────────────────────────────────────
  /**
   * Draw a hatched overlay (same style as margin guides) covering an
   * arbitrary rectangle.  Useful anywhere a region needs to be visually
   * "claimed" — e.g. hinting that a shape is about to become a container.
   */
  showHatchOverlay(rect, insertAbove) {
    const border = hexAlpha(this.color, 0.3);
    this.addRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      fill: this.hatchPattern,
      stroke: border,
      strokeWidth: 0.5
    }, insertAbove);
  }
  /**
   * Show a dashed hover hint around a shape (used during PENDING state
   * in drag-to-layout to signal that anchoring is about to happen).
   *
   * When `insertAbove` is provided, guides are inserted in the z-order
   * just above that object instead of on top of everything — this
   * prevents the overlay from covering the shape's children.
   */
  showHintHighlight(shape, insertAbove) {
    this.clear();
    const { w, h } = scaledSize(shape);
    const tl = topLeft(shape);
    const above = insertAbove ?? void 0;
    this.showHatchOverlay({ left: tl.x, top: tl.y, width: w, height: h }, above);
    this.addRect({
      left: tl.x,
      top: tl.y,
      width: w,
      height: h,
      stroke: this.strokeColor,
      strokeWidth: 1.5,
      strokeDashArray: [6, 4]
    }, above);
  }
  /**
   * Show layout guides: a dashed outline around the container,
   * hatched overlays for each non-zero margin zone, and anchor
   * indicators (`<-->`) on the edges where the child is pinned.
   */
  showLayoutGuides(container, child) {
    this.clear();
    const { w: cw, h: ch } = scaledSize(container);
    const ctl = topLeft(container);
    this.addRect({
      left: ctl.x,
      top: ctl.y,
      width: cw,
      height: ch,
      fill: "transparent",
      stroke: this.color,
      strokeWidth: 2,
      strokeDashArray: [6, 4]
    });
    const containerLayout = container.get?.("layout");
    const p = containerLayout?.container?.padding;
    if (!p) return;
    const hatch = this.hatchPattern;
    const border = hexAlpha(this.color, 0.3);
    if (p.left > 0)
      this.addRect({ left: ctl.x, top: ctl.y, width: p.left, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.right > 0)
      this.addRect({ left: ctl.x + cw - p.right, top: ctl.y, width: p.right, height: ch, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.top > 0)
      this.addRect({ left: ctl.x + p.left, top: ctl.y, width: cw - p.left - p.right, height: p.top, fill: hatch, stroke: border, strokeWidth: 0.5 });
    if (p.bottom > 0)
      this.addRect({ left: ctl.x + p.left, top: ctl.y + ch - p.bottom, width: cw - p.left - p.right, height: p.bottom, fill: hatch, stroke: border, strokeWidth: 0.5 });
    const childTL = topLeft(child);
    const { w: childW, h: childH } = scaledSize(child);
    if (p.left > 0) {
      this.addAnchorArrow("horizontal", ctl.x, childTL.y + childH / 2, p.left);
    }
    if (p.top > 0) {
      this.addAnchorArrow("vertical", childTL.x + childW / 2, ctl.y, p.top);
    }
  }
  /**
   * Show insert-session guides: a dashed container outline + a hatched
   * gap indicator between the new child and its nearest neighbor.
   * No margin-to-edge indicators (those are for ContainerizeSession).
   */
  showInsertGuides(container, children, direction) {
    this.clear();
    const { w: cw, h: ch } = scaledSize(container);
    const ctl = topLeft(container);
    this.addRect({
      left: ctl.x,
      top: ctl.y,
      width: cw,
      height: ch,
      fill: "transparent",
      stroke: this.color,
      strokeWidth: 2,
      strokeDashArray: [6, 4]
    });
    if (children.length < 2) return;
    const isColumn = direction === "column";
    const hatch = this.hatchPattern;
    const border = hexAlpha(this.color, 0.3);
    const sorted = [...children].map((obj) => ({ obj, tl: topLeft(obj), size: scaledSize(obj) })).sort(
      (a, b) => isColumn ? a.tl.y - b.tl.y : a.tl.x - b.tl.x
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (isColumn) {
        const gapTop = curr.tl.y + curr.size.h;
        const gapBottom = next.tl.y;
        const gapH = gapBottom - gapTop;
        if (gapH > 1) {
          this.addRect({
            left: ctl.x,
            top: gapTop,
            width: cw,
            height: gapH,
            fill: hatch,
            stroke: border,
            strokeWidth: 0.5
          });
          this.addAnchorArrow("vertical", ctl.x + cw / 2, gapTop, gapH);
        }
      } else {
        const gapLeft = curr.tl.x + curr.size.w;
        const gapRight = next.tl.x;
        const gapW = gapRight - gapLeft;
        if (gapW > 1) {
          this.addRect({
            left: gapLeft,
            top: ctl.y,
            width: gapW,
            height: ch,
            fill: hatch,
            stroke: border,
            strokeWidth: 0.5
          });
          this.addAnchorArrow("horizontal", gapLeft, ctl.y + ch / 2, gapW);
        }
      }
    }
  }
  /**
   * Draw a `<-->` anchor indicator: a line with chevrons at each end.
   *
   * - "horizontal": draws left-to-right from (x, y) with given length
   * - "vertical": draws top-to-bottom from (x, y) with given length
   */
  addAnchorArrow(orientation, x, y, length) {
    if (length < 4) return;
    const chevron = Math.min(5, length / 3);
    const stroke = this.color;
    const sw = 1.5;
    const opts = { stroke, strokeWidth: sw, strokeDashArray: [] };
    if (orientation === "horizontal") {
      this.addLine([x, y, x + length, y], opts);
      this.addLine([x + chevron, y - chevron, x, y], opts);
      this.addLine([x + chevron, y + chevron, x, y], opts);
      this.addLine([x + length - chevron, y - chevron, x + length, y], opts);
      this.addLine([x + length - chevron, y + chevron, x + length, y], opts);
    } else {
      this.addLine([x, y, x, y + length], opts);
      this.addLine([x - chevron, y + chevron, x, y], opts);
      this.addLine([x + chevron, y + chevron, x, y], opts);
      this.addLine([x - chevron, y + length - chevron, x, y + length], opts);
      this.addLine([x + chevron, y + length - chevron, x, y + length], opts);
    }
  }
  /**
   * Show snap alignment lines (horizontal/vertical) spanning the full canvas.
   */
  showSnapLines(guides) {
    this.clear();
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    for (const guide of guides) {
      const coords = guide.orientation === "vertical" ? [guide.position, 0, guide.position, canvasH] : [0, guide.position, canvasW, guide.position];
      this.addLine(coords, { strokeDashArray: [5, 5] });
    }
  }
};
function createHatchPattern(hex) {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = hexAlpha(hex, 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(size / 2, size + size / 2);
  ctx.lineTo(size + size / 2, size / 2);
  ctx.stroke();
  return new Pattern2({ source: canvas, repeat: "repeat" });
}

// src/SnappingManager.ts
var SnappingManager = class {
  constructor(canvas, config = {}, guideColor) {
    this.enabled = true;
    this.snapState = null;
    this.resizeSnapState = null;
    /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
    this.exitMultiplier = 2;
    this.canvas = canvas;
    this.config = {
      threshold: config.threshold ?? 10,
      snapToCenter: config.snapToCenter ?? true,
      snapToEdges: config.snapToEdges ?? true
    };
    this.guides = new CanvasGuides(canvas, guideColor);
    this.setupEventListeners();
  }
  /**
   * Active ou désactive le snapping
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.guides.clearAndRender();
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
    this.canvas.on("object:resizing", (e) => this.handleObjectScaling(e.target));
    this.canvas.on("object:modified", () => {
      this.guides.clearAndRender();
      this.snapState = null;
    });
    this.canvas.on("selection:cleared", () => {
      this.guides.clearAndRender();
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
    this.guides.showSnapLines(activeGuides);
    this.canvas.requestRenderAll();
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
    this.guides.clearAndRender();
  }
  /**
   * Nettoie les ressources
   */
  dispose() {
    this.guides.clear();
    this.canvas.off("object:moving");
    this.canvas.off("object:resizing");
    this.canvas.off("object:modified");
    this.canvas.off("selection:cleared");
  }
};

// src/LayoutManager.ts
import { Point as Point4 } from "#fabric";

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
function isYogaReady() {
  return yoga !== null;
}
function getYoga() {
  if (!yoga) throw new Error("Yoga not initialized. Call initYoga() first.");
  return yoga;
}
function yogaLayout(children, containerLeft, containerTop, containerW, containerH, cd, sizing, allObjects) {
  if (children.length === 0) return { w: 0, h: 0 };
  const Y = getYoga();
  const modeX = sizing.x;
  const modeY = sizing.y;
  const root = Y.Node.create(yogaConfig);
  applyContainerStyle(root, cd, Y);
  if (modeX === "fixed") root.setWidth(containerW);
  else root.setWidthAuto();
  if (modeY === "fixed") root.setHeight(containerH);
  else root.setHeightAuto();
  applyHugFloor(root, sizing);
  const built = buildChildren(root, children, cd, sizing, allObjects, Y);
  root.calculateLayout(
    modeX === "fixed" ? containerW : void 0,
    modeY === "fixed" ? containerH : void 0
  );
  placeChildren(built, containerLeft, containerTop, 0);
  const w = root.getComputedWidth();
  const h = root.getComputedHeight();
  root.freeRecursive();
  return { w, h };
}
function applyContainerStyle(node, cd, Y) {
  const isColumn = (cd.flexDirection ?? "column") === "column";
  node.setFlexDirection(isColumn ? Y.FLEX_DIRECTION_COLUMN : Y.FLEX_DIRECTION_ROW);
  node.setAlignItems(mapAlignItems(cd.alignItems ?? "flex-start", Y));
  node.setJustifyContent(mapJustifyContent(cd.justifyContent ?? "flex-start", Y));
  const gap = cd.gap ?? 0;
  if (gap > 0) node.setGap(isColumn ? Y.GUTTER_ROW : Y.GUTTER_COLUMN, gap);
  const pad = cd.padding;
  if (pad) {
    node.setPadding(Y.EDGE_TOP, pad.top);
    node.setPadding(Y.EDGE_RIGHT, pad.right);
    node.setPadding(Y.EDGE_BOTTOM, pad.bottom);
    node.setPadding(Y.EDGE_LEFT, pad.left);
  }
}
function applyHugFloor(node, sizing) {
  const minSize = sizing.minSize;
  if (!minSize) return;
  if (sizing.x === "hug" && minSize.w > 0) node.setMinWidth(minSize.w);
  if (sizing.y === "hug" && minSize.h > 0) node.setMinHeight(minSize.h);
}
function nestedChildren(obj, allObjects) {
  if (!allObjects || isTextObject(obj)) return null;
  const layout = obj.get("layout");
  if (!layout?.container) return null;
  const children = sortChildrenByOrder(resolveContainerChildren(allObjects, obj));
  return children.length > 0 ? children : null;
}
function buildChildren(parent, children, cd, sizing, allObjects, Y) {
  const isColumn = (cd.flexDirection ?? "column") === "column";
  const alignItems = cd.alignItems ?? "flex-start";
  for (const { obj } of children) {
    if (isTextObject(obj)) continue;
    const ext = obj;
    if (ext._layoutIntrinsic) {
      setShapeSize(obj, ext._layoutIntrinsic.w, ext._layoutIntrinsic.h);
      delete ext._layoutIntrinsic;
    }
  }
  const built = [];
  for (let i = 0; i < children.length; i++) {
    const { obj, cl } = children[i];
    const node = Y.Node.create(yogaConfig);
    const alignSelf = cl.alignSelf ?? "auto";
    if (alignSelf !== "auto") node.setAlignSelf(mapAlignSelf(alignSelf, Y));
    const flexGrow = cl.flexGrow ?? 0;
    if (flexGrow > 0) node.setFlexGrow(flexGrow);
    const effectiveAlign = alignSelf !== "auto" ? alignSelf : alignItems;
    const willStretch = effectiveAlign === "stretch";
    const entry = { obj, node };
    const nested = nestedChildren(obj, allObjects);
    const mainHug = nested && (isColumn ? sizingOf(obj).y : sizingOf(obj).x) === "hug";
    node.setFlexShrink(isTextObject(obj) || mainHug ? 1 : 0);
    if (isTextObject(obj)) {
      setupTextMeasure(node, obj, Y);
    } else if (nested) {
      const childCd = obj.get("layout").container;
      const childSizing = sizingOf(obj);
      applyContainerStyle(node, childCd, Y);
      setNestedSize(node, obj, childSizing, { isColumn, willStretch, parentSizing: sizing, flexGrow });
      entry.children = buildChildren(node, nested, childCd, childSizing, allObjects, Y);
    } else {
      setRigidSize(node, obj, { isColumn, willStretch, parentSizing: sizing, flexGrow });
    }
    parent.insertChild(node, i);
    built.push(entry);
  }
  return built;
}
function setRigidSize(node, obj, slot) {
  const { isColumn, willStretch, parentSizing, flexGrow } = slot;
  const { w, h } = scaledSize(obj);
  if (isColumn) {
    node.setHeight(h);
    if (!willStretch || parentSizing.x === "hug") node.setWidth(w);
  } else {
    node.setWidth(w);
    if (!willStretch || parentSizing.y === "hug") node.setHeight(h);
  }
  if (flexGrow > 0) {
    if (isColumn) node.setHeightAuto();
    else node.setWidthAuto();
  }
}
function setNestedSize(node, obj, sizing, slot) {
  const { isColumn, willStretch, parentSizing, flexGrow } = slot;
  const { w, h } = scaledSize(obj);
  const parentCrossIsHug = isColumn ? parentSizing.x === "hug" : parentSizing.y === "hug";
  const main = isColumn ? sizing.y : sizing.x;
  const cross = isColumn ? sizing.x : sizing.y;
  const setMain = (v) => isColumn ? node.setHeight(v) : node.setWidth(v);
  const setCross = (v) => isColumn ? node.setWidth(v) : node.setHeight(v);
  if (main === "fixed" && flexGrow === 0) setMain(isColumn ? h : w);
  if (cross === "fixed" && (!willStretch || parentCrossIsHug)) setCross(isColumn ? w : h);
  applyHugFloor(node, sizing);
}
function placeChildren(built, parentLeft, parentTop, depth) {
  for (const { obj, node, children } of built) {
    const left = parentLeft + node.getComputedLeft();
    const top = parentTop + node.getComputedTop();
    const computedW = node.getComputedWidth();
    const computedH = node.getComputedHeight();
    const currentSize = scaledSize(obj);
    const changedW = Math.abs(computedW - currentSize.w) > 0.5;
    const changedH = Math.abs(computedH - currentSize.h) > 0.5;
    if (isTextObject(obj)) {
      if (changedW || changedH) obj.layoutWith({ w: computedW, h: computedH });
    } else {
      const ext = obj;
      if (!children && (computedW < currentSize.w - 0.5 || computedH < currentSize.h - 0.5) && !ext._layoutIntrinsic) {
        ext._layoutIntrinsic = currentSize;
      }
      if (changedW || changedH) {
        setShapeSize(obj, changedW ? computedW : currentSize.w, changedH ? computedH : currentSize.h);
      }
    }
    const { w: childW, h: childH } = scaledSize(obj);
    const objLeft = obj.originX === "center" ? left + childW / 2 : obj.originX === "right" ? left + childW : left;
    const objTop = obj.originY === "center" ? top + childH / 2 : obj.originY === "bottom" ? top + childH : top;
    obj.set({ left: objLeft, top: objTop });
    if (depth > 0) obj.setCoords();
    if (children) placeChildren(children, left, top, depth + 1);
  }
}
function mapAlignItems(align, Y) {
  switch (align) {
    case "stretch":
      return Y.ALIGN_STRETCH;
    case "flex-start":
      return Y.ALIGN_FLEX_START;
    case "flex-end":
      return Y.ALIGN_FLEX_END;
    case "center":
      return Y.ALIGN_CENTER;
    default:
      return Y.ALIGN_FLEX_START;
  }
}
function mapAlignSelf(align, Y) {
  switch (align) {
    case "stretch":
      return Y.ALIGN_STRETCH;
    case "flex-start":
      return Y.ALIGN_FLEX_START;
    case "flex-end":
      return Y.ALIGN_FLEX_END;
    case "center":
      return Y.ALIGN_CENTER;
    default:
      return Y.ALIGN_AUTO;
  }
}
function mapJustifyContent(justify, Y) {
  switch (justify) {
    case "flex-start":
      return Y.JUSTIFY_FLEX_START;
    case "flex-end":
      return Y.JUSTIFY_FLEX_END;
    case "center":
      return Y.JUSTIFY_CENTER;
    case "space-between":
      return Y.JUSTIFY_SPACE_BETWEEN;
    case "space-around":
      return Y.JUSTIFY_SPACE_AROUND;
    default:
      return Y.JUSTIFY_FLEX_START;
  }
}
function setupTextMeasure(node, obj, Y) {
  const t = obj;
  node.setMeasureFunc((width, widthMode) => {
    if (widthMode === Y.MEASURE_MODE_EXACTLY) t.layoutWith({ w: width });
    else if (widthMode === Y.MEASURE_MODE_AT_MOST) t.layoutWith({ maxW: width });
    else t.layoutWith({});
    const { w, h } = scaledSize(obj);
    return { width: w, height: h };
  });
}

// src/layout/reconcile.ts
function runLayout(objects) {
  for (const obj of objects) {
    const layout = obj.get("layout");
    if (!layout?.container) continue;
    if (parentContainerOf(obj, objects)) continue;
    const children = sortChildrenByOrder(resolveContainerChildren(objects, obj));
    if (children.length === 0) continue;
    layoutContainer(obj, layout.container, children, objects);
  }
}
function relayoutSingle(container, cd, allObjects) {
  const children = sortChildrenByOrder(resolveContainerChildren(allObjects, container));
  if (children.length === 0) return;
  layoutContainer(container, cd, children, allObjects);
}
function bubbleUpLayout(container, allObjects) {
  let current = container;
  for (; ; ) {
    const parent = parentContainerOf(current, allObjects);
    if (!parent) return;
    relayoutSingle(parent, parent.get("layout").container, allObjects);
    current = parent;
  }
}
function parentContainerOf(obj, objects) {
  const layout = obj.get?.("layout");
  const parentId = layout?.child?.parentId;
  if (!parentId) return null;
  const parent = objects.find((o) => o.get("layerId") === parentId);
  if (!parent || parent === obj) return null;
  const pLayout = parent.get?.("layout");
  return pLayout?.container ? parent : null;
}
function layoutContainer(container, cd, children, allObjects) {
  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;
  const { w: visW, h: visH } = scaledSize(container);
  const currentW = sizing.x === "hug" ? Math.max(visW, minW) : visW;
  const currentH = sizing.y === "hug" ? Math.max(visH, minH) : visH;
  const tl = topLeft(container);
  const { w: requiredW, h: requiredH } = yogaLayout(
    children,
    tl.x,
    tl.y,
    currentW,
    currentH,
    cd,
    sizing,
    allObjects
  );
  const finalW = sizing.x === "hug" ? Math.max(requiredW, minW) : currentW;
  const finalH = sizing.y === "hug" ? Math.max(requiredH, minH) : currentH;
  setShapeSize(container, finalW, finalH);
  if (finalW !== currentW || finalH !== currentH) {
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd, sizing, allObjects);
  }
  syncCoords(container, children);
}

// src/layout/room.ts
var UNBOUNDED = { w: Infinity, h: Infinity };
function availableRoom(obj, objects) {
  const parent = parentContainerOf(obj, objects);
  if (!parent) return UNBOUNDED;
  const cd = parent.get("layout").container;
  const sizing = sizingOf(parent);
  const own = scaledSize(parent);
  const above = availableRoom(parent, objects);
  const pad = cd.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  let w = (sizing.x === "fixed" ? own.w : above.w) - pad.left - pad.right;
  let h = (sizing.y === "fixed" ? own.h : above.h) - pad.top - pad.bottom;
  const siblings = resolveContainerChildren(objects, parent).filter((c) => c.obj !== obj);
  const gaps = (cd.gap ?? 0) * siblings.length;
  const taken = siblings.map(({ obj: s }) => minSizeOf(s, objects));
  if (cd.flexDirection === "row") w -= taken.reduce((sum, s) => sum + s.w, 0) + gaps;
  else h -= taken.reduce((sum, s) => sum + s.h, 0) + gaps;
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

// src/layout/resize-session.ts
var ResizeSession = class {
  constructor(container, corner) {
    /**
     * Fixed widths of the text children at grab time: the container pushes them
     * when it gets narrower, and they grow back if the user widens it again
     * within the same drag. What remains at release is kept.
     */
    this.textWidths = /* @__PURE__ */ new Map();
    /** Smallest box the content fits in (computed at grab): the handles stop there. */
    this.minContent = null;
    /** Largest box the ancestors allow (computed at grab): the handles stop there too. */
    this.room = null;
    this.container = container;
    const layout = container.get("layout");
    this.containerData = layout.container;
    this.axes = cornerToAxes(corner);
    this.corner = corner;
    const current = sizingOf(container);
    this.sizing = this.axes.x && current.x === "hug" ? { ...current, x: "fixed" } : { ...current };
    container.set("layout", { ...layout, sizing: this.sizing });
    const { w, h } = scaledSize(container);
    this.userW = w;
    this.userH = h;
  }
  /**
   * Resize keeping the edge opposite to the dragged handle in place — when the
   * content stops the handle, the grabbed edge stops, not the other one.
   */
  setSizeKeepingAnchor(w, h) {
    const { container, corner } = this;
    const originX = corner?.includes("l") ? "right" : corner?.includes("r") ? "left" : "center";
    const originY = corner?.includes("t") ? "bottom" : corner?.includes("b") ? "top" : "center";
    const anchor = container.getPositionByOrigin(originX, originY);
    setShapeSize(container, w, h);
    container.setPositionByOrigin(anchor, originX, originY);
  }
  restoreTextWidths(children) {
    for (const { obj } of children) {
      if (!isTextObject(obj) || sizingOf(obj).x !== "fixed") continue;
      const grabbed = this.textWidths.get(obj);
      if (grabbed == null) this.textWidths.set(obj, obj.width);
      else if (obj.width !== grabbed) {
        obj.layoutWith({});
        obj.set({ width: grabbed });
      }
    }
  }
  /**
   * Called on each `object:resizing` frame.
   * Controls already set width/height directly (no scale involved).
   */
  handleResizing(objects) {
    const { container, containerData: cd, sizing, axes } = this;
    this.room ?? (this.room = availableRoom(container, objects));
    const { w: currentW, h: currentH } = scaledSize(container);
    if (axes.x) this.userW = Math.min(currentW, this.room.w);
    if (axes.y) this.userH = Math.min(currentH, this.room.h);
    const children = sortChildrenByOrder(resolveContainerChildren(objects, container));
    if (children.length === 0) {
      this.setSizeKeepingAnchor(this.userW, this.userH);
      this.settle(objects);
      return;
    }
    this.restoreTextWidths(children);
    this.minContent ?? (this.minContent = minContentSize(children, cd, objects));
    const live = { x: sizing.x, y: sizing.y };
    const tl = topLeft(container);
    const { w: requiredW, h: requiredH } = yogaLayout(
      children,
      tl.x,
      tl.y,
      currentW,
      currentH,
      cd,
      live,
      objects
    );
    const prevMinW = sizing.minSize?.w ?? 0;
    const prevMinH = sizing.minSize?.h ?? 0;
    const finalW = sizing.x === "hug" ? Math.max(axes.x ? this.userW : prevMinW, requiredW) : Math.max(Math.min(currentW, this.room.w), this.minContent.w);
    const finalH = sizing.y === "hug" ? Math.max(axes.y ? this.userH : prevMinH, requiredH) : Math.max(Math.min(currentH, this.room.h), this.minContent.h);
    this.setSizeKeepingAnchor(finalW, finalH);
    const placed = { ...live, minSize: { w: finalW, h: finalH } };
    const tl2 = topLeft(container);
    yogaLayout(children, tl2.x, tl2.y, finalW, finalH, cd, placed, objects);
    syncCoords(container, children);
    this.settle(objects);
  }
  /** Called on `object:modified`: the floor is already written, nothing left to do. */
  commit(_objects) {
  }
  /**
   * On a hug axis the user drags, what they drag is the floor — under the content
   * it's harmless (the box is max(content, floor)). Written on every frame, so the
   * ancestors' pass sees the same box as this one.
   */
  persistFloor() {
    const { container, sizing, axes } = this;
    const dragsHugX = sizing.x === "hug" && axes.x;
    const dragsHugY = sizing.y === "hug" && axes.y;
    if (!dragsHugX && !dragsHugY) return;
    const minSize = { w: sizing.minSize?.w ?? 0, h: sizing.minSize?.h ?? 0 };
    if (dragsHugX) minSize.w = this.userW;
    if (dragsHugY) minSize.h = this.userH;
    this.sizing = { ...sizing, minSize };
    const layout = container.get("layout");
    container.set("layout", { ...layout, sizing: this.sizing });
  }
  /** A child container: its ancestors take its new size in, and it sits in its slot. */
  settle(objects) {
    this.persistFloor();
    const parent = parentContainerOf(this.container, objects);
    if (!parent) return;
    relayoutSingle(parent, parent.get("layout").container, objects);
    bubbleUpLayout(parent, objects);
  }
};
function minContentSize(children, cd, objects) {
  const pad = cd.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const gaps = (cd.gap ?? 0) * Math.max(0, children.length - 1);
  const sizes = children.map(({ obj }) => minSizeOf(obj, objects));
  const sum = (key) => sizes.reduce((total, s) => total + s[key], 0);
  const max = (key) => Math.max(0, ...sizes.map((s) => s[key]));
  const row = cd.flexDirection === "row";
  return {
    w: pad.left + pad.right + (row ? sum("w") + gaps : max("w")),
    h: pad.top + pad.bottom + (row ? max("h") : sum("h") + gaps)
  };
}
function minSizeOf(obj, objects) {
  if (isTextObject(obj)) return { w: obj.minContentWidth(), h: 0 };
  const size = scaledSize(obj);
  const layout = obj.get("layout");
  if (!layout?.container) return size;
  const children = sortChildrenByOrder(resolveContainerChildren(objects, obj));
  if (children.length === 0) return size;
  const sizing = sizingOf(obj);
  const min = minContentSize(children, layout.container, objects);
  return {
    w: sizing.x === "hug" ? Math.max(min.w, sizing.minSize?.w ?? 0) : size.w,
    h: sizing.y === "hug" ? Math.max(min.h, sizing.minSize?.h ?? 0) : size.h
  };
}

// src/layout/containerize-session.ts
var EXIT_MARGIN = 5;
var ContainerizeSession = class _ContainerizeSession {
  constructor(canvas, shape, text, cursor) {
    this.canvas = canvas;
    this.shape = shape;
    this.text = text;
    this.anchorCursor = cursor;
    this._isReattach = false;
    this.snapshot = takeSnapshot(shape, text);
    normalizeShapeOrigin(shape);
    applyInitialLayout(shape, text);
    const clampedPos = clampTopLeft(text, shape, MIN_PAD);
    const preTL = topLeft(text);
    this.clampDx = clampedPos.x - preTL.x;
    this.clampDy = clampedPos.y - preTL.y;
    canvas.adjustGrabOffset(this.clampDx, this.clampDy);
    if (this.clampDx !== 0 || this.clampDy !== 0) {
      text.left += this.clampDx;
      text.top += this.clampDy;
      text.setCoords();
    }
    wrapContainerAroundChild(text, shape);
    const textLayout = text.get?.("layout");
    if (textLayout?.container) {
      relayoutSingle(text, textLayout.container, canvas.getObjects());
    }
  }
  /**
   * Create a session for repositioning a child that is already attached.
   * Skips layout creation, origin normalization, and clamp/grab offset.
   * On exit (rollback), the child is detached instead of restored.
   */
  static reattach(canvas, shape, text, cursor) {
    const session = Object.create(_ContainerizeSession.prototype);
    session.canvas = canvas;
    session.shape = shape;
    session.text = text;
    session.anchorCursor = cursor;
    session._isReattach = true;
    session.snapshot = takeSnapshot(shape, text);
    session.clampDx = 0;
    session.clampDy = 0;
    return session;
  }
  /** During drag: clamp text, resize container, check for exit. */
  handleMoving(cursor) {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }
    const clamped = clampTopLeft(this.text, this.shape, MIN_PAD);
    const currentTL = topLeft(this.text);
    const dx = clamped.x - currentTL.x;
    const dy = clamped.y - currentTL.y;
    if (dx !== 0 || dy !== 0) {
      this.text.left += dx;
      this.text.top += dy;
      this.text.setCoords();
    }
    wrapContainerAroundChild(this.text, this.shape);
    const childLayout = this.text.get?.("layout");
    if (childLayout?.container) {
      relayoutSingle(this.text, childLayout.container, this.canvas.getObjects());
    }
    bubbleUpLayout(this.shape, this.canvas.getObjects());
    return "anchored";
  }
  /**
   * Finalize the attach. Text edits relayout through the LayoutManager's
   * canvas-wide `text:changed` listener — nothing to clean up here.
   */
  commit() {
    const tTL = topLeft(this.text);
    this.text.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    this.text.setCoords();
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
    return () => {
    };
  }
  /** Undo anchor: restore snapshot, reverse grab offset. */
  rollback() {
    if (this._isReattach) {
      detachChild(this.text);
      restoreShapeSize(this.shape, this.snapshot.shape);
      this.shape.set("layout", this.snapshot.shape.layout ?? void 0);
      this.shape.setCoords();
      this.text.setCoords();
      this.canvas.renderAll();
      return;
    }
    restoreShapeSize(this.shape, this.snapshot.shape);
    this.shape.set({
      left: this.snapshot.shape.left,
      top: this.snapshot.shape.top,
      originX: this.snapshot.shape.originX,
      originY: this.snapshot.shape.originY,
      stroke: this.snapshot.shape.stroke,
      strokeWidth: this.snapshot.shape.strokeWidth
    });
    this.shape.set("layout", this.snapshot.shape.layout ?? void 0);
    this.text.set({
      left: this.snapshot.text.left,
      top: this.snapshot.text.top,
      originX: this.snapshot.text.originX,
      originY: this.snapshot.text.originY,
      width: this.snapshot.text.width,
      scaleX: this.snapshot.text.scaleX,
      scaleY: this.snapshot.text.scaleY,
      textAlign: this.snapshot.text.textAlign
    });
    this.text.set("layout", this.snapshot.text.layout ?? void 0);
    if (isTextObject(this.text)) this.text.layoutWith(null);
    this.canvas.adjustGrabOffset(-this.clampDx, -this.clampDy);
    this.shape.setCoords();
    this.text.setCoords();
    this.canvas.renderAll();
  }
  /** The shape this session is attached to (for guide rendering). */
  get container() {
    return this.shape;
  }
  /** The text being attached (for guide rendering). */
  get child() {
    return this.text;
  }
  shouldExit(cursor) {
    if (!pointInObject(cursor, this.shape, EXIT_MARGIN)) return true;
    return hasExceededOffset(cursor, this.anchorCursor, this.clampDx, this.clampDy, EXIT_MARGIN);
  }
};
function takeSnapshot(shape, text) {
  return {
    shape: {
      left: shape.left,
      top: shape.top,
      originX: shape.originX,
      originY: shape.originY,
      width: shape.width,
      height: shape.height,
      scaleX: shape.scaleX,
      scaleY: shape.scaleY,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
      layout: cloneLayout(shape)
    },
    text: {
      left: text.left,
      top: text.top,
      originX: text.originX,
      originY: text.originY,
      width: text.width,
      scaleX: text.scaleX,
      scaleY: text.scaleY,
      textAlign: text.textAlign,
      layout: cloneLayout(text)
    }
  };
}
function restoreShapeSize(shape, snap) {
  setShapeSize(shape, snap.width * (snap.scaleX || 1), snap.height * (snap.scaleY || 1));
}
function normalizeShapeOrigin(shape) {
  const center = shape.getRelativeCenterPoint();
  const { w, h } = scaledSize(shape);
  shape.set({
    left: center.x - w / 2,
    top: center.y - h / 2,
    originX: "left",
    originY: "top"
  });
  shape.setCoords();
}
function applyInitialLayout(shape, child) {
  const sTL = topLeft(shape);
  const cTL = topLeft(child);
  const { w: shapeW, h: shapeH } = scaledSize(shape);
  const padX = Math.max(MIN_PAD, Math.round(cTL.x - sTL.x));
  const padY = Math.max(MIN_PAD, Math.round(cTL.y - sTL.y));
  const containerId = shape.get?.("layerId");
  const shapeLayout = shape.get?.("layout") ?? {};
  shape.set("layout", {
    ...shapeLayout,
    sizing: shapeLayout.sizing ?? { x: "hug", y: "hug", minSize: { w: shapeW, h: shapeH } },
    container: { padding: { top: padY, right: padX, bottom: padY, left: padX } }
  });
  const childLayout = child.get?.("layout") ?? {};
  child.set("layout", { ...childLayout, child: { parentId: containerId } });
}
function wrapContainerAroundChild(child, container) {
  const childLayout = child.get?.("layout");
  const containerLayout = container.get?.("layout");
  if (!childLayout?.child || !containerLayout?.container) return;
  const cd = containerLayout.container;
  const { w: childW, h: childH } = scaledSize(child);
  const sTL = topLeft(container);
  const tTL = topLeft(child);
  const padLeft = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padTop = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));
  cd.padding = { top: padTop, right: padLeft, bottom: padTop, left: padLeft };
  container.set("layout", { ...containerLayout });
  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;
  const requiredW = padLeft + childW + padLeft;
  const requiredH = padTop + childH + padTop;
  setShapeSize(container, Math.max(requiredW, minW), Math.max(requiredH, minH));
  container.setCoords();
}

// src/layout/layout-animator.ts
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}
var DEFAULT_DURATION_MS = 180;
var EPSILON = 0.5;
var LayoutAnimator = class {
  constructor(canvas) {
    this.animations = /* @__PURE__ */ new Map();
    this.rafId = null;
    this.canvas = canvas;
  }
  /**
   * Animate an object from `from` to the position Yoga just wrote
   * (`obj.left`, `obj.top`).  The object is immediately set to `from`
   * so the visual transition starts there, while `toLeft/toTop` records
   * where Yoga wants it.
   */
  animate(obj, fromLeft, fromTop, duration = DEFAULT_DURATION_MS) {
    const toLeft = obj.left;
    const toTop = obj.top;
    if (Math.abs(toLeft - fromLeft) < EPSILON && Math.abs(toTop - fromTop) < EPSILON) {
      return;
    }
    const existing = this.animations.get(obj);
    if (existing) {
      const elapsed = performance.now() - existing.startTime;
      const t = Math.min(elapsed / existing.duration, 1);
      const e = easeOutCubic(t);
      fromLeft = existing.fromLeft + (existing.toLeft - existing.fromLeft) * e;
      fromTop = existing.fromTop + (existing.toTop - existing.fromTop) * e;
      if (Math.abs(toLeft - existing.toLeft) < EPSILON && Math.abs(toTop - existing.toTop) < EPSILON) {
        return;
      }
    }
    this.animations.set(obj, {
      fromLeft,
      fromTop,
      toLeft,
      toTop,
      startTime: performance.now(),
      duration
    });
    obj.set({ left: fromLeft, top: fromTop });
    this.ensureLoop();
  }
  /** Return the Yoga target for a mid-animation object, or null. */
  getTarget(obj) {
    const entry = this.animations.get(obj);
    return entry ? { left: entry.toLeft, top: entry.toTop } : null;
  }
  /**
   * Write every animated object's target into obj.left/top so that
   * code reading positions sees stable values, not mid-interpolation.
   * The next tick() resumes visual interpolation normally.
   *
   * @param exclude — object to skip (e.g. the dragged child, whose
   *   position is set by Fabric's drag handler and should not be overwritten).
   */
  flushToTargets(exclude) {
    for (const [obj, entry] of this.animations) {
      if (obj !== exclude) {
        obj.set({ left: entry.toLeft, top: entry.toTop });
      }
    }
  }
  /** Cancel all running animations, leaving objects at their Yoga target. */
  cancelAll() {
    for (const [obj, entry] of this.animations) {
      obj.set({ left: entry.toLeft, top: entry.toTop });
      obj.setCoords();
    }
    this.animations.clear();
    this.stopLoop();
  }
  dispose() {
    this.animations.clear();
    this.stopLoop();
  }
  // ── RAF loop ─────────────────────────────────────────────────────
  ensureLoop() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }
  stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  tick(_ts) {
    this.rafId = null;
    const now = performance.now();
    const done = [];
    for (const [obj, entry] of this.animations) {
      const elapsed = now - entry.startTime;
      const t = Math.min(elapsed / entry.duration, 1);
      const e = easeOutCubic(t);
      const left = entry.fromLeft + (entry.toLeft - entry.fromLeft) * e;
      const top = entry.fromTop + (entry.toTop - entry.fromTop) * e;
      obj.set({ left, top });
      if (t >= 1) {
        done.push(obj);
      }
    }
    for (const obj of done) {
      this.animations.delete(obj);
      obj.setCoords();
    }
    this.canvas.requestRenderAll();
    if (this.animations.size > 0) {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }
};

// src/layout/insert-child-session.ts
var EXIT_MARGIN2 = 5;
var InsertChildSession = class _InsertChildSession {
  constructor(canvas, container, newChild, cursor) {
    /** Current decided direction — cached for hysteresis. null = not yet decided. */
    this._currentDirection = null;
    /** Sibling positions at anchor time — stable reference for gap calculation. */
    this._siblingAnchors = /* @__PURE__ */ new Map();
    /** Size of the dragged child when grabbed — Yoga may squeeze it in later frames. */
    this._newChildAnchorSize = { w: 0, h: 0 };
    /** Last Yoga-computed position of the dragged child (not the cursor position). */
    this._lastDraggedYogaPos = null;
    /** Last computed order — for hysteresis. */
    this._lastOrder = null;
    this.canvas = canvas;
    this._container = container;
    this.newChild = newChild;
    this._newChildAnchorSize = scaledSize(newChild);
    this._isReattach = false;
    this._animator = new LayoutAnimator(canvas);
    const { w: cw, h: ch } = scaledSize(container);
    this.snapshot = {
      containerW: cw,
      containerH: ch,
      containerLeft: container.left,
      containerTop: container.top,
      containerLayout: cloneLayout(container),
      childLeft: newChild.left,
      childTop: newChild.top,
      childLayout: cloneLayout(newChild)
    };
    const existing = sortChildrenByOrder(resolveContainerChildren(canvas.getObjects(), container));
    const cd = container.get?.("layout")?.container;
    this._decidingDirection = existing.length === 1 && !cd?.flexDirection;
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].cl.order == null) {
        existing[i].cl.order = i;
        const childLayout = existing[i].obj.get?.("layout");
        if (childLayout?.child) {
          childLayout.child.order = i;
          existing[i].obj.set("layout", { ...childLayout });
        }
      }
    }
    for (const { obj } of existing) {
      const tl = topLeft(obj);
      const sz = scaledSize(obj);
      this._siblingAnchors.set(obj, { left: tl.x, top: tl.y, w: sz.w, h: sz.h });
    }
    const containerId = container.get?.("layerId");
    const childData = {
      parentId: containerId
    };
    const existingChildLayout = newChild.get?.("layout") ?? {};
    newChild.set("layout", { ...existingChildLayout, child: childData });
    const tTL = topLeft(newChild);
    newChild.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    newChild.setCoords();
    this.updateFromCursor(cursor);
  }
  /**
   * Create a session for repositioning a child that is already in the container.
   * On rollback (drag outside), the child is detached from the container.
   */
  static reattach(canvas, container, child, cursor) {
    const session = Object.create(_InsertChildSession.prototype);
    session.canvas = canvas;
    session._container = container;
    session.newChild = child;
    session._newChildAnchorSize = scaledSize(child);
    session._isReattach = true;
    session._currentDirection = null;
    session._lastOrder = null;
    session._animator = new LayoutAnimator(canvas);
    const { w: cw, h: ch } = scaledSize(container);
    session.snapshot = {
      containerW: cw,
      containerH: ch,
      containerLeft: container.left,
      containerTop: container.top,
      containerLayout: cloneLayout(container),
      childLeft: child.left,
      childTop: child.top,
      childLayout: cloneLayout(child)
    };
    const allChildren = sortChildrenByOrder(resolveContainerChildren(canvas.getObjects(), container));
    session._decidingDirection = allChildren.length <= 2;
    for (let i = 0; i < allChildren.length; i++) {
      if (allChildren[i].cl.order == null) {
        allChildren[i].cl.order = i;
        const cl = allChildren[i].obj.get?.("layout");
        if (cl?.child) {
          cl.child.order = i;
          allChildren[i].obj.set("layout", { ...cl });
        }
      }
    }
    session._siblingAnchors = /* @__PURE__ */ new Map();
    for (const { obj } of allChildren) {
      if (obj !== child) {
        const tl = topLeft(obj);
        const sz = scaledSize(obj);
        session._siblingAnchors.set(obj, { left: tl.x, top: tl.y, w: sz.w, h: sz.h });
      }
    }
    session.updateFromCursor(cursor);
    return session;
  }
  handleMoving(cursor) {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }
    this.updateFromCursor(cursor);
    return "anchored";
  }
  commit() {
    const layout = this._container.get?.("layout");
    const { w, h } = scaledSize(this._container);
    this._container.set("layout", { ...layout, sizing: { ...sizingOf(this._container), minSize: { w, h } } });
    const allChildren = resolveContainerChildren(this.canvas.getObjects(), this._container);
    const positionsBefore = /* @__PURE__ */ new Map();
    for (const { obj } of allChildren) {
      positionsBefore.set(obj, { left: obj.left, top: obj.top });
    }
    runLayout(this.canvas.getObjects());
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }
    this.canvas.renderAll();
    return () => {
    };
  }
  rollback() {
    this._animator.cancelAll();
    if (this._isReattach) {
      detachChild(this.newChild);
      this._container.set("layout", this.snapshot.containerLayout ?? void 0);
      this._container.set({ left: this.snapshot.containerLeft, top: this.snapshot.containerTop });
      setShapeSize(this._container, this.snapshot.containerW, this.snapshot.containerH);
      this._container.setCoords();
      this.newChild.setCoords();
      const remaining = resolveContainerChildren(this.canvas.getObjects(), this._container);
      if (remaining.length <= 1) {
        const cLayout = this._container.get?.("layout");
        if (cLayout?.container) {
          delete cLayout.container.flexDirection;
          delete cLayout.container.gap;
          this._container.set("layout", { ...cLayout });
        }
      }
      runLayout(this.canvas.getObjects());
      this.canvas.renderAll();
      return;
    }
    detachChild(this.newChild);
    this.newChild.set("layout", this.snapshot.childLayout ?? void 0);
    this.newChild.set({ left: this.snapshot.childLeft, top: this.snapshot.childTop });
    this.newChild.setCoords();
    this._container.set("layout", this.snapshot.containerLayout ?? void 0);
    this._container.set({ left: this.snapshot.containerLeft, top: this.snapshot.containerTop });
    setShapeSize(this._container, this.snapshot.containerW, this.snapshot.containerH);
    this._container.setCoords();
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }
  get container() {
    return this._container;
  }
  get child() {
    return this.newChild;
  }
  // ── Private ───────────────────────────────────────────────────────
  shouldExit(cursor) {
    return !pointInObject(cursor, this._container, EXIT_MARGIN2);
  }
  /**
   * Session decides direction + order from cursor, then asks yoga
   * to preview positions. Only OTHER children are repositioned;
   * the dragged child stays under the cursor.
   */
  updateFromCursor(cursor) {
    this._animator.flushToTargets(this.newChild);
    const containerLayout = this._container.get?.("layout");
    const cd = containerLayout.container;
    const allChildren = sortChildrenByOrder(
      resolveContainerChildren(this.canvas.getObjects(), this._container)
    );
    const otherChildren = allChildren.filter((c) => c.obj !== this.newChild);
    const isColumn = (cd.flexDirection ?? "column") === "column";
    if (this._decidingDirection && otherChildren.length === 1) {
      const direction = this.detectDirection(cursor, otherChildren[0]);
      cd.flexDirection = direction;
      const dirIsColumn = direction === "column";
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, dirIsColumn);
      const gap = this.computeGap(cursor, otherChildren, insertOrder, dirIsColumn);
      cd.gap = Math.min(gap, this.freeMainSpace(otherChildren, dirIsColumn));
      this._container.set("layout", { ...containerLayout });
      const layout = this.newChild.get?.("layout");
      if (layout?.child) {
        layout.child.order = insertOrder;
        this.newChild.set("layout", { ...layout });
      }
    } else {
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, isColumn);
      const layout = this.newChild.get?.("layout");
      if (layout?.child) {
        layout.child.order = insertOrder;
        this.newChild.set("layout", { ...layout });
      }
    }
    this.previewLayout(allChildren);
  }
  /**
   * Detect flex direction from cursor position relative to the existing child.
   * The key insight: we measure where the cursor is relative to the child's
   * bounding box edges, not its center. This way "bottom-right of child"
   * correctly detects that dy > dx when the cursor is clearly below.
   *
   * Hysteresis: once a direction is chosen, require a clear margin to switch.
   */
  detectDirection(cursor, existingChild) {
    const anchor = this._siblingAnchors.get(existingChild.obj);
    const childX = anchor ? anchor.left : topLeft(existingChild.obj).x;
    const childY = anchor ? anchor.top : topLeft(existingChild.obj).y;
    const childW = anchor ? anchor.w : scaledSize(existingChild.obj).w;
    const childH = anchor ? anchor.h : scaledSize(existingChild.obj).h;
    const dx = Math.max(0, cursor.x - (childX + childW), childX - cursor.x);
    const dy = Math.max(0, cursor.y - (childY + childH), childY - cursor.y);
    if (this._currentDirection === null) {
      this._currentDirection = dy >= dx ? "column" : "row";
      return this._currentDirection;
    }
    const SWITCH_RATIO = 1.3;
    if (this._currentDirection === "column" && dx > dy * SWITCH_RATIO) {
      this._currentDirection = "row";
    } else if (this._currentDirection === "row" && dy > dx * SWITCH_RATIO) {
      this._currentDirection = "column";
    }
    return this._currentDirection;
  }
  /**
   * Compute the insertion order based on cursor position in the main axis.
   * The swap threshold is the **far edge** of each sibling — the dragged
   * child swaps once it fully passes the sibling.
   *
   * Uses anchored sibling positions to avoid feedback loops with Yoga.
   */
  computeInsertOrder(cursor, existingChildren, isColumn) {
    if (existingChildren.length === 0) return 0;
    const cursorPos = isColumn ? cursor.y : cursor.x;
    const slots = [];
    for (let i = 0; i <= existingChildren.length; i++) {
      let order;
      if (i === 0) {
        order = (existingChildren[0].cl.order ?? 0) - 1;
      } else if (i === existingChildren.length) {
        order = (existingChildren[existingChildren.length - 1].cl.order ?? existingChildren.length - 1) + 1;
      } else {
        const prevOrder = existingChildren[i - 1].cl.order ?? i - 1;
        const nextOrder = existingChildren[i].cl.order ?? i;
        order = (prevOrder + nextOrder) / 2;
      }
      let boundary;
      if (i > 0) {
        const prev = existingChildren[i - 1];
        const anchor = this._siblingAnchors.get(prev.obj);
        if (anchor) {
          boundary = isColumn ? anchor.top + anchor.h : anchor.left + anchor.w;
        } else {
          const tl = topLeft(prev.obj);
          const sz = scaledSize(prev.obj);
          boundary = isColumn ? tl.y + sz.h : tl.x + sz.w;
        }
      } else {
        boundary = -Infinity;
      }
      slots.push({ order, boundary });
    }
    for (let i = slots.length - 1; i >= 0; i--) {
      if (cursorPos >= slots[i].boundary) {
        this._lastOrder = slots[i].order;
        return slots[i].order;
      }
    }
    this._lastOrder = slots[0].order;
    return slots[0].order;
  }
  /**
   * Room the gap may take on the main axis: unlimited when the container hugs
   * it (it grows), else the inner size minus the children's sizes when grabbed
   * — the gap stops when they reach the edge instead of squeezing them.
   */
  freeMainSpace(existingChildren, isColumn) {
    const sizing = sizingOf(this._container);
    if ((isColumn ? sizing.y : sizing.x) === "hug") return Infinity;
    const cd = (this._container.get?.("layout")).container;
    const pad = cd.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const { w, h } = scaledSize(this._container);
    const inner = isColumn ? h - pad.top - pad.bottom : w - pad.left - pad.right;
    const main = (size) => isColumn ? size.h : size.w;
    let used = main(this._newChildAnchorSize);
    for (const { obj } of existingChildren) {
      const anchor = this._siblingAnchors.get(obj);
      used += main(anchor ?? scaledSize(obj));
    }
    return Math.max(0, Math.floor(inner - used));
  }
  /**
   * Compute the gap between children from the cursor's distance to the
   * nearest neighbor in the main axis. The gap is the space between the
   * cursor and the nearest edge of an existing child, minus the new child's
   * half-size (since the cursor is roughly at the child's center).
   */
  computeGap(cursor, existingChildren, insertOrder, isColumn) {
    if (existingChildren.length === 0) return 0;
    const cursorPos = isColumn ? cursor.y : cursor.x;
    const newChildSize = scaledSize(this.newChild);
    const newChildHalf = isColumn ? newChildSize.h / 2 : newChildSize.w / 2;
    let minDist = Infinity;
    for (const child of existingChildren) {
      const anchor = this._siblingAnchors.get(child.obj);
      if (!anchor) continue;
      const farEdge = isColumn ? anchor.top + anchor.h : anchor.left + anchor.w;
      const childOrder = child.cl.order ?? 0;
      let dist;
      if (childOrder < insertOrder) {
        dist = cursorPos - newChildHalf - farEdge;
      } else {
        dist = farEdge - (cursorPos + newChildHalf);
      }
      if (dist >= 0 && dist < minDist) minDist = dist;
    }
    return isFinite(minDist) ? Math.max(0, Math.round(minDist)) : 0;
  }
  /**
   * Ask yoga to compute positions for ALL children including the dragged one.
   * Yoga positions everyone into their flex slots — the dragged child snaps
   * to its computed position. The session controls direction + order, yoga
   * just calculates where things go.
   *
   * Container grows if needed (never shrinks during session).
   */
  previewLayout(allChildren) {
    const containerLayout = this._container.get?.("layout");
    const cd = containerLayout.container;
    const sizing = sizingOf(this._container);
    const { w: currentW, h: currentH } = scaledSize(this._container);
    const minW = sizing.minSize?.w ?? 0;
    const minH = sizing.minSize?.h ?? 0;
    const containerTL = topLeft(this._container);
    const positionsBefore = this.captureChildPositions(allChildren);
    const modeX = sizing.x;
    const modeY = sizing.y;
    const measureW = modeX === "hug" ? minW : currentW;
    const measureH = modeY === "hug" ? minH : currentH;
    const objects = this.canvas.getObjects();
    const { w: requiredW, h: requiredH } = yogaLayout(
      allChildren,
      containerTL.x,
      containerTL.y,
      measureW,
      measureH,
      cd,
      sizing,
      objects
    );
    const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
    const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;
    if (finalW !== currentW || finalH !== currentH) {
      setShapeSize(this._container, finalW, finalH);
      const tl2 = topLeft(this._container);
      yogaLayout(allChildren, tl2.x, tl2.y, finalW, finalH, cd, sizing, objects);
    }
    syncCoords(this._container, allChildren);
    this._lastDraggedYogaPos = { left: this.newChild.left, top: this.newChild.top };
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }
    if (finalW !== currentW || finalH !== currentH) {
      bubbleUpLayout(this._container, this.canvas.getObjects());
    }
  }
  /** Snapshot all children positions using animator targets when available. */
  captureChildPositions(allChildren) {
    const map = /* @__PURE__ */ new Map();
    for (const { obj } of allChildren) {
      const target = this._animator.getTarget(obj);
      if (target) {
        map.set(obj, target);
      } else if (obj === this.newChild && this._lastDraggedYogaPos) {
        map.set(obj, this._lastDraggedYogaPos);
      } else {
        map.set(obj, { left: obj.left, top: obj.top });
      }
    }
    return map;
  }
};

// src/LayoutManager.ts
var HOVER_DELAY_MS = 700;
var ANCHOR_DELAY_MS = 500;
var LayoutManager2 = class {
  constructor(canvas, callbacks = {}, guideColor) {
    this.dtl = { phase: "idle", cooldownUntil: 0 };
    this.resizeSession = null;
    // ── Event wiring ──────────────────────────────────────────────────
    this.onMovingBound = (e) => this.onMoving(e);
    this.onModifiedBound = (e) => this.onModified(e);
    this.onResizingBound = (e) => this.onResizing(e);
    this.onTextChangedBound = (e) => this.onTextChanged(e);
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.guides = new CanvasGuides(canvas, guideColor);
    this.setupEventListeners();
  }
  /** Set or update callbacks after construction (merges with existing). */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  // ── Public API ────────────────────────────────────────────────────
  /** Run layout on all canvas objects (programmatic relayout). */
  relayout() {
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }
  /**
   * Set the size mode of a container or a text:
   * - "hug": width and height follow the content
   * - "hug-y": fixed width (texts wrap), height follows the content
   * - "fixed": fixed width and height (texts apply their overflow)
   * The floor set by the handles (`minSize`) is kept.
   */
  setMode(obj, mode) {
    const layout = obj.get("layout");
    const isText = isTextObject(obj);
    if (!layout?.container && !isText) return;
    const current = sizingOf(obj);
    const axes = {
      "hug": { x: "hug", y: "hug" },
      "hug-y": { x: "fixed", y: "hug" },
      "fixed": { x: "fixed", y: "fixed" }
    };
    const sizing = { ...current, ...axes[mode] };
    if (isText) obj.setSizing(sizing);
    else obj.set("layout", { ...layout, sizing });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** What a text does when its box is smaller than its content. */
  setOverflow(obj, overflow) {
    if (!isTextObject(obj)) return;
    obj.setTextOverflow(overflow);
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update padding on a container. */
  setPadding(obj, side, value) {
    const layout = obj.get("layout");
    if (!layout?.container) return;
    if (!layout.container.padding) layout.container.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    layout.container.padding[side] = value;
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update alignSelf on a child layout object. */
  setAlignSelf(obj, value) {
    const layout = obj.get("layout");
    if (!layout?.child) return;
    layout.child.alignSelf = value;
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update gap on a container. */
  setGap(obj, value) {
    const layout = obj.get("layout");
    if (!layout?.container) return;
    layout.container.gap = Math.max(0, value);
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update flex direction on a container. */
  setFlexDirection(obj, direction) {
    const layout = obj.get("layout");
    if (!layout?.container) return;
    layout.container.flexDirection = direction;
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update alignItems on a container. */
  setAlignItems(obj, value) {
    const layout = obj.get("layout");
    if (!layout?.container) return;
    layout.container.alignItems = value;
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** Update justifyContent on a container. */
  setJustifyContent(obj, value) {
    const layout = obj.get("layout");
    if (!layout?.container) return;
    layout.container.justifyContent = value;
    obj.set("layout", { ...layout });
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  // ── External drag API ──────────────────────────────────────────────
  //
  // These methods let an external drag source (e.g. DropHandler during
  // an HTML drag) drive the same DTL state machine that object:moving
  // normally drives. The source object does NOT need to be on the canvas
  // yet — it will be added automatically when the session anchors.
  /**
   * Advance the DTL state machine for an externally-dragged object.
   * Call this on every dragover frame with the source object and the
   * cursor position in scene coordinates.
   *
   * The source's position is updated to follow the cursor.
   */
  tickExternalDrag(source, cursor) {
    source.setPositionByOrigin(new Point4(cursor.x, cursor.y), "center", "center");
    source.setCoords();
    switch (this.dtl.phase) {
      case "anchored":
        this.handleAnchoredMoving(cursor);
        break;
      case "pending":
        this.handlePendingMoving(source, cursor);
        break;
      case "hovering":
        this.handleHoveringMoving(source, cursor);
        break;
      case "idle":
        this.handleIdleMoving(source, cursor);
        break;
    }
    if (this.canvas.getObjects().includes(source)) {
      this.canvas.requestRenderAll();
    }
  }
  /**
   * Commit the current DTL session from an external drag.
   * Call this on drop. No-op if no session is active (the caller should
   * handle the "simple add" case itself).
   *
   * Returns true if a session was committed, false otherwise.
   */
  commitExternalDrag() {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return true;
    }
    this.resetToIdle();
    return false;
  }
  /**
   * Rollback any in-progress DTL state from an external drag.
   * Call this on dragleave / cancel. Rolls back the session if anchored,
   * clears timers otherwise. The caller owns the source object and is
   * responsible for removing it from the canvas.
   */
  rollbackExternalDrag() {
    if (this.dtl.phase === "anchored") {
      this.dtl.session.rollback();
    }
    this.resetToIdle();
  }
  /** Whether the DTL state machine is currently in ANCHORED phase. */
  get isAnchored() {
    return this.dtl.phase === "anchored";
  }
  /** Clean up event listeners. */
  dispose() {
    this.resetToIdle();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:resizing", this.onResizingBound);
    this.canvas.off("text:changed", this.onTextChangedBound);
  }
  setupEventListeners() {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:resizing", this.onResizingBound);
    this.canvas.on("text:changed", this.onTextChangedBound);
  }
  // ── Canvas event handlers ─────────────────────────────────────────
  onMoving(e) {
    const obj = e.target;
    const layout = obj.get?.("layout");
    if (layout?.container) {
      const isSessionChild = this.dtl.phase === "anchored" && this.dtl.session.child === obj;
      if (!isSessionChild) {
        relayoutSingle(obj, layout.container, this.canvas.getObjects());
        this.canvas.renderAll();
      }
    }
    if (layout?.child && this.dtl.phase !== "anchored") {
      const activeGroup = this.callbacks.getActiveGroupId?.();
      if (activeGroup === layout.child.parentId) {
        const container = this.canvas.getObjects().find(
          (o) => o.get("layerId") === layout.child.parentId
        );
        if (container) {
          const cursor2 = this.canvas.getScenePoint(e.e);
          const siblings = resolveContainerChildren(this.canvas.getObjects(), container).filter((c) => c.obj !== obj);
          let session;
          if (siblings.length > 0) {
            session = InsertChildSession.reattach(this.canvas, container, obj, cursor2);
          } else {
            session = ContainerizeSession.reattach(this.canvas, container, obj, cursor2);
          }
          this.showSessionGuides(session);
          this.canvas.renderAll();
          this.dtl = { phase: "anchored", session, cooldownUntil: 0, source: obj, root: null };
        }
        return;
      }
    }
    if (layout?.child && this.dtl.phase !== "anchored") return;
    const cursor = this.canvas.getScenePoint(e.e);
    switch (this.dtl.phase) {
      case "anchored":
        this.handleAnchoredMoving(cursor);
        break;
      case "pending":
        this.handlePendingMoving(obj, cursor);
        break;
      case "hovering":
        this.handleHoveringMoving(obj, cursor);
        break;
      case "idle":
        this.handleIdleMoving(obj, cursor);
        break;
    }
  }
  /** A text inside a container was edited → its ancestors adapt. */
  onTextChanged(e) {
    const layout = e.target?.get?.("layout");
    if (!layout?.child) return;
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  onModified(e) {
    const obj = e.target;
    const childLayout = obj?.get?.("layout");
    if (childLayout?.child && isTextObject(obj) && this.dtl.phase === "idle" && e.transform?.action === "resizing") {
      this.relayout();
      this.callbacks.onLayoutChanged?.();
      return;
    }
    const layout = obj.get?.("layout");
    if (layout?.container) {
      if (this.resizeSession) {
        this.resizeSession.commit(this.canvas.getObjects());
        this.resizeSession = null;
      }
      this.relayout();
      this.callbacks.onLayoutChanged?.();
      if (this.dtl.phase !== "anchored" && this.dtl.phase !== "pending") return;
    }
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return;
    }
    if (this.dtl.phase === "pending") {
      const cursor = this.canvas.getScenePoint(e.e);
      if (pointInObject(cursor, this.dtl.target)) {
        clearTimeout(this.dtl.timer);
        this.dtl = { ...this.dtl, source: obj, cursor };
        this.guides.clear();
        this.promoteToAnchored();
        this.doCommit();
        return;
      }
    }
    this.resetToIdle();
  }
  onResizing(e) {
    const target = e.target;
    const layout = target?.get?.("layout");
    if (layout?.child && !layout.container) {
      const objects = this.canvas.getObjects();
      if (!isTextObject(target)) clampToRoom(target, e.transform, objects);
      const parent = this.findParentContainer(target);
      const pLayout = parent?.get?.("layout");
      if (parent && pLayout?.container) {
        relayoutSingle(parent, pLayout.container, objects);
        bubbleUpLayout(parent, objects);
        this.canvas.renderAll();
      }
      return;
    }
    if (!layout?.container) return;
    if (!this.resizeSession) {
      this.resizeSession = new ResizeSession(target, e.transform?.corner);
    }
    this.resizeSession.handleResizing(this.canvas.getObjects());
    this.canvas.renderAll();
  }
  // ── State machine: IDLE → HOVERING ────────────────────────────────
  handleIdleMoving(draggedObj, cursor) {
    if (Date.now() < this.dtl.cooldownUntil) return;
    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (shape) {
      const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
      this.startHovering(draggedObj, deepest, cursor);
    }
  }
  // ── State machine: HOVERING (silent) ─────────────────────────────
  handleHoveringMoving(draggedObj, cursor) {
    if (this.dtl.phase !== "hovering") return;
    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (!shape) {
      this.resetToIdle();
      return;
    }
    const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
    if (deepest !== this.dtl.target) {
      clearTimeout(this.dtl.timer);
      this.startHovering(draggedObj, deepest, cursor);
      return;
    }
    this.dtl.cursor = cursor;
  }
  startHovering(draggedObj, target, cursor) {
    const timer = setTimeout(() => this.promoteToPending(), HOVER_DELAY_MS);
    this.dtl = {
      phase: "hovering",
      timer,
      target,
      source: draggedObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil
    };
  }
  /** HOVERING timer fired → show guides and move to PENDING. */
  promoteToPending() {
    if (this.dtl.phase !== "hovering") return;
    const { target, source, cursor } = this.dtl;
    this.startPending(source, target, cursor);
  }
  // ── State machine: PENDING (visual hint) ─────────────────────────
  handlePendingMoving(draggedObj, cursor) {
    if (this.dtl.phase !== "pending") return;
    const shape = this.findShapeUnderPoint(cursor, draggedObj);
    if (!shape) {
      this.resetToIdle();
      return;
    }
    const deepest = this.findDeepestDropTarget(cursor, shape, draggedObj);
    if (deepest !== this.dtl.target) {
      clearTimeout(this.dtl.timer);
      this.startPending(draggedObj, deepest, cursor);
      return;
    }
    this.dtl.cursor = cursor;
  }
  startPending(draggedObj, target, cursor) {
    this.guides.showHintHighlight(target, target);
    this.canvas.renderAll();
    const timer = setTimeout(() => this.promoteToAnchored(), ANCHOR_DELAY_MS);
    this.dtl = {
      phase: "pending",
      timer,
      target,
      source: draggedObj,
      cursor,
      cooldownUntil: this.dtl.cooldownUntil
    };
  }
  // ── State machine: ANCHOR (PENDING → ANCHORED) ────────────────────
  /** PENDING timer fired → create a session and move to ANCHORED. */
  promoteToAnchored() {
    if (this.dtl.phase !== "pending") return;
    const { target, source: child, cursor } = this.dtl;
    const root = this.findShapeUnderPoint(cursor, child);
    this.anchorOn(target, child, cursor, root);
  }
  // ── State machine: ANCHORED (during drag) ─────────────────────────
  handleAnchoredMoving(cursor) {
    if (this.dtl.phase !== "anchored") return;
    const { session, source, root } = this.dtl;
    const result = session.handleMoving(cursor);
    if (result === "exited") {
      if (root && session.container !== root) {
        const parent = this.findParentContainer(session.container);
        if (parent && pointInObject(cursor, parent)) {
          this.anchorOn(parent, source, cursor, root);
          return;
        }
      }
      this.resetToIdle(Date.now() + 1e3);
      return;
    }
    this.showSessionGuides(session);
    this.canvas.renderAll();
  }
  // ── Depth helpers ─────────────────────────────────────────────────
  /**
   * Walk down from `root` to find the deepest drop target under the
   * cursor. Returns `root` itself if no children qualify.
   */
  findDeepestDropTarget(cursor, root, exclude) {
    let current = root;
    for (; ; ) {
      const child = this.findChildDropTarget(cursor, current, exclude);
      if (!child) return current;
      current = child;
    }
  }
  /**
   * Among the children of `container`, find the first one under the cursor
   * that can host (see rulesOf) — it would become a sub-container.
   */
  findChildDropTarget(cursor, container, exclude) {
    const layout = container.get?.("layout");
    if (!layout?.container) return null;
    const children = resolveContainerChildren(this.canvas.getObjects(), container);
    for (const { obj } of children) {
      if (obj === exclude) continue;
      if (!rulesOf(obj).hosts) continue;
      if (pointInObject(cursor, obj)) return obj;
    }
    return null;
  }
  /** Find the parent container of `obj` by looking up its `child.parentId`. */
  findParentContainer(obj) {
    const layout = obj.get?.("layout");
    if (!layout?.child) return null;
    return this.canvas.getObjects().find(
      (o) => o.get("layerId") === layout.child.parentId
    ) ?? null;
  }
  /** Transition to ANCHORED: create a session on the target and go live. */
  anchorOn(target, child, cursor, root = null) {
    const objects = this.canvas.getObjects();
    if (!objects.includes(child)) {
      this.canvas.add(child);
    }
    const containerIdx = this.canvas.getObjects().indexOf(target);
    const childIdx = this.canvas.getObjects().indexOf(child);
    if (containerIdx >= 0 && childIdx >= 0 && childIdx < containerIdx) {
      this.canvas.moveObjectTo(child, containerIdx);
    }
    const session = this.createSession(target, child, cursor);
    this.guides.clear();
    this.showSessionGuides(session);
    this.canvas.renderAll();
    this.dtl = {
      phase: "anchored",
      session,
      cooldownUntil: this.dtl.cooldownUntil,
      source: child,
      root
    };
  }
  /** Create the appropriate session type for a target container. */
  createSession(target, child, cursor) {
    const targetLayout = target.get?.("layout");
    const alreadyContainer = targetLayout?.container != null;
    const existingChildren = alreadyContainer ? resolveContainerChildren(this.canvas.getObjects(), target) : [];
    if (alreadyContainer && existingChildren.length > 0) {
      return new InsertChildSession(this.canvas, target, child, cursor);
    }
    return new ContainerizeSession(this.canvas, target, child, cursor);
  }
  // ── State machine: COMMIT ─────────────────────────────────────────
  doCommit() {
    if (this.dtl.phase !== "anchored") return;
    const { session } = this.dtl;
    this.guides.clear();
    session.commit();
    this.callbacks.onLayoutChanged?.();
    this.callbacks.onLayoutCreated?.();
    this.dtl = { phase: "idle", cooldownUntil: 0 };
  }
  // ── Reset ─────────────────────────────────────────────────────────
  resetToIdle(cooldownUntil = 0) {
    this.guides.clear();
    if (this.dtl.phase === "pending" || this.dtl.phase === "hovering") {
      clearTimeout(this.dtl.timer);
    }
    this.dtl = { phase: "idle", cooldownUntil: cooldownUntil || this.dtl.cooldownUntil };
  }
  // ── Guide rendering ───────────────────────────────────────────────
  showSessionGuides(session) {
    if (session instanceof InsertChildSession) {
      const allChildren = resolveContainerChildren(this.canvas.getObjects(), session.container);
      const childObjs = allChildren.map((c) => c.obj);
      const layout = session.container.get?.("layout");
      const direction = layout?.container?.flexDirection ?? "column";
      this.guides.showInsertGuides(session.container, childObjs, direction);
    } else {
      this.guides.showLayoutGuides(session.container, session.child);
    }
  }
  // ── Shape hit-testing ─────────────────────────────────────────────
  findShapeUnderPoint(point, exclude) {
    const objects = this.canvas.getObjects().slice().reverse();
    const activeGroup = this.callbacks.getActiveGroupId?.();
    for (const obj of objects) {
      if (obj === exclude) continue;
      if (!rulesOf(obj).hosts) continue;
      const layout = obj.get?.("layout");
      if (layout?.child) {
        if (!activeGroup || layout.child.parentId !== activeGroup) continue;
      }
      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
};
function clampToRoom(obj, transform, objects) {
  const room = availableRoom(obj, objects);
  const { w, h } = scaledSize(obj);
  if (w <= room.w && h <= room.h) return;
  const originX = transform?.originX ?? "left";
  const originY = transform?.originY ?? "top";
  const anchor = obj.getPositionByOrigin(originX, originY);
  setShapeSize(obj, Math.min(w, room.w), Math.min(h, room.h));
  obj.setPositionByOrigin(anchor, originX, originY);
}

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
    obj.clipPath = createPathShape("heart", {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0
    });
  }
  scale();
  obj.on("scaling", scale);
}
function addHexagonClip(obj) {
  function scale() {
    obj.clipPath = createPathShape("hexagon", {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0
    });
  }
  scale();
  obj.on("scaling", scale);
}
function addPathClip(obj, shapeId) {
  function scale() {
    obj.clipPath = createPathShape(shapeId, {
      width: obj.width,
      height: obj.height,
      left: 0,
      top: 0
    });
  }
  scale();
  obj.on("scaling", scale);
}
function switchClip(obj) {
  obj.off("scaling");
  const clipPath = obj.clipPath;
  const currentShape = clipPath?.id;
  applyClip(obj, nextShape(currentShape));
}
function applyClip(obj, shapeType) {
  obj.off("scaling");
  switch (shapeType) {
    case "rect":
      obj.clipPath = void 0;
      break;
    case "circle":
      addCircleClip(obj);
      break;
    default:
      addPathClip(obj, shapeType);
      break;
  }
}

// src/ui/controls.ts
import { FabricObject as FabricObject7, Control as Control2, controlsUtils as controlsUtils5 } from "#fabric";
function applyControlStyle(canvas, guideColor, resolveTarget, userSlotLabel) {
  const gc = guideColor;
  FabricObject7.ownDefaults.borderColor = gc;
  FabricObject7.ownDefaults.borderScaleFactor = 2;
  FabricObject7.ownDefaults.borderOpacityWhenMoving = 1;
  FabricObject7.ownDefaults.cornerColor = "#ffffff";
  FabricObject7.ownDefaults.cornerStrokeColor = "#000000";
  FabricObject7.ownDefaults.transparentCorners = false;
  FabricObject7.ownDefaults.cornerSize = 16;
  const hoverProgress = /* @__PURE__ */ new WeakMap();
  installControlRenderer(gc, hoverProgress);
  installControlHitAreas(canvas);
  installHoverAnimation(canvas, hoverProgress);
  installHoverBorder(canvas, gc, resolveTarget, userSlotLabel);
}
var EDGE_CONTROLS = /* @__PURE__ */ new Set(["mt", "mb", "ml", "mr"]);
var CORNER_CONTROLS = /* @__PURE__ */ new Set(["tl", "tr", "bl", "br"]);
var DEFAULT_COLOR2 = "#ffffff";
var HOVER_DELAY = 60;
var ANIM_SPEED = 10;
function installControlRenderer(gc, hoverProgress) {
  const [activeR, activeG, activeB] = parseHex(gc);
  const hoverStart = /* @__PURE__ */ new WeakMap();
  Control2.prototype.render = function(ctx, left, top, styleOverride, fabricObject) {
    if (fabricObject.isMoving) return;
    const baseColor = styleOverride?.cornerColor ?? fabricObject.cornerColor;
    const isDefault = baseColor === DEFAULT_COLOR2;
    const hoveredCtrl = isDefault && fabricObject.__corner ? fabricObject.controls[fabricObject.__corner] : void 0;
    const isHovered = hoveredCtrl === this;
    const now = performance.now();
    const cvs = fabricObject.canvas;
    const transform = cvs?._currentTransform;
    const isGrabbed = transform && transform.target === fabricObject && transform.corner && fabricObject.controls[transform.corner] === this;
    if (isHovered && !hoverStart.has(this)) {
      hoverStart.set(this, now);
    } else if (!isHovered && !isGrabbed) {
      hoverStart.delete(this);
    }
    const elapsed = isHovered ? now - (hoverStart.get(this) ?? now) : 0;
    const target = isGrabbed ? 1 : isHovered && elapsed >= HOVER_DELAY ? 1 : 0;
    const prev = hoverProgress.get(this) ?? 0;
    const dt = 1 / 60;
    const t = Math.min(1, ANIM_SPEED * dt);
    const progress = prev + (target - prev) * t;
    hoverProgress.set(this, progress);
    const p = progress;
    const r = Math.round(255 + (activeR - 255) * p);
    const g = Math.round(255 + (activeG - 255) * p);
    const b = Math.round(255 + (activeB - 255) * p);
    const fill = isDefault ? `rgb(${r}, ${g}, ${b})` : baseColor;
    let key = "";
    for (const [k, c] of Object.entries(fabricObject.controls)) {
      if (c === this) {
        key = k;
        break;
      }
    }
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabricObject.getTotalAngle() * Math.PI / 180);
    let w, h, cr;
    if (EDGE_CONTROLS.has(key)) {
      const long = 20, short = 8;
      const horizontal = key === "mt" || key === "mb";
      w = horizontal ? long : short;
      h = horizontal ? short : long;
      cr = short / 2;
    } else if (CORNER_CONTROLS.has(key)) {
      w = 12;
      h = 12;
      cr = 3;
    } else {
      w = 10;
      h = 10;
      cr = 3;
    }
    const x = -w / 2, y = -h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, cr);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  };
}
var HIT_DEPTH = 14;
var CORNER_INSET = 20;
var RESIZING = "resizing";
function fireResizing(target, e, transform, x, y) {
  target.fire("resizing");
  target.canvas?.fire("object:resizing", { target, e, transform, pointer: { x, y } });
}
var resizeBoth = (eventData, transform, x, y) => {
  const { target } = transform;
  const changed = target.handleCornerResize(transform, x, y);
  if (changed) fireResizing(target, eventData, transform, x, y);
  return changed;
};
var resizeEdge = (eventData, transform, x, y) => {
  const { target } = transform;
  const changed = target.handleEdgeResize(transform, x, y);
  if (changed) fireResizing(target, eventData, transform, x, y);
  return changed;
};
function installControlHitAreas(canvas) {
  const createSideRotationControl = () => new Control2({
    x: 0.5,
    y: 0,
    offsetX: 30,
    offsetY: 0,
    actionHandler: controlsUtils5.rotationWithSnapping,
    cursorStyleHandler: controlsUtils5.rotationStyleHandler,
    withConnection: true,
    actionName: "rotate"
  });
  canvas.on("object:added", (e) => {
    const obj = e.target;
    if (!obj?.controls) return;
    if (obj.controls.mtr) {
      obj.controls.mtr = createSideRotationControl();
    }
    const resizingActionName = () => RESIZING;
    if (typeof obj.handleEdgeResize === "function") {
      for (const key of ["ml", "mr", "mt", "mb"]) {
        const ctrl = obj.controls[key];
        if (!ctrl) continue;
        ctrl.actionHandler = resizeEdge;
        ctrl.actionName = RESIZING;
        ctrl.getActionName = resizingActionName;
      }
    }
    if (typeof obj.handleCornerResize === "function") {
      for (const key of ["tl", "tr", "bl", "br"]) {
        const ctrl = obj.controls[key];
        if (!ctrl) continue;
        ctrl.actionHandler = resizeBoth;
        ctrl.actionName = RESIZING;
        ctrl.getActionName = resizingActionName;
      }
    }
    for (const key of ["mt", "mb", "ml", "mr"]) {
      const ctrl = obj.controls[key];
      if (!ctrl) continue;
      const horizontal = key === "mt" || key === "mb";
      const origCalc = ctrl.calcCornerCoords.bind(ctrl);
      ctrl.calcCornerCoords = (angle, cornerSize, cx, cy, isTouch, fObj) => {
        const dim = fObj._calculateCurrentDimensions();
        const along = horizontal ? dim.x : dim.y;
        const edgeLen = Math.max(0, along - CORNER_INSET * 2);
        ctrl.sizeX = horizontal ? edgeLen : HIT_DEPTH;
        ctrl.sizeY = horizontal ? HIT_DEPTH : edgeLen;
        return origCalc(angle, cornerSize, cx, cy, isTouch, fObj);
      };
    }
  });
}
function installHoverAnimation(canvas, hoverProgress) {
  let animating = false;
  const tick = () => {
    const active = canvas.getActiveObject();
    if (!active?.controls) {
      animating = false;
      return;
    }
    let needsFrame = false;
    for (const ctrl of Object.values(active.controls)) {
      const p = hoverProgress.get(ctrl) ?? 0;
      if (p > 0.01 && p < 0.99) {
        needsFrame = true;
        break;
      }
      const isHovered = active.__corner ? active.controls[active.__corner] === ctrl : false;
      if (isHovered && p < 0.99) {
        needsFrame = true;
        break;
      }
    }
    if (needsFrame) {
      canvas.requestRenderAll();
      requestAnimationFrame(tick);
    } else {
      animating = false;
    }
  };
  let lastCorner;
  canvas.on("mouse:move", () => {
    const active = canvas.getActiveObject();
    const corner = active?.__corner;
    if (corner !== lastCorner) {
      lastCorner = corner;
      canvas.requestRenderAll();
      if (!animating) {
        animating = true;
        requestAnimationFrame(tick);
      }
    }
  });
}
function installHoverBorder(canvas, guideColor, resolveTarget, userSlotLabel) {
  let hoveredObj = null;
  const clearTopCtx = () => {
    const fc = canvas.originalFabricCanvas;
    const ctx = fc.contextTop;
    if (ctx) ctx.clearRect(0, 0, fc.width, fc.height);
  };
  canvas.on("mouse:over", (e) => {
    const raw = e.target;
    if (!raw) return;
    const target = resolveTarget ? resolveTarget(raw) : raw;
    if (target === canvas.getActiveObject()) return;
    hoveredObj = target;
    canvas.requestRenderAll();
  });
  canvas.on("mouse:out", (e) => {
    const raw = e.target;
    if (!raw) return;
    const resolved = resolveTarget ? resolveTarget(raw) : raw;
    if (resolved === hoveredObj || raw === hoveredObj) {
      hoveredObj = null;
      canvas.requestRenderAll();
    }
  });
  canvas.on("after:render", () => {
    clearTopCtx();
    const ctx = canvas.originalFabricCanvas.contextTop;
    if (!ctx) return;
    const active = canvas.getActiveObject();
    canvas.getObjects().forEach((obj) => {
      if (obj === active || obj === hoveredObj) return;
      drawDynamicMediaOutline(ctx, obj, guideColor);
    });
    if (!hoveredObj || hoveredObj === active) return;
    hoveredObj._renderControls(ctx, { hasControls: false, hasBorders: true });
  });
  installBadgeLayer(
    canvas.originalFabricCanvas,
    guideColor,
    [(obj) => bindingBadgeLabel(obj, userSlotLabel)],
    () => {
      const active = canvas.getActiveObject();
      return [active, hoveredObj !== active ? hoveredObj : null].filter((obj) => Boolean(obj));
    }
  );
}

// src/types.ts
var DRAG_PREVIEW_KEY = "dragPreview";

// src/FabricEditor.ts
var _FabricEditor = class _FabricEditor {
  constructor(canvasElement, config) {
    this._displayScale = 1;
    this._userZoom = 1;
    this._resizeObserver = null;
    this._resizeCallbacks = [];
    this._initialized = false;
    this._replaceToken = {};
    // ── Clipboard (copy / paste) ──────────────────────────────────────
    this._clipboard = null;
    this.config = config;
    if (config.shapes) registerShapes(config.shapes);
    const gc = config.guideColor ?? "#d946ef";
    this.canvas = new DesignCanvas(canvasElement, {
      width: config.width,
      height: config.height,
      preserveObjectStacking: true,
      uniformScaling: false,
      selectionColor: hexAlpha(gc, 0.15),
      selectionBorderColor: hexAlpha(gc, 0.6),
      selectionLineWidth: 1
    });
    this.layers = new LayerManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);
    applyControlStyle(this.canvas, gc, (obj) => this.selection.resolveTarget(obj), config.userSlotLabel);
    const slotStyle = { color: gc, prompt: config.userSlotPrompt };
    this.canvas.originalFabricCanvas[USER_SLOT_STYLE_KEY] = slotStyle;
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas, {}, config.guideColor);
    this.layout = new LayoutManager2(
      this.canvas,
      { getActiveGroupId: () => this.selection.activeGroupId },
      config.guideColor
    );
    this.canvas.originalFabricCanvas.snappingManager = this.snapping;
    this.extendFabricObject();
    if (config.transparent) {
      this.canvas.backgroundColor = "transparent";
    }
    if (config.workspace) {
      this.canvas.enableWorkspace({
        frameColor: gc,
        ...typeof config.workspace === "object" ? config.workspace : {}
      });
      this.installWorkspacePan();
    }
  }
  /** Largeur de l'artboard en coordonnées scène. */
  get width() {
    return this.config.width;
  }
  /** Hauteur de l'artboard en coordonnées scène. */
  get height() {
    return this.config.height;
  }
  /**
   * Async initialization: loads fonts from config if present.
   * Idempotent — safe to call multiple times.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    await initYoga();
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
    const token = this._replaceToken = {};
    const objects = await this.layers.deserializeAll(layers);
    if (token !== this._replaceToken) return;
    this.layers.all.forEach((obj) => this.layers.remove(obj));
    objects.forEach((obj) => obj && this.layers.add(obj));
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
   * Resize the canvas buffer to fit inside its container and use
   * Fabric's viewportTransform to scale the content.
   *
   * This avoids CSS `transform: scale()` which causes sub-pixel blur.
   * The canvas buffer matches the display size exactly → pixel-perfect.
   */
  fitToContainer() {
    const container = this.config.container;
    if (!container) return 1;
    const boxW = container.clientWidth;
    const boxH = container.clientHeight;
    if (this.canvas.isWorkspace) {
      const scale2 = this.canvas.fitWorkspace(boxW, boxH, this._userZoom);
      const canvasEl2 = container.querySelector(".canvas-container") || container;
      canvasEl2.style.marginLeft = "";
      canvasEl2.style.marginTop = "";
      container.style.overflow = "hidden";
      this._displayScale = scale2;
      return scale2;
    }
    const scale = this.canvas.fitToSize(boxW, boxH, this._userZoom);
    const bufferW = Math.round(this.canvas.width * scale);
    const bufferH = Math.round(this.canvas.height * scale);
    const canvasEl = container.querySelector(".canvas-container") || container;
    canvasEl.style.transform = "";
    canvasEl.style.transformOrigin = "";
    const offsetX = Math.max(0, (boxW - bufferW) / 2);
    const offsetY = Math.max(0, (boxH - bufferH) / 2);
    canvasEl.style.marginLeft = `${offsetX}px`;
    canvasEl.style.marginTop = `${offsetY}px`;
    container.style.overflow = this._userZoom > 1 ? "auto" : "hidden";
    this._displayScale = scale;
    return scale;
  }
  /**
   * Le format se décide en cours d'édition : l'artboard change de dimensions, les calques
   * restent en place — au caller de mettre à jour son document et son conteneur (ratio).
   */
  resizeArtboard(width, height) {
    this.config.width = width;
    this.config.height = height;
    this.canvas.resizeDesign(width, height);
    this.fitToContainer();
    this._resizeCallbacks.forEach((cb) => cb());
  }
  /**
   * Set user zoom level (1 = fit to container, >1 = zoom in).
   * Re-runs fitToContainer to apply the new scale.
   */
  setUserZoom(zoom) {
    this._userZoom = Math.max(0.1, zoom);
    if (this._userZoom <= 1) this.canvas.resetPan();
    this.fitToContainer();
    this._resizeCallbacks.forEach((cb) => cb());
  }
  get userZoom() {
    return this._userZoom;
  }
  /**
   * Le cadre du document à l'écran (px CSS, relatifs à l'élément canvas) — pour caler
   * dessus les couches HTML de l'hôte (iframe vidéo, fonds HTML, damier). Change à
   * chaque ajustement, zoom ou déplacement : voir onResize.
   */
  get frameRect() {
    return this.canvas.frameRect;
  }
  /**
   * Plan de travail zoomé : la molette déplace la vue (le minimum pour atteindre le
   * hors-cadre ; les gestes de zoom et les limites du déplacement viendront plus tard).
   */
  installWorkspacePan() {
    this.canvas.on("mouse:wheel", (opt) => {
      if (this._userZoom <= 1) return;
      opt.e.preventDefault();
      this.canvas.panBy(-opt.e.deltaX, -opt.e.deltaY);
      this.canvas.requestRenderAll();
      this._resizeCallbacks.forEach((cb) => cb());
    });
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
      // Où tombe l'origine du document (le coin du cadre) dans l'ancre : l'élément canvas,
      // plus la position du cadre dans le canvas (nulle hors plan de travail)
      getCanvasOffset: () => {
        const container = this.config.container;
        if (!container) return { left: 0, top: 0 };
        const canvasEl = container.querySelector(".canvas-container") || container;
        const anchorRect = anchorEl.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        const frame = this.canvas.frameRect;
        return {
          left: canvasRect.left - anchorRect.left + frame.left,
          top: canvasRect.top - anchorRect.top + frame.top
        };
      }
    };
  }
  /**
   * Convertit des coordonnées du document vers des coordonnées CSS relatives à l'élément
   * canvas : l'échelle, plus la position du cadre (nulle hors plan de travail).
   */
  canvasToDisplayCoords(rect) {
    const s = this._displayScale;
    const frame = this.canvas.frameRect;
    return {
      left: frame.left + rect.left * s,
      top: frame.top + rect.top * s,
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
    const containerWidth = this.canvas.isWorkspace ? this.canvas.originalFabricCanvas.width : this.config.width * s;
    const containerHeight = this.canvas.isWorkspace ? this.canvas.originalFabricCanvas.height : this.config.height * s;
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
   * Charge les polices personnalisées.
   * Une police qui échoue (URL morte, CORS…) est ignorée avec un warning :
   * le texte retombe sur la police par défaut au lieu de bloquer tout le rendu.
   */
  async loadFonts(fonts) {
    const results = await Promise.allSettled(
      Object.entries(fonts).map(([name, values]) => {
        return new FontFace(values.family, values.url, {
          style: "normal",
          weight: values.weight || "normal"
        }).load().catch((e) => {
          console.warn(`[FabricEditor] Font "${name}" failed to load:`, e);
          throw e;
        });
      })
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") document?.fonts?.add(r.value);
    });
  }
  /**
   * @legacy Use ImageFrame.nextClipShape() directly.
   */
  switchClip() {
    const obj = this.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.nextClipShape();
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (obj instanceof FabricImage7) {
      switchClip(obj);
      obj.dirty = true;
      this.canvas.remove(obj);
      this.layers.add(obj);
    }
  }
  /**
   * @legacy Shape switching is no longer supported.
   */
  switchShape() {
    const obj = this.selection.current;
    if (!obj || obj instanceof FabricImage7) return;
    const currentShapeId = obj.id;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }
  /**
   * @legacy Shape switching is no longer supported.
   */
  changeShape(shapeType) {
    const obj = this.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.applyClipShape(shapeType);
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (!(obj instanceof FabricImage7)) {
      const newObj = switchShape(obj, shapeType);
      const layerId = obj.get("layerId");
      const layerType = obj.get("layerType");
      if (layerId) newObj.set("layerId", layerId);
      if (layerType) newObj.set("layerType", layerType);
      this.selection.silenceCallbacks();
      const objects = this.canvas.getObjects();
      const zIndex = objects.indexOf(obj);
      this.canvas.remove(obj);
      this.canvas.add(newObj);
      if (zIndex >= 0 && zIndex < this.canvas.getObjects().length) {
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
    obj.strokeWidth = obj.stroke ? 4 : 0;
    this.canvas.renderAll();
  }
  /**
   * Change la couleur de l'objet sélectionné
   */
  changeColor(color) {
    const obj = this.selection.current;
    if (!obj) return;
    if (isTextObject(obj)) {
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
  // ==================== Stroke controls ====================
  /**
   * Enable or disable stroke on the selected object.
   * When enabling, restores previous stroke color or defaults to black.
   */
  setStrokeEnabled(enabled) {
    const obj = this.selection.current;
    if (!obj) return;
    if (enabled) {
      obj.set({ stroke: obj.stroke || "#000000", strokeWidth: obj.strokeWidth || 4 });
    } else {
      obj.set({ stroke: null, strokeWidth: 0 });
    }
    this.canvas.renderAll();
  }
  /**
   * Set stroke width on the selected object.
   */
  setStrokeWidth(width) {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set({ strokeWidth: width });
    if (width > 0 && !obj.stroke) {
      obj.set({ stroke: "#000000" });
    }
    this.canvas.renderAll();
  }
  /**
   * Set stroke color on the selected object. Accepts any CSS color (hex, rgba).
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setStrokeColor(color) {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set({ stroke: color, opacity: 1 });
    if (!obj.strokeWidth) {
      obj.set({ strokeWidth: 4 });
    }
    this.canvas.renderAll();
  }
  // ==================== Fill controls ====================
  /**
   * Set fill color (solid) on the selected object.
   * Unlike changeColor(), always sets fill regardless of stroke state.
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setFillColor(color) {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set({ fill: color, opacity: 1 });
    this.canvas.renderAll();
  }
  /**
   * Set a linear gradient fill on the selected object.
   */
  setFillGradient(color1, color2, angleDeg) {
    const obj = this.selection.current;
    if (!obj) return;
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const gradient = new Gradient({
      type: "linear",
      gradientUnits: "percentage",
      coords: {
        x1: 0.5 - cos / 2,
        y1: 0.5 - sin / 2,
        x2: 0.5 + cos / 2,
        y2: 0.5 + sin / 2
      },
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 1, color: color2 }
      ]
    });
    obj.set({ fill: gradient, opacity: 1 });
    this.canvas.renderAll();
  }
  /**
   * Change la police de l'objet texte sélectionné
   */
  changeFont(fontFamily, fontWeight) {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj)) return;
    obj.set({ fontFamily, fontWeight: fontWeight || "normal" });
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }
  /**
   * Change la taille de police de l'objet texte sélectionné
   */
  setFontSize(size) {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;
    obj.set({ fontSize: size });
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }
  /**
   * Justification de l'objet texte sélectionné, dans sa boîte.
   */
  setTextAlign(align) {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj)) return;
    obj.set({ textAlign: align });
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }
  /**
   * Bascule un style sur l'objet texte sélectionné (gras, italique, souligné).
   * "bold" alterne fontWeight normal/bold (un poids numérique >= 600 compte
   * comme gras).
   */
  toggleTextStyle(style) {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj)) return;
    switch (style) {
      case "bold": {
        const isBold = obj.fontWeight === "bold" || Number(obj.fontWeight) >= 600;
        obj.set({ fontWeight: isBold ? "normal" : "bold" });
        break;
      }
      case "italic":
        obj.set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
        break;
      case "underline":
        obj.set({ underline: !obj.underline });
        break;
    }
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }
  // ── Shadow ────────────────────────────────────────────────────────
  setShadow(opts) {
    const obj = this.selection.current;
    if (!obj) return;
    const existing = obj.shadow;
    const shadow = new Shadow({
      color: opts.color ?? existing?.color ?? "rgba(0,0,0,0.5)",
      blur: opts.blur ?? existing?.blur ?? 10,
      offsetX: opts.offsetX ?? existing?.offsetX ?? 5,
      offsetY: opts.offsetY ?? existing?.offsetY ?? 5
    });
    obj.set("shadow", shadow);
    this.canvas.requestRenderAll();
  }
  removeShadow() {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set("shadow", null);
    this.canvas.requestRenderAll();
  }
  /**
   * Copy the current selection to an internal clipboard.
   * If the selected object is a layout container, its children are copied too.
   */
  copySelection() {
    const selected = this.selection.selected;
    if (selected.length === 0) return;
    const allObjects = this.canvas.getObjects();
    const toCopy = [];
    for (const obj of selected) {
      toCopy.push(obj);
      const id = obj.get("layerId");
      if (id) {
        for (const other of allObjects) {
          if (other.get("layout")?.child?.parentId === id && !toCopy.includes(other)) {
            toCopy.push(other);
          }
        }
      }
    }
    this._clipboard = toCopy.map(
      (obj) => obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"])
    );
  }
  /**
   * Paste clipboard contents onto the canvas.
   * Generates fresh layerIds and remaps parent/child references.
   * Offsets pasted objects by 20px so they don't overlap the originals.
   */
  async pasteClipboard() {
    if (!this._clipboard?.length) return [];
    const OFFSET = 20;
    const idMap = /* @__PURE__ */ new Map();
    for (const data of this._clipboard) {
      if (data.layerId) {
        idMap.set(data.layerId, `layer_${Date.now()}_${Math.floor(Math.random() * 1e3)}`);
      }
    }
    const cloned = this._clipboard.map((data) => {
      const copy = JSON.parse(JSON.stringify(data));
      if (copy.layerId && idMap.has(copy.layerId)) {
        copy.layerId = idMap.get(copy.layerId);
      }
      if (copy.layout?.child?.parentId) {
        const newParent = idMap.get(copy.layout.child.parentId);
        if (newParent) copy.layout.child.parentId = newParent;
      }
      if (typeof copy.left === "number") copy.left += OFFSET;
      if (typeof copy.top === "number") copy.top += OFFSET;
      delete copy.lockMode;
      return copy;
    });
    const objects = [];
    for (const data of cloned) {
      const obj = await this.layers.deserialize(data);
      if (obj) {
        this.layers.add(obj);
        objects.push(obj);
      }
    }
    if (objects.length === 1) {
      this.canvas.setActiveObject(objects[0]);
    }
    this.canvas.renderAll();
    return objects;
  }
  /** Les images à fournir de la page (userSlots), boîtes en coordonnées scène. */
  userSlots() {
    return collectUserSlots(this.layers.all.filter((obj) => !obj.get(DRAG_PREVIEW_KEY)));
  }
  /**
   * Prévient l'hôte quand les images à fournir changent — apparition, disparition,
   * consigne, boîte, échelle ou cadrage d'affichage : de quoi (re)placer ses bulles. Comparé
   * à chaque rendu et à chaque redimensionnement, appelé seulement sur changement (et une
   * fois tout de suite). Rend la fonction de désabonnement.
   */
  onUserSlotsChange(callback) {
    let last = null;
    const check = () => {
      const slots = this.userSlots();
      const signature = JSON.stringify([
        this._displayScale,
        this._userZoom,
        slots.map(({ layerId, hint, rect }) => [
          layerId,
          hint,
          Math.round(rect.left),
          Math.round(rect.top),
          Math.round(rect.width),
          Math.round(rect.height)
        ])
      ]);
      if (signature === last) return;
      last = signature;
      callback(slots);
    };
    this.canvas.on("after:render", check);
    this._resizeCallbacks.push(check);
    check();
    return () => {
      this.canvas.off("after:render", check);
      this._resizeCallbacks = this._resizeCallbacks.filter((cb) => cb !== check);
    };
  }
  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés
   */
  deleteSelection() {
    const selected = this.selection.selected;
    if (selected.length === 0) return;
    const deletable = selected.filter((obj) => rulesOf(obj).deletes);
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
    if (!target || rulesOf(target, { ignoreLock: true }).onToolboxImage !== "replaceImage") return null;
    return target;
  }
  /**
   * Trouve la cible d'une image de la toolbox sous un point : le plus haut objet opaque
   * (une forme la prend en fond, une forme-image remplace la sienne — voir rulesOf). Il
   * peut ne pas réagir (verrouillé, groupe de paths) : DropHandler n'arme alors pas le
   * remplacement, et l'image est ajoutée.
   */
  findDropTargetAtPoint(x, y) {
    const point = new Point5(x, y);
    const objects = this.canvas.getObjects().slice().reverse();
    for (const obj of objects) {
      if (obj.get(DRAG_PREVIEW_KEY)) continue;
      const rules = rulesOf(obj, { ignoreLock: true });
      if (!rules.onToolboxImage && !rules.hosts) continue;
      if (obj.containsPoint(point)) return obj;
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
    const originalToObject = FabricObject8.prototype.toObject;
    FabricObject8.prototype.toObject = function(propertiesToInclude) {
      return originalToObject.call(
        this,
        ["layerId", "layout", "bindings"].concat(propertiesToInclude || [])
      );
    };
  }
};
/**
 * Étend FabricObject pour inclure layerId dans la sérialisation
 */
_FabricEditor._toObjectExtended = false;
var FabricEditor = _FabricEditor;

// src/PreviewCanvas.ts
import { StaticCanvas } from "#fabric";
var PreviewCanvas = class extends StaticCanvas {
  constructor(el, opts) {
    const { width, height, ...canvasOpts } = opts;
    super(el, {
      width,
      height,
      renderOnAddRemove: false,
      // Retina : sans buffer à devicePixelRatio, les petites vignettes (48px) sortent
      // pixelisées sur HiDPI. Le surcoût mémoire reste marginal aux tailles de preview.
      enableRetinaScaling: true,
      ...canvasOpts
    });
    this._showToken = {};
    this.designWidth = width;
    this.designHeight = height;
  }
  /**
   * `contain` : le buffer épouse le design réduit (letterbox géré par le parent).
   * `cover` : le buffer épouse le conteneur, le design centré déborde — le crop est fait par
   * le canvas lui-même (un object-fit CSS étirerait le bitmap).
   */
  fitToSize(containerW, containerH, fit = "contain") {
    const ratios = [containerW / this.designWidth, containerH / this.designHeight];
    const scale = fit === "cover" ? Math.max(...ratios) : Math.min(...ratios);
    const width = fit === "cover" ? containerW : Math.round(this.designWidth * scale);
    const height = fit === "cover" ? containerH : Math.round(this.designHeight * scale);
    this.setDimensions({ width, height });
    this.setViewportTransform([
      scale,
      0,
      0,
      scale,
      (width - this.designWidth * scale) / 2,
      (height - this.designHeight * scale) / 2
    ]);
    this.getContext().imageSmoothingQuality = "high";
    return scale;
  }
  /**
   * Remplace le contenu par ces layers et rend — l'unique verbe d'une preview.
   *
   * Anti-flicker : la désérialisation (chargement d'images compris) se fait AVANT le clear,
   * puis clear + add + renderAll dans la même tâche — clear() efface les pixels
   * immédiatement (clearContext), le rendu synchrone interdit toute frame blanche entre les
   * deux. Les rendus concurrents se départagent par jeton : le dernier appelé gagne.
   */
  async showLayers(layers, { relayout = false } = {}) {
    const manager = new LayerManager(this);
    const token = this._showToken = {};
    const objects = await manager.deserializeAll(layers);
    if (relayout) await initYoga();
    if (token !== this._showToken) return;
    this.clear();
    objects.forEach((obj) => obj && this.add(obj));
    if (relayout) runLayout(this.getObjects());
    this.renderAll();
  }
};

// src/DropHandler.ts
import { FabricImage as FabricImage8, Point as Point6, Rect as Rect6 } from "#fabric";
var HIGHLIGHT_COLOR = "#3b82f6";
var KIND_CAPABILITIES = {
  image: { layout: false, replaceTarget: true },
  text: { layout: true, replaceTarget: false },
  shape: { layout: true, replaceTarget: false },
  userSlot: { layout: false, replaceTarget: true }
};
var DropHandler = class {
  constructor(editor, config) {
    this.editor = editor;
    this.state = {
      hoveredTarget: null,
      pendingTarget: null,
      timer: null,
      replaceMode: false,
      originalColors: null,
      fabricOverlay: null,
      htmlOverlay: null
    };
    this.dropZone = null;
    this.drag = null;
    this.lastPointer = null;
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
   * Drop an image by URL. Replaces the hovered target if the replace timer
   * has armed (shape → conversion en ImageFrame masqué, image → nouvelle
   * source), otherwise adds a new image at the drop position.
   *
   * Single image-drop path: used by completeDrag (toolbox drags) and by
   * the native file drop handler.
   *
   * Returns the result so the caller can act on it (e.g. register the new object).
   */
  async dropImage(url, e, opts) {
    const shouldReplace = this.state.replaceMode && this.state.hoveredTarget;
    const target = this.state.hoveredTarget;
    this.clearTimer();
    this.state.pendingTarget = null;
    this.clearHighlight();
    try {
      if (shouldReplace && target) {
        if (rulesOf(target).onToolboxImage === "fill") {
          const frame = await this.editor.layers.replaceShapeWithImage(target, url, opts?.imageMeta);
          this.config.onSuccess();
          return { kind: "replace", object: frame };
        }
        const replaced = await this.editor.layers.replaceImageSource(target, url, {
          imageMeta: opts?.imageMeta
        });
        this.config.onSuccess();
        return { kind: "replace", object: replaced };
      }
      const addOpts = { ...opts };
      if (e) {
        if (!this.intersectsCanvas(e, null)) return null;
        const pointer = this.editor.canvas.getScenePoint(e);
        addOpts.left = pointer.x;
        addOpts.top = pointer.y;
        addOpts.originX = "center";
        addOpts.originY = "center";
      }
      const object = await this.editor.layers.addImage(url, addOpts);
      this.config.onSuccess();
      return { kind: "add", object };
    } catch (error) {
      this.config.onError(error);
      return null;
    }
  }
  // ==================== External drag API ====================
  //
  // Lets an HTML drag source (toolbox panel) drop onto the canvas with
  // per-kind capabilities (see DragPayload). Layout-capable kinds create
  // a real Fabric object that follows the cursor and drives layout
  // sessions (ContainerizeSession / InsertChildSession) — no fake
  // pointer events needed.
  //
  // Usage:
  //   dragstart → prepareDrag({ kind: "text", opts: { ... } })
  //   dragover  → trackPointer(e)   (routes by capability)
  //   drop      → completeDrag(e)   (commits session, replaces, or adds)
  //   dragleave → suspendDrag()     (rollback + hide, drag stays armed)
  //   dragend   → cancelDrag()      (full cancel)
  /**
   * Arm an external drag with a payload. Creates the Fabric object that
   * follows the cursor, off-canvas; it manifests on the canvas on the
   * first trackPointer call. For images the object is a cosmetic preview
   * loaded asynchronously — the drop works even if it hasn't loaded yet.
   */
  prepareDrag(payload) {
    if (this.drag) this.cancelDrag();
    const capabilities = KIND_CAPABILITIES[payload.kind];
    const drag = { payload, capabilities, object: null, onCanvas: false };
    this.drag = drag;
    if (payload.kind === "image") {
      this.createImagePreview(payload.url).then((img) => {
        if (this.drag === drag) drag.object = img;
      }).catch(() => {
      });
    } else if (payload.kind === "userSlot") {
      drag.object = this.createUserSlotPreview(payload.opts);
    } else {
      drag.object = this.createDragObject(payload);
    }
  }
  /**
   * Complete the armed drag:
   * - image → replaces the hovered target if replace mode armed, else adds
   * - text/shape → commits the layout session if anchored, else adds at cursor
   *
   * Returns what the drop produced (see DropResult), or null.
   */
  async completeDrag(e) {
    if (!this.drag) return null;
    const { payload, object } = this.drag;
    if (e && !this.editor.layout.isAnchored && !this.intersectsCanvas(e, object)) {
      this.cancelDrag();
      return null;
    }
    if (payload.kind === "userSlot") {
      if (object && this.drag.onCanvas) this.editor.canvas.remove(object);
      this.drag = null;
      return this.dropUserSlot(e, payload.opts);
    }
    if (payload.kind === "image") {
      if (object && this.drag.onCanvas) {
        this.editor.canvas.remove(object);
      }
      this.drag = null;
      return this.dropImage(payload.url, e, payload.opts);
    }
    try {
      const committed = this.editor.layout.commitExternalDrag();
      if (!committed && object) {
        if (e) {
          const pointer = this.editor.canvas.getScenePoint(e);
          object.setPositionByOrigin(new Point6(pointer.x, pointer.y), "center", "center");
          object.setCoords();
        }
        if (!this.editor.canvas.getObjects().includes(object)) {
          this.editor.canvas.add(object);
        }
      }
      if (object) {
        this.editor.canvas.setActiveObject(object);
        this.editor.canvas.renderAll();
      }
      this.config.onSuccess();
      this.drag = null;
      return object ? { kind: "add", object } : null;
    } catch (error) {
      this.config.onError(error);
      this.cancelDrag();
      return null;
    }
  }
  /**
   * Suspend the armed drag: rolls back any layout session and removes the
   * manifested object from the canvas, but keeps the drag armed so it can
   * resume if the cursor re-enters. Call on dragleave.
   */
  suspendDrag() {
    if (this.drag?.object) {
      if (this.drag.capabilities.layout) this.editor.layout.rollbackExternalDrag();
      if (this.drag.onCanvas) {
        this.editor.canvas.remove(this.drag.object);
        this.drag.onCanvas = false;
        this.editor.canvas.renderAll();
      }
    }
    this.reset();
  }
  /**
   * Cancel the armed drag entirely. Call on dragend / abort.
   */
  cancelDrag() {
    this.suspendDrag();
    this.drag = null;
  }
  /** Whether an external drag is currently armed. */
  get isExternalDrag() {
    return this.drag !== null;
  }
  // ==================== Internal ====================
  reset() {
    this.clearTimer();
    this.clearHighlight();
    this.state.pendingTarget = null;
    this.lastPointer = null;
  }
  /**
   * Track the pointer during a drag (native file or armed external drag).
   * Routes by capability: manifests and moves the armed object, drives the
   * layout state machine, and/or tracks the hover-to-replace target.
   * The caller is responsible for calling preventDefault() on the event.
   */
  trackPointer(e) {
    const pointer = this.editor.canvas.getScenePoint(e);
    if (this.lastPointer && pointer.x === this.lastPointer.x && pointer.y === this.lastPointer.y) {
      return;
    }
    this.lastPointer = { x: pointer.x, y: pointer.y };
    if (this.drag?.object) {
      const { object, capabilities } = this.drag;
      if (!this.drag.onCanvas) {
        this.editor.canvas.add(object);
        this.drag.onCanvas = true;
      }
      if (capabilities.layout) {
        this.editor.layout.tickExternalDrag(object, pointer);
        return;
      }
      object.setPositionByOrigin(new Point6(pointer.x, pointer.y), "center", "center");
      object.setCoords();
      this.editor.canvas.requestRenderAll();
    }
    if (this.drag && !this.drag.capabilities.replaceTarget) return;
    const targetAtPoint = this.editor.findDropTargetAtPoint(pointer.x, pointer.y);
    if (targetAtPoint !== this.state.pendingTarget) {
      this.clearTimer();
      this.clearHighlight();
      this.state.pendingTarget = targetAtPoint;
      if (targetAtPoint) {
        this.state.timer = setTimeout(() => {
          this.activateReplaceMode(targetAtPoint);
        }, this.config.hoverDelay);
      }
    }
  }
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    this.trackPointer(e);
  }
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget;
    if (related && this.dropZone?.contains(related)) return;
    this.suspendDrag();
  }
  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const file = this.extractImageFile(e);
    if (!file) {
      this.reset();
      return;
    }
    if (this.config.onFile?.(file, e)) {
      this.reset();
      return;
    }
    const result = await this.dropImage(this.config.getImageUrl(file), e);
    if (result) await this.resolveFileInto(result.object, file);
  }
  /**
   * La vraie source d'un fichier déjà affiché (url de session) : l'upload de l'hôte
   * (resolveFile), puis remplacement EN PLACE — le cadre garde sa géométrie, et ne se sauve
   * pas sans elle (source en attente). Public : l'hôte s'en sert pour les cadres qu'il pose
   * lui-même à partir d'un fichier (le fond).
   */
  async resolveFileInto(object, file) {
    if (!this.config.resolveFile) return;
    if (object instanceof ImageFrame) object.markSourcePending();
    try {
      const { url, imageMeta } = await this.config.resolveFile(file);
      if (!this.editor.canvas.getObjects().includes(object)) return;
      await this.editor.layers.replaceImageSource(object, url, { imageMeta });
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }
  extractImageFile(e) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;
    const file = files[0];
    if (!file.type.startsWith("image/")) return null;
    return file;
  }
  activateReplaceMode(target) {
    if (!rulesOf(target).onToolboxImage) {
      return;
    }
    console.debug("[drop] replace armed on", {
      layerId: target.get?.("layerId"),
      evented: target.evented,
      lockMode: target.get?.("lockMode")
    });
    this.state.replaceMode = true;
    this.state.hoveredTarget = target;
    this.highlightTarget(target);
  }
  clearTimer() {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
    this.state.replaceMode = false;
  }
  clearHighlight() {
    if (this.state.hoveredTarget) {
      this.restoreTargetStyle(this.state.hoveredTarget);
      this.state.hoveredTarget = null;
    }
  }
  /**
   * Met en surbrillance une cible via les contrôles de sélection Fabric
   * et un overlay HTML sombre avec texte personnalisable
   */
  highlightTarget(target) {
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
    const fabricOverlay = new Rect6({
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
   * Restaure le style original d'une cible et supprime l'overlay
   */
  restoreTargetStyle(target) {
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
  // ==================== External drag internals ====================
  /**
   * True if dropping at `e` would put at least one pixel of the object on
   * the artboard. Without an object (image not yet loaded, native file),
   * falls back to a point-in-artboard test on the cursor.
   */
  intersectsCanvas(e, object) {
    const p = this.editor.canvas.getScenePoint(e);
    const w = this.editor.width;
    const h = this.editor.height;
    if (!object) {
      return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
    }
    const hw = object.getScaledWidth() / 2;
    const hh = object.getScaledHeight() / 2;
    return p.x + hw > 0 && p.x - hw < w && p.y + hh > 0 && p.y - hh < h;
  }
  /**
   * Cosmetic preview for an image drag: the real image, scaled like
   * addImage would (300px max), semi-transparent, and excluded from
   * drop-target detection.
   */
  async createImagePreview(url) {
    const img = await FabricImage8.fromURL(url, { crossOrigin: "anonymous" });
    let scale = 1;
    if (img.width > 300 || img.height > 300) {
      scale = Math.min(300 / img.width, 300 / img.height);
    }
    img.set({
      left: -9999,
      top: -9999,
      scaleX: scale,
      scaleY: scale,
      opacity: 0.65,
      selectable: false,
      evented: false,
      [DRAG_PREVIEW_KEY]: true
    });
    return img;
  }
  /**
   * Lâcher une image à fournir, comme une image : la cible armée (forme, forme-image)
   * devient le cadre ; sinon — ou si elle ne peut pas (image legacy) — un cadre est posé
   * au point de drop.
   */
  dropUserSlot(e, opts = {}) {
    const target = this.state.replaceMode ? this.state.hoveredTarget : null;
    this.clearTimer();
    this.state.pendingTarget = null;
    this.clearHighlight();
    const replaced = target ? this.editor.layers.requestUserImage(target, opts.hint) : null;
    if (replaced) {
      this.config.onSuccess();
      return { kind: "replace", object: replaced };
    }
    if (e && !this.intersectsCanvas(e, null)) return null;
    const pointer = e ? this.editor.canvas.getScenePoint(e) : null;
    const object = this.editor.layers.createUserSlot(opts);
    if (pointer) object.setPositionByOrigin(new Point6(pointer.x, pointer.y), "center", "center");
    this.editor.layers.add(object);
    this.editor.canvas.setActiveObject(object);
    this.editor.canvas.renderAll();
    this.config.onSuccess();
    return { kind: "add", object };
  }
  /** L'aperçu d'un cadre à fournir, translucide comme celui d'une image. */
  createUserSlotPreview(opts = {}) {
    const preview = this.editor.layers.createUserSlot({ ...opts, left: -9999, top: -9999 });
    preview.set({ opacity: 0.65, selectable: false, evented: false, [DRAG_PREVIEW_KEY]: true });
    return preview;
  }
  createDragObject(payload) {
    const offscreen = { left: -9999, top: -9999 };
    return payload.kind === "text" ? this.editor.layers.createText({ ...payload.opts, ...offscreen }) : this.editor.layers.createShape({ ...payload.opts, shapeType: payload.shapeType, ...offscreen });
  }
};

// src/index.ts
init_PendingUploadsManager();

// src/layout/tree.ts
function layoutParents(layers) {
  const all = Array.from(layers);
  const ids = new Set(all.map((l) => l.layerId).filter(Boolean));
  const parents = /* @__PURE__ */ new Map();
  for (const layer of all) {
    const parentId = layer.layout?.child?.parentId;
    if (layer.layerId && parentId && parentId !== layer.layerId && ids.has(parentId)) {
      parents.set(layer.layerId, parentId);
    }
  }
  return parents;
}
function layoutRoot(parents, id) {
  const seen = /* @__PURE__ */ new Set();
  while (parents.has(id) && !seen.has(id)) {
    seen.add(id);
    id = parents.get(id);
  }
  return id;
}
function layoutChildren(parents, id) {
  const children = [];
  for (const [child, parent] of parents) if (parent === id && child !== id) children.push(child);
  return children;
}
function layoutDescendants(parents, ids) {
  const roots = new Set(ids);
  const descendants = /* @__PURE__ */ new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parents) {
      if (descendants.has(child) || roots.has(child)) continue;
      if (roots.has(parent) || descendants.has(parent)) {
        descendants.add(child);
        grew = true;
      }
    }
  }
  return descendants;
}

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
function fillToCss(fill) {
  if (!fill) return "transparent";
  if (typeof fill === "string") return fill;
  if (fill.type === "linear" && Array.isArray(fill.colorStops)) {
    const coords = fill.coords;
    let angle = 180;
    if (coords) {
      const dx = (coords.x2 ?? 0.5) - (coords.x1 ?? 0.5);
      const dy = (coords.y2 ?? 0.5) - (coords.y1 ?? 0.5);
      angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI + 90);
      if (angle < 0) angle += 360;
    }
    const stops = fill.colorStops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  return "transparent";
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
  styles.background = fillToCss(fill);
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
  styles.background = fillToCss(fill);
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
function getClipPathCss(shapeType, width, height, cornerRadius) {
  if (!shapeType) return void 0;
  const w = width ?? 100;
  const h = height ?? 100;
  const minSize = Math.min(w, h);
  switch (shapeType) {
    case "rect": {
      if (!cornerRadius) return void 0;
      const r = Math.min(cornerRadius, minSize / 2);
      return `inset(0 round ${r}px)`;
    }
    case "circle": {
      const radius = minSize / 2;
      return `circle(${radius}px at ${w / 2}px ${h / 2}px)`;
    }
    default:
      return void 0;
  }
}
function svgPathInfo(shapeType, clipData) {
  if (clipData) {
    return { path: clipData.d, width: clipData.width, height: clipData.height, centerX: 50, centerY: 50 };
  }
  const shape = getCatalogShape(shapeType);
  if (!shape || !isMonoPath(shape)) return void 0;
  return { path: shape.paths[0].d, width: shape.width, height: shape.height, centerX: 50, centerY: 50 };
}
function getInlineSvgClip(shapeType, frameWidth, frameHeight, clipId, clipData) {
  const pathInfo = svgPathInfo(shapeType, clipData);
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
    clipData,
    cornerRadius,
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
  const clipPathCss = getClipPathCss(clipShape, frameWidth, frameHeight, cornerRadius);
  if (clipPathCss) {
    containerStyles["clip-path"] = clipPathCss;
    useOverflowHidden = false;
  } else if (clipShape && clipShape !== "rect") {
    inlineSvgClip = getInlineSvgClip(clipShape, frameWidth, frameHeight, clipId, clipData) || "";
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
  const img = image.src ? `<img src="${image.src}" style="${stylesToString(imageStyles)}" alt="" />` : "";
  const html = `<div style="${stylesToString(containerStyles)}">
  ${inlineSvgClip}
  ${img}
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
export {
  CanvasGuides,
  ContainerizeSession,
  CustomTextbox,
  DesignCanvas,
  DropHandler,
  FabCircle,
  FabPath,
  FabRect,
  FabricEditor,
  HEART_PATH,
  HEXAGON_PATH,
  HistoryManager,
  ImageFrame,
  InsertChildSession,
  LayerManager,
  LayoutManager2 as LayoutManager,
  MIN_PAD,
  MaskManager,
  PendingUploadsManager,
  PersistenceManager,
  PreviewCanvas,
  ResizeSession,
  SelectionManager,
  SnappingManager,
  USER_SCOPE,
  USER_SLOT_FIELD,
  addCircleClip,
  addCropControls,
  addHeartClip,
  addHexagonClip,
  antiScale,
  applyClip,
  applyLockMode,
  badgeLabel,
  bindingBadgeLabel,
  clampTopLeft,
  clipDataFor,
  collectUserSlots,
  createCircle,
  createHeart,
  createHexagon,
  createImage,
  createPathShape,
  createPathsShape,
  createRect,
  createShape,
  drawBindingBadge,
  drawFrameBadge,
  fabricToHtml,
  getAvailableShapes,
  getCatalogShape,
  getLockMode,
  getNextLockMode,
  getShapeCatalog,
  hasExceededOffset,
  hasPendingBindings,
  initYoga,
  isChild,
  isChildLayout,
  isContainer,
  isContainerLayout,
  isContentLocked,
  isMonoPath,
  isPositionLocked,
  isStyleLocked,
  isUserSlot,
  isValidShape,
  isYogaReady,
  kindOf,
  layerToHtmlStandalone,
  layoutChildren,
  layoutDescendants,
  layoutParents,
  layoutRoot,
  lockBoundText,
  nextShape,
  pendingBindings,
  pointInObject,
  registerShapes,
  registeredShapes,
  removeCropControls,
  rulesOf,
  runLayout,
  scaledSize,
  setTextContent,
  stackBlock,
  switchClip,
  switchShape,
  topLeft,
  userSlotBinding,
  userSlotHint,
  wrapContainerAroundChild,
  yogaLayout
};
//# sourceMappingURL=index.mjs.map