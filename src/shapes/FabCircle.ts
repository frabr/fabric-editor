import { Circle, classRegistry, controlsUtils, type TOptions, type CircleProps } from "#fabric";
import { installLockMethods, type Lockable } from "./lockMixin";
import { isTransformCentered } from "./resizeUtils";
import type { LockMode } from "../locking";

const { changeObjectWidth, changeObjectHeight, getLocalPoint } = controlsUtils;

export class FabCircle extends Circle implements Lockable {
  static type = "Circle";
  static customProperties = ["layerId", "layerType", "lockMode", "lockContent"];

  declare lockMode: LockMode;
  declare lockContent: boolean;
  declare applyLockMode: (mode: LockMode) => void;
  declare getLockMode: () => LockMode;
  declare getNextLockMode: () => LockMode;
  declare isPositionLocked: () => boolean;
  declare isStyleLocked: () => boolean;
  declare isContentLocked: () => boolean;

  /** Natural diameter — stays fixed, scale absorbs sizing. */
  private _naturalSize: number;

  constructor(options?: Partial<TOptions<CircleProps>>) {
    super({
      originX: "center",
      originY: "center",
      ...options,
    });
    this.set("id", "circle");

    // Normalize: ensure width === height, store natural size
    const size = Math.min(this.width, this.height);
    this.radius = size / 2;
    this.width = size;
    this.height = size;
    this._naturalSize = size;

  }

  /** Corner resize: uniform scaling (aspect ratio locked). */
  handleCornerResize(transform: any, x: number, y: number): boolean {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);
    const localPoint = getLocalPoint(transform, originX, originY, x, y);
    const dim = this._getTransformedDimensions();

    const distance = Math.abs(localPoint.x) + Math.abs(localPoint.y);
    const originalDistance =
      Math.abs((dim.x * transform.original.scaleX) / this.scaleX) +
      Math.abs((dim.y * transform.original.scaleY) / this.scaleY);

    if (originalDistance === 0) return false;

    let scale = distance / originalDistance;
    if (isTransformCentered(transform)) scale *= 2;

    const oldScaleX = this.scaleX;
    const oldScaleY = this.scaleY;
    this.set("scaleX", transform.original.scaleX * scale);
    this.set("scaleY", transform.original.scaleY * scale);
    this.setPositionByOrigin(anchor, originX, originY);

    return oldScaleX !== this.scaleX || oldScaleY !== this.scaleY;
  }

  /** Edge resize: single-axis stretch, absorbed into scale. */
  handleEdgeResize(transform: any, x: number, y: number): boolean {
    const { originX, originY } = transform;
    const anchor = this.getPositionByOrigin(originX, originY);

    const corner: string = transform.corner;
    const changed = corner === "ml" || corner === "mr"
      ? changeObjectWidth({} as any, transform, x, y)
      : changeObjectHeight({} as any, transform, x, y);

    // Absorb dimension change into scale
    this.scaleX *= this.width / this._naturalSize;
    this.scaleY *= this.height / this._naturalSize;
    this.width = this._naturalSize;
    this.height = this._naturalSize;
    this.radius = this._naturalSize / 2;

    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }

  setSize(w: number, h: number): void {
    this.set({
      scaleX: w / this._naturalSize,
      scaleY: h / this._naturalSize,
    });
  }
}

installLockMethods(FabCircle.prototype);
classRegistry.setClass(FabCircle, "Circle");
