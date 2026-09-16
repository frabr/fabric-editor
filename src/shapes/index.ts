// Shapes module - création et gestion des formes

export {
  createRect,
  createRoundedRect,
  createCircle,
  createImage,
  createShape,
  createPathShape,
  installPathResizeHandler,
  getShapeCatalog,
  type ShapeCatalogEntry,
} from "./factories";

export { SHAPE_PATHS, type ShapePath } from "./generated/paths";

// @legacy — shape switching and old path strings
export { HEART_PATH, HEXAGON_PATH } from "./paths";
export { nextShape, isValidShape, getAvailableShapes } from "./shapeWheel";
export { createHeart, createHexagon, switchShape } from "./factories";
