import { ActiveSelection, type Canvas, type FabricObject } from "fabric";
import { isPositionLocked } from "./locking";
import type { SelectionCallbacks, ControlOption } from "./types";

/**
 * Configuration des contrôles disponibles par type d'objet
 */
const OBJECT_CONTROLS: Record<string, ControlOption[]> = {
  // Formes créées par l'éditeur (layerType: "shape")
  shape: ["outline", "clip", "color"],
  // Types Fabric.js natifs (fallback)
  rect: ["outline", "clip", "color"],
  circle: ["outline", "clip", "color"],
  path: ["outline", "clip", "color"],
  image: ["clip"],
  imageframe: ["clip"], // ImageFrame : permet de changer la forme du clip
  group: [],
  "i-text": ["color", "font"],
};

/**
 * Gère la sélection des objets sur le canvas
 */
export class SelectionManager {
  private _current: FabricObject | FabricObject[] | null = null;
  private callbacks: SelectionCallbacks = {};
  private isTransforming = false;

  constructor(private canvas: Canvas) {
    this.setupListeners();
  }

  /**
   * L'objet actuellement sélectionné (ou tableau si sélection multiple)
   */
  get current(): FabricObject | null {
    if (Array.isArray(this._current)) {
      return null;
    }
    return this._current;
  }

  /**
   * Les objets sélectionnés (toujours un tableau)
   */
  get selected(): FabricObject[] {
    if (!this._current) return [];
    if (Array.isArray(this._current)) return this._current;
    return [this._current];
  }

  /**
   * Vérifie si quelque chose est sélectionné
   */
  get hasSelection(): boolean {
    return this._current !== null;
  }

  /**
   * Vérifie si c'est une sélection multiple
   */
  get isMultipleSelection(): boolean {
    return Array.isArray(this._current) && this._current.length > 1;
  }

  /**
   * Configure les callbacks de sélection
   */
  setCallbacks(callbacks: SelectionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Définit le callback onSelect
   */
  set onSelect(callback: ((obj: FabricObject) => void) | undefined) {
    this.callbacks.onSelect = callback;
  }

  /**
   * Définit le callback onDeselect
   */
  set onDeselect(callback: (() => void) | undefined) {
    this.callbacks.onDeselect = callback;
  }

  /**
   * Définit le callback onTransformStart
   */
  set onTransformStart(callback: (() => void) | undefined) {
    this.callbacks.onTransformStart = callback;
  }

  /**
   * Définit le callback onModified
   */
  set onModified(callback: ((obj: FabricObject | null) => void) | undefined) {
    this.callbacks.onModified = callback;
  }

  /**
   * Retourne les contrôles disponibles pour l'objet sélectionné
   */
  getAvailableControls(): ControlOption[] {
    const obj = this.current;
    if (!obj) return [];

    // Utiliser layerType en priorité (pour ImageFrame), sinon type Fabric.js
    const layerType = (obj as { layerType?: string }).layerType;
    const type = (layerType || obj.type || "").toLowerCase();
    return OBJECT_CONTROLS[type] || [];
  }

  /**
   * Vérifie si un contrôle est disponible pour l'objet sélectionné
   */
  hasControl(control: ControlOption): boolean {
    return this.getAvailableControls().includes(control);
  }

  /**
   * Désélectionne tout
   */
  clear(): void {
    this.canvas.discardActiveObject();
    this._current = null;
  }

  /**
   * Sélectionne un objet
   */
  select(obj: FabricObject): void {
    this.canvas.setActiveObject(obj);
    this._current = obj;
  }

  /**
   * Configure les écouteurs d'événements du canvas
   */
  private setupListeners(): void {
    this.canvas.on("selection:created", this.handleSelection.bind(this));
    this.canvas.on("selection:updated", this.handleSelection.bind(this));
    this.canvas.on("selection:cleared", this.handleDeselection.bind(this));
    this.canvas.on("object:moving", this.handleTransformStart.bind(this));
    this.canvas.on("object:scaling", this.handleTransformStart.bind(this));
    this.canvas.on("object:rotating", this.handleTransformStart.bind(this));
    this.canvas.on("object:modified", this.handleModified.bind(this));
  }

  /**
   * Gère la création/mise à jour de sélection
   * Les objets verrouillés sont exclus des sélections multiples
   */
  private handleSelection(e: { selected?: FabricObject[] }): void {
    const activeObject = this.canvas.getActiveObject();

    if (!activeObject) return;

    // Sélection multiple (activeSelection)
    if (activeObject.type === "activeselection" && e.selected) {
      // Filtrer les objets verrouillés de la sélection
      const unlocked = e.selected.filter((obj) => !isPositionLocked(obj));

      // Si tous les objets sont verrouillés, annuler la sélection
      if (unlocked.length === 0) {
        this.canvas.discardActiveObject();
        this._current = null;
        if (this.callbacks.onDeselect) {
          this.callbacks.onDeselect();
        }
        return;
      }

      // Si un seul objet non verrouillé, le sélectionner individuellement
      if (unlocked.length === 1) {
        this.canvas.discardActiveObject();
        this.canvas.setActiveObject(unlocked[0]);
        this._current = unlocked[0];
        if (this.callbacks.onSelect) {
          this.callbacks.onSelect(unlocked[0]);
        }
        return;
      }

      // Si des objets verrouillés ont été filtrés, recréer la sélection sans eux
      if (unlocked.length < e.selected.length) {
        this.canvas.discardActiveObject();
        const newSelection = new ActiveSelection(unlocked, { canvas: this.canvas });
        this.canvas.setActiveObject(newSelection);
        this._current = unlocked;
        if (this.callbacks.onSelect && unlocked[0]) {
          this.callbacks.onSelect(unlocked[0]);
        }
        return;
      }

      // Sélection normale (aucun objet verrouillé)
      this._current = e.selected;
      if (this.callbacks.onSelect && e.selected[0]) {
        this.callbacks.onSelect(e.selected[0]);
      }
      return;
    }

    // Sélection simple
    this._current = activeObject;
    if (this.callbacks.onSelect) {
      this.callbacks.onSelect(activeObject);
    }
  }

  /**
   * Gère la désélection
   */
  private handleDeselection(): void {
    this._current = null;
    if (this.callbacks.onDeselect) {
      this.callbacks.onDeselect();
    }
  }

  /**
   * Gère le début d'une transformation (déplacement, rotation, redimensionnement)
   * Appelé une seule fois au début de la transformation
   */
  private handleTransformStart(): void {
    if (this.isTransforming) return;

    this.isTransforming = true;
    if (this.callbacks.onTransformStart) {
      this.callbacks.onTransformStart();
    }
  }

  /**
   * Gère la fin d'une modification d'objet
   */
  private handleModified(e: { target?: FabricObject }): void {
    this.isTransforming = false;
    if (this.callbacks.onModified) {
      this.callbacks.onModified(e.target || null);
    }
  }

  /**
   * Nettoie les écouteurs
   */
  dispose(): void {
    this.canvas.off("selection:created");
    this.canvas.off("selection:updated");
    this.canvas.off("selection:cleared");
    this.canvas.off("object:moving");
    this.canvas.off("object:scaling");
    this.canvas.off("object:rotating");
    this.canvas.off("object:modified");
  }
}
