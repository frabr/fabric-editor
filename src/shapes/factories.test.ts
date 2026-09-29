import { describe, it, expect, beforeEach } from "vitest";
import { Group } from "#fabric";
import { registerShapes } from "./registry";
import { createShape, createPathsShape } from "./factories";
import { FabPath } from "./FabPath";

const SQUARE = "M0 0H100V100H0Z";
const LOGO_PATHS = [
  { d: "M0 0H50V50H0Z", fill: "#EC6525" },
  { d: "M50 50H100V100H50Z", fill: "#003366" },
];

describe("shapes/factories — paths inline", () => {
  beforeEach(() => registerShapes([]));

  describe("createPathsShape mono-path", () => {
    it("builds a plain FabPath — the geometry case stays untouched", () => {
      const shape = createPathsShape([{ d: SQUARE }], { fill: "#ffffff", width: 150, height: 150 });
      expect(shape).toBeInstanceOf(FabPath);
      expect(shape.fill).toBe("#ffffff");
    });

    it("authored fill wins over the caller's generic default", () => {
      const shape = createPathsShape([{ d: SQUARE, fill: "#EC6525" }], { fill: "#ffffff" });
      expect(shape.fill).toBe("#EC6525");
    });

    it("keeps authored outlines: stroke set, fill transparent — never the generic default", () => {
      const shape = createPathsShape([{ d: SQUARE, stroke: "#EC6525", strokeWidth: 2 }], { fill: "#ffffff" });
      expect(shape.stroke).toBe("#EC6525");
      expect(shape.strokeWidth).toBe(2);
      expect(shape.fill).toBe("");
    });
  });

  describe("createPathsShape multi-path", () => {
    it("builds a Group of FabPath, each keeping its authored fill", () => {
      const group = createPathsShape(LOGO_PATHS, { fill: "#ffffff", left: 100, top: 100 }) as Group;
      expect(group).toBeInstanceOf(Group);
      const children = group.getObjects();
      expect(children).toHaveLength(2);
      expect(children.every((c) => c instanceof FabPath)).toBe(true);
      expect(children.map((c) => c.fill)).toEqual(["#EC6525", "#003366"]);
    });

    it("preserves the relative layout of the 100x100 space", () => {
      const group = createPathsShape(LOGO_PATHS, {}) as Group;
      const [a, b] = group.getObjects();
      // Deux carrés de 50 en diagonale : le groupe couvre 100x100
      expect(group.width).toBeCloseTo(100, 0);
      expect(group.height).toBeCloseTo(100, 0);
      // Le second est en bas-droite du premier
      expect(b.left).toBeGreaterThan(a.left);
      expect(b.top).toBeGreaterThan(a.top);
    });

    it("scales the whole group to the requested box", () => {
      const group = createPathsShape(LOGO_PATHS, { width: 150, height: 150 }) as Group;
      expect(group.width * group.scaleX).toBeCloseTo(150, 0);
      expect(group.height * group.scaleY).toBeCloseTo(150, 0);
    });

    it("sizes the long axis to 300 when no dimension is given", () => {
      const group = createPathsShape(LOGO_PATHS, {}) as Group;
      expect(Math.max(group.width * group.scaleX, group.height * group.scaleY)).toBeCloseTo(300, 0);
    });
  });

  describe("createShape via registry id", () => {
    it("routes a multi-path registry entry to a Group", () => {
      registerShapes([{ id: "logo", paths: LOGO_PATHS, width: 100, height: 100 }]);
      const shape = createShape("logo", { fill: "#ffffff" });
      expect(shape).toBeInstanceOf(Group);
    });

    it("falls back to rect for an unknown id (registry not injected)", () => {
      const shape = createShape("mystery", {});
      expect(shape.type?.toLowerCase()).toContain("rect");
    });
  });
});
