/**
 * Ce qu'on fait d'une sélection : grouper, dégrouper, aligner, répartir, supprimer.
 */
import type { FabricObject } from "#fabric";
import { groupObjects, ungroupObject } from "../layout/grouping";
import { parentOf, stackParentOf, subtreeOf, translateSubtree } from "../layout/hierarchy";
import { boxOf, insetBox, type Box } from "../layout/geometry";
import { containerDataOf, directionOf, layoutOf, paddingOf } from "../layout/model";
import { alignAxis, alignDelta, distributeDeltas, unionBox, type AlignEdge, type DistributeAxis } from "../align";
import { rulesOf } from "../capabilities";
import type { FabricEditor } from "../FabricEditor";

export class SelectionCommands {
  constructor(private readonly editor: FabricEditor) {}

  // ── Grouper, dégrouper ────────────────────────────────────────────

  /**
   * Groupe la sélection (au moins deux objets) dans un groupe libre — rien ne bouge. La
   * resélection de ses membres remonte au groupe : c'est lui qui est sélectionné. Rend le
   * groupe, ou null.
   */
  groupSelection(): FabricObject | null {
    const selected = this.editor.selection.selected;
    if (selected.length < 2) return null;

    let group: FabricObject | null = null;
    this.editor.selection.withSelectionReleased(() => {
      group = groupObjects(this.editor.canvas, selected, `layer_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
      if (group) this.editor.layout.relayout();
    });
    return group;
  }

  /**
   * Dégroupe le container sélectionné : ses enfants restent à leur place, sélectionnés.
   * Rend les enfants (vide : rien à dégrouper).
   */
  ungroupSelection(): FabricObject[] {
    const container = this.editor.selection.current;
    if (!container || !containerDataOf(container)) return [];

    this.editor.canvas.discardActiveObject();
    const children = ungroupObject(this.editor.canvas, container);
    this.editor.layout.relayout();
    // Un bloc vide redevient une forme : elle reste sélectionnée
    const kept = this.editor.canvas.getObjects().includes(container);
    this.editor.selection.selectMany(children.length || !kept ? children : [container]);
    return children;
  }

  // ── Aligner, répartir ─────────────────────────────────────────────

  /**
   * Aligne la sélection. Plusieurs objets s'alignent sur leur boîte commune ; un objet
   * seul, sur l'intérieur de son container, ou sur l'artboard. Un objet bouge avec sa
   * descendance. Un enfant de pile ne bouge pas : il s'aligne dans la pile (alignSelf),
   * sur l'axe qu'elle laisse libre — l'autre est le sien.
   */
  alignSelection(edge: AlignEdge): void {
    if (!this.editor.selection.hasSelection) return;

    this.editor.selection.withSelectionReleased((selected) => {
      const objects = this.editor.canvas.getObjects();
      const ref = selected.length > 1
        ? unionBox(selected.map(boxOf))
        : this.alignReference(selected[0], objects);

      let relayout = false;
      for (const obj of selected) {
        const parent = stackParentOf(obj);
        if (parent) {
          relayout = this.alignInStack(obj, parent, edge) || relayout;
          continue;
        }
        const { dx, dy } = alignDelta(boxOf(obj), ref, edge);
        translateSubtree(objects, [obj], dx, dy);
      }
      if (relayout) this.editor.layout.relayout();
    });
    this.editor.canvas.renderAll();
  }

  /**
   * Répartit la sélection à espace égal sur un axe : les deux extrêmes restent en place.
   * Seulement les objets libres (un enfant de pile a la place que la pile lui donne), et
   * à partir de trois.
   */
  distributeSelection(axis: DistributeAxis): void {
    const objects = this.editor.canvas.getObjects();
    const free = this.editor.selection.selected.filter((obj) => !stackParentOf(obj));
    if (free.length < 3) return;

    this.editor.selection.withSelectionReleased(() => {
      const deltas = distributeDeltas(free.map(boxOf), axis);
      free.forEach((obj, i) => translateSubtree(objects, [obj], deltas[i].dx, deltas[i].dy));
    });
    this.editor.canvas.renderAll();
  }

  /** Aligne un enfant dans sa pile, sur l'axe qu'elle laisse libre. Vrai s'il a changé. */
  private alignInStack(obj: FabricObject, parent: FabricObject, edge: AlignEdge): boolean {
    const direction = directionOf(containerDataOf(parent));
    if (alignAxis(edge) !== (direction === "column" ? "x" : "y")) return false;

    const layout = layoutOf(obj)!;
    const alignSelf = edge === "left" || edge === "top" ? "flex-start"
      : edge === "right" || edge === "bottom" ? "flex-end"
      : "center";
    if (layout.child!.alignSelf === alignSelf) return false;
    obj.set("layout", { ...layout, child: { ...layout.child!, alignSelf } });
    return true;
  }

  /** La référence d'un objet seul : l'intérieur de son container, sinon l'artboard. */
  private alignReference(obj: FabricObject, objects: FabricObject[]): Box {
    const parent = parentOf(obj, objects);
    if (!parent) return { left: 0, top: 0, width: this.editor.width, height: this.editor.height };

    return insetBox(boxOf(parent), paddingOf(containerDataOf(parent)));
  }

  /**
   * Supprime l'objet ou les objets sélectionnés
   * Les objets verrouillés (position ou full) ne peuvent pas être supprimés ; un container
   * emporte sa descendance.
   */
  deleteSelection(): void {
    const selected = this.editor.selection.selected;
    if (selected.length === 0) return;

    // Filtrer les objets verrouillés (ne supprimer que les objets non verrouillés)
    const deletable = selected.filter((obj) => rulesOf(obj).deletes);
    if (deletable.length === 0) return;

    // Un container emporte toute sa descendance
    const doomed = subtreeOf(this.editor.canvas.getObjects(), deletable);
    this.editor.canvas.discardActiveObject();
    this.editor.layers.removeMany(doomed);
    this.editor.canvas.renderAll();
  }
}
