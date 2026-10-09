import { Path, classRegistry, controlsUtils, type TOptions, type PathProps } from "#fabric";
import { installLockMethods, type Lockable } from "./lockMixin";
import { installUserSlotRendering } from "../userSlots";
import { isTransformCentered } from "./resizeUtils";
import { getCatalogShape, type ShapePathData } from "./registry";
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
   * Create a FabPath from raw path data (normalized `d` + optional authored fill).
   * The authored fill wins over options.fill: callers pass their GENERIC default
   * there (LayerManager's DEFAULT_SHAPE_FILL) — a colorless path takes it, an authored one
   * keeps its charte color. Recoloring happens on the object afterwards, never here.
   *
   * Dimension logic:
   * - Both width & height: scale to fill both
   * - Only width: scale height proportionally
   * - Only height: scale width proportionally
   * - Neither: longest axis = 300px
   */
  static fromPathData(
    pathData: ShapePathData,
    options?: Partial<TOptions<PathProps>>,
  ): FabPath {
    // Contour d'auteur : fill transparent (jamais le défaut générique), le stroke
    // du path prime sur celui de l'appelant.
    const fill = pathData.fill ?? (pathData.stroke ? "" : options?.fill);
    const stroke = pathData.stroke ?? options?.stroke;
    const strokeWidth = pathData.strokeWidth ?? options?.strokeWidth;
    const path = new FabPath(pathData.d, {
      ...options,
      ...(fill != null ? { fill } : {}),
      ...(stroke != null ? { stroke } : {}),
      ...(strokeWidth != null ? { strokeWidth } : {}),
    });

    path.fitTo(options?.width, options?.height);
    return path;
  }

  /** Scale to the requested box (see fromPathData) — natural dims stay untouched. */
  fitTo(width?: number, height?: number): void {
    const ratio = this._naturalW / this._naturalH;

    let targetW: number;
    let targetH: number;

    if (width != null && height != null) {
      targetW = width;
      targetH = height;
    } else if (width != null) {
      targetW = width;
      targetH = targetW / ratio;
    } else if (height != null) {
      targetH = height;
      targetW = targetH * ratio;
    } else {
      const scale = DEFAULT_SIZE / Math.max(this._naturalW, this._naturalH);
      targetW = this._naturalW * scale;
      targetH = this._naturalH * scale;
    }

    this.scaleX = targetW / this._naturalW;
    this.scaleY = targetH / this._naturalH;
  }

  /**
   * Create a FabPath from the injected shape registry (mono-path entries only —
   * multi-path artwork goes through createPathsShape, and is never a clip).
   */
  static createFromCatalog(
    shapeId: string,
    options?: Partial<TOptions<PathProps>>,
  ): FabPath {
    const shape = getCatalogShape(shapeId);
    if (!shape) {
      throw new Error(
        `Unknown path shape: "${shapeId}". Did the host app call registerShapes()?`,
      );
    }
    if (shape.paths.length !== 1) {
      throw new Error(`Shape "${shapeId}" is multi-path artwork — not usable as a single path.`);
    }

    return FabPath.fromPathData(shape.paths[0], { id: shapeId, ...options });
  }
}

installLockMethods(FabPath.prototype);
installUserSlotRendering(FabPath.prototype);
classRegistry.setClass(FabPath, "Path");
