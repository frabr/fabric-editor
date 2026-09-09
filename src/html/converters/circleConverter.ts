import type { CircleLayerData, HtmlLayerOutput } from "../types";
import {
  buildPositionStyles,
  buildTransform,
  stylesToString,
  getTransformOrigin,
} from "../cssUtils";

/**
 * Convertit un layer Circle en HTML
 */
export function circleToHtml(layer: CircleLayerData, zIndex: number): HtmlLayerOutput {
  const {
    left = 0,
    top = 0,
    radius,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 0,
    originX = "center",
    originY = "center",
  } = layer;

  const diameter = radius * 2;

  // Styles de position
  const styles = buildPositionStyles(left, top, zIndex, {
    width: diameter,
    height: diameter,
    originX,
    originY,
  });

  // Dimensions
  styles.width = `${diameter}px`;
  styles.height = `${diameter}px`;

  // Transform
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }

  // Forme circulaire
  styles["border-radius"] = "50%";

  // Couleurs
  styles.background = fill || "transparent";

  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }

  // Stroke
  if (stroke && strokeWidth > 0) {
    styles.border = `${strokeWidth}px solid ${stroke}`;
    styles["box-sizing"] = "border-box";
  }

  const html = `<div style="${stylesToString(styles)}"></div>`;

  return { html };
}
