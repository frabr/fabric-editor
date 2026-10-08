/**
 * Ce que les sessions de dépôt dans une pile partagent : leur contrat, la marge de sortie,
 * l'instantané qui permet de tout remettre en place si le geste est annulé, et les ordres
 * stables des enfants.
 *
 * Une session vit le temps d'un geste : un objet entre dans une pile (son premier enfant,
 * ContainerizeSession ; le suivant, InsertChildSession), ou un enfant déjà dedans y est
 * déplacé (`reattach`). Le choix est fait par createDropSession (drop.ts).
 */
import type { FabricObject } from "#fabric";
import type { LayoutData, ResolvedChild } from "../../types";
import { scaledSize, setShapeSize, topLeft } from "../../geometry";
import { childDataOf, cloneLayout, updateChild } from "../../model";
import { isTextObject } from "../../text";

/** Une session de dépôt, du premier pas du geste au commit ou à l'annulation. */
export interface LayoutSession {
  /** Un pas du geste. "exited" : le pointeur est sorti, la session s'est annulée. */
  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited";
  commit(): void;
  rollback(): void;
  readonly container: FabricObject;
  readonly child: FabricObject;
}

/** Ce qu'un pointeur peut dépasser du container avant d'en sortir. */
export const EXIT_MARGIN = 5;

// ── Instantané ──────────────────────────────────────────────────────

/** Où était un objet, à quelle taille, avec quel layout — de quoi l'y remettre. */
export interface Placement {
  left: number;
  top: number;
  originX: FabricObject["originX"];
  originY: FabricObject["originY"];
  /** Taille visuelle (scale compris). */
  w: number;
  h: number;
  width: number;
  scaleX: number;
  scaleY: number;
  stroke: unknown;
  strokeWidth: number;
  textAlign: unknown;
  layout: LayoutData | undefined;
}

export function takePlacement(obj: FabricObject): Placement {
  const { w, h } = scaledSize(obj);
  const o = obj as FabricObject & { textAlign?: unknown };
  return {
    left: obj.left, top: obj.top, originX: obj.originX, originY: obj.originY,
    w, h, width: obj.width, scaleX: obj.scaleX, scaleY: obj.scaleY,
    stroke: obj.stroke, strokeWidth: obj.strokeWidth, textAlign: o.textAlign,
    layout: cloneLayout(obj),
  };
}

/** Ce qu'on remet en place : la position (et l'origine), la taille, le style, le layout. */
export interface RestoreParts {
  position?: boolean;
  size?: boolean;
  style?: boolean;
  layout?: boolean;
}

/**
 * Remet un objet comme il était. La taille passe par le dimensionnement propre de l'objet
 * (un rect sa largeur, un cercle ou un chemin son scale, un cadre d'image son cadre) ; un
 * texte reprend sa largeur et son scale tels quels.
 */
export function restorePlacement(obj: FabricObject, p: Placement, parts: RestoreParts): void {
  if (parts.size) {
    if (isTextObject(obj)) obj.set({ width: p.width, scaleX: p.scaleX, scaleY: p.scaleY });
    else setShapeSize(obj, p.w, p.h);
  }
  if (parts.position) obj.set({ left: p.left, top: p.top, originX: p.originX, originY: p.originY });
  if (parts.style) {
    if (isTextObject(obj)) obj.set({ textAlign: p.textAlign } as never);
    else obj.set({ stroke: p.stroke, strokeWidth: p.strokeWidth } as never);
  }
  if (parts.layout) obj.set("layout", p.layout);
  obj.setCoords();
}

// ── Enfants ─────────────────────────────────────────────────────────

/** Chaque enfant reçoit un `order` s'il n'en a pas : sa place actuelle. */
export function ensureStableOrders(children: ResolvedChild[]): void {
  children.forEach((child, i) => {
    if (child.cl.order != null) return;
    updateChild(child.obj, { order: i });
    child.cl = childDataOf(child.obj)!;
  });
}

/** Boîte d'un voisin au début du geste — la référence stable des écarts. */
export interface SiblingAnchor {
  left: number;
  top: number;
  w: number;
  h: number;
}

export function siblingAnchors(siblings: ResolvedChild[]): Map<FabricObject, SiblingAnchor> {
  const anchors = new Map<FabricObject, SiblingAnchor>();
  for (const { obj } of siblings) {
    const tl = topLeft(obj);
    const { w, h } = scaledSize(obj);
    anchors.set(obj, { left: tl.x, top: tl.y, w, h });
  }
  return anchors;
}
