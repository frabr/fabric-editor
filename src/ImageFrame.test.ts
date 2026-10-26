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
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL, cropX: 0.5, cropY: 0.5, scale: 1, content_medium_id: 42 }));
    expect(frame.imageMeta).toEqual({ content_medium_id: 42 });

    const out = frame.toObject(["layerId"]);
    expect(out.image).toMatchObject({ src: PIXEL, content_medium_id: 42, cropX: 0.5, cropY: 0.5, scale: 1 });
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

describe("ombre portée", () => {
  it("fait l'aller-retour (le panneau Apparence la relit depuis le document)", async () => {
    const shadow = { color: "rgba(0,0,0,0.3)", blur: 24, offsetX: 0, offsetY: 8 };
    const frame = await ImageFrame.fromObject({ ...frameData({ src: PIXEL }), shadow });

    expect(frame.shadow).toMatchObject(shadow);
    expect(frame.toObject().shadow).toMatchObject(shadow);
  });

  it("absente, elle n'est pas écrite", () => {
    const frame = new ImageFrame(image(), { frameWidth: 40, frameHeight: 40 });
    expect(frame.toObject().shadow).toBeUndefined();
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
    expect(out.image).toEqual({ content_medium_id: 7, cropX: 0.5, cropY: 0.5, scale: 1 });
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

  it("efface son damier quand l'hôte montre l'aperçu lui-même, sans sortir de l'attente", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    const checker = frame.image.getElement();
    frame.concealPlaceholder();

    expect(frame.pending).toBe(true);
    expect(frame.image.getElement()).not.toBe(checker);
    expect(frame.image.width).toBe(120);
    expect("src" in frame.toObject().image).toBe(false);

    const real = new ImageFrame(image(), { frameWidth: 40, frameHeight: 40 });
    const element = real.image.getElement();
    real.concealPlaceholder();
    expect(real.image.getElement()).toBe(element);
  });

  it("cesse d'être en attente quand une image arrive", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    frame.replaceImage(image(), { content_medium_id: 7 });
    expect(frame.pending).toBe(false);
    expect(frame.toObject().image.src).toBeTruthy();
  });
});

describe("recadrage", () => {
  // Image 100 × 50 dans un cadre 120 × 80 : cover = 1.6 → 160 × 80, 40 px de marge en largeur
  const wide = () => new FabricImage(createCanvas(100, 50) as unknown as HTMLCanvasElement);

  it("centrée en cover par défaut, se décale et se grossit sans jamais découvrir le cadre", () => {
    const frame = new ImageFrame(wide(), { frameWidth: 120, frameHeight: 80 });
    expect(frame.crop).toEqual({ x: 0.5, y: 0.5, scale: 1 });
    expect(frame.photoRect()).toEqual({ x: -20, y: 0, w: 160, h: 80 });
    expect(frame.isCropped).toBe(false);

    frame.panCrop(100, 100);
    expect(frame.photoRect()).toEqual({ x: 0, y: 0, w: 160, h: 80 });
    expect(frame.crop.x).toBe(0);

    frame.zoomCrop(2, 0, 0);
    expect(frame.crop.scale).toBe(2);
    expect(frame.photoRect()).toEqual({ x: 0, y: 0, w: 320, h: 160 });
    expect(frame.image.scaleX).toBe(3.2);
    expect(frame.isCropped).toBe(true);

    frame.resetCrop();
    expect(frame.crop).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  it("l'image dans le groupe suit le recadrage (origine au centre)", () => {
    const frame = new ImageFrame(wide(), { frameWidth: 120, frameHeight: 80, crop: { x: 0, y: 0.5, scale: 1 } });
    // Calée à gauche : le centre de l'image est 20 px à droite du centre du cadre
    expect(frame.image.left).toBe(20);
    expect(frame.image.top).toBe(0);
  });

  it("un cadre qui change de taille garde la même zone", () => {
    const frame = new ImageFrame(wide(), { frameWidth: 120, frameHeight: 80, crop: { x: 0, y: 0.5, scale: 1 } });
    frame.resizeFrame(60, 80);
    expect(frame.crop.x).toBe(0);
    expect(frame.photoRect().x).toBe(0);
  });

  it("une image remplacée repart sans recadrage", () => {
    const frame = new ImageFrame(wide(), { frameWidth: 120, frameHeight: 80, crop: { x: 0, y: 0, scale: 2 } });
    frame.replaceImage(image(30));
    expect(frame.crop).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  it("un document d'avant (décalage en pixels) se convertit à la lecture et se sauve au nouveau format", () => {
    // Décalage +20 px = image calée à gauche (x = 0)
    const frame = new ImageFrame(wide(), { frameWidth: 120, frameHeight: 80, imageOffsetX: 20, imageOffsetY: 0 });
    expect(frame.crop).toEqual({ x: 0, y: 0.5, scale: 1 });
    expect(frame.image.left).toBe(20);

    const out = frame.toObject();
    expect(out.image).toMatchObject({ cropX: 0, cropY: 0.5, scale: 1 });
    expect("offsetX" in out.image).toBe(false);
  });

  it("un cadre en attente ne se recadre pas", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    expect(frame.croppable).toBe(false);
  });
});
