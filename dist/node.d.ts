import { Canvas, FabricObject, TPointerEvent, Textbox, Group, FabricImage, StaticCanvas } from '#fabric';

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
 * Layout system types — "springs & struts" model.
 *
 * A container is a regular Fabric object with `layout.role === "container"`.
 * A child is any Fabric object with `layout.parentId` pointing to a container's layerId.
 *
 * The layout block is stored as a custom property on each Fabric object and
 * survives serialization via toObject(["layout"]).
 */
/**
 * Size mode per axis:
 * - "hug": container adapts to content
 * - "fixed": container keeps its size, content must adapt (shrink/clip)
 */
type SizeMode = "hug" | "fixed";
/** Layout block carried by a **container**. */
interface ContainerLayout {
    role: "container";
    sizeMode: {
        x: SizeMode;
        y: SizeMode;
    };
    /** Taille minimum définie par resize manuel. Le container ne descendra
     *  jamais en dessous, même si le contenu est plus petit. */
    minSize?: {
        w: number;
        h: number;
    };
    /** Overflow behavior when content exceeds fixed size */
    overflow?: "clip" | "shrink";
}
type AnchorX = "left" | "right";
type AnchorY = "top" | "bottom";
/** Layout block carried by a **child** (element inside a container). */
interface ChildLayout {
    parentId: string;
    margins: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    /** Point d'ancrage horizontal (défaut: "left") */
    anchorX?: AnchorX;
    /** Point d'ancrage vertical (défaut: "top") */
    anchorY?: AnchorY;
}
/** Union — the `layout` property on any participating Fabric object. */
type LayoutData = ContainerLayout | ChildLayout;

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
    fill?: string;
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
type ShapeType = "rect" | "rounded" | "circle" | "heart" | "hexagon";
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
    private deserialize;
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

/**
 * Point d'entrée Node.js pour fabric-editor
 *
 * Permet d'utiliser l'éditeur côté serveur pour générer des images
 * sans environnement navigateur.
 *
 * Prérequis : npm install canvas
 */

/**
 * Configuration pour l'éditeur Node.js
 */
interface NodeEditorConfig {
    /** Largeur du canvas */
    width: number;
    /** Hauteur du canvas */
    height: number;
}
/**
 * Configuration des polices pour Node.js
 * Utilise registerFont() du package canvas
 */
interface NodeFontConfig {
    family: string;
    /** Chemin vers le fichier .ttf ou .otf */
    path: string;
    weight?: string;
    style?: string;
}
/**
 * Éditeur Node.js pour le rendu côté serveur
 *
 * Fournit une API similaire à FabricEditor mais sans les fonctionnalités
 * interactives (drag & drop, édition de texte live, etc.)
 */
declare class NodeEditor {
    readonly canvas: StaticCanvas;
    readonly layers: LayerManager;
    readonly persistence: PersistenceManager;
    readonly history: HistoryManager;
    private config;
    constructor(config: NodeEditorConfig);
    /**
     * Initialise l'éditeur avec une image de fond et des calques optionnels
     */
    initialize(backgroundImageUrl: string, layers?: LayerData[]): Promise<void>;
    /**
     * Exporte le canvas en PNG (data URL)
     */
    toDataURL(options?: {
        format?: "png" | "jpeg";
        quality?: number;
        multiplier?: number;
    }): string;
    /**
     * Exporte le canvas en Buffer PNG
     * Utile pour sauvegarder directement dans un fichier
     */
    toBuffer(): Buffer;
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
 * Charge les polices pour le rendu Node.js
 *
 * Doit être appelé avant de créer un NodeEditor si vous utilisez des polices custom.
 *
 * @example
 * ```ts
 * import { registerFonts } from '@frabr/fabric-editor/node';
 *
 * registerFonts([
 *   { family: 'Roboto', path: './fonts/Roboto-Regular.ttf' },
 *   { family: 'Roboto', path: './fonts/Roboto-Bold.ttf', weight: 'bold' },
 * ]);
 * ```
 */
declare function registerFonts(fonts: NodeFontConfig[]): void;
/**
 * Factory pour créer un éditeur Node.js
 *
 * @example
 * ```ts
 * import { createNodeEditor, registerFonts } from '@frabr/fabric-editor/node';
 *
 * // Optionnel: charger des polices
 * registerFonts([{ family: 'Arial', path: './fonts/arial.ttf' }]);
 *
 * // Créer l'éditeur
 * const editor = createNodeEditor({ width: 800, height: 600 });
 *
 * // Charger une image et des calques
 * await editor.initialize('https://example.com/image.jpg', layers);
 *
 * // Exporter en PNG
 * const buffer = editor.toBuffer();
 * fs.writeFileSync('output.png', buffer);
 *
 * // Ou en data URL
 * const dataUrl = editor.toDataURL();
 *
 * // Nettoyer
 * editor.dispose();
 * ```
 */
declare function createNodeEditor(config: NodeEditorConfig): NodeEditor;

export { type FontConfig, HistoryManager, type HistoryState, ImageFrame, type LayerData, LayerManager, NodeEditor, type NodeEditorConfig, type NodeFontConfig, PersistenceManager, type ShapeType, createNodeEditor, registerFonts };
