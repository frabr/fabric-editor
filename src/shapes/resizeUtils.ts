import { controlsUtils, type FabricObject } from "#fabric";

const { getLocalPoint } = controlsUtils;

/** Is the transform centered on both axes? */
export function isTransformCentered(transform: any): boolean {
  return transform.originX === "center" && transform.originY === "center";
}

/** En dessous, un coin ne réduit plus (un objet ne se retourne pas, ne disparaît pas). */
export const MIN_CORNER_SCALE = 0.05;

/**
 * Le facteur d'une poignée de coin, depuis le début du geste : la distance du pointeur au
 * coin d'ancrage (somme des deux axes, dans le repère de l'objet) rapportée à celle de
 * départ — le calcul de la poignée native de Fabric. Un coin conserve toujours les
 * proportions, pour toute chose : forme, image, texte, container. L'état de départ est
 * posé sur le `transform` du geste (un par geste), l'objet y est encore tel qu'on l'a pris.
 */
export function cornerScaleFactor(obj: FabricObject, transform: any, x: number, y: number): number {
  if (transform._cornerDistance === undefined) {
    const dim = obj._getTransformedDimensions();
    transform._cornerDistance = Math.abs(dim.x) + Math.abs(dim.y);
  }
  const start: number = transform._cornerDistance;
  if (start === 0) return 1;

  const local = getLocalPoint(transform, transform.originX, transform.originY, x, y);
  let k = (Math.abs(local.x) + Math.abs(local.y)) / start;
  if (isTransformCentered(transform)) k *= 2;
  return Math.max(MIN_CORNER_SCALE, k);
}
