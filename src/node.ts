/**
 * Point d'entrée Node.js pour fabric-editor
 *
 * Permet d'utiliser l'éditeur côté serveur pour générer des images
 * sans environnement navigateur.
 *
 * Prérequis : npm install canvas
 */

import { createRequire } from "module";
import { Canvas as FabricCanvas, StaticCanvas, FabricObject } from "#fabric";

// Pour require("canvas") dans registerFonts
const require = createRequire(import.meta.url);
import { LayerManager } from "./LayerManager";
import { PersistenceManager } from "./PersistenceManager";
import { HistoryManager } from "./HistoryManager";
import type { LayerData, FontConfig } from "./types";

/**
 * Configuration pour l'éditeur Node.js
 */
export interface NodeEditorConfig {
  /** Largeur du canvas */
  width: number;
  /** Hauteur du canvas */
  height: number;
}

/**
 * Configuration des polices pour Node.js
 * Utilise registerFont() du package canvas
 */
export interface NodeFontConfig {
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
export class NodeEditor {
  readonly canvas: StaticCanvas;
  readonly layers: LayerManager;
  readonly persistence: PersistenceManager;
  readonly history: HistoryManager;

  private config: NodeEditorConfig;

  constructor(config: NodeEditorConfig) {
    this.config = config;

    this.canvas = new StaticCanvas(undefined, {
      width: config.width,
      height: config.height,
    });

    // Initialiser les managers compatibles
    this.layers = new LayerManager(this.canvas as unknown as FabricCanvas);
    this.persistence = new PersistenceManager(
      this.canvas as unknown as FabricCanvas,
      this.layers
    );
    this.history = new HistoryManager(
      this.canvas as unknown as FabricCanvas,
      this.layers
    );

    // Étendre FabricObject pour inclure layerId dans le JSON
    this.extendFabricObject();
  }

  /**
   * Initialise l'éditeur avec une image de fond et des calques optionnels
   */
  async initialize(
    backgroundImageUrl: string,
    layers: LayerData[] = []
  ): Promise<void> {
    await this.layers.loadBackgroundImage(backgroundImageUrl);

    if (layers.length > 0) {
      await this.layers.loadLayers(layers);
    }

    this.canvas.renderAll();
    this.history.initialize();
  }

  /**
   * Exporte le canvas en PNG (data URL)
   */
  toDataURL(options?: { format?: "png" | "jpeg"; quality?: number; multiplier?: number }): string {
    return this.canvas.toDataURL({
      format: options?.format ?? "png",
      quality: options?.quality ?? 1,
      multiplier: options?.multiplier ?? 1,
    });
  }

  /**
   * Exporte le canvas en Buffer PNG
   * Utile pour sauvegarder directement dans un fichier
   */
  toBuffer(): Buffer {
    // Accéder au canvas node sous-jacent
    const nodeCanvas = (this.canvas as unknown as { lowerCanvasEl: { toBuffer: (mime: string) => Buffer } }).lowerCanvasEl;
    if (nodeCanvas && typeof nodeCanvas.toBuffer === "function") {
      return nodeCanvas.toBuffer("image/png");
    }
    // Fallback: convertir data URL en buffer
    const dataUrl = this.toDataURL();
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64, "base64");
  }

  /**
   * Nettoie les ressources
   */
  dispose(): void {
    this.canvas.dispose();
  }

  /**
   * Étend FabricObject pour inclure layerId dans la sérialisation
   */
  private static _toObjectExtended = false;

  private extendFabricObject(): void {
    if (NodeEditor._toObjectExtended) return;
    NodeEditor._toObjectExtended = true;

    const originalToObject = FabricObject.prototype.toObject;
    FabricObject.prototype.toObject = function (propertiesToInclude) {
      return originalToObject.call(
        this,
        ["layerId"].concat(propertiesToInclude || [])
      );
    };
  }
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
export function registerFonts(fonts: NodeFontConfig[]): void {
  // Import dynamique pour éviter l'erreur si canvas n'est pas installé
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerFont } = require("canvas");
    for (const font of fonts) {
      registerFont(font.path, {
        family: font.family,
        weight: font.weight,
        style: font.style,
      });
    }
  } catch {
    throw new Error(
      "Le package 'canvas' est requis pour utiliser les polices en Node.js. " +
        "Installez-le avec: npm install canvas"
    );
  }
}

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
export function createNodeEditor(config: NodeEditorConfig): NodeEditor {
  return new NodeEditor(config);
}

// Ré-exporter les types et utilitaires compatibles Node.js
export { LayerManager } from "./LayerManager";
export { PersistenceManager } from "./PersistenceManager";
export { HistoryManager } from "./HistoryManager";
export { ImageFrame } from "./ImageFrame";

export type { LayerData, FontConfig, ShapeType } from "./types";
export type { HistoryState } from "./HistoryManager";
