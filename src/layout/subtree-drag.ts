/**
 * Des objets qu'on déplace emmènent leur descendance : un groupe, ou les objets d'une
 * sélection multiple (leurs descendants n'y sont jamais, cf. SelectionManager). Chaque pas
 * repart du début du geste — sans relayout : dans une sélection, les positions des
 * containers sont relatives à elle.
 */
import type { FabricObject } from "#fabric";
import { descendantsOf } from "./hierarchy";

export class SubtreeDrag {
  private constructor(
    /** Le geste Fabric (son `transform`) que ce déplacement suit. */
    readonly transform: unknown,
    private readonly start: { left: number; top: number },
    private readonly followers: Array<{ obj: FabricObject; left: number; top: number }>,
  ) {}

  /** Au premier pas du geste : la position de départ de `target` et de la descendance. */
  static begin(target: FabricObject, moved: FabricObject[], transform: any, objects: FabricObject[]): SubtreeDrag {
    return new SubtreeDrag(
      transform,
      { left: transform?.original?.left ?? target.left, top: transform?.original?.top ?? target.top },
      descendantsOf(objects, moved).map((o) => ({ obj: o, left: o.left, top: o.top })),
    );
  }

  /** La descendance suit la translation de `target` depuis le début. */
  follow(target: FabricObject): void {
    const dx = target.left - this.start.left;
    const dy = target.top - this.start.top;
    for (const f of this.followers) {
      f.obj.set({ left: f.left + dx, top: f.top + dy });
      f.obj.setCoords();
    }
  }
}
