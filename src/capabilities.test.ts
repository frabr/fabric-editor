/**
 * Règlement des capacités : chaque sorte d'objet × chaque état (vrais objets Fabric).
 */
import { describe, it, expect } from "vitest";
import { FabricImage, Group } from "#fabric";
import { createCanvas } from "canvas";
import { rulesOf, kindOf } from "./capabilities";
import { CustomTextbox } from "./controls/CustomTextbox";
import { FabRect } from "./shapes/FabRect";
import { FabCircle } from "./shapes/FabCircle";
import { ImageFrame } from "./ImageFrame";
import { applyLockMode } from "./locking";
import type { FabricObject } from "#fabric";

function shape<T extends { set(props: Record<string, unknown>): unknown }>(obj: T): T {
  obj.set({ layerType: "shape", layerId: "s" });
  return obj;
}

function imageFrame(): ImageFrame {
  const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
  return new ImageFrame(img, { frameWidth: 100, frameHeight: 100, layerId: "if" });
}

describe("rulesOf", () => {
  it("texte : n'accueille pas, ignore les images, police et couleur", () => {
    const rules = rulesOf(new CustomTextbox("Bonjour", {}));
    expect(rules).toEqual({
      kind: "text", onToolboxImage: null, hosts: false, options: ["color", "font"],
      restyles: true, restacks: true, deletes: true,
    });
  });

  it("forme : accueille, prend une image en fond", () => {
    const rules = rulesOf(shape(new FabCircle({ radius: 10 })));
    expect(rules).toMatchObject({ kind: "shape", onToolboxImage: "fill", hosts: true });
    expect(rules.options).toEqual(["outline", "clip", "color"]);
  });

  it("les angles arrondis sont ceux d'un rect", () => {
    expect(rulesOf(shape(new FabRect({ width: 10, height: 10 }))).options).toContain("corner_radius");
    expect(rulesOf(shape(new FabCircle({ radius: 10 }))).options).not.toContain("corner_radius");
  });

  it("groupe de paths (forme multi-régions) : accueille, mais ni options ni image en fond", () => {
    const rules = rulesOf(shape(new Group([])));
    expect(rules).toMatchObject({ kind: "shape", hosts: true, options: [], onToolboxImage: null });
  });

  it("forme + image : une forme (accueille, contour, découpe, angles), qui remplace son image", () => {
    const rules = rulesOf(imageFrame());
    expect(rules).toMatchObject({
      kind: "imageShape", onToolboxImage: "replaceImage", hosts: true,
      options: ["outline", "clip", "corner_radius", "image"],
    });
  });

  it("image legacy : remplace son image, rien d'autre", () => {
    const img = new FabricImage(createCanvas(10, 10) as unknown as HTMLCanvasElement);
    expect(kindOf(img)).toBe("legacyImage");
    expect(rulesOf(img)).toMatchObject({ onToolboxImage: "replaceImage", hosts: false, options: [] });
  });

  it("hors-jeu : fond legacy, calque inerte, objet de l'éditeur — rien ne réagit", () => {
    const background = shape(new FabRect({ width: 10, height: 10 }));
    background.set({ layerId: "originalImage" });
    const inert = shape(new FabRect({ width: 10, height: 10, evented: false }));
    const guide = shape(new FabRect({ width: 10, height: 10, excludeFromExport: true }));
    for (const obj of [background, inert, guide]) {
      expect(rulesOf(obj)).toMatchObject({ kind: "shape", onToolboxImage: null, hosts: false });
    }
  });

  describe("verrous", () => {
    function locked<T extends { set(props: Record<string, unknown>): unknown }>(obj: T, mode: string): T {
      applyLockMode(obj as unknown as FabricObject, mode as any);
      return obj;
    }

    it("position : plus de style ni de pile ni de suppression ; le placeholder garde son image", () => {
      const rules = rulesOf(locked(imageFrame(), "position"));
      expect(rules).toMatchObject({
        onToolboxImage: "replaceImage", hosts: true, options: ["image"],
        restyles: false, restacks: false, deletes: false,
      });
      expect(rulesOf(locked(shape(new FabRect({ width: 10, height: 10 })), "position")).options).toEqual([]);
    });

    it("total : plus rien", () => {
      const rules = rulesOf(locked(shape(new FabRect({ width: 10, height: 10 })), "full"));
      expect(rules).toMatchObject({
        onToolboxImage: null, hosts: false, options: [],
        restyles: false, restacks: false, deletes: false,
      });
    });

    it("verrou ignoré (recherche de cible d'un drop) : l'objet verrouillé reste opaque", () => {
      const frame = locked(imageFrame(), "full");
      expect(rulesOf(frame).onToolboxImage).toBeNull();
      expect(rulesOf(frame, { ignoreLock: true }).onToolboxImage).toBe("replaceImage");
    });
  });
});
