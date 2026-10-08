import { ActiveSelection, FabricObject, FabricImage, Point } from "#fabric";
import { DesignCanvas, type FrameRect } from "./DesignCanvas";
import { LayerManager } from "./LayerManager";
import { SelectionManager } from "./SelectionManager";
import { MaskManager } from "./MaskManager";
import { PersistenceManager } from "./PersistenceManager";
import { HistoryManager } from "./HistoryManager";
import { SnappingManager } from "./SnappingManager";
import { LayoutManager } from "./LayoutManager";
import { registerShapes } from "./shapes";
import { ImageFrame } from "./ImageFrame";
import { applyControlStyle } from "./ui/controls";
import { hexAlpha } from "./ui/color";
import { DRAG_PREVIEW_KEY } from "./types";
import type { EditorConfig, LayerData, FontsConfig, ShapeType } from "./types";
import { initYoga } from "./layout/stack/engine";
import { StyleCommands } from "./editor/style-commands";
import { Clipboard } from "./editor/clipboard";
import { SelectionCommands } from "./editor/selection-commands";

import { type AlignEdge, type DistributeAxis } from "./align";
import { rulesOf } from "./capabilities";
import { collectUserSlots, USER_SLOT_STYLE_KEY, type UserSlot, type UserSlotStyle } from "./userSlots";

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
  private readonly styles = new StyleCommands(this);
  private readonly clipboard = new Clipboard(this);
  private readonly commands = new SelectionCommands(this);

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
      { getEnteredContainerId: () => this.selection.enteredContainerId },
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
  setInteractive(_enabled: boolean): void {
    this.canvas.discardActiveObject();
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

  // ── Style de la sélection (editor/style-commands) ───────────────

  switchClip(): void { this.styles.switchClip(); }
  switchShape(): void { this.styles.switchShape(); }
  changeShape(shapeType: ShapeType): void { this.styles.changeShape(shapeType); }
  toggleOutline(): void { this.styles.toggleOutline(); }
  changeColor(color: string): void { this.styles.changeColor(color); }
  changeOpacity(opacity: number): void { this.styles.changeOpacity(opacity); }
  setStrokeEnabled(enabled: boolean): void { this.styles.setStrokeEnabled(enabled); }
  setStrokeWidth(width: number): void { this.styles.setStrokeWidth(width); }
  setStrokeColor(color: string): void { this.styles.setStrokeColor(color); }
  setFillColor(color: string): void { this.styles.setFillColor(color); }
  setFillGradient(color1: string, color2: string, angleDeg: number): void { this.styles.setFillGradient(color1, color2, angleDeg); }
  changeFont(fontFamily: string, fontWeight?: string): void { this.styles.changeFont(fontFamily, fontWeight); }
  setFontSize(size: number): void { this.styles.setFontSize(size); }
  setTextAlign(align: "left" | "center" | "right" | "justify"): void { this.styles.setTextAlign(align); }
  toggleTextStyle(style: "bold" | "italic" | "underline"): void { this.styles.toggleTextStyle(style); }
  setShadow(opts: { color?: string; blur?: number; offsetX?: number; offsetY?: number }): void { this.styles.setShadow(opts); }
  removeShadow(): void { this.styles.removeShadow(); }

  // ── Presse-papier (editor/clipboard) ────────────────────────────

  copySelection(): void { this.clipboard.copySelection(); }
  pasteClipboard(): Promise<FabricObject[]> { return this.clipboard.pasteClipboard(); }

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

  // ── Commandes de sélection (editor/selection-commands) ──────────

  groupSelection(): FabricObject | null { return this.commands.groupSelection(); }
  ungroupSelection(): FabricObject[] { return this.commands.ungroupSelection(); }
  alignSelection(edge: AlignEdge): void { this.commands.alignSelection(edge); }
  distributeSelection(axis: DistributeAxis): void { this.commands.distributeSelection(axis); }
  deleteSelection(): void { this.commands.deleteSelection(); }

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

