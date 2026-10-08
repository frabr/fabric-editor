/**
 * Les outils d'une sélection : chaque sorte, dans l'ordre de la barre, filtrés par le
 * règlement et par ce que l'éditeur propose. Vrais objets Fabric.
 */
import { describe, it, expect } from "vitest";
import { FabricImage, StaticCanvas, type FabricObject } from "#fabric";
import { createCanvas } from "canvas";
import { toolsFor, selectionKindOf, type ToolId } from "./tools";
import { CustomTextbox } from "./controls/CustomTextbox";
import { FabRect } from "./shapes/FabRect";
import { ImageFrame } from "./ImageFrame";
import { applyLockMode } from "./locking";
import type { LayoutData } from "./layout/types";

const ALL: ToolId[] = [
  "group", "align", "distribute", "arrangement", "ungroup", "fill", "font", "variables", "image",
  "promoteBackground", "clip", "outline", "effects", "layout", "animations", "lock", "forward",
  "backward", "delete",
];

function rect(id: string, layout?: LayoutData): FabRect {
  const r = new FabRect({ width: 10, height: 10 });
  r.set({ layerType: "shape", layerId: id, layout } as never);
  return r;
}

function text(id: string, layout?: LayoutData): CustomTextbox {
  const t = new CustomTextbox("Bonjour", {});
  t.set({ layerId: id, layout } as never);
  return t;
}

function imageFrame(id: string): ImageFrame {
  const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
  return new ImageFrame(img, { frameWidth: 100, frameHeight: 100, layerId: id });
}

function onCanvas<T extends FabricObject[]>(...objects: T): T {
  const canvas = new StaticCanvas(undefined, { width: 100, height: 100 });
  objects.forEach((obj) => canvas.add(obj));
  return objects;
}

describe("selectionKindOf", () => {
  it("rien, un objet, plusieurs", () => {
    expect(selectionKindOf([])).toBeNull();
    expect(selectionKindOf([text("t")])).toBe("text");
    expect(selectionKindOf([rect("s")])).toBe("shape");
    expect(selectionKindOf([imageFrame("i")])).toBe("image");
    expect(selectionKindOf([rect("a"), rect("b")])).toBe("many");
  });

  it("un container est un bloc, un groupe (⌘G) reste un groupe, libre ou rangé", () => {
    expect(selectionKindOf([rect("b", { container: {} })])).toBe("block");
    expect(selectionKindOf([rect("g", { container: { arrangement: "free", origin: "group" } })])).toBe("group");
    expect(selectionKindOf([rect("g", { container: { arrangement: "stack", origin: "group" } })])).toBe("group");
  });
});

describe("toolsFor", () => {
  it("texte : couleur et police d'abord, Supprimer en dernier", () => {
    expect(toolsFor([text("t")], ALL)).toEqual([
      "fill", "font", "animations", "effects", "variables", "layout", "lock", "forward", "backward", "delete",
    ]);
  });

  it("forme libre : pas de disposition ; enfant d'un bloc : disposition, mais pas de plans", () => {
    expect(toolsFor([rect("s")], ALL)).toEqual([
      "fill", "clip", "outline", "animations", "effects", "lock", "forward", "backward", "delete",
    ]);
    const [, child] = onCanvas(rect("b", { container: {} }), rect("c", { child: { parentId: "b" } }));
    expect(toolsFor([child], ALL)).toEqual([
      "fill", "clip", "outline", "animations", "effects", "layout", "lock", "delete",
    ]);
  });

  it("image : remplacer et passer en fond d'abord, pas de couleur", () => {
    expect(toolsFor([imageFrame("i")], ALL)).toEqual([
      "image", "promoteBackground", "clip", "animations", "outline", "effects", "lock", "forward", "backward", "delete",
    ]);
  });

  it("bloc et groupe : disposition, dégrouper", () => {
    expect(toolsFor([rect("b", { container: {} })], ALL)).toEqual([
      "fill", "layout", "animations", "outline", "effects", "ungroup", "lock", "forward", "backward", "delete",
    ]);
    expect(toolsFor([rect("g", { container: { arrangement: "free", origin: "group" } })], ALL)).toEqual([
      "arrangement", "fill", "layout", "animations", "ungroup", "effects", "lock", "forward", "backward", "delete",
    ]);
  });

  it("verrou de position : plus que le verrou ; image à fournir comprise", () => {
    const shape = rect("s");
    applyLockMode(shape, "position");
    expect(toolsFor([shape], ALL)).toEqual(["lock"]);

    const frame = imageFrame("i");
    applyLockMode(frame, "position");
    expect(toolsFor([frame], ALL)).toEqual(["image", "lock"]);
  });

  it("l'éditeur ne montre que ce qu'il propose", () => {
    expect(toolsFor([text("t")], ["delete", "font", "fill"])).toEqual(["fill", "font", "delete"]);
  });

  it("plusieurs objets : grouper, aligner ; répartir dès trois objets libres", () => {
    expect(toolsFor([rect("a"), rect("b")], ALL)).toEqual(["group", "align", "forward", "backward", "delete"]);
    expect(toolsFor([rect("a"), rect("b"), rect("c")], ALL)).toEqual([
      "group", "align", "distribute", "forward", "backward", "delete",
    ]);
  });

  it("plusieurs objets : un verrouillé retire les plans, tous verrouillés retirent Supprimer", () => {
    const [a, b] = [rect("a"), rect("b")];
    applyLockMode(a, "full");
    expect(toolsFor([a, b], ALL)).toEqual(["group", "align", "delete"]);
    applyLockMode(b, "full");
    expect(toolsFor([a, b], ALL)).toEqual(["group", "align"]);
  });
});
