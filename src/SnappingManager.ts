import { Canvas, FabricObject, Line } from "fabric";

export interface SnappingConfig {
  /** Distance en pixels pour déclencher le snap (défaut: 10) */
  threshold?: number;
  /** Activer le snap au centre du canvas (défaut: true) */
  snapToCenter?: boolean;
  /** Activer le snap aux bords du canvas (défaut: true) */
  snapToEdges?: boolean;
  /** Couleur des guides visuels (défaut: "#ff00ff") */
  guideColor?: string;
}

interface SnapGuide {
  orientation: "horizontal" | "vertical";
  position: number;
}

/**
 * Gère le snapping (aimantage) des objets sur le canvas.
 *
 * Permet aux objets de s'aligner automatiquement sur :
 * - Le centre horizontal/vertical du canvas
 * - Les bords du canvas
 */
export class SnappingManager {
  private canvas: Canvas;
  private config: Required<SnappingConfig>;
  private guides: Line[] = [];
  private enabled: boolean = true;

  constructor(canvas: Canvas, config: SnappingConfig = {}) {
    this.canvas = canvas;
    this.config = {
      threshold: config.threshold ?? 10,
      snapToCenter: config.snapToCenter ?? true,
      snapToEdges: config.snapToEdges ?? true,
      guideColor: config.guideColor ?? "#ff00ff",
    };

    this.setupEventListeners();
  }

  /**
   * Active ou désactive le snapping
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearGuides();
    }
  }

  /**
   * Retourne si le snapping est activé
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(config: Partial<SnappingConfig>): void {
    Object.assign(this.config, config);
  }

  private setupEventListeners(): void {
    this.canvas.on("object:moving", (e) => this.handleObjectMoving(e.target));
    this.canvas.on("object:scaling", (e) => this.handleObjectScaling(e.target));
    this.canvas.on("object:modified", () => this.clearGuides());
    this.canvas.on("selection:cleared", () => this.clearGuides());
  }

  private handleObjectMoving(obj: FabricObject | undefined): void {
    if (!obj || !this.enabled) return;

    // Ignorer l'image de fond
    if (obj.get("layerId") === "originalImage") return;

    const activeGuides: SnapGuide[] = [];
    const bound = obj.getBoundingRect();

    // Centre de l'objet
    const objCenterX = bound.left + bound.width / 2;
    const objCenterY = bound.top + bound.height / 2;

    // Centre du canvas
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;

    let snapX: number | null = null;
    let snapY: number | null = null;

    // Snap au centre horizontal
    if (this.config.snapToCenter) {
      if (Math.abs(objCenterX - canvasCenterX) < this.config.threshold) {
        snapX = canvasCenterX - bound.width / 2;
        activeGuides.push({ orientation: "vertical", position: canvasCenterX });
      }

      // Snap au centre vertical
      if (Math.abs(objCenterY - canvasCenterY) < this.config.threshold) {
        snapY = canvasCenterY - bound.height / 2;
        activeGuides.push({ orientation: "horizontal", position: canvasCenterY });
      }
    }

    // Snap aux bords
    if (this.config.snapToEdges) {
      // Bord gauche
      if (Math.abs(bound.left) < this.config.threshold) {
        snapX = 0;
        activeGuides.push({ orientation: "vertical", position: 0 });
      }
      // Bord droit
      else if (Math.abs(bound.left + bound.width - this.canvas.width) < this.config.threshold) {
        snapX = this.canvas.width - bound.width;
        activeGuides.push({ orientation: "vertical", position: this.canvas.width });
      }

      // Bord haut
      if (Math.abs(bound.top) < this.config.threshold) {
        snapY = 0;
        activeGuides.push({ orientation: "horizontal", position: 0 });
      }
      // Bord bas
      else if (Math.abs(bound.top + bound.height - this.canvas.height) < this.config.threshold) {
        snapY = this.canvas.height - bound.height;
        activeGuides.push({ orientation: "horizontal", position: this.canvas.height });
      }
    }

    // Appliquer le snap
    // Pour les objets avec origin au centre, on doit ajuster
    if (snapX !== null || snapY !== null) {
      const newLeft = snapX !== null ? snapX + bound.width / 2 : obj.left;
      const newTop = snapY !== null ? snapY + bound.height / 2 : obj.top;

      // Vérifier si l'objet a son origin au centre
      if (obj.originX === "center" && obj.originY === "center") {
        obj.set({
          left: snapX !== null ? snapX + bound.width / 2 : obj.left,
          top: snapY !== null ? snapY + bound.height / 2 : obj.top,
        });
      } else {
        obj.set({
          left: snapX ?? obj.left,
          top: snapY ?? obj.top,
        });
      }
    }

    // Mettre à jour les guides visuels
    this.updateGuides(activeGuides);
  }

  private handleObjectScaling(obj: FabricObject | undefined): void {
    if (!obj || !this.enabled) return;

    // Ignorer l'image de fond
    if (obj.get("layerId") === "originalImage") return;

    const activeGuides: SnapGuide[] = [];
    const bound = obj.getBoundingRect();

    // Snap aux bords pendant le scaling
    if (this.config.snapToEdges) {
      // Bord droit
      if (Math.abs(bound.left + bound.width - this.canvas.width) < this.config.threshold) {
        activeGuides.push({ orientation: "vertical", position: this.canvas.width });
      }
      // Bord bas
      if (Math.abs(bound.top + bound.height - this.canvas.height) < this.config.threshold) {
        activeGuides.push({ orientation: "horizontal", position: this.canvas.height });
      }
      // Bord gauche
      if (Math.abs(bound.left) < this.config.threshold) {
        activeGuides.push({ orientation: "vertical", position: 0 });
      }
      // Bord haut
      if (Math.abs(bound.top) < this.config.threshold) {
        activeGuides.push({ orientation: "horizontal", position: 0 });
      }
    }

    this.updateGuides(activeGuides);
  }

  private updateGuides(activeGuides: SnapGuide[]): void {
    this.clearGuides();

    for (const guide of activeGuides) {
      const line = this.createGuideLine(guide);
      this.guides.push(line);
      this.canvas.add(line);
    }

    this.canvas.requestRenderAll();
  }

  private createGuideLine(guide: SnapGuide): Line {
    const coords =
      guide.orientation === "vertical"
        ? [guide.position, 0, guide.position, this.canvas.height]
        : [0, guide.position, this.canvas.width, guide.position];

    return new Line(coords, {
      stroke: this.config.guideColor,
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
  }

  private clearGuides(): void {
    for (const guide of this.guides) {
      this.canvas.remove(guide);
    }
    this.guides = [];
  }

  /**
   * Nettoie les ressources
   */
  dispose(): void {
    this.clearGuides();
    this.canvas.off("object:moving");
    this.canvas.off("object:scaling");
    this.canvas.off("object:modified");
    this.canvas.off("selection:cleared");
  }
}
