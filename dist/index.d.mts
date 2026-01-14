import { Canvas, FabricObject, FabricImage, TOptions, RectProps, Rect, CircleProps, Circle, PathProps, Path } from 'fabric';
import { S as SelectionCallbacks, C as ControlOption, L as LayerManager, P as PersistenceManager, H as HistoryManager, E as EditorConfig, a as LayerData, F as FontsConfig, I as ImageFrame, b as ShapeType } from './HistoryManager-UZM08eSg.mjs';
export { j as CustomTextbox, k as EditorState, l as FontConfig, s as HistoryCallbacks, r as HistoryState, n as ImageLayerOptions, m as LockMode, O as ObjectControlsConfig, c as PendingUploadsManager, p as SaveOptions, q as SaveResult, o as ShapeLayerOptions, T as TextLayerOptions, d as applyLockMode, g as getLockMode, e as getNextLockMode, i as isContentLocked, f as isPositionLocked, h as isStyleLocked } from './HistoryManager-UZM08eSg.mjs';

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

export { ControlOption, EditorConfig, FabricEditor, FontsConfig, HEART_PATH, HEXAGON_PATH, HistoryManager, ImageDropHandler, ImageFrame, LayerData, LayerManager, MaskManager, PersistenceManager, type ResizeSnapResult, SelectionCallbacks, SelectionManager, ShapeType, type SnappingConfig, SnappingManager, addCircleClip, addCropControls, addHeartClip, addHexagonClip, addRoundedClip, antiScale, applyClip, createCircle, createHeart, createHexagon, createImage, createRect, createRoundedRect, createShape, getAvailableShapes, isValidShape, nextShape, removeCropControls, switchClip, switchShape };
