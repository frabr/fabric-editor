// Fabric Editor - Éditeur d'images basé sur Fabric.js
//
// Ce module fournit un éditeur d'images complet avec gestion des calques,
// formes, clips, et masques.

// Classe principale
export { FabricEditor } from "./FabricEditor";
export { DesignCanvas, type FrameRect, type WorkspaceOptions } from "./DesignCanvas";
export { PreviewCanvas } from "./PreviewCanvas";

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
export type { DropHandlerConfig, DragPayload, DropResult } from "./DropHandler";
export { PendingUploadsManager } from "./PendingUploadsManager";

// ImageFrame
export { ImageFrame } from "./ImageFrame";

// OOP shape classes
export { FabRect, FabCircle, FabPath, type Lockable } from "./shapes";
export { rulesOf, kindOf, type ObjectRules, type ObjectKind, type ToolboxImageReaction } from "./capabilities";

// Shape factories (return Fab* instances)
export {
  createRect,
  createCircle,
  createImage,
  createShape,
  createPathShape,
  createPathsShape,
  getShapeCatalog,
  type ShapeCatalogEntry,
} from "./shapes";

// Shape registry — injected by the host app (EditorConfig.shapes or registerShapes)
export {
  registerShapes,
  registeredShapes,
  getCatalogShape,
  isMonoPath,
  clipDataFor,
  type CatalogShape,
  type CatalogShapeInput,
  type ShapePathData,
  type ClipData,
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
export { ResizeSession, StackResizeSession, FreeResizeSession } from "./layout";
export type { LayoutData, SizingData, TextOverflow, ContainerData, ChildData, ContainerLayout, ChildLayout, SizeMode, AlignSelf, AlignItems, JustifyContent, FlexDirection, AttachSnapshot, LayoutSession } from "./layout";
export { isContainer, isChild, isContainerLayout, isChildLayout, MIN_PAD } from "./layout";
// Les groupes (containers libres) : leur boîte suit leurs enfants
export { isFreeContainer, stackParentOf, fitFreeContainer } from "./layout";
export type { Arrangement } from "./layout";
// L'arbre de layout sur calques sérialisés (apibots : tracks, suppression ; creatorstudio : rendu).
export { layoutParents, layoutRoot, layoutChildren, layoutDescendants, stackBlock } from "./layout";
export type { TreeLayer, LayoutParents } from "./layout";
export { scaledSize, topLeft, pointInObject, clampTopLeft, hasExceededOffset } from "./layout";
export { ContainerizeSession, InsertChildSession, wrapContainerAroundChild } from "./layout";
export { initYoga, isYogaReady, yogaLayout } from "./layout";

// Aligner, répartir
export { alignAxis, alignDelta, distributeDeltas, unionBox } from "./align";
export type { AlignEdge, DistributeAxis, Box, Delta } from "./align";

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
export type { LayoutManagerCallbacks, SizePreset } from "./LayoutManager";
export {
  pendingBindings, hasPendingBindings, lockBoundText, setTextContent, drawBindingBadge, bindingBadgeLabel,
} from "./bindings";
export { drawFrameBadge, badgeLabel, type BadgeLabeler } from "./ui/badges";
export type { Bindings, BindingSpec } from "./bindings";
export {
  isUserSlot, userSlotHint, userSlotBinding, collectUserSlots, USER_SCOPE, USER_SLOT_FIELD,
} from "./userSlots";
export type { UserSlot } from "./userSlots";
