/**
 * ContainerizeSession — the first child of a stack.
 *
 * An object (text, shape, or another container) dragged into an empty stack — a
 * block made with makeContainer, or a container that lost its children — becomes
 * its first child: the padding comes from where it is dropped, a hug axis wraps
 * around it, a fixed axis keeps its size. Created by createDropSession, destroyed
 * after commit or rollback.
 */
import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../../../DesignCanvas";
import { MIN_PAD } from "../../types";
import { scaledSize, setShapeSize, topLeft, clampTopLeft, hasExceededOffset, pointInObject } from "../../geometry";
import { runLayout, layoutSubtree, relayoutAncestors } from "../../run";
import { layoutOf, sizingOf, detachChild, isContainerObject, updateContainer } from "../../model";
import { asLayoutText, isTextObject } from "../../text";
import { EXIT_MARGIN, restorePlacement, takePlacement, type LayoutSession, type Placement } from "./session";

// ── ContainerizeSession ─────────────────────────────────────────────

export class ContainerizeSession implements LayoutSession {
  private readonly before: { container: Placement; child: Placement };
  /** Le décalage imposé à l'enfant pour qu'il entre dans les marges (pas de reattach). */
  private clampDx = 0;
  private clampDy = 0;

  /**
   * `reattach` : l'enfant est déjà dedans et on l'y déplace — rien à créer ; l'annulation
   * le sort du container au lieu de tout remettre comme avant.
   */
  constructor(
    private readonly canvas: DesignCanvas,
    readonly container: FabricObject,
    readonly child: FabricObject,
    private readonly anchorCursor: { x: number; y: number },
    private readonly isReattach = false,
  ) {
    this.before = { container: takePlacement(container), child: takePlacement(child) };
    if (isReattach) return;

    normalizeShapeOrigin(container);
    applyInitialLayout(container, child);

    const clamped = clampTopLeft(child, container, MIN_PAD);
    const preTL = topLeft(child);
    this.clampDx = clamped.x - preTL.x;
    this.clampDy = clamped.y - preTL.y;
    canvas.adjustGrabOffset(this.clampDx, this.clampDy);
    if (this.clampDx !== 0 || this.clampDy !== 0) {
      child.set({ left: child.left + this.clampDx, top: child.top + this.clampDy });
      child.setCoords();
    }

    wrapContainerAroundChild(child, container);
    if (isContainerObject(child)) layoutSubtree(child, canvas.getObjects());
  }

  /** @deprecated Use `new ContainerizeSession(…, true)` or createDropSession. */
  static reattach(canvas: DesignCanvas, container: FabricObject, child: FabricObject, cursor: { x: number; y: number }): ContainerizeSession {
    return new ContainerizeSession(canvas, container, child, cursor, true);
  }

  /** During drag: keep the child in the margins, fit the container, check for exit. */
  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited" {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }

    const clamped = clampTopLeft(this.child, this.container, MIN_PAD);
    const currentTL = topLeft(this.child);
    const dx = clamped.x - currentTL.x;
    const dy = clamped.y - currentTL.y;
    if (dx !== 0 || dy !== 0) {
      this.child.set({ left: this.child.left + dx, top: this.child.top + dy });
      this.child.setCoords();
    }

    wrapContainerAroundChild(this.child, this.container);
    if (isContainerObject(this.child)) layoutSubtree(this.child, this.canvas.getObjects());
    // Every ancestor accommodates the new size
    relayoutAncestors(this.container, this.canvas.getObjects());

    return "anchored";
  }

  /**
   * Finalize the attach. Text edits relayout through the LayoutManager's
   * canvas-wide `text:changed` listener — nothing to clean up here.
   */
  commit(): void {
    const tTL = topLeft(this.child);
    this.child.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    this.child.setCoords();

    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  /** Undo: a reattached child leaves; a new one goes back where it was, so does the container. */
  rollback(): void {
    if (this.isReattach) {
      detachChild(this.child);
      restorePlacement(this.container, this.before.container, { size: true, layout: true });
      this.child.setCoords();
      this.canvas.renderAll();
      return;
    }

    restorePlacement(this.container, this.before.container, { size: true, position: true, style: true, layout: true });
    restorePlacement(this.child, this.before.child, { size: true, position: true, style: true, layout: true });
    if (isTextObject(this.child)) asLayoutText(this.child).layoutWith(null);

    this.canvas.adjustGrabOffset(-this.clampDx, -this.clampDy);
    this.canvas.renderAll();
  }

  private shouldExit(cursor: { x: number; y: number }): boolean {
    if (!pointInObject(cursor, this.container, EXIT_MARGIN)) return true;
    return hasExceededOffset(cursor, this.anchorCursor, this.clampDx, this.clampDy, EXIT_MARGIN);
  }
}

// ── Helpers (module-private) ─────────────────────────────────────────

function normalizeShapeOrigin(shape: FabricObject): void {
  const center = shape.getRelativeCenterPoint();
  const { w, h } = scaledSize(shape);
  shape.set({
    left: center.x - w / 2,
    top: center.y - h / 2,
    originX: "left",
    originY: "top",
  });
  shape.setCoords();
}

/**
 * Set up the initial layout relationship between a shape (future container)
 * and a child being dragged into it.
 *
 * - Adds `container` block to the shape's layout (preserves existing `child` block)
 * - Adds `child` block to the child's layout (preserves existing `container` block)
 */
function applyInitialLayout(shape: FabricObject, child: FabricObject): void {
  const sTL = topLeft(shape);
  const cTL = topLeft(child);
  const { w: shapeW, h: shapeH } = scaledSize(shape);

  const padX = Math.max(MIN_PAD, Math.round(cTL.x - sTL.x));
  const padY = Math.max(MIN_PAD, Math.round(cTL.y - sTL.y));

  const containerId = shape.get?.("layerId") as string;

  // Add container block to shape (preserve existing child block if nested).
  // The container hugs its child — a text brings its own sizing (a wrapping
  // text is fixed-width on its own), nothing to guess. The shape's current
  // size is the floor.
  const shapeLayout = layoutOf(shape) ?? {};
  shape.set("layout", {
    ...shapeLayout,
    sizing: shapeLayout.sizing ?? { x: "hug", y: "hug", minSize: { w: shapeW, h: shapeH } },
    // Un bloc déjà activé (makeContainer) garde ses réglages ; la marge vient du dépôt
    container: { ...shapeLayout.container, padding: { top: padY, right: padX, bottom: padY, left: padX } },
  });

  // Add child block to child (preserve existing container block if it has children)
  const childLayout = layoutOf(child) ?? {};
  child.set("layout", { ...childLayout, child: { parentId: containerId } });
}

/** Resize container to wrap around its child, updating padding from current position. */
export function wrapContainerAroundChild(child: FabricObject, container: FabricObject): void {
  const childLayout = layoutOf(child);
  const containerLayout = layoutOf(container);
  if (!childLayout?.child || !containerLayout?.container) return;

  const { w: childW, h: childH } = scaledSize(child);
  const sTL = topLeft(container);
  const tTL = topLeft(child);

  const padLeft = Math.max(MIN_PAD, Math.round(tTL.x - sTL.x));
  const padTop = Math.max(MIN_PAD, Math.round(tTL.y - sTL.y));

  updateContainer(container, { padding: { top: padTop, right: padLeft, bottom: padTop, left: padLeft } });

  const sizing = sizingOf(container);
  const minW = sizing.minSize?.w ?? 0;
  const minH = sizing.minSize?.h ?? 0;
  const requiredW = padLeft + childW + padLeft;
  const requiredH = padTop + childH + padTop;

  // Un axe fixe garde sa taille (un bloc activé) ; un axe « contenu » épouse l'enfant
  const { w, h } = scaledSize(container);
  setShapeSize(
    container,
    sizing.x === "fixed" ? w : Math.max(requiredW, minW),
    sizing.y === "fixed" ? h : Math.max(requiredH, minH),
  );
  container.setCoords();
}
