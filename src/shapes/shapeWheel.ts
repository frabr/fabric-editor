import type { ShapeType } from "../types";

// Ordre de cycle des formes
const SHAPE_WHEEL: readonly ShapeType[] = [
  "rect",
  "rounded",
  "circle",
  "heart",
  "hexagon",
] as const;

/**
 * Retourne la forme suivante dans le cycle
 * @param currentId - ID de la forme actuelle (ou undefined pour commencer)
 * @returns La forme suivante dans le cycle
 */
export function nextShape(currentId?: ShapeType): ShapeType {
  if (!currentId) return "rounded"; // On commence à rounded

  const currentIndex = SHAPE_WHEEL.indexOf(currentId);
  if (currentIndex === -1) return "rounded";

  const nextIndex = (currentIndex + 1) % SHAPE_WHEEL.length;
  return SHAPE_WHEEL[nextIndex];
}

/**
 * Vérifie si un ID est une forme valide
 */
export function isValidShape(id: string): id is ShapeType {
  return SHAPE_WHEEL.includes(id as ShapeType);
}

/**
 * Retourne la liste des formes disponibles
 */
export function getAvailableShapes(): readonly ShapeType[] {
  return SHAPE_WHEEL;
}
