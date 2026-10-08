import { StaticCanvas } from "#fabric";
import { LayerManager } from "./LayerManager";
import { runLayout } from "./layout/run";
import { initYoga } from "./layout/stack/engine";
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
      // Retina : sans buffer à devicePixelRatio, les petites vignettes (48px) sortent
      // pixelisées sur HiDPI. Le surcoût mémoire reste marginal aux tailles de preview.
      enableRetinaScaling: true,
      ...canvasOpts,
    });
    this.designWidth = width;
    this.designHeight = height;
  }

  /**
   * `contain` : le buffer épouse le design réduit (letterbox géré par le parent).
   * `cover` : le buffer épouse le conteneur, le design centré déborde — le crop est fait par
   * le canvas lui-même (un object-fit CSS étirerait le bitmap).
   */
  fitToSize(containerW: number, containerH: number, fit: "contain" | "cover" = "contain"): number {
    const ratios = [containerW / this.designWidth, containerH / this.designHeight];
    const scale = fit === "cover" ? Math.max(...ratios) : Math.min(...ratios);
    const width = fit === "cover" ? containerW : Math.round(this.designWidth * scale);
    const height = fit === "cover" ? containerH : Math.round(this.designHeight * scale);
    this.setDimensions({ width, height });
    this.setViewportTransform([
      scale,
      0,
      0,
      scale,
      (width - this.designWidth * scale) / 2,
      (height - this.designHeight * scale) / 2,
    ]);
    // Redimensionner un canvas réinitialise l'état de son contexte : la qualité de lissage
    // se repose ici. "high" — un downscale 1080 -> 48 en un drawImage crénèle sinon.
    this.getContext().imageSmoothingQuality = "high";
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
  async showLayers(layers: LayerData[], { relayout = false }: { relayout?: boolean } = {}): Promise<void> {
    // LayerManager est typé sur DesignCanvas mais n'exige structurellement que
    // add/remove/getObjects (+ setActiveObject optionnel) — contrat que remplit StaticCanvas.
    const manager = new LayerManager(this as unknown as DesignCanvas);
    const token = (this._showToken = {});
    const objects = await manager.deserializeAll(layers);
    // `relayout` : les positions stockées supposent les textes du document — quand
    // l'appelant les a interpolés (variables résolues pour SON lecteur), les longueurs
    // changent et les conteneurs hug doivent se réagencer. runLayout est pur et le wasm
    // yoga un singleton par page : le coût par vignette est un parcours d'objets.
    if (relayout) await initYoga();
    if (token !== this._showToken) return;

    this.clear();
    objects.forEach((obj) => obj && this.add(obj));
    if (relayout) runLayout(this.getObjects());
    this.renderAll();
  }

  private _showToken: object = {};
}
