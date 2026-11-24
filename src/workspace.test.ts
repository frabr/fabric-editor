/**
 * Plan de travail : le cadre centré par la vue, l'export du cadre seul.
 * Vrai canvas Fabric (node-canvas).
 */
import { describe, it, expect } from "vitest";
import { Rect, getFabricDocument } from "#fabric";
import { loadImage } from "canvas";
import { DesignCanvas } from "./DesignCanvas";

function workspace(w = 400, h = 200, veil: "solid" | "checker" = "solid"): DesignCanvas {
  const el = getFabricDocument().createElement("canvas");
  const canvas = new DesignCanvas(el, { width: w, height: h, enableRetinaScaling: false, renderOnAddRemove: false });
  canvas.enableWorkspace({ margin: 50, color: "#00ff00", checkerColor: "#0000ff", veil, veilOpacity: 1, frameColor: "#ff00ff" });
  return canvas;
}

describe("plan de travail", () => {
  it("le canvas prend tout le panneau, le cadre y est centré avec sa marge", () => {
    const canvas = workspace(400, 200);
    // min((1000 - 2×50) / 400, (600 - 2×50) / 200) = min(2.25, 2.5)
    const scale = canvas.fitWorkspace(1000, 600);
    expect(scale).toBe(2.25);
    expect(canvas.originalFabricCanvas.width).toBe(1000);
    expect(canvas.originalFabricCanvas.height).toBe(600);
    expect(canvas.frameRect).toEqual({ left: 50, top: 75, width: 900, height: 450 });
    expect(canvas.originalFabricCanvas.viewportTransform).toEqual([2.25, 0, 0, 2.25, 50, 75]);
  });

  it("zoom et déplacement : le cadre suit, la vue se recentre au reset", () => {
    const canvas = workspace(400, 200);
    canvas.fitWorkspace(1000, 600, 2);
    expect(canvas.frameRect.width).toBe(1800);
    canvas.panBy(100, -40);
    expect(canvas.frameRect.left).toBe((1000 - 1800) / 2 + 100);
    expect(canvas.frameRect.top).toBe((600 - 900) / 2 - 40);
    canvas.resetPan();
    canvas.fitWorkspace(1000, 600, 1);
    expect(canvas.frameRect.left).toBe(50);
  });

  it("centerObject centre dans le cadre du document, pas dans le canvas", () => {
    const canvas = workspace(400, 200);
    canvas.fitWorkspace(1000, 600);
    const rect = new Rect({ width: 20, height: 20 });
    canvas.add(rect);
    canvas.centerObject(rect);
    expect(rect.getCenterPoint().x).toBe(200);
    expect(rect.getCenterPoint().y).toBe(100);
  });

  it("export : le cadre seul, à la taille du document, sans plan de travail ni voile", async () => {
    const canvas = workspace(400, 200);
    canvas.fitWorkspace(1000, 600);
    // Un rect rouge qui déborde du cadre à gauche
    canvas.add(new Rect({ left: -50, top: 0, width: 150, height: 200, fill: "#ff0000", originX: "left", originY: "top" }));
    canvas.renderAll();

    const img = await loadImage(canvas.toFrameDataURL());
    expect(img.width).toBe(400);
    expect(img.height).toBe(200);

    const { createCanvas } = await import("canvas");
    const probe = createCanvas(400, 200).getContext("2d");
    probe.drawImage(img, 0, 0);
    const pixel = (x: number, y: number) => Array.from(probe.getImageData(x, y, 1, 1).data);
    expect(pixel(10, 100)).toEqual([255, 0, 0, 255]); // la part du rect DANS le cadre
    expect(pixel(300, 100)[3]).toBe(0); // fond du document transparent : ni vert, ni voile
  });

  it("à l'écran : plan de travail hors cadre, rien de peint dans le cadre, voile sur le débord", () => {
    const canvas = workspace(400, 200);
    canvas.fitWorkspace(1000, 600);
    canvas.add(new Rect({ left: -50, top: 0, width: 150, height: 200, fill: "#ff0000", originX: "left", originY: "top" }));
    canvas.renderAll();
    const ctx = canvas.originalFabricCanvas.getContext();
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    expect(pixel(10, 10)).toEqual([0, 255, 0, 255]); // plan de travail
    expect(pixel(700, 300)[3]).toBe(0); // dans le cadre, vide : transparent (iframe, damier dessous)
    expect(pixel(60, 300)).toEqual([255, 0, 0, 255]); // le rect dans le cadre (x écran 60 > 50)
    expect(pixel(10, 300)).toEqual([0, 255, 0, 255]); // son débord, sous un voile opaque à 100 %
  });

  it("les objets de l'éditeur (guides, marges) restent au-dessus du voile", () => {
    const canvas = workspace(400, 200);
    canvas.fitWorkspace(1000, 600);
    canvas.add(new Rect({ left: -50, top: 0, width: 150, height: 200, fill: "#ff0000", originX: "left", originY: "top" }));
    canvas.add(new Rect({ left: -20, top: 80, width: 10, height: 10, fill: "#ffff00", excludeFromExport: true, originX: "left", originY: "top" }));
    canvas.renderAll();
    const ctx = canvas.originalFabricCanvas.getContext();
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    // Le guide hors cadre, scène (-15, 85) → écran (50 - 33.75, 75 + 191.25)
    expect(pixel(16, 266)).toEqual([255, 255, 0, 255]);
  });

  it("damier : celui du cadre côté hôte, calé sur le coin du cadre", () => {
    // Cadre en (50, 75) : les cases se comptent depuis ce coin, cases de 8px, foncées en
    // haut-droite et bas-gauche de chaque carreau de 16px (comme bg-transparency-grid)
    const canvas = workspace(400, 200, "checker");
    canvas.fitWorkspace(1000, 600);
    canvas.renderAll();
    const ctx = canvas.originalFabricCanvas.getContext();
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const base = [0, 255, 0, 255];
    const dark = [0, 0, 255, 255];
    // Juste à gauche du cadre, sur la ligne de son bord haut : x - 50 ∈ [-8, -1] → colonne
    // impaire (haut-droite d'un carreau), y - 75 ∈ [0, 7] → rangée paire
    expect(pixel(45, 78)).toEqual(dark);
    expect(pixel(37, 78)).toEqual(base);
    expect(pixel(45, 86)).toEqual(base);
    expect(pixel(37, 86)).toEqual(dark);
  });
});
