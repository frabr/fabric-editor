/**
 * InsertChildSession — encapsulates adding a child to an existing container.
 *
 * Unlike ContainerizeSession (which transforms a shape into a container),
 * this session adds an additional child into a container that already has
 * children.
 *
 * Design principle: the SESSION controls all decisions (direction, order,
 * margins). Yoga is used only as a "calculator" — we ask it to preview
 * where children would go given the current parameters, and we apply
 * the result only to the OTHER children (not the one being dragged).
 * The dragged child stays under the cursor. No feedback loops.
 *
 * Key behavior when inserting the **second** child:
 * - The container's flexDirection is undecided at this point.
 * - Cursor position relative to the existing child determines direction:
 *   above/below → column, left/right → row.
 * - This is re-evaluated on every drag frame.
 *
 * For containers that already have a direction (3rd child+), the cursor
 * determines insertion order (before/after existing children).
 */
import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";
import type { LayoutSession, LayoutData, ChildData, FlexDirection } from "./types";
import { scaledSize, setShapeSize, topLeft, syncCoords, pointInObject, isTextObject } from "./geometry";
import { resolveContainerChildren, sortChildrenByOrder } from "./resize-session";
import { yogaLayout } from "./yoga-engine";
import { runLayout, relayoutSubContainers } from "./reconcile";

// ── Constants ────────────────────────────────────────────────────────

const EXIT_MARGIN = 5;

// ── InsertChildSession ──────────────────────────────────────────────

export class InsertChildSession implements LayoutSession {
  private canvas: DesignCanvas;
  private _container: FabricObject;
  private newChild: FabricObject;

  private snapshot: {
    containerW: number; containerH: number;
    containerLeft: number; containerTop: number;
    containerLayout: LayoutData | undefined;
    childLeft: number; childTop: number; childLayout: LayoutData | undefined;
  };

  /** Whether this is a reattach (repositioning existing child) vs new insertion. */
  private _isReattach: boolean;

  /** Whether this insertion is deciding the container's flex direction (2nd child). */
  private _decidingDirection: boolean;

  /** Current decided direction — cached for hysteresis. null = not yet decided. */
  private _currentDirection: FlexDirection | null = null;

  constructor(canvas: DesignCanvas, container: FabricObject, newChild: FabricObject, cursor: { x: number; y: number }) {
    this.canvas = canvas;
    this._container = container;
    this.newChild = newChild;
    this._isReattach = false;

    // Snapshot for rollback
    const { w: cw, h: ch } = scaledSize(container);
    this.snapshot = {
      containerW: cw,
      containerH: ch,
      containerLeft: container.left,
      containerTop: container.top,
      containerLayout: cloneLayout(container),
      childLeft: newChild.left,
      childTop: newChild.top,
      childLayout: cloneLayout(newChild),
    };

    // If the container has exactly 1 child and no explicit direction yet,
    // this insertion will decide the direction.
    const existing = sortChildrenByOrder(resolveContainerChildren(canvas.getObjects(), container));
    const cd = (container.get?.("layout") as LayoutData | undefined)?.container;
    this._decidingDirection = existing.length === 1 && !cd?.flexDirection;

    // Ensure existing children have stable order values
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].cl.order == null) {
        existing[i].cl.order = i;
        const childLayout = existing[i].obj.get?.("layout") as LayoutData;
        if (childLayout?.child) {
          childLayout.child.order = i;
          existing[i].obj.set("layout", { ...childLayout });
        }
      }
    }

    // Set up the new child's layout (no margins — spacing is container padding + gap)
    const containerId = container.get?.("layerId") as string;
    const childData: ChildData = {
      parentId: containerId,
    };
    const existingChildLayout = (newChild.get?.("layout") as LayoutData) ?? {};
    newChild.set("layout", { ...existingChildLayout, child: childData });

    // Normalize new child origin to top-left
    const tTL = topLeft(newChild);
    newChild.set({ left: tTL.x, top: tTL.y, originX: "left", originY: "top" });
    newChild.setCoords();

    // Initial direction + order computation and preview
    this.updateFromCursor(cursor);
  }

  /**
   * Create a session for repositioning a child that is already in the container.
   * On rollback (drag outside), the child is detached from the container.
   */
  static reattach(canvas: DesignCanvas, container: FabricObject, child: FabricObject, cursor: { x: number; y: number }): InsertChildSession {
    const session = Object.create(InsertChildSession.prototype) as InsertChildSession;
    session.canvas = canvas;
    session._container = container;
    session.newChild = child;
    session._isReattach = true;
    session._currentDirection = null;
    session._lastOrder = null;

    // Snapshot for rollback
    const { w: cw, h: ch } = scaledSize(container);
    session.snapshot = {
      containerW: cw,
      containerH: ch,
      containerLeft: container.left,
      containerTop: container.top,
      containerLayout: cloneLayout(container),
      childLeft: child.left,
      childTop: child.top,
      childLayout: cloneLayout(child),
    };

    // For reattach with exactly 2 children, allow direction + gap change
    // (the flex direction was decided during the original insertion, but
    // reattach should let the user change it again)
    const allChildren = sortChildrenByOrder(resolveContainerChildren(canvas.getObjects(), container));
    session._decidingDirection = allChildren.length <= 2;

    // Ensure existing children have stable order values
    for (let i = 0; i < allChildren.length; i++) {
      if (allChildren[i].cl.order == null) {
        allChildren[i].cl.order = i;
        const cl = allChildren[i].obj.get?.("layout") as LayoutData;
        if (cl?.child) {
          cl.child.order = i;
          allChildren[i].obj.set("layout", { ...cl });
        }
      }
    }

    // Initial preview from cursor
    session.updateFromCursor(cursor);

    return session;
  }

  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited" {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }

    this.updateFromCursor(cursor);
    return "anchored";
  }

  commit(): () => void {
    // Capture minSize so the container stays at its expanded size
    const layout = this._container.get?.("layout") as LayoutData;
    const cd = layout.container!;
    const { w, h } = scaledSize(this._container);
    if (!cd.minSize) cd.minSize = { w: 0, h: 0 };
    cd.minSize.w = w;
    cd.minSize.h = h;

    // Yoga takes full control at commit — positions everything properly
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();

    // Reattach: listener already exists from the first attach
    if (this._isReattach) {
      return () => {};
    }

    // Only text objects fire "changed" (on content edit); shapes don't need it
    if (isTextObject(this.newChild)) {
      const relayout = () => {
        runLayout(this.canvas.getObjects());
        this.canvas.renderAll();
      };
      (this.newChild as any).on("changed", relayout);
      return () => (this.newChild as any).off("changed", relayout);
    }

    return () => {};
  }

  rollback(): void {
    if (this._isReattach) {
      // Detach: remove child block from layout
      const layout = this.newChild.get?.("layout") as LayoutData | undefined;
      if (layout) {
        delete layout.child;
        if (!layout.container) {
          this.newChild.set("layout", undefined);
        } else {
          this.newChild.set("layout", { ...layout });
        }
      }

      // Restore container to snapshot state
      this._container.set("layout", this.snapshot.containerLayout ?? undefined);
      this._container.set({ left: this.snapshot.containerLeft, top: this.snapshot.containerTop });
      setShapeSize(this._container, this.snapshot.containerW, this.snapshot.containerH);
      this._container.setCoords();
      this.newChild.setCoords();

      // If only 1 child remains, clear flexDirection/gap so they can
      // be re-decided when a new 2nd child is inserted
      const remaining = resolveContainerChildren(this.canvas.getObjects(), this._container);
      if (remaining.length <= 1) {
        const cLayout = this._container.get?.("layout") as LayoutData | undefined;
        if (cLayout?.container) {
          delete cLayout.container.flexDirection;
          delete cLayout.container.gap;
          this._container.set("layout", { ...cLayout });
        }
      }

      // Re-run layout to reposition remaining children
      runLayout(this.canvas.getObjects());
      this.canvas.renderAll();
      return;
    }

    // New insertion: restore everything to pre-session state
    this.newChild.set("layout", this.snapshot.childLayout ?? undefined);
    this.newChild.set({ left: this.snapshot.childLeft, top: this.snapshot.childTop });
    this.newChild.setCoords();

    this._container.set("layout", this.snapshot.containerLayout ?? undefined);
    this._container.set({ left: this.snapshot.containerLeft, top: this.snapshot.containerTop });
    setShapeSize(this._container, this.snapshot.containerW, this.snapshot.containerH);
    this._container.setCoords();

    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  get container(): FabricObject { return this._container; }
  get child(): FabricObject { return this.newChild; }

  // ── Private ───────────────────────────────────────────────────────

  private shouldExit(cursor: { x: number; y: number }): boolean {
    return !pointInObject(cursor, this._container, EXIT_MARGIN);
  }

  /**
   * Session decides direction + order from cursor, then asks yoga
   * to preview positions. Only OTHER children are repositioned;
   * the dragged child stays under the cursor.
   */
  private updateFromCursor(cursor: { x: number; y: number }): void {
    const containerLayout = this._container.get?.("layout") as LayoutData;
    const cd = containerLayout.container!;

    const allChildren = sortChildrenByOrder(
      resolveContainerChildren(this.canvas.getObjects(), this._container),
    );
    const otherChildren = allChildren.filter(c => c.obj !== this.newChild);

    const isColumn = (cd.flexDirection ?? "column") === "column";

    if (this._decidingDirection && otherChildren.length === 1) {
      // ── 2nd child: decide direction + gap ──
      const direction = this.detectDirection(cursor, otherChildren[0]);
      cd.flexDirection = direction;
      const dirIsColumn = direction === "column";
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, dirIsColumn);
      const gap = this.computeGap(cursor, otherChildren, insertOrder, dirIsColumn);
      cd.gap = gap;
      this._container.set("layout", { ...containerLayout });

      const layout = this.newChild.get?.("layout") as LayoutData;
      if (layout?.child) {
        layout.child.order = insertOrder;
        this.newChild.set("layout", { ...layout });
      }

    } else {
      // ── 3rd+ child: only change order, direction and gap are locked ──
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, isColumn);

      const layout = this.newChild.get?.("layout") as LayoutData;
      if (layout?.child) {
        layout.child.order = insertOrder;
        this.newChild.set("layout", { ...layout });
      }

    }

    // ── Ask yoga to preview positions ──
    this.previewLayout(allChildren);
  }

  /**
   * Detect flex direction from cursor position relative to the existing child.
   * The key insight: we measure where the cursor is relative to the child's
   * bounding box edges, not its center. This way "bottom-right of child"
   * correctly detects that dy > dx when the cursor is clearly below.
   *
   * Hysteresis: once a direction is chosen, require a clear margin to switch.
   */
  private detectDirection(
    cursor: { x: number; y: number },
    existingChild: { obj: FabricObject; cl: ChildData },
  ): FlexDirection {
    const childTL = topLeft(existingChild.obj);
    const { w: childW, h: childH } = scaledSize(existingChild.obj);

    // Distance from the child's nearest edge on each axis
    // (0 if cursor is within the child's bounds on that axis)
    const dx = Math.max(0, cursor.x - (childTL.x + childW), childTL.x - cursor.x);
    const dy = Math.max(0, cursor.y - (childTL.y + childH), childTL.y - cursor.y);

    // First decision: no hysteresis
    if (this._currentDirection === null) {
      this._currentDirection = dy >= dx ? "column" : "row";
      return this._currentDirection;
    }

    // Subsequent: require 1.3x margin to switch
    const SWITCH_RATIO = 1.3;
    if (this._currentDirection === "column" && dx > dy * SWITCH_RATIO) {
      this._currentDirection = "row";
    } else if (this._currentDirection === "row" && dy > dx * SWITCH_RATIO) {
      this._currentDirection = "column";
    }

    return this._currentDirection;
  }

  /** Last computed order — for hysteresis. */
  private _lastOrder: number | null = null;

  /**
   * Compute the insertion order based on cursor position in the main axis.
   * Uses the midpoint between consecutive children as the decision boundary.
   * Hysteresis: once an order is chosen, the cursor must cross a neighboring
   * boundary to change it (no flickering near boundaries).
   */
  private computeInsertOrder(
    cursor: { x: number; y: number },
    existingChildren: { obj: FabricObject; cl: ChildData }[],
    isColumn: boolean,
  ): number {
    if (existingChildren.length === 0) return 0;

    const cursorPos = isColumn ? cursor.y : cursor.x;

    // Compute boundaries between children (midpoints)
    // Slots: [before child 0] [between 0-1] [between 1-2] ... [after last]
    // Each slot has an order value that goes between existing orders
    const slots: { order: number; boundaryStart: number; boundaryEnd: number }[] = [];

    for (let i = 0; i <= existingChildren.length; i++) {
      const prevChild = i > 0 ? existingChildren[i - 1] : null;
      const nextChild = i < existingChildren.length ? existingChildren[i] : null;

      // Compute boundary start/end for this slot
      let start = -Infinity;
      let end = Infinity;

      if (prevChild) {
        const tl = topLeft(prevChild.obj);
        const size = scaledSize(prevChild.obj);
        const prevEnd = isColumn ? tl.y + size.h : tl.x + size.w;
        start = prevEnd;
      }
      if (nextChild) {
        const tl = topLeft(nextChild.obj);
        const nextStart = isColumn ? tl.y : tl.x;
        end = nextStart;
      }

      // Order value for this slot
      let order: number;
      if (i === 0) {
        const firstOrder = existingChildren[0].cl.order ?? 0;
        order = firstOrder - 1;
      } else if (i === existingChildren.length) {
        const lastOrder = existingChildren[existingChildren.length - 1].cl.order ?? (existingChildren.length - 1);
        order = lastOrder + 1;
      } else {
        const prevOrder = existingChildren[i - 1].cl.order ?? (i - 1);
        const nextOrder = existingChildren[i].cl.order ?? i;
        order = (prevOrder + nextOrder) / 2;
      }

      slots.push({ order, boundaryStart: start, boundaryEnd: end });
    }

    // Find which slot the cursor is in
    // Use midpoint between slot boundaries as the decision point
    for (let i = 0; i < slots.length - 1; i++) {
      const midpoint = (slots[i].boundaryEnd + slots[i + 1].boundaryStart) / 2;
      if (isFinite(midpoint) && cursorPos < midpoint) {
        this._lastOrder = slots[i].order;
        return slots[i].order;
      }
    }

    // Cursor is after all children
    const lastSlot = slots[slots.length - 1];
    this._lastOrder = lastSlot.order;
    return lastSlot.order;
  }

  /**
   * Compute the gap between children from the cursor's distance to the
   * nearest neighbor in the main axis. The gap is the space between the
   * cursor and the nearest edge of an existing child, minus the new child's
   * half-size (since the cursor is roughly at the child's center).
   */
  private computeGap(
    cursor: { x: number; y: number },
    existingChildren: { obj: FabricObject; cl: ChildData }[],
    insertOrder: number,
    isColumn: boolean,
  ): number {
    if (existingChildren.length === 0) return 0;

    const cursorPos = isColumn ? cursor.y : cursor.x;
    const newChildSize = scaledSize(this.newChild);
    const newChildHalf = isColumn ? newChildSize.h / 2 : newChildSize.w / 2;

    // Find the nearest neighbor's edge in the main axis
    let minDist = Infinity;
    for (const child of existingChildren) {
      const childOrder = child.cl.order ?? 0;
      const tl = topLeft(child.obj);
      const size = scaledSize(child.obj);

      let edge: number;
      if (childOrder < insertOrder) {
        // This child is before the new one → measure from its far edge
        edge = isColumn ? tl.y + size.h : tl.x + size.w;
        const dist = cursorPos - newChildHalf - edge;
        if (dist >= 0 && dist < minDist) minDist = dist;
      } else {
        // This child is after the new one → measure from its near edge
        edge = isColumn ? tl.y : tl.x;
        const dist = edge - (cursorPos + newChildHalf);
        if (dist >= 0 && dist < minDist) minDist = dist;
      }
    }

    return isFinite(minDist) ? Math.max(0, Math.round(minDist)) : 0;
  }

  /**
   * Ask yoga to compute positions for ALL children including the dragged one.
   * Yoga positions everyone into their flex slots — the dragged child snaps
   * to its computed position. The session controls direction + order, yoga
   * just calculates where things go.
   *
   * Container grows if needed (never shrinks during session).
   */
  private previewLayout(allChildren: { obj: FabricObject; cl: ChildData }[]): void {
    const containerLayout = this._container.get?.("layout") as LayoutData;
    const cd = containerLayout.container!;
    const { w: currentW, h: currentH } = scaledSize(this._container);
    const minW = cd.minSize?.w ?? 0;
    const minH = cd.minSize?.h ?? 0;

    const containerTL = topLeft(this._container);

    // For the measure pass, use minSize as the constraint in hug mode
    // (not currentW which may be inflated from a previous frame)
    const modeX = cd.sizeMode.x;
    const modeY = cd.sizeMode.y;
    const measureW = modeX === "hug" ? minW : currentW;
    const measureH = modeY === "hug" ? minH : currentH;

    const { w: requiredW, h: requiredH } = yogaLayout(
      allChildren, containerTL.x, containerTL.y, measureW, measureH, cd,
    );

    // Size: hug adapts to content (min = snapshot minSize), fixed stays put
    const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
    const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;

    if (finalW !== currentW || finalH !== currentH) {
      setShapeSize(this._container, finalW, finalH);
      const tl2 = topLeft(this._container);
      yogaLayout(allChildren, tl2.x, tl2.y, finalW, finalH, cd);
    }

    syncCoords(this._container, allChildren);

    // Recursively reposition sub-containers (their position may have changed)
    relayoutSubContainers(allChildren, this.canvas.getObjects());
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Deep-clone a Fabric object's layout data for snapshot/rollback. */
function cloneLayout(obj: FabricObject): LayoutData | undefined {
  const layout = obj.get?.("layout") as LayoutData | undefined;
  return layout ? JSON.parse(JSON.stringify(layout)) : undefined;
}
