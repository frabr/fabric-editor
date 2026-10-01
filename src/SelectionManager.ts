import { ActiveSelection, Point, type FabricObject } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { isPositionLocked } from "./locking";
import type { LayoutData } from "./layout/types";
import { isTextObject } from "./layout/geometry";
import type { SelectionCallbacks, ControlOption } from "./types";
import type { Controllable } from "./shapes/controlsMixin";

/**
 * Gère la sélection des objets sur le canvas
 */
export class SelectionManager {
  private _current: FabricObject | FabricObject[] | null = null;
  private callbacks: SelectionCallbacks = {};
  private isTransforming = false;
  private _silenced = false;

  /**
   * When set, we are "inside" a layout group: hover and click target
   * children directly instead of redirecting to the container.
   */
  private _activeGroupId: string | null = null;

  constructor(private canvas: DesignCanvas) {
    this.setupListeners();
  }

  /** The layerId of the container we're currently editing inside, or null. */
  get activeGroupId(): string | null {
    return this._activeGroupId;
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
   * Given a Fabric target (the object under the cursor), return the object
   * that should actually be hovered / selected / dragged: a layout child
   * outside the active group resolves to its container, up the chain (a
   * grandchild resolves to the outermost container that isn't the active
   * group's child).
   */
  resolveTarget(obj: FabricObject): FabricObject {
    let current = obj;
    for (;;) {
      const parentId = (current.get("layout") as LayoutData | undefined)?.child?.parentId;
      // Not a child, or inside its group → this is the target
      if (!parentId || parentId === this._activeGroupId) return current;
      const parent = this.canvas.getObjects().find((o) => o.get("layerId") === parentId);
      if (!parent) return current;
      current = parent;
    }
  }

  /**
   * Retourne les contrôles disponibles pour l'objet sélectionné
   */
  getAvailableControls(): ControlOption[] {
    const obj = this.current;
    if (!obj) return [];
    if (typeof (obj as unknown as Controllable).getControlOptions === "function") {
      return (obj as unknown as Controllable).getControlOptions();
    }
    return [];
  }

  /**
   * Vérifie si un contrôle est disponible pour l'objet sélectionné
   */
  hasControl(control: ControlOption): boolean {
    return this.getAvailableControls().includes(control);
  }

  /**
   * Désélectionne tout et re-rend le canvas
   */
  clear(): void {
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this._current = null;
  }

  /**
   * Suspend tous les callbacks de sélection (onSelect, onDeselect, etc.).
   * Utilisé par changeShape() qui fait un remove+add synchrone : sans suppression,
   * les contrôleurs externes (toolbox) interpréteraient les événements intermédiaires
   * comme de vraies actions utilisateur.
   */
  silenceCallbacks(): void {
    this._silenced = true;
  }

  /**
   * Réactive les callbacks de sélection après une suppression.
   */
  restoreCallbacks(): void {
    this._silenced = false;
  }

  /**
   * Sélectionne un objet
   */
  select(obj: FabricObject): void {
    this.canvas.setActiveObject(obj);
    this._current = obj;
    this.canvas.renderAll();
  }

  /**
   * Sélectionne un objet par son layerId
   */
  selectByLayerId(layerId: string): boolean {
    const obj = this.canvas.getObjects().find(
      (o) => o.get("layerId") === layerId,
    );
    if (!obj) return false;
    this.select(obj);
    return true;
  }

  /**
   * Configure les écouteurs d'événements du canvas
   */
  private setupListeners(): void {
    this.redirectTargetSearch();
    this.canvas.on("mouse:down:before", this.handleMouseDownBefore.bind(this));
    this.canvas.on("mouse:down", this.handleMouseDown.bind(this));
    this.canvas.on("mouse:up", this.handleMouseUp.bind(this));
    this.canvas.on("mouse:dblclick", this.handleDoubleClick.bind(this));
    this.canvas.on("selection:created", this.handleSelection.bind(this));
    this.canvas.on("selection:updated", this.handleSelection.bind(this));
    this.canvas.on("selection:cleared", this.handleDeselection.bind(this));
    this.canvas.on("object:moving", this.handleTransformStart.bind(this));
    this.canvas.on("object:resizing", this.handleTransformStart.bind(this));
    this.canvas.on("object:rotating", this.handleTransformStart.bind(this));
    this.canvas.on("object:modified", this.handleModified.bind(this));
  }

  /**
   * Fabric picks the target of a press (and of hover) in searchPossibleTargets:
   * redirecting there — not after the selection — makes a press on a child
   * outside its group a press on its container, so that a click + drag moves
   * the container right away instead of grabbing the child.
   */
  private redirectTargetSearch(): void {
    const fc = this.canvas.originalFabricCanvas as unknown as {
      searchPossibleTargets(objects: FabricObject[], pointer: unknown): { target?: FabricObject; container?: FabricObject };
    };
    const search = fc.searchPossibleTargets.bind(fc);
    fc.searchPossibleTargets = (objects, pointer) => {
      const info = search(objects, pointer);
      if (info.target) {
        const resolved = this.resolveTarget(info.target);
        if (resolved !== info.target) {
          info.target = resolved;
          info.container = resolved;
        }
      }
      return info;
    };
  }

  /** What was selected before this press — Fabric selects before firing mouse:down. */
  private _selectedBeforePress: FabricObject | null = null;

  private handleMouseDownBefore(): void {
    this._selectedBeforePress = this.current;
  }

  /**
   * Group exit: a press outside the active group (or on empty canvas) leaves it.
   * Entering is decided on release (see handleMouseUp), so that a drag on a
   * selected container still moves it.
   */
  private handleMouseDown(e: any): void {
    if (!this._activeGroupId) return;

    const target = e.target as FabricObject | undefined;
    const isTheContainer = target?.get("layerId") === this._activeGroupId;
    const isChildOfGroup = (target?.get("layout") as LayoutData | undefined)?.child?.parentId === this._activeGroupId;
    if (!target || (!isTheContainer && !isChildOfGroup)) this._activeGroupId = null;
  }

  /**
   * Group enter: a click (no drag) on a container that was already selected
   * enters it and selects its child under the pointer.
   */
  private handleMouseUp(e: any): void {
    const before = this._selectedBeforePress;
    this._selectedBeforePress = null;
    if (!e.isClick || !before || e.target !== before) return;
    if (!(before.get("layout") as LayoutData | undefined)?.container) return;

    this.enterGroup(before, this.canvas.getScenePoint(e.e));
  }

  /** Enter `container`'s group and select its topmost child under `point`. */
  private enterGroup(container: FabricObject, point: { x: number; y: number }): void {
    const id = container.get("layerId") as string;
    this._activeGroupId = id;

    const child = this.canvas.getObjects().slice().reverse().find((o) =>
      (o.get("layout") as LayoutData | undefined)?.child?.parentId === id &&
      o.containsPoint(new Point(point.x, point.y)),
    );
    if (child) this.canvas.setActiveObject(child);
    this.canvas.requestRenderAll();
  }

  /**
   * Double-click on a text inside a container: its two clicks entered the
   * group and selected the text (the press targeted the container, so
   * Fabric's own double-click editing didn't run) — edit it now, word under
   * the pointer selected, like Fabric does.
   */
  private handleDoubleClick(e: any): void {
    const text = this.current as (FabricObject & {
      isEditing?: boolean;
      editable?: boolean;
      enterEditing(e?: unknown): void;
      getSelectionStartFromPointer(e: unknown): number;
      selectWord(index: number): void;
    }) | null;
    if (!text || !isTextObject(text) || text.isEditing || text.editable === false) return;
    if ((text.get("layout") as LayoutData | undefined)?.child?.parentId !== this._activeGroupId) return;

    text.enterEditing(e.e);
    text.selectWord(text.getSelectionStartFromPointer(e.e));
    this.canvas.requestRenderAll();
  }

  /**
   * Gère la création/mise à jour de sélection
   * Les objets verrouillés sont exclus des sélections multiples
   */
  private handleSelection(e: { selected?: FabricObject[] }): void {
    if (this._silenced) return;

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
        const newSelection = new ActiveSelection(unlocked, { canvas: this.canvas.originalFabricCanvas });
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

    // Sélection simple — redirect child → container if not inside group
    const resolved = this.resolveTarget(activeObject);
    if (resolved !== activeObject) {
      this.canvas.discardActiveObject();
      this.canvas.setActiveObject(resolved);
      this._current = resolved;
      if (this.callbacks.onSelect) {
        this.callbacks.onSelect(resolved);
      }
      return;
    }

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
    this._activeGroupId = null;
    if (this._silenced) return;
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
    this.canvas.off("object:resizing");
    this.canvas.off("object:rotating");
    this.canvas.off("object:modified");
  }
}
