/**
 * Couche des badges : peints avant les contrôles de fabric, donc sous les poignées.
 */
import { describe, it, expect, vi } from "vitest";
import { createCanvas } from "canvas";
import { installBadgeLayer, badgeLabel } from "./badges";
import type { FabricObject } from "#fabric";

const obj = { oCoords: { tl: { x: 10, y: 30 } } } as unknown as FabricObject;

describe("installBadgeLayer", () => {
  it("peint les badges des objets visés AVANT les contrôles", () => {
    const order: string[] = [];
    const fabricCanvas = { drawControls: vi.fn(() => order.push("controls")) };
    installBadgeLayer(fabricCanvas, "#7c3aed", [() => "À fournir"], () => [obj]);

    const ctx = createCanvas(100, 100).getContext("2d") as unknown as CanvasRenderingContext2D;
    vi.spyOn(ctx, "fillText").mockImplementation(((label: string) => order.push(`badge:${label}`)) as any);
    fabricCanvas.drawControls(ctx);

    expect(order).toEqual(["badge:À fournir", "controls"]);
  });
});

describe("badgeLabel", () => {
  it("réunit les labels, sans doublon ; null si aucun", () => {
    expect(badgeLabel(obj, [() => "$NOM", () => null, () => "$NOM", () => "À fournir"])).toBe("$NOM À fournir");
    expect(badgeLabel(obj, [() => null])).toBeNull();
  });
});
