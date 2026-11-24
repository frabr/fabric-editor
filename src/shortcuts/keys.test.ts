import { describe, expect, it } from "vitest";
import { formatCombo, formatCombos, matchesCombo, parseCombo } from "./keys";

const ev = (key: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) =>
  ({ key, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt });

describe("les combinaisons", () => {
  it("se lisent : modificateurs, touche nommée ou lettre, alias", () => {
    expect(parseCombo("mod+shift+z")).toEqual({ key: "z", mod: true, shift: true, alt: false });
    expect(parseCombo("Delete")).toEqual({ key: "Delete", mod: false, shift: false, alt: false });
    expect(parseCombo("shift+arrowup")).toEqual({ key: "ArrowUp", mod: false, shift: true, alt: false });
    expect(parseCombo("Space").key).toBe(" ");
  });

  it("reconnaissent un événement, modificateurs exacts, mod selon la plateforme", () => {
    const undo = parseCombo("mod+z");
    expect(matchesCombo(undo, ev("z", { meta: true }), "mac")).toBe(true);
    expect(matchesCombo(undo, ev("Z", { meta: true, shift: true }), "mac")).toBe(false);
    expect(matchesCombo(undo, ev("z", { ctrl: true }), "mac")).toBe(false);
    expect(matchesCombo(undo, ev("z", { ctrl: true }), "other")).toBe(true);
    expect(matchesCombo(parseCombo("Delete"), ev("Delete"), "mac")).toBe(true);
    expect(matchesCombo(parseCombo("Delete"), ev("Backspace"), "mac")).toBe(false);
  });

  it("s'écrivent pour l'utilisateur selon la plateforme", () => {
    expect(formatCombo(parseCombo("mod+shift+z"), "mac")).toBe("⌘⇧Z");
    expect(formatCombo(parseCombo("mod+shift+z"), "other")).toBe("Ctrl+Shift+Z");
    expect(formatCombo(parseCombo("shift+ArrowUp"), "mac")).toBe("⇧↑");
    expect(formatCombos([parseCombo("Backspace"), parseCombo("Delete")], "mac")).toBe("⌫ ou Suppr");
    expect(formatCombo(parseCombo("Space"), "other")).toBe("Espace");
  });
});
