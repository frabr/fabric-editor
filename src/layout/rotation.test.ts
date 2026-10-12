/**
 * La rotation d'un container emmène sa descendance ; le layout d'un container tourné se
 * calcule dans son repère et le laisse tourné. Vrai moteur Fabric (node-canvas), vrai Yoga.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { StaticCanvas, type FabricObject } from "#fabric";
import { FabRect } from "../shapes/FabRect";
import { initYoga } from "./stack/engine";
import { runLayout } from "./run";
import { fitFreeContainer } from "./free/fit";
import { SubtreeRotate, inLocalFrame } from "./rotation";
import type { LayoutData } from "./types";

beforeAll(async () => {
  await initYoga();
});

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

function rect(id: string, left: number, top: number, w: number, h: number, layout?: LayoutData): FabRect {
  const r = new FabRect({ left, top, width: w, height: h, originX: "left", originY: "top", strokeWidth: 0 });
  r.set({ layerId: id, layout } as never);
  return r;
}

function canvasWith(...objects: FabricObject[]): StaticCanvas {
  const canvas = new StaticCanvas(undefined, { width: 1000, height: 1000, renderOnAddRemove: false });
  canvas.add(...objects);
  return canvas;
}

const center = (obj: FabricObject) => {
  const c = obj.getCenterPoint();
  return { x: Math.round(c.x), y: Math.round(c.y) };
};

describe("SubtreeRotate", () => {
  it("la descendance tourne autour du centre du container, du même angle", () => {
    const group = rect("g", 100, 100, 200, 100, { container: { arrangement: "free", origin: "group", padding: ZERO } });
    const child = rect("a", 100, 100, 50, 50, { child: { parentId: "g" } });
    const grandchild = rect("b", 250, 100, 50, 50, { child: { parentId: "g" } });
    canvasWith(group, child, grandchild);

    const session = SubtreeRotate.begin(group, [group], { original: { angle: 0 } }, [group, child, grandchild]);
    group.rotate(90);
    session.follow(group);

    // Pivot (200, 150) : le centre de `a` (125, 125) va en (225, 75), celui de `b` (275, 125) en (225, 225)
    expect(center(child)).toEqual({ x: 225, y: 75 });
    expect(center(grandchild)).toEqual({ x: 225, y: 225 });
    expect(child.angle).toBe(90);
    expect(grandchild.angle).toBe(90);
  });

  it("chaque pas repart du début : revenir à 0 remet tout en place", () => {
    const group = rect("g", 100, 100, 200, 100, { container: { arrangement: "free", origin: "group", padding: ZERO } });
    const child = rect("a", 100, 100, 50, 50, { child: { parentId: "g" } });
    canvasWith(group, child);
    const session = SubtreeRotate.begin(group, [group], { original: { angle: 0 } }, [group, child]);

    group.rotate(45);
    session.follow(group);
    group.rotate(0);
    session.follow(group);

    expect(center(child)).toEqual({ x: 125, y: 125 });
    expect(child.angle).toBe(0);
  });
});

describe("layout d'un container tourné", () => {
  it("une pile tournée range ses enfants dans son repère, et reste tournée", () => {
    const stack = rect("s", 100, 100, 200, 100, {
      sizing: { x: "fixed", y: "fixed" },
      container: { arrangement: "stack", flexDirection: "row", gap: 0, padding: ZERO },
    });
    const a = rect("a", 0, 0, 50, 50, { child: { parentId: "s", order: 0 } });
    const b = rect("b", 0, 0, 50, 50, { child: { parentId: "s", order: 1 } });
    canvasWith(stack, a, b);

    runLayout([stack, a, b]);
    const flat = { a: center(a), b: center(b) };
    expect(flat).toEqual({ a: { x: 125, y: 125 }, b: { x: 175, y: 125 } });

    // Le geste : la pile tourne avec ses enfants, puis le layout retourne (modified)
    const session = SubtreeRotate.begin(stack, [stack], { original: { angle: 0 } }, [stack, a, b]);
    stack.rotate(90);
    session.follow(stack);
    runLayout([stack, a, b]);

    // Même rangement, tourné de 90° autour du centre de la pile (200, 150) : rien n'a bougé
    expect(stack.angle).toBe(90);
    expect(center(a)).toEqual({ x: 225, y: 75 });
    expect(center(b)).toEqual({ x: 225, y: 125 });
    expect(a.angle).toBe(90);
    expect(b.angle).toBe(90);
  });

  it("un groupe tourné garde une boîte à sa taille (pas l'union des boîtes englobantes)", () => {
    const group = rect("g", 0, 0, 1, 1, { container: { arrangement: "free", origin: "group", padding: ZERO } });
    const a = rect("a", 100, 100, 100, 40, { child: { parentId: "g" } });
    canvasWith(group, a);
    fitFreeContainer(group, [group, a]);
    expect([group.width, group.height]).toEqual([100, 40]);

    // Le groupe et son enfant tournés ensemble de 30°
    const session = SubtreeRotate.begin(group, [group], { original: { angle: 0 } }, [group, a]);
    group.rotate(30);
    session.follow(group);
    const before = center(group);

    fitFreeContainer(group, [group, a]);

    expect([Math.round(group.width), Math.round(group.height)]).toEqual([100, 40]);
    expect(group.angle).toBe(30);
    expect(center(group)).toEqual(before);
  });

  it("inLocalFrame remet tout en place après coup, même si le calcul a échoué", () => {
    const stack = rect("s", 100, 100, 200, 100, { container: { arrangement: "stack", padding: ZERO } });
    const a = rect("a", 100, 100, 50, 50, { child: { parentId: "s" } });
    stack.rotate(90);
    const before = { stack: center(stack), a: center(a), angle: a.angle };

    expect(() => inLocalFrame(stack, [stack, a], () => { throw new Error("boom"); })).toThrow("boom");

    expect({ stack: center(stack), a: center(a), angle: a.angle }).toEqual(before);
  });
});
