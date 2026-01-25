import type { ITextLayerData, HtmlLayerOutput } from "../types";
import {
  buildPositionStyles,
  buildTransform,
  stylesToString,
  escapeHtml,
  getTransformOrigin,
} from "../cssUtils";

/**
 * Convertit un layer IText en HTML
 */
export function textToHtml(layer: ITextLayerData, zIndex: number): HtmlLayerOutput {
  const {
    text,
    left = 0,
    top = 0,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "#000000",
    fontFamily = "Arial",
    fontSize = 16,
    fontWeight = "normal",
    fontStyle = "normal",
    textAlign = "left",
    lineHeight = 1.16,
    charSpacing = 0,
    underline = false,
    linethrough = false,
    overline = false,
    originX = "left",
    originY = "top",
    width,
    height,
  } = layer;

  // Styles de position
  const styles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY,
  });

  // Transform
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    styles.transform = transform;
    styles["transform-origin"] = getTransformOrigin(originX, originY);
  }

  // Styles de texte
  styles.color = fill;
  styles["font-family"] = `'${fontFamily}', sans-serif`;
  styles["font-size"] = `${fontSize}px`;
  styles["font-weight"] = fontWeight;
  styles["font-style"] = fontStyle;
  styles["text-align"] = textAlign;
  styles["line-height"] = String(lineHeight);
  // Le texte ne doit pas wrapper - Fabric applique le scale après le layout
  styles["white-space"] = "nowrap";

  if (opacity !== 1) {
    styles.opacity = String(opacity);
  }

  // Letter spacing (Fabric utilise 1/1000 em, CSS utilise em)
  if (charSpacing !== 0) {
    styles["letter-spacing"] = `${charSpacing / 1000}em`;
  }

  // Text decoration
  const decorations: string[] = [];
  if (underline) decorations.push("underline");
  if (linethrough) decorations.push("line-through");
  if (overline) decorations.push("overline");
  if (decorations.length > 0) {
    styles["text-decoration"] = decorations.join(" ");
  }

  // Convertir les sauts de ligne en <br>
  const htmlText = escapeHtml(text).replace(/\n/g, "<br>");

  const html = `<div style="${stylesToString(styles)}">${htmlText}</div>`;

  return {
    html,
    fonts: [fontFamily],
  };
}
