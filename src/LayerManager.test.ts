import { describe, it, expect, vi, beforeEach } from "vitest";
import { LayerManager } from "./LayerManager";
import type { Canvas, FabricObject } from "#fabric";

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
    it("déplace l'objet vers l'avant", () => {
      const obj = createMockObject("layer_1");

      manager.bringForward(obj);

      expect(canvas.bringObjectForward).toHaveBeenCalledWith(obj, true);
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

      expect(canvas.sendObjectBackwards).toHaveBeenCalledWith(layer2);
      expect(canvas.renderAll).toHaveBeenCalled();
    });

    it("ne déplace pas si l'objet est en position 0 ou 1", () => {
      const bg = createMockObject("originalImage");
      const layer1 = createMockObject("layer_1");

      (canvas as any)._objects = [bg, layer1];

      manager.sendBackward(layer1);

      expect(canvas.sendObjectBackwards).not.toHaveBeenCalled();
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
      expect(layer1.toObject).toHaveBeenCalledWith(["layerId", "lockMode", "lockContent"]);
      expect(layer2.toObject).toHaveBeenCalledWith(["layerId", "lockMode", "lockContent"]);
    });
  });
});
