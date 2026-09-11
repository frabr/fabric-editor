// Fabric Editor - Éditeur d'images basé sur Fabric.js
//
// Ce module fournit un éditeur d'images complet avec gestion des calques,
// formes, clips, et masques.

// Fabric.js prototype extensions (side-effect import)
import "./fabric-extensions";

// Classe principale
export { FabricEditor } from "./FabricEditor";

// Managers
export { LayerManager } from "./LayerManager";
export { SelectionManager } from "./SelectionManager";
export { MaskManager } from "./MaskManager";
export { PersistenceManager } from "./PersistenceManager";
export { HistoryManager } from "./HistoryManager";
export { SnappingManager } from "./SnappingManager";
export { LayoutManager } from "./LayoutManager";
export { CanvasGuides } from "./CanvasGuides";

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

// Layout
export { runLayout } from "./layout";
export type { LayoutData, ContainerLayout, ChildLayout, SizeMode, AttachSnapshot } from "./layout";
export { isContainerLayout, isChildLayout, MIN_PAD } from "./layout";
export { scaledSize, topLeft, pointInObject, clampTopLeft, hasExceededOffset } from "./layout";
export { AttachSession, wrapContainerAroundChild } from "./layout";

// HTML Renderer
export { fabricToHtml, layerToHtmlStandalone } from "./html";
export type { HtmlRenderOptions, HtmlLayerOutput } from "./html";

// Types
export type {
  EditorConfig,
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
export type { SnappingConfig, ResizeSnapResult } from "./SnappingManager";
export type { LayoutManagerCallbacks } from "./LayoutManager";
