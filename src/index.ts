// Fabric Editor - Éditeur d'images basé sur Fabric.js
//
// Ce module fournit un éditeur d'images complet avec gestion des calques,
// formes, clips, et masques.

// Classe principale
export { FabricEditor } from "./FabricEditor";

// Managers
export { LayerManager } from "./LayerManager";
export { SelectionManager } from "./SelectionManager";
export { MaskManager } from "./MaskManager";
export { PersistenceManager } from "./PersistenceManager";
export { HistoryManager } from "./HistoryManager";
export { SnappingManager } from "./SnappingManager";

// Handlers
export { ImageDropHandler } from "./ImageDropHandler";
export { PendingUploadsManager } from "./PendingUploadsManager";

// ImageFrame
export { ImageFrame } from "./ImageFrame";

// Shapes
export {
  createRect,
  createRoundedRect,
  createCircle,
  createHeart,
  createHexagon,
  createImage,
  createShape,
  switchShape,
  nextShape,
  isValidShape,
  getAvailableShapes,
  HEART_PATH,
  HEXAGON_PATH,
} from "./shapes";

// Clipping
export {
  antiScale,
  addCircleClip,
  addHeartClip,
  addHexagonClip,
  addRoundedClip,
  switchClip,
  applyClip,
} from "./clipping";

// Locking
export {
  applyLockMode,
  getLockMode,
  getNextLockMode,
  isContentLocked,
  isPositionLocked,
  isStyleLocked,
} from "./locking";

// Controls
export { addCropControls, removeCropControls, CustomTextbox } from "./controls";

// Types
export type {
  EditorConfig,
  EditorState,
  FontsConfig,
  FontConfig,
  LayerData,
  LockMode,
  TextLayerOptions,
  ImageLayerOptions,
  ShapeLayerOptions,
  ShapeType,
  ObjectControlsConfig,
  ControlOption,
  SelectionCallbacks,
  SaveOptions,
  SaveResult,
} from "./types";

export type { HistoryState, HistoryCallbacks } from "./HistoryManager";
export type { SnappingConfig } from "./SnappingManager";
