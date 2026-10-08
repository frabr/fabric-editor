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
import { type LayoutSession, type LayoutData, type ChildData, type FlexDirection } from "./types";
import { scaledSize, setShapeSize, topLeft, syncCoords, pointInObject } from "./geometry";

import { yogaLayout } from "./yoga-engine";
import { runLayout, bubbleUpLayout } from "./reconcile";
import { LayoutAnimator } from "./layout-animator";
import { layoutOf, containerDataOf, sizingOf, directionOf, paddingOf, cloneLayout, detachChild } from "./model";
import { childrenOf, flowChildrenOf } from "./hierarchy";

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

  /** Animator for smooth sibling/child transitions. */
  private _animator: LayoutAnimator;

  /** Sibling positions at anchor time — stable reference for gap calculation. */
  private _siblingAnchors = new Map<FabricObject, { left: number; top: number; w: number; h: number }>();

  /** Size of the dragged child when grabbed — Yoga may squeeze it in later frames. */
  private _newChildAnchorSize = { w: 0, h: 0 };

  /** Last Yoga-computed position of the dragged child (not the cursor position). */
  private _lastDraggedYogaPos: { left: number; top: number } | null = null;

  constructor(canvas: DesignCanvas, container: FabricObject, newChild: FabricObject, cursor: { x: number; y: number }) {
    this.canvas = canvas;
    this._container = container;
    this.newChild = newChild;
    this._newChildAnchorSize = scaledSize(newChild);
    this._isReattach = false;
    this._animator = new LayoutAnimator(canvas);

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
    const existing = flowChildrenOf(canvas.getObjects(), container);
    const cd = containerDataOf(container);
    this._decidingDirection = existing.length === 1 && !cd?.flexDirection;

    // Ensure existing children have stable order values
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].cl.order == null) {
        existing[i].cl.order = i;
        const childLayout = layoutOf(existing[i].obj)!;
        if (childLayout?.child) {
          childLayout.child.order = i;
          existing[i].obj.set("layout", { ...childLayout });
        }
      }
    }

    // Snapshot sibling positions — stable reference for gap calculation.
    // Reading topLeft here is safe: Yoga hasn't touched them yet in this session.
    for (const { obj } of existing) {
      const tl = topLeft(obj);
      const sz = scaledSize(obj);
      this._siblingAnchors.set(obj, { left: tl.x, top: tl.y, w: sz.w, h: sz.h });
    }

    // Set up the new child's layout (no margins — spacing is container padding + gap)
    const containerId = container.get?.("layerId") as string;
    const childData: ChildData = {
      parentId: containerId,
    };
    const existingChildLayout = layoutOf(newChild)! ?? {};
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
    session._newChildAnchorSize = scaledSize(child);
    session._isReattach = true;
    session._currentDirection = null;
    session._lastOrder = null;
    session._animator = new LayoutAnimator(canvas);

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
    const allChildren = flowChildrenOf(canvas.getObjects(), container);
    session._decidingDirection = allChildren.length <= 2;

    // Ensure existing children have stable order values
    for (let i = 0; i < allChildren.length; i++) {
      if (allChildren[i].cl.order == null) {
        allChildren[i].cl.order = i;
        const cl = layoutOf(allChildren[i].obj)!;
        if (cl?.child) {
          cl.child.order = i;
          allChildren[i].obj.set("layout", { ...cl });
        }
      }
    }

    // Snapshot sibling positions — stable reference for gap calculation.
    session._siblingAnchors = new Map();
    for (const { obj } of allChildren) {
      if (obj !== child) {
        const tl = topLeft(obj);
        const sz = scaledSize(obj);
        session._siblingAnchors.set(obj, { left: tl.x, top: tl.y, w: sz.w, h: sz.h });
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
    // Capture the floor so the container stays at its expanded size
    const layout = layoutOf(this._container)!;
    const { w, h } = scaledSize(this._container);
    this._container.set("layout", { ...layout, sizing: { ...sizingOf(this._container), minSize: { w, h } } });

    // Capture all children positions before final layout
    const allChildren = childrenOf(this.canvas.getObjects(), this._container);
    const positionsBefore = new Map<FabricObject, { left: number; top: number }>();
    for (const { obj } of allChildren) {
      positionsBefore.set(obj, { left: obj.left!, top: obj.top! });
    }

    // Yoga takes full control at commit — positions everything properly
    runLayout(this.canvas.getObjects());

    // Animate all children (including dragged) that snapped to a new position
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }

    this.canvas.renderAll();
    // Text edits relayout through the LayoutManager's `text:changed` listener
    return () => {};
  }

  rollback(): void {
    // Kill any in-flight animations — positions will be restored from snapshot
    this._animator.cancelAll();

    if (this._isReattach) {
      detachChild(this.newChild);

      // Restore container to snapshot state
      this._container.set("layout", this.snapshot.containerLayout ?? undefined);
      this._container.set({ left: this.snapshot.containerLeft, top: this.snapshot.containerTop });
      setShapeSize(this._container, this.snapshot.containerW, this.snapshot.containerH);
      this._container.setCoords();
      this.newChild.setCoords();

      // If only 1 child remains, clear flexDirection/gap so they can
      // be re-decided when a new 2nd child is inserted
      const remaining = childrenOf(this.canvas.getObjects(), this._container);
      if (remaining.length <= 1) {
        const cLayout = layoutOf(this._container);
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
    detachChild(this.newChild);
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
    // Snap mid-animation siblings to their Yoga targets so that
    // computeInsertOrder reads stable positions, not interpolated ones.
    // Exclude the dragged child — Fabric's drag handler sets its position.
    this._animator.flushToTargets(this.newChild);

    const containerLayout = layoutOf(this._container)!;
    const cd = containerLayout.container!;

    const allChildren = flowChildrenOf(this.canvas.getObjects(), this._container);
    const otherChildren = allChildren.filter(c => c.obj !== this.newChild);

    const isColumn = directionOf(cd) === "column";

    if (this._decidingDirection && otherChildren.length === 1) {
      // ── 2nd child: decide direction + gap ──
      const direction = this.detectDirection(cursor, otherChildren[0]);
      cd.flexDirection = direction;
      const dirIsColumn = direction === "column";
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, dirIsColumn);
      const gap = this.computeGap(cursor, otherChildren, insertOrder, dirIsColumn);
      cd.gap = Math.min(gap, this.freeMainSpace(otherChildren, dirIsColumn));
      this._container.set("layout", { ...containerLayout });

      const layout = layoutOf(this.newChild)!;
      if (layout?.child) {
        layout.child.order = insertOrder;
        this.newChild.set("layout", { ...layout });
      }

    } else {
      // ── 3rd+ child: only change order, direction and gap are locked ──
      const insertOrder = this.computeInsertOrder(cursor, otherChildren, isColumn);

      const layout = layoutOf(this.newChild)!;
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
    // Use anchored position so direction detection doesn't shift
    // after Yoga moves the sibling into a row/column slot.
    const anchor = this._siblingAnchors.get(existingChild.obj);
    const childX = anchor ? anchor.left : topLeft(existingChild.obj).x;
    const childY = anchor ? anchor.top : topLeft(existingChild.obj).y;
    const childW = anchor ? anchor.w : scaledSize(existingChild.obj).w;
    const childH = anchor ? anchor.h : scaledSize(existingChild.obj).h;

    // Distance from the child's nearest edge on each axis
    // (0 if cursor is within the child's bounds on that axis)
    const dx = Math.max(0, cursor.x - (childX + childW), childX - cursor.x);
    const dy = Math.max(0, cursor.y - (childY + childH), childY - cursor.y);

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
   * The swap threshold is the **far edge** of each sibling — the dragged
   * child swaps once it fully passes the sibling.
   *
   * Uses anchored sibling positions to avoid feedback loops with Yoga.
   */
  private computeInsertOrder(
    cursor: { x: number; y: number },
    existingChildren: { obj: FabricObject; cl: ChildData }[],
    isColumn: boolean,
  ): number {
    if (existingChildren.length === 0) return 0;

    const cursorPos = isColumn ? cursor.y : cursor.x;

    // Build slots: [before child 0] [between 0-1] ... [after last]
    // The boundary between "before child i" and "after child i" is the
    // child's far edge (right/bottom). This means the dragged element
    // must pass the sibling entirely before swapping.
    const slots: { order: number; boundary: number }[] = [];

    for (let i = 0; i <= existingChildren.length; i++) {
      let order: number;
      if (i === 0) {
        order = (existingChildren[0].cl.order ?? 0) - 1;
      } else if (i === existingChildren.length) {
        order = (existingChildren[existingChildren.length - 1].cl.order ?? (existingChildren.length - 1)) + 1;
      } else {
        const prevOrder = existingChildren[i - 1].cl.order ?? (i - 1);
        const nextOrder = existingChildren[i].cl.order ?? i;
        order = (prevOrder + nextOrder) / 2;
      }

      // Boundary = far edge of child i-1 (the child we just passed).
      // For slot 0 there is no previous child → -Infinity.
      let boundary: number;
      if (i > 0) {
        const prev = existingChildren[i - 1];
        const anchor = this._siblingAnchors.get(prev.obj);
        if (anchor) {
          boundary = isColumn ? anchor.top + anchor.h : anchor.left + anchor.w;
        } else {
          const tl = topLeft(prev.obj);
          const sz = scaledSize(prev.obj);
          boundary = isColumn ? tl.y + sz.h : tl.x + sz.w;
        }
      } else {
        boundary = -Infinity;
      }

      slots.push({ order, boundary });
    }

    // Find which slot the cursor is in: last slot whose boundary we've passed
    for (let i = slots.length - 1; i >= 0; i--) {
      if (cursorPos >= slots[i].boundary) {
        this._lastOrder = slots[i].order;
        return slots[i].order;
      }
    }

    this._lastOrder = slots[0].order;
    return slots[0].order;
  }

  /**
   * Room the gap may take on the main axis: unlimited when the container hugs
   * it (it grows), else the inner size minus the children's sizes when grabbed
   * — the gap stops when they reach the edge instead of squeezing them.
   */
  private freeMainSpace(
    existingChildren: { obj: FabricObject; cl: ChildData }[],
    isColumn: boolean,
  ): number {
    const sizing = sizingOf(this._container);
    if ((isColumn ? sizing.y : sizing.x) === "hug") return Infinity;

    const cd = layoutOf(this._container)!.container!;
    const pad = paddingOf(cd);
    const { w, h } = scaledSize(this._container);
    const inner = isColumn ? h - pad.top - pad.bottom : w - pad.left - pad.right;

    const main = (size: { w: number; h: number }) => (isColumn ? size.h : size.w);
    let used = main(this._newChildAnchorSize);
    for (const { obj } of existingChildren) {
      const anchor = this._siblingAnchors.get(obj);
      used += main(anchor ?? scaledSize(obj));
    }
    return Math.max(0, Math.floor(inner - used));
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

    // Measure the gap between the dragged child and the nearest sibling.
    // Uses anchored positions (session start) to avoid Yoga feedback loops.
    //
    // Before swap: dragged is after sibling → gap = dragged.nearEdge - sibling.farEdge
    //   → shrinks as cursor approaches sibling, reaches 0 at contact.
    // After swap: dragged is before sibling → gap = sibling.farEdge - dragged.farEdge
    //   → grows as cursor continues past the sibling.
    let minDist = Infinity;
    for (const child of existingChildren) {
      const anchor = this._siblingAnchors.get(child.obj);
      if (!anchor) continue;

      const farEdge = isColumn ? anchor.top + anchor.h : anchor.left + anchor.w;
      const childOrder = child.cl.order ?? 0;

      let dist: number;
      if (childOrder < insertOrder) {
        // Dragged is after sibling → gap from sibling's far edge to dragged's near edge
        dist = cursorPos - newChildHalf - farEdge;
      } else {
        // Dragged is before sibling → gap from dragged's far edge to sibling's far edge
        // (farEdge is the swap threshold — cursor just passed it, so distance grows)
        dist = farEdge - (cursorPos + newChildHalf);
      }

      if (dist >= 0 && dist < minDist) minDist = dist;
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
    const containerLayout = layoutOf(this._container)!;
    const cd = containerLayout.container!;
    const sizing = sizingOf(this._container);
    const { w: currentW, h: currentH } = scaledSize(this._container);
    const minW = sizing.minSize?.w ?? 0;
    const minH = sizing.minSize?.h ?? 0;

    const containerTL = topLeft(this._container);

    // Capture sibling Yoga-target positions before the new layout pass.
    // For mid-animation objects we read the animator's target (the last
    // Yoga result) instead of obj.left/top which holds an interpolated value.
    const positionsBefore = this.captureChildPositions(allChildren);

    // For the measure pass, use minSize as the constraint in hug mode
    // (not currentW which may be inflated from a previous frame)
    const modeX = sizing.x;
    const modeY = sizing.y;
    const measureW = modeX === "hug" ? minW : currentW;
    const measureH = modeY === "hug" ? minH : currentH;

    const objects = this.canvas.getObjects();
    const { w: requiredW, h: requiredH } = yogaLayout(
      allChildren, containerTL.x, containerTL.y, measureW, measureH, cd, sizing, objects,
    );

    // Size: hug adapts to content (min = snapshot minSize), fixed stays put
    const finalW = modeX === "hug" ? Math.max(requiredW, minW) : currentW;
    const finalH = modeY === "hug" ? Math.max(requiredH, minH) : currentH;

    if (finalW !== currentW || finalH !== currentH) {
      setShapeSize(this._container, finalW, finalH);
      const tl2 = topLeft(this._container);
      yogaLayout(allChildren, tl2.x, tl2.y, finalW, finalH, cd, sizing, objects);
    }

    syncCoords(this._container, allChildren);

    // Save the dragged child's Yoga position (before animation overwrites it)
    this._lastDraggedYogaPos = { left: this.newChild.left!, top: this.newChild.top! };

    // Animate all children whose position changed (order swap / crossing).
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }

    // Bubble up the entire ancestor chain so all parents accommodate the new size
    if (finalW !== currentW || finalH !== currentH) {
      bubbleUpLayout(this._container, this.canvas.getObjects());
    }
  }

  /** Snapshot all children positions using animator targets when available. */
  private captureChildPositions(
    allChildren: { obj: FabricObject; cl: ChildData }[],
  ): Map<FabricObject, { left: number; top: number }> {
    const map = new Map<FabricObject, { left: number; top: number }>();
    for (const { obj } of allChildren) {
      const target = this._animator.getTarget(obj);
      if (target) {
        map.set(obj, target);
      } else if (obj === this.newChild && this._lastDraggedYogaPos) {
        // For the dragged child, obj.left/top holds the cursor position
        // (set by Fabric's drag handler), not the Yoga slot. Use the
        // last known Yoga position instead.
        map.set(obj, this._lastDraggedYogaPos);
      } else {
        map.set(obj, { left: obj.left!, top: obj.top! });
      }
    }
    return map;
  }
}
