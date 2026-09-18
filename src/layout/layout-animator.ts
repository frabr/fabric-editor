/**
 * Lightweight RAF-based animator for layout transitions.
 *
 * Interpolates Fabric objects from their old position to a new one computed
 * by Yoga.  Used during drag (3rd+ child order swaps) and at commit time
 * to smooth the snap of children into their flex positions.
 *
 * Because Fabric re-reads `left`/`top` on every render, we animate those
 * properties directly and call `requestRenderAll` each frame.  If a new
 * layout pass fires mid-animation we capture the current interpolated
 * position as the new "from" — no jump.
 */

import type { FabricObject } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";

// ── Types ──────────────────────────────────────────────────────────

interface AnimEntry {
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  startTime: number;
  duration: number;
}

// ── Easing ─────────────────────────────────────────────────────────

/** Cubic ease-out: fast start, gentle settle. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_DURATION_MS = 180;
const EPSILON = 0.5; // below this delta, skip animation

// ── Animator ───────────────────────────────────────────────────────

export class LayoutAnimator {
  private animations = new Map<FabricObject, AnimEntry>();
  private rafId: number | null = null;
  private canvas: DesignCanvas;

  constructor(canvas: DesignCanvas) {
    this.canvas = canvas;
  }

  /**
   * Animate an object from `from` to the position Yoga just wrote
   * (`obj.left`, `obj.top`).  The object is immediately set to `from`
   * so the visual transition starts there, while `toLeft/toTop` records
   * where Yoga wants it.
   */
  animate(
    obj: FabricObject,
    fromLeft: number,
    fromTop: number,
    duration = DEFAULT_DURATION_MS,
  ): void {
    const toLeft = obj.left!;
    const toTop = obj.top!;

    // Not worth animating tiny moves
    if (Math.abs(toLeft - fromLeft) < EPSILON && Math.abs(toTop - fromTop) < EPSILON) {
      return;
    }

    // If already animating this object, start from its current visual position
    const existing = this.animations.get(obj);
    if (existing) {
      const elapsed = performance.now() - existing.startTime;
      const t = Math.min(elapsed / existing.duration, 1);
      const e = easeOutCubic(t);
      fromLeft = existing.fromLeft + (existing.toLeft - existing.fromLeft) * e;
      fromTop = existing.fromTop + (existing.toTop - existing.fromTop) * e;

      // If new target is same as old, keep going
      if (Math.abs(toLeft - existing.toLeft) < EPSILON && Math.abs(toTop - existing.toTop) < EPSILON) {
        return;
      }
    }

    this.animations.set(obj, {
      fromLeft,
      fromTop,
      toLeft,
      toTop,
      startTime: performance.now(),
      duration,
    });

    // Set visual position to start of animation
    obj.set({ left: fromLeft, top: fromTop });

    this.ensureLoop();
  }

  /** Return the Yoga target for a mid-animation object, or null. */
  getTarget(obj: FabricObject): { left: number; top: number } | null {
    const entry = this.animations.get(obj);
    return entry ? { left: entry.toLeft, top: entry.toTop } : null;
  }

  /**
   * Write every animated object's target into obj.left/top so that
   * code reading positions sees stable values, not mid-interpolation.
   * The next tick() resumes visual interpolation normally.
   *
   * @param exclude — object to skip (e.g. the dragged child, whose
   *   position is set by Fabric's drag handler and should not be overwritten).
   */
  flushToTargets(exclude?: FabricObject): void {
    for (const [obj, entry] of this.animations) {
      if (obj !== exclude) {
        obj.set({ left: entry.toLeft, top: entry.toTop });
      }
    }
  }

  /** Cancel all running animations, leaving objects at their Yoga target. */
  cancelAll(): void {
    for (const [obj, entry] of this.animations) {
      obj.set({ left: entry.toLeft, top: entry.toTop });
      obj.setCoords();
    }
    this.animations.clear();
    this.stopLoop();
  }

  dispose(): void {
    this.animations.clear();
    this.stopLoop();
  }

  // ── RAF loop ─────────────────────────────────────────────────────

  private ensureLoop(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(_ts: number): void {
    this.rafId = null;
    const now = performance.now();
    const done: FabricObject[] = [];

    for (const [obj, entry] of this.animations) {
      const elapsed = now - entry.startTime;
      const t = Math.min(elapsed / entry.duration, 1);
      const e = easeOutCubic(t);

      const left = entry.fromLeft + (entry.toLeft - entry.fromLeft) * e;
      const top = entry.fromTop + (entry.toTop - entry.fromTop) * e;
      obj.set({ left, top });

      if (t >= 1) {
        done.push(obj);
      }
    }

    for (const obj of done) {
      this.animations.delete(obj);
      obj.setCoords();
    }

    this.canvas.requestRenderAll();

    if (this.animations.size > 0) {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }
}
