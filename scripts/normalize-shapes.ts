/**
 * CLI du normaliseur de formes — la lib garde l'outil, l'application hôte possède
 * les SVG sources et les catalogues produits (cf. scripts/svgShapes.ts).
 *
 * Usage : normalize-shapes <dossier-svg> <sortie.json>
 *   Lit tous les *.svg du dossier (id = nom de fichier), écrit le catalogue JSON.
 *   Échoue au premier SVG hors périmètre — un catalogue de charte ne se dégrade
 *   pas en silence.
 *
 * Distribué compilé via le champ `bin` du package (l'hôte l'appelle depuis ses
 * scripts de build), utilisable aussi en direct : npx tsx scripts/normalize-shapes.ts …
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { normalizeShape, type NormalizedShape } from "./svgShapes";

function main(): void {
  const [svgDir, outFile] = process.argv.slice(2);
  if (!svgDir || !outFile) {
    console.error("Usage: normalize-shapes <dossier-svg> <sortie.json>");
    process.exit(1);
  }

  const files = readdirSync(svgDir).filter((f) => f.endsWith(".svg")).sort();
  console.log(`${svgDir}: ${files.length} SVG`);

  const shapes: NormalizedShape[] = files.map((file) => {
    const id = basename(file, extname(file));
    const shape = normalizeShape(id, readFileSync(join(svgDir, file), "utf-8"));
    const fills = shape.paths.filter((p) => p.fill).length;
    console.log(`  ${id}: ${shape.paths.length} path(s), ${fills} fill(s) — ${shape.width}x${shape.height} in 100x100`);
    return shape;
  });

  writeFileSync(outFile, JSON.stringify(shapes, null, 2) + "\n", "utf-8");
  console.log(`Écrit ${outFile}`);
}

main();
