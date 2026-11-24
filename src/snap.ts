/**
 * L'aimant d'un déplacement, façon guides (Figma, Canva) : le bord ou le centre de l'objet
 * qui passe près d'un bord ou d'un centre d'une cible (un autre objet, la page) s'y cale,
 * et un guide joint les deux.
 *
 * Un centre se cale sur un centre, un bord sur un bord (gauche ou droit, haut ou bas) —
 * jamais un bord sur un centre : ces repères croisés en multipliaient de voisins.
 *
 * L'aimant part à chaque mouvement de la position BRUTE (celle que le pointeur donne —
 * fabric la recalcule depuis le pointeur à chaque événement), jamais de la position déjà
 * aimantée : il lâche l'objet dès que le pointeur sort du seuil, rien ne coince. Seule
 * mémoire : le guide déjà actif (`keep`) est préféré tant qu'il reste dans le seuil — sinon,
 * entre deux repères voisins, l'objet sauterait de l'un à l'autre au moindre mouvement.
 */

export interface SnapBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** La page elle-même (ses bords, son centre) — son centre se trace autrement. */
  page?: boolean;
}

/** Un guide : un trait sur l'axe `axis` (x : vertical, y : horizontal) à la coordonnée
 *  `at`, de `from` à `to` sur l'autre axe. `center` : il joint deux centres ; `page` : sa
 *  cible est la page — les deux ensemble, c'est « centré sur la page », le repère rouge. */
export interface SnapGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
  center?: boolean;
  page?: boolean;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  /** Le centre de l'objet une fois calé — où se dessine la croix du centrage. */
  center: { x: number; y: number };
}

/** Les guides actifs, par axe : ce que le prochain mouvement préfère garder. */
export interface SnapKeep {
  x?: number;
  y?: number;
}

interface Candidate {
  at: number;
  delta: number;
  target: SnapBox;
  center: boolean;
}

interface Mark {
  at: number;
  center: boolean;
}

/** Les trois repères d'une boîte sur un axe : ses deux bords, son centre. */
const marks = (start: number, size: number): Mark[] => [
  { at: start, center: false },
  { at: start + size / 2, center: true },
  { at: start + size, center: false },
];

/**
 * Le décalage qui cale `moving` sur la cible la plus proche, axe par axe, dans `threshold`
 * (unités du document) — et les guides à tracer. `keep` : les guides du mouvement précédent.
 */
export function snapMove(moving: SnapBox, targets: SnapBox[], threshold: number, keep: SnapKeep = {}): SnapResult {
  let bestX: Candidate | null = null;
  let bestY: Candidate | null = null;

  for (const target of targets) {
    bestX = closest(bestX, marks(moving.left, moving.width), marks(target.left, target.width), threshold, target, keep.x);
    bestY = closest(bestY, marks(moving.top, moving.height), marks(target.top, target.height), threshold, target, keep.y);
  }

  const dx = bestX?.delta ?? 0;
  const dy = bestY?.delta ?? 0;
  const placed = { ...moving, left: moving.left + dx, top: moving.top + dy };
  const guides: SnapGuide[] = [];
  if (bestX) guides.push(guide("x", bestX, placed.top, placed.height, bestX.target.top, bestX.target.height));
  if (bestY) guides.push(guide("y", bestY, placed.left, placed.width, bestY.target.left, bestY.target.width));
  const center = { x: placed.left + placed.width / 2, y: placed.top + placed.height / 2 };
  return { dx, dy, guides, center };
}

function closest(
  best: Candidate | null,
  own: Mark[],
  theirs: Mark[],
  threshold: number,
  target: SnapBox,
  kept: number | undefined,
): Candidate | null {
  for (const a of own) {
    for (const b of theirs) {
      if (a.center !== b.center) continue;
      const delta = b.at - a.at;
      if (Math.abs(delta) > threshold) continue;
      if (!best || better(b.at, delta, best, kept)) best = { at: b.at, delta, target, center: a.center };
    }
  }
  return best;
}

/** Le guide gardé l'emporte ; sinon, le plus court écart. */
function better(at: number, delta: number, best: Candidate, kept: number | undefined): boolean {
  if (best.at === kept) return false;
  if (at === kept) return true;
  return Math.abs(delta) < Math.abs(best.delta);
}

/** Le guide joint l'objet et sa cible sur l'autre axe. */
function guide(axis: "x" | "y", best: Candidate, start: number, size: number, targetStart: number, targetSize: number): SnapGuide {
  const line: SnapGuide = {
    axis, at: best.at, from: Math.min(start, targetStart), to: Math.max(start + size, targetStart + targetSize),
  };
  if (best.center) line.center = true;
  if (best.target.page) line.page = true;
  return line;
}
