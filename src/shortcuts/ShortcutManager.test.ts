import { describe, expect, it, vi } from "vitest";
import { ShortcutManager } from "./ShortcutManager";
import type { ShortcutEntry } from "./table";

function setup(entries: ShortcutEntry[], platform: "mac" | "other" = "mac") {
  const listeners = new Map<string, EventListener>();
  const doc = {
    addEventListener: (type: string, fn: EventListener) => { listeners.set(type, fn); },
    removeEventListener: (type: string) => { listeners.delete(type); },
  };
  const editor = { selection: { hasSelection: true } } as never;
  const manager = new ShortcutManager(editor, { entries, doc, platform });
  return { manager, listeners };
}

/** Une touche tapée quelque part : sur le canvas (target nu), dans un champ, dans un texte du canvas. */
function key(k: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {},
             where: "canvas" | "field" | "editing" = "canvas"): KeyboardEvent {
  const target = where === "canvas" ? null : {
    tagName: where === "field" ? "INPUT" : "TEXTAREA", isContentEditable: false,
    closest: (sel: string) => (where === "editing" && sel === ".canvas-container" ? {} : null),
  };
  return { key: k, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt,
           target, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe("ShortcutManager", () => {
  it("exécute l'entrée dont la combinaison répond, et consomme l'événement", async () => {
    const run = vi.fn();
    const { manager } = setup([{ id: "dup", keys: ["mod+d"], group: "edit", run }]);
    const e = key("d", { meta: true });

    expect(await manager.handle(e)).toBe(true);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ mod: true, shift: false }));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(await manager.handle(key("d"))).toBe(false);
  });

  it("plusieurs entrées sur la même touche s'exécutent toutes ; « pas pour moi » (false) ne consomme pas", async () => {
    const close = vi.fn(() => false);
    const deselect = vi.fn();
    const { manager } = setup([
      { id: "close", keys: ["Escape"], group: "view", run: close },
      { id: "deselect", keys: ["Escape"], group: "select", run: deselect },
    ]);
    const e = key("Escape");

    expect(await manager.handle(e)).toBe(true);
    expect(close).toHaveBeenCalled();
    expect(deselect).toHaveBeenCalled();

    const { manager: only } = setup([{ id: "close", keys: ["Escape"], group: "view", run: close }]);
    const e2 = key("Escape");
    expect(await only.handle(e2)).toBe(false);
    expect(e2.preventDefault).not.toHaveBeenCalled();
  });

  it("la portée : rien dans un champ, « editing » pendant la saisie d'un texte du canvas, « always » partout", async () => {
    const del = vi.fn();
    const undo = vi.fn();
    const help = vi.fn();
    const { manager } = setup([
      { id: "delete", keys: ["Backspace"], group: "edit", run: del },
      { id: "undo", keys: ["mod+z"], group: "edit", when: "editing", run: undo },
      { id: "help", keys: ["F1"], group: "view", when: "always", run: help },
    ]);

    await manager.handle(key("Backspace", {}, "field"));
    await manager.handle(key("Backspace", {}, "editing"));
    expect(del).not.toHaveBeenCalled();
    await manager.handle(key("Backspace"));
    expect(del).toHaveBeenCalledTimes(1);

    await manager.handle(key("z", { meta: true }, "editing"));
    expect(undo).toHaveBeenCalledTimes(1);
    await manager.handle(key("z", { meta: true }, "field"));
    expect(undo).toHaveBeenCalledTimes(1);

    await manager.handle(key("F1", {}, "field"));
    expect(help).toHaveBeenCalledTimes(1);
  });

  it("l'hôte enregistre ses entrées et peut les retirer ; la table reste consultable", async () => {
    const play = vi.fn();
    const { manager } = setup([{ id: "delete", keys: ["Delete", "Backspace"], group: "edit", tool: "delete", run: vi.fn() }]);
    const unregister = manager.register([{ id: "play", keys: ["Space"], group: "timeline", run: play }]);

    expect(manager.entries().map((entry) => entry.id)).toEqual(["delete", "play"]);
    expect(manager.labelFor("play")).toBe("Espace");
    expect(manager.labelFor("delete")).toBe("Suppr ou ⌫");
    expect(manager.labelForTool("delete")).toBe("Suppr ou ⌫");
    await manager.handle(key(" "));
    expect(play).toHaveBeenCalled();

    unregister();
    expect(manager.labelFor("play")).toBeNull();
  });

  it("un geste déclaré se demande par ses modificateurs, mod selon la plateforme", () => {
    const { manager } = setup([{ id: "duplicate-on-drag", gesture: "drag", modifiers: ["alt"], group: "move" },
                               { id: "zoom", gesture: "wheel", modifiers: ["mod"], group: "view" }], "other");

    expect(manager.gesture("duplicate-on-drag", key("x", { alt: true }))).toBe(true);
    expect(manager.gesture("duplicate-on-drag", key("x"))).toBe(false);
    expect(manager.gesture("zoom", key("x", { ctrl: true }))).toBe(true);
    expect(manager.gesture("zoom", key("x", { meta: true }))).toBe(false);
    expect(manager.gesture("nope", key("x", { alt: true }))).toBe(false);
  });

  it("s'abonne au document à la construction et s'en retire à dispose", () => {
    const { manager, listeners } = setup([]);
    expect(listeners.has("keydown")).toBe(true);
    manager.dispose();
    expect(listeners.has("keydown")).toBe(false);
  });
});
