import type { FabricObject } from "#fabric";

/**
 * Un fantôme : un objet rendu à 22 % — présent dans l'éditeur pour être réglé, absent de la
 * sortie. L'hôte le pose et le retire d'après ce qu'il sait (apibots : un calque masqué par
 * sa condition de visibilité pour le sujet d'aperçu, et ses descendants) ; la lib ne fait
 * que le rendre. L'objet reste sélectionnable, déplaçable, dans le flux de sa pile : c'est
 * une vue d'auteur, la vue fidèle est celle du rendu.
 *
 * Jamais sérialisé : `ghost` n'est pas dans `toObject`, un instantané d'historique ou un
 * export n'en portent pas la trace — l'hôte le repose après chaque chargement.
 */
export const GHOST_OPACITY = 0.22;

type Ghostable = FabricObject & { ghost?: boolean };

export function isGhost(obj: FabricObject): boolean {
  return (obj as Ghostable).ghost === true;
}

/** Pose ou retire le fantôme ; rend true si l'état a changé (à l'hôte de redessiner). */
export function setGhost(obj: FabricObject, ghost: boolean): boolean {
  if (isGhost(obj) === ghost) return false;
  (obj as Ghostable).ghost = ghost || undefined;
  return true;
}

type Renderable = { render: (ctx: CanvasRenderingContext2D) => void };

/**
 * Installe le rendu fantôme sur une classe : l'alpha ambiant est réduit le temps du rendu
 * de l'objet (fabric multiplie ensuite par l'opacité propre), et rien d'autre ne change —
 * le cache de rendu de l'objet reste valide, l'alpha s'applique au dessin sur le canvas.
 */
export function installGhostRendering(target: object): void {
  const proto = target as Renderable;
  const original = proto.render;

  proto.render = function (this: FabricObject, ctx: CanvasRenderingContext2D) {
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
