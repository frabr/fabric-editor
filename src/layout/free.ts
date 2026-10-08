/**
 * Le container libre (un groupe) : ses enfants restent où on les a posés, sa boîte les
 * suit — leur union, plus la marge (`padding`). Rien n'est calculé par Yoga dedans ; dans
 * une pile, un groupe est un bloc rigide (cf. yoga-engine), que ses enfants suivent quand
 * la pile le déplace.
 *
 * Le redimensionner ne pose jamais de `scale` : chaque descendant absorbe l'agrandissement
 * dans ses propres dimensions (une forme sa taille, un texte sa largeur et sa police, une
 * pile ses marges et son espacement), au prorata, autour du coin qui ne bouge pas.
 */
import { Point, type FabricObject } from "#fabric";
import { type ContainerData, type SizingData } from "./types";
import { isTextObject, scaledSize, setShapeSize } from "./geometry";
import { layoutOf, idOf, parentIdOf, containerDataOf, isFreeContainer, paddingOf, isStackContainer } from "./model";
import { childrenOf, descendantsOf, translateObjects, stackParentOf } from "./hierarchy";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** La boîte (alignée sur les axes, coordonnées scène) d'un objet. */
function boxOf(obj: FabricObject): Box {
  obj.setCoords();
  return obj.getBoundingRect();
}



/** Pose le coin haut-gauche d'un objet, quelle que soit son origine. */
function placeTopLeft(obj: FabricObject, x: number, y: number): void {
  obj.setPositionByOrigin(new Point(x, y), "left", "top");
  obj.setCoords();
}

/**
 * La boîte d'un groupe se recale sur ses enfants : leur union, plus la marge. Sans
 * enfant, rien ne bouge. Les groupes imbriqués d'abord (leur boîte compte dans la sienne).
 */
export function fitFreeContainer(container: FabricObject, objects: FabricObject[]): void {
  const children = childrenOf(objects, container).map((c) => c.obj);
  if (children.length === 0) return;
  for (const child of children) if (isFreeContainer(child)) fitFreeContainer(child, objects);

  const boxes = children.map(boxOf);
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  const pad = paddingOf(containerDataOf(container));

  setShapeSize(container, right - left + pad.left + pad.right, bottom - top + pad.top + pad.bottom);
  placeTopLeft(container, left - pad.left, top - pad.top);
}

// ── Redimensionner un groupe ────────────────────────────────────────

/** Ce qu'il faut d'un descendant pour le remettre à l'échelle depuis le début du geste. */
interface ScaledState {
  obj: FabricObject;
  /** Coin haut-gauche et taille. */
  box: Box;
  text?: { width: number; fontSize: number; fontSizeIntent: number; styles: string; minSize?: SizingData["minSize"] };
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
        styles: JSON.stringify(t.styles ?? {}),
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
      const t = obj as FabricObject & { fontSize: number; fontSizeIntent?: number; styles?: Record<string, Record<string, { fontSize?: number }>>; initDimensions(): void };
      const styles = JSON.parse(state.text.styles) as Record<string, Record<string, { fontSize?: number }>>;
      for (const line of Object.values(styles)) {
        for (const style of Object.values(line)) if (style.fontSize) style.fontSize *= k;
      }
      t.styles = styles;
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

