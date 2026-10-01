/**
 * Boîte d'un texte : fonction pure de son mode de taille, de la contrainte que lui
 * donne son container (le temps d'une passe), de son overflow et d'une mesure.
 *
 * Aucun état : CustomTextbox fournit la mesure (Fabric) et applique le résultat.
 */
import { type SizingData, type TextOverflow, MIN_FONT_SIZE } from "./types";

/**
 * Ce que le container donne au texte pour une passe de layout — jamais conservé.
 * - `maxW` : largeur disponible, que le texte ne dépasse pas (il wrappe)
 * - `w` / `h` : taille exacte calculée par Yoga (stretch, flexGrow, flexShrink)
 */
export interface TextConstraint {
  maxW?: number;
  w?: number;
  h?: number;
}

/** Mesure du texte wrappé à `width` en police `fontSize`. */
export interface TextMeasure {
  /** `width` peut revenir plus grande que demandée (mot le plus long). */
  wrapped(width: number, fontSize: number): { width: number; height: number };
  /** La plus longue ligne, sans wrap. */
  natural(fontSize: number): number;
}

export interface TextBoxInput {
  sizing: SizingData;
  overflow: TextOverflow;
  /**
   * La contrainte de la passe ; "as-stored" pour un enfant de container pas encore mis
   * en page (document tout juste chargé) : sa largeur, sa police effective et sa
   * hauteur sauvegardées font foi.
   */
  constraint: TextConstraint | "as-stored";
  /** Taille voulue ; l'autofit en repart. */
  fontSizeIntent: number;
  /** Police effective actuelle (seulement pour "as-stored"). */
  fontSize: number;
  /** Largeur actuelle : la largeur fixe sur un axe fixe. */
  width: number;
  /** Hauteur actuelle : la hauteur fixe sur un axe fixe. */
  height: number;
}

export interface TextBox {
  width: number;
  height: number;
  fontSize: number;
  /** Le contenu dépasse la boîte (pertinent pour overflow clip / visible). */
  overflowing: boolean;
}

export function resolveTextBox(input: TextBoxInput, measure: TextMeasure): TextBox {
  const { sizing, overflow, constraint } = input;

  if (constraint === "as-stored") {
    const m = measure.wrapped(input.width, input.fontSize);
    return { width: m.width, height: Math.max(m.height, input.height), fontSize: input.fontSize, overflowing: false };
  }

  const maxW = constraint.maxW ?? Infinity;
  const width = constraint.w ??
    (sizing.x === "hug" ? Math.min(measure.natural(input.fontSizeIntent), maxW) : Math.min(input.width, maxW));
  const boundH = constraint.h ?? (sizing.y === "fixed" ? input.height : undefined);

  let fontSize = input.fontSizeIntent;
  let m = measure.wrapped(width, fontSize);
  if (boundH != null && m.height > boundH + 0.5 && overflow === "shrink") {
    fontSize = largestFittingFont(width, boundH, input.fontSizeIntent, measure);
    m = measure.wrapped(width, fontSize);
  }

  const minH = sizing.y === "hug" ? (sizing.minSize?.h ?? 0) : 0;
  const height = boundH ?? Math.max(m.height, minH);
  return { width: m.width, height, fontSize, overflowing: m.height > height + 0.5 };
}

/** Plus grande police (pas de 0,5, plancher MIN_FONT_SIZE) dont le texte tient dans `boundH`. */
function largestFittingFont(width: number, boundH: number, intent: number, measure: TextMeasure): number {
  let lo = Math.min(MIN_FONT_SIZE, intent);
  let hi = intent;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (measure.wrapped(width, mid).height <= boundH + 0.5) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}
