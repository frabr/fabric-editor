/**
 * resolveTextBox — sans Fabric : une mesure factice où chaque caractère fait
 * `fontSize / 2` de large et chaque ligne `fontSize` de haut.
 */
import { describe, it, expect } from "vitest";
import { resolveTextBox, type TextBoxInput, type TextMeasure } from "./text-box";

const CHARS = 40;

const measure: TextMeasure = {
  natural: (fontSize) => CHARS * fontSize / 2,
  wrapped: (width, fontSize) => {
    const perLine = Math.max(1, Math.floor(width / (fontSize / 2)));
    return { width, height: Math.ceil(CHARS / perLine) * fontSize };
  },
};

function input(overrides: Partial<TextBoxInput> = {}): TextBoxInput {
  return {
    sizing: { x: "hug", y: "hug" },
    overflow: "shrink",
    constraint: {},
    fontSizeIntent: 20,
    fontSize: 20,
    width: 100,
    height: 20,
    ...overrides,
  };
}

describe("resolveTextBox", () => {
  it("largeur contenu : une ligne, à la largeur naturelle", () => {
    expect(resolveTextBox(input(), measure)).toEqual({ width: 400, height: 20, fontSize: 20, overflowing: false });
  });

  it("largeur contenu sous une largeur disponible : wrap à cette largeur", () => {
    const box = resolveTextBox(input({ constraint: { maxW: 200 } }), measure);
    expect(box.width).toBe(200);
    expect(box.height).toBe(40);
  });

  it("largeur fixe : garde sa largeur, cède à la largeur disponible", () => {
    const fixed = input({ sizing: { x: "fixed", y: "hug" }, width: 300 });
    expect(resolveTextBox(fixed, measure).width).toBe(300);
    expect(resolveTextBox({ ...fixed, constraint: { maxW: 200 } }, measure).width).toBe(200);
  });

  it("largeur exacte du container (stretch) : prime sur le mode", () => {
    expect(resolveTextBox(input({ constraint: { maxW: 300, w: 250 } }), measure).width).toBe(250);
  });

  it("hauteur contenu : plancher minSize.h, jamais sous le contenu", () => {
    const sizing = { x: "fixed" as const, y: "hug" as const, minSize: { w: 0, h: 100 } };
    expect(resolveTextBox(input({ sizing, width: 400 }), measure).height).toBe(100);
    expect(resolveTextBox(input({ sizing: { ...sizing, minSize: { w: 0, h: 5 } }, width: 400 }), measure).height).toBe(20);
  });

  it("hauteur fixe + shrink : la plus grande police qui tient, l'intention ne bouge pas", () => {
    const box = resolveTextBox(input({ sizing: { x: "fixed", y: "fixed" }, width: 200, height: 30 }), measure);
    expect(box.height).toBe(30);
    expect(box.fontSize).toBeLessThan(20);
    expect(measure.wrapped(200, box.fontSize).height).toBeLessThanOrEqual(30.5);
    expect(box.overflowing).toBe(false);
  });

  it("l'autofit repart toujours de l'intention, pas de la taille effective", () => {
    const box = resolveTextBox(input({ sizing: { x: "fixed", y: "fixed" }, width: 400, height: 100, fontSize: 9 }), measure);
    expect(box.fontSize).toBe(20);
  });

  it("hauteur fixe + clip : police intacte, débordement signalé", () => {
    const box = resolveTextBox(input({ sizing: { x: "fixed", y: "fixed" }, overflow: "clip", width: 200, height: 30 }), measure);
    expect(box.fontSize).toBe(20);
    expect(box.height).toBe(30);
    expect(box.overflowing).toBe(true);
  });

  it("hauteur exacte du container : se comporte comme une hauteur fixe", () => {
    const box = resolveTextBox(input({ constraint: { w: 200, h: 30 } }), measure);
    expect(box.height).toBe(30);
    expect(box.fontSize).toBeLessThan(20);
  });

  it("tel que sauvegardé : largeur, police effective et hauteur stockées", () => {
    const box = resolveTextBox(input({ constraint: "as-stored", fontSize: 12, width: 120, height: 80 }), measure);
    expect(box).toEqual({ width: 120, height: 80, fontSize: 12, overflowing: false });
  });
});
