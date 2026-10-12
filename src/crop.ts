/**
 * Le recadrage d'une image dans son cadre (ImageFrame) : trois nombres, normalisés.
 *
 * L'image couvre d'abord le cadre tout juste (cover), puis se grossit de `scale` (≥ 1) et
 * se cale à `x`, `y` (0 → 1, 0.5 = centrée). Dans le repère du cadre (largeur W, hauteur
 * H, origine en haut à gauche), l'image affichée occupe :
 *   Iw = largeur cover × scale          L = x × (W − Iw)
 *   Ih = hauteur cover × scale          T = y × (H − Ih)
 *
 * Normalisé plutôt qu'en pixels : la zone choisie survit au cadre qui change de taille et
 * à l'image remplacée par une autre (binding), sans connaître la taille de l'image. L'image
 * couvre toujours le cadre : on ne peut pas la tirer au point de laisser un vide.
 */

export interface Crop {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Une boîte dans le repère du cadre. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NO_CROP: Crop = { x: 0.5, y: 0.5, scale: 1 };
export const MAX_CROP_SCALE = 4;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampScale = (s: number) => Math.max(1, Math.min(MAX_CROP_SCALE, s));

export const isCropped = (c: Crop): boolean =>
  c.scale > 1.001 || Math.abs(c.x - 0.5) > 0.001 || Math.abs(c.y - 0.5) > 0.001;

export function normalizeCrop(c: Partial<Crop>): Crop {
  return {
    x: clamp01(Number.isFinite(c.x) ? c.x! : 0.5),
    y: clamp01(Number.isFinite(c.y) ? c.y! : 0.5),
    scale: clampScale(Number.isFinite(c.scale) ? c.scale! : 1),
  };
}

/** L'échelle cover : la plus petite qui couvre le cadre. */
export const coverScale = (W: number, H: number, nat: Size): number => Math.max(W / nat.w, H / nat.h);

/** L'image entière, dans le repère du cadre. */
export function photoRect(W: number, H: number, nat: Size, c: Crop): Rect {
  const s = coverScale(W, H, nat) * c.scale;
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  // `+ 0` : jamais de -0 (0 × négatif), qui surprend à la comparaison
  return { x: c.x * (W - Iw) + 0, y: c.y * (H - Ih) + 0, w: Iw, h: Ih };
}

/**
 * L'inverse : l'image posée en `r` → le recadrage. L'échelle ne descend pas sous 1 (l'image
 * couvre toujours le cadre), et la position est bornée en conséquence.
 */
export function cropFromRect(W: number, H: number, nat: Size, r: Rect): Crop {
  const scale = clampScale(r.w / (nat.w * coverScale(W, H, nat)));
  const s = coverScale(W, H, nat) * scale;
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  const x = Math.abs(W - Iw) < 0.5 ? 0.5 : clamp01(r.x / (W - Iw));
  const y = Math.abs(H - Ih) < 0.5 ? 0.5 : clamp01(r.y / (H - Ih));
  return { x: x + 0, y: y + 0, scale };
}

/** Décale l'image de (dx, dy) pixels de cadre. */
export function panCrop(W: number, H: number, nat: Size, c: Crop, dx: number, dy: number): Crop {
  const r = photoRect(W, H, nat, c);
  return cropFromRect(W, H, nat, { ...r, x: r.x + dx, y: r.y + dy });
}

/** Change l'échelle en gardant fixe le point (px, py) du cadre (par défaut son centre). */
export function zoomCrop(W: number, H: number, nat: Size, c: Crop, scale: number, px = W / 2, py = H / 2): Crop {
  const r = photoRect(W, H, nat, c);
  const k = clampScale(scale) / c.scale;
  return cropFromRect(W, H, nat, { x: px - (px - r.x) * k, y: py - (py - r.y) * k, w: r.w * k, h: r.h * k });
}

/**
 * Le décalage du centre de l'image par rapport au centre du cadre, en pixels de cadre —
 * c'est ainsi que fabric place l'image dans le groupe (origine au centre).
 */
export function centerOffset(W: number, H: number, nat: Size, c: Crop): { x: number; y: number } {
  const r = photoRect(W, H, nat, c);
  return { x: r.x + r.w / 2 - W / 2, y: r.y + r.h / 2 - H / 2 };
}

/**
 * Les documents d'avant stockaient ce décalage (`offsetX`, `offsetY`, en pixels de cadre) :
 * il se convertit à la lecture, quand l'image est chargée et sa taille connue.
 */
export function cropFromCenterOffset(W: number, H: number, nat: Size, offsetX: number, offsetY: number, scale: number): Crop {
  const s = coverScale(W, H, nat) * clampScale(scale);
  const Iw = nat.w * s;
  const Ih = nat.h * s;
  return normalizeCrop({
    x: Iw - W < 0.5 ? 0.5 : 0.5 - offsetX / (Iw - W),
    y: Ih - H < 0.5 ? 0.5 : 0.5 - offsetY / (Ih - H),
    scale,
  });
}
