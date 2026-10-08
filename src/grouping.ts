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
 * Un groupe est libre ou rangé (une pile, comme l'auto-layout) : la bascule ne fait rien
 * sauter, la disposition de l'un se déduit de celle de l'autre.
 */
import type { FabricObject } from "#fabric";
import { FabRect } from "./shapes/FabRect";
import { detachChild, isTextObject, sortChildrenByOrder, resolveContainerChildren } from "./layout/geometry";
import { fitFreeContainer } from "./layout/free";
import { layoutParents, layoutRoot } from "./layout/tree";
import { stackBlock } from "./layout/stacking";
import { layoutOf, idOf, parentIdOf, containerDataOf, childDataOf, ZERO_PADDING } from "./layout/model";

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
  const children = sortChildrenByOrder(resolveContainerChildren(objects, container)).map((c) => c.obj);
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

// ── Libre ↔ Rangé ───────────────────────────────────────────────────

/** L'étendue des valeurs (0 pour une seule). */
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

/**
 * Range un groupe libre en pile, sans rien faire sauter : tout est déduit de la
 * disposition actuelle.
 * - sens : en ligne si les centres s'étalent plus en largeur qu'en hauteur ;
 * - ordre : celui des éléments le long de ce sens ;
 * - espacement : la moyenne des écarts entre voisins (0 à 160) ;
 * - alignement sur l'autre axe : les bords (début, fin) ou les centres que les éléments
 *   partagent le mieux — à égalité, le début ;
 * - marges : celles du groupe.
 * Le container reste un groupe (`origin`) : il se dégroupe, il redevient libre.
 */
export function arrangeAsStack(container: FabricObject, objects: FabricObject[]): void {
  const layout = layoutOf(container)!;
  const children = resolveContainerChildren(objects, container).map((c) => {
    c.obj.setCoords();
    return { obj: c.obj, box: c.obj.getBoundingRect() };
  });
  if (children.length === 0) return;

  const row = spread(children.map((c) => c.box.left + c.box.width / 2)) >
    spread(children.map((c) => c.box.top + c.box.height / 2));
  const [start, size, crossStart, crossSize] = row
    ? (["left", "width", "top", "height"] as const)
    : (["top", "height", "left", "width"] as const);
  children.sort((a, b) => a.box[start] - b.box[start]);

  const gaps = children.slice(1).map((c, i) => c.box[start] - (children[i].box[start] + children[i].box[size]));
  const gap = gaps.length ? Math.round(Math.min(160, Math.max(0, gaps.reduce((a, b) => a + b, 0) / gaps.length))) : 0;

  const crossSpreads = {
    "flex-start": spread(children.map((c) => c.box[crossStart])),
    center: spread(children.map((c) => c.box[crossStart] + c.box[crossSize] / 2)),
    "flex-end": spread(children.map((c) => c.box[crossStart] + c.box[crossSize])),
  };
  const alignItems = (Object.keys(crossSpreads) as (keyof typeof crossSpreads)[])
    .reduce((best, key) => (crossSpreads[key] < crossSpreads[best] - 0.5 ? key : best), "flex-start");

  const { justifyContent: _justify, ...cd } = layout.container!;
  container.set("layout", {
    ...layout,
    sizing: { x: "hug", y: "hug" },
    container: { ...cd, arrangement: "stack", flexDirection: row ? "row" : "column", gap, alignItems },
  });
  children.forEach(({ obj }, order) => {
    obj.set("layout", { ...layoutOf(obj)!, child: { parentId: idOf(container), order } });
  });
}

/**
 * Rend un groupe rangé libre : chaque élément garde sa place à l'écran. Un texte que la
 * pile mettait en forme garde sa largeur (elle devient la sienne).
 */
export function arrangeFree(container: FabricObject, objects: FabricObject[]): void {
  const layout = layoutOf(container)!;
  const children = resolveContainerChildren(objects, container).map((c) => c.obj);
  const widths = new Map(children.map((c) => [c, c.width]));

  const { flexDirection: _d, gap: _g, alignItems: _a, justifyContent: _j, ...cd } = layout.container!;
  container.set("layout", { ...layout, container: { ...cd, arrangement: "free" } });

  for (const child of children) {
    child.set("layout", { ...layoutOf(child)!, child: { parentId: idOf(container) } });
    if (!isTextObject(child)) continue;

    const text = child as unknown as { sizing: { x: string; y: string }; setSizing(s: object): void; initDimensions(): void; width: number };
    text.initDimensions();
    const before = widths.get(child)!;
    if (Math.abs(text.width - before) > 0.5) {
      text.setSizing({ ...text.sizing, x: "fixed" });
      text.width = before;
      text.initDimensions();
    }
  }
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
