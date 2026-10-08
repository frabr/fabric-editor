/**
 * Redimensionner un groupe ne pose jamais de `scale` : chaque descendant absorbe
 * l'agrandissement dans ses propres dimensions (une forme sa taille, un texte sa largeur
 * et sa police, une pile ses marges et son espacement), au prorata, autour du coin qui ne
 * bouge pas.
 */
import type { FabricObject } from "#fabric";
import type { ContainerData, SizingData } from "../types";
import { placeTopLeft, scaledSize, setShapeSize, type Box } from "../geometry";
import { isStackContainer, layoutOf } from "../model";
import { descendantsOf } from "../hierarchy";
import { layoutSubtree } from "../run";
import { isTextObject, scaleStyleFontSizes, type TextStyles } from "../text";
import { fitFreeContainer } from "./fit";

/** Ce qu'il faut d'un descendant pour le remettre à l'échelle depuis le début du geste. */
interface ScaledState {
  obj: FabricObject;
  /** Coin haut-gauche et taille. */
  box: Box;
  text?: { width: number; fontSize: number; fontSizeIntent: number; styles: TextStyles; minSize?: SizingData["minSize"] };
  container?: { padding?: ContainerData["padding"]; gap?: number; minSize?: SizingData["minSize"] };
}

const scaleMin = (minSize: SizingData["minSize"], k: number) =>
  minSize && { w: minSize.w * k, h: minSize.h * k };

/**
 * Un redimensionnement de groupe, du premier au dernier instant du geste : chaque étape
 * repart de l'état de départ (pas d'erreur qui s'accumule), au facteur `k` — uniforme,
 * un texte ne se déforme pas.
 */
export class FreeResizeSession {
  private readonly states: ScaledState[];

  constructor(readonly container: FabricObject, private readonly objects: FabricObject[], readonly start: Box) {
    this.states = descendantsOf(objects, [container]).map((obj) => this.snapshot(obj));
  }

  /** Au début du geste : le groupe tel qu'il est. */
  static begin(container: FabricObject, objects: FabricObject[]): FreeResizeSession {
    const tl = container.getPositionByOrigin("left", "top");
    const { w, h } = scaledSize(container);
    return new FreeResizeSession(container, objects, { left: tl.x, top: tl.y, width: w, height: h });
  }

  /**
   * Un pas du geste : le facteur est la moyenne des deux axes (uniforme, un texte ne se
   * déforme pas), le coin opposé à la poignée (l'origine du transform) reste en place ;
   * les piles du groupe se rangent dans leurs nouvelles dimensions.
   */
  step(transform: { originX?: string; originY?: string }): void {
    const { start, container } = this;
    const { w, h } = scaledSize(container);
    const k = Math.max(0.05, (w / start.width + h / start.height) / 2);
    const fx = transform.originX === "left" ? 0 : transform.originX === "right" ? 1 : 0.5;
    const fy = transform.originY === "top" ? 0 : transform.originY === "bottom" ? 1 : 0.5;

    this.apply(k, { x: start.left + start.width * fx, y: start.top + start.height * fy });
    for (const obj of descendantsOf(this.objects, [container])) {
      if (isStackContainer(obj)) layoutSubtree(obj, this.objects);
    }
    fitFreeContainer(container, this.objects);
  }

  /** Le groupe à l'échelle `k` de son état de départ, `anchor` (scène) immobile. */
  apply(k: number, anchor: { x: number; y: number }): void {
    for (const state of this.states) this.scale(state, k, anchor);
    fitFreeContainer(this.container, this.objects);
  }

  private snapshot(obj: FabricObject): ScaledState {
    const { w, h } = scaledSize(obj);
    const tl = obj.getPositionByOrigin("left", "top");
    const state: ScaledState = { obj, box: { left: tl.x, top: tl.y, width: w, height: h } };
    const layout = layoutOf(obj);

    if (isTextObject(obj)) {
      const t = obj as FabricObject & { fontSize: number; fontSizeIntent?: number; styles?: object };
      state.text = {
        width: obj.width,
        fontSize: t.fontSize,
        fontSizeIntent: t.fontSizeIntent ?? t.fontSize,
        styles: scaleStyleFontSizes(t.styles as TextStyles, 1),
        minSize: layout?.sizing?.minSize,
      };
    } else if (layout?.container) {
      state.container = {
        padding: layout.container.padding,
        gap: layout.container.gap,
        minSize: layout.sizing?.minSize,
      };
    }
    return state;
  }

  private scale(state: ScaledState, k: number, anchor: { x: number; y: number }): void {
    const { obj, box } = state;
    const layout = layoutOf(obj);

    if (state.text) {
      const t = obj as FabricObject & { fontSize: number; fontSizeIntent?: number; styles?: TextStyles; initDimensions(): void };
      t.styles = scaleStyleFontSizes(state.text.styles, k);
      t.fontSizeIntent = state.text.fontSizeIntent * k;
      t.fontSize = state.text.fontSize * k;
      t.width = state.text.width * k;
      if (layout?.sizing) {
        obj.set("layout", { ...layout, sizing: { ...layout.sizing, minSize: scaleMin(state.text.minSize, k) } });
      }
      t.initDimensions();
      obj.dirty = true;
    } else if (state.container && layout?.container) {
      const p = state.container.padding;
      obj.set("layout", {
        ...layout,
        container: {
          ...layout.container,
          padding: p && { top: p.top * k, right: p.right * k, bottom: p.bottom * k, left: p.left * k },
          gap: state.container.gap === undefined ? undefined : state.container.gap * k,
        },
        sizing: layout.sizing && { ...layout.sizing, minSize: scaleMin(state.container.minSize, k) },
      });
      setShapeSize(obj, box.width * k, box.height * k);
    } else {
      setShapeSize(obj, box.width * k, box.height * k);
    }

    placeTopLeft(obj, anchor.x + (box.left - anchor.x) * k, anchor.y + (box.top - anchor.y) * k);
  }
}

