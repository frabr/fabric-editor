/**
 * Les tokens d'un texte (les variables d'un texte lié, apibots plan bound-text-styles) : des
 * plages atomiques que l'hôte pose sur un CustomTextbox (`tokenSpans`). Ici, ce que l'éditeur
 * en montre : une pastille derrière chacun, dans la couleur d'édition, sur le calque du dessus
 * (jamais exportée), seulement sur le texte sélectionné ou en édition. La couleur vit sur le
 * canvas, posée par l'éditeur.
 */
import type { FabricObject } from "#fabric";

export const TOKEN_COLOR_KEY = "tokenColor";

/** La couleur des pastilles du canvas de cet objet (null hors éditeur). */
export function tokenColorOf(obj: FabricObject): string | null {
  return (obj.canvas as unknown as Record<string, string | undefined> | undefined)?.[TOKEN_COLOR_KEY] ?? null;
}

/** Les pastilles du texte sélectionné, hors édition (le texte en édition peint les siennes
 *  avec son curseur) : un texte non sélectionné n'en montre pas. */
export function drawActiveTokenPills(ctx: CanvasRenderingContext2D, active: FabricObject | undefined | null): void {
  const text = active as (FabricObject & { isEditing?: boolean; drawTokenPills?: (c: CanvasRenderingContext2D) => void })
    | undefined | null;
  if (!text?.drawTokenPills || text.isEditing) return;
  text.drawTokenPills(ctx);
}
