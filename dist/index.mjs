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
import { ActiveSelection as ActiveSelection4, FabricObject as FabricObject9, Point as Point10 } from "#fabric";

// src/DesignCanvas.ts
import { Canvas, Point } from "#fabric";

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
var DEFAULT_GUIDE_COLOR = "#d946ef";
var DEFAULT_SNAP_GUIDE_COLOR = "#ff00ff";

// src/DesignCanvas.ts
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
  /** Le fond du plan de travail (sa couleur unie), ou null hors plan de travail. */
  get workspaceColor() {
    return this._workspace?.color ?? null;
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
      frameColor: DEFAULT_GUIDE_COLOR,
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
import { FabricImage as FabricImage5, Group as Group4, Point as Point4, util as util2 } from "#fabric";

// src/controls/CustomTextbox.ts
import { Textbox, Point as Point2, controlsUtils as controlsUtils2 } from "#fabric";

// src/layout/types.ts
var MIN_PAD = 8;
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

// src/layout/text.ts
var TEXT_TYPES = ["i-text", "textbox"];
function isTextObject(obj) {
  return TEXT_TYPES.includes(obj.type);
}
function asLayoutText(obj) {
  return obj;
}
function scaleStyleFontSizes(styles, k) {
  const scaled = JSON.parse(JSON.stringify(styles ?? {}));
  for (const line of Object.values(scaled)) {
    for (const style of Object.values(line)) if (style.fontSize) style.fontSize *= k;
  }
  return scaled;
}
function textScaleState(obj) {
  const t = obj;
  return {
    width: t.width,
    height: t.height,
    fontSize: t.fontSize,
    fontSizeIntent: t.fontSizeIntent ?? t.fontSize,
    styles: scaleStyleFontSizes(t.styles, 1),
    minSize: obj.layout?.sizing?.minSize
  };
}
function scaleText(obj, state, k) {
  const t = obj;
  t.styles = scaleStyleFontSizes(state.styles, k);
  t.fontSizeIntent = state.fontSizeIntent * k;
  t.fontSize = state.fontSize * k;
  t.width = state.width * k;
  const layout = obj.layout;
  if (layout?.sizing) {
    if (layout.sizing.y === "fixed") t.height = state.height * k;
    if (state.minSize) {
      const minSize = { w: state.minSize.w * k, h: state.minSize.h * k };
      obj.set("layout", { ...layout, sizing: { ...layout.sizing, minSize } });
    }
  }
  t.initDimensions();
  obj.dirty = true;
}

// src/layout/model.ts
function layoutOf(obj) {
  return obj?.get?.("layout");
}
function idOf(obj) {
  return obj.get("layerId");
}
function containerDataOf(obj) {
  return layoutOf(obj)?.container;
}
function childDataOf(obj) {
  return layoutOf(obj)?.child;
}
function parentIdOf(obj) {
  return childDataOf(obj)?.parentId;
}
function isContainerObject(obj) {
  return containerDataOf(obj) != null;
}
function isFreeContainer(obj) {
  return containerDataOf(obj)?.arrangement === "free";
}
function isStackContainer(obj) {
  const cd = containerDataOf(obj);
  return cd != null && cd.arrangement !== "free";
}
function directionOf(cd) {
  return cd?.flexDirection ?? "column";
}
var ZERO_PADDING = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
function paddingOf(cd) {
  return cd?.padding ?? { ...ZERO_PADDING };
}
function uniformPadding(value) {
  return { top: value, right: value, bottom: value, left: value };
}
var DEFAULT_SIZING = { x: "hug", y: "hug" };
function sizingOf(obj) {
  return layoutOf(obj)?.sizing ?? DEFAULT_SIZING;
}
function updateLayout(obj, patch) {
  obj.set("layout", { ...layoutOf(obj), ...patch });
}
function updateContainer(obj, patch) {
  updateLayout(obj, { container: { ...containerDataOf(obj), ...patch } });
}
function updateChild(obj, patch) {
  updateLayout(obj, { child: { ...childDataOf(obj), ...patch } });
}
function removeLayoutBlock(obj, block) {
  const layout = layoutOf(obj);
  if (!layout || !(block in layout)) return;
  const { [block]: _removed, ...rest } = layout;
  obj.set("layout", Object.keys(rest).length ? rest : void 0);
}
function detachChild(obj) {
  removeLayoutBlock(obj, "child");
  if (isTextObject(obj)) asLayoutText(obj).layoutWith(null);
}
function cloneLayout(obj) {
  const layout = layoutOf(obj);
  return layout ? JSON.parse(JSON.stringify(layout)) : void 0;
}

// src/layout/hierarchy.ts
function canvasObjects(obj) {
  return obj.canvas?.getObjects() ?? [];
}
function findById(objects, layerId) {
  return objects.find((o) => o.get("layerId") === layerId);
}
function parentOf(obj, objects = canvasObjects(obj)) {
  const parentId = parentIdOf(obj);
  if (!parentId) return void 0;
  const parent = findById(objects, parentId);
  return parent === obj ? void 0 : parent;
}
function parentContainerOf(obj, objects = canvasObjects(obj)) {
  const parent = parentOf(obj, objects);
  return parent && isContainerObject(parent) ? parent : null;
}
function stackParentOf(obj, objects = canvasObjects(obj)) {
  const parent = parentOf(obj, objects);
  return isStackContainer(parent) ? parent : void 0;
}
function ancestorsOf(obj, objects = canvasObjects(obj)) {
  const ancestors = [];
  for (let current = parentOf(obj, objects); current && !ancestors.includes(current) && current !== obj; current = parentOf(current, objects)) {
    ancestors.push(current);
  }
  return ancestors;
}
function childrenOf(objects, container) {
  const id = idOf(container);
  const out = [];
  for (const obj of objects) {
    const cl = childDataOf(obj);
    if (cl?.parentId === id && obj !== container) out.push({ obj, cl });
  }
  return out;
}
function sortChildrenByOrder(children) {
  if (children.length <= 1) return children;
  return [...children].sort((a, b) => (a.cl.order ?? Infinity) - (b.cl.order ?? Infinity));
}
function flowChildrenOf(objects, container) {
  return sortChildrenByOrder(childrenOf(objects, container));
}
function descendantSet(objects, roots) {
  const byParent = /* @__PURE__ */ new Map();
  for (const obj of objects) {
    const parentId = parentIdOf(obj);
    if (parentId) byParent.set(parentId, [...byParent.get(parentId) ?? [], obj]);
  }
  const found = /* @__PURE__ */ new Set();
  const queue = [...roots];
  while (queue.length) {
    for (const child of byParent.get(idOf(queue.shift())) ?? []) {
      if (found.has(child) || roots.includes(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}
function descendantsOf(objects, roots) {
  const found = descendantSet(objects, roots);
  return objects.filter((o) => found.has(o));
}
function subtreeOf(objects, roots) {
  const found = descendantSet(objects, roots);
  return objects.filter((o) => roots.includes(o) || found.has(o));
}
function translateObjects(objects, dx, dy) {
  if (!dx && !dy) return;
  for (const obj of objects) {
    obj.set({ left: obj.left + dx, top: obj.top + dy });
    obj.setCoords();
  }
}
function translateSubtree(objects, roots, dx, dy) {
  translateObjects(subtreeOf(objects, roots), dx, dy);
}

// src/shapes/resizeUtils.ts
import { controlsUtils } from "#fabric";
var { getLocalPoint } = controlsUtils;
function isTransformCentered(transform) {
  return transform.originX === "center" && transform.originY === "center";
}
var MIN_CORNER_SCALE = 0.05;
function cornerScaleFactor(obj, transform, x, y) {
  if (transform._cornerDistance === void 0) {
    const dim = obj._getTransformedDimensions();
    transform._cornerDistance = Math.abs(dim.x) + Math.abs(dim.y);
  }
  const start = transform._cornerDistance;
  if (start === 0) return 1;
  const local = getLocalPoint(transform, transform.originX, transform.originY, x, y);
  let k = (Math.abs(local.x) + Math.abs(local.y)) / start;
  if (isTransformCentered(transform)) k *= 2;
  return Math.max(MIN_CORNER_SCALE, k);
}

// src/tokens.ts
var TOKEN_COLOR_KEY = "tokenColor";
function tokenColorOf(obj) {
  return obj.canvas?.[TOKEN_COLOR_KEY] ?? null;
}
function drawActiveTokenPills(ctx, active) {
  const text = active;
  if (!text?.drawTokenPills || text.isEditing) return;
  text.drawTokenPills(ctx);
}

// src/controls/CustomTextbox.ts
var { changeObjectWidth, changeObjectHeight } = controlsUtils2;
var UNBOUNDED_WIDTH = 1e4;
var CustomTextbox = class extends Textbox {
  constructor(text, options) {
    super(text, options);
    /** La sélection d'avant le dernier mouvement : dit dans quel sens on traverse un token. */
    this._lastSelection = [0, 0];
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
    return layoutOf(this)?.sizing ?? { x: "fixed", y: "hug" };
  }
  get textOverflow() {
    return layoutOf(this)?.overflow ?? "shrink";
  }
  /** Remplace le bloc `sizing` (nouvel objet `layout`, jamais muté en place). */
  setSizing(sizing) {
    const layout = layoutOf(this) ?? {};
    this.set("layout", { ...layout, sizing });
    this.initDimensions();
    this.setCoords();
  }
  setTextOverflow(overflow) {
    const layout = layoutOf(this) ?? {};
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
  /** Les plages atomiques en index de `_text` (graphèmes, retours à la ligne compris). */
  atomicSpans() {
    const spans = (this.tokenSpans ?? []).filter(([start, end]) => end > start);
    if (spans.length === 0) return [];
    const at = [];
    this._text.forEach((grapheme, i) => grapheme !== "\n" && at.push(i));
    const textIndex = (flat) => at[flat] ?? this._text.length;
    return spans.map(([start, end]) => [textIndex(start), textIndex(end - 1) + 1]);
  }
  /** Toute sélection passe ici avant d'être annoncée : elle se cale sur les tokens. */
  _fireSelectionChanged() {
    this._snapSelectionToTokens();
    this._lastSelection = [this.selectionStart, this.selectionEnd];
    super._fireSelectionChanged();
  }
  /**
   * Un curseur dans un token en sort : d'un pas (flèche), de l'autre côté ; sinon (clic) à
   * la borne la plus proche. Une plage s'étend aux bornes des tokens qu'elle coupe.
   */
  _snapSelectionToTokens() {
    const spans = this.atomicSpans();
    if (spans.length === 0) return;
    const inside = (i) => spans.find(([start2, end2]) => start2 < i && i < end2);
    const { selectionStart: start, selectionEnd: end } = this;
    if (start === end) {
      const span = inside(start);
      if (!span) return;
      const [from, to] = span;
      const [last] = this._lastSelection;
      const stepped = Math.abs(start - last) === 1;
      let at;
      if (stepped && last <= from) at = to;
      else if (stepped && last >= to) at = from;
      else at = start - from <= to - start ? from : to;
      this.selectionStart = this.selectionEnd = at;
      return;
    }
    const head = inside(start);
    const tail = inside(end);
    if (head) this.selectionStart = head[0];
    if (tail) this.selectionEnd = tail[1];
  }
  /**
   * Retour arrière juste après un token, ou Suppr juste avant : le token est d'abord
   * sélectionné (textarea compris), puis la suppression native l'emporte entier — on ne
   * touche jamais au flux de saisie de Fabric.
   */
  onKeyDown(e) {
    const erase = e.key === "Backspace" || e.key === "Delete";
    if (this.isEditing && erase && this.selectionStart === this.selectionEnd && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const at = this.selectionStart;
      const span = this.atomicSpans().find(([start, end]) => e.key === "Backspace" ? end === at : start === at);
      if (span) {
        [this.selectionStart, this.selectionEnd] = span;
        this._updateTextarea();
      }
    }
    super.onKeyDown(e);
  }
  /** Une frappe (ou un collage) qui change le texte : ce n'est plus l'exemple. */
  onInput(e) {
    const before = this.text;
    super.onInput(e);
    if (this.placeholder && this.text !== before) this.placeholder = false;
  }
  /** Fabric efface la zone du texte sur le calque du dessus à chaque clignotement du
   *  curseur : les pastilles du texte en édition sont repeintes avec lui. */
  renderCursorOrSelection() {
    super.renderCursorOrSelection();
    const ctx = this.canvas?.contextTop;
    if (this.isEditing && ctx) this.drawTokenPills(ctx);
  }
  /**
   * Une pastille derrière chaque token (couleur d'édition de l'hôte), sur le calque du
   * dessus : un repère d'édition, jamais exporté. `ctx` est en coordonnées écran.
   */
  drawTokenPills(ctx) {
    const spans = this.atomicSpans();
    const color = tokenColorOf(this);
    if (spans.length === 0 || !this.canvas || !color) return;
    ctx.save();
    ctx.transform(...this.canvas.viewportTransform);
    ctx.transform(...this.calcTransformMatrix());
    ctx.beginPath();
    ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    for (const [start, end] of spans) {
      for (const box of this._tokenBoxes(start, end)) {
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, box.h * 0.25);
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1 / (this.canvas.getZoom() * (this.scaleX || 1));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  /**
   * Les rectangles d'un token, un par ligne affichée (un token peut wrapper) : la boîte des
   * glyphes, celle du fond de texte natif de Fabric — depuis le haut de la ligne, sur la
   * hauteur de police (`getHeightOfLine / lineHeight`) ; l'interligne, en dessous, reste hors
   * de la pastille.
   */
  _tokenBoxes(start, end) {
    const a = this.get2DCursorLocation(start);
    const b = this.get2DCursorLocation(end);
    const pad = this.fontSize * 0.06;
    const boxes = [];
    let top = this._getTopOffset();
    for (let line = 0; line <= b.lineIndex && line < this._textLines.length; line++) {
      if (line >= a.lineIndex) {
        const from = line === a.lineIndex ? a.charIndex : 0;
        const to = line === b.lineIndex ? b.charIndex : this._textLines[line].length;
        if (!this.__charBounds[line]) this.measureLine(line);
        const bounds = this.__charBounds[line];
        if (to > from && bounds?.[from] && bounds[to - 1]) {
          const left = this._getLeftOffset() + this._getLineLeftOffset(line);
          const glyphs = this.getHeightOfLine(line) / this.lineHeight;
          boxes.push({
            x: left + bounds[from].left - pad,
            y: top,
            w: bounds[to - 1].left + bounds[to - 1].width - bounds[from].left + 2 * pad,
            h: glyphs
          });
        }
      }
      top += this.getHeightOfLine(line);
    }
    return boxes;
  }
  /**
   * Pas de glisser-déposer du texte sélectionné (Fabric) : presser sur une plage sélectionnée
   * et tirer re-sélectionne, comme dans un champ de texte — le glisser-déposer emportait le
   * texte quand on voulait étendre la sélection.
   */
  initBehavior() {
    super.initBehavior();
    this.draggableTextDelegate.start = () => false;
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
  /**
   * Coin : le texte et sa boîte grandissent ensemble, proportions gardées, le coin opposé
   * immobile. Le facteur est celui de toute poignée de coin (cornerScaleFactor), appliqué
   * depuis l'état du début du geste : les modes de taille ne changent pas, la police
   * absorbe tout.
   */
  handleCornerResize(transform, x, y) {
    let start = this._cornerStart;
    if (!start || start.transform !== transform) {
      start = { transform, state: textScaleState(this) };
      this._cornerStart = start;
    }
    const k = cornerScaleFactor(this, transform, x, y);
    return this._withAnchor(transform, () => {
      const before = { width: this.width, height: this.height, fontSize: this.fontSize };
      scaleText(this, start.state, k);
      return before.width !== this.width || before.height !== this.height || before.fontSize !== this.fontSize;
    });
  }
  /**
   * Taille programmatique (`setShapeSize`, comme une forme) : le facteur uniforme — la
   * moyenne des deux axes — passe dans la police, jamais dans un scale.
   */
  setSize(w, h) {
    const k = (w / (this.width || 1) + h / (this.height || 1)) / 2;
    scaleText(this, textScaleState(this), k);
  }
  /** Placé par une pile — un groupe (container libre) laisse ses enfants à leur propre taille. */
  _isChild() {
    if (parentIdOf(this) == null) return false;
    const parent = parentOf(this);
    return !isFreeContainer(parent);
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
      const layout = layoutOf(this) ?? {};
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
      const layout = layoutOf(this) ?? {};
      this.set("layout", { ...layout, sizing: { ...sizing, minSize } });
    }
    this.initDimensions();
    return before !== this.height;
  }
  // ── Données legacy ─────────────────────────────────────────────────
  /**
   * Un texte étiré (scaleX/scaleY) est ramené à scale 1 : le scale passe dans la
   * largeur et la police (`scaleText`). Exact pour un scale uniforme ; un étirement non
   * uniforme est perdu (les glyphes reprennent leurs proportions, la largeur garde son
   * propre facteur).
   */
  _bakeLegacyScale() {
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    if (sx === 1 && sy === 1) return;
    const state = textScaleState(this);
    this.scaleX = 1;
    this.scaleY = 1;
    scaleText(this, state, sy);
    this.width = state.width * sx;
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
    const layout = layoutOf(this);
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
CustomTextbox.customProperties = ["fontSizeIntent", "placeholder"];

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

// src/layout/z-order.ts
function stackBlock(objects, root) {
  return subtreeOf(objects, [root]);
}
function siblingsOf(objects, obj) {
  const parentId = parentIdOf(obj);
  return objects.filter((o) => parentIdOf(o) === parentId);
}
function placeBlockAbove(objects, root, above) {
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
function bringBlocksForward(objects, moved, overlaps) {
  let order = objects;
  let changed = false;
  for (const obj of [...moved].sort((a, b) => objects.indexOf(b) - objects.indexOf(a))) {
    const siblings = siblingsOf(order, obj);
    const next = siblings.slice(siblings.indexOf(obj) + 1).find((s) => !moved.includes(s) && overlaps(obj, s));
    if (!next) continue;
    order = placeBlockAbove(order, obj, next);
    changed = true;
  }
  return changed ? order : null;
}
function sendBlocksBackward(objects, moved) {
  let order = objects;
  let changed = false;
  for (const obj of [...moved].sort((a, b) => objects.indexOf(a) - objects.indexOf(b))) {
    const siblings = siblingsOf(order, obj);
    const prev = siblings.slice(0, siblings.indexOf(obj)).reverse().find((s) => !moved.includes(s));
    if (!prev || prev === order[0]) continue;
    order = placeBelow(order, obj, prev);
    changed = true;
  }
  return changed ? order : null;
}

// src/capabilities.ts
import { FabricImage, Group, Rect as Rect2 } from "#fabric";

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
}
function setTextContent(obj, text) {
  if (!("text" in obj)) return;
  const current = obj;
  if (current.placeholder && current.text !== text) obj.set("placeholder", false);
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
  if (!obj.visible || !obj.canvas) return;
  const pending = pendingBindings(obj);
  if (!Object.keys(pending).some((field) => field.startsWith("image."))) return;
  const screen = ctx.getTransform();
  ctx.save();
  ctx.transform(...obj.canvas.viewportTransform);
  obj.transform(ctx);
  ctx.beginPath();
  traceOutline(ctx, obj);
  ctx.setTransform(screen);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.restore();
}
function traceOutline(ctx, obj) {
  const shape = obj.clipPath;
  if (!shape) {
    ctx.rect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    return;
  }
  shape.transform(ctx);
  if (shape._renderPathCommands) {
    shape._renderPathCommands(ctx);
  } else if (typeof shape.radius === "number") {
    ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
  } else {
    const radius = Math.min(shape.rx ?? 0, shape.width / 2, shape.height / 2);
    ctx.roundRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height, radius);
  }
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
      layerId: idOf(object),
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
function transparentCanvas(width, height) {
  const el = util.createCanvasElement();
  el.width = Math.max(1, Math.round(width));
  el.height = Math.max(1, Math.round(height));
  return el;
}
function checkerPattern(obj) {
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  return new Pattern({ source: checkerTile(), repeat: "repeat", patternTransform: [1 / sx, 0, 0, 1 / sy, 0, 0] });
}
var USER_SLOT_STYLE_KEY = "userSlotStyle";
var DEFAULT_COLOR = DEFAULT_GUIDE_COLOR;
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
import { Rect, classRegistry, controlsUtils as controlsUtils3 } from "#fabric";

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
var { changeObjectWidth: changeObjectWidth2, changeObjectHeight: changeObjectHeight2 } = controlsUtils3;
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
  /**
   * Coin : proportions gardées, le facteur passe dans width/height (jamais dans un scale),
   * depuis la taille de départ du geste. Un container y ajoute son contenu (ScaleSession).
   */
  handleCornerResize(transform, x, y) {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    transform._startSize ?? (transform._startSize = { w: this.width, h: this.height });
    const start = transform._startSize;
    const k = cornerScaleFactor(this, transform, x, y);
    const before = { w: this.width, h: this.height };
    this.set({ width: start.w * k, height: start.h * k });
    this.setPositionByOrigin(anchor, originX, originY);
    return before.w !== this.width || before.h !== this.height;
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
import { Circle, classRegistry as classRegistry2, controlsUtils as controlsUtils4 } from "#fabric";
var { changeObjectWidth: changeObjectWidth3, changeObjectHeight: changeObjectHeight3 } = controlsUtils4;
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
    const scale = cornerScaleFactor(this, transform, x, y);
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
import { Path, classRegistry as classRegistry3, controlsUtils as controlsUtils5 } from "#fabric";

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
var { changeObjectWidth: changeObjectWidth4, changeObjectHeight: changeObjectHeight4 } = controlsUtils5;
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
    const scale = cornerScaleFactor(this, transform, x, y);
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
   * there (LayerManager's DEFAULT_SHAPE_FILL) — a colorless path takes it, an authored one
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
  if (isFreeContainer(obj)) Object.assign(rules, { onToolboxImage: null, hosts: false });
  if (stackParentOf(obj)) rules.restacks = false;
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

// src/layout/geometry.ts
import { Point as Point3 } from "#fabric";
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
function boxOf(obj) {
  obj.setCoords();
  const { left, top, width, height } = obj.getBoundingRect();
  return { left, top, width, height };
}
function unionBox(boxes) {
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}
function insetBox(box, pad) {
  return {
    left: box.left + pad.left,
    top: box.top + pad.top,
    width: box.width - pad.left - pad.right,
    height: box.height - pad.top - pad.bottom
  };
}
function outsetBox(box, pad) {
  return insetBox(box, { top: -pad.top, right: -pad.right, bottom: -pad.bottom, left: -pad.left });
}
function placeTopLeft(obj, x, y) {
  obj.setPositionByOrigin(new Point3(x, y), "left", "top");
  obj.setCoords();
}
function pointInObject(point, obj, margin = 0) {
  const tl = topLeft(obj);
  const { w, h } = scaledSize(obj);
  return point.x >= tl.x - margin && point.x <= tl.x + w + margin && point.y >= tl.y - margin && point.y <= tl.y + h + margin;
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

// src/ImageFrame.ts
import {
  Group as Group3,
  FabricImage as FabricImage4,
  classRegistry as classRegistry4,
  LayoutManager,
  FixedLayout
} from "#fabric";

// src/crop.ts
var NO_CROP = { x: 0.5, y: 0.5, scale: 1 };
var MAX_CROP_SCALE = 4;
var clamp01 = (v) => Math.max(0, Math.min(1, v));
var clampScale = (s) => Math.max(1, Math.min(MAX_CROP_SCALE, s));
var isCropped = (c) => c.scale > 1.001 || Math.abs(c.x - 0.5) > 1e-3 || Math.abs(c.y - 0.5) > 1e-3;
function normalizeCrop(c) {
  return {
    x: clamp01(Number.isFinite(c.x) ? c.x : 0.5),
    y: clamp01(Number.isFinite(c.y) ? c.y : 0.5),
    scale: clampScale(Number.isFinite(c.scale) ? c.scale : 1)
  };
}
var coverScale = (W, H, nat) => Math.max(W / nat.w, H / nat.h);
function photoRect(W, H, nat, c) {
  const s = coverScale(W, H, nat) * c.scale;
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  return { x: c.x * (W - Iw) + 0, y: c.y * (H - Ih) + 0, w: Iw, h: Ih };
}
function cropFromRect(W, H, nat, r) {
  const scale = clampScale(r.w / (nat.w * coverScale(W, H, nat)));
  const s = coverScale(W, H, nat) * scale;
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  const x = Math.abs(W - Iw) < 0.5 ? 0.5 : clamp01(r.x / (W - Iw));
  const y = Math.abs(H - Ih) < 0.5 ? 0.5 : clamp01(r.y / (H - Ih));
  return { x: x + 0, y: y + 0, scale };
}
function panCrop(W, H, nat, c, dx, dy) {
  const r = photoRect(W, H, nat, c);
  return cropFromRect(W, H, nat, { ...r, x: r.x + dx, y: r.y + dy });
}
function zoomCrop(W, H, nat, c, scale, px = W / 2, py = H / 2) {
  const r = photoRect(W, H, nat, c);
  const k = clampScale(scale) / c.scale;
  return cropFromRect(W, H, nat, { x: px - (px - r.x) * k, y: py - (py - r.y) * k, w: r.w * k, h: r.h * k });
}
function centerOffset(W, H, nat, c) {
  const r = photoRect(W, H, nat, c);
  return { x: r.x + r.w / 2 - W / 2, y: r.y + r.h / 2 - H / 2 };
}
function cropFromCenterOffset(W, H, nat, offsetX, offsetY, scale) {
  const s = coverScale(W, H, nat) * clampScale(scale);
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  return normalizeCrop({
    x: Iw - W < 0.5 ? 0.5 : 0.5 - offsetX / (Iw - W),
    y: Ih - H < 0.5 ? 0.5 : 0.5 - offsetY / (Ih - H),
    scale
  });
}

// src/ImageFrame.ts
var IMAGE_KEYS = ["src", "cropX", "cropY", "scale", "offsetX", "offsetY"];
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
    const coverScale2 = Math.max(frameWidth / image.width, frameHeight / image.height);
    image.set({
      scaleX: coverScale2,
      scaleY: coverScale2,
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
    this._crop = NO_CROP;
    this._imageMeta = {};
    this._pending = false;
    this._image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this._crop = options.crop ? normalizeCrop(options.crop) : cropFromCenterOffset(
      frameWidth,
      frameHeight,
      { w: image.width, h: image.height },
      options.imageOffsetX ?? 0,
      options.imageOffsetY ?? 0,
      1
    );
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
    this._applyCrop();
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
  /** Un cadre en attente dont l'hôte montre lui-même l'aperçu sous le canvas : le damier
   *  s'efface (transparent), le cadre reste en attente — rien ne change au save. */
  concealPlaceholder() {
    if (!this._pending) return;
    this._image.setElement(transparentCanvas(this._image.width, this._image.height));
    this.dirty = true;
  }
  // ─────────────────────────────────────────────────────────────
  // Recadrage (cf. crop.ts) : tout est dans le repère du cadre, origine en haut à gauche
  // ─────────────────────────────────────────────────────────────
  get crop() {
    return this._crop;
  }
  /** Se recadre : une vraie image (pas un damier d'attente). */
  get croppable() {
    return !this._pending;
  }
  get isCropped() {
    return isCropped(this._crop);
  }
  /** La taille native de l'image. */
  get naturalSize() {
    return { w: this._image.width, h: this._image.height };
  }
  setCrop(crop) {
    this._crop = normalizeCrop({ ...this._crop, ...crop });
    this._applyCrop();
    this.dirty = true;
  }
  resetCrop() {
    this.setCrop(NO_CROP);
  }
  /** L'image entière, dans le repère du cadre. */
  photoRect() {
    return photoRect(this.frameWidth, this.frameHeight, this.naturalSize, this._crop);
  }
  /** L'image posée en `rect` (repère du cadre) : bornée pour couvrir le cadre. */
  setPhotoRect(rect) {
    this.setCrop(cropFromRect(this.frameWidth, this.frameHeight, this.naturalSize, rect));
  }
  /** Décale l'image de (dx, dy) pixels de cadre depuis `from` (le recadrage au début du geste). */
  panCrop(dx, dy, from = this._crop) {
    this.setCrop(panCrop(this.frameWidth, this.frameHeight, this.naturalSize, from, dx, dy));
  }
  /** Change l'échelle en gardant fixe le point (px, py) du cadre, depuis `from`. */
  zoomCrop(scale, px, py, from = this._crop) {
    this.setCrop(zoomCrop(this.frameWidth, this.frameHeight, this.naturalSize, from, scale, px, py));
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
    const coverScale2 = Math.max(this.frameWidth / newImage.width, this.frameHeight / newImage.height);
    newImage.set({
      scaleX: coverScale2,
      scaleY: coverScale2,
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
    this._crop = NO_CROP;
    this._applyCrop();
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }
  /**
   * Redimensionne le frame : l'image reste en cover, le recadrage (normalisé) garde la même
   * zone autant que possible.
   */
  resizeFrame(newWidth, newHeight) {
    this.frameWidth = newWidth;
    this.frameHeight = newHeight;
    this.width = newWidth;
    this.height = newHeight;
    this._applyCrop();
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
  /** L'image dans le groupe (origine au centre) : cover × échelle, centre décalé selon le recadrage. */
  _applyCrop() {
    const nat = this.naturalSize;
    const s = coverScale(this.frameWidth, this.frameHeight, nat) * this._crop.scale;
    const offset = centerOffset(this.frameWidth, this.frameHeight, nat, this._crop);
    this._image.set({ scaleX: s, scaleY: s, left: offset.x, top: offset.y });
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
        const corner = changeX !== 0 && changeY !== 0;
        const ratio = transform._startHeight / transform._startWidth;
        if (corner) {
          const k = (newWidth + newHeight) / (transform._startWidth + transform._startHeight);
          newWidth = transform._startWidth * k;
          newHeight = transform._startHeight * k;
        }
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
          if (snapResult.width !== null) newWidth = snapResult.width;
          if (snapResult.height !== null) newHeight = snapResult.height;
          if (corner && snapResult.width !== null) newHeight = newWidth * ratio;
          else if (corner && snapResult.height !== null) newWidth = newHeight / ratio;
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
        cropX: this._crop.x,
        cropY: this._crop.y,
        scale: this._crop.scale
      }
    };
  }
  static async fromObject(data) {
    const { src, cropX, cropY, offsetX = 0, offsetY = 0, scale = 1 } = data.image;
    const options = {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      frameWidth: data.frameWidth,
      frameHeight: data.frameHeight,
      imageMeta: imageMetaOf(data.image)
    };
    const img = src ? await FabricImage4.fromURL(src, { crossOrigin: "anonymous" }) : null;
    options.crop = cropX !== void 0 || cropY !== void 0 ? { x: cropX, y: cropY, scale } : cropFromCenterOffset(
      data.frameWidth,
      data.frameHeight,
      { w: img?.width || 1, h: img?.height || 1 },
      offsetX,
      offsetY,
      scale
    );
    const frame = img ? new _ImageFrame(img, options) : _ImageFrame.pending({ ...options, frameWidth: data.frameWidth, frameHeight: data.frameHeight });
    if (data.layout) frame.set("layout", data.layout);
    if (data.originX) frame.set({ originX: data.originX, originY: data.originY ?? data.originX });
    if (data.stroke) frame.set({ stroke: data.stroke, strokeWidth: data.strokeWidth ?? 4 });
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
var DEFAULT_SHAPE_FILL = "#d9d9d9";
var LAYER_PROPS = ["layerId", "lockMode", "lockContent", "layout", "bindings", "bindingSegments"];
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
    return findById(this.canvas.getObjects(), layerId);
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
  /** Le centre du document. */
  get center() {
    return new Point4(this.canvas.width / 2, this.canvas.height / 2);
  }
  /**
   * La boîte d'un calque neuf : la moitié du document dans chaque sens, un quart de sa
   * surface. Un calque y entre en gardant ses proportions.
   */
  get newLayerBox() {
    return { w: this.canvas.width / 2, h: this.canvas.height / 2 };
  }
  fitNewLayerBox(obj) {
    const { w, h } = scaledSize(obj);
    const box = this.newLayerBox;
    const scale = Math.min(box.w / w, box.h / h);
    setShapeSize(obj, w * scale, h * scale);
  }
  /** Un calque ajouté sans position (un clic, pas un lâcher) se pose au centre du document. */
  centerUnplaced(obj, options) {
    if (options.left != null || options.top != null) return;
    obj.setPositionByOrigin(this.center, "center", "center");
    obj.setCoords();
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
   * Monte l'objet (ou les objets) devant le premier objet de même niveau qui le
   * chevauche. Un container emmène ses descendants (toujours au-dessus de lui) ; un enfant
   * reste parmi les enfants de son container ; des objets montés ensemble ne se doublent pas.
   */
  bringForward(obj) {
    const moved = Array.isArray(obj) ? obj : [obj];
    const order = bringBlocksForward(this.canvas.getObjects(), moved, (a, b) => a.isOverlapping(b));
    if (order) this.applyStackOrder(order);
  }
  /**
   * Descend l'objet (ou les objets) d'un niveau, mêmes règles de blocs que bringForward.
   * Ne peut pas descendre en dessous de l'image de fond.
   */
  sendBackward(obj) {
    const moved = Array.isArray(obj) ? obj : [obj];
    const order = sendBlocksBackward(this.canvas.getObjects(), moved);
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
      layerId = this.generateId(),
      placeholder = false
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
    if (placeholder) textObj.placeholder = true;
    return textObj;
  }
  addText(options = {}) {
    const textObj = this.createText(options);
    this.centerUnplaced(textObj, options);
    this.add(textObj);
    return textObj;
  }
  /**
   * Crée et ajoute un calque image dans un ImageFrame
   */
  async addImage(url, options = {}) {
    const center = this.center;
    const { left = center.x, top = center.y, layerId = this.generateId(), imageMeta } = options;
    const img = await FabricImage5.fromURL(url, { crossOrigin: "anonymous" });
    const box = this.newLayerBox;
    const frameScale = Math.min(box.w / img.width, box.h / img.height);
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
   * @param options.select - Sélectionner l'image remplacée (défaut) — faux pour un remplacement
   *   d'affichage (un champ lié interpolé pour ce lecteur), qui ne doit pas toucher la sélection
   */
  async replaceImageSource(target, newUrl, options) {
    if (kindOf(target) === "imageShape") {
      const frame = target;
      const newImg = await FabricImage5.fromURL(newUrl, { crossOrigin: "anonymous" });
      frame.replaceImage(newImg, options?.imageMeta);
      if (options?.opacity !== void 0) {
        frame.opacity = options.opacity;
      }
      if (frame.selectable !== false && options?.select !== false) this.canvas.setActiveObject(frame);
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
    const coverScale2 = Math.max(oldWidth / newImg.width, oldHeight / newImg.height);
    let adjustedClipPath = target.clipPath;
    if (target.clipPath) {
      adjustedClipPath = await target.clipPath.clone();
      const clipScaleX = (adjustedClipPath.scaleX || 1) * (target.scaleX / coverScale2);
      const clipScaleY = (adjustedClipPath.scaleY || 1) * (target.scaleY / coverScale2);
      adjustedClipPath.set({ scaleX: clipScaleX, scaleY: clipScaleY });
    }
    newImg.set({
      ...props,
      scaleX: coverScale2,
      scaleY: coverScale2,
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
    const layout = layoutOf(previous);
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
      fill = DEFAULT_SHAPE_FILL,
      stroke,
      shapeType = "rect",
      layerId = this.generateId()
    } = options;
    const common = { fill, stroke, left, top, width: options.width, height: options.height };
    const shape = options.paths?.length ? createPathsShape(options.paths, { id: shapeType, ...common }) : createShape(shapeType, common);
    shape.set({ layerId, layerType: "shape" });
    if (options.width == null && options.height == null) this.fitNewLayerBox(shape);
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
    this.centerUnplaced(shape, options);
    this.add(shape);
    return shape;
  }
  addShape(options = {}) {
    const shape = this.createShape(options);
    this.centerUnplaced(shape, options);
    this.add(shape);
    return shape;
  }
  /**
   * @legacy Fusionne des objets dans un `fabric.Group` (éditeur SAFTI legacy, « fusionner
   * les calques »). Pour grouper dans l'éditeur : `FabricEditor.groupSelection` (un groupe
   * libre, ses objets restent des calques).
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
    return this.all.map((obj) => obj.toObject([...LAYER_PROPS]));
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
    const migrated = obj && migrateLegacyLayout(layoutOf(obj));
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
import { ActiveSelection, Point as Point5 } from "#fabric";
var SelectionManager = class {
  constructor(canvas) {
    this.canvas = canvas;
    this._current = null;
    this.callbacks = {};
    this.isTransforming = false;
    this._silenced = false;
    /**
     * When set, we are "inside" this container: hover and click target
     * children directly instead of redirecting to the container.
     */
    this._enteredId = null;
    /** What was selected before this press — Fabric selects before firing mouse:down. */
    this._selectedBeforePress = null;
    this.setupListeners();
  }
  /** The layerId of the container we're currently editing inside, or null. */
  get enteredContainerId() {
    return this._enteredId;
  }
  /** @deprecated Use `enteredContainerId` (any container can be entered, not only a group). */
  get activeGroupId() {
    return this._enteredId;
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
   * Définit le callback onSelectMany
   */
  set onSelectMany(callback) {
    this.callbacks.onSelectMany = callback;
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
   * outside the entered container resolves to its container, up the chain (a
   * grandchild resolves to the outermost container that isn't the active
   * entered container's child).
   */
  resolveTarget(obj) {
    let current = obj;
    for (; ; ) {
      const parentId = parentIdOf(current);
      if (!parentId || parentId === this._enteredId) return current;
      const parent = parentOf(current, this.canvas.getObjects());
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
   * Sélectionne un objet par son layerId — depuis l'extérieur du canvas (la piste Calques
   * d'une vidéo, un panneau). Un enfant de container est sélectionné LUI, pas son container :
   * on entre dans le container comme un double-clic, sinon resolveTarget remonterait la
   * sélection d'un cran.
   */
  selectByLayerId(layerId) {
    const obj = findById(this.canvas.getObjects(), layerId);
    if (!obj) return false;
    this._enteredId = parentIdOf(obj) ?? null;
    this.select(obj);
    return true;
  }
  /**
   * Sélectionne plusieurs objets (normalisés comme une sélection à la souris). Un seul
   * objet retenu : sélection simple ; aucun : rien n'est sélectionné.
   */
  selectMany(objects) {
    const kept = this.normalizeMany(objects);
    if (kept.length === 0) this.clear();
    else if (kept.length === 1) this.select(kept[0]);
    else {
      this.canvas.setActiveObject(new ActiveSelection(kept, { canvas: this.canvas.originalFabricCanvas }));
      this.canvas.renderAll();
    }
  }
  /**
   * Travaille sur les objets sélectionnés hors de la sélection de Fabric — dedans, leurs
   * positions sont relatives à elle — puis les resélectionne, dans le même container entré. L'hôte
   * n'entend que la resélection : la barre se replace sur la nouvelle boîte.
   */
  withSelectionReleased(fn) {
    const objects = this.selected;
    const enteredId = this._enteredId;
    const silenced = this._silenced;
    this._silenced = true;
    this.canvas.discardActiveObject();
    this._silenced = silenced;
    this._enteredId = enteredId;
    fn(objects);
    this.selectMany(objects);
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
   * outside its entered container a press on its container, so that a click + drag moves
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
   * Exit: a press outside the entered container (or on empty canvas) leaves it.
   * Entering is decided on release (see handleMouseUp), so that a drag on a
   * selected container still moves it.
   */
  handleMouseDown(e) {
    if (!this._enteredId) return;
    const target = e.target;
    const isTheContainer = target?.get("layerId") === this._enteredId;
    const isItsChild = parentIdOf(target) === this._enteredId;
    if (!target || !isTheContainer && !isItsChild) this._enteredId = null;
  }
  /**
   * Enter: a click (no drag) on a container that was already selected
   * enters it and selects its child under the pointer.
   */
  handleMouseUp(e) {
    const before = this._selectedBeforePress;
    this._selectedBeforePress = null;
    if (!e.isClick || !before || e.target !== before) return;
    if (!containerDataOf(before)) return;
    this.enterContainer(before, this.canvas.getScenePoint(e.e));
  }
  /** Enter `container` and select its topmost child under `point`. */
  enterContainer(container, point) {
    const id = idOf(container);
    this._enteredId = id;
    const child = this.canvas.getObjects().slice().reverse().find(
      (o) => parentIdOf(o) === id && o.containsPoint(new Point5(point.x, point.y))
    );
    if (child) this.canvas.setActiveObject(child);
    this.canvas.requestRenderAll();
  }
  /**
   * Double-click on a text inside a container: its two clicks entered the
   * container and selected the text (the press targeted the container, so
   * Fabric's own double-click editing didn't run) — edit it now, word under
   * the pointer selected, like Fabric does.
   */
  handleDoubleClick(e) {
    const text = this.current;
    if (!text || !isTextObject(text) || text.isEditing || text.editable === false) return;
    if (parentIdOf(text) !== this._enteredId) return;
    text.enterEditing(e.e);
    text.selectWord(text.getSelectionStartFromPointer(e.e));
    this.canvas.requestRenderAll();
  }
  /**
   * Gère la création/mise à jour de sélection
   * Les objets verrouillés sont exclus des sélections multiples
   */
  handleSelection() {
    if (this._silenced) return;
    const activeObject = this.canvas.getActiveObject();
    if (!activeObject) return;
    if (activeObject instanceof ActiveSelection) {
      this.handleMultipleSelection(activeObject);
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
   * Une sélection multiple ne garde que des objets du niveau visé : chacun remonte à son
   * container comme un clic (resolveTarget), un objet dont l'ancêtre est pris suit cet
   * ancêtre, les verrouillés restent dehors. Si la sélection de Fabric n'est pas déjà
   * celle-là, on la remplace — l'événement qui suit repasse ici, sélection conforme.
   * Pas de poignées de taille ni de rotation : un redimensionnement ne s'empile jamais
   * en `scale`, et la sélection n'a pas encore le sien (cf. groupes libres). Des enfants
   * d'une pile ne se déplacent pas à plusieurs : leur place est celle que la pile leur
   * donne (ceux d'un groupe, si).
   */
  handleMultipleSelection(selection) {
    const members = selection.getObjects();
    const kept = this.normalizeMany(members);
    if (kept.length === 0) {
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      return;
    }
    if (kept.length === 1) {
      this.canvas.setActiveObject(kept[0]);
      this.canvas.requestRenderAll();
      return;
    }
    if (kept.length !== members.length || kept.some((obj) => !members.includes(obj))) {
      this.canvas.setActiveObject(new ActiveSelection(kept, { canvas: this.canvas.originalFabricCanvas }));
      this.canvas.requestRenderAll();
      return;
    }
    const pinned = kept.some((obj) => stackParentOf(obj));
    selection.set({ hasControls: false, lockMovementX: pinned, lockMovementY: pinned });
    this._current = kept;
    if (this.callbacks.onSelectMany) this.callbacks.onSelectMany(kept);
    else this.callbacks.onSelect?.(kept[0]);
  }
  /**
   * Les objets d'une sélection multiple ramenés au niveau visé, dans l'ordre de la pile.
   * Le container dans lequel on est entré n'en fait pas partie : c'est le cadre de la
   * sélection, pas un de ses éléments.
   */
  normalizeMany(objects) {
    const picked = /* @__PURE__ */ new Set();
    for (const obj of objects) {
      const resolved = this.resolveTarget(obj);
      if (this._enteredId && resolved.get("layerId") === this._enteredId) continue;
      if (isPositionLocked(resolved)) continue;
      picked.add(resolved);
    }
    const all = this.canvas.getObjects();
    return all.filter((obj) => picked.has(obj) && !ancestorsOf(obj, all).some((a) => picked.has(a)));
  }
  /**
   * Gère la désélection
   */
  handleDeselection() {
    this._current = null;
    this._enteredId = null;
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
    this.notifyModified(e.target || null);
  }
  /** Le canal « quelque chose a changé » : ce que l'hôte écoute après un geste — les
   *  commandes de l'éditeur (coller, décaler, dupliquer) le préviennent par là aussi. */
  notifyModified(target) {
    this.callbacks.onModified?.(target);
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

// src/SnappingManager.ts
import { ActiveSelection as ActiveSelection2 } from "#fabric";

// src/ui/guides.ts
import { Line, Rect as Rect4, Pattern as Pattern2 } from "#fabric";
var CanvasGuides = class {
  constructor(canvas, color = DEFAULT_SNAP_GUIDE_COLOR) {
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
    const rect = new Rect4({
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
    const containerLayout = layoutOf(container);
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
  /**
   * Les guides de l'aimant d'un déplacement (SnappingManager, src/snap.ts) : un pointillé
   * fin à l'écran quel que soit le zoom, qui joint l'objet et sa cible et dépasse un peu
   * de chaque côté. Le centre de la PAGE (`center` + `page`) se dit autrement, dans la même
   * couleur : un trait plein d'un bord à l'autre, et une croix de 9 px au centre de l'objet
   * — on voit qu'on est centré, sur un axe ou les deux.
   */
  showSnapGuides(guides, zoom, center) {
    this.clear();
    const overshoot = 8 / zoom;
    let centered = false;
    for (const guide2 of guides) {
      const onPageCenter = Boolean(guide2.center && guide2.page);
      centered || (centered = onPageCenter);
      const from = guide2.from - (onPageCenter ? 0 : overshoot);
      const to = guide2.to + (onPageCenter ? 0 : overshoot);
      const coords = guide2.axis === "x" ? [guide2.at, from, guide2.at, to] : [from, guide2.at, to, guide2.at];
      this.addLine(coords, { strokeWidth: 1 / zoom, strokeDashArray: onPageCenter ? [] : [4 / zoom, 4 / zoom] });
    }
    if (centered && center) this.addCross(center, 9 / zoom, 1 / zoom);
  }
  /** Une croix de `size` de côté, centrée sur `at`, dans la couleur des guides. */
  addCross(at, size, strokeWidth) {
    const half = size / 2;
    this.addLine([at.x - half, at.y, at.x + half, at.y], { strokeWidth, strokeDashArray: [] });
    this.addLine([at.x, at.y - half, at.x, at.y + half], { strokeWidth, strokeDashArray: [] });
  }
  showSnapLines(guides) {
    this.clear();
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    for (const guide2 of guides) {
      const coords = guide2.orientation === "vertical" ? [guide2.position, 0, guide2.position, canvasH] : [0, guide2.position, canvasW, guide2.position];
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

// src/snap.ts
var marks = (start, size) => [
  { at: start, center: false },
  { at: start + size / 2, center: true },
  { at: start + size, center: false }
];
function snapMove(moving, targets, threshold, keep = {}) {
  let bestX = null;
  let bestY = null;
  for (const target of targets) {
    bestX = closest(bestX, marks(moving.left, moving.width), marks(target.left, target.width), threshold, target, keep.x);
    bestY = closest(bestY, marks(moving.top, moving.height), marks(target.top, target.height), threshold, target, keep.y);
  }
  const dx = bestX?.delta ?? 0;
  const dy = bestY?.delta ?? 0;
  const placed = { ...moving, left: moving.left + dx, top: moving.top + dy };
  const guides = [];
  if (bestX) guides.push(guide("x", bestX, placed.top, placed.height, bestX.target.top, bestX.target.height));
  if (bestY) guides.push(guide("y", bestY, placed.left, placed.width, bestY.target.left, bestY.target.width));
  const center = { x: placed.left + placed.width / 2, y: placed.top + placed.height / 2 };
  return { dx, dy, guides, center };
}
function closest(best, own, theirs, threshold, target, kept) {
  for (const a of own) {
    for (const b of theirs) {
      if (a.center !== b.center) continue;
      const delta = b.at - a.at;
      if (Math.abs(delta) > threshold) continue;
      if (!best || better(b.at, delta, best, kept)) best = { at: b.at, delta, target, center: a.center };
    }
  }
  return best;
}
function better(at, delta, best, kept) {
  if (best.at === kept) return false;
  if (at === kept) return true;
  return Math.abs(delta) < Math.abs(best.delta);
}
function guide(axis, best, start, size, targetStart, targetSize) {
  const line = {
    axis,
    at: best.at,
    from: Math.min(start, targetStart),
    to: Math.max(start + size, targetStart + targetSize)
  };
  if (best.center) line.center = true;
  if (best.target.page) line.page = true;
  return line;
}

// src/SnappingManager.ts
var SnappingManager = class {
  constructor(canvas, config = {}, guideColor) {
    this.enabled = true;
    /** Les guides actifs du déplacement en cours (préférés tant qu'ils restent dans le seuil) */
    this.kept = {};
    this.resizeSnapState = null;
    /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
    this.exitMultiplier = 2;
    this.onMoving = (e) => this.handleObjectMoving(e.target);
    this.onResizing = (e) => this.handleObjectScaling(e.target);
    this.onSettled = () => {
      this.kept = {};
      this.guides.clearAndRender();
    };
    this.canvas = canvas;
    this.config = {
      threshold: config.threshold ?? 8,
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
    this.canvas.on("object:moving", this.onMoving);
    this.canvas.on("object:resizing", this.onResizing);
    this.canvas.on("object:modified", this.onSettled);
    this.canvas.on("selection:cleared", this.onSettled);
    this.canvas.on("mouse:up", this.onSettled);
  }
  /**
   * Un objet (ou une sélection) se déplace : il s'aimante sur les bords et centres de la
   * page et des autres objets, dans le seuil (pixels écran). Un enfant de pile n'est pas
   * aimanté — la pile le place. Ni l'objet, ni sa descendance, ni ses ancêtres ne sont des
   * cibles : un groupe suit son enfant, s'y caler ferait boucle.
   */
  handleObjectMoving(obj) {
    if (!obj || !this.enabled) return;
    if (obj.get("layerId") === "originalImage") return;
    const moving = obj instanceof ActiveSelection2 ? obj.getObjects() : [obj];
    const objects = this.canvas.getObjects();
    if (!(obj instanceof ActiveSelection2) && stackParentOf(obj, objects)) {
      this.guides.clearAndRender();
      return;
    }
    const excluded = /* @__PURE__ */ new Set([
      ...subtreeOf(objects, moving),
      ...moving.flatMap((member) => ancestorsOf(member, objects))
    ]);
    const targets = objects.filter((other) => !excluded.has(other) && isSnapTarget(other)).map((other) => other.getBoundingRect());
    targets.push({ left: 0, top: 0, width: this.canvas.width, height: this.canvas.height, page: true });
    const zoom = this.canvas.getZoom() || 1;
    obj.setCoords();
    const { dx, dy, guides, center } = snapMove(obj.getBoundingRect(), targets, this.config.threshold / zoom, this.kept);
    this.kept = {
      x: guides.find((guide2) => guide2.axis === "x")?.at,
      y: guides.find((guide2) => guide2.axis === "y")?.at
    };
    if (dx || dy) {
      obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
      obj.setCoords();
    }
    this.guides.showSnapGuides(guides, zoom, center);
    this.canvas.requestRenderAll();
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
    this.canvas.off("object:moving", this.onMoving);
    this.canvas.off("object:resizing", this.onResizing);
    this.canvas.off("object:modified", this.onSettled);
    this.canvas.off("selection:cleared", this.onSettled);
    this.canvas.off("mouse:up", this.onSettled);
  }
};
function isSnapTarget(obj) {
  return obj.visible !== false && !obj.excludeFromExport && obj.evented !== false;
}

// src/LayoutManager.ts
import { ActiveSelection as ActiveSelection3 } from "#fabric";

// src/DragToLayout.ts
import { Point as Point7 } from "#fabric";

// src/layout/stack/engine.ts
var yoga = null;
var yogaConfig = null;
async function initYoga() {
  if (yoga) return;
  const { loadYoga } = await import("yoga-layout/load");
  yoga = await loadYoga();
  yogaConfig = yoga.Config.create();
  yogaConfig.setPointScaleFactor(0);
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
  const isColumn = directionOf(cd) === "column";
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
  if (!allObjects || isTextObject(obj) || isFreeContainer(obj)) return null;
  const layout = layoutOf(obj);
  if (!layout?.container) return null;
  const children = flowChildrenOf(allObjects, obj);
  return children.length > 0 ? children : null;
}
function buildChildren(parent, children, cd, sizing, allObjects, Y) {
  const isColumn = directionOf(cd) === "column";
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
    if (flexGrow > 0 && !isFreeContainer(obj)) node.setFlexGrow(flexGrow);
    const effectiveAlign = alignSelf !== "auto" ? alignSelf : alignItems;
    const willStretch = effectiveAlign === "stretch";
    const entry = { obj, node };
    const nested = nestedChildren(obj, allObjects);
    const mainHug = nested && (isColumn ? sizingOf(obj).y : sizingOf(obj).x) === "hug";
    node.setFlexShrink(isTextObject(obj) || mainHug ? 1 : 0);
    if (isTextObject(obj)) {
      setupTextMeasure(node, obj, Y);
    } else if (isFreeContainer(obj)) {
      setRigidSize(node, obj, { isColumn, willStretch: false, parentSizing: sizing, flexGrow: 0 });
      if (allObjects) entry.followers = descendantsOf(allObjects, [obj]);
    } else if (nested) {
      const childCd = layoutOf(obj).container;
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
  for (const { obj, node, children, followers } of built) {
    const before = followers && topLeft(obj);
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
    if (before) {
      const after = topLeft(obj);
      translateObjects(followers, after.x - before.x, after.y - before.y);
    }
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

// src/layout/rotation.ts
import { util as util3 } from "#fabric";
function rotateAbout(obj, pivot, delta) {
  if (!delta) return;
  const center = obj.getCenterPoint().rotate(util3.degreesToRadians(delta), pivot);
  obj.set({ angle: (obj.angle || 0) + delta });
  obj.setPositionByOrigin(center, "center", "center");
  obj.setCoords();
}
function inLocalFrame(root, objects, fn) {
  const angle = root.angle || 0;
  if (Math.abs(angle) < 1e-6) return fn();
  const pivot = root.getCenterPoint();
  const subtree = subtreeOf(objects, [root]);
  for (const obj of subtree) rotateAbout(obj, pivot, -angle);
  try {
    return fn();
  } finally {
    for (const obj of subtree) rotateAbout(obj, pivot, angle);
  }
}
function inRootFrame(obj, objects, fn) {
  const ancestors = ancestorsOf(obj, objects);
  const root = ancestors[ancestors.length - 1] ?? obj;
  return inLocalFrame(root, objects, fn);
}
var SubtreeRotate = class _SubtreeRotate {
  constructor(transform, pivot, startAngle, followers) {
    this.transform = transform;
    this.pivot = pivot;
    this.startAngle = startAngle;
    this.followers = followers;
  }
  static begin(target, moved, transform, objects) {
    return new _SubtreeRotate(
      transform,
      target.getCenterPoint(),
      transform?.original?.angle ?? target.angle ?? 0,
      descendantsOf(objects, moved).map((o) => ({ obj: o, center: o.getCenterPoint(), angle: o.angle || 0 }))
    );
  }
  /** La descendance suit la rotation de `target` depuis le début. */
  follow(target) {
    const delta = (target.angle || 0) - this.startAngle;
    const rad = util3.degreesToRadians(delta);
    for (const f of this.followers) {
      f.obj.set({ angle: f.angle + delta });
      f.obj.setPositionByOrigin(f.center.rotate(rad, this.pivot), "center", "center");
      f.obj.setCoords();
    }
  }
};

// src/layout/free/fit.ts
function fitFreeContainer(container, objects) {
  inLocalFrame(container, objects, () => fitFreeContainerLocal(container, objects));
}
function fitFreeContainerLocal(container, objects) {
  const children = childrenOf(objects, container).map((c) => c.obj);
  if (children.length === 0) return;
  for (const child of children) if (isFreeContainer(child)) fitFreeContainer(child, objects);
  const box = outsetBox(unionBox(children.map(boxOf)), paddingOf(containerDataOf(container)));
  setShapeSize(container, box.width, box.height);
  placeTopLeft(container, box.left, box.top);
}
function fitFreeAncestors(group, objects) {
  for (let current = group; current && isFreeContainer(current); current = parentContainerOf(current, objects)) {
    fitFreeContainer(current, objects);
  }
}

// src/layout/run.ts
function runLayout(objects) {
  for (const obj of objects) {
    const layout = layoutOf(obj);
    if (!layout?.container) continue;
    if (parentContainerOf(obj, objects)) continue;
    layoutTree(obj, objects);
  }
}
function layoutTree(container, objects) {
  inLocalFrame(container, objects, () => layoutTreeLocal(container, objects));
}
function layoutTreeLocal(container, objects) {
  const cd = layoutOf(container).container;
  const children = flowChildrenOf(objects, container);
  if (children.length === 0) return;
  if (cd.arrangement === "free") {
    for (const { obj } of children) {
      if (containerDataOf(obj)) layoutTree(obj, objects);
    }
    fitFreeContainer(container, objects);
    return;
  }
  fitGroupsUnder(container, objects);
  layoutContainer(container, cd, children, objects);
}
function fitGroupsUnder(container, objects) {
  for (const { obj } of childrenOf(objects, container)) {
    if (!containerDataOf(obj)) continue;
    if (isFreeContainer(obj)) layoutTree(obj, objects);
    else fitGroupsUnder(obj, objects);
  }
}
function layoutSubtree(container, allObjects) {
  layoutTree(container, allObjects);
}
function relayoutAncestors(obj, allObjects) {
  for (let parent = parentContainerOf(obj, allObjects); parent; parent = parentContainerOf(parent, allObjects)) {
    layoutTree(parent, allObjects);
  }
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

// src/layout/stack/sessions/animator.ts
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

// src/layout/stack/sessions/session.ts
var EXIT_MARGIN = 5;
function takePlacement(obj) {
  const { w, h } = scaledSize(obj);
  const o = obj;
  return {
    left: obj.left,
    top: obj.top,
    originX: obj.originX,
    originY: obj.originY,
    w,
    h,
    width: obj.width,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    stroke: obj.stroke,
    strokeWidth: obj.strokeWidth,
    textAlign: o.textAlign,
    layout: cloneLayout(obj)
  };
}
function restorePlacement(obj, p, parts) {
  if (parts.size) {
    if (isTextObject(obj)) obj.set({ width: p.width, scaleX: p.scaleX, scaleY: p.scaleY });
    else setShapeSize(obj, p.w, p.h);
  }
  if (parts.position) obj.set({ left: p.left, top: p.top, originX: p.originX, originY: p.originY });
  if (parts.style) {
    if (isTextObject(obj)) obj.set({ textAlign: p.textAlign });
    else obj.set({ stroke: p.stroke, strokeWidth: p.strokeWidth });
  }
  if (parts.layout) obj.set("layout", p.layout);
  obj.setCoords();
}
function ensureStableOrders(children) {
  children.forEach((child, i) => {
    if (child.cl.order != null) return;
    updateChild(child.obj, { order: i });
    child.cl = childDataOf(child.obj);
  });
}
function siblingAnchors(siblings) {
  const anchors = /* @__PURE__ */ new Map();
  for (const { obj } of siblings) {
    const tl = topLeft(obj);
    const { w, h } = scaledSize(obj);
    anchors.set(obj, { left: tl.x, top: tl.y, w, h });
  }
  return anchors;
}

// src/layout/stack/sessions/insert-child.ts
var InsertChildSession = class _InsertChildSession {
  /**
   * `reattach`: the child is already in the container and is moved inside it — on
   * rollback (dragged out) it leaves the container instead of going back.
   */
  constructor(canvas, container, child, cursor, isReattach = false) {
    this.canvas = canvas;
    this.container = container;
    this.child = child;
    this.isReattach = isReattach;
    /** Current decided direction — cached for hysteresis. null = not yet decided. */
    this._currentDirection = null;
    /** Last Yoga-computed position of the dragged child (not the cursor position). */
    this._lastDraggedYogaPos = null;
    this._newChildAnchorSize = scaledSize(child);
    this._animator = new LayoutAnimator(canvas);
    this.before = { container: takePlacement(container), child: takePlacement(child) };
    const all = flowChildrenOf(canvas.getObjects(), container);
    const siblings = all.filter((c) => c.obj !== child);
    this._decidingDirection = isReattach ? all.length <= 2 : siblings.length === 1 && !containerDataOf(container)?.flexDirection;
    ensureStableOrders(all);
    this._siblingAnchors = siblingAnchors(siblings);
    if (!isReattach) {
      updateLayout(child, { child: { parentId: idOf(container) } });
      const tl = topLeft(child);
      child.set({ left: tl.x, top: tl.y, originX: "left", originY: "top" });
      child.setCoords();
    }
    this.updateFromCursor(cursor);
  }
  /** @deprecated Use `new InsertChildSession(…, true)` or createDropSession. */
  static reattach(canvas, container, child, cursor) {
    return new _InsertChildSession(canvas, container, child, cursor, true);
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
    const { w, h } = scaledSize(this.container);
    updateLayout(this.container, { sizing: { ...sizingOf(this.container), minSize: { w, h } } });
    const positionsBefore = /* @__PURE__ */ new Map();
    for (const { obj } of childrenOf(this.canvas.getObjects(), this.container)) {
      positionsBefore.set(obj, { left: obj.left, top: obj.top });
    }
    runLayout(this.canvas.getObjects());
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }
    this.canvas.renderAll();
  }
  rollback() {
    this._animator.cancelAll();
    detachChild(this.child);
    if (this.isReattach) {
      const remaining = childrenOf(this.canvas.getObjects(), this.container);
      const cd = this.before.container.layout?.container;
      if (remaining.length <= 1 && cd) {
        const { flexDirection: _d, gap: _g, ...rest } = cd;
        this.before.container.layout = { ...this.before.container.layout, container: rest };
      }
      this.child.setCoords();
    } else {
      restorePlacement(this.child, this.before.child, { position: true, layout: true });
    }
    restorePlacement(this.container, this.before.container, { size: true, position: true, layout: true });
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }
  // ── Private ───────────────────────────────────────────────────────
  shouldExit(cursor) {
    return !pointInObject(cursor, this.container, EXIT_MARGIN);
  }
  /**
   * Session decides direction + order from cursor, then asks yoga
   * to preview positions. Only OTHER children are repositioned;
   * the dragged child stays under the cursor.
   */
  updateFromCursor(cursor) {
    this._animator.flushToTargets(this.child);
    const allChildren = flowChildrenOf(this.canvas.getObjects(), this.container);
    const otherChildren = allChildren.filter((c) => c.obj !== this.child);
    if (this._decidingDirection && otherChildren.length === 1) {
      const direction = this.detectDirection(cursor, otherChildren[0]);
      const isColumn = direction === "column";
      const order = this.computeInsertOrder(cursor, otherChildren, isColumn);
      const gap = Math.min(
        this.computeGap(cursor, otherChildren, order, isColumn),
        this.freeMainSpace(otherChildren, isColumn)
      );
      updateContainer(this.container, { flexDirection: direction, gap });
      updateChild(this.child, { order });
    } else {
      const isColumn = directionOf(containerDataOf(this.container)) === "column";
      updateChild(this.child, { order: this.computeInsertOrder(cursor, otherChildren, isColumn) });
    }
    this.previewLayout(flowChildrenOf(this.canvas.getObjects(), this.container));
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
  /** Last computed order — for hysteresis. */
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
        return slots[i].order;
      }
    }
    return slots[0].order;
  }
  /**
   * Room the gap may take on the main axis: unlimited when the container hugs
   * it (it grows), else the inner size minus the children's sizes when grabbed
   * — the gap stops when they reach the edge instead of squeezing them.
   */
  freeMainSpace(existingChildren, isColumn) {
    const sizing = sizingOf(this.container);
    if ((isColumn ? sizing.y : sizing.x) === "hug") return Infinity;
    const cd = layoutOf(this.container).container;
    const pad = paddingOf(cd);
    const { w, h } = scaledSize(this.container);
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
    const newChildSize = scaledSize(this.child);
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
    const containerLayout = layoutOf(this.container);
    const cd = containerLayout.container;
    const sizing = sizingOf(this.container);
    const { w: currentW, h: currentH } = scaledSize(this.container);
    const minW = sizing.minSize?.w ?? 0;
    const minH = sizing.minSize?.h ?? 0;
    const containerTL = topLeft(this.container);
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
      setShapeSize(this.container, finalW, finalH);
      const tl2 = topLeft(this.container);
      yogaLayout(allChildren, tl2.x, tl2.y, finalW, finalH, cd, sizing, objects);
    }
    syncCoords(this.container, allChildren);
    this._lastDraggedYogaPos = { left: this.child.left, top: this.child.top };
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }
    if (finalW !== currentW || finalH !== currentH) {
      relayoutAncestors(this.container, this.canvas.getObjects());
    }
  }
  /** Snapshot all children positions using animator targets when available. */
  captureChildPositions(allChildren) {
    const map = /* @__PURE__ */ new Map();
    for (const { obj } of allChildren) {
      const target = this._animator.getTarget(obj);
      if (target) {
        map.set(obj, target);
      } else if (obj === this.child && this._lastDraggedYogaPos) {
        map.set(obj, this._lastDraggedYogaPos);
      } else {
        map.set(obj, { left: obj.left, top: obj.top });
      }
    }
    return map;
  }
};

// src/layout/stack/sessions/containerize.ts
var ContainerizeSession = class _ContainerizeSession {
  /**
   * `reattach` : l'enfant est déjà dedans et on l'y déplace — rien à créer ; l'annulation
   * le sort du container au lieu de tout remettre comme avant.
   */
  constructor(canvas, container, child, anchorCursor, isReattach = false) {
    this.canvas = canvas;
    this.container = container;
    this.child = child;
    this.anchorCursor = anchorCursor;
    this.isReattach = isReattach;
    /** Le décalage imposé à l'enfant pour qu'il entre dans les marges (pas de reattach). */
    this.clampDx = 0;
    this.clampDy = 0;
    this.before = { container: takePlacement(container), child: takePlacement(child) };
    if (isReattach) return;
    normalizeShapeOrigin(container);
    applyInitialLayout(container, child);
    const clamped = clampTopLeft(child, container, MIN_PAD);
    const preTL = topLeft(child);
    this.clampDx = clamped.x - preTL.x;
    this.clampDy = clamped.y - preTL.y;
    canvas.adjustGrabOffset(this.clampDx, this.clampDy);
    if (this.clampDx !== 0 || this.clampDy !== 0) {
      child.set({ left: child.left + this.clampDx, top: child.top + this.clampDy });
      child.setCoords();
    }
    wrapContainerAroundChild(child, container);
    if (isContainerObject(child)) layoutSubtree(child, canvas.getObjects());
  }
  /** @deprecated Use `new ContainerizeSession(…, true)` or createDropSession. */
  static reattach(canvas, container, child, cursor) {
    return new _ContainerizeSession(canvas, container, child, cursor, true);
  }
  /** During drag: keep the child in the margins, fit the container, check for exit. */
  handleMoving(cursor) {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }
    const clamped = clampTopLeft(this.child, this.container, MIN_PAD);
    const currentTL = topLeft(this.child);
    const dx = clamped.x - currentTL.x;
    const dy = clamped.y - currentTL.y;
    if (dx !== 0 || dy !== 0) {
      this.child.set({ left: this.child.left + dx, top: this.child.top + dy });
      this.child.setCoords();
    }
    wrapContainerAroundChild(this.child, this.container);
    if (isContainerObject(this.child)) layoutSubtree(this.child, this.canvas.getObjects());
    relayoutAncestors(this.container, this.canvas.getObjects());
    return "anchored";
  }
  /**
   * Finalize the attach. Text edits relayout through the LayoutManager's
   * canvas-wide `text:changed` listener — nothing to clean up here.
   */
  commit() {
    const tTL = topLeft(this.child);
    this.child.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    this.child.setCoords();
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }
  /** Undo: a reattached child leaves; a new one goes back where it was, so does the container. */
  rollback() {
    if (this.isReattach) {
      detachChild(this.child);
      restorePlacement(this.container, this.before.container, { size: true, layout: true });
      this.child.setCoords();
      this.canvas.renderAll();
      return;
    }
    restorePlacement(this.container, this.before.container, { size: true, position: true, style: true, layout: true });
    restorePlacement(this.child, this.before.child, { size: true, position: true, style: true, layout: true });
    if (isTextObject(this.child)) asLayoutText(this.child).layoutWith(null);
    this.canvas.adjustGrabOffset(-this.clampDx, -this.clampDy);
    this.canvas.renderAll();
  }
  shouldExit(cursor) {
    if (!pointInObject(cursor, this.container, EXIT_MARGIN)) return true;
    return hasExceededOffset(cursor, this.anchorCursor, this.clampDx, this.clampDy, EXIT_MARGIN);
  }
};
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
  const shapeLayout = layoutOf(shape) ?? {};
  shape.set("layout", {
    ...shapeLayout,
    sizing: shapeLayout.sizing ?? { x: "hug", y: "hug", minSize: { w: shapeW, h: shapeH } },
    // Un bloc déjà activé (makeContainer) garde ses réglages ; la marge vient du dépôt
    container: { ...shapeLayout.container, padding: { top: padY, right: padX, bottom: padY, left: padX } }
  });
  const childLayout = layoutOf(child) ?? {};
  child.set("layout", { ...childLayout, child: { parentId: containerId } });
}
function wrapContainerAroundChild(child, container) {
  const childLayout = layoutOf(child);
  const containerLayout = layoutOf(container);
  if (!childLayout?.child || !containerLayout?.container) return;
  const { w: childW, h: childH } = scaledSize(child);
  const sTL = topLeft(container);
  const tTL = topLeft(child);
  const padLeft = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padTop = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));
  updateContainer(container, { padding: { top: padTop, right: padLeft, bottom: padTop, left: padLeft } });
  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;
  const requiredW = padLeft + childW + padLeft;
  const requiredH = padTop + childH + padTop;
  const { w, h } = scaledSize(container);
  setShapeSize(
    container,
    sizing.x === "fixed" ? w : Math.max(requiredW, minW),
    sizing.y === "fixed" ? h : Math.max(requiredH, minH)
  );
  container.setCoords();
}

// src/layout/stack/sessions/drop.ts
function createDropSession(canvas, container, child, cursor, { reattach = false } = {}) {
  const siblings = childrenOf(canvas.getObjects(), container).filter((c) => c.obj !== child);
  return siblings.length > 0 ? new InsertChildSession(canvas, container, child, cursor, reattach) : new ContainerizeSession(canvas, container, child, cursor, reattach);
}

// src/DragToLayout.ts
var HOVER_DELAY_MS = 700;
var ANCHOR_DELAY_MS = 500;
var DragToLayout = class {
  constructor(canvas, guides, callbacks) {
    this.canvas = canvas;
    this.guides = guides;
    this.callbacks = callbacks;
    this.dtl = { phase: "idle", cooldownUntil: 0 };
  }
  /** A session is live: the dragged object is in a container. */
  get isAnchored() {
    return this.dtl.phase === "anchored";
  }
  /** Nothing is being dropped (no timer, no session). */
  get isIdle() {
    return this.dtl.phase === "idle";
  }
  /** A drop is armed: anchored, or its hint is showing. */
  get isArmed() {
    return this.dtl.phase === "anchored" || this.dtl.phase === "pending";
  }
  /** The object a live session is placing (the dragged one). */
  get sessionChild() {
    return this.dtl.phase === "anchored" ? this.dtl.session.child : null;
  }
  /** A pointer step of a native drag. */
  move(obj, cursor) {
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
  /** A child dragged inside its entered container: it is moved in it, live. */
  startReattach(container, child, cursor) {
    const session = createDropSession(this.canvas, container, child, cursor, { reattach: true });
    this.showSessionGuides(session);
    this.canvas.renderAll();
    this.dtl = { phase: "anchored", session, cooldownUntil: 0, source: child, root: null };
  }
  /**
   * The drag ended (object:modified): a live session commits; a showing hint whose
   * target is under the pointer commits at once; anything else is dropped.
   */
  release(obj, cursor) {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return;
    }
    if (this.dtl.phase === "pending" && pointInObject(cursor, this.dtl.target)) {
      clearTimeout(this.dtl.timer);
      this.dtl = { ...this.dtl, source: obj, cursor };
      this.guides.clear();
      this.promoteToAnchored();
      this.doCommit();
      return;
    }
    this.reset();
  }
  /**
   * Advance the machine for an externally-dragged object (toolbox), each dragover
   * frame, cursor in scene coordinates. The source follows the cursor; it does NOT
   * need to be on the canvas yet — it is added when the session anchors.
   */
  tick(source, cursor) {
    source.setPositionByOrigin(new Point7(cursor.x, cursor.y), "center", "center");
    source.setCoords();
    this.move(source, cursor);
    if (this.canvas.getObjects().includes(source)) this.canvas.requestRenderAll();
  }
  /** On drop: commits a live session (true), or just cleans up (false). */
  commit() {
    if (this.dtl.phase === "anchored") {
      this.doCommit();
      return true;
    }
    this.reset();
    return false;
  }
  /** On dragleave / cancel: rolls a live session back, clears timers otherwise. */
  rollback() {
    if (this.dtl.phase === "anchored") this.dtl.session.rollback();
    this.reset();
  }
  /** Back to idle (guides and timers cleared), with an optional cooldown. */
  reset(cooldownUntil = 0) {
    this.resetToIdle(cooldownUntil);
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
    const layout = layoutOf(container);
    if (!layout?.container) return null;
    const children = childrenOf(this.canvas.getObjects(), container);
    for (const { obj } of children) {
      if (obj === exclude) continue;
      if (!isDropTarget(obj)) continue;
      if (pointInObject(cursor, obj)) return obj;
    }
    return null;
  }
  /** The container `obj` is a child of. */
  findParentContainer(obj) {
    return parentContainerOf(obj, this.canvas.getObjects());
  }
  /** Transition to ANCHORED: create a session on the target and go live. */
  anchorOn(target, child, cursor, root = null) {
    const objects = this.canvas.getObjects();
    if (!objects.includes(child)) {
      this.canvas.add(child);
    }
    const stack = this.canvas.getObjects();
    const containerIdx = stack.indexOf(target);
    const childIdx = stack.indexOf(child);
    if (containerIdx >= 0 && childIdx >= 0 && childIdx < containerIdx) {
      placeBlockAbove(stack, child, target).forEach((obj, index) => this.canvas.moveObjectTo(obj, index));
    }
    const session = createDropSession(this.canvas, target, child, cursor);
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
  // ── State machine: COMMIT ─────────────────────────────────────────
  doCommit() {
    if (this.dtl.phase !== "anchored") return;
    const { session } = this.dtl;
    this.guides.clear();
    session.commit();
    this.callbacks().onLayoutChanged?.();
    this.callbacks().onLayoutCreated?.();
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
      const allChildren = childrenOf(this.canvas.getObjects(), session.container);
      const childObjs = allChildren.map((c) => c.obj);
      const layout = layoutOf(session.container);
      const direction = directionOf(layout?.container);
      this.guides.showInsertGuides(session.container, childObjs, direction);
    } else {
      this.guides.showLayoutGuides(session.container, session.child);
    }
  }
  // ── Shape hit-testing ─────────────────────────────────────────────
  findShapeUnderPoint(point, exclude) {
    const objects = this.canvas.getObjects().slice().reverse();
    const entered = this.callbacks().getEnteredContainerId?.();
    for (const obj of objects) {
      if (obj === exclude) continue;
      if (!isDropTarget(obj)) continue;
      const layout = layoutOf(obj);
      if (layout?.child) {
        if (!entered || layout.child.parentId !== entered) continue;
      }
      if (pointInObject(point, obj)) return obj;
    }
    return null;
  }
};
function isDropTarget(obj) {
  return rulesOf(obj).hosts && isStackContainer(obj);
}

// src/layout/stack/min-size.ts
function minContentSize(children, cd, objects) {
  const pad = paddingOf(cd);
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
  if (isTextObject(obj)) return { w: asLayoutText(obj).minContentWidth(), h: 0 };
  const size = scaledSize(obj);
  if (isFreeContainer(obj)) return size;
  const layout = layoutOf(obj);
  if (!layout?.container) return size;
  const children = flowChildrenOf(objects, obj);
  if (children.length === 0) return size;
  const sizing = sizingOf(obj);
  const min = minContentSize(children, layout.container, objects);
  return {
    w: sizing.x === "hug" ? Math.max(min.w, sizing.minSize?.w ?? 0) : size.w,
    h: sizing.y === "hug" ? Math.max(min.h, sizing.minSize?.h ?? 0) : size.h
  };
}

// src/layout/stack/room.ts
var UNBOUNDED = { w: Infinity, h: Infinity };
function availableRoom(obj, objects) {
  const parent = parentContainerOf(obj, objects);
  if (!parent || isFreeContainer(parent)) return UNBOUNDED;
  const cd = layoutOf(parent).container;
  const sizing = sizingOf(parent);
  const own = scaledSize(parent);
  const above = availableRoom(parent, objects);
  const pad = paddingOf(cd);
  let w = (sizing.x === "fixed" ? own.w : above.w) - pad.left - pad.right;
  let h = (sizing.y === "fixed" ? own.h : above.h) - pad.top - pad.bottom;
  const siblings = childrenOf(objects, parent).filter((c) => c.obj !== obj);
  const gaps = (cd.gap ?? 0) * siblings.length;
  const taken = siblings.map(({ obj: s }) => minSizeOf(s, objects));
  if (cd.flexDirection === "row") w -= taken.reduce((sum, s) => sum + s.w, 0) + gaps;
  else h -= taken.reduce((sum, s) => sum + s.h, 0) + gaps;
  return { w: Math.max(0, w), h: Math.max(0, h) };
}
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

// src/layout/stack/resize-session.ts
var StackResizeSession = class {
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
    const layout = layoutOf(container);
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
   * A rotated container (or one inside a rotated ancestor) is handled straight, in its
   * root's frame — the room, the anchors and the Yoga pass all read axis-aligned boxes.
   */
  handleResizing(objects) {
    inRootFrame(this.container, objects, () => this.handleResizingLocal(objects));
  }
  handleResizingLocal(objects) {
    const { container, containerData: cd, sizing, axes } = this;
    this.room ?? (this.room = availableRoom(container, objects));
    const { w: currentW, h: currentH } = scaledSize(container);
    if (axes.x) this.userW = Math.min(currentW, this.room.w);
    if (axes.y) this.userH = Math.min(currentH, this.room.h);
    const children = flowChildrenOf(objects, container);
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
    const layout = layoutOf(container);
    container.set("layout", { ...layout, sizing: this.sizing });
  }
  /** A child container: its ancestors take its new size in, and it sits in its slot. */
  settle(objects) {
    this.persistFloor();
    const parent = parentContainerOf(this.container, objects);
    if (!parent) return;
    layoutSubtree(parent, objects);
    relayoutAncestors(parent, objects);
  }
};
var ResizeSession = StackResizeSession;

// src/layout/arrangement.ts
var spread = (values) => Math.max(...values) - Math.min(...values);
function arrangeAsStack(container, objects) {
  const layout = layoutOf(container);
  const children = childrenOf(objects, container).map((c) => ({ obj: c.obj, box: boxOf(c.obj) }));
  if (children.length === 0) return;
  const row = spread(children.map((c) => c.box.left + c.box.width / 2)) > spread(children.map((c) => c.box.top + c.box.height / 2));
  const [start, size, crossStart, crossSize] = row ? ["left", "width", "top", "height"] : ["top", "height", "left", "width"];
  children.sort((a, b) => a.box[start] - b.box[start]);
  const gaps = children.slice(1).map((c, i) => c.box[start] - (children[i].box[start] + children[i].box[size]));
  const gap = gaps.length ? Math.round(Math.min(160, Math.max(0, gaps.reduce((a, b) => a + b, 0) / gaps.length))) : 0;
  const crossSpreads = {
    "flex-start": spread(children.map((c) => c.box[crossStart])),
    center: spread(children.map((c) => c.box[crossStart] + c.box[crossSize] / 2)),
    "flex-end": spread(children.map((c) => c.box[crossStart] + c.box[crossSize]))
  };
  const alignItems = Object.keys(crossSpreads).reduce((best, key) => crossSpreads[key] < crossSpreads[best] - 0.5 ? key : best, "flex-start");
  const { justifyContent: _justify, ...cd } = layout.container;
  container.set("layout", {
    ...layout,
    sizing: { x: "hug", y: "hug" },
    container: { ...cd, arrangement: "stack", flexDirection: row ? "row" : "column", gap, alignItems }
  });
  children.forEach(({ obj }, order) => {
    obj.set("layout", { ...layoutOf(obj), child: { parentId: idOf(container), order } });
  });
}
function arrangeFree(container, objects) {
  const layout = layoutOf(container);
  const children = childrenOf(objects, container).map((c) => c.obj);
  const widths = new Map(children.map((c) => [c, c.width]));
  const { flexDirection: _d, gap: _g, alignItems: _a, justifyContent: _j, ...cd } = layout.container;
  container.set("layout", { ...layout, container: { ...cd, arrangement: "free" } });
  for (const child of children) {
    child.set("layout", { ...layoutOf(child), child: { parentId: idOf(container) } });
    if (!isTextObject(child)) continue;
    const text = child;
    text.initDimensions();
    const before = widths.get(child);
    if (Math.abs(text.width - before) > 0.5) {
      text.setSizing({ ...text.sizing, x: "fixed" });
      text.width = before;
      text.initDimensions();
    }
  }
}

// src/ui/controls.ts
import { FabricObject as FabricObject6, Control as Control2, controlsUtils as controlsUtils6 } from "#fabric";
function applyControlStyle(canvas, guideColor, resolveTarget, userSlotLabel) {
  const gc = guideColor;
  FabricObject6.ownDefaults.borderColor = gc;
  FabricObject6.ownDefaults.borderScaleFactor = 2;
  FabricObject6.ownDefaults.borderOpacityWhenMoving = 1;
  FabricObject6.ownDefaults.cornerColor = "#ffffff";
  FabricObject6.ownDefaults.cornerStrokeColor = "#000000";
  FabricObject6.ownDefaults.transparentCorners = false;
  FabricObject6.ownDefaults.cornerSize = 16;
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
function syncGroupControls(obj) {
  const group = isFreeContainer(obj);
  obj.setControlsVisibility({ ml: !group, mr: !group, mt: !group, mb: !group });
  if (getLockMode(obj) === "free") obj.lockRotation = false;
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
    actionHandler: controlsUtils6.rotationWithSnapping,
    cursorStyleHandler: controlsUtils6.rotationStyleHandler,
    withConnection: true,
    actionName: "rotate"
  });
  canvas.on("object:added", (e) => {
    const obj = e.target;
    if (!obj?.controls) return;
    if (isFreeContainer(obj)) syncGroupControls(obj);
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
    if (!ctx) return;
    ctx.clearRect(0, 0, fc.width, fc.height);
    if (fc._groupSelector) fc.renderTopLayer(ctx);
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
    active?.renderCursorOrSelection?.();
    drawActiveTokenPills(ctx, active);
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

// src/layout/subtree-drag.ts
var SubtreeDrag = class _SubtreeDrag {
  constructor(transform, start, followers) {
    this.transform = transform;
    this.start = start;
    this.followers = followers;
  }
  /** Au premier pas du geste : la position de départ de `target` et de la descendance. */
  static begin(target, moved, transform, objects) {
    return new _SubtreeDrag(
      transform,
      { left: transform?.original?.left ?? target.left, top: transform?.original?.top ?? target.top },
      descendantsOf(objects, moved).map((o) => ({ obj: o, left: o.left, top: o.top }))
    );
  }
  /** La descendance suit la translation de `target` depuis le début. */
  follow(target) {
    const dx = target.left - this.start.left;
    const dy = target.top - this.start.top;
    for (const f of this.followers) {
      f.obj.set({ left: f.left + dx, top: f.top + dy });
      f.obj.setCoords();
    }
  }
};

// src/layout/scale-session.ts
import { Point as Point8, util as util4 } from "#fabric";
var scaleMin = (minSize, k) => minSize && { w: minSize.w * k, h: minSize.h * k };
var ScaleSession = class _ScaleSession {
  constructor(container, objects, start) {
    this.container = container;
    this.objects = objects;
    this.start = start;
    this.free = isFreeContainer(container);
    const scaled = this.free ? descendantsOf(objects, [container]) : [container, ...descendantsOf(objects, [container])];
    this.states = scaled.map((obj) => this.snapshot(obj));
    this.angle = container.angle || 0;
    const room = availableRoom(container, objects);
    this.maxK = Math.min(room.w / start.width, room.h / start.height);
  }
  /** Au début du geste : le container tel qu'il est. */
  static begin(container, objects) {
    const tl = container.getPositionByOrigin("left", "top");
    const { w, h } = scaledSize(container);
    return new _ScaleSession(container, objects, { left: tl.x, top: tl.y, width: w, height: h });
  }
  /**
   * Un pas du geste : la poignée a posé la boîte du porteur ; le facteur est la moyenne des
   * deux axes (uniforme — une poignée de coin l'est déjà), borné par la place laissée par
   * les ancêtres ; le coin opposé à la poignée (l'origine du transform) reste en place.
   */
  step(transform) {
    const { start, container } = this;
    const { w, h } = scaledSize(container);
    const k = Math.min(this.maxK, Math.max(0.05, (w / start.width + h / start.height) / 2));
    const fx = transform.originX === "left" ? 0 : transform.originX === "right" ? 1 : 0.5;
    const fy = transform.originY === "top" ? 0 : transform.originY === "bottom" ? 1 : 0.5;
    const corner = new Point8(start.width * fx, start.height * fy).rotate(util4.degreesToRadians(this.angle)).add(new Point8(start.left, start.top));
    this.apply(k, corner);
  }
  /**
   * Le container à l'échelle `k` de son état de départ, `anchor` (scène) immobile — puis
   * tout se range : les piles dedans dans leurs nouvelles dimensions (une homothétie les
   * laisse où elles sont, à l'arrondi près), un groupe sur ses enfants, et les ancêtres
   * prennent la nouvelle taille en compte (le container reste dans son emplacement).
   */
  apply(k, anchor) {
    const { container, objects } = this;
    for (const state of this.states) this.scale(state, k, anchor);
    if (this.free) {
      for (const obj of descendantsOf(objects, [container])) {
        if (isStackContainer(obj)) layoutSubtree(obj, objects);
      }
      fitFreeContainer(container, objects);
    } else {
      layoutSubtree(container, objects);
    }
    const parent = parentContainerOf(container, objects);
    if (!parent) return;
    layoutSubtree(parent, objects);
    relayoutAncestors(parent, objects);
  }
  snapshot(obj) {
    const { w, h } = scaledSize(obj);
    const tl = obj.getPositionByOrigin("left", "top");
    const state = { obj, box: { left: tl.x, top: tl.y, width: w, height: h } };
    const layout = layoutOf(obj);
    if (isTextObject(obj)) {
      state.text = textScaleState(obj);
    } else if (layout?.container) {
      state.container = {
        padding: layout.container.padding,
        gap: layout.container.gap,
        minSize: layout.sizing?.minSize
      };
    }
    return state;
  }
  scale(state, k, anchor) {
    const { obj, box } = state;
    const layout = layoutOf(obj);
    if (state.text) {
      scaleText(obj, state.text, k);
    } else if (state.container && layout?.container) {
      const p = state.container.padding;
      obj.set("layout", {
        ...layout,
        container: {
          ...layout.container,
          padding: p && { top: p.top * k, right: p.right * k, bottom: p.bottom * k, left: p.left * k },
          gap: state.container.gap === void 0 ? void 0 : state.container.gap * k
        },
        sizing: layout.sizing && { ...layout.sizing, minSize: scaleMin(state.container.minSize, k) }
      });
      setShapeSize(obj, box.width * k, box.height * k);
    } else {
      setShapeSize(obj, box.width * k, box.height * k);
    }
    placeTopLeft(obj, anchor.x + (box.left - anchor.x) * k, anchor.y + (box.top - anchor.y) * k);
  }
};
var FreeResizeSession = ScaleSession;

// src/LayoutManager.ts
var SIZE_PRESETS = {
  "hug": { x: "hug", y: "hug" },
  "hug-y": { x: "fixed", y: "hug" },
  "fixed": { x: "fixed", y: "fixed" }
};
var isCornerHandle = (corner) => typeof corner === "string" && corner.length === 2 && corner[0] !== "m";
var LayoutManager2 = class {
  constructor(canvas, callbacks = {}, guideColor) {
    this.resizeSession = null;
    /** La mise à l'échelle d'un container par un coin, en cours (ouverte à before:transform). */
    this.scaling = null;
    /** Les descendants qui suivent les objets déplacés (un groupe, une sélection multiple). */
    this.followers = null;
    /** Les descendants qui suivent les objets tournés (un container, une sélection multiple). */
    this.rotation = null;
    // ── Event wiring ──────────────────────────────────────────────────
    this.onMovingBound = (e) => this.onMoving(e);
    this.onRotatingBound = (e) => this.onRotating(e);
    this.onModifiedBound = (e) => this.onModified(e);
    this.onResizingBound = (e) => this.onResizing(e);
    this.onTextChangedBound = (e) => this.onTextChanged(e);
    this.onBeforeTransformBound = (e) => this.onBeforeTransform(e);
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.guides = new CanvasGuides(canvas, guideColor);
    this.drag = new DragToLayout(canvas, this.guides, () => this.callbacks);
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
  /** A layout change: everything settles, then the host hears about it. */
  changed() {
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }
  /** A panel edit on a container's own block (ignored on anything else). */
  editContainer(obj, patch) {
    if (!isContainerObject(obj)) return;
    updateContainer(obj, patch);
    this.changed();
  }
  /** A panel edit on a child's block (ignored outside a container). */
  editChild(obj, patch) {
    if (!childDataOf(obj)) return;
    updateChild(obj, patch);
    this.changed();
  }
  /**
   * Set the size mode of a container or a text:
   * - "hug": width and height follow the content
   * - "hug-y": fixed width (texts wrap), height follows the content
   * - "fixed": fixed width and height (texts apply their overflow)
   * Choosing a mode drops the floor set by the handles (`minSize`): the box fits its
   * content again, as the mode says.
   */
  setMode(obj, mode) {
    const isText = isTextObject(obj);
    if (!isContainerObject(obj) && !isText) return;
    const { minSize: _floor, ...current } = sizingOf(obj);
    const sizing = { ...current, ...SIZE_PRESETS[mode] };
    if (isText) obj.setSizing(sizing);
    else updateLayout(obj, { sizing });
    this.changed();
  }
  /** What a text does when its box is smaller than its content. */
  setOverflow(obj, overflow) {
    if (!isTextObject(obj)) return;
    obj.setTextOverflow(overflow);
    this.changed();
  }
  /** Padding of a container — one side, or "all" four. */
  setPadding(obj, side, value) {
    const sides = side === "all" ? ["top", "right", "bottom", "left"] : [side];
    const padding = { ...paddingOf(containerDataOf(obj)) };
    for (const s of sides) padding[s] = value;
    this.editContainer(obj, { padding });
  }
  /** Un groupe libre ou rangé (une pile) — la bascule ne fait rien sauter (cf. arrangement). */
  setArrangement(obj, arrangement) {
    const cd = containerDataOf(obj);
    if (!cd || (cd.arrangement ?? "stack") === arrangement) return;
    const objects = this.canvas.getObjects();
    if (arrangement === "stack") arrangeAsStack(obj, objects);
    else arrangeFree(obj, objects);
    syncGroupControls(obj);
    this.changed();
  }
  /**
   * Une forme devient un bloc : un container, même vide, en colonne — les objets qu'on y
   * glisse s'y rangent. Il épouse son contenu sans jamais descendre sous sa taille actuelle
   * (hug, plancher minSize). Glisser un objet sur une forme simple ne la change plus en
   * container : c'est ce geste-ci, ou grouper puis ranger. Dégrouper la rend simple.
   */
  makeContainer(obj) {
    if (isContainerObject(obj) || !rulesOf(obj).hosts) return;
    const tl = topLeft(obj);
    const { w, h } = scaledSize(obj);
    obj.set({ originX: "left", originY: "top" });
    placeTopLeft(obj, tl.x, tl.y);
    updateLayout(obj, {
      sizing: { x: "hug", y: "hug", minSize: { w, h } },
      container: { padding: uniformPadding(MIN_PAD) }
    });
    this.changed();
  }
  /** Cross-axis alignment of one child in its stack. */
  setAlignSelf(obj, value) {
    this.editChild(obj, { alignSelf: value });
  }
  /** Space between the children of a stack. */
  setGap(obj, value) {
    this.editContainer(obj, { gap: Math.max(0, value) });
  }
  /** Direction of a stack. */
  setFlexDirection(obj, direction) {
    this.editContainer(obj, { flexDirection: direction });
  }
  /** Cross-axis alignment of a stack's children. */
  setAlignItems(obj, value) {
    this.editContainer(obj, { alignItems: value });
  }
  /** Main-axis distribution of a stack's children. */
  setJustifyContent(obj, value) {
    this.editContainer(obj, { justifyContent: value });
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
    this.drag.tick(source, cursor);
  }
  /**
   * Commit the current DTL session from an external drag.
   * Call this on drop. No-op if no session is active (the caller should
   * handle the "simple add" case itself).
   *
   * Returns true if a session was committed, false otherwise.
   */
  commitExternalDrag() {
    return this.drag.commit();
  }
  /**
   * Rollback any in-progress DTL state from an external drag.
   * Call this on dragleave / cancel. Rolls back the session if anchored,
   * clears timers otherwise. The caller owns the source object and is
   * responsible for removing it from the canvas.
   */
  rollbackExternalDrag() {
    this.drag.rollback();
  }
  /** Whether the DTL state machine is currently in ANCHORED phase. */
  get isAnchored() {
    return this.drag.isAnchored;
  }
  /** Nothing is being dropped into a container (no timer, no session). */
  get isIdle() {
    return this.drag.isIdle;
  }
  /** Clean up event listeners. */
  dispose() {
    this.drag.reset();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:rotating", this.onRotatingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:resizing", this.onResizingBound);
    this.canvas.off("text:changed", this.onTextChangedBound);
    this.canvas.off("before:transform", this.onBeforeTransformBound);
  }
  setupEventListeners() {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:rotating", this.onRotatingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:resizing", this.onResizingBound);
    this.canvas.on("text:changed", this.onTextChangedBound);
    this.canvas.on("before:transform", this.onBeforeTransformBound);
  }
  // ── Canvas event handlers ─────────────────────────────────────────
  onMoving(e) {
    const obj = e.target;
    if (obj instanceof ActiveSelection3) {
      this.moveFollowers(obj, obj.getObjects(), e.transform);
      return;
    }
    const layout = layoutOf(obj);
    if (layout?.container) {
      const isSessionChild = this.drag.sessionChild === obj;
      if (isFreeContainer(obj)) {
        this.moveFollowers(obj, [obj], e.transform);
      } else if (!isSessionChild) {
        layoutSubtree(obj, this.canvas.getObjects());
        this.canvas.renderAll();
      }
    }
    if (layout?.child && !this.drag.isAnchored) {
      const parent = parentContainerOf(obj, this.canvas.getObjects());
      if (parent && isFreeContainer(parent)) {
        fitFreeAncestors(parent, this.canvas.getObjects());
        this.canvas.renderAll();
        return;
      }
    }
    if (layout?.child && !this.drag.isAnchored) {
      const entered = this.callbacks.getEnteredContainerId?.();
      if (entered === layout.child.parentId) {
        const container = findById(this.canvas.getObjects(), entered);
        if (container) {
          const cursor = this.canvas.getScenePoint(e.e);
          this.drag.startReattach(container, obj, cursor);
        }
        return;
      }
    }
    if (layout?.child && !this.drag.isAnchored) return;
    this.drag.move(obj, this.canvas.getScenePoint(e.e));
  }
  /**
   * Les descendants des objets déplacés (un groupe, ou les objets d'une sélection multiple
   * — jamais dans la sélection, cf. SelectionManager) suivent la translation de `target`
   * depuis le début du geste. Sans relayout : dans une sélection, les positions des
   * containers sont relatives à elle.
   */
  moveFollowers(target, moved, transform) {
    if (!this.followers || this.followers.transform !== transform) {
      this.followers = SubtreeDrag.begin(target, moved, transform, this.canvas.getObjects());
    }
    this.followers.follow(target);
  }
  /** Un container (bloc, groupe) ou une sélection qu'on tourne : la descendance tourne avec,
   *  comme un bloc — autour du centre de départ, depuis le début du geste. */
  onRotating(e) {
    const obj = e.target;
    const moved = obj instanceof ActiveSelection3 ? obj.getObjects() : [obj];
    this.rotateFollowers(obj, moved, e.transform);
  }
  rotateFollowers(target, moved, transform) {
    if (!this.rotation || this.rotation.transform !== transform) {
      this.rotation = SubtreeRotate.begin(target, moved, transform, this.canvas.getObjects());
    }
    this.rotation.follow(target);
  }
  /**
   * Le début d'une transformation : un container pris par un coin garde son état de départ,
   * il va être mis à l'échelle avec son contenu (un bord règle sa boîte : StackResizeSession).
   */
  onBeforeTransform(e) {
    const target = e.transform?.target;
    this.scaling = null;
    if (!target || !isContainerObject(target) || e.transform.action !== "resizing") return;
    if (!isCornerHandle(e.transform.corner)) return;
    this.scaling = ScaleSession.begin(target, this.canvas.getObjects());
  }
  /** A text inside a container was edited → its ancestors adapt. */
  onTextChanged(e) {
    const layout = layoutOf(e.target);
    if (!layout?.child) return;
    this.changed();
  }
  onModified(e) {
    const obj = e.target;
    if (this.followers) {
      const moved = obj instanceof ActiveSelection3 ? obj.getObjects() : [obj];
      this.moveFollowers(obj, moved, this.followers.transform);
    }
    this.followers = null;
    if (this.rotation) {
      const moved = obj instanceof ActiveSelection3 ? obj.getObjects() : [obj];
      this.rotateFollowers(obj, moved, this.rotation.transform);
    }
    this.rotation = null;
    if (obj instanceof ActiveSelection3) {
      this.drag.reset();
      return;
    }
    const parent = parentContainerOf(obj, this.canvas.getObjects());
    const scaled = this.scaling;
    this.scaling = null;
    if (this.drag.isIdle && (scaled || parent && isFreeContainer(parent))) {
      this.changed();
      return;
    }
    const childLayout = layoutOf(obj);
    if (childLayout?.child && isTextObject(obj) && this.drag.isIdle && e.transform?.action === "resizing") {
      this.changed();
      return;
    }
    const layout = layoutOf(obj);
    if (layout?.container) {
      this.resizeSession = null;
      this.changed();
      if (!this.drag.isArmed) return;
    }
    this.drag.release(obj, this.canvas.getScenePoint(e.e));
  }
  onResizing(e) {
    const target = e.target;
    const layout = layoutOf(target);
    if (layout?.child && !layout.container) {
      const objects = this.canvas.getObjects();
      inRootFrame(target, objects, () => {
        const parent = parentContainerOf(target, objects);
        if (parent && isFreeContainer(parent)) {
          fitFreeAncestors(parent, objects);
          return;
        }
        if (!isTextObject(target)) clampToRoom(target, e.transform, objects);
        const pLayout = layoutOf(parent);
        if (parent && pLayout?.container) {
          layoutSubtree(parent, objects);
          relayoutAncestors(parent, objects);
        }
      });
      this.canvas.renderAll();
      return;
    }
    if (!layout?.container) return;
    const scaling = this.scaling;
    if (scaling && scaling.container === target) {
      scaling.step(e.transform);
      this.canvas.renderAll();
      return;
    }
    if (!this.resizeSession) {
      this.resizeSession = new StackResizeSession(target, e.transform?.corner);
    }
    this.resizeSession.handleResizing(this.canvas.getObjects());
    this.canvas.renderAll();
  }
};

// src/fonts.ts
import { cache } from "#fabric";
function forgetFontMeasures(family) {
  cache.clearFontCache(family);
}

// src/types.ts
var DRAG_PREVIEW_KEY = "dragPreview";

// src/editor/style-commands.ts
import { FabricImage as FabricImage7, Gradient, Shadow } from "#fabric";

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

// src/layout/grouping.ts
function groupMembers(objects, selected) {
  const parentIds = new Set(selected.map(parentIdOf));
  if (parentIds.size <= 1) return objects.filter((o) => selected.includes(o));
  const parents = layoutParents(objects);
  const rootIds = new Set(selected.map((o) => layoutRoot(parents, idOf(o))));
  return objects.filter((o) => rootIds.has(idOf(o)));
}
function groupObjects(canvas, selected, layerId) {
  const objects = canvas.getObjects();
  const members = groupMembers(objects, selected);
  if (members.length < 2) return null;
  const parentId = parentIdOf(members[0]);
  const orders = members.map((m) => childDataOf(m)?.order).filter((o) => o != null);
  const carrier = new FabRect({
    layerId,
    layerType: "shape",
    originX: "left",
    originY: "top",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    fill: "transparent",
    strokeWidth: 0,
    layout: {
      container: { arrangement: "free", origin: "group", padding: { ...ZERO_PADDING } },
      ...parentId ? { child: { parentId, ...orders.length ? { order: Math.min(...orders) } : {} } } : {}
    }
  });
  for (const member of members) {
    const layout = layoutOf(member);
    member.set("layout", { ...layout, child: { parentId: layerId } });
    if (layout?.child && isTextObject(member)) member.layoutWith(null);
  }
  const blocks = members.flatMap((m) => stackBlock(objects, m));
  const rest = objects.filter((o) => !blocks.includes(o));
  const topBlock = stackBlock(objects, members[members.length - 1]);
  const below = rest.filter((o) => objects.indexOf(o) < objects.indexOf(topBlock[0])).length;
  const order = [...rest.slice(0, below), carrier, ...blocks, ...rest.slice(below)];
  canvas.add(carrier);
  order.forEach((obj, index) => canvas.moveObjectTo(obj, index));
  fitFreeContainer(carrier, canvas.getObjects());
  return carrier;
}
function ungroupObject(canvas, container) {
  const layout = layoutOf(container);
  if (!layout?.container) return [];
  const objects = canvas.getObjects();
  const children = flowChildrenOf(objects, container).map((c) => c.obj);
  const parentChild = layout.child;
  children.forEach((child, i) => {
    if (parentChild) {
      const childLayout = layoutOf(child);
      const order = parentChild.order != null ? parentChild.order + i / children.length : void 0;
      child.set("layout", { ...childLayout, child: { parentId: parentChild.parentId, ...order != null ? { order } : {} } });
    } else {
      detachChild(child);
    }
  });
  if (layout.container.origin === "group") {
    canvas.remove(container);
  } else {
    const { container: _container, ...rest } = layout;
    container.set("layout", Object.keys(rest).length ? rest : void 0);
  }
  return children;
}
var GROUP_FILL_PADDING = 24;
function padGroupOnFirstFill(container, previousFill) {
  const cd = containerDataOf(container);
  if (cd?.origin !== "group") return false;
  const wasBare = !previousFill || previousFill === "transparent";
  const fill = container.fill;
  const isBare = !fill || fill === "transparent";
  const p = cd.padding;
  if (!wasBare || isBare || p && (p.top || p.right || p.bottom || p.left)) return false;
  const pad = GROUP_FILL_PADDING;
  container.set("layout", {
    ...layoutOf(container),
    container: { ...cd, padding: { top: pad, right: pad, bottom: pad, left: pad } }
  });
  return true;
}

// src/text-styles.ts
var TEXT_STYLE_KEYS = ["fontFamily", "fontWeight", "fontStyle", "underline", "fill"];
var MIXED = "mixed";
function isBold(weight) {
  return weight === "bold" || Number(weight) >= 600;
}
function summarizeStyles(declarations) {
  const state = {};
  for (const key of TEXT_STYLE_KEYS) {
    const values = new Set(declarations.map((d) => normalize(key, d[key])));
    state[key] = values.size > 1 ? MIXED : [...values][0];
  }
  return state;
}
function summarizeObject(object, styles) {
  const state = {};
  for (const key of TEXT_STYLE_KEYS) {
    const base = normalize(key, object[key]);
    const deviates = eachDeclaration(styles).some((d) => key in d && normalize(key, d[key]) !== base);
    state[key] = deviates ? MIXED : base;
  }
  return state;
}
function fontFamiliesOf(layers) {
  const families = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    const layer = node;
    if (typeof layer.fontFamily === "string") families.add(layer.fontFamily);
    for (const d of eachDeclaration(layer.styles)) {
      if (typeof d.fontFamily === "string") families.add(d.fontFamily);
    }
    if (Array.isArray(layer.objects)) layer.objects.forEach(visit);
  };
  layers.forEach(visit);
  return [...families];
}
function eachDeclaration(styles) {
  if (!styles || typeof styles !== "object") return [];
  if (Array.isArray(styles)) {
    return styles.map((range) => range.style).filter((s) => !!s && typeof s === "object");
  }
  return Object.values(styles).flatMap((line) => Object.values(line ?? {}));
}
function normalize(key, value) {
  if (key === "fontWeight") return value === void 0 ? "normal" : String(value);
  if (key === "fontStyle") return value ?? "normal";
  if (key === "underline") return value === true;
  return value;
}

// src/editor/style-commands.ts
var StyleCommands = class {
  constructor(editor) {
    this.editor = editor;
  }
  // ── Texte : la plage sélectionnée, ou le texte entier ──────────────
  /**
   * Le style du texte sélectionné, là où un réglage s'appliquerait : la plage sélectionnée
   * en édition ; au curseur, le caractère qui le précède (ce dont hérite la frappe) ; hors
   * édition, les propriétés du texte, "mixed" là où des caractères en dévient.
   */
  textStyle() {
    const target = this.textTarget();
    if (!target) return null;
    const { obj, range } = target;
    if (range) return summarizeStyles(obj.getSelectionStyles(range[0], range[1], true));
    if (obj.isEditing && obj.text.length > 0) {
      const at = Math.max(obj.selectionStart - 1, 0);
      return summarizeStyles(obj.getSelectionStyles(at, at + 1, true));
    }
    return summarizeObject(obj, obj.styles);
  }
  textTarget() {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj)) return null;
    const ranged = obj.isEditing && obj.selectionStart !== obj.selectionEnd;
    return { obj, range: ranged ? [obj.selectionStart, obj.selectionEnd] : null };
  }
  /**
   * Pose des propriétés de texte : sur la plage sélectionnée en édition, sinon sur le texte
   * entier — et alors les surcharges par caractère de ces propriétés s'effacent (ce qu'on
   * règle « sur le texte » vaut pour tout le texte). Une plage qui finit par couvrir tout
   * le texte remonte sur l'objet : le document reste propre.
   */
  applyTextStyle(props) {
    const target = this.textTarget();
    if (!target) return;
    const { obj, range } = target;
    if (range) {
      obj.setSelectionStyles(props, range[0], range[1]);
      for (const key of Object.keys(props)) obj.cleanStyle(key);
    } else {
      obj.set(props);
      for (const key of Object.keys(props)) obj.removeStyle(key);
    }
    obj.dirty = true;
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }
  /**
   * @legacy Use ImageFrame.nextClipShape() directly.
   */
  switchClip() {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.nextClipShape();
      obj.dirty = true;
      this.editor.canvas.requestRenderAll();
    } else if (obj instanceof FabricImage7) {
      switchClip(obj);
      obj.dirty = true;
      this.editor.canvas.remove(obj);
      this.editor.layers.add(obj);
    }
  }
  /**
   * @legacy Shape switching is no longer supported.
   */
  switchShape() {
    const obj = this.editor.selection.current;
    if (!obj || obj instanceof FabricImage7) return;
    const currentShapeId = obj.id;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }
  /**
   * @legacy Shape switching is no longer supported.
   */
  changeShape(shapeType) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (obj instanceof ImageFrame) {
      obj.applyClipShape(shapeType);
      obj.dirty = true;
      this.editor.canvas.requestRenderAll();
    } else if (!(obj instanceof FabricImage7)) {
      const newObj = switchShape(obj, shapeType);
      const layerId = obj.get("layerId");
      const layerType = obj.get("layerType");
      if (layerId) newObj.set("layerId", layerId);
      if (layerType) newObj.set("layerType", layerType);
      this.editor.selection.silenceCallbacks();
      const objects = this.editor.canvas.getObjects();
      const zIndex = objects.indexOf(obj);
      this.editor.canvas.remove(obj);
      this.editor.canvas.add(newObj);
      if (zIndex >= 0 && zIndex < this.editor.canvas.getObjects().length) {
        this.editor.canvas.moveObjectTo(newObj, zIndex);
      }
      this.editor.canvas.setActiveObject(newObj);
      this.editor.canvas.requestRenderAll();
      this.editor.selection.restoreCallbacks();
    }
  }
  /**
   * Bascule entre remplissage et contour pour l'objet sélectionné
   */
  toggleOutline() {
    const obj = this.editor.selection.current;
    if (!obj) return;
    const { stroke, fill } = obj;
    obj.set({ fill: stroke, stroke: fill });
    obj.strokeWidth = obj.stroke ? 4 : 0;
    this.editor.canvas.renderAll();
  }
  /**
   * Change la couleur de l'objet sélectionné
   */
  changeColor(color) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (isTextObject(obj)) {
      this.applyTextStyle({ fill: color });
      return;
    }
    obj.set(obj.stroke ? "stroke" : "fill", color);
    this.editor.canvas.renderAll();
  }
  /**
   * Change l'opacité de l'objet sélectionné
   */
  changeOpacity(opacity) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set({ opacity: opacity / 100 });
    this.editor.canvas.renderAll();
  }
  // ==================== Stroke controls ====================
  /**
   * Enable or disable stroke on the selected object.
   * When enabling, restores previous stroke color or defaults to black.
   */
  setStrokeEnabled(enabled) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (enabled) {
      obj.set({ stroke: obj.stroke || "#000000", strokeWidth: obj.strokeWidth || 4 });
    } else {
      obj.set({ stroke: null, strokeWidth: 0 });
    }
    this.editor.canvas.renderAll();
  }
  /**
   * Set stroke width on the selected object.
   */
  setStrokeWidth(width) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set({ strokeWidth: width });
    if (width > 0 && !obj.stroke) {
      obj.set({ stroke: "#000000" });
    }
    this.editor.canvas.renderAll();
  }
  /**
   * Set stroke color on the selected object. Accepts any CSS color (hex, rgba).
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setStrokeColor(color) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set({ stroke: color, opacity: 1 });
    if (!obj.strokeWidth) {
      obj.set({ strokeWidth: 4 });
    }
    this.editor.canvas.renderAll();
  }
  // ==================== Fill controls ====================
  /**
   * Set fill color (solid) on the selected object.
   * Unlike changeColor(), always sets fill regardless of stroke state.
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setFillColor(color) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (isTextObject(obj)) {
      if (!this.textTarget()?.range) obj.set({ opacity: 1 });
      this.applyTextStyle({ fill: color });
      return;
    }
    const previous = obj.fill;
    obj.set({ fill: color, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }
  /**
   * Un dégradé linéaire sur l'objet sélectionné : ses stops (offset 0..1, dans l'ordre) et
   * son angle en degrés, dans la convention de la lib — 0° de gauche à droite, 90° de haut en
   * bas (un quart de tour de moins que le CSS). L'opacité globale revient à 1 : les couleurs
   * des stops la portent.
   */
  setFillGradient(stops, angleDeg) {
    const obj = this.editor.selection.current;
    if (!obj || stops.length < 2) return;
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
      colorStops: stops.map(({ color, offset }) => ({ color, offset }))
    });
    const previous = obj.fill;
    obj.set({ fill: gradient, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }
  /** La police (famille et graisse) de la plage sélectionnée, ou du texte entier. */
  changeFont(fontFamily, fontWeight) {
    this.applyTextStyle({ fontFamily, fontWeight: fontWeight || "normal" });
  }
  /**
   * La taille du texte sélectionné : toujours le texte entier (une taille par texte, que
   * l'autofit pilote) — des tailles par caractère héritées d'un vieux document s'effacent.
   */
  setFontSize(size) {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;
    obj.set({ fontSize: size });
    obj.removeStyle("fontSize");
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }
  /**
   * Justification de l'objet texte sélectionné, dans sa boîte.
   */
  setTextAlign(align) {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj)) return;
    obj.set({ textAlign: align });
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }
  /**
   * Bascule un style (gras, italique, souligné) sur la plage sélectionnée, ou le texte
   * entier. Une plage mixte passe au style (tout en gras), comme dans un traitement de
   * texte. "bold" alterne un poids normal/bold ; un poids numérique >= 600 compte comme gras.
   */
  toggleTextStyle(style) {
    const state = this.textStyle();
    if (!state) return;
    switch (style) {
      case "bold": {
        const on = state.fontWeight !== MIXED && isBold(state.fontWeight);
        this.applyTextStyle({ fontWeight: on ? "normal" : "bold" });
        break;
      }
      case "italic":
        this.applyTextStyle({ fontStyle: state.fontStyle === "italic" ? "normal" : "italic" });
        break;
      case "underline":
        this.applyTextStyle({ underline: state.underline !== true });
        break;
    }
  }
  // ── Shadow ────────────────────────────────────────────────────────
  setShadow(opts) {
    const obj = this.editor.selection.current;
    if (!obj) return;
    const existing = obj.shadow;
    const shadow = new Shadow({
      color: opts.color ?? existing?.color ?? "rgba(0,0,0,0.5)",
      blur: opts.blur ?? existing?.blur ?? 10,
      offsetX: opts.offsetX ?? existing?.offsetX ?? 5,
      offsetY: opts.offsetY ?? existing?.offsetY ?? 5
    });
    obj.set("shadow", shadow);
    this.editor.canvas.requestRenderAll();
  }
  removeShadow() {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set("shadow", null);
    this.editor.canvas.requestRenderAll();
  }
};

// src/editor/clipboard.ts
var Clipboard = class {
  constructor(editor) {
    this.editor = editor;
    // ── Clipboard (copy / paste) ──────────────────────────────────────
    this._clipboard = null;
  }
  /**
   * Copy the current selection to an internal clipboard, with every descendant of the
   * selected containers, in stack order.
   */
  copySelection() {
    const selected = this.editor.selection.selected;
    if (selected.length === 0) return;
    const toCopy = subtreeOf(this.editor.canvas.getObjects(), selected);
    this._clipboard = toCopy.map(
      (obj) => obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"])
    );
  }
  /**
   * Une copie EN PLACE des objets donnés (descendance comprise), chacune juste derrière son
   * original dans les plans, sans toucher à la sélection ni prévenir — ⌥-glisser la laisse
   * là où l'original était. Rend les copies.
   */
  async cloneInPlace(roots) {
    const canvas = this.editor.canvas;
    const sources = subtreeOf(canvas.getObjects(), roots);
    if (!sources.length) return [];
    const idMap = /* @__PURE__ */ new Map();
    sources.forEach((obj, i) => {
      const id = obj.get("layerId");
      if (id) idMap.set(id, `layer_${Date.now()}_${i}_${Math.floor(Math.random() * 1e3)}`);
    });
    const clones = [];
    for (const source of sources) {
      const data = JSON.parse(JSON.stringify(source.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"])));
      if (data.layerId) data.layerId = idMap.get(data.layerId);
      const parent = data.layout?.child?.parentId;
      if (parent && idMap.has(parent)) data.layout.child.parentId = idMap.get(parent);
      delete data.lockMode;
      const clone = await this.editor.layers.deserialize(data);
      if (!clone) continue;
      this.editor.layers.add(clone);
      canvas.moveObjectTo(clone, canvas.getObjects().indexOf(source));
      clones.push(clone);
    }
    canvas.requestRenderAll();
    return clones;
  }
  /** Couper : copier, puis retirer la sélection (les objets verrouillés restent). */
  cutSelection() {
    this.copySelection();
    this.editor.deleteSelection();
  }
  /** Dupliquer : une copie décalée de 32 px, sélectionnée — sans toucher au presse-papiers. */
  async duplicateSelection() {
    const kept = this._clipboard;
    this.copySelection();
    const copies = await this.pasteClipboard();
    this._clipboard = kept;
    return copies;
  }
  /**
   * Paste clipboard contents onto the canvas.
   * Generates fresh layerIds and remaps parent/child references.
   * Offsets pasted objects by 32px so they don't overlap the originals.
   */
  async pasteClipboard() {
    if (!this._clipboard?.length) return [];
    const OFFSET = 32;
    const idMap = /* @__PURE__ */ new Map();
    this._clipboard.forEach((data, i) => {
      if (data.layerId) {
        idMap.set(data.layerId, `layer_${Date.now()}_${i}_${Math.floor(Math.random() * 1e3)}`);
      }
    });
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
      const obj = await this.editor.layers.deserialize(data);
      if (obj) {
        this.editor.layers.add(obj);
        objects.push(obj);
      }
    }
    this.editor.selection.selectMany(objects);
    this.editor.canvas.renderAll();
    this.editor.selection.notifyModified(null);
    return objects;
  }
};

// src/align.ts
function alignAxis(edge) {
  return edge === "left" || edge === "center" || edge === "right" ? "x" : "y";
}
function alignDelta(box, ref, edge) {
  switch (edge) {
    case "left":
      return { dx: ref.left - box.left, dy: 0 };
    case "center":
      return { dx: ref.left + ref.width / 2 - (box.left + box.width / 2), dy: 0 };
    case "right":
      return { dx: ref.left + ref.width - (box.left + box.width), dy: 0 };
    case "top":
      return { dx: 0, dy: ref.top - box.top };
    case "middle":
      return { dx: 0, dy: ref.top + ref.height / 2 - (box.top + box.height / 2) };
    case "bottom":
      return { dx: 0, dy: ref.top + ref.height - (box.top + box.height) };
  }
}
function distributeDeltas(boxes, axis) {
  const deltas = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return deltas;
  const start = axis === "horizontal" ? "left" : "top";
  const size = axis === "horizontal" ? "width" : "height";
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a][start] - boxes[b][start]);
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const span = last[start] + last[size] - first[start];
  const filled = order.reduce((sum, i) => sum + boxes[i][size], 0);
  const gap = (span - filled) / (order.length - 1);
  let cursor = first[start] + first[size] + gap;
  for (const i of order.slice(1, -1)) {
    const shift = cursor - boxes[i][start];
    deltas[i] = axis === "horizontal" ? { dx: shift, dy: 0 } : { dx: 0, dy: shift };
    cursor += boxes[i][size] + gap;
  }
  return deltas;
}

// src/editor/selection-commands.ts
var SelectionCommands = class {
  constructor(editor) {
    this.editor = editor;
  }
  // ── Sélectionner ──────────────────────────────────────────────────
  /**
   * Tout sélectionner : les objets de premier niveau qu'on peut saisir (visibles, en jeu,
   * non verrouillés) — un container emmène ses enfants. Rend la sélection.
   */
  selectAll() {
    const roots = this.editor.canvas.getObjects().filter((obj) => obj.visible !== false && obj.selectable !== false && obj.evented !== false && !layoutOf(obj)?.child && getLockMode(obj) === "free" && rulesOf(obj).kind !== "other");
    if (roots.length) this.editor.selection.selectMany(roots);
    return roots;
  }
  /** Désélectionner. */
  deselect() {
    this.editor.canvas.discardActiveObject();
    this.editor.canvas.renderAll();
  }
  // ── Décaler ───────────────────────────────────────────────────────
  /**
   * Décale la sélection de (dx, dy), descendance comprise. Un enfant de pile ne bouge
   * pas (la pile le place). Vrai si quelque chose a bougé — l'hôte est prévenu comme
   * après un glisser (onModified).
   */
  nudgeSelection(dx, dy) {
    const objects = this.editor.canvas.getObjects();
    const roots = this.editor.selection.selected.filter((obj) => rulesOf(obj).deletes && !stackParentOf(obj, objects));
    if (!roots.length) return false;
    this.editor.selection.withSelectionReleased(() => translateSubtree(objects, roots, dx, dy));
    this.editor.layout.relayout();
    this.editor.canvas.renderAll();
    this.editor.selection.notifyModified(roots.length === 1 ? roots[0] : null);
    return true;
  }
  // ── Grouper, dégrouper ────────────────────────────────────────────
  /**
   * Groupe la sélection (au moins deux objets) dans un groupe libre — rien ne bouge. La
   * resélection de ses membres remonte au groupe : c'est lui qui est sélectionné. Rend le
   * groupe, ou null.
   */
  groupSelection() {
    const selected = this.editor.selection.selected;
    if (selected.length < 2) return null;
    let group = null;
    this.editor.selection.withSelectionReleased(() => {
      group = groupObjects(this.editor.canvas, selected, `layer_${Date.now()}_${Math.floor(Math.random() * 1e3)}`);
      if (group) this.editor.layout.relayout();
    });
    if (group) this.editor.selection.notifyModified(group);
    return group;
  }
  /**
   * Dégroupe le container sélectionné : ses enfants restent à leur place, sélectionnés.
   * Rend les enfants (vide : rien à dégrouper).
   */
  ungroupSelection() {
    const container = this.editor.selection.current;
    if (!container || !containerDataOf(container)) return [];
    this.editor.canvas.discardActiveObject();
    const children = ungroupObject(this.editor.canvas, container);
    this.editor.layout.relayout();
    const kept = this.editor.canvas.getObjects().includes(container);
    this.editor.selection.selectMany(children.length || !kept ? children : [container]);
    this.editor.selection.notifyModified(null);
    return children;
  }
  // ── Aligner, répartir ─────────────────────────────────────────────
  /**
   * Aligne la sélection. Plusieurs objets s'alignent sur leur boîte commune ; un objet
   * seul, sur l'intérieur de son container, ou sur l'artboard. Un objet bouge avec sa
   * descendance. Un enfant de pile ne bouge pas : il s'aligne dans la pile (alignSelf),
   * sur l'axe qu'elle laisse libre — l'autre est le sien.
   */
  alignSelection(edge) {
    if (!this.editor.selection.hasSelection) return;
    this.editor.selection.withSelectionReleased((selected) => {
      const objects = this.editor.canvas.getObjects();
      const ref = selected.length > 1 ? unionBox(selected.map(boxOf)) : this.alignReference(selected[0], objects);
      let relayout = false;
      for (const obj of selected) {
        const parent = stackParentOf(obj);
        if (parent) {
          relayout = this.alignInStack(obj, parent, edge) || relayout;
          continue;
        }
        const { dx, dy } = alignDelta(boxOf(obj), ref, edge);
        translateSubtree(objects, [obj], dx, dy);
      }
      if (relayout) this.editor.layout.relayout();
    });
    this.editor.canvas.renderAll();
  }
  /**
   * Répartit la sélection à espace égal sur un axe : les deux extrêmes restent en place.
   * Seulement les objets libres (un enfant de pile a la place que la pile lui donne), et
   * à partir de trois.
   */
  distributeSelection(axis) {
    const objects = this.editor.canvas.getObjects();
    const free = this.editor.selection.selected.filter((obj) => !stackParentOf(obj));
    if (free.length < 3) return;
    this.editor.selection.withSelectionReleased(() => {
      const deltas = distributeDeltas(free.map(boxOf), axis);
      free.forEach((obj, i) => translateSubtree(objects, [obj], deltas[i].dx, deltas[i].dy));
    });
    this.editor.canvas.renderAll();
  }
  /** Aligne un enfant dans sa pile, sur l'axe qu'elle laisse libre. Vrai s'il a changé. */
  alignInStack(obj, parent, edge) {
    const direction = directionOf(containerDataOf(parent));
    if (alignAxis(edge) !== (direction === "column" ? "x" : "y")) return false;
    const layout = layoutOf(obj);
    const alignSelf = edge === "left" || edge === "top" ? "flex-start" : edge === "right" || edge === "bottom" ? "flex-end" : "center";
    if (layout.child.alignSelf === alignSelf) return false;
    obj.set("layout", { ...layout, child: { ...layout.child, alignSelf } });
    return true;
  }
  /** La référence d'un objet seul : l'intérieur de son container, sinon l'artboard. */
  alignReference(obj, objects) {
    const parent = parentOf(obj, objects);
    if (!parent) return { left: 0, top: 0, width: this.editor.width, height: this.editor.height };
    return insetBox(boxOf(parent), paddingOf(containerDataOf(parent)));
  }
  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés ; un container
   * emporte sa descendance.
   */
  deleteSelection() {
    const selected = this.editor.selection.selected;
    if (selected.length === 0) return;
    const deletable = selected.filter((obj) => rulesOf(obj).deletes);
    if (deletable.length === 0) return;
    const doomed = subtreeOf(this.editor.canvas.getObjects(), deletable);
    this.editor.canvas.discardActiveObject();
    this.editor.layers.removeMany(doomed);
    this.editor.canvas.renderAll();
    this.editor.selection.notifyModified(null);
  }
};

// src/ghost.ts
var GHOST_OPACITY = 0.22;
function isGhost(obj) {
  return obj.ghost === true;
}
function setGhost(obj, ghost) {
  if (isGhost(obj) === ghost) return false;
  obj.ghost = ghost || void 0;
  return true;
}
function installGhostRendering(target) {
  const proto = target;
  const original = proto.render;
  proto.render = function(ctx) {
    if (!isGhost(this)) return original.call(this, ctx);
    ctx.save();
    ctx.globalAlpha *= GHOST_OPACITY;
    try {
      original.call(this, ctx);
    } finally {
      ctx.restore();
    }
  };
}

// src/displayStyle.ts
function displayFill(obj) {
  return obj.displayFill ?? null;
}
function setDisplayFill(obj, fill) {
  if (displayFill(obj) === (fill || null)) return false;
  obj.displayFill = fill || void 0;
  obj.dirty = true;
  return true;
}
function installDisplayStyleRendering(target) {
  const proto = target;
  const original = proto.drawObject;
  proto.drawObject = function(ctx, forClipping, context) {
    const fill = displayFill(this);
    if (!fill || forClipping) return original.call(this, ctx, forClipping, context);
    const stored = this.fill;
    this.fill = fill;
    try {
      original.call(this, ctx, forClipping, context);
    } finally {
      this.fill = stored;
    }
  };
}

// src/CropMode.ts
import { Point as Point9, util as util5 } from "#fabric";
var HANDLE_RADIUS = 6;
var HANDLE_GRAB = 12;
var FALLBACK_VEIL = "#f3f4f6";
var VEIL_ALPHA = 0.85;
var PHOTO_VEIL_ALPHA = 0.55;
var CropMode = class {
  constructor(canvas, guideColor) {
    this.canvas = canvas;
    this.guideColor = guideColor;
    this.frame = null;
    this.before = null;
    this.drag = null;
    this.saved = null;
    this.onKeyDown = (e) => {
      if (!this.frame) return;
      if (e.key === "Enter") this.commit();
      else if (e.key === "Escape") this.cancel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    canvas.on("mouse:down", (e) => this.onDown(e));
    canvas.on("mouse:move", (e) => this.onMove(e));
    canvas.on("mouse:up", () => this.onUp());
    canvas.on("after:render", () => this.paint());
    canvas.on("object:removed", (e) => {
      if (e.target === this.frame) this.end(false);
    });
    if (typeof document !== "undefined") document.addEventListener("keydown", this.onKeyDown, true);
  }
  get active() {
    return this.frame !== null;
  }
  get target() {
    return this.frame;
  }
  /** Entre en recadrage sur `frame` ; un recadrage en cours se valide d'abord. */
  start(frame) {
    if (!frame.croppable) return;
    if (this.frame === frame) return;
    if (this.frame) this.commit();
    const fc = this.fc;
    this.canvas.discardActiveObject();
    this.saved = { selection: fc.selection, skipTargetFind: fc.skipTargetFind, defaultCursor: fc.defaultCursor };
    fc.selection = false;
    fc.skipTargetFind = true;
    fc.defaultCursor = "default";
    this.frame = frame;
    this.before = frame.crop;
    this.fire("crop:start", { target: frame });
    this.canvas.requestRenderAll();
  }
  /** Valide : le recadrage courant reste. */
  commit() {
    if (!this.frame || !this.before) return;
    const changed = JSON.stringify(this.frame.crop) !== JSON.stringify(this.before);
    this.end(changed);
  }
  /** Annule : le recadrage d'avant revient. */
  cancel() {
    if (!this.frame || !this.before) return;
    this.frame.setCrop(this.before);
    this.end(false);
  }
  /** Recentre, échelle ×1 — sans sortir du mode. */
  reset() {
    if (!this.frame) return;
    this.frame.resetCrop();
    this.changed();
  }
  dispose() {
    if (typeof document !== "undefined") document.removeEventListener("keydown", this.onKeyDown, true);
  }
  // ─────────────────────────────────────────────────────────────
  get fc() {
    return this.canvas.originalFabricCanvas;
  }
  fire(name, detail) {
    this.fc.fire(name, detail);
  }
  end(changed) {
    const frame = this.frame;
    if (!frame) return;
    const fc = this.fc;
    if (this.saved) Object.assign(fc, this.saved);
    this.frame = null;
    this.before = null;
    this.drag = null;
    this.saved = null;
    if (frame.selectable && frame.canvas === fc) fc.setActiveObject(frame);
    this.fire("crop:end", { target: frame, changed });
    this.canvas.requestRenderAll();
  }
  changed() {
    if (!this.frame) return;
    this.fire("crop:change", { target: this.frame });
    this.canvas.requestRenderAll();
  }
  // ─────────────────────────────────────────────────────────────
  // Gestes : tout en coordonnées du cadre (origine en haut à gauche)
  // ─────────────────────────────────────────────────────────────
  /** Le point de la scène dans le repère du cadre. */
  toFrame(scene) {
    const frame = this.frame;
    const local = scene.transform(util5.invertTransform(frame.calcTransformMatrix()));
    return { x: local.x + frame.frameWidth / 2, y: local.y + frame.frameHeight / 2 };
  }
  /** Le point du cadre à l'écran (pixels CSS du canvas). */
  toScreen(x, y) {
    const frame = this.frame;
    return new Point9(x - frame.frameWidth / 2, y - frame.frameHeight / 2).transform(frame.calcTransformMatrix()).transform(this.fc.viewportTransform);
  }
  /** Une unité d'écran en unités de cadre. */
  frameUnit() {
    const frame = this.frame;
    const scale = Math.max(Math.abs(frame.scaleX || 1), Math.abs(frame.scaleY || 1)) * this.fc.getZoom();
    return 1 / scale;
  }
  hitAt(p) {
    const rect = this.frame.photoRect();
    const grab = HANDLE_GRAB * this.frameUnit();
    for (const cx of [0, 1]) {
      for (const cy of [0, 1]) {
        const hx = rect.x + cx * rect.w;
        const hy = rect.y + cy * rect.h;
        if (Math.hypot(p.x - hx, p.y - hy) <= grab) return { kind: "corner", cx, cy };
      }
    }
    const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    return inside ? { kind: "photo" } : { kind: "outside" };
  }
  onDown(e) {
    if (!this.frame) return;
    if (e.e.button) return;
    const scene = e.scenePoint ?? this.fc.getScenePoint(e.e);
    const p = this.toFrame(scene);
    const hit = this.hitAt(p);
    if (hit.kind === "outside") {
      this.commit();
      return;
    }
    this.drag = { from: this.frame.crop, start: p, rect: this.frame.photoRect(), hit };
  }
  onMove(e) {
    if (!this.frame) return;
    const scene = e.scenePoint ?? this.fc.getScenePoint(e.e);
    const p = this.toFrame(scene);
    if (!this.drag) {
      this.fc.setCursor(this.cursorFor(this.hitAt(p)));
      return;
    }
    const { from, start, rect, hit } = this.drag;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (hit.kind === "photo") {
      this.frame.panCrop(dx, dy, from);
    } else if (hit.kind === "corner") {
      const ax = rect.x + (1 - hit.cx) * rect.w;
      const ay = rect.y + (1 - hit.cy) * rect.h;
      const px = rect.x + hit.cx * rect.w + dx;
      const py = rect.y + hit.cy * rect.h + dy;
      const k = Math.max(Math.abs(px - ax) / rect.w, Math.abs(py - ay) / rect.h);
      this.frame.zoomCrop(from.scale * k, ax, ay, from);
    }
    this.fc.setCursor(this.cursorFor(hit));
    this.changed();
  }
  onUp() {
    this.drag = null;
  }
  cursorFor(hit) {
    switch (hit.kind) {
      case "corner":
        return hit.cx === hit.cy ? "nwse-resize" : "nesw-resize";
      case "photo":
        return "move";
      default:
        return "default";
    }
  }
  // ─────────────────────────────────────────────────────────────
  // Rendu, sur le calque du dessus
  // ─────────────────────────────────────────────────────────────
  paint() {
    const frame = this.frame;
    if (!frame) return;
    const fc = this.fc;
    const ctx = fc.contextTop;
    if (!ctx) return;
    const retina = fc.getRetinaScaling();
    const rect = frame.photoRect();
    const W = frame.frameWidth;
    const H = frame.frameHeight;
    const element = frame.image.getElement();
    const veil = this.canvas.workspaceColor ?? FALLBACK_VEIL;
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.globalAlpha = VEIL_ALPHA;
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, fc.width, fc.height);
    ctx.globalAlpha = 1;
    ctx.transform(...fc.viewportTransform);
    if (element) {
      ctx.save();
      frame.transform(ctx);
      ctx.drawImage(element, rect.x - W / 2, rect.y - H / 2, rect.w, rect.h);
      ctx.globalAlpha = PHOTO_VEIL_ALPHA;
      ctx.fillStyle = veil;
      ctx.fillRect(rect.x - W / 2, rect.y - H / 2, rect.w, rect.h);
      ctx.restore();
    }
    frame.render(ctx);
    this.paintOutline(ctx);
    ctx.restore();
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = this.guideColor;
    ctx.lineWidth = 1.5;
    for (const cx of [0, 1]) {
      for (const cy of [0, 1]) {
        const p = this.toScreen(rect.x + cx * rect.w, rect.y + cy * rect.h);
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    fc.contextTopDirty = true;
  }
  /** Le liseré du cadre : la forme de découpe, tracée par-dessus (comme son contour). */
  paintOutline(ctx) {
    const frame = this.frame;
    const outline = frame.clipPath;
    if (!outline) return;
    const saved = { fill: outline.fill, stroke: outline.stroke, strokeWidth: outline.strokeWidth };
    ctx.save();
    frame.transform(ctx);
    outline.set({ fill: "transparent", stroke: this.guideColor, strokeWidth: 1.5 * this.frameUnit() });
    outline.render(ctx);
    outline.set(saved);
    ctx.restore();
  }
};

// src/shortcuts/keys.ts
var ALIASES = { space: " ", esc: "Escape", del: "Delete" };
var NAMED = ["Delete", "Backspace", "Escape", "Enter", "Tab", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
function parseCombo(combo) {
  const parts = combo.split("+");
  const raw = parts.pop() ?? "";
  const lower = raw.toLowerCase();
  const named = NAMED.find((name) => name.toLowerCase() === lower);
  const key = ALIASES[lower] ?? named ?? (raw.length === 1 ? lower : raw);
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  return { key, mod: mods.has("mod"), shift: mods.has("shift"), alt: mods.has("alt") };
}
function modPressed(e, platform) {
  return platform === "mac" ? e.metaKey : e.ctrlKey;
}
function matchesCombo(combo, e, platform) {
  if (combo.mod !== modPressed(e, platform)) return false;
  if (combo.shift !== e.shiftKey || combo.alt !== e.altKey) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return key === combo.key;
}
function detectPlatform(nav = globalThis.navigator) {
  const hint = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(hint) ? "mac" : "other";
}
var KEY_NAMES = {
  " ": "Espace",
  Escape: "\xC9chap",
  Enter: "\u21B5",
  Backspace: "\u232B",
  Delete: "Suppr",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  Tab: "Tab",
  Home: "D\xE9but",
  End: "Fin"
};
function formatCombo(combo, platform) {
  const key = KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  if (platform === "mac") {
    return `${combo.mod ? "\u2318" : ""}${combo.alt ? "\u2325" : ""}${combo.shift ? "\u21E7" : ""}${key}`;
  }
  return [combo.mod && "Ctrl", combo.alt && "Alt", combo.shift && "Shift", key].filter(Boolean).join("+");
}
function formatCombos(combos, platform) {
  return combos.map((combo) => formatCombo(combo, platform)).join(" ou ");
}
function formatModifier(modifier, platform) {
  if (platform === "mac") return { mod: "\u2318", shift: "\u21E7", alt: "\u2325" }[modifier];
  return { mod: "Ctrl", shift: "Shift", alt: "Alt" }[modifier];
}

// src/shortcuts/table.ts
var isKeyShortcut = (entry) => "keys" in entry;
var nudge = (dx, dy) => (ctx) => {
  const step = ctx.shift ? 10 : 1;
  return ctx.editor.nudgeSelection(dx * step, dy * step);
};
var CANVAS_SHORTCUTS = [
  {
    id: "delete",
    keys: ["Delete", "Backspace"],
    group: "edit",
    tool: "delete",
    run: ({ editor }) => editor.selection.hasSelection && (editor.deleteSelection(), true)
  },
  {
    id: "duplicate",
    keys: ["mod+d"],
    group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (void editor.duplicateSelection(), true)
  },
  {
    id: "copy",
    keys: ["mod+c"],
    group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (editor.copySelection(), true)
  },
  {
    id: "cut",
    keys: ["mod+x"],
    group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (editor.cutSelection(), true)
  },
  { id: "paste", keys: ["mod+v"], group: "edit", run: ({ editor }) => {
    void editor.pasteClipboard();
  } },
  { id: "select-all", keys: ["mod+a"], group: "select", run: ({ editor }) => editor.selectAll().length > 0 },
  // Échap : un geste en cours s'annule (tout revient en place, la sélection reste) ; sinon
  // la sélection se défait
  {
    id: "deselect",
    keys: ["Escape"],
    group: "select",
    run: ({ editor }) => !editor.gestures.active && editor.selection.hasSelection && (editor.deselect(), true)
  },
  { id: "cancel-gesture", keys: ["Escape"], group: "move", when: "always", run: ({ editor }) => editor.gestures.cancel() },
  { id: "group", keys: ["mod+g"], group: "edit", tool: "group", run: ({ editor }) => editor.groupSelection() !== null },
  {
    id: "ungroup",
    keys: ["mod+shift+g"],
    group: "edit",
    tool: "ungroup",
    run: ({ editor }) => editor.ungroupSelection().length > 0
  },
  { id: "nudge-left", keys: ["ArrowLeft", "shift+ArrowLeft"], group: "move", run: nudge(-1, 0) },
  { id: "nudge-right", keys: ["ArrowRight", "shift+ArrowRight"], group: "move", run: nudge(1, 0) },
  { id: "nudge-up", keys: ["ArrowUp", "shift+ArrowUp"], group: "move", run: nudge(0, -1) },
  { id: "nudge-down", keys: ["ArrowDown", "shift+ArrowDown"], group: "move", run: nudge(0, 1) },
  // Les gestes de souris (GestureManager les lit)
  { id: "duplicate-on-drag", gesture: "drag", modifiers: ["alt"], group: "move" },
  { id: "drag-axis", gesture: "drag", modifiers: ["shift"], group: "move" },
  { id: "rotate-free", gesture: "rotate", modifiers: ["shift"], group: "move" }
];

// src/shortcuts/ShortcutManager.ts
var ShortcutManager = class {
  constructor(editor, options = {}) {
    this.editor = editor;
    this.list = [];
    this.bound = [];
    this.onKeyDown = (e) => {
      void this.handle(e);
    };
    this.platform = options.platform ?? detectPlatform();
    this.doc = options.doc ?? (typeof document !== "undefined" ? document : void 0);
    this.register(options.entries ?? CANVAS_SHORTCUTS);
    this.doc?.addEventListener("keydown", this.onKeyDown);
  }
  /** Ajoute des entrées (celles de l'hôte) ; rend de quoi les retirer. */
  register(entries) {
    this.list = [...this.list, ...entries];
    this.rebind();
    return () => {
      this.list = this.list.filter((entry) => !entries.includes(entry));
      this.rebind();
    };
  }
  /** La table, consultable. */
  entries() {
    return this.list;
  }
  keyEntries() {
    return this.list.filter(isKeyShortcut);
  }
  gestures() {
    return this.list.filter((entry) => !isKeyShortcut(entry));
  }
  /** L'étiquette d'un raccourci (« ⌘D », « ⌫ ou Suppr »), null s'il n'existe pas. */
  labelFor(id) {
    const found = this.bound.find((item) => item.entry.id === id);
    return found ? formatCombos(found.combos, this.platform) : null;
  }
  /** L'étiquette du raccourci qui double un outil de la barre. */
  labelForTool(tool) {
    const found = this.bound.find((item) => item.entry.tool === tool);
    return found ? formatCombos(found.combos, this.platform) : null;
  }
  /** Un geste déclaré est-il demandé par les touches tenues pendant l'événement ? */
  gesture(id, e) {
    const found = this.gestures().find((entry) => entry.id === id);
    if (!found) return false;
    return found.modifiers.every((modifier) => {
      if (modifier === "mod") return this.platform === "mac" ? e.metaKey : e.ctrlKey;
      return modifier === "shift" ? e.shiftKey : e.altKey;
    });
  }
  /** Traite une touche ; vrai si une entrée l'a prise (l'événement est alors consommé). */
  async handle(e) {
    const scope = scopeOf(e);
    let handled = false;
    for (const { entry, combos } of this.bound) {
      if (!allowed(entry.when ?? "canvas", scope)) continue;
      if (!combos.some((combo) => matchesCombo(combo, e, this.platform))) continue;
      const result = await entry.run({
        editor: this.editor,
        event: e,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: this.platform === "mac" ? e.metaKey : e.ctrlKey
      });
      if (result !== false) {
        handled = true;
        e.preventDefault();
      }
    }
    return handled;
  }
  dispose() {
    this.doc?.removeEventListener("keydown", this.onKeyDown);
    this.list = [];
    this.bound = [];
  }
  rebind() {
    this.bound = this.keyEntries().map((entry) => ({ entry, combos: entry.keys.map(parseCombo) }));
  }
};
function allowed(when, scope) {
  if (when === "always") return true;
  if (scope === "canvas") return true;
  return when === "editing" && scope === "editing";
}
function scopeOf(e) {
  const target = e.target;
  if (!target || typeof target.closest !== "function") return "canvas";
  const field = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  if (!field) return "canvas";
  return target.closest(".canvas-container") ? "editing" : "field";
}

// src/gestures.ts
var ROTATION_STEP = 15;
var SNAPSHOT_KEYS = ["left", "top", "scaleX", "scaleY", "angle", "skewX", "skewY", "flipX", "flipY", "width", "height"];
var GestureManager = class {
  constructor(editor) {
    this.editor = editor;
    this.current = null;
    this.onBeforeTransform = (e) => this.begin(e);
    this.onMoving = (e) => this.moving(e);
    this.onRotating = (e) => this.rotating(e);
    this.onEnd = () => this.end();
    const canvas = this.editor.canvas;
    canvas.on("before:transform", this.onBeforeTransform);
    canvas.on("object:moving", this.onMoving);
    canvas.on("object:rotating", this.onRotating);
    canvas.on("mouse:up", this.onEnd);
  }
  /** Un geste est en cours (entre le départ et le relâchement). */
  get active() {
    return this.current !== null;
  }
  /**
   * Annule le geste en cours : l'objet reprend sa place, sa taille et son angle ; la copie
   * de ⌥ s'efface ; la pile qui l'accueillait le rend. Faux sans geste.
   */
  cancel() {
    const current = this.current;
    if (!current) return false;
    this.current = null;
    const { target, transform, snapshot, clones } = current;
    target.set(snapshot);
    target.setCoords();
    this.restoreSnap(current);
    clones.forEach((clone) => this.editor.canvas.remove(clone));
    this.editor.layout.rollbackExternalDrag();
    transform.actionPerformed = false;
    target.isMoving = false;
    this.editor.canvas.originalFabricCanvas._currentTransform = null;
    this.editor.canvas.requestRenderAll();
    return true;
  }
  dispose() {
    const canvas = this.editor.canvas;
    canvas.off("before:transform", this.onBeforeTransform);
    canvas.off("object:moving", this.onMoving);
    canvas.off("object:rotating", this.onRotating);
    canvas.off("mouse:up", this.onEnd);
    this.current = null;
  }
  begin(e) {
    const transform = e.transform;
    if (!transform?.target) return;
    const target = transform.target;
    const snapshot = Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, target.get(key)]));
    const current = { transform, target, snapshot, clones: [], snapAngleBefore: target.get("snapAngle") };
    this.current = current;
    if (transform.action === "rotate") target.set("snapAngle", ROTATION_STEP);
    if (transform.action === "drag" && e.e && this.editor.shortcuts.gesture("duplicate-on-drag", e.e)) {
      void this.editor.cloneInPlace(this.editor.selection.selected).then((clones) => {
        if (this.current === current) current.clones = clones;
        else clones.forEach((clone) => this.editor.canvas.remove(clone));
      });
    }
  }
  /** ⇧ pendant un glisser : l'axe dominant depuis le départ, l'autre coordonnée reste. */
  moving(e) {
    const target = e.target;
    const original = e.transform?.original;
    if (!target || !original || !e.e || !this.editor.shortcuts.gesture("drag-axis", e.e)) return;
    const dx = (target.left ?? 0) - original.left;
    const dy = (target.top ?? 0) - original.top;
    if (Math.abs(dx) >= Math.abs(dy)) target.set("top", original.top);
    else target.set("left", original.left);
    target.setCoords();
  }
  /** Le cran de 15°, ou la rotation libre tant que ⇧ est tenu (lu au pas suivant). */
  rotating(e) {
    if (!e.target || !e.e) return;
    e.target.set("snapAngle", this.editor.shortcuts.gesture("rotate-free", e.e) ? 0 : ROTATION_STEP);
  }
  end() {
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.restoreSnap(current);
  }
  restoreSnap({ target, snapAngleBefore, transform }) {
    if (transform.action === "rotate") target.set("snapAngle", snapAngleBefore);
  }
};

// src/FabricEditor.ts
var _FabricEditor = class _FabricEditor {
  constructor(canvasElement, config) {
    this._displayScale = 1;
    this._userZoom = 1;
    this._resizeObserver = null;
    this._resizeCallbacks = [];
    this.styles = new StyleCommands(this);
    this.clipboard = new Clipboard(this);
    this.commands = new SelectionCommands(this);
    this._initialized = false;
    this._replaceToken = {};
    this.config = config;
    if (config.shapes) registerShapes(config.shapes);
    const gc = config.guideColor ?? DEFAULT_GUIDE_COLOR;
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
    this.canvas.originalFabricCanvas[TOKEN_COLOR_KEY] = config.tokenColor ?? gc;
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas, {}, config.guideColor);
    this.layout = new LayoutManager2(
      this.canvas,
      { getEnteredContainerId: () => this.selection.enteredContainerId },
      config.guideColor
    );
    this.crop = new CropMode(this.canvas, gc);
    this.installCropOnDoubleClick();
    this.shortcuts = new ShortcutManager(this, config.shortcuts);
    this.gestures = new GestureManager(this);
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
    this.crop.cancel();
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
   * Double-clic sur une forme-image : son recadrage ; à vide, dans le cadre : celui du fond
   * de la page (le calque `bg`, inerte au ciblage), s'il est une image. Le double-clic d'un
   * texte (édition) ne passe pas ici : ce n'est pas un ImageFrame.
   */
  installCropOnDoubleClick() {
    this.canvas.on("mouse:dblclick", (e) => {
      const target = e.target ? this.selection.resolveTarget(e.target) : this.backgroundFrame(e.scenePoint);
      if (!(target instanceof ImageFrame) || !rulesOf(target).options.includes("image")) return;
      this.crop.start(target);
    });
  }
  /** Le fond image de la page, si `point` tombe dans le cadre. */
  backgroundFrame(point) {
    if (!point || point.x < 0 || point.y < 0 || point.x > this.width || point.y > this.height) return null;
    return this.layers.all.find((obj) => obj.get("layerId") === "bg") ?? null;
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
      this.canvas.renderAll();
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
  setInteractive(_enabled) {
    this.canvas.discardActiveObject();
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
      if (r.status !== "fulfilled") return;
      document?.fonts?.add(r.value);
      forgetFontMeasures(r.value.family);
    });
  }
  // ── Style de la sélection (editor/style-commands) ───────────────
  switchClip() {
    this.styles.switchClip();
  }
  switchShape() {
    this.styles.switchShape();
  }
  changeShape(shapeType) {
    this.styles.changeShape(shapeType);
  }
  toggleOutline() {
    this.styles.toggleOutline();
  }
  changeColor(color) {
    this.styles.changeColor(color);
  }
  changeOpacity(opacity) {
    this.styles.changeOpacity(opacity);
  }
  setStrokeEnabled(enabled) {
    this.styles.setStrokeEnabled(enabled);
  }
  setStrokeWidth(width) {
    this.styles.setStrokeWidth(width);
  }
  setStrokeColor(color) {
    this.styles.setStrokeColor(color);
  }
  setFillColor(color) {
    this.styles.setFillColor(color);
  }
  setFillGradient(stops, angleDeg) {
    this.styles.setFillGradient(stops, angleDeg);
  }
  changeFont(fontFamily, fontWeight) {
    this.styles.changeFont(fontFamily, fontWeight);
  }
  setFontSize(size) {
    this.styles.setFontSize(size);
  }
  setTextAlign(align) {
    this.styles.setTextAlign(align);
  }
  toggleTextStyle(style) {
    this.styles.toggleTextStyle(style);
  }
  /** Le style du texte sélectionné là où un réglage s'appliquerait (plage, curseur, texte). */
  textStyle() {
    return this.styles.textStyle();
  }
  setShadow(opts) {
    this.styles.setShadow(opts);
  }
  removeShadow() {
    this.styles.removeShadow();
  }
  // ── Presse-papier (editor/clipboard) ────────────────────────────
  copySelection() {
    this.clipboard.copySelection();
  }
  pasteClipboard() {
    return this.clipboard.pasteClipboard();
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
  // ── Commandes de sélection (editor/selection-commands) ──────────
  groupSelection() {
    return this.commands.groupSelection();
  }
  selectAll() {
    return this.commands.selectAll();
  }
  deselect() {
    this.commands.deselect();
  }
  nudgeSelection(dx, dy) {
    return this.commands.nudgeSelection(dx, dy);
  }
  cutSelection() {
    this.clipboard.cutSelection();
  }
  cloneInPlace(objects) {
    return this.clipboard.cloneInPlace(objects);
  }
  duplicateSelection() {
    return this.clipboard.duplicateSelection();
  }
  ungroupSelection() {
    return this.commands.ungroupSelection();
  }
  alignSelection(edge) {
    this.commands.alignSelection(edge);
  }
  distributeSelection(axis) {
    this.commands.distributeSelection(axis);
  }
  deleteSelection() {
    this.commands.deleteSelection();
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
  findDropTargetAtPoint(x, y, exclude) {
    const point = new Point10(x, y);
    const objects = this.canvas.getObjects().slice().reverse();
    for (const obj of objects) {
      if (obj === exclude || obj.get(DRAG_PREVIEW_KEY)) continue;
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
    this.gestures.dispose();
    this.shortcuts.dispose();
    this.crop.dispose();
    this.snapping.dispose();
    this.selection.dispose();
    this.canvas.dispose();
  }
  extendFabricObject() {
    if (_FabricEditor._toObjectExtended) return;
    _FabricEditor._toObjectExtended = true;
    installGhostRendering(FabricObject9.prototype);
    installDisplayStyleRendering(FabricObject9.prototype);
    const originalToObject = FabricObject9.prototype.toObject;
    FabricObject9.prototype.toObject = function(propertiesToInclude) {
      const data = originalToObject.call(
        this,
        ["layerId", "layout", "bindings"].concat(propertiesToInclude || [])
      );
      if (this.group instanceof ActiveSelection4) {
        const { x, y } = this.getXY();
        Object.assign(data, { left: x, top: y });
      }
      return data;
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
   * Cadre la vue sur le CONTENU — l'union des boîtes des objets, avec une marge relative —
   * dans le buffer tel que fitToSize l'a dimensionné. Pour un document dont la page est un
   * espace de travail et non un format (un sticker) : la vignette montre le calque, pas le
   * vide autour. Sans objet, la vue de la page reste.
   */
  fitToContent(padding = 0) {
    const objects = this.getObjects();
    if (!objects.length) return;
    const box = unionBox(objects.map((obj) => boxOf(obj)));
    const width = this.getWidth();
    const height = this.getHeight();
    const scale = Math.min(width / (box.width * (1 + padding * 2)), height / (box.height * (1 + padding * 2)));
    this.setViewportTransform([
      scale,
      0,
      0,
      scale,
      (width - box.width * scale) / 2 - box.left * scale,
      (height - box.height * scale) / 2 - box.top * scale
    ]);
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
import { FabricImage as FabricImage9, Point as Point11, Rect as Rect5 } from "#fabric";
var HIGHLIGHT_COLOR = "#3b82f6";
var KIND_CAPABILITIES = {
  image: { layout: false, replaceTarget: true },
  text: { layout: true, replaceTarget: false },
  shape: { layout: true, replaceTarget: false },
  userSlot: { layout: false, replaceTarget: true }
};
function canvasImageSource(obj) {
  if (obj instanceof ImageFrame) return obj.imageSrc ? { url: obj.imageSrc, imageMeta: obj.imageMeta } : null;
  if (obj instanceof FabricImage9) return obj.getSrc() ? { url: obj.getSrc(), imageMeta: {} } : null;
  return null;
}
var DropHandler = class {
  constructor(editor, config) {
    this.editor = editor;
    this.state = {
      hoveredTarget: null,
      pendingTarget: null,
      timer: null,
      replaceMode: false,
      selected: false,
      originalColors: null,
      fabricOverlay: null,
      htmlOverlay: null
    };
    this.dropZone = null;
    this.drag = null;
    this.moving = null;
    this.lastPointer = null;
    this.boundOnCanvasMoving = (e) => this.onCanvasMoving(e);
    this.boundOnCanvasUp = (e) => {
      void this.onCanvasUp(e);
    };
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
    this.editor.canvas.on("object:moving", this.boundOnCanvasMoving);
    this.editor.canvas.on("mouse:up", this.boundOnCanvasUp);
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
   * Détache les event listeners (drop zone et canvas) et nettoie l'état
   */
  detach() {
    if (this.dropZone) {
      this.dropZone.removeEventListener("dragover", this.boundHandleDragOver);
      this.dropZone.removeEventListener("dragleave", this.boundHandleDragLeave);
      this.dropZone.removeEventListener("drop", this.boundHandleDrop);
      this.dropZone = null;
    }
    this.editor.canvas.off("object:moving", this.boundOnCanvasMoving);
    this.editor.canvas.off("mouse:up", this.boundOnCanvasUp);
    this.moving = null;
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
          object.setPositionByOrigin(new Point11(pointer.x, pointer.y), "center", "center");
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
      object.setPositionByOrigin(new Point11(pointer.x, pointer.y), "center", "center");
      object.setCoords();
      this.editor.canvas.requestRenderAll();
    }
    if (this.drag && !this.drag.capabilities.replaceTarget) return;
    this.trackHoverTarget(this.editor.findDropTargetAtPoint(pointer.x, pointer.y));
  }
  /** La cible sous le pointeur : un changement relance l'attente avant « Remplacer ». */
  trackHoverTarget(targetAtPoint, select = true) {
    if (targetAtPoint === this.state.pendingTarget) return;
    this.clearTimer();
    this.clearHighlight();
    this.state.pendingTarget = targetAtPoint;
    if (targetAtPoint) {
      this.state.timer = setTimeout(() => {
        this.activateReplaceMode(targetAtPoint, select);
      }, this.config.hoverDelay);
    }
  }
  // ==================== Une image du canvas, glissée ====================
  /** Un pas de glisser natif : une image du canvas au-dessus d'une cible, ou dans la bande du fond. */
  onCanvasMoving(e) {
    const source = e.target;
    if (this.drag || !source || !canvasImageSource(source)) return;
    if (rulesOf(source).onToolboxImage !== "replaceImage") return;
    if (!this.editor.layout.isIdle) {
      this.leaveCanvasDrag();
      return;
    }
    const pointerEvent = e.e;
    const inEdge = Boolean(pointerEvent && this.config.canvasEdge?.near(pointerEvent));
    if (!this.moving || this.moving.source !== source) this.moving = { source, inEdge: false };
    if (inEdge !== this.moving.inEdge) {
      this.moving.inEdge = inEdge;
      this.config.canvasEdge?.cue?.(inEdge);
    }
    if (inEdge) {
      this.trackHoverTarget(null, false);
      return;
    }
    const pointer = e.scenePoint ?? (pointerEvent ? this.editor.canvas.getScenePoint(pointerEvent) : null);
    if (!pointer) return;
    const target = this.editor.findDropTargetAtPoint(pointer.x, pointer.y, source);
    const candidate = target && !isStackContainer(target) && rulesOf(target).onToolboxImage ? target : null;
    this.trackHoverTarget(candidate, false);
  }
  /** Le lâcher d'un glisser natif : la cible armée prend l'image, ou l'hôte prend le fond. */
  async onCanvasUp(e) {
    const moving = this.moving;
    if (!moving) return;
    this.moving = null;
    const { source, inEdge } = moving;
    const target = this.state.replaceMode ? this.state.hoveredTarget : null;
    this.reset();
    if (inEdge) this.config.canvasEdge?.cue?.(false);
    try {
      if (inEdge && e.e && this.config.canvasEdge) {
        if (await this.config.canvasEdge.take(source, e.e)) this.removeSource(source);
        return;
      }
      if (!target) return;
      const image = canvasImageSource(source);
      if (!image) return;
      if (rulesOf(target).onToolboxImage === "fill") {
        await this.editor.layers.replaceShapeWithImage(target, image.url, image.imageMeta);
      } else {
        await this.editor.layers.replaceImageSource(
          target,
          image.url,
          { imageMeta: image.imageMeta }
        );
      }
      this.removeSource(source);
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }
  /** Le glisser natif quitte notre périmètre (une pile l'a pris) : plus de cible, plus de cue. */
  leaveCanvasDrag() {
    if (this.moving?.inEdge) this.config.canvasEdge?.cue?.(false);
    this.moving = null;
    this.reset();
  }
  /** Le calque glissé est entré dans sa cible : il quitte le canvas. */
  removeSource(source) {
    this.editor.canvas.discardActiveObject();
    this.editor.layers.remove(source);
    this.editor.canvas.renderAll();
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
  activateReplaceMode(target, select = true) {
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
    this.highlightTarget(target, select);
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
   * Met en surbrillance une cible : un voile sombre et le texte « Remplacer » ; sélectionnée
   * pour montrer ses contrôles — sauf pendant un glisser natif (`select` faux), où la
   * sélection est l'objet qu'on tient.
   */
  highlightTarget(target, select = true) {
    this.createOverlay(target);
    this.state.selected = select;
    if (!select) {
      this.editor.canvas.requestRenderAll();
      return;
    }
    this.state.originalColors = {
      border: target.borderColor,
      corner: target.cornerColor
    };
    target.set({
      borderColor: HIGHLIGHT_COLOR,
      cornerColor: HIGHLIGHT_COLOR
    });
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
    const fabricOverlay = new Rect5({
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
    if (this.state.selected) this.editor.canvas.discardActiveObject();
    this.state.selected = false;
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
    const img = await FabricImage9.fromURL(url, { crossOrigin: "anonymous" });
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
    if (pointer) object.setPositionByOrigin(new Point11(pointer.x, pointer.y), "center", "center");
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

// src/tools.ts
var ORDER = {
  text: [
    "fill",
    "font",
    "animations",
    "effects",
    "variables",
    "layout",
    "condition",
    "saveAsSticker",
    "lock",
    "forward",
    "backward"
  ],
  shape: [
    "fill",
    "clip",
    "outline",
    "animations",
    "effects",
    "layout",
    "containerize",
    "condition",
    "saveAsSticker",
    "lock",
    "forward",
    "backward"
  ],
  image: [
    "crop",
    "image",
    "promoteBackground",
    "clip",
    "animations",
    "outline",
    "effects",
    "layout",
    "containerize",
    "condition",
    "saveAsSticker",
    "lock",
    "forward",
    "backward"
  ],
  block: [
    "fill",
    "image",
    "layout",
    "animations",
    "outline",
    "effects",
    "ungroup",
    "condition",
    "saveAsSticker",
    "lock",
    "forward",
    "backward"
  ],
  group: [
    "arrangement",
    "fill",
    "layout",
    "animations",
    "ungroup",
    "effects",
    "condition",
    "saveAsSticker",
    "lock",
    "forward",
    "backward"
  ],
  many: ["group", "align", "distribute", "saveAsSticker", "forward", "backward"]
};
function selectionKindOf(selected) {
  if (selected.length === 0) return null;
  if (selected.length > 1) return "many";
  const [obj] = selected;
  if (containerDataOf(obj)?.origin === "group") return "group";
  if (isContainerObject(obj)) return "block";
  switch (rulesOf(obj).kind) {
    case "text":
      return "text";
    case "imageShape":
    case "legacyImage":
      return "image";
    default:
      return "shape";
  }
}
var EDITING_TOOLS = ["fill", "font"];
function toolsFor(selected, offered) {
  const kind = selectionKindOf(selected);
  if (!kind) return [];
  const available = new Set(offered);
  const allows = kind === "many" ? manyAllows(selected) : oneAllows(selected[0], kind);
  const order = isEditing(selected[0]) ? EDITING_TOOLS : [...ORDER[kind], "delete"];
  return order.filter((tool) => available.has(tool) && allows(tool));
}
function isEditing(obj) {
  return obj.isEditing === true;
}
function oneAllows(obj, kind) {
  const rules = rulesOf(obj);
  const has = (option) => rules.options.includes(option);
  const laidOut = kind === "text" || isContainerObject(obj) || Boolean(parentIdOf(obj));
  return (tool) => {
    switch (tool) {
      case "fill":
        return has("color");
      case "font":
      case "variables":
        return has("font");
      case "outline":
        return has("outline");
      case "effects":
        return has("color") || has("outline");
      case "clip":
        return has("clip");
      case "image":
        return has("image");
      // Recadrer : une vraie image dans son cadre (pas un damier d'attente)
      case "crop":
        return has("image") && obj instanceof ImageFrame && obj.croppable;
      case "promoteBackground":
        return has("image") && rules.restacks;
      case "layout":
        return rules.restyles && laidOut;
      case "animations":
      case "arrangement":
        return rules.restyles;
      case "ungroup":
        return rules.deletes && isContainerObject(obj);
      // Une forme (ou une image) simple devient un bloc : elle accueille, et n'en est pas un
      case "containerize":
        return rules.restyles && rules.hosts && !isContainerObject(obj);
      // Une condition de visibilité se pose sur tout calque sélectionnable, verrou compris :
      // c'est un réglage d'auteur, pas de style ; de même garder la sélection en calque
      case "condition":
      case "saveAsSticker":
      case "lock":
        return true;
      case "forward":
      case "backward":
        return rules.restacks;
      case "delete":
        return rules.deletes;
      default:
        return false;
    }
  };
}
function manyAllows(selected) {
  const rules = selected.map((obj) => rulesOf(obj));
  return (tool) => {
    switch (tool) {
      case "group":
      case "align":
      case "saveAsSticker":
        return true;
      case "distribute":
        return selected.filter((obj) => !stackParentOf(obj)).length >= 3;
      case "forward":
      case "backward":
        return rules.every((r) => r.restacks);
      case "delete":
        return rules.some((r) => r.deletes);
      default:
        return false;
    }
  };
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
  const imageStyles = imageStylesFor(image);
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
function imageStylesFor(image) {
  const { cropX, cropY, offsetX = 0, offsetY = 0, scale = 1 } = image;
  const styles = { position: "absolute", "object-fit": "cover" };
  if (cropX === void 0 && cropY === void 0 && (offsetX || offsetY)) {
    const offsetFromScale = (1 - scale) * 50;
    styles.width = `${scale * 100}%`;
    styles.height = `${scale * 100}%`;
    styles.left = `calc(${offsetFromScale}% + ${offsetX}px)`;
    styles.top = `calc(${offsetFromScale}% + ${offsetY}px)`;
    return styles;
  }
  const x = cropX ?? 0.5;
  const y = cropY ?? 0.5;
  styles.width = `${scale * 100}%`;
  styles.height = `${scale * 100}%`;
  styles.left = `${x * (1 - scale) * 100}%`;
  styles.top = `${y * (1 - scale) * 100}%`;
  styles["object-position"] = `${x * 100}% ${y * 100}%`;
  return styles;
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

// src/text-units.ts
import { util as util6 } from "#fabric";
var WHITESPACE = /\s/;
function internals(text) {
  return text;
}
function lineStarts(t) {
  const starts = [];
  let acc = 0;
  for (let line = 0; line < t._textLines.length; line++) {
    starts.push(acc);
    acc += t._textLines[line].length + t.missingNewlineOffset(line);
  }
  return starts;
}
function boundsOf(t, line) {
  if (!t.__charBounds[line]) t.measureLine(line);
  return t.__charBounds[line];
}
function textUnits(text, kind) {
  const t = internals(text);
  const starts = lineStarts(t);
  const units = [];
  let current = null;
  let leading = null;
  let prevAbs = -2;
  let prevSpace = true;
  for (let line = 0; line < t._textLines.length; line++) {
    const graphemes = t._textLines[line];
    for (let ch = 0; ch < graphemes.length; ch++) {
      const abs = starts[line] + ch;
      const space = WHITESPACE.test(graphemes[ch]);
      const contiguous = abs === prevAbs + 1;
      const opens = kind === "line" ? ch === 0 : kind === "char" ? !space : !space && (prevSpace || !contiguous);
      if (opens) {
        current = { index: units.length, start: leading ?? abs, end: abs + 1, text: "", boxes: [] };
        leading = null;
        units.push(current);
      } else if (current) {
        current.end = abs + 1;
      } else {
        leading ?? (leading = abs);
      }
      prevAbs = abs;
      prevSpace = space;
    }
  }
  for (const unit of units) {
    unit.boxes = rangeBoxes(t, starts, unit.start, unit.end);
    unit.text = t.graphemeSplit(t.text).slice(unit.start, unit.end).join("");
  }
  return units;
}
function rangeBoxes(t, starts, start, end) {
  const boxes = [];
  let top = t._getTopOffset();
  for (let line = 0; line < t._textLines.length; line++) {
    const height = t.getHeightOfLine(line);
    const from = Math.max(start - starts[line], 0);
    const to = Math.min(end - starts[line], t._textLines[line].length);
    if (to > from) {
      const bounds = boundsOf(t, line);
      const left = t._getLeftOffset() + t._getLineLeftOffset(line);
      const x0 = left + bounds[from].left;
      const x1 = left + (bounds[to]?.left ?? bounds[to - 1].left + bounds[to - 1].width);
      boxes.push({ x: x0, y: top, w: x1 - x0, h: height });
    }
    top += height;
  }
  return boxes;
}
var PARTS = ["under", "glyphs", "over"];
function textParts(text) {
  const t = internals(text);
  const has = (prop) => Boolean(t[prop]) || t.styleHas(prop);
  return PARTS.filter((part) => part === "glyphs" ? true : part === "under" ? has("textBackgroundColor") || has("underline") : has("overline") || has("linethrough"));
}
function renderTextRange(text, ctx, start, end, { clip, part = "all" } = {}) {
  const t = internals(text);
  const starts = lineStarts(t);
  const boxes = clip ?? rangeBoxes(t, starts, start, end);
  const paints = (p) => part === "all" || part === p;
  const inRange = (line, ch) => {
    const abs = starts[line] + ch;
    return abs >= start && abs < end;
  };
  const proto = Object.getPrototypeOf(t);
  const clipped = (c, draw) => {
    c.save();
    c.beginPath();
    for (const b of boxes) c.rect(b.x, b.y, b.w, b.h);
    c.clip();
    draw();
    c.restore();
  };
  t._renderChar = function(method, c, line, charIndex, run, left, top) {
    if (!paints("glyphs")) return;
    const graphemes = t.graphemeSplit(run);
    const last = graphemes.length > 1 && charIndex === 0 ? graphemes.length - 1 : charIndex;
    const first = last - graphemes.length + 1;
    const inside = graphemes.map((_, i) => inRange(line, first + i));
    if (inside.every(Boolean)) return proto._renderChar.call(t, method, c, line, charIndex, run, left, top);
    const bounds = boundsOf(t, line);
    for (let i = 0; i < graphemes.length; i++) {
      if (!inside[i]) continue;
      let j = i;
      while (j + 1 < graphemes.length && inside[j + 1]) j++;
      const x = left + bounds[first + i].left - bounds[first].left;
      proto._renderChar.call(t, method, c, line, first + j, graphemes.slice(i, j + 1).join(""), x, top);
      i = j;
    }
  };
  t._renderTextLinesBackground = (c) => {
    if (paints("under")) clipped(c, () => proto._renderTextLinesBackground.call(t, c));
  };
  t._renderTextDecoration = (c, type) => {
    if (paints(type === "underline" ? "under" : "over")) clipped(c, () => proto._renderTextDecoration.call(t, c, type));
  };
  const caching = t.objectCaching;
  t.objectCaching = false;
  try {
    t.render(ctx);
  } finally {
    delete t._renderChar;
    delete t._renderTextLinesBackground;
    delete t._renderTextDecoration;
    t.objectCaching = caching;
    t.dirty = true;
  }
}
function tilePadding(text) {
  const t = internals(text);
  let size = 0;
  for (let line = 0; line < t._textLines.length; line++) size = Math.max(size, t.getHeightOfLine(line) / t.lineHeight);
  const stroke = t.stroke ? t.strokeWidth || 0 : 0;
  const s = t.shadow;
  const shadow = s ? (s.blur || 0) + Math.max(Math.abs(s.offsetX || 0), Math.abs(s.offsetY || 0)) : 0;
  return Math.ceil(Math.max(4, size / 3) + stroke + shadow);
}
function textUnitTiles(text, kind, { resolution = 1, pad = tilePadding(text) } = {}) {
  const t = internals(text);
  const matrix = t.calcTransformMatrix();
  const toLocal = util6.invertTransform(matrix);
  const parts = textParts(text);
  const [a, b, c, d, e, f] = matrix;
  const aligned = b === 0 && c === 0 && a > 0 && d > 0;
  const snapX = (v, round) => aligned ? (round(v * a + e) - e) / a : v;
  const snapY = (v, round) => aligned ? (round(v * d + f) - f) / d : v;
  const all = textUnits(text, kind);
  const flat = all.flatMap((u) => u.boxes);
  const lineLeft = /* @__PURE__ */ new Map();
  const lineRight = /* @__PURE__ */ new Map();
  for (const r of flat) {
    lineLeft.set(r.y, Math.min(lineLeft.get(r.y) ?? Infinity, r.x));
    lineRight.set(r.y, Math.max(lineRight.get(r.y) ?? -Infinity, r.x + r.w));
  }
  const top = Math.min(...flat.map((r) => r.y));
  const bottom = Math.max(...flat.map((r) => r.y + r.h));
  const clipBox = (r) => {
    const x0 = r.x === lineLeft.get(r.y) ? r.x - pad : snapX(r.x, Math.round);
    const x1 = r.x + r.w === lineRight.get(r.y) ? r.x + r.w + pad : snapX(r.x + r.w, Math.round);
    const y0 = r.y === top ? r.y - pad : snapY(r.y, Math.round);
    const y1 = r.y + r.h === bottom ? r.y + r.h + pad : snapY(r.y + r.h, Math.round);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const units = all.map((unit) => {
    const clip = unit.boxes.map(clipBox);
    const tiles = unit.boxes.flatMap((r) => {
      const x0 = snapX(r.x - pad, Math.floor);
      const y0 = snapY(r.y - pad, Math.floor);
      const box = { x: x0, y: y0, w: snapX(r.x + r.w + pad, Math.ceil) - x0, h: snapY(r.y + r.h + pad, Math.ceil) - y0 };
      return parts.map((part) => {
        const canvas = util6.createCanvasElement();
        canvas.width = Math.max(1, Math.ceil(box.w * resolution));
        canvas.height = Math.max(1, Math.ceil(box.h * resolution));
        box.w = canvas.width / resolution;
        box.h = canvas.height / resolution;
        const ctx = canvas.getContext("2d");
        ctx.scale(resolution, resolution);
        ctx.translate(-box.x, -box.y);
        ctx.transform(...toLocal);
        renderTextRange(text, ctx, unit.start, unit.end, { clip, part });
        return { box, part, canvas };
      });
    });
    return { ...unit, tiles };
  });
  return { units, parts, matrix, resolution };
}
export {
  CANVAS_SHORTCUTS,
  CanvasGuides,
  ContainerizeSession,
  CropMode,
  CustomTextbox,
  DEFAULT_GUIDE_COLOR,
  DEFAULT_SNAP_GUIDE_COLOR,
  DesignCanvas,
  DropHandler,
  FabCircle,
  FabPath,
  FabRect,
  FabricEditor,
  FreeResizeSession,
  GHOST_OPACITY,
  GestureManager,
  HEART_PATH,
  HEXAGON_PATH,
  HistoryManager,
  ImageFrame,
  InsertChildSession,
  LAYER_PROPS,
  LayerManager,
  LayoutManager2 as LayoutManager,
  MAX_CROP_SCALE,
  MIN_PAD,
  MIXED,
  MaskManager,
  NO_CROP,
  PendingUploadsManager,
  PersistenceManager,
  PreviewCanvas,
  ROTATION_STEP,
  ResizeSession,
  ScaleSession,
  SelectionManager,
  ShortcutManager,
  SnappingManager,
  StackResizeSession,
  TEXT_STYLE_KEYS,
  USER_SCOPE,
  USER_SLOT_FIELD,
  addCircleClip,
  addCropControls,
  addHeartClip,
  addHexagonClip,
  alignAxis,
  alignDelta,
  antiScale,
  applyClip,
  applyLockMode,
  badgeLabel,
  bindingBadgeLabel,
  canvasImageSource,
  clampTopLeft,
  clipDataFor,
  collectUserSlots,
  createCircle,
  createDropSession,
  createHeart,
  createHexagon,
  createImage,
  createPathShape,
  createPathsShape,
  createRect,
  createShape,
  cropFromRect,
  detectPlatform,
  displayFill,
  distributeDeltas,
  drawBindingBadge,
  drawFrameBadge,
  fabricToHtml,
  fitFreeContainer,
  fontFamiliesOf,
  forgetFontMeasures,
  formatCombo,
  formatModifier,
  getAvailableShapes,
  getCatalogShape,
  getLockMode,
  getNextLockMode,
  getShapeCatalog,
  hasExceededOffset,
  hasPendingBindings,
  initYoga,
  isBold,
  isContentLocked,
  isCropped,
  isFreeContainer,
  isGhost,
  isKeyShortcut,
  isMonoPath,
  isPositionLocked,
  isStyleLocked,
  isUserSlot,
  isValidShape,
  kindOf,
  layerToHtmlStandalone,
  layoutChildren,
  layoutDescendants,
  layoutParents,
  layoutRoot,
  nextShape,
  panCrop,
  parseCombo,
  pendingBindings,
  photoRect,
  pointInObject,
  registerShapes,
  registeredShapes,
  removeCropControls,
  renderTextRange,
  rulesOf,
  runLayout,
  scaledSize,
  selectionKindOf,
  setDisplayFill,
  setGhost,
  setTextContent,
  stackBlock,
  stackParentOf,
  summarizeObject,
  summarizeStyles,
  switchClip,
  switchShape,
  textParts,
  textUnitTiles,
  textUnits,
  tilePadding,
  toolsFor,
  topLeft,
  unionBox,
  userSlotBinding,
  userSlotHint,
  wrapContainerAroundChild,
  yogaLayout,
  zoomCrop
};
//# sourceMappingURL=index.mjs.map