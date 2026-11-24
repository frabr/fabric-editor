/**
 * Le verre dépoli d'une forme : ce qui est peint dessous se floute dans sa silhouette, rien
 * dehors ; la propriété se sauve avec la forme.
 */
import { describe, it, expect } from "vitest";
import { StaticCanvas } from "#fabric";
import { FabRect } from "./FabRect";

function red(canvas: StaticCanvas, x: number, y: number): number {
  return canvas.getContext().getImageData(x, y, 1, 1).data[0];
}

/** Moitié gauche noire, moitié droite blanche, une vitre de 100 × 60 à cheval sur la frontière. */
function scene(backdropBlur?: number): StaticCanvas {
  const canvas = new StaticCanvas(undefined, { width: 200, height: 100 });
  canvas.add(new FabRect({ left: 50, top: 50, width: 100, height: 100, fill: "#000000" }));
  canvas.add(new FabRect({ left: 150, top: 50, width: 100, height: 100, fill: "#ffffff" }));
  const glass = new FabRect({ left: 100, top: 50, width: 100, height: 60, fill: "transparent" });
  if (backdropBlur) glass.set({ backdropBlur } as any);
  canvas.add(glass);
  canvas.renderAll();
  return canvas;
}

describe("verre dépoli", () => {
  it("floute ce qui est dessous, dans la silhouette seulement", () => {
    const sharp = scene();
    expect(red(sharp, 97, 50)).toBe(0);
    expect(red(sharp, 103, 50)).toBe(255);

    const glass = scene(8);
    expect(red(glass, 97, 50)).toBeGreaterThan(40); // la frontière se fond sous la vitre
    expect(red(glass, 103, 50)).toBeLessThan(215);
    expect(red(glass, 97, 5)).toBe(0); // au-dessus de la vitre : net
    expect(red(glass, 103, 5)).toBe(255);
  });

  it("se sauve avec la forme", () => {
    const rect = new FabRect({ width: 10, height: 10 });
    rect.set({ backdropBlur: 14 } as any);
    expect((rect.toObject() as any).backdropBlur).toBe(14);
  });
});
