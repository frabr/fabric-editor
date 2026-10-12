import type { ImageFrameLayerData, HtmlLayerOutput } from "../types";
import { buildPositionStyles, buildTransform, stylesToString } from "../cssUtils";
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
    clipData,
    cornerRadius,
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

  const clipPathCss = getClipPathCss(clipShape, frameWidth, frameHeight, cornerRadius);
  if (clipPathCss) {
    // Formes simples (circle, rounded) - utiliser CSS clip-path
    containerStyles["clip-path"] = clipPathCss;
    useOverflowHidden = false; // Le clip-path gère le découpage
  } else if (clipShape && clipShape !== "rect") {
    // Path shapes (heart, hexagon, etc.) - utiliser SVG inline
    inlineSvgClip = getInlineSvgClip(clipShape, frameWidth, frameHeight, clipId, clipData) || "";
    if (inlineSvgClip) {
      containerStyles["clip-path"] = `url(#${clipId})`;
      useOverflowHidden = false;
    }
  }

  // Ajouter overflow:hidden seulement si pas de clip-path
  // (sinon le SVG contenant le clipPath serait lui-même coupé)
  if (useOverflowHidden) {
    containerStyles.overflow = "hidden";
  }

  const imageStyles = imageStylesFor(image);

  // Un cadre en attente (pas de src) : le clip seul, pas d'image cassée.
  const img = image.src ? `<img src="${image.src}" style="${stylesToString(imageStyles)}" alt="" />` : "";
  const html = `<div style="${stylesToString(containerStyles)}">
  ${inlineSvgClip}
  ${img}
</div>`;

  return {
    html,
    // Plus besoin de clipPathDefs globaux, on utilise des SVG inline
  };
}

/**
 * L'image dans son cadre, en CSS, sans connaître sa taille : une boîte de `scale` fois le
 * cadre (même ratio, donc cover × scale), calée à cropX/cropY, et l'image calée au même
 * point dans la boîte (object-position) — c'est la formule de crop.ts.
 * Les documents d'avant (décalage du centre en pixels) gardent leur rendu.
 */
function imageStylesFor(image: ImageFrameLayerData["image"]): Record<string, string> {
  const { cropX, cropY, offsetX = 0, offsetY = 0, scale = 1 } = image;
  const styles: Record<string, string> = { position: "absolute", "object-fit": "cover" };

  if (cropX === undefined && cropY === undefined && (offsetX || offsetY)) {
    const offsetFromScale = (1 - scale) * 50;
    styles.width = `${scale * 100}%`;
    styles.height = `${scale * 100}%`;
    styles.left = `calc(${offsetFromScale}% + ${offsetX}px)`;
    styles.top = `calc(${offsetFromScale}% + ${offsetY}px)`;
    return styles;
  }

  const x = cropX ?? 0.5;
  const y = cropY ?? 0.5;
  styles.width = `${scale * 100}%`;
  styles.height = `${scale * 100}%`;
  styles.left = `${x * (1 - scale) * 100}%`;
  styles.top = `${y * (1 - scale) * 100}%`;
  styles["object-position"] = `${x * 100}% ${y * 100}%`;
  return styles;
}
