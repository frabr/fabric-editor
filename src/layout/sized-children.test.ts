/**
 * Enfants non-texte redimensionnés par leur container : chacun par sa propre façon de
 * se dimensionner (setShapeSize), jamais par un width/height brut.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { FabricImage, Group, Rect } from "#fabric";
import { createCanvas } from "canvas";
import { initYoga } from "./stack/engine";
import { runLayout } from "./run";
import { FabRect } from "../shapes/FabRect";
import { ImageFrame } from "../ImageFrame";
import type { LayoutData } from "./types";

beforeAll(async () => {
  await initYoga();
});

const stretchColumn: LayoutData = {
  sizing: { x: "fixed", y: "hug" },
  container: { padding: { top: 10, right: 10, bottom: 10, left: 10 }, alignItems: "stretch" },
};

function container(): FabRect {
  const c = new FabRect({ left: 0, top: 0, width: 300, height: 100, originX: "left", originY: "top" });
  c.set({ layerId: "c", layout: stretchColumn } as any);
  return c;
}

const child = { child: { parentId: "c" } };

describe("enfants étirés par leur container", () => {
  it("une ImageFrame suit par son cadre (image recadrée en cover)", () => {
    const img = new FabricImage(createCanvas(50, 50) as unknown as HTMLCanvasElement);
    const frame = new ImageFrame(img, { frameWidth: 100, frameHeight: 60, layerId: "f" });
    frame.set("layout", child);
    runLayout([container(), frame]);
    expect(frame.frameWidth).toBe(280);
    expect(frame.width).toBe(280);
    expect(frame.scaleX).toBe(1);
  });

  it("un groupe de paths (sans setSize) suit par son scale", () => {
    const group = new Group([new Rect({ width: 100, height: 60 })]);
    group.set({ layerId: "g", layerType: "shape", layout: child } as any);
    runLayout([container(), group]);
    expect(group.width * group.scaleX).toBeCloseTo(280, 0);
  });
});

describe("forme-image container", () => {
  const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  it("une ImageFrame accueille : en hug, son cadre épouse son contenu", async () => {
    const { CustomTextbox } = await import("../controls/CustomTextbox");
    const img = await FabricImage.fromURL(PIXEL);
    const frame = new ImageFrame(img, { frameWidth: 50, frameHeight: 50, layerId: "f" });
    frame.set({ originX: "left", originY: "top", left: 0, top: 0 });
    frame.set("layout", { sizing: { x: "hug", y: "hug" }, container: { padding: { top: 10, right: 10, bottom: 10, left: 10 } } });
    const t = new CustomTextbox("Bonjour", { fontSize: 20, fontFamily: "Arial", layout: { child: { parentId: "f" } } });
    runLayout([frame, t]);
    expect(frame.frameWidth).toBeCloseTo(t.width + 20, 0);
    expect(frame.frameHeight).toBeCloseTo(t.height + 20, 0);
  });

  it("sérialisation : l'origine (container en haut-gauche) et le contour survivent", async () => {
    const img = await FabricImage.fromURL(PIXEL);
    const frame = new ImageFrame(img, { frameWidth: 80, frameHeight: 40, layerId: "f", left: 10, top: 20 });
    frame.set({ originX: "left", originY: "top", stroke: "#ff0000", strokeWidth: 3 });
    const data = frame.toObject(["layerId"]);
    const back = await ImageFrame.fromObject(data);
    expect(back.originX).toBe("left");
    expect(back.originY).toBe("top");
    expect(back.left).toBe(10);
    expect(back.top).toBe(20);
    expect(back.stroke).toBe("#ff0000");
    expect(back.strokeWidth).toBe(3);
  });
});
