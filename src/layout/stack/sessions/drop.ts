/**
 * Quelle session pour un dépôt dans une pile : son premier enfant (ContainerizeSession) ou
 * le suivant (InsertChildSession) ; `reattach` pour un enfant déjà dedans qu'on y déplace.
 */
import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../../../DesignCanvas";
import { childrenOf } from "../../hierarchy";
import { ContainerizeSession } from "./containerize";
import { InsertChildSession } from "./insert-child";
import type { LayoutSession } from "./session";

export function createDropSession(
  canvas: DesignCanvas,
  container: FabricObject,
  child: FabricObject,
  cursor: { x: number; y: number },
  { reattach = false }: { reattach?: boolean } = {},
): LayoutSession {
  const siblings = childrenOf(canvas.getObjects(), container).filter((c) => c.obj !== child);
  return siblings.length > 0
    ? new InsertChildSession(canvas, container, child, cursor, reattach)
    : new ContainerizeSession(canvas, container, child, cursor, reattach);
}
