/**
 * Tests Browser (jsdom) pour fabric-editor
 *
 * Ces tests utilisent fabric (version DOM) avec jsdom.
 * Ils vérifient que l'éditeur fonctionne sans crash en environnement browser.
 *
 * Note: jsdom n'a pas de vrai rendu canvas, donc on teste surtout :
 * - Création d'objets sans erreur
 * - API disponible et fonctionnelle
 * - Pas de régression sur les imports #fabric
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Ces imports utilisent #fabric qui résout vers "fabric" (browser) grâce à vitest.config.ts
import { FabricEditor } from "../FabricEditor";
import { LayerManager } from "../LayerManager";
import { Canvas, Rect, Circle, FabricImage } from "#fabric";

describe("Browser Environment", () => {
  describe("FabricEditor", () => {
    let canvasElement: HTMLCanvasElement;
    let editor: FabricEditor;

    beforeEach(() => {
      // Créer un élément canvas dans le DOM jsdom
      canvasElement = document.createElement("canvas");
      canvasElement.width = 500;
      canvasElement.height = 500;
      document.body.appendChild(canvasElement);
    });

    afterEach(() => {
      if (editor) {
        editor.dispose();
      }
      if (canvasElement && canvasElement.parentNode) {
        canvasElement.parentNode.removeChild(canvasElement);
      }
    });

    it("se crée sans erreur", () => {
      expect(() => {
        editor = new FabricEditor(canvasElement, {
          width: 500,
          height: 500,
        });
      }).not.toThrow();

      expect(editor).toBeDefined();
      expect(editor.canvas).toBeDefined();
    });

    it("expose les managers", () => {
      editor = new FabricEditor(canvasElement, { width: 500, height: 500 });

      expect(editor.layers).toBeDefined();
      expect(editor.selection).toBeDefined();
      expect(editor.masks).toBeDefined();
      expect(editor.persistence).toBeDefined();
      expect(editor.history).toBeDefined();
      expect(editor.snapping).toBeDefined();
    });

    it("a un Canvas interactif (pas StaticCanvas)", () => {
      editor = new FabricEditor(canvasElement, { width: 500, height: 500 });

      // Le Canvas interactif a setActiveObject
      expect(typeof editor.canvas.setActiveObject).toBe("function");
      expect(typeof editor.canvas.getActiveObject).toBe("function");
    });

    it("dispose sans erreur", () => {
      editor = new FabricEditor(canvasElement, { width: 500, height: 500 });

      expect(() => {
        editor.dispose();
      }).not.toThrow();
    });
  });

  describe("LayerManager (browser)", () => {
    let canvas: Canvas;
    let layerManager: LayerManager;

    beforeEach(() => {
      const canvasElement = document.createElement("canvas");
      canvasElement.width = 500;
      canvasElement.height = 500;
      document.body.appendChild(canvasElement);

      canvas = new Canvas(canvasElement);
      layerManager = new LayerManager(canvas);
    });

    afterEach(() => {
      canvas.dispose();
    });

    it("ajoute un objet et le sélectionne", () => {
      const rect = new Rect({
        left: 100,
        top: 100,
        width: 50,
        height: 50,
        fill: "red",
      });

      layerManager.add(rect);

      expect(canvas.getObjects()).toContain(rect);
      // En mode browser, l'objet devrait être sélectionné
      expect(canvas.getActiveObject()).toBe(rect);
    });

    it("charge des layers via loadLayers", async () => {
      await layerManager.loadLayers([
        {
          type: "Rect",
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          fill: "blue",
        },
      ]);

      expect(canvas.getObjects().length).toBe(1);
    });

    it("charge un Circle", async () => {
      await layerManager.loadLayers([
        {
          type: "Circle",
          left: 100,
          top: 100,
          radius: 50,
          fill: "green",
        },
      ]);

      const objects = canvas.getObjects();
      expect(objects.length).toBe(1);
      expect(objects[0].type).toBe("circle");
    });

    it("charge un IText", async () => {
      await layerManager.loadLayers([
        {
          type: "IText",
          text: "Hello Browser",
          left: 100,
          top: 100,
          fontSize: 24,
          fill: "#000000",
        },
      ]);

      const objects = canvas.getObjects();
      expect(objects.length).toBe(1);
    });
  });

  describe("Fabric.js imports (#fabric)", () => {
    it("Canvas est le Canvas interactif (pas StaticCanvas)", () => {
      const canvasElement = document.createElement("canvas");
      const canvas = new Canvas(canvasElement);

      // Canvas interactif a ces méthodes
      expect(typeof canvas.setActiveObject).toBe("function");
      expect(typeof canvas.getActiveObject).toBe("function");
      expect(typeof canvas.discardActiveObject).toBe("function");

      canvas.dispose();
    });

    it("Rect se crée correctement", () => {
      const rect = new Rect({
        left: 10,
        top: 10,
        width: 100,
        height: 50,
        fill: "red",
      });

      expect(rect).toBeDefined();
      expect(rect.type).toBe("rect");
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(50);
    });

    it("Circle se crée correctement", () => {
      const circle = new Circle({
        left: 50,
        top: 50,
        radius: 25,
        fill: "blue",
      });

      expect(circle).toBeDefined();
      expect(circle.type).toBe("circle");
      expect(circle.radius).toBe(25);
    });

    it("FabricImage est disponible", () => {
      expect(FabricImage).toBeDefined();
      expect(typeof FabricImage.fromURL).toBe("function");
    });
  });

  describe("Différences Node vs Browser", () => {
    it("en browser, setActiveObject est appelé dans add()", async () => {
      const canvasElement = document.createElement("canvas");
      const canvas = new Canvas(canvasElement);
      const layerManager = new LayerManager(canvas);

      const setActiveSpy = vi.spyOn(canvas, "setActiveObject");

      const rect = new Rect({ left: 10, top: 10, width: 50, height: 50 });
      layerManager.add(rect);

      expect(setActiveSpy).toHaveBeenCalledWith(rect);

      canvas.dispose();
    });
  });
});
