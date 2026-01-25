import type { ImageFrameLayerData, HtmlLayerOutput } from "../types";
import {
  buildPositionStyles,
  buildTransform,
  stylesToString,
  getTransformOrigin,
} from "../cssUtils";
import { getClipPathCss, getInlineSvgClip } from "../clipPaths";

/**
 * Convertit un layer ImageFrame en HTML
 *
 * L'ImageFrame dans Fabric est un conteneur avec:
 * - Une taille fixe (frameWidth x frameHeight)
 * - Une image à l'intérieur qui peut être déplacée (offsetX, offsetY) et zoomée (scale)
 * - Un clip-path optionnel (circle, heart, hexagon, etc.)
 */
export function imageFrameToHtml(
  layer: ImageFrameLayerData,
  zIndex: number
): HtmlLayerOutput {
  const {
    left = 0,
    top = 0,
    frameWidth,
    frameHeight,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    clipShape,
    image,
    layerId,
  } = layer;

  // ImageFrame a toujours originX: "center", originY: "center" dans Fabric
  // Donc left/top pointent vers le centre, pas le coin haut-gauche
  // On doit soustraire la moitié de la taille (scalée) pour avoir le coin haut-gauche
  const scaledWidth = frameWidth * scaleX;
  const scaledHeight = frameHeight * scaleY;
  const adjustedLeft = left - scaledWidth / 2;
  const adjustedTop = top - scaledHeight / 2;

  // Container styles (le frame)
  const containerStyles = buildPositionStyles(adjustedLeft, adjustedTop, zIndex);
  containerStyles.width = `${frameWidth}px`;
  containerStyles.height = `${frameHeight}px`;
  // Note: on n'utilise PAS overflow:hidden quand on a un clip-path SVG
  // car ça couperait le SVG lui-même avant que le clip ne soit appliqué

  // Transform sur le container
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    containerStyles.transform = transform;
    // Pour un élément centré avec rotation, on doit utiliser center center
    containerStyles["transform-origin"] = "center center";
  }

  if (opacity !== 1) {
    containerStyles.opacity = String(opacity);
  }

  // Clip path - soit CSS simple, soit SVG inline pour les formes complexes
  let inlineSvgClip = "";
  const clipId = `clip-${layerId || Math.random().toString(36).substr(2, 9)}`;
  let useOverflowHidden = true; // Par défaut, on utilise overflow:hidden

  const clipPathCss = getClipPathCss(clipShape, frameWidth, frameHeight);
  if (clipPathCss) {
    // Formes simples (circle, rounded) - utiliser CSS clip-path
    containerStyles["clip-path"] = clipPathCss;
    useOverflowHidden = false; // Le clip-path gère le découpage
  } else if (clipShape === "heart" || clipShape === "hexagon") {
    // Formes complexes - utiliser SVG inline
    inlineSvgClip = getInlineSvgClip(clipShape, frameWidth, frameHeight, clipId) || "";
    if (inlineSvgClip) {
      containerStyles["clip-path"] = `url(#${clipId})`;
      useOverflowHidden = false; // Le clip-path SVG gère le découpage
    }
  }

  // Ajouter overflow:hidden seulement si pas de clip-path
  // (sinon le SVG contenant le clipPath serait lui-même coupé)
  if (useOverflowHidden) {
    containerStyles.overflow = "hidden";
  }

  // Image styles
  // L'image doit couvrir le frame et pouvoir être déplacée/zoomée
  const { offsetX = 0, offsetY = 0, scale: imageScale = 1 } = image;

  // Dans Fabric, l'image est positionnée relativement au centre du frame.
  // offsetX/Y = décalage de l'image par rapport au centre
  // On utilise une image en position absolue avec top/left pour le décalage
  const imageStyles: Record<string, string> = {
    position: "absolute",
    width: "100%",
    height: "100%",
    "object-fit": "cover",
    top: `${offsetY}px`,
    left: `${offsetX}px`,
  };

  // Pour le scale de l'image, on ajuste width/height et recentre
  if (imageScale !== 1) {
    imageStyles.width = `${imageScale * 100}%`;
    imageStyles.height = `${imageScale * 100}%`;
    // Ajuster top/left pour garder le centre
    const offsetFromScale = (1 - imageScale) * 50;
    imageStyles.left = `calc(${offsetFromScale}% + ${offsetX}px)`;
    imageStyles.top = `calc(${offsetFromScale}% + ${offsetY}px)`;
  }

  const html = `<div style="${stylesToString(containerStyles)}">
  ${inlineSvgClip}
  <img src="${image.src}" style="${stylesToString(imageStyles)}" alt="" />
</div>`;

  return {
    html,
    // Plus besoin de clipPathDefs globaux, on utilise des SVG inline
  };
}
