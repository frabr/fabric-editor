import { StaticCanvas } from "#fabric";
import { LayerManager } from "./LayerManager";
import type { DesignCanvas } from "./DesignCanvas";
import type { LayerData } from "./types";

/**
 * Canvas de preview readonly — la version dépouillée, pour vignettes et posters.
 *
 * StaticCanvas : pas d'upper canvas (le calque d'interaction doublerait la mémoire pixel),
 * pas d'écouteurs DOM, pas de sélection ni de controls — et LayerManager.add ne sélectionne
 * jamais faute de setActiveObject. Aucun manager (layout, guides, snapping, historique)
 * n'est instancié : la mémoire se réduit au buffer du canvas et aux objets.
 *
 * Comme DesignCanvas, sépare l'espace design (celui des layers) de la taille d'affichage :
 * fitToSize dimensionne le buffer et pose le viewportTransform.
 */
export class PreviewCanvas extends StaticCanvas {
  readonly designWidth: number;
  readonly designHeight: number;

  constructor(
    el: HTMLCanvasElement,
    opts: { width: number; height: number } & Record<string, any>,
  ) {
    const { width, height, ...canvasOpts } = opts;
    super(el, {
      width,
      height,
      renderOnAddRemove: false,
      enableRetinaScaling: false,
      ...canvasOpts,
    });
    this.designWidth = width;
    this.designHeight = height;
  }

  fitToSize(containerW: number, containerH: number): number {
    const scale = Math.min(containerW / this.designWidth, containerH / this.designHeight);
    this.setDimensions({
      width: Math.round(this.designWidth * scale),
      height: Math.round(this.designHeight * scale),
    });
    this.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    return scale;
  }

  /** Remplace le contenu par ces layers et rend — l'unique verbe d'une preview. */
  async showLayers(layers: LayerData[]): Promise<void> {
    this.clear();
    // LayerManager est typé sur DesignCanvas mais n'exige structurellement que
    // add/remove/getObjects (+ setActiveObject optionnel) — contrat que remplit StaticCanvas.
    await new LayerManager(this as unknown as DesignCanvas).loadLayers(layers);
    this.requestRenderAll();
  }
}
