import {
  Group,
  Rect,
  FabricImage,
  classRegistry,
  type TPointerEvent,
  type Transform,
  type Canvas,
  type Point,
  LayoutManager,
  FixedLayout,
} from "#fabric";
import type { ShapeType, LockMode, ControlOption } from "./types";
import {
  createCircle,
  createRect,
  getShapeCatalog,
} from "./shapes/factories";
import { FabPath } from "./shapes/FabPath";
import { clipDataFor, type ClipData } from "./shapes/registry";
import type { SnappingManager } from "./SnappingManager";
import { checkerCanvas } from "./userSlots";

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
  /** Clip inliné (formes hors catalogue global — le document reste autoporteur). */
  clipData?: ClipData;
  /** Corner radius in pixels for "rect" clip shape (0 = sharp corners). */
  cornerRadius?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  /** Scale initial du frame (pour limiter la taille à l'import) */
  frameScale?: number;
  /** Dimensions explicites du frame (prioritaires sur frameScale) */
  frameWidth?: number;
  frameHeight?: number;
  /** Les clés de `image` que l'hôte pose à côté de `src` (apibots : `content_medium_id`).
   *  Elles suivent la SOURCE : une image remplacée arrive avec les siennes, ou sans. */
  imageMeta?: ImageMeta;
}

export type ImageMeta = Record<string, unknown>;

export interface ImageFrameData {
  originX?: "left" | "center" | "right";
  originY?: "top" | "center" | "bottom";
  stroke?: string;
  strokeWidth?: number;
  type: "ImageFrame";
  left: number;
  top: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  frameWidth: number;
  frameHeight: number;
  clipShape?: ShapeType;
  /**
   * Le `d` du clip, inliné au save : les nouveaux documents ne dépendent plus du
   * registre pour se recharger — l'id (clipShape) reste pour l'affichage et le
   * cycle. Le stock legacy (id seul) se résout via le registre et s'upgrade au
   * prochain save.
   */
  clipData?: ClipData;
  /** Corner radius in pixels (only meaningful when clipShape is "rect"). */
  cornerRadius?: number;
  layerId?: string;
  lockMode?: LockMode;
  lockContent?: boolean;
  opacity?: number;
  /**
   * `src` absent = cadre EN ATTENTE : le fichier n'existe pas encore (média en cours de
   * production côté hôte). Il se dessine en damier et se sauve tel quel, sans `src` — ses
   * autres clés (l'identité du média) survivent au tour éditeur.
   */
  image: {
    src?: string;
    offsetX?: number;
    offsetY?: number;
    scale?: number;
    [key: string]: unknown;
  };
}

const IMAGE_KEYS = ["src", "offsetX", "offsetY", "scale"] as const;

function imageMetaOf(image: ImageFrameData["image"]): ImageMeta {
  const meta: ImageMeta = { ...image };
  IMAGE_KEYS.forEach((key) => delete meta[key]);
  return meta;
}

/** Interface pour stocker l'état des transformations de resize */
interface TransformState extends Transform {
  _startWidth?: number;
  _startHeight?: number;
  _startPointerX?: number;
  _startPointerY?: number;
  _startLeft?: number;
  _startTop?: number;
  /** Point du bord (ou coin) opposé, fixe pendant le resize. */
  _anchor?: Point;
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
  clipData?: ClipData;
  /** Corner radius in pixels for "rect" clip shape. 0 = sharp corners. */
  cornerRadius: number = 0;

  private _imageOffsetX: number = 0;
  private _imageOffsetY: number = 0;
  private _imageScale: number = 1;
  private _image: FabricImage;
  private _imageMeta: ImageMeta = {};
  private _pending = false;

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
    this._imageMeta = { ...(options.imageMeta ?? {}) };

    if (options.layerId) {
      this.set("layerId", options.layerId);
    }
    this.set("layerType", "imageFrame");

    // Clip par défaut + forme personnalisée si demandée
    this.cornerRadius = options.cornerRadius ?? 0;
    this.clipData = options.clipData;
    this._applyClip(options.clipShape || "rect");

    this._setupControls();
    this._setupScaleAbsorption();
    this._applyImageOffset();
  }

  get image(): FabricImage {
    return this._image;
  }

  get imageSrc(): string {
    return this._pending ? "" : this._image.getSrc() || "";
  }

  /** Les clés de `image` qui ne sont pas à la lib (cf. ImageFrameOptions.imageMeta). */
  get imageMeta(): ImageMeta {
    return this._imageMeta;
  }

  /** Cadre en attente de son fichier : pas de `src` au save (damier, ou l'aperçu de session
   *  d'un upload en cours). `replaceImage` le sort de l'attente. */
  get pending(): boolean {
    return this._pending;
  }

  /** Un cadre en attente : l'image est le damier, aux dimensions du cadre. */
  static pending(options: ImageFrameOptions & { frameWidth: number; frameHeight: number }): ImageFrame {
    const img = new FabricImage(checkerCanvas(options.frameWidth, options.frameHeight));
    const frame = new ImageFrame(img, options);
    frame._pending = true;
    return frame;
  }

  /** L'image affichée n'est pas celle du document (une url de session, le temps d'un
   *  upload) : le cadre se sauve sans `src` jusqu'à ce que la vraie source la remplace. */
  markSourcePending(): void {
    this._pending = true;
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
   * Remplace l'image du frame en mode cover. Les clés `imageMeta` sont celles de la NOUVELLE
   * source — jamais héritées : une image remplacée qui garderait l'identité de l'ancienne
   * est exactement le bug qu'elles servent à éviter.
   */
  replaceImage(newImage: FabricImage, imageMeta: ImageMeta = {}): void {
    const savedClipShape = this.clipShape || "rect";
    this._imageMeta = { ...imageMeta };
    this._pending = false;
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

  /** Taille visuelle (contrat des formes, utilisé par le layout) : le frame, image en cover. */
  setSize(w: number, h: number): void {
    this.set({ scaleX: 1, scaleY: 1 });
    this.resizeFrame(w, h);
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
    const shapes = getShapeCatalog().map((s) => s.id);
    const currentIndex = this.clipShape ? shapes.indexOf(this.clipShape) : -1;
    this.applyClipShape(shapes[(currentIndex + 1) % shapes.length]);
  }

  /**
   * Set the corner radius (in pixels) for the "rect" clip shape.
   * Automatically switches to "rect" if another clip shape is active.
   */
  setCornerRadius(radius: number): void {
    this.cornerRadius = Math.max(0, radius);
    if (this.clipShape !== "rect") {
      this.clipShape = "rect";
    }
    this._applyClip("rect");
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }

  getCornerRadius(): number {
    return this.cornerRadius;
  }

  /**
   * Contour (capacité de forme) : un Group ne dessine pas de trait — on trace la forme
   * de découpe par-dessus, hors clip, trait centré sur le bord comme pour une forme.
   */
  render(ctx: CanvasRenderingContext2D): void {
    super.render(ctx);
    const outline = this.clipPath;
    if (!this.visible || !outline || !this.stroke || !this.strokeWidth) return;

    const saved = { fill: outline.fill, stroke: outline.stroke, strokeWidth: outline.strokeWidth };
    ctx.save();
    this.transform(ctx);
    outline.set({ fill: "transparent", stroke: this.stroke, strokeWidth: this.strokeWidth });
    outline.render(ctx);
    outline.set(saved);
    ctx.restore();
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
        this.clipData = undefined;
        this.clipPath = this._rectClip(minSize);
        break;
      case "circle":
        this.clipData = undefined;
        this.clipPath = createCircle({ radius: minSize / 2 });
        break;
      default: {
        // Le registre prime (une même forme changée de catalogue se rafraîchit) ;
        // sans lui, le clipData inliné du document se suffit ; sans rien (id legacy,
        // registre non injecté), on affiche rect SANS toucher clipShape — le save ne
        // détruit pas l'id, un chargement mieux loti le résoudra.
        this.clipData = clipDataFor(shapeType) ?? this.clipData;
        if (this.clipData) {
          this.clipPath = FabPath.fromPathData(this.clipData, {
            width: this.frameWidth,
            height: this.frameHeight,
            left: 0,
            top: 0,
          });
        } else {
          console.warn(`[ImageFrame] clip "${shapeType}" inconnu (registre non injecté ?) — affichage rect`);
          this.clipPath = this._rectClip(minSize);
        }
        break;
      }
    }
  }

  private _rectClip(minSize: number): Rect {
    const r = Math.min(this.cornerRadius, minSize / 2);
    return createRect({
      width: this.frameWidth,
      height: this.frameHeight,
      rx: r,
      ry: r,
      left: 0,
      top: 0,
    });
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

        // Le bord (ou coin) opposé reste fixe, quelle que soit l'origine de l'objet (une
        // forme-image devenue container est en origine haut-gauche)
        const anchorX = changeX === 1 ? "left" : changeX === -1 ? "right" : "center";
        const anchorY = changeY === 1 ? "top" : changeY === -1 ? "bottom" : "center";
        if (transform._startWidth === undefined) {
          const center = target.getCenterPoint();
          transform._startWidth = target.frameWidth;
          transform._startHeight = target.frameHeight;
          transform._startPointerX = pointer.x;
          transform._startPointerY = pointer.y;
          transform._startLeft = center.x;
          transform._startTop = center.y;
          transform._anchor = target.getPositionByOrigin(anchorX, anchorY);
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

        target.resizeFrame(newWidth, newHeight);
        target.setPositionByOrigin(transform._anchor!, anchorX, anchorY);
        target.setCoords();

        // Même événement que les poignées des formes : le layout (StackResizeSession) suit
        target.fire("resizing" as any);
        (canvas as any).fire?.("object:resizing", { target, e: eventData, transform, pointer });
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
        this.controls[key].actionName = "resizing";
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
        this.controls[key].actionName = "resizing";
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Sérialisation
  // ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toObject(propertiesToInclude?: any[]): any {
    const base = super.toObject(propertiesToInclude) as Record<string, unknown>;

    // Les propriétés DEMANDÉES par l'appelant (layout, bindings…) doivent survivre : la
    // forme fixe ci-dessous écrasait tout — un ImageFrame sortait de son container au save,
    // un fond perdait son inertie (evented) et redevenait cible de drop au reload.
    const extras: Record<string, unknown> = {};
    (propertiesToInclude || []).forEach((key) => {
      if (base[key] !== undefined) extras[key] = base[key];
    });
    if (this.selectable === false) extras.selectable = false;
    if (this.evented === false) extras.evented = false;

    return {
      ...extras,
      type: "ImageFrame",
      left: this.left,
      top: this.top,
      originX: this.originX,
      originY: this.originY,
      angle: this.angle,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      clipShape: this.clipShape,
      clipData: this.clipData,
      cornerRadius: this.cornerRadius || undefined,
      layerId: base.layerId,
      lockMode: base.lockMode,
      lockContent: base.lockContent,
      opacity: this.opacity,
      stroke: this.stroke || undefined,
      strokeWidth: this.stroke ? this.strokeWidth : undefined,
      image: {
        ...this._imageMeta,
        ...(this._pending ? {} : { src: this.imageSrc }),
        offsetX: this._imageOffsetX,
        offsetY: this._imageOffsetY,
        scale: this._imageScale,
      },
    } as ImageFrameData;
  }

  static async fromObject(data: ImageFrameData): Promise<ImageFrame> {
    const { src, offsetX = 0, offsetY = 0, scale = 1 } = data.image;
    const options: ImageFrameOptions = {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      imageOffsetX: offsetX,
      imageOffsetY: offsetY,
      imageScale: scale,
      imageMeta: imageMetaOf(data.image),
    };

    const frame = src
      ? new ImageFrame(await FabricImage.fromURL(src, { crossOrigin: "anonymous" }), options)
      : ImageFrame.pending({ ...options, frameWidth: data.frameWidth, frameHeight: data.frameHeight });
    const img = frame._image;

    // Le fromObject est manuel (contrairement aux shapes, servies par le générique de
    // fabric) : les extras sérialisés doivent être restaurés explicitement.
    if ((data as any).layout) frame.set("layout", (data as any).layout);

    // left/top sont exprimés dans l'origine sauvegardée (haut-gauche pour une forme-image
    // devenue container) ; absente (documents d'avant), c'est le centre par défaut.
    if (data.originX) frame.set({ originX: data.originX, originY: data.originY ?? data.originX });
    if (data.stroke) frame.set({ stroke: data.stroke, strokeWidth: data.strokeWidth ?? 4 });

    // Restaurer les dimensions du frame
    frame.frameWidth = data.frameWidth;
    frame.frameHeight = data.frameHeight;
    frame.width = data.frameWidth;
    frame.height = data.frameHeight;

    // Recalculer le coverScale
    const coverScale = Math.max(data.frameWidth / img.width, data.frameHeight / img.height);
    frame._image.set({
      scaleX: coverScale * scale,
      scaleY: coverScale * scale,
      left: offsetX,
      top: offsetY,
    });

    // Le clip inliné se restaure AVANT applyClipShape : un id absent du registre
    // (forme de groupe, catalogue non injecté) reste résoluble par le document seul.
    if (data.clipData) frame.clipData = data.clipData;

    // Rétrocompat : ancien "rounded" → rect + cornerRadius
    let clipShape = data.clipShape;
    if (clipShape === "rounded") {
      frame.cornerRadius = data.cornerRadius ?? Math.min(data.frameWidth, data.frameHeight) * 0.15;
      clipShape = "rect";
    } else {
      frame.cornerRadius = data.cornerRadius ?? 0;
    }

    if (clipShape) {
      frame.applyClipShape(clipShape);
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
