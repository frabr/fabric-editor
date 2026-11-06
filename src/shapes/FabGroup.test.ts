/**
 * Un groupe de paths : une forme, qui garde ses propriétés de calque à la sérialisation et
 * se colore d'un bloc.
 */
import { describe, it, expect } from "vitest";
import { createPathsShape } from "./factories";
import { FabGroup } from "./FabGroup";
import { FabPath } from "./FabPath";

const LOGO = [
  { d: "M0 0 H50 V50 H0 Z", fill: "#ec6525" },
  { d: "M60 0 H100 V50 H60 Z", fill: "#ec6525" },
];

describe("FabGroup", () => {
  it("createPathsShape builds one, whose layer props survive toObject", () => {
    const group = createPathsShape(LOGO, { width: 200 }) as FabGroup;
    group.set({ layerId: "g", layerType: "shape" });

    expect(group).toBeInstanceOf(FabGroup);
    const json = group.toObject() as Record<string, unknown>;
    expect(json.type).toBe("Group");
    expect([json.layerId, json.layerType]).toEqual(["g", "shape"]);
  });

  it("reads back from JSON as a FabGroup of FabPath, layer props included", async () => {
    const group = createPathsShape(LOGO, { width: 200 }) as FabGroup;
    group.set({ layerId: "g", layerType: "shape" });

    const restored = await FabGroup.fromObject(group.toObject());

    expect(restored).toBeInstanceOf(FabGroup);
    expect(restored.get("layerType")).toBe("shape");
    expect(restored.getObjects().every((child) => child instanceof FabPath)).toBe(true);
  });

  it("commonFill is the children's shared fill, null when they differ ; setFill colors them all", () => {
    const group = createPathsShape(LOGO, {}) as FabGroup;
    expect(group.commonFill()).toBe("#ec6525");

    group.getObjects()[1].set({ fill: "#fff" });
    expect(group.commonFill()).toBeNull();

    group.setFill("#123456");
    expect(group.getObjects().map((child) => child.fill)).toEqual(["#123456", "#123456"]);
    expect(group.commonFill()).toBe("#123456");
  });
});
