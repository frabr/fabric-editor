/**
 * Aligner et répartir : la géométrie seule.
 */
import { describe, it, expect } from "vitest";
import { alignDelta, distributeDeltas, unionBox } from "./arrange";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("aligner", () => {
  const ref = box(0, 0, 200, 100);
  const b = box(50, 20, 40, 10);

  it("sur les bords et les centres de la référence", () => {
    expect(alignDelta(b, ref, "left")).toEqual({ dx: -50, dy: 0 });
    expect(alignDelta(b, ref, "center")).toEqual({ dx: 30, dy: 0 });
    expect(alignDelta(b, ref, "right")).toEqual({ dx: 110, dy: 0 });
    expect(alignDelta(b, ref, "top")).toEqual({ dx: 0, dy: -20 });
    expect(alignDelta(b, ref, "middle")).toEqual({ dx: 0, dy: 25 });
    expect(alignDelta(b, ref, "bottom")).toEqual({ dx: 0, dy: 70 });
  });

  it("la boîte commune englobe toutes les boîtes", () => {
    expect(unionBox([box(10, 10, 10, 10), box(-5, 30, 10, 5)])).toEqual(box(-5, 10, 25, 25));
  });
});

describe("répartir", () => {
  it("les extrêmes restent, les autres se rangent à espace égal, dans l'ordre reçu", () => {
    // 0–10, 100–110, 20–40, 60–70 (donnés dans le désordre) → espace = (110 - 50) / 3 = 20
    const boxes = [box(0, 0, 10, 10), box(100, 0, 10, 10), box(20, 0, 20, 10), box(60, 0, 10, 10)];
    expect(distributeDeltas(boxes, "horizontal")).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 10, dy: 0 }, // → 30–50
      { dx: 10, dy: 0 }, // → 70–80
    ]);
  });

  it("moins de trois boîtes : rien ne bouge", () => {
    expect(distributeDeltas([box(0, 0, 1, 1), box(5, 9, 1, 1)], "vertical")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
});
