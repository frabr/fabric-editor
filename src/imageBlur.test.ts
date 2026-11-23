/**
 * Le flou d'un cadre d'image : calculé en JS (node-canvas comme navigateur), sauvé avec le cadre,
 * la source intacte.
 */
import { describe, it, expect } from "vitest";
import { FabricImage, StaticCanvas, util } from "#fabric";
import { ImageFrame } from "./ImageFrame";
import { boxSizes } from "./imageBlur";

/** Une image 200 × 100 : moitié gauche noire, moitié droite blanche. */
function halves(): FabricImage {
  const el = util.createCanvasElement();
  el.width = 200;
  el.height = 100;
  const ctx = el.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = "#fff";
  ctx.fillRect(100, 0, 100, 100);
  return new FabricImage(el);
}

function red(canvas: StaticCanvas, x: number, y: number): number {
  return canvas.getContext().getImageData(x, y, 1, 1).data[0];
}

function render(blur?: number): StaticCanvas {
  const canvas = new StaticCanvas(undefined, { width: 200, height: 100 });
  canvas.add(new ImageFrame(halves(), { left: 100, top: 50, frameWidth: 200, frameHeight: 100, blur }));
  canvas.renderAll();
  return canvas;
}

describe("flou d'un cadre d'image", () => {
  it("net sans blur : la frontière est franche", () => {
    const canvas = render();
    expect(red(canvas, 95, 50)).toBe(0);
    expect(red(canvas, 105, 50)).toBe(255);
  });

  it("flou : la frontière se fond, les bords ne s'éclaircissent pas", () => {
    const canvas = render(8);
    expect(red(canvas, 95, 50)).toBeGreaterThan(40);
    expect(red(canvas, 105, 50)).toBeLessThan(215);
    // Le bord gauche (noir) reste noir : bords prolongés, pas de liseré clair
    expect(red(canvas, 1, 50)).toBeLessThan(5);
    expect(red(canvas, 1, 1)).toBeLessThan(5);
  });

  it("se sauve avec le cadre ; la source sauvée reste l'originale", () => {
    const frame = new ImageFrame(halves(), { frameWidth: 200, frameHeight: 100, blur: 8 });
    const data = frame.toObject();
    expect(data.blur).toBe(8);
    frame.setBlur(0);
    expect(frame.toObject().blur).toBeUndefined();
  });

  it("trois boîtes pour un gaussien : largeurs impaires, variance tenue", () => {
    const sizes = boxSizes(8, 3);
    expect(sizes.every((s) => s % 2 === 1)).toBe(true);
    const variance = sizes.reduce((acc, s) => acc + (s * s - 1) / 12, 0);
    expect(Math.abs(variance - 64)).toBeLessThan(8);
  });
});
