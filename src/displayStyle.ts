import type { FabricObject } from "#fabric";

/**
 * Un style d'AFFICHAGE : une couleur posée le temps du rendu, jamais sérialisée — l'objet
 * garde la sienne (`fill`), c'est elle que le document exporte. L'hôte la pose d'après ce
 * qu'il sait (apibots : un remplissage lié, « la couleur selon l'annonce », évalué pour le
 * sujet d'aperçu) et la retire. Même geste que fabric pour le clipping : on échange `fill`
 * autour de `drawObject`, le cache de rendu suit (`dirty`).
 */
type Styled = FabricObject & { displayFill?: string };

export function displayFill(obj: FabricObject): string | null {
  return (obj as Styled).displayFill ?? null;
}

/** Pose ou retire la couleur d'affichage ; rend true si elle a changé (à l'hôte de redessiner). */
export function setDisplayFill(obj: FabricObject, fill: string | null): boolean {
  if (displayFill(obj) === (fill || null)) return false;
  (obj as Styled).displayFill = fill || undefined;
  obj.dirty = true;
  return true;
}

type Drawable = {
  drawObject: (ctx: CanvasRenderingContext2D, forClipping?: boolean, context?: unknown) => void;
};

/** Installe le rendu sur une classe : `drawObject` dessine avec la couleur d'affichage. */
export function installDisplayStyleRendering(target: object): void {
  const proto = target as Drawable;
  const original = proto.drawObject;

  proto.drawObject = function (this: FabricObject, ctx, forClipping, context) {
    const fill = displayFill(this);
    if (!fill || forClipping) return original.call(this, ctx, forClipping, context);

    const stored = this.fill;
    this.fill = fill;
    try {
      original.call(this, ctx, forClipping, context);
    } finally {
      this.fill = stored;
    }
  };
}
