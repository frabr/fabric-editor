/**
 * Le fantôme : un drapeau d'affichage, rendu à 22 %, jamais sérialisé.
 */
import { describe, it, expect, vi } from "vitest";
import { StaticCanvas } from "#fabric";
import { FabRect } from "./shapes/FabRect";
import { GHOST_OPACITY, installGhostRendering, isGhost, setGhost } from "./ghost";

function rect(): FabRect {
  const r = new FabRect({ width: 10, height: 10, fill: "#f00" });
  r.set({ layerType: "shape", layerId: "r" } as never);
  return r;
}

describe("ghost", () => {
  it("se pose et se retire, et dit si l'état a changé", () => {
    const r = rect();
    expect(isGhost(r)).toBe(false);
    expect(setGhost(r, true)).toBe(true);
    expect(isGhost(r)).toBe(true);
    expect(setGhost(r, true)).toBe(false);
    expect(setGhost(r, false)).toBe(true);
    expect(isGhost(r)).toBe(false);
  });

  it("ne part jamais dans la sérialisation", () => {
    const r = rect();
    setGhost(r, true);
    expect("ghost" in r.toObject()).toBe(false);
  });

  it("réduit l'alpha ambiant le temps du rendu, et le rend", () => {
    class Shape {
      alphas: number[] = [];
      render(ctx: CanvasRenderingContext2D) {
        this.alphas.push(ctx.globalAlpha);
      }
    }
    installGhostRendering(Shape.prototype);
    const ctx = { globalAlpha: 1, save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    const shape = new Shape() as Shape & { ghost?: boolean };

    shape.render(ctx);
    shape.ghost = true;
    shape.render(ctx);

    expect(shape.alphas).toEqual([1, GHOST_OPACITY]);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it("un objet fantôme se dessine encore sur un canvas", () => {
    const canvas = new StaticCanvas(undefined, { width: 20, height: 20 });
    const r = rect();
    canvas.add(r);
    setGhost(r, true);
    expect(() => canvas.renderAll()).not.toThrow();
  });
});
