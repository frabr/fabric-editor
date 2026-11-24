import { describe, it, expect } from "vitest";
import { cropFromCenterOffset, cropFromRect, panCrop, photoRect, zoomCrop, NO_CROP } from "./crop";

// Cadre 120 × 80, image 100 × 50 : cover 1.6 → 160 × 80
const W = 120;
const H = 80;
const nat = { w: 100, h: 50 };

describe("crop", () => {
  it("photoRect : centrée en cover, puis calée aux bords", () => {
    expect(photoRect(W, H, nat, NO_CROP)).toEqual({ x: -20, y: 0, w: 160, h: 80 });
    expect(photoRect(W, H, nat, { x: 0, y: 0.5, scale: 1 })).toEqual({ x: 0, y: 0, w: 160, h: 80 });
    expect(photoRect(W, H, nat, { x: 1, y: 0.5, scale: 1 })).toEqual({ x: -40, y: 0, w: 160, h: 80 });
  });

  it("cropFromRect inverse photoRect, borné pour couvrir le cadre", () => {
    const c = { x: 0.25, y: 0.75, scale: 1.5 };
    const back = cropFromRect(W, H, nat, photoRect(W, H, nat, c));
    expect(back.x).toBeCloseTo(c.x);
    expect(back.y).toBeCloseTo(c.y);
    expect(back.scale).toBeCloseTo(c.scale);
    // Tirée trop loin : le bord revient sur le cadre
    expect(cropFromRect(W, H, nat, { x: 50, y: 0, w: 160, h: 80 })).toEqual({ x: 0, y: 0.5, scale: 1 });
    // Trop petite : l'échelle ne descend pas sous 1 ; trop grande : pas au-dessus de 4
    expect(cropFromRect(W, H, nat, { x: 0, y: 0, w: 80, h: 40 }).scale).toBe(1);
    expect(cropFromRect(W, H, nat, { x: 0, y: 0, w: 1600, h: 800 }).scale).toBe(4);
  });

  it("panCrop décale, zoomCrop grossit autour d'un point fixe", () => {
    expect(photoRect(W, H, nat, panCrop(W, H, nat, NO_CROP, 10, 0)).x).toBe(-10);
    const zoomed = zoomCrop(W, H, nat, { x: 0, y: 0, scale: 1 }, 2, 0, 0);
    expect(photoRect(W, H, nat, zoomed)).toEqual({ x: 0, y: 0, w: 320, h: 160 });
  });

  it("cropFromCenterOffset lit le format d'avant", () => {
    expect(cropFromCenterOffset(W, H, nat, 20, 0, 1)).toEqual({ x: 0, y: 0.5, scale: 1 });
    expect(cropFromCenterOffset(W, H, nat, -20, 0, 1)).toEqual({ x: 1, y: 0.5, scale: 1 });
    // Pas de marge sur cet axe : centré
    expect(cropFromCenterOffset(W, H, nat, 0, 30, 1).y).toBe(0.5);
  });
});
