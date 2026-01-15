import { describe, it, expect } from "vitest";
import { antiScale } from "./antiScale";
import type { FabricObject } from "#fabric";

// Helper pour créer un mock d'objet Fabric
function createMockObject(scaleX: number, scaleY: number): FabricObject {
  return { scaleX, scaleY } as FabricObject;
}

describe("antiScale", () => {
  describe("avec scales égaux", () => {
    it("retourne [1, 1] pour scale 1:1", () => {
      const obj = createMockObject(1, 1);
      expect(antiScale(obj)).toEqual([1, 1]);
    });

    it("retourne [1, 1] pour scale 2:2", () => {
      const obj = createMockObject(2, 2);
      expect(antiScale(obj)).toEqual([1, 1]);
    });

    it("retourne [1, 1] pour scale 0.5:0.5", () => {
      const obj = createMockObject(0.5, 0.5);
      expect(antiScale(obj)).toEqual([1, 1]);
    });
  });

  describe("avec scaleY > scaleX (étiré verticalement)", () => {
    it("compense pour scale 1:2", () => {
      const obj = createMockObject(1, 2);
      expect(antiScale(obj)).toEqual([1, 0.5]);
    });

    it("compense pour scale 1:4", () => {
      const obj = createMockObject(1, 4);
      expect(antiScale(obj)).toEqual([1, 0.25]);
    });

    it("compense pour scale 0.5:1", () => {
      const obj = createMockObject(0.5, 1);
      expect(antiScale(obj)).toEqual([1, 0.5]);
    });
  });

  describe("avec scaleX > scaleY (étiré horizontalement)", () => {
    it("compense pour scale 2:1", () => {
      const obj = createMockObject(2, 1);
      expect(antiScale(obj)).toEqual([0.5, 1]);
    });

    it("compense pour scale 4:1", () => {
      const obj = createMockObject(4, 1);
      expect(antiScale(obj)).toEqual([0.25, 1]);
    });

    it("compense pour scale 1:0.5", () => {
      const obj = createMockObject(1, 0.5);
      expect(antiScale(obj)).toEqual([0.5, 1]);
    });
  });

  describe("cas limites", () => {
    it("gère les scales très petits", () => {
      const obj = createMockObject(0.01, 0.02);
      expect(antiScale(obj)).toEqual([1, 0.5]);
    });

    it("gère les scales très grands", () => {
      const obj = createMockObject(100, 50);
      expect(antiScale(obj)).toEqual([0.5, 1]);
    });
  });
});
