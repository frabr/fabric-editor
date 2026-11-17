/**
 * Textes à personnaliser : détection, auteur / utilisateur final, verrou, rendu, outils.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { StaticCanvas, Textbox, type Canvas, type FabricObject } from "#fabric";
import { isUserText, isUserOwnedText, requestUserText, releaseUserText, resolveUserText } from "./userTexts";
import { collectUserInputs } from "./userInputs";
import { USER_SLOT_STYLE_KEY } from "./userSlots";
import { bindingBadgeLabel } from "./bindings";
import { LayerManager } from "./LayerManager";
import { CustomTextbox } from "./controls/CustomTextbox";
import { FabRect } from "./shapes/FabRect";
import { applyLockMode } from "./locking";
import { toolsFor } from "./tools";

const USER_TEXT = { text: { scope: "user" } };

function userText(text = "Ville"): CustomTextbox {
  const obj = new CustomTextbox(text, { left: 200, top: 100, fontSize: 32 });
  obj.set({ layerId: "city", bindings: USER_TEXT });
  return obj;
}

function managerWith(objects: FabricObject[]): LayerManager {
  const list = [...objects];
  const canvas = {
    getObjects: () => list,
    add: vi.fn((obj: FabricObject) => list.push(obj)),
    setActiveObject: vi.fn(),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
  } as unknown as Canvas;
  return new LayerManager(canvas as any);
}

/** Une frappe : Fabric reporte le textarea caché dans le texte (simulé). */
function type(obj: CustomTextbox, text: string, { authoring = false } = {}): void {
  (obj as any).canvas = { [USER_SLOT_STYLE_KEY]: { color: "#7c3aed", authoring } };
  vi.spyOn(Textbox.prototype, "onInput").mockImplementation(function (this: Textbox) {
    this.text = text;
  });
  obj.onInput(new Event("input"));
}

afterEach(() => vi.restoreAllMocks());

describe("détection", () => {
  it("un binding text de scope user en attente", () => {
    expect(isUserText(userText())).toBe(true);
  });

  it("ni un texte lié à une expression, ni un texte déjà personnalisé", () => {
    const bound = userText();
    bound.set({ bindings: { text: { expr: "$VILLE", scope: "company" } } });
    const done = userText();
    done.set({ bindings: resolveUserText(USER_TEXT) });
    expect(isUserText(bound)).toBe(false);
    expect(isUserText(done)).toBe(false);
    expect(isUserOwnedText(done)).toBe(true);
  });

  it("collectUserInputs le rend comme une entrée de sorte text, à côté des images", () => {
    const slot = new FabRect({ width: 100, height: 60 });
    slot.set({ layerId: "photo", bindings: { "image.src": { scope: "user", hint: "Photo" } } });
    const inputs = collectUserInputs([userText(), new FabRect({ width: 10, height: 10 }), slot]);
    expect(inputs.map(({ layerId, kind, hint }) => [layerId, kind, hint])).toEqual([
      ["city", "text", ""],
      ["photo", "image", "Photo"],
    ]);
  });

  it("le badge dit « à personnaliser », dans la traduction de l'hôte", () => {
    expect(bindingBadgeLabel(userText())).toBe("À personnaliser");
    expect(bindingBadgeLabel(userText(), { userText: "To customise" })).toBe("To customise");
  });
});

describe("donner et reprendre", () => {
  it("un texte lié cesse de l'être, ses autres bindings restent", () => {
    const bindings = requestUserText({ text: { expr: "$VILLE", scope: "company" }, visible: { expr: "$PRIX > 0" } });
    expect(bindings).toEqual({ text: { scope: "user" }, visible: { expr: "$PRIX > 0" } });
  });

  it("reprendre retire le binding, et laisse un texte lié tranquille", () => {
    expect(releaseUserText(USER_TEXT)).toEqual({});
    const bound = { text: { expr: "$VILLE", scope: "company" } };
    expect(releaseUserText(bound)).toEqual(bound);
  });

  it("setUserText pose et retire sur un texte, refuse une forme", () => {
    const text = new CustomTextbox("Ville");
    const layers = managerWith([text]);
    layers.setUserText(text);
    expect(isUserText(text)).toBe(true);
    layers.setUserText(text, false);
    expect(isUserOwnedText(text)).toBe(false);
    expect(layers.setUserText(new FabRect({ width: 10, height: 10 }))).toBeNull();
  });
});

describe("taper dedans", () => {
  it("l'utilisateur final le personnalise : le binding reste, réglé", () => {
    const obj = userText();
    type(obj, "Lyon");
    expect(isUserText(obj)).toBe(false);
    expect(obj.get("bindings")).toEqual({ text: { scope: "user", resolved: true } });
  });

  it("l'auteur écrit l'exemple : le texte reste à personnaliser", () => {
    const obj = userText();
    type(obj, "Votre ville", { authoring: true });
    expect(isUserText(obj)).toBe(true);
  });

  it("une frappe qui ne change rien ne règle rien", () => {
    const obj = userText();
    type(obj, "Ville");
    expect(isUserText(obj)).toBe(true);
  });
});

describe("verrou", () => {
  it("verrou total : un texte à personnaliser reste éditable, avant comme après", () => {
    const pending = userText();
    applyLockMode(pending, "full");
    expect(pending.editable).toBe(true);

    const done = userText();
    done.set({ bindings: resolveUserText(USER_TEXT) });
    applyLockMode(done, "full");
    expect(done.editable).toBe(true);

    const plain = new CustomTextbox("Titre");
    applyLockMode(plain, "full");
    expect(plain.editable).toBe(false);
  });

  it("au chargement, les bindings sont là quand le verrou se pose", async () => {
    const data = { ...userText().toObject(["layerId", "bindings"]), lockMode: "full" };
    const [loaded] = await managerWith([]).deserializeAll([data as any]);
    expect((loaded as CustomTextbox).editable).toBe(true);
    expect(isUserText(loaded!)).toBe(true);
  });
});

describe("rendu", () => {
  it("en attente : un liseré pointillé dans la couleur d'édition, parti une fois personnalisé", () => {
    const canvas = new StaticCanvas(undefined, { width: 400, height: 200 });
    (canvas as any)[USER_SLOT_STYLE_KEY] = { color: "#7c3aed" };
    const obj = userText();
    obj.set({ objectCaching: false });
    canvas.add(obj);
    const ctx = canvas.getContext();
    const strokeRect = vi.spyOn(ctx, "strokeRect");
    const colors: unknown[] = [];
    strokeRect.mockImplementation(() => void colors.push(ctx.strokeStyle));
    canvas.renderAll();
    expect(strokeRect).toHaveBeenCalledTimes(1);
    expect(colors).toEqual(["#7c3aed"]);
    const [x, y, w, h] = strokeRect.mock.calls[0];
    expect([x, y, w, h]).toEqual([-obj.width / 2, -obj.height / 2, obj.width, obj.height]);

    strokeRect.mockClear();
    obj.set({ bindings: resolveUserText(USER_TEXT) });
    canvas.renderAll();
    expect(strokeRect).not.toHaveBeenCalled();
  });
});

describe("outils", () => {
  it("l'outil userText : sur un texte, si l'hôte le propose", () => {
    const text = new CustomTextbox("Ville");
    expect(toolsFor([text], ["userText", "delete"])).toEqual(["userText", "delete"]);
    expect(toolsFor([text], ["delete"])).toEqual(["delete"]);
    expect(toolsFor([new FabRect({ width: 10, height: 10 })], ["userText"])).toEqual([]);
  });
});
