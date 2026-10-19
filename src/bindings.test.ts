/**
 * Le liseré des médias dynamiques suit la découpe telle qu'elle est peinte (vrais objets Fabric).
 */
import { describe, it, expect } from "vitest";
import { FabricImage, StaticCanvas } from "#fabric";
import { createCanvas } from "canvas";
import { drawDynamicMediaOutline } from "./bindings";
import { ImageFrame } from "./ImageFrame";
import { registerShapes } from "./shapes/registry";

// L'hexagone du catalogue : une découpe en chemin, dont le pathOffset n'est pas nul.
registerShapes([{
  id: "hexagon", width: 88.19, height: 100,
  d: "M45.84 1.48C48.41 0 51.58 0 54.15 1.48L89.94 22.14C92.51 23.63 94.09 26.37 94.09 29.34V71.7C94.09 " +
    "74.67 92.51 77.41 89.94 78.9L54.15 99.55C51.58 101.04 48.41 101.04 45.84 99.55L10.06 78.9C7.49 77.41 " +
    "5.91 74.67 5.91 71.7V29.34C5.91 26.37 7.49 23.63 10.06 22.14L45.84 1.48Z",
}]);

/** La boîte des pixels peints en rouge : [minX, minY, maxX, maxY]. */
function redBox(ctx: CanvasRenderingContext2D, size: number): number[] {
  const { data } = ctx.getImageData(0, 0, size, size);
  const box = [size, size, -1, -1];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 200 || data[i + 1] > 80) continue;
    const x = (i / 4) % size;
    const y = Math.floor(i / 4 / size);
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  }
  return box;
}

describe("drawDynamicMediaOutline", () => {
  it.each(["hexagon", "circle"] as const)("une découpe %s : le liseré est centré sur le cadre", (clipShape) => {
    const canvas = new StaticCanvas(undefined, { width: 300, height: 300 });
    const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
    const frame = new ImageFrame(img, { frameWidth: 200, frameHeight: 200, left: 150, top: 150, clipShape });
    frame.set({ bindings: { "image.src": { expr: "$PICTURE_URL", scope: "company" } } });
    canvas.add(frame);

    const ctx = createCanvas(300, 300).getContext("2d") as unknown as CanvasRenderingContext2D;
    drawDynamicMediaOutline(ctx, frame, "#ff0000");
    const [minX, minY, maxX, maxY] = redBox(ctx, 300);

    expect(maxX).toBeGreaterThan(minX);
    expect(Math.abs((minX + maxX) / 2 - 150)).toBeLessThan(3);
    expect(Math.abs((minY + maxY) / 2 - 150)).toBeLessThan(3);
  });
});
