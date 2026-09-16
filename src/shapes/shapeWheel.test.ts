import { describe, it, expect } from "vitest";
import { nextShape, isValidShape, getAvailableShapes } from "./shapeWheel";

describe("shapeWheel", () => {
  describe("nextShape", () => {
    it("returns 'rounded' when no current shape", () => {
      expect(nextShape(undefined)).toBe("rounded");
    });

    it("returns 'rounded' for invalid shape", () => {
      expect(nextShape("invalid" as any)).toBe("rounded");
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
    it("contains built-in and path shapes", () => {
      const shapes = getAvailableShapes();
      expect(shapes).toContain("rect");
      expect(shapes).toContain("rounded");
      expect(shapes).toContain("circle");
      expect(shapes).toContain("heart");
      expect(shapes).toContain("hexagon");
      // At least the 3 built-ins + whatever SVGs exist
      expect(shapes.length).toBeGreaterThanOrEqual(5);
    });
  });
});
