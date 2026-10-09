import { ActiveSelection, type FabricObject } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { snapMove, type SnapBox, type SnapKeep } from "./snap";
import { ancestorsOf, stackParentOf, subtreeOf } from "./layout/hierarchy";

export interface SnappingConfig {
  /** Distance en pixels ÉCRAN pour déclencher le snap (défaut: 8) — divisée par le zoom */
  threshold?: number;
  /** Activer le snap au centre du canvas (défaut: true) */
  snapToCenter?: boolean;
  /** Activer le snap aux bords du canvas (défaut: true) */
  snapToEdges?: boolean;
}

interface SnapGuide {
  orientation: "horizontal" | "vertical";
  position: number;
}

interface ResizeSnapState {
  snappedEdgeX: "left" | "right" | "center" | null;
  snappedEdgeY: "top" | "bottom" | "center" | null;
  lastPointerX: number;
  lastPointerY: number;
}

export interface ResizeSnapResult {
  /** Nouvelle largeur ajustée (ou null si pas de snap horizontal) */
  width: number | null;
  /** Nouvelle hauteur ajustée (ou null si pas de snap vertical) */
  height: number | null;
  /** Guides actifs à afficher */
  guides: SnapGuide[];
}

/**
 * Gère le snapping (aimantage) des objets sur le canvas.
 *
 * Déplacement : guides façon Figma/Canva (src/snap.ts) — les bords et centres de l'objet
 * s'aimantent sur ceux de la page et des autres objets, sans état (l'objet suit le pointeur
 * dès qu'il sort du seuil), un guide joint l'objet et sa cible.
 *
 * Redimensionnement d'une image (ImageFrame) : bords et centre de la page.
 */
export class SnappingManager {
  private canvas: DesignCanvas;
  private config: Required<SnappingConfig>;
  private guides: CanvasGuides;
  private enabled: boolean = true;
  /** Les guides actifs du déplacement en cours (préférés tant qu'ils restent dans le seuil) */
  private kept: SnapKeep = {};
  private resizeSnapState: ResizeSnapState | null = null;
  /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
  private exitMultiplier: number = 2;

  constructor(canvas: DesignCanvas, config: SnappingConfig = {}, guideColor?: string) {
    this.canvas = canvas;
    this.config = {
      threshold: config.threshold ?? 8,
      snapToCenter: config.snapToCenter ?? true,
      snapToEdges: config.snapToEdges ?? true,
    };
    this.guides = new CanvasGuides(canvas, guideColor);

    this.setupEventListeners();
  }

  /**
   * Active ou désactive le snapping
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.guides.clearAndRender();
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

  private readonly onMoving = (e: { target?: FabricObject }) => this.handleObjectMoving(e.target);
  private readonly onResizing = (e: { target?: FabricObject }) => this.handleObjectScaling(e.target);
  private readonly onSettled = () => {
    this.kept = {};
    this.guides.clearAndRender();
  };

  private setupEventListeners(): void {
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
  private handleObjectMoving(obj: FabricObject | undefined): void {
    if (!obj || !this.enabled) return;
    if (obj.get("layerId") === "originalImage") return;

    const moving = obj instanceof ActiveSelection ? obj.getObjects() : [obj];
    const objects = this.canvas.getObjects();
    if (!(obj instanceof ActiveSelection) && stackParentOf(obj, objects)) {
      this.guides.clearAndRender();
      return;
    }

    const excluded = new Set<FabricObject>([
      ...subtreeOf(objects, moving),
      ...moving.flatMap((member) => ancestorsOf(member, objects)),
    ]);
    const targets: SnapBox[] = objects
      .filter((other) => !excluded.has(other) && isSnapTarget(other))
      .map((other) => other.getBoundingRect());
    targets.push({ left: 0, top: 0, width: this.canvas.width, height: this.canvas.height });

    const zoom = this.canvas.getZoom() || 1;
    // fabric pose la position brute sans recalculer les coordonnées : mesurées en cache, elles
    // diraient la position aimantée du mouvement précédent — l'objet ne serait recalé
    // qu'une frame sur deux, et tremblerait autour du guide
    obj.setCoords();
    const { dx, dy, guides } = snapMove(obj.getBoundingRect(), targets, this.config.threshold / zoom, this.kept);
    this.kept = {
      x: guides.find((guide) => guide.axis === "x")?.at,
      y: guides.find((guide) => guide.axis === "y")?.at,
    };
    if (dx || dy) {
      obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
      obj.setCoords();
    }

    this.guides.showSnapGuides(guides, zoom);
    this.canvas.requestRenderAll();
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
  calculateResizeSnap(
    bounds: { left: number; top: number; right: number; bottom: number },
    changeX: -1 | 0 | 1,
    changeY: -1 | 0 | 1,
    pointer: { x: number; y: number }
  ): ResizeSnapResult {
    if (!this.enabled) {
      return { width: null, height: null, guides: [] };
    }

    const activeGuides: SnapGuide[] = [];
    const enterThreshold = this.config.threshold;
    const exitThreshold = this.config.threshold * this.exitMultiplier;

    // Initialiser l'état du resize snap si nécessaire
    if (!this.resizeSnapState) {
      this.resizeSnapState = {
        snappedEdgeX: null,
        snappedEdgeY: null,
        lastPointerX: pointer.x,
        lastPointerY: pointer.y,
      };
    }

    const pointerDeltaX = pointer.x - this.resizeSnapState.lastPointerX;
    const pointerDeltaY = pointer.y - this.resizeSnapState.lastPointerY;

    let snapWidth: number | null = null;
    let snapHeight: number | null = null;
    let newSnappedEdgeX: ResizeSnapState["snappedEdgeX"] = null;
    let newSnappedEdgeY: ResizeSnapState["snappedEdgeY"] = null;

    const currentWidth = bounds.right - bounds.left;
    const currentHeight = bounds.bottom - bounds.top;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    // === SNAP HORIZONTAL (bord qui bouge) ===
    if (changeX !== 0) {
      const movingEdgeX = changeX === 1 ? bounds.right : bounds.left;
      const fixedEdgeX = changeX === 1 ? bounds.left : bounds.right;

      // Snap au bord du canvas (droit ou gauche selon la direction)
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

      // Snap au centre horizontal du canvas
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

    // === SNAP VERTICAL (bord qui bouge) ===
    if (changeY !== 0) {
      const movingEdgeY = changeY === 1 ? bounds.bottom : bounds.top;
      const fixedEdgeY = changeY === 1 ? bounds.top : bounds.bottom;

      // Snap au bord du canvas (bas ou haut selon la direction)
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

      // Snap au centre vertical du canvas
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

    // Mettre à jour l'état du snap
    this.resizeSnapState.snappedEdgeX = newSnappedEdgeX;
    this.resizeSnapState.snappedEdgeY = newSnappedEdgeY;

    // Afficher les guides
    this.updateGuides(activeGuides);

    return {
      width: snapWidth,
      height: snapHeight,
      guides: activeGuides,
    };
  }

  /**
   * Réinitialise l'état du snap de resize (à appeler quand le resize est terminé)
   */
  resetResizeSnap(): void {
    this.resizeSnapState = null;
    this.guides.clearAndRender();
  }

  /**
   * Nettoie les ressources
   */
  dispose(): void {
    this.guides.clear();
    this.canvas.off("object:moving", this.onMoving);
    this.canvas.off("object:resizing", this.onResizing);
    this.canvas.off("object:modified", this.onSettled);
    this.canvas.off("selection:cleared", this.onSettled);
    this.canvas.off("mouse:up", this.onSettled);
  }
}

/** Une cible de l'aimant : un objet visible du document (ni guide, ni calque inerte comme
 *  le fond — la page est déjà une cible). */
function isSnapTarget(obj: FabricObject): boolean {
  return obj.visible !== false && !obj.excludeFromExport && obj.evented !== false;
}
