import type { ShapeType } from "../types";
import { HEART_PATH, HEXAGON_PATH } from "../shapes/paths";

/**
 * Génère le CSS clip-path pour une forme simple (circle, rounded)
 * Pour heart/hexagon, retourne undefined car ils nécessitent un SVG inline
 * @param shapeType Le type de forme
 * @param width Largeur de l'élément
 * @param height Hauteur de l'élément
 * @returns La valeur CSS clip-path ou undefined
 */
export function getClipPathCss(
  shapeType: ShapeType | undefined,
  width?: number,
  height?: number
): string | undefined {
  if (!shapeType || shapeType === "rect") {
    return undefined;
  }

  const w = width ?? 100;
  const h = height ?? 100;
  const minSize = Math.min(w, h);

  switch (shapeType) {
    case "circle": {
      // Cercle basé sur minSize, centré
      const radius = minSize / 2;
      return `circle(${radius}px at ${w / 2}px ${h / 2}px)`;
    }

    case "rounded": {
      // 15% du côté le plus petit, comme dans Fabric
      const radius = minSize * 0.15;
      return `inset(0 round ${radius}px)`;
    }

    case "heart":
    case "hexagon":
      // Ces formes nécessitent un SVG inline, géré par getInlineSvgClip
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Informations sur le path SVG d'une forme
 */
interface SvgPathInfo {
  path: string;
  // Dimensions du path original (bounding box)
  width: number;
  height: number;
  // Centre du path (pour le positionnement)
  centerX: number;
  centerY: number;
}

const SVG_PATH_INFO: Record<string, SvgPathInfo> = {
  heart: {
    path: HEART_PATH,
    // Dans Fabric: scaleX = minSize / 28, donc la taille de référence est 28
    // Le path est carré (28x28) pour le scaling
    width: 28,
    height: 28,
    centerX: 0,
    centerY: -0.5, // (13 + -14) / 2 = -0.5
  },
  hexagon: {
    path: HEXAGON_PATH,
    // Dans Fabric: scaleX = minSize / 48, donc la taille de référence est 48
    width: 48,
    height: 48,
    centerX: 0,
    centerY: 0,
  },
};

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
  clipId: string
): string | undefined {
  const pathInfo = SVG_PATH_INFO[shapeType];
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

