import { Textbox, Point, controlsUtils } from "#fabric";
import { type SizingData, type TextOverflow } from "../layout/types";
import { resolveTextBox, type TextConstraint, type TextMeasure } from "../layout/text-box";
import { layoutOf, parentIdOf, isFreeContainer } from "../layout/model";

const { changeObjectWidth, changeObjectHeight } = controlsUtils;

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
 * Les poignées ne déforment jamais : elles changent la boîte (jamais de scale).
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
  static customProperties = ["fontSizeIntent"];

  /** Taille de police voulue — l'effective (`fontSize`) peut être réduite par l'autofit. */
  declare fontSizeIntent: number;

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
   * Largeur minimale du texte : son mot le plus long (le min-content de CSS). Le
   * découpage des mots trop longs (break-word) n'est qu'un repli, pas un minimum :
   * la mesure se fait hors contrainte (les lignes wrappées sont déjà découpées, un
   * morceau passerait pour un mot), puis la boîte est remise telle quelle.
   */
  minContentWidth(): number {
    const { width, height } = this;
    this.width = UNBOUNDED_WIDTH;
    super.initDimensions();
    const min = Math.ceil(super.getGraphemeDataForRender(this.textLines).largestWordWidth);
    this._wrapAt(width);
    this.height = height;
    return min;
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

  /** Coin : les deux règles des bords à la fois. */
  handleCornerResize(transform: any, x: number, y: number): boolean {
    return this._withAnchor(transform, () => {
      const changedW = this._resizeWidth(transform, x, y);
      const changedH = this._resizeHeight(transform, x, y);
      return changedW || changedH;
    });
  }

  /** Placé par une pile — un groupe (container libre) laisse ses enfants à leur propre taille. */
  private _isChild(): boolean {
    const parentId = parentIdOf(this);
    if (parentId == null) return false;
    const parent = this.canvas?.getObjects().find((o) => o.get("layerId") === parentId);
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
   * largeur et la police. Exact pour un scale uniforme ; un étirement non uniforme est
   * perdu (les glyphes reprennent leurs proportions).
   */
  private _bakeLegacyScale(): void {
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    if (sx === 1 && sy === 1) return;
    this.width *= sx;
    this.height *= sy;
    this.fontSize *= sy;
    this.fontSizeIntent *= sy;
    for (const line of Object.values(this.styles ?? {})) {
      for (const style of Object.values(line as Record<string, { fontSize?: number }>)) {
        if (style.fontSize) style.fontSize *= sy;
      }
    }
    this.scaleX = 1;
    this.scaleY = 1;
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
