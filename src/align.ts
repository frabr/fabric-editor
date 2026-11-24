/**
 * Aligner et répartir : la géométrie, en fonctions pures sur des boîtes (coordonnées scène,
 * alignées sur les axes). L'éditeur décide de la référence (la sélection, le container,
 * l'artboard) et de ce qui bouge ; ici, seulement de combien.
 */
import type { Box } from "./layout/geometry";

export { unionBox, type Box } from "./layout/geometry";

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export interface Delta {
  dx: number;
  dy: number;
}

/** L'axe d'un alignement : gauche, centre, droite sont horizontaux. */
export function alignAxis(edge: AlignEdge): "x" | "y" {
  return edge === "left" || edge === "center" || edge === "right" ? "x" : "y";
}

/** Le déplacement qui aligne `box` sur le bord (ou le centre) `edge` de `ref`. */
export function alignDelta(box: Box, ref: Box, edge: AlignEdge): Delta {
  switch (edge) {
    case "left": return { dx: ref.left - box.left, dy: 0 };
    case "center": return { dx: ref.left + ref.width / 2 - (box.left + box.width / 2), dy: 0 };
    case "right": return { dx: ref.left + ref.width - (box.left + box.width), dy: 0 };
    case "top": return { dx: 0, dy: ref.top - box.top };
    case "middle": return { dx: 0, dy: ref.top + ref.height / 2 - (box.top + box.height / 2) };
    case "bottom": return { dx: 0, dy: ref.top + ref.height - (box.top + box.height) };
  }
}

/**
 * Les déplacements qui répartissent les boîtes à espace égal sur un axe : les deux
 * extrêmes restent en place, les autres se rangent entre elles dans leur ordre actuel.
 * Rendus dans l'ordre des boîtes reçues ; moins de trois boîtes : rien ne bouge.
 */
export function distributeDeltas(boxes: Box[], axis: DistributeAxis): Delta[] {
  const deltas = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return deltas;

  const start = axis === "horizontal" ? "left" : "top";
  const size = axis === "horizontal" ? "width" : "height";
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a][start] - boxes[b][start]);

  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const span = last[start] + last[size] - first[start];
  const filled = order.reduce((sum, i) => sum + boxes[i][size], 0);
  const gap = (span - filled) / (order.length - 1);

  let cursor = first[start] + first[size] + gap;
  for (const i of order.slice(1, -1)) {
    const shift = cursor - boxes[i][start];
    deltas[i] = axis === "horizontal" ? { dx: shift, dy: 0 } : { dx: 0, dy: shift };
    cursor += boxes[i][size] + gap;
  }
  return deltas;
}
