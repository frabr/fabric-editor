import { describe, it, expect, vi, beforeEach } from "vitest";
import { LayerManager } from "./LayerManager";
import type { Canvas, FabricObject } from "#fabric";
import { FabRect } from "./shapes/FabRect";
import { FabPath } from "./shapes/FabPath";
import { FabCircle } from "./shapes/FabCircle";
import { applyLockMode, getLockMode } from "./locking";

// Mock du canvas Fabric
function createMockCanvas() {
  const objects: FabricObject[] = [];

  const canvas = {
    _objects: objects,
    add: vi.fn((obj: FabricObject) => {
      objects.push(obj);
    }),
    remove: vi.fn((obj: FabricObject) => {
      const idx = objects.indexOf(obj);
      if (idx > -1) objects.splice(idx, 1);
    }),
    getObjects: vi.fn(() => canvas._objects),
    moveObjectTo: vi.fn((obj: FabricObject, index: number) => {
      const list = (canvas as any)._objects as FabricObject[];
      list.splice(list.indexOf(obj), 1);
      list.splice(index, 0, obj);
    }),
    setActiveObject: vi.fn(),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    bringObjectForward: vi.fn(),
    sendObjectBackwards: vi.fn(),
    width: 500,
    height: 500,
  } as unknown as Canvas;

  return canvas;
}

// Mock d'objet Fabric
function createMockObject(layerId: string, type = "rect"): FabricObject {
  return {
    type,
    layerId,
    get: vi.fn((key: string) => {
      if (key === "layerId") return layerId;
      return undefined;
    }),
    set: vi.fn(),
    toJSON: vi.fn(() => ({ type, layerId })),
    toObject: vi.fn(() => ({ type, layerId })),
    isOverlapping: vi.fn(() => true),
  } as unknown as FabricObject;
}

describe("LayerManager", () => {
  let canvas: Canvas;
  let manager: LayerManager;

  beforeEach(() => {
    canvas = createMockCanvas();
    manager = new LayerManager(canvas);
  });

  describe("all", () => {
    it("retourne un tableau vide quand il n'y a pas de calques", () => {
      expect(manager.all).toEqual([]);
    });

    it("exclut l'image de fond (originalImage)", () => {
      const bgImage = createMockObject("originalImage", "image");
      const layer1 = createMockObject("layer_1");
      const layer2 = createMockObject("layer_2");

      (canvas as any)._objects = [bgImage, layer1, layer2];

      expect(manager.all).toHaveLength(2);
      expect(manager.all).toContain(layer1);
      expect(manager.all).toContain(layer2);
      expect(manager.all).not.toContain(bgImage);
    });
  });

  describe("background", () => {
    it("retourne undefined quand il n'y a pas d'image de fond", () => {
      expect(manager.background).toBeUndefined();
    });

    it("retourne l'image de fond", () => {
      const bgImage = createMockObject("originalImage", "image");
      const layer1 = createMockObject("layer_1");

      (canvas as any)._objects = [bgImage, layer1];

      expect(manager.background).toBe(bgImage);
    });
  });

  describe("findById", () => {
    it("trouve un calque par son ID", () => {
      const layer1 = createMockObject("layer_1");
      const layer2 = createMockObject("layer_2");

      (canvas as any)._objects = [layer1, layer2];

      expect(manager.findById("layer_1")).toBe(layer1);
      expect(manager.findById("layer_2")).toBe(layer2);
    });

    it("retourne undefined si le calque n'existe pas", () => {
      expect(manager.findById("nonexistent")).toBeUndefined();
    });
  });

  describe("add", () => {
    it("ajoute un objet au canvas", () => {
      const obj = createMockObject("layer_1");

      manager.add(obj);

      expect(canvas.add).toHaveBeenCalledWith(obj);
    });

    it("sélectionne l'objet ajouté", () => {
      const obj = createMockObject("layer_1");

      manager.add(obj);

      expect(canvas.setActiveObject).toHaveBeenCalledWith(obj);
    });

    it("retourne l'objet ajouté", () => {
      const obj = createMockObject("layer_1");

      const result = manager.add(obj);

      expect(result).toBe(obj);
    });
  });

  describe("remove", () => {
    it("supprime un objet du canvas", () => {
      const obj = createMockObject("layer_1");

      manager.remove(obj);

      expect(canvas.remove).toHaveBeenCalledWith(obj);
    });
  });

  describe("bringForward", () => {
    it("déplace l'objet devant le suivant qui le chevauche", () => {
      const layer1 = createMockObject("layer_1");
      const layer2 = createMockObject("layer_2");
      (canvas as any)._objects = [layer1, layer2];

      manager.bringForward(layer1);

      expect((canvas as any)._objects).toEqual([layer2, layer1]);
      expect(canvas.renderAll).toHaveBeenCalled();
    });
  });

  describe("sendBackward", () => {
    it("déplace l'objet vers l'arrière si pas en position 0 ou 1", () => {
      const bg = createMockObject("originalImage");
      const layer1 = createMockObject("layer_1");
      const layer2 = createMockObject("layer_2");

      (canvas as any)._objects = [bg, layer1, layer2];

      manager.sendBackward(layer2);

      expect((canvas as any)._objects).toEqual([bg, layer2, layer1]);
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it("ne déplace pas si l'objet est en position 0 ou 1", () => {
      const bg = createMockObject("originalImage");
      const layer1 = createMockObject("layer_1");

      (canvas as any)._objects = [bg, layer1];

      manager.sendBackward(layer1);

      expect((canvas as any)._objects).toEqual([bg, layer1]);
      expect(canvas.moveObjectTo).not.toHaveBeenCalled();
    });
  });

  describe("serialize", () => {
    it("sérialise tous les calques en JSON", () => {
      const layer1 = createMockObject("layer_1");
      const layer2 = createMockObject("layer_2");

      (canvas as any)._objects = [
        createMockObject("originalImage"),
        layer1,
        layer2,
      ];

      const result = manager.serialize();

      expect(result).toHaveLength(2);
      expect(layer1.toObject).toHaveBeenCalledWith(["layerId", "lockMode", "lockContent", "layout", "bindings"]);
      expect(layer2.toObject).toHaveBeenCalledWith(["layerId", "lockMode", "lockContent", "layout", "bindings"]);
    });
  });

  describe("replaceShapeWithImage", () => {
    // PNG 1×1 transparent : FabricImage.fromURL le charge sans réseau
    const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    it("la forme-image reprend le layout, le verrouillage et les bindings de la forme", async () => {
      const shape = new FabRect({ width: 100, height: 50 });
      const layout = { sizing: { x: "hug", y: "hug" }, container: { gap: 4 }, child: { parentId: "p" } };
      shape.set({ layerId: "s", layerType: "shape", layout, bindings: { src: { expr: "{{logo}}" } } } as any);
      applyLockMode(shape as unknown as FabricObject, "position");
      (canvas as any)._objects = [shape];

      const frame = await manager.replaceShapeWithImage(shape as unknown as FabricObject, PIXEL);

      expect(frame.get("layerId")).toBe("s");
      expect(frame.get("layout")).toEqual(layout);
      expect(frame.get("layout")).not.toBe(layout);
      expect(getLockMode(frame as unknown as FabricObject)).toBe("position");
      expect(frame.get("bindings")).toEqual({ src: { expr: "{{logo}}" } });
    });
  });

  describe("replaceShapeWithImage — la forme-image reprend la forme", () => {
    const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    it("un path absent du catalogue donne sa propre découpe, pas un rectangle", async () => {
      const path = FabPath.fromPathData({ d: "M50 90 L10 40 A20 20 0 0 1 50 20 A20 20 0 0 1 90 40 Z" }, { id: "blob", width: 120, height: 120 });
      path.set({ layerType: "shape", layerId: "p" } as any);
      (canvas as any)._objects = [path];
      const frame = await manager.replaceShapeWithImage(path as unknown as FabricObject, PIXEL);
      expect(frame.clipPath?.type).toBe("path");
      expect(frame.clipData?.d).toContain("M");
    });

    it("un rect garde son rayon, un cercle reste un cercle", async () => {
      const rect = new FabRect({ width: 100, height: 50, rx: 12, ry: 12 });
      rect.set({ layerType: "shape", layerId: "r" } as any);
      const circle = new FabCircle({ radius: 40 });
      circle.set({ layerType: "shape", layerId: "c" } as any);
      (canvas as any)._objects = [rect, circle];
      const r = await manager.replaceShapeWithImage(rect as unknown as FabricObject, PIXEL);
      const c = await manager.replaceShapeWithImage(circle as unknown as FabricObject, PIXEL);
      expect(r.cornerRadius).toBe(12);
      expect(c.clipShape).toBe("circle");
    });
  });
});
