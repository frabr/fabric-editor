import type { FabricObject, Canvas } from "fabric";

// Configuration de l'éditeur
export interface EditorConfig {
  width: number;
  height: number;
  standAlone?: boolean;
  fonts?: FontsConfig;
  defaultColor?: string;
  container?: HTMLElement;
}

// Configuration des polices
export type FontsConfig = Record<string, FontConfig>;

export interface FontConfig {
  family: string;
  url: string;
  weight?: string;
}

// État interne de l'éditeur
export interface EditorState {
  ratio: number;
  maxSize: number;
}

// Ré-export depuis locking.ts pour rétrocompatibilité
export type { LockMode } from "./locking";

// Données d'un calque (pour sérialisation/désérialisation)
export interface LayerData {
  type: string;
  layerId?: string;
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  /** Mode de verrouillage du calque */
  lockMode?: LockMode;
  /** Indique si le contenu (image) est verrouillé */
  lockContent?: boolean;
  [key: string]: unknown;
}

// Options pour créer un calque texte
export interface TextLayerOptions {
  text?: string;
  left?: number;
  top?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  layerId?: string;
}

// Options pour créer un calque image
export interface ImageLayerOptions {
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: "left" | "center" | "right";
  originY?: "top" | "center" | "bottom";
  layerId?: string;
}

// Options pour créer un calque forme
export interface ShapeLayerOptions {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  layerId?: string;
}

// Types de formes disponibles
export type ShapeType = "rect" | "rounded" | "circle" | "heart" | "hexagon";

// Contrôles disponibles par type d'objet
export interface ObjectControlsConfig {
  type: string;
  options: ControlOption[];
}

export type ControlOption = "clip" | "color" | "font" | "outline";

// Callbacks de sélection
export interface SelectionCallbacks {
  onSelect?: (object: FabricObject) => void;
  onDeselect?: () => void;
  /** Appelé quand une transformation commence (déplacement, rotation, redimensionnement) */
  onTransformStart?: () => void;
  /** Appelé quand une transformation se termine */
  onModified?: (object: FabricObject | null) => void;
}

// Options de sauvegarde
export interface SaveOptions {
  rasterize?: boolean;
  ajaxCall?: boolean;
  form?: HTMLFormElement;
}

// Résultat de sauvegarde
export interface SaveResult {
  layers: LayerData[];
  dataUrl?: string;
  /** URLs Cloudinary des assets uploadés pendant la sauvegarde */
  uploadedAssets?: string[];
}

// Extension du type FabricObject pour inclure layerId
declare module "fabric" {
  interface FabricObject {
    layerId?: string;
    layerType?: string;
  }
}

// Re-export ImageFrame types
export type { ImageFrameData, ImageFrameOptions } from "./ImageFrame";
