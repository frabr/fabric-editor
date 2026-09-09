/**
 * Utilitaires pour générer du CSS à partir des propriétés Fabric
 */

export interface TransformOptions {
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  originX?: string;
  originY?: string;
}

/**
 * Convertit originX Fabric en CSS transform-origin
 */
function originXToCss(originX?: string): string {
  switch (originX) {
    case "center":
      return "center";
    case "right":
      return "right";
    case "left":
    default:
      return "left";
  }
}

/**
 * Convertit originY Fabric en CSS transform-origin
 */
function originYToCss(originY?: string): string {
  switch (originY) {
    case "center":
      return "center";
    case "bottom":
      return "bottom";
    case "top":
    default:
      return "top";
  }
}

/**
 * Génère le transform-origin CSS
 */
export function getTransformOrigin(originX?: string, originY?: string): string {
  return `${originXToCss(originX)} ${originYToCss(originY)}`;
}

/**
 * Calcule l'offset de position pour les éléments avec origin "center"
 * Dans Fabric, left/top pointent vers l'origin, pas le coin supérieur gauche
 *
 * Note: On n'utilise PAS le scale ici car le scale est appliqué via CSS transform.
 * Le transform scale autour de transform-origin, donc on doit juste décaler
 * de la moitié de la taille NON scalée.
 */
export function calculatePositionOffset(
  width: number,
  height: number,
  originX?: string,
  originY?: string
): { offsetX: number; offsetY: number } {
  let offsetX = 0;
  let offsetY = 0;

  if (originX === "center") {
    offsetX = -width / 2;
  } else if (originX === "right") {
    offsetX = -width;
  }

  if (originY === "center") {
    offsetY = -height / 2;
  } else if (originY === "bottom") {
    offsetY = -height;
  }

  return { offsetX, offsetY };
}

/**
 * Génère la propriété CSS transform
 */
export function buildTransform(options: TransformOptions): string {
  const transforms: string[] = [];

  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  const angle = options.angle ?? 0;

  if (angle !== 0) {
    transforms.push(`rotate(${angle}deg)`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    transforms.push(`scale(${scaleX}, ${scaleY})`);
  }

  return transforms.length > 0 ? transforms.join(" ") : "none";
}

/**
 * Génère les styles de position de base pour un layer
 */
export function buildPositionStyles(
  left: number,
  top: number,
  zIndex: number,
  options?: {
    width?: number;
    height?: number;
    originX?: string;
    originY?: string;
  }
): Record<string, string> {
  const styles: Record<string, string> = {
    position: "absolute",
    "z-index": String(zIndex),
  };

  // Calculer l'offset si nécessaire (pour origin center)
  if (options?.width && options?.height) {
    const { offsetX, offsetY } = calculatePositionOffset(
      options.width,
      options.height,
      options.originX,
      options.originY
    );
    styles.left = `${left + offsetX}px`;
    styles.top = `${top + offsetY}px`;
  } else {
    styles.left = `${left}px`;
    styles.top = `${top}px`;
  }

  return styles;
}

/**
 * Convertit un objet de styles en string CSS inline
 */
export function stylesToString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

/**
 * Échappe les caractères HTML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Génère l'URL Google Fonts pour une liste de fonts
 */
export function buildGoogleFontsUrl(fonts: string[]): string {
  if (fonts.length === 0) return "";

  const families = fonts
    .map((font) => font.replace(/ /g, "+"))
    .map((font) => `family=${font}:wght@400;700`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
