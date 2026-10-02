import type { FabricObject } from "#fabric";

/**
 * Les badges de cadre — brutalistes : un rectangle net, collé au contour, sans arrondi. Ils
 * accompagnent le CADRE, pas le calque : ils ne s'affichent qu'avec lui (survol ou
 * sélection), comme une étiquette du cadre.
 *
 * Ils sont peints sur le canvas PRINCIPAL, juste avant que fabric y dessine les contrôles de
 * l'objet actif : les poignées passent par-dessus, quel que soit le badge. Un badge de plus =
 * un `BadgeLabeler` de plus — rien à dessiner, rien à ordonner.
 */

/** Ce qu'un objet affiche en badge, ou null. */
export type BadgeLabeler = (obj: FabricObject) => string | null;

export const BADGE_HEIGHT = 15;
export const BADGE_PAD = 5;
export const BADGE_FONT = "500 10px ui-sans-serif, system-ui, sans-serif";

/**
 * Peint un badge au coin haut-gauche du cadre. Il réutilise la position que fabric a déjà
 * calculée pour ses poignées : `oCoords` est en espace écran (viewportTransform et zoom
 * compris) — c'est ce qui le fait suivre à toutes les échelles.
 */
export function drawFrameBadge(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  label: string,
  color: string,
): void {
  const corner = (obj as unknown as { oCoords?: Record<string, { x: number; y: number }> }).oCoords?.tl;
  if (!corner) return;

  ctx.save();
  ctx.font = BADGE_FONT;
  const width = ctx.measureText(label).width + BADGE_PAD * 2;
  // Collé au contour : le bas du badge EST le haut du cadre, et son bord gauche déborde
  // d'un pixel pour s'aligner sur l'extérieur de la bordure.
  const left = corner.x - 1;
  const top = corner.y - BADGE_HEIGHT;

  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, BADGE_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + BADGE_PAD, top + BADGE_HEIGHT / 2);
  ctx.restore();
}

/** Les labels d'un objet réunis en un seul badge (dédoublonnés), ou null. */
export function badgeLabel(obj: FabricObject, labelers: BadgeLabeler[]): string | null {
  const labels = labelers.map((labeler) => labeler(obj)).filter((label): label is string => Boolean(label));
  return labels.length ? [...new Set(labels)].join(" ") : null;
}

/**
 * Installe la couche des badges sur un canvas fabric : avant chaque dessin des contrôles,
 * un badge par objet visé (`targets` : la sélection, le survol).
 */
export function installBadgeLayer(
  fabricCanvas: { drawControls: (ctx: CanvasRenderingContext2D) => void },
  color: string,
  labelers: BadgeLabeler[],
  targets: () => FabricObject[],
): void {
  const drawControls = fabricCanvas.drawControls.bind(fabricCanvas);

  fabricCanvas.drawControls = (ctx: CanvasRenderingContext2D) => {
    targets().forEach((obj) => {
      const label = badgeLabel(obj, labelers);
      if (label) drawFrameBadge(ctx, obj, label, color);
    });
    drawControls(ctx);
  };
}
