import type { RectLayerData, HtmlLayerOutput } from "../types";
import {
  buildPositionStyles,
  buildTransform,
  stylesToString,
  getTransformOrigin,
} from "../cssUtils";

/**
 * Convertit un layer Rect en HTML
 */
export function rectToHtml(layer: RectLayerData, zIndex: number): HtmlLayerOutput {
  const {
    left = 0,
    top = 0,
    width,
    height,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 0,
    rx = 0,
    ry = 0,
    originX = "left",
    originY = "top",
  } = layer;

  // Styles de position
  const styles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY,
  });

  // Dimensions (sans scale, le scale est dans transform)
  styles.width = `${width}px`;
  styles.height = `${height}px`;

  // Transform
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }

  // Couleurs
  styles.background = fill || "transparent";

  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }

  // Border radius
  if (rx > 0 || ry > 0) {
    // Fabric utilise rx/ry en pixels absolus
    styles["border-radius"] = rx === ry ? `${rx}px` : `${rx}px / ${ry}px`;
  }

  // Stroke
  if (stroke && strokeWidth > 0) {
    styles.border = `${strokeWidth}px solid ${stroke}`;
    styles["box-sizing"] = "border-box";
  }

  const html = `<div style="${stylesToString(styles)}"></div>`;

  return { html };
}
