/**
 * Un container est libre (un groupe : chaque élément reste où on l'a posé) ou rangé (une
 * pile, comme l'auto-layout : les éléments se suivent, à espace égal). La bascule ne fait
 * rien sauter : la disposition de l'un se déduit de celle de l'autre.
 */
import type { FabricObject } from "#fabric";
import { boxOf } from "./geometry";
import { layoutOf, idOf } from "./model";
import { childrenOf } from "./hierarchy";
import { isTextObject } from "./text";

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
  const children = childrenOf(objects, container).map((c) => ({ obj: c.obj, box: boxOf(c.obj) }));
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
  const children = childrenOf(objects, container).map((c) => c.obj);
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

