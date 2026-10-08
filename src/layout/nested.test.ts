/**
 * Containers imbriqués : un axe « contenu » est fit-content — la place vient du parent,
 * la taille du contenu, dans la même passe. Un texte au fond de l'arbre wrappe à la
 * largeur du container du dessus sans que personne ne change de mode.
 * Vrai moteur Fabric (mesure du texte via node-canvas).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CustomTextbox } from "../controls/CustomTextbox";
import { FabRect } from "../shapes/FabRect";
import { initYoga } from "./stack/engine";
import { runLayout, layoutSubtree, relayoutAncestors } from "./run";
import { StackResizeSession } from "./stack/resize-session";
import { setTextContent } from "../bindings";
import { type LayoutData } from "./types";
import { availableRoom } from "./stack/room";
import type { FabricObject } from "#fabric";
import { topLeft, scaledSize } from "./geometry";
import { layoutOf, sizingOf } from "./model";

beforeAll(async () => {
  await initYoga();
});

const LONG = "Un texte assez long pour devoir passer à la ligne plusieurs fois";
const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

function text(content: string, parentId: string, order = 0): CustomTextbox {
  return new CustomTextbox(content, {
    fontSize: 32, fontFamily: "Arial", left: 0, top: 0,
    layout: { child: { parentId, order } },
  });
}

function container(id: string, w: number, h: number, layout: LayoutData): FabRect {
  const rect = new FabRect({ left: 0, top: 0, width: w, height: h, originX: "left", originY: "top" });
  rect.set({ layerId: id, layout } as any);
  return rect;
}

/** Un parent à largeur fixe (hug-y) de 220, un enfant container en mode contenu. */
function family(childLayout: Partial<LayoutData> = {}) {
  const parent = container("p", 220, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
  const child = container("c", 50, 50, {
    sizing: { x: "hug", y: "hug" },
    container: { padding: PAD },
    child: { parentId: "p" },
    ...childLayout,
  });
  return { parent, child };
}

function right(obj: FabricObject): number { return topLeft(obj).x + scaledSize(obj).w; }
function bottom(obj: FabricObject): number { return topLeft(obj).y + scaledSize(obj).h; }

describe("container contenu dans un container à largeur fixe", () => {
  it("son texte wrappe à la largeur du parent, et rien ne dépasse", () => {
    const { parent, child } = family();
    const t = text(LONG, "c");
    runLayout([parent, child, t]);

    expect(parent.width).toBe(220);
    expect(child.width).toBeLessThanOrEqual(200);
    expect(t.width).toBeLessThanOrEqual(180);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(right(t)).toBeLessThanOrEqual(right(child) + 0.5);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
  });

  it("les hauteurs remontent dans la même passe", () => {
    const { parent, child } = family();
    const t = text(LONG, "c");
    runLayout([parent, child, t]);

    expect(child.height).toBeCloseTo(t.height + 20, 0);
    expect(parent.height).toBeCloseTo(child.height + 20, 0);
    expect(bottom(t)).toBeLessThanOrEqual(bottom(child) + 0.5);
    expect(bottom(child)).toBeLessThanOrEqual(bottom(parent) + 0.5);
  });

  it("un texte court le laisse épouser son contenu : il ne remplit pas le parent", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    runLayout([parent, child, t]);

    expect(t.textLines.length).toBe(1);
    expect(child.width).toBeCloseTo(t.naturalWidth() + 20, 0);
    expect(child.width).toBeLessThan(200);
  });

  it("une variable longue posée après coup : le texte grandit, tout reste dedans", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);
    const narrow = child.width;

    setTextContent(t, LONG);
    runLayout(objects);

    expect(child.width).toBeGreaterThan(narrow);
    expect(child.width).toBeLessThanOrEqual(200);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
    expect(bottom(child)).toBeLessThanOrEqual(bottom(parent) + 0.5);
    expect(parent.height).toBeCloseTo(child.height + 20, 0);
  });

  it("le plancher posé par les poignées de l'enfant tient", () => {
    const { parent, child } = family({ sizing: { x: "hug", y: "hug", minSize: { w: 150, h: 120 } } });
    const t = text("Court", "c");
    runLayout([parent, child, t]);

    expect(child.width).toBe(150);
    expect(child.height).toBe(120);
  });

  it("un enfant en taille fixe garde sa taille, c'est lui qui l'a demandé", () => {
    const { parent, child } = family({ sizing: { x: "fixed", y: "fixed" } });
    child.set({ width: 300, height: 40 });
    const t = text(LONG, "c");
    runLayout([parent, child, t]);

    expect(child.width).toBe(300);
    expect(child.height).toBe(40);
    expect(t.width).toBeLessThanOrEqual(280);
  });

  it("trois niveaux : le texte du fond wrappe à la largeur de la racine", () => {
    const { parent, child } = family();
    const grandchild = container("g", 50, 50, {
      sizing: { x: "hug", y: "hug" },
      container: { padding: PAD },
      child: { parentId: "c" },
    });
    const t = text(LONG, "g");
    runLayout([parent, child, grandchild, t]);

    expect(t.width).toBeLessThanOrEqual(160);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(grandchild.width).toBeCloseTo(t.width + 20, 0);
    expect(child.width).toBeCloseTo(grandchild.width + 20, 0);
    expect(parent.height).toBeCloseTo(t.height + 60, 0);
    expect(bottom(t)).toBeLessThanOrEqual(bottom(parent) + 0.5);
  });

  it("en ligne aussi : à côté d'une forme, l'enfant prend la place qui reste et son texte wrappe", () => {
    const parent = container("p", 400, 50, {
      sizing: { x: "fixed", y: "hug" },
      container: { padding: PAD, flexDirection: "row", gap: 10 },
    });
    const shape = new FabRect({ width: 100, height: 40, originX: "left", originY: "top" });
    shape.set({ layerId: "s", layout: { child: { parentId: "p", order: 0 } } } as any);
    const child = container("c", 50, 50, {
      sizing: { x: "hug", y: "hug" },
      container: { padding: PAD },
      child: { parentId: "p", order: 1 },
    });
    const t = text(LONG, "c");
    runLayout([parent, shape, child, t]);

    expect(shape.width).toBe(100);
    expect(child.width).toBeLessThanOrEqual(400 - 20 - 100 - 10 + 0.5);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
  });

  it("deux passes donnent le même résultat", () => {
    const { parent, child } = family();
    const t = text(LONG, "c");
    const objects = [parent, child, t];
    runLayout(objects);
    const snapshot = objects.map((o) => [o.left, o.top, o.width, o.height]);
    runLayout(objects);
    expect(objects.map((o) => [o.left, o.top, o.width, o.height])).toEqual(snapshot);
  });
});

describe("container imbriqué, hors runLayout", () => {
  it("layoutSubtree sur la racine met en page tout le sous-arbre", () => {
    const { parent, child } = family();
    const t = text(LONG, "c");
    const objects = [parent, child, t];
    layoutSubtree(parent, objects);

    expect(t.textLines.length).toBeGreaterThan(1);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
  });

  it("relayoutAncestors depuis l'enfant remonte jusqu'à la racine", () => {
    const { parent, child } = family();
    const t = text(LONG, "c");
    const objects = [parent, child, t];
    relayoutAncestors(child, objects);

    expect(parent.height).toBeCloseTo(child.height + 20, 0);
  });

  it("la poignée de la racine s'arrête au minimum du sous-arbre (le mot le plus long)", () => {
    const { parent, child } = family();
    const t = text("court motextrêmementlong", "c");
    const objects = [parent, child, t];
    runLayout(objects);

    const session = new StackResizeSession(parent, "mr");
    parent.set({ width: 50 });
    session.handleResizing(objects);
    expect(parent.width).toBeCloseTo(40 + t.minContentWidth(), 0);
    expect(child.width).toBeCloseTo(20 + t.minContentWidth(), 0);
    expect(t.textLines).toEqual(["court", "motextrêmementlong"]);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
  });
});

describe("les poignées d'un enfant s'arrêtent à la place du parent", () => {
  function drag(obj: FabRect, corner: string, size: { width?: number; height?: number }, objects: FabricObject[]): StackResizeSession {
    const session = new StackResizeSession(obj, corner);
    obj.set(size);
    session.handleResizing(objects);
    return session;
  }

  it("container enfant tiré au-delà d'un parent à largeur fixe : il s'arrête au bord intérieur", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);

    const session = drag(child, "mr", { width: 500 }, objects);
    expect(child.width).toBe(200);
    expect(parent.width).toBe(220);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
    session.commit(objects);
    expect(sizingOf(child).x).toBe("fixed");
  });

  it("pendant le drag, l'enfant reste dans sa case : le parent le remet en page à chaque frame", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);
    const rightBefore = right(child);

    drag(child, "ml", { width: 500, left: rightBefore - 500 }, objects);
    expect(child.width).toBe(200);
    // au trait de 1px près (strokeWidth)
    expect(Math.abs(topLeft(child).x - (topLeft(parent).x + 10))).toBeLessThanOrEqual(1);
    expect(right(child)).toBeLessThanOrEqual(right(parent) + 0.5);
    expect(parent.height).toBeCloseTo(child.height + 20, 0);
  });

  it("le plancher tiré en hauteur est écrit pendant le drag, le parent grandit avec", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);

    drag(child, "mb", { height: 300 }, objects);
    expect(child.height).toBe(300);
    expect(sizingOf(child).minSize?.h).toBe(300);
    expect(parent.height).toBe(320);
  });

  it("en ligne, les frères gardent leur place et les espacements aussi", () => {
    const parent = container("p", 400, 50, {
      sizing: { x: "fixed", y: "hug" },
      container: { padding: PAD, flexDirection: "row", gap: 10 },
    });
    const shape = new FabRect({ width: 100, height: 40, originX: "left", originY: "top" });
    shape.set({ layerId: "s", layout: { child: { parentId: "p", order: 0 } } } as any);
    const child = container("c", 50, 50, {
      sizing: { x: "hug", y: "hug" },
      container: { padding: PAD },
      child: { parentId: "p", order: 1 },
    });
    const t = text("Court", "c");
    const objects = [parent, shape, child, t];
    runLayout(objects);

    drag(child, "mr", { width: 500 }, objects);
    expect(child.width).toBe(400 - 20 - 100 - 10);
  });

  it("dans un parent contenu au sommet de l'arbre, rien n'arrête la poignée", () => {
    const parent = container("p", 50, 50, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    const child = container("c", 50, 50, {
      sizing: { x: "hug", y: "hug" }, container: { padding: PAD }, child: { parentId: "p" },
    });
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);

    drag(child, "mr", { width: 500 }, objects);
    expect(child.width).toBe(500);
  });

  it("parent contenu dans un grand-parent fixe : c'est le grand-parent qui arrête", () => {
    const grand = container("g", 300, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const parent = container("p", 50, 50, {
      sizing: { x: "hug", y: "hug" }, container: { padding: PAD }, child: { parentId: "g" },
    });
    const child = container("c", 50, 50, {
      sizing: { x: "hug", y: "hug" }, container: { padding: PAD }, child: { parentId: "p" },
    });
    const t = text("Court", "c");
    const objects = [grand, parent, child, t];
    runLayout(objects);

    drag(child, "mr", { width: 500 }, objects);
    expect(child.width).toBe(300 - 20 - 20);
  });

  it("la hauteur n'est bornée que par un parent à hauteur fixe", () => {
    const { parent, child } = family();
    const t = text("Court", "c");
    const objects = [parent, child, t];
    runLayout(objects);
    expect(availableRoom(child, objects)).toEqual({ w: 200, h: Infinity });

    const fixed = container("f", 220, 120, {
      sizing: { x: "fixed", y: "fixed" }, container: { padding: PAD, gap: 10 },
    });
    const shape = new FabRect({ width: 50, height: 30, originX: "left", originY: "top" });
    shape.set({ layerId: "s", layout: { child: { parentId: "f", order: 0 } } } as any);
    const sibling = text("Court", "f", 1);
    const all = [fixed, shape, sibling];
    runLayout(all);
    // la place en hauteur : 120 − marges 20 − le frère texte (0, il se réduit) − 1 espacement
    expect(availableRoom(shape, all)).toEqual({ w: 200, h: 90 });
  });
});
