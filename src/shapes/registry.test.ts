import { describe, it, expect, beforeEach } from "vitest";
import { registerShapes, registeredShapes, getCatalogShape, isMonoPath, clipDataFor } from "./registry";

const HEART = { id: "heart", paths: [{ d: "M50 90L10 40A20 20 0 0 1 50 25A20 20 0 0 1 90 40Z" }], width: 100, height: 87 };
const LOGO = {
  id: "logo",
  paths: [{ d: "M0 0H50V50H0Z", fill: "#EC6525" }, { d: "M50 50H100V100H50Z", fill: "#003366" }],
  width: 100,
  height: 100,
};

describe("shapes/registry", () => {
  beforeEach(() => registerShapes([HEART, LOGO]));

  it("resolves entries by id", () => {
    expect(getCatalogShape("heart")?.paths).toHaveLength(1);
    expect(getCatalogShape("unknown")).toBeUndefined();
  });

  it("replaces the whole catalog on re-register", () => {
    registerShapes([HEART]);
    expect(registeredShapes()).toHaveLength(1);
    expect(getCatalogShape("logo")).toBeUndefined();
  });

  it("normalizes legacy flat entries ({id, d}) into paths form", () => {
    registerShapes([{ id: "hexagon", d: "M25 5H75L95 50L75 95H25L5 50Z", width: 90, height: 90 }]);
    const shape = getCatalogShape("hexagon");
    expect(shape?.paths).toEqual([{ d: "M25 5H75L95 50L75 95H25L5 50Z" }]);
    expect(isMonoPath(shape!)).toBe(true);
  });

  describe("clipDataFor", () => {
    it("returns inline clip data for mono-path shapes", () => {
      expect(clipDataFor("heart")).toEqual({ d: HEART.paths[0].d, width: 100, height: 87 });
    });

    it("refuses multi-path artwork and unknown ids", () => {
      expect(clipDataFor("logo")).toBeUndefined();
      expect(clipDataFor("nope")).toBeUndefined();
    });
  });
});
