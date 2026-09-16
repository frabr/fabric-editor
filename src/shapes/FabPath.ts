import { Path, classRegistry, controlsUtils, type TOptions, type PathProps } from "#fabric";
import { installLockMethods, type Lockable } from "./lockMixin";
import { isTransformCentered } from "./resizeUtils";
import { SHAPE_PATHS } from "./generated/paths";
import type { LockMode } from "../locking";

const { changeObjectWidth, changeObjectHeight, getLocalPoint } = controlsUtils;

const DEFAULT_SIZE = 300;

export class FabPath extends Path implements Lockable {
  static type = "Path";
  static customProperties = ["layerId", "layerType", "lockMode", "lockContent"];

  declare lockMode: LockMode;
  declare lockContent: boolean;
  declare applyLockMode: (mode: LockMode) => void;
  declare getLockMode: () => LockMode;
  declare getNextLockMode: () => LockMode;
  declare isPositionLocked: () => boolean;
  declare isStyleLocked: () => boolean;
  declare isContentLocked: () => boolean;

  private _naturalW: number;
  private _naturalH: number;

  constructor(path: string | any[], options?: Partial<TOptions<PathProps>>) {
    super(path, {
      originX: "center",
      originY: "center",
      ...options,
    });

    this._naturalW = this.width;
    this._naturalH = this.height;
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
    this.scaleX *= this.width / this._naturalW;
    this.scaleY *= this.height / this._naturalH;
    this.width = this._naturalW;
    this.height = this._naturalH;

    this.setPositionByOrigin(anchor, originX, originY);
    return changed;
  }

  setSize(w: number, h: number): void {
    this.set({ scaleX: w / this._naturalW, scaleY: h / this._naturalH });
  }

  /**
   * Create a FabPath from the shape catalog (heart, hexagon, etc.).
   *
   * Dimension logic:
   * - Both width & height: scale to fill both
   * - Only width: scale height proportionally
   * - Only height: scale width proportionally
   * - Neither: longest axis = 300px
   */
  static createFromCatalog(
    shapeId: string,
    options?: Partial<TOptions<PathProps>>,
  ): FabPath {
    const shapePath = SHAPE_PATHS.find((s) => s.id === shapeId);
    if (!shapePath) {
      throw new Error(
        `Unknown path shape: "${shapeId}". Available: ${SHAPE_PATHS.map((s) => s.id).join(", ")}`,
      );
    }

    const path = new FabPath(shapePath.d, {
      id: shapeId,
      ...options,
    });

    const naturalW = path._naturalW;
    const naturalH = path._naturalH;

    const hasW = options?.width != null;
    const hasH = options?.height != null;
    const ratio = naturalW / naturalH;

    let targetW: number;
    let targetH: number;

    if (hasW && hasH) {
      targetW = options!.width!;
      targetH = options!.height!;
    } else if (hasW) {
      targetW = options!.width!;
      targetH = targetW / ratio;
    } else if (hasH) {
      targetH = options!.height!;
      targetW = targetH * ratio;
    } else {
      const scale = DEFAULT_SIZE / Math.max(naturalW, naturalH);
      targetW = naturalW * scale;
      targetH = naturalH * scale;
    }

    path.scaleX = targetW / naturalW;
    path.scaleY = targetH / naturalH;

    return path;
  }
}

installLockMethods(FabPath.prototype);
classRegistry.setClass(FabPath, "Path");
