import {
  FabricImage,
  FabricObject,
  Group,
  Rect,
  Path,
  Circle,
  util,
} from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CustomTextbox } from "./controls/CustomTextbox";
import { migrateLegacyLayout } from "./layout/legacy";
import { bringBlockForward, sendBlockBackward } from "./layout/stacking";
import { kindOf } from "./capabilities";
import type { LayoutData } from "./layout/types";
import { createShape as createShapeObject, createPathsShape, createImage } from "./shapes/factories";
import { FabRect } from "./shapes/FabRect";
import { FabCircle } from "./shapes/FabCircle";
import { FabPath } from "./shapes/FabPath";
import { isValidShape } from "./shapes";
import type { ClipData } from "./shapes/registry";
import { scaledSize } from "./layout/geometry";
import { applyLockMode, getLockMode, type LockMode } from "./locking";
import { ImageFrame, type ImageFrameData } from "./ImageFrame";
import type { LayerData, TextLayerOptions, ImageLayerOptions, ShapeLayerOptions, ShapeType } from "./types";
import { restoreBindings } from "./bindings";

const BACKGROUND_LAYER_ID = "originalImage";

/**
 * Gère les calques (layers) du canvas Fabric.js
 * Responsable de l'ajout, suppression et organisation des objets
 */
export class LayerManager {
  constructor(private canvas: DesignCanvas) { }

  /**
   * Retourne tous les calques (excluant l'image de fond)
   */
  get all(): FabricObject[] {
    return this.canvas
      .getObjects()
      .filter((obj) => obj.get("layerId") !== BACKGROUND_LAYER_ID);
  }

  /**
   * Retourne l'image de fond
   */
  get background(): FabricObject | undefined {
    return this.canvas
      .getObjects()
      .find((obj) => obj.get("layerId") === BACKGROUND_LAYER_ID);
  }

  /**
   * Trouve un calque par son ID
   */
  findById(layerId: string): FabricObject | undefined {
    return this.canvas.getObjects().find((obj) => obj.get("layerId") === layerId);
  }

  /**
   * Charge l'image de fond
   */
  async loadBackgroundImage(url: string): Promise<FabricImage> {
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    // Scale image to fill the canvas (cover)
    const scaleX = this.canvas.width / img.width;
    const scaleY = this.canvas.height / img.height;
    const scale = Math.max(scaleX, scaleY);
    img.set({
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
      left: this.canvas.width / 2,
      top: this.canvas.height / 2,
      selectable: false,
      evented: false,
      layerId: BACKGROUND_LAYER_ID,
    });
    this.canvas.add(img);
    return img;
  }

  /**
   * Désérialise plusieurs calques sans les ajouter au canvas — la moitié asynchrone
   * (chargement d'images compris) du chargement, pour que l'appelant puisse faire le swap
   * ancien/nouveau contenu de façon synchrone (anti-flicker).
   */
  async deserializeAll(layers: LayerData[]): Promise<(FabricObject | null)[]> {
    const objects = await Promise.all(layers.map((l) => this.deserialize(l)));
    objects.forEach((obj, i) => {
      if (!obj) return;
      // Restaurer selectable/evented depuis le JSON (non gérés par fromObject). Un FOND
      // (layerId "bg") est inerte PAR CONVENTION — répare aussi les docs sauvés pendant que
      // ImageFrame#toObject perdait ces flags.
      const data = layers[i];
      const isBackground = (data as any).layerId === "bg";
      if (isBackground || (data as any).selectable === false) obj.selectable = false;
      if (isBackground || (data as any).evented === false) obj.evented = false;
      restoreBindings(obj, data);
    });
    return objects;
  }

  /**
   * Charge plusieurs calques depuis leurs données JSON
   */
  async loadLayers(layers: LayerData[]): Promise<FabricObject[]> {
    const objects = await this.deserializeAll(layers);
    objects.forEach((obj) => obj && this.add(obj));
    return objects.filter(Boolean) as FabricObject[];
  }

  /**
   * Ajoute un objet au canvas et le sélectionne (si interactif)
   */
  add(obj: FabricObject): FabricObject {
    this.canvas.add(obj);
    // setActiveObject n'existe que sur Canvas interactif (pas StaticCanvas)
    // Ne pas auto-sélectionner les objets non-sélectionnables (ex: fond)
    if (obj.selectable !== false && typeof this.canvas.setActiveObject === "function") {
      this.canvas.setActiveObject(obj);
    }
    return obj;
  }

  /**
   * Supprime un objet du canvas
   */
  remove(obj: FabricObject): void {
    this.canvas.remove(obj);
  }

  /**
   * Supprime plusieurs objets
   */
  removeMany(objects: FabricObject[]): void {
    objects.forEach((obj) => this.canvas.remove(obj));
  }

  /**
   * Monte l'objet devant le premier objet de même niveau qui le chevauche. Un
   * container emmène ses descendants (toujours au-dessus de lui) ; un enfant reste
   * parmi les enfants de son container.
   */
  bringForward(obj: FabricObject): void {
    const order = bringBlockForward(this.canvas.getObjects(), obj, (a, b) => a.isOverlapping(b));
    if (order) this.applyStackOrder(order);
  }

  /**
   * Descend l'objet d'un niveau, mêmes règles de blocs que bringForward. Ne peut pas
   * descendre en dessous de l'image de fond.
   */
  sendBackward(obj: FabricObject): void {
    const order = sendBlockBackward(this.canvas.getObjects(), obj);
    if (order) this.applyStackOrder(order);
  }

  private applyStackOrder(order: FabricObject[]): void {
    order.forEach((obj, index) => this.canvas.moveObjectTo(obj, index));
    this.canvas.renderAll();
  }

  /**
   * Crée et ajoute un calque texte
   */
  /**
   * Crée un calque texte sans l'ajouter au canvas.
   * Source unique des défauts texte — utilisé par addText et par le
   * drag externe (DropHandler).
   */
  createText(options: TextLayerOptions = {}): CustomTextbox {
    const {
      text = "Tapez votre texte ici",
      left = 100,
      top = 100,
      fontFamily = "Inter",
      fontSize = 32,
      fontWeight = "normal",
      fill = "#000000",
      layerId = this.generateId(),
    } = options;

    const textObj = new CustomTextbox(text, {
      left,
      top,
      fontFamily,
      fontSize,
      fontWeight,
      fill,
    });
    textObj.set("layerId" as keyof typeof textObj, layerId);
    return textObj;
  }

  addText(options: TextLayerOptions = {}): CustomTextbox {
    const textObj = this.createText(options);
    this.add(textObj);
    return textObj;
  }

  /**
   * Crée et ajoute un calque image dans un ImageFrame
   */
  async addImage(url: string, options: ImageLayerOptions = {}): Promise<ImageFrame> {
    const { left = 100, top = 100, layerId = this.generateId() } = options;

    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });

    // Calculer le scale pour limiter à 300px max
    // Ce scale sera appliqué au frame, pas à l'image
    let frameScale = 1;
    if (img.width > 300 || img.height > 300) {
      frameScale = Math.min(300 / img.width, 300 / img.height);
    }

    const frame = new ImageFrame(img, { left, top, layerId, frameScale });
    this.add(frame);
    return frame;
  }

  /**
   * Crée et ajoute une image simple (legacy, sans frame)
   * Utilisé pour le background ou cas spéciaux
   */
  async addImageLegacy(url: string, options: ImageLayerOptions = {}): Promise<FabricImage> {
    const { left = 100, top = 100, originX, originY, layerId = this.generateId() } = options;

    const img = await createImage(url, { left, top, originX, originY, layerId });
    this.add(img);
    return img;
  }

  /**
   * Remplace la source d'une image existante en conservant toutes ses propriétés
   * Supporte à la fois ImageFrame et FabricImage legacy
   *
   * @param options.opacity - Opacité à appliquer (utile si target.opacity est temporairement modifiée)
   */
  async replaceImageSource(
    target: ImageFrame | FabricImage,
    newUrl: string,
    options?: { opacity?: number }
  ): Promise<ImageFrame | FabricImage> {
    // Une forme-image : déléguer à sa méthode
    if (kindOf(target as FabricObject) === "imageShape") {
      const frame = target as ImageFrame;
      const newImg = await FabricImage.fromURL(newUrl, { crossOrigin: "anonymous" });
      await frame.replaceImage(newImg);

      if (options?.opacity !== undefined) {
        frame.opacity = options.opacity;
      }

      this.canvas.setActiveObject(frame);
      this.canvas.renderAll();
      return frame;
    }

    // Fallback pour les images legacy (FabricImage directe)
    return this._replaceImageSourceLegacy(target as FabricImage, newUrl, options);
  }

  /**
   * Remplace la source d'une image legacy (FabricImage sans frame)
   * @internal
   */
  private async _replaceImageSourceLegacy(
    target: FabricImage,
    newUrl: string,
    options?: { opacity?: number }
  ): Promise<FabricImage> {
    // Sauvegarder le centre visuel de l'ancienne image
    const oldCenter = target.getCenterPoint();

    // Sauvegarder les propriétés de l'image actuelle (sauf position, recalculée après)
    // L'opacité peut être override via options (si target.opacity est temporairement modifiée)
    const props = {
      angle: target.angle,
      flipX: target.flipX,
      flipY: target.flipY,
      opacity: options?.opacity ?? target.opacity,
      layerId: target.get("layerId"),
      layerType: target.get("layerType"),
    };

    // Sauvegarder le mode de verrouillage pour le réappliquer après
    const lockMode = getLockMode(target);

    // Charger la nouvelle image
    const newImg = await FabricImage.fromURL(newUrl, { crossOrigin: "anonymous" });

    // Calculer le scale en mode "cover" : la plus petite dimension à 100%
    // L'image garde ses proportions et remplit le cadre (peut dépasser)
    const oldWidth = target.width * target.scaleX;
    const oldHeight = target.height * target.scaleY;
    const coverScale = Math.max(oldWidth / newImg.width, oldHeight / newImg.height);

    // Ajuster le clipPath pour compenser le changement de scale
    // Le clipPath doit rester visuellement identique
    let adjustedClipPath = target.clipPath;
    if (target.clipPath) {
      // Cloner le clipPath pour ne pas modifier l'original
      adjustedClipPath = await target.clipPath.clone();
      // Facteur de correction : ancien scale / nouveau scale
      const clipScaleX = (adjustedClipPath.scaleX || 1) * (target.scaleX / coverScale);
      const clipScaleY = (adjustedClipPath.scaleY || 1) * (target.scaleY / coverScale);
      adjustedClipPath.set({ scaleX: clipScaleX, scaleY: clipScaleY });
    }

    // Appliquer les propriétés sauvegardées avec le scale uniforme
    // Utiliser origin "center" pour positionner par le centre
    newImg.set({
      ...props,
      scaleX: coverScale,
      scaleY: coverScale,
      clipPath: adjustedClipPath,
      originX: "center",
      originY: "center",
      left: oldCenter.x,
      top: oldCenter.y,
    });

    // Remplacer l'ancienne image par la nouvelle
    const index = this.canvas.getObjects().indexOf(target);
    this.canvas.remove(target);
    this.canvas.add(newImg);

    // Restaurer la position dans la pile des calques
    if (index >= 0 && index < this.canvas.getObjects().length) {
      this.canvas.moveObjectTo(newImg, index);
    }

    // Réappliquer le mode de verrouillage AVANT setActiveObject
    // pour que le callback onSelect lise le bon mode et mette à jour l'icône
    if (lockMode !== "free") {
      applyLockMode(newImg, lockMode);
    }

    this.canvas.setActiveObject(newImg);
    this.canvas.renderAll();

    return newImg;
  }

  /**
   * Remplace une forme (shape) par un ImageFrame contenant l'image donnée.
   * La forme sert de masque : l'image épouse ses dimensions et son clipShape.
   * L'ImageFrame est inséré au même z-index que la forme d'origine.
   */
  async replaceShapeWithImage(
    shape: FabricObject,
    imageUrl: string
  ): Promise<ImageFrame> {
    const { clipShape, clipData, cornerRadius } = clipOfShape(shape);

    // Récupérer les dimensions affichées (scaled)
    const { w: displayedWidth, h: displayedHeight } = scaledSize(shape);
    const center = shape.getRelativeCenterPoint();

    // Sauvegarder le z-index
    const zIndex = this.canvas.getObjects().indexOf(shape);

    // Charger l'image
    const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });

    // Créer l'ImageFrame aux dimensions de la shape
    const frame = new ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: shape.angle,
      layerId: (shape as { layerId?: string }).layerId || this.generateId(),
      clipShape,
      clipData,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight,
      cornerRadius,
    });

    // La forme-image reprend la place de la forme : son layout (container, enfant), son
    // verrouillage et ses bindings — sinon ses enfants restent orphelins, ou elle sort
    // de son container.
    const layout = shape.get("layout") as LayoutData | undefined;
    if (layout) frame.set("layout", JSON.parse(JSON.stringify(layout)));
    const lockMode = getLockMode(shape);
    if (lockMode !== "free") applyLockMode(frame, lockMode);
    const bindings = shape.get("bindings");
    if (bindings) frame.set("bindings", bindings);

    // Supprimer la shape et insérer l'ImageFrame au même z-index (sous ses enfants)
    this.canvas.remove(shape);
    this.canvas.add(frame);
    if (zIndex >= 0 && zIndex < this.canvas.getObjects().length) {
      this.canvas.moveObjectTo(frame, zIndex);
    }

    this.canvas.setActiveObject(frame);
    this.canvas.renderAll();

    return frame;
  }

  /**
   * Crée et ajoute un calque forme (rectangle par défaut)
   */
  /**
   * Crée un calque forme sans l'ajouter au canvas.
   * Source unique des défauts forme — utilisé par addShape et par le
   * drag externe (DropHandler).
   */
  createShape(options: ShapeLayerOptions = {}): FabricObject {
    const {
      left = 100,
      top = 100,
      fill = "#ffffff",
      stroke,
      shapeType = "rect",
      layerId = this.generateId(),
    } = options;

    // Des paths inline (payload toolbox) priment sur l'id : l'asset est déjà du
    // contenu, aucune résolution de catalogue. fill = défaut générique, les fills
    // d'auteur des paths gagnent (cf. FabPath.fromPathData).
    const common = { fill, stroke, left, top, width: options.width, height: options.height };
    const shape = options.paths?.length
      ? createPathsShape(options.paths, { id: shapeType, ...common })
      : createShapeObject(shapeType, common);
    shape.set({ layerId, layerType: "shape" });
    return shape;
  }

  addShape(options: ShapeLayerOptions = {}): FabricObject {
    const shape = this.createShape(options);
    this.add(shape);
    return shape;
  }

  /**
   * Groupe plusieurs objets ensemble
   */
  groupObjects(objects: FabricObject[]): Group {
    const group = new Group(objects);

    objects.forEach((obj) => this.canvas.remove(obj));

    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.canvas.requestRenderAll();

    return group;
  }

  /**
   * Sérialise tous les calques en JSON
   * Inclut les propriétés custom : layerId, lockMode, lockContent
   */
  serialize(): LayerData[] {
    return this.all.map((obj) => obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"]) as LayerData);
  }

  /**
   * Désérialise un calque depuis ses données JSON
   * Les images legacy (type "Image") sont automatiquement migrées vers ImageFrame
   */
  async deserialize(layer: LayerData): Promise<FabricObject | null> {
    let obj: FabricObject | null = null;

    switch (layer.type) {
      case "IText":
      case "i-text":
      case "Textbox":
      case "textbox": {
        const text = await CustomTextbox.fromObject(layer);
        text.charSpacing = text.charSpacing || 1;
        obj = text;
        break;
      }

      case "ImageFrame":
      case "imageFrame": {
        // Nouveau format ImageFrame
        obj = await ImageFrame.fromObject(layer as unknown as ImageFrameData);
        break;
      }

      case "Image":
      case "image": {
        // Migration automatique des images legacy vers ImageFrame
        const img = await FabricImage.fromObject({
          ...layer,
          crossOrigin: "anonymous",
        });

        // Détecter le clipShape depuis le clipPath legacy
        const clipShape = this.detectLegacyClipShape(layer.clipPath);

        // Créer un ImageFrame avec les propriétés de l'image
        obj = ImageFrame.fromLegacyImage(img, {
          clipShape,
          layerId: layer.layerId,
          lockMode: layer.lockMode as LockMode | undefined,
        });
        break;
      }

      case "Group":
      case "group":
        obj = await Group.fromObject(layer);
        break;

      case "Rect":
      case "rect":
        obj = (await FabRect.fromObject(layer)) as unknown as FabricObject;
        break;

      case "Path":
      case "path":
        // FabPath constructor installs the resize handler automatically
        obj = (await FabPath.fromObject(layer)) as unknown as FabricObject;
        break;

      case "Circle":
      case "circle":
        obj = (await FabCircle.fromObject(layer)) as unknown as FabricObject;
        break;

      default:
        console.warn(`Type de calque inconnu: ${layer.type}`);
        return null;
    }

    // Données de layout d'avant layout.sizing
    const migrated = obj && migrateLegacyLayout(obj.get("layout") as LayoutData | undefined);
    if (obj && migrated) obj.set("layout", migrated);

    // Appliquer les propriétés de verrouillage si présentes
    if (obj && layer.lockMode) {
      const mode = layer.lockMode as LockMode;
      if ("applyLockMode" in obj && typeof (obj as any).applyLockMode === "function") {
        (obj as any).applyLockMode(mode);
      } else {
        applyLockMode(obj, mode);
      }
    }

    return obj;
  }

  /**
   * Applique un mode de verrouillage à un objet
   * Délègue à la fonction du module locking.ts
   */
  applyLockMode(obj: FabricObject, mode: LockMode): void {
    applyLockMode(obj, mode);
  }

  /**
   * Génère un ID unique pour un calque
   */
  private generateId(): string {
    return `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Détecte le type de clip depuis un clipPath legacy sérialisé
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detectLegacyClipShape(clipPath: any): ShapeType | undefined {
    if (!clipPath) return undefined;

    // 1. Priorité à l'ID custom si présent
    if (clipPath.id && isValidShape(clipPath.id)) {
      return clipPath.id as ShapeType;
    }

    // 2. Déduire du type Fabric.js
    const type = clipPath.type?.toLowerCase();

    if (type === "circle") {
      return "circle";
    }

    if (type === "rect") {
      return "rect";
    }

    if (type === "path") {
      return this.detectClipPath(clipPath as Path);
    }

    return undefined;
  }

  /* Pour détecter les anciens clippath (dans les signatures notamment)*/
  private detectClipPath(clipPath: Path): "heart" | "hexagon" {
    if (clipPath.type.toLowerCase() !== "path") {
      return "heart"; // fallback
    }

    const path = clipPath.path;
    if (!Array.isArray(path)) {
      return "heart";
    }

    let count = {
      M: 0,
      L: 0,
      C: 0,
      Q: 0,
      Z: 0
    };

    for (const cmd of path) {
      const type = cmd[0];
      if (type in count) {
        count[type]++;
      }
    }

    if (
      count.Q === 0 &&
      count.L === 6 &&
      count.C === 6 &&
      count.M === 1 &&
      count.Z === 1
    ) {
      return "hexagon";
    }

    // Fallback sécurisé
    return "heart";
  }
}

/**
 * La découpe de la forme-image, prise sur la géométrie de la forme elle-même — pas
 * sur son id dans le catalogue, qui peut ne pas y être (paths insérés en ligne, forme
 * de groupe absente du registre de cet éditeur) et donnait un rectangle.
 * Un groupe de paths (plusieurs régions) n'a pas de découpe unique : rectangle.
 */
function clipOfShape(shape: FabricObject): { clipShape: ShapeType; clipData?: ClipData; cornerRadius: number } {
  if (shape instanceof FabRect) return { clipShape: "rect", cornerRadius: shape.getCornerRadius() };
  if (shape instanceof FabCircle) return { clipShape: "circle", cornerRadius: 0 };
  if (shape instanceof FabPath) {
    const id = (shape as { id?: string }).id;
    const clipData: ClipData = { d: util.joinPath(shape.path), width: shape.width, height: shape.height };
    return { clipShape: id && isValidShape(id) ? id : (id || "custom"), clipData, cornerRadius: 0 };
  }
  return { clipShape: "rect", cornerRadius: 0 };
}
