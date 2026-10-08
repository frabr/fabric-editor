/**
 * Pile en blocs : un container emmène ses descendants, ses enfants restent
 * au-dessus de lui, un enfant reste parmi les enfants de son container.
 */
import { describe, it, expect } from "vitest";
import type { FabricObject } from "#fabric";
import { bringBlockForward, bringBlocksForward, placeBlockAbove, sendBlockBackward, sendBlocksBackward, stackBlock } from "./z-order";

function obj(id: string, parentId?: string): FabricObject {
  const layout = parentId ? { child: { parentId } } : undefined;
  return { get: (key: string) => (key === "layerId" ? id : key === "layout" ? layout : undefined) } as unknown as FabricObject;
}

const ids = (list: FabricObject[] | null) => list?.map((o) => o.get("layerId"));
const always = () => true;

// bg | A (container) > a1, a2 | B | C (container) > c1
const bg = obj("bg");
const A = obj("A");
const a1 = obj("a1", "A");
const a2 = obj("a2", "A");
const B = obj("B");
const C = obj("C");
const c1 = obj("c1", "C");
const stack = [bg, A, a1, a2, B, C, c1];

describe("stacking", () => {
  it("le bloc d'un container contient ses descendants, imbriqués compris", () => {
    const n1 = obj("n1", "a1");
    expect(ids(stackBlock([A, a1, n1, a2, B], A))).toEqual(["A", "a1", "n1", "a2"]);
  });

  it("un container qui entre dans un container passe au-dessus de lui avec ses enfants", () => {
    // C (et c1) sous A : C entre dans A → le bloc de C passe au-dessus du bloc de A
    const before = [bg, C, c1, A, a1, a2, B];
    expect(ids(placeBlockAbove(before, C, A))).toEqual(["bg", "A", "a1", "a2", "C", "c1", "B"]);
  });

  it("monter un container : il passe devant son voisin avec ses enfants, jamais par-dessus eux", () => {
    expect(ids(bringBlockForward(stack, A, always))).toEqual(["bg", "B", "A", "a1", "a2", "C", "c1"]);
  });

  it("monter devant un container : on passe devant tout son bloc", () => {
    expect(ids(bringBlockForward(stack, B, always))).toEqual(["bg", "A", "a1", "a2", "C", "c1", "B"]);
  });

  it("monter un enfant : il reste parmi les enfants de son container", () => {
    expect(ids(bringBlockForward(stack, a1, always))).toEqual(["bg", "A", "a2", "a1", "B", "C", "c1"]);
    expect(bringBlockForward(stack, a2, always)).toBeNull();
  });

  it("monter : saute au premier voisin qui chevauche, rien sinon", () => {
    const overlapsC = (_a: FabricObject, b: FabricObject) => b === C;
    expect(ids(bringBlockForward(stack, A, overlapsC))).toEqual(["bg", "B", "C", "c1", "A", "a1", "a2"]);
    expect(bringBlockForward(stack, A, () => false)).toBeNull();
  });

  it("descendre un container : il passe sous son voisin avec ses enfants", () => {
    expect(ids(sendBlockBackward(stack, C))).toEqual(["bg", "A", "a1", "a2", "C", "c1", "B"]);
  });

  it("descendre sous un container : on passe sous tout son bloc", () => {
    expect(ids(sendBlockBackward(stack, B))).toEqual(["bg", "B", "A", "a1", "a2", "C", "c1"]);
  });

  it("jamais sous le fond, un enfant jamais sous son container", () => {
    expect(sendBlockBackward(stack, A)).toBeNull();
    expect(sendBlockBackward(stack, a1)).toBeNull();
    expect(ids(sendBlockBackward(stack, a2))).toEqual(["bg", "A", "a2", "a1", "B", "C", "c1"]);
  });

  it("monter plusieurs objets : ils passent devant leur voisin sans se doubler", () => {
    // B et C montent ensemble : C est déjà en haut, B ne passe pas par-dessus C
    expect(bringBlocksForward(stack, [B, C], always)).toBeNull();
    // A et B montent : chacun passe devant C, dans leur ordre
    expect(ids(bringBlocksForward(stack, [A, B], always))).toEqual(["bg", "C", "c1", "A", "a1", "a2", "B"]);
  });

  it("descendre plusieurs objets : jamais sous le fond, sans se doubler", () => {
    expect(sendBlocksBackward(stack, [A, B])).toBeNull();
    expect(ids(sendBlocksBackward(stack, [B, C]))).toEqual(["bg", "B", "C", "c1", "A", "a1", "a2"]);
  });
});
