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
 * La pastille de liaison : dessinée après chaque rendu du canvas, au coin haut-gauche des
 * calques porteurs de bindings en attente — visible sans sélection, dans la couleur
 * d'édition. En espace écran (viewportTransform appliqué), taille constante quel que soit le
 * zoom.
 */
type BadgeCanvas = {
  on(eventName: string, handler: () => void): void;
  getObjects(): FabricObject[];
  getContext(): CanvasRenderingContext2D;
  viewportTransform?: number[] | null;
};

export function installBindingBadges(canvas: BadgeCanvas, color: string): void {
  canvas.on("after:render", () => {
    const ctx = canvas.getContext();
    const vpt = canvas.viewportTransform;
    if (!ctx || !vpt) return;

    canvas.getObjects().forEach((obj) => {
      if (!hasPendingBindings(obj)) return;

      const corner = obj.getCoords()[0]; // haut-gauche en espace design
      const x = corner.x * vpt[0] + vpt[4];
      const y = corner.y * vpt[3] + vpt[5];

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", x, y + 0.5);
      ctx.restore();
    });
  });
}
