import type { LayerData } from "../types";
import type {
  HtmlRenderOptions,
  HtmlLayerOutput,
  ITextLayerData,
  RectLayerData,
  CircleLayerData,
  PathLayerData,
  ImageFrameLayerData,
} from "./types";
import {
  textToHtml,
  rectToHtml,
  circleToHtml,
  pathToHtml,
  imageFrameToHtml,
} from "./converters";
import { buildGoogleFontsUrl, stylesToString } from "./cssUtils";

/**
 * Convertit un layer en HTML selon son type
 */
function layerToHtml(layer: LayerData, zIndex: number): HtmlLayerOutput {
  switch (layer.type) {
    case "IText":
      return textToHtml(layer as ITextLayerData, zIndex);

    case "Rect":
      return rectToHtml(layer as RectLayerData, zIndex);

    case "Circle":
      return circleToHtml(layer as CircleLayerData, zIndex);

    case "Path":
      return pathToHtml(layer as PathLayerData, zIndex);

    case "ImageFrame":
      return imageFrameToHtml(layer as ImageFrameLayerData, zIndex);

    default:
      console.warn(`Unknown layer type: ${layer.type}`);
      return { html: `<!-- Unknown layer type: ${layer.type} -->` };
  }
}

/**
 * Génère le HTML pour l'image de fond
 */
function renderBackgroundImage(
  backgroundImage: string,
  width: number,
  height: number
): string {
  const styles: Record<string, string> = {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    "z-index": "0",
  };

  return `<img src="${backgroundImage}" style="${stylesToString(styles)}" alt="" />`;
}

/**
 * Génère l'import Google Fonts
 */
function renderFontImports(fonts: Set<string>, includeGoogleFonts: boolean): string {
  if (!includeGoogleFonts || fonts.size === 0) {
    return "";
  }

  const url = buildGoogleFontsUrl(Array.from(fonts));
  return `<link rel="stylesheet" href="${url}" />`;
}

/**
 * Convertit un tableau de layers Fabric en HTML
 *
 * @param layers Les données des layers (telles que retournées par serialize())
 * @param options Options de rendu (dimensions, background, etc.)
 * @returns Le HTML complet prêt à être affiché
 *
 * @example
 * ```typescript
 * const html = fabricToHtml(layers, {
 *   width: 800,
 *   height: 600,
 *   backgroundImage: 'https://example.com/bg.jpg',
 *   includeGoogleFonts: true
 * });
 * ```
 */
export function fabricToHtml(layers: LayerData[], options: HtmlRenderOptions): string {
  const {
    width,
    height,
    backgroundImage,
    containerClass = "",
    includeGoogleFonts = true,
  } = options;

  // Collecter toutes les dépendances
  const allFonts = new Set<string>();
  const htmlParts: string[] = [];

  // Traiter chaque layer
  layers.forEach((layer, index) => {
    // z-index commence à 1 (0 = background)
    const output = layerToHtml(layer, index + 1);

    htmlParts.push(output.html);

    // Collecter les fonts
    output.fonts?.forEach((font) => {
      allFonts.add(font);
    });
  });

  // Générer les parties globales
  const fontImports = renderFontImports(allFonts, includeGoogleFonts);

  // Container styles
  const containerStyles: Record<string, string> = {
    position: "relative",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
  };

  // Générer le background si présent
  const backgroundHtml = backgroundImage
    ? renderBackgroundImage(backgroundImage, width, height)
    : "";

  // Assembler le HTML final
  const classAttr = containerClass ? ` class="${containerClass}"` : "";

  return `${fontImports}
<div${classAttr} style="${stylesToString(containerStyles)}">
  ${backgroundHtml}
  ${htmlParts.join("\n  ")}
</div>`.trim();
}

/**
 * Convertit un seul layer en HTML (utile pour des updates partiels)
 */
export function layerToHtmlStandalone(
  layer: LayerData,
  zIndex: number
): HtmlLayerOutput {
  return layerToHtml(layer, zIndex);
}
