import { Canvas, FabricObject, FabricImage, Point, Control, controlsUtils } from "#fabric";
import { LayerManager } from "./LayerManager";
import { SelectionManager } from "./SelectionManager";
import { MaskManager } from "./MaskManager";
import { PersistenceManager } from "./PersistenceManager";
import { HistoryManager } from "./HistoryManager";
import { SnappingManager, type SnappingConfig } from "./SnappingManager";
import { switchClip } from "./clipping";
import { switchShape, nextShape } from "./shapes";
import { ImageFrame } from "./ImageFrame";
import { isPositionLocked } from "./locking";
import type { EditorConfig, LayerData, FontsConfig, ShapeType } from "./types";

/**
 * Éditeur d'images basé sur Fabric.js
 *
 * Coordonne les différents managers pour fournir une API unifiée
 * pour l'édition d'images avec calques.
 */
export class FabricEditor {
  readonly canvas: Canvas;
  readonly layers: LayerManager;
  readonly selection: SelectionManager;
  readonly masks: MaskManager;
  readonly persistence: PersistenceManager;
  readonly history: HistoryManager;
  readonly snapping: SnappingManager;

  private config: EditorConfig;
  private _displayScale = 1;
  private _userZoom = 1;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeCallbacks: Array<() => void> = [];

  constructor(canvasElement: HTMLCanvasElement, config: EditorConfig) {
    this.config = config;

    this.canvas = new Canvas(canvasElement, {
      width: config.width,
      height: config.height,
      preserveObjectStacking: true,
    });

    // Initialiser les managers
    this.layers = new LayerManager(this.canvas);
    this.selection = new SelectionManager(this.canvas);
    this.masks = new MaskManager(this.canvas);
    this.persistence = new PersistenceManager(this.canvas, this.layers);
    this.history = new HistoryManager(this.canvas, this.layers);
    this.snapping = new SnappingManager(this.canvas);

    // Stocker une référence au SnappingManager sur le canvas pour l'accès depuis ImageFrame
    (this.canvas as unknown as { snappingManager: SnappingManager }).snappingManager = this.snapping;

    // Étendre FabricObject pour inclure layerId dans le JSON
    this.extendFabricObject();

    // Déplacer le contrôle de rotation sur le côté droit
    this.configureRotationControl();

    if (config.transparent) {
      this.canvas.backgroundColor = "transparent";
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
    this.layers.all.forEach((obj) => this.layers.remove(obj));
    await this.layers.loadLayers(layers);
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  /**
   * Current CSS scale applied by fitToContainer.
   */
  get displayScale(): number {
    return this._displayScale;
  }

  /**
   * CSS-scale the canvas to fit inside its container.
   *
   * The canvas stays at native resolution (config.width × config.height);
   * a CSS `transform: scale()` on the .canvas-container wrapper makes it
   * fit the container element.  Returns the computed scale factor.
   */
  fitToContainer(): number {
    const container = this.config.container;
    if (!container) return 1;

    const compW = this.config.width;
    const compH = this.config.height;
    const boxW = container.clientWidth;
    const boxH = container.clientHeight;
    const fitScale = Math.min(boxW / compW, boxH / compH);
    const scale = fitScale * this._userZoom;

    this.canvas.setDimensions({ width: compW, height: compH });

    const canvasEl = container.querySelector<HTMLElement>(".canvas-container") || container;
    canvasEl.style.transformOrigin = "top left";
    canvasEl.style.transform = `scale(${scale})`;

    // Center the scaled canvas within the container
    const scaledW = compW * scale;
    const scaledH = compH * scale;
    const offsetX = Math.max(0, (boxW - scaledW) / 2);
    const offsetY = Math.max(0, (boxH - scaledH) / 2);
    canvasEl.style.marginLeft = `${offsetX}px`;
    canvasEl.style.marginTop = `${offsetY}px`;

    // Allow scrolling when zoomed in
    container.style.overflow = this._userZoom > 1 ? "auto" : "hidden";

    this._displayScale = scale;
    return scale;
  }

  /**
   * Set user zoom level (1 = fit to container, >1 = zoom in).
   * Re-runs fitToContainer to apply the new scale.
   */
  setUserZoom(zoom: number): void {
    this._userZoom = Math.max(0.1, zoom);
    this.fitToContainer();
    this._resizeCallbacks.forEach((cb) => cb());
  }

  get userZoom(): number {
    return this._userZoom;
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
      getCanvasOffset: () => {
        const container = this.config.container;
        if (!container) return { left: 0, top: 0 };
        const canvasEl = container.querySelector<HTMLElement>(".canvas-container") || container;
        const anchorRect = anchorEl.getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        return {
          left: canvasRect.left - anchorRect.left,
          top: canvasRect.top - anchorRect.top,
        };
      },
    };
  }

  /**
   * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
   * Utilise le displayScale mis à jour par fitToContainer.
   */
  canvasToDisplayCoords(rect: { left: number; top: number; width: number; height: number }): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const s = this._displayScale;
    return {
      left: rect.left * s,
      top: rect.top * s,
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
    const containerWidth = this.config.width * s;
    const containerHeight = this.config.height * s;
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
   * Charge les polices personnalisées
   */
  async loadFonts(fonts: FontsConfig): Promise<void> {
    const fontFaces = await Promise.all(
      Object.entries(fonts).map(([, values]) => {
        return new FontFace(values.family, values.url, {
          style: "normal",
          weight: values.weight || "normal",
        }).load();
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fontFaces?.forEach((f) => (document?.fonts as any)?.add(f));
  }

  /**
   * Bascule le clip de l'objet sélectionné vers la forme suivante
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
   * Bascule la forme de l'objet sélectionné vers la forme suivante
   */
  switchShape(): void {
    const obj = this.selection.current;
    if (!obj || obj instanceof FabricImage) return;

    const currentShapeId = (obj as FabricObject & { id?: string }).id as ShapeType | undefined;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }

  /**
   * Change la forme de l'objet sélectionné vers un type précis.
   * Pour les shapes : remplace l'objet. Pour les ImageFrames : change le clipShape.
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
  toggleOutline(): void {
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
  changeColor(color: string): void {
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
  changeOpacity(opacity: number): void {
    const obj = this.selection.current;
    if (!obj) return;

    obj.set({ opacity: opacity / 100 });
    this.canvas.renderAll();
  }

  /**
   * Change la police de l'objet texte sélectionné
   */
  changeFont(fontFamily: string, fontWeight?: string): void {
    const obj = this.selection.current;
    if (!obj || obj.type !== "i-text") return;

    obj.set({ fontFamily, fontWeight: fontWeight || "normal" });
    this.canvas.requestRenderAll();
  }

  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés
   */
  deleteSelection(): void {
    const selected = this.selection.selected;
    if (selected.length === 0) return;

    // Filtrer les objets verrouillés (ne supprimer que les objets non verrouillés)
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
  findImageAtPoint(x: number, y: number): FabricImage | ImageFrame | null {
    const target = this.findDropTargetAtPoint(x, y);
    if (!target || target.layerType === "shape") return null;
    return target as FabricImage | ImageFrame;
  }

  /**
   * Trouve l'objet "droppable" sous un point : ImageFrame, FabricImage, ou shape.
   * Utilisé par ImageDropHandler pour le drop d'images sur images ET sur formes.
   */
  findDropTargetAtPoint(x: number, y: number): FabricObject | null {
    const point = new Point(x, y);

    // Parcourir les objets du dessus vers le dessous
    const objects = this.canvas.getObjects().slice().reverse();

    for (const obj of objects) {
      // Ignorer l'image de fond
      if (obj.get("layerId") === "originalImage") continue;

      const layerType = (obj as { layerType?: string }).layerType;

      // ImageFrame
      if (layerType === "imageFrame" && obj.containsPoint(point)) {
        return obj;
      }

      // Shape (rect, circle, heart, hexagon, rounded)
      if (layerType === "shape" && obj.containsPoint(point)) {
        return obj;
      }

      // Image legacy
      if (obj instanceof FabricImage && obj.containsPoint(point)) {
        return obj;
      }
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
  private extendFabricObject(): void {
    const originalToObject = FabricObject.prototype.toObject;
    FabricObject.prototype.toObject = function (propertiesToInclude) {
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
  private configureRotationControl(): void {
    const createSideRotationControl = () =>
      new Control({
        x: 0.5,
        y: 0,
        offsetX: 30,
        offsetY: 0,
        actionHandler: controlsUtils.rotationWithSnapping,
        cursorStyleHandler: controlsUtils.rotationStyleHandler,
        withConnection: true,
        actionName: "rotate",
      });

    // Modifier les contrôles de chaque objet ajouté au canvas
    this.canvas.on("object:added", (e) => {
      if (e.target?.controls?.mtr) {
        e.target.controls.mtr = createSideRotationControl();
      }
    });
  }
}
