/**
 * Groupes (containers libres) : les enfants restent à leur place, la boîte du groupe les
 * suit ; dans une pile, un groupe est un bloc que ses enfants suivent ; le redimensionner
 * passe dans les dimensions de ses enfants. Grouper, dégrouper.
 * Vrai moteur Fabric (node-canvas), vrai Yoga.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { StaticCanvas, type FabricObject } from "#fabric";
import { CustomTextbox } from "../../controls/CustomTextbox";
import { FabRect } from "../../shapes/FabRect";
import { initYoga } from "../stack/engine";
import { runLayout } from "../run";
import { fitFreeContainer } from "./fit";
import { FreeResizeSession } from "./resize-session";
import { stackParentOf } from "../hierarchy";
import { minSizeOf } from "../stack/min-size";
import { availableRoom } from "../stack/room";
import { groupObjects, padGroupOnFirstFill, ungroupObject } from "../grouping";
import { arrangeAsStack, arrangeFree } from "../arrangement";
import type { LayoutData } from "../types";
import { topLeft, scaledSize } from "../geometry";
import { layoutOf, containerDataOf, childDataOf } from "../model";

beforeAll(async () => {
  await initYoga();
});

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

function rect(id: string, left: number, top: number, w: number, h: number, layout?: LayoutData): FabRect {
  const r = new FabRect({ left, top, width: w, height: h, originX: "left", originY: "top", strokeWidth: 0 });
  r.set({ layerId: id, layout } as never);
  return r;
}

function group(id: string, padding = ZERO, child?: LayoutData["child"]): FabRect {
  return rect(id, 0, 0, 1, 1, { container: { arrangement: "free", origin: "group", padding }, ...(child ? { child } : {}) });
}

function canvasWith(...objects: FabricObject[]): StaticCanvas {
  const canvas = new StaticCanvas(undefined, { width: 1000, height: 1000, renderOnAddRemove: false });
  canvas.add(...objects);
  return canvas;
}

const box = (obj: FabricObject) => {
  const tl = topLeft(obj);
  const { w, h } = scaledSize(obj);
  return { x: Math.round(tl.x), y: Math.round(tl.y), w: Math.round(w), h: Math.round(h) };
};
const ids = (objects: FabricObject[]) => objects.map((o) => o.get("layerId"));

describe("groupe libre", () => {
  it("sa boîte est l'union de ses enfants, plus sa marge ; les enfants ne bougent pas", () => {
    const g = group("g", { top: 10, right: 20, bottom: 10, left: 20 });
    const a = rect("a", 100, 100, 50, 50, { child: { parentId: "g" } });
    const b = rect("b", 300, 200, 40, 20, { child: { parentId: "g" } });
    runLayout([g, a, b]);

    expect(box(a)).toEqual({ x: 100, y: 100, w: 50, h: 50 });
    expect(box(b)).toEqual({ x: 300, y: 200, w: 40, h: 20 });
    expect(box(g)).toEqual({ x: 80, y: 90, w: 280, h: 140 });
  });

  it("un groupe dans un groupe : la boîte intérieure compte dans l'extérieure", () => {
    const outer = group("o");
    const inner = group("i", { top: 5, right: 5, bottom: 5, left: 5 }, { parentId: "o" });
    const a = rect("a", 100, 100, 10, 10, { child: { parentId: "i" } });
    const b = rect("b", 200, 100, 10, 10, { child: { parentId: "o" } });
    runLayout([outer, inner, a, b]);

    expect(box(inner)).toEqual({ x: 95, y: 95, w: 20, h: 20 });
    expect(box(outer)).toEqual({ x: 95, y: 95, w: 115, h: 20 });
  });

  it("dans une pile : un bloc rigide, que ses enfants suivent quand la pile le place", () => {
    const stack = rect("s", 0, 0, 10, 10, { sizing: { x: "hug", y: "hug" }, container: { padding: { top: 10, right: 10, bottom: 10, left: 10 } } });
    const g = group("g", ZERO, { parentId: "s" });
    const a = rect("a", 500, 500, 30, 30, { child: { parentId: "g" } });
    const b = rect("b", 540, 520, 30, 30, { child: { parentId: "g" } });
    runLayout([stack, g, a, b]);

    expect(box(g)).toEqual({ x: 10, y: 10, w: 70, h: 50 });
    expect(box(a)).toEqual({ x: 10, y: 10, w: 30, h: 30 });
    expect(box(b)).toEqual({ x: 50, y: 30, w: 30, h: 30 });
    expect(box(stack)).toEqual({ x: 0, y: 0, w: 90, h: 70 });
  });

  it("une pile dans un groupe se range à sa propre place", () => {
    const g = group("g");
    const stack = rect("s", 200, 200, 10, 10, { sizing: { x: "hug", y: "hug" }, container: { padding: ZERO, gap: 10 }, child: { parentId: "g" } });
    const s1 = rect("s1", 0, 0, 20, 20, { child: { parentId: "s", order: 0 } });
    const s2 = rect("s2", 0, 0, 20, 20, { child: { parentId: "s", order: 1 } });
    const a = rect("a", 100, 100, 10, 10, { child: { parentId: "g" } });
    runLayout([g, stack, s1, s2, a]);

    expect(box(s2)).toEqual({ x: 200, y: 230, w: 20, h: 20 });
    expect(box(g)).toEqual({ x: 100, y: 100, w: 120, h: 150 });
  });

  it("redimensionner : chaque enfant absorbe l'agrandissement, pas de scale, le coin reste", () => {
    const g = group("g");
    const a = rect("a", 100, 100, 50, 50, { child: { parentId: "g" } });
    const t = new CustomTextbox("Bonjour", { left: 200, top: 100, fontSize: 20, fontFamily: "Arial", originX: "left", originY: "top" });
    t.set({ layerId: "t", layout: { child: { parentId: "g" } } } as never);
    const canvas = canvasWith(g, a, t);
    runLayout(canvas.getObjects());
    const start = box(g);

    const session = new FreeResizeSession(g, canvas.getObjects(), { left: start.x, top: start.y, width: start.w, height: start.h });
    session.apply(2, { x: start.x, y: start.y });

    expect(box(a)).toEqual({ x: 100, y: 100, w: 100, h: 100 });
    expect(a.scaleX).toBe(1);
    expect(t.fontSize).toBe(40);
    expect(t.scaleX).toBe(1);
    // Le texte a un contour d'1 px : son coin bouge d'un demi-pixel × 2
    expect(Math.abs(box(t).x - 300)).toBeLessThanOrEqual(1);

    // Chaque étape repart du départ
    session.apply(1, { x: start.x, y: start.y });
    expect(box(a)).toEqual({ x: 100, y: 100, w: 50, h: 50 });
    expect(t.fontSize).toBe(20);
    expect(box(g)).toEqual(start);
  });
});

describe("grouper, dégrouper", () => {
  it("grouper : rien ne bouge, le groupe prend la place du membre le plus haut", () => {
    const bg = rect("bg", 0, 0, 1000, 1000);
    const a = rect("a", 100, 100, 50, 50);
    const x = rect("x", 0, 0, 10, 10);
    const b = rect("b", 300, 100, 50, 50);
    const y = rect("y", 0, 0, 10, 10);
    const canvas = canvasWith(bg, a, x, b, y);

    const g = groupObjects(canvas, [a, b], "g")!;
    runLayout(canvas.getObjects());

    expect(ids(canvas.getObjects())).toEqual(["bg", "x", "g", "a", "b", "y"]);
    expect(box(a)).toEqual({ x: 100, y: 100, w: 50, h: 50 });
    expect(box(g)).toEqual({ x: 100, y: 100, w: 250, h: 50 });
    expect(layoutOf(a)!.child?.parentId).toBe("g");
    expect(stackParentOf(a)).toBeUndefined();
  });

  it("des objets de niveaux différents : chacun remonte à sa racine", () => {
    const outer = group("o");
    const inner = rect("in", 100, 100, 10, 10, { child: { parentId: "o" } });
    const c = rect("c", 300, 300, 10, 10);
    const canvas = canvasWith(outer, inner, c);
    runLayout(canvas.getObjects());

    const g = groupObjects(canvas, [inner, c], "g")!;
    expect(layoutOf(outer)!.child?.parentId).toBe("g");
    expect(layoutOf(c)!.child?.parentId).toBe("g");
    expect(layoutOf(inner)!.child?.parentId).toBe("o");
    expect(ids(canvas.getObjects())).toEqual(["g", "o", "in", "c"]);
    expect(g).toBeTruthy();
  });

  it("dégrouper : les enfants restent à leur place, le porteur s'en va", () => {
    const a = rect("a", 100, 100, 50, 50);
    const b = rect("b", 300, 100, 50, 50);
    const canvas = canvasWith(a, b);
    const g = groupObjects(canvas, [a, b], "g")!;
    runLayout(canvas.getObjects());

    const freed = ungroupObject(canvas, g);
    expect(ids(freed)).toEqual(["a", "b"]);
    expect(ids(canvas.getObjects())).toEqual(["a", "b"]);
    expect(childDataOf(a)).toBeUndefined();
    expect(box(b)).toEqual({ x: 300, y: 100, w: 50, h: 50 });
  });

  it("dégrouper une forme qui porte des enfants : la forme reste, simple forme", () => {
    const shape = rect("s", 0, 0, 100, 100, { sizing: { x: "hug", y: "hug" }, container: { padding: ZERO } });
    const a = rect("a", 0, 0, 20, 20, { child: { parentId: "s" } });
    const canvas = canvasWith(shape, a);
    runLayout(canvas.getObjects());

    ungroupObject(canvas, shape);
    expect(ids(canvas.getObjects())).toEqual(["s", "a"]);
    expect(containerDataOf(shape)).toBeUndefined();
  });

  it("grouper dans une pile : le groupe prend la place des membres dans la pile", () => {
    const stack = rect("s", 0, 0, 10, 10, { sizing: { x: "hug", y: "hug" }, container: { padding: ZERO, gap: 10 } });
    const s1 = rect("s1", 0, 0, 20, 20, { child: { parentId: "s", order: 0 } });
    const s2 = rect("s2", 0, 0, 20, 20, { child: { parentId: "s", order: 1 } });
    const s3 = rect("s3", 0, 0, 20, 20, { child: { parentId: "s", order: 2 } });
    const canvas = canvasWith(stack, s1, s2, s3);
    runLayout(canvas.getObjects());

    const g = groupObjects(canvas, [s2, s3], "g")!;
    runLayout(canvas.getObjects());

    expect(layoutOf(g)!.child).toEqual({ parentId: "s", order: 1 });
    expect(box(s2)).toEqual({ x: 0, y: 30, w: 20, h: 20 });
    expect(box(s3)).toEqual({ x: 0, y: 60, w: 20, h: 20 });
    expect(stackParentOf(g)).toBe(stack);

    // Et retour : les enfants reprennent la place du groupe dans la pile
    ungroupObject(canvas, g);
    runLayout(canvas.getObjects());
    expect(stackParentOf(s2)).toBe(stack);
    expect(box(s3)).toEqual({ x: 0, y: 60, w: 20, h: 20 });
  });
});

describe("fitFreeContainer", () => {
  it("sans enfant, rien ne bouge", () => {
    const g = group("g");
    g.set({ left: 40, top: 40, width: 30, height: 30 });
    fitFreeContainer(g, [g]);
    expect(box(g)).toEqual({ x: 40, y: 40, w: 30, h: 30 });
  });
});

describe("libre ↔ rangé", () => {
  /** Trois carrés en ligne, centrés sur la même hauteur, écarts de 20 et 40. */
  function row() {
    const g = group("g", { top: 8, right: 8, bottom: 8, left: 8 });
    const c = rect("c", 160, 95, 40, 50, { child: { parentId: "g" } });
    const a = rect("a", 100, 100, 40, 40, { child: { parentId: "g" } });
    const b = rect("b", 240, 110, 20, 20, { child: { parentId: "g" } });
    const canvas = canvasWith(g, c, a, b);
    runLayout(canvas.getObjects());
    return { canvas, g, a, b, c };
  }

  it("rangé : sens, ordre, espacement et alignement déduits ; le premier ne bouge pas", () => {
    const { canvas, g, a, b, c } = row();
    arrangeAsStack(g, canvas.getObjects());
    const cd = layoutOf(g)!.container!;
    expect(cd).toMatchObject({ arrangement: "stack", flexDirection: "row", gap: 30, alignItems: "center", origin: "group" });
    expect(ids([a, c, b].filter((o) => layoutOf(o)!.child?.order != null)
      .sort((x, y) => layoutOf(x)!.child!.order! - layoutOf(y)!.child!.order!))).toEqual(["a", "c", "b"]);

    runLayout(canvas.getObjects());
    expect(box(a)).toEqual({ x: 100, y: 100, w: 40, h: 40 });
    expect(box(c)).toEqual({ x: 170, y: 95, w: 40, h: 50 });
    expect(box(b)).toEqual({ x: 240, y: 110, w: 20, h: 20 });
    expect(stackParentOf(a)).toBe(g);
  });

  it("libre : chaque élément garde sa place, et se déplace à nouveau seul", () => {
    const { canvas, g, a, b, c } = row();
    arrangeAsStack(g, canvas.getObjects());
    runLayout(canvas.getObjects());
    const before = [a, b, c].map(box);

    arrangeFree(g, canvas.getObjects());
    runLayout(canvas.getObjects());
    expect([a, b, c].map(box)).toEqual(before);
    expect(stackParentOf(a)).toBeUndefined();
    expect(layoutOf(g)!.container).toEqual({ arrangement: "free", origin: "group", padding: { top: 8, right: 8, bottom: 8, left: 8 } });
  });

  it("un empilement vertical aligné à gauche reste une colonne alignée au début", () => {
    const g = group("g");
    const a = rect("a", 100, 100, 60, 20, { child: { parentId: "g" } });
    const b = rect("b", 100, 140, 30, 20, { child: { parentId: "g" } });
    const canvas = canvasWith(g, a, b);
    runLayout(canvas.getObjects());

    arrangeAsStack(g, canvas.getObjects());
    expect(layoutOf(g)!.container).toMatchObject({ flexDirection: "column", gap: 20, alignItems: "flex-start" });
  });

  it("premier fond d'un groupe sans marge : une marge de 24 ; ensuite, plus rien", () => {
    const { canvas, g } = row();
    const bare = group("bare");
    bare.set({ fill: "#ff0000" });
    expect(padGroupOnFirstFill(bare, "transparent")).toBe(true);
    expect(layoutOf(bare)!.container?.padding).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });

    // Le groupe de row() a déjà une marge : on n'y touche pas
    g.set({ fill: "#ff0000" });
    expect(padGroupOnFirstFill(g, "transparent")).toBe(false);
    // Un deuxième fond ne repose rien
    expect(padGroupOnFirstFill(bare, "#00ff00")).toBe(false);
    expect(canvas).toBeTruthy();
  });
});

describe("un groupe parmi les piles", () => {
  it("sa taille minimale est sa taille : il est rigide, pas une pile (B1)", () => {
    const g = group("g");
    const a = rect("a", 0, 0, 50, 50, { child: { parentId: "g" } });
    const b = rect("b", 0, 0, 50, 50, { child: { parentId: "g" } });
    runLayout([g, a, b]);

    expect(minSizeOf(g, [g, a, b])).toEqual({ w: 50, h: 50 });
  });

  it("dans un groupe, un élément n'est pas bridé par ses frères (B2)", () => {
    // Le groupe est dans une pile de taille fixe : ses frères ne se rangent pas, ils ne
    // prennent pas de place à l'élément
    const stack = rect("s", 0, 0, 300, 300, { sizing: { x: "fixed", y: "fixed" }, container: { padding: ZERO } });
    const g = group("g", ZERO, { parentId: "s" });
    const a = rect("a", 0, 0, 50, 280, { child: { parentId: "g" } });
    const b = rect("b", 100, 0, 50, 50, { child: { parentId: "g" } });
    const objects = [stack, g, a, b];
    runLayout(objects);

    expect(availableRoom(b, objects)).toEqual({ w: Infinity, h: Infinity });
  });
});
