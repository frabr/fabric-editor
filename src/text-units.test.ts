/**
 * Les unités d'un texte et leurs tuiles. Vrai moteur Fabric (node-canvas) : les tuiles,
 * recomposées, doivent redonner l'image du texte entier au pixel près.
 */
import { describe, it, expect } from "vitest";
import { util } from "#fabric";
import { CustomTextbox } from "./controls/CustomTextbox";
import { textUnits, textUnitTiles, type TextUnitKind } from "./text-units";

const PARAGRAPH =
  "Équipe au top, vente rapide et sereine du début à la fin. Merci à toute l'agence pour votre réactivité !";

function text(content: string, options: Record<string, unknown> = {}): CustomTextbox {
  return new CustomTextbox(content, {
    fontSize: 40, fontFamily: "Arial", fill: "#123456", left: 30, top: 20, width: 400,
    originX: "left", originY: "top", charSpacing: 1, ...options,
  });
}

/** Le texte entier rendu dans un canvas de `w`×`h` (le rendu de référence). */
function reference(t: CustomTextbox, w: number, h: number): Uint8ClampedArray {
  const canvas = util.createCanvasElement();
  canvas.width = w;
  canvas.height = h;
  t.objectCaching = false;
  t.render(canvas.getContext("2d")!);
  return canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
}

/** Les tuiles recomposées à leur place dans un canvas de `w`×`h`. */
function recomposed(t: CustomTextbox, kind: TextUnitKind, w: number, h: number): Uint8ClampedArray {
  const { units, matrix } = textUnitTiles(t, kind);
  const canvas = util.createCanvasElement();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Les couches s'empilent dans l'ordre : tous les dessous, puis les glyphes, puis les dessus.
  const tiles = ["under", "glyphs", "over"].flatMap((part) =>
    units.flatMap((unit) => unit.tiles.filter((tile) => tile.part === part)));
  {
    for (const tile of tiles) {
      ctx.save();
      ctx.transform(...matrix);
      ctx.drawImage(tile.canvas, tile.box.x, tile.box.y, tile.box.w, tile.box.h);
      ctx.restore();
    }
  }
  return ctx.getImageData(0, 0, w, h).data;
}

/** Le nombre de pixels qui diffèrent de plus de `tolerance` (sur 255) dans un canal. */
function differing(a: Uint8ClampedArray, b: Uint8ClampedArray, tolerance = 0): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    if (d > tolerance) n++;
  }
  return n;
}

/** Les graphèmes affichés, d'après les lignes de Fabric (sans espaces mangés ni sauts). */
function displayed(t: CustomTextbox): number[] {
  const out: number[] = [];
  let acc = 0;
  const lines = (t as unknown as { _textLines: string[][] })._textLines;
  lines.forEach((line, i) => {
    for (let ch = 0; ch < line.length; ch++) out.push(acc + ch);
    acc += line.length + t.missingNewlineOffset(i);
  });
  return out;
}

describe("textUnits", () => {
  it("découpe en mots, chaque mot emporte les espaces qui le suivent", () => {
    const units = textUnits(text("Bonjour  le monde", { width: 1000 }), "word");
    expect(units.map((u) => u.text)).toEqual(["Bonjour  ", "le ", "monde"]);
  });

  it("donne les espaces d'ouverture à la première unité", () => {
    const units = textUnits(text("  Salut toi", { width: 1000 }), "char");
    expect(units[0].text).toBe("  S");
    expect(units.map((u) => u.text).join("")).toBe("  Salut toi");
  });

  it("partitionne le texte affiché, quelle que soit la granularité", () => {
    const t = text(PARAGRAPH);
    for (const kind of ["line", "word", "char"] as const) {
      const covered = textUnits(t, kind).flatMap((u) =>
        displayed(t).filter((abs) => abs >= u.start && abs < u.end));
      expect(covered).toEqual(displayed(t));
    }
  });

  it("une ligne par ligne affichée, un saut de ligne ouvre une ligne", () => {
    const t = text(PARAGRAPH + "\nFin");
    const lines = textUnits(t, "line");
    expect(lines.length).toBe((t as unknown as { _textLines: unknown[] })._textLines.length);
    expect(lines.at(-1)!.text).toBe("Fin");
  });

  it("un mot coupé par le retour à la ligne reste un mot, avec une boîte par morceau", () => {
    const t = text("Anticonstitutionnellement", { width: 150 });
    const words = textUnits(t, "word");
    expect(words.length).toBe(1);
    expect(words[0].boxes.length).toBeGreaterThan(1);
  });

  it("les boîtes voisines d'une ligne se touchent sans se recouvrir", () => {
    const words = textUnits(text("un deux trois", { width: 1000 }), "word");
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1].boxes[0];
      expect(words[i].boxes[0].x).toBeCloseTo(prev.x + prev.w, 6);
    }
  });
});

describe("textUnitTiles — fidélité", () => {
  const W = 520;
  const H = 520;

  // Recomposer des tuiles passe par un canvas intermédiaire : un niveau d'arrondi (sur 255)
  // par canal, sur quelques pixels semi-transparents, rien de plus.
  const ROUNDING = 2;

  const cases: [string, Record<string, unknown>, TextUnitKind[]][] = [
    ["texte simple", {}, ["line", "word", "char"]],
    ["centré", { textAlign: "center" }, ["line", "word", "char"]],
    ["justifié", { textAlign: "justify" }, ["line", "word", "char"]],
    ["italique", { fontStyle: "italic" }, ["line", "word", "char"]],
    ["souligné et barré", { underline: true, linethrough: true }, ["line", "word", "char"]],
    ["contour", { stroke: "#ff0000", strokeWidth: 2 }, ["line", "word", "char"]],
    ["opacité", { opacity: 0.6 }, ["line", "word", "char"]],
    // Sans espacement de caractères, Fabric trace des suites (et des ligatures) : une ligne
    // reste exacte ; couper une ligature au caractère la rompt forcément.
    ["sans espacement de caractères", { charSpacing: 0 }, ["line"]],
  ];

  for (const [label, options, kinds] of cases) {
    for (const kind of kinds) {
      it(`${label} — ${kind} : les tuiles recomposées redonnent le texte entier`, () => {
        const t = text(PARAGRAPH, options);
        expect(differing(reference(t, W, H), recomposed(t, kind, W, H), ROUNDING)).toBe(0);
      });
    }
  }

  it("tourné : même encre, au même endroit (au rééchantillonnage près)", () => {
    for (const angle of [90, 12]) {
      const t = text(PARAGRAPH, { angle, originX: "center", originY: "center", left: 260, top: 260 });
      const ref = reference(t, W, H);
      const tiles = recomposed(t, "word", W, H);
      const ink = (d: Uint8ClampedArray) => {
        let sum = 0, x = 0, y = 0;
        for (let i = 3; i < d.length; i += 4) {
          sum += d[i];
          x += d[i] * (((i - 3) / 4) % W);
          y += d[i] * Math.floor((i - 3) / 4 / W);
        }
        return { sum, x: x / sum, y: y / sum };
      };
      const a = ink(ref);
      const b = ink(tiles);
      // Le centre d'encre au dixième de pixel près, la quantité d'encre à 3 % près.
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.15);
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.15);
      expect(Math.abs(a.sum - b.sum) / a.sum).toBeLessThan(0.03);
    }
  });

  it("styles mixtes (couleur, graisse, taille par plage)", () => {
    const t = text(PARAGRAPH);
    t.setSelectionStyles({ fill: "#e11d48", fontWeight: "bold" }, 7, 13);
    t.setSelectionStyles({ fontSize: 56 }, 30, 38);
    t.initDimensions();
    for (const kind of ["word", "char"] as const) {
      expect(differing(reference(t, W, H), recomposed(t, kind, W, H), ROUNDING)).toBe(0);
    }
  });

  it("laisse le texte rendable normalement (cache rétabli, aucune surcharge restante)", () => {
    const t = text(PARAGRAPH);
    const caching = t.objectCaching;
    textUnitTiles(t, "char");
    expect(t.objectCaching).toBe(caching);
    expect(Object.prototype.hasOwnProperty.call(t, "_renderChar")).toBe(false);
  });
});
