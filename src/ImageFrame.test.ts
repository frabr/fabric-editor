/**
 * ImageFrame : l'identité du média voyage avec sa source (imageMeta), et un cadre sans
 * fichier (en attente) survit au tour éditeur.
 */
import { describe, it, expect } from "vitest";
import { FabricImage } from "#fabric";
import { createCanvas } from "canvas";
import { ImageFrame, type ImageFrameData } from "./ImageFrame";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function image(size = 10): FabricImage {
  return new FabricImage(createCanvas(size, size) as unknown as HTMLCanvasElement);
}

function frameData(image: ImageFrameData["image"]): ImageFrameData {
  return {
    type: "ImageFrame", left: 50, top: 50, angle: 0, scaleX: 1, scaleY: 1,
    frameWidth: 120, frameHeight: 80, layerId: "bg", image,
  };
}

describe("imageMeta", () => {
  it("les clés inconnues de image font l'aller-retour, à côté de src", async () => {
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL, offsetX: 0, offsetY: 0, scale: 1, content_medium_id: 42 }));
    expect(frame.imageMeta).toEqual({ content_medium_id: 42 });

    const out = frame.toObject(["layerId"]);
    expect(out.image).toMatchObject({ src: PIXEL, content_medium_id: 42, offsetX: 0, offsetY: 0, scale: 1 });
  });

  it("les clés de la lib gagnent sur une collision", () => {
    const frame = new ImageFrame(image(), { frameWidth: 40, frameHeight: 40, imageMeta: { scale: "non", id: 1 } });
    expect(frame.toObject().image.scale).toBe(1);
    expect(frame.toObject().image.id).toBe(1);
  });

  it("une image remplacée prend les clés de la nouvelle source — jamais celles de l'ancienne", () => {
    const frame = new ImageFrame(image(), { frameWidth: 40, frameHeight: 40, imageMeta: { content_medium_id: 1 } });

    frame.replaceImage(image(20), { content_medium_id: 2 });
    expect(frame.toObject().image.content_medium_id).toBe(2);

    frame.replaceImage(image(30));
    expect(frame.toObject().image.content_medium_id).toBeUndefined();
  });
});

describe("cadre en attente (sans src)", () => {
  it("se charge en damier aux dimensions du cadre et se sauve sans src, identité comprise", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    expect(frame.pending).toBe(true);
    expect(frame.frameWidth).toBe(120);
    expect(frame.image.width).toBe(120);
    expect(frame.image.height).toBe(80);

    const out = frame.toObject();
    expect(out.image).toEqual({ content_medium_id: 7, offsetX: 0, offsetY: 0, scale: 1 });
    expect("src" in out.image).toBe(false);
  });

  it("une source de session se marque en attente : affichée, pas sauvée — jusqu'à la vraie", () => {
    const frame = new ImageFrame(image(), { frameWidth: 40, frameHeight: 40 });
    frame.markSourcePending();

    expect(frame.pending).toBe(true);
    expect("src" in frame.toObject().image).toBe(false);

    frame.replaceImage(image(), { content_medium_id: 3 });

    expect(frame.pending).toBe(false);
    expect(frame.toObject().image).toMatchObject({ content_medium_id: 3 });
  });

  it("cesse d'être en attente quand une image arrive", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    frame.replaceImage(image(), { content_medium_id: 7 });
    expect(frame.pending).toBe(false);
    expect(frame.toObject().image.src).toBeTruthy();
  });
});
