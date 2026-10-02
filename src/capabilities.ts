/**
 * Règlement des capacités : pour un objet, « que fais-je quand… » et « quelles
 * options je propose ». Le code pose ses questions ici au lieu de tester des types
 * (layerType, instanceof) chacun de son côté.
 *
 * La sorte d'objet décide des réactions ; l'état les affine. Être container n'est pas
 * une sorte d'objet : c'est la capacité d'accueillir (`hosts`) plus l'état d'avoir des
 * enfants.
 *
 * Plan : apibots docs/plans/object-capabilities.md.
 */
import { FabricImage, Rect, type FabricObject } from "#fabric";
import { isTextObject } from "./layout/geometry";
import { FabRect } from "./shapes/FabRect";
import { FabCircle } from "./shapes/FabCircle";
import { FabPath } from "./shapes/FabPath";
import type { ControlOption } from "./types";

/**
 * - `text` : un texte
 * - `shape` : rect, cercle, path (catalogue), groupe de paths
 * - `imageShape` : une forme dont le fond est une image (ImageFrame) — mêmes capacités
 *   qu'une forme, sauf la couleur de fond ; remplace son image au lieu de la prendre
 * - `legacyImage` : image brute d'avant les ImageFrame (le fond legacy, notamment)
 * - `other` : tout le reste (groupes, objets de l'éditeur)
 */
export type ObjectKind = "text" | "shape" | "imageShape" | "legacyImage" | "other";

/** Ce que fait l'objet d'une image lâchée depuis la toolbox. */
export type ToolboxImageReaction = "fill" | "replaceImage";

export interface ObjectRules {
  kind: ObjectKind;
  /** Image lâchée depuis la toolbox : la prendre en fond, remplacer la sienne, ou rien. */
  onToolboxImage: ToolboxImageReaction | null;
  /** Un objet traîné au-dessus : l'accueillir comme enfant (devenir container). */
  hosts: boolean;
  /** Options proposées par la toolbox. */
  options: ControlOption[];
}

export function kindOf(obj: FabricObject): ObjectKind {
  if (isTextObject(obj)) return "text";
  if ((obj as { layerType?: string }).layerType === "imageFrame") return "imageShape";
  if (obj instanceof FabricImage) return "legacyImage";
  if ((obj as { layerType?: string }).layerType === "shape" || obj instanceof Rect) return "shape";
  return "other";
}

/**
 * Hors-jeu : rien ne réagit — le fond legacy (`originalImage`), un calque inerte
 * (`evented: false` : fond promu, fonds passthrough), un objet de l'éditeur
 * (`excludeFromExport` : guides, previews).
 */
function isOutOfPlay(obj: FabricObject): boolean {
  return obj.get("layerId") === "originalImage" ||
    (obj as { evented?: boolean }).evented === false ||
    (obj as { excludeFromExport?: boolean }).excludeFromExport === true;
}

const NO_RULES = { onToolboxImage: null, hosts: false, options: [] } as const;

export function rulesOf(obj: FabricObject): ObjectRules {
  const kind = kindOf(obj);
  const options = optionsOf(obj, kind);
  if (isOutOfPlay(obj)) return { kind, ...NO_RULES, options };

  switch (kind) {
    case "text":
      return { kind, onToolboxImage: null, hosts: false, options };
    case "shape":
      return { kind, onToolboxImage: "fill", hosts: true, options };
    case "imageShape":
      return { kind, onToolboxImage: "replaceImage", hosts: true, options };
    case "legacyImage":
      return { kind, onToolboxImage: "replaceImage", hosts: false, options };
    default:
      return { kind, ...NO_RULES, options };
  }
}

/** Les options dépendent aussi de la géométrie : les angles arrondis sont ceux d'un rect. */
function optionsOf(obj: FabricObject, kind: ObjectKind): ControlOption[] {
  switch (kind) {
    case "text":
      return ["color", "font"];
    case "shape":
      if (obj instanceof FabRect) return ["outline", "clip", "color", "corner_radius"];
      if (obj instanceof FabCircle || obj instanceof FabPath) return ["outline", "clip", "color"];
      return [];
    case "imageShape":
      // Une forme dont le fond est une image : tout sauf la couleur de fond, plus l'image
      return ["outline", "clip", "corner_radius", "image"];
    default:
      return [];
  }
}
