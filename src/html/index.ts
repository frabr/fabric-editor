// HTML Renderer - Convertit les layers Fabric en HTML/CSS
export { fabricToHtml, layerToHtmlStandalone } from "./htmlRenderer";

// Types
export type {
  HtmlRenderOptions,
  HtmlLayerOutput,
  ITextLayerData,
  RectLayerData,
  CircleLayerData,
  PathLayerData,
  ImageFrameLayerData,
  ImageFrameImageData,
  SupportedLayerData,
} from "./types";

// Converters individuels (pour usage avancé)
export {
  textToHtml,
  rectToHtml,
  circleToHtml,
  pathToHtml,
  imageFrameToHtml,
} from "./converters";

// Utilitaires (pour extension)
export { getClipPathCss, getInlineSvgClip } from "./clipPaths";
export { buildGoogleFontsUrl, escapeHtml, stylesToString } from "./cssUtils";
