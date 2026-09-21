// Fabric Editor - Éditeur d'images basé sur Fabric.js
//
// Ce module fournit un éditeur d'images complet avec gestion des calques,
// formes, clips, et masques.

// Classe principale
export { FabricEditor } from "./FabricEditor";
export { DesignCanvas } from "./DesignCanvas";

// Managers
export { LayerManager } from "./LayerManager";
export { SelectionManager } from "./SelectionManager";
export { MaskManager } from "./MaskManager";
export { PersistenceManager } from "./PersistenceManager";
export { HistoryManager } from "./HistoryManager";
export { SnappingManager } from "./SnappingManager";
export { LayoutManager } from "./LayoutManager";
export { CanvasGuides } from "./ui/guides";

// Handlers
export { DropHandler } from "./DropHandler";
export type { DropHandlerConfig, DragPayload } from "./DropHandler";
export { PendingUploadsManager } from "./PendingUploadsManager";

// ImageFrame
export { ImageFrame } from "./ImageFrame";

// OOP shape classes
export { FabRect, FabCircle, FabPath, type Lockable, type Controllable } from "./shapes";

// Shape factories (return Fab* instances)
export {
  createRect,
  createCircle,
  createImage,
  createShape,
  createPathShape,
  getShapeCatalog,
  type ShapeCatalogEntry,
  SHAPE_PATHS,
  type ShapePath,
} from "./shapes";

// @legacy — shape switching, old path strings, standalone clip functions
export {
  createHeart,
  createHexagon,
  switchShape,
  nextShape,
  isValidShape,
  getAvailableShapes,
  HEART_PATH,
  HEXAGON_PATH,
} from "./shapes";
export {
  antiScale,
  addCircleClip,
  addHeartClip,
  addHexagonClip,
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
export { ResizeSession } from "./layout";
export type { LayoutData, ContainerData, ChildData, ContainerLayout, ChildLayout, SizeMode, AlignSelf, AlignItems, JustifyContent, FlexDirection, AttachSnapshot, LayoutSession } from "./layout";
export { isContainer, isChild, isContainerLayout, isChildLayout, MIN_PAD } from "./layout";
export { scaledSize, topLeft, pointInObject, clampTopLeft, hasExceededOffset } from "./layout";
export { ContainerizeSession, InsertChildSession, wrapContainerAroundChild } from "./layout";
export { initYoga, isYogaReady, yogaLayout } from "./layout";

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
