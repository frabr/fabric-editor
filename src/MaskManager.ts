import { Canvas, FabricImage, FabricObject } from "#fabric";

const MASK_LAYER_ID = "mask";
const BACKGROUND_LAYER_ID = "originalImage";

/**
 * Gère les masques appliqués au canvas
 */
export class MaskManager {
  constructor(private canvas: Canvas) {}

  /**
   * Vérifie si un masque est appliqué
   */
  get hasMask(): boolean {
    return this.findMask() !== undefined;
  }

  /**
   * Retourne le masque actuel s'il existe
   */
  findMask(): FabricObject | undefined {
    return this.canvas
      .getObjects()
      .find((obj) => obj.get("layerId") === MASK_LAYER_ID);
  }

  /**
   * Retourne l'image de fond
   */
  private findBackground(): FabricObject | undefined {
    return this.canvas
      .getObjects()
      .find((obj) => obj.get("layerId") === BACKGROUND_LAYER_ID);
  }

  /**
   * Configure le masque existant (au chargement)
   */
  async setup(container: HTMLElement, maxSize: number): Promise<void> {
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
  async applyMask(maskUrl: string): Promise<FabricImage> {
    const bgImage = this.findBackground();
    if (!bgImage) {
      throw new Error("Pas d'image de fond pour appliquer le masque");
    }

    const maskImage = await FabricImage.fromURL(maskUrl, {
      crossOrigin: "anonymous",
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
      layerId: MASK_LAYER_ID,
    });

    this.canvas.add(maskImage);
    this.canvas.discardActiveObject();
    this.canvas.renderAll();

    return maskImage;
  }

  /**
   * Retire le masque actuel
   */
  removeMask(): void {
    const mask = this.findMask();
    if (mask) {
      this.canvas.remove(mask);
      this.canvas.renderAll();
    }
  }

  /**
   * Redimensionne le canvas et l'image de fond pour correspondre au masque
   */
  private cropCanvasToMask(mask: FabricObject, minimalSize: number): void {
    const newWidth = mask.width;
    const newHeight = mask.height;

    // Ordre important :
    // 1. Redimensionner le canvas
    // 2. Appliquer le zoom
    // 3. Re-redimensionner (pour le zoom)
    this.canvas.setDimensions({ width: newWidth, height: newHeight });
    this.resizeCanvasToFitSync(minimalSize);
    this.canvas.setDimensions({ width: newWidth, height: newHeight });

    // Redimensionner l'image de fond pour couvrir le masque
    this.canvas.getObjects().forEach((obj) => {
      if (obj.get("layerId") === BACKGROUND_LAYER_ID) {
        const scale = Math.max(newWidth / obj.width, newHeight / obj.height);
        obj.set({
          scaleX: scale,
          scaleY: scale,
          left: this.canvas.width / 2,
          top: this.canvas.height / 2,
          originX: "center",
          originY: "center",
        });
        obj.setCoords();
      }
    });

    this.canvas.renderAll();
  }

  /**
   * Redimensionne le canvas pour s'adapter au viewport
   */
  async resizeCanvasToFit(container: HTMLElement, maxSize: number): Promise<void> {
    // Attendre que le container ait des dimensions
    let counter = 1;
    while (
      Math.min(container.clientHeight, container.clientWidth) <= 0 &&
      counter < 20
    ) {
      counter += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.resizeCanvasToFitSync(maxSize, container);
  }

  /**
   * Version synchrone du redimensionnement
   */
  private resizeCanvasToFitSync(maxSize: number, container?: HTMLElement): void {
    // Guards pour compatibilité Node.js
    const hasWindow = typeof window !== "undefined";
    const vw = Math.min(
      maxSize,
      hasWindow ? (window.innerWidth || document.documentElement.clientWidth) : maxSize
    );
    const vh = Math.min(
      maxSize,
      hasWindow ? (window.innerHeight || document.documentElement.clientHeight) : maxSize
    );

    const xPadding = hasWindow && window.innerWidth >= 768 ? 80 : 20;
    const scaleX = (vw - xPadding) / this.canvas.width;
    const scaleY = (vh - 138) / this.canvas.height; // 138 = hauteur de la barre d'insertion

    const zoom = Math.min(scaleX, scaleY);
    this.canvas.setZoom(zoom);

    if (container) {
      container.style.width = `${this.canvas.width * zoom}px`;
      container.style.height = `${this.canvas.height * zoom}px`;
    }

    this.canvas.renderAll();
  }
}
