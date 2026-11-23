/**
 * Qui absorbe le manque de place dans une pile : un texte qui autofit (overflow "shrink")
 * replie sa police ; un texte qui garde sa police (overflow "visible" / "clip" — un nom,
 * une date) est rigide comme une forme, et c'est la pile qui déborde.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initYoga } from "./stack/engine";
import { runLayout } from "./run";
import { FabRect } from "../shapes/FabRect";
import { CustomTextbox } from "../controls/CustomTextbox";
import type { TextOverflow } from "./types";

beforeAll(async () => {
  await initYoga();
});

function column(height: number): FabRect {
  const c = new FabRect({ left: 0, top: 0, width: 300, height, originX: "left", originY: "top" });
  c.set({ layerId: "c", layout: { sizing: { x: "fixed", y: "fixed" }, container: { gap: 0 } } } as any);
  return c;
}

function text(id: string, overflow: TextOverflow | undefined, order: number): CustomTextbox {
  const t = new CustomTextbox("Camille Dupont", { fontSize: 40, fontFamily: "Arial", width: 280 });
  const layout: Record<string, unknown> = { child: { parentId: "c", order }, sizing: { x: "fixed", y: "hug" } };
  if (overflow) layout.overflow = overflow;
  t.set({ layerId: id, layout } as any);
  return t;
}

describe("manque de place dans une pile", () => {
  it("un texte « visible » garde sa police, un texte « shrink » replie la sienne", () => {
    const name = text("name", "visible", 0);
    const message = text("message", "shrink", 1);
    runLayout([column(60), name, message]);
    expect(name.fontSize).toBe(40);
    expect(message.fontSize).toBeLessThan(40);
  });

  it("sans overflow déclaré, un texte replie sa police (le défaut reste « shrink »)", () => {
    const a = text("a", undefined, 0);
    const b = text("b", undefined, 1);
    runLayout([column(60), a, b]);
    expect(a.fontSize).toBeLessThan(40);
    expect(b.fontSize).toBeLessThan(40);
  });
});

describe("un texte replié dans une zone", () => {
  function zone(justify: "flex-end" | "center"): FabRect {
    const c = new FabRect({ left: 0, top: 0, width: 300, height: 80, originX: "left", originY: "top" });
    c.set({ layerId: "c", layout: { sizing: { x: "fixed", y: "fixed" },
                                    container: { gap: 0, justifyContent: justify } } } as any);
    return c;
  }

  function long(): CustomTextbox {
    const t = new CustomTextbox("Angles sur l'Anglin (86260) et ses environs", { fontSize: 40, fontFamily: "Arial", width: 300 });
    t.set({ layerId: "t", layout: { child: { parentId: "c", order: 0 }, sizing: { x: "fixed", y: "hug" },
                                     overflow: "shrink" } } as any);
    return t;
  }

  it("épouse son texte replié et se cale en bas de la zone (justify flex-end)", () => {
    const t = long();
    runLayout([zone("flex-end"), t]);
    expect(t.fontSize).toBeLessThan(40);
    expect(t.height).toBeLessThan(80);
    const box = t.getBoundingRect();
    expect(Math.abs(box.top + box.height - 80)).toBeLessThanOrEqual(1); // le cadre englobant compte 1 px de trait
  });

  it("se centre dans la zone (justify center)", () => {
    const t = long();
    runLayout([zone("center"), t]);
    expect(t.height).toBeLessThan(80);
    const box = t.getBoundingRect();
    expect(Math.abs(box.top + box.height / 2 - 40)).toBeLessThanOrEqual(1);
  });
});
