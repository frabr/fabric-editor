import type { FabricObject } from "#fabric";
import { idOf } from "./layout/model";
import { isUserSlot, userSlotHint } from "./userSlots";
import { isUserText } from "./userTexts";

/**
 * Les entrées à fournir d'une page : tout ce que l'utilisateur final doit régler lui-même
 * avant de publier — une image à fournir (userSlots) ou un texte à personnaliser (userTexts).
 * Le miroir de `CompositionDocument::Bindings#pending_user_inputs` (apibots), qui fait foi.
 *
 * La lib dit l'ÉTAT (cet objet attend, de telle sorte, à tel endroit) et le dessine dans le
 * canvas ; ce que l'hôte en fait à côté — une bulle dans son style, un compteur, un verrou
 * d'enregistrement — est son affaire (`FabricEditor#onUserInputsChange`, `#clientRectOf`).
 */
export type UserInputKind = "image" | "text";

/** Une entrée en attente, et sa boîte en coordonnées scène (le repère de getBoundingRect). */
export interface UserInput {
  object: FabricObject;
  layerId?: string;
  kind: UserInputKind;
  /** La consigne de l'auteur (images) ; vide pour un texte, dont l'exemple est la consigne. */
  hint: string;
  rect: { left: number; top: number; width: number; height: number };
}

/** La sorte d'entrée qu'un objet attend, ou null s'il n'attend rien. */
export function userInputKindOf(obj: FabricObject): UserInputKind | null {
  if (isUserSlot(obj)) return "image";
  return isUserText(obj) ? "text" : null;
}

/** Les entrées en attente parmi des objets, dans l'ordre de la pile. */
export function collectUserInputs(objects: FabricObject[]): UserInput[] {
  return objects.flatMap((object) => {
    const kind = userInputKindOf(object);
    if (!kind) return [];

    const { left, top, width, height } = object.getBoundingRect();
    return [{
      object,
      layerId: idOf(object),
      kind,
      hint: kind === "image" ? userSlotHint(object) : "",
      rect: { left, top, width, height },
    }];
  });
}
