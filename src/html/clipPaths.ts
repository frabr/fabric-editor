import type { ShapeType } from "../types";
import { getCatalogShape, isMonoPath, type ClipData } from "../shapes/registry";

/**
 * Génère le CSS clip-path pour une forme simple (circle, rect with cornerRadius)
 * Pour heart/hexagon, retourne undefined car ils nécessitent un SVG inline
 * @param shapeType Le type de forme
 * @param width Largeur de l'élément
 * @param height Hauteur de l'élément
 * @param cornerRadius Rayon des coins en pixels (uniquement pour "rect")
 * @returns La valeur CSS clip-path ou undefined
 */
export function getClipPathCss(
  shapeType: ShapeType | undefined,
  width?: number,
  height?: number,
  cornerRadius?: number,
): string | undefined {
  if (!shapeType) return undefined;

  const w = width ?? 100;
  const h = height ?? 100;
  const minSize = Math.min(w, h);

  switch (shapeType) {
    case "rect": {
      if (!cornerRadius) return undefined;
      const r = Math.min(cornerRadius, minSize / 2);
      return `inset(0 round ${r}px)`;
    }

    case "circle": {
      const radius = minSize / 2;
      return `circle(${radius}px at ${w / 2}px ${h / 2}px)`;
    }

    default:
      // Path shapes (heart, hexagon, etc.) use SVG inline via getInlineSvgClip
      return undefined;
  }
}

/**
 * Informations sur le path SVG d'une forme
 */
interface SvgPathInfo {
  path: string;
  /** Actual width of the path within the 100x100 box. */
  width: number;
  /** Actual height of the path within the 100x100 box. */
  height: number;
  /** Center is always 50,50 (paths are centered in the box). */
  centerX: number;
  centerY: number;
}

/**
 * Résolution paresseuse : le registre est injecté à l'init (registerShapes), une
 * map construite au chargement du module serait toujours vide. clipData inliné
 * (nouveaux documents) prime sur le registre (stock legacy par id).
 */
function svgPathInfo(shapeType: ShapeType, clipData?: ClipData): SvgPathInfo | undefined {
  if (clipData) {
    return { path: clipData.d, width: clipData.width, height: clipData.height, centerX: 50, centerY: 50 };
  }
  const shape = getCatalogShape(shapeType);
  if (!shape || !isMonoPath(shape)) return undefined;

  return { path: shape.paths[0].d, width: shape.width, height: shape.height, centerX: 50, centerY: 50 };
}

/**
 * Génère un SVG inline pour le clip-path de formes complexes (heart, hexagon)
 * Le SVG est positionné de manière absolue et utilise le path scalé pour
 * remplir tout le frame (comme dans Fabric).
 *
 * @param shapeType Le type de forme
 * @param frameWidth Largeur du frame
 * @param frameHeight Hauteur du frame
 * @param clipId ID unique pour le clipPath
 * @returns Le HTML du SVG inline ou undefined
 */
export function getInlineSvgClip(
  shapeType: ShapeType,
  frameWidth: number,
  frameHeight: number,
  clipId: string,
  clipData?: ClipData,
): string | undefined {
  const pathInfo = svgPathInfo(shapeType, clipData);
  if (!pathInfo) return undefined;

  // Scale uniforme pour "contain" le path dans le frame (comme object-fit: contain)
  // On prend le min des deux scales pour que le path tienne entièrement
  const scaleX = frameWidth / pathInfo.width;
  const scaleY = frameHeight / pathInfo.height;
  const scaleFactor = Math.min(scaleX, scaleY);

  // Centre du frame
  const frameCenterX = frameWidth / 2;
  const frameCenterY = frameHeight / 2;

  // Le path n'est pas forcément centré sur (0,0), on doit compenser
  // Transform SVG s'applique de droite à gauche :
  // 1. translate(-pathCenterX, -pathCenterY) : centre le path sur (0,0)
  // 2. scale(scaleFactor) : scale uniforme pour "cover"
  // 3. translate(frameCenterX, frameCenterY) : positionne au centre du frame
  const transform = `translate(${frameCenterX}, ${frameCenterY}) scale(${scaleFactor}) translate(${-pathInfo.centerX}, ${-pathInfo.centerY})`;

  return `<svg width="${frameWidth}" height="${frameHeight}" style="position: absolute; top: 0; left: 0; pointer-events: none;">
  <defs>
    <clipPath id="${clipId}">
      <path d="${pathInfo.path}" transform="${transform}" />
    </clipPath>
  </defs>
</svg>`;
}

