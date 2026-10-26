import { Textbox, Point, controlsUtils } from "#fabric";
import { type SizingData, type TextOverflow } from "../layout/types";
import { resolveTextBox, type TextConstraint, type TextMeasure } from "../layout/text-box";
import { layoutOf, parentIdOf, isFreeContainer } from "../layout/model";
import { parentOf } from "../layout/hierarchy";
import { scaleText, textScaleState, type TextScaleState } from "../layout/text";
import { cornerScaleFactor } from "../shapes/resizeUtils";
import { tokenColorOf } from "../tokens";

const { changeObjectWidth, changeObjectHeight } = controlsUtils;

/** Le début d'un geste de coin : le texte tel qu'on l'a pris. */
interface CornerStart {
  transform: unknown;
  state: TextScaleState;
}

/** Largeur de mesure « sans contrainte » (une ligne par paragraphe). */
const UNBOUNDED_WIDTH = 10000;

/**
 * Textbox de l'éditeur : un objet de layout comme les autres.
 *
 * Il porte les mêmes modes de taille que les containers (`layout.sizing`), son
 * « contenu » étant son texte :
 * - largeur `hug` : une ligne, la boîte suit le texte ; `fixed` : wrap à la largeur ;
 *   dans les deux cas, jamais plus large que la place que donne le container (le
 *   container pousse la largeur fixe, qui reste acquise) ;
 * - hauteur `hug` : la boîte suit le texte, avec un plancher `minSize.h` posé par les
 *   poignées ; `fixed` : la boîte garde sa hauteur et `layout.overflow` décide
 *   (réduire la police, couper, déborder).
 *
 * La boîte est calculée par `resolveTextBox` (layout/text-box.ts) ; le texte ne fait
 * que fournir la mesure et appliquer le résultat.
 *
 * Contrainte du container : un seul écrivain, le moteur de layout (`layoutWith`, à
 * chaque passe). Fabric recalcule aussi le texte de lui-même, hors de toute passe et
 * sans événement pour relancer le layout (sortie d'édition, rendu après un changement
 * de styles) : ce recalcul reprend la dernière contrainte reçue. Un enfant jamais mis
 * en page (document tout juste chargé) s'affiche tel que sauvegardé ; un texte hors
 * container ignore toute contrainte.
 *
 * Les poignées ne déforment jamais (jamais de scale) : un bord change la boîte, un coin
 * agrandit le texte avec elle, proportions gardées — la police absorbe le facteur
 * (`scaleText`, layout/text.ts), comme pour tout agrandissement proportionnel d'un texte.
 *
 * `fontSize` est la taille effective (celle qui est rendue et sauvegardée, pour qu'un
 * document s'affiche juste sans relayout) ; `fontSizeIntent` est la taille voulue par
 * l'utilisateur, d'où repart l'autofit à chaque calcul.
 *
 * Hérite de Textbox (et non IText) pour le line-wrapping natif. Place aussi le textarea
 * caché dans le container du canvas, pour le focus dans les modales (`showModal()`
 * piège le focus hors du dialog).
 */
type WordEntry = { word: string[]; width: number; _isChunk?: boolean };
type GraphemeData = {
  largestWordWidth: number;
  wordsData: WordEntry[][];
};

export class CustomTextbox extends Textbox {
  static customProperties = ["fontSizeIntent", "placeholder"];

  /** Taille de police voulue — l'effective (`fontSize`) peut être réduite par l'autofit. */
  declare fontSizeIntent: number;

  /**
   * Le texte est encore l'exemple posé à sa création (« Tapez votre texte ici ») : personne
   * n'a tapé dedans. L'hôte s'en sert pour qu'une variable insérée REMPLACE l'exemple au
   * lieu de s'y ajouter. Levé à la première frappe qui change le texte, ou par
   * `setTextContent` — jamais au simple focus. Sérialisé avec le calque.
   */
  declare placeholder?: boolean;

  /** Le contenu dépasse la boîte (overflow clip / visible). */
  declare _overflowing?: boolean;

  /** Dernière contrainte reçue du container (absente : jamais mis en page). */
  declare _constraint?: TextConstraint;

  constructor(text: string, options?: Record<string, unknown>) {
    super(text, options);
    if (typeof options?.fontSizeIntent === "number") this.fontSizeIntent = options.fontSizeIntent;
    this.fontSizeIntent ??= this.fontSize;
    this._bakeLegacyScale();
    this._ensureSizing(options?.width != null);
    this.initDimensions();
    this.setCoords();
  }

  // ── Sizing ─────────────────────────────────────────────────────────

  /**
   * Sans bloc `sizing` (le temps de la construction, avant _ensureSizing), la boîte
   * stockée fait foi : largeur fixe.
   */
  get sizing(): SizingData {
    return layoutOf(this)?.sizing ?? { x: "fixed", y: "hug" };
  }

  get textOverflow(): TextOverflow {
    return layoutOf(this)?.overflow ?? "shrink";
  }

  /** Remplace le bloc `sizing` (nouvel objet `layout`, jamais muté en place). */
  setSizing(sizing: SizingData): void {
    const layout = layoutOf(this) ?? {};
    this.set("layout", { ...layout, sizing });
    this.initDimensions();
    this.setCoords();
  }

  setTextOverflow(overflow: TextOverflow): void {
    const layout = layoutOf(this) ?? {};
    this.set("layout", { ...layout, overflow });
    this.initDimensions();
    this.setCoords();
  }

  /** Largeur naturelle à la police courante : la plus longue ligne, sans wrap. */
  naturalWidth(): number {
    this.width = UNBOUNDED_WIDTH;
    super.initDimensions();
    return Math.ceil(this.calcTextWidth());
  }

  /**
   * Largeur minimale du texte : son graphème le plus large. Un mot trop long se découpe
   * (break-word, `getGraphemeDataForRender`), donc rien n'arrête une poignée avant la
   * lettre — le même plancher que Fabric impose de lui-même (`dynamicMinWidth`) une fois
   * le texte wrappé à cette largeur. Mesuré en wrappant à 1 px, puis la boîte est remise
   * telle quelle.
   */
  minContentWidth(): number {
    const { width, height } = this;
    this._wrapAt(1);
    const min = Math.ceil(this.dynamicMinWidth);
    this._wrapAt(width);
    this.height = height;
    return min;
  }

  // ── Tokens atomiques ───────────────────────────────────────────────

  /**
   * Les plages atomiques du texte (les variables d'un texte lié, posées par l'hôte), en
   * index plats de graphèmes sans les retours à la ligne — la convention des styles
   * sérialisés. Non sérialisé : l'hôte les recalcule à l'affichage et pendant l'édition.
   * Le curseur les saute, une suppression les emporte entières, une plage s'étend à leurs
   * bornes ; une pastille les montre (`drawTokenPills`).
   */
  declare tokenSpans?: [number, number][];

  /** La sélection d'avant le dernier mouvement : dit dans quel sens on traverse un token. */
  private _lastSelection: [number, number] = [0, 0];

  /** Les plages atomiques en index de `_text` (graphèmes, retours à la ligne compris). */
  atomicSpans(): [number, number][] {
    const spans = (this.tokenSpans ?? []).filter(([start, end]) => end > start);
    if (spans.length === 0) return [];

    // index plat → index de `_text`, en une passe ; une borne au-delà du texte vaut sa fin
    const at: number[] = [];
    this._text.forEach((grapheme, i) => grapheme !== "\n" && at.push(i));
    const textIndex = (flat: number) => at[flat] ?? this._text.length;
    return spans.map(([start, end]) => [textIndex(start), textIndex(end - 1) + 1]);
  }

  /** Toute sélection passe ici avant d'être annoncée : elle se cale sur les tokens. */
  _fireSelectionChanged(): void {
    this._snapSelectionToTokens();
    this._lastSelection = [this.selectionStart, this.selectionEnd];
    super._fireSelectionChanged();
  }

  /**
   * Un curseur dans un token en sort : d'un pas (flèche), de l'autre côté ; sinon (clic) à
   * la borne la plus proche. Une plage s'étend aux bornes des tokens qu'elle coupe.
   */
  private _snapSelectionToTokens(): void {
    const spans = this.atomicSpans();
    if (spans.length === 0) return;

    const inside = (i: number) => spans.find(([start, end]) => start < i && i < end);
    const { selectionStart: start, selectionEnd: end } = this;
    if (start === end) {
      const span = inside(start);
      if (!span) return;
      const [from, to] = span;
      const [last] = this._lastSelection;
      const stepped = Math.abs(start - last) === 1;
      let at: number;
      if (stepped && last <= from) at = to;
      else if (stepped && last >= to) at = from;
      else at = start - from <= to - start ? from : to;
      this.selectionStart = this.selectionEnd = at;
      return;
    }
    const head = inside(start);
    const tail = inside(end);
    if (head) this.selectionStart = head[0];
    if (tail) this.selectionEnd = tail[1];
  }

  /**
   * Retour arrière juste après un token, ou Suppr juste avant : le token est d'abord
   * sélectionné (textarea compris), puis la suppression native l'emporte entier — on ne
   * touche jamais au flux de saisie de Fabric.
   */
  onKeyDown(e: KeyboardEvent): void {
    const erase = e.key === "Backspace" || e.key === "Delete";
    if (this.isEditing && erase && this.selectionStart === this.selectionEnd && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const at = this.selectionStart;
      const span = this.atomicSpans().find(([start, end]) => (e.key === "Backspace" ? end === at : start === at));
      if (span) {
        [this.selectionStart, this.selectionEnd] = span;
        this._updateTextarea();
      }
    }
    super.onKeyDown(e);
  }

  /** Une frappe (ou un collage) qui change le texte : ce n'est plus l'exemple. */
  onInput(e: Event): void {
    const before = this.text;
    super.onInput(e);
    if (this.placeholder && this.text !== before) this.placeholder = false;
  }

  /** Fabric efface la zone du texte sur le calque du dessus à chaque clignotement du
   *  curseur : les pastilles du texte en édition sont repeintes avec lui. */
  renderCursorOrSelection(): void {
    super.renderCursorOrSelection();
    const ctx = this.canvas?.contextTop;
    if (this.isEditing && ctx) this.drawTokenPills(ctx);
  }

  /**
   * Une pastille derrière chaque token (couleur d'édition de l'hôte), sur le calque du
   * dessus : un repère d'édition, jamais exporté. `ctx` est en coordonnées écran.
   */
  drawTokenPills(ctx: CanvasRenderingContext2D): void {
    const spans = this.atomicSpans();
    const color = tokenColorOf(this);
    if (spans.length === 0 || !this.canvas || !color) return;

    ctx.save();
    ctx.transform(...(this.canvas.viewportTransform as [number, number, number, number, number, number]));
    ctx.transform(...(this.calcTransformMatrix() as [number, number, number, number, number, number]));
    // Jamais hors de la boîte : Fabric n'efface que la boîte du texte en édition à chaque
    // clignotement, un débord s'y accumulerait (et foncerait)
    ctx.beginPath();
    ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    for (const [start, end] of spans) {
      for (const box of this._tokenBoxes(start, end)) {
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, box.h * 0.25);
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1 / (this.canvas.getZoom() * (this.scaleX || 1));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Les rectangles d'un token, un par ligne affichée (un token peut wrapper) : la boîte des
   * glyphes, celle du fond de texte natif de Fabric — depuis le haut de la ligne, sur la
   * hauteur de police (`getHeightOfLine / lineHeight`) ; l'interligne, en dessous, reste hors
   * de la pastille.
   */
  private _tokenBoxes(start: number, end: number): { x: number; y: number; w: number; h: number }[] {
    const a = this.get2DCursorLocation(start);
    const b = this.get2DCursorLocation(end);
    const pad = this.fontSize * 0.06;
    const boxes = [];
    let top = this._getTopOffset();
    for (let line = 0; line <= b.lineIndex && line < this._textLines.length; line++) {
      if (line >= a.lineIndex) {
        const from = line === a.lineIndex ? a.charIndex : 0;
        const to = line === b.lineIndex ? b.charIndex : this._textLines[line].length;
        // Fabric vide ses mesures par caractère entre deux passes : on les redemande
        if (!this.__charBounds[line]) this.measureLine(line);
        const bounds = this.__charBounds[line];
        if (to > from && bounds?.[from] && bounds[to - 1]) {
          const left = this._getLeftOffset() + this._getLineLeftOffset(line);
          const glyphs = this.getHeightOfLine(line) / this.lineHeight;
          boxes.push({
            x: left + bounds[from].left - pad,
            y: top,
            w: bounds[to - 1].left + bounds[to - 1].width - bounds[from].left + 2 * pad,
            h: glyphs,
          });
        }
      }
      top += this.getHeightOfLine(line);
    }
    return boxes;
  }

  /**
   * Pas de glisser-déposer du texte sélectionné (Fabric) : presser sur une plage sélectionnée
   * et tirer re-sélectionne, comme dans un champ de texte — le glisser-déposer emportait le
   * texte quand on voulait étendre la sélection.
   */
  initBehavior(): void {
    super.initBehavior();
    this.draggableTextDelegate.start = () => false;
  }

  /**
   * Une passe de layout : calcule la boîte sous la contrainte du container et la
   * retient. `null` : le texte a quitté son container.
   */
  layoutWith(constraint: TextConstraint | null): void {
    if (constraint) this._constraint = constraint;
    else delete this._constraint;
    this.initDimensions();
  }

  /** Recalcul (Fabric, ou layoutWith) sous la contrainte courante. */
  initDimensions(): void {
    if (!this.initialized) {
      super.initDimensions();
      return;
    }
    if (!this._isChild()) this._applyBox({});
    else this._applyBox(this._constraint ?? "as-stored");
  }

  private _applyBox(constraint: TextConstraint | "as-stored"): void {
    // Avant la mesure : elle mute l'objet (largeur, police) le temps de résoudre la boîte
    const before = { width: this.width, height: this.height, fontSize: this.fontSize };
    const box = resolveTextBox({
      sizing: this.sizing,
      overflow: this.textOverflow,
      constraint,
      fontSizeIntent: this.fontSizeIntent ?? this.fontSize,
      fontSize: this.fontSize,
      width: this.width,
      height: this.height,
    }, this._measure());

    // Laisse Fabric dans l'état final (lignes wrappées à la bonne police), puis la boîte
    this.fontSize = box.fontSize;
    this._wrapAt(box.width);
    this.height = box.height;
    this._overflowing = box.overflowing;

    // Affectations directes (pas de set()) : Fabric ne sait pas que son cache de rendu
    // est périmé — sans ça, un texte recalculé par le layout s'affiche dans son ancienne
    // boîte jusqu'à la prochaine interaction.
    if (before.width !== this.width || before.height !== this.height || before.fontSize !== this.fontSize) {
      this.dirty = true;
    }
    // Le cache Fabric est taillé sur la boîte : un débordement visible doit s'en passer.
    this.objectCaching = !(box.overflowing && this.textOverflow === "visible");
  }

  /**
   * Mesure via Fabric (mute l'objet ; _applyBox pose l'état final ensuite). Méthode et
   * non champ : Fabric mesure déjà pendant le super() du constructeur.
   */
  private _measure(): TextMeasure {
    return {
      wrapped: (width, fontSize) => {
        this.fontSize = fontSize;
        this._wrapAt(width);
        return { width: this.width, height: this.height };
      },
      natural: (fontSize) => {
        this.fontSize = fontSize;
        return this.naturalWidth();
      },
    };
  }

  /** Wrap à `width` puis mesure (la largeur peut grandir au mot le plus long). */
  private _wrapAt(width: number): void {
    this.width = width;
    super.initDimensions();
  }

  /** Toute nouvelle `fontSize` posée via set() est une intention de l'utilisateur. */
  _set(key: string, value: any): this {
    if (key === "fontSize") this.fontSizeIntent = value;
    return super._set(key, value);
  }

  /** overflow "clip" : le texte est coupé au bord de sa boîte. */
  _render(ctx: CanvasRenderingContext2D): void {
    if (!this._overflowing || this.textOverflow !== "clip") {
      super._render(ctx);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.clip();
    super._render(ctx);
    ctx.restore();
  }

  // ── Poignées ───────────────────────────────────────────────────────

  /**
   * Bord gauche/droit : la largeur passe en fixe et prend la valeur tirée.
   * Bord haut/bas : en hauteur contenu, pose le plancher `minSize.h` ; en hauteur fixe,
   * change la hauteur.
   */
  handleEdgeResize(transform: any, x: number, y: number): boolean {
    const corner: string = transform.corner;
    return corner === "ml" || corner === "mr"
      ? this._withAnchor(transform, () => this._resizeWidth(transform, x, y))
      : this._withAnchor(transform, () => this._resizeHeight(transform, x, y));
  }

  /**
   * Coin : le texte et sa boîte grandissent ensemble, proportions gardées, le coin opposé
   * immobile. Le facteur est celui de toute poignée de coin (cornerScaleFactor), appliqué
   * depuis l'état du début du geste : les modes de taille ne changent pas, la police
   * absorbe tout.
   */
  handleCornerResize(transform: any, x: number, y: number): boolean {
    let start = this._cornerStart;
    if (!start || start.transform !== transform) {
      start = { transform, state: textScaleState(this) };
      this._cornerStart = start;
    }
    const k = cornerScaleFactor(this, transform, x, y);

    return this._withAnchor(transform, () => {
      const before = { width: this.width, height: this.height, fontSize: this.fontSize };
      scaleText(this, start.state, k);
      return before.width !== this.width || before.height !== this.height || before.fontSize !== this.fontSize;
    });
  }

  /** Le geste de coin en cours (un par objet `transform` de Fabric). */
  private _cornerStart?: CornerStart;

  /**
   * Taille programmatique (`setShapeSize`, comme une forme) : le facteur uniforme — la
   * moyenne des deux axes — passe dans la police, jamais dans un scale.
   */
  setSize(w: number, h: number): void {
    const k = (w / (this.width || 1) + h / (this.height || 1)) / 2;
    scaleText(this, textScaleState(this), k);
  }

  /** Placé par une pile — un groupe (container libre) laisse ses enfants à leur propre taille. */
  private _isChild(): boolean {
    if (parentIdOf(this) == null) return false;
    const parent = parentOf(this);
    // Parent introuvable (texte hors canvas, document en cours de chargement) : il est
    // traité en enfant de pile, sa boîte reste celle reçue ou sauvegardée
    return !isFreeContainer(parent);
  }

  private _withAnchor(transform: any, resize: () => boolean): boolean {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const changed = resize();
    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }

  private _resizeWidth(transform: any, x: number, y: number): boolean {
    if (this.sizing.x !== "fixed") {
      const layout = layoutOf(this) ?? {};
      this.set("layout", { ...layout, sizing: { ...this.sizing, x: "fixed" } });
    }
    // set("width") relance initDimensions (width est une textLayoutProperty)
    return changeObjectWidth({} as any, transform, x, y);
  }

  private _resizeHeight(transform: any, x: number, y: number): boolean {
    const before = this.height;
    if (!changeObjectHeight({} as any, transform, x, y)) return false;
    const sizing = this.sizing;
    if (sizing.y === "hug") {
      const minSize = { w: sizing.minSize?.w ?? 0, h: this.height };
      const layout = layoutOf(this) ?? {};
      this.set("layout", { ...layout, sizing: { ...sizing, minSize } });
    }
    this.initDimensions();
    return before !== this.height;
  }

  // ── Données legacy ─────────────────────────────────────────────────

  /**
   * Un texte étiré (scaleX/scaleY) est ramené à scale 1 : le scale passe dans la
   * largeur et la police (`scaleText`). Exact pour un scale uniforme ; un étirement non
   * uniforme est perdu (les glyphes reprennent leurs proportions, la largeur garde son
   * propre facteur).
   */
  private _bakeLegacyScale(): void {
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    if (sx === 1 && sy === 1) return;
    const state = textScaleState(this);
    this.scaleX = 1;
    this.scaleY = 1;
    scaleText(this, state, sy);
    this.width = state.width * sx;
  }

  /**
   * Un texte sans `layout.sizing` (nouveau, ou document d'avant les modes de taille)
   * reçoit un mode explicite :
   * - nouveau texte, ou enfant de container (sa largeur était dictée par le container) :
   *   largeur contenu ;
   * - sinon : largeur contenu si la boîte épouse le texte sur une ligne, fixe sinon
   *   (texte qui wrappe, ou boîte élargie pour un alignement).
   */
  private _ensureSizing(hasExplicitWidth: boolean): void {
    const layout = layoutOf(this);
    if (layout?.sizing) return;

    let x: "hug" | "fixed" = "hug";
    if (hasExplicitWidth && !layout?.child) {
      const width = this.width;
      const natural = this.naturalWidth();
      this.width = width;
      if (Math.abs(width - natural) > 2) x = "fixed";
    }
    this.set("layout", { ...(layout ?? {}), sizing: { x, y: "hug" } });
  }

  /**
   * overflow-wrap: break-word — pré-découpe les mots trop longs
   * en chunks et les marque pour que _wrapLine ne mette pas
   * d'espace entre eux.
   */
  getGraphemeDataForRender(lines: string[]): GraphemeData {
    const data: GraphemeData = super.getGraphemeDataForRender(lines);
    if (!this.width) return data;

    const maxWidth = this.width;
    let newLargest = 0;

    data.wordsData = data.wordsData.map((lineWords, lineIndex) =>
      lineWords.flatMap((entry) => {
        if (entry.width <= maxWidth) {
          newLargest = Math.max(newLargest, entry.width);
          return [entry];
        }
        const chunks: WordEntry[] = [];
        let chunk: string[] = [];
        let chunkWidth = 0;
        let offset = 0;

        for (const grapheme of entry.word) {
          const gWidth = this._measureWord([grapheme], lineIndex, offset);
          if (chunkWidth + gWidth > maxWidth && chunk.length > 0) {
            chunks.push({ word: chunk, width: chunkWidth, _isChunk: chunks.length > 0 });
            newLargest = Math.max(newLargest, chunkWidth);
            chunk = [];
            chunkWidth = 0;
          }
          chunk.push(grapheme);
          chunkWidth += gWidth;
          offset++;
        }
        if (chunk.length > 0) {
          chunks.push({ word: chunk, width: chunkWidth, _isChunk: chunks.length > 0 });
          newLargest = Math.max(newLargest, chunkWidth);
        }
        return chunks;
      }),
    );

    data.largestWordWidth = newLargest;
    return data;
  }

  /**
   * Copie fidèle de Textbox._wrapLine, sauf :
   * - pas d'espace (infix) entre les chunks d'un même mot (_isChunk)
   * - pas d'incrément d'offset pour l'espace entre chunks
   */
  _wrapLine(
    lineIndex: number,
    desiredWidth: number,
    { largestWordWidth, wordsData }: GraphemeData,
    reservedSpace = 0,
  ): string[][] {
    const additionalSpace = this._getWidthOfCharSpacing();
    const graphemeLines: string[][] = [];

    let lineWidth = 0;
    let line: string[] = [];
    let offset = 0;
    let infixWidth = 0;
    let lineJustStarted = true;

    desiredWidth -= reservedSpace;
    const maxWidth = Math.max(desiredWidth, largestWordWidth, this.dynamicMinWidth);

    const data = wordsData[lineIndex];
    offset = 0;
    let i;
    for (i = 0; i < data.length; i++) {
      const entry = data[i];
      const { word, width: wordWidth } = entry;
      const isChunk = !!(entry as WordEntry)._isChunk;

      offset += word.length;

      lineWidth += (isChunk ? 0 : infixWidth) + wordWidth - additionalSpace;
      if (lineWidth > maxWidth && !lineJustStarted) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
      } else {
        lineWidth += additionalSpace;
      }

      if (!lineJustStarted && !isChunk) {
        line.push(' ');
      }
      line = line.concat(word);

      if (isChunk) {
        infixWidth = 0;
      } else {
        infixWidth = this._measureWord([' '], lineIndex, offset);
        offset++;
      }
      lineJustStarted = false;
    }

    i && graphemeLines.push(line);

    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    }
    return graphemeLines;
  }

  /**
   * Fix curseur : missingNewlineOffset retourne toujours 1 en mode
   * non-splitByGrapheme car Fabric suppose que chaque wrap mange un
   * espace. Pour les coupures mid-word, il n'y a pas d'espace → 0.
   */
  missingNewlineOffset(lineIndex: number, skipWrapping?: boolean): 0 | 1 {
    if (skipWrapping) return 1;
    if (!this._styleMap[lineIndex + 1]) return 1;
    if (this._styleMap[lineIndex + 1].line !== this._styleMap[lineIndex].line) {
      return 1;
    }
    // Wrap mid-line : vérifier si un espace a été mangé.
    // Si l'offset de la ligne suivante == offset courant + longueur courante,
    // alors pas d'espace mangé (coupure mid-word) → 0
    const currentOffset = this._styleMap[lineIndex].offset;
    const currentLen = this._textLines[lineIndex].length;
    const nextOffset = this._styleMap[lineIndex + 1].offset;
    if (nextOffset === currentOffset + currentLen) {
      return 0; // mid-word break, pas d'espace mangé
    }
    return 1; // espace mangé (wrap normal)
  }

  /**
   * Override pour ajouter le textarea au canvas container
   * au lieu du body (comportement par défaut de Fabric.js).
   */
  initHiddenTextarea(): void {
    super.initHiddenTextarea();

    // Déplacer le textarea dans le canvas container
    if (this.hiddenTextarea && this.canvas) {
      const wrapper = this.canvas.getElement()?.parentElement;
      if (wrapper && this.hiddenTextarea.parentElement !== wrapper) {
        wrapper.appendChild(this.hiddenTextarea);
      }
    }
  }

  /**
   * Override de la méthode de positionnement du textarea caché.
   * On force la position à (0, 0) pour éviter les problèmes de layout
   * quand le textarea est dans le canvas container.
   */
  _calcTextareaPosition(): {
    left: string;
    top: string;
    fontSize: string;
    charHeight: number;
  } {
    if (!this.canvas) {
      return { left: "1px", top: "1px", fontSize: "1px", charHeight: 1 };
    }

    const desiredPosition = this.inCompositionMode
      ? this.compositionStart
      : this.selectionStart;

    const boundaries = this._getCursorBoundaries(desiredPosition);
    const cursorLocation = this.get2DCursorLocation(desiredPosition);
    const lineIndex = cursorLocation.lineIndex;
    const charIndex = cursorLocation.charIndex;

    const charHeight =
      this.getValueOfPropertyAt(lineIndex, charIndex, "fontSize") *
      this.lineHeight;

    const leftOffset = boundaries.leftOffset;
    const retinaScaling = this.getCanvasRetinaScaling();
    const upperCanvas = this.canvas.upperCanvasEl;
    const upperCanvasWidth = upperCanvas.width / retinaScaling;
    const upperCanvasHeight = upperCanvas.height / retinaScaling;

    const p = new Point(
      boundaries.left + leftOffset,
      boundaries.top + boundaries.topOffset + charHeight
    )
      .transform(this.calcTransformMatrix())
      .transform(this.canvas.viewportTransform)
      .multiply(
        new Point(
          upperCanvas.clientWidth / upperCanvasWidth,
          upperCanvas.clientHeight / upperCanvasHeight
        )
      );

    // Forcer la position à (0, 0) pour éviter que le textarea
    // n'affecte le layout du canvas container
    p.y = 0;
    p.x = 0;

    return {
      left: `${p.x}px`,
      top: `${p.y}px`,
      fontSize: `${charHeight}px`,
      charHeight: charHeight,
    };
  }
}

export default CustomTextbox;
