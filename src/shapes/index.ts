// Shapes module - création et gestion des formes

export { HEART_PATH, HEXAGON_PATH } from "./paths";
export { nextShape, isValidShape, getAvailableShapes } from "./shapeWheel";
export {
  createRect,
  createRoundedRect,
  createCircle,
  createHeart,
  createHexagon,
  createImage,
  createShape,
  switchShape,
} from "./factories";
