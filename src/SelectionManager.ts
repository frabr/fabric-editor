import { ActiveSelection, Point, type FabricObject } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { isPositionLocked } from "./locking";

import type { SelectionCallbacks, ControlOption } from "./types";
import { rulesOf } from "./capabilities";
import { ancestorsOf, findById, parentOf, stackParentOf } from "./layout/hierarchy";
import { idOf, parentIdOf, containerDataOf } from "./layout/model";
import { isTextObject } from "./layout/text";

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
   * Définit le callback onSelectMany
   */
  set onSelectMany(callback: ((objects: FabricObject[]) => void) | undefined) {
    this.callbacks.onSelectMany = callback;
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
      const parentId = parentIdOf(current);
      // Not a child, or inside its group → this is the target
      if (!parentId || parentId === this._activeGroupId) return current;
      const parent = parentOf(current, this.canvas.getObjects());
      if (!parent) return current;
      current = parent;
    }
  }

  /**
   * Retourne les contrôles disponibles pour l'objet sélectionné
   */
  getAvailableControls(): ControlOption[] {
    const obj = this.current;
    return obj ? rulesOf(obj).options : [];
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
    const obj = findById(this.canvas.getObjects(), layerId);
    if (!obj) return false;
    this.select(obj);
    return true;
  }

  /**
   * Sélectionne plusieurs objets (normalisés comme une sélection à la souris). Un seul
   * objet retenu : sélection simple ; aucun : rien n'est sélectionné.
   */
  selectMany(objects: FabricObject[]): void {
    const kept = this.normalizeMany(objects);
    if (kept.length === 0) this.clear();
    else if (kept.length === 1) this.select(kept[0]);
    else {
      this.canvas.setActiveObject(new ActiveSelection(kept, { canvas: this.canvas.originalFabricCanvas }));
      this.canvas.renderAll();
    }
  }

  /**
   * Travaille sur les objets sélectionnés hors de la sélection de Fabric — dedans, leurs
   * positions sont relatives à elle — puis les resélectionne, dans le même groupe. L'hôte
   * n'entend que la resélection : la barre se replace sur la nouvelle boîte.
   */
  withSelectionReleased(fn: (objects: FabricObject[]) => void): void {
    const objects = this.selected;
    const groupId = this._activeGroupId;

    const silenced = this._silenced;
    this._silenced = true;
    this.canvas.discardActiveObject();
    this._silenced = silenced;
    this._activeGroupId = groupId;

    fn(objects);
    this.selectMany(objects);
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
    const isChildOfGroup = parentIdOf(target) === this._activeGroupId;
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
    if (!containerDataOf(before)) return;

    this.enterGroup(before, this.canvas.getScenePoint(e.e));
  }

  /** Enter `container`'s group and select its topmost child under `point`. */
  private enterGroup(container: FabricObject, point: { x: number; y: number }): void {
    const id = idOf(container);
    this._activeGroupId = id;

    const child = this.canvas.getObjects().slice().reverse().find((o) =>
      parentIdOf(o) === id &&
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
    if (parentIdOf(text) !== this._activeGroupId) return;

    text.enterEditing(e.e);
    text.selectWord(text.getSelectionStartFromPointer(e.e));
    this.canvas.requestRenderAll();
  }

  /**
   * Gère la création/mise à jour de sélection
   * Les objets verrouillés sont exclus des sélections multiples
   */
  private handleSelection(): void {
    if (this._silenced) return;

    const activeObject = this.canvas.getActiveObject();

    if (!activeObject) return;

    // Sélection multiple (activeSelection)
    if (activeObject instanceof ActiveSelection) {
      this.handleMultipleSelection(activeObject);
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
   * Une sélection multiple ne garde que des objets du niveau visé : chacun remonte à son
   * container comme un clic (resolveTarget), un objet dont l'ancêtre est pris suit cet
   * ancêtre, les verrouillés restent dehors. Si la sélection de Fabric n'est pas déjà
   * celle-là, on la remplace — l'événement qui suit repasse ici, sélection conforme.
   * Pas de poignées de taille ni de rotation : un redimensionnement ne s'empile jamais
   * en `scale`, et la sélection n'a pas encore le sien (cf. groupes libres). Des enfants
   * d'une pile ne se déplacent pas à plusieurs : leur place est celle que la pile leur
   * donne (ceux d'un groupe, si).
   */
  private handleMultipleSelection(selection: ActiveSelection): void {
    const members = selection.getObjects();
    const kept = this.normalizeMany(members);

    if (kept.length === 0) {
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      return;
    }
    if (kept.length === 1) {
      this.canvas.setActiveObject(kept[0]);
      this.canvas.requestRenderAll();
      return;
    }
    if (kept.length !== members.length || kept.some((obj) => !members.includes(obj))) {
      this.canvas.setActiveObject(new ActiveSelection(kept, { canvas: this.canvas.originalFabricCanvas }));
      this.canvas.requestRenderAll();
      return;
    }

    const pinned = kept.some((obj) => stackParentOf(obj));
    selection.set({ hasControls: false, lockMovementX: pinned, lockMovementY: pinned });
    this._current = kept;
    if (this.callbacks.onSelectMany) this.callbacks.onSelectMany(kept);
    else this.callbacks.onSelect?.(kept[0]);
  }

  /**
   * Les objets d'une sélection multiple ramenés au niveau visé, dans l'ordre de la pile.
   * Le container dans lequel on est entré n'en fait pas partie : c'est le cadre de la
   * sélection, pas un de ses éléments.
   */
  normalizeMany(objects: FabricObject[]): FabricObject[] {
    const picked = new Set<FabricObject>();
    for (const obj of objects) {
      const resolved = this.resolveTarget(obj);
      if (this._activeGroupId && resolved.get("layerId") === this._activeGroupId) continue;
      if (isPositionLocked(resolved)) continue;
      picked.add(resolved);
    }

    const all = this.canvas.getObjects();
    return all.filter((obj) => picked.has(obj) && !ancestorsOf(obj, all).some((a) => picked.has(a)));
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
