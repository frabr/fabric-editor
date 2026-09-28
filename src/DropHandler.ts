import { FabricImage, Point, Rect, type FabricObject } from "#fabric";
import type { FabricEditor } from "./FabricEditor";
import { DRAG_PREVIEW_KEY } from "./types";
import type { ImageLayerOptions, ShapeType, TextLayerOptions, ShapeLayerOptions } from "./types";
import { isContentLocked } from "./locking";
import { ImageFrame } from "./ImageFrame";

/** Couleur pour le feedback drag & drop via les contrôles de sélection */
const HIGHLIGHT_COLOR = "#3b82f6";

/** Type pour les cibles de drop : images, ImageFrames, ou shapes */
type DropTarget = FabricImage | ImageFrame | FabricObject;

// ── External drag types ───────────────────────────────────────────────

/**
 * Payload describing what is being dragged from an external source
 * (e.g. an HTML toolbox panel). The kind determines the drop capabilities:
 *
 * | kind  | drop on canvas | replace on hover | layout sessions |
 * |-------|----------------|------------------|-----------------|
 * | image | ✓              | ✓                | ✗               |
 * | text  | ✓              | ✗                | ✓               |
 * | shape | ✓              | ✗                | ✓               |
 */
export type DragPayload =
  | { kind: "image"; url: string; opts?: Partial<ImageLayerOptions> }
  | { kind: "text"; opts?: Partial<TextLayerOptions> }
  | { kind: "shape"; shapeType: ShapeType; opts?: Partial<ShapeLayerOptions> };

interface DragCapabilities {
  /** The drag manifests a real Fabric object that drives layout sessions. */
  layout: boolean;
  /** Hovering a target long enough arms replace mode (image fill). */
  replaceTarget: boolean;
}

const KIND_CAPABILITIES: Record<DragPayload["kind"], DragCapabilities> = {
  image: { layout: false, replaceTarget: true },
  text: { layout: true, replaceTarget: false },
  shape: { layout: true, replaceTarget: false },
};

interface ExternalDragState {
  payload: DragPayload;
  capabilities: DragCapabilities;
  /** Fabric object following the cursor (layout-capable kinds only). */
  object: FabricObject | null;
  /** Whether the object is currently manifested on the canvas. */
  onCanvas: boolean;
}

interface DropState {
  hoveredTarget: DropTarget | null;
  pendingTarget: DropTarget | null;
  timer: ReturnType<typeof setTimeout> | null;
  replaceMode: boolean;
  /** Couleurs originales des contrôles */
  originalColors: { border: string; corner: string } | null;
  /** Overlay Fabric (suit le clipPath de l'image) */
  fabricOverlay: Rect | null;
  /** Overlay HTML pour le texte "Remplacer" */
  htmlOverlay: HTMLElement | null;
}

export interface DropHandlerConfig {
  /** Délai avant d'activer le mode remplacement (ms) */
  hoverDelay?: number;
  /** Fonction pour obtenir une URL à partir d'un fichier (blob URL ou upload) */
  getImageUrl: (file: File) => string;
  /** Élément HTML à afficher comme overlay (sera cloné). Prioritaire sur overlayContent. */
  overlayElement?: HTMLElement | undefined;
  /** Contenu HTML de l'overlay de remplacement (défaut: "Remplacer"). Ignoré si overlayElement est fourni. */
  overlayContent?: string;
  /** Callback après ajout/remplacement réussi */
  onSuccess?: () => void;
  /** Callback en cas d'erreur */
  onError?: (error: unknown) => void;
}

/** Config avec valeurs par défaut appliquées (overlayElement reste optionnel) */
type ResolvedConfig = Required<Omit<DropHandlerConfig, "overlayElement">> & {
  overlayElement: HTMLElement | undefined;
};

/**
 * Gère le drag & drop sur le canvas Fabric.js
 *
 * Supports images (native file drop + URL), text, and shapes.
 *
 * Image-specific behaviour:
 * - Drop rapide (< hoverDelay sur une cible) : ajoute une nouvelle image
 * - Drop après attente (>= hoverDelay sur une cible) : remplace l'image survolée
 *
 * Text & shape drops are always "add at position" — no replace mode.
 */
export class DropHandler {
  private state: DropState = {
    hoveredTarget: null,
    pendingTarget: null,
    timer: null,
    replaceMode: false,
    originalColors: null,
    fabricOverlay: null,
    htmlOverlay: null,
  };

  private config: ResolvedConfig;
  private dropZone: HTMLElement | null = null;
  private drag: ExternalDragState | null = null;
  private lastPointer: { x: number; y: number } | null = null;

  // Handlers liés pour pouvoir les retirer
  private boundHandleDragOver: (e: DragEvent) => void;
  private boundHandleDragLeave: (e: DragEvent) => void;
  private boundHandleDrop: (e: DragEvent) => void;

  constructor(
    private editor: FabricEditor,
    config: DropHandlerConfig
  ) {
    this.config = {
      hoverDelay: 1000,
      overlayElement: undefined,
      overlayContent: "Remplacer",
      onSuccess: () => {},
      onError: console.error,
      ...config,
    };

    this.boundHandleDragOver = this.handleDragOver.bind(this);
    this.boundHandleDragLeave = this.handleDragLeave.bind(this);
    this.boundHandleDrop = this.handleDrop.bind(this);
  }

  /**
   * Attache les event listeners sur l'élément drop zone
   */
  attach(dropZone: HTMLElement): void {
    this.dropZone = dropZone;
    dropZone.addEventListener("dragover", this.boundHandleDragOver);
    dropZone.addEventListener("dragleave", this.boundHandleDragLeave);
    dropZone.addEventListener("drop", this.boundHandleDrop);
  }

  /**
   * Détache les event listeners et nettoie l'état
   */
  detach(): void {
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
  async dropImage(
    url: string,
    e?: DragEvent,
    opts?: Partial<ImageLayerOptions>
  ): Promise<{ kind: "add"; object: ImageFrame } | { kind: "replace"; object?: ImageFrame } | null> {
    const shouldReplace = this.state.replaceMode && this.state.hoveredTarget;
    const target = this.state.hoveredTarget;

    this.clearTimer();
    this.state.pendingTarget = null;
    this.clearHighlight();

    try {
      if (shouldReplace && target) {
        const isShape = (target as { layerType?: string }).layerType === "shape";
        if (isShape) {
          // Drop sur une forme → convertir en ImageFrame avec la forme comme masque
          const frame = await this.editor.layers.replaceShapeWithImage(target, url);
          this.config.onSuccess();
          return { kind: "replace", object: frame };
        }
        // Drop sur une image/ImageFrame → remplacement classique
        await this.editor.layers.replaceImageSource(target as ImageFrame | FabricImage, url);
        this.config.onSuccess();
        return { kind: "replace" };
      }

      const addOpts: ImageLayerOptions = { ...opts };
      if (e) {
        // Drop entirely outside the artboard → no-op (native file drags
        // and unarmed fallbacks reach here without the completeDrag guard)
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
  prepareDrag(payload: DragPayload): void {
    if (this.drag) this.cancelDrag();

    const capabilities = KIND_CAPABILITIES[payload.kind];
    const drag: ExternalDragState = { payload, capabilities, object: null, onCanvas: false };
    this.drag = drag;

    if (payload.kind === "image") {
      this.createImagePreview(payload.url)
        .then((img) => {
          if (this.drag === drag) drag.object = img;
        })
        .catch(() => {}); // preview is cosmetic — the drop still works without it
    } else {
      drag.object = this.createDragObject(payload);
    }
  }

  /**
   * Complete the armed drag:
   * - image → replaces the hovered target if replace mode armed, else adds
   * - text/shape → commits the layout session if anchored, else adds at cursor
   *
   * Returns the newly added object, or null when nothing new was added
   * (replace of an existing target, or error).
   */
  async completeDrag(e?: DragEvent): Promise<FabricObject | null> {
    if (!this.drag) return null;
    const { payload, object } = this.drag;

    // Drop entirely outside the artboard → cancel instead of adding.
    // (An anchored layout session implies we're over a container on canvas.)
    if (e && !this.editor.layout.isAnchored && !this.intersectsCanvas(e, object)) {
      this.cancelDrag();
      return null;
    }

    if (payload.kind === "image") {
      // Discard the cosmetic preview — dropImage creates the real ImageFrame
      if (object && this.drag.onCanvas) {
        this.editor.canvas.remove(object);
      }
      this.drag = null;
      const result = await this.dropImage(payload.url, e, payload.opts);
      return result?.kind === "add" ? result.object : null;
    }

    try {
      const committed = this.editor.layout.commitExternalDrag();

      if (!committed && object) {
        // No session — simple add centered at the drop position
        if (e) {
          const pointer = this.editor.canvas.getScenePoint(e);
          object.setPositionByOrigin(new Point(pointer.x, pointer.y), "center", "center");
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
      return object;
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
  suspendDrag(): void {
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
  cancelDrag(): void {
    this.suspendDrag();
    this.drag = null;
  }

  /** Whether an external drag is currently armed. */
  get isExternalDrag(): boolean {
    return this.drag !== null;
  }

  // ==================== Internal ====================

  private reset(): void {
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
  trackPointer(e: DragEvent): void {
    const pointer = this.editor.canvas.getScenePoint(e);

    // The same dragover can reach us twice (app-level zone + our own
    // listener) — skip the duplicate tick if the cursor hasn't moved.
    if (this.lastPointer && pointer.x === this.lastPointer.x && pointer.y === this.lastPointer.y) {
      return;
    }
    this.lastPointer = { x: pointer.x, y: pointer.y };

    // Manifest the armed object on the canvas and make it follow the cursor
    if (this.drag?.object) {
      const { object, capabilities } = this.drag;
      if (!this.drag.onCanvas) {
        this.editor.canvas.add(object);
        this.drag.onCanvas = true;
      }
      if (capabilities.layout) {
        // Layout-capable drag: drive the layout state machine
        this.editor.layout.tickExternalDrag(object, pointer);
        return;
      }
      // Cosmetic preview (image): just follow the cursor
      object.setPositionByOrigin(new Point(pointer.x, pointer.y), "center", "center");
      object.setCoords();
      this.editor.canvas.requestRenderAll();
    }
    if (this.drag && !this.drag.capabilities.replaceTarget) return;

    // Replace-capable drag (armed image) or native file drag: track hover target
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

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = "copy";
    this.trackPointer(e);
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    // dragleave also fires when entering a child element — ignore those
    const related = e.relatedTarget as Node | null;
    if (related && this.dropZone?.contains(related)) return;
    this.suspendDrag();
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    const file = this.extractImageFile(e);
    if (!file) {
      this.reset();
      return;
    }

    await this.dropImage(this.config.getImageUrl(file), e);
  }

  private extractImageFile(e: DragEvent): File | null {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;

    const file = files[0];
    if (!file.type.startsWith("image/")) return null;

    return file;
  }

  private activateReplaceMode(target: DropTarget): void {
    // Si le contenu est verrouillé, ne pas activer le mode remplacement
    if (isContentLocked(target as FabricObject)) {
      return;
    }

    // eslint-disable-next-line no-console
    console.debug("[drop] replace armed on", {
      layerId: (target as FabricObject).get?.("layerId"),
      evented: (target as FabricObject).evented,
      lockMode: (target as FabricObject).get?.("lockMode"),
    });

    this.state.replaceMode = true;
    this.state.hoveredTarget = target;
    this.highlightTarget(target);
  }

  private clearTimer(): void {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
    this.state.replaceMode = false;
  }

  private clearHighlight(): void {
    if (this.state.hoveredTarget) {
      this.restoreTargetStyle(this.state.hoveredTarget);
      this.state.hoveredTarget = null;
    }
  }

  /**
   * Met en surbrillance une cible via les contrôles de sélection Fabric
   * et un overlay HTML sombre avec texte personnalisable
   */
  private highlightTarget(target: DropTarget): void {
    // Sauvegarder les couleurs originales
    this.state.originalColors = {
      border: target.borderColor as string,
      corner: target.cornerColor as string,
    };

    // Appliquer les couleurs de feedback
    target.set({
      borderColor: HIGHLIGHT_COLOR,
      cornerColor: HIGHLIGHT_COLOR,
    });

    // Créer l'overlay HTML
    this.createOverlay(target);

    // Sélectionner la cible pour afficher les contrôles
    this.editor.canvas.setActiveObject(target);
    this.editor.canvas.renderAll();
  }

  /**
   * Crée les overlays : un Rect Fabric (pour épouser le clipPath) + un élément HTML (pour le texte)
   */
  private createOverlay(target: DropTarget): void {
    // Extraire les dimensions selon le type
    let width: number;
    let height: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clipPath: any;

    if (target instanceof ImageFrame) {
      width = target.frameWidth;
      height = target.frameHeight;
      clipPath = target.clipPath;
    } else {
      width = target.width;
      height = target.height;
      clipPath = target.clipPath;
    }

    // 1. Overlay Fabric : suit le clipPath de l'image/frame
    const fabricOverlay = new Rect({
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
      clipPath,
    });

    this.editor.canvas.add(fabricOverlay);
    this.state.fabricOverlay = fabricOverlay;

    // 2. Overlay HTML : texte "Remplacer" positionné par-dessus
    if (!this.dropZone) return;

    // Créer l'overlay : cloner l'élément fourni ou créer un élément basique
    const htmlOverlay = this.config.overlayElement
      ? (this.config.overlayElement.cloneNode(true) as HTMLElement)
      : this.createDefaultOverlay();

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
  private createDefaultOverlay(): HTMLElement {
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
  private restoreTargetStyle(target: DropTarget): void {
    // Restaurer les couleurs originales
    if (this.state.originalColors) {
      target.set({
        borderColor: this.state.originalColors.border,
        cornerColor: this.state.originalColors.corner,
      });
      this.state.originalColors = null;
    }

    // Supprimer l'overlay HTML
    this.removeOverlay();

    this.editor.canvas.discardActiveObject();
    this.editor.canvas.renderAll();
  }

  /**
   * Supprime les overlays (Fabric + HTML)
   */
  private removeOverlay(): void {
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
  private intersectsCanvas(e: DragEvent, object: FabricObject | null): boolean {
    const p = this.editor.canvas.getScenePoint(e);
    const w = this.editor.width;
    const h = this.editor.height;
    if (!object) {
      return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
    }
    // The object lands centered under the cursor
    const hw = object.getScaledWidth() / 2;
    const hh = object.getScaledHeight() / 2;
    return p.x + hw > 0 && p.x - hw < w && p.y + hh > 0 && p.y - hh < h;
  }

  /**
   * Cosmetic preview for an image drag: the real image, scaled like
   * addImage would (300px max), semi-transparent, and excluded from
   * drop-target detection.
   */
  private async createImagePreview(url: string): Promise<FabricImage> {
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
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
      [DRAG_PREVIEW_KEY]: true,
    });
    return img;
  }

  private createDragObject(payload: Extract<DragPayload, { kind: "text" | "shape" }>): FabricObject {
    const offscreen = { left: -9999, top: -9999 };
    return payload.kind === "text"
      ? this.editor.layers.createText({ ...payload.opts, ...offscreen })
      : this.editor.layers.createShape({ ...payload.opts, shapeType: payload.shapeType, ...offscreen });
  }

}
