/**
 * Glisser-déposer dans un container (machine DTL), piloté comme le fait la toolbox :
 * tickExternalDrag à chaque pas, puis commit ou rollback. Minuteries simulées : le survol
 * silencieux puis l'indice précèdent l'ancrage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Rect, type FabricObject } from "#fabric";
import { FabricEditor } from "../FabricEditor";
import { initYoga } from "../layout/stack/engine";
import { containerDataOf, parentIdOf } from "../layout/model";

function rect(layerId: string, left: number, top: number, w: number, h: number, layout?: object): Rect {
  return new Rect({ layerId, left, top, width: w, height: h, originX: "left", originY: "top", strokeWidth: 0, layout } as never);
}

describe("déposer dans un container", () => {
  let el: HTMLCanvasElement;
  let editor: FabricEditor;

  beforeEach(async () => {
    await initYoga();
    vi.useFakeTimers();
    el = document.createElement("canvas");
    document.body.appendChild(el);
    editor = new FabricEditor(el, { width: 1000, height: 1000 });
  });

  afterEach(() => {
    editor.dispose();
    el.remove();
    vi.useRealTimers();
  });

  /** Survole `at` le temps d'ancrer (survol silencieux, puis indice). */
  function hoverUntilAnchored(source: FabricObject, at: { x: number; y: number }): void {
    editor.layout.tickExternalDrag(source, at);
    vi.advanceTimersByTime(800);
    editor.layout.tickExternalDrag(source, at);
    vi.advanceTimersByTime(600);
    editor.layout.tickExternalDrag(source, at);
  }

  /** Une pile de 300 × 300 avec un enfant. */
  function stack() {
    const container = rect("s", 100, 100, 300, 300, {
      sizing: { x: "fixed", y: "fixed" },
      container: { padding: { top: 10, right: 10, bottom: 10, left: 10 }, gap: 10 },
    });
    const first = rect("first", 0, 0, 50, 50, { child: { parentId: "s", order: 0 } });
    editor.canvas.add(container, first);
    editor.layout.relayout();
    return { container, first };
  }

  it("un objet lâché sur un container y entre et s'y range", () => {
    const { container } = stack();
    const source = rect("new", 0, 0, 40, 40);

    hoverUntilAnchored(source, { x: 250, y: 300 });
    expect(editor.layout.isAnchored).toBe(true);
    expect(editor.layout.commitExternalDrag()).toBe(true);

    expect(parentIdOf(source)).toBe(container.get("layerId"));
    expect(editor.canvas.getObjects()).toContain(source);
  });

  it("annulé, il n'entre pas", () => {
    stack();
    const source = rect("new", 0, 0, 40, 40);

    hoverUntilAnchored(source, { x: 250, y: 300 });
    editor.layout.rollbackExternalDrag();

    expect(parentIdOf(source)).toBeUndefined();
  });

  it("lâché avant l'ancrage, rien ne se passe", () => {
    stack();
    const source = rect("new", 0, 0, 40, 40);

    editor.layout.tickExternalDrag(source, { x: 250, y: 300 });
    vi.advanceTimersByTime(300);
    expect(editor.layout.commitExternalDrag()).toBe(false);
    expect(parentIdOf(source)).toBeUndefined();
  });

  it("hors de tout container, rien ne s'arme", () => {
    stack();
    const source = rect("new", 0, 0, 40, 40);

    hoverUntilAnchored(source, { x: 800, y: 800 });
    expect(editor.layout.isAnchored).toBe(false);
  });

  it("une forme simple ne devient pas un container : on la survole, rien ne s'arme", () => {
    const shape = rect("shape", 100, 100, 300, 300);
    editor.canvas.add(shape);
    const source = rect("new", 0, 0, 40, 40);

    hoverUntilAnchored(source, { x: 250, y: 250 });
    expect(editor.layout.isAnchored).toBe(false);
    expect(editor.layout.commitExternalDrag()).toBe(false);
    expect(containerDataOf(shape)).toBeUndefined();
  });

  it("une forme utilisée comme bloc reçoit son premier élément, et garde sa taille", () => {
    const shape = rect("shape", 100, 100, 300, 200);
    editor.canvas.add(shape);
    editor.layout.makeContainer(shape);
    expect(containerDataOf(shape)).toBeDefined();

    const source = rect("new", 0, 0, 40, 40);
    hoverUntilAnchored(source, { x: 250, y: 200 });
    expect(editor.layout.commitExternalDrag()).toBe(true);

    expect(parentIdOf(source)).toBe("shape");
    expect([shape.width, shape.height]).toEqual([300, 200]);
  });
});
