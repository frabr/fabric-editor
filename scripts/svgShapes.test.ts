import { describe, it, expect } from "vitest";
import { normalizeShape } from "./svgShapes";

const wrap = (inner: string, attrs = 'viewBox="0 0 200 200"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe("normalizeShape", () => {
  it("normalizes a single colorless path into the 100x100 box (legacy behaviour)", () => {
    const shape = normalizeShape("square", wrap('<path d="M0 0H200V200H0Z"/>'));
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0].fill).toBeUndefined();
    expect(shape.paths[0].d).toBe("M0 0H100V100H0Z");
    expect(shape.width).toBe(100);
    expect(shape.height).toBe(100);
  });

  it("keeps per-path authored fills (polychrome artwork)", () => {
    const shape = normalizeShape("logo", wrap('<path d="M0 0H100V100H0Z" fill="#EC6525"/><path d="M100 100H200V200H100Z" fill="#036"/>'));
    expect(shape.paths.map((p) => p.fill)).toEqual(["#EC6525", "#036"]);
  });

  it("inherits fill and transform from enclosing groups", () => {
    const svg = wrap('<g fill="#111" transform="translate(100 0)"><path d="M0 0H100V200H0Z"/></g>');
    const shape = normalizeShape("shifted", svg);
    expect(shape.paths[0].fill).toBe("#111");
    // translate(100) puis scale 0.5 : le rectangle occupe la moitié droite
    expect(shape.paths[0].d).toBe("M50 0H100V100H50Z");
  });

  it("reads fill from inline style and treats currentColor as colorless", () => {
    const svg = wrap('<path d="M0 0H200V200H0Z" style="stroke:none;fill:#abc"/><path d="M0 0H200V200H0Z" fill="currentColor"/>');
    const shape = normalizeShape("styled", svg);
    expect(shape.paths[0].fill).toBe("#abc");
    expect(shape.paths[1].fill).toBeUndefined();
  });

  it("converts primitives (rect, circle, polygon) to paths", () => {
    const svg = wrap('<rect x="0" y="0" width="200" height="200"/><circle cx="100" cy="100" r="50"/><polygon points="0,0 200,0 100,200"/>');
    const shape = normalizeShape("prims", svg);
    expect(shape.paths).toHaveLength(3);
    shape.paths.forEach((p) => expect(p.d).toMatch(/^M/));
  });

  it("centers a non-square drawing in the box", () => {
    const shape = normalizeShape("wide", wrap('<path d="M0 0H200V100H0Z"/>', 'viewBox="0 0 200 100"'));
    expect(shape.width).toBe(100);
    expect(shape.height).toBe(50);
    // Centré verticalement : y démarre à 25
    expect(shape.paths[0].d).toBe("M0 25H100V75H0Z");
  });

  it("skips fill=none paths but keeps the rest", () => {
    const warnings: string[] = [];
    const svg = wrap('<path d="M0 0H10V10H0Z" fill="none"/><path d="M0 0H200V200H0Z" fill="#000"/>');
    const shape = normalizeShape("outline", svg, (m) => warnings.push(m));
    expect(shape.paths).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it("resolves class rules from a <style> block (Illustrator export)", () => {
    const svg = wrap(`<defs><style>
        .d { fill: #ec6525; }
        .e { fill: #b2391a; }
      </style></defs>
      <g><path class="d" d="M0 0H100V200H0Z"/><path class="e" d="M100 0H200V200H100Z"/></g>`);
    const shape = normalizeShape("classes", svg);
    expect(shape.paths.map((p) => p.fill)).toEqual(["#ec6525", "#b2391a"]);
  });

  it("keeps stroke-only paths as outlines, width normalized to the box", () => {
    const svg = wrap('<defs><style>.d,.e{fill:none;stroke:#ec6525;stroke-miterlimit:10;}.e{stroke-width:4px;}</style></defs>' +
      '<path class="d" d="M0 0H200V200H0Z"/><path class="e" d="M50 50H150V150H50Z"/>');
    const shape = normalizeShape("outlines", svg);
    expect(shape.paths).toHaveLength(2);
    expect(shape.paths[0]).toMatchObject({ stroke: "#ec6525", strokeWidth: 0.5 });
    expect(shape.paths[0].fill).toBeUndefined();
    // 4px dans un viewBox de 200 → 2 dans la boîte 100
    expect(shape.paths[1].strokeWidth).toBe(2);
  });

  it("merges comma selectors and later rules override (CSS order)", () => {
    const svg = wrap('<defs><style>.d{fill:#111;}.d{fill:#222;}</style></defs><path class="d" d="M0 0H200V200H0Z"/>');
    expect(normalizeShape("order", svg).paths[0].fill).toBe("#222");
  });

  it("rejects drawing elements under clip-path/opacity — compositions, not shapes", () => {
    const clipped = wrap('<defs><style>.l{clip-path:url(#h);}.j{fill:#05454a;}</style>' +
      '<clipPath id="h"><rect width="10" height="10"/></clipPath></defs>' +
      '<g class="l"><path class="j" d="M0 0H200V200H0Z"/></g>');
    expect(() => normalizeShape("clipped", clipped, () => {})).toThrow(/clip-path/);

    const faded = wrap('<g opacity="0.38"><path d="M0 0H200V200H0Z" fill="#000"/></g>');
    expect(() => normalizeShape("faded", faded, () => {})).toThrow(/opacity/);
  });

  it("rejects non-class CSS selectors", () => {
    const svg = wrap('<defs><style>path { fill: #000; }</style></defs><path d="M0 0H200V200H0Z"/>');
    expect(() => normalizeShape("css", svg, () => {})).toThrow(/sélecteur/);
  });

  it("ignores drawing elements inside defs/clipPath", () => {
    const svg = wrap('<defs><path d="M0 0H10V10H0Z"/></defs><clipPath><rect width="10" height="10"/></clipPath><path d="M0 0H200V200H0Z"/>');
    expect(normalizeShape("defs", svg).paths).toHaveLength(1);
  });

  it.each([
    ["gradient", '<path d="M0 0H10V10H0Z" fill="url(#grad)"/>', /gradient/],
    ["text", "<text>hi</text>", /text/],
    ["image", '<image href="x.png"/>', /image/],
    ["missing viewBox", "<path d='M0 0H10V10H0Z'/>", /viewBox/],
    ["empty (all none)", '<path d="M0 0H10V10H0Z" fill="none"/>', /aucun path/],
  ])("rejects out-of-scope content: %s", (_label, inner, message) => {
    const attrs = _label === "missing viewBox" ? "" : 'viewBox="0 0 200 200"';
    expect(() => normalizeShape("bad", wrap(inner, attrs), () => {})).toThrow(message);
  });
});
