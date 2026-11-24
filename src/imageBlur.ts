/**
 * Le flou d'une image (le `filter: blur(Npx)` du CSS), calculé en JS pour sortir pareil partout :
 * l'éditeur (navigateur), le rendu image de creatorstudio (node-canvas, qui ignore `ctx.filter`)
 * et ses calques vidéo (Chromium).
 *
 * L'image est réduite à sa taille d'affichage (jamais agrandie), floutée par trois passes de
 * flou en boîte — l'approximation classique d'un flou gaussien d'écart-type `radius` (le rayon
 * du CSS) —, et rendue à la place de l'image source, à la manière du pipeline de filtres de
 * Fabric (`_element` remplacé, `_originalElement` gardé pour la source sauvée, mise à
 * l'échelle par `_filterScalingX/Y`). Les bords se prolongent (pixel du bord répété) : pas
 * de liseré clair comme le CSS en laisse.
 */
import { util } from "#fabric";

type Source = CanvasImageSource & { width: number; height: number };

/**
 * L'image source floutée : un canvas à la résolution d'affichage (`displayScale` px de cadre
 * par px de source, plafonné à 1), flou de `radius` px de cadre.
 */
export function blurredCanvas(source: Source, displayScale: number, radius: number): HTMLCanvasElement {
  const workScale = Math.min(1, Math.max(displayScale, 1e-3));
  const el = util.createCanvasElement();
  el.width = Math.max(1, Math.round(source.width * workScale));
  el.height = Math.max(1, Math.round(source.height * workScale));
  const ctx = el.getContext("2d")!;
  ctx.drawImage(source, 0, 0, el.width, el.height);

  // Le rayon en px du canvas de travail : px de cadre → px de source → px de travail
  const sigma = (radius / Math.max(displayScale, 1e-3)) * workScale;
  if (sigma < 0.5) return el;

  const image = ctx.getImageData(0, 0, el.width, el.height);
  gaussianApprox(image.data, el.width, el.height, sigma);
  ctx.putImageData(image, 0, 0);
  return el;
}

/** Trois flous en boîte dont la variance cumulée est celle d'un gaussien d'écart-type `sigma`. */
export function gaussianApprox(data: Uint8ClampedArray, width: number, height: number, sigma: number): void {
  const boxes = boxSizes(sigma, 3);
  const tmp = new Uint8ClampedArray(data.length);
  for (const size of boxes) {
    const r = (size - 1) / 2;
    boxBlurH(data, tmp, width, height, r);
    boxBlurV(tmp, data, width, height, r);
  }
}

/** Les largeurs (impaires) de `n` boîtes successives équivalant à un gaussien (W. Jarosz). */
export function boxSizes(sigma: number, n: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - n * lower * lower - 4 * n * lower - 3 * n) / (-4 * lower - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? lower : upper));
}

/** Moyenne glissante horizontale de rayon `r`, bords prolongés ; `src` → `dst`. */
function boxBlurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      const at = (x: number) => src[row + Math.min(w - 1, Math.max(0, x)) * 4 + c];
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += at(x);
      for (let x = 0; x < w; x++) {
        dst[row + x * 4 + c] = sum / span;
        sum += at(x + r + 1) - at(x - r);
      }
    }
  }
}

/** Moyenne glissante verticale de rayon `r`, bords prolongés ; `src` → `dst`. */
function boxBlurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number): void {
  const span = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      const at = (y: number) => src[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c];
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += at(y);
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * 4 + c] = sum / span;
        sum += at(y + r + 1) - at(y - r);
      }
    }
  }
}
