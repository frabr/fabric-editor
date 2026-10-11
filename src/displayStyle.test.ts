/**
 * La couleur d'affichage : rendue, jamais sérialisée, la couleur de l'objet intacte.
 */
import { describe, it, expect } from "vitest";
import { StaticCanvas } from "#fabric";
import { FabRect } from "./shapes/FabRect";
import { displayFill, installDisplayStyleRendering, setDisplayFill } from "./displayStyle";

function rect(): FabRect {
  const r = new FabRect({ width: 10, height: 10, fill: "#ea6623" });
  r.set({ layerType: "shape", layerId: "r" } as never);
  return r;
}

describe("displayFill", () => {
  it("se pose et se retire, dit si elle a changé, salit le cache", () => {
    const r = rect();
    r.dirty = false;
    expect(setDisplayFill(r, "#0d7279")).toBe(true);
    expect(displayFill(r)).toBe("#0d7279");
    expect(r.dirty).toBe(true);
    expect(setDisplayFill(r, "#0d7279")).toBe(false);
    expect(setDisplayFill(r, null)).toBe(true);
    expect(displayFill(r)).toBeNull();
  });

  it("ne touche ni la couleur de l'objet ni sa sérialisation", () => {
    const r = rect();
    setDisplayFill(r, "#0d7279");
    expect(r.fill).toBe("#ea6623");
    const data = r.toObject();
    expect(data.fill).toBe("#ea6623");
    expect("displayFill" in data).toBe(false);
  });

  it("dessine avec la couleur d'affichage, et rend la sienne après", () => {
    const seen: unknown[] = [];
    class Shape {
      fill = "#ea6623";
      drawObject() { seen.push(this.fill); }
    }
    installDisplayStyleRendering(Shape.prototype);
    const shape = new Shape() as Shape & { displayFill?: string };
    (shape as { drawObject: (ctx: unknown, clip?: boolean) => void }).drawObject({});
    shape.displayFill = "#0d7279";
    (shape as { drawObject: (ctx: unknown, clip?: boolean) => void }).drawObject({});
    (shape as { drawObject: (ctx: unknown, clip?: boolean) => void }).drawObject({}, true);

    expect(seen).toEqual(["#ea6623", "#0d7279", "#ea6623"]);
    expect(shape.fill).toBe("#ea6623");
  });

  it("un objet à couleur d'affichage se dessine sur un canvas", () => {
    const canvas = new StaticCanvas(undefined, { width: 20, height: 20 });
    const r = rect();
    canvas.add(r);
    setDisplayFill(r, "#0d7279");
    expect(() => canvas.renderAll()).not.toThrow();
    expect(r.fill).toBe("#ea6623");
  });
});
