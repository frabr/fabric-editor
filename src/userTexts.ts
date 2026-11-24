import type { FabricObject } from "#fabric";
import { DEFAULT_GUIDE_COLOR } from "./ui/color";
import type { BindingSpec, Bindings } from "./bindings";
import { USER_SCOPE, USER_SLOT_STYLE_KEY, type UserSlotStyle } from "./userSlots";

/**
 * Les textes à personnaliser (apibots, PROJ-915) : un texte que l'utilisateur final doit
 * réécrire lui-même avant de publier. C'est un binding `text` de scope `user` — pas
 * d'expression, rien ne s'interpole : le texte du calque est l'EXEMPLE (« Ville »), écrit par
 * l'auteur.
 *
 *   { type: "Textbox", text: "Ville", bindings: { text: { scope: "user" } } }
 *
 * À ne pas confondre avec un texte lié (`{ expr: "$VILLE", scope: "company" }`), que le
 * serveur remplit seul : un champ porte l'un ou l'autre binding, jamais les deux.
 *
 * Deux lecteurs, un même geste (taper dans le texte), deux sens — c'est l'hôte qui dit lequel
 * (`EditorConfig.authorsUserInputs`) :
 * - l'AUTEUR écrit l'exemple : ses frappes ne règlent rien, le texte reste à personnaliser ;
 * - l'utilisateur final le PERSONNALISE : la première frappe qui change le texte passe le
 *   binding `resolved`, qui reste comme provenance.
 *
 * Le texte reste éditable quel que soit son verrou, avant comme après (c'est son contrat,
 * cf. locking). En attente, il porte un liseré pointillé dans la couleur d'édition — dans son
 * propre rendu, comme le damier d'une image à fournir, pour que les aperçus le montrent aussi.
 */

export const USER_TEXT_FIELD = "text";

function textBinding(obj: FabricObject): BindingSpec | null {
  const spec = (obj.get("bindings") as Bindings | undefined)?.[USER_TEXT_FIELD];
  return spec?.scope === USER_SCOPE ? spec : null;
}

/** Le binding de texte à personnaliser, s'il est en attente. */
export function userTextBinding(obj: FabricObject): BindingSpec | null {
  const spec = textBinding(obj);
  return spec && spec.resolved !== true ? spec : null;
}

export function isUserText(obj: FabricObject): boolean {
  return userTextBinding(obj) !== null;
}

/** Un texte confié à l'utilisateur final, en attente ou déjà personnalisé : il s'édite quel
 *  que soit son verrou. */
export function isUserOwnedText(obj: FabricObject): boolean {
  return textBinding(obj) !== null;
}

/** Les bindings d'un texte que l'auteur donne à personnaliser (un texte lié cesse de l'être). */
export function requestUserText(bindings: Bindings | undefined): Bindings {
  return { ...bindings, [USER_TEXT_FIELD]: { scope: USER_SCOPE } };
}

/** Les bindings d'un texte que l'auteur reprend : plus rien à personnaliser. */
export function releaseUserText(bindings: Bindings | undefined): Bindings {
  const { [USER_TEXT_FIELD]: spec, ...rest } = bindings ?? {};
  return spec?.scope === USER_SCOPE ? rest : { ...bindings };
}

/** Les bindings d'un texte que l'utilisateur final vient de réécrire. */
export function resolveUserText(bindings: Bindings | undefined): Bindings | undefined {
  const spec = bindings?.[USER_TEXT_FIELD];
  if (spec?.scope !== USER_SCOPE) return bindings;

  return { ...bindings, [USER_TEXT_FIELD]: { ...spec, resolved: true } };
}

function styleOf(obj: FabricObject): UserSlotStyle | undefined {
  return (obj.canvas as unknown as Record<string, UserSlotStyle | undefined> | undefined)?.[USER_SLOT_STYLE_KEY];
}

/** Le lecteur de ce canvas est l'auteur des entrées à fournir (faux hors éditeur). */
export function authorsUserInputs(obj: FabricObject): boolean {
  return styleOf(obj)?.authoring === true;
}

/**
 * Le liseré d'un texte à personnaliser, autour de sa boîte, dans le repère du texte (appelé
 * depuis son rendu). Trait et pointillé à taille d'écran, quels que soient le zoom et
 * l'échelle — le cache du texte se redessine au zoom.
 */
export function drawUserTextOutline(ctx: CanvasRenderingContext2D, obj: FabricObject): void {
  const { x: zx, y: zy } = obj.getTotalObjectScaling();

  ctx.save();
  ctx.scale(1 / zx, 1 / zy);
  ctx.strokeStyle = styleOf(obj)?.color ?? DEFAULT_GUIDE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.9;
  ctx.strokeRect((-obj.width / 2) * zx, (-obj.height / 2) * zy, obj.width * zx, obj.height * zy);
  ctx.restore();
}
