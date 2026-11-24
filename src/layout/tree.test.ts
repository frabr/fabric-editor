import { describe, it, expect } from "vitest";
import { layoutParents, layoutRoot, layoutChildren, layoutDescendants } from "./tree";

const layer = (layerId: string, parentId?: string) =>
  parentId ? { layerId, layout: { child: { parentId } } } : { layerId };

// A ⊃ B ⊃ C, A ⊃ D, et un objet libre.
const layers = [layer("A"), layer("B", "A"), layer("C", "B"), layer("D", "A"), layer("free")];

describe("layoutParents", () => {
  it("maps each child to its direct parent", () => {
    expect([...layoutParents(layers)]).toEqual([["B", "A"], ["C", "B"], ["D", "A"]]);
  });

  it("ignores a parent that is not among the layers, and a self-reference", () => {
    expect(layoutParents([layer("x", "gone"), layer("y", "y")]).size).toBe(0);
  });
});

describe("layoutRoot", () => {
  const parents = layoutParents(layers);

  it("climbs to the root, itself for a free object", () => {
    expect(layoutRoot(parents, "C")).toBe("A");
    expect(layoutRoot(parents, "free")).toBe("free");
  });

  it("stops on a cycle", () => {
    const cyclic = layoutParents([layer("a", "b"), layer("b", "a")]);

    expect(["a", "b"]).toContain(layoutRoot(cyclic, "a"));
  });
});

describe("layoutChildren / layoutDescendants", () => {
  const parents = layoutParents(layers);

  it("direct children in layer order, descendants at any depth", () => {
    expect(layoutChildren(parents, "A")).toEqual(["B", "D"]);
    expect([...layoutDescendants(parents, ["A"])].sort()).toEqual(["B", "C", "D"]);
    expect([...layoutDescendants(parents, ["B"])]).toEqual(["C"]);
  });

  it("the roots themselves are excluded", () => {
    expect(layoutDescendants(parents, ["free"]).size).toBe(0);
  });
});
