import { util, type FabricObject } from "#fabric";
import { pendingBindings, type BindingSpec } from "./bindings";
import { DEFAULT_GUIDE_COLOR, parseHex } from "./ui/color";
import { USER_SCOPE, USER_SLOT_STYLE_KEY, type UserSlotStyle } from "./userSlots";

/**
 * Les emplacements d'image (apibots : les médias dynamiques) : un cadre dont la source est
 * LIÉE. Le binding dit ce que l'image sera, par `media` — le rang d'une photo du sujet (compté
 * à partir de 1), `"each"` pour celle de l'itération, ou le nom d'une image du lecteur
 * (`"avatar"`, `"logo"`) :
 *
 *   bindings: { "image.src": { scope: "subject", media: 3 } }
 *   bindings: { "image.src": { scope: "company", media: "avatar" } }
 *
 * Le binding EST l'information « ici viendra telle image » : le document ne stocke aucune
 * source à côté, et surtout pas un dessin d'exemple. Le rendu s'en déduit — tant que rien ne
 * vient remplir le cadre (ImageFrame#showValue, l'expansion côté hôte), il se dessine
 * lui-même : un aplat dans la couleur d'édition, un disque, et le repère de ce qu'il attend
 * (le rang de la photo, `i` pour l'itération, un pictogramme pour une image nommée).
 *
 * Comme les images à fournir (userSlots, le scope `user`), le dessin est dans le rendu de
 * l'objet, pas en overlay : les aperçus (PreviewCanvas, vignettes) le montrent aussi.
 *
 * Une source liée par une expression de l'hôte (`expr`, sans `media`) est aussi un
 * emplacement : la lib n'en sait rien de plus, elle la dessine en photo.
 */

export const IMAGE_SLOT_FIELD = "image.src";

/** `media` de l'image de l'itération courante (page ou séquence répétée). */
export const EACH_MEDIA = "each";

export type SlotGlyph = "photo" | "person";

/** Ce qu'un emplacement affiche en son centre. */
export type SlotMark = { label: string } | { glyph: SlotGlyph };

/** Le binding d'image liée en attente — hors images à fournir (scope `user`, cf. userSlots). */
export function imageSlotBinding(obj: FabricObject): BindingSpec | null {
  const spec = pendingBindings(obj)[IMAGE_SLOT_FIELD];
  if (!spec || spec.scope === USER_SCOPE) return null;

  return spec.media !== undefined || spec.expr ? spec : null;
}

/** Le pictogramme d'une image nommée — une photo pour toutes les autres. */
const NAMED_GLYPHS: Record<string, SlotGlyph> = { avatar: "person" };

/** Le repère d'un emplacement : le rang d'une photo, `i` pour l'itération, sinon un
 *  pictogramme — une personne pour l'avatar, une photo par défaut. */
export function slotMark(spec: BindingSpec): SlotMark {
  const { media } = spec;
  if (typeof media === "number") return { label: String(media) };
  if (media === EACH_MEDIA) return { label: "i" };

  return { glyph: NAMED_GLYPHS[String(media)] ?? "photo" };
}

/** Ce qui distingue deux emplacements au rendu (le cache d'un cadre en dépend). */
export function slotKey(spec: BindingSpec): string {
  return spec.media !== undefined ? `media:${spec.media}` : `expr:${spec.expr}`;
}

/** La couleur d'édition du canvas d'un objet (posée par FabricEditor ou PreviewCanvas) —
 *  sans canvas, celle par défaut. */
export function slotColorOf(obj: FabricObject): string {
  const style = (obj.canvas as unknown as Record<string, UserSlotStyle | undefined> | undefined)?.[USER_SLOT_STYLE_KEY];
  return style?.color ?? DEFAULT_GUIDE_COLOR;
}

// ── Rendu ──────────────────────────────────────────────────────────

/** Le motif se trace dans un carré de 1080 de côté, ramené au petit côté du cadre. */
const UNIT = 1080;
const DISC_RADIUS = 300;
const DISC = "rgba(255, 255, 255, 0.22)";
const INK = "#ffffff";
/** La part de blanc du coin clair du dégradé. */
const LIGHT = 0.72;

/** La couleur éclaircie vers le blanc ; telle quelle si ce n'est pas un hex. */
function tint(color: string, amount: number): string {
  const rgb = parseHex(color);
  if (rgb.some(Number.isNaN)) return color;

  const [r, g, b] = rgb.map((channel) => Math.round(channel + (255 - channel) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Dessine un emplacement de `width` × `height` centré sur l'origine du repère courant : le
 * dégradé de la couleur d'édition (clair en haut à gauche), un disque, le repère en blanc.
 * Proportionnel au cadre : un emplacement se lit pareil en vignette et plein écran.
 */
export function drawImageSlot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mark: SlotMark,
  color: string = DEFAULT_GUIDE_COLOR,
): void {
  ctx.save();
  const gradient = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  gradient.addColorStop(0, tint(color, LIGHT));
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-width / 2, -height / 2, width, height);

  const scale = Math.min(width, height) / UNIT;
  ctx.scale(scale, scale);
  ctx.fillStyle = DISC;
  ctx.beginPath();
  ctx.arc(0, 0, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if ("label" in mark) drawLabel(ctx, mark.label);
  else GLYPHS[mark.glyph](ctx);
  ctx.restore();
}

/** Le rang, centré dans le disque : deux chiffres se serrent pour y tenir. */
function drawLabel(ctx: CanvasRenderingContext2D, label: string): void {
  const size = label.length > 1 ? 240 : 320;
  ctx.fillStyle = INK;
  ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // La ligne de base à mi-hauteur de capitale sous le centre : le chiffre est centré à l'œil
  ctx.fillText(label, 0, size * 0.36);
}

/** Les pictogrammes, tracés à la main (pas de Path2D côté node), dans le carré de 1080
 *  centré sur l'origine. */
const GLYPHS: Record<SlotGlyph, (ctx: CanvasRenderingContext2D) => void> = {
  // Une silhouette : la tête et les épaules
  person(ctx) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(0, -90, 115, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-205, 215);
    ctx.bezierCurveTo(-205, 80, -110, 45, 0, 45);
    ctx.bezierCurveTo(110, 45, 205, 80, 205, 215);
    ctx.closePath();
    ctx.fill();
  },

  // Une photo (heroicons photo) : le cadre, deux reliefs, le soleil
  photo(ctx) {
    ctx.save();
    ctx.scale(15, 15);
    ctx.translate(-12, -12);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(3.75, 4.5);
    ctx.arcTo(21.75, 4.5, 21.75, 19.5, 1.5);
    ctx.arcTo(21.75, 19.5, 2.25, 19.5, 1.5);
    ctx.arcTo(2.25, 19.5, 2.25, 4.5, 1.5);
    ctx.arcTo(2.25, 4.5, 21.75, 4.5, 1.5);
    ctx.closePath();
    ctx.moveTo(2.25, 15.75);
    ctx.lineTo(7.409, 10.591);
    ctx.quadraticCurveTo(9, 9, 10.591, 10.591);
    ctx.lineTo(15.75, 15.75);
    ctx.moveTo(14.25, 14.25);
    ctx.lineTo(15.659, 12.841);
    ctx.quadraticCurveTo(17.25, 11.25, 18.841, 12.841);
    ctx.lineTo(21.75, 15.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14.6, 8.25, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

/**
 * Le dessin d'un emplacement en image (data-URL carrée) : ce qu'un geste de l'hôte tient en
 * main le temps de poser le cadre (aperçu de glisser, image de départ) — jamais une source
 * de document, le cadre posé la lâche (ImageFrame#clearSource).
 */
export function imageSlotDataUrl(mark: SlotMark, color: string = DEFAULT_GUIDE_COLOR, size = UNIT): string {
  const el = util.createCanvasElement();
  el.width = el.height = size;
  const ctx = el.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  drawImageSlot(ctx, size, size, mark, color);
  return el.toDataURL("image/png");
}
