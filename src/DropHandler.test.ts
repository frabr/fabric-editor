/**
 * DropHandler : un fichier du bureau passe par l'hôte (resolveFile) avant d'entrer dans le
 * document — l'url finale et l'identité du média, jamais une url de session.
 */
import { describe, it, expect, vi } from "vitest";
import { FabricImage } from "#fabric";
import { createCanvas } from "canvas";
import { DropHandler } from "./DropHandler";
import { ImageFrame } from "./ImageFrame";

function handlerWith(config: Record<string, unknown>, frame: ImageFrame = imageFrame()) {
  const objects: object[] = [frame];
  const canvas = {
    setActiveObject: vi.fn(), renderAll: vi.fn(), requestRenderAll: vi.fn(), getScenePoint: vi.fn(),
    getObjects: () => objects,
  };
  const layers = { replaceImageSource: vi.fn(async () => frame) };
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const handler = new DropHandler({ layers, canvas } as any,
                                  { getImageUrl: () => "blob:session", onError, onSuccess, ...config } as any);
  const dropImage = vi.fn(async () => ({ kind: "add", object: frame }));
  (handler as any).dropImage = dropImage;
  return { handler, dropImage, layers, objects, frame, onError, onSuccess };
}

function imageFrame(): ImageFrame {
  const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
  return new ImageFrame(img, { frameWidth: 40, frameHeight: 40, layerId: "f" });
}

function fileDrop() {
  const file = new File(["x"], "a.png", { type: "image/png" });
  return { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { files: [file] } } as unknown as DragEvent;
}

describe("handleDrop", () => {
  it("sans resolveFile : l'url de session de getImageUrl, comme avant", async () => {
    const { handler, dropImage } = handlerWith({});
    const e = fileDrop();

    await (handler as any).handleDrop(e);

    expect(dropImage).toHaveBeenCalledWith("blob:session", e);
  });

  it("avec resolveFile : l'aperçu tout de suite, la source remplacée en place quand l'upload atterrit", async () => {
    let land!: (value: { url: string; imageMeta: Record<string, unknown> }) => void;
    const resolveFile = vi.fn(() => new Promise<{ url: string; imageMeta: Record<string, unknown> }>((r) => { land = r; }));
    const { handler, dropImage, layers, frame, onSuccess } = handlerWith({ resolveFile });
    const e = fileDrop();

    const dropping = (handler as any).handleDrop(e);
    await vi.waitFor(() => expect(dropImage).toHaveBeenCalledWith("blob:session", e));
    // Pendant l'upload : affiché, mais sauvé sans source — jamais de blob: dans un document.
    expect(frame.pending).toBe(true);
    expect("src" in frame.toObject().image).toBe(false);

    land({ url: "https://cdn/a.jpg", imageMeta: { content_medium_id: 5 } });
    await dropping;

    expect(layers.replaceImageSource).toHaveBeenCalledWith(frame, "https://cdn/a.jpg",
                                                           { imageMeta: { content_medium_id: 5 } });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("onFile : l'hôte prend le fichier, le DropHandler ne pose rien", async () => {
    const onFile = vi.fn(() => true);
    const { handler, dropImage } = handlerWith({ onFile, resolveFile: vi.fn() });
    const e = fileDrop();

    await (handler as any).handleDrop(e);

    expect(onFile).toHaveBeenCalledWith(expect.any(File), e);
    expect(dropImage).not.toHaveBeenCalled();
  });

  it("resolveFileInto : le flux d'upload sur un cadre posé par l'hôte", async () => {
    const resolveFile = vi.fn(async () => ({ url: "https://cdn/bg.jpg", imageMeta: { content_medium_id: 9 } }));
    const { handler, layers, frame, onSuccess } = handlerWith({ resolveFile });

    const resolving = handler.resolveFileInto(frame, new File(["x"], "bg.png", { type: "image/png" }));
    expect(frame.pending).toBe(true);
    await resolving;

    expect(layers.replaceImageSource).toHaveBeenCalledWith(frame, "https://cdn/bg.jpg", { imageMeta: { content_medium_id: 9 } });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("un cadre supprimé pendant l'upload n'est pas remplacé", async () => {
    const resolveFile = vi.fn(async () => ({ url: "https://cdn/a.jpg" }));
    const { handler, layers, objects, onSuccess } = handlerWith({ resolveFile });
    objects.length = 0;

    await (handler as any).handleDrop(fileDrop());

    expect(layers.replaceImageSource).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("un upload qui échoue : l'aperçu reste, en attente, l'hôte est prévenu", async () => {
    const resolveFile = vi.fn(async () => { throw new Error("upload failed"); });
    const { handler, frame, layers, onError } = handlerWith({ resolveFile });

    await (handler as any).handleDrop(fileDrop());

    expect(layers.replaceImageSource).not.toHaveBeenCalled();
    expect(frame.pending).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
