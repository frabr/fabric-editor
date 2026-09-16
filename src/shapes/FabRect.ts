import { Rect, classRegistry, controlsUtils, type TOptions, type RectProps } from "#fabric";
import { installLockMethods, type Lockable } from "./lockMixin";
import type { LockMode } from "../locking";

const { changeObjectWidth, changeObjectHeight } = controlsUtils;

export class FabRect extends Rect implements Lockable {
  static type = "Rect";
  static customProperties = ["layerId", "layerType", "lockMode", "lockContent"];

  declare lockMode: LockMode;
  declare lockContent: boolean;
  declare applyLockMode: (mode: LockMode) => void;
  declare getLockMode: () => LockMode;
  declare getNextLockMode: () => LockMode;
  declare isPositionLocked: () => boolean;
  declare isStyleLocked: () => boolean;
  declare isContentLocked: () => boolean;

  constructor(options?: Partial<TOptions<RectProps>>) {
    super({
      originX: "center",
      originY: "center",
      ...options,
    });
    this.set("id", "rect");
  }

  setCornerRadius(radius: number): void {
    const maxRadius = Math.min(this.width, this.height) / 2;
    const r = Math.max(0, Math.min(radius, maxRadius));
    this.set({ rx: r, ry: r });
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }

  getCornerRadius(): number {
    return this.rx ?? 0;
  }

  /** Corner resize: free resize on both axes (no ratio lock). */
  handleCornerResize(transform: any, x: number, y: number): boolean {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);

    const changedW = changeObjectWidth({} as any, transform, x, y);
    const changedH = changeObjectHeight({} as any, transform, x, y);

    this.setPositionByOrigin(anchor, originX, originY);
    return changedW || changedH;
  }

  /** Edge resize: single-axis width or height change. */
  handleEdgeResize(transform: any, x: number, y: number): boolean {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);

    const corner: string = transform.corner;
    const changed = corner === "ml" || corner === "mr"
      ? changeObjectWidth({} as any, transform, x, y)
      : changeObjectHeight({} as any, transform, x, y);

    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }

  setSize(w: number, h: number): void {
    this.set({ width: w, height: h });
  }
}

installLockMethods(FabRect.prototype);
classRegistry.setClass(FabRect, "Rect");
