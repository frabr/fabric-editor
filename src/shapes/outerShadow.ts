/**
 * L'ombre d'une forme qui laisse voir à travers elle (fond transparent ou translucide) se
 * dessine seulement à l'EXTÉRIEUR de la forme, comme la `box-shadow` du CSS.
 *
 * Sans ça, Fabric pose l'ombre sur le dessin de la forme (son cache, contour compris) : le
 * flou de l'ombre déborde vers l'intérieur et assombrit ce qui est dessous — une pilule à
 * liseré blanc sur une photo devient une tache grise. Une forme à fond opaque n'est pas
 * concernée : son fond recouvre déjà l'intérieur de son ombre.
 *
 * Le rendu fait deux passes : l'ombre seule — la silhouette pleine de la forme, découpée hors de
 * la forme (clip pair-impair : un grand rectangle moins la forme), si bien que seule l'ombre qui
 * déborde reste — puis la forme elle-même, sans ombre. Rien ne change dans le document : c'est
 * la même `shadow`, rendue comme le CSS la rend. Le rendu serveur (creatorstudio, images et
 * calques vidéo) passe par les mêmes classes.
 */
import { Color, type FabricObject } from "#fabric";

/** Au-delà de toute ombre (unités de l'objet) : le rectangle dont on retire la forme. */
const FAR = 1e5;

export type PathBuilder = (this: FabricObject, ctx: CanvasRenderingContext2D) => void;
type ShadowedShape = FabricObject & { _renderPaintInOrder(ctx: CanvasRenderingContext2D): void };

/** Le fond laisse-t-il voir à travers la forme ? Une couleur pleine et opaque, non ; tout le reste
 *  (transparent, rgba translucide, dégradé, motif, rien), oui. */
export function seesThrough(fill: unknown): boolean {
  if (!fill || typeof fill !== "string") return true;
  if (fill === "transparent" || fill === "none") return true;
  return new Color(fill).getAlpha() < 1;
}

/**
 * Installe le rendu d'ombre extérieure sur le prototype d'une forme. `buildPath` est le `_render`
 * de la classe Fabric de base (Rect, Path, Circle) : il trace le chemin de la forme puis appelle
 * `_renderPaintInOrder`, neutralisé ici le temps de récupérer le chemin. À installer AVANT les
 * mixins qui surchargent `_render` (emplacements d'image, cf. userSlots).
 */
export function installOuterShadow(target: object, buildPath: PathBuilder): void {
  const proto = target as { render(ctx: CanvasRenderingContext2D): void };
  const originalRender = proto.render;

  proto.render = function (this: ShadowedShape, ctx: CanvasRenderingContext2D) {
    const shadow = this.shadow;
    if (!shadow || !seesThrough(this.fill) || this.isNotVisible()) return originalRender.call(this, ctx);

    drawOuterShadow(this, ctx, buildPath);
    // La forme elle-même, sans ombre (affectation directe : rien ne doit croire le cache périmé)
    this.shadow = null;
    try {
      originalRender.call(this, ctx);
    } finally {
      this.shadow = shadow;
    }
  };
}

/**
 * Trace le chemin de la forme sur `ctx` (dans le repère courant), sans rien peindre : le `_render`
 * de base, `_renderPaintInOrder` neutralisé le temps de l'appel. Le chemin reste courant (clip,
 * fill…).
 */
export function traceShapePath(shape: FabricObject, ctx: CanvasRenderingContext2D, buildPath: PathBuilder): void {
  const target = shape as ShadowedShape;
  target._renderPaintInOrder = () => {};
  try {
    buildPath.call(shape, ctx);
  } finally {
    delete (target as Partial<ShadowedShape>)._renderPaintInOrder;
  }
}

function drawOuterShadow(shape: ShadowedShape, ctx: CanvasRenderingContext2D, buildPath: PathBuilder): void {
  const paint = shape._renderPaintInOrder;
  ctx.save();
  try {
    (shape as unknown as { _setupCompositeOperation(c: CanvasRenderingContext2D): void })._setupCompositeOperation(ctx);
    shape.transform(ctx);
    (shape as unknown as { _setOpacity(c: CanvasRenderingContext2D): void })._setOpacity(ctx);

    // Le chemin de la forme, puis le grand rectangle : le clip pair-impair garde l'extérieur
    traceShapePath(shape, ctx, buildPath);
    ctx.rect(-FAR, -FAR, 2 * FAR, 2 * FAR);
    ctx.clip("evenodd");

    // La silhouette pleine, ombrée : la silhouette tombe hors du clip, son ombre déborde dedans
    (shape as unknown as { _setShadow(c: CanvasRenderingContext2D): void })._setShadow(ctx);
    shape._renderPaintInOrder = (c: CanvasRenderingContext2D) => {
      c.fillStyle = "#000";
      c.fill();
    };
    buildPath.call(shape, ctx);
  } finally {
    // Retire la surcharge d'instance : le prototype reprend la main
    delete (shape as Partial<ShadowedShape>)._renderPaintInOrder;
    if (shape._renderPaintInOrder !== paint) shape._renderPaintInOrder = paint;
    ctx.restore();
  }
}
