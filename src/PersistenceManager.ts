import { Canvas } from "#fabric";
import type { LayerManager } from "./LayerManager";
import type { PendingUploadsManager } from "./PendingUploadsManager";
import type { SaveOptions, SaveResult, LayerData } from "./types";

/**
 * Gère la sauvegarde et le chargement des données de l'éditeur
 */
export class PersistenceManager {
  private pendingUploads: PendingUploadsManager | null = null;

  constructor(
    private canvas: Canvas,
    private layers: LayerManager
  ) { }

  /**
   * Configure le gestionnaire d'uploads en attente
   */
  setPendingUploads(manager: PendingUploadsManager): void {
    this.pendingUploads = manager;
  }

  /**
   * Sauvegarde l'état actuel de l'éditeur
   *
   * Si des fichiers sont en attente d'upload, ils sont uploadés en parallèle
   * du rendu canvas pour optimiser le temps total.
   */
  async save(options: SaveOptions = {}): Promise<SaveResult> {
    const { rasterize = false } = options;

    // Désélectionner pour un rendu propre
    this.canvas.discardActiveObject();

    // Lancer en parallèle : uploads + rendu
    const [urlMap, dataUrl] = await Promise.all([
      this.uploadPendingFiles(),
      rasterize ? this.rasterize() : Promise.resolve(undefined),
    ]);

    // Sérialiser les layers et remplacer les blob URLs par les URLs Cloudinary
    let layersData = this.layers.serialize();
    let uploadedAssets: string[] | undefined;

    if (urlMap.size > 0) {
      const { PendingUploadsManager } = await import("./PendingUploadsManager");
      layersData = PendingUploadsManager.replaceUrls(layersData, urlMap);
      uploadedAssets = Array.from(urlMap.values());
    }

    return {
      layers: layersData,
      dataUrl,
      uploadedAssets,
    };
  }

  /**
   * Upload les fichiers en attente vers Cloudinary
   */
  private async uploadPendingFiles(): Promise<Map<string, string>> {
    if (!this.pendingUploads) {
      return new Map();
    }
    return this.pendingUploads.uploadAll();
  }

  /**
   * Rasterise le canvas en image base64
   */
  async rasterize(): Promise<string> {
    // Sauvegarder le zoom actuel
    const currentZoom = this.canvas.getZoom();

    // Réinitialiser le zoom pour le rendu
    this.canvas.setZoom(1);

    const dataUrl = this.canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });

    // Restaurer le zoom
    this.canvas.setZoom(currentZoom);

    return dataUrl;
  }

  /**
   * Compacte le canvas autour des calques (pour le mode standalone)
   *
   * Calcule le bounding box manuellement sans Group, car Fabric.js 7
   * transforme les coordonnées des enfants en relatif au centre du groupe.
   */
  compactAroundLayers(): void {
    const layerObjects = this.layers.all;
    if (layerObjects.length === 0) return;

    // Calculer le bounding box de tous les calques
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const obj of layerObjects) {
      const rect = obj.getBoundingRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.left + rect.width);
      maxY = Math.max(maxY, rect.top + rect.height);
    }

    // Décaler tous les objets pour que le contenu démarre à (0, 0)
    for (const obj of layerObjects) {
      obj.set({
        left: obj.left - minX,
        top: obj.top - minY,
      });
      obj.setCoords();
    }

    // Vider le canvas et ré-ajouter les calques repositionnés
    this.canvas.clear();
    for (const obj of layerObjects) {
      this.canvas.add(obj);
    }

    // Ajuster la taille du canvas au bounding box
    this.canvas.setDimensions({
      width: maxX - minX,
      height: maxY - minY,
    });
  }

  /**
   * Exporte les données des calques en JSON
   */
  exportLayersJSON(): string {
    return JSON.stringify(this.layers.serialize());
  }

  /**
   * Importe des calques depuis du JSON
   */
  async importLayersJSON(json: string): Promise<void> {
    const layersData: LayerData[] = JSON.parse(json);
    await this.layers.loadLayers(layersData);
  }

  /**
   * Réinitialise l'éditeur (supprime tous les calques sauf le fond)
   */
  reset(): void {
    const background = this.layers.background;
    this.canvas.clear();
    if (background) {
      this.canvas.add(background);
    }
    this.canvas.renderAll();
  }
}
