/**
 * Un container pris par un coin : tout grandit à l'échelle — une pile comme un groupe,
 * un bloc vide aussi — sans scale, les modes de taille inchangés, le coin opposé immobile.
 * Vrai moteur Fabric (node-canvas), vrai Yoga.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { StaticCanvas, type FabricObject } from "#fabric";
import { CustomTextbox } from "../controls/CustomTextbox";
import { FabRect } from "../shapes/FabRect";
import { initYoga } from "./stack/engine";
import { runLayout } from "./run";
import { ScaleSession } from "./scale-session";
import type { LayoutData } from "./types";
import { topLeft, scaledSize } from "./geometry";
import { sizingOf, containerDataOf } from "./model";

beforeAll(async () => {
  await initYoga();
});

const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

function rect(id: string, left: number, top: number, w: number, h: number, layout?: LayoutData): FabRect {
  const r = new FabRect({ left, top, width: w, height: h, originX: "left", originY: "top", strokeWidth: 0 });
  r.set({ layerId: id, layout } as never);
  return r;
}

function text(id: string, content: string, parentId: string, order = 0): CustomTextbox {
  const t = new CustomTextbox(content, { fontSize: 20, fontFamily: "Arial", left: 0, top: 0, originX: "left", originY: "top" });
  t.set({ layerId: id, layout: { child: { parentId, order } } } as never);
  return t;
}

function canvasWith(...objects: FabricObject[]): StaticCanvas {
  const canvas = new StaticCanvas(undefined, { width: 2000, height: 2000, renderOnAddRemove: false });
  canvas.add(...objects);
  return canvas;
}

const box = (obj: FabricObject) => {
  const tl = topLeft(obj);
  const { w, h } = scaledSize(obj);
  return { x: Math.round(tl.x), y: Math.round(tl.y), w: Math.round(w), h: Math.round(h) };
};

type B = ReturnType<typeof box>;
const expectNear = (actual: B, expected: B) => {
  for (const key of ["x", "y", "w", "h"] as const) expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(1);
};

/** Le coin bas-droit tiré au facteur k : la poignée a posé la boîte du porteur. */
function dragCorner(session: ScaleSession, container: FabricObject, k: number): void {
  const { start } = session;
  container.set({ width: start.width * k, height: start.height * k });
  session.step({ originX: "left", originY: "top" });
}

describe("une pile prise par un coin", () => {
  it("tout grandit à l'échelle, sans scale, le coin opposé reste, les modes ne changent pas", () => {
    const stack = rect("s", 100, 100, 1, 1, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD, gap: 6 } });
    const a = rect("a", 0, 0, 50, 30, { child: { parentId: "s", order: 0 } });
    const t = text("t", "Bonjour", "s", 1);
    const canvas = canvasWith(stack, a, t);
    runLayout(canvas.getObjects());
    const start = { s: box(stack), a: box(a), t: box(t) };

    const session = ScaleSession.begin(stack, canvas.getObjects());
    dragCorner(session, stack, 2);

    // La hauteur d'un texte s'arrondit (mesure de la police) : à 1 px près
    expectNear(box(stack), { x: 100, y: 100, w: start.s.w * 2, h: start.s.h * 2 });
    expect(box(a)).toEqual({ x: 120, y: 120, w: 100, h: 60 });
    expect(a.scaleX).toBe(1);
    expect(t.fontSize).toBe(40);
    expect(t.scaleX).toBe(1);
    expect(Math.abs(box(t).y - (120 + 60 + 12))).toBeLessThanOrEqual(1);
    expect(containerDataOf(stack)).toMatchObject({ padding: { top: 20, right: 20, bottom: 20, left: 20 }, gap: 12 });
    expect(sizingOf(stack)).toMatchObject({ x: "hug", y: "hug" });
    expect(stack.scaleX).toBe(1);

    // Une homothétie est un point fixe du layout : la passe qui suit ne bouge rien
    const scaled = { s: box(stack), a: box(a), t: box(t) };
    runLayout(canvas.getObjects());
    expectNear(box(stack), scaled.s);
    expect(box(a)).toEqual(scaled.a);
    expectNear(box(t), scaled.t);

    // Chaque pas repart du départ
    dragCorner(session, stack, 1);
    expectNear(box(stack), start.s);
    expect(box(a)).toEqual(start.a);
    expect(t.fontSize).toBe(20);
  });

  it("en taille fixe : la boîte suit le facteur, le mode reste fixe", () => {
    const stack = rect("s", 0, 0, 300, 200, { sizing: { x: "fixed", y: "fixed" }, container: { padding: PAD } });
    const a = rect("a", 0, 0, 50, 30, { child: { parentId: "s" } });
    const canvas = canvasWith(stack, a);
    runLayout(canvas.getObjects());

    const session = ScaleSession.begin(stack, canvas.getObjects());
    dragCorner(session, stack, 1.5);

    expect(box(stack)).toEqual({ x: 0, y: 0, w: 450, h: 300 });
    expect(box(a)).toEqual({ x: 15, y: 15, w: 75, h: 45 });
    expect(sizingOf(stack)).toMatchObject({ x: "fixed", y: "fixed" });
  });

  it("le plancher posé par les bords suit le facteur", () => {
    const stack = rect("s", 0, 0, 1, 1, { sizing: { x: "hug", y: "hug", minSize: { w: 200, h: 120 } }, container: { padding: PAD } });
    const a = rect("a", 0, 0, 50, 30, { child: { parentId: "s" } });
    const canvas = canvasWith(stack, a);
    runLayout(canvas.getObjects());
    expect(box(stack)).toMatchObject({ w: 200, h: 120 });

    const session = ScaleSession.begin(stack, canvas.getObjects());
    dragCorner(session, stack, 2);
    expect(sizingOf(stack).minSize).toEqual({ w: 400, h: 240 });
    expect(box(stack)).toMatchObject({ w: 400, h: 240 });
  });

  it("une pile dans la pile : ses marges et son contenu suivent aussi", () => {
    const root = rect("r", 0, 0, 1, 1, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    const inner = rect("i", 0, 0, 1, 1, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD, gap: 4 }, child: { parentId: "r" } });
    const a = rect("a", 0, 0, 40, 20, { child: { parentId: "i", order: 0 } });
    const b = rect("b", 0, 0, 40, 20, { child: { parentId: "i", order: 1 } });
    const canvas = canvasWith(root, inner, a, b);
    runLayout(canvas.getObjects());
    expect(box(inner)).toEqual({ x: 10, y: 10, w: 60, h: 64 });

    const session = ScaleSession.begin(root, canvas.getObjects());
    dragCorner(session, root, 2);

    expect(box(root)).toEqual({ x: 0, y: 0, w: 160, h: 168 });
    expect(box(inner)).toEqual({ x: 20, y: 20, w: 120, h: 128 });
    expect(box(b)).toEqual({ x: 40, y: 40 + 40 + 8, w: 80, h: 40 });
    expect(containerDataOf(inner)).toMatchObject({ gap: 8 });
  });

  it("un bloc vide : sa boîte, sa marge et son plancher grandissent, sans changer de mode", () => {
    const block = rect("b", 50, 50, 100, 60, { sizing: { x: "hug", y: "hug", minSize: { w: 100, h: 60 } }, container: { padding: PAD } });
    const canvas = canvasWith(block);
    runLayout(canvas.getObjects());

    const session = ScaleSession.begin(block, canvas.getObjects());
    dragCorner(session, block, 2);

    expect(box(block)).toEqual({ x: 50, y: 50, w: 200, h: 120 });
    expect(sizingOf(block)).toEqual({ x: "hug", y: "hug", minSize: { w: 200, h: 120 } });
    expect(containerDataOf(block)?.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(block.scaleX).toBe(1);
  });

  it("dans un parent à taille fixe, le facteur s'arrête à la place laissée ; le parent la remet en page", () => {
    const parent = rect("p", 0, 0, 200, 300, { sizing: { x: "fixed", y: "fixed" }, container: { padding: PAD } });
    const child = rect("c", 0, 0, 1, 1, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD }, child: { parentId: "p" } });
    const a = rect("a", 0, 0, 40, 20, { child: { parentId: "c" } });
    const canvas = canvasWith(parent, child, a);
    runLayout(canvas.getObjects());
    expect(box(child)).toEqual({ x: 10, y: 10, w: 60, h: 40 });

    const session = ScaleSession.begin(child, canvas.getObjects());
    dragCorner(session, child, 10);

    // La place : 180 de large → k = 3
    expect(box(child)).toEqual({ x: 10, y: 10, w: 180, h: 120 });
    expect(box(a)).toEqual({ x: 40, y: 40, w: 120, h: 60 });
    expect(box(parent)).toEqual({ x: 0, y: 0, w: 200, h: 300 });
  });
});

describe("une forme prise par un coin", () => {
  it("garde ses proportions, dans width/height, le coin opposé immobile", () => {
    const r = rect("r", 0, 0, 100, 50);
    canvasWith(r);
    const transform = { target: r, corner: "br", originX: "left", originY: "top" } as any;
    r.handleCornerResize(transform, 200, 20);
    expect(box(r)).toEqual({ x: 0, y: 0, w: 147, h: 73 });
    expect(r.scaleX).toBe(1);
    expect(r.scaleY).toBe(1);

    // Chaque pas repart de la taille de départ
    r.handleCornerResize(transform, 100, 50);
    expect(box(r)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
});
