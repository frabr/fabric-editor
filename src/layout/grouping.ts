/**
 * Grouper, dégrouper.
 *
 * Grouper pose un porteur (un rectangle transparent, sans contour) qui devient un
 * container libre (`arrangement: "free"`, `origin: "group"`) : ses enfants ne bougent pas,
 * sa boîte les suit (cf. layout/free). Rien n'est un `fabric.Group` : les objets restent à
 * plat sur le canvas, liés par `layout.child.parentId`, comme dans une pile — l'arbre, la
 * pile en blocs, le rendu vidéo (un overlay par objet) n'y voient qu'un container de plus.
 *
 * Dégrouper rend les enfants au parent du container, à leur place. Le porteur d'un groupe
 * (⌘G) disparaît ; une forme qui portait des enfants reste, simple forme.
 *
 * Un groupe est libre ou rangé : la bascule est dans arrangement.ts.
 */
import type { FabricObject } from "#fabric";
import { FabRect } from "../shapes/FabRect";
import { fitFreeContainer } from "./free/fit";
import { layoutParents, layoutRoot } from "./tree";
import { stackBlock } from "./z-order";
import { layoutOf, idOf, parentIdOf, containerDataOf, childDataOf, ZERO_PADDING, detachChild } from "./model";
import { flowChildrenOf } from "./hierarchy";
import { isTextObject } from "./text";

/** Ce que le groupage demande au canvas. */
export interface GroupingCanvas {
  getObjects(): FabricObject[];
  add(...objects: FabricObject[]): unknown;
  remove(...objects: FabricObject[]): unknown;
  moveObjectTo(obj: FabricObject, index: number): unknown;
}

/**
 * Les objets à grouper, ramenés à un même niveau : s'ils n'ont pas tous le même parent,
 * chacun remonte à sa racine (on ne détache pas un morceau d'un groupe, on le groupe tout
 * entier). Dans l'ordre de la pile, sans doublon.
 */
export function groupMembers(objects: FabricObject[], selected: FabricObject[]): FabricObject[] {
  const parentIds = new Set(selected.map(parentIdOf));
  if (parentIds.size <= 1) return objects.filter((o) => selected.includes(o));

  const parents = layoutParents(objects);
  const rootIds = new Set(selected.map((o) => layoutRoot(parents, idOf(o))));
  return objects.filter((o) => rootIds.has(idOf(o)));
}

/**
 * Groupe des objets d'un même niveau (cf. groupMembers) dans un nouveau groupe libre,
 * rendu. Moins de deux objets : null.
 *
 * Le groupe prend, parmi ses frères, la place de son membre le plus haut ; ses membres
 * passent juste au-dessus de lui, dans leur ordre. Dans une pile, il prend la place de
 * son premier membre dans l'ordre de la pile.
 */
export function groupObjects(canvas: GroupingCanvas, selected: FabricObject[], layerId: string): FabricObject | null {
  const objects = canvas.getObjects();
  const members = groupMembers(objects, selected);
  if (members.length < 2) return null;

  const parentId = parentIdOf(members[0]);
  const orders = members.map((m) => childDataOf(m)?.order).filter((o): o is number => o != null);

  const carrier = new FabRect({
    layerId,
    layerType: "shape",
    originX: "left",
    originY: "top",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    fill: "transparent",
    strokeWidth: 0,
    layout: {
      container: { arrangement: "free", origin: "group", padding: { ...ZERO_PADDING } },
      ...(parentId ? { child: { parentId, ...(orders.length ? { order: Math.min(...orders) } : {}) } } : {}),
    },
  } as never);

  for (const member of members) {
    const layout = layoutOf(member);
    member.set("layout", { ...layout, child: { parentId: layerId } });
    // Un texte quitte la boîte que lui imposait sa pile
    if (layout?.child && isTextObject(member)) (member as unknown as { layoutWith(c: null): void }).layoutWith(null);
  }

  // La pile : le porteur à la place du membre le plus haut, les blocs des membres au-dessus
  const blocks = members.flatMap((m) => stackBlock(objects, m));
  const rest = objects.filter((o) => !blocks.includes(o));
  const topBlock = stackBlock(objects, members[members.length - 1]);
  const below = rest.filter((o) => objects.indexOf(o) < objects.indexOf(topBlock[0])).length;
  const order = [...rest.slice(0, below), carrier, ...blocks, ...rest.slice(below)];

  canvas.add(carrier);
  order.forEach((obj, index) => canvas.moveObjectTo(obj, index));
  fitFreeContainer(carrier, canvas.getObjects());
  return carrier;
}

/**
 * Rend les enfants d'un container à son parent, à leur place, et les renvoie. Le porteur
 * d'un groupe (⌘G) est retiré ; une forme garde sa forme et perd son rôle de container.
 * Dans une pile, les enfants prennent la place du container, dans leur ordre.
 */
export function ungroupObject(canvas: GroupingCanvas, container: FabricObject): FabricObject[] {
  const layout = layoutOf(container);
  if (!layout?.container) return [];

  const objects = canvas.getObjects();
  const children = flowChildrenOf(objects, container).map((c) => c.obj);
  const parentChild = layout.child;

  children.forEach((child, i) => {
    if (parentChild) {
      const childLayout = layoutOf(child)!;
      const order = parentChild.order != null ? parentChild.order + i / children.length : undefined;
      child.set("layout", { ...childLayout, child: { parentId: parentChild.parentId, ...(order != null ? { order } : {}) } });
    } else {
      detachChild(child);
    }
  });

  if (layout.container.origin === "group") {
    canvas.remove(container);
  } else {
    const { container: _container, ...rest } = layout;
    container.set("layout", Object.keys(rest).length ? rest : undefined);
  }
  return children;
}

/** La marge d'un groupe à sa première couleur de fond : sans elle, le fond colle aux éléments. */
export const GROUP_FILL_PADDING = 24;

/**
 * Un groupe (⌘G) sans marge qui reçoit son premier fond prend une marge de
 * GROUP_FILL_PADDING de chaque côté. Vrai s'il l'a prise.
 */
export function padGroupOnFirstFill(container: FabricObject, previousFill: unknown): boolean {
  const cd = containerDataOf(container);
  if (cd?.origin !== "group") return false;
  const wasBare = !previousFill || previousFill === "transparent";
  const fill = container.fill;
  const isBare = !fill || fill === "transparent";
  const p = cd.padding;
  if (!wasBare || isBare || (p && (p.top || p.right || p.bottom || p.left))) return false;

  const pad = GROUP_FILL_PADDING;
  container.set("layout", {
    ...layoutOf(container)!,
    container: { ...cd, padding: { top: pad, right: pad, bottom: pad, left: pad } },
  });
  return true;
}
