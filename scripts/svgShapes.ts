/**
 * Normalisation d'un SVG « forme » vers le format catalogue de la lib : une liste
 * de paths dans une boîte 100x100, avec apparence d'auteur optionnelle par path
 * (fill uni et/ou contour stroke). C'est le mécanisme que la lib garde — les SVG
 * sources et les catalogues produits vivent chez l'application hôte (les formes
 * sont du métier).
 *
 * Périmètre assumé — celui des exports Illustrator « formes » :
 * - éléments path/rect/circle/ellipse/polygon/polyline, conteneurs <g>/<defs> ;
 * - fills et strokes unis, portés par attribut, style inline, classes d'un bloc
 *   <style> (sélecteurs de classe simples uniquement), hérités des <g> ;
 * - transforms hérités, appliqués via svgpath.
 *
 * Rejets francs (une charte ne se dégrade pas en silence) : gradients (url(#…)),
 * <text>, <image>, <use>, <foreignObject>, sélecteurs CSS non-classe, et tout
 * élément dessinant sous clip-path/mask/filter/opacity — ces fichiers-là sont des
 * compositions, pas des formes. `currentColor` et l'absence totale d'apparence =
 * path SANS couleur (recolorable côté éditeur) ; fill="none" sans stroke = path
 * ignoré (avec warning).
 */
import svgpath from "svgpath";

export interface NormalizedShapePath {
  d: string;
  fill?: string;
  stroke?: string;
  /** Normalisé dans la boîte 100x100, comme le `d`. */
  strokeWidth?: number;
}

export interface NormalizedShape {
  id: string;
  paths: NormalizedShapePath[];
  /** Largeur réelle du dessin dans la boîte 100x100. */
  width: number;
  /** Hauteur réelle du dessin dans la boîte 100x100. */
  height: number;
  viewBox: string;
}

const BOX = 100;

const DRAWING_TAGS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"]);
const FORBIDDEN_TAGS = new Set(["text", "image", "use", "foreignobject"]);
// Les propriétés qui font d'un fichier une composition, pas une forme.
const UNSUPPORTED_PROPS = ["clip-path", "mask", "filter", "opacity", "fill-opacity", "stroke-opacity"];

/** L'apparence déclarée par un élément (fusion style inline > classes > attributs). */
interface Appearance {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Première propriété hors périmètre rencontrée (clip-path, opacity…). */
  unsupported?: string;
}

interface OpenElement {
  tag: string;
  appearance: Appearance;
  transform?: string;
}

type ClassRules = Record<string, Record<string, string>>;

/**
 * Parse + normalise un fichier SVG. `id` = nom de la forme (basename du fichier).
 * Lève une Error au premier contenu hors périmètre.
 */
export function normalizeShape(id: string, svgContent: string, warn: (msg: string) => void = console.warn): NormalizedShape {
  const { viewBox, paths } = extractPaths(id, svgContent, warn);

  if (paths.length === 0) {
    throw new Error(`${id}.svg: aucun path exploitable (fills "none" partout ?)`);
  }

  const [minX, minY, w, h] = viewBox;
  const scale = BOX / Math.max(w, h);
  const scaledW = Math.round(w * scale * 100) / 100;
  const scaledH = Math.round(h * scale * 100) / 100;
  const offsetX = (BOX - scaledW) / 2;
  const offsetY = (BOX - scaledH) / 2;

  const normalized = paths.map((p) => ({
    d: svgpath(p.d)
      .translate(-minX, -minY)
      .scale(scale)
      .translate(offsetX, offsetY)
      .round(2)
      .toString(),
    ...(p.fill != null ? { fill: p.fill } : {}),
    ...(p.stroke != null ? { stroke: p.stroke } : {}),
    // L'épaisseur vit dans le même espace que le `d`.
    ...(p.strokeWidth != null ? { strokeWidth: Math.round(p.strokeWidth * scale * 100) / 100 } : {}),
  }));

  return { id, paths: normalized, width: scaledW, height: scaledH, viewBox: `0 0 ${BOX} ${BOX}` };
}

/** Tokenizer XML minimal (stack d'éléments ouverts) — pour du SVG bien formé. */
function extractPaths(
  id: string,
  content: string,
  warn: (msg: string) => void,
): { viewBox: [number, number, number, number]; paths: NormalizedShapePath[] } {
  const cleaned = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[?!][^>]*>/g, "");
  const tagRe = /<(\/?)([a-zA-Z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g;

  const stack: OpenElement[] = [];
  const paths: NormalizedShapePath[] = [];
  const classRules: ClassRules = {};
  let viewBox: [number, number, number, number] | null = null;

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(cleaned)) !== null) {
    const [, closing, rawTag, rawAttrs, selfClosing] = match;
    const tag = rawTag.toLowerCase().replace(/^.*:/, "");

    if (closing) {
      stack.pop();
      continue;
    }

    if (FORBIDDEN_TAGS.has(tag)) {
      throw new Error(`${id}.svg: <${rawTag}> non supporté — le format formes accepte des paths unis, pas ${describeForbidden(tag)}`);
    }

    if (tag === "style") {
      const end = cleaned.indexOf("</style", tagRe.lastIndex);
      if (end === -1) throw new Error(`${id}.svg: <style> non refermé`);
      parseStyleRules(id, cleaned.slice(tagRe.lastIndex, end), classRules);
      // Reprendre APRÈS le tag fermant : il ne doit pas dépiler un parent.
      tagRe.lastIndex = cleaned.indexOf(">", end) + 1;
      continue;
    }

    const attrs = parseAttrs(rawAttrs);
    const appearance = ownAppearance(id, attrs, classRules);

    if (tag === "svg" && viewBox === null) {
      viewBox = parseViewBox(id, attrs.viewbox);
    }

    if (DRAWING_TAGS.has(tag) && !insideIgnoredContainer(stack)) {
      assertSupported(id, tag, appearance, stack);
      const d = toPathD(id, tag, attrs);
      const resolved = resolveAppearance(appearance, stack);
      const transform = transformChain(stack, attrs.transform);

      if (resolved.fill === "none" && resolved.stroke == null) {
        warn(`${id}.svg: <${tag}> fill="none" sans stroke, ignoré`);
      } else {
        paths.push({
          d: transform ? svgpath(d).transform(transform).toString() : d,
          ...(resolved.fill != null && resolved.fill !== "none" ? { fill: resolved.fill } : {}),
          ...(resolved.stroke != null ? { stroke: resolved.stroke } : {}),
          ...(resolved.stroke != null ? { strokeWidth: resolved.strokeWidth ?? 1 } : {}),
        });
      }
    }

    if (!selfClosing) {
      stack.push({ tag, appearance, transform: attrs.transform });
    }
  }

  if (viewBox === null) {
    throw new Error(`${id}.svg: attribut viewBox manquant sur <svg>`);
  }

  return { viewBox, paths };
}

/**
 * Les règles d'un bloc <style> : uniquement des sélecteurs de classe simples
 * (`.d`, listes `.d, .e`), propriétés fusionnées dans l'ordre de la feuille
 * (la dernière gagne, comme en CSS à spécificité égale).
 */
function parseStyleRules(id: string, css: string, rules: ClassRules): void {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (body === "") return;

  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(body)) !== null) {
    consumed = ruleRe.lastIndex;
    const selectors = m[1].split(",").map((s) => s.trim());
    const props = parseDeclarations(m[2]);
    for (const selector of selectors) {
      const klass = selector.match(/^\.([A-Za-z_][\w-]*)$/)?.[1];
      if (!klass) {
        throw new Error(`${id}.svg: sélecteur CSS "${selector}" hors périmètre (classes simples uniquement)`);
      }
      rules[klass] = { ...rules[klass], ...props };
    }
  }
  if (body.slice(consumed).trim() !== "") {
    throw new Error(`${id}.svg: CSS non reconnu dans <style> : "${body.slice(consumed).trim().slice(0, 40)}…"`);
  }
}

function parseDeclarations(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const decl of block.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    props[decl.slice(0, idx).trim().toLowerCase()] = decl.slice(idx + 1).trim();
  }
  return props;
}

/**
 * L'apparence propre d'un élément — précédence CSS réelle : style inline >
 * classes de la feuille > attributs de présentation.
 */
function ownAppearance(id: string, attrs: Record<string, string>, classRules: ClassRules): Appearance {
  const layers: Record<string, string>[] = [];

  const presentation: Record<string, string> = {};
  for (const prop of ["fill", "stroke", "stroke-width", ...UNSUPPORTED_PROPS]) {
    if (attrs[prop] != null) presentation[prop] = attrs[prop];
  }
  layers.push(presentation);

  const classes = (attrs.class || "").split(/\s+/).filter(Boolean);
  const fromClasses: Record<string, string> = {};
  for (const [klass, props] of Object.entries(classRules)) {
    if (classes.includes(klass)) Object.assign(fromClasses, props);
  }
  layers.push(fromClasses);

  if (attrs.style) layers.push(parseDeclarations(attrs.style));

  const merged = Object.assign({}, ...layers);
  const unsupported = UNSUPPORTED_PROPS.find((prop) => merged[prop] != null);
  return {
    fill: normalizeFillValue(id, merged.fill),
    stroke: normalizeStrokeValue(id, merged.stroke),
    strokeWidth: merged["stroke-width"] != null ? parseFloat(merged["stroke-width"]) : undefined,
    unsupported,
  };
}

/** Les zones dont le contenu dessinant ne fait pas partie de l'œuvre. */
function insideIgnoredContainer(stack: OpenElement[]): boolean {
  return stack.some((el) => el.tag === "defs" || el.tag === "clippath" || el.tag === "mask" || el.tag === "symbol");
}

/** clip-path/opacity/… sur l'élément ou un ancêtre : composition, pas forme. */
function assertSupported(id: string, tag: string, appearance: Appearance, stack: OpenElement[]): void {
  const unsupported = appearance.unsupported ?? stack.find((el) => el.appearance.unsupported)?.appearance.unsupported;
  if (unsupported) {
    throw new Error(`${id}.svg: "${unsupported}" sur un <${tag}> dessinant — ce fichier est une composition, pas une forme`);
  }
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  return attrs;
}

function parseViewBox(id: string, value: string | undefined): [number, number, number, number] {
  if (!value) throw new Error(`${id}.svg: attribut viewBox manquant sur <svg>`);
  const parts = value.split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`${id}.svg: viewBox invalide "${value}"`);
  }
  return parts as [number, number, number, number];
}

function normalizeFillValue(id: string, fill: string | undefined): string | undefined {
  if (fill == null) return undefined;
  const value = fill.trim();
  if (value.startsWith("url(")) {
    throw new Error(`${id}.svg: gradient ou pattern (fill="url(#…)") non supporté`);
  }
  // currentColor/inherit = pas de couleur d'auteur : la forme reste recolorable.
  if (value === "currentColor" || value === "inherit" || value === "") return undefined;
  return value;
}

function normalizeStrokeValue(id: string, stroke: string | undefined): string | undefined {
  if (stroke == null) return undefined;
  const value = stroke.trim();
  if (value.startsWith("url(")) {
    throw new Error(`${id}.svg: gradient ou pattern (stroke="url(#…)") non supporté`);
  }
  if (value === "none" || value === "currentColor" || value === "inherit" || value === "") return undefined;
  return value;
}

/** Apparence effective : la sienne, sinon l'ancêtre le plus proche, par propriété. */
function resolveAppearance(own: Appearance, stack: OpenElement[]): Appearance {
  const resolved = { ...own };
  for (let i = stack.length - 1; i >= 0; i--) {
    const ancestor = stack[i].appearance;
    resolved.fill ??= ancestor.fill;
    resolved.stroke ??= ancestor.stroke;
    resolved.strokeWidth ??= ancestor.strokeWidth;
  }
  return resolved;
}

/** Chaîne de transforms héritée, de la racine vers l'élément (ordre SVG). */
function transformChain(stack: OpenElement[], own: string | undefined): string {
  return [...stack.map((el) => el.transform), own].filter(Boolean).join(" ");
}

/** Conversion des primitives vers un `d` — géométrie pure, sans style. */
function toPathD(id: string, tag: string, attrs: Record<string, string>): string {
  const num = (key: string, fallback = 0): number => {
    const v = attrs[key];
    return v == null || v === "" ? fallback : Number(v);
  };

  switch (tag) {
    case "path": {
      if (!attrs.d) throw new Error(`${id}.svg: <path> sans attribut d`);
      return attrs.d;
    }
    case "rect": {
      const x = num("x");
      const y = num("y");
      const w = num("width");
      const h = num("height");
      let rx = attrs.rx != null ? num("rx") : (attrs.ry != null ? num("ry") : 0);
      let ry = attrs.ry != null ? num("ry") : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
             `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
             `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case "circle": {
      const cx = num("cx");
      const cy = num("cy");
      const r = num("r");
      return ellipseD(cx, cy, r, r);
    }
    case "ellipse":
      return ellipseD(num("cx"), num("cy"), num("rx"), num("ry"));
    case "polygon":
    case "polyline": {
      const points = (attrs.points || "").trim().split(/[\s,]+/).map(Number);
      if (points.length < 4 || points.some(Number.isNaN)) {
        throw new Error(`${id}.svg: <${tag}> points invalides`);
      }
      const [x0, y0, ...rest] = points;
      const lines = [];
      for (let i = 0; i < rest.length - 1; i += 2) lines.push(`L${rest[i]} ${rest[i + 1]}`);
      return `M${x0} ${y0}${lines.join("")}${tag === "polygon" ? "Z" : ""}`;
    }
    default:
      throw new Error(`${id}.svg: <${tag}> non convertible`);
  }
}

function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

function describeForbidden(tag: string): string {
  if (tag === "text") return "de texte";
  if (tag === "image") return "d'images embarquées";
  return "de références externes";
}
