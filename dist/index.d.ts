import { IText, FabricObject, Group, FabricImage, Canvas, Rect, TOptions, RectProps, CircleProps, Circle, PathProps, Path } from 'fabric';

/**
 * Textbox personnalisé qui :
 * 1. Place le textarea caché à l'intérieur du canvas container (pour le focus dans les modales)
 * 2. Force sa position à (0, 0) pour éviter les problèmes de layout/scroll
 *
 * Nécessaire car les modales (dialog) avec showModal() créent un
 * "focus trap" qui empêche le focus d'aller sur des éléments
 * en dehors du dialog. En plaçant le textarea dans le canvas
 * container (qui est dans le dialog), il peut recevoir le focus.
 */
declare class CustomTextbox extends IText {
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

interface EditorConfig {
    width: number;
    height: number;
    standAlone?: boolean;
    fonts?: FontsConfig;
    defaultColor?: string;
    container?: HTMLElement;
}
type FontsConfig = Record<string, FontConfig>;
interface FontConfig {
    family: string;
    url: string;
    weight?: string;
}
interface EditorState {
    ratio: number;
    maxSize: number;
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
}
type ShapeType = "rect" | "rounded" | "circle" | "heart" | "hexagon";
interface ObjectControlsConfig {
    type: string;
    options: ControlOption[];
}
type ControlOption = "clip" | "color" | "font" | "outline";
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
    constructor(canvas: Canvas);
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
    loadBackgroundImage(url: string, ratio: number): Promise<FabricImage>;
    /**
     * Charge plusieurs calques depuis leurs données JSON
     */
    loadLayers(layers: LayerData[]): Promise<FabricObject[]>;
    /**
     * Ajoute un objet au canvas et le sélectionne
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
     * Crée et ajoute un calque forme (rectangle par défaut)
     */
    addShape(options?: ShapeLayerOptions): Rect;
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
 * Gère la sélection des objets sur le canvas
 */
declare class SelectionManager {
    private canvas;
    private _current;
    private callbacks;
    private isTransforming;
    constructor(canvas: Canvas);
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
     * Retourne les contrôles disponibles pour l'objet sélectionné
     */
    getAvailableControls(): ControlOption[];
    /**
     * Vérifie si un contrôle est disponible pour l'objet sélectionné
     */
    hasControl(control: ControlOption): boolean;
    /**
     * Désélectionne tout
     */
    clear(): void;
    /**
     * Sélectionne un objet
     */
    select(obj: FabricObject): void;
    /**
     * Configure les écouteurs d'événements du canvas
     */
    private setupListeners;
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
    constructor(canvas: Canvas);
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
    setup(container: HTMLElement, maxSize: number): Promise<void>;
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
    /**
     * Redimensionne le canvas pour s'adapter au viewport
     */
    resizeCanvasToFit(container: HTMLElement, maxSize: number): Promise<void>;
    /**
     * Version synchrone du redimensionnement
     */
    private resizeCanvasToFitSync;
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
    constructor(canvas: Canvas, layers: LayerManager);
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
    constructor(canvas: Canvas, layers: LayerManager, options?: {
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
    /** Couleur des guides visuels (défaut: "#ff00ff") */
    guideColor?: string;
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
    constructor(canvas: Canvas, config?: SnappingConfig);
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
    private createGuideLine;
    private clearGuides;
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

/**
 * Éditeur d'images basé sur Fabric.js
 *
 * Coordonne les différents managers pour fournir une API unifiée
 * pour l'édition d'images avec calques.
 */
declare class FabricEditor {
    readonly canvas: Canvas;
    readonly layers: LayerManager;
    readonly selection: SelectionManager;
    readonly masks: MaskManager;
    readonly persistence: PersistenceManager;
    readonly history: HistoryManager;
    readonly snapping: SnappingManager;
    private state;
    private config;
    constructor(canvasElement: HTMLCanvasElement, config: EditorConfig);
    /**
     * Le ratio de redimensionnement appliqué à l'image de fond
     */
    get ratio(): number;
    /**
     * Convertit des coordonnées du canvas Fabric vers des coordonnées CSS affichées.
     *
     * Le canvas Fabric a une taille "interne" (ex: 1000x800) utilisée pour les calculs,
     * mais il est affiché dans le container avec une taille CSS différente via zoom.
     * Cette méthode applique le ratio pour positionner des éléments HTML par-dessus le canvas.
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
     * Initialise l'éditeur avec une image de fond et des calques optionnels
     */
    initialize(backgroundImageUrl: string, layers?: LayerData[]): Promise<void>;
    /**
     * Charge les polices personnalisées
     */
    loadFonts(fonts: FontsConfig): Promise<void>;
    /**
     * Bascule le clip de l'objet sélectionné vers la forme suivante
     */
    switchClip(): void;
    /**
     * Bascule la forme de l'objet sélectionné vers la forme suivante
     */
    switchShape(): void;
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
     * Change la police de l'objet texte sélectionné
     */
    changeFont(fontFamily: string, fontWeight?: string): void;
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
     * Nettoie les ressources
     */
    dispose(): void;
    /**
     * Initialise le canvas Fabric
     */
    private initCanvas;
    /**
     * Centre tous les objets sur le canvas (mode standalone)
     */
    private centerAllObjects;
    /**
     * Étend FabricObject pour inclure layerId dans la sérialisation
     */
    private extendFabricObject;
    /**
     * Déplace le contrôle de rotation (mtr) sur le côté droit de l'objet
     * pour éviter le conflit avec la barre de contrôles positionnée au-dessus
     *
     * En Fabric.js v6, les contrôles sont créés par instance, donc on écoute
     * l'événement object:added pour modifier chaque nouvel objet.
     */
    private configureRotationControl;
}

interface ImageDropHandlerConfig {
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
 * Gère le drag & drop d'images sur le canvas Fabric.js
 *
 * Deux modes :
 * - Drop rapide (< hoverDelay sur une image) : ajoute une nouvelle image
 * - Drop après attente (>= hoverDelay sur une image) : remplace l'image survolée
 */
declare class ImageDropHandler {
    private editor;
    private state;
    private config;
    private dropZone;
    private boundHandleDragOver;
    private boundHandleDragLeave;
    private boundHandleDrop;
    constructor(editor: FabricEditor, config: ImageDropHandlerConfig);
    /**
     * Attache les event listeners sur l'élément drop zone
     */
    attach(dropZone: HTMLElement): void;
    /**
     * Détache les event listeners et nettoie l'état
     */
    detach(): void;
    /**
     * Réinitialise l'état complet
     */
    private reset;
    private handleDragOver;
    private handleDragLeave;
    private handleDrop;
    private extractImageFile;
    private activateReplaceMode;
    private clearTimer;
    private clearHighlight;
    /**
     * Met en surbrillance une image via les contrôles de sélection Fabric
     * et un overlay HTML sombre avec texte personnalisable
     */
    private highlightImage;
    /**
     * Crée les overlays : un Rect Fabric (pour épouser le clipPath) + un élément HTML (pour le texte)
     */
    private createOverlay;
    /**
     * Crée l'overlay par défaut si aucun élément n'est fourni
     */
    private createDefaultOverlay;
    /**
     * Restaure le style original d'une image/frame et supprime l'overlay
     */
    private restoreImageStyle;
    /**
     * Supprime les overlays (Fabric + HTML)
     */
    private removeOverlay;
    private replaceImage;
    private addImage;
}

declare const HEART_PATH = "M 0 13 Q -1 13 -4 11 C -12 5 -17 -3 -12 -10 C -9 -14 -2 -13 0 -7 C 2 -13 9 -14 12 -10 C 17 -3 11 5 4 11 Q 1 13 0 13 Z";
declare const HEXAGON_PATH = "M-2 -23.3453C-0.7624 -24.0598 0.7624 -24.0598 2 -23.3453L19.2176 -13.4047C20.4552 -12.6902 21.2176 -11.3697 21.2176 -9.9406V10.4406C21.2176 11.8697 20.4552 13.1902 19.2176 13.9047L2 23.8453C0.7624 24.5598 -0.7624 24.5598 -2 23.8453L-19.2176 13.9047C-20.4552 13.1902 -21.2176 11.8697 -21.2176 10.4406V-9.9406C-21.2176 -11.3697 -20.4552 -12.6902 -19.2176 -13.4047L-2 -23.3453Z";

/**
 * Retourne la forme suivante dans le cycle
 * @param currentId - ID de la forme actuelle (ou undefined pour commencer)
 * @returns La forme suivante dans le cycle
 */
declare function nextShape(currentId?: ShapeType): ShapeType;
/**
 * Vérifie si un ID est une forme valide
 */
declare function isValidShape(id: string): id is ShapeType;
/**
 * Retourne la liste des formes disponibles
 */
declare function getAvailableShapes(): readonly ShapeType[];

/**
 * Crée un rectangle basique
 */
declare function createRect(options?: Partial<TOptions<RectProps>>): Rect;
/**
 * Crée un rectangle avec coins arrondis
 * Gère le scaling en modifiant width/height plutôt que scale
 */
declare function createRoundedRect(options?: Partial<TOptions<RectProps>>): Rect;
/**
 * Crée un cercle
 */
declare function createCircle(options?: Partial<TOptions<CircleProps>>): Circle;
/**
 * Crée une forme cœur à partir d'un path SVG
 */
declare function createHeart(options?: Partial<TOptions<PathProps>>): Path;
/**
 * Crée une forme hexagone à partir d'un path SVG
 */
declare function createHexagon(options?: Partial<TOptions<PathProps>>): Path;
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
    radius?: number;
}
/**
 * Factory générique pour créer une forme par son type
 */
declare function createShape(shapeType: ShapeType, options: CreateShapeOptions): FabricObject;
/**
 * Convertit un objet existant vers une nouvelle forme
 */
declare function switchShape(obj: FabricObject, nextShapeType: ShapeType): FabricObject;

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
 * Applique un clip avec coins arrondis à un objet
 */
declare function addRoundedClip(obj: FabricObject): void;
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

export { type ControlOption, CustomTextbox, type EditorConfig, type EditorState, FabricEditor, type FontConfig, type FontsConfig, HEART_PATH, HEXAGON_PATH, type HistoryCallbacks, HistoryManager, type HistoryState, ImageDropHandler, ImageFrame, type ImageLayerOptions, type LayerData, LayerManager, type LockMode$1 as LockMode, MaskManager, type ObjectControlsConfig, PendingUploadsManager, PersistenceManager, type ResizeSnapResult, type SaveOptions, type SaveResult, type SelectionCallbacks, SelectionManager, type ShapeLayerOptions, type ShapeType, type SnappingConfig, SnappingManager, type TextLayerOptions, addCircleClip, addCropControls, addHeartClip, addHexagonClip, addRoundedClip, antiScale, applyClip, applyLockMode, createCircle, createHeart, createHexagon, createImage, createRect, createRoundedRect, createShape, getAvailableShapes, getLockMode, getNextLockMode, isContentLocked, isPositionLocked, isStyleLocked, isValidShape, nextShape, removeCropControls, switchClip, switchShape };
