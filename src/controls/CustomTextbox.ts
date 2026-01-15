import { IText, Point } from "#fabric";

/**
 * Textbox personnalisé qui :
 * 1. Place le textarea caché à l'intérieur du canvas container (pour le focus dans les modales)
 * 2. Force sa position à (0, 0) pour éviter les problèmes de layout/scroll
 *
 * Nécessaire car les modales (dialog) avec showModal() créent un
 * "focus trap" qui empêche le focus d'aller sur des éléments
 * en dehors du dialog. En plaçant le textarea dans le canvas
 * container (qui est dans le dialog), il peut recevoir le focus.
 */
export class CustomTextbox extends IText {
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
