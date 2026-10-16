/**
 * Copier, couper, coller, dupliquer : la sélection et toute sa descendance, collées à côté
 * (+32 px, le décalage des éditeurs de design) avec des ids neufs — les liens parent/enfant
 * suivent. Le presse-papiers est celui de l'éditeur, en mémoire ; dupliquer ne le touche pas.
 */
import type { FabricObject } from "#fabric";
import { subtreeOf } from "../layout/hierarchy";
import type { FabricEditor } from "../FabricEditor";

export class Clipboard {
  constructor(private readonly editor: FabricEditor) {}

  // ── Clipboard (copy / paste) ──────────────────────────────────────

  private _clipboard: any[] | null = null;

  /**
   * Copy the current selection to an internal clipboard, with every descendant of the
   * selected containers, in stack order.
   */
  copySelection(): void {
    const selected = this.editor.selection.selected;
    if (selected.length === 0) return;

    const toCopy = subtreeOf(this.editor.canvas.getObjects(), selected);

    this._clipboard = toCopy.map((obj) =>
      obj.toObject(["layerId", "lockMode", "lockContent", "layout", "bindings"])
    );
  }

  /** Couper : copier, puis retirer la sélection (les objets verrouillés restent). */
  cutSelection(): void {
    this.copySelection();
    this.editor.deleteSelection();
  }

  /** Dupliquer : une copie décalée de 32 px, sélectionnée — sans toucher au presse-papiers. */
  async duplicateSelection(): Promise<FabricObject[]> {
    const kept = this._clipboard;
    this.copySelection();
    const copies = await this.pasteClipboard();
    this._clipboard = kept;
    return copies;
  }

  /**
   * Paste clipboard contents onto the canvas.
   * Generates fresh layerIds and remaps parent/child references.
   * Offsets pasted objects by 32px so they don't overlap the originals.
   */
  async pasteClipboard(): Promise<FabricObject[]> {
    if (!this._clipboard?.length) return [];

    const OFFSET = 32;

    // Build an ID remapping table: old layerId → new layerId
    const idMap = new Map<string, string>();
    this._clipboard.forEach((data, i) => {
      if (data.layerId) {
        idMap.set(data.layerId, `layer_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`);
      }
    });

    // Deep-clone each layer, assign new IDs, remap layout references, offset position
    const cloned: any[] = this._clipboard.map((data) => {
      const copy = JSON.parse(JSON.stringify(data));

      // Assign new layerId
      if (copy.layerId && idMap.has(copy.layerId)) {
        copy.layerId = idMap.get(copy.layerId);
      }

      // Remap layout.child.parentId
      if (copy.layout?.child?.parentId) {
        const newParent = idMap.get(copy.layout.child.parentId);
        if (newParent) copy.layout.child.parentId = newParent;
      }

      // Offset position
      if (typeof copy.left === "number") copy.left += OFFSET;
      if (typeof copy.top === "number") copy.top += OFFSET;

      // Clear lock so pasted objects are freely editable
      delete copy.lockMode;

      return copy;
    });

    // Deserialize and add each object
    const objects: FabricObject[] = [];
    for (const data of cloned) {
      const obj = await this.editor.layers.deserialize(data);
      if (obj) {
        this.editor.layers.add(obj);
        objects.push(obj);
      }
    }

    // Select the pasted objects (their roots: children follow their container)
    this.editor.selection.selectMany(objects);
    this.editor.canvas.renderAll();
    this.editor.selection.notifyModified(null);
    return objects;
  }
}
