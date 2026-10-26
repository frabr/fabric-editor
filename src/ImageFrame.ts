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
  Shadow,
} from "#fabric";
import type { ShapeType, LockMode } from "./types";
import {
  createCircle,
  createRect,
  getShapeCatalog,
} from "./shapes/factories";
import { FabPath } from "./shapes/FabPath";
import { clipDataFor, type ClipData } from "./shapes/registry";
import type { SnappingManager } from "./SnappingManager";
import { checkerCanvas, transparentCanvas } from "./userSlots";
import {
  NO_CROP, centerOffset, coverScale, cropFromCenterOffset, cropFromRect, isCropped, normalizeCrop, panCrop,
  photoRect, zoomCrop, type Crop, type Rect as CropRect,
} from "./crop";

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
  /** Le recadrage de l'image dans le cadre (cf. crop.ts) ; centrée, cover, sans. */
  crop?: Partial<Crop>;
  /** @deprecated Documents d'avant : le décalage du centre de l'image en pixels de cadre. */
  imageOffsetX?: number;
  imageOffsetY?: number;
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
  /** L'ombre portée (Shadow#toObject) : couleur, flou, décalages. */
  shadow?: Record<string, unknown>;
  /**
   * `src` absent = cadre EN ATTENTE : le fichier n'existe pas encore (média en cours de
   * production côté hôte). Il se dessine en damier et se sauve tel quel, sans `src` — ses
   * autres clés (l'identité du média) survivent au tour éditeur.
   *
   * Le recadrage est `cropX`, `cropY` (0 → 1) et `scale` (≥ 1) — voir crop.ts. Les
   * documents d'avant portent `offsetX`, `offsetY` (pixels) : lus, convertis, plus écrits.
   */
  image: {
    src?: string;
    cropX?: number;
    cropY?: number;
    scale?: number;
    /** @deprecated */
    offsetX?: number;
    /** @deprecated */
    offsetY?: number;
    [key: string]: unknown;
  };
}

const IMAGE_KEYS = ["src", "cropX", "cropY", "scale", "offsetX", "offsetY"] as const;

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

  private _crop: Crop = NO_CROP;
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
    this._crop = options.crop
      ? normalizeCrop(options.crop)
      : cropFromCenterOffset(frameWidth, frameHeight, { w: image.width, h: image.height },
                             options.imageOffsetX ?? 0, options.imageOffsetY ?? 0, 1);
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
    this._applyCrop();
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

  /** Un cadre en attente dont l'hôte montre lui-même l'aperçu sous le canvas : le damier
   *  s'efface (transparent), le cadre reste en attente — rien ne change au save. */
  concealPlaceholder(): void {
    if (!this._pending) return;

    this._image.setElement(transparentCanvas(this._image.width, this._image.height));
    this.dirty = true;
  }

  // ─────────────────────────────────────────────────────────────
  // Recadrage (cf. crop.ts) : tout est dans le repère du cadre, origine en haut à gauche
  // ─────────────────────────────────────────────────────────────

  get crop(): Crop {
    return this._crop;
  }

  /** Se recadre : une vraie image (pas un damier d'attente). */
  get croppable(): boolean {
    return !this._pending;
  }

  get isCropped(): boolean {
    return isCropped(this._crop);
  }

  /** La taille native de l'image. */
  get naturalSize(): { w: number; h: number } {
    return { w: this._image.width, h: this._image.height };
  }

  setCrop(crop: Partial<Crop>): void {
    this._crop = normalizeCrop({ ...this._crop, ...crop });
    this._applyCrop();
    this.dirty = true;
  }

  resetCrop(): void {
    this.setCrop(NO_CROP);
  }

  /** L'image entière, dans le repère du cadre. */
  photoRect(): CropRect {
    return photoRect(this.frameWidth, this.frameHeight, this.naturalSize, this._crop);
  }

  /** L'image posée en `rect` (repère du cadre) : bornée pour couvrir le cadre. */
  setPhotoRect(rect: CropRect): void {
    this.setCrop(cropFromRect(this.frameWidth, this.frameHeight, this.naturalSize, rect));
  }

  /** Décale l'image de (dx, dy) pixels de cadre depuis `from` (le recadrage au début du geste). */
  panCrop(dx: number, dy: number, from: Crop = this._crop): void {
    this.setCrop(panCrop(this.frameWidth, this.frameHeight, this.naturalSize, from, dx, dy));
  }

  /** Change l'échelle en gardant fixe le point (px, py) du cadre, depuis `from`. */
  zoomCrop(scale: number, px?: number, py?: number, from: Crop = this._crop): void {
    this.setCrop(zoomCrop(this.frameWidth, this.frameHeight, this.naturalSize, from, scale, px, py));
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

    // Une autre image : son recadrage repart de zéro
    this._crop = NO_CROP;
    this._applyCrop();

    this.dirty = true;
    this.canvas?.requestRenderAll();
  }

  /**
   * Redimensionne le frame : l'image reste en cover, le recadrage (normalisé) garde la même
   * zone autant que possible.
   */
  resizeFrame(newWidth: number, newHeight: number): void {
    this.frameWidth = newWidth;
    this.frameHeight = newHeight;
    this.width = newWidth;
    this.height = newHeight;
    this._applyCrop();

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

  /** L'image dans le groupe (origine au centre) : cover × échelle, centre décalé selon le recadrage. */
  private _applyCrop(): void {
    const nat = this.naturalSize;
    const s = coverScale(this.frameWidth, this.frameHeight, nat) * this._crop.scale;
    const offset = centerOffset(this.frameWidth, this.frameHeight, nat, this._crop);
    this._image.set({ scaleX: s, scaleY: s, left: offset.x, top: offset.y });
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

        // Un coin garde les proportions (comme toute poignée de coin) : le facteur est la
        // distance tirée en somme des deux axes, rapportée à la taille de départ
        const corner = changeX !== 0 && changeY !== 0;
        const ratio = transform._startHeight! / transform._startWidth;
        if (corner) {
          const k = (newWidth + newHeight) / (transform._startWidth + transform._startHeight!);
          newWidth = transform._startWidth * k;
          newHeight = transform._startHeight! * k;
        }

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

          if (snapResult.width !== null) newWidth = snapResult.width;
          if (snapResult.height !== null) newHeight = snapResult.height;
          // Au coin, l'aimant pose un axe et l'autre suit
          if (corner && snapResult.width !== null) newHeight = newWidth * ratio;
          else if (corner && snapResult.height !== null) newWidth = newHeight / ratio;
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
      shadow: this.shadow ? (this.shadow.toObject() as Record<string, unknown>) : undefined,
      stroke: this.stroke || undefined,
      strokeWidth: this.stroke ? this.strokeWidth : undefined,
      image: {
        ...this._imageMeta,
        ...(this._pending ? {} : { src: this.imageSrc }),
        cropX: this._crop.x,
        cropY: this._crop.y,
        scale: this._crop.scale,
      },
    } as ImageFrameData;
  }

  static async fromObject(data: ImageFrameData): Promise<ImageFrame> {
    const { src, cropX, cropY, offsetX = 0, offsetY = 0, scale = 1 } = data.image;
    const options: ImageFrameOptions = {
      left: data.left,
      top: data.top,
      angle: data.angle,
      layerId: data.layerId,
      lockMode: data.lockMode,
      frameWidth: data.frameWidth,
      frameHeight: data.frameHeight,
      imageMeta: imageMetaOf(data.image),
    };

    const img = src ? await FabricImage.fromURL(src, { crossOrigin: "anonymous" }) : null;
    // Le nouveau format se lit tel quel ; l'ancien (décalage en pixels) se convertit ici,
    // l'image chargée et sa taille connue — et ne se réécrit plus.
    options.crop = cropX !== undefined || cropY !== undefined
      ? { x: cropX, y: cropY, scale }
      : cropFromCenterOffset(data.frameWidth, data.frameHeight, { w: img?.width || 1, h: img?.height || 1 },
                             offsetX, offsetY, scale);

    const frame = img
      ? new ImageFrame(img, options)
      : ImageFrame.pending({ ...options, frameWidth: data.frameWidth, frameHeight: data.frameHeight });

    // Le fromObject est manuel (contrairement aux shapes, servies par le générique de
    // fabric) : les extras sérialisés doivent être restaurés explicitement.
    if ((data as any).layout) frame.set("layout", (data as any).layout);

    // left/top sont exprimés dans l'origine sauvegardée (haut-gauche pour une forme-image
    // devenue container) ; absente (documents d'avant), c'est le centre par défaut.
    if (data.originX) frame.set({ originX: data.originX, originY: data.originY ?? data.originX });
    if (data.stroke) frame.set({ stroke: data.stroke, strokeWidth: data.strokeWidth ?? 4 });

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
    if (data.shadow) frame.set("shadow", new Shadow(data.shadow));

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
