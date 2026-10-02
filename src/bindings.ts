import type { FabricObject } from "#fabric";

/**
 * Les bindings du dialecte template (apibots, plan media-template-generators §4) : un calque
 * peut porter `bindings` — { champ: { expr, scope, resolved } } — et le champ stocké reste
 * une valeur plate (le sample), donc le canvas rend le calque tel quel. L'éditeur, lui, doit
 * SAVOIR qu'un champ est lié :
 *
 * - la donnée voyage avec le calque (sérialisation/désérialisation, comme layerId) ;
 * - un texte au binding `text` en attente ne s'édite pas directement (règle : on édite le
 *   binding ou on délie — sinon sample et expression divergent en silence) → editable=false ;
 * - le lien est visible AVANT toute sélection : une pastille « $ » dans la couleur d'édition
 *   (guideColor), dessinée en overlay au coin du calque.
 */

/** `hint` : la consigne d'une image à fournir (scope `user`, cf. userSlots). */
export type BindingSpec = { expr?: string; scope?: string; resolved?: boolean; hint?: string };
export type Bindings = Record<string, BindingSpec>;

export function pendingBindings(obj: FabricObject): Bindings {
  const bindings = (obj.get("bindings") as Bindings) || {};
  return Object.fromEntries(Object.entries(bindings).filter(([, spec]) => spec?.resolved !== true));
}

export function hasPendingBindings(obj: FabricObject): boolean {
  return Object.keys(pendingBindings(obj)).length > 0;
}

/** Restaure les bindings depuis le JSON et verrouille l'édition directe d'un texte lié. */
export function restoreBindings(obj: FabricObject, data: { bindings?: Bindings } & Record<string, unknown>): void {
  if (!data.bindings) return;

  obj.set("bindings", data.bindings);
  lockBoundText(obj);
}

export function lockBoundText(obj: FabricObject): void {
  if (pendingBindings(obj)["text"] && "editable" in obj) {
    (obj as FabricObject & { editable: boolean }).editable = false;
  }
}

/**
 * Pose un texte par programme et REMET LA MISE EN PAGE À JOUR : un `set("text", …)` nu ne
 * remesure pas l'objet et n'émet pas l'événement `changed` que les sessions de layout
 * écoutent — le conteneur (hug) garderait son ancienne taille alors que le texte a grandi.
 * C'est le verbe qu'utilise l'aperçu live d'une expression liée (apibots, §9).
 */
export function setTextContent(obj: FabricObject, text: string): void {
  if (!("text" in obj)) return;

  obj.set("text", text);
  // Remesure immédiate (fabric ne le fait qu'à l'édition interactive), puis on prévient les
  // écouteurs — c'est ce que la mise en page consomme pour se recalculer.
  (obj as unknown as { initDimensions?: () => void }).initDimensions?.();
  obj.setCoords();
  (obj as unknown as { fire: (name: string) => void }).fire("changed");
}

const BADGE_HEIGHT = 15;
const BADGE_PAD = 5;
const BADGE_FONT = "500 10px ui-sans-serif, system-ui, sans-serif";

/**
 * Le badge de liaison — brutaliste : un rectangle net, collé au contour, sans arrondi. Il
 * accompagne le CADRE, pas le calque : il ne s'affiche qu'avec lui (survol ou sélection),
 * comme une étiquette du cadre.
 *
 * Il réutilise la position que fabric a déjà calculée pour ses poignées : `oCoords` est en
 * espace écran (viewportTransform et zoom compris) — aucune transformation à recalculer,
 * c'est ce qui le fait suivre à toutes les échelles.
 */
export function drawBindingBadge(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  color: string,
  userSlotLabel = DEFAULT_USER_SLOT_LABEL,
): void {
  if (!hasPendingBindings(obj)) return;

  const corner = (obj as unknown as { oCoords?: Record<string, { x: number; y: number }> }).oCoords?.tl;
  if (!corner) return;

  const label = bindingLabel(obj, userSlotLabel);
  ctx.save();
  // `destination-over` : le badge se glisse SOUS ce qui est déjà dessiné — il passe donc
  // derrière les poignées au lieu de les masquer.
  ctx.globalCompositeOperation = "destination-over";
  ctx.font = BADGE_FONT;
  const width = ctx.measureText(label).width + BADGE_PAD * 2;
  // Collé au contour : le bas du badge EST le haut du cadre, et son bord gauche déborde
  // d'un pixel pour s'aligner sur l'extérieur de la bordure.
  const left = corner.x - 1;
  const top = corner.y - BADGE_HEIGHT;

  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, BADGE_HEIGHT);

  // Le texte doit rester AU-DESSUS de son propre fond : on repasse en composition normale
  // (destination-over l'aurait glissé sous le rectangle qu'on vient de poser).
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + BADGE_PAD, top + BADGE_HEIGHT / 2);
  ctx.restore();
}

/** Le badge d'une image à fournir — l'hôte passe sa traduction (`EditorConfig.userSlotLabel`). */
export const DEFAULT_USER_SLOT_LABEL = "À fournir";

/** Ce que le badge dit : les tokens liés ($NOM), les slots (media[i]) et les images à fournir. */
function bindingLabel(obj: FabricObject, userSlotLabel: string): string {
  const labels = Object.values(pendingBindings(obj)).flatMap((spec) => {
    if (spec?.scope === "user") return [userSlotLabel];
    const expr = String(spec?.expr ?? "");
    const tokens = expr.match(/\$\w+/g) || [];
    return tokens.length ? tokens : expr.match(/^media\[/) ? [expr] : [];
  });
  return labels.length ? [...new Set(labels)].join(" ") : "$";
}

/**
 * Le liseré des MÉDIAS dynamiques : un pointillé permanent dans la couleur d'édition autour
 * des calques dont un champ image est lié — l'aperçu montre la vraie image d'exemple, le
 * liseré dit « celle-ci sera remplie à la publication ». Espace écran (oCoords, le repère
 * des poignées), épaisseur constante au zoom.
 */
export function drawDynamicMediaOutline(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  color: string,
): void {
  const pending = pendingBindings(obj);
  if (!Object.keys(pending).some((field) => field.startsWith("image."))) return;

  const coords = (obj as unknown as { oCoords?: Record<string, { x: number; y: number }> }).oCoords;
  if (!coords) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(coords.tl.x, coords.tl.y);
  ctx.lineTo(coords.tr.x, coords.tr.y);
  ctx.lineTo(coords.br.x, coords.br.y);
  ctx.lineTo(coords.bl.x, coords.bl.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
