# @apibots-io/fabric-editor

Fabric.js-based image editor with layers, clipping, and frame support.

## Installation

```bash
npm install git+ssh://git@github.com:apibots-io/fabric-editor.git
```

Or with HTTPS (requires GITHUB_TOKEN):
```bash
npm install git+https://github.com/apibots-io/fabric-editor.git
```

## Usage

```typescript
import { FabricEditor, ImageFrame } from "@apibots-io/fabric-editor";

// Create editor
const editor = new FabricEditor(canvasElement, {
  width: 800,
  height: 600,
});

// Initialize with background image
await editor.initialize(imageUrl, existingLayers);

// Add layers
editor.layers.addText({ text: "Hello", fontFamily: "Inter" });
editor.layers.addShape({ fill: "#ff0000", width: 200, height: 200 });
await editor.layers.addImage(url);

// Save
const result = await editor.persistence.save({ rasterize: true });
```

## Development

```bash
npm install
npm run build
npm test
```
