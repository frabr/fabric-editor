/**
 * Mettre un container à l'échelle, à la poignée de coin — un groupe (container libre),
 * une pile, un bloc vide : la même règle que le texte, le coin agrandit la chose entière,
 * proportions gardées, les modes de taille inchangés.
 *
 * Jamais de `scale` posé : chaque descendant absorbe le facteur dans ses propres
 * dimensions (une forme sa taille, un texte sa largeur et sa police, un container sa
 * boîte, ses marges, son espacement et son plancher), au prorata, autour du coin qui ne
 * bouge pas. Une homothétie de tout le sous-arbre est un point fixe du layout : toutes
 * les entrées de Yoga sont en pixels, la passe qui suit ne déplace rien — elle absorbe
 * les arrondis (mesure du texte, planchers).
 */
import { Point, util, type FabricObject } from "#fabric";
import type { ContainerData, SizingData } from "./types";
import { placeTopLeft, scaledSize, setShapeSize, type Box } from "./geometry";
import { isFreeContainer, isStackContainer, layoutOf } from "./model";
import { descendantsOf, parentContainerOf } from "./hierarchy";
import { layoutSubtree, relayoutAncestors } from "./run";
import { isTextObject, scaleText, textScaleState, type TextScaleState } from "./text";
import { fitFreeContainer } from "./free/fit";
import { availableRoom } from "./stack/room";

/** Ce qu'il faut d'un objet pour le remettre à l'échelle depuis le début du geste. */
interface ScaledState {
  obj: FabricObject;
  /** Coin haut-gauche et taille. */
  box: Box;
  text?: TextScaleState;
  container?: { padding?: ContainerData["padding"]; gap?: number; minSize?: SizingData["minSize"] };
}

const scaleMin = (minSize: SizingData["minSize"], k: number) =>
  minSize && { w: minSize.w * k, h: minSize.h * k };

/**
 * Une mise à l'échelle, du premier au dernier instant du geste : chaque étape repart de
 * l'état de départ (pas d'erreur qui s'accumule), au facteur `k` — uniforme, un texte ne
 * se déforme pas.
 */
export class ScaleSession {
  private readonly states: ScaledState[];

  /** L'angle du container : ses coins tournent avec lui, l'ancre aussi. */
  private readonly angle: number;

  /** Un groupe suit ses enfants ; une pile (ou un bloc vide) est elle-même mise à l'échelle. */
  private readonly free: boolean;

  /** Le plus grand facteur que la place laissée par les ancêtres (une pile) permet. */
  private readonly maxK: number;

  constructor(readonly container: FabricObject, private readonly objects: FabricObject[], readonly start: Box) {
    this.free = isFreeContainer(container);
    const scaled = this.free ? descendantsOf(objects, [container]) : [container, ...descendantsOf(objects, [container])];
    this.states = scaled.map((obj) => this.snapshot(obj));
    this.angle = container.angle || 0;

    const room = availableRoom(container, objects);
    this.maxK = Math.min(room.w / start.width, room.h / start.height);
  }

  /** Au début du geste : le container tel qu'il est. */
  static begin(container: FabricObject, objects: FabricObject[]): ScaleSession {
    const tl = container.getPositionByOrigin("left", "top");
    const { w, h } = scaledSize(container);
    return new ScaleSession(container, objects, { left: tl.x, top: tl.y, width: w, height: h });
  }

  /**
   * Un pas du geste : la poignée a posé la boîte du porteur ; le facteur est la moyenne des
   * deux axes (uniforme — une poignée de coin l'est déjà), borné par la place laissée par
   * les ancêtres ; le coin opposé à la poignée (l'origine du transform) reste en place.
   */
  step(transform: { originX?: string; originY?: string }): void {
    const { start, container } = this;
    const { w, h } = scaledSize(container);
    const k = Math.min(this.maxK, Math.max(0.05, (w / start.width + h / start.height) / 2));
    const fx = transform.originX === "left" ? 0 : transform.originX === "right" ? 1 : 0.5;
    const fy = transform.originY === "top" ? 0 : transform.originY === "bottom" ? 1 : 0.5;

    // Le coin de départ, dans le repère du container (tourné) : une homothétie autour d'un
    // point commute avec la rotation, le reste du pas ne change pas
    const corner = new Point(start.width * fx, start.height * fy)
      .rotate(util.degreesToRadians(this.angle))
      .add(new Point(start.left, start.top));
    this.apply(k, corner);
  }

  /**
   * Le container à l'échelle `k` de son état de départ, `anchor` (scène) immobile — puis
   * tout se range : les piles dedans dans leurs nouvelles dimensions (une homothétie les
   * laisse où elles sont, à l'arrondi près), un groupe sur ses enfants, et les ancêtres
   * prennent la nouvelle taille en compte (le container reste dans son emplacement).
   */
  apply(k: number, anchor: { x: number; y: number }): void {
    const { container, objects } = this;
    for (const state of this.states) this.scale(state, k, anchor);

    if (this.free) {
      for (const obj of descendantsOf(objects, [container])) {
        if (isStackContainer(obj)) layoutSubtree(obj, objects);
      }
      fitFreeContainer(container, objects);
    } else {
      layoutSubtree(container, objects);
    }

    const parent = parentContainerOf(container, objects);
    if (!parent) return;
    layoutSubtree(parent, objects);
    relayoutAncestors(parent, objects);
  }

  private snapshot(obj: FabricObject): ScaledState {
    const { w, h } = scaledSize(obj);
    const tl = obj.getPositionByOrigin("left", "top");
    const state: ScaledState = { obj, box: { left: tl.x, top: tl.y, width: w, height: h } };
    const layout = layoutOf(obj);

    if (isTextObject(obj)) {
      state.text = textScaleState(obj);
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
      scaleText(obj, state.text, k);
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

/** @deprecated Use `ScaleSession` (a corner scales any container, not only a group). */
export const FreeResizeSession = ScaleSession;
