/**
 * Copier, coller : la sélection et toute sa descendance, collées à côté (+20 px) avec des
 * ids neufs — les liens parent/enfant suivent.
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

  /**
   * Paste clipboard contents onto the canvas.
   * Generates fresh layerIds and remaps parent/child references.
   * Offsets pasted objects by 20px so they don't overlap the originals.
   */
  async pasteClipboard(): Promise<FabricObject[]> {
    if (!this._clipboard?.length) return [];

    const OFFSET = 20;

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
    return objects;
  }
}
