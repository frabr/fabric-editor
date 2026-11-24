/**
 * Les textes dans le layout : les reconnaître, la surface que le moteur leur demande
 * (mesure, contrainte du container), et leur mise à l'échelle.
 * Le calcul de la boîte d'un texte est dans text-box.ts.
 */
import type { FabricObject } from "#fabric";
import type { LayoutData, SizingData } from "./types";

const TEXT_TYPES = ["i-text", "textbox"];

/** Ce que le layout demande à un texte (implémenté par CustomTextbox). */
export interface LayoutText {
  /** Narrowest the text can get: its widest grapheme (words break). */
  minContentWidth(): number;
  /** A layout pass: the container's constraint (null: the text left its container). */
  layoutWith(constraint: { maxW?: number; w?: number; h?: number } | null): void;
}

export function isTextObject(obj: FabricObject): boolean {
  return TEXT_TYPES.includes(obj.type);
}

/** Un texte, vu par le layout. */
export function asLayoutText(obj: FabricObject): LayoutText {
  return obj as unknown as LayoutText;
}

/** Les tailles de police par caractère (`styles`) d'un texte, multipliées par `k`. */
export type TextStyles = Record<string, Record<string, { fontSize?: number }>>;

export function scaleStyleFontSizes(styles: TextStyles, k: number): TextStyles {
  const scaled = JSON.parse(JSON.stringify(styles ?? {})) as TextStyles;
  for (const line of Object.values(scaled)) {
    for (const style of Object.values(line)) if (style.fontSize) style.fontSize *= k;
  }
  return scaled;
}

// ── Mise à l'échelle ────────────────────────────────────────────────

/**
 * Un texte que l'on met à l'échelle (CustomTextbox) : sa police effective et voulue, ses
 * styles par caractère, et le recalcul de sa boîte.
 */
export interface ScalableText extends FabricObject {
  fontSize: number;
  fontSizeIntent?: number;
  styles?: TextStyles;
  initDimensions(): void;
}

/** L'état de départ d'un texte, d'où repart chaque pas d'une mise à l'échelle. */
export interface TextScaleState {
  width: number;
  height: number;
  fontSize: number;
  fontSizeIntent: number;
  styles: TextStyles;
  minSize?: SizingData["minSize"];
}

/** Le texte tel qu'il est, avant qu'on le mette à l'échelle (copie des styles). */
export function textScaleState(obj: FabricObject): TextScaleState {
  const t = obj as ScalableText;
  return {
    width: t.width,
    height: t.height,
    fontSize: t.fontSize,
    fontSizeIntent: t.fontSizeIntent ?? t.fontSize,
    styles: scaleStyleFontSizes(t.styles as TextStyles, 1),
    minSize: (obj as { layout?: LayoutData }).layout?.sizing?.minSize,
  };
}

/**
 * Le seul agrandissement proportionnel d'un texte : jamais de `scale`, le facteur `k`
 * passe dans la police (voulue, effective, par caractère), la largeur, la hauteur fixe et
 * le plancher — depuis `state`, pas depuis l'état courant (aucune erreur ne s'accumule
 * d'un pas à l'autre). Uniforme : les glyphes gardent leurs proportions, la boîte aussi
 * (une hauteur contenu suit la police). Toute mise à l'échelle d'un texte (poignée de
 * coin, groupe, scale legacy, taille programmatique) passe ici.
 */
export function scaleText(obj: FabricObject, state: TextScaleState, k: number): void {
  const t = obj as ScalableText;
  t.styles = scaleStyleFontSizes(state.styles, k);
  t.fontSizeIntent = state.fontSizeIntent * k;
  t.fontSize = state.fontSize * k;
  t.width = state.width * k;

  const layout = (obj as { layout?: LayoutData }).layout;
  if (layout?.sizing) {
    if (layout.sizing.y === "fixed") t.height = state.height * k;
    if (state.minSize) {
      const minSize = { w: state.minSize.w * k, h: state.minSize.h * k };
      obj.set("layout", { ...layout, sizing: { ...layout.sizing, minSize } });
    }
  }
  t.initDimensions();
  obj.dirty = true;
}
