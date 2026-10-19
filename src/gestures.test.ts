import { describe, expect, it, vi } from "vitest";
import { Rect } from "#fabric";
import { GestureManager, ROTATION_STEP } from "./gestures";
import { ShortcutManager } from "./shortcuts/ShortcutManager";
import { CANVAS_SHORTCUTS } from "./shortcuts/table";

function setup() {
  const handlers = new Map<string, (e: unknown) => void>();
  const fabricCanvas = { _currentTransform: {} as unknown };
  const canvas = {
    on: (name: string, fn: (e: unknown) => void) => handlers.set(name, fn), off: vi.fn(),
    remove: vi.fn(), requestRenderAll: vi.fn(), originalFabricCanvas: fabricCanvas,
  };
  const target = new Rect({ left: 100, top: 100, width: 50, height: 50 });
  const clones = [new Rect({ left: 100, top: 100, width: 50, height: 50 })];
  const editor = {
    canvas, layout: { rollbackExternalDrag: vi.fn() }, selection: { selected: [target], hasSelection: true },
    cloneInPlace: vi.fn(async () => clones),
  } as never;
  const shortcuts = new ShortcutManager(editor, { entries: CANVAS_SHORTCUTS, doc: { addEventListener() {}, removeEventListener() {} }, platform: "mac" });
  (editor as { shortcuts: ShortcutManager }).shortcuts = shortcuts;
  const gestures = new GestureManager(editor);
  const mouse = (mods: Partial<{ alt: boolean; shift: boolean }> = {}) =>
    ({ altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: false, ctrlKey: false }) as MouseEvent;
  const begin = (action: string, mods = {}) => {
    const transform = { action, target, original: { left: target.left, top: target.top }, actionPerformed: true };
    handlers.get("before:transform")!({ e: mouse(mods), transform });
    return transform;
  };
  return { gestures, handlers, target, clones, canvas, editor, fabricCanvas, mouse, begin };
}

describe("GestureManager", () => {
  it("⇧ pendant un glisser tient l'axe dominant depuis le départ", () => {
    const { handlers, target, mouse, begin } = setup();
    const transform = begin("drag");

    target.set({ left: 140, top: 110 });
    handlers.get("object:moving")!({ e: mouse({ shift: true }), transform, target });
    expect([target.left, target.top]).toEqual([140, 100]);

    target.set({ left: 103, top: 160 });
    handlers.get("object:moving")!({ e: mouse({ shift: true }), transform, target });
    expect([target.left, target.top]).toEqual([100, 160]);

    target.set({ left: 130, top: 130 });
    handlers.get("object:moving")!({ e: mouse(), transform, target });
    expect([target.left, target.top]).toEqual([130, 130]);
  });

  it("la rotation va au cran de 15°, ⇧ la libère, et l'objet retrouve son réglage après", () => {
    const { handlers, target, mouse, begin } = setup();
    begin("rotate");
    expect(target.get("snapAngle")).toBe(ROTATION_STEP);

    handlers.get("object:rotating")!({ e: mouse({ shift: true }), target });
    expect(target.get("snapAngle")).toBe(0);
    handlers.get("object:rotating")!({ e: mouse(), target });
    expect(target.get("snapAngle")).toBe(ROTATION_STEP);

    handlers.get("mouse:up")!({});
    expect(target.get("snapAngle")).toBeUndefined();
  });

  it("⌥ au départ d'un glisser laisse une copie en place", async () => {
    const { editor, target, begin, gestures } = setup();
    begin("drag", { alt: true });
    await Promise.resolve();

    expect((editor as { cloneInPlace: unknown }).cloneInPlace).toHaveBeenCalledWith([target]);
    expect(gestures.active).toBe(true);
  });

  it("Échap pendant un geste remet tout en place, efface la copie, rend la pile, et termine le geste fabric", async () => {
    const { gestures, target, clones, canvas, editor, fabricCanvas, begin } = setup();
    const transform = begin("drag", { alt: true });
    await Promise.resolve();
    target.set({ left: 300, top: 250, angle: 20, scaleX: 2 });

    expect(gestures.cancel()).toBe(true);

    expect([target.left, target.top, target.angle, target.scaleX]).toEqual([100, 100, 0, 1]);
    expect(canvas.remove).toHaveBeenCalledWith(clones[0]);
    expect((editor as { layout: { rollbackExternalDrag: unknown } }).layout.rollbackExternalDrag).toHaveBeenCalled();
    expect(transform.actionPerformed).toBe(false);
    expect(fabricCanvas._currentTransform).toBeNull();
    expect(gestures.active).toBe(false);
    expect(gestures.cancel()).toBe(false);
  });

  it("Échap : la table annule le geste et ne désélectionne pas ; sans geste, elle désélectionne", async () => {
    const { editor, begin } = setup();
    const e = (editor as { shortcuts: ShortcutManager });
    const deselect = vi.fn();
    (editor as { deselect: unknown }).deselect = deselect;
    (editor as { gestures: GestureManager }).gestures = new GestureManager(editor);
    const esc = { key: "Escape", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: null, preventDefault: vi.fn() } as unknown as KeyboardEvent;

    begin("drag");
    await e.shortcuts.handle(esc);
    expect(deselect).not.toHaveBeenCalled();

    await e.shortcuts.handle(esc);
    expect(deselect).toHaveBeenCalledTimes(1);
  });
});
