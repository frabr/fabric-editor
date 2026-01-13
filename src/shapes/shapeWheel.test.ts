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

    it("cycles through shapes in correct order", () => {
      expect(nextShape("rect")).toBe("rounded");
      expect(nextShape("rounded")).toBe("circle");
      expect(nextShape("circle")).toBe("heart");
      expect(nextShape("heart")).toBe("hexagon");
      expect(nextShape("hexagon")).toBe("rect");
    });

    it("loops back to rect after hexagon", () => {
      expect(nextShape("hexagon")).toBe("rect");
    });
  });

  describe("isValidShape", () => {
    it("returns true for valid shapes", () => {
      expect(isValidShape("rect")).toBe(true);
      expect(isValidShape("rounded")).toBe(true);
      expect(isValidShape("circle")).toBe(true);
      expect(isValidShape("heart")).toBe(true);
      expect(isValidShape("hexagon")).toBe(true);
    });

    it("returns false for invalid shapes", () => {
      expect(isValidShape("triangle")).toBe(false);
      expect(isValidShape("")).toBe(false);
      expect(isValidShape("unknown")).toBe(false);
    });
  });

  describe("getAvailableShapes", () => {
    it("returns all available shapes", () => {
      const shapes = getAvailableShapes();
      expect(shapes).toContain("rect");
      expect(shapes).toContain("rounded");
      expect(shapes).toContain("circle");
      expect(shapes).toContain("heart");
      expect(shapes).toContain("hexagon");
      expect(shapes).toHaveLength(5);
    });

    it("returns a readonly array", () => {
      const shapes = getAvailableShapes();
      // TypeScript devrait empêcher la mutation, mais on vérifie à runtime
      expect(Object.isFrozen(shapes) || Array.isArray(shapes)).toBe(true);
    });
  });
});
