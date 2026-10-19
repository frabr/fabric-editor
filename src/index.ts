// Fabric Editor - Éditeur d'images basé sur Fabric.js
//
// Ce module fournit un éditeur d'images complet avec gestion des calques,
// formes, clips, et masques.

// Classe principale
export { FabricEditor } from "./FabricEditor";
export type { GradientStop } from "./editor/style-commands";
export { DesignCanvas, type FrameRect, type WorkspaceOptions } from "./DesignCanvas";
export { PreviewCanvas } from "./PreviewCanvas";

// Managers
export { LayerManager, LAYER_PROPS } from "./LayerManager";
export { SelectionManager } from "./SelectionManager";
export { MaskManager } from "./MaskManager";
export { PersistenceManager } from "./PersistenceManager";
export { HistoryManager } from "./HistoryManager";
export { SnappingManager } from "./SnappingManager";
export { LayoutManager } from "./LayoutManager";
export { CanvasGuides } from "./ui/guides";

// Handlers
export { DropHandler, canvasImageSource } from "./DropHandler";
export type { DropHandlerConfig, DragPayload, DropResult } from "./DropHandler";
export { PendingUploadsManager } from "./PendingUploadsManager";

// ImageFrame, et son recadrage
export { ImageFrame } from "./ImageFrame";
export { CropMode } from "./CropMode";
export { NO_CROP, MAX_CROP_SCALE, isCropped, photoRect, cropFromRect, panCrop, zoomCrop } from "./crop";
export type { Crop } from "./crop";

// OOP shape classes
export { FabRect, FabCircle, FabPath, type Lockable } from "./shapes";
export { rulesOf, kindOf, type ObjectRules, type ObjectKind, type ToolboxImageReaction } from "./capabilities";
export { toolsFor, selectionKindOf, type ToolId, type SelectionKind } from "./tools";

// Raccourcis : le gestionnaire, la table du canvas, les types d'entrée
export { ShortcutManager, type ShortcutManagerOptions } from "./shortcuts/ShortcutManager";
export { CANVAS_SHORTCUTS, isKeyShortcut } from "./shortcuts/table";
export { GestureManager, ROTATION_STEP } from "./gestures";
export type { ShortcutEntry, KeyShortcut, GestureShortcut, ShortcutContext, ShortcutGroup, ShortcutScope } from "./shortcuts/table";
export { parseCombo, formatCombo, formatModifier, detectPlatform, type Platform, type Modifier } from "./shortcuts/keys";

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
export { ResizeSession, StackResizeSession, ScaleSession, FreeResizeSession } from "./layout";
export type { LayoutData, SizingData, TextOverflow, ContainerData, ChildData, SizeMode, AlignSelf, AlignItems, JustifyContent, FlexDirection } from "./layout";
export { MIN_PAD } from "./layout";
// Les groupes (containers libres) : leur boîte suit leurs enfants
export { isFreeContainer, stackParentOf, fitFreeContainer } from "./layout";
export type { Arrangement } from "./layout";
// L'arbre de layout sur calques sérialisés (apibots : tracks, suppression ; creatorstudio : rendu).
export { layoutParents, layoutRoot, layoutChildren, layoutDescendants, stackBlock } from "./layout";
export type { TreeLayer, LayoutParents } from "./layout";
export { scaledSize, topLeft, pointInObject, clampTopLeft, hasExceededOffset } from "./layout";
export { ContainerizeSession, InsertChildSession, wrapContainerAroundChild, createDropSession } from "./layout";
export type { LayoutSession } from "./layout";
export { initYoga, yogaLayout } from "./layout";

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
  pendingBindings, hasPendingBindings, setTextContent, drawBindingBadge, bindingBadgeLabel,
} from "./bindings";
export { drawFrameBadge, badgeLabel, type BadgeLabeler } from "./ui/badges";
export { fontFamiliesOf, isBold, summarizeStyles, summarizeObject, MIXED, TEXT_STYLE_KEYS } from "./text-styles";
export type { TextStyleState, TextStyleKey, TextStyleValue } from "./text-styles";
export { isGhost, setGhost, GHOST_OPACITY } from "./ghost";
export { displayFill, setDisplayFill } from "./displayStyle";
export type { Bindings, BindingSpec } from "./bindings";
export {
  isUserSlot, userSlotHint, userSlotBinding, collectUserSlots, USER_SCOPE, USER_SLOT_FIELD,
} from "./userSlots";
export type { UserSlot } from "./userSlots";
export { DEFAULT_GUIDE_COLOR, DEFAULT_SNAP_GUIDE_COLOR } from "./ui/color";
