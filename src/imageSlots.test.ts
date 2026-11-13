/**
 * Emplacements d'image : le repère d'un binding, le cadre lié qui se dessine lui-même,
 * la valeur montrée sans entrer dans le document (vrais objets Fabric).
 */
import { describe, it, expect, vi } from "vitest";
import { FabricImage, StaticCanvas, type FabricObject } from "#fabric";
import { createCanvas } from "canvas";
import { imageSlotBinding, slotMark } from "./imageSlots";
import { mediaLabel } from "./bindings";
import { USER_SLOT_STYLE_KEY } from "./userSlots";
import { ImageFrame, type ImageFrameData } from "./ImageFrame";
import { LayerManager } from "./LayerManager";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const COLOR = "#0e7490";
/** Le binding d'une image liée : une photo du sujet (rang, "each") ou une image du lecteur. */
const bound = (media: number | string) =>
  ({ "image.src": { scope: typeof media === "number" || media === "each" ? "subject" : "company", media } });

function image(size = 10): FabricImage {
  return new FabricImage(createCanvas(size, size) as unknown as HTMLCanvasElement);
}

function frameData(image: ImageFrameData["image"], extra: Record<string, unknown> = {}): ImageFrameData {
  return {
    type: "ImageFrame", left: 100, top: 100, angle: 0, scaleX: 1, scaleY: 1,
    frameWidth: 200, frameHeight: 200, layerId: "photo", image, ...extra,
  } as ImageFrameData;
}

async function slotFrame(media: number | string = 3): Promise<ImageFrame> {
  const frame = await ImageFrame.fromObject(frameData({ cropX: 0.2, cropY: 0.5, scale: 1.5 }));
  frame.set("bindings", bound(media));
  return frame;
}

function managerWith(objects: FabricObject[]): LayerManager {
  const canvas = {
    getObjects: () => objects, setActiveObject: vi.fn(), renderAll: vi.fn(), requestRenderAll: vi.fn(),
  };
  return new LayerManager(canvas as never);
}

describe("slotMark", () => {
  it("le rang d'une photo, tel qu'il est écrit", () => {
    expect(slotMark({ scope: "subject", media: 1 })).toEqual({ label: "1" });
    expect(slotMark({ scope: "subject", media: 12 })).toEqual({ label: "12" });
  });

  it("l'itération s'appelle i", () => {
    expect(slotMark({ scope: "subject", media: "each" })).toEqual({ label: "i" });
  });

  it("une image nommée a son pictogramme : une personne pour l'avatar, une photo sinon", () => {
    expect(slotMark({ scope: "company", media: "avatar" })).toEqual({ glyph: "person" });
    expect(slotMark({ scope: "company", media: "logo" })).toEqual({ glyph: "photo" });
  });

  it("une source liée par expression : la lib n'en sait rien, une photo", () => {
    expect(slotMark({ scope: "company", expr: "$LOGO_URL" })).toEqual({ glyph: "photo" });
  });
});

describe("mediaLabel", () => {
  it("nomme l'image liée pour le badge", () => {
    expect(mediaLabel({ media: 3 })).toBe("media 3");
    expect(mediaLabel({ media: "each" })).toBe("media i");
    expect(mediaLabel({ media: "avatar" })).toBe("avatar");
  });
});

describe("imageSlotBinding", () => {
  it("une source liée en attente — ni résolue, ni image à fournir", async () => {
    const frame = await slotFrame();
    expect(imageSlotBinding(frame as unknown as FabricObject)?.media).toBe(3);

    frame.set("bindings", { "image.src": { scope: "subject", media: 3, resolved: true } });
    expect(imageSlotBinding(frame as unknown as FabricObject)).toBeNull();

    frame.set("bindings", { "image.src": { scope: "user", hint: "Votre photo" } });
    expect(imageSlotBinding(frame as unknown as FabricObject)).toBeNull();

    frame.set("bindings", { "image.src": { scope: "company", expr: "$LOGO_URL" } });
    expect(imageSlotBinding(frame as unknown as FabricObject)?.expr).toBe("$LOGO_URL");
  });
});

describe("rendu", () => {
  function rendered(frame: ImageFrame): { canvas: StaticCanvas; labels: string[] } {
    const canvas = new StaticCanvas(undefined, { width: 200, height: 200 });
    (canvas as any)[USER_SLOT_STYLE_KEY] = { color: COLOR };
    canvas.add(frame as unknown as FabricObject);
    return { canvas, labels: labelsOf(canvas) };
  }

  /** Les textes tracés au rendu — le cache du cadre a son propre contexte : on écoute le
   *  prototype. */
  function labelsOf(canvas: StaticCanvas): string[] {
    const proto = Object.getPrototypeOf(canvas.getContext());
    const fillText = vi.spyOn(proto, "fillText").mockImplementation(() => {});
    canvas.renderAll();
    const labels = fillText.mock.calls.map(([text]) => String(text));
    fillText.mockRestore();
    return labels;
  }

  function pixel(canvas: StaticCanvas, x: number, y: number): number[] {
    return Array.from(canvas.getContext().getImageData(x, y, 1, 1).data).slice(0, 3);
  }

  it("un cadre lié sans image se dessine en emplacement : la couleur d'édition, le rang", async () => {
    const { canvas, labels } = rendered(await slotFrame(3));

    expect(labels).toEqual(["3"]);
    // Le coin bas-droit du dégradé : la couleur d'édition (#0e7490), à l'antialias près
    const [r, g, b] = pixel(canvas, 197, 197);
    expect(Math.abs(r - 0x0e) + Math.abs(g - 0x74) + Math.abs(b - 0x90)).toBeLessThan(12);
  });

  it("le binding retiré : le damier revient", async () => {
    const frame = await slotFrame();
    const { canvas } = rendered(frame);

    frame.set("bindings", {});
    expect(labelsOf(canvas)).toEqual([]);
    // Un gris du damier (recadré, donc pas à une case près) — plus le dégradé
    expect(Math.min(...pixel(canvas, 4, 4))).toBeGreaterThan(0xe0);
  });

  it("un cadre en attente sans binding reste un damier", async () => {
    const frame = await ImageFrame.fromObject(frameData({ content_medium_id: 7 }));
    expect(rendered(frame).labels).toEqual([]);
  });

  it("l'hôte a pris l'aperçu à sa charge : rien ne se dessine", async () => {
    const frame = await slotFrame();
    frame.concealPlaceholder();
    expect(rendered(frame).labels).toEqual([]);
  });
});

describe("le document", () => {
  it("un emplacement se sauve sans src, son recadrage gardé", async () => {
    const frame = await slotFrame();
    const out = frame.toObject();

    expect(out.image.src).toBeUndefined();
    expect(out.image).toMatchObject({ cropX: 0.2, cropY: 0.5, scale: 1.5 });
    expect(frame.croppable).toBe(false);
  });

  it("la valeur montrée ne s'écrit pas : affichée, recadrable, le cadre reste en attente", async () => {
    const frame = await slotFrame("logo");
    frame.showValue(await FabricImage.fromURL(PIXEL));

    expect(frame.displayedSrc).toBe(PIXEL);
    expect(frame.imageSrc).toBe("");
    expect(frame.pending).toBe(true);
    expect(frame.croppable).toBe(true);
    expect(frame.toObject().image.src).toBeUndefined();
    expect(frame.toObject().image).toMatchObject({ cropX: 0.2, scale: 1.5 });
  });

  it("une image du document devient la valeur : sa source et son identité sortent du document", async () => {
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL, content_medium_id: 42 }));
    frame.showValue();

    expect(frame.displayedSrc).toBe(PIXEL);
    expect(frame.toObject().image.src).toBeUndefined();
    expect(frame.toObject().image.content_medium_id).toBeUndefined();
  });

  it("un cadre vidé lâche sa source et son identité, pas son recadrage", async () => {
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL, content_medium_id: 42, cropX: 0.1, cropY: 0.5, scale: 2 }));
    frame.clearSource();

    expect(frame.displayedSrc).toBe("");
    expect(frame.pending).toBe(true);
    expect(frame.toObject().image).toEqual({ cropX: 0.1, cropY: 0.5, scale: 2 });
  });
});

describe("LayerManager", () => {
  it("showImageValue : la valeur du lecteur, puis plus rien", async () => {
    const frame = await slotFrame("logo");
    const layers = managerWith([frame as unknown as FabricObject]);

    await layers.showImageValue(frame as unknown as FabricObject, PIXEL);
    expect(frame.displayedSrc).toBe(PIXEL);
    expect(frame.toObject().image.src).toBeUndefined();

    await layers.showImageValue(frame as unknown as FabricObject, null);
    expect(frame.displayedSrc).toBe("");
  });

  it("showImageValue : un chargement dépassé ne s'affiche pas", async () => {
    const frame = await slotFrame("logo");
    const layers = managerWith([frame as unknown as FabricObject]);

    const stale = layers.showImageValue(frame as unknown as FabricObject, PIXEL);
    await layers.showImageValue(frame as unknown as FabricObject, null);
    await stale;
    expect(frame.displayedSrc).toBe("");
  });

  it("showImageValue : l'image déjà en place devient la valeur, sans rechargement", async () => {
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL }));
    const fromURL = vi.spyOn(FabricImage, "fromURL");

    await managerWith([]).showImageValue(frame as unknown as FabricObject, PIXEL);
    expect(fromURL).not.toHaveBeenCalled();
    expect(frame.pending).toBe(true);
    expect(frame.displayedSrc).toBe(PIXEL);
    fromURL.mockRestore();
  });

  it("remplacer l'image d'un cadre lié le délie — le geste d'auteur prime", async () => {
    const frame = await slotFrame(1);
    frame.set("bindings", { ...bound(1), visible: { expr: "$PRIX > 0" } });

    await managerWith([]).replaceImageSource(frame, PIXEL, { imageMeta: { content_medium_id: 3 } });
    expect(frame.get("bindings")).toEqual({ visible: { expr: "$PRIX > 0" } });
    expect(frame.toObject().image).toMatchObject({ src: PIXEL, content_medium_id: 3 });
  });

  it("un binding résolu (le sujet consommé) survit au remplacement", async () => {
    const frame = await ImageFrame.fromObject(frameData({ src: PIXEL }));
    const resolved = { "image.src": { scope: "subject", media: 1, resolved: true } };
    frame.set("bindings", resolved);

    await managerWith([]).replaceImageSource(frame, PIXEL);
    expect(frame.get("bindings")).toEqual(resolved);
  });
});
