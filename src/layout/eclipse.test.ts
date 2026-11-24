/**
 * Un objet éclipsé (ghost.ts) sort du flux : ses voisins de pile se resserrent, la boîte
 * d'un groupe libre ne le compte plus — comme au rendu, qui l'a retiré du document.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initYoga } from "./stack/engine";
import { runLayout } from "./run";
import { FabRect } from "../shapes/FabRect";
import { setEclipsed, isEclipsed } from "../ghost";

beforeAll(async () => {
  await initYoga();
});

function rect(id: string, layout: object, size = 50): FabRect {
  const r = new FabRect({ left: 0, top: 0, width: size, height: size, strokeWidth: 0, originX: "left", originY: "top" });
  r.set({ layerId: id, layout } as any);
  return r;
}

describe("éclipse", () => {
  it("un enfant éclipsé ne prend pas de place dans sa pile", () => {
    const column = rect("c", { sizing: { x: "hug", y: "hug" }, container: { gap: 10 } }, 10);
    const a = rect("a", { child: { parentId: "c", order: 0 } });
    const b = rect("b", { child: { parentId: "c", order: 1 } });
    const c = rect("cc", { child: { parentId: "c", order: 2 } });

    runLayout([column, a, b, c]);
    expect(c.top).toBe(120);
    expect(column.height).toBe(170);

    setEclipsed(b, true);
    runLayout([column, a, b, c]);
    expect(c.top).toBe(60);
    expect(column.height).toBe(110);
  });

  it("le drapeau se pose et se retire, et dit s'il a changé", () => {
    const r = rect("r", {});
    expect(setEclipsed(r, true)).toBe(true);
    expect(setEclipsed(r, true)).toBe(false);
    expect(isEclipsed(r)).toBe(true);
    expect(setEclipsed(r, false)).toBe(true);
    expect(isEclipsed(r)).toBe(false);
    expect((r.toObject() as Record<string, unknown>).eclipsed).toBeUndefined();
  });
});
