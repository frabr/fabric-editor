import type { FabricObject } from "fabric";

/**
 * Calcule les facteurs d'anti-scale pour maintenir les proportions d'un clip
 * sur un objet étendu de manière non-uniforme.
 *
 * Quand un objet est étiré (scaleX !== scaleY), les clips appliqués seraient
 * également étirés. Cette fonction calcule les facteurs de compensation
 * pour que le clip garde ses proportions.
 *
 * @param obj - L'objet Fabric avec des propriétés scaleX et scaleY
 * @returns Tuple [scaleX, scaleY] pour compenser le scale de l'objet
 *
 * @example
 * // Objet étiré horizontalement (scaleX: 2, scaleY: 1)
 * antiScale(obj) // Retourne [0.5, 1] pour compenser
 */
export function antiScale(obj: FabricObject): [number, number] {
  const ratio = obj.scaleY / obj.scaleX;

  if (ratio < 1) {
    // L'objet est plus étiré horizontalement
    return [ratio, 1];
  } else {
    // L'objet est plus étiré verticalement (ou égal)
    return [1, 1 / ratio];
  }
}

export default antiScale;
