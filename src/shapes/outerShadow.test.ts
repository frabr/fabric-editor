/**
 * L'ombre d'une forme à fond transparent ne se dessine qu'à l'extérieur (box-shadow du CSS) ; une
 * forme à fond opaque garde le rendu de Fabric.
 */
import { describe, it, expect } from "vitest";
import { Shadow, StaticCanvas } from "#fabric";
import { FabRect } from "./FabRect";
import { FabCircle } from "./FabCircle";
import { seesThrough } from "./outerShadow";

function alpha(canvas: StaticCanvas, x: number, y: number): number {
  return canvas.getContext().getImageData(x, y, 1, 1).data[3];
}

function shadowed<T extends FabRect | FabCircle>(shape: T): T {
  shape.set({ shadow: new Shadow({ color: "rgba(0,0,0,1)", blur: 30, offsetX: 0, offsetY: 0 }) });
  return shape;
}

describe("ombre extérieure", () => {
  it("un rectangle transparent à liseré : ombre autour, rien dedans", () => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 200 });
    const pill = shadowed(new FabRect({ left: 150, top: 100, width: 200, height: 100, rx: 40, ry: 40,
                                        fill: "transparent", stroke: "#ffffff", strokeWidth: 2 }));
    canvas.add(pill);
    canvas.renderAll();
    expect(alpha(canvas, 150, 100)).toBe(0); // le centre : aucune ombre
    expect(alpha(canvas, 150, 60)).toBe(0); // près du bord, encore dedans
    expect(alpha(canvas, 150, 42)).toBeGreaterThan(0); // juste dehors : l'ombre
    expect(pill.shadow).not.toBeNull(); // l'ombre du document reste
  });

  it("un cercle translucide aussi", () => {
    const canvas = new StaticCanvas(undefined, { width: 200, height: 200 });
    canvas.add(shadowed(new FabCircle({ left: 100, top: 100, radius: 50, fill: "rgba(255,255,255,0.06)" })));
    canvas.renderAll();
    expect(alpha(canvas, 100, 100)).toBeLessThan(20); // le fond à 6 %, sans l'ombre dessous
    expect(alpha(canvas, 100, 45)).toBeGreaterThan(0);
  });

  it("une forme opaque garde son ombre autour d'elle", () => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 200 });
    canvas.add(shadowed(new FabRect({ left: 150, top: 100, width: 200, height: 100, fill: "#ff0000" })));
    canvas.renderAll();
    expect(alpha(canvas, 150, 100)).toBe(255);
    expect(alpha(canvas, 150, 45)).toBeGreaterThan(0);
  });

  it("seesThrough : seule une couleur pleine et opaque cache l'intérieur", () => {
    expect(seesThrough("transparent")).toBe(true);
    expect(seesThrough("rgba(255,255,255,0.5)")).toBe(true);
    expect(seesThrough(null)).toBe(true);
    expect(seesThrough("#FFFFFF")).toBe(false);
    expect(seesThrough("rgb(0,0,0)")).toBe(false);
  });
});
