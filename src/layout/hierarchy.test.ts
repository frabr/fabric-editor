/**
 * L'arbre des objets vivants : parent, ancêtres, enfants, descendance, sous-arbre.
 */
import { describe, it, expect } from "vitest";
import type { FabricObject } from "#fabric";
import { ancestorsOf, descendantsOf, findById, flowChildrenOf, parentContainerOf, parentOf, stackParentOf, subtreeOf, translateSubtree } from "./hierarchy";

function obj(id: string, layout?: object, at = { left: 0, top: 0 }): FabricObject {
  const o = {
    ...at,
    get: (key: string) => (key === "layerId" ? id : key === "layout" ? layout : undefined),
    set(props: Record<string, number>) { Object.assign(this, props); },
    setCoords() {},
  };
  return o as unknown as FabricObject;
}
const ids = (list: FabricObject[]) => list.map((o) => o.get("layerId"));

// bg | S (pile) > s1, G (groupe) > g1 > (rien) ; X libre
const bg = obj("bg");
const S = obj("S", { container: {} });
const s1 = obj("s1", { child: { parentId: "S", order: 1 } });
const G = obj("G", { container: { arrangement: "free" }, child: { parentId: "S", order: 0 } });
const g1 = obj("g1", { child: { parentId: "G" } }, { left: 10, top: 20 });
const X = obj("X");
const all = [bg, S, s1, G, g1, X];

describe("hiérarchie", () => {
  it("parent, container, pile qui place", () => {
    expect(findById(all, "G")).toBe(G);
    expect(parentOf(g1, all)).toBe(G);
    expect(parentContainerOf(s1, all)).toBe(S);
    expect(stackParentOf(G, all)).toBe(S);
    expect(stackParentOf(g1, all)).toBeUndefined();
    expect(parentOf(X, all)).toBeUndefined();
  });

  it("ancêtres, du parent à la racine", () => {
    expect(ids(ancestorsOf(g1, all))).toEqual(["G", "S"]);
  });

  it("enfants dans l'ordre de la pile qui les range", () => {
    expect(ids(flowChildrenOf(all, S).map((c) => c.obj))).toEqual(["G", "s1"]);
  });

  it("descendance et sous-arbre, dans l'ordre de la pile", () => {
    expect(ids(descendantsOf(all, [S]))).toEqual(["s1", "G", "g1"]);
    expect(ids(subtreeOf(all, [G, X]))).toEqual(["G", "g1", "X"]);
  });

  it("un cycle ne boucle pas", () => {
    const a = obj("a", { child: { parentId: "b" } });
    const b = obj("b", { child: { parentId: "a" } });
    expect(ids(ancestorsOf(a, [a, b]))).toEqual(["b"]);
    expect(ids(descendantsOf([a, b], [a]))).toEqual(["b"]);
  });

  it("déplacer un sous-arbre emmène la descendance", () => {
    translateSubtree(all, [G], 5, -5);
    expect([g1.left, g1.top]).toEqual([15, 15]);
    expect([s1.left, s1.top]).toEqual([0, 0]);
  });
});
