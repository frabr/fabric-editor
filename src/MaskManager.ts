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
  async setup(container: HTMLElement): Promise<void> {
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
}
