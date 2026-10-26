/**
 * Commandes de style d'un texte : la plage sélectionnée en édition, sinon le texte entier.
 * Vrai Textbox Fabric (mesure via node-canvas), éditeur réduit à ce que les commandes lisent.
 */
import { describe, it, expect, vi } from "vitest";
import { StyleCommands } from "./style-commands";
import { CustomTextbox } from "../controls/CustomTextbox";
import { fontFamiliesOf, MIXED } from "../text-styles";
import type { FabricEditor } from "../FabricEditor";

function setup(content = "Bonjour le monde", options: Record<string, unknown> = {}) {
  const text = new CustomTextbox(content, { fontSize: 32, fontFamily: "Arial", fill: "#000", ...options });
  const editor = {
    selection: { current: text },
    layout: { relayout: vi.fn() },
    canvas: { requestRenderAll: vi.fn(), renderAll: vi.fn() },
  } as unknown as FabricEditor;
  return { text, commands: new StyleCommands(editor), editor };
}

/** Une plage sélectionnée, comme en édition. */
function select(text: CustomTextbox, start: number, end: number): void {
  text.isEditing = true;
  text.selectionStart = start;
  text.selectionEnd = end;
}

describe("StyleCommands — texte entier", () => {
  it("hors édition, la police va sur l'objet et efface les surcharges de la même clé", () => {
    const { text, commands } = setup();
    text.setSelectionStyles({ fontFamily: "Pacifico", fill: "#f00" }, 0, 3);

    commands.changeFont("Lato", "900");

    expect(text.fontFamily).toBe("Lato");
    expect(text.fontWeight).toBe("900");
    expect(text.getSelectionStyles(0, 1, true)[0].fontFamily).toBe("Lato");
    // La couleur par caractère, elle, reste
    expect(text.getSelectionStyles(0, 1, true)[0].fill).toBe("#f00");
  });

  it("au curseur (pas de plage), le réglage vaut aussi pour tout le texte", () => {
    const { text, commands } = setup();
    select(text, 4, 4);
    commands.toggleTextStyle("italic");
    expect(text.fontStyle).toBe("italic");
  });

  it("la taille efface les tailles par caractère d'un vieux document", () => {
    const { text, commands } = setup();
    text.setSelectionStyles({ fontSize: 12 }, 0, 2);
    commands.setFontSize(40);
    expect(text.fontSize).toBe(40);
    expect(text.styles).toEqual({});
  });
});

describe("StyleCommands — plage sélectionnée", () => {
  it("la police ne touche que la plage", () => {
    const { text, commands, editor } = setup();
    select(text, 0, 7);
    commands.changeFont("Pacifico");

    expect(text.fontFamily).toBe("Arial");
    expect(text.getSelectionStyles(0, 7, true).every((s) => s.fontFamily === "Pacifico")).toBe(true);
    expect(text.getSelectionStyles(8, 16, true).every((s) => s.fontFamily === "Arial")).toBe(true);
    expect(editor.layout.relayout).toHaveBeenCalled();
  });

  it("une plage qui couvre tout le texte remonte sur l'objet", () => {
    const { text, commands } = setup("Bonjour");
    select(text, 0, 7);
    commands.changeFont("Pacifico");
    expect(text.fontFamily).toBe("Pacifico");
    expect(text.styles).toEqual({});
  });

  it("le gras sur une plage mixte met tout en gras, puis l'enlève", () => {
    const { text, commands } = setup();
    text.setSelectionStyles({ fontWeight: "bold" }, 0, 3);
    select(text, 0, 7);

    expect(commands.textStyle()?.fontWeight).toBe(MIXED);
    commands.toggleTextStyle("bold");
    expect(text.getSelectionStyles(0, 7, true).every((s) => s.fontWeight === "bold")).toBe(true);
    expect(commands.textStyle()?.fontWeight).toBe("bold");

    commands.toggleTextStyle("bold");
    expect(text.getSelectionStyles(0, 7, true).every((s) => s.fontWeight === "normal")).toBe(true);
  });

  it("le remplissage du panneau suit la plage aussi, et ne touche jamais l'opacité du texte", () => {
    const { text, commands } = setup("Bonjour", { opacity: 0.5 });
    select(text, 0, 3);
    commands.setFillColor("rgba(255,0,0,0.5)");
    expect(text.fill).toBe("#000");
    expect(text.opacity).toBe(0.5);
    expect(text.getSelectionStyles(0, 3, true).every((s) => s.fill === "rgba(255,0,0,0.5)")).toBe(true);

    // Le texte entier : l'opacité est un réglage à part (changeOpacity), la couleur la laisse
    text.isEditing = false;
    commands.setFillColor("#00f");
    expect(text.fill).toBe("#00f");
    expect(text.opacity).toBe(0.5);
    expect(text.styles).toEqual({});
  });

  it("la couleur d'un texte suit la plage", () => {
    const { text, commands } = setup();
    select(text, 8, 10);
    commands.changeColor("#f00");
    expect(text.fill).toBe("#000");
    expect(text.getSelectionStyles(8, 10, true).every((s) => s.fill === "#f00")).toBe(true);
  });

  it("les styles d'une plage traversent la sérialisation, familles comprises", () => {
    const { text, commands } = setup();
    select(text, 0, 3);
    commands.changeFont("Pacifico", "normal");

    const data = text.toObject();
    expect(fontFamiliesOf([data]).sort()).toEqual(["Arial", "Pacifico"]);
  });
});

describe("StyleCommands — textStyle", () => {
  it("hors édition : l'objet, mixed là où des caractères dévient", () => {
    const { text, commands } = setup();
    text.setSelectionStyles({ fontStyle: "italic" }, 0, 2);
    const state = commands.textStyle()!;
    expect(state.fontFamily).toBe("Arial");
    expect(state.fontStyle).toBe(MIXED);
    expect(state.underline).toBe(false);
  });

  it("au curseur : le caractère qui précède", () => {
    const { text, commands } = setup();
    text.setSelectionStyles({ fontFamily: "Pacifico" }, 0, 3);
    select(text, 3, 3);
    expect(commands.textStyle()?.fontFamily).toBe("Pacifico");
    select(text, 4, 4);
    expect(commands.textStyle()?.fontFamily).toBe("Arial");
  });

  it("rien quand la sélection n'est pas un texte", () => {
    const { commands, editor } = setup();
    (editor.selection as { current: unknown }).current = null;
    expect(commands.textStyle()).toBeNull();
  });
});
