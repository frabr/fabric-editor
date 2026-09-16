// Shapes module - création et gestion des formes

// OOP shape classes
export { FabRect } from "./FabRect";
export { FabCircle } from "./FabCircle";
export { FabPath } from "./FabPath";
export { type Lockable } from "./lockMixin";
export { type Controllable } from "./controlsMixin";

// Factory functions (return Fab* instances)
export {
  createRect,
  createCircle,
  createImage,
  createShape,
  createPathShape,
  getShapeCatalog,
  type ShapeCatalogEntry,
} from "./factories";

export { SHAPE_PATHS, type ShapePath } from "./generated/paths";

// @legacy — shape switching and old path strings
export { HEART_PATH, HEXAGON_PATH } from "./paths";
export { nextShape, isValidShape, getAvailableShapes } from "./shapeWheel";
export { createHeart, createHexagon, switchShape } from "./factories";
