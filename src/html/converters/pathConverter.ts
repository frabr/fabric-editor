import type { PathLayerData, HtmlLayerOutput } from "../types";
import {
  buildPositionStyles,
  buildTransform,
  stylesToString,
  getTransformOrigin,
} from "../cssUtils";

/**
 * Convertit un path array Fabric en string SVG
 */
function pathArrayToString(path: unknown[]): string {
  return path
    .map((segment) => {
      if (Array.isArray(segment)) {
        return segment.join(" ");
      }
      return String(segment);
    })
    .join(" ");
}

/**
 * Convertit un layer Path en HTML (utilise SVG inline)
 */
export function pathToHtml(layer: PathLayerData, zIndex: number): HtmlLayerOutput {
  const {
    left = 0,
    top = 0,
    path,
    width = 100,
    height = 100,
    scaleX = 1,
    scaleY = 1,
    angle = 0,
    opacity = 1,
    fill = "transparent",
    stroke,
    strokeWidth = 1,
    originX = "center",
    originY = "center",
    pathCenterY = 0,
  } = layer;

  // Convertir le path en string si c'est un array
  const pathString = Array.isArray(path) ? pathArrayToString(path) : path;

  // Container styles
  const containerStyles = buildPositionStyles(left, top, zIndex, {
    width,
    height,
    originX,
    originY,
  });

  // Transform sur le container
  const transform = buildTransform({ scaleX, scaleY, angle });
  if (transform !== "none") {
    containerStyles.transform = transform;
    containerStyles["transform-origin"] = getTransformOrigin(originX, originY);
  }

  if (opacity !== 1) {
    containerStyles.opacity = String(opacity);
  }

  // Générer le SVG inline
  // Le viewBox doit correspondre aux bounds du path dans Fabric
  // Fabric centre le path sur son bounding box, donc le viewBox va de -width/2 à +width/2
  // pathCenterY compense si le path n'est pas centré sur Y=0
  // Ex: HEART_PATH va de Y=-14 à Y=13, centre = -0.5
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const html = `<div style="${stylesToString(containerStyles)}">
  <svg width="${width}" height="${height}" viewBox="${-halfWidth} ${-halfHeight + pathCenterY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <path d="${pathString}" fill="${fill || "none"}" stroke="${stroke || "none"}" stroke-width="${strokeWidth}" />
  </svg>
</div>`;

  return { html };
}
