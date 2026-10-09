import { ActiveSelection, FabricObject } from "#fabric";
import type { DesignCanvas } from "./DesignCanvas";
import { CanvasGuides } from "./ui/guides";
import { DragToLayout } from "./DragToLayout";
import { runLayout, layoutSubtree, relayoutAncestors } from "./layout/run";
import { StackResizeSession } from "./layout/stack/resize-session";
import { MIN_PAD, type AlignItems, type AlignSelf, type Arrangement, type ChildData, type ContainerData, type JustifyContent, type SizingData, type TextOverflow } from "./layout/types";
import { arrangeAsStack, arrangeFree } from "./layout/arrangement";
import { syncGroupControls } from "./ui/controls";
import { placeTopLeft, scaledSize, topLeft } from "./layout/geometry";
import type { CustomTextbox } from "./controls/CustomTextbox";
import { rulesOf } from "./capabilities";

/** Size presets of the UI (same vocabulary for containers and texts). */
export type SizePreset = "hug" | "hug-y" | "fixed";

const SIZE_PRESETS: Record<SizePreset, Pick<SizingData, "x" | "y">> = {
  "hug": { x: "hug", y: "hug" },
  "hug-y": { x: "fixed", y: "hug" },
  "fixed": { x: "fixed", y: "fixed" },
};
import { clampToRoom } from "./layout/stack/room";
import { fitFreeAncestors } from "./layout/free/fit";
import { SubtreeDrag } from "./layout/subtree-drag";
import { FreeResizeSession } from "./layout/free/resize-session";
import { layoutOf, containerDataOf, childDataOf, isContainerObject, isFreeContainer, sizingOf, paddingOf, updateContainer, updateChild, updateLayout, uniformPadding } from "./layout/model";
import { parentContainerOf, findById } from "./layout/hierarchy";
import { isTextObject } from "./layout/text";

// ── Types ───────────────────────────────────────────────────────────

export interface LayoutManagerCallbacks {
  /** Called after a layout relationship is committed (drag-to-layout or panel edit). */
  onLayoutCreated?: () => void;
  /** Called after any layout change (relayout, margin/anchor/mode change). */
  onLayoutChanged?: () => void;
  /** The layerId of the container the user entered (clicked into), null otherwise. */
  getEnteredContainerId?: () => string | null;
}



// ── LayoutManager ───────────────────────────────────────────────────

/**
 * The layout of the canvas, as the host sees it (`editor.layout`):
 * 1. **Commands** of the layout panel: size mode, padding, gap, direction,
 *    alignment, free / stacked arrangement, "use as a block" (makeContainer).
 * 2. **Gestures** on existing containers, wired to the canvas events: a moved
 *    container or group takes its content along, a resized stack or group
 *    settles (StackResizeSession / FreeResizeSession), a child of a group moves
 *    freely, a text edit relayouts its ancestors.
 * 3. **Dropping into a stack**: delegated to DragToLayout (native drags through
 *    object:moving, toolbox drags through the external drag API below).
 */
export class LayoutManager {
  private canvas: DesignCanvas;
  private callbacks: LayoutManagerCallbacks;
  private guides: CanvasGuides;
  private readonly drag: DragToLayout;
  private resizeSession: StackResizeSession | null = null;
  /** Le redimensionnement d'un groupe en cours (ouvert à before:transform). */
  private freeResize: FreeResizeSession | null = null;
  /** Les descendants qui suivent les objets déplacés (un groupe, une sélection multiple). */
  private followers: SubtreeDrag | null = null;

  constructor(canvas: DesignCanvas, callbacks: LayoutManagerCallbacks = {}, guideColor?: string) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.guides = new CanvasGuides(canvas, guideColor);
    this.drag = new DragToLayout(canvas, this.guides, () => this.callbacks);
    this.setupEventListeners();
  }

  /** Set or update callbacks after construction (merges with existing). */
  setCallbacks(callbacks: LayoutManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Run layout on all canvas objects (programmatic relayout). */
  relayout(): void {
    runLayout(this.canvas.getObjects());
    this.canvas.renderAll();
  }

  /** A layout change: everything settles, then the host hears about it. */
  private changed(): void {
    this.relayout();
    this.callbacks.onLayoutChanged?.();
  }

  /** A panel edit on a container's own block (ignored on anything else). */
  private editContainer(obj: FabricObject, patch: Partial<ContainerData>): void {
    if (!isContainerObject(obj)) return;
    updateContainer(obj, patch);
    this.changed();
  }

  /** A panel edit on a child's block (ignored outside a container). */
  private editChild(obj: FabricObject, patch: Partial<ChildData>): void {
    if (!childDataOf(obj)) return;
    updateChild(obj, patch);
    this.changed();
  }

  /**
   * Set the size mode of a container or a text:
   * - "hug": width and height follow the content
   * - "hug-y": fixed width (texts wrap), height follows the content
   * - "fixed": fixed width and height (texts apply their overflow)
   * Choosing a mode drops the floor set by the handles (`minSize`): the box fits its
   * content again, as the mode says.
   */
  setMode(obj: FabricObject, mode: SizePreset): void {
    const isText = isTextObject(obj);
    if (!isContainerObject(obj) && !isText) return;

    const { minSize: _floor, ...current } = sizingOf(obj);
    const sizing: SizingData = { ...current, ...SIZE_PRESETS[mode] };

    if (isText) (obj as unknown as CustomTextbox).setSizing(sizing);
    else updateLayout(obj, { sizing });
    this.changed();
  }

  /** What a text does when its box is smaller than its content. */
  setOverflow(obj: FabricObject, overflow: TextOverflow): void {
    if (!isTextObject(obj)) return;
    (obj as unknown as CustomTextbox).setTextOverflow(overflow);
    this.changed();
  }

  /** Padding of a container — one side, or "all" four. */
  setPadding(obj: FabricObject, side: string, value: number): void {
    const sides = side === "all" ? ["top", "right", "bottom", "left"] : [side];
    const padding = { ...paddingOf(containerDataOf(obj)) };
    for (const s of sides) (padding as Record<string, number>)[s] = value;
    this.editContainer(obj, { padding });
  }

  /** Un groupe libre ou rangé (une pile) — la bascule ne fait rien sauter (cf. arrangement). */
  setArrangement(obj: FabricObject, arrangement: Arrangement): void {
    const cd = containerDataOf(obj);
    if (!cd || (cd.arrangement ?? "stack") === arrangement) return;

    const objects = this.canvas.getObjects();
    if (arrangement === "stack") arrangeAsStack(obj, objects);
    else arrangeFree(obj, objects);
    syncGroupControls(obj);
    this.changed();
  }

  /**
   * Une forme devient un bloc : un container, même vide, en colonne — les objets qu'on y
   * glisse s'y rangent. Il épouse son contenu sans jamais descendre sous sa taille actuelle
   * (hug, plancher minSize). Glisser un objet sur une forme simple ne la change plus en
   * container : c'est ce geste-ci, ou grouper puis ranger. Dégrouper la rend simple.
   */
  makeContainer(obj: FabricObject): void {
    if (isContainerObject(obj) || !rulesOf(obj).hosts) return;
    const tl = topLeft(obj);
    const { w, h } = scaledSize(obj);
    obj.set({ originX: "left", originY: "top" });
    placeTopLeft(obj, tl.x, tl.y);
    updateLayout(obj, {
      sizing: { x: "hug", y: "hug", minSize: { w, h } },
      container: { padding: uniformPadding(MIN_PAD) },
    });
    this.changed();
  }

  /** Cross-axis alignment of one child in its stack. */
  setAlignSelf(obj: FabricObject, value: string): void {
    this.editChild(obj, { alignSelf: value as AlignSelf });
  }

  /** Space between the children of a stack. */
  setGap(obj: FabricObject, value: number): void {
    this.editContainer(obj, { gap: Math.max(0, value) });
  }

  /** Direction of a stack. */
  setFlexDirection(obj: FabricObject, direction: "column" | "row"): void {
    this.editContainer(obj, { flexDirection: direction });
  }

  /** Cross-axis alignment of a stack's children. */
  setAlignItems(obj: FabricObject, value: string): void {
    this.editContainer(obj, { alignItems: value as AlignItems });
  }

  /** Main-axis distribution of a stack's children. */
  setJustifyContent(obj: FabricObject, value: string): void {
    this.editContainer(obj, { justifyContent: value as JustifyContent });
  }

  // ── External drag API ──────────────────────────────────────────────
  //
  // These methods let an external drag source (e.g. DropHandler during
  // an HTML drag) drive the same DTL state machine that object:moving
  // normally drives. The source object does NOT need to be on the canvas
  // yet — it will be added automatically when the session anchors.

  /**
   * Advance the DTL state machine for an externally-dragged object.
   * Call this on every dragover frame with the source object and the
   * cursor position in scene coordinates.
   *
   * The source's position is updated to follow the cursor.
   */
  tickExternalDrag(source: FabricObject, cursor: { x: number; y: number }): void {
    this.drag.tick(source, cursor);
  }

  /**
   * Commit the current DTL session from an external drag.
   * Call this on drop. No-op if no session is active (the caller should
   * handle the "simple add" case itself).
   *
   * Returns true if a session was committed, false otherwise.
   */
  commitExternalDrag(): boolean {
    return this.drag.commit();
  }

  /**
   * Rollback any in-progress DTL state from an external drag.
   * Call this on dragleave / cancel. Rolls back the session if anchored,
   * clears timers otherwise. The caller owns the source object and is
   * responsible for removing it from the canvas.
   */
  rollbackExternalDrag(): void {
    this.drag.rollback();
  }

  /** Whether the DTL state machine is currently in ANCHORED phase. */
  get isAnchored(): boolean {
    return this.drag.isAnchored;
  }

  /** Clean up event listeners. */
  dispose(): void {
    this.drag.reset();
    this.canvas.off("object:moving", this.onMovingBound);
    this.canvas.off("object:modified", this.onModifiedBound);
    this.canvas.off("object:resizing", this.onResizingBound);
    this.canvas.off("text:changed", this.onTextChangedBound);
    this.canvas.off("before:transform", this.onBeforeTransformBound);
  }

  // ── Event wiring ──────────────────────────────────────────────────

  private onMovingBound = (e: any) => this.onMoving(e);
  private onModifiedBound = (e: any) => this.onModified(e);
  private onResizingBound = (e: any) => this.onResizing(e);
  private onTextChangedBound = (e: any) => this.onTextChanged(e);
  private onBeforeTransformBound = (e: any) => this.onBeforeTransform(e);

  private setupEventListeners(): void {
    this.canvas.on("object:moving", this.onMovingBound);
    this.canvas.on("object:modified", this.onModifiedBound);
    this.canvas.on("object:resizing", this.onResizingBound);
    this.canvas.on("text:changed", this.onTextChangedBound);
    this.canvas.on("before:transform", this.onBeforeTransformBound);
  }

  // ── Canvas event handlers ─────────────────────────────────────────

  private onMoving(e: any): void {
    const obj = e.target;

    // Plusieurs objets déplacés : pas de dépôt dans un container (une session ne prend
    // qu'un enfant), leurs descendants suivent
    if (obj instanceof ActiveSelection) {
      this.moveFollowers(obj, obj.getObjects(), e.transform);
      return;
    }

    const layout = layoutOf(obj);

    // Container being dragged → reposition its children (not the full canvas,
    // otherwise runLayout would snap this container back to its flex position
    // if it's also a child of another container).
    if (layout?.container) {
      const isSessionChild = this.drag.sessionChild === obj;
      if (isFreeContainer(obj)) {
        // A group's content follows it, untouched
        this.moveFollowers(obj, [obj], e.transform);
      } else if (!isSessionChild) {
        layoutSubtree(obj, this.canvas.getObjects());
        this.canvas.renderAll();
      }
      // Don't return — the container can also be dragged into another shape
    }

    // Child of a group, moved inside it: it goes where it is put, the group's box follows
    if (layout?.child && !this.drag.isAnchored) {
      const parent = parentContainerOf(obj, this.canvas.getObjects());
      if (parent && isFreeContainer(parent)) {
        fitFreeAncestors(parent, this.canvas.getObjects());
        this.canvas.renderAll();
        return;
      }
    }

    // Child dragged inside its entered container → start reattach session
    if (layout?.child && !this.drag.isAnchored) {
      const entered = this.callbacks.getEnteredContainerId?.();
      if (entered === layout.child.parentId) {
        const container = findById(this.canvas.getObjects(), entered);
        if (container) {
          const cursor = this.canvas.getScenePoint(e.e);
          this.drag.startReattach(container, obj, cursor);
        }
        return;
      }
    }

    // Already-attached child outside its entered container → ignore
    if (layout?.child && !this.drag.isAnchored) return;

    this.drag.move(obj, this.canvas.getScenePoint(e.e));
  }

  /**
   * Les descendants des objets déplacés (un groupe, ou les objets d'une sélection multiple
   * — jamais dans la sélection, cf. SelectionManager) suivent la translation de `target`
   * depuis le début du geste. Sans relayout : dans une sélection, les positions des
   * containers sont relatives à elle.
   */
  private moveFollowers(target: FabricObject, moved: FabricObject[], transform: any): void {
    if (!this.followers || this.followers.transform !== transform) {
      this.followers = SubtreeDrag.begin(target, moved, transform, this.canvas.getObjects());
    }
    this.followers.follow(target);
  }

  /** Le début d'une transformation : un groupe qu'on redimensionne garde son état de départ. */
  private onBeforeTransform(e: any): void {
    const target = e.transform?.target;
    this.freeResize = null;
    if (!target || !isFreeContainer(target) || e.transform.action !== "resizing") return;
    this.freeResize = FreeResizeSession.begin(target, this.canvas.getObjects());
  }

  /** A text inside a container was edited → its ancestors adapt. */
  private onTextChanged(e: any): void {
    const layout = layoutOf(e.target);
    if (!layout?.child) return;
    this.changed();
  }

  private onModified(e: any): void {
    const obj = e.target;

    // Le magnétisme a pu décaler l'objet après le dernier object:moving
    if (this.followers) {
      const moved = obj instanceof ActiveSelection ? obj.getObjects() : [obj];
      this.moveFollowers(obj, moved, this.followers.transform);
    }
    this.followers = null;

    if (obj instanceof ActiveSelection) {
      this.drag.reset();
      return;
    }

    // A group resized, or something moved / resized inside a group: everything settles
    const parent = parentContainerOf(obj, this.canvas.getObjects());
    const resizedGroup = this.freeResize;
    this.freeResize = null;
    if (this.drag.isIdle && (resizedGroup || (parent && isFreeContainer(parent)))) {
      this.changed();
      return;
    }

    // Text child resized → its container settles (outside any drag session)
    const childLayout = layoutOf(obj);
    if (childLayout?.child && isTextObject(obj) && this.drag.isIdle &&
        e.transform?.action === "resizing") {
      this.changed();
      return;
    }

    // Container modified → its resize session ends, then relayout
    const layout = layoutOf(obj);
    if (layout?.container) {
      this.resizeSession = null;
      this.changed();
      // Don't return if we have an active dtl session — fall through to commit it
      if (!this.drag.isArmed) return;
    }

    this.drag.release(obj, this.canvas.getScenePoint(e.e));
  }

  private onResizing(e: any): void {
    const target = e.target;
    const layout = layoutOf(target);

    // Text, shape or image child resized live → the room stops it (a text is
    // pushed by the layout itself), and its container chain follows
    if (layout?.child && !layout.container) {
      const objects = this.canvas.getObjects();
      const parent = parentContainerOf(target, this.canvas.getObjects());
      // In a group, there is no room to respect: the group follows
      if (parent && isFreeContainer(parent)) {
        fitFreeAncestors(parent, this.canvas.getObjects());
        this.canvas.renderAll();
        return;
      }
      if (!isTextObject(target)) clampToRoom(target, e.transform, objects);
      const pLayout = layoutOf(parent);
      if (parent && pLayout?.container) {
        layoutSubtree(parent, objects);
        relayoutAncestors(parent, objects);
        this.canvas.renderAll();
      }
      return;
    }

    if (!layout?.container) return;

    // A group: its content absorbs the resize, uniformly, around the fixed corner
    const groupResize = this.freeResize;
    if (groupResize && groupResize.container === target) {
      groupResize.step(e.transform);
      this.canvas.renderAll();
      return;
    }

    // Create session on first resizing frame
    if (!this.resizeSession) {
      this.resizeSession = new StackResizeSession(target, e.transform?.corner);
    }

    this.resizeSession.handleResizing(this.canvas.getObjects());
    this.canvas.renderAll();
  }
}
