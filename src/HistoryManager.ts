import type { Canvas } from "fabric";
import type { LayerManager } from "./LayerManager";
import type { LayerData } from "./types";

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface HistoryCallbacks {
  /** Appelé quand l'état undo/redo change */
  onStateChange?: (state: HistoryState) => void;
}

/**
 * Gère l'historique des modifications pour undo/redo
 *
 * Utilise une approche "snapshot" : à chaque modification,
 * l'état complet des calques est sérialisé et stocké.
 */
export class HistoryManager {
  private stack: string[] = [];
  private index = -1;
  private maxSize: number;
  private callbacks: HistoryCallbacks = {};
  private isRestoring = false;

  constructor(
    private canvas: Canvas,
    private layers: LayerManager,
    options: { maxSize?: number } = {}
  ) {
    this.maxSize = options.maxSize ?? 50;
  }

  /**
   * Configure les callbacks
   */
  setCallbacks(callbacks: HistoryCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Définit le callback onStateChange
   */
  set onStateChange(callback: ((state: HistoryState) => void) | undefined) {
    this.callbacks.onStateChange = callback;
  }

  /**
   * Vérifie si on peut annuler
   */
  get canUndo(): boolean {
    return this.index > 0;
  }

  /**
   * Vérifie si on peut refaire
   */
  get canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  /**
   * Retourne l'état actuel
   */
  get state(): HistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    };
  }

  /**
   * Enregistre l'état actuel dans l'historique
   * Appelé après chaque modification
   */
  push(): void {
    // Ignorer si on est en train de restaurer un état
    if (this.isRestoring) return;

    const snapshot = JSON.stringify(this.layers.serialize());

    // Si on est au milieu de l'historique, supprimer tout ce qui suit
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }

    // Éviter les doublons consécutifs
    if (this.stack[this.stack.length - 1] === snapshot) {
      return;
    }

    this.stack.push(snapshot);

    // Limiter la taille de l'historique
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index++;
    }

    this.notifyStateChange();
  }

  /**
   * Annule la dernière modification (Ctrl+Z)
   * @returns true si l'annulation a réussi
   */
  async undo(): Promise<boolean> {
    if (!this.canUndo) return false;

    this.index--;
    await this.restore();
    this.notifyStateChange();
    return true;
  }

  /**
   * Refait la dernière modification annulée (Ctrl+Y / Ctrl+Shift+Z)
   * @returns true si le redo a réussi
   */
  async redo(): Promise<boolean> {
    if (!this.canRedo) return false;

    this.index++;
    await this.restore();
    this.notifyStateChange();
    return true;
  }

  /**
   * Réinitialise l'historique
   * Utile après un chargement initial ou une sauvegarde
   */
  clear(): void {
    this.stack = [];
    this.index = -1;
    this.notifyStateChange();
  }

  /**
   * Initialise l'historique avec l'état actuel
   * À appeler après le chargement initial des calques
   */
  initialize(): void {
    this.clear();
    this.push();
  }

  /**
   * Restaure l'état à l'index actuel
   */
  private async restore(): Promise<void> {
    const snapshot = this.stack[this.index];
    if (!snapshot) return;

    this.isRestoring = true;

    // Désactiver le rendu automatique pour éviter le flickering
    const previousRenderOnAddRemove = this.canvas.renderOnAddRemove;
    this.canvas.renderOnAddRemove = false;

    try {
      const layersData: LayerData[] = JSON.parse(snapshot);

      // Supprimer tous les calques actuels (sauf le background)
      const currentLayers = this.layers.all;
      currentLayers.forEach((obj) => this.layers.remove(obj));

      // Recharger les calques depuis le snapshot
      await this.layers.loadLayers(layersData);
    } finally {
      // Réactiver le rendu et faire un seul renderAll
      this.canvas.renderOnAddRemove = previousRenderOnAddRemove;
      this.canvas.requestRenderAll();
      this.isRestoring = false;
    }
  }

  /**
   * Notifie les callbacks du changement d'état
   */
  private notifyStateChange(): void {
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }
}
