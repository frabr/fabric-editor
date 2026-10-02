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
    readonly originalFabricCanvas: Canvas;
    private _width;
    private _height;
    private _scale;
    /** Dimensions logiques de l'espace design (mutables : le format se décide, cf. resizeDesign). */
    get width(): number;
    get height(): number;
    /**
     * Redimensionne l'espace design : le contenu reste en place, seul le cadre change —
     * l'appelant refait un fitToSize pour recalculer l'affichage.
     */
    resizeDesign(width: number, height: number): void;
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
 * Layout system types — Flexbox model backed by Yoga.
 *
 * Every participating Fabric object carries a single `layout: LayoutData`
 * property with independent, optional blocks:
 *
 * - `sizing`: how the object sizes itself, per axis — shared by containers
 *   and texts (a text's "content" is its text, a container's is its children)
 * - `container`: present when the object has children (is a parent)
 * - `child`: present when the object is inside another container
 * - `overflow`: what a text does when its box is smaller than its content
 *
 * Container and child can coexist — a nested container is both.
 *
 * Outside a container, objects are positioned absolutely by Fabric.
 * Inside a container, objects follow Flexbox rules (Yoga engine).
 */
/**
 * Size mode per axis:
 * - "hug": the object adapts to its content (text, or children)
 * - "fixed": the object keeps its size, content must adapt (wrap/shrink/clip)
 */
type SizeMode = "hug" | "fixed";
/** "How I size myself" — on containers and texts. */
interface SizingData {
    x: SizeMode;
    y: SizeMode;
    /**
     * Floor set by the resize handles on a "hug" axis: the object is
     * `max(content, minSize)`. Ignored on a "fixed" axis.
     */
    minSize?: {
        w: number;
        h: number;
    };
}
/**
 * What a text does when its box is smaller than its content (fixed height,
 * or a height constrained by its container):
 * - "shrink": font size goes down (to MIN_FONT_SIZE) until it fits
 * - "clip": the text is cut at the box edge
 * - "visible": the text overflows the box
 */
type TextOverflow = "shrink" | "clip" | "visible";
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
    sizing?: SizingData;
    container?: ContainerData;
    child?: ChildData;
    /** Texts only (default "shrink"). */
    overflow?: TextOverflow;
}

/**
 * Boîte d'un texte : fonction pure de son mode de taille, de la contrainte que lui
 * donne son container (le temps d'une passe), de son overflow et d'une mesure.
 *
 * Aucun état : CustomTextbox fournit la mesure (Fabric) et applique le résultat.
 */

/**
 * Ce que le container donne au texte pour une passe de layout — jamais conservé.
 * - `maxW` : largeur disponible, que le texte ne dépasse pas (il wrappe)
 * - `w` / `h` : taille exacte calculée par Yoga (stretch, flexGrow, flexShrink)
 */
interface TextConstraint {
    maxW?: number;
    w?: number;
    h?: number;
}

/**
 * Textbox de l'éditeur : un objet de layout comme les autres.
 *
 * Il porte les mêmes modes de taille que les containers (`layout.sizing`), son
 * « contenu » étant son texte :
 * - largeur `hug` : une ligne, la boîte suit le texte ; `fixed` : wrap à la largeur ;
 *   dans les deux cas, jamais plus large que la place que donne le container (le
 *   container pousse la largeur fixe, qui reste acquise) ;
 * - hauteur `hug` : la boîte suit le texte, avec un plancher `minSize.h` posé par les
 *   poignées ; `fixed` : la boîte garde sa hauteur et `layout.overflow` décide
 *   (réduire la police, couper, déborder).
 *
 * La boîte est calculée par `resolveTextBox` (layout/text-box.ts) ; le texte ne fait
 * que fournir la mesure et appliquer le résultat.
 *
 * Contrainte du container : un seul écrivain, le moteur de layout (`layoutWith`, à
 * chaque passe). Fabric recalcule aussi le texte de lui-même, hors de toute passe et
 * sans événement pour relancer le layout (sortie d'édition, rendu après un changement
 * de styles) : ce recalcul reprend la dernière contrainte reçue. Un enfant jamais mis
 * en page (document tout juste chargé) s'affiche tel que sauvegardé ; un texte hors
 * container ignore toute contrainte.
 *
 * Les poignées ne déforment jamais : elles changent la boîte (jamais de scale).
 *
 * `fontSize` est la taille effective (celle qui est rendue et sauvegardée, pour qu'un
 * document s'affiche juste sans relayout) ; `fontSizeIntent` est la taille voulue par
 * l'utilisateur, d'où repart l'autofit à chaque calcul.
 *
 * Hérite de Textbox (et non IText) pour le line-wrapping natif. Place aussi le textarea
 * caché dans le container du canvas, pour le focus dans les modales (`showModal()`
 * piège le focus hors du dialog).
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
    static customProperties: string[];
    /** Taille de police voulue — l'effective (`fontSize`) peut être réduite par l'autofit. */
    fontSizeIntent: number;
    /** Le contenu dépasse la boîte (overflow clip / visible). */
    _overflowing?: boolean;
    /** Dernière contrainte reçue du container (absente : jamais mis en page). */
    _constraint?: TextConstraint;
    constructor(text: string, options?: Record<string, unknown>);
    /**
     * Sans bloc `sizing` (le temps de la construction, avant _ensureSizing), la boîte
     * stockée fait foi : largeur fixe.
     */
    get sizing(): SizingData;
    get textOverflow(): TextOverflow;
    /** Remplace le bloc `sizing` (nouvel objet `layout`, jamais muté en place). */
    setSizing(sizing: SizingData): void;
    setTextOverflow(overflow: TextOverflow): void;
    /** Largeur naturelle à la police courante : la plus longue ligne, sans wrap. */
    naturalWidth(): number;
    /**
     * Largeur minimale du texte : son mot le plus long (le min-content de CSS). Le
     * découpage des mots trop longs (break-word) n'est qu'un repli, pas un minimum.
     */
    minContentWidth(): number;
    /**
     * Une passe de layout : calcule la boîte sous la contrainte du container et la
     * retient. `null` : le texte a quitté son container.
     */
    layoutWith(constraint: TextConstraint | null): void;
    /** Recalcul (Fabric, ou layoutWith) sous la contrainte courante. */
    initDimensions(): void;
    private _applyBox;
    /**
     * Mesure via Fabric (mute l'objet ; _applyBox pose l'état final ensuite). Méthode et
     * non champ : Fabric mesure déjà pendant le super() du constructeur.
     */
    private _measure;
    /** Wrap à `width` puis mesure (la largeur peut grandir au mot le plus long). */
    private _wrapAt;
    /** Toute nouvelle `fontSize` posée via set() est une intention de l'utilisateur. */
    _set(key: string, value: any): this;
    /** overflow "clip" : le texte est coupé au bord de sa boîte. */
    _render(ctx: CanvasRenderingContext2D): void;
    /**
     * Bord gauche/droit : la largeur passe en fixe et prend la valeur tirée.
     * Bord haut/bas : en hauteur contenu, pose le plancher `minSize.h` ; en hauteur fixe,
     * change la hauteur.
     */
    handleEdgeResize(transform: any, x: number, y: number): boolean;
    /** Coin : les deux règles des bords à la fois. */
    handleCornerResize(transform: any, x: number, y: number): boolean;
    private _isChild;
    private _withAnchor;
    private _resizeWidth;
    private _resizeHeight;
    /**
     * Un texte étiré (scaleX/scaleY) est ramené à scale 1 : le scale passe dans la
     * largeur et la police. Exact pour un scale uniforme ; un étirement non uniforme est
     * perdu (les glyphes reprennent leurs proportions).
     */
    private _bakeLegacyScale;
    /**
     * Un texte sans `layout.sizing` (nouveau, ou document d'avant les modes de taille)
     * reçoit un mode explicite :
     * - nouveau texte, ou enfant de container (sa largeur était dictée par le container) :
     *   largeur contenu ;
     * - sinon : largeur contenu si la boîte épouse le texte sur une ligne, fixe sinon
     *   (texte qui wrappe, ou boîte élargie pour un alignement).
     */
    private _ensureSizing;
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
 * Un path du catalogue : géométrie normalisée 100x100, apparence d'auteur optionnelle.
 * Sans fill ni stroke = géométrie recolorable (le défaut de l'appelant s'applique) ;
 * stroke sans fill = forme en contour (fill transparent, jamais le défaut).
 */
interface ShapePathData {
    d: string;
    fill?: string;
    stroke?: string;
    /** Normalisé dans l'espace 100x100, comme le `d`. */
    strokeWidth?: number;
}
/**
 * Le clip inliné d'un ImageFrame : le `d` voyage DANS le document (autoporteur),
 * l'id de catalogue n'est plus qu'un affichage/cycle. width/height = dims du
 * dessin dans la boîte 100x100 (le rendu HTML en a besoin pour son contain).
 */
interface ClipData {
    d: string;
    width: number;
    height: number;
}

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
    /** Bindings du dialecte template (apibots) : { champ: { expr, scope, resolved } } */
    bindings?: Record<string, {
        expr?: string;
        scope?: string;
        resolved?: boolean;
    }>;
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
    /**
     * Données de paths inline (payload toolbox) : prioritaires sur shapeType —
     * l'asset devient du contenu à l'insertion. N paths → Group de FabPath.
     */
    paths?: ShapePathData[];
}
type ShapeType = "rect" | "circle" | (string & {});
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
    /** Clip inliné (formes hors catalogue global — le document reste autoporteur). */
    clipData?: ClipData;
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
    originX?: "left" | "center" | "right";
    originY?: "top" | "center" | "bottom";
    stroke?: string;
    strokeWidth?: number;
    type: "ImageFrame";
    left: number;
    top: number;
    angle: number;
    scaleX: number;
    scaleY: number;
    frameWidth: number;
    frameHeight: number;
    clipShape?: ShapeType;
    /**
     * Le `d` du clip, inliné au save : les nouveaux documents ne dépendent plus du
     * registre pour se recharger — l'id (clipShape) reste pour l'affichage et le
     * cycle. Le stock legacy (id seul) se résout via le registre et s'upgrade au
     * prochain save.
     */
    clipData?: ClipData;
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
    clipData?: ClipData;
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
    /** Taille visuelle (contrat des formes, utilisé par le layout) : le frame, image en cover. */
    setSize(w: number, h: number): void;
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
    getCornerRadius(): number;
    /**
     * Contour (capacité de forme) : un Group ne dessine pas de trait — on trace la forme
     * de découpe par-dessus, hors clip, trait centré sur le bord comme pour une forme.
     */
    render(ctx: CanvasRenderingContext2D): void;
    private _applyImageOffset;
    private _clampOffset;
    private _applyClip;
    private _rectClip;
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
     * Désérialise plusieurs calques sans les ajouter au canvas — la moitié asynchrone
     * (chargement d'images compris) du chargement, pour que l'appelant puisse faire le swap
     * ancien/nouveau contenu de façon synchrone (anti-flicker).
     */
    deserializeAll(layers: LayerData[]): Promise<(FabricObject | null)[]>;
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
     * Monte l'objet devant le premier objet de même niveau qui le chevauche. Un
     * container emmène ses descendants (toujours au-dessus de lui) ; un enfant reste
     * parmi les enfants de son container.
     */
    bringForward(obj: FabricObject): void;
    /**
     * Descend l'objet d'un niveau, mêmes règles de blocs que bringForward. Ne peut pas
     * descendre en dessous de l'image de fond.
     */
    sendBackward(obj: FabricObject): void;
    private applyStackOrder;
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
     * Demande l'image à l'utilisateur final (userSlots) : le calque devient une forme liée à
     * une image à fournir, avec sa consigne. Une forme le reste ; une forme-image redevient la
     * forme de sa découpe, aux mêmes dimensions — son image est abandonnée (pas d'exemple :
     * le damier dit « à fournir »), ses autres bindings la suivent.
     *
     * Rend la forme, ou null si le calque ne peut pas recevoir d'image (texte, groupe de paths).
     */
    requestUserImage(obj: FabricObject, hint?: string): FabricObject | null;
    /**
     * Un calque en remplace un autre à sa place : son layout (container, enfant) et son
     * verrouillage — sinon ses enfants restent orphelins, ou il sort de son container — et
     * son rang dans la pile (sous ses enfants).
     */
    private takeOver;
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
