/**
 * Styles mixtes : résumé d'une plage, état d'un texte hors édition, familles à charger.
 */
import { describe, it, expect } from "vitest";
import { summarizeStyles, summarizeObject, fontFamiliesOf, isBold, MIXED } from "./text-styles";

describe("summarizeStyles", () => {
  it("la valeur commune par clé, mixed sinon", () => {
    const state = summarizeStyles([
      { fontFamily: "Lato", fontWeight: 900, fontStyle: "italic", underline: false, fill: "#000" },
      { fontFamily: "Lato", fontWeight: "900", fontStyle: "normal", fill: "#000" },
    ]);
    expect(state.fontFamily).toBe("Lato");
    expect(state.fontWeight).toBe("900");
    expect(state.fontStyle).toBe(MIXED);
    expect(state.underline).toBe(false);
    expect(state.fill).toBe("#000");
  });

  it("sans déclaration, rien n'est connu", () => {
    expect(summarizeStyles([]).fontFamily).toBeUndefined();
  });
});

describe("summarizeObject", () => {
  it("les propriétés du texte, mixed là où des caractères dévient", () => {
    const state = summarizeObject(
      { fontFamily: "Inter", fontWeight: "normal", fill: "#111" },
      { 0: { 2: { fontWeight: "bold" }, 3: { fill: "#111" } } },
    );
    expect(state.fontFamily).toBe("Inter");
    expect(state.fontWeight).toBe(MIXED);
    expect(state.fill).toBe("#111");
    expect(state.underline).toBe(false);
  });
});

describe("fontFamiliesOf", () => {
  it("lit l'objet, ses styles sérialisés (plages) ou d'exécution (caractères), et les groupes", () => {
    const layers = [
      { type: "textbox", fontFamily: "Inter", styles: [{ start: 0, end: 3, style: { fontFamily: "Pacifico" } }] },
      { type: "textbox", fontFamily: "Lato", styles: { 0: { 1: { fontFamily: "VT323" }, 2: { fill: "#f00" } } } },
      { type: "group", objects: [{ type: "i-text", fontFamily: "Roboto" }] },
      { type: "rect" },
    ];
    expect(fontFamiliesOf(layers).sort()).toEqual(["Inter", "Lato", "Pacifico", "Roboto", "VT323"]);
  });
});

describe("isBold", () => {
  it("bold, ou un poids numérique à partir de 600", () => {
    expect(isBold("bold")).toBe(true);
    expect(isBold("600")).toBe(true);
    expect(isBold(900)).toBe(true);
    expect(isBold("normal")).toBe(false);
    expect(isBold("300")).toBe(false);
    expect(isBold(undefined)).toBe(false);
  });
});
