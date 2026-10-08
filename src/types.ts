import type { FabricObject } from "#fabric";
import type { CatalogShapeInput, ShapePathData } from "./shapes/registry";

// Configuration de l'éditeur
export interface EditorConfig {
  width: number;
  height: number;
  fonts?: FontsConfig;
  /**
   * Le catalogue de formes de l'hôte (global + groupe) — la lib n'embarque aucune
   * forme, mais doit savoir résoudre les clipShape par id du stock (registerShapes).
   */
  shapes?: CatalogShapeInput[];
  defaultColor?: string;
  /** Base color for all visual guides (snap lines, layout margins, hints). */
  guideColor?: string;
  /** Badge des images à fournir (défaut : « À fournir ») — la traduction de l'hôte. */
  userSlotLabel?: string;
  /** Invite dans les images à fournir, sous l'icône (si elle tient) — la traduction de l'hôte. */
  userSlotPrompt?: string;
  container?: HTMLElement;
  transparent?: boolean;
  /**
   * Plan de travail : le canvas remplit le container, le cadre du document y est centré,
   * le hors-cadre reste visible sous un voile (voir DesignCanvas.enableWorkspace).
   * Sans : canvas = cadre (le comportement historique).
   */
  workspace?: boolean | import("./DesignCanvas").WorkspaceOptions;
}

// Configuration des polices
export type FontsConfig = Record<string, FontConfig>;

export interface FontConfig {
  family: string;
  url: string;
  weight?: string;
}

// Ré-export depuis locking.ts pour rétrocompatibilité
export type { LockMode } from "./locking";

/**
 * Clé posée (via obj.set) sur les objets de preview de drag externe.
 * Les objets marqués sont ignorés par la détection de cible de drop
 * (findDropTargetAtPoint) — la preview suit le curseur, elle matcherait
 * toujours sinon.
 */
export const DRAG_PREVIEW_KEY = "dragPreview";

// Données d'un calque (pour sérialisation/désérialisation)
export interface LayerData {
  type: string;
  layerId?: string;
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  fill?: string | Record<string, unknown>;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  /** Mode de verrouillage du calque */
  lockMode?: LockMode;
  /** Indique si le contenu (image) est verrouillé */
  lockContent?: boolean;
  /** Layout data (container or child) — see layout/types.ts */
  layout?: import("./layout").LayoutData;
  /** Bindings du dialecte template (apibots) : { champ: { expr, scope, resolved } } */
  bindings?: Record<string, { expr?: string; scope?: string; resolved?: boolean }>;
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
  /** Les clés de `image` posées par l'hôte à côté de `src` (cf. ImageFrameOptions.imageMeta). */
  imageMeta?: Record<string, unknown>;
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
  shapeType?: ShapeType;
  /**
   * Données de paths inline (payload toolbox) : prioritaires sur shapeType —
   * l'asset devient du contenu à l'insertion. N paths → Group de FabPath.
   */
  paths?: ShapePathData[];
}

// Built-in shape types + any registered catalog shape ID
export type ShapeType = "rect" | "circle" | (string & {});

// Contrôles disponibles par type d'objet
export interface ObjectControlsConfig {
  type: string;
  options: ControlOption[];
}

/** `image` : les capacités d'image (remplacer, recadrer, promouvoir en fond). */
export type ControlOption = "clip" | "color" | "font" | "outline" | "corner_radius" | "image";

// Callbacks de sélection
export interface SelectionCallbacks {
  onSelect?: (object: FabricObject) => void;
  /**
   * Sélection de plusieurs objets (déjà normalisée : jamais un objet avec son ancêtre,
   * jamais un verrouillé). Absent, la lib retombe sur onSelect(premier objet).
   */
  onSelectMany?: (objects: FabricObject[]) => void;
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

// Extension du type FabricObject pour inclure layerId et layout
declare module "fabric" {
  interface FabricObject {
    layerId?: string;
    layerType?: string;
    layout?: import("./layout").LayoutData;
  }
}

// Re-export ImageFrame types
export type { ImageFrameData, ImageFrameOptions, ImageMeta } from "./ImageFrame";
