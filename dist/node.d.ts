import { StaticCanvas } from 'fabric';
import { L as LayerManager, P as PersistenceManager, H as HistoryManager, a as LayerData } from './HistoryManager-UZM08eSg.js';
export { l as FontConfig, r as HistoryState, I as ImageFrame, b as ShapeType } from './HistoryManager-UZM08eSg.js';

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
    /** Taille maximale (le canvas sera redimensionné proportionnellement) */
    maxSize?: number;
    /** Mode standalone (centre les objets) */
    standAlone?: boolean;
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
    private ratio;
    private config;
    constructor(config: NodeEditorConfig);
    /**
     * Le ratio de redimensionnement appliqué
     */
    getRatio(): number;
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
     * Centre tous les objets sur le canvas (mode standalone)
     */
    private centerAllObjects;
    /**
     * Étend FabricObject pour inclure layerId dans la sérialisation
     */
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

export { HistoryManager, LayerData, LayerManager, NodeEditor, type NodeEditorConfig, type NodeFontConfig, PersistenceManager, createNodeEditor, registerFonts };
