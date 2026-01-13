import {
  Group,
  Rect,
  FabricImage,
  classRegistry,
  type TPointerEvent,
  type Transform,
  type Canvas,
  LayoutManager,
  FixedLayout,
} from "fabric";
import type { ShapeType, LockMode } from "./types";
import {
  createCircle,
  createHeart,
  createHexagon,
  createRoundedRect,
} from "./shapes/factories";
import type { SnappingManager } from "./SnappingManager";

/** Interface pour accéder au SnappingManager depuis le canvas */
interface CanvasWithSnapping extends Canvas {
  snappingManager?: SnappingManager;
}

export interface ImageFrameOptions {
  left?: number;
  top?: number;
  angle?: number;
  layerId?: string;
  lockMode?: LockMode;
  clipShape?: ShapeType;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  /** Scale initial du frame (pour limiter la taille à l'import) */
  frameScale?: number;
  /** Dimensions explicites du frame (prioritaires sur frameScale) */
  frameWidth?: number;
  frameHeight?: number;
}

export interface ImageFrameData {
  type: "ImageFrame";
  left: number;
  top: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  frameWidth: number;
  frameHeight: number;
  clipShape?: ShapeType;
  layerId?: string;
  lockMode?: LockMode;
  lockContent?: boolean;
  opacity?: number;
  image: {
    src: string;
    offsetX: number;
    offsetY: number;
    scale: number;
  };
}

/** Interface pour stocker l'état des transformations de resize */
interface TransformState extends Transform {
  _startWidth?: number;
  _startHeight?: number;
  _startPointerX?: number;
  _startPointerY?: number;
  _startLeft?: number;
  _startTop?: number;
}

/**
 * Applique une rotation inverse pour convertir des coordonnées écran en coordonnées locales
 */
function rotatePoint(dx: number, dy: number, angleDeg: number): { x: number; y: number } {
  const angle = (-angleDeg * Math.PI) / 180;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

/**
 * ImageFrame - Un conteneur pour images avec cadre fixe
 *
 * L'image est toujours contenue dans un cadre (frame) de dimensions fixes.
 * Lors du remplacement d'image, le cadre garde ses dimensions et la nouvelle image
 * s'adapte en mode "cover". Le clipPath s'applique sur le Group entier.
 */
// @ts-expect-error - Fabric.js class extension has incompatible static types
export class ImageFrame extends Group {
  frameWidth: number;
  frameHeight: number;
  clipShape?: ShapeType;

  private _imageOffsetX: number = 0;
  private _imageOffsetY: number = 0;
  private _imageScale: number = 1;
  private _image: FabricImage;

  constructor(image: FabricImage, options: ImageFrameOptions = {}) {
    // Dimensions du frame : explicites > calculées via frameScale
    const frameScale = options.frameScale ?? 1;
    const frameWidth = options.frameWidth ?? image.width * frameScale;
    const frameHeight = options.frameHeight ?? image.height * frameScale;

    // L'image est scalée pour couvrir le frame (mode cover)
    const coverScale = Math.max(frameWidth / image.width, frameHeight / image.height);
    image.set({
      scaleX: coverScale,
      scaleY: coverScale,
      originX: "center",
      originY: "center",
      clipPath: null, // enlever tout clipPath existant
      left: 0,
      top: 0,
    });

    // Le groupe a des dimensions fixes grâce à FixedLayout
    super([image], {
      originX: "center",
      originY: "center",
      left: options.left ?? 100,
      top: options.top ?? 100,
      angle: options.angle ?? 0,
      scaleX: 1,
      scaleY: 1,
      width: frameWidth,
      height: frameHeight,
      subTargetCheck: false,
      interactive: false,
      layoutManager: new LayoutManager(new FixedLayout()),
      // Désactiver le cache pour que le clipPath soit redessiné à chaque frame
      objectCaching: false,
    });

    this._image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this._imageOffsetX = options.imageOffsetX ?? 0;
    this._imageOffsetY = options.imageOffsetY ?? 0;
    this._imageScale = options.imageScale ?? 1;

    if (options.layerId) {
      this.set("layerId", options.layerId);
    }
    this.set("layerType", "imageFrame");

    // Clip par défaut + forme personnalisée si demandée
    this._applyClip(options.clipShape || "rect");

    this._setupControls();
    this._setupScaleAbsorption();
    this._applyImageOffset();
  }

  get image(): FabricImage {
    return this._image;
  }

  get imageSrc(): string {
    return this._image.getSrc() || "";
  }

  get imageOffsetX(): number {
    return this._imageOffsetX;
  }

  get imageOffsetY(): number {
    return this._imageOffsetY;
  }

  /**
   * Vérifie si l'image peut être repositionnée dans le cadre.
   * Retourne true si l'image déborde du cadre (avec une marge de tolérance).
   * @param tolerancePercent - Marge de tolérance en pourcentage (défaut: 5%)
   */
  canRepositionImage(tolerancePercent: number = 5): boolean {
    const imgWidth = this._image.width * this._image.scaleX;
    const imgHeight = this._image.height * this._image.scaleY;

    // Calcul de la marge de tolérance basée sur la taille du frame
    const toleranceX = this.frameWidth * (tolerancePercent / 100);
    const toleranceY = this.frameHeight * (tolerancePercent / 100);

    // L'image peut être repositionnée si elle dépasse le cadre (moins la tolérance)
    const canMoveX = imgWidth > this.frameWidth + toleranceX;
    const canMoveY = imgHeight > this.frameHeight + toleranceY;

    return canMoveX || canMoveY;
  }

  /**
   * Repositionne l'image dans le frame (pan)
   */
  setImageOffset(offsetX: number, offsetY: number): void {
    const clamped = this._clampOffset(offsetX, offsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();
    this.dirty = true;
  }

  /**
   * Change le zoom de l'image (min = cover)
   */
  setImageScale(scale: number): void {
    const coverScale = Math.max(this.frameWidth / this._image.width, this.frameHeight / this._image.height);
    this._imageScale = Math.max(1, scale);

    this._image.set({
      scaleX: coverScale * this._imageScale,
      scaleY: coverScale * this._imageScale,
    });

    // Re-clamp l'offset avec le nouveau scale
    const clamped = this._clampOffset(this._imageOffsetX, this._imageOffsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();
    this.dirty = true;
  }

  /**
   * Remplace l'image du frame en mode cover
   */
  replaceImage(newImage: FabricImage): void {
    const savedClipShape = this.clipShape || "rect";
    const coverScale = Math.max(this.frameWidth / newImage.width, this.frameHeight / newImage.height);

    newImage.set({
      scaleX: coverScale,
      scaleY: coverScale,
      originX: "center",
      originY: "center",
      left: 0,
      top: 0,
    });

    // Remplacer directement dans _objects pour éviter les effets de bord du LayoutManager
    const index = this._objects.indexOf(this._image);
    this._image.group = undefined;
    if (index !== -1) {
      this._objects.splice(index, 1, newImage);
    } else {
      this._objects[0] = newImage;
    }
    newImage.group = this;
    this._image = newImage;

    this.width = this.frameWidth;
    this.height = this.frameHeight;
    this._applyClip(savedClipShape);
    this.setCoords();

    this._imageOffsetX = 0;
    this._imageOffsetY = 0;
    this._imageScale = 1;

    this.dirty = true;
    this.canvas?.requestRenderAll();
  }

  /**
   * Redimensionne le frame (l'image s'adapte en cover)
   */
  resizeFrame(newWidth: number, newHeight: number): void {
    const coverScale = Math.max(newWidth / this._image.width, newHeight / this._image.height);

    this.frameWidth = newWidth;
    this.frameHeight = newHeight;
    this.width = newWidth;
    this.height = newHeight;

    this._image.set({
      scaleX: coverScale * this._imageScale,
      scaleY: coverScale * this._imageScale,
    });

    const clamped = this._clampOffset(this._imageOffsetX, this._imageOffsetY);
    this._imageOffsetX = clamped.x;
    this._imageOffsetY = clamped.y;
    this._applyImageOffset();

    this._applyClip(this.clipShape || "rect");
    if (this.clipPath) {
      this.clipPath.setCoords();
      this.clipPath.dirty = true;
    }
    this.setCoords();
    this.dirty = true;
  }

  /**
   * Applique une forme de clip au frame
   */
  applyClipShape(shapeType: ShapeType): void {
    this._applyClip(shapeType);
    this.dirty = true;
  }

  /**
   * Cycle vers la forme de clip suivante
   */
  nextClipShape(): void {
    const shapes: ShapeType[] = ["rect", "rounded", "circle", "heart", "hexagon"];
    const currentIndex = this.clipShape ? shapes.indexOf(this.clipShape) : -1;
    this.applyClipShape(shapes[(currentIndex + 1) % shapes.length]);
  }

  // ─────────────────────────────────────────────────────────────
  // Méthodes privées
  // ─────────────────────────────────────────────────────────────

  private _applyImageOffset(): void {
    this._image.set({ left: this._imageOffsetX, top: this._imageOffsetY });
  }

  private _clampOffset(offsetX: number, offsetY: number): { x: number; y: number } {
    const imgWidth = this._image.width * this._image.scaleX;
    const imgHeight = this._image.height * this._image.scaleY;
    const maxOffsetX = Math.max(0, (imgWidth - this.frameWidth) / 2);
    const maxOffsetY = Math.max(0, (imgHeight - this.frameHeight) / 2);

    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY)),
    };
  }

  private _applyClip(shapeType: ShapeType): void {
    this.clipShape = shapeType;
    const minSize = Math.min(this.frameWidth, this.frameHeight);

    switch (shapeType) {
      case "rect":
        this.clipPath = new Rect({
          width: this.frameWidth,
          height: this.frameHeight,
          originX: "center",
          originY: "center",
          left: 0,
          top: 0,
        });
        break;
      case "circle":
        this.clipPath = createCircle({ radius: minSize / 2 });
        break;
      case "rounded":
        this.clipPath = createRoundedRect({
          width: this.frameWidth,
          height: this.frameHeight,
          rx: minSize * 0.15,
          ry: minSize * 0.15,
        });
        break;
      case "heart":
        this.clipPath = createHeart({
          scaleX: minSize / 28,
          scaleY: minSize / 28,
        });
        break;
      case "hexagon":
        this.clipPath = createHexagon({
          scaleX: minSize / 48,
          scaleY: minSize / 48,
        });
        break;
    }
  }

  /**
   * Fallback : absorbe le scale si les contrôles natifs sont utilisés
   */
  private _setupScaleAbsorption(): void {
    this.on("modified", () => {
      // Réinitialiser le snap state de resize
      const canvas = this.canvas as CanvasWithSnapping | undefined;
      if (canvas?.snappingManager) {
        canvas.snappingManager.resetResizeSnap();
      }

      if (Math.abs(this.scaleX - 1) < 0.001 && Math.abs(this.scaleY - 1) < 0.001) {
        return;
      }
      const newWidth = this.frameWidth * this.scaleX;
      const newHeight = this.frameHeight * this.scaleY;
      this.scaleX = 1;
      this.scaleY = 1;
      this.resizeFrame(newWidth, newHeight);
      this.canvas?.requestRenderAll();
    });
  }

  private _setupControls(): void {
    // Remplacer les contrôles de resize natifs
    // Le resize se fait depuis le coin opposé (le coin qu'on tire bouge, l'opposé reste fixe)
    const resizeHandler = (changeX: -1 | 0 | 1, changeY: -1 | 0 | 1) => {
      return (eventData: TPointerEvent, transform: TransformState): boolean => {
        const target = transform.target as ImageFrame;
        const canvas = target.canvas as CanvasWithSnapping | undefined;
        if (!canvas) return false;

        const pointer = canvas.getScenePoint(eventData);

        if (transform._startWidth === undefined) {
          transform._startWidth = target.frameWidth;
          transform._startHeight = target.frameHeight;
          transform._startPointerX = pointer.x;
          transform._startPointerY = pointer.y;
          transform._startLeft = target.left;
          transform._startTop = target.top;
        }

        const rotated = rotatePoint(
          pointer.x - transform._startPointerX!,
          pointer.y - transform._startPointerY!,
          target.angle
        );

        // Calculer les nouvelles dimensions (sans le * 2, pour un resize non-centré)
        let newWidth = Math.max(20, transform._startWidth + rotated.x * changeX);
        let newHeight = Math.max(20, transform._startHeight! + rotated.y * changeY);

        // === Snapping pendant le resize ===
        // Calculer les bounds actuels de l'objet pour le snapping
        // Le coin fixe reste à sa position de départ
        const startCenterX = transform._startLeft!;
        const startCenterY = transform._startTop!;
        const startHalfWidth = transform._startWidth / 2;
        const startHalfHeight = transform._startHeight! / 2;

        // Calculer la position du coin fixe (opposé au coin qu'on tire)
        const fixedCornerLocalX = -changeX * startHalfWidth; // changeX=1 (droite) -> fixe à gauche
        const fixedCornerLocalY = -changeY * startHalfHeight;

        // Convertir en coordonnées canvas (avec rotation)
        const fixedCornerRotated = rotatePoint(fixedCornerLocalX, fixedCornerLocalY, -target.angle);
        const fixedCornerX = startCenterX + fixedCornerRotated.x;
        const fixedCornerY = startCenterY + fixedCornerRotated.y;

        // Calculer les bounds avec les nouvelles dimensions
        // Pour simplifier, on utilise les bounds sans rotation pour le snap
        // (le snap fonctionne mieux avec des objets non-rotés ou peu rotés)
        let bounds: { left: number; top: number; right: number; bottom: number };
        if (Math.abs(target.angle % 90) < 1) {
          // Objet aligné : calcul précis des bounds
          if (changeX === 1) {
            bounds = {
              left: fixedCornerX,
              right: fixedCornerX + newWidth,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY,
            };
          } else if (changeX === -1) {
            bounds = {
              left: fixedCornerX - newWidth,
              right: fixedCornerX,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY,
            };
          } else {
            // changeX === 0 (resize vertical uniquement)
            bounds = {
              left: startCenterX - newWidth / 2,
              right: startCenterX + newWidth / 2,
              top: changeY === 1 ? fixedCornerY : fixedCornerY - newHeight,
              bottom: changeY === 1 ? fixedCornerY + newHeight : fixedCornerY,
            };
          }
        } else {
          // Objet roté : utiliser getBoundingRect approximatif
          const halfW = newWidth / 2;
          const halfH = newHeight / 2;
          const centerX = startCenterX + (newWidth - transform._startWidth) / 2 * changeX;
          const centerY = startCenterY + (newHeight - transform._startHeight!) / 2 * changeY;
          bounds = {
            left: centerX - halfW,
            right: centerX + halfW,
            top: centerY - halfH,
            bottom: centerY + halfH,
          };
        }

        // Appliquer le snapping si disponible
        const snappingManager = canvas.snappingManager;
        if (snappingManager) {
          const snapResult = snappingManager.calculateResizeSnap(bounds, changeX, changeY, pointer);

          if (snapResult.width !== null) {
            newWidth = snapResult.width;
          }
          if (snapResult.height !== null) {
            newHeight = snapResult.height;
          }
        }

        // Calculer le décalage pour garder le coin opposé fixe
        // L'objet a son origin au centre, donc on doit compenser le déplacement
        const deltaWidth = newWidth - transform._startWidth;
        const deltaHeight = newHeight - transform._startHeight!;

        // Le décalage dépend de quel coin/bord est tiré
        // changeX: -1 = gauche, 1 = droite, 0 = pas de changement horizontal
        // changeY: -1 = haut, 1 = bas, 0 = pas de changement vertical
        const offsetX = (deltaWidth / 2) * changeX;
        const offsetY = (deltaHeight / 2) * changeY;

        // Appliquer la rotation au décalage
        const rotatedOffset = rotatePoint(offsetX, offsetY, -target.angle);

        target.left = transform._startLeft! + rotatedOffset.x;
        target.top = transform._startTop! + rotatedOffset.y;
        target.resizeFrame(newWidth, newHeight);
        canvas.requestRenderAll();
        return true;
      };
    };

    // Coins - on change actionName pour éviter que Fabric applique un transform de scale temporaire
    ["tl", "tr", "bl", "br"].forEach((key) => {
      if (this.controls[key]) {
        const x = key.includes("l") ? -1 : 1;
        const y = key.includes("t") ? -1 : 1;
        this.controls[key].actionHandler = resizeHandler(x as -1 | 1, y as -1 | 1);
        this.controls[key].actionName = "resizeFrame";
      }
    });

    // Bords
    [
      { key: "mt", x: 0, y: -1 },
      { key: "mb", x: 0, y: 1 },
      { key: "ml", x: -1, y: 0 },
      { key: "mr", x: 1, y: 0 },
    ].forEach(({ key, x, y }) => {
      if (this.controls[key]) {
        this.controls[key].actionHandler = resizeHandler(x as -1 | 0 | 1, y as -1 | 0 | 1);
        this.controls[key].actionName = "resizeFrame";
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Sérialisation
  // ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toObject(propertiesToInclude?: any[]): any {
    const base = super.toObject(propertiesToInclude) as Record<string, unknown>;

    return {
      type: "ImageFrame",
      left: this.left,
      top: this.top,
      angle: this.angle,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      clipShape: this.clipShape,
      layerId: base.layerId,
      lockMode: base.lockMode,
      lockContent: base.lockContent,
      opacity: this.opacity,
      image: {
        src: this.imageSrc,
        offsetX: this._imageOffsetX,
        offsetY: this._imageOffsetY,
        scale: this._imageScale,
      },
    } as ImageFrameData;
  }

  static async fromObject(data: ImageFrameData): Promise<ImageFrame> {
    const img = await FabricImage.fromURL(data.image.src, { crossOrigin: "anonymous" });

    const frame = new ImageFrame(img, {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      imageOffsetX: data.image.offsetX,
      imageOffsetY: data.image.offsetY,
      imageScale: data.image.scale,
    });

    // Restaurer les dimensions du frame
    frame.frameWidth = data.frameWidth;
    frame.frameHeight = data.frameHeight;
    frame.width = data.frameWidth;
    frame.height = data.frameHeight;

    // Recalculer le coverScale
    const coverScale = Math.max(data.frameWidth / img.width, data.frameHeight / img.height);
    frame._image.set({
      scaleX: coverScale * data.image.scale,
      scaleY: coverScale * data.image.scale,
      left: data.image.offsetX,
      top: data.image.offsetY,
    });

    if (data.clipShape) {
      frame.applyClipShape(data.clipShape);
    }

    frame.scaleX = data.scaleX;
    frame.scaleY = data.scaleY;

    if (data.opacity !== undefined) {
      frame.opacity = data.opacity;
    }

    return frame;
  }

  /**
   * Convertit une image legacy (FabricImage avec scale/clipPath) en ImageFrame
   * Préserve les dimensions affichées et le clip shape
   */
  static fromLegacyImage(
    img: FabricImage,
    options?: { clipShape?: ShapeType; layerId?: string; lockMode?: LockMode }
  ): ImageFrame {
    // Calculer les dimensions affichées de l'image legacy
    // L'image legacy utilisait scaleX/scaleY pour le redimensionnement
    const displayedWidth = img.width * (img.scaleX || 1);
    const displayedHeight = img.height * (img.scaleY || 1);

    // Récupérer le centre de l'image (selon son origin)
    const center = img.getCenterPoint();

    return new ImageFrame(img, {
      left: center.x,
      top: center.y,
      angle: img.angle,
      layerId: options?.layerId || (img as unknown as { layerId?: string }).layerId,
      lockMode: options?.lockMode,
      clipShape: options?.clipShape,
      frameWidth: displayedWidth,
      frameHeight: displayedHeight,
    });
  }
}

// Enregistrer la classe pour la sérialisation Fabric.js
classRegistry.setClass(ImageFrame);
classRegistry.setClass(ImageFrame, "ImageFrame");
