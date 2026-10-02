/**
 * Images à fournir : détection, règlement, remplissage, conversion, rendu (vrais objets Fabric).
 */
import { describe, it, expect, vi } from "vitest";
import { FabricImage, StaticCanvas, type Canvas, type FabricObject } from "#fabric";
import { createCanvas } from "canvas";
import { isUserSlot, userSlotHint, resolveUserSlot, collectUserSlots, USER_SLOT_STYLE_KEY } from "./userSlots";
import { rulesOf } from "./capabilities";
import { LayerManager } from "./LayerManager";
import { CustomTextbox } from "./controls/CustomTextbox";
import { FabRect } from "./shapes/FabRect";
import { FabCircle } from "./shapes/FabCircle";
import { FabPath } from "./shapes/FabPath";
import { ImageFrame } from "./ImageFrame";
import { applyLockMode, getLockMode } from "./locking";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const USER_SLOT = { "image.src": { scope: "user", hint: "Photo de l'équipe" } };

function slot(obj: FabricObject = new FabRect({ width: 100, height: 60 })): FabricObject {
  obj.set({ layerType: "shape", layerId: "slot", bindings: USER_SLOT });
  return obj;
}

function imageFrame(options: Record<string, unknown> = {}): ImageFrame {
  const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
  return new ImageFrame(img, { frameWidth: 120, frameHeight: 80, layerId: "if", ...options });
}

function managerWith(objects: FabricObject[]): LayerManager {
  const list = [...objects];
  const canvas = {
    getObjects: () => list,
    add: vi.fn((obj: FabricObject) => list.push(obj)),
    remove: vi.fn((obj: FabricObject) => list.splice(list.indexOf(obj), 1)),
    moveObjectTo: vi.fn((obj: FabricObject, index: number) => {
      list.splice(list.indexOf(obj), 1);
      list.splice(index, 0, obj);
    }),
    setActiveObject: vi.fn(),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
  } as unknown as Canvas;
  return new LayerManager(canvas as any);
}

describe("détection", () => {
  it("un binding image.src de scope user en attente", () => {
    const obj = slot();
    expect(isUserSlot(obj)).toBe(true);
    expect(userSlotHint(obj)).toBe("Photo de l'équipe");
  });

  it("ni un média dynamique, ni une image déjà fournie", () => {
    const dynamic = slot();
    dynamic.set({ bindings: { "image.src": { expr: "media[0]", scope: "subject" } } });
    const filled = slot();
    filled.set({ bindings: resolveUserSlot(USER_SLOT) });
    expect(isUserSlot(dynamic)).toBe(false);
    expect(isUserSlot(filled)).toBe(false);
  });

  it("collectUserSlots rend la consigne et la boîte scène", () => {
    const obj = slot(new FabRect({ width: 100, height: 60, left: 200, top: 100, strokeWidth: 0 }));
    const [found] = collectUserSlots([obj, new FabRect({ width: 10, height: 10 })]);
    expect(found).toMatchObject({ layerId: "slot", hint: "Photo de l'équipe" });
    expect(found.rect).toMatchObject({ left: 150, top: 70 });
    expect(found.rect.width).toBe(100);
  });
});

describe("règlement", () => {
  it("libre : les options de forme, plus l'image", () => {
    expect(rulesOf(slot())).toMatchObject({
      onToolboxImage: "fill", hosts: true, options: ["outline", "clip", "color", "corner_radius", "image"],
    });
  });

  it("verrouillé (position ou total) : seulement l'image, qu'il prend toujours en fond", () => {
    for (const mode of ["position", "full"] as const) {
      const obj = slot();
      applyLockMode(obj, mode);
      expect(rulesOf(obj)).toMatchObject({
        onToolboxImage: "fill", options: ["image"], restyles: false, restacks: false, deletes: false,
      });
    }
  });

  it("un texte ne devient pas une image à fournir", () => {
    const text = new CustomTextbox("Bonjour", {});
    text.set({ bindings: USER_SLOT });
    expect(rulesOf(text)).toMatchObject({ onToolboxImage: null, options: ["color", "font"] });
  });
});

describe("remplissage", () => {
  it("la forme-image qui remplit le cadre marque l'image fournie, la consigne reste", async () => {
    const obj = slot();
    const frame = await managerWith([obj]).replaceShapeWithImage(obj, PIXEL);
    expect(frame.get("bindings")).toEqual({
      "image.src": { scope: "user", hint: "Photo de l'équipe", resolved: true },
    });
    expect(isUserSlot(frame as unknown as FabricObject)).toBe(false);
  });
});

describe("requestUserImage", () => {
  it("une forme-image redevient la forme de sa découpe, à sa place", () => {
    const below = new FabRect({ width: 10, height: 10 });
    const frame = imageFrame({ cornerRadius: 12, left: 300, top: 200 });
    const layout = { child: { parentId: "p" } };
    frame.set({ layout, bindings: { visible: { expr: "$PRIX > 0", scope: "subject" } } });
    applyLockMode(frame as unknown as FabricObject, "position");
    const manager = managerWith([below, frame as unknown as FabricObject]);

    const shape = manager.requestUserImage(frame as unknown as FabricObject, "Le logo")!;

    expect(shape).toBeInstanceOf(FabRect);
    expect(shape.get("layerId")).toBe("if");
    expect((shape as FabRect).rx).toBe(12);
    expect(Math.round(shape.getScaledWidth())).toBe(120);
    expect(shape.getRelativeCenterPoint()).toMatchObject({ x: 300, y: 200 });
    expect(shape.get("layout")).toEqual(layout);
    expect(getLockMode(shape)).toBe("position");
    expect(shape.get("bindings")).toEqual({
      visible: { expr: "$PRIX > 0", scope: "subject" },
      "image.src": { scope: "user", hint: "Le logo" },
    });
    expect(manager.all.indexOf(shape)).toBe(1);
  });

  it("une découpe ronde donne un cercle aux dimensions du cadre", () => {
    const frame = imageFrame({ clipShape: "circle" });
    const shape = managerWith([frame as unknown as FabricObject]).requestUserImage(frame as unknown as FabricObject)!;
    expect(shape).toBeInstanceOf(FabCircle);
    expect(Math.round(shape.getScaledWidth())).toBe(120);
    expect(Math.round(shape.getScaledHeight())).toBe(80);
  });

  it("une découpe en path garde son tracé", () => {
    const d = "M50 90 L10 40 A20 20 0 0 1 50 20 A20 20 0 0 1 90 40 Z";
    const frame = imageFrame({ clipShape: "blob", clipData: { d, width: 100, height: 100 } });
    const shape = managerWith([frame as unknown as FabricObject]).requestUserImage(frame as unknown as FabricObject)!;
    expect(shape).toBeInstanceOf(FabPath);
  });

  it("une forme le reste ; un texte refuse", () => {
    const rect = new FabRect({ width: 10, height: 10 });
    rect.set({ layerType: "shape" });
    const text = new CustomTextbox("Bonjour", {});
    const manager = managerWith([rect, text]);
    expect(manager.requestUserImage(rect, "x")).toBe(rect);
    expect(isUserSlot(rect)).toBe(true);
    expect(manager.requestUserImage(text)).toBeNull();
  });
});

describe("rendu", () => {
  function pixel(canvas: StaticCanvas, x: number, y: number): string {
    const [r, g, b] = canvas.getContext().getImageData(x, y, 1, 1).data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }

  it("en attente : le damier, et la couleur revient une fois fournie", () => {
    const canvas = new StaticCanvas(undefined, { width: 200, height: 200 });
    const obj = slot(new FabRect({ width: 200, height: 200, left: 100, top: 100, fill: "#ff0000" }));
    canvas.add(obj);
    canvas.renderAll();
    // Cases de 16 : (4, 4) sombre, (20, 4) claire
    expect(pixel(canvas, 4, 4)).toBe("#e5e7eb");
    expect(pixel(canvas, 20, 4)).toBe("#f9fafb");
    expect(obj.fill).toBe("#ff0000");

    obj.set({ bindings: resolveUserSlot(USER_SLOT) });
    canvas.renderAll();
    expect(pixel(canvas, 4, 4)).toBe("#ff0000");
  });

  describe("invite", () => {
    const PROMPT = "Uploadez ou glissez une photo dans le cadre";

    function rendered(width: number, height: number, hint?: string): string[] {
      const canvas = new StaticCanvas(undefined, { width: 600, height: 600 });
      (canvas as any)[USER_SLOT_STYLE_KEY] = { color: "#7c3aed", prompt: PROMPT };
      const obj = slot(new FabRect({ width, height, left: 300, top: 300, objectCaching: false }));
      obj.set({ bindings: { "image.src": { scope: "user", ...(hint ? { hint } : {}) } } });
      canvas.add(obj);
      const fillText = vi.spyOn(canvas.getContext(), "fillText");
      canvas.renderAll();
      return fillText.mock.calls.map(([text]) => text);
    }

    it("la phrase de l'hôte, coupée aux mots, quand elle tient", () => {
      expect(rendered(500, 300).join(" ")).toBe(PROMPT);
    });

    it("la consigne du binding passe avant la phrase de l'hôte", () => {
      expect(rendered(500, 300, "Le logo").join(" ")).toBe("Le logo");
    });

    it("trop petit : pas de texte", () => {
      expect(rendered(60, 40)).toEqual([]);
    });
  });
});
