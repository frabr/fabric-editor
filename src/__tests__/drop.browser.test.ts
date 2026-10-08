/**
 * Glisser-déposer dans un container (machine DTL), piloté comme le fait la toolbox :
 * tickExternalDrag à chaque pas, puis commit ou rollback. Minuteries simulées : le survol
 * silencieux puis l'indice précèdent l'ancrage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Rect, type FabricObject } from "#fabric";
import { FabricEditor } from "../FabricEditor";
import { initYoga } from "../layout/stack/engine";
import { childDataOf, containerDataOf, parentIdOf } from "../layout/model";
import { InsertChildSession } from "../layout/stack/sessions/insert-child";
import { ContainerizeSession } from "../layout/stack/sessions/containerize";

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

  it("un bloc dont on ressort avant de lâcher reste un bloc vide", () => {
    const shape = rect("shape", 100, 100, 300, 200);
    editor.canvas.add(shape);
    editor.layout.makeContainer(shape);
    const source = rect("new", 0, 0, 40, 40);

    hoverUntilAnchored(source, { x: 250, y: 200 });
    editor.layout.tickExternalDrag(source, { x: 900, y: 900 });
    expect(editor.layout.isAnchored).toBe(false);
    expect(parentIdOf(source)).toBeUndefined();
    expect(containerDataOf(shape)).toBeDefined();
    expect([shape.width, shape.height]).toEqual([300, 200]);
  });

  describe("réaccrocher un enfant (dans le container entré)", () => {
    /** Une colonne : a puis b. */
    function column() {
      const container = rect("s", 100, 100, 200, 300, {
        sizing: { x: "hug", y: "hug" },
        container: { padding: { top: 10, right: 10, bottom: 10, left: 10 }, gap: 10, flexDirection: "column" },
      });
      const a = rect("a", 0, 0, 50, 50, { child: { parentId: "s", order: 0 } });
      const b = rect("b", 0, 0, 50, 50, { child: { parentId: "s", order: 1 } });
      editor.canvas.add(container, a, b);
      editor.layout.relayout();
      return { container, a, b };
    }

    it("tiré hors de la pile, il en sort ; la pile se range sans lui", () => {
      const { container, a, b } = column();
      const session = InsertChildSession.reattach(editor.canvas, container, a, { x: 135, y: 135 });

      expect(session.handleMoving({ x: 900, y: 900 })).toBe("exited");
      expect(parentIdOf(a)).toBeUndefined();
      expect(parentIdOf(b)).toBe("s");
      expect(b.top).toBe(110);
    });

    it("glissé au-delà de son voisin, il passe après lui", () => {
      const { container, a, b } = column();
      const session = InsertChildSession.reattach(editor.canvas, container, a, { x: 135, y: 135 });

      // Le voisin va de 170 à 220 : il faut le dépasser entièrement
      session.handleMoving({ x: 135, y: 240 });
      session.commit();
      // Au commit, les enfants glissent vers leur place (animation)
      vi.advanceTimersByTime(1000);
      expect(childDataOf(a)!.order! > childDataOf(b)!.order!).toBe(true);
      expect(b.top).toBe(110);
      expect(a.top).toBeGreaterThanOrEqual(b.top + 50);
    });

    it("seul enfant tiré dehors : il sort, le container garde ses réglages", () => {
      const container = rect("s", 100, 100, 200, 200, {
        sizing: { x: "fixed", y: "fixed" }, container: { padding: { top: 10, right: 10, bottom: 10, left: 10 } },
      });
      const a = rect("a", 0, 0, 50, 50, { child: { parentId: "s", order: 0 } });
      editor.canvas.add(container, a);
      editor.layout.relayout();

      const session = ContainerizeSession.reattach(editor.canvas, container, a, { x: 135, y: 135 });
      expect(session.handleMoving({ x: 900, y: 900 })).toBe("exited");
      expect(parentIdOf(a)).toBeUndefined();
      expect(containerDataOf(container)).toBeDefined();
      expect([container.width, container.height]).toEqual([200, 200]);
    });
  });
});
