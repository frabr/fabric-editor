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

interface SnapState {
  snappedX: "center" | "left" | "right" | null;
  snappedY: "center" | "top" | "bottom" | null;
  lastPointerX: number;
  lastPointerY: number;
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
  private snapState: SnapState | null = null;
  /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
  private exitMultiplier: number = 2;

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
    this.canvas.on("object:moving", (e) => this.handleObjectMoving(e));
    this.canvas.on("object:scaling", (e) => this.handleObjectScaling(e.target));
    this.canvas.on("object:modified", () => {
      this.clearGuides();
      this.snapState = null;
    });
    this.canvas.on("selection:cleared", () => {
      this.clearGuides();
      this.snapState = null;
    });
    this.canvas.on("mouse:down", () => {
      this.snapState = null;
    });
  }

  private handleObjectMoving(e: { target?: FabricObject; pointer?: { x: number; y: number } }): void {
    const obj = e.target;
    if (!obj || !this.enabled) return;

    // Ignorer l'image de fond
    if (obj.get("layerId") === "originalImage") return;

    const activeGuides: SnapGuide[] = [];
    const bound = obj.getBoundingRect();

    // Position actuelle du pointeur (ou estimer depuis l'objet)
    const pointer = e.pointer || { x: obj.left || 0, y: obj.top || 0 };

    // Centre de l'objet
    const objCenterX = bound.left + bound.width / 2;
    const objCenterY = bound.top + bound.height / 2;

    // Centre du canvas
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;

    // Initialiser l'état du snap si nécessaire
    if (!this.snapState) {
      this.snapState = {
        snappedX: null,
        snappedY: null,
        lastPointerX: pointer.x,
        lastPointerY: pointer.y,
      };
    }

    // Calculer le déplacement du pointeur depuis le dernier snap
    const pointerDeltaX = pointer.x - this.snapState.lastPointerX;
    const pointerDeltaY = pointer.y - this.snapState.lastPointerY;

    // Seuils
    const enterThreshold = this.config.threshold;
    const exitThreshold = this.config.threshold * this.exitMultiplier;

    let snapX: number | null = null;
    let snapY: number | null = null;
    let newSnappedX: SnapState["snappedX"] = null;
    let newSnappedY: SnapState["snappedY"] = null;

    // === SNAP HORIZONTAL ===
    if (this.config.snapToCenter) {
      const distToCenter = Math.abs(objCenterX - canvasCenterX);
      const wasSnappedToCenter = this.snapState.snappedX === "center";

      if (wasSnappedToCenter) {
        // Déjà snappé au centre : vérifier si on doit sortir
        if (Math.abs(pointerDeltaX) < exitThreshold) {
          snapX = canvasCenterX - bound.width / 2;
          newSnappedX = "center";
          activeGuides.push({ orientation: "vertical", position: canvasCenterX });
        }
      } else if (distToCenter < enterThreshold) {
        // Pas encore snappé : entrer dans le snap
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

    // === SNAP VERTICAL ===
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

    // Mettre à jour l'état du snap
    this.snapState.snappedX = newSnappedX;
    this.snapState.snappedY = newSnappedY;

    // Appliquer le snap
    if (snapX !== null || snapY !== null) {
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
