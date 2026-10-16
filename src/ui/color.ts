/**
 * Shared color utilities for canvas UI (guides, controls, overlays).
 */

/** Parse a hex color (#rgb or #rrggbb) into [r, g, b]. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Return an rgba() string from a hex color + alpha. */
export function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * La couleur de l'éditeur quand l'hôte n'en donne pas (`guideColor`) : sélection, liseré du
 * cadre, médias à fournir, recadrage.
 */
export const DEFAULT_GUIDE_COLOR = "#d946ef";

/**
 * Les guides d'aimantation et de mise en page, quand l'hôte ne donne pas de `guideColor` : le
 * magenta franc des outils de design (Canva, Figma) — un code que les gens reconnaissent.
 */
export const DEFAULT_SNAP_GUIDE_COLOR = "#ff00ff";

/** Le repère du centrage sur la page : le rouge des repères de Figma — il dit « centré »,
 *  là où le magenta dit « aligné sur quelque chose ». */
export const DEFAULT_CENTER_GUIDE_COLOR = "#f24822";
