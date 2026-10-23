/**
 * Les unités d'un texte — ses lignes, ses mots ou ses caractères — et leur rendu séparé :
 * ce qu'un moteur d'animation (creatorstudio) anime une par une, au lieu d'une image du
 * texte entier.
 *
 * Fabric reste seul maître de la mise en page (retours à la ligne, alignement, styles
 * mixtes, autofit) : les unités se lisent dans ses mesures (`__charBounds`), et une unité
 * se rend en rejouant le rendu normal du texte, filtré sur sa plage de caractères. Les
 * glyphes sont donc dessinés exactement comme dans l'image entière : l'union des tuiles,
 * recomposée, est cette image au pixel près.
 *
 * Les unités PARTITIONNENT le texte : chaque caractère affiché appartient à une unité et
 * une seule (un mot emporte les espaces qui le suivent, un caractère aussi ; les espaces
 * d'ouverture vont à la première unité). Les boîtes d'une même ligne se touchent sans se
 * recouvrir — c'est ce qui permet de découper aussi le fond de texte et les soulignés.
 *
 * Limites connues : une ligature (texte sans espacement de caractères — la lib en pose
 * toujours un) est rompue par un découpage qui passe au milieu ; un fond de texte
 * (`textBackgroundColor`, que l'éditeur n'offre pas) peut garder un liseré d'un pixel entre
 * deux lignes. Un texte tourné se repose en rééchantillonnant ses tuiles : bords un peu
 * plus doux qu'un rendu direct, que `resolution` compense.
 *
 * Coordonnées : le repère local du texte, origine en son centre (celui de `_render`), sans
 * sa transformation. `textUnitTiles` renvoie la matrice qui y ramène le canvas.
 */
import { util, type TMat2D } from "#fabric";

export type TextUnitKind = "line" | "word" | "char";

export interface TextUnitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Une unité : sa plage de graphèmes [start, end) et une boîte par ligne affichée. */
export interface TextUnit {
  index: number;
  start: number;
  end: number;
  text: string;
  boxes: TextUnitBox[];
}

/** La tuile d'une boîte d'unité : son image, à `box` (marge comprise), en repère local. */
export interface TextTile {
  box: TextUnitBox;
  part: TextLayerPart;
  canvas: HTMLCanvasElement;
}

export interface TextUnitTiles {
  units: (TextUnit & { tiles: TextTile[] })[];
  /** Les couches peintes, dans l'ordre d'empilement. */
  parts: TextLayerPart[];
  /** Repère local du texte → canvas (la `calcTransformMatrix` de l'objet). */
  matrix: TMat2D;
  /** La résolution des tuiles (pixels de tuile par unité locale). */
  resolution: number;
}

/** Ce que ce module lit d'un texte Fabric (Textbox) — internes compris. */
interface FabricTextInternals {
  text: string;
  width: number;
  height: number;
  opacity: number;
  lineHeight: number;
  objectCaching: boolean;
  dirty: boolean;
  strokeWidth: number;
  stroke?: unknown;
  shadow?: { blur?: number; offsetX?: number; offsetY?: number } | null;
  _textLines: string[][];
  __charBounds: { left: number; width: number }[][];
  missingNewlineOffset(lineIndex: number): number;
  measureLine(lineIndex: number): unknown;
  getHeightOfLine(lineIndex: number): number;
  _getLeftOffset(): number;
  _getTopOffset(): number;
  _getLineLeftOffset(lineIndex: number): number;
  graphemeSplit(text: string): string[];
  calcTransformMatrix(): TMat2D;
  render(ctx: CanvasRenderingContext2D): void;
  _renderChar(...args: unknown[]): void;
  _renderTextLinesBackground(ctx: CanvasRenderingContext2D): void;
  _renderTextDecoration(ctx: CanvasRenderingContext2D, type: string): void;
  styleHas(prop: string, lineIndex?: number): boolean;
}

const WHITESPACE = /\s/;

/** Le texte vu par ce module. */
function internals(text: object): FabricTextInternals {
  return text as unknown as FabricTextInternals;
}

/** L'index (en graphèmes) du premier caractère de chaque ligne affichée. */
function lineStarts(t: FabricTextInternals): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (let line = 0; line < t._textLines.length; line++) {
    starts.push(acc);
    acc += t._textLines[line].length + t.missingNewlineOffset(line);
  }
  return starts;
}

/** Les mesures d'une ligne (Fabric les vide entre deux passes : on les redemande). */
function boundsOf(t: FabricTextInternals, line: number): { left: number; width: number }[] {
  if (!t.__charBounds[line]) t.measureLine(line);
  return t.__charBounds[line];
}

/**
 * Les unités d'un texte, dans l'ordre de lecture. Un mot coupé par le retour à la ligne
 * (mot trop long) reste un mot, avec une boîte par morceau.
 */
export function textUnits(text: object, kind: TextUnitKind): TextUnit[] {
  const t = internals(text);
  const starts = lineStarts(t);
  const units: TextUnit[] = [];
  let current: TextUnit | null = null;
  let leading: number | null = null; // espaces avant la première unité
  let prevAbs = -2;
  let prevSpace = true;

  for (let line = 0; line < t._textLines.length; line++) {
    const graphemes = t._textLines[line];
    for (let ch = 0; ch < graphemes.length; ch++) {
      const abs = starts[line] + ch;
      const space = WHITESPACE.test(graphemes[ch]);
      // Rien d'escamoté depuis le graphème précédent (ni espace mangé, ni saut de ligne) :
      // un mot coupé en fin de ligne continue sur la suivante.
      const contiguous = abs === prevAbs + 1;
      const opens =
        kind === "line" ? ch === 0
          : kind === "char" ? !space
            : !space && (prevSpace || !contiguous);

      if (opens) {
        current = { index: units.length, start: leading ?? abs, end: abs + 1, text: "", boxes: [] };
        leading = null;
        units.push(current);
      } else if (current) {
        current.end = abs + 1;
      } else {
        leading ??= abs;
      }
      prevAbs = abs;
      prevSpace = space;
    }
  }

  for (const unit of units) {
    unit.boxes = rangeBoxes(t, starts, unit.start, unit.end);
    unit.text = t.graphemeSplit(t.text).slice(unit.start, unit.end).join("");
  }
  return units;
}

/**
 * Les boîtes d'une plage, une par ligne qu'elle touche : du bord gauche de son premier
 * caractère au bord gauche du caractère qui la suit (la sentinelle de fin de ligne pour le
 * dernier), sur la hauteur de la ligne — les boîtes voisines se touchent exactement.
 */
function rangeBoxes(t: FabricTextInternals, starts: number[], start: number, end: number): TextUnitBox[] {
  const boxes: TextUnitBox[] = [];
  let top = t._getTopOffset();
  for (let line = 0; line < t._textLines.length; line++) {
    const height = t.getHeightOfLine(line);
    const from = Math.max(start - starts[line], 0);
    const to = Math.min(end - starts[line], t._textLines[line].length);
    if (to > from) {
      const bounds = boundsOf(t, line);
      const left = t._getLeftOffset() + t._getLineLeftOffset(line);
      const x0 = left + bounds[from].left;
      const x1 = left + (bounds[to]?.left ?? bounds[to - 1].left + bounds[to - 1].width);
      boxes.push({ x: x0, y: top, w: x1 - x0, h: height });
    }
    top += height;
  }
  return boxes;
}

/**
 * Les couches d'un texte, dans l'ordre où Fabric les peint : `under` (fond de texte,
 * souligné), `glyphs`, `over` (surligné, barré). Une animation qui déplace ses unités garde
 * l'ordre d'empilement en posant toutes les couches `under`, puis les `glyphs`, puis les
 * `over` : le fond d'un mot ne passe jamais sur le débord d'un glyphe voisin.
 */
export type TextLayerPart = "under" | "glyphs" | "over";

const PARTS: TextLayerPart[] = ["under", "glyphs", "over"];

/** Les couches que ce texte peint vraiment (les glyphes toujours). */
export function textParts(text: object): TextLayerPart[] {
  const t = internals(text);
  const has = (prop: string) => Boolean((t as unknown as Record<string, unknown>)[prop]) || t.styleHas(prop);
  return PARTS.filter((part) =>
    part === "glyphs" ? true
      : part === "under" ? has("textBackgroundColor") || has("underline")
        : has("overline") || has("linethrough"));
}

export interface RenderRangeOptions {
  /** Les boîtes de la plage : le fond et les décorations y sont coupés. */
  clip?: TextUnitBox[];
  /** La couche à peindre (toutes par défaut). */
  part?: TextLayerPart | "all";
}

/**
 * Dessine la plage [start, end) d'un texte, comme `text.render(ctx)` dessinerait le texte
 * entier (transformation, opacité, ombre, contour compris) : seuls les glyphes de la plage
 * sont tracés ; le fond de texte et les décorations sont coupés aux boîtes de la plage.
 *
 * Le cache de l'objet est contourné le temps du rendu (il porte le texte entier).
 */
export function renderTextRange(
  text: object,
  ctx: CanvasRenderingContext2D,
  start: number,
  end: number,
  { clip, part = "all" }: RenderRangeOptions = {},
): void {
  const t = internals(text);
  const starts = lineStarts(t);
  const boxes = clip ?? rangeBoxes(t, starts, start, end);
  const paints = (p: TextLayerPart) => part === "all" || part === p;
  const inRange = (line: number, ch: number) => {
    const abs = starts[line] + ch;
    return abs >= start && abs < end;
  };

  const proto = Object.getPrototypeOf(t) as FabricTextInternals;
  const clipped = (c: CanvasRenderingContext2D, draw: () => void) => {
    c.save();
    c.beginPath();
    for (const b of boxes) c.rect(b.x, b.y, b.w, b.h);
    c.clip();
    draw();
    c.restore();
  };

  /**
   * `_renderChar(method, ctx, line, charIndex, run, left, top)` : Fabric tire un graphème à
   * la fois quand le texte a un espacement de caractères (la lib en pose toujours un), sinon
   * des suites de graphèmes au même style — `charIndex` est alors le DERNIER de la suite
   * (0 et la ligne entière sur le chemin rapide). D'une suite à cheval sur la plage, on trace
   * d'un bloc chaque morceau contigu qui y tombe, à sa position mesurée : le crénage reste
   * celui de la suite, sauf à la coupure.
   */
  t._renderChar = function (method: string, c: CanvasRenderingContext2D, line: number, charIndex: number,
    run: string, left: number, top: number) {
    if (!paints("glyphs")) return;
    const graphemes = t.graphemeSplit(run);
    const last = graphemes.length > 1 && charIndex === 0 ? graphemes.length - 1 : charIndex;
    const first = last - graphemes.length + 1;
    const inside = graphemes.map((_, i) => inRange(line, first + i));
    if (inside.every(Boolean)) return proto._renderChar.call(t, method, c, line, charIndex, run, left, top);

    const bounds = boundsOf(t, line);
    for (let i = 0; i < graphemes.length; i++) {
      if (!inside[i]) continue;
      let j = i;
      while (j + 1 < graphemes.length && inside[j + 1]) j++;
      const x = left + bounds[first + i].left - bounds[first].left;
      proto._renderChar.call(t, method, c, line, first + j, graphemes.slice(i, j + 1).join(""), x, top);
      i = j;
    }
  };
  t._renderTextLinesBackground = (c) => {
    if (paints("under")) clipped(c, () => proto._renderTextLinesBackground.call(t, c));
  };
  t._renderTextDecoration = (c, type) => {
    if (paints(type === "underline" ? "under" : "over")) clipped(c, () => proto._renderTextDecoration.call(t, c, type));
  };

  const caching = t.objectCaching;
  t.objectCaching = false;
  try {
    t.render(ctx);
  } finally {
    delete (t as Partial<FabricTextInternals>)._renderChar;
    delete (t as Partial<FabricTextInternals>)._renderTextLinesBackground;
    delete (t as Partial<FabricTextInternals>)._renderTextDecoration;
    t.objectCaching = caching;
    t.dirty = true;
  }
}

/**
 * La marge d'une tuile autour de sa boîte : ce qu'un glyphe peut déborder de sa chasse
 * (italique, jambage, accent) — un tiers de la plus grande police du texte —, plus le
 * contour et l'ombre.
 */
export function tilePadding(text: object): number {
  const t = internals(text);
  let size = 0;
  for (let line = 0; line < t._textLines.length; line++) size = Math.max(size, t.getHeightOfLine(line) / t.lineHeight);
  const stroke = t.stroke ? t.strokeWidth || 0 : 0;
  const s = t.shadow;
  const shadow = s ? (s.blur || 0) + Math.max(Math.abs(s.offsetX || 0), Math.abs(s.offsetY || 0)) : 0;
  return Math.ceil(Math.max(4, size / 3) + stroke + shadow);
}

/**
 * Les tuiles d'un texte : par unité, une image par boîte et par couche peinte (`textParts`),
 * marge comprise, rendue dans le repère local du texte (non tourné). Pour les poser, le
 * consommateur applique `matrix` à un conteneur, y place chaque tuile à `tile.box`, et
 * empile les couches dans l'ordre `under`, `glyphs`, `over`.
 *
 * Un texte ni tourné ni retourné a ses tuiles et ses coupes calées sur la grille de pixels
 * du canvas : reposées telles quelles, elles redonnent son image au pixel près.
 *
 * `resolution` : pixels de tuile par unité locale (1 : la taille du document).
 */
export function textUnitTiles(
  text: object,
  kind: TextUnitKind,
  { resolution = 1, pad = tilePadding(text) }: { resolution?: number; pad?: number } = {},
): TextUnitTiles {
  const t = internals(text);
  const matrix = t.calcTransformMatrix();
  const toLocal = util.invertTransform(matrix);
  const parts = textParts(text);

  const [a, b, c, d, e, f] = matrix;
  const aligned = b === 0 && c === 0 && a > 0 && d > 0;
  const snapX = (v: number, round: (n: number) => number) => (aligned ? (round(v * a + e) - e) / a : v);
  const snapY = (v: number, round: (n: number) => number) => (aligned ? (round(v * d + f) - f) / d : v);
  // Les coupes du fond et des décorations. Entre deux unités voisines, la frontière est
  // arrondie (pas plancher/plafond) : les deux boîtes tombent sur la même colonne de pixels,
  // sans couture. Au bord extérieur du texte (début et fin de ligne, haut de la première
  // ligne, bas de la dernière), la coupe s'écarte de la marge : rien n'y est rogné.
  const all = textUnits(text, kind);
  const flat = all.flatMap((u) => u.boxes);
  const lineLeft = new Map<number, number>();
  const lineRight = new Map<number, number>();
  for (const r of flat) {
    lineLeft.set(r.y, Math.min(lineLeft.get(r.y) ?? Infinity, r.x));
    lineRight.set(r.y, Math.max(lineRight.get(r.y) ?? -Infinity, r.x + r.w));
  }
  const top = Math.min(...flat.map((r) => r.y));
  const bottom = Math.max(...flat.map((r) => r.y + r.h));
  const clipBox = (r: TextUnitBox): TextUnitBox => {
    const x0 = r.x === lineLeft.get(r.y) ? r.x - pad : snapX(r.x, Math.round);
    const x1 = r.x + r.w === lineRight.get(r.y) ? r.x + r.w + pad : snapX(r.x + r.w, Math.round);
    const y0 = r.y === top ? r.y - pad : snapY(r.y, Math.round);
    const y1 = r.y + r.h === bottom ? r.y + r.h + pad : snapY(r.y + r.h, Math.round);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const units = all.map((unit) => {
    const clip = unit.boxes.map(clipBox);
    const tiles = unit.boxes.flatMap((r) => {
      const x0 = snapX(r.x - pad, Math.floor);
      const y0 = snapY(r.y - pad, Math.floor);
      const box = { x: x0, y: y0, w: snapX(r.x + r.w + pad, Math.ceil) - x0, h: snapY(r.y + r.h + pad, Math.ceil) - y0 };
      return parts.map((part) => {
        const canvas = util.createCanvasElement();
        canvas.width = Math.max(1, Math.ceil(box.w * resolution));
        canvas.height = Math.max(1, Math.ceil(box.h * resolution));
        // La boîte couvre le canvas entier : reposée à sa taille, la tuile n'est pas étirée.
        box.w = canvas.width / resolution;
        box.h = canvas.height / resolution;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.scale(resolution, resolution);
        ctx.translate(-box.x, -box.y);
        ctx.transform(...toLocal);
        renderTextRange(text, ctx, unit.start, unit.end, { clip, part });
        return { box, part, canvas };
      });
    });
    return { ...unit, tiles };
  });

  return { units, parts, matrix, resolution };
}
