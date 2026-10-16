/**
 * DropHandler : un fichier du bureau passe par l'hôte (resolveFile) avant d'entrer dans le
 * document — l'url finale et l'identité du média, jamais une url de session.
 */
import { describe, it, expect, vi } from "vitest";
import { FabricImage, Rect } from "#fabric";
import { createCanvas } from "canvas";
import { DropHandler } from "./DropHandler";
import { ImageFrame } from "./ImageFrame";

function handlerWith(config: Record<string, unknown>, frame: ImageFrame = imageFrame()) {
  const objects: object[] = [frame];
  const canvas = {
    on: vi.fn(), off: vi.fn(),
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

/**
 * Une image déjà sur le canvas, glissée (object:moving) : elle agit comme une image de la
 * toolbox — « Remplacer » sur une forme ou une forme-image après l'attente, la bande du fond
 * à l'hôte, une pile à DragToLayout.
 */
describe("une image du canvas, glissée", () => {
  function nativeSetup(config: Record<string, unknown> = {}, target: object = new Rect({ width: 100, height: 100 })) {
    const source = imageFrame();
    Object.defineProperty(source, "imageSrc", { get: () => "https://cdn/a.jpg" });
    Object.defineProperty(source, "imageMeta", { get: () => ({ content_medium_id: 7 }) });
    const replaced = imageFrame();
    const canvas = {
      on: vi.fn(), off: vi.fn(), add: vi.fn(), remove: vi.fn(), renderAll: vi.fn(), requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(), discardActiveObject: vi.fn(), getScenePoint: vi.fn(() => ({ x: 5, y: 5 })),
      getObjects: () => [source, target],
    };
    const layers = {
      replaceShapeWithImage: vi.fn(async () => replaced), replaceImageSource: vi.fn(async () => replaced), remove: vi.fn(),
    };
    const editor = { canvas, layers, layout: { isIdle: true }, findDropTargetAtPoint: vi.fn(() => target) };
    const onSuccess = vi.fn();
    const handler = new DropHandler(editor as any, { getImageUrl: () => "", onSuccess, hoverDelay: 500, ...config } as any);
    const pointer = { clientX: 10, clientY: 10 } as MouseEvent;
    const move = () => (handler as any).onCanvasMoving({ target: source, e: pointer, scenePoint: { x: 5, y: 5 } });
    const up = () => (handler as any).onCanvasUp({ e: pointer });
    return { handler, source, target, layers, canvas, editor, onSuccess, move, up };
  }

  it("au-dessus d'une forme, après l'attente, le lâcher la remplit de l'image et retire le calque glissé", async () => {
    vi.useFakeTimers();
    const { source, target, layers, canvas, onSuccess, move, up } = nativeSetup();

    move();
    vi.advanceTimersByTime(500);
    // Pendant un glisser natif, la sélection reste l'objet qu'on tient
    expect(canvas.setActiveObject).not.toHaveBeenCalled();

    await up();

    expect(layers.replaceShapeWithImage).toHaveBeenCalledWith(target, "https://cdn/a.jpg", { content_medium_id: 7 });
    expect(layers.remove).toHaveBeenCalledWith(source);
    expect(onSuccess).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("au-dessus d'une forme-image, c'est son image qui est remplacée", async () => {
    vi.useFakeTimers();
    const target = imageFrame();
    const { layers, move, up } = nativeSetup({}, target);

    move();
    vi.advanceTimersByTime(500);
    await up();

    expect(layers.replaceImageSource).toHaveBeenCalledWith(target, "https://cdn/a.jpg", { imageMeta: { content_medium_id: 7 } });
    expect(layers.replaceShapeWithImage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("lâchée avant l'attente, ou sans cible : rien ne change", async () => {
    vi.useFakeTimers();
    const { layers, move, up } = nativeSetup();

    move();
    vi.advanceTimersByTime(100);
    await up();

    expect(layers.replaceShapeWithImage).not.toHaveBeenCalled();
    expect(layers.remove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("une pile reste l'affaire de DragToLayout : pas de « Remplacer » dessus", async () => {
    vi.useFakeTimers();
    const stack = new Rect({ width: 100, height: 100 });
    stack.set("layout", { container: { arrangement: "column" } });
    const { layers, move, up } = nativeSetup({}, stack);

    move();
    vi.advanceTimersByTime(500);
    await up();

    expect(layers.replaceShapeWithImage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("dans la bande du fond : le cue de l'hôte, aucune cible, et le lâcher lui revient", async () => {
    vi.useFakeTimers();
    const cue = vi.fn();
    const take = vi.fn(async () => true);
    const { source, layers, move, up } = nativeSetup({ canvasEdge: { near: () => true, cue, take } });

    move();
    vi.advanceTimersByTime(500);
    expect(cue).toHaveBeenCalledWith(true);

    await up();

    expect(take).toHaveBeenCalledWith(source, expect.anything());
    expect(cue).toHaveBeenLastCalledWith(false);
    expect(layers.replaceShapeWithImage).not.toHaveBeenCalled();
    expect(layers.remove).toHaveBeenCalledWith(source);
    vi.useRealTimers();
  });

  it("un glisser de la toolbox en cours n'est pas un glisser natif", async () => {
    vi.useFakeTimers();
    const { handler, layers, move, up } = nativeSetup();
    (handler as any).drag = { payload: { kind: "image", url: "x" }, capabilities: {}, object: null, onCanvas: false };

    move();
    vi.advanceTimersByTime(500);
    await up();

    expect(layers.replaceShapeWithImage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
