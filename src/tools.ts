/**
 * Les outils d'une sélection : lesquels, dans quel ordre. La barre d'actions des éditeurs
 * ne décide rien : elle montre ce que rend `toolsFor`, dans cet ordre.
 *
 * Deux questions, deux sources :
 * - ce que la sélection permet — le règlement (`rulesOf`), verrous compris, et sa place
 *   dans l'arbre (container, groupe, enfant) ;
 * - ce que l'éditeur propose — `offered` : un outil que l'éditeur n'a pas (les animations
 *   hors vidéo, le verrou hors création…) n'apparaît jamais.
 *
 * L'ordre suit la fréquence d'usage, par sorte de sélection (barre d'actions du round 2) :
 * la couleur et le contenu d'abord, puis l'animation, les réglages fins, l'ordre des plans ;
 * Supprimer toujours en dernier. En multi-sélection, Grouper d'abord.
 */
import type { FabricObject } from "#fabric";
import { rulesOf, type ObjectRules } from "./capabilities";
import { stackParentOf } from "./layout/hierarchy";
import { containerDataOf, isContainerObject, parentIdOf } from "./layout/model";

export type ToolId =
  | "group" | "align" | "distribute" | "arrangement" | "ungroup"
  | "fill" | "font" | "variables" | "image" | "promoteBackground" | "clip" | "outline"
  | "effects" | "layout" | "containerize" | "animations" | "lock" | "forward" | "backward" | "delete";

/**
 * - `text`, `shape`, `image` : un objet seul, d'après sa sorte ;
 * - `block` : une forme qui porte des éléments ;
 * - `group` : un groupe (⌘G), libre ou rangé ;
 * - `many` : plusieurs objets.
 */
export type SelectionKind = "text" | "shape" | "image" | "block" | "group" | "many";

/** L'ordre des outils, par sorte de sélection (Supprimer s'ajoute à la fin). */
const ORDER: Record<SelectionKind, ToolId[]> = {
  text: ["fill", "font", "animations", "effects", "variables", "layout", "lock", "forward", "backward"],
  shape: ["fill", "clip", "outline", "animations", "effects", "layout", "containerize", "lock", "forward", "backward"],
  image: [
    "image", "promoteBackground", "clip", "animations", "outline", "effects", "layout", "containerize",
    "lock", "forward", "backward",
  ],
  block: [
    "fill", "image", "layout", "animations", "outline", "effects", "ungroup",
    "lock", "forward", "backward",
  ],
  group: [
    "arrangement", "fill", "layout", "animations", "ungroup", "effects",
    "lock", "forward", "backward",
  ],
  many: ["group", "align", "distribute", "forward", "backward"],
};

/** La sorte d'une sélection, ou null si elle est vide. */
export function selectionKindOf(selected: FabricObject[]): SelectionKind | null {
  if (selected.length === 0) return null;
  if (selected.length > 1) return "many";

  const [obj] = selected;
  if (containerDataOf(obj)?.origin === "group") return "group";
  if (isContainerObject(obj)) return "block";
  switch (rulesOf(obj).kind) {
    case "text": return "text";
    case "imageShape":
    case "legacyImage": return "image";
    default: return "shape";
  }
}

/** Les outils de la sélection que l'éditeur propose, dans l'ordre de la barre. */
export function toolsFor(selected: FabricObject[], offered: Iterable<ToolId>): ToolId[] {
  const kind = selectionKindOf(selected);
  if (!kind) return [];

  const available = new Set(offered);
  const allows = kind === "many" ? manyAllows(selected) : oneAllows(selected[0], kind);
  return [...ORDER[kind], "delete" as const].filter((tool) => available.has(tool) && allows(tool));
}

/** Ce qu'un objet seul permet. */
function oneAllows(obj: FabricObject, kind: SelectionKind): (tool: ToolId) => boolean {
  const rules = rulesOf(obj);
  const has = (option: ObjectRules["options"][number]) => rules.options.includes(option);
  // La disposition règle la taille d'un texte, les réglages d'un container, la place d'un enfant
  const laidOut = kind === "text" || isContainerObject(obj) || Boolean(parentIdOf(obj));

  return (tool) => {
    switch (tool) {
      case "fill": return has("color");
      case "font":
      case "variables": return has("font");
      case "outline": return has("outline");
      case "effects": return has("color") || has("outline");
      case "clip": return has("clip");
      case "image": return has("image");
      case "promoteBackground": return has("image") && rules.restacks;
      case "layout": return rules.restyles && laidOut;
      case "animations":
      case "arrangement": return rules.restyles;
      case "ungroup": return rules.deletes && isContainerObject(obj);
      // Une forme (ou une image) simple devient un bloc : elle accueille, et n'en est pas un
      case "containerize": return rules.restyles && rules.hosts && !isContainerObject(obj);
      case "lock": return true;
      case "forward":
      case "backward": return rules.restacks;
      case "delete": return rules.deletes;
      default: return false;
    }
  };
}

/**
 * Ce que plusieurs objets permettent : grouper et aligner ; répartir dès trois objets
 * libres (un enfant de pile garde la place que la pile lui donne) ; changer de plan si
 * tous le peuvent ; supprimer si l'un au moins le peut.
 */
function manyAllows(selected: FabricObject[]): (tool: ToolId) => boolean {
  const rules = selected.map((obj) => rulesOf(obj));
  return (tool) => {
    switch (tool) {
      case "group":
      case "align": return true;
      case "distribute": return selected.filter((obj) => !stackParentOf(obj)).length >= 3;
      case "forward":
      case "backward": return rules.every((r) => r.restacks);
      case "delete": return rules.some((r) => r.deletes);
      default: return false;
    }
  };
}
