import {
  Canvas,
  FabricImage,
  FabricObject,
  Group,
  Rect,
  Path,
  Circle,
} from "fabric";
import { CustomTextbox } from "./controls/CustomTextbox";
import { createRect, createImage } from "./shapes/factories";
import { applyLockMode, getLockMode, type LockMode } from "./locking";
import { ImageFrame, type ImageFrameData } from "./ImageFrame";
import type { LayerData, TextLayerOptions, ImageLayerOptions, ShapeLayerOptions, ShapeType } from "./types";

const BACKGROUND_LAYER_ID = "originalImage";

/**
 * Gère les calques (layers) du canvas Fabric.js
 * Responsable de l'ajout, suppression et organisation des objets
 */
export class LayerManager {
  constructor(private canvas: Canvas) { }

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
  async loadBackgroundImage(url: string, ratio: number): Promise<FabricImage> {
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    img.set({
      originX: "center",
      originY: "center",
      scaleX: ratio,
      scaleY: ratio,
      left: this.canvas.width / 2,
      top: this.canvas.height / 2,
      selectable: false,
      layerId: BACKGROUND_LAYER_ID,
    });
    this.canvas.add(img);
    return img;
  }

  /**
   * Charge plusieurs calques depuis leurs données JSON
   */
  async loadLayers(layers: LayerData[]): Promise<FabricObject[]> {
    const objects = await Promise.all(layers.map((l) => this.deserialize(l)));
    objects.forEach((obj) => {
      if (obj) this.add(obj);
    });
    return objects.filter(Boolean) as FabricObject[];
  }

  /**
   * Ajoute un objet au canvas et le sélectionne
   */
  add(obj: FabricObject): FabricObject {
    this.canvas.add(obj);
    this.canvas.setActiveObject(obj);
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
   * Monte l'objet d'un niveau (vers l'avant)
   */
  bringForward(obj: FabricObject): void {
    this.canvas.bringObjectForward(obj, true);
    this.canvas.renderAll();
  }

  /**
   * Descend l'objet d'un niveau (vers l'arrière)
   * Ne peut pas descendre en dessous de l'image de fond
   */
  sendBackward(obj: FabricObject): void {
    const index = this.canvas._objects.indexOf(obj);
    if (index > 1) {
      this.canvas.sendObjectBackwards(obj);
      this.canvas.renderAll();
    }
  }

  /**
   * Crée et ajoute un calque texte
   */
  addText(options: TextLayerOptions = {}): CustomTextbox {
    const {
      text = "Tapez votre texte ici",
      left = 100,
      top = 100,
      fontFamily = "InterRegular",
      fontSize = 32,
      fill = "#000000",
      layerId = this.generateId(),
    } = options;

    const textObj = new CustomTextbox(text, {
      left,
      top,
      fontFamily,
      fontSize,
      fill,
    });
    textObj.set("layerId" as keyof typeof textObj, layerId);

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
    // Si c'est un ImageFrame, déléguer à sa méthode (vérifier via layerType)
    const layerType = (target as { layerType?: string }).layerType;
    if (layerType === "imageFrame" || target instanceof ImageFrame) {
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
    const index = this.canvas._objects.indexOf(target);
    this.canvas.remove(target);
    this.canvas.add(newImg);

    // Restaurer la position dans la pile des calques
    if (index >= 0 && index < this.canvas._objects.length) {
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
   * Crée et ajoute un calque forme (rectangle par défaut)
   */
  addShape(options: ShapeLayerOptions = {}): Rect {
    const {
      left = 100,
      top = 100,
      width = 300,
      height = 300,
      fill = "#ffffff",
      layerId = this.generateId(),
    } = options;

    const rect = createRect({
      left,
      top,
      width,
      height,
      fill,
      layerId,
      layerType: "shape",
    });

    this.add(rect);
    return rect;
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
    return this.all.map((obj) => obj.toObject(["layerId", "lockMode", "lockContent"]) as LayerData);
  }

  /**
   * Désérialise un calque depuis ses données JSON
   * Les images legacy (type "Image") sont automatiquement migrées vers ImageFrame
   */
  private async deserialize(layer: LayerData): Promise<FabricObject | null> {
    let obj: FabricObject | null = null;

    switch (layer.type) {
      case "IText":
      case "i-text": {
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
        obj = (await Rect.fromObject(layer)) as unknown as FabricObject;
        break;

      case "Path":
      case "path":
        obj = (await Path.fromObject(layer)) as unknown as FabricObject;
        break;

      case "Circle":
      case "circle":
        obj = (await Circle.fromObject(layer)) as unknown as FabricObject;
        break;

      default:
        console.warn(`Type de calque inconnu: ${layer.type}`);
        return null;
    }

    // Appliquer les propriétés de verrouillage si présentes
    if (obj && layer.lockMode) {
      applyLockMode(obj, layer.lockMode as LockMode);
    }

    console.log(obj)
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
    if (clipPath.id && ["rounded", "circle", "heart", "hexagon"].includes(clipPath.id)) {
      return clipPath.id as ShapeType;
    }

    // 2. Déduire du type Fabric.js
    const type = clipPath.type?.toLowerCase();

    if (type === "circle") {
      return "circle";
    }

    if (type === "rect") {
      // Rect avec rx/ry = rounded, sinon rect simple (pas de clip spécial)
      if (clipPath.rx || clipPath.ry) {
        return "rounded";
      }
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

