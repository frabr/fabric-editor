/**
 * Les textes dans le layout : les reconnaître, la surface que le moteur leur demande
 * (mesure, contrainte du container), et la mise à l'échelle de leurs styles.
 * Le calcul de la boîte d'un texte est dans text-box.ts.
 */
import type { FabricObject } from "#fabric";

const TEXT_TYPES = ["i-text", "textbox"];

/** Ce que le layout demande à un texte (implémenté par CustomTextbox). */
export interface LayoutText {
  /** Narrowest the text can get: its longest word. */
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
