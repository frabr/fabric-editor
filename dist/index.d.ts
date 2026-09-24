import * as _fabric from '#fabric';
import { Canvas, FabricObject, TPointerEvent, Textbox, Group, FabricImage, StaticCanvas, Pattern, Rect, TOptions, RectProps, Circle, CircleProps, Path, PathProps } from '#fabric';

/**
 * DesignCanvas — wraps a Fabric Canvas to separate design size from display size.
 *
 * `width` and `height` always return the logical design dimensions.
 * The underlying Fabric Canvas buffer may be a different size (after fitToSize).
 *
 * Access the raw Fabric Canvas via `originalFabricCanvas` — the verbose name
 * is intentional: prefer using delegation methods when possible.
 */

declare class DesignCanvas {
    readonly width: number;
    readonly height: number;
    readonly originalFabricCanvas: Canvas;
    private _scale;
    constructor(canvasElement: HTMLCanvasElement, opts: {
        width: number;
        height: number;
    } & Record<string, any>);
    /** Current viewport scale factor (set by fitToSize). */
    get scale(): number;
    /**
     * Resize the canvas buffer to fit a container and scale content
     * via Fabric's viewportTransform. Returns the computed scale.
     */
    fitToSize(containerW: number, containerH: number, userZoom?: number): number;
    /**
     * Shift the active drag's grab offset by (dx, dy).
     *
     * During a drag, Fabric places the object at `cursor + offset`.
     * Adjusting the offset "teleports" the object without breaking
     * the drag delta calculation.
     */
    adjustGrabOffset(dx: number, dy: number): void;
    getObjects(): FabricObject[];
    add(...objects: FabricObject[]): void;
    insertAt(index: number, ...objects: FabricObject[]): void;
    remove(...objects: FabricObject[]): void;
    renderAll(): void;
    requestRenderAll(): void;
    on(eventName: string, handler: (...args: any[]) => void): void;
    off(eventName: string, handler?: (...args: any[]) => void): void;
    getActiveObject(): FabricObject | null;
    setActiveObject(obj: FabricObject): void;
    discardActiveObject(): void;
    getScenePoint(e: TPointerEvent): {
        x: number;
        y: number;
    };
    setDimensions(dims: {
        width: number;
        height: number;
    }): void;
    bringObjectForward(obj: FabricObject, intersecting?: boolean): void;
    sendObjectBackwards(obj: FabricObject): void;
    moveObjectTo(obj: FabricObject, index: number): void;
    getZoom(): number;
    setZoom(zoom: number): void;
    toDataURL(opts?: any): string;
    clear(): void;
    dispose(): void;
    set backgroundColor(color: string);
    get backgroundColor(): string;
    set renderOnAddRemove(value: boolean);
    get renderOnAddRemove(): boolean;
}

/**
 * Textbox personnalisé qui :
 * 1. Place le textarea caché à l'intérieur du canvas container (pour le focus dans les modales)
 * 2. Force sa position à (0, 0) pour éviter les problèmes de layout/scroll
 *
 * Hérite de Textbox (et non IText) pour le line-wrapping natif
 * quand une width fixe est définie (mode layout "largeur fixe").
 *
 * Nécessaire car les modales (dialog) avec showModal() créent un
 * "focus trap" qui empêche le focus d'aller sur des éléments
 * en dehors du dialog. En plaçant le textarea dans le canvas
 * container (qui est dans le dialog), il peut recevoir le focus.
 */
type WordEntry = {
    word: string[];
    width: number;
    _isChunk?: boolean;
};
type GraphemeData = {
    largestWordWidth: number;
    wordsData: WordEntry[][];
};
declare class CustomTextbox extends Textbox {
    /**
     * Auto-width mode : le textbox s'étend horizontalement au contenu.
     * Désactivé automatiquement quand l'utilisateur resize manuellement.
     */
    _autoWidth: boolean;
    constructor(text: string, options?: Record<string, unknown>);
    /** Dernière width calculée par le mode auto-width. */
    private _autoWidthValue;
    /**
     * Override initDimensions : en mode auto-width, on calcule les dimensions
     * avec une width infinie puis on ajuste width au résultat.
     * Si la width entrante diffère de notre dernière valeur auto, c'est un
     * resize externe → on désactive auto-width.
     */
    initDimensions(): void;
    /**
     * overflow-wrap: break-word — pré-découpe les mots trop longs
     * en chunks et les marque pour que _wrapLine ne mette pas
     * d'espace entre eux.
     */
    getGraphemeDataForRender(lines: string[]): GraphemeData;
    /**
     * Copie fidèle de Textbox._wrapLine, sauf :
     * - pas d'espace (infix) entre les chunks d'un même mot (_isChunk)
     * - pas d'incrément d'offset pour l'espace entre chunks
     */
    _wrapLine(lineIndex: number, desiredWidth: number, { largestWordWidth, wordsData }: GraphemeData, reservedSpace?: number): string[][];
    /**
     * Fix curseur : missingNewlineOffset retourne toujours 1 en mode
     * non-splitByGrapheme car Fabric suppose que chaque wrap mange un
     * espace. Pour les coupures mid-word, il n'y a pas d'espace → 0.
     */
    missingNewlineOffset(lineIndex: number, skipWrapping?: boolean): 0 | 1;
    /**
     * Override pour ajouter le textarea au canvas container
     * au lieu du body (comportement par défaut de Fabric.js).
     */
    initHiddenTextarea(): void;
    /**
     * Override de la méthode de positionnement du textarea caché.
     * On force la position à (0, 0) pour éviter les problèmes de layout
     * quand le textarea est dans le canvas container.
     */
    _calcTextareaPosition(): {
        left: string;
        top: string;
        fontSize: string;
        charHeight: number;
    };
}

/**
 * Modes de verrouillage pour les calques
 * - free: libre (défaut) - peut bouger et changer le contenu
 * - position: position verrouillée, contenu modifiable
 * - full: position ET contenu verrouillés
 */
type LockMode$1 = "free" | "position" | "full";
/**
 * Récupère le mode de verrouillage d'un objet
 */
declare function getLockMode(obj: FabricObject): LockMode$1;
/**
 * Retourne le prochain mode dans le cycle free -> position -> full -> free
 */
declare function getNextLockMode(currentMode: LockMode$1): LockMode$1;
/**
 * Applique un mode de verrouillage à un objet Fabric
 *
 * - free: contrôles actifs, peut bouger et changer le contenu/style
 * - position: pas de contrôles, ne peut pas bouger, mais peut changer le contenu (texte éditable, pas le style)
 * - full: pas de contrôles, ne peut ni bouger ni changer le contenu
 */
declare function applyLockMode(obj: FabricObject, mode: LockMode$1): void;
/**
 * Vérifie si le style (police, couleur) d'un objet est verrouillé
 * Le style n'est modifiable qu'en mode free
 */
declare function isStyleLocked(obj: FabricObject): boolean;
/**
 * Vérifie si le contenu d'un objet est verrouillé (mode full)
 */
declare function isContentLocked(obj: FabricObject): boolean;
/**
 * Vérifie si la position d'un objet est verrouillée (mode position ou full)
 */
declare function isPositionLocked(obj: FabricObject): boolean;

/**
 * Layout system types — Flexbox model backed by Yoga.
 *
 * Every participating Fabric object carries a single `layout: LayoutData`
 * property with two independent, optional blocks:
 *
 * - `container`: present when the object has children (is a parent)
 * - `child`: present when the object is inside another container
 *
 * Both can coexist — a nested container is both a parent and a child.
 *
 * Outside a container, objects are positioned absolutely by Fabric.
 * Inside a container, objects follow Flexbox rules (Yoga engine).
 */
/**
 * Size mode per axis:
 * - "hug": container adapts to content
 * - "fixed": container keeps its size, content must adapt (shrink/clip)
 */
type SizeMode = "hug" | "fixed";
/** Cross-axis alignment for a single child (maps to Yoga alignSelf). */
type AlignSelf = "auto" | "stretch" | "flex-start" | "flex-end" | "center";
/** Main-axis distribution (maps to Yoga justifyContent). */
type JustifyContent = "flex-start" | "flex-end" | "center" | "space-between" | "space-around";
/** Cross-axis alignment for all children (maps to Yoga alignItems). */
type AlignItems = "stretch" | "flex-start" | "flex-end" | "center";
/** Flex direction (maps to Yoga flexDirection). */
type FlexDirection = "column" | "row";
/** "I am a parent" — present when the object has children. */
interface ContainerData {
    sizeMode: {
        x: SizeMode;
        y: SizeMode;
    };
    /** Minimum size set by manual resize. Container never shrinks below this. */
    minSize?: {
        w: number;
        h: number;
    };
    /** Overflow behavior when content exceeds fixed size. */
    overflow?: "clip" | "shrink";
    /** Flex direction: column (vertical, default) or row (horizontal). */
    flexDirection?: FlexDirection;
    /** Gap between children in the main axis direction (pixels). */
    gap?: number;
    /** Padding between container edges and children. */
    padding?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    /** Cross-axis alignment for children (default: "flex-start"). */
    alignItems?: AlignItems;
    /** Main-axis distribution (default: "flex-start"). */
    justifyContent?: JustifyContent;
}
/** "I am a child" — present when the object is inside a container. */
interface ChildData {
    parentId: string;
    /** Override the container's alignItems for this child. */
    alignSelf?: AlignSelf;
    /** How much this child grows to fill remaining space (default: 0). */
    flexGrow?: number;
    /** Position in the flex flow (lower = earlier). Children without order go by insertion order. */
    order?: number;
}
/** The `layout` property on any participating Fabric object. */
interface LayoutData {
    container?: ContainerData;
    child?: ChildData;
}
/** Resolved child: a Fabric object paired with its ChildData. */
interface ResolvedChild {
    obj: _fabric.FabricObject;
    cl: ChildData;
}
declare function isContainer(l: LayoutData): boolean;
declare function isChild(l: LayoutData): boolean;
/** @deprecated Use `layout.container != null` instead. */
type ContainerLayout = LayoutData & {
    container: ContainerData;
};
/** @deprecated Use `layout.child != null` instead. */
type ChildLayout = ChildData;
/** @deprecated Use `isContainer` instead. */
declare function isContainerLayout(l: LayoutData): boolean;
/** @deprecated Use `isChild` instead. */
declare function isChildLayout(l: LayoutData): boolean;
/** Common interface for layout sessions (ContainerizeSession, InsertChildSession). */
interface LayoutSession {
    handleMoving(cursor: {
        x: number;
        y: number;
    }): "anchored" | "exited";
    commit(): () => void;
    rollback(): void;
    readonly container: _fabric.FabricObject;
    readonly child: _fabric.FabricObject;
}
/** Minimum padding between a child and its container edges. */
declare const MIN_PAD = 8;
/** Snapshot of shape + text properties before attach, used for rollback. */
interface AttachSnapshot {
    shape: Record<string, any>;
    text: Record<string, any>;
}

/**
 * Layout reconciliation — Flexbox model backed by Yoga.
 *
 * Takes the declared layout state (container/child relationships, size modes,
 * margins, flex props) and resolves concrete positions and dimensions.
 * Idempotent: running it twice on the same state produces the same result.
 *
 * Supports two size modes per axis:
 * - "hug": container adapts to content (bottom-up)
 * - "fixed": container keeps its size, content adapts
 *
 * When X is fixed: text wraps at the available width (Textbox behavior).
 * When both X and Y are fixed: text also shrinks (fontSize) if it overflows.
 *
 * Single pass, deterministic, no solver.
 *
 * Note: user-initiated resize is handled by ResizeSession, not here.
 * This module only handles programmatic relayout (content changes, mode
 * changes, move, etc.).
 */

/**
 * Run the layout pass on the given set of objects.
 * Objects are mutated in-place. This is for programmatic relayout only
 * (content changes, mode/margin/anchor changes, move).
 */
declare function runLayout(objects: FabricObject[]): void;

/**
 * ResizeSession — encapsulates one user-initiated resize interaction.
 *
 * Created by the LayoutManager on the first `object:resizing` event,
 * fed with each subsequent scaling frame, and committed on `object:modified`.
 *
 * Separates the user's resize intent (which axes, what size) from
 * the programmatic layout reconciliation that runs on every frame.
 */

declare class ResizeSession {
    private container;
    private containerData;
    private axes;
    /** User-intended size — only updated on axes the user controls. */
    private userW;
    private userH;
    constructor(container: FabricObject, corner?: string);
    /**
     * Called on each `object:resizing` frame.
     * Controls already set width/height directly (no scale involved).
     */
    handleResizing(objects: FabricObject[]): void;
    /**
     * Called on `object:modified`. Captures minSize from the user's intent.
     */
    commit(objects: FabricObject[]): void;
}

/**
 * Shared geometry helpers for layout computations.
 *
 * Used by both the layout engine (steady-state relayout) and the
 * LayoutManager (drag-to-layout interactions).
 */

/** Scaled dimensions (width × scaleX, height × scaleY). */
declare function scaledSize(obj: FabricObject): {
    w: number;
    h: number;
};
/** Top-left corner in canvas coordinates, regardless of originX/Y. */
declare function topLeft(obj: FabricObject): {
    x: number;
    y: number;
};
/** Hit-test: is a point inside an object's bounding box (with optional margin)? */
declare function pointInObject(point: {
    x: number;
    y: number;
}, obj: FabricObject, margin?: number): boolean;
/**
 * Clamp the top-left of `obj` so it doesn't go above/left of
 * `reference`'s top-left + padding. Returns the clamped position.
 */
declare function clampTopLeft(obj: FabricObject, reference: FabricObject, padding: number): {
    x: number;
    y: number;
};
/**
 * Has a point moved back past a threshold distance from an origin,
 * on the axis/direction where an initial offset was applied?
 *
 * Used to detect when a user "undoes" a clamp by dragging away.
 */
declare function hasExceededOffset(current: {
    x: number;
    y: number;
}, origin: {
    x: number;
    y: number;
}, offsetX: number, offsetY: number, margin: number): boolean;

/**
 * ContainerizeSession — encapsulates the "first attach" interaction.
 *
 * Transforms a plain shape into a layout container when any object (text,
 * shape, or another container) is dragged into it. Establishes padding,
 * size mode, and the initial container/child relationship.
 * Created by the LayoutManager, destroyed after commit or rollback.
 */

declare class ContainerizeSession {
    private canvas;
    private shape;
    private text;
    private snapshot;
    private clampDx;
    private clampDy;
    private anchorCursor;
    /** If true, rollback detaches the child instead of restoring the snapshot. */
    private _isReattach;
    constructor(canvas: DesignCanvas, shape: FabricObject, text: FabricObject, cursor: {
        x: number;
        y: number;
    });
    /**
     * Create a session for repositioning a child that is already attached.
     * Skips layout creation, origin normalization, and clamp/grab offset.
     * On exit (rollback), the child is detached instead of restored.
     */
    static reattach(canvas: DesignCanvas, shape: FabricObject, text: FabricObject, cursor: {
        x: number;
        y: number;
    }): ContainerizeSession;
    /** During drag: clamp text, resize container, check for exit. */
    handleMoving(cursor: {
        x: number;
        y: number;
    }): "anchored" | "exited";
    /** Finalize the attach. Returns a cleanup function for the "changed" listener. */
    commit(): () => void;
    /** Undo anchor: restore snapshot, reverse grab offset. */
    rollback(): void;
    /** The shape this session is attached to (for guide rendering). */
    get container(): FabricObject;
    /** The text being attached (for guide rendering). */
    get child(): FabricObject;
    private shouldExit;
}
/** Resize container to wrap around its child, updating padding from current position. */
declare function wrapContainerAroundChild(child: FabricObject, container: FabricObject): void;

/**
 * InsertChildSession — encapsulates adding a child to an existing container.
 *
 * Unlike ContainerizeSession (which transforms a shape into a container),
 * this session adds an additional child into a container that already has
 * children.
 *
 * Design principle: the SESSION controls all decisions (direction, order,
 * margins). Yoga is used only as a "calculator" — we ask it to preview
 * where children would go given the current parameters, and we apply
 * the result only to the OTHER children (not the one being dragged).
 * The dragged child stays under the cursor. No feedback loops.
 *
 * Key behavior when inserting the **second** child:
 * - The container's flexDirection is undecided at this point.
 * - Cursor position relative to the existing child determines direction:
 *   above/below → column, left/right → row.
 * - This is re-evaluated on every drag frame.
 *
 * For containers that already have a direction (3rd child+), the cursor
 * determines insertion order (before/after existing children).
 */

declare class InsertChildSession implements LayoutSession {
    private canvas;
    private _container;
    private newChild;
    private snapshot;
    /** Whether this is a reattach (repositioning existing child) vs new insertion. */
    private _isReattach;
    /** Whether this insertion is deciding the container's flex direction (2nd child). */
    private _decidingDirection;
    /** Current decided direction — cached for hysteresis. null = not yet decided. */
    private _currentDirection;
    /** Animator for smooth sibling/child transitions. */
    private _animator;
    /** Sibling positions at anchor time — stable reference for gap calculation. */
    private _siblingAnchors;
    /** Last Yoga-computed position of the dragged child (not the cursor position). */
    private _lastDraggedYogaPos;
    constructor(canvas: DesignCanvas, container: FabricObject, newChild: FabricObject, cursor: {
        x: number;
        y: number;
    });
    /**
     * Create a session for repositioning a child that is already in the container.
     * On rollback (drag outside), the child is detached from the container.
     */
    static reattach(canvas: DesignCanvas, container: FabricObject, child: FabricObject, cursor: {
        x: number;
        y: number;
    }): InsertChildSession;
    handleMoving(cursor: {
        x: number;
        y: number;
    }): "anchored" | "exited";
    commit(): () => void;
    rollback(): void;
    get container(): FabricObject;
    get child(): FabricObject;
    private shouldExit;
    /**
     * Session decides direction + order from cursor, then asks yoga
     * to preview positions. Only OTHER children are repositioned;
     * the dragged child stays under the cursor.
     */
    private updateFromCursor;
    /**
     * Detect flex direction from cursor position relative to the existing child.
     * The key insight: we measure where the cursor is relative to the child's
     * bounding box edges, not its center. This way "bottom-right of child"
     * correctly detects that dy > dx when the cursor is clearly below.
     *
     * Hysteresis: once a direction is chosen, require a clear margin to switch.
     */
    private detectDirection;
    /** Last computed order — for hysteresis. */
    private _lastOrder;
    /**
     * Compute the insertion order based on cursor position in the main axis.
     * The swap threshold is the **far edge** of each sibling — the dragged
     * child swaps once it fully passes the sibling.
     *
     * Uses anchored sibling positions to avoid feedback loops with Yoga.
     */
    private computeInsertOrder;
    /**
     * Compute the gap between children from the cursor's distance to the
     * nearest neighbor in the main axis. The gap is the space between the
     * cursor and the nearest edge of an existing child, minus the new child's
     * half-size (since the cursor is roughly at the child's center).
     */
    private computeGap;
    /**
     * Ask yoga to compute positions for ALL children including the dragged one.
     * Yoga positions everyone into their flex slots — the dragged child snaps
     * to its computed position. The session controls direction + order, yoga
     * just calculates where things go.
     *
     * Container grows if needed (never shrinks during session).
     */
    private previewLayout;
    /** Snapshot all children positions using animator targets when available. */
    private captureChildPositions;
}

declare function initYoga(): Promise<void>;
declare function isYogaReady(): boolean;
/**
 * Compute layout positions for children within a container using Yoga.
 *
 * Children must be sorted by `order` (lower first, then insertion order).
 * Each child is positioned and its Fabric object is updated in-place.
 *
 * Returns the required container size (for hug mode).
 */
declare function yogaLayout(children: ResolvedChild[], containerLeft: number, containerTop: number, containerW: number, containerH: number, cd: ContainerData): {
    w: number;
    h: number;
};

interface EditorConfig {
    width: number;
    height: number;
    fonts?: FontsConfig;
    defaultColor?: string;
    /** Base color for all visual guides (snap lines, layout margins, hints). */
    guideColor?: string;
    container?: HTMLElement;
    transparent?: boolean;
}
type FontsConfig = Record<string, FontConfig>;
interface FontConfig {
    family: string;
    url: string;
    weight?: string;
}

interface LayerData {
    type: string;
    layerId?: string;
    left?: number;
    top?: number;
    scaleX?: number;
    scaleY?: number;
    angle?: number;
    fill?: string | Record<string, unknown>;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    /** Mode de verrouillage du calque */
    lockMode?: LockMode;
    /** Indique si le contenu (image) est verrouillé */
    lockContent?: boolean;
    /** Layout data (container or child) — see layout/types.ts */
    layout?: LayoutData;
    [key: string]: unknown;
}
interface TextLayerOptions {
    text?: string;
    left?: number;
    top?: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    fill?: string;
    layerId?: string;
}
interface ImageLayerOptions {
    left?: number;
    top?: number;
    scaleX?: number;
    scaleY?: number;
    originX?: "left" | "center" | "right";
    originY?: "top" | "center" | "bottom";
    layerId?: string;
}
interface ShapeLayerOptions {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    layerId?: string;
    shapeType?: ShapeType;
}
type ShapeType = "rect" | "circle" | (string & {});
interface ObjectControlsConfig {
    type: string;
    options: ControlOption[];
}
type ControlOption = "clip" | "color" | "font" | "outline" | "corner_radius";
interface SelectionCallbacks {
    onSelect?: (object: FabricObject) => void;
    onDeselect?: () => void;
    /** Appelé quand une transformation commence (déplacement, rotation, redimensionnement) */
    onTransformStart?: () => void;
    /** Appelé quand une transformation se termine */
    onModified?: (object: FabricObject | null) => void;
}
interface SaveOptions {
    rasterize?: boolean;
    ajaxCall?: boolean;
    form?: HTMLFormElement;
}
interface SaveResult {
    layers: LayerData[];
    dataUrl?: string;
    /** URLs Cloudinary des assets uploadés pendant la sauvegarde */
    uploadedAssets?: string[];
}
declare module "fabric" {
    interface FabricObject {
        layerId?: string;
        layerType?: string;
        layout?: LayoutData;
    }
}

interface ImageFrameOptions {
    left?: number;
    top?: number;
    angle?: number;
    layerId?: string;
    lockMode?: LockMode$1;
    clipShape?: ShapeType;
    /** Corner radius in pixels for "rect" clip shape (0 = sharp corners). */
    cornerRadius?: number;
    imageOffsetX?: number;
    imageOffsetY?: number;
    imageScale?: number;
    /** Scale initial du frame (pour limiter la taille à l'import) */
    frameScale?: number;
    /** Dimensions explicites du frame (prioritaires sur frameScale) */
    frameWidth?: number;
    frameHeight?: number;
}
interface ImageFrameData {
    type: "ImageFrame";
    left: number;
    top: number;
    angle: number;
    scaleX: number;
    scaleY: number;
    frameWidth: number;
    frameHeight: number;
    clipShape?: ShapeType;
    /** Corner radius in pixels (only meaningful when clipShape is "rect"). */
    cornerRadius?: number;
    layerId?: string;
    lockMode?: LockMode$1;
    lockContent?: boolean;
    opacity?: number;
    image: {
        src: string;
        offsetX: number;
        offsetY: number;
        scale: number;
    };
}
/**
 * ImageFrame - Un conteneur pour images avec cadre fixe
 *
 * L'image est toujours contenue dans un cadre (frame) de dimensions fixes.
 * Lors du remplacement d'image, le cadre garde ses dimensions et la nouvelle image
 * s'adapte en mode "cover". Le clipPath s'applique sur le Group entier.
 */
declare class ImageFrame extends Group {
    frameWidth: number;
    frameHeight: number;
    clipShape?: ShapeType;
    /** Corner radius in pixels for "rect" clip shape. 0 = sharp corners. */
    cornerRadius: number;
    private _imageOffsetX;
    private _imageOffsetY;
    private _imageScale;
    private _image;
    constructor(image: FabricImage, options?: ImageFrameOptions);
    get image(): FabricImage;
    get imageSrc(): string;
    get imageOffsetX(): number;
    get imageOffsetY(): number;
    /**
     * Vérifie si l'image peut être repositionnée dans le cadre.
     * Retourne true si l'image déborde du cadre (avec une marge de tolérance).
     * @param tolerancePercent - Marge de tolérance en pourcentage (défaut: 5%)
     */
    canRepositionImage(tolerancePercent?: number): boolean;
    /**
     * Repositionne l'image dans le frame (pan)
     */
    setImageOffset(offsetX: number, offsetY: number): void;
    /**
     * Change le zoom de l'image (min = cover)
     */
    setImageScale(scale: number): void;
    /**
     * Remplace l'image du frame en mode cover
     */
    replaceImage(newImage: FabricImage): void;
    /**
     * Redimensionne le frame (l'image s'adapte en cover)
     */
    resizeFrame(newWidth: number, newHeight: number): void;
    /**
     * Applique une forme de clip au frame
     */
    applyClipShape(shapeType: ShapeType): void;
    /**
     * Cycle vers la forme de clip suivante
     */
    nextClipShape(): void;
    /**
     * Set the corner radius (in pixels) for the "rect" clip shape.
     * Automatically switches to "rect" if another clip shape is active.
     */
    setCornerRadius(radius: number): void;
    private _applyImageOffset;
    private _clampOffset;
    private _applyClip;
    /**
     * Fallback : absorbe le scale si les contrôles natifs sont utilisés
     */
    private _setupScaleAbsorption;
    private _setupControls;
    toObject(propertiesToInclude?: any[]): any;
    static fromObject(data: ImageFrameData): Promise<ImageFrame>;
    /**
     * Convertit une image legacy (FabricImage avec scale/clipPath) en ImageFrame
     * Préserve les dimensions affichées et le clip shape
     */
    static fromLegacyImage(img: FabricImage, options?: {
        clipShape?: ShapeType;
        layerId?: string;
        lockMode?: LockMode$1;
    }): ImageFrame;
}

/**
 * Gère les calques (layers) du canvas Fabric.js
 * Responsable de l'ajout, suppression et organisation des objets
 */
declare class LayerManager {
    private canvas;
    constructor(canvas: DesignCanvas);
    /**
     * Retourne tous les calques (excluant l'image de fond)
     */
    get all(): FabricObject[];
    /**
     * Retourne l'image de fond
     */
    get background(): FabricObject | undefined;
    /**
     * Trouve un calque par son ID
     */
    findById(layerId: string): FabricObject | undefined;
    /**
     * Charge l'image de fond
     */
    loadBackgroundImage(url: string): Promise<FabricImage>;
    /**
     * Charge plusieurs calques depuis leurs données JSON
     */
    loadLayers(layers: LayerData[]): Promise<FabricObject[]>;
    /**
     * Ajoute un objet au canvas et le sélectionne (si interactif)
     */
    add(obj: FabricObject): FabricObject;
    /**
     * Supprime un objet du canvas
     */
    remove(obj: FabricObject): void;
    /**
     * Supprime plusieurs objets
     */
    removeMany(objects: FabricObject[]): void;
    /**
     * Monte l'objet d'un niveau (vers l'avant)
     */
    bringForward(obj: FabricObject): void;
    /**
     * Descend l'objet d'un niveau (vers l'arrière)
     * Ne peut pas descendre en dessous de l'image de fond
     */
    sendBackward(obj: FabricObject): void;
    /**
     * Crée et ajoute un calque texte
     */
    /**
     * Crée un calque texte sans l'ajouter au canvas.
     * Source unique des défauts texte — utilisé par addText et par le
     * drag externe (DropHandler).
     */
    createText(options?: TextLayerOptions): CustomTextbox;
    addText(options?: TextLayerOptions): CustomTextbox;
    /**
     * Crée et ajoute un calque image dans un ImageFrame
     */
    addImage(url: string, options?: ImageLayerOptions): Promise<ImageFrame>;
    /**
     * Crée et ajoute une image simple (legacy, sans frame)
     * Utilisé pour le background ou cas spéciaux
     */
    addImageLegacy(url: string, options?: ImageLayerOptions): Promise<FabricImage>;
    /**
     * Remplace la source d'une image existante en conservant toutes ses propriétés
     * Supporte à la fois ImageFrame et FabricImage legacy
     *
     * @param options.opacity - Opacité à appliquer (utile si target.opacity est temporairement modifiée)
     */
    replaceImageSource(target: ImageFrame | FabricImage, newUrl: string, options?: {
        opacity?: number;
    }): Promise<ImageFrame | FabricImage>;
    /**
     * Remplace la source d'une image legacy (FabricImage sans frame)
     * @internal
     */
    private _replaceImageSourceLegacy;
    /**
     * Remplace une forme (shape) par un ImageFrame contenant l'image donnée.
     * La forme sert de masque : l'image épouse ses dimensions et son clipShape.
     * L'ImageFrame est inséré au même z-index que la forme d'origine.
     */
    replaceShapeWithImage(shape: FabricObject, imageUrl: string): Promise<ImageFrame>;
    /**
     * Crée et ajoute un calque forme (rectangle par défaut)
     */
    /**
     * Crée un calque forme sans l'ajouter au canvas.
     * Source unique des défauts forme — utilisé par addShape et par le
     * drag externe (DropHandler).
     */
    createShape(options?: ShapeLayerOptions): FabricObject;
    addShape(options?: ShapeLayerOptions): FabricObject;
    /**
     * Groupe plusieurs objets ensemble
     */
    groupObjects(objects: FabricObject[]): Group;
    /**
     * Sérialise tous les calques en JSON
     * Inclut les propriétés custom : layerId, lockMode, lockContent
     */
    serialize(): LayerData[];
    /**
     * Désérialise un calque depuis ses données JSON
     * Les images legacy (type "Image") sont automatiquement migrées vers ImageFrame
     */
    deserialize(layer: LayerData): Promise<FabricObject | null>;
    /**
     * Applique un mode de verrouillage à un objet
     * Délègue à la fonction du module locking.ts
     */
    applyLockMode(obj: FabricObject, mode: LockMode$1): void;
    /**
     * Génère un ID unique pour un calque
     */
    private generateId;
    /**
     * Détecte le type de clip depuis un clipPath legacy sérialisé
     */
    private detectLegacyClipShape;
    private detectClipPath;
}

/**
 * Gère la sélection des objets sur le canvas
 */
declare class SelectionManager {
    private canvas;
    private _current;
    private callbacks;
    private isTransforming;
    private _silenced;
    /**
     * When set, we are "inside" a layout group: hover and click target
     * children directly instead of redirecting to the container.
     */
    private _activeGroupId;
    constructor(canvas: DesignCanvas);
    /** The layerId of the container we're currently editing inside, or null. */
    get activeGroupId(): string | null;
    /**
     * L'objet actuellement sélectionné (ou tableau si sélection multiple)
     */
    get current(): FabricObject | null;
    /**
     * Les objets sélectionnés (toujours un tableau)
     */
    get selected(): FabricObject[];
    /**
     * Vérifie si quelque chose est sélectionné
     */
    get hasSelection(): boolean;
    /**
     * Vérifie si c'est une sélection multiple
     */
    get isMultipleSelection(): boolean;
    /**
     * Configure les callbacks de sélection
     */
    setCallbacks(callbacks: SelectionCallbacks): void;
    /**
     * Définit le callback onSelect
     */
    set onSelect(callback: ((obj: FabricObject) => void) | undefined);
    /**
     * Définit le callback onDeselect
     */
    set onDeselect(callback: (() => void) | undefined);
    /**
     * Définit le callback onTransformStart
     */
    set onTransformStart(callback: (() => void) | undefined);
    /**
     * Définit le callback onModified
     */
    set onModified(callback: ((obj: FabricObject | null) => void) | undefined);
    /**
     * Given a Fabric target (the object under the cursor), return the object
     * that should actually be highlighted / selected.
     *
     * - If the target is a layout child and we are NOT inside its group,
     *   redirect to the parent container.
     * - Otherwise return the target as-is.
     */
    resolveTarget(obj: FabricObject): FabricObject;
    /**
     * Retourne les contrôles disponibles pour l'objet sélectionné
     */
    getAvailableControls(): ControlOption[];
    /**
     * Vérifie si un contrôle est disponible pour l'objet sélectionné
     */
    hasControl(control: ControlOption): boolean;
    /**
     * Désélectionne tout et re-rend le canvas
     */
    clear(): void;
    /**
     * Suspend tous les callbacks de sélection (onSelect, onDeselect, etc.).
     * Utilisé par changeShape() qui fait un remove+add synchrone : sans suppression,
     * les contrôleurs externes (toolbox) interpréteraient les événements intermédiaires
     * comme de vraies actions utilisateur.
     */
    silenceCallbacks(): void;
    /**
     * Réactive les callbacks de sélection après une suppression.
     */
    restoreCallbacks(): void;
    /**
     * Sélectionne un objet
     */
    select(obj: FabricObject): void;
    /**
     * Sélectionne un objet par son layerId
     */
    selectByLayerId(layerId: string): boolean;
    /**
     * Configure les écouteurs d'événements du canvas
     */
    private setupListeners;
    /**
     * Intercept mouse:down to manage group-enter / group-exit logic.
     *
     * - Click on an already-selected container → enter the group
     * - Click on an object outside the active group → exit the group
     * - Click on empty canvas → exit the group
     */
    private handleMouseDown;
    /**
     * Gère la création/mise à jour de sélection
     * Les objets verrouillés sont exclus des sélections multiples
     */
    private handleSelection;
    /**
     * Gère la désélection
     */
    private handleDeselection;
    /**
     * Gère le début d'une transformation (déplacement, rotation, redimensionnement)
     * Appelé une seule fois au début de la transformation
     */
    private handleTransformStart;
    /**
     * Gère la fin d'une modification d'objet
     */
    private handleModified;
    /**
     * Nettoie les écouteurs
     */
    dispose(): void;
}

/**
 * Gère les masques appliqués au canvas
 */
declare class MaskManager {
    private canvas;
    constructor(canvas: DesignCanvas);
    /**
     * Vérifie si un masque est appliqué
     */
    get hasMask(): boolean;
    /**
     * Retourne le masque actuel s'il existe
     */
    findMask(): FabricObject | undefined;
    /**
     * Retourne l'image de fond
     */
    private findBackground;
    /**
     * Configure le masque existant (au chargement)
     */
    setup(container: HTMLElement): Promise<void>;
    /**
     * Applique un nouveau masque depuis une URL
     */
    applyMask(maskUrl: string): Promise<FabricImage>;
    /**
     * Retire le masque actuel
     */
    removeMask(): void;
    /**
     * Redimensionne le canvas et l'image de fond pour correspondre au masque
     */
    private cropCanvasToMask;
}

/**
 * Gère les fichiers en attente d'upload vers Cloudinary
 *
 * Permet d'utiliser des blob URLs pendant l'édition et d'uploader
 * tous les fichiers en une seule fois à la sauvegarde.
 */
declare class PendingUploadsManager {
    /** Map blob URL → File original */
    private pending;
    /** Fonction d'upload (injectée pour découplage) */
    private uploadFn;
    /** Compteur pour générer des IDs uniques en environnement Node.js */
    private static nodeIdCounter;
    constructor(uploadFn: (file: File) => Promise<string>);
    /**
     * Ajoute un fichier en attente d'upload
     * @returns URL blob locale utilisable immédiatement
     */
    add(file: File): string;
    /**
     * Vérifie si une URL est un blob en attente
     */
    isPending(url: string): boolean;
    /**
     * Vérifie si des fichiers sont en attente
     */
    hasPending(): boolean;
    /**
     * Nombre de fichiers en attente
     */
    get count(): number;
    /**
     * Upload tous les fichiers en attente vers Cloudinary
     * @returns Map blob URL → Cloudinary URL
     */
    uploadAll(): Promise<Map<string, string>>;
    /**
     * Remplace les blob URLs par les URLs Cloudinary dans un objet JSON
     * @param obj Objet contenant potentiellement des blob URLs (layers, etc.)
     * @param urlMap Map blob URL → Cloudinary URL
     * @returns Nouvel objet avec URLs remplacées
     */
    static replaceUrls<T>(obj: T, urlMap: Map<string, string>): T;
    /**
     * Nettoie toutes les ressources (blob URLs) sans uploader
     * À appeler si l'utilisateur abandonne
     */
    clear(): void;
}

/**
 * Gère la sauvegarde et le chargement des données de l'éditeur
 */
declare class PersistenceManager {
    private canvas;
    private layers;
    private pendingUploads;
    constructor(canvas: DesignCanvas, layers: LayerManager);
    /**
     * Configure le gestionnaire d'uploads en attente
     */
    setPendingUploads(manager: PendingUploadsManager): void;
    /**
     * Sauvegarde l'état actuel de l'éditeur
     *
     * Si des fichiers sont en attente d'upload, ils sont uploadés en parallèle
     * du rendu canvas pour optimiser le temps total.
     */
    save(options?: SaveOptions): Promise<SaveResult>;
    /**
     * Upload les fichiers en attente vers Cloudinary
     */
    private uploadPendingFiles;
    /**
     * Rasterise le canvas en image base64
     */
    rasterize(): Promise<string>;
    /**
     * Compacte le canvas autour des calques (pour le mode standalone)
     *
     * Calcule le bounding box manuellement sans Group, car Fabric.js 7
     * transforme les coordonnées des enfants en relatif au centre du groupe.
     */
    compactAroundLayers(): void;
    /**
     * Exporte les données des calques en JSON
     */
    exportLayersJSON(): string;
    /**
     * Importe des calques depuis du JSON
     */
    importLayersJSON(json: string): Promise<void>;
    /**
     * Réinitialise l'éditeur (supprime tous les calques sauf le fond)
     */
    reset(): void;
}

interface HistoryState {
    canUndo: boolean;
    canRedo: boolean;
}
interface HistoryCallbacks {
    /** Appelé quand l'état undo/redo change */
    onStateChange?: (state: HistoryState) => void;
}
/**
 * Gère l'historique des modifications pour undo/redo
 *
 * Utilise une approche "snapshot" : à chaque modification,
 * l'état complet des calques est sérialisé et stocké.
 */
declare class HistoryManager {
    private canvas;
    private layers;
    private stack;
    private index;
    private maxSize;
    private callbacks;
    private isRestoring;
    constructor(canvas: DesignCanvas, layers: LayerManager, options?: {
        maxSize?: number;
    });
    /**
     * Configure les callbacks
     */
    setCallbacks(callbacks: HistoryCallbacks): void;
    /**
     * Définit le callback onStateChange
     */
    set onStateChange(callback: ((state: HistoryState) => void) | undefined);
    /**
     * Vérifie si on peut annuler
     */
    get canUndo(): boolean;
    /**
     * Vérifie si on peut refaire
     */
    get canRedo(): boolean;
    /**
     * Retourne l'état actuel
     */
    get state(): HistoryState;
    /**
     * Enregistre l'état actuel dans l'historique
     * Appelé après chaque modification
     */
    push(): void;
    /**
     * Annule la dernière modification (Ctrl+Z)
     * @returns true si l'annulation a réussi
     */
    undo(): Promise<boolean>;
    /**
     * Refait la dernière modification annulée (Ctrl+Y / Ctrl+Shift+Z)
     * @returns true si le redo a réussi
     */
    redo(): Promise<boolean>;
    /**
     * Réinitialise l'historique
     * Utile après un chargement initial ou une sauvegarde
     */
    clear(): void;
    /**
     * Initialise l'historique avec l'état actuel
     * À appeler après le chargement initial des calques
     */
    initialize(): void;
    /**
     * Restaure l'état à l'index actuel
     */
    private restore;
    /**
     * Notifie les callbacks du changement d'état
     */
    private notifyStateChange;
}

interface SnappingConfig {
    /** Distance en pixels pour déclencher le snap (défaut: 10) */
    threshold?: number;
    /** Activer le snap au centre du canvas (défaut: true) */
    snapToCenter?: boolean;
    /** Activer le snap aux bords du canvas (défaut: true) */
    snapToEdges?: boolean;
}
interface SnapGuide {
    orientation: "horizontal" | "vertical";
    position: number;
}
interface ResizeSnapResult {
    /** Nouvelle largeur ajustée (ou null si pas de snap horizontal) */
    width: number | null;
    /** Nouvelle hauteur ajustée (ou null si pas de snap vertical) */
    height: number | null;
    /** Guides actifs à afficher */
    guides: SnapGuide[];
}
/**
 * Gère le snapping (aimantage) des objets sur le canvas.
 *
 * Permet aux objets de s'aligner automatiquement sur :
 * - Le centre horizontal/vertical du canvas
 * - Les bords du canvas
 */
declare class SnappingManager {
    private canvas;
    private config;
    private guides;
    private enabled;
    private snapState;
    private resizeSnapState;
    /** Multiplicateur pour le seuil de sortie du snap (défaut: 2x le seuil d'entrée) */
    private exitMultiplier;
    constructor(canvas: DesignCanvas, config?: SnappingConfig, guideColor?: string);
    /**
     * Active ou désactive le snapping
     */
    setEnabled(enabled: boolean): void;
    /**
     * Retourne si le snapping est activé
     */
    isEnabled(): boolean;
    /**
     * Met à jour la configuration
     */
    updateConfig(config: Partial<SnappingConfig>): void;
    private setupEventListeners;
    private handleObjectMoving;
    private handleObjectScaling;
    private updateGuides;
    /**
     * Calcule le snap pendant le redimensionnement d'un objet
     *
     * @param bounds - Les bords de l'objet (left, top, right, bottom)
     * @param changeX - Direction du resize horizontal (-1 = gauche, 1 = droite, 0 = pas de changement)
     * @param changeY - Direction du resize vertical (-1 = haut, 1 = bas, 0 = pas de changement)
     * @param pointer - Position actuelle du pointeur
     * @returns Les dimensions ajustées et les guides à afficher
     */
    calculateResizeSnap(bounds: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }, changeX: -1 | 0 | 1, changeY: -1 | 0 | 1, pointer: {
        x: number;
        y: number;
    }): ResizeSnapResult;
    /**
     * Réinitialise l'état du snap de resize (à appeler quand le resize est terminé)
     */
    resetResizeSnap(): void;
    /**
     * Nettoie les ressources
     */
    dispose(): void;
}

interface LayoutManagerCallbacks {
    /** Called after a layout relationship is committed (drag-to-layout or panel edit). */
    onLayoutCreated?: () => void;
    /** Called after any layout change (relayout, margin/anchor/mode change). */
    onLayoutChanged?: () => void;
    /** Returns the active group layerId if we're in group-edit mode, null otherwise. */
    getActiveGroupId?: () => string | null;
}
/**
 * Manages layout relationships between canvas objects.
 *
 * Two responsibilities:
 * 1. **Drag-to-layout**: when a text is dragged over a shape, creates a
 *    container/child layout relationship after a short delay, with live
 *    preview, rollback support, and visual guides.
 * 2. **Automatic relayout**: keeps container/child dimensions in sync
 *    when text content changes or containers are moved/resized.
 */
declare class LayoutManager {
    private canvas;
    private callbacks;
    private guides;
    private dtl;
    private resizeSession;
    constructor(canvas: DesignCanvas, callbacks?: LayoutManagerCallbacks, guideColor?: string);
    /** Set or update callbacks after construction (merges with existing). */
    setCallbacks(callbacks: LayoutManagerCallbacks): void;
    /** Run layout on all canvas objects (programmatic relayout). */
    relayout(): void;
    /** Update layout mode on the currently selected container. */
    setMode(obj: FabricObject, mode: "hug" | "hug-y" | "fixed"): void;
    /** Update padding on a container. */
    setPadding(obj: FabricObject, side: string, value: number): void;
    /** Update alignSelf on a child layout object. */
    setAlignSelf(obj: FabricObject, value: string): void;
    /** Update gap on a container. */
    setGap(obj: FabricObject, value: number): void;
    /** Update flex direction on a container. */
    setFlexDirection(obj: FabricObject, direction: "column" | "row"): void;
    /** Update alignItems on a container. */
    setAlignItems(obj: FabricObject, value: string): void;
    /** Update justifyContent on a container. */
    setJustifyContent(obj: FabricObject, value: string): void;
    /**
     * Advance the DTL state machine for an externally-dragged object.
     * Call this on every dragover frame with the source object and the
     * cursor position in scene coordinates.
     *
     * The source's position is updated to follow the cursor.
     */
    tickExternalDrag(source: FabricObject, cursor: {
        x: number;
        y: number;
    }): void;
    /**
     * Commit the current DTL session from an external drag.
     * Call this on drop. No-op if no session is active (the caller should
     * handle the "simple add" case itself).
     *
     * Returns true if a session was committed, false otherwise.
     */
    commitExternalDrag(): boolean;
    /**
     * Rollback any in-progress DTL state from an external drag.
     * Call this on dragleave / cancel. Rolls back the session if anchored,
     * clears timers otherwise. The caller owns the source object and is
     * responsible for removing it from the canvas.
     */
    rollbackExternalDrag(): void;
    /** Whether the DTL state machine is currently in ANCHORED phase. */
    get isAnchored(): boolean;
    /** Clean up event listeners. */
    dispose(): void;
    private onMovingBound;
    private onModifiedBound;
    private onResizingBound;
    private setupEventListeners;
    private onMoving;
    private onModified;
    private onResizing;
    private handleIdleMoving;
    private handleHoveringMoving;
    private startHovering;
    /** HOVERING timer fired → show guides and move to PENDING. */
    private promoteToPending;
    private handlePendingMoving;
    private startPending;
    /** PENDING timer fired → create a session and move to ANCHORED. */
    private promoteToAnchored;
    private handleAnchoredMoving;
    /**
     * Walk down from `root` to find the deepest drop target under the
     * cursor. Returns `root` itself if no children qualify.
     */
    private findDeepestDropTarget;
    /**
     * Among the children of `container`, find the first one under the cursor
     * that is itself a valid drop target — a shape (not text) that could
     * become a container.
     */
    private findChildDropTarget;
    /** Find the parent container of `obj` by looking up its `child.parentId`. */
    private findParentContainer;
    /** Transition to ANCHORED: create a session on the target and go live. */
    private anchorOn;
    /** Create the appropriate session type for a target container. */
    private createSession;
    private doCommit;
    private resetToIdle;
    private showSessionGuides;
    private findShapeUnderPoint;
}

/**
 * Éditeur d'images basé sur Fabric.js
 *
 * Coordonne les différents managers pour fournir une API unifiée
 * pour l'édition d'images avec calques.
 */
declare class FabricEditor {
    readonly canvas: DesignCanvas;
    readonly layers: LayerManager;
    readonly selection: SelectionManager;
    readonly masks: MaskManager;
    readonly persistence: PersistenceManager;
    readonly history: HistoryManager;
    readonly snapping: SnappingManager;
    readonly layout: LayoutManager;
    private config;
    private _displayScale;
    private _userZoom;
    private _resizeObserver;
    private _resizeCallbacks;
    /** Largeur de l'artboard en coordonnées scène. */
    get width(): number;
    /** Hauteur de l'artboard en coordonnées scène. */
    get height(): number;
    constructor(canvasElement: HTMLCanvasElement, config: EditorConfig);
    private _initialized;
    /**
     * Async initialization: loads fonts from config if present.
     * Idempotent — safe to call multiple times.
     */
    init(): Promise<void>;
    /**
     * Register a callback to be called after each container resize (and initial fit).
     */
    onResize(callback: () => void): void;
    /**
     * Clear all layers, ensure fonts are loaded, load new layers, and render.
     * Single entry point for both initial load and undo/redo restore.
     */
    replaceAllLayers(layers: LayerData[]): Promise<void>;
    /**
     * Current CSS scale applied by fitToContainer.
     */
    get displayScale(): number;
    /**
     * Resize the canvas buffer to fit inside its container and use
     * Fabric's viewportTransform to scale the content.
     *
     * This avoids CSS `transform: scale()` which causes sub-pixel blur.
     * The canvas buffer matches the display size exactly → pixel-perfect.
     */
    fitToContainer(): number;
    /**
     * Set user zoom level (1 = fit to container, >1 = zoom in).
     * Re-runs fitToContainer to apply the new scale.
     */
    setUserZoom(zoom: number): void;
    get userZoom(): number;
    /**
     * Observe the container for size changes and automatically re-fit.
     * Called automatically by init() when a container is configured.
     */
    private observeResize;
    /**
     * Returns positioning config for external controls (e.g. FabricControls).
     *
     * @param anchorEl - The positioned ancestor in which controls live.
     *                   Typically the flex-centering wrapper around the canvas box.
     */
    getControlsConfig(anchorEl: HTMLElement): {
        getContainer: () => HTMLElement;
        getDisplayScale: () => number;
        getCanvasOffset: () => {
            left: number;
            top: number;
        };
    };
    /**
     * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
     * Utilise le displayScale mis à jour par fitToContainer.
     */
    canvasToDisplayCoords(rect: {
        left: number;
        top: number;
        width: number;
        height: number;
    }): {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    /**
     * Positionne un élément HTML par-dessus un objet Fabric.
     *
     * @param element - L'élément HTML à positionner (doit être dans le DOM, dans le container)
     * @param obj - L'objet Fabric sur lequel positionner l'élément
     * @param options.anchor - Point d'ancrage : "center", "top", "bottom", "left", "right"
     * @param options.offset - Espacement en pixels entre l'élément et l'objet (défaut: 0)
     * @param options.autoFlip - Bascule automatiquement top↔bottom ou left↔right si pas assez d'espace,
     *                           et passe à l'intérieur si pas de place des deux côtés (défaut: false)
     * @param options.clampToContainer - Contraint la position finale aux limites du container (défaut: false)
     */
    positionElementOverObject(element: HTMLElement, obj: FabricObject, options?: {
        anchor?: "center" | "top" | "bottom" | "left" | "right";
        offset?: number;
        autoFlip?: boolean;
        clampToContainer?: boolean;
    }): void;
    /**
     * Returns the bounding rect of a Fabric object as rounded pixel coordinates.
     */
    getObjectBounds(obj: FabricObject): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /**
     * Enable or disable canvas interactivity.
     * When disabled, discards selection and marks the canvas as non-interactive.
     * When enabled, discards selection (clean state) and optionally syncs visibility.
     */
    setInteractive(enabled: boolean): void;
    /**
     * Initialise l'éditeur avec une image de fond et des calques optionnels
     */
    initialize(backgroundImageUrl: string, layers?: LayerData[]): Promise<void>;
    /**
     * Charge les polices personnalisées.
     * Une police qui échoue (URL morte, CORS…) est ignorée avec un warning :
     * le texte retombe sur la police par défaut au lieu de bloquer tout le rendu.
     */
    loadFonts(fonts: FontsConfig): Promise<void>;
    /**
     * @legacy Use ImageFrame.nextClipShape() directly.
     */
    switchClip(): void;
    /**
     * @legacy Shape switching is no longer supported.
     */
    switchShape(): void;
    /**
     * @legacy Shape switching is no longer supported.
     */
    changeShape(shapeType: ShapeType): void;
    /**
     * Bascule entre remplissage et contour pour l'objet sélectionné
     */
    toggleOutline(): void;
    /**
     * Change la couleur de l'objet sélectionné
     */
    changeColor(color: string): void;
    /**
     * Change l'opacité de l'objet sélectionné
     */
    changeOpacity(opacity: number): void;
    /**
     * Enable or disable stroke on the selected object.
     * When enabling, restores previous stroke color or defaults to black.
     */
    setStrokeEnabled(enabled: boolean): void;
    /**
     * Set stroke width on the selected object.
     */
    setStrokeWidth(width: number): void;
    /**
     * Set stroke color on the selected object. Accepts any CSS color (hex, rgba).
     * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
     */
    setStrokeColor(color: string): void;
    /**
     * Set fill color (solid) on the selected object.
     * Unlike changeColor(), always sets fill regardless of stroke state.
     * Resets global opacity to 1 so per-channel rgba alpha is authoritative.
     */
    setFillColor(color: string): void;
    /**
     * Set a linear gradient fill on the selected object.
     */
    setFillGradient(color1: string, color2: string, angleDeg: number): void;
    /**
     * Change la police de l'objet texte sélectionné
     */
    changeFont(fontFamily: string, fontWeight?: string): void;
    /**
     * Change la taille de police de l'objet texte sélectionné
     */
    setFontSize(size: number): void;
    /**
     * Bascule un style sur l'objet texte sélectionné (gras, italique, souligné).
     * "bold" alterne fontWeight normal/bold (un poids numérique >= 600 compte
     * comme gras).
     */
    toggleTextStyle(style: "bold" | "italic" | "underline"): void;
    setShadow(opts: {
        color?: string;
        blur?: number;
        offsetX?: number;
        offsetY?: number;
    }): void;
    removeShadow(): void;
    private _clipboard;
    /**
     * Copy the current selection to an internal clipboard.
     * If the selected object is a layout container, its children are copied too.
     */
    copySelection(): void;
    /**
     * Paste clipboard contents onto the canvas.
     * Generates fresh layerIds and remaps parent/child references.
     * Offsets pasted objects by 20px so they don't overlap the originals.
     */
    pasteClipboard(): Promise<FabricObject[]>;
    /**
     * Supprime l'objet ou les objets sélectionnés
     * Les objets verrouillés (position ou full) ne peuvent pas être supprimés
     */
    deleteSelection(): void;
    /**
     * Trouve l'image ou ImageFrame situé sous un point donné (coordonnées canvas)
     * Retourne null si aucune image n'est trouvée
     */
    findImageAtPoint(x: number, y: number): FabricImage | ImageFrame | null;
    /**
     * Trouve l'objet "droppable" sous un point : ImageFrame, FabricImage, ou shape.
     * Utilisé par DropHandler pour le drop d'images sur images ET sur formes.
     */
    findDropTargetAtPoint(x: number, y: number): FabricObject | null;
    /**
     * Nettoie les ressources
     */
    dispose(): void;
    /**
     * Étend FabricObject pour inclure layerId dans la sérialisation
     */
    private static _toObjectExtended;
    private extendFabricObject;
}

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
declare class PreviewCanvas extends StaticCanvas {
    readonly designWidth: number;
    readonly designHeight: number;
    constructor(el: HTMLCanvasElement, opts: {
        width: number;
        height: number;
    } & Record<string, any>);
    fitToSize(containerW: number, containerH: number): number;
    /** Remplace le contenu par ces layers et rend — l'unique verbe d'une preview. */
    showLayers(layers: LayerData[]): Promise<void>;
}

/**
 * Manages ephemeral visual guides (overlays) on a Fabric canvas.
 *
 * All colors are derived from a single base color passed at construction.
 *
 * Provides both low-level primitives (addLine, addRect) and
 * high-level presets for common guide patterns (layout margins,
 * snap lines, hover hints).
 *
 * Each consumer gets its own CanvasGuides instance — guides from
 * different owners don't interfere with each other.
 */
declare class CanvasGuides {
    private canvas;
    private objects;
    private color;
    /** Derived colors (computed once from base color). */
    private strokeColor;
    private fillLight;
    private hatchPattern;
    constructor(canvas: DesignCanvas, color?: string);
    /** Add a line guide. */
    addLine(coords: [number, number, number, number], opts?: {
        stroke?: string;
        strokeWidth?: number;
        strokeDashArray?: number[];
    }): void;
    /** Add a rectangle guide (highlight zone, margin indicator, etc.). */
    addRect(opts: {
        left: number;
        top: number;
        width: number;
        height: number;
        fill?: string | Pattern;
        stroke?: string;
        strokeWidth?: number;
        strokeDashArray?: number[];
    }, insertAbove?: FabricObject): void;
    /** Remove all guides added by this instance. */
    clear(): void;
    /** Clear + render in one call (common pattern). */
    clearAndRender(): void;
    /** Whether this instance currently has guides on the canvas. */
    get hasGuides(): boolean;
    /**
     * Draw a hatched overlay (same style as margin guides) covering an
     * arbitrary rectangle.  Useful anywhere a region needs to be visually
     * "claimed" — e.g. hinting that a shape is about to become a container.
     */
    showHatchOverlay(rect: {
        left: number;
        top: number;
        width: number;
        height: number;
    }, insertAbove?: FabricObject): void;
    /**
     * Show a dashed hover hint around a shape (used during PENDING state
     * in drag-to-layout to signal that anchoring is about to happen).
     *
     * When `insertAbove` is provided, guides are inserted in the z-order
     * just above that object instead of on top of everything — this
     * prevents the overlay from covering the shape's children.
     */
    showHintHighlight(shape: FabricObject, insertAbove?: FabricObject): void;
    /**
     * Show layout guides: a dashed outline around the container,
     * hatched overlays for each non-zero margin zone, and anchor
     * indicators (`<-->`) on the edges where the child is pinned.
     */
    showLayoutGuides(container: FabricObject, child: FabricObject): void;
    /**
     * Show insert-session guides: a dashed container outline + a hatched
     * gap indicator between the new child and its nearest neighbor.
     * No margin-to-edge indicators (those are for ContainerizeSession).
     */
    showInsertGuides(container: FabricObject, children: FabricObject[], direction: "column" | "row"): void;
    /**
     * Draw a `<-->` anchor indicator: a line with chevrons at each end.
     *
     * - "horizontal": draws left-to-right from (x, y) with given length
     * - "vertical": draws top-to-bottom from (x, y) with given length
     */
    private addAnchorArrow;
    /**
     * Show snap alignment lines (horizontal/vertical) spanning the full canvas.
     */
    showSnapLines(guides: Array<{
        orientation: "horizontal" | "vertical";
        position: number;
    }>): void;
}

/**
 * Payload describing what is being dragged from an external source
 * (e.g. an HTML toolbox panel). The kind determines the drop capabilities:
 *
 * | kind  | drop on canvas | replace on hover | layout sessions |
 * |-------|----------------|------------------|-----------------|
 * | image | ✓              | ✓                | ✗               |
 * | text  | ✓              | ✗                | ✓               |
 * | shape | ✓              | ✗                | ✓               |
 */
type DragPayload = {
    kind: "image";
    url: string;
    opts?: Partial<ImageLayerOptions>;
} | {
    kind: "text";
    opts?: Partial<TextLayerOptions>;
} | {
    kind: "shape";
    shapeType: ShapeType;
    opts?: Partial<ShapeLayerOptions>;
};
interface DropHandlerConfig {
    /** Délai avant d'activer le mode remplacement (ms) */
    hoverDelay?: number;
    /** Fonction pour obtenir une URL à partir d'un fichier (blob URL ou upload) */
    getImageUrl: (file: File) => string;
    /** Élément HTML à afficher comme overlay (sera cloné). Prioritaire sur overlayContent. */
    overlayElement?: HTMLElement | undefined;
    /** Contenu HTML de l'overlay de remplacement (défaut: "Remplacer"). Ignoré si overlayElement est fourni. */
    overlayContent?: string;
    /** Callback après ajout/remplacement réussi */
    onSuccess?: () => void;
    /** Callback en cas d'erreur */
    onError?: (error: unknown) => void;
}
/**
 * Gère le drag & drop sur le canvas Fabric.js
 *
 * Supports images (native file drop + URL), text, and shapes.
 *
 * Image-specific behaviour:
 * - Drop rapide (< hoverDelay sur une cible) : ajoute une nouvelle image
 * - Drop après attente (>= hoverDelay sur une cible) : remplace l'image survolée
 *
 * Text & shape drops are always "add at position" — no replace mode.
 */
declare class DropHandler {
    private editor;
    private state;
    private config;
    private dropZone;
    private drag;
    private lastPointer;
    private boundHandleDragOver;
    private boundHandleDragLeave;
    private boundHandleDrop;
    constructor(editor: FabricEditor, config: DropHandlerConfig);
    /**
     * Attache les event listeners sur l'élément drop zone
     */
    attach(dropZone: HTMLElement): void;
    /**
     * Détache les event listeners et nettoie l'état
     */
    detach(): void;
    /**
     * Drop an image by URL. Replaces the hovered target if the replace timer
     * has armed (shape → conversion en ImageFrame masqué, image → nouvelle
     * source), otherwise adds a new image at the drop position.
     *
     * Single image-drop path: used by completeDrag (toolbox drags) and by
     * the native file drop handler.
     *
     * Returns the result so the caller can act on it (e.g. register the new object).
     */
    dropImage(url: string, e?: DragEvent, opts?: Partial<ImageLayerOptions>): Promise<{
        kind: "add";
        object: ImageFrame;
    } | {
        kind: "replace";
        object?: ImageFrame;
    } | null>;
    /**
     * Arm an external drag with a payload. Creates the Fabric object that
     * follows the cursor, off-canvas; it manifests on the canvas on the
     * first trackPointer call. For images the object is a cosmetic preview
     * loaded asynchronously — the drop works even if it hasn't loaded yet.
     */
    prepareDrag(payload: DragPayload): void;
    /**
     * Complete the armed drag:
     * - image → replaces the hovered target if replace mode armed, else adds
     * - text/shape → commits the layout session if anchored, else adds at cursor
     *
     * Returns the newly added object, or null when nothing new was added
     * (replace of an existing target, or error).
     */
    completeDrag(e?: DragEvent): Promise<FabricObject | null>;
    /**
     * Suspend the armed drag: rolls back any layout session and removes the
     * manifested object from the canvas, but keeps the drag armed so it can
     * resume if the cursor re-enters. Call on dragleave.
     */
    suspendDrag(): void;
    /**
     * Cancel the armed drag entirely. Call on dragend / abort.
     */
    cancelDrag(): void;
    /** Whether an external drag is currently armed. */
    get isExternalDrag(): boolean;
    private reset;
    /**
     * Track the pointer during a drag (native file or armed external drag).
     * Routes by capability: manifests and moves the armed object, drives the
     * layout state machine, and/or tracks the hover-to-replace target.
     * The caller is responsible for calling preventDefault() on the event.
     */
    trackPointer(e: DragEvent): void;
    private handleDragOver;
    private handleDragLeave;
    private handleDrop;
    private extractImageFile;
    private activateReplaceMode;
    private clearTimer;
    private clearHighlight;
    /**
     * Met en surbrillance une cible via les contrôles de sélection Fabric
     * et un overlay HTML sombre avec texte personnalisable
     */
    private highlightTarget;
    /**
     * Crée les overlays : un Rect Fabric (pour épouser le clipPath) + un élément HTML (pour le texte)
     */
    private createOverlay;
    /**
     * Crée l'overlay par défaut si aucun élément n'est fourni
     */
    private createDefaultOverlay;
    /**
     * Restaure le style original d'une cible et supprime l'overlay
     */
    private restoreTargetStyle;
    /**
     * Supprime les overlays (Fabric + HTML)
     */
    private removeOverlay;
    /**
     * True if dropping at `e` would put at least one pixel of the object on
     * the artboard. Without an object (image not yet loaded, native file),
     * falls back to a point-in-artboard test on the cursor.
     */
    private intersectsCanvas;
    /**
     * Cosmetic preview for an image drag: the real image, scaled like
     * addImage would (300px max), semi-transparent, and excluded from
     * drop-target detection.
     */
    private createImagePreview;
    private createDragObject;
}

interface Lockable {
    lockMode: LockMode$1;
    lockContent: boolean;
    applyLockMode(mode: LockMode$1): void;
    getLockMode(): LockMode$1;
    getNextLockMode(): LockMode$1;
    isPositionLocked(): boolean;
    isStyleLocked(): boolean;
    isContentLocked(): boolean;
}

interface Controllable {
    getControlOptions(): ControlOption[];
}

declare class FabRect extends Rect implements Lockable, Controllable {
    static type: string;
    static customProperties: string[];
    lockMode: LockMode$1;
    lockContent: boolean;
    applyLockMode: (mode: LockMode$1) => void;
    getLockMode: () => LockMode$1;
    getNextLockMode: () => LockMode$1;
    isPositionLocked: () => boolean;
    isStyleLocked: () => boolean;
    isContentLocked: () => boolean;
    getControlOptions: () => ControlOption[];
    constructor(options?: Partial<TOptions<RectProps>>);
    setCornerRadius(radius: number): void;
    getCornerRadius(): number;
    /** Corner resize: free resize on both axes (no ratio lock). */
    handleCornerResize(transform: any, x: number, y: number): boolean;
    /** Edge resize: single-axis width or height change. */
    handleEdgeResize(transform: any, x: number, y: number): boolean;
    setSize(w: number, h: number): void;
}

declare class FabCircle extends Circle implements Lockable, Controllable {
    static type: string;
    static customProperties: string[];
    lockMode: LockMode$1;
    lockContent: boolean;
    applyLockMode: (mode: LockMode$1) => void;
    getLockMode: () => LockMode$1;
    getNextLockMode: () => LockMode$1;
    isPositionLocked: () => boolean;
    isStyleLocked: () => boolean;
    isContentLocked: () => boolean;
    getControlOptions: () => ControlOption[];
    /** Natural diameter — stays fixed, scale absorbs sizing. */
    private _naturalSize;
    constructor(options?: Partial<TOptions<CircleProps>>);
    /** Corner resize: uniform scaling (aspect ratio locked). */
    handleCornerResize(transform: any, x: number, y: number): boolean;
    /** Edge resize: single-axis stretch, absorbed into scale. */
    handleEdgeResize(transform: any, x: number, y: number): boolean;
    setSize(w: number, h: number): void;
}

declare class FabPath extends Path implements Lockable, Controllable {
    static type: string;
    static customProperties: string[];
    lockMode: LockMode$1;
    lockContent: boolean;
    applyLockMode: (mode: LockMode$1) => void;
    getLockMode: () => LockMode$1;
    getNextLockMode: () => LockMode$1;
    isPositionLocked: () => boolean;
    isStyleLocked: () => boolean;
    isContentLocked: () => boolean;
    getControlOptions: () => ControlOption[];
    private _naturalW;
    private _naturalH;
    constructor(path: string | any[], options?: Partial<TOptions<PathProps>>);
    /** Corner resize: uniform scaling (aspect ratio locked). */
    handleCornerResize(transform: any, x: number, y: number): boolean;
    /** Edge resize: single-axis stretch, absorbed into scale. */
    handleEdgeResize(transform: any, x: number, y: number): boolean;
    setSize(w: number, h: number): void;
    /**
     * Create a FabPath from the shape catalog (heart, hexagon, etc.).
     *
     * Dimension logic:
     * - Both width & height: scale to fill both
     * - Only width: scale height proportionally
     * - Only height: scale width proportionally
     * - Neither: longest axis = 300px
     */
    static createFromCatalog(shapeId: string, options?: Partial<TOptions<PathProps>>): FabPath;
}

/**
 * Crée un FabRect, optionnellement avec coins arrondis via rx/ry.
 */
declare function createRect(options?: Partial<TOptions<RectProps>>): FabRect;
/**
 * Crée un FabCircle
 */
declare function createCircle(options?: Partial<TOptions<CircleProps>>): FabCircle;
/**
 * @legacy Use createPathShape("heart", ...) instead.
 */
declare function createHeart(options?: Partial<TOptions<PathProps>>): FabPath;
/**
 * @legacy Use createPathShape("hexagon", ...) instead.
 */
declare function createHexagon(options?: Partial<TOptions<PathProps>>): FabPath;
/**
 * Crée un FabPath à partir d'un ShapePath normalisé.
 * Factory générique — remplace createHeart/createHexagon.
 */
declare function createPathShape(shapeId: string, options?: Partial<TOptions<PathProps>>): FabPath;
/**
 * Crée une image avec les contrôles de crop
 */
declare function createImage(url: string, options?: Record<string, unknown>): Promise<FabricImage>;
interface CreateShapeOptions {
    fill?: string;
    stroke?: string;
    left?: number;
    top?: number;
    height?: number;
    width?: number;
}
/**
 * Factory générique pour créer une forme par son type.
 *
 * width/height sont optionnels :
 * - rect/rounded/circle : default 300x300
 * - path shapes : une seule dimension donnée → l'autre est calculée
 *   proportionnellement ; aucune → axe principal = 300
 */
declare function createShape(shapeType: ShapeType, options?: CreateShapeOptions): FabRect | FabCircle | FabPath;
interface ShapeCatalogEntry {
    id: ShapeType;
    /** SVG path `d` attribute for preview rendering, or null for built-in primitives. */
    path: string | null;
    /** viewBox to use when rendering the preview SVG (e.g. "0 0 100 100"). */
    viewBox: string;
}
/** All shapes available for creation via createShape(), with preview data. */
declare function getShapeCatalog(): ShapeCatalogEntry[];
/**
 * @legacy Shape switching is no longer supported.
 */
declare function switchShape(obj: FabricObject, nextShapeType: ShapeType): FabRect | FabCircle | FabPath;

interface ShapePath {
    /** Shape identifier (derived from SVG filename). */
    id: string;
    /** Path data normalized and centered within a 100x100 bounding box. */
    d: string;
    /** Actual width of the path within the 100x100 box. */
    width: number;
    /** Actual height of the path within the 100x100 box. */
    height: number;
}
declare const SHAPE_PATHS: ShapePath[];

/**
 * @legacy Use src/shapes/generated/paths.ts instead.
 * These raw path strings are kept only for backward compatibility
 * with legacy createHeart/createHexagon/clipStrategies.
 */
declare const HEART_PATH = "M 0 13 Q -1 13 -4 11 C -12 5 -17 -3 -12 -10 C -9 -14 -2 -13 0 -7 C 2 -13 9 -14 12 -10 C 17 -3 11 5 4 11 Q 1 13 0 13 Z";
declare const HEXAGON_PATH = "M-2 -23.3453C-0.7624 -24.0598 0.7624 -24.0598 2 -23.3453L19.2176 -13.4047C20.4552 -12.6902 21.2176 -11.3697 21.2176 -9.9406V10.4406C21.2176 11.8697 20.4552 13.1902 19.2176 13.9047L2 23.8453C0.7624 24.5598 -0.7624 24.5598 -2 23.8453L-19.2176 13.9047C-20.4552 13.1902 -21.2176 11.8697 -21.2176 10.4406V-9.9406C-21.2176 -11.3697 -20.4552 -12.6902 -19.2176 -13.4047L-2 -23.3453Z";

/**
 * @legacy Shape cycling UI. Built on top of getShapeCatalog().
 */

/**
 * Retourne la forme suivante dans le cycle
 */
declare function nextShape(currentId?: ShapeType): ShapeType;
/**
 * Vérifie si un ID est une forme valide
 */
declare function isValidShape(id: string): id is ShapeType;
/**
 * Retourne la liste des formes disponibles
 */
declare function getAvailableShapes(): ShapeType[];

/**
 * Calcule les facteurs d'anti-scale pour maintenir les proportions d'un clip
 * sur un objet étendu de manière non-uniforme.
 *
 * Quand un objet est étiré (scaleX !== scaleY), les clips appliqués seraient
 * également étirés. Cette fonction calcule les facteurs de compensation
 * pour que le clip garde ses proportions.
 *
 * @param obj - L'objet Fabric avec des propriétés scaleX et scaleY
 * @returns Tuple [scaleX, scaleY] pour compenser le scale de l'objet
 *
 * @example
 * // Objet étiré horizontalement (scaleX: 2, scaleY: 1)
 * antiScale(obj) // Retourne [0.5, 1] pour compenser
 */
declare function antiScale(obj: FabricObject): [number, number];

/**
 * @legacy Replaced by ImageFrame's own clip system (_applyClip, applyClipShape, cycleClipShape).
 * These standalone clip functions use on("scaling") (old model).
 * Rewired to use the new shape factories underneath.
 */

/**
 * Applique un clip circulaire à un objet
 */
declare function addCircleClip(obj: FabricObject): void;
/**
 * Applique un clip en forme de cœur à un objet
 */
declare function addHeartClip(obj: FabricObject): void;
/**
 * Applique un clip hexagonal à un objet
 */
declare function addHexagonClip(obj: FabricObject): void;
/**
 * Passe au clip suivant dans le cycle des formes
 */
declare function switchClip(obj: FabricObject): void;
/**
 * Applique un clip spécifique à un objet
 */
declare function applyClip(obj: FabricObject, shapeType: ShapeType): void;

/**
 * Ajoute les contrôles de crop personnalisés à un objet image
 */
declare function addCropControls(obj: FabricObject): FabricObject;
/**
 * Retire les contrôles de crop d'un objet
 */
declare function removeCropControls(obj: FabricObject): void;

/**
 * Résultat de la conversion d'un layer en HTML
 */
interface HtmlLayerOutput {
    /** Le HTML du layer */
    html: string;
    /** Les fonts requises (noms de famille) */
    fonts?: string[];
}
/**
 * Options pour le rendu HTML global
 */
interface HtmlRenderOptions {
    /** Largeur du canvas */
    width: number;
    /** Hauteur du canvas */
    height: number;
    /** URL de l'image de fond */
    backgroundImage?: string;
    /** Classe CSS à ajouter au container */
    containerClass?: string;
    /** Générer les imports Google Fonts */
    includeGoogleFonts?: boolean;
}

/**
 * Convertit un tableau de layers Fabric en HTML
 *
 * @param layers Les données des layers (telles que retournées par serialize())
 * @param options Options de rendu (dimensions, background, etc.)
 * @returns Le HTML complet prêt à être affiché
 *
 * @example
 * ```typescript
 * const html = fabricToHtml(layers, {
 *   width: 800,
 *   height: 600,
 *   backgroundImage: 'https://example.com/bg.jpg',
 *   includeGoogleFonts: true
 * });
 * ```
 */
declare function fabricToHtml(layers: LayerData[], options: HtmlRenderOptions): string;
/**
 * Convertit un seul layer en HTML (utile pour des updates partiels)
 */
declare function layerToHtmlStandalone(layer: LayerData, zIndex: number): HtmlLayerOutput;

export { type AlignItems, type AlignSelf, type AttachSnapshot, CanvasGuides, type ChildData, type ChildLayout, type ContainerData, type ContainerLayout, ContainerizeSession, type ControlOption, type Controllable, CustomTextbox, DesignCanvas, type DragPayload, DropHandler, type DropHandlerConfig, type EditorConfig, FabCircle, FabPath, FabRect, FabricEditor, type FlexDirection, type FontConfig, type FontsConfig, HEART_PATH, HEXAGON_PATH, type HistoryCallbacks, HistoryManager, type HistoryState, type HtmlLayerOutput, type HtmlRenderOptions, ImageFrame, type ImageLayerOptions, InsertChildSession, type JustifyContent, type LayerData, LayerManager, type LayoutData, LayoutManager, type LayoutManagerCallbacks, type LayoutSession, type LockMode$1 as LockMode, type Lockable, MIN_PAD, MaskManager, type ObjectControlsConfig, PendingUploadsManager, PersistenceManager, PreviewCanvas, ResizeSession, type ResizeSnapResult, SHAPE_PATHS, type SaveOptions, type SaveResult, type SelectionCallbacks, SelectionManager, type ShapeCatalogEntry, type ShapeLayerOptions, type ShapePath, type ShapeType, type SizeMode, type SnappingConfig, SnappingManager, type TextLayerOptions, addCircleClip, addCropControls, addHeartClip, addHexagonClip, antiScale, applyClip, applyLockMode, clampTopLeft, createCircle, createHeart, createHexagon, createImage, createPathShape, createRect, createShape, fabricToHtml, getAvailableShapes, getLockMode, getNextLockMode, getShapeCatalog, hasExceededOffset, initYoga, isChild, isChildLayout, isContainer, isContainerLayout, isContentLocked, isPositionLocked, isStyleLocked, isValidShape, isYogaReady, layerToHtmlStandalone, nextShape, pointInObject, removeCropControls, runLayout, scaledSize, switchClip, switchShape, topLeft, wrapContainerAroundChild, yogaLayout };
