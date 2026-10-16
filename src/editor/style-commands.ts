/**
 * Le style de l'objet sélectionné : couleur, remplissage, contour, ombre, police, styles
 * du texte — et les bascules legacy de forme et de découpe.
 */
import { FabricObject, FabricImage, Gradient, Shadow } from "#fabric";

/** Un arrêt de dégradé : sa couleur (hex ou rgba) et sa position, de 0 à 1. */
export interface GradientStop {
  color: string;
  offset: number;
}
import { switchClip } from "../clipping";
import { switchShape, nextShape } from "../shapes";
import { ImageFrame } from "../ImageFrame";
import type { ShapeType } from "../types";
import { padGroupOnFirstFill } from "../layout/grouping";
import { isTextObject } from "../layout/text";
import {
  isBold, summarizeStyles, summarizeObject, MIXED,
  type CharStyles, type StyleDeclaration, type TextStyleState,
} from "../text-styles";
import type { FabricEditor } from "../FabricEditor";

/** Un texte Fabric vu par les commandes de style : son édition, sa sélection, ses styles. */
type StyledText = FabricObject & StyleDeclaration & {
  text: string;
  isEditing?: boolean;
  selectionStart: number;
  selectionEnd: number;
  styles: CharStyles;
  setSelectionStyles(styles: object, start?: number, end?: number): void;
  getSelectionStyles(start?: number, end?: number, complete?: boolean): StyleDeclaration[];
  cleanStyle(property: string): void;
  removeStyle(property: string): void;
};

export class StyleCommands {
  constructor(private readonly editor: FabricEditor) {}

  // ── Texte : la plage sélectionnée, ou le texte entier ──────────────

  /**
   * Le style du texte sélectionné, là où un réglage s'appliquerait : la plage sélectionnée
   * en édition ; au curseur, le caractère qui le précède (ce dont hérite la frappe) ; hors
   * édition, les propriétés du texte, "mixed" là où des caractères en dévient.
   */
  textStyle(): TextStyleState | null {
    const target = this.textTarget();
    if (!target) return null;

    const { obj, range } = target;
    if (range) return summarizeStyles(obj.getSelectionStyles(range[0], range[1], true));
    if (obj.isEditing && obj.text.length > 0) {
      const at = Math.max(obj.selectionStart - 1, 0);
      return summarizeStyles(obj.getSelectionStyles(at, at + 1, true));
    }
    return summarizeObject(obj, obj.styles);
  }

  private textTarget(): { obj: StyledText; range: [number, number] | null } | null {
    const obj = this.editor.selection.current as StyledText | null;
    if (!obj || !isTextObject(obj)) return null;

    const ranged = obj.isEditing && obj.selectionStart !== obj.selectionEnd;
    return { obj, range: ranged ? [obj.selectionStart, obj.selectionEnd] : null };
  }

  /**
   * Pose des propriétés de texte : sur la plage sélectionnée en édition, sinon sur le texte
   * entier — et alors les surcharges par caractère de ces propriétés s'effacent (ce qu'on
   * règle « sur le texte » vaut pour tout le texte). Une plage qui finit par couvrir tout
   * le texte remonte sur l'objet : le document reste propre.
   */
  private applyTextStyle(props: StyleDeclaration): void {
    const target = this.textTarget();
    if (!target) return;

    const { obj, range } = target;
    if (range) {
      obj.setSelectionStyles(props, range[0], range[1]);
      for (const key of Object.keys(props)) obj.cleanStyle(key);
    } else {
      obj.set(props);
      for (const key of Object.keys(props)) obj.removeStyle(key);
    }
    obj.dirty = true;
    this.editor.layout.relayout();
    this.editor.canvas.requestRenderAll();
  }

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
      this.applyTextStyle({ fill: color });
      return;
    }
    obj.set(obj.stroke ? "stroke" : "fill", color);
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
    if (isTextObject(obj)) {
      // Un texte : la plage sélectionnée en édition, sinon le texte entier — dont l'opacité
      // revient à 1, la couleur la porte (le panneau compose les deux)
      if (!this.textTarget()?.range) obj.set({ opacity: 1 });
      this.applyTextStyle({ fill: color });
      return;
    }
    const previous = obj.fill;
    obj.set({ fill: color, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }

  /**
   * Un dégradé linéaire sur l'objet sélectionné : ses stops (offset 0..1, dans l'ordre) et
   * son angle en degrés, dans la convention de la lib — 0° de gauche à droite, 90° de haut en
   * bas (un quart de tour de moins que le CSS). L'opacité globale revient à 1 : les couleurs
   * des stops la portent.
   */
  setFillGradient(stops: GradientStop[], angleDeg: number): void {
    const obj = this.editor.selection.current;
    if (!obj || stops.length < 2) return;
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
      colorStops: stops.map(({ color, offset }) => ({ color, offset })),
    });
    const previous = obj.fill;
    obj.set({ fill: gradient, opacity: 1 });
    if (padGroupOnFirstFill(obj, previous)) this.editor.layout.relayout();
    this.editor.canvas.renderAll();
  }

  /** La police (famille et graisse) de la plage sélectionnée, ou du texte entier. */
  changeFont(fontFamily: string, fontWeight?: string): void {
    this.applyTextStyle({ fontFamily, fontWeight: fontWeight || "normal" });
  }

  /**
   * La taille du texte sélectionné : toujours le texte entier (une taille par texte, que
   * l'autofit pilote) — des tailles par caractère héritées d'un vieux document s'effacent.
   */
  setFontSize(size: number): void {
    const obj = this.editor.selection.current as StyledText | null;
    if (!obj || !isTextObject(obj) || !Number.isFinite(size) || size <= 0) return;

    obj.set({ fontSize: size });
    obj.removeStyle("fontSize");
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
   * Bascule un style (gras, italique, souligné) sur la plage sélectionnée, ou le texte
   * entier. Une plage mixte passe au style (tout en gras), comme dans un traitement de
   * texte. "bold" alterne un poids normal/bold ; un poids numérique >= 600 compte comme gras.
   */
  toggleTextStyle(style: "bold" | "italic" | "underline"): void {
    const state = this.textStyle();
    if (!state) return;

    switch (style) {
      case "bold": {
        const on = state.fontWeight !== MIXED && isBold(state.fontWeight);
        this.applyTextStyle({ fontWeight: on ? "normal" : "bold" });
        break;
      }
      case "italic":
        this.applyTextStyle({ fontStyle: state.fontStyle === "italic" ? "normal" : "italic" });
        break;
      case "underline":
        this.applyTextStyle({ underline: state.underline !== true });
        break;
    }
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
