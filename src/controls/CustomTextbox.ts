import { Textbox, Point } from "#fabric";

/**
 * Textbox personnalisé qui :
 * 1. Place le textarea caché à l'intérieur du canvas container (pour le focus dans les modales)
 * 2. Force sa position à (0, 0) pour éviter les problèmes de layout/scroll
 *
 * Hérite de Textbox (et non IText) pour le line-wrapping natif
 * quand une width fixe est définie (mode layout "largeur fixe").
 *
 * Nécessaire car les modales (dialog) avec showModal() créent un
 * "focus trap" qui empêche le focus d'aller sur des éléments
 * en dehors du dialog. En plaçant le textarea dans le canvas
 * container (qui est dans le dialog), il peut recevoir le focus.
 */
type WordEntry = { word: string[]; width: number; _isChunk?: boolean };
type GraphemeData = {
  largestWordWidth: number;
  wordsData: WordEntry[][];
};

export class CustomTextbox extends Textbox {
  /**
   * Auto-width mode : le textbox s'étend horizontalement au contenu.
   * Désactivé automatiquement quand l'utilisateur resize manuellement.
   */
  _autoWidth = true;

  constructor(text: string, options?: Record<string, unknown>) {
    const hasExplicitWidth = options?.width != null;
    super(text, options);
    // _autoWidth = true est assigné ici par TS (après super).
    // Le super() a déjà appelé initDimensions avec _autoWidth = undefined,
    // donc on relance pour appliquer le mode auto-width.
    if (hasExplicitWidth) {
      this._autoWidth = false;
    } else {
      this.initDimensions();
    }
    // Resize manuel (handles latéraux changent width, scaling change scaleX)
    this.on("resizing", () => { this._autoWidth = false; });
    this.on("scaling", () => { this._autoWidth = false; });
  }

  /** Dernière width calculée par le mode auto-width. */
  private _autoWidthValue = 0;

  /**
   * Override initDimensions : en mode auto-width, on calcule les dimensions
   * avec une width infinie puis on ajuste width au résultat.
   * Si la width entrante diffère de notre dernière valeur auto, c'est un
   * resize externe → on désactive auto-width.
   */
  initDimensions(): void {
    if (this._autoWidth) {
      // Détecter un resize externe (handle latéral, API, etc.)
      if (this._autoWidthValue > 0 && Math.abs(this.width - this._autoWidthValue) > 2) {
        this._autoWidth = false;
        super.initDimensions();
        return;
      }
      // Mesurer sur une seule ligne
      this.width = 10000;
      super.initDimensions();
      const natural = Math.ceil(this.calcTextWidth());
      this.width = natural;
      this._autoWidthValue = natural;
    } else {
      super.initDimensions();
    }
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
