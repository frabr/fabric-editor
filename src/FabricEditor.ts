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
import type { EditorConfig, EditorState, LayerData, FontsConfig, ShapeType } from "./types";

/**
 * Calcule les dimensions du canvas en respectant une contrainte maximale
 */
function computeDimensions(
  width: number,
  height: number,
  constraint: number
): [number, number, number] {
  if (width > height) {
    const ratio = constraint / width;
    return [constraint, height * ratio, ratio];
  } else {
    const ratio = constraint / height;
    return [width * ratio, constraint, ratio];
  }
}

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

  private state: EditorState;
  private config: EditorConfig;

  constructor(canvasElement: HTMLCanvasElement, config: EditorConfig) {
    this.config = config;
    this.state = {
      ratio: 1,
      maxSize: config.standAlone ? 500 : 1000,
    };

    this.canvas = this.initCanvas(canvasElement);

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
  }

  /**
   * Le ratio de redimensionnement appliqué à l'image de fond
   */
  get ratio(): number {
    return this.state.ratio;
  }

  /**
   * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
   *
   * Le canvas Fabric a une taille "interne" (ex: 1000x800) utilisée pour les calculs,
   * mais il est affiché dans le container avec une taille CSS différente via zoom.
   * Cette méthode applique le ratio pour positionner des éléments HTML par-dessus le canvas.
   */
  canvasToDisplayCoords(rect: { left: number; top: number; width: number; height: number }): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const container = this.config.container;
    if (!container) {
      return rect;
    }

    const ratioX = container.clientWidth / this.canvas.width;
    const ratioY = container.clientHeight / this.canvas.height;

    return {
      left: rect.left * ratioX,
      top: rect.top * ratioY,
      width: rect.width * ratioX,
      height: rect.height * ratioY,
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
    const containerWidth = this.config.container?.clientWidth || this.canvas.width;
    const containerHeight = this.config.container?.clientHeight || this.canvas.height;
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
   * Initialise l'éditeur avec une image de fond et des calques optionnels
   */
  async initialize(
    backgroundImageUrl: string,
    layers: LayerData[] = []
  ): Promise<void> {
    // Charger l'image de fond
    await this.layers.loadBackgroundImage(backgroundImageUrl, this.state.ratio);

    // Charger les calques existants
    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }

    // Si mode standalone, centrer les objets
    if (this.config.standAlone) {
      this.centerAllObjects();
    }

    // Configurer le masque si présent
    if (this.config.container) {
      await this.masks.setup(this.config.container, this.state.maxSize);
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
    const newObj = switchShape(obj, nextShapeType);

    this.layers.add(newObj);
    this.canvas.remove(obj);
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
    const point = new Point(x, y);

    // Parcourir les objets du dessus vers le dessous
    const objects = this.canvas.getObjects().slice().reverse();

    for (const obj of objects) {
      // Ignorer l'image de fond
      if (obj.get("layerId") === "originalImage") continue;

      // Vérifier si c'est un ImageFrame (via layerType)
      const layerType = (obj as { layerType?: string }).layerType;
      if (layerType === "imageFrame" && obj.containsPoint(point)) {
        return obj as ImageFrame;
      }

      // Vérifier si c'est une image legacy
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
    this.snapping.dispose();
    this.selection.dispose();
    this.canvas.dispose();
  }

  /**
   * Initialise le canvas Fabric
   */
  private initCanvas(canvasElement: HTMLCanvasElement): Canvas {
    const [width, height, ratio] = computeDimensions(
      this.config.width,
      this.config.height,
      this.state.maxSize
    );

    this.state.ratio = ratio;

    return new Canvas(canvasElement, {
      width,
      height,
      preserveObjectStacking: true,
    });
  }

  /**
   * Centre tous les objets sur le canvas (mode standalone)
   */
  private centerAllObjects(): void {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    this.canvas.forEachObject((obj) => {
      const bound = obj.getBoundingRect();
      minX = Math.min(minX, bound.left);
      minY = Math.min(minY, bound.top);
      maxX = Math.max(maxX, bound.left + bound.width);
      maxY = Math.max(maxY, bound.top + bound.height);
    });

    const groupCenterX = (minX + maxX) / 2;
    const groupCenterY = (minY + maxY) / 2;
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    const deltaX = canvasCenterX - groupCenterX;
    const deltaY = canvasCenterY - groupCenterY;

    this.canvas.forEachObject((obj) => {
      obj.set({
        left: obj.left + deltaX,
        top: obj.top + deltaY,
      });
      obj.setCoords();
    });

    this.canvas.renderAll();
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
