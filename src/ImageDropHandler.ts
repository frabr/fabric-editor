import { FabricImage, Rect, type FabricObject } from "fabric";
import type { FabricEditor } from "./FabricEditor";
import { isContentLocked } from "./locking";
import { ImageFrame } from "./ImageFrame";

/** Couleur pour le feedback drag & drop via les contrôles de sélection */
const HIGHLIGHT_COLOR = "#3b82f6";

/** Type pour les cibles de remplacement d'image */
type ImageTarget = FabricImage | ImageFrame;

interface DropState {
  hoveredImage: ImageTarget | null;
  pendingImage: ImageTarget | null;
  timer: ReturnType<typeof setTimeout> | null;
  replaceMode: boolean;
  /** Couleurs originales des contrôles */
  originalColors: { border: string; corner: string } | null;
  /** Overlay Fabric (suit le clipPath de l'image) */
  fabricOverlay: Rect | null;
  /** Overlay HTML pour le texte "Remplacer" */
  htmlOverlay: HTMLElement | null;
}

interface ImageDropHandlerConfig {
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
type ResolvedConfig = Required<Omit<ImageDropHandlerConfig, "overlayElement">> & {
  overlayElement: HTMLElement | undefined;
};

/**
 * Gère le drag & drop d'images sur le canvas Fabric.js
 *
 * Deux modes :
 * - Drop rapide (< hoverDelay sur une image) : ajoute une nouvelle image
 * - Drop après attente (>= hoverDelay sur une image) : remplace l'image survolée
 */
export class ImageDropHandler {
  private state: DropState = {
    hoveredImage: null,
    pendingImage: null,
    timer: null,
    replaceMode: false,
    originalColors: null,
    fabricOverlay: null,
    htmlOverlay: null,
  };

  private config: ResolvedConfig;
  private dropZone: HTMLElement | null = null;

  // Handlers liés pour pouvoir les retirer
  private boundHandleDragOver: (e: DragEvent) => void;
  private boundHandleDragLeave: (e: DragEvent) => void;
  private boundHandleDrop: (e: DragEvent) => void;

  constructor(
    private editor: FabricEditor,
    config: ImageDropHandlerConfig
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

  /**
   * Réinitialise l'état complet
   */
  private reset(): void {
    this.clearTimer();
    this.clearHighlight();
    this.state.pendingImage = null;
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    // Le drop est toujours possible (ajout ou remplacement)
    e.dataTransfer!.dropEffect = "copy";

    // Obtenir les coordonnées dans le canvas
    const pointer = this.editor.canvas.getScenePoint(e);
    const imageAtPoint = this.editor.findImageAtPoint(pointer.x, pointer.y);

    // Si on change d'image survolée, reset le timer
    if (imageAtPoint !== this.state.pendingImage) {
      this.clearTimer();
      this.clearHighlight();
      this.state.pendingImage = imageAtPoint;

      // Démarrer le timer si on survole une image
      if (imageAtPoint) {
        this.state.timer = setTimeout(() => {
          this.activateReplaceMode(imageAtPoint);
        }, this.config.hoverDelay);
      }
    }
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.reset();
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    const file = this.extractImageFile(e);
    if (!file) {
      this.reset();
      return;
    }

    // Sauvegarder l'état avant de reset
    const shouldReplace = this.state.replaceMode && this.state.hoveredImage;
    const targetImage = this.state.hoveredImage;

    // Reset le timer et pending
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

  private extractImageFile(e: DragEvent): File | null {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return null;

    const file = files[0];
    if (!file.type.startsWith("image/")) return null;

    return file;
  }

  private activateReplaceMode(image: ImageTarget): void {
    // Si le contenu est verrouillé, ne pas activer le mode remplacement
    if (isContentLocked(image as FabricObject)) {
      return;
    }

    this.state.replaceMode = true;
    this.state.hoveredImage = image;
    this.highlightImage(image);
  }

  private clearTimer(): void {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
    this.state.replaceMode = false;
  }

  private clearHighlight(): void {
    if (this.state.hoveredImage) {
      this.restoreImageStyle(this.state.hoveredImage);
      this.state.hoveredImage = null;
    }
  }

  /**
   * Met en surbrillance une image via les contrôles de sélection Fabric
   * et un overlay HTML sombre avec texte personnalisable
   */
  private highlightImage(target: ImageTarget): void {
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

    // Sélectionner l'image pour afficher les contrôles
    this.editor.canvas.setActiveObject(target);
    this.editor.canvas.renderAll();
  }

  /**
   * Crée les overlays : un Rect Fabric (pour épouser le clipPath) + un élément HTML (pour le texte)
   */
  private createOverlay(target: ImageTarget): void {
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
   * Restaure le style original d'une image/frame et supprime l'overlay
   */
  private restoreImageStyle(target: ImageTarget): void {
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

  private async replaceImage(file: File, target: ImageTarget): Promise<void> {
    // Nettoyer l'overlay avant le remplacement
    this.clearHighlight();

    try {
      const imageUrl = this.config.getImageUrl(file);
      await this.editor.layers.replaceImageSource(target, imageUrl);
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }

  private async addImage(file: File, left: number, top: number): Promise<void> {
    try {
      const imageUrl = this.config.getImageUrl(file);
      await this.editor.layers.addImage(imageUrl, {
        left,
        top,
        originX: "center",
        originY: "center",
      });
      this.config.onSuccess();
    } catch (error) {
      this.config.onError(error);
    }
  }
}
