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
import type { DesignCanvas } from "../../../DesignCanvas";
import type { ChildData, FlexDirection } from "../../types";
import { scaledSize, setShapeSize, topLeft, syncCoords, pointInObject } from "../../geometry";

import { yogaLayout } from "../engine";
import { runLayout, relayoutAncestors } from "../../run";
import { LayoutAnimator } from "./animator";
import { layoutOf, containerDataOf, sizingOf, directionOf, paddingOf, detachChild, idOf, updateLayout, updateContainer, updateChild } from "../../model";
import { ensureStableOrders, EXIT_MARGIN, restorePlacement, siblingAnchors, takePlacement, type LayoutSession, type Placement, type SiblingAnchor } from "./session";
import { childrenOf, flowChildrenOf } from "../../hierarchy";

// ── InsertChildSession ──────────────────────────────────────────────

export class InsertChildSession implements LayoutSession {
  private readonly before: { container: Placement; child: Placement };

  /** Whether this insertion is deciding the container's flex direction (2nd child). */
  private _decidingDirection: boolean;

  /** Current decided direction — cached for hysteresis. null = not yet decided. */
  private _currentDirection: FlexDirection | null = null;

  /** Animator for smooth sibling/child transitions. */
  private _animator: LayoutAnimator;

  /** Sibling positions at anchor time — stable reference for gap calculation. */
  private _siblingAnchors: Map<FabricObject, SiblingAnchor>;

  /** Size of the dragged child when grabbed — Yoga may squeeze it in later frames. */
  private _newChildAnchorSize: { w: number; h: number };

  /** Last Yoga-computed position of the dragged child (not the cursor position). */
  private _lastDraggedYogaPos: { left: number; top: number } | null = null;

  /**
   * `reattach`: the child is already in the container and is moved inside it — on
   * rollback (dragged out) it leaves the container instead of going back.
   */
  constructor(
    private readonly canvas: DesignCanvas,
    readonly container: FabricObject,
    readonly child: FabricObject,
    cursor: { x: number; y: number },
    private readonly isReattach = false,
  ) {
    this._newChildAnchorSize = scaledSize(child);
    this._animator = new LayoutAnimator(canvas);
    this.before = { container: takePlacement(container), child: takePlacement(child) };

    const all = flowChildrenOf(canvas.getObjects(), container);
    const siblings = all.filter((c) => c.obj !== child);
    // The 2nd child decides the direction; a reattach among two lets the user change it again
    this._decidingDirection = isReattach
      ? all.length <= 2
      : siblings.length === 1 && !containerDataOf(container)?.flexDirection;

    ensureStableOrders(all);
    // Reading topLeft here is safe: Yoga hasn't touched the siblings yet in this session
    this._siblingAnchors = siblingAnchors(siblings);

    if (!isReattach) {
      // Spacing is the container's padding + gap: the child only says where it belongs
      updateLayout(child, { child: { parentId: idOf(container) } });
      const tl = topLeft(child);
      child.set({ left: tl.x, top: tl.y, originX: "left", originY: "top" });
      child.setCoords();
    }

    this.updateFromCursor(cursor);
  }

  /** @deprecated Use `new InsertChildSession(…, true)` or createDropSession. */
  static reattach(canvas: DesignCanvas, container: FabricObject, child: FabricObject, cursor: { x: number; y: number }): InsertChildSession {
    return new InsertChildSession(canvas, container, child, cursor, true);
  }

  handleMoving(cursor: { x: number; y: number }): "anchored" | "exited" {
    if (this.shouldExit(cursor)) {
      this.rollback();
      return "exited";
    }

    this.updateFromCursor(cursor);
    return "anchored";
  }

  commit(): void {
    // Capture the floor so the container stays at its expanded size
    const { w, h } = scaledSize(this.container);
    updateLayout(this.container, { sizing: { ...sizingOf(this.container), minSize: { w, h } } });

    // Capture all children positions before final layout
    const positionsBefore = new Map<FabricObject, { left: number; top: number }>();
    for (const { obj } of childrenOf(this.canvas.getObjects(), this.container)) {
      positionsBefore.set(obj, { left: obj.left, top: obj.top });
    }

    // Yoga takes full control at commit — positions everything properly
    runLayout(this.canvas.getObjects());

    // Animate all children (including dragged) that snapped to a new position
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }

    // Text edits relayout through the LayoutManager's `text:changed` listener
    this.canvas.renderAll();
  }

  rollback(): void {
    // Kill any in-flight animations — positions will be restored from the snapshot
    this._animator.cancelAll();
    detachChild(this.child);

    if (this.isReattach) {
      // A lone remaining child: the direction and gap are re-decided by the next 2nd child
      const remaining = childrenOf(this.canvas.getObjects(), this.container);
      const cd = this.before.container.layout?.container;
      if (remaining.length <= 1 && cd) {
        const { flexDirection: _d, gap: _g, ...rest } = cd;
        this.before.container.layout = { ...this.before.container.layout, container: rest };
      }
      this.child.setCoords();
    } else {
      restorePlacement(this.child, this.before.child, { position: true, layout: true });
    }
    restorePlacement(this.container, this.before.container, { size: true, position: true, layout: true });

    // Re-run layout to reposition the remaining children
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  // ── Private ───────────────────────────────────────────────────────

  private shouldExit(cursor: { x: number; y: number }): boolean {
    return !pointInObject(cursor, this.container, EXIT_MARGIN);
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
    this._animator.flushToTargets(this.child);

    const allChildren = flowChildrenOf(this.canvas.getObjects(), this.container);
    const otherChildren = allChildren.filter(c => c.obj !== this.child);

    if (this._decidingDirection && otherChildren.length === 1) {
      // ── 2nd child: decide direction + gap ──
      const direction = this.detectDirection(cursor, otherChildren[0]);
      const isColumn = direction === "column";
      const order = this.computeInsertOrder(cursor, otherChildren, isColumn);
      const gap = Math.min(
        this.computeGap(cursor, otherChildren, order, isColumn),
        this.freeMainSpace(otherChildren, isColumn),
      );
      updateContainer(this.container, { flexDirection: direction, gap });
      updateChild(this.child, { order });
    } else {
      // ── 3rd+ child: only change order, direction and gap are locked ──
      const isColumn = directionOf(containerDataOf(this.container)) === "column";
      updateChild(this.child, { order: this.computeInsertOrder(cursor, otherChildren, isColumn) });
    }

    // ── Ask yoga to preview positions (the children with their new order) ──
    this.previewLayout(flowChildrenOf(this.canvas.getObjects(), this.container));
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
        return slots[i].order;
      }
    }

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
    const sizing = sizingOf(this.container);
    if ((isColumn ? sizing.y : sizing.x) === "hug") return Infinity;

    const cd = layoutOf(this.container)!.container!;
    const pad = paddingOf(cd);
    const { w, h } = scaledSize(this.container);
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
    const newChildSize = scaledSize(this.child);
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
    const containerLayout = layoutOf(this.container)!;
    const cd = containerLayout.container!;
    const sizing = sizingOf(this.container);
    const { w: currentW, h: currentH } = scaledSize(this.container);
    const minW = sizing.minSize?.w ?? 0;
    const minH = sizing.minSize?.h ?? 0;

    const containerTL = topLeft(this.container);

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
      setShapeSize(this.container, finalW, finalH);
      const tl2 = topLeft(this.container);
      yogaLayout(allChildren, tl2.x, tl2.y, finalW, finalH, cd, sizing, objects);
    }

    syncCoords(this.container, allChildren);

    // Save the dragged child's Yoga position (before animation overwrites it)
    this._lastDraggedYogaPos = { left: this.child.left!, top: this.child.top! };

    // Animate all children whose position changed (order swap / crossing).
    for (const [obj, before] of positionsBefore) {
      if (obj.left !== before.left || obj.top !== before.top) {
        this._animator.animate(obj, before.left, before.top);
      }
    }

    // Bubble up the entire ancestor chain so all parents accommodate the new size
    if (finalW !== currentW || finalH !== currentH) {
      relayoutAncestors(this.container, this.canvas.getObjects());
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
      } else if (obj === this.child && this._lastDraggedYogaPos) {
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
