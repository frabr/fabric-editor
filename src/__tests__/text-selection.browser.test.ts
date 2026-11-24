/**
 * La sélection d'un texte en édition survit au rendu : la passe after:render efface le
 * calque du dessus (lasso, liserés) où Fabric la peint — elle y est repeinte.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FabricEditor } from "../FabricEditor";
import { CustomTextbox } from "../controls/CustomTextbox";

describe("texte en édition — rendu", () => {
  let el: HTMLCanvasElement;
  let editor: FabricEditor;

  beforeEach(() => {
    el = document.createElement("canvas");
    document.body.appendChild(el);
    editor = new FabricEditor(el, { width: 300, height: 200 });
  });

  afterEach(() => {
    editor.dispose();
    el.remove();
  });

  it("after:render repeint le curseur ou la sélection du texte actif", () => {
    const text = new CustomTextbox("Bonjour le monde", { left: 10, top: 10, fontSize: 24 });
    editor.canvas.add(text);
    editor.canvas.setActiveObject(text);
    const repaint = vi.spyOn(text, "renderCursorOrSelection");

    editor.canvas.originalFabricCanvas.fire("after:render");
    expect(repaint).toHaveBeenCalledTimes(1);
  });
});
