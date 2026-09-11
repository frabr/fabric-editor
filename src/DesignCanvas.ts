/**
 * DesignCanvas — wraps a Fabric Canvas to separate design size from display size.
 *
 * `width` and `height` always return the logical design dimensions.
 * The underlying Fabric Canvas buffer may be a different size (after fitToSize).
 *
 * Access the raw Fabric Canvas via `originalFabricCanvas` — the verbose name
 * is intentional: prefer using delegation methods when possible.
 */
import { Canvas, type FabricObject, type TPointerEvent } from "#fabric";

export class DesignCanvas {
  readonly width: number;
  readonly height: number;
  readonly originalFabricCanvas: Canvas;

  private _scale = 1;

  constructor(
    canvasElement: HTMLCanvasElement,
    opts: {
      width: number;
      height: number;
    } & Record<string, any>,
  ) {
    const { width, height, ...canvasOpts } = opts;
    this.width = width;
    this.height = height;
    this.originalFabricCanvas = new Canvas(canvasElement, {
      width,
      height,
      ...canvasOpts,
    });
  }

  /** Current viewport scale factor (set by fitToSize). */
  get scale(): number {
    return this._scale;
  }

  /**
   * Resize the canvas buffer to fit a container and scale content
   * via Fabric's viewportTransform. Returns the computed scale.
   */
  fitToSize(containerW: number, containerH: number, userZoom = 1): number {
    const fitScale = Math.min(containerW / this.width, containerH / this.height);
    const scale = fitScale * userZoom;

    const bufferW = Math.round(this.width * scale);
    const bufferH = Math.round(this.height * scale);
    this.originalFabricCanvas.setDimensions({ width: bufferW, height: bufferH });
    this.originalFabricCanvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);

    this._scale = scale;
    return scale;
  }

  /**
   * Shift the active drag's grab offset by (dx, dy).
   *
   * During a drag, Fabric places the object at `cursor + offset`.
   * Adjusting the offset "teleports" the object without breaking
   * the drag delta calculation.
   */
  adjustGrabOffset(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const transform = (this.originalFabricCanvas as any)._currentTransform;
    if (!transform) return;
    transform.offsetX -= dx;
    transform.offsetY -= dy;
  }

  // ── Delegation methods ──────────────────────────────────────────────

  getObjects(): FabricObject[] {
    return this.originalFabricCanvas.getObjects();
  }

  add(...objects: FabricObject[]): void {
    this.originalFabricCanvas.add(...objects);
  }

  remove(...objects: FabricObject[]): void {
    this.originalFabricCanvas.remove(...objects);
  }

  renderAll(): void {
    this.originalFabricCanvas.renderAll();
  }

  requestRenderAll(): void {
    this.originalFabricCanvas.requestRenderAll();
  }

  on(eventName: string, handler: (...args: any[]) => void): void {
    this.originalFabricCanvas.on(eventName as any, handler);
  }

  off(eventName: string, handler?: (...args: any[]) => void): void {
    this.originalFabricCanvas.off(eventName as any, handler as any);
  }

  getActiveObject(): FabricObject | null {
    return this.originalFabricCanvas.getActiveObject() ?? null;
  }

  setActiveObject(obj: FabricObject): void {
    this.originalFabricCanvas.setActiveObject(obj);
  }

  discardActiveObject(): void {
    this.originalFabricCanvas.discardActiveObject();
  }

  getScenePoint(e: TPointerEvent): { x: number; y: number } {
    return this.originalFabricCanvas.getScenePoint(e);
  }

  setDimensions(dims: { width: number; height: number }): void {
    this.originalFabricCanvas.setDimensions(dims);
  }

  bringObjectForward(obj: FabricObject, intersecting?: boolean): void {
    this.originalFabricCanvas.bringObjectForward(obj, intersecting);
  }

  sendObjectBackwards(obj: FabricObject): void {
    this.originalFabricCanvas.sendObjectBackwards(obj);
  }

  moveObjectTo(obj: FabricObject, index: number): void {
    this.originalFabricCanvas.moveObjectTo(obj, index);
  }

  getZoom(): number {
    return this.originalFabricCanvas.getZoom();
  }

  setZoom(zoom: number): void {
    this.originalFabricCanvas.setZoom(zoom);
  }

  toDataURL(opts?: any): string {
    return this.originalFabricCanvas.toDataURL(opts);
  }

  clear(): void {
    this.originalFabricCanvas.clear();
  }

  dispose(): void {
    this.originalFabricCanvas.dispose();
  }

  set backgroundColor(color: string) {
    this.originalFabricCanvas.backgroundColor = color;
  }

  get backgroundColor(): string {
    return this.originalFabricCanvas.backgroundColor as string;
  }

  set renderOnAddRemove(value: boolean) {
    this.originalFabricCanvas.renderOnAddRemove = value;
  }

  get renderOnAddRemove(): boolean {
    return this.originalFabricCanvas.renderOnAddRemove;
  }
}
