/**
 * Le style de l'objet sélectionné : couleur, remplissage, contour, ombre, police, styles
 * du texte — et les bascules legacy de forme et de découpe.
 */
import { FabricObject, FabricImage, Gradient, Shadow } from "#fabric";
import { switchClip } from "../clipping";
import { switchShape, nextShape } from "../shapes";
import { ImageFrame } from "../ImageFrame";
import type { ShapeType } from "../types";
import { padGroupOnFirstFill } from "../layout/grouping";
import { isTextObject } from "../layout/text";
import type { FabricEditor } from "../FabricEditor";

export class StyleCommands {
  constructor(private readonly editor: FabricEditor) {}

  /**
   * @legacy Use ImageFrame.nextClipShape() directly.
   */
  switchClip(): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    if (obj instanceof ImageFrame) {
      // Pour ImageFrame, utiliser la méthode nextClipShape
      obj.nextClipShape();
      obj.dirty = true;
      this.editor.canvas.requestRenderAll();
    } else if (obj instanceof FabricImage) {
      // Legacy: images sans frame
      switchClip(obj);
      obj.dirty = true;
      this.editor.canvas.remove(obj);
      this.editor.layers.add(obj);
    }
  }

  /**
   * @legacy Shape switching is no longer supported.
   */
  switchShape(): void {
    const obj = this.editor.selection.current;
    if (!obj || obj instanceof FabricImage) return;

    const currentShapeId = (obj as FabricObject & { id?: string }).id as ShapeType | undefined;
    const nextShapeType = nextShape(currentShapeId);
    this.changeShape(nextShapeType);
  }

  /**
   * @legacy Shape switching is no longer supported.
   */
  changeShape(shapeType: ShapeType): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    if (obj instanceof ImageFrame) {
      obj.applyClipShape(shapeType);
      obj.dirty = true;
      this.editor.canvas.requestRenderAll();
    } else if (!(obj instanceof FabricImage)) {
      const newObj = switchShape(obj, shapeType);
      // Préserver le layerId et layerType
      const layerId = obj.get("layerId");
      const layerType = obj.get("layerType");
      if (layerId) newObj.set("layerId", layerId);
      if (layerType) newObj.set("layerType", layerType);

      // Le remove+add déclenche des événements de sélection parasites.
      // On mute les callbacks le temps du swap.
      this.editor.selection.silenceCallbacks();

      const objects = this.editor.canvas.getObjects();
      const zIndex = objects.indexOf(obj);
      this.editor.canvas.remove(obj);
      this.editor.canvas.add(newObj);
      if (zIndex >= 0 && zIndex < this.editor.canvas.getObjects().length) {
        this.editor.canvas.moveObjectTo(newObj, zIndex);
      }
      this.editor.canvas.setActiveObject(newObj);
      this.editor.canvas.requestRenderAll();

      this.editor.selection.restoreCallbacks();
    }
  }

  /**
   * Bascule entre remplissage et contour pour l'objet sélectionné
   */
  toggleOutline(): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    const { stroke, fill } = obj;
    obj.set({ fill: stroke, stroke: fill });
    obj.strokeWidth = obj.stroke ? 4 : 0;
    this.editor.canvas.renderAll();
  }

  /**
   * Change la couleur de l'objet sélectionné
   */
  changeColor(color: string): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    if (isTextObject(obj)) {
      obj.set("fill", color);
    } else {
      const property = obj.stroke ? "stroke" : "fill";
      obj.set(property, color);
    }

    this.editor.canvas.renderAll();
  }

  /**
   * Change l'opacité de l'objet sélectionné
   */
  changeOpacity(opacity: number): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    obj.set({ opacity: opacity / 100 });
    this.editor.canvas.renderAll();
  }

  // ==================== Stroke controls ====================

  /**
   * Enable or disable stroke on the selected object.
   * When enabling, restores previous stroke color or defaults to black.
   */
  setStrokeEnabled(enabled: boolean): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    if (enabled) {
      obj.set({ stroke: obj.stroke || "#000000", strokeWidth: obj.strokeWidth || 4 });
    } else {
      obj.set({ stroke: null, strokeWidth: 0 });
    }
    this.editor.canvas.renderAll();
  }

  /**
   * Set stroke width on the selected object.
   */
  setStrokeWidth(width: number): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set({ strokeWidth: width });
    if (width > 0 && !obj.stroke) {
      obj.set({ stroke: "#000000" });
    }
    this.editor.canvas.renderAll();
  }

  /**
   * Set stroke color on the selected object. Accepts any CSS color (hex, rgba).
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setStrokeColor(color: string): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set({ stroke: color, opacity: 1 });
    if (!obj.strokeWidth) {
      obj.set({ strokeWidth: 4 });
    }
    this.editor.canvas.renderAll();
  }

  // ==================== Fill controls ====================

  /**
   * Set fill color (solid) on the selected object.
   * Unlike changeColor(), always sets fill regardless of stroke state.
   * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
   */
  setFillColor(color: string): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    const previous = obj.fill;
    obj.set({ fill: color, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }

  /**
   * Set a linear gradient fill on the selected object.
   */
  setFillGradient(color1: string, color2: string, angleDeg: number): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const gradient = new Gradient({
      type: "linear",
      gradientUnits: "percentage",
      coords: {
        x1: 0.5 - cos / 2,
        y1: 0.5 - sin / 2,
        x2: 0.5 + cos / 2,
        y2: 0.5 + sin / 2,
      },
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 1, color: color2 },
      ],
    });
    const previous = obj.fill;
    obj.set({ fill: gradient, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }

  /**
   * Change la police de l'objet texte sélectionné
   */
  changeFont(fontFamily: string, fontWeight?: string): void {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj)) return;

    obj.set({ fontFamily, fontWeight: fontWeight || "normal" });
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }

  /**
   * Change la taille de police de l'objet texte sélectionné
   */
  setFontSize(size: number): void {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;

    obj.set({ fontSize: size });
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }

  /**
   * Justification de l'objet texte sélectionné, dans sa boîte.
   */
  setTextAlign(align: "left" | "center" | "right" | "justify"): void {
    const obj = this.editor.selection.current;
    if (!obj || !isTextObject(obj)) return;

    obj.set({ textAlign: align } as Partial<FabricObject>);
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }

  /**
   * Bascule un style sur l'objet texte sélectionné (gras, italique, souligné).
   * "bold" alterne fontWeight normal/bold (un poids numérique >= 600 compte
   * comme gras).
   */
  toggleTextStyle(style: "bold" | "italic" | "underline"): void {
    const obj = this.editor.selection.current as (typeof this.editor.selection.current) & {
      fontWeight?: string | number;
      fontStyle?: string;
      underline?: boolean;
    };
    if (!obj || !isTextObject(obj)) return;

    switch (style) {
      case "bold": {
        const isBold = obj.fontWeight === "bold" || Number(obj.fontWeight) >= 600;
        obj.set({ fontWeight: isBold ? "normal" : "bold" });
        break;
      }
      case "italic":
        obj.set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
        break;
      case "underline":
        obj.set({ underline: !obj.underline });
        break;
    }
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }

  // ── Shadow ────────────────────────────────────────────────────────

  setShadow(opts: { color?: string; blur?: number; offsetX?: number; offsetY?: number }): void {
    const obj = this.editor.selection.current;
    if (!obj) return;

    const existing = obj.shadow as Shadow | null;
    const shadow = new Shadow({
      color: opts.color ?? existing?.color ?? "rgba(0,0,0,0.5)",
      blur: opts.blur ?? existing?.blur ?? 10,
      offsetX: opts.offsetX ?? existing?.offsetX ?? 5,
      offsetY: opts.offsetY ?? existing?.offsetY ?? 5,
    });
    obj.set("shadow", shadow);
    this.editor.canvas.requestRenderAll();
  }

  removeShadow(): void {
    const obj = this.editor.selection.current;
    if (!obj) return;
    obj.set("shadow", null);
    this.editor.canvas.requestRenderAll();
  }
}
