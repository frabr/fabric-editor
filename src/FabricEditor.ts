import { ActiveSelection, FabricObject, FabricImage, Point, Gradient, Shadow } from "#fabric";
import { DesignCanvas, type FrameRect } from "./DesignCanvas";
import { LayerManager } from "./LayerManager";
import { SelectionManager } from "./SelectionManager";
import { MaskManager } from "./MaskManager";
import { PersistenceManager } from "./PersistenceManager";
import { HistoryManager } from "./HistoryManager";
import { SnappingManager, type SnappingConfig } from "./SnappingManager";
import { LayoutManager, type LayoutManagerCallbacks } from "./LayoutManager";
import { switchClip } from "./clipping";
import { switchShape, nextShape, registerShapes } from "./shapes";
import { ImageFrame } from "./ImageFrame";
import { applyControlStyle } from "./ui/controls";
import { hexAlpha } from "./ui/color";
import { DRAG_PREVIEW_KEY } from "./types";
import type { EditorConfig, LayerData, FontsConfig, ShapeType } from "./types";
import { initYoga } from "./layout/stack/engine";

import { groupObjects, padGroupOnFirstFill, ungroupObject } from "./layout/grouping";
import { parentOf, stackParentOf, subtreeOf, translateSubtree } from "./layout/hierarchy";
import { boxOf, insetBox } from "./layout/geometry";
import {
  alignAxis, alignDelta, distributeDeltas, unionBox,
  type AlignEdge, type Box, type DistributeAxis,
} from "./align";
import { rulesOf } from "./capabilities";
import { collectUserSlots, USER_SLOT_STYLE_KEY, type UserSlot, type UserSlotStyle } from "./userSlots";
import { layoutOf, idOf, parentIdOf, containerDataOf, directionOf, paddingOf } from "./layout/model";
import { isTextObject } from "./layout/text";

/**
 * Éditeur d'images basé sur Fabric.js
 *
 * Coordonne les différents managers pour fournir une API unifiée
 * pour l'édition d'images avec calques.
 */
export class FabricEditor {
  readonly canvas: DesignCanvas;
  readonly layers: LayerManager;
  readonly selection: SelectionManager;
  readonly masks: MaskManager;
  readonly persistence: PersistenceManager;
  readonly history: HistoryManager;
  readonly snapping: SnappingManager;
  readonly layout: LayoutManager;

  private config: EditorConfig;
  private _displayScale = 1;
  private _userZoom = 1;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeCallbacks: Array<() => void> = [];

  /** Largeur de l'artboard en coordonnées scène. */
  get width(): number {
    return this.config.width;
  }

  /** Hauteur de l'artboard en coordonnées scène. */
  get height(): number {
    return this.config.height;
  }

  constructor(canvasElement: HTMLCanvasElement, config: EditorConfig) {
    this.config = config;

    // Le catalogue de l'hôte, avant tout chargement de document : la résolution des
    // clipShape par id (stock legacy) en dépend.
    if (config.shapes) registerShapes(config.shapes);

    const gc = config.guideColor ?? "#d946ef";

    this.canvas = new DesignCanvas(canvasElement, {
      width: config.width,
      height: config.height,
      preserveObjectStacking: true,
      uniformScaling: false,
      selectionColor: hexAlpha(gc, 0.15),
      selectionBorderColor: hexAlpha(gc, 0.6),
      selectionLineWidth: 1,
    });

    // Initialiser les managers
    this.layers = new LayerManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);

    applyControlStyle(this.canvas, gc, (obj) => this.selection.resolveTarget(obj), config.userSlotLabel);
    const slotStyle: UserSlotStyle = { color: gc, prompt: config.userSlotPrompt };
    (this.canvas.originalFabricCanvas as unknown as Record<string, UserSlotStyle>)[USER_SLOT_STYLE_KEY] = slotStyle;
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas, {}, config.guideColor);
    this.layout = new LayoutManager(
      this.canvas,
      { getActiveGroupId: () => this.selection.activeGroupId },
      config.guideColor,
    );

    // Stocker une référence au SnappingManager sur le canvas pour l'accès depuis ImageFrame
    (this.canvas.originalFabricCanvas as unknown as { snappingManager: SnappingManager }).snappingManager = this.snapping;

    // Étendre FabricObject pour inclure layerId dans le JSON
    this.extendFabricObject();

    if (config.transparent) {
      this.canvas.backgroundColor = "transparent";
    }

    if (config.workspace) {
      this.canvas.enableWorkspace({
        frameColor: gc,
        ...(typeof config.workspace === "object" ? config.workspace : {}),
      });
      this.installWorkspacePan();
    }

  }

  private _initialized = false;

  /**
   * Async initialization: loads fonts from config if present.
   * Idempotent — safe to call multiple times.
   */
  async init(): Promise<void> {
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
  onResize(callback: () => void): void {
    this._resizeCallbacks.push(callback);
  }

  /**
   * Clear all layers, ensure fonts are loaded, load new layers, and render.
   * Single entry point for both initial load and undo/redo restore.
   */
  async replaceAllLayers(layers: LayerData[]): Promise<void> {
    await this.init();
    // Anti-flicker : la désérialisation (chargement d'images compris) se fait AVANT de
    // retirer l'existant, puis swap + rendu dans la même tâche — l'ancien contenu reste à
    // l'écran jusqu'au nouveau, aucune frame vide. Les appels concurrents (changements de
    // slide rapides) se départagent par jeton : le dernier gagne.
    const token = (this._replaceToken = {});
    const objects = await this.layers.deserializeAll(layers);
    if (token !== this._replaceToken) return;

    this.layers.all.forEach((obj) => this.layers.remove(obj));
    objects.forEach((obj) => obj && this.layers.add(obj));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  private _replaceToken: object = {};

  /**
   * Current CSS scale applied by fitToContainer.
   */
  get displayScale(): number {
    return this._displayScale;
  }

  /**
   * Resize the canvas buffer to fit inside its container and use
   * Fabric's viewportTransform to scale the content.
   *
   * This avoids CSS `transform: scale()` which causes sub-pixel blur.
   * The canvas buffer matches the display size exactly → pixel-perfect.
   */
  fitToContainer(): number {
    const container = this.config.container;
    if (!container) return 1;

    const boxW = container.clientWidth;
    const boxH = container.clientHeight;

    // Plan de travail : le canvas remplit le container, la vue centre le cadre
    if (this.canvas.isWorkspace) {
      const scale = this.canvas.fitWorkspace(boxW, boxH, this._userZoom);
      const canvasEl = container.querySelector<HTMLElement>(".canvas-container") || container;
      canvasEl.style.marginLeft = "";
      canvasEl.style.marginTop = "";
      container.style.overflow = "hidden";
      this._displayScale = scale;
      return scale;
    }

    const scale = this.canvas.fitToSize(boxW, boxH, this._userZoom);

    const bufferW = Math.round(this.canvas.width * scale);
    const bufferH = Math.round(this.canvas.height * scale);

    const canvasEl = container.querySelector<HTMLElement>(".canvas-container") || container;
    canvasEl.style.transform = "";
    canvasEl.style.transformOrigin = "";

    // Center the canvas within the container
    const offsetX = Math.max(0, (boxW - bufferW) / 2);
    const offsetY = Math.max(0, (boxH - bufferH) / 2);
    canvasEl.style.marginLeft = `${offsetX}px`;
    canvasEl.style.marginTop = `${offsetY}px`;

    // Allow scrolling when zoomed in
    container.style.overflow = this._userZoom > 1 ? "auto" : "hidden";

    this._displayScale = scale;
    return scale;
  }

  /**
   * Le format se décide en cours d'édition : l'artboard change de dimensions, les calques
   * restent en place — au caller de mettre à jour son document et son conteneur (ratio).
   */
  resizeArtboard(width: number, height: number): void {
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
  setUserZoom(zoom: number): void {
    this._userZoom = Math.max(0.1, zoom);
    // Revenu à l'ajustement (ou en deçà) : la vue se recentre sur le cadre
    if (this._userZoom <= 1) this.canvas.resetPan();
    this.fitToContainer();
    this._resizeCallbacks.forEach((cb) => cb());
  }

  get userZoom(): number {
    return this._userZoom;
  }

  /**
   * Le cadre du document à l'écran (px CSS, relatifs à l'élément canvas) — pour caler
   * dessus les couches HTML de l'hôte (iframe vidéo, fonds HTML, damier). Change à
   * chaque ajustement, zoom ou déplacement : voir onResize.
   */
  get frameRect(): FrameRect {
    return this.canvas.frameRect;
  }

  /**
   * Plan de travail zoomé : la molette déplace la vue (le minimum pour atteindre le
   * hors-cadre ; les gestes de zoom et les limites du déplacement viendront plus tard).
   */
  private installWorkspacePan(): void {
    this.canvas.on("mouse:wheel", (opt: { e: WheelEvent }) => {
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
  private observeResize(): void {
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
  getControlsConfig(anchorEl: HTMLElement): {
    getContainer: () => HTMLElement;
    getDisplayScale: () => number;
    getCanvasOffset: () => { left: number; top: number };
  } {
    return {
      getContainer: () => anchorEl,
      getDisplayScale: () => this._displayScale,
      // Où tombe l'origine du document (le coin du cadre) dans l'ancre : l'élément canvas,
      // plus la position du cadre dans le canvas (nulle hors plan de travail)
      getCanvasOffset: () => {
        const container = this.config.container;
        if (!container) return { left: 0, top: 0 };
        const canvasEl = container.querySelector<HTMLElement>(".canvas-container") || container;
        const anchorRect = anchorEl.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        const frame = this.canvas.frameRect;
        return {
          left: canvasRect.left - anchorRect.left + frame.left,
          top: canvasRect.top - anchorRect.top + frame.top,
        };
      },
    };
  }

  /**
   * Convertit des coordonnées du document vers des coordonnées CSS relatives à l'élément
   * canvas : l'échelle, plus la position du cadre (nulle hors plan de travail).
   */
  canvasToDisplayCoords(rect: { left: number; top: number; width: number; height: number }): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const s = this._displayScale;
    const frame = this.canvas.frameRect;
    return {
      left: frame.left + rect.left * s,
      top: frame.top + rect.top * s,
      width: rect.width * s,
      height: rect.height * s,
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
  positionElementOverObject(
    element: HTMLElement,
    obj: FabricObject,
    options: {
      anchor?: "center" | "top" | "bottom" | "left" | "right";
      offset?: number;
      autoFlip?: boolean;
      clampToContainer?: boolean;
    } = {}
  ): void {
    const { anchor = "center", offset = 0, autoFlip = false, clampToContainer = false } = options;
    const displayRect = this.canvasToDisplayCoords(obj.getBoundingRect());
    const s = this._displayScale;
    // L'espace où l'élément peut se placer : tout le canvas en plan de travail, le cadre sinon
    const containerWidth = this.canvas.isWorkspace ? this.canvas.originalFabricCanvas.width : this.config.width * s;
    const containerHeight = this.canvas.isWorkspace ? this.canvas.originalFabricCanvas.height : this.config.height * s;
    const elementWidth = element.offsetWidth || 100;
    const elementHeight = element.offsetHeight || 40;

    // Déterminer l'ancrage effectif (peut être inversé ou passé à l'intérieur si autoFlip)
    let effectiveAnchor: string = anchor;
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

    let left: number;
    let top: number;
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

    // Contraindre aux limites du container si demandé
    if (clampToContainer) {
      // Calculer la position finale après transform
      const offsetX = transformX === "-100%" ? -elementWidth : transformX === "-50%" ? -elementWidth / 2 : 0;
      const offsetY = transformY === "-100%" ? -elementHeight : transformY === "-50%" ? -elementHeight / 2 : 0;

      const finalLeft = left + offsetX;
      const finalTop = top + offsetY;
      const finalRight = finalLeft + elementWidth;
      const finalBottom = finalTop + elementHeight;

      // Ajuster horizontalement
      if (finalLeft < 0) {
        left -= finalLeft; // Décaler vers la droite
      } else if (finalRight > containerWidth) {
        left -= finalRight - containerWidth; // Décaler vers la gauche
      }

      // Ajuster verticalement
      if (finalTop < 0) {
        top -= finalTop; // Décaler vers le bas
      } else if (finalBottom > containerHeight) {
        top -= finalBottom - containerHeight; // Décaler vers le haut
      }
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.transform = `translate(${transformX}, ${transformY})`;
  }

  /**
   * Returns the bounding rect of a Fabric object as rounded pixel coordinates.
   */
  getObjectBounds(obj: FabricObject): { x: number; y: number; width: number; height: number } {
    const bound = obj.getBoundingRect();
    return {
      x: Math.round(bound.left),
      y: Math.round(bound.top),
      width: Math.round(bound.width),
      height: Math.round(bound.height),
    };
  }

  /**
   * Enable or disable canvas interactivity.
   * When disabled, discards selection and marks the canvas as non-interactive.
   * When enabled, discards selection (clean state) and optionally syncs visibility.
   */
  setInteractive(enabled: boolean): void {
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
  async initialize(
    backgroundImageUrl: string,
    layers: LayerData[] = []
  ): Promise<void> {
    // Charger l'image de fond (taille native, scaling 1:1)
    await this.layers.loadBackgroundImage(backgroundImageUrl);

    // Charger les calques existants
    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }

    // Configurer le masque si présent
    if (this.config.container) {
      await this.masks.setup(this.config.container);
    }

    this.canvas.renderAll();

    // Initialiser l'historique avec l'état initial
    this.history.initialize();
  }

  /**
   * Charge les polices personnalisées.
   * Une police qui échoue (URL morte, CORS…) est ignorée avec un warning :
   * le texte retombe sur la police par défaut au lieu de bloquer tout le rendu.
   */
  async loadFonts(fonts: FontsConfig): Promise<void> {
    const results = await Promise.allSettled(
      Object.entries(fonts).map(([name, values]) => {
        return new FontFace(values.family, values.url, {
          style: "normal",
          weight: values.weight || "normal",
        }).load().catch((e) => {
          console.warn(`[FabricEditor] Font "${name}" failed to load:`, e);
          throw e;
        });
      })
    );

    results.forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (r.status === "fulfilled") (document?.fonts as any)?.add(r.value);
    });
  }

  /**
   * @legacy Use ImageFrame.nextClipShape() directly.
   */
  switchClip(): void {
    const obj = this.selection.current;
    if (!obj) return;

    if (obj instanceof ImageFrame) {
      // Pour ImageFrame, utiliser la méthode nextClipShape
      obj.nextClipShape();
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (obj instanceof FabricImage) {
      // Legacy: images sans frame
      switchClip(obj);
      obj.dirty = true;
      this.canvas.remove(obj);
      this.layers.add(obj);
    }
  }

  /**
   * @legacy Shape switching is no longer supported.
   */
  switchShape(): void {
    const obj = this.selection.current;
    if (!obj || obj instanceof FabricImage) return;

    const currentShapeId = (obj as FabricObject & { id?: string }).id as ShapeType | undefined;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }

  /**
   * @legacy Shape switching is no longer supported.
   */
  changeShape(shapeType: ShapeType): void {
    const obj = this.selection.current;
    if (!obj) return;

    if (obj instanceof ImageFrame) {
      obj.applyClipShape(shapeType);
      obj.dirty = true;
      this.canvas.requestRenderAll();
    } else if (!(obj instanceof FabricImage)) {
      const newObj = switchShape(obj, shapeType);
      // Préserver le layerId et layerType
      const layerId = obj.get("layerId");
      const layerType = obj.get("layerType");
      if (layerId) newObj.set("layerId", layerId);
      if (layerType) newObj.set("layerType", layerType);

      // Le remove+add déclenche des événements de sélection parasites.
      // On mute les callbacks le temps du swap.
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
  toggleOutline(): void {
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
  changeColor(color: string): void {
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
  changeOpacity(opacity: number): void {
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
  setStrokeEnabled(enabled: boolean): void {
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
  setStrokeWidth(width: number): void {
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
  setStrokeColor(color: string): void {
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
  setFillColor(color: string): void {
    const obj = this.selection.current;
    if (!obj) return;
    const previous = obj.fill;
    obj.set({ fill: color, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.layout.relayout();
    this.canvas.renderAll();
  }

  /**
   * Set a linear gradient fill on the selected object.
   */
  setFillGradient(color1: string, color2: string, angleDeg: number): void {
    const obj = this.selection.current;
    if (!obj) return;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const gradient = new Gradient({
      type: "linear",
      gradientUnits: "percentage",
      coords: {
        x1: 0.5 - cos / 2,
        y1: 0.5 - sin / 2,
        x2: 0.5 + cos / 2,
        y2: 0.5 + sin / 2,
      },
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 1, color: color2 },
      ],
    });
    const previous = obj.fill;
    obj.set({ fill: gradient, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.layout.relayout();
    this.canvas.renderAll();
  }

  /**
   * Change la police de l'objet texte sélectionné
   */
  changeFont(fontFamily: string, fontWeight?: string): void {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj)) return;

    obj.set({ fontFamily, fontWeight: fontWeight || "normal" });
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }

  /**
   * Change la taille de police de l'objet texte sélectionné
   */
  setFontSize(size: number): void {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;

    obj.set({ fontSize: size });
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }

  /**
   * Justification de l'objet texte sélectionné, dans sa boîte.
   */
  setTextAlign(align: "left" | "center" | "right" | "justify"): void {
    const obj = this.selection.current;
    if (!obj || !isTextObject(obj)) return;

    obj.set({ textAlign: align } as Partial<FabricObject>);
    this.layout.relayout();
    this.canvas.requestRenderAll();
  }

  /**
   * Bascule un style sur l'objet texte sélectionné (gras, italique, souligné).
   * "bold" alterne fontWeight normal/bold (un poids numérique >= 600 compte
   * comme gras).
   */
  toggleTextStyle(style: "bold" | "italic" | "underline"): void {
    const obj = this.selection.current as (typeof this.selection.current) & {
      fontWeight?: string | number;
      fontStyle?: string;
      underline?: boolean;
    };
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

  setShadow(opts: { color?: string; blur?: number; offsetX?: number; offsetY?: number }): void {
    const obj = this.selection.current;
    if (!obj) return;

    const existing = obj.shadow as Shadow | null;
    const shadow = new Shadow({
      color: opts.color ?? existing?.color ?? "rgba(0,0,0,0.5)",
      blur: opts.blur ?? existing?.blur ?? 10,
      offsetX: opts.offsetX ?? existing?.offsetX ?? 5,
      offsetY: opts.offsetY ?? existing?.offsetY ?? 5,
    });
    obj.set("shadow", shadow);
    this.canvas.requestRenderAll();
  }

  removeShadow(): void {
    const obj = this.selection.current;
    if (!obj) return;
    obj.set("shadow", null);
    this.canvas.requestRenderAll();
  }

  // ── Clipboard (copy / paste) ──────────────────────────────────────

  private _clipboard: any[] | null = null;

  /**
   * Copy the current selection to an internal clipboard, with every descendant of the
   * selected containers, in stack order.
   */
  copySelection(): void {
    const selected = this.selection.selected;
    if (selected.length === 0) return;

    const toCopy = subtreeOf(this.canvas.getObjects(), selected);

    this._clipboard = toCopy.map((obj) =>
      obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"])
    );
  }

  /**
   * Paste clipboard contents onto the canvas.
   * Generates fresh layerIds and remaps parent/child references.
   * Offsets pasted objects by 20px so they don't overlap the originals.
   */
  async pasteClipboard(): Promise<FabricObject[]> {
    if (!this._clipboard?.length) return [];

    const OFFSET = 20;

    // Build an ID remapping table: old layerId → new layerId
    const idMap = new Map<string, string>();
    this._clipboard.forEach((data, i) => {
      if (data.layerId) {
        idMap.set(data.layerId, `layer_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`);
      }
    });

    // Deep-clone each layer, assign new IDs, remap layout references, offset position
    const cloned: any[] = this._clipboard.map((data) => {
      const copy = JSON.parse(JSON.stringify(data));

      // Assign new layerId
      if (copy.layerId && idMap.has(copy.layerId)) {
        copy.layerId = idMap.get(copy.layerId);
      }

      // Remap layout.child.parentId
      if (copy.layout?.child?.parentId) {
        const newParent = idMap.get(copy.layout.child.parentId);
        if (newParent) copy.layout.child.parentId = newParent;
      }

      // Offset position
      if (typeof copy.left === "number") copy.left += OFFSET;
      if (typeof copy.top === "number") copy.top += OFFSET;

      // Clear lock so pasted objects are freely editable
      delete copy.lockMode;

      return copy;
    });

    // Deserialize and add each object
    const objects: FabricObject[] = [];
    for (const data of cloned) {
      const obj = await this.layers.deserialize(data);
      if (obj) {
        this.layers.add(obj);
        objects.push(obj);
      }
    }

    // Select the pasted objects (their roots: children follow their container)
    this.selection.selectMany(objects);
    this.canvas.renderAll();
    return objects;
  }

  /** Les images à fournir de la page (userSlots), boîtes en coordonnées scène. */
  userSlots(): UserSlot[] {
    // L'aperçu d'un drag n'est pas un cadre du document
    return collectUserSlots(this.layers.all.filter((obj) => !obj.get(DRAG_PREVIEW_KEY)));
  }

  /**
   * Prévient l'hôte quand les images à fournir changent — apparition, disparition,
   * consigne, boîte, échelle ou cadrage d'affichage : de quoi (re)placer ses bulles. Comparé
   * à chaque rendu et à chaque redimensionnement, appelé seulement sur changement (et une
   * fois tout de suite). Rend la fonction de désabonnement.
   */
  onUserSlotsChange(callback: (slots: UserSlot[]) => void): () => void {
    let last: string | null = null;
    const check = () => {
      const slots = this.userSlots();
      const signature = JSON.stringify([
        this._displayScale,
        this._userZoom,
        slots.map(({ layerId, hint, rect }) => [
          layerId, hint, Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height),
        ]),
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

  // ── Grouper, dégrouper ────────────────────────────────────────────

  /**
   * Groupe la sélection (au moins deux objets) dans un groupe libre — rien ne bouge. La
   * resélection de ses membres remonte au groupe : c'est lui qui est sélectionné. Rend le
   * groupe, ou null.
   */
  groupSelection(): FabricObject | null {
    const selected = this.selection.selected;
    if (selected.length < 2) return null;

    let group: FabricObject | null = null;
    this.selection.withSelectionReleased(() => {
      group = groupObjects(this.canvas, selected, `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
      if (group) this.layout.relayout();
    });
    return group;
  }

  /**
   * Dégroupe le container sélectionné : ses enfants restent à leur place, sélectionnés.
   * Rend les enfants (vide : rien à dégrouper).
   */
  ungroupSelection(): FabricObject[] {
    const container = this.selection.current;
    if (!container || !containerDataOf(container)) return [];

    this.canvas.discardActiveObject();
    const children = ungroupObject(this.canvas, container);
    this.layout.relayout();
    this.selection.selectMany(children);
    return children;
  }

  // ── Aligner, répartir ─────────────────────────────────────────────

  /**
   * Aligne la sélection. Plusieurs objets s'alignent sur leur boîte commune ; un objet
   * seul, sur l'intérieur de son container, ou sur l'artboard. Un objet bouge avec sa
   * descendance. Un enfant de pile ne bouge pas : il s'aligne dans la pile (alignSelf),
   * sur l'axe qu'elle laisse libre — l'autre est le sien.
   */
  alignSelection(edge: AlignEdge): void {
    if (!this.selection.hasSelection) return;

    this.selection.withSelectionReleased((selected) => {
      const objects = this.canvas.getObjects();
      const ref = selected.length > 1
        ? unionBox(selected.map(boxOf))
        : this.alignReference(selected[0], objects);

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
      if (relayout) this.layout.relayout();
    });
    this.canvas.renderAll();
  }

  /**
   * Répartit la sélection à espace égal sur un axe : les deux extrêmes restent en place.
   * Seulement les objets libres (un enfant de pile a la place que la pile lui donne), et
   * à partir de trois.
   */
  distributeSelection(axis: DistributeAxis): void {
    const objects = this.canvas.getObjects();
    const free = this.selection.selected.filter((obj) => !stackParentOf(obj));
    if (free.length < 3) return;

    this.selection.withSelectionReleased(() => {
      const deltas = distributeDeltas(free.map(boxOf), axis);
      free.forEach((obj, i) => translateSubtree(objects, [obj], deltas[i].dx, deltas[i].dy));
    });
    this.canvas.renderAll();
  }

  /** Aligne un enfant dans sa pile, sur l'axe qu'elle laisse libre. Vrai s'il a changé. */
  private alignInStack(obj: FabricObject, parent: FabricObject, edge: AlignEdge): boolean {
    const direction = directionOf(containerDataOf(parent));
    if (alignAxis(edge) !== (direction === "column" ? "x" : "y")) return false;

    const layout = layoutOf(obj)!;
    const alignSelf = edge === "left" || edge === "top" ? "flex-start"
      : edge === "right" || edge === "bottom" ? "flex-end"
      : "center";
    if (layout.child!.alignSelf === alignSelf) return false;
    obj.set("layout", { ...layout, child: { ...layout.child!, alignSelf } });
    return true;
  }

  /** La référence d'un objet seul : l'intérieur de son container, sinon l'artboard. */
  private alignReference(obj: FabricObject, objects: FabricObject[]): Box {
    const parent = parentOf(obj, objects);
    if (!parent) return { left: 0, top: 0, width: this.width, height: this.height };

    return insetBox(boxOf(parent), paddingOf(containerDataOf(parent)));
  }

  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés ; un container
   * emporte sa descendance.
   */
  deleteSelection(): void {
    const selected = this.selection.selected;
    if (selected.length === 0) return;

    // Filtrer les objets verrouillés (ne supprimer que les objets non verrouillés)
    const deletable = selected.filter((obj) => rulesOf(obj).deletes);
    if (deletable.length === 0) return;

    // Un container emporte toute sa descendance
    const doomed = subtreeOf(this.canvas.getObjects(), deletable);
    this.canvas.discardActiveObject();
    this.layers.removeMany(doomed);
    this.canvas.renderAll();
  }

  /**
   * Trouve l'image ou ImageFrame situé sous un point donné (coordonnées canvas)
   * Retourne null si aucune image n'est trouvée
   */
  findImageAtPoint(x: number, y: number): FabricImage | ImageFrame | null {
    const target = this.findDropTargetAtPoint(x, y);
    if (!target || rulesOf(target, { ignoreLock: true }).onToolboxImage !== "replaceImage") return null;
    return target as FabricImage | ImageFrame;
  }

  /**
   * Trouve la cible d'une image de la toolbox sous un point : le plus haut objet opaque
   * (une forme la prend en fond, une forme-image remplace la sienne — voir rulesOf). Il
   * peut ne pas réagir (verrouillé, groupe de paths) : DropHandler n'arme alors pas le
   * remplacement, et l'image est ajoutée.
   */
  findDropTargetAtPoint(x: number, y: number): FabricObject | null {
    const point = new Point(x, y);

    // Parcourir les objets du dessus vers le dessous
    const objects = this.canvas.getObjects().slice().reverse();

    for (const obj of objects) {
      // La preview de drag suit le curseur : elle matcherait toujours
      if (obj.get(DRAG_PREVIEW_KEY)) continue;
      // Le fond (legacy, promu, passthrough) est hors-jeu : un fond réactif au drop,
      // plein cadre, capterait tous les drops — il se change par le drop en bord ou
      // la promotion, jamais par le drop direct. Le verrou est ignoré ici : un objet
      // verrouillé reste opaque (l'armement du remplacement, lui, le lit).
      // Opaque aussi : une forme qui ne prend pas d'image (groupe de paths) — l'image ne
      // va pas remplir la forme cachée dessous. Un texte, lui, reste transparent.
      const rules = rulesOf(obj, { ignoreLock: true });
      if (!rules.onToolboxImage && !rules.hosts) continue;
      if (obj.containsPoint(point)) return obj;
    }

    return null;
  }

  /**
   * Nettoie les ressources
   */
  dispose(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._resizeCallbacks = [];
    this.snapping.dispose();
    this.selection.dispose();
    this.canvas.dispose();
  }

  /**
   * Étend FabricObject pour inclure layerId dans la sérialisation
   */
  private static _toObjectExtended = false;

  private extendFabricObject(): void {
    if (FabricEditor._toObjectExtended) return;
    FabricEditor._toObjectExtended = true;

    // Dans une sélection multiple, Fabric donne des positions relatives à la sélection :
    // un calque exporté (historique, copie, overlays de l'hôte) garde sa place sur le canvas.
    // La sélection n'a ni poignées de taille ni rotation (SelectionManager) : seule la
    // translation diffère.
    const originalToObject = FabricObject.prototype.toObject;
    FabricObject.prototype.toObject = function(propertiesToInclude) {
      const data = originalToObject.call(
        this,
        ["layerId", "layout", "bindings"].concat(propertiesToInclude || [])
      );
      if (this.group instanceof ActiveSelection) {
        const { x, y } = this.getXY();
        Object.assign(data, { left: x, top: y });
      }
      return data;
    };
  }

}

