/**
 * L'aimant d'un déplacement : bords et centres, l'écart le plus court, sans état.
 */
import { describe, it, expect } from "vitest";
import { snapMove } from "./snap";

const page = { left: 0, top: 0, width: 1000, height: 1000 };

describe("snapMove", () => {
  it("cale le centre sur le centre de la page, et trace le guide", () => {
    const { dx, dy, guides } = snapMove({ left: 445, top: 300, width: 100, height: 50 }, [page], 8);

    expect([dx, dy]).toEqual([5, 0]);
    expect(guides).toEqual([{ axis: "x", at: 500, from: 0, to: 1000 }]);
  });

  it("cale un bord sur le bord d'un autre objet ; le guide les joint", () => {
    const other = { left: 200, top: 600, width: 300, height: 100 };
    const { dx, guides } = snapMove({ left: 497, top: 100, width: 80, height: 80 }, [other], 8);

    expect(dx).toBe(3);
    expect(guides).toEqual([{ axis: "x", at: 500, from: 100, to: 700 }]);
  });

  it("prend l'écart le plus court parmi toutes les cibles, axe par axe", () => {
    const near = { left: 103, top: 0, width: 10, height: 10 };
    const nearer = { left: 101, top: 0, width: 10, height: 10 };
    const { dx } = snapMove({ left: 100, top: 500, width: 50, height: 50 }, [near, nearer], 8);

    expect(dx).toBe(1);
  });

  it("un centre sur un centre, un bord sur un bord — jamais un bord sur un centre", () => {
    const other = { left: 400, top: 0, width: 200, height: 10 };
    // Son bord gauche est à 2 du centre de l'autre : rien ; son centre à 4 du sien : calé
    const { dx, guides } = snapMove({ left: 502, top: 500, width: 4, height: 4 }, [other], 8);

    expect(dx).toBe(-4);
    expect(guides[0].at).toBe(500);
  });

  it("garde le guide actif tant qu'il est dans le seuil, même si un voisin est plus près", () => {
    const a = { left: 300, top: 0, width: 10, height: 10 };
    const b = { left: 304, top: 0, width: 10, height: 10 };
    const moving = { left: 303, top: 500, width: 50, height: 50 };

    expect(snapMove(moving, [a, b], 8).dx).toBe(1);
    expect(snapMove(moving, [a, b], 8, { x: 300 }).dx).toBe(-3);
  });

  it("hors du seuil, rien ne bouge : l'objet suit le pointeur", () => {
    expect(snapMove({ left: 430, top: 430, width: 100, height: 100 }, [page], 8)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
