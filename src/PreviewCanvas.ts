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

  /**
   * Remplace le contenu par ces layers et rend — l'unique verbe d'une preview.
   *
   * Anti-flicker : la désérialisation (chargement d'images compris) se fait AVANT le clear,
   * puis clear + add + renderAll dans la même tâche — clear() efface les pixels
   * immédiatement (clearContext), le rendu synchrone interdit toute frame blanche entre les
   * deux. Les rendus concurrents se départagent par jeton : le dernier appelé gagne.
   */
  async showLayers(layers: LayerData[]): Promise<void> {
    // LayerManager est typé sur DesignCanvas mais n'exige structurellement que
    // add/remove/getObjects (+ setActiveObject optionnel) — contrat que remplit StaticCanvas.
    const manager = new LayerManager(this as unknown as DesignCanvas);
    const token = (this._showToken = {});
    const objects = await manager.deserializeAll(layers);
    if (token !== this._showToken) return;

    this.clear();
    objects.forEach((obj) => obj && this.add(obj));
    this.renderAll();
  }

  private _showToken: object = {};
}
