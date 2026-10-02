/**
 * DesignCanvas — wraps a Fabric Canvas to separate design size from display size.
 *
 * `width` and `height` always return the logical design dimensions.
 * The underlying Fabric Canvas buffer may be a different size (after fitToSize).
 *
 * Access the raw Fabric Canvas via `originalFabricCanvas` — the verbose name
 * is intentional: prefer using delegation methods when possible.
 */
import { Canvas, Point, type FabricObject, type TPointerEvent } from "#fabric";

/**
 * Plan de travail : le canvas remplit son panneau, le cadre du document — (0,0)–(w,h)
 * en coordonnées du document — y est centré par la vue. Hors cadre, les objets restent
 * visibles et manipulables sous un voile ; le cadre se lit par un liseré.
 *
 * Le repère ne change pas (origine = coin haut-gauche du cadre) : seule la vue change,
 * rien n'est sauvegardé. Plan : apibots docs/plans/workspace-viewport.md.
 */
export interface WorkspaceOptions {
  /** Espace minimal entre le cadre et le bord du panneau, à zoom 1 (px écran). */
  margin?: number;
  /** Fond du plan de travail, hors cadre (le fond du damier). */
  color?: string;
  /** Opacité du voile sur ce qui dépasse du cadre (1 : le hors-cadre est masqué). */
  veilOpacity?: number;
  /**
   * Plan de travail en damier (défaut) ou uni (`color`). Le damier est celui du cadre
   * transparent côté hôte : à la même taille et aux mêmes couleurs, une zone vide hors
   * cadre ne se distingue pas de l'intérieur — seuls les objets qui débordent sont voilés.
   */
  veil?: "checker" | "solid";
  /** Cases foncées du damier, posées sur `color` (une sur deux : haut-droite, bas-gauche). */
  checkerColor?: string;
  /** Côté d'une case du damier (px écran). */
  checkerSize?: number;
  /** Couleur du liseré du cadre (celle des guides de l'éditeur). */
  frameColor?: string;
}

/** Le cadre du document à l'écran, en px CSS relatifs à l'élément canvas. */
export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class DesignCanvas {
  readonly originalFabricCanvas: Canvas;

  private _width: number;
  private _height: number;
  private _scale = 1;
  private _frame: FrameRect = { left: 0, top: 0, width: 0, height: 0 };
  private _workspace: Required<WorkspaceOptions> | null = null;
  private _pan = { x: 0, y: 0 };
  private _lastFit = { containerW: 0, containerH: 0, userZoom: 1 };

  /** Dimensions logiques de l'espace design (mutables : le format se décide, cf. resizeDesign). */
  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  /**
   * Redimensionne l'espace design : le contenu reste en place, seul le cadre change —
   * l'appelant refait un fitToSize pour recalculer l'affichage.
   */
  resizeDesign(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  constructor(
    canvasElement: HTMLCanvasElement,
    opts: {
      width: number;
      height: number;
    } & Record<string, any>,
  ) {
    const { width, height, ...canvasOpts } = opts;
    this._width = width;
    this._height = height;
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

  /** Le cadre du document à l'écran (px CSS, relatifs à l'élément canvas). */
  get frameRect(): FrameRect {
    return { ...this._frame };
  }

  get isWorkspace(): boolean {
    return this._workspace !== null;
  }

  /**
   * Passe en plan de travail : le rendu peint le fond du plan de travail sous les objets,
   * puis le voile et le liseré par-dessus. L'intérieur du cadre reste transparent (sauf
   * couleur de fond du document) : ce qui est posé SOUS le canvas (iframe vidéo, fonds
   * HTML, damier) s'y voit. Les exports (autre contexte de dessin) n'ont ni fond de plan
   * de travail ni voile.
   */
  enableWorkspace(options: WorkspaceOptions = {}): void {
    this._workspace = {
      margin: 32,
      veilOpacity: 0.7,
      // Le damier de l'app (tailwind `bg-transparency-grid bg-checker`) : 3 % de noir sur
      // une case de 8px sur deux, sur fond blanc
      color: "#ffffff",
      veil: "checker",
      checkerColor: "rgba(0, 0, 0, 0.03)",
      checkerSize: 8,
      frameColor: "#d946ef",
      ...options,
    };
    const fc = this.originalFabricCanvas as unknown as {
      getContext(): CanvasRenderingContext2D;
      getRetinaScaling(): number;
      _renderBackground(ctx: CanvasRenderingContext2D): void;
      _renderObjects(ctx: CanvasRenderingContext2D, objects: FabricObject[]): void;
    };
    const renderBackground = fc._renderBackground.bind(fc);
    const renderObjects = fc._renderObjects.bind(fc);
    const onScreen = (ctx: CanvasRenderingContext2D) => this._workspace !== null && ctx === fc.getContext();

    fc._renderBackground = (ctx) => {
      if (onScreen(ctx)) this._paintWorkspace(ctx);
      else renderBackground(ctx);
    };
    // Le voile passe ENTRE les objets du document et ceux de l'éditeur (guides, marges,
    // surbrillances : excludeFromExport) — ces derniers, comme les poignées de la
    // sélection (dessinées après les objets), restent au-dessus.
    fc._renderObjects = (ctx, objects) => {
      if (!onScreen(ctx)) {
        renderObjects(ctx, objects);
        return;
      }
      const isEditorObject = (obj: FabricObject) => (obj as { excludeFromExport?: boolean }).excludeFromExport === true;
      renderObjects(ctx, objects.filter((obj) => !isEditorObject(obj)));
      ctx.save();
      const retina = fc.getRetinaScaling();
      ctx.setTransform(retina, 0, 0, retina, 0, 0);
      this._paintVeil(ctx);
      ctx.restore();
      renderObjects(ctx, objects.filter(isEditorObject));
    };
  }

  /**
   * Plan de travail : le canvas prend toute la taille du panneau, le cadre y est centré
   * (marge à zoom 1), décalé du déplacement en cours. Returns the computed scale.
   */
  fitWorkspace(containerW: number, containerH: number, userZoom = 1): number {
    const margin = this._workspace?.margin ?? 0;
    const fitScale = Math.max(0.01, Math.min(
      (containerW - 2 * margin) / this.width,
      (containerH - 2 * margin) / this.height,
    ));
    const scale = fitScale * userZoom;
    const width = this.width * scale;
    const height = this.height * scale;
    const left = (containerW - width) / 2 + this._pan.x;
    const top = (containerH - height) / 2 + this._pan.y;

    this.originalFabricCanvas.setDimensions({ width: containerW, height: containerH });
    this.originalFabricCanvas.setViewportTransform([scale, 0, 0, scale, left, top]);

    this._lastFit = { containerW, containerH, userZoom };
    this._frame = { left, top, width, height };
    this._scale = scale;
    return scale;
  }

  /** Déplace la vue (px écran). */
  panBy(dx: number, dy: number): void {
    this._pan = { x: this._pan.x + dx, y: this._pan.y + dy };
    const { containerW, containerH, userZoom } = this._lastFit;
    this.fitWorkspace(containerW, containerH, userZoom);
  }

  resetPan(): void {
    this._pan = { x: 0, y: 0 };
  }

  /**
   * Le cadre seul, à la résolution du document (multiplier 1 = taille du document),
   * quelle que soit la vue — sans plan de travail ni voile.
   */
  toFrameDataURL(opts: { format?: "png" | "jpeg"; quality?: number; multiplier?: number } = {}): string {
    const f = this._frame;
    return this.originalFabricCanvas.toDataURL({
      format: opts.format ?? "png",
      quality: opts.quality ?? 1,
      multiplier: (opts.multiplier ?? 1) / this._scale,
      left: f.left,
      top: f.top,
      width: f.width,
      height: f.height,
    });
  }

  /** Centre un objet dans le cadre du document (pas dans le canvas). */
  centerObject(obj: FabricObject): void {
    obj.setPositionByOrigin(new Point(this.width / 2, this.height / 2), "center", "center");
    obj.setCoords();
  }

  /** Fond du plan de travail hors cadre ; couleur de fond du document dans le cadre. */
  private _paintWorkspace(ctx: CanvasRenderingContext2D): void {
    const ws = this._workspace!;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.save();
    this._fillOutsideFrame(ctx);
    const background = fc.backgroundColor;
    if (typeof background === "string" && background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(f.left, f.top, f.width, f.height);
    }
    ctx.restore();
  }

  private _checker: { key: string; pattern: CanvasPattern | null } | null = null;

  /** Le damier du voile, en px écran (indépendant du zoom) — construit une fois par couleurs. */
  private _checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    const ws = this._workspace!;
    const key = `${ws.color}|${ws.checkerColor}|${ws.checkerSize}`;
    if (this._checker?.key === key) return this._checker.pattern;

    const cell = ws.checkerSize;
    const tile = this.originalFabricCanvas.getElement().ownerDocument.createElement("canvas");
    tile.width = cell * 2;
    tile.height = cell * 2;
    const tctx = tile.getContext("2d")!;
    tctx.fillStyle = ws.color;
    tctx.fillRect(0, 0, cell * 2, cell * 2);
    tctx.fillStyle = ws.checkerColor;
    tctx.fillRect(cell, 0, cell, cell);
    tctx.fillRect(0, cell, cell, cell);
    this._checker = { key, pattern: ctx.createPattern(tile, "repeat") };
    return this._checker.pattern;
  }

  /**
   * Peint tout le canvas sauf le cadre — en damier calé sur le coin du cadre (le
   * quadrillage continue celui du cadre de part et d'autre du liseré), ou uni.
   */
  private _fillOutsideFrame(ctx: CanvasRenderingContext2D): void {
    const ws = this._workspace!;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.translate(f.left, f.top);
    ctx.beginPath();
    ctx.rect(-f.left, -f.top, fc.width, fc.height);
    ctx.rect(0, 0, f.width, f.height);
    ctx.fillStyle = (ws.veil === "checker" && this._checkerPattern(ctx)) || ws.color;
    ctx.fill("evenodd");
    ctx.translate(-f.left, -f.top);
  }

  /** Voile sur ce qui dépasse du cadre, puis le liseré (1px écran, quel que soit le zoom). */
  private _paintVeil(ctx: CanvasRenderingContext2D): void {
    const ws = this._workspace!;
    const f = this._frame;
    const fc = this.originalFabricCanvas;
    ctx.save();
    ctx.globalAlpha = ws.veilOpacity;
    this._fillOutsideFrame(ctx);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ws.frameColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(f.left) - 0.5, Math.round(f.top) - 0.5, Math.round(f.width) + 1, Math.round(f.height) + 1);
    ctx.restore();
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

    this._frame = { left: 0, top: 0, width: bufferW, height: bufferH };
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

  insertAt(index: number, ...objects: FabricObject[]): void {
    this.originalFabricCanvas.insertAt(index, ...objects);
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
