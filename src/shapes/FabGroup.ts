import { Group, classRegistry, type FabricObject, type TFiller } from "#fabric";

/**
 * Un groupe de paths : une forme multi-régions (un SVG de charte, un logo) qui se déplace,
 * se redimensionne et se colore d'un bloc — la couleur va à chaque path enfant, le groupe
 * lui-même n'en peint aucune. Il porte les propriétés de calque comme les autres formes,
 * pour que `layerType: "shape"` survive à la sérialisation : un `fabric.Group` nu les
 * perdait au save, et la forme redevenait « autre » (sans couleur ni contour) au
 * rechargement. Enregistré sous "Group" : tout groupe du stock se relit en FabGroup, le
 * type dans les documents ne change pas.
 */
export class FabGroup extends Group {
  static customProperties = ["layerId", "layerType", "lockMode", "lockContent"];

  /** La couleur commune des enfants ; null quand ils diffèrent (une œuvre polychrome). */
  commonFill(): TFiller | string | null {
    const fills = this.getObjects().map((child) => child.fill);
    const [first] = fills;
    return fills.every((fill) => sameFill(fill, first)) ? first ?? null : null;
  }

  /** Une seule couleur pour tout le groupe : un logo bicolore s'aplatit, c'est le choix fait. */
  setFill(fill: TFiller | string): void {
    this.getObjects().forEach((child: FabricObject) => child.set({ fill }));
    this.dirty = true;
  }
}

function sameFill(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a === "string" || typeof b === "string") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

classRegistry.setClass(FabGroup, "Group");
