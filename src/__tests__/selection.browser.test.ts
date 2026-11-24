/**
 * Sélection multiple : normalisée au niveau visé, exportée en positions absolues ;
 * aligner, répartir, supprimer à plusieurs. Éditeur complet (jsdom).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ActiveSelection, Rect, type FabricObject } from "#fabric";
import { FabricEditor } from "../FabricEditor";

function rect(layerId: string, left: number, top: number, w = 20, h = 20, layout?: object): Rect {
  return new Rect({ layerId, left, top, width: w, height: h, originX: "left", originY: "top", strokeWidth: 0, layout } as never);
}

const ids = (objects: FabricObject[]) => objects.map((o) => o.get("layerId"));

describe("sélection multiple", () => {
  let el: HTMLCanvasElement;
  let editor: FabricEditor;

  beforeEach(() => {
    el = document.createElement("canvas");
    document.body.appendChild(el);
    editor = new FabricEditor(el, { width: 500, height: 500 });
  });

  afterEach(() => {
    editor.dispose();
    el.remove();
  });

  function selectAll(objects: FabricObject[]): void {
    editor.canvas.setActiveObject(new ActiveSelection(objects, { canvas: editor.canvas.originalFabricCanvas }));
  }

  /** box (container) > child ; other à côté. */
  function scene() {
    const box = rect("box", 100, 100, 80, 80, { container: {} });
    const child = rect("child", 110, 110, 20, 20, { child: { parentId: "box" } });
    const other = rect("other", 300, 50);
    editor.canvas.add(box, child, other);
    return { box, child, other };
  }

  it("un enfant remonte à son container, jamais avec lui", () => {
    const { box, child, other } = scene();
    selectAll([child, other]);
    expect(ids(editor.selection.selected)).toEqual(["box", "other"]);

    selectAll([box, child, other]);
    expect(ids(editor.selection.selected)).toEqual(["box", "other"]);
  });

  it("un seul objet retenu : sélection simple", () => {
    const { box, child } = scene();
    selectAll([box, child]);
    expect(editor.selection.isMultipleSelection).toBe(false);
    expect(editor.selection.current).toBe(box);
  });

  it("les objets d'une sélection s'exportent à leur place sur le canvas", () => {
    const { box, other } = scene();
    selectAll([box, other]);
    expect(box.group).toBeInstanceOf(ActiveSelection);
    expect(box.toObject()).toMatchObject({ left: 100, top: 100 });
    expect(other.toObject()).toMatchObject({ left: 300, top: 50 });
  });

  it("aligner à gauche : sur la boîte commune, le container emmène son enfant", () => {
    const { box, child, other } = scene();
    selectAll([box, other]);
    editor.alignSelection("left");

    expect(other.toObject().left).toBe(100);
    expect(box.toObject().left).toBe(100);
    expect(child.left).toBe(110);
    expect(ids(editor.selection.selected)).toEqual(["box", "other"]);

    editor.alignSelection("bottom");
    expect(box.toObject().top).toBe(100);
    expect(other.toObject().top).toBe(160);
    expect(child.top).toBe(110);
  });

  it("un objet seul s'aligne sur l'artboard", () => {
    const { other } = scene();
    editor.selection.select(other);
    editor.alignSelection("right");
    expect(other.left).toBe(480);
  });

  it("répartir : les extrêmes restent, le milieu se centre", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 30, 0);
    const c = rect("c", 200, 0);
    editor.canvas.add(a, b, c);
    selectAll([a, b, c]);
    editor.distributeSelection("horizontal");
    expect([a, b, c].map((o) => o.toObject().left)).toEqual([0, 100, 200]);
  });

  it("supprimer un container emporte sa descendance", () => {
    const { box, other } = scene();
    editor.selection.select(box);
    editor.deleteSelection();
    expect(ids(editor.canvas.getObjects())).toEqual([other.get("layerId")]);
  });

  it("grouper la sélection : rien ne bouge, le groupe est sélectionné ; dégrouper rend ses membres", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 50);
    editor.canvas.add(a, b);
    selectAll([a, b]);

    const group = editor.groupSelection()!;
    expect(editor.selection.current).toBe(group);
    expect(group.toObject()).toMatchObject({ left: 0, top: 0, width: 120, height: 70 });
    expect(a.toObject()).toMatchObject({ left: 0, top: 0 });

    expect(editor.ungroupSelection().map((o) => o.get("layerId"))).toEqual(["a", "b"]);
    expect(ids(editor.selection.selected)).toEqual(["a", "b"]);
    expect(ids(editor.canvas.getObjects())).toEqual(["a", "b"]);
  });

  it("hors du groupe, sélectionner ses membres sélectionne le groupe", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 50);
    editor.canvas.add(a, b);
    selectAll([a, b]);
    const group = editor.groupSelection()!;

    editor.canvas.setActiveObject(new ActiveSelection([a, b], { canvas: editor.canvas.originalFabricCanvas }));
    expect(editor.selection.current).toBe(group);
  });
});
