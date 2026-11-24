import type { FabricObject } from "#fabric";

/**
 * Deux états d'auteur d'un objet absent de la sortie (apibots : un calque masqué par sa
 * condition de visibilité pour le sujet d'aperçu, et ses descendants). L'hôte les pose et les
 * retire d'après ce qu'il sait ; la lib ne fait que les rendre.
 *
 * - Un **fantôme** est rendu à 22 % : sélectionnable, déplaçable, dans le flux de sa pile —
 *   l'objet révélé pour être réglé.
 * - Un objet **éclipsé** n'est ni dessiné, ni atteignable au pointeur, ni compté par le layout
 *   (hors du flux de sa pile, hors de la boîte d'un groupe libre) : le canvas montre ce que le
 *   rendu montrera, les voisins se resserrent. C'est l'état par défaut d'un masqué ; l'hôte
 *   le signale à côté (une pastille) et le révèle en fantôme à la demande.
 *
 * Jamais sérialisés : ni `ghost` ni `eclipsed` ne sont dans `toObject`, un instantané
 * d'historique ou un export n'en portent pas la trace — l'hôte les repose après chaque
 * chargement.
 */
export const GHOST_OPACITY = 0.22;

type Ghostable = FabricObject & { ghost?: boolean; eclipsed?: boolean };

export function isGhost(obj: FabricObject): boolean {
  return (obj as Ghostable).ghost === true;
}

/** Pose ou retire le fantôme ; rend true si l'état a changé (à l'hôte de redessiner). */
export function setGhost(obj: FabricObject, ghost: boolean): boolean {
  if (isGhost(obj) === ghost) return false;
  (obj as Ghostable).ghost = ghost || undefined;
  return true;
}

export function isEclipsed(obj: FabricObject): boolean {
  return (obj as Ghostable).eclipsed === true;
}

/** Pose ou retire l'éclipse ; rend true si l'état a changé (à l'hôte de relancer le layout et
 *  de redessiner — l'objet entre ou sort du flux). */
export function setEclipsed(obj: FabricObject, eclipsed: boolean): boolean {
  if (isEclipsed(obj) === eclipsed) return false;
  (obj as Ghostable).eclipsed = eclipsed || undefined;
  return true;
}

type Renderable = {
  render: (ctx: CanvasRenderingContext2D) => void;
  containsPoint: (...args: unknown[]) => boolean;
};

/**
 * Installe le rendu fantôme et l'éclipse sur une classe. Fantôme : l'alpha ambiant est réduit
 * le temps du rendu de l'objet (fabric multiplie ensuite par l'opacité propre), et rien
 * d'autre ne change — le cache de rendu de l'objet reste valide, l'alpha s'applique au dessin
 * sur le canvas. Éclipse : rien n'est dessiné, et le pointeur traverse l'objet.
 */
export function installGhostRendering(target: object): void {
  const proto = target as Renderable;
  const original = proto.render;
  const originalContains = proto.containsPoint;

  proto.containsPoint = function (this: FabricObject, ...args: unknown[]) {
    return isEclipsed(this) ? false : originalContains.apply(this, args);
  };

  proto.render = function (this: FabricObject, ctx: CanvasRenderingContext2D) {
    if (isEclipsed(this)) return;
    if (!isGhost(this)) return original.call(this, ctx);

    ctx.save();
    ctx.globalAlpha *= GHOST_OPACITY;
    try {
      original.call(this, ctx);
    } finally {
      ctx.restore();
    }
  };
}
