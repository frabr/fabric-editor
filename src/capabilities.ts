/**
 * Règlement des capacités : pour un objet, « que fais-je quand… » et « quelles
 * options je propose ». Le code pose ses questions ici au lieu de tester des types
 * (layerType, instanceof) ou des verrous chacun de son côté.
 *
 * La sorte d'objet décide des réactions ; l'état les affine :
 * - hors-jeu (fond legacy, calque inerte, objet de l'éditeur) : aucune réaction ;
 * - verrou de position : plus de style ni de place dans la pile, seules les options
 *   d'image restent (le placeholder reçoit son image) ;
 * - verrou total : plus rien ;
 * - image à fournir (userSlots) : la forme propose l'image et la prend en fond, quel que
 *   soit son verrou — c'est tout son contrat.
 *
 * Être container n'est pas une sorte d'objet : c'est la capacité d'accueillir (`hosts`)
 * plus l'état d'avoir des enfants.
 *
 * C'est le seul endroit qui lit `layerType` (toujours écrit sur les objets : il est
 * sauvegardé dans les documents).
 *
 * Plan : apibots docs/plans/object-capabilities.md.
 */
import { FabricImage, Group, Rect, type FabricObject } from "#fabric";
import { isTextObject } from "./layout/geometry";
import { getLockMode, type LockMode } from "./locking";
import { isUserSlot } from "./userSlots";
import { FabRect } from "./shapes/FabRect";
import { FabCircle } from "./shapes/FabCircle";
import { FabPath } from "./shapes/FabPath";
import type { ControlOption } from "./types";
import { stackParentOf } from "./layout/hierarchy";
import { isFreeContainer } from "./layout/model";


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
  /** Options proposées par la toolbox (`image` : remplacer, recadrer). */
  options: ControlOption[];
  /** Changer de style : couleur, police, contour, opacité, découpe. */
  restyles: boolean;
  /** Changer de place dans la pile : monter, descendre, passer en fond. */
  restacks: boolean;
  /** Être supprimé. */
  deletes: boolean;
}

export interface RulesQuery {
  /**
   * Les réactions de la sorte d'objet, verrou ignoré. Pour la recherche de cible d'un
   * drop : un objet verrouillé reste opaque (une image lâchée sur une image verrouillée
   * ne va pas remplir la forme cachée dessous) — c'est l'armement qui lit le verrou.
   */
  ignoreLock?: boolean;
}

export function kindOf(obj: FabricObject): ObjectKind {
  const layerType = (obj as { layerType?: string }).layerType;
  if (isTextObject(obj)) return "text";
  if (layerType === "imageFrame") return "imageShape";
  if (obj instanceof FabricImage) return "legacyImage";
  if (layerType === "shape" || obj instanceof Rect) return "shape";
  return "other";
}

export function rulesOf(obj: FabricObject, { ignoreLock = false }: RulesQuery = {}): ObjectRules {
  const rules = kindRules(obj, kindOf(obj));
  if (isOutOfPlay(obj)) Object.assign(rules, { onToolboxImage: null, hosts: false });
  // Un groupe ne reçoit rien par dépôt (on dégroupe, on regroupe) ; son porteur n'a pas
  // d'image à recevoir
  if (isFreeContainer(obj)) Object.assign(rules, { onToolboxImage: null, hosts: false });
  // Dans une pile, l'ordre est celui de la pile : il se change en glissant, pas par plans.
  // Dans un groupe (container libre), les plans sont libres.
  if (stackParentOf(obj)) rules.restacks = false;
  const locked = lockedRules(rules, ignoreLock ? "free" : getLockMode(obj));
  if (rules.onToolboxImage !== "fill" || !isUserSlot(obj)) return locked;

  return { ...locked, onToolboxImage: "fill", options: [...locked.options, "image"] };
}

/** Le verrou de position retire style et pile, le verrou total retire tout. */
function lockedRules(rules: ObjectRules, lockMode: LockMode): ObjectRules {
  switch (lockMode) {
    case "position":
      return {
        ...rules,
        options: rules.options.filter((option) => option === "image"),
        restyles: false,
        restacks: false,
        deletes: false,
      };
    case "full":
      return {
        ...rules,
        onToolboxImage: null,
        hosts: false,
        options: [],
        restyles: false,
        restacks: false,
        deletes: false,
      };
    default:
      return rules;
  }
}

/** Les réactions d'une sorte d'objet, sans état (libre, en jeu). */
function kindRules(obj: FabricObject, kind: ObjectKind): ObjectRules {
  const free = { restyles: true, restacks: true, deletes: true };
  switch (kind) {
    case "text":
      return { kind, onToolboxImage: null, hosts: false, options: ["color", "font"], ...free };
    case "shape":
      // Un groupe de paths (forme multi-régions) n'a pas de découpe unique : pas d'image
      return {
        kind,
        onToolboxImage: obj instanceof Group ? null : "fill",
        hosts: true,
        options: shapeOptions(obj),
        ...free,
      };
    case "imageShape":
      // Une forme dont le fond est une image : tout sauf la couleur de fond, plus l'image
      return {
        kind, onToolboxImage: "replaceImage", hosts: true,
        options: ["outline", "clip", "corner_radius", "image"], ...free,
      };
    case "legacyImage":
      return { kind, onToolboxImage: "replaceImage", hosts: false, options: [], ...free };
    default:
      return { kind, onToolboxImage: null, hosts: false, options: [], ...free };
  }
}

/** Les options d'une forme dépendent de sa géométrie : les angles arrondis sont ceux d'un rect. */
function shapeOptions(obj: FabricObject): ControlOption[] {
  if (obj instanceof FabRect) return ["outline", "clip", "color", "corner_radius"];
  if (obj instanceof FabCircle || obj instanceof FabPath) return ["outline", "clip", "color"];
  return [];
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
