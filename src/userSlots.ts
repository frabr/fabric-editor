import { Pattern, util, type FabricObject } from "#fabric";
import { pendingBindings, type BindingSpec, type Bindings } from "./bindings";
import { BADGE_FONT } from "./ui/badges";

/**
 * Les images à fournir (apibots, plan user-image-slots) : un cadre que l'utilisateur final
 * doit remplir lui-même. C'est un binding `image.src` de scope `user` — pas d'expression,
 * une consigne :
 *
 *   bindings: { "image.src": { scope: "user", hint: "Photo de l'équipe" } }
 *
 * `expand!` et `interpolate!` n'évaluent pas ce scope : le cadre traverse la chaîne
 * intact, et tant qu'il est en attente le document n'est pas résolu (pas de rendu).
 *
 * Le cadre est une FORME (rect, cercle, path) : elle prend en fond l'image qu'on lui
 * lâche, comme toute forme (règlement : `onToolboxImage: "fill"`). En attente, elle se
 * dessine en damier avec une icône d'upload et une invite — dans son propre rendu, pas en overlay, pour
 * que les aperçus (vignettes de pages, PreviewCanvas) montrent aussi le trou à combler.
 * Remplie, le binding passe `resolved` et reste comme provenance.
 */

export const USER_SCOPE = "user";
export const USER_SLOT_FIELD = "image.src";

/** Un cadre en attente, et sa boîte en coordonnées scène (le repère de getBoundingRect). */
export interface UserSlot {
  object: FabricObject;
  layerId?: string;
  hint: string;
  rect: { left: number; top: number; width: number; height: number };
}

/** Le binding d'image à fournir, s'il est en attente. */
export function userSlotBinding(obj: FabricObject): BindingSpec | null {
  const spec = pendingBindings(obj)[USER_SLOT_FIELD];
  return spec?.scope === USER_SCOPE ? spec : null;
}

export function isUserSlot(obj: FabricObject): boolean {
  return userSlotBinding(obj) !== null;
}

export function userSlotHint(obj: FabricObject): string {
  return String(userSlotBinding(obj)?.hint ?? "");
}

/** Les bindings d'un cadre qu'on vient de remplir : l'image à fournir est fournie. */
export function resolveUserSlot(bindings: Bindings | undefined): Bindings | undefined {
  const spec = bindings?.[USER_SLOT_FIELD];
  if (spec?.scope !== USER_SCOPE) return bindings;

  return { ...bindings, [USER_SLOT_FIELD]: { ...spec, resolved: true } };
}

/** Les cadres en attente parmi des objets, dans l'ordre de la pile. */
export function collectUserSlots(objects: FabricObject[]): UserSlot[] {
  return objects.filter(isUserSlot).map((object) => {
    const { left, top, width, height } = object.getBoundingRect();
    return {
      object,
      layerId: object.get("layerId") as string | undefined,
      hint: userSlotHint(object),
      rect: { left, top, width, height },
    };
  });
}

// ── Rendu ──────────────────────────────────────────────────────────

/** Côté d'une case du damier, en unités scène : le motif ne dépend pas de la taille du cadre. */
const CELL = 16;
const CHECKER_LIGHT = "#f9fafb";
const CHECKER_DARK = "#e5e7eb";

let checkerSource: HTMLCanvasElement | null = null;

function checkerTile(): HTMLCanvasElement {
  if (checkerSource) return checkerSource;

  const tile = util.createCanvasElement();
  tile.width = tile.height = CELL * 2;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(0, 0, CELL * 2, CELL * 2);
  ctx.fillStyle = CHECKER_DARK;
  ctx.fillRect(0, 0, CELL, CELL);
  ctx.fillRect(CELL, CELL, CELL, CELL);
  checkerSource = tile;
  return tile;
}

/** Le motif contre-scalé : un cercle ou un path se dimensionnent par leur scale, les cases restent carrées. */
function checkerPattern(obj: FabricObject): Pattern {
  const sx = obj.scaleX || 1;
  const sy = obj.scaleY || 1;
  return new Pattern({ source: checkerTile(), repeat: "repeat", patternTransform: [1 / sx, 0, 0, 1 / sy, 0, 0] });
}

/**
 * Ce que l'éditeur fait dire aux cadres de SON canvas : la couleur d'édition (guideColor) et
 * la phrase d'invite, fournie par l'hôte (traduite). Posé par FabricEditor sur le canvas
 * fabric ; sans lui (aperçus), l'icône seule, dans la couleur par défaut.
 */
export interface UserSlotStyle {
  color: string;
  prompt?: string;
}

export const USER_SLOT_STYLE_KEY = "userSlotStyle";
const DEFAULT_COLOR = "#d946ef";
const ICON_SIZE = 20;
const TEXT_LINE = 13;
const TEXT_GAP = 6;
const PAD = 8;

/**
 * L'icône d'upload et l'invite, au centre du cadre, dans la couleur d'édition : le cadre
 * est « magique », il appartient à l'éditeur. Taille d'ÉCRAN, comme les badges (repère
 * ramené au pixel CSS, zoom compris — le cache se redessine au zoom). L'invite (consigne du
 * binding, sinon la phrase de l'hôte) n'apparaît que si elle tient ; l'icône aussi.
 */
function drawSlotContent(ctx: CanvasRenderingContext2D, obj: FabricObject): void {
  const style = (obj.canvas as unknown as Record<string, UserSlotStyle | undefined> | undefined)?.[USER_SLOT_STYLE_KEY];
  const { x: zx, y: zy } = obj.getTotalObjectScaling();
  const w = obj.width * zx;
  const h = obj.height * zy;
  if (Math.min(w, h) < ICON_SIZE + PAD * 2) return;

  ctx.save();
  ctx.scale(1 / zx, 1 / zy);
  ctx.font = BADGE_FONT;
  const text = userSlotHint(obj) || style?.prompt || "";
  const lines = text ? wrapLines(ctx, text, w - PAD * 2) : [];
  const fits = lines.length > 0 && ICON_SIZE + TEXT_GAP + lines.length * TEXT_LINE + PAD * 2 <= h;
  const shown = fits ? lines : [];
  const blockHeight = ICON_SIZE + (shown.length ? TEXT_GAP + shown.length * TEXT_LINE : 0);
  const color = style?.color ?? DEFAULT_COLOR;

  drawUploadIcon(ctx, -blockHeight / 2, color);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  shown.forEach((line, i) => {
    ctx.fillText(line, 0, -blockHeight / 2 + ICON_SIZE + TEXT_GAP + TEXT_LINE * (i + 0.5));
  });
  ctx.restore();
}

/** Coupe aux mots pour tenir dans la largeur ; un mot trop long pour une ligne → rien. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width > maxWidth) return [];

    const last = lines[lines.length - 1];
    const joined = last ? `${last} ${word}` : word;
    if (last && ctx.measureText(joined).width <= maxWidth) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines;
}

/** L'icône d'upload (heroicons arrow-up-tray), tracée à la main : pas de Path2D côté node. */
function drawUploadIcon(ctx: CanvasRenderingContext2D, top: number, color: string): void {
  ctx.save();
  ctx.translate(-ICON_SIZE / 2, top);
  ctx.scale(ICON_SIZE / 24, ICON_SIZE / 24);
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(3, 16.5);
  ctx.lineTo(3, 18.75);
  ctx.quadraticCurveTo(3, 21, 5.25, 21);
  ctx.lineTo(18.75, 21);
  ctx.quadraticCurveTo(21, 21, 21, 18.75);
  ctx.lineTo(21, 16.5);
  ctx.moveTo(7.5, 7.5);
  ctx.lineTo(12, 3);
  ctx.lineTo(16.5, 7.5);
  ctx.moveTo(12, 3);
  ctx.lineTo(12, 16.5);
  ctx.stroke();
  ctx.restore();
}

type SlotRenderable = {
  _render: (ctx: CanvasRenderingContext2D) => void;
  isCacheDirty: (skipCanvas?: boolean) => boolean;
};

/**
 * Installe le rendu « à fournir » sur une classe de forme : en attente, son fond devient
 * le damier (le temps du rendu — la couleur stockée ne change pas), l'icône et l'invite s'y posent.
 * Une fois par classe, au chargement du module.
 *
 * Le cache de rendu suit l'état : poser ou retirer le binding ne salit pas l'objet aux
 * yeux de fabric, c'est le passage en attente (ou sa fin) qui le fait.
 */
export function installUserSlotRendering(target: object): void {
  const proto = target as SlotRenderable;
  const original = proto._render;
  const originalIsCacheDirty = proto.isCacheDirty;

  proto.isCacheDirty = function (this: FabricObject & { _wasUserSlot?: boolean }, skipCanvas?: boolean) {
    const slot = isUserSlot(this);
    if (slot !== Boolean(this._wasUserSlot)) {
      this._wasUserSlot = slot;
      this.dirty = true;
    }
    return originalIsCacheDirty.call(this, skipCanvas);
  };

  proto._render = function (this: FabricObject, ctx: CanvasRenderingContext2D) {
    if (!isUserSlot(this)) return original.call(this, ctx);

    const fill = this.fill;
    this.fill = checkerPattern(this);
    try {
      original.call(this, ctx);
    } finally {
      this.fill = fill;
    }
    drawSlotContent(ctx, this);
  };
}
