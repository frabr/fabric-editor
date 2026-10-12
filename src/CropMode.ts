import { Point, util, type Canvas, type TPointerEvent } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { ImageFrame } from "./ImageFrame";
import { type Crop, type Rect } from "./crop";

/**
 * Le mode recadrage, sur le canvas (retour designer, « V1 photo entière ») : l'image
 * entière apparaît, voilée hors de son cadre, sur un voile sombre. On la glisse pour choisir
 * ce qui se voit ; ses quatre coins la grossissent, le coin opposé reste en place. Le fond
 * d'une page se recadre de la même façon : le cadre est alors la page.
 *
 * Un état de l'éditeur, pas une sélection : à l'entrée, la sélection tombe et le canvas ne
 * cible plus rien (skipTargetFind) ; tout se dessine sur le calque du dessus (contextTop),
 * dans le repère du cadre — rotation et zoom de la vue suivent. ↵ ou un clic à côté
 * valident, Échap rend le recadrage d'avant ; un cadre qui se sélectionne est resélectionné
 * à la sortie. Rien n'entre dans l'historique pendant le geste : l'hôte enregistre à
 * `crop:end` (`changed`), un seul ⌘Z pour tout le recadrage.
 *
 * Événements du canvas : `crop:start`, `crop:change`, `crop:end` ({ target, changed }).
 */

type Hit = { kind: "corner"; cx: 0 | 1; cy: 0 | 1 } | { kind: "photo" } | { kind: "outside" };

interface Drag {
  from: Crop;
  start: { x: number; y: number };
  rect: Rect;
  hit: Hit;
}

/** Rayon des poignées et marge de prise, en pixels d'écran. */
const HANDLE_RADIUS = 6;
const HANDLE_GRAB = 12;
// Trois niveaux : le reste de la page s'efface presque sous le gris du plan de travail (clair,
// pas sombre — comme autour de la page ; pas tout à fait opaque, on devine ce qui est là),
// l'image hors du cadre y est fondue à moitié, le cadre est net. Plus marqué que chez le
// designer (voile sombre 0.28, image à 45 %) : les deux premiers se confondaient.
const FALLBACK_VEIL = "#f3f4f6";
const VEIL_ALPHA = 0.85;
const PHOTO_VEIL_ALPHA = 0.55;

interface FabricCanvasInternals extends Canvas {
  contextTop: CanvasRenderingContext2D;
  contextTopDirty: boolean;
}

export class CropMode {
  private frame: ImageFrame | null = null;
  private before: Crop | null = null;
  private drag: Drag | null = null;
  private saved: { selection: boolean; skipTargetFind: boolean; defaultCursor: string } | null = null;

  constructor(private readonly canvas: DesignCanvas, private readonly guideColor: string) {
    canvas.on("mouse:down", (e) => this.onDown(e));
    canvas.on("mouse:move", (e) => this.onMove(e));
    canvas.on("mouse:up", () => this.onUp());
    canvas.on("after:render", () => this.paint());
    canvas.on("object:removed", (e: { target?: unknown }) => {
      if (e.target === this.frame) this.end(false);
    });
    if (typeof document !== "undefined") document.addEventListener("keydown", this.onKeyDown, true);
  }

  get active(): boolean {
    return this.frame !== null;
  }

  get target(): ImageFrame | null {
    return this.frame;
  }

  /** Entre en recadrage sur `frame` ; un recadrage en cours se valide d'abord. */
  start(frame: ImageFrame): void {
    if (!frame.croppable) return;
    if (this.frame === frame) return;
    if (this.frame) this.commit();

    const fc = this.fc;
    this.canvas.discardActiveObject();
    this.saved = { selection: fc.selection, skipTargetFind: fc.skipTargetFind, defaultCursor: fc.defaultCursor };
    fc.selection = false;
    fc.skipTargetFind = true;
    fc.defaultCursor = "default";

    this.frame = frame;
    this.before = frame.crop;
    this.fire("crop:start", { target: frame });
    this.canvas.requestRenderAll();
  }

  /** Valide : le recadrage courant reste. */
  commit(): void {
    if (!this.frame || !this.before) return;
    const changed = JSON.stringify(this.frame.crop) !== JSON.stringify(this.before);
    this.end(changed);
  }

  /** Annule : le recadrage d'avant revient. */
  cancel(): void {
    if (!this.frame || !this.before) return;
    this.frame.setCrop(this.before);
    this.end(false);
  }

  /** Recentre, échelle ×1 — sans sortir du mode. */
  reset(): void {
    if (!this.frame) return;
    this.frame.resetCrop();
    this.changed();
  }

  dispose(): void {
    if (typeof document !== "undefined") document.removeEventListener("keydown", this.onKeyDown, true);
  }

  // ─────────────────────────────────────────────────────────────

  private get fc(): FabricCanvasInternals {
    return this.canvas.originalFabricCanvas as unknown as FabricCanvasInternals;
  }

  private fire(name: string, detail: object): void {
    (this.fc as unknown as { fire(name: string, detail: object): void }).fire(name, detail);
  }

  private end(changed: boolean): void {
    const frame = this.frame;
    if (!frame) return;
    const fc = this.fc;
    if (this.saved) Object.assign(fc, this.saved);
    this.frame = null;
    this.before = null;
    this.drag = null;
    this.saved = null;

    if (frame.selectable && frame.canvas === fc) fc.setActiveObject(frame);
    this.fire("crop:end", { target: frame, changed });
    this.canvas.requestRenderAll();
  }

  private changed(): void {
    if (!this.frame) return;
    this.fire("crop:change", { target: this.frame });
    this.canvas.requestRenderAll();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.frame) return;
    if (e.key === "Enter") this.commit();
    else if (e.key === "Escape") this.cancel();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // ─────────────────────────────────────────────────────────────
  // Gestes : tout en coordonnées du cadre (origine en haut à gauche)
  // ─────────────────────────────────────────────────────────────

  /** Le point de la scène dans le repère du cadre. */
  private toFrame(scene: Point): { x: number; y: number } {
    const frame = this.frame!;
    const local = scene.transform(util.invertTransform(frame.calcTransformMatrix()));
    return { x: local.x + frame.frameWidth / 2, y: local.y + frame.frameHeight / 2 };
  }

  /** Le point du cadre à l'écran (pixels CSS du canvas). */
  private toScreen(x: number, y: number): Point {
    const frame = this.frame!;
    return new Point(x - frame.frameWidth / 2, y - frame.frameHeight / 2)
      .transform(frame.calcTransformMatrix())
      .transform(this.fc.viewportTransform);
  }

  /** Une unité d'écran en unités de cadre. */
  private frameUnit(): number {
    const frame = this.frame!;
    const scale = Math.max(Math.abs(frame.scaleX || 1), Math.abs(frame.scaleY || 1)) * this.fc.getZoom();
    return 1 / scale;
  }

  private hitAt(p: { x: number; y: number }): Hit {
    const rect = this.frame!.photoRect();
    const grab = HANDLE_GRAB * this.frameUnit();
    for (const cx of [0, 1] as const) {
      for (const cy of [0, 1] as const) {
        const hx = rect.x + cx * rect.w;
        const hy = rect.y + cy * rect.h;
        if (Math.hypot(p.x - hx, p.y - hy) <= grab) return { kind: "corner", cx, cy };
      }
    }
    const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    return inside ? { kind: "photo" } : { kind: "outside" };
  }

  private onDown(e: { e: TPointerEvent; scenePoint?: Point }): void {
    if (!this.frame) return;
    if ((e.e as MouseEvent).button) return;
    const scene = e.scenePoint ?? this.fc.getScenePoint(e.e);
    const p = this.toFrame(scene);
    const hit = this.hitAt(p);
    if (hit.kind === "outside") {
      this.commit();
      return;
    }
    this.drag = { from: this.frame.crop, start: p, rect: this.frame.photoRect(), hit };
  }

  private onMove(e: { e: TPointerEvent; scenePoint?: Point }): void {
    if (!this.frame) return;
    const scene = e.scenePoint ?? this.fc.getScenePoint(e.e);
    const p = this.toFrame(scene);

    if (!this.drag) {
      this.fc.setCursor(this.cursorFor(this.hitAt(p)));
      return;
    }

    const { from, start, rect, hit } = this.drag;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (hit.kind === "photo") {
      this.frame.panCrop(dx, dy, from);
    } else if (hit.kind === "corner") {
      // Le coin tiré suit le pointeur, le coin opposé reste en place
      const ax = rect.x + (1 - hit.cx) * rect.w;
      const ay = rect.y + (1 - hit.cy) * rect.h;
      const px = rect.x + hit.cx * rect.w + dx;
      const py = rect.y + hit.cy * rect.h + dy;
      const k = Math.max(Math.abs(px - ax) / rect.w, Math.abs(py - ay) / rect.h);
      this.frame.zoomCrop(from.scale * k, ax, ay, from);
    }
    this.fc.setCursor(this.cursorFor(hit));
    this.changed();
  }

  private onUp(): void {
    this.drag = null;
  }

  private cursorFor(hit: Hit): string {
    switch (hit.kind) {
      case "corner": return hit.cx === hit.cy ? "nwse-resize" : "nesw-resize";
      case "photo": return "move";
      default: return "default";
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rendu, sur le calque du dessus
  // ─────────────────────────────────────────────────────────────

  private paint(): void {
    const frame = this.frame;
    if (!frame) return;
    const fc = this.fc;
    const ctx = fc.contextTop;
    if (!ctx) return;

    const retina = fc.getRetinaScaling();
    const rect = frame.photoRect();
    const W = frame.frameWidth;
    const H = frame.frameHeight;
    const element = frame.image.getElement() as CanvasImageSource | undefined;

    const veil = this.canvas.workspaceColor ?? FALLBACK_VEIL;
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.globalAlpha = VEIL_ALPHA;
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, fc.width, fc.height);
    ctx.globalAlpha = 1;

    // L'image entière, opaque puis légèrement voilée, dans le repère du cadre
    ctx.transform(...fc.viewportTransform);
    if (element) {
      ctx.save();
      frame.transform(ctx);
      ctx.drawImage(element, rect.x - W / 2, rect.y - H / 2, rect.w, rect.h);
      ctx.globalAlpha = PHOTO_VEIL_ALPHA;
      ctx.fillStyle = veil;
      ctx.fillRect(rect.x - W / 2, rect.y - H / 2, rect.w, rect.h);
      ctx.restore();
    }

    // Le cadre : ce qui se verra, tel que le canvas le dessine (découpe comprise)
    frame.render(ctx);
    this.paintOutline(ctx);
    ctx.restore();

    // Les coins de l'image entière, à l'écran
    ctx.save();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = this.guideColor;
    ctx.lineWidth = 1.5;
    for (const cx of [0, 1]) {
      for (const cy of [0, 1]) {
        const p = this.toScreen(rect.x + cx * rect.w, rect.y + cy * rect.h);
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    fc.contextTopDirty = true;
  }

  /** Le liseré du cadre : la forme de découpe, tracée par-dessus (comme son contour). */
  private paintOutline(ctx: CanvasRenderingContext2D): void {
    const frame = this.frame!;
    const outline = frame.clipPath;
    if (!outline) return;
    const saved = { fill: outline.fill, stroke: outline.stroke, strokeWidth: outline.strokeWidth };
    ctx.save();
    frame.transform(ctx);
    outline.set({ fill: "transparent", stroke: this.guideColor, strokeWidth: 1.5 * this.frameUnit() });
    outline.render(ctx);
    outline.set(saved);
    ctx.restore();
  }
}
