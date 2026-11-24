/**
 * Les gestes de souris avec une touche — déclarés dans la table des raccourcis (les entrées
 * `gesture`) et lus ici, à chaque pas du geste, par `editor.shortcuts.gesture(id, e)` :
 * - ⌥ au départ d'un glisser (`duplicate-on-drag`) : une copie reste à la place de départ,
 *   l'original part sous le curseur ; la copie est juste derrière lui dans les plans ;
 * - ⇧ pendant un glisser (`drag-axis`) : l'objet ne bouge que sur l'axe dominant ;
 * - la rotation va au cran de 15° ; ⇧ (`rotate-free`) la libère ;
 * - Échap pendant un geste (`cancel-gesture`, une touche) : tout revient en place — position,
 *   taille, angle, la copie de ⌥, la session de dépôt dans une pile.
 *
 * Fabric décrit le geste en cours (`before:transform` : `transform.action`, `original`) ; on
 * y ajoute ce qu'il n'enregistre pas (la taille) pour pouvoir annuler.
 */
import type { FabricObject } from "#fabric";
import type { FabricEditor } from "./FabricEditor";

export const ROTATION_STEP = 15;

interface Transform {
  action: string;
  target: FabricObject;
  actionPerformed?: boolean;
  original: { left: number; top: number };
}

type Snapshot = Record<string, unknown>;
const SNAPSHOT_KEYS = ["left", "top", "scaleX", "scaleY", "angle", "skewX", "skewY", "flipX", "flipY", "width", "height"];

interface Current {
  transform: Transform;
  target: FabricObject;
  snapshot: Snapshot;
  /** La copie laissée sur place par ⌥ (retirée si le geste s'annule). */
  clones: FabricObject[];
  snapAngleBefore: unknown;
}

export class GestureManager {
  private current: Current | null = null;
  private readonly onBeforeTransform = (e: { e?: Event; transform?: Transform }) => this.begin(e);
  private readonly onMoving = (e: { e?: Event; transform?: Transform; target?: FabricObject }) => this.moving(e);
  private readonly onRotating = (e: { e?: Event; target?: FabricObject }) => this.rotating(e);
  private readonly onEnd = () => this.end();

  constructor(private readonly editor: FabricEditor) {
    const canvas = this.editor.canvas;
    canvas.on("before:transform", this.onBeforeTransform);
    canvas.on("object:moving", this.onMoving);
    canvas.on("object:rotating", this.onRotating);
    canvas.on("mouse:up", this.onEnd);
  }

  /** Un geste est en cours (entre le départ et le relâchement). */
  get active(): boolean {
    return this.current !== null;
  }

  /**
   * Annule le geste en cours : l'objet reprend sa place, sa taille et son angle ; la copie
   * de ⌥ s'efface ; la pile qui l'accueillait le rend. Faux sans geste.
   */
  cancel(): boolean {
    const current = this.current;
    if (!current) return false;
    this.current = null;

    const { target, transform, snapshot, clones } = current;
    target.set(snapshot);
    target.setCoords();
    this.restoreSnap(current);
    clones.forEach((clone) => this.editor.canvas.remove(clone));
    this.editor.layout.rollbackExternalDrag();

    // Le geste fabric se termine ici : plus de transformation, rien de « performé » — le
    // relâchement ne modifiera rien
    transform.actionPerformed = false;
    (target as { isMoving?: boolean }).isMoving = false;
    (this.editor.canvas.originalFabricCanvas as unknown as { _currentTransform: unknown })._currentTransform = null;
    this.editor.canvas.requestRenderAll();
    return true;
  }

  dispose(): void {
    const canvas = this.editor.canvas;
    canvas.off("before:transform", this.onBeforeTransform);
    canvas.off("object:moving", this.onMoving);
    canvas.off("object:rotating", this.onRotating);
    canvas.off("mouse:up", this.onEnd);
    this.current = null;
  }

  private begin(e: { e?: Event; transform?: Transform }): void {
    const transform = e.transform;
    if (!transform?.target) return;
    const target = transform.target;
    const snapshot = Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, target.get(key)]));
    const current: Current = { transform, target, snapshot, clones: [], snapAngleBefore: target.get("snapAngle") };
    this.current = current;

    if (transform.action === "rotate") target.set("snapAngle", ROTATION_STEP);
    if (transform.action === "drag" && e.e && this.editor.shortcuts.gesture("duplicate-on-drag", e.e as MouseEvent)) {
      void this.editor.cloneInPlace(this.editor.selection.selected).then((clones) => {
        if (this.current === current) current.clones = clones;
        else clones.forEach((clone) => this.editor.canvas.remove(clone));
      });
    }
  }

  /** ⇧ pendant un glisser : l'axe dominant depuis le départ, l'autre coordonnée reste. */
  private moving(e: { e?: Event; transform?: Transform; target?: FabricObject }): void {
    const target = e.target;
    const original = e.transform?.original;
    if (!target || !original || !e.e || !this.editor.shortcuts.gesture("drag-axis", e.e as MouseEvent)) return;

    const dx = (target.left ?? 0) - original.left;
    const dy = (target.top ?? 0) - original.top;
    if (Math.abs(dx) >= Math.abs(dy)) target.set("top", original.top);
    else target.set("left", original.left);
    target.setCoords();
  }

  /** Le cran de 15°, ou la rotation libre tant que ⇧ est tenu (lu au pas suivant). */
  private rotating(e: { e?: Event; target?: FabricObject }): void {
    if (!e.target || !e.e) return;
    e.target.set("snapAngle", this.editor.shortcuts.gesture("rotate-free", e.e as MouseEvent) ? 0 : ROTATION_STEP);
  }

  private end(): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.restoreSnap(current);
  }

  private restoreSnap({ target, snapAngleBefore, transform }: Current): void {
    if (transform.action === "rotate") target.set("snapAngle", snapAngleBefore);
  }
}
