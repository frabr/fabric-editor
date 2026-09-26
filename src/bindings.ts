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

export type BindingSpec = { expr?: string; scope?: string; resolved?: boolean };
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

/**
 * Le badge de liaison : une étiquette « $ » posée au coin haut-gauche du calque, COLLÉE au
 * cadre — exactement là où se dessinerait l'indicateur de sélection — et dans la couleur
 * d'édition. Dessinée après chaque rendu : visible sans sélection, taille constante quel que
 * soit le zoom (espace écran, viewportTransform appliqué).
 */
type BadgeCanvas = {
  on(eventName: string, handler: () => void): void;
  getObjects(): FabricObject[];
  getContext(): CanvasRenderingContext2D;
  viewportTransform?: number[] | null;
};

const BADGE_HEIGHT = 20;
const BADGE_PAD = 7;
const BADGE_RADIUS = 4;

export function installBindingBadges(canvas: BadgeCanvas, color: string): void {
  canvas.on("after:render", () => {
    const ctx = canvas.getContext();
    const vpt = canvas.viewportTransform;
    if (!ctx || !vpt) return;

    canvas.getObjects().forEach((obj) => {
      if (!hasPendingBindings(obj)) return;

      // Coin haut-gauche du cadre, en espace écran — le même repère que le cadre de
      // sélection de fabric, badge posé juste au-dessus de sa bordure.
      const corner = obj.getCoords()[0];
      const x = corner.x * vpt[0] + vpt[4];
      const y = corner.y * vpt[3] + vpt[5];
      const label = bindingLabel(obj);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      const width = ctx.measureText(label).width + BADGE_PAD * 2;
      const top = y - BADGE_HEIGHT - 2;

      ctx.beginPath();
      ctx.roundRect(x, top, width, BADGE_HEIGHT, [BADGE_RADIUS, BADGE_RADIUS, BADGE_RADIUS, 0]);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + BADGE_PAD, top + BADGE_HEIGHT / 2 + 0.5);
      ctx.restore();
    });
  });
}

/** Ce que le badge dit : les tokens liés du calque, ou « $ » à défaut (expression opaque). */
function bindingLabel(obj: FabricObject): string {
  const tokens = Object.values(pendingBindings(obj))
    .flatMap((spec) => String(spec?.expr ?? "").match(/\$\w+/g) || []);
  return tokens.length ? [...new Set(tokens)].join(" ") : "$";
}
