/**
 * PreviewCanvas : la vue cadrée sur le contenu (vrais objets Fabric).
 */
import { describe, it, expect } from "vitest";
import { PreviewCanvas } from "./PreviewCanvas";
import { FabRect } from "./shapes/FabRect";
import { USER_SLOT_STYLE_KEY } from "./userSlots";

describe("fitToContent", () => {
  it("centre l'union des objets dans le buffer, pile par défaut, avec la marge demandée — sans objet, la vue de la page reste", () => {
    const canvas = new PreviewCanvas(undefined as unknown as HTMLCanvasElement, { width: 1080, height: 1080 });
    canvas.fitToSize(100, 100);
    const pageView = [...canvas.viewportTransform];

    canvas.fitToContent();
    expect([...canvas.viewportTransform]).toEqual(pageView);

    // Un carré de 200 en (100, 100) : il doit remplir le buffer à la marge près, centré
    canvas.add(new FabRect({ left: 100, top: 100, width: 200, height: 200, originX: "left", originY: "top", strokeWidth: 0 }));
    canvas.fitToContent();
    expect(canvas.viewportTransform[0]).toBeCloseTo(100 / 200, 5);

    canvas.fitToContent(0.1);
    const [scale, , , , tx, ty] = canvas.viewportTransform;

    expect(scale).toBeCloseTo(100 / 240, 5);
    // Le centre du carré (200, 200) tombe au centre du buffer (50, 50)
    expect(200 * scale + tx).toBeCloseTo(50, 5);
    expect(200 * scale + ty).toBeCloseTo(50, 5);
  });
});

describe("guideColor", () => {
  it("dessine les images à fournir dans la couleur d'édition de l'hôte — sans elle, la couleur par défaut", () => {
    const el = undefined as unknown as HTMLCanvasElement;
    const styled = new PreviewCanvas(el, { width: 100, height: 100, guideColor: "#11969f" });
    const plain = new PreviewCanvas(el, { width: 100, height: 100 });

    expect((styled as unknown as Record<string, unknown>)[USER_SLOT_STYLE_KEY]).toEqual({ color: "#11969f" });
    expect((plain as unknown as Record<string, unknown>)[USER_SLOT_STYLE_KEY]).toBeUndefined();
  });
});
