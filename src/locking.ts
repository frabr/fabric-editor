import type { FabricObject } from "fabric";

/**
 * Modes de verrouillage pour les calques
 * - free: libre (défaut) - peut bouger et changer le contenu
 * - position: position verrouillée, contenu modifiable
 * - full: position ET contenu verrouillés
 */
export type LockMode = "free" | "position" | "full";

/** Ordre des modes pour le cycle */
const LOCK_MODES: LockMode[] = ["free", "position", "full"];

/**
 * Récupère le mode de verrouillage d'un objet
 */
export function getLockMode(obj: FabricObject): LockMode {
  return (obj as any).lockMode || "free";
}

/**
 * Retourne le prochain mode dans le cycle free -> position -> full -> free
 */
export function getNextLockMode(currentMode: LockMode): LockMode {
  const currentIndex = LOCK_MODES.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % LOCK_MODES.length;
  return LOCK_MODES[nextIndex];
}

/**
 * Applique un mode de verrouillage à un objet Fabric
 *
 * - free: contrôles actifs, peut bouger et changer le contenu/style
 * - position: pas de contrôles, ne peut pas bouger, mais peut changer le contenu (texte éditable, pas le style)
 * - full: pas de contrôles, ne peut ni bouger ni changer le contenu
 */
export function applyLockMode(obj: FabricObject, mode: LockMode): void {
  // Stocker le mode sur l'objet
  (obj as any).lockMode = mode;

  const lockPosition = mode === "position" || mode === "full";

  // Verrouiller les mouvements et transformations
  obj.lockMovementX = lockPosition;
  obj.lockMovementY = lockPosition;
  obj.lockRotation = lockPosition;
  obj.lockScalingX = lockPosition;
  obj.lockScalingY = lockPosition;

  // Masquer les contrôles si verrouillé
  obj.hasControls = mode === "free";

  // Propriété custom pour bloquer le remplacement d'image (utilisé par ImageDropHandler)
  (obj as any).lockContent = mode === "full";

  // Pour les textes (IText/Textbox) : éditable seulement en mode free ou position
  // En mode full, le texte n'est pas éditable du tout
  if (obj.type === "i-text" || obj.type === "textbox") {
    (obj as any).editable = mode !== "full";
  }
}

/**
 * Vérifie si le style (police, couleur) d'un objet est verrouillé
 * Le style n'est modifiable qu'en mode free
 */
export function isStyleLocked(obj: FabricObject): boolean {
  const mode = getLockMode(obj);
  return mode === "position" || mode === "full";
}

/**
 * Vérifie si le contenu d'un objet est verrouillé (mode full)
 */
export function isContentLocked(obj: FabricObject): boolean {
  return (obj as any).lockContent === true;
}

/**
 * Vérifie si la position d'un objet est verrouillée (mode position ou full)
 */
export function isPositionLocked(obj: FabricObject): boolean {
  const mode = getLockMode(obj);
  return mode === "position" || mode === "full";
}
