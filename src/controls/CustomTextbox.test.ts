/**
 * Texte : modes de taille, autofit, données legacy, et texte dans un container.
 * Vrai moteur Fabric (mesure du texte via node-canvas).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CustomTextbox } from "./CustomTextbox";
import { setTextContent } from "../bindings";
import { FabRect } from "../shapes/FabRect";
import { initYoga } from "../layout/stack/engine";
import { runLayout } from "../layout/run";
import { migrateLegacyLayout } from "../layout/legacy";
import { StackResizeSession } from "../layout/stack/resize-session";
import type { LayoutData } from "../layout/types";
import { detachChild } from "../layout/model";
import { setShapeSize } from "../layout/geometry";

beforeAll(async () => {
  await initYoga();
});

const LONG = "Un texte assez long pour devoir passer à la ligne plusieurs fois";

function text(content: string, options: Record<string, unknown> = {}): CustomTextbox {
  return new CustomTextbox(content, { fontSize: 32, fontFamily: "Arial", left: 0, top: 0, ...options });
}

function layoutOf(obj: { get(key: string): unknown }): LayoutData {
  return obj.get("layout") as LayoutData;
}

function container(id: string, w: number, h: number, layout: LayoutData): FabRect {
  const rect = new FabRect({ left: 0, top: 0, width: w, height: h, originX: "left", originY: "top" });
  rect.set({ layerId: id, layout } as any);
  return rect;
}

const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

describe("CustomTextbox — édition", () => {
  it("pas de glisser-déposer du texte sélectionné : presser sur la plage ne bloque pas le clic", () => {
    const t = text("Bonjour le monde");
    t.isEditing = true;
    t.selectionStart = 0;
    t.selectionEnd = 7;
    expect(t.draggableTextDelegate.start({} as MouseEvent)).toBe(false);
    expect(t.shouldStartDragging()).toBe(false);
  });
});

describe("CustomTextbox — tokens atomiques", () => {
  /** « Prix : $P €\nfin » — le token $P en index plats [7, 9). */
  function bound(): CustomTextbox {
    const t = text("Prix : $P €\nfin");
    t.tokenSpans = [[7, 9]];
    t.isEditing = true;
    return t;
  }

  /** Une touche, telle que Fabric la lit (node : pas de KeyboardEvent). */
  const key = (name: string) => ({ key: name, keyCode: 0 }) as unknown as KeyboardEvent;

  function move(t: CustomTextbox, start: number, end = start): void {
    t.selectionStart = start;
    t.selectionEnd = end;
    t._fireSelectionChanged();
  }

  it("les plages atomiques en index du texte : les retours à la ligne ne comptent pas", () => {
    const t = bound();
    expect(t.atomicSpans()).toEqual([[7, 9]]);
    t.tokenSpans = [[11, 14]];
    expect(t.atomicSpans()).toEqual([[12, 15]]);
  });

  it("un pas vers la droite saute le token ; vers la gauche aussi", () => {
    const t = bound();
    move(t, 7);
    move(t, 8);
    expect([t.selectionStart, t.selectionEnd]).toEqual([9, 9]);
    move(t, 8);
    expect([t.selectionStart, t.selectionEnd]).toEqual([7, 7]);
  });

  it("une plage qui coupe un token s'étend à ses bornes", () => {
    const t = bound();
    move(t, 3, 8);
    expect([t.selectionStart, t.selectionEnd]).toEqual([3, 9]);
    move(t, 8, 11);
    expect([t.selectionStart, t.selectionEnd]).toEqual([7, 11]);
  });

  it("la pastille couvre les glyphes, pas l'interligne : elle reste dans sa ligne", () => {
    const t = text("Prix $P", { lineHeight: 2 });
    t.tokenSpans = [[5, 7]];
    const [box] = (t as unknown as { _tokenBoxes(a: number, b: number): { y: number; h: number }[] })._tokenBoxes(5, 7);
    const lineTop = -t.height / 2;
    expect(box.y).toBeGreaterThanOrEqual(lineTop);
    expect(box.y + box.h).toBeLessThanOrEqual(lineTop + t.getHeightOfLine(0) / t.lineHeight + 0.01);
  });

  it("retour arrière juste après le token le sélectionne entier, avant la suppression native", () => {
    const t = bound();
    t.selectionStart = t.selectionEnd = 9;
    t.onKeyDown(key("Backspace"));
    expect([t.selectionStart, t.selectionEnd]).toEqual([7, 9]);
  });

  it("Suppr juste avant le token aussi ; ailleurs, rien ne change", () => {
    const t = bound();
    t.selectionStart = t.selectionEnd = 7;
    t.onKeyDown(key("Delete"));
    expect([t.selectionStart, t.selectionEnd]).toEqual([7, 9]);

    t.selectionStart = t.selectionEnd = 3;
    t.onKeyDown(key("Backspace"));
    expect([t.selectionStart, t.selectionEnd]).toEqual([3, 3]);
  });
});

describe("CustomTextbox — modes de taille", () => {
  it("un nouveau texte est en largeur et hauteur contenu, sur une ligne", () => {
    const t = text("Bonjour");
    expect(t.sizing).toEqual({ x: "hug", y: "hug" });
    expect(t.width).toBe(t.naturalWidth());
    expect(t.textLines.length).toBe(1);
  });

  it("en largeur contenu, la boîte suit le texte quand il s'allonge", () => {
    const t = text("Court");
    const before = t.width;
    t.set({ text: "Beaucoup plus long" });
    expect(t.width).toBeGreaterThan(before);
  });

  it("en largeur fixe, le texte wrappe", () => {
    const t = text(LONG);
    t.setSizing({ x: "fixed", y: "hug" });
    t.set({ width: 200 });
    expect(t.width).toBe(200);
    expect(t.textLines.length).toBeGreaterThan(1);
  });

  it("le minimum de hauteur agrandit la boîte, jamais sous le contenu", () => {
    const t = text("Bonjour");
    const contentH = t.height;
    t.setSizing({ x: "hug", y: "hug", minSize: { w: 0, h: contentH + 100 } });
    expect(t.height).toBe(contentH + 100);
    t.setSizing({ x: "hug", y: "hug", minSize: { w: 0, h: 5 } });
    expect(t.height).toBe(contentH);
  });
});

describe("CustomTextbox — largeur minimale", () => {
  it("le graphème le plus large (un mot se découpe), et la boîte ne bouge pas", () => {
    const t = text("court motextrêmementlong");
    const letter = t.set({ text: "m" }).naturalWidth();
    t.set({ text: "court motextrêmementlong" });
    t.setSizing({ x: "fixed", y: "hug" });
    t.set({ width: 180 });
    const lines = [...t.textLines];
    expect(lines.length).toBeGreaterThan(2);

    expect(t.minContentWidth()).toBeCloseTo(letter, -1);
    expect(t.minContentWidth()).toBeLessThan(60);
    expect(t.width).toBe(180);
    expect(t.textLines).toEqual(lines);
  });

  it("une boîte plus étroite que le mot le plus long le découpe, lettre par lettre au besoin", () => {
    const t = text("Supercalifragilistic");
    t.setSizing({ x: "fixed", y: "hug" });
    t.set({ width: 60 });
    expect(t.width).toBe(60);
    expect(t.textLines.length).toBeGreaterThan(3);
    expect(t.textLines.join("")).toBe("Supercalifragilistic");
  });
});

describe("CustomTextbox — débordement", () => {
  function fixedBox(overflow?: "shrink" | "clip" | "visible"): CustomTextbox {
    const t = text(LONG, { width: 200 });
    t.setSizing({ x: "fixed", y: "fixed" });
    if (overflow) t.setTextOverflow(overflow);
    t.set({ height: 60 });
    t.initDimensions();
    return t;
  }

  it("shrink (défaut) : la police baisse jusqu'à tenir, la boîte ne bouge pas", () => {
    const t = fixedBox();
    expect(t.height).toBe(60);
    expect(t.fontSize).toBeLessThan(32);
    expect(t.calcTextHeight()).toBeLessThanOrEqual(60.5);
    expect(t.fontSizeIntent).toBe(32);
  });

  it("l'intention est sauvegardée à côté de la taille effective, et l'autofit en repart", () => {
    const t = fixedBox();
    const json = t.toObject() as Record<string, unknown>;
    expect(json.fontSize).toBe(t.fontSize);
    expect(json.fontSizeIntent).toBe(32);

    t.set({ text: "Court" });
    expect(t.fontSize).toBe(32);
  });

  it("une taille posée via set() devient la nouvelle intention", () => {
    const t = fixedBox();
    t.set({ fontSize: 20 });
    expect(t.fontSizeIntent).toBe(20);
  });

  it("clip : la police ne bouge pas, le texte déborde de la boîte", () => {
    const t = fixedBox("clip");
    expect(t.fontSize).toBe(32);
    expect(t.height).toBe(60);
    expect(t._overflowing).toBe(true);
  });

  it("visible : pas de cache (il couperait le débordement)", () => {
    const t = fixedBox("visible");
    expect(t._overflowing).toBe(true);
    expect(t.objectCaching).toBe(false);
  });
});

describe("CustomTextbox — documents d'avant les modes de taille", () => {
  it("une boîte qui épouse le texte sur une ligne → largeur contenu", () => {
    const natural = text("Bonjour").width;
    const t = text("Bonjour", { width: natural });
    expect(t.sizing.x).toBe("hug");
  });

  it("une boîte plus étroite que le texte (il wrappe) → largeur fixe", () => {
    const t = text(LONG, { width: 200 });
    expect(t.sizing.x).toBe("fixed");
    expect(t.width).toBe(200);
  });

  it("un texte enfant de container → largeur contenu", () => {
    const t = text(LONG, { width: 200, layout: { child: { parentId: "c" } } });
    expect(t.sizing.x).toBe("hug");
  });

  it("le scale est ramené dans la largeur et la police", () => {
    const t = text(LONG, { width: 200, scaleX: 2, scaleY: 2 });
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
    expect(t.width).toBe(400);
    expect(t.fontSize).toBe(64);
    expect(t.fontSizeIntent).toBe(64);
  });

  it("migre container.sizeMode / minSize vers layout.sizing", () => {
    const legacy = {
      container: { sizeMode: { x: "fixed", y: "hug" }, minSize: { w: 10, h: 20 }, gap: 4 },
    } as unknown as LayoutData;
    expect(migrateLegacyLayout(legacy)).toEqual({
      sizing: { x: "fixed", y: "hug", minSize: { w: 10, h: 20 } },
      container: { gap: 4 },
    });
    expect(migrateLegacyLayout(migrateLegacyLayout(legacy)!)).toBeNull();
  });
});

describe("Texte dans un container", () => {
  it("container contenu + texte en largeur fixe : le container épouse la largeur du texte", () => {
    const c = container("c", 50, 50, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { layout: { child: { parentId: "c" } } });
    t.setSizing({ x: "fixed", y: "hug" });
    t.set({ width: 200 });
    runLayout([c, t]);
    expect(c.width).toBe(220);
    expect(t.textLines.length).toBeGreaterThan(1);
  });

  it("container en largeur fixe + texte en largeur contenu : le texte wrappe au bord", () => {
    const c = container("c", 220, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { layout: { child: { parentId: "c" } } });
    runLayout([c, t]);
    expect(c.width).toBe(220);
    expect(t.width).toBeLessThanOrEqual(200);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(c.height).toBeCloseTo(t.height + 20, 0);
  });

  it("container en largeur fixe + texte en largeur fixe plus large : le container pousse le texte", () => {
    const c = container("c", 220, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { width: 500, layout: { child: { parentId: "c" } } });
    t.setSizing({ x: "fixed", y: "hug" });
    t.set({ width: 500 });
    runLayout([c, t]);
    expect(t.width).toBeLessThanOrEqual(200);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(c.height).toBeCloseTo(t.height + 20, 0);
  });

  it("place insuffisante en ligne : la forme garde sa taille, seul le texte cède (il wrappe)", () => {
    const c = container("c", 300, 50, {
      sizing: { x: "fixed", y: "hug" },
      container: { padding: PAD, flexDirection: "row", gap: 10 },
    });
    const shape = new FabRect({ width: 150, height: 40, originX: "left", originY: "top" });
    shape.set({ layerId: "s", layout: { child: { parentId: "c", order: 0 } } } as any);
    const t = text(LONG, { layout: { child: { parentId: "c", order: 1 } } });
    runLayout([c, shape, t]);
    expect(shape.width).toBe(150);
    expect(t.width).toBeLessThanOrEqual(300 - 20 - 150 - 10 + 0.5);
    expect(t.textLines.length).toBeGreaterThan(1);
  });

  it("container fixe × fixe : deux textes se partagent la place et se réduisent chacun", () => {
    const c = container("c", 220, 120, {
      sizing: { x: "fixed", y: "fixed" },
      container: { padding: PAD, gap: 0 },
    });
    const t1 = text(LONG, { layout: { child: { parentId: "c", order: 0 } } });
    const t2 = text(LONG, { layout: { child: { parentId: "c", order: 1 } } });
    runLayout([c, t1, t2]);
    expect(c.height).toBe(120);
    expect(t1.fontSize).toBeLessThan(32);
    expect(t2.fontSize).toBeLessThan(32);
    expect(t1.height + t2.height).toBeLessThanOrEqual(100.5);
  });

  it("container contenu : le texte ne reçoit aucune boîte imposée, ses poignées le pilotent", () => {
    const c = container("c", 50, 50, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { originX: "left", originY: "top", layout: { child: { parentId: "c" } } });
    runLayout([c, t]);
    // Pas d'arrondi Yoga : la taille mesurée revient telle quelle, rien n'est imposé
    expect(t._constraint?.w).toBeUndefined();
    expect(t._constraint?.h).toBeUndefined();

    const transform = { target: t, corner: "mr", originX: "left", originY: "top" } as any;
    t.handleEdgeResize(transform, t.left + 200, t.top);
    runLayout([c, t]);
    expect(Math.abs(t.width - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.width - (t.width + 20))).toBeLessThanOrEqual(0.5);
  });

  it("un enfant chargé sans relayout s'affiche tel que sauvegardé (même en largeur contenu)", () => {
    const t = text(LONG, { width: 200, layout: { sizing: { x: "hug", y: "hug" }, child: { parentId: "c" } } });
    expect(t.width).toBe(200);
    expect(t.textLines.length).toBeGreaterThan(1);
  });

  it("le recalcul de Fabric hors passe (sortie d'édition, rendu) garde la contrainte du container", () => {
    const c = container("c", 220, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { layout: { child: { parentId: "c" } } });
    runLayout([c, t]);
    const lines = t.textLines.length;
    t.initDimensions();
    expect(t.width).toBeLessThanOrEqual(200);
    expect(t.textLines.length).toBe(lines);
  });

  it("un texte recalculé par le layout invalide son cache de rendu", () => {
    // 320 : pas 220, dont la place intérieure (200) est la largeur par défaut d'une Textbox
    const c = container("c", 320, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { layout: { child: { parentId: "c" } } });
    t.dirty = false;
    runLayout([c, t]);
    expect(t.dirty).toBe(true);
  });

  it("un enfant chargé sans relayout garde sa taille effective sauvegardée", () => {
    const t = text(LONG, { fontSize: 18, fontSizeIntent: 32, layout: { child: { parentId: "c" } } });
    expect(t.fontSize).toBe(18);
    expect(t.fontSizeIntent).toBe(32);
  });

  it("un texte sorti de son container lâche la boîte imposée", () => {
    const c = container("c", 220, 50, { sizing: { x: "fixed", y: "hug" }, container: { padding: PAD } });
    const t = text(LONG, { layout: { child: { parentId: "c" } } });
    runLayout([c, t]);
    expect(t.textLines.length).toBeGreaterThan(1);

    detachChild(t);
    expect(t._constraint).toBeUndefined();
    expect(t.textLines.length).toBe(1);
  });
});

describe("StackResizeSession — poignées des containers", () => {
  it("tirer un bord gauche/droit fixe la largeur", () => {
    const c = container("c", 100, 50, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    new StackResizeSession(c, "mr");
    expect(layoutOf(c).sizing!.x).toBe("fixed");
    expect(layoutOf(c).sizing!.y).toBe("hug");
  });

  it("tirer le bas d'une hauteur contenu pose un minimum, le mode ne change pas", () => {
    const c = container("c", 100, 50, { sizing: { x: "hug", y: "hug" }, container: { padding: PAD } });
    const session = new StackResizeSession(c, "mb");
    c.set({ height: 300 });
    session.handleResizing([c]);
    expect(layoutOf(c).sizing).toEqual({ x: "hug", y: "hug", minSize: { w: 0, h: 300 } });
  });
});

describe("CustomTextbox — poignées", () => {
  // Fabric retire le stroke (1px) de la taille tirée, comme sa poignée native.

  /** Handle drag with the opposite edge anchored at the scene origin (top-left). */
  function drag(t: CustomTextbox, corner: string, x: number, y: number): void {
    t.set({ originX: "left", originY: "top", left: 0, top: 0 });
    const transform = { target: t, corner, originX: "left", originY: "top" } as any;
    if (corner.length === 2 && corner[0] === "m") t.handleEdgeResize(transform, x, y);
    else t.handleCornerResize(transform, x, y);
  }

  it("bord droit : la largeur passe en fixe, le texte wrappe, sans aucun scale", () => {
    const t = text(LONG);
    drag(t, "mr", 150, 0);
    expect(t.sizing.x).toBe("fixed");
    expect(Math.abs(t.width - 150)).toBeLessThanOrEqual(1);
    expect(t.textLines.length).toBeGreaterThan(1);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it("bord bas en hauteur contenu : pose le minimum, le mode ne change pas", () => {
    const t = text("Bonjour");
    drag(t, "mb", 0, 300);
    expect(t.sizing.y).toBe("hug");
    expect(Math.abs((t.sizing.minSize?.h ?? 0) - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.height - 300)).toBeLessThanOrEqual(1);
    expect(t.fontSize).toBe(32);
  });

  it("bord bas en hauteur fixe : change la hauteur", () => {
    const t = text("Bonjour", { width: 300 });
    t.setSizing({ x: "fixed", y: "fixed" });
    drag(t, "mb", 0, 250);
    expect(t.sizing.y).toBe("fixed");
    expect(t.sizing.minSize).toBeUndefined();
    expect(Math.abs(t.height - 250)).toBeLessThanOrEqual(1);
  });

  /** Le coin bas-droit tiré au facteur k : la boîte de Fabric compte le contour (1 px). */
  function corner(t: CustomTextbox, k: number) {
    return { x: (t.width + t.strokeWidth) * k, y: (t.height + t.strokeWidth) * k };
  }

  it("coin : le texte et sa boîte grandissent ensemble, proportions gardées, sans scale ni changement de mode", () => {
    const t = text("Bonjour");
    const { width, height } = t;
    const { x, y } = corner(t, 2);
    drag(t, "br", x, y);
    expect(t.fontSize).toBe(64);
    expect(t.fontSizeIntent).toBe(64);
    expect(t.sizing).toEqual({ x: "hug", y: "hug" });
    expect(Math.abs(t.width - 2 * width)).toBeLessThanOrEqual(2);
    expect(Math.abs(t.height - 2 * height)).toBeLessThanOrEqual(2);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it("coin : la police par caractère suit", () => {
    const t = text("Bonjour", { styles: { 0: { 0: { fontSize: 16 } } } });
    const { x, y } = corner(t, 2);
    drag(t, "br", x, y);
    expect(t.styles[0][0].fontSize).toBe(32);
  });

  it("coin en largeur et hauteur fixes : la boîte suit le facteur, le texte wrappe pareil", () => {
    const t = text(LONG, { width: 200 });
    t.setSizing({ x: "fixed", y: "fixed" });
    t.set({ height: 300 });
    const lines = t.textLines.length;
    const { x, y } = corner(t, 1.5);
    drag(t, "br", x, y);
    expect(t.fontSize).toBe(48);
    expect(Math.abs(t.width - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.height - 450)).toBeLessThanOrEqual(1);
    expect(t.textLines.length).toBe(lines);
  });

  it("coin : le plancher de hauteur suit", () => {
    const t = text("Bonjour");
    drag(t, "mb", 0, 100);
    const { x, y } = corner(t, 2);
    drag(t, "br", x, y);
    expect(Math.abs((t.sizing.minSize?.h ?? 0) - 200)).toBeLessThanOrEqual(2);
  });

  it("coin : chaque pas du geste repart du départ, rien ne s'accumule", () => {
    const t = text("Bonjour");
    t.set({ originX: "left", originY: "top", left: 0, top: 0 });
    const transform = { target: t, corner: "br", originX: "left", originY: "top" } as any;
    const big = corner(t, 2);
    const back = corner(t, 1);
    t.handleCornerResize(transform, big.x, big.y);
    expect(t.fontSize).toBe(64);
    t.handleCornerResize(transform, back.x, back.y);
    expect(t.fontSize).toBe(32);
  });

  it("coin : le coin opposé reste en place", () => {
    const t = text("Bonjour");
    t.set({ originX: "center", originY: "center", left: 300, top: 200 });
    t.setCoords();
    const tl = t.getPositionByOrigin("left", "top");
    const transform = { target: t, corner: "br", originX: "left", originY: "top" } as any;
    t.handleCornerResize(transform, tl.x + (t.width + 1) * 2, tl.y + (t.height + 1) * 2);
    const after = t.getPositionByOrigin("left", "top");
    expect(Math.abs(after.x - tl.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(after.y - tl.y)).toBeLessThanOrEqual(0.01);
  });

  it("taille programmatique (setShapeSize) : la police absorbe, jamais de scale", () => {
    const t = text("Bonjour");
    const { width, height } = t;
    setShapeSize(t, width * 2, height * 2);
    expect(t.fontSize).toBe(64);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
    expect(Math.abs(t.width - 2 * width)).toBeLessThanOrEqual(2);
  });
});

describe("StackResizeSession — le contenu arrête la poignée", () => {
  function rect(id: string, w: number, order: number): FabRect {
    const r = new FabRect({ width: w, height: 40, originX: "left", originY: "top" });
    r.set({ layerId: id, layout: { child: { parentId: "c", order } } } as any);
    return r;
  }
  const row = (w: number) => container("c", w, 80, {
    sizing: { x: "fixed", y: "hug" },
    container: { padding: PAD, flexDirection: "row", gap: 10 },
  });

  it("en ligne : jamais plus étroit que marges (2 × 10) + éléments (2 × 100) + gap (10)", () => {
    const c = row(400);
    const objects = [c, rect("a", 100, 0), rect("b", 100, 1)];
    runLayout(objects);
    const session = new StackResizeSession(c, "mr");
    c.set({ width: 100 });
    session.handleResizing(objects);
    expect(c.width).toBe(230);
  });

  it("un texte ne compte que pour son graphème le plus large : son mot se découpe", () => {
    const c = row(600);
    const t = text("court motextrêmementlong", { layout: { child: { parentId: "c", order: 1 } } });
    const objects = [c, rect("a", 100, 0), t];
    runLayout(objects);
    const session = new StackResizeSession(c, "mr");
    c.set({ width: 100 });
    session.handleResizing(objects);
    expect(c.width).toBe(20 + 100 + 10 + t.minContentWidth());
    expect(t.minContentWidth()).toBeLessThan(60);
    expect(t.textLines.length).toBeGreaterThan(4);
    expect(t.textLines.join("")).toBe("courtmotextrêmementlong");
  });

  it("bord gauche arrêté : c'est lui qui s'arrête, le bord droit ne bouge pas", () => {
    const c = row(400);
    const objects = [c, rect("a", 100, 0), rect("b", 100, 1)];
    runLayout(objects);
    const session = new StackResizeSession(c, "ml");
    c.set({ width: 100, left: 300 });
    session.handleResizing(objects);
    expect(c.width).toBe(230);
    expect(c.left + c.width).toBe(400);
  });

  it("pendant le drag, les enfants sont alignés dans la boîte étirée (pas dans celle du contenu)", () => {
    const c = container("c", 300, 80, {
      sizing: { x: "fixed", y: "hug" },
      container: { padding: PAD, flexDirection: "row", gap: 10, alignItems: "center" },
    });
    const objects = [c, rect("a", 100, 0), rect("b", 100, 1)];
    runLayout(objects);
    const session = new StackResizeSession(c, "mb");
    c.set({ height: 200 });
    session.handleResizing(objects);
    expect(c.height).toBe(200);
    // centré dans 200 : (200 - 40) / 2, au trait de 1px près (sans le correctif : 10)
    expect(Math.abs(objects[1].top - 80)).toBeLessThanOrEqual(1);
  });
});

describe("CustomTextbox — placeholder (le texte est encore l'exemple)", () => {
  const sample = () => text("Tapez votre texte ici", { placeholder: true });

  it("voyage avec le calque", () => {
    const json = sample().toObject() as Record<string, unknown>;
    expect(json.placeholder).toBe(true);
    expect((text("Bonjour").toObject() as Record<string, unknown>).placeholder).toBeUndefined();
  });

  it("une frappe qui change le texte le lève, une frappe à vide non", () => {
    const t = sample();
    t.isEditing = true;
    const typed = (value: string, at: number) => {
      t.hiddenTextarea = { value, selectionStart: at, selectionEnd: at, style: {} } as unknown as HTMLTextAreaElement;
      t.onInput(new Event("input"));
    };
    typed("Tapez votre texte ici", 3);
    expect(t.placeholder).toBe(true);
    typed("Tapez votre texte ici !", 23);
    expect(t.placeholder).toBe(false);
  });

  it("un texte posé par programme le lève", () => {
    const t = sample();
    setTextContent(t, "$NOM");
    expect(t.placeholder).toBe(false);
    expect(t.text).toBe("$NOM");
  });
});
