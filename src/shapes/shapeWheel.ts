/**
 * @legacy Shape cycling UI. Built on top of getShapeCatalog().
 */
import type { ShapeType } from "../types";
import { getShapeCatalog } from "./factories";

function shapeIds(): ShapeType[] {
  return getShapeCatalog().map((s) => s.id);
}

/**
 * Retourne la forme suivante dans le cycle
 */
export function nextShape(currentId?: ShapeType): ShapeType {
  const ids = shapeIds();
  if (!currentId) return ids[1] ?? ids[0]; // skip rect, start at rounded

  const idx = ids.indexOf(currentId);
  if (idx === -1) return ids[1] ?? ids[0];

  return ids[(idx + 1) % ids.length];
}

/**
 * Vérifie si un ID est une forme valide
 */
export function isValidShape(id: string): id is ShapeType {
  return shapeIds().includes(id);
}

/**
 * Retourne la liste des formes disponibles
 */
export function getAvailableShapes(): ShapeType[] {
  return shapeIds();
}
