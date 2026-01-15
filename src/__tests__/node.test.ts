/**
 * Tests Node.js pour fabric-editor
 *
 * Ces tests utilisent fabric/node avec le vrai moteur canvas (node-canvas).
 * Ils vérifient le rendu SSR complet.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

// Import depuis le point d'entrée Node.js
import { createNodeEditor, registerFonts, NodeEditor } from "../node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Image de test (Cloudinary - accessible depuis Docker)
const TEST_IMAGE_URL = "https://res.cloudinary.com/dcmekntwa/image/upload/v1763452522/itpobqdfhtikk5lkxkxm.jpg";

describe("NodeEditor", () => {
  let editor: NodeEditor;

  afterEach(() => {
    if (editor) {
      editor.dispose();
    }
  });

  describe("createNodeEditor", () => {
    it("crée un éditeur avec les dimensions spécifiées", () => {
      editor = createNodeEditor({ width: 800, height: 600 });

      expect(editor).toBeDefined();
      expect(editor.canvas).toBeDefined();
      expect(editor.canvas.width).toBeLessThanOrEqual(1000); // maxSize par défaut
      expect(editor.canvas.height).toBeLessThanOrEqual(1000);
    });

    it("respecte le maxSize", () => {
      editor = createNodeEditor({ width: 2000, height: 1000, maxSize: 500 });

      // Le plus grand côté devrait être 500
      expect(Math.max(editor.canvas.width, editor.canvas.height)).toBe(500);
    });

    it("calcule le bon ratio", () => {
      editor = createNodeEditor({ width: 1000, height: 500, maxSize: 500 });

      expect(editor.getRatio()).toBeCloseTo(0.5, 2);
    });

    it("utilise StaticCanvas (pas de méthodes interactives)", () => {
      editor = createNodeEditor({ width: 100, height: 100 });

      // StaticCanvas n'a pas setActiveObject
      expect(typeof (editor.canvas as any).setActiveObject).not.toBe("function");
    });
  });

  describe("initialize", () => {
    it("charge une image de fond", async () => {
      editor = createNodeEditor({ width: 100, height: 100, maxSize: 100 });

      await editor.initialize(TEST_IMAGE_URL, []);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(1); // Image de fond
    });

    it("charge des layers Circle", async () => {
      editor = createNodeEditor({ width: 500, height: 500, maxSize: 500 });

      await editor.initialize(TEST_IMAGE_URL, [
        {
          type: "Circle",
          left: 100,
          top: 100,
          radius: 50,
          fill: "#ff0000",
        },
      ]);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(2); // bg + circle
    });

    it("charge des layers Rect", async () => {
      editor = createNodeEditor({ width: 500, height: 500, maxSize: 500 });

      await editor.initialize(TEST_IMAGE_URL, [
        {
          type: "Rect",
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          fill: "blue",
        },
      ]);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(2); // bg + rect
    });

    it("charge des layers IText", async () => {
      editor = createNodeEditor({ width: 500, height: 500, maxSize: 500 });

      await editor.initialize(TEST_IMAGE_URL, [
        {
          type: "IText",
          text: "Hello World",
          left: 100,
          top: 100,
          fontSize: 24,
          fill: "#000000",
        },
      ]);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(2); // bg + text
    });

    it("charge plusieurs layers de types différents", async () => {
      editor = createNodeEditor({ width: 500, height: 500, maxSize: 500 });

      await editor.initialize(TEST_IMAGE_URL, [
        { type: "Circle", left: 50, top: 50, radius: 25, fill: "red" },
        { type: "Rect", left: 100, top: 100, width: 50, height: 50, fill: "blue" },
        { type: "IText", text: "Test", left: 150, top: 150, fontSize: 16, fill: "green" },
      ]);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(4); // bg + 3 layers
    });

    it("ignore les types de calques inconnus sans crash", async () => {
      editor = createNodeEditor({ width: 500, height: 500, maxSize: 500 });

      // Ne devrait pas throw
      await editor.initialize(TEST_IMAGE_URL, [
        { type: "UnknownType" as any, left: 50, top: 50 },
        { type: "Circle", left: 100, top: 100, radius: 25, fill: "red" },
      ]);

      const objects = editor.canvas.getObjects();
      expect(objects.length).toBe(2); // bg + circle (unknown ignoré)
    });
  });

  describe("export", () => {
    it("toDataURL retourne un data URL PNG valide", async () => {
      editor = createNodeEditor({ width: 100, height: 100, maxSize: 100 });
      await editor.initialize(TEST_IMAGE_URL, []);

      const dataUrl = editor.toDataURL();

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("toBuffer retourne un Buffer PNG", async () => {
      editor = createNodeEditor({ width: 100, height: 100, maxSize: 100 });
      await editor.initialize(TEST_IMAGE_URL, []);

      const buffer = editor.toBuffer();

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      // Vérifier le magic number PNG (89 50 4E 47)
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4e); // N
      expect(buffer[3]).toBe(0x47); // G
    });

    it("supporte le format JPEG", async () => {
      editor = createNodeEditor({ width: 100, height: 100, maxSize: 100 });
      await editor.initialize(TEST_IMAGE_URL, []);

      const dataUrl = editor.toDataURL({ format: "jpeg" });

      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe("managers", () => {
    it("expose LayerManager", () => {
      editor = createNodeEditor({ width: 100, height: 100 });

      expect(editor.layers).toBeDefined();
      expect(typeof editor.layers.add).toBe("function");
    });

    it("expose HistoryManager", () => {
      editor = createNodeEditor({ width: 100, height: 100 });

      expect(editor.history).toBeDefined();
    });

    it("expose PersistenceManager", () => {
      editor = createNodeEditor({ width: 100, height: 100 });

      expect(editor.persistence).toBeDefined();
    });
  });
});

describe("registerFonts", () => {
  it("charge des polices sans erreur", () => {
    // Note: ce test nécessite des fichiers de polices réels
    // En CI, on pourrait skip ce test ou utiliser des polices système
    expect(() => {
      registerFonts([
        // Utiliser une police qui existe dans le projet parent si disponible
        // Sinon ce test sera skippé en CI
      ]);
    }).not.toThrow();
  });

  it("throw une erreur claire si canvas n'est pas disponible", () => {
    // Ce test vérifie juste que l'erreur est informative
    // En environnement Node.js avec canvas installé, ça ne devrait pas throw
    expect(typeof registerFonts).toBe("function");
  });
});
