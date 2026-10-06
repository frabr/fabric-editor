/**
 * Choisir un mode de taille (panneau Disposition) : la boîte suit le mode choisi, même
 * si les poignées avaient posé un plancher (`minSize`) — sinon « Adapter au contenu »
 * ne fait rien de visible.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { FabRect } from "../shapes/FabRect";
import { initYoga } from "./yoga-engine";
import { runLayout } from "./reconcile";
import { sizingOf, type LayoutData } from "./types";
import { scaledSize } from "./geometry";
import { LayoutManager } from "../LayoutManager";

beforeAll(async () => {
  await initYoga();
});

function rect(id: string, w: number, h: number, layout: LayoutData): FabRect {
  const r = new FabRect({ left: 0, top: 0, width: w, height: h, originX: "left", originY: "top" });
  r.set({ layerId: id, layout } as any);
  return r;
}

/** Un LayoutManager sur un canvas réduit à ses objets (setMode ne demande que ça). */
function managerOver(objects: FabRect[]): LayoutManager {
  const manager = Object.create(LayoutManager.prototype) as LayoutManager;
  Object.assign(manager, {
    canvas: { getObjects: () => objects, renderAll: () => {} },
    callbacks: {},
  });
  return manager;
}

describe("LayoutManager#setMode", () => {
  it("« contenu » efface le plancher des poignées : la boîte revient à son contenu", () => {
    const pad = { top: 10, right: 10, bottom: 10, left: 10 };
    const box = rect("c", 300, 400, {
      sizing: { x: "hug", y: "hug", minSize: { w: 300, h: 400 } },
      container: { padding: pad },
    });
    const child = rect("k", 100, 50, { child: { parentId: "c", order: 0 } });
    runLayout([box, child]);
    expect(scaledSize(box)).toEqual({ w: 300, h: 400 });

    managerOver([box, child]).setMode(box, "hug");

    expect(sizingOf(box).minSize).toBeUndefined();
    expect(scaledSize(box)).toEqual({ w: 120, h: 70 });
  });
});
