import { describe, it, expect, beforeAll } from "vitest";
import { nextShape, isValidShape, getAvailableShapes } from "./shapeWheel";
import { registerShapes } from "./registry";

describe("shapeWheel", () => {
  // La lib n'embarque plus de formes : le catalogue est injecté par l'hôte.
  // Le multi-path (artwork) ne participe ni au cycle ni aux clips.
  beforeAll(() => {
    registerShapes([
      { id: "heart", paths: [{ d: "M50 90L10 40A20 20 0 0 1 50 25A20 20 0 0 1 90 40Z" }], width: 100, height: 87 },
      { id: "hexagon", d: "M25 5H75L95 50L75 95H25L5 50Z", width: 90, height: 90 },
      { id: "logo", paths: [{ d: "M0 0H50V50H0Z", fill: "#EC6525" }, { d: "M50 50H100V100H50Z", fill: "#003366" }], width: 100, height: 100 },
    ]);
  });

  describe("nextShape", () => {
    it("returns 'circle' when no current shape", () => {
      expect(nextShape(undefined)).toBe("circle");
    });

    it("returns 'circle' for invalid shape", () => {
      expect(nextShape("invalid" as any)).toBe("circle");
    });

    it("cycles through all shapes and loops back", () => {
      const shapes = getAvailableShapes();
      // Starting from rect, each call should give the next in the catalog
      for (let i = 0; i < shapes.length; i++) {
        expect(nextShape(shapes[i])).toBe(shapes[(i + 1) % shapes.length]);
      }
    });
  });

  describe("isValidShape", () => {
    it("returns true for all catalog shapes", () => {
      for (const shape of getAvailableShapes()) {
        expect(isValidShape(shape)).toBe(true);
      }
    });

    it("returns false for invalid shapes", () => {
      expect(isValidShape("triangle")).toBe(false);
      expect(isValidShape("")).toBe(false);
      expect(isValidShape("unknown")).toBe(false);
    });
  });

  describe("getAvailableShapes", () => {
    it("contains built-in and registered mono-path shapes", () => {
      const shapes = getAvailableShapes();
      expect(shapes).toContain("rect");
      expect(shapes).toContain("circle");
      expect(shapes).toContain("heart");
      expect(shapes).toContain("hexagon");
    });

    it("excludes multi-path artwork (never a clip, never in the wheel)", () => {
      expect(getAvailableShapes()).not.toContain("logo");
      expect(isValidShape("logo")).toBe(false);
    });
  });
});
