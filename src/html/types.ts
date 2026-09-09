import type { LayerData, ShapeType } from "../types";

/**
 * Résultat de la conversion d'un layer en HTML
 */
export interface HtmlLayerOutput {
  /** Le HTML du layer */
  html: string;
  /** Les fonts requises (noms de famille) */
  fonts?: string[];
}

/**
 * Options pour le rendu HTML global
 */
export interface HtmlRenderOptions {
  /** Largeur du canvas */
  width: number;
  /** Hauteur du canvas */
  height: number;
  /** URL de l'image de fond */
  backgroundImage?: string;
  /** Classe CSS à ajouter au container */
  containerClass?: string;
  /** Générer les imports Google Fonts */
  includeGoogleFonts?: boolean;
}

/**
 * Interface pour un convertisseur de layer
 */
export interface LayerHtmlConverter<T extends LayerData = LayerData> {
  /**
   * Convertit un layer en HTML
   * @param layer Les données du layer
   * @param zIndex L'index z du layer
   * @returns Le HTML et les dépendances
   */
  toHtml(layer: T, zIndex: number): HtmlLayerOutput;
}

/**
 * Données spécifiques pour un layer IText
 */
export interface ITextLayerData extends LayerData {
  type: "IText";
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  fill?: string;
  textAlign?: string;
  lineHeight?: number;
  charSpacing?: number;
  underline?: boolean;
  linethrough?: boolean;
  overline?: boolean;
  width?: number;
  height?: number;
  originX?: string;
  originY?: string;
}

/**
 * Données spécifiques pour un layer Rect
 */
export interface RectLayerData extends LayerData {
  type: "Rect";
  width: number;
  height: number;
  rx?: number;
  ry?: number;
  originX?: string;
  originY?: string;
}

/**
 * Données spécifiques pour un layer Circle
 */
export interface CircleLayerData extends LayerData {
  type: "Circle";
  radius: number;
  originX?: string;
  originY?: string;
}

/**
 * Données spécifiques pour un layer Path
 */
export interface PathLayerData extends LayerData {
  type: "Path";
  path: string | unknown[];
  originX?: string;
  originY?: string;
  width?: number;
  height?: number;
  /**
   * Décalage Y du centre géométrique du path par rapport à Y=0.
   * Utile pour les paths dont le centre n'est pas sur l'origine.
   * Ex: Le cœur HEART_PATH a son centre à Y=-0.5 (bounds de -14 à 13).
   * @default 0
   */
  pathCenterY?: number;
}

/**
 * Données d'image dans un ImageFrame
 */
export interface ImageFrameImageData {
  src: string;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Données spécifiques pour un layer ImageFrame
 */
export interface ImageFrameLayerData extends LayerData {
  type: "ImageFrame";
  frameWidth: number;
  frameHeight: number;
  clipShape?: ShapeType;
  image: ImageFrameImageData;
}

/**
 * Union de tous les types de layers supportés
 */
export type SupportedLayerData =
  | ITextLayerData
  | RectLayerData
  | CircleLayerData
  | PathLayerData
  | ImageFrameLayerData;
