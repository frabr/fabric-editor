/**
 * Extensions to Fabric.js classes.
 *
 * Adds methods to Canvas/FabricObject prototypes via module augmentation.
 * Import this module once at startup (side-effect import).
 */
import { Canvas } from "#fabric";

// ── Module augmentation ─────────────────────────────────────────────

declare module "fabric" {
  interface Canvas {
    /**
     * Shift the active drag's grab offset by (dx, dy).
     *
     * During a drag, Fabric places the object at `cursor + offset`.
     * Adjusting the offset "teleports" the object without breaking
     * the drag delta calculation.
     *
     * No-op if there is no active drag transform.
     */
    adjustGrabOffset(dx: number, dy: number): void;
  }
}

// ── Implementation ──────────────────────────────────────────────────

Canvas.prototype.adjustGrabOffset = function (dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const transform = (this as any)._currentTransform;
  if (!transform) return;
  transform.offsetX -= dx;
  transform.offsetY -= dy;
};
