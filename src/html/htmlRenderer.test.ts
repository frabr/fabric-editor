import { describe, it, expect } from "vitest";
import { fabricToHtml } from "./htmlRenderer";
import type { LayerData } from "../types";

describe("fabricToHtml", () => {
  it("should render hexagon clip", () => {
    const layers: LayerData[] = [
      {
        top: 308.59375,
        left: 276.9017748834833,
        type: "ImageFrame",
        angle: 0,
        image: {
          src: "https://res.cloudinary.com/dcmekntwa/image/upload/v1769271453/cpbn0pzfiskllzsrgzfz.jpg",
          scale: 1,
          offsetX: 0,
          offsetY: 22.984549039979143,
        },
        scaleX: 1,
        scaleY: 1,
        layerId: "layer_1769271402188_410",
        opacity: 1,
        clipShape: "hexagon",
        frameWidth: 220.03105590062108,
        frameHeight: 215.00670925253795,
      },
      {
        rx: 45,
        ry: 45,
        top: 294.5074,
        fill: "#ffd230",
        left: 539.1304,
        type: "Rect",
        angle: 0,
        width: 300,
        height: 300,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        originX: "center",
        originY: "center",
      },
      {
        top: 0,
        fill: "#00c950",
        left: 668.0665,
        text: "Tapez votre texte ici",
        type: "IText",
        angle: 47.653,
        width: 265.984,
        height: 36.16,
        scaleX: 1.469,
        scaleY: 5.1731,
        opacity: 1,
        originX: "left",
        originY: "top",
        fontSize: 32,
        fontStyle: "normal",
        textAlign: "left",
        fontFamily: "Pacifico",
        fontWeight: "normal",
        lineHeight: 1.16,
        charSpacing: 1,
      },
    ];

    const html = fabricToHtml(layers, {
      width: 800,
      height: 600,
      includeGoogleFonts: true,
    });

    console.log("\n========== HEXAGON HTML ==========\n");
    console.log(html);
    console.log("\n===================================\n");

    expect(html).toContain("clip-layer_1769271402188_410");
    expect(html).toContain("top:"); // Vérifie qu'on utilise top/left pour le positionnement de l'image
  });

  it("should render the example layers from the user", () => {
    const layers: LayerData[] = [
      {
        top: 180.44435670076177,
        left: 200.54347826086956,
        type: "ImageFrame",
        angle: 0,
        image: {
          src: "https://res.cloudinary.com/dcmekntwa/image/upload/v1769271453/cpbn0pzfiskllzsrgzfz.jpg",
          scale: 1,
          offsetX: 0,
          offsetY: 22.984549039979143,
        },
        scaleX: 1,
        scaleY: 1,
        layerId: "layer_1769271402188_410",
        opacity: 1,
        clipShape: "heart",
        frameWidth: 220.03105590062108,
        frameHeight: 215.00670925253795,
      },
      {
        rx: 45,
        ry: 45,
        top: 294.5074,
        fill: "#ffd230",
        left: 539.1304,
        type: "Rect",
        angle: 0,
        flipX: false,
        flipY: false,
        skewX: 0,
        skewY: 0,
        width: 300,
        height: 300,
        scaleX: 1,
        scaleY: 1,
        shadow: null,
        stroke: null,
        opacity: 1,
        originX: "center",
        originY: "center",
        version: "6.6.2",
        visible: true,
        fillRule: "nonzero",
        paintFirst: "fill",
        strokeWidth: 0,
        strokeLineCap: "butt",
        strokeUniform: false,
        strokeLineJoin: "miter",
        backgroundColor: "",
        strokeDashArray: null,
        strokeDashOffset: 0,
        strokeMiterLimit: 4,
        globalCompositeOperation: "source-over",
      },
      {
        top: 0,
        fill: "#00c950",
        left: 668.0665,
        text: "Tapez votre texte ici",
        type: "IText",
        angle: 47.653,
        flipX: false,
        flipY: false,
        skewX: 0,
        skewY: 0,
        width: 265.984,
        height: 36.16,
        scaleX: 1.469,
        scaleY: 5.1731,
        shadow: null,
        stroke: null,
        styles: [],
        layerId: "layer_1769271432786_948",
        opacity: 1,
        originX: "left",
        originY: "top",
        version: "6.6.2",
        visible: true,
        fillRule: "nonzero",
        fontSize: 32,
        overline: false,
        pathSide: "left",
        direction: "ltr",
        fontStyle: "normal",
        pathAlign: "baseline",
        textAlign: "left",
        underline: false,
        fontFamily: "Pacifico",
        fontWeight: "normal",
        lineHeight: 1.16,
        paintFirst: "fill",
        charSpacing: 1,
        linethrough: false,
        strokeWidth: 1,
        strokeLineCap: "butt",
        strokeUniform: false,
        strokeLineJoin: "miter",
        backgroundColor: "",
        pathStartOffset: 0,
        strokeDashArray: null,
        strokeDashOffset: 0,
        strokeMiterLimit: 4,
        textBackgroundColor: "",
        globalCompositeOperation: "source-over",
      },
    ];

    const html = fabricToHtml(layers, {
      width: 800,
      height: 600,
      backgroundImage: "https://example.com/background.jpg",
      includeGoogleFonts: true,
    });

    console.log("\n========== GENERATED HTML ==========\n");
    console.log(html);
    console.log("\n=====================================\n");

    // Basic assertions
    expect(html).toContain("Pacifico"); // Font
    expect(html).toContain("Tapez votre texte ici"); // Text content
    expect(html).toContain("#ffd230"); // Rect color
    expect(html).toContain("#00c950"); // Text color
    expect(html).toContain("clip-layer_1769271402188_410"); // Heart clip path (unique ID)
    expect(html).toContain("z-index: 1"); // First layer
    expect(html).toContain("z-index: 2"); // Second layer
    expect(html).toContain("z-index: 3"); // Third layer
    expect(html).toContain("rotate(47.653deg)"); // Text rotation
    expect(html).toContain("border-radius: 45px"); // Rounded rect
    expect(html).toContain("fonts.googleapis.com"); // Google fonts import
  });

  it("should handle layers without background image", () => {
    const layers: LayerData[] = [
      {
        type: "Rect",
        left: 100,
        top: 100,
        width: 200,
        height: 100,
        fill: "#ff0000",
      },
    ];

    const html = fabricToHtml(layers, {
      width: 400,
      height: 300,
    });

    expect(html).toContain("#ff0000");
    expect(html).not.toContain("<img"); // No background image
  });

  it("should handle circle clip on ImageFrame", () => {
    const layers: LayerData[] = [
      {
        type: "ImageFrame",
        left: 50,
        top: 50,
        frameWidth: 100,
        frameHeight: 100,
        clipShape: "circle",
        layerId: "test_circle",
        image: {
          src: "https://example.com/photo.jpg",
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      },
    ];

    const html = fabricToHtml(layers, { width: 200, height: 200 });

    console.log("\n========== CIRCLE HTML ==========\n");
    console.log(html);
    console.log("\n===================================\n");

    expect(html).toContain("circle(50px at 50px 50px)"); // Circle clip
  });
});
