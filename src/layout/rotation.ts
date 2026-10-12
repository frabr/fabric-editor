/**
 * La rotation d'un container emmène sa descendance, comme un corps rigide.
 *
 * Le document ne change pas : les enfants gardent leurs positions et angles absolus sur le
 * canvas, le layout reste un calcul sur des boîtes axées. La rotation est une transformation
 * rigide appliquée par-dessus :
 * - pendant le geste, `SubtreeRotate` fait tourner la descendance autour du pivot (le centre
 *   du container, ou de la sélection) du même angle — la jumelle de `SubtreeDrag` ;
 * - pour le layout, `inLocalFrame` dé-tourne le sous-arbre autour du centre de sa racine,
 *   laisse le moteur travailler sur des boîtes axées, puis le re-tourne du même angle
 *   autour du même pivot. Un enfant garde son angle propre par rapport au container.
 *
 * Reste à traiter de la même façon le redimensionnement d'un container déjà tourné
 * (sessions de resize).
 */
import { Point, util, type FabricObject } from "#fabric";
import { descendantsOf, subtreeOf } from "./hierarchy";

/** Tourne `obj` de `delta` degrés autour de `pivot` : son centre, et son angle. */
export function rotateAbout(obj: FabricObject, pivot: Point, delta: number): void {
  if (!delta) return;
  const center = obj.getCenterPoint().rotate(util.degreesToRadians(delta), pivot);
  // L'angle avant la position : pour une origine haut-gauche, changer l'angle déplace le centre
  obj.set({ angle: (obj.angle || 0) + delta });
  obj.setPositionByOrigin(center, "center", "center");
  obj.setCoords();
}

/**
 * Exécute `fn` dans le repère de `root` : son sous-arbre dé-tourné (root à 0°), puis
 * re-tourné autour du même pivot — le centre de root avant `fn`, pour que la rotation
 * reste rigide même si `fn` change la taille de root.
 */
export function inLocalFrame<T>(root: FabricObject, objects: FabricObject[], fn: () => T): T {
  const angle = root.angle || 0;
  if (Math.abs(angle) < 1e-6) return fn();

  const pivot = root.getCenterPoint();
  const subtree = subtreeOf(objects, [root]);
  for (const obj of subtree) rotateAbout(obj, pivot, -angle);
  try {
    return fn();
  } finally {
    for (const obj of subtree) rotateAbout(obj, pivot, angle);
  }
}

/**
 * Des objets qu'on tourne emmènent leur descendance : un container (bloc ou groupe), ou
 * les objets d'une sélection multiple (fabric tourne les membres, pas leurs descendants).
 * Chaque pas repart du début du geste, autour du centre de départ.
 */
export class SubtreeRotate {
  private constructor(
    /** Le geste Fabric (son `transform`) que cette rotation suit. */
    readonly transform: unknown,
    private readonly pivot: Point,
    private readonly startAngle: number,
    private readonly followers: Array<{ obj: FabricObject; center: Point; angle: number }>,
  ) {}

  static begin(target: FabricObject, moved: FabricObject[], transform: any, objects: FabricObject[]): SubtreeRotate {
    return new SubtreeRotate(
      transform,
      target.getCenterPoint(),
      transform?.original?.angle ?? target.angle ?? 0,
      descendantsOf(objects, moved).map((o) => ({ obj: o, center: o.getCenterPoint(), angle: o.angle || 0 })),
    );
  }

  /** La descendance suit la rotation de `target` depuis le début. */
  follow(target: FabricObject): void {
    const delta = (target.angle || 0) - this.startAngle;
    const rad = util.degreesToRadians(delta);
    for (const f of this.followers) {
      f.obj.set({ angle: f.angle + delta });
      f.obj.setPositionByOrigin(f.center.rotate(rad, this.pivot), "center", "center");
      f.obj.setCoords();
    }
  }
}
