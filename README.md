# @frabr/fabric-editor

Editeur d'images base sur Fabric.js, avec support des calques, clipping, frames et **rendu SSR Node.js**.

## Points d'entree

La bibliotheque expose deux points d'entree selon l'environnement :

| Import | Environnement | Utilisation |
|--------|---------------|-------------|
| `@frabr/fabric-editor` | Browser | Editeur interactif avec Canvas DOM |
| `@frabr/fabric-editor/node` | Node.js | Rendu SSR avec StaticCanvas + node-canvas |

```typescript
// Browser - editeur interactif
import { FabricEditor } from "@frabr/fabric-editor";

// Node.js - rendu serveur
import { createNodeEditor, registerFonts } from "@frabr/fabric-editor/node";
```

## Installation

```bash
npm install @frabr/fabric-editor
```

**Prerequis pour Node.js SSR :**
```bash
npm install canvas  # Requis pour le rendu Node.js
```

## Architecture

```
src/
├── index.ts                # Exports Browser
├── node.ts                 # Exports Node.js (SSR)
├── FabricEditor.ts         # Classe principale Browser
├── LayerManager.ts         # Gestion des calques (CRUD, serialisation)
├── SelectionManager.ts     # Gestion de la selection
├── MaskManager.ts          # Application des masques
├── PersistenceManager.ts   # Sauvegarde, export, rasterisation
├── HistoryManager.ts       # Undo/redo
├── SnappingManager.ts      # Aimantage aux bords et au centre
├── ImageFrame.ts           # Conteneur d'image avec cadre fixe
├── ImageDropHandler.ts     # Drag & drop d'images
├── PendingUploadsManager.ts # Lazy upload vers Cloudinary
├── locking.ts              # Verrouillage des calques
├── shapes/                 # Formes geometriques
├── clipping/               # Strategies de clip
├── controls/               # Controles personnalises
└── types.ts                # Interfaces TypeScript
```

### Pattern `#fabric` - Imports conditionnels

La bibliotheque utilise le pattern **subpath imports** de Node.js pour supporter les deux environnements avec le meme code source :

```json
// package.json
{
  "imports": {
    "#fabric": {
      "node": "fabric/node",
      "default": "fabric"
    }
  }
}
```

Tous les fichiers source importent depuis `#fabric` :
```typescript
import { Canvas, FabricImage } from "#fabric";
```

**Resolution automatique :**
- En Node.js → `fabric/node` (utilise node-canvas)
- En Browser → `fabric` (utilise Canvas DOM)

---

## Utilisation Browser

### Initialisation

```typescript
import { FabricEditor } from "@frabr/fabric-editor";

const editor = new FabricEditor(canvasElement, {
  width: 800,
  height: 600,
  standAlone: false,
  defaultColor: "#ffffff",
  container: containerElement,
});

await editor.initialize(imageUrl, existingLayers);
```

### Gestion des calques

```typescript
// Ajouter un texte
editor.layers.addText({
  text: "Mon texte",
  fontFamily: "Inter",
  fontSize: 32,
  fill: "#000000",
});

// Ajouter une forme
editor.layers.addShape({
  fill: "#ff0000",
  width: 200,
  height: 200,
});

// Ajouter une image
await editor.layers.addImage(url);

// Ordonner les calques
editor.layers.bringForward(obj);
editor.layers.sendBackward(obj);
```

### Selection et callbacks

```typescript
editor.selection.onSelect = (obj) => { /* ... */ };
editor.selection.onDeselect = () => { /* ... */ };
editor.selection.onTransformStart = () => { /* cacher les controles */ };
editor.selection.onModified = () => { /* reafficher les controles */ };

// Controles disponibles selon le type
const controls = editor.selection.getAvailableControls();
// => ["clip", "color", "font", "outline"]
```

### Persistance

```typescript
// Sauvegarder avec rasterisation
const result = await editor.persistence.save({ rasterize: true });
// result.layers : LayerData[]
// result.dataUrl : string (PNG base64)

// Export/Import JSON
const json = editor.persistence.exportLayersJSON();
await editor.persistence.importLayersJSON(json);
```

---

## Utilisation Node.js (SSR)

Le point d'entree `@frabr/fabric-editor/node` permet de generer des images cote serveur.

### Exemple complet

```typescript
import { createNodeEditor, registerFonts } from "@frabr/fabric-editor/node";
import fs from "fs";

// 1. Enregistrer les polices (avant de creer l'editeur)
registerFonts([
  { family: "Roboto", path: "./fonts/Roboto-Regular.ttf" },
  { family: "Roboto", path: "./fonts/Roboto-Bold.ttf", weight: "bold" },
]);

// 2. Creer l'editeur
const editor = createNodeEditor({
  width: 1080,
  height: 1080,
  maxSize: 1000,  // Optionnel: contrainte de taille max
});

// 3. Charger l'image de fond et les calques
await editor.initialize("https://example.com/background.jpg", [
  {
    type: "Circle",
    left: 100,
    top: 100,
    radius: 50,
    fill: "#ff0000",
  },
  {
    type: "IText",
    text: "Hello World",
    left: 200,
    top: 200,
    fontSize: 48,
    fill: "#ffffff",
    fontFamily: "Roboto",
  },
  {
    type: "ImageFrame",
    left: 300,
    top: 100,
    frameWidth: 200,
    frameHeight: 150,
    clipShape: "heart",
    image: {
      src: "https://example.com/photo.jpg",
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    },
  },
]);

// 4. Exporter
const buffer = editor.toBuffer();  // Buffer PNG
fs.writeFileSync("output.png", buffer);

// Ou en data URL
const dataUrl = editor.toDataURL({ format: "png", quality: 1 });

// 5. Liberer les ressources
editor.dispose();
```

### API NodeEditor

```typescript
interface NodeEditorConfig {
  width: number;      // Largeur originale
  height: number;     // Hauteur originale
  maxSize?: number;   // Taille max (defaut: 1000)
  standAlone?: boolean; // Centre les objets
}

class NodeEditor {
  canvas: StaticCanvas;
  layers: LayerManager;
  persistence: PersistenceManager;
  history: HistoryManager;

  getRatio(): number;
  initialize(backgroundUrl: string, layers?: LayerData[]): Promise<void>;
  toDataURL(options?: { format?: "png" | "jpeg"; quality?: number }): string;
  toBuffer(): Buffer;
  dispose(): void;
}
```

### Types de calques supportes

| Type | Description |
|------|-------------|
| `Circle` | Cercle avec fill/stroke |
| `Rect` | Rectangle avec fill/stroke |
| `Path` | Chemin SVG |
| `IText` | Texte editable |
| `Image` | Image simple |
| `ImageFrame` | Image avec cadre et clip (heart, circle, etc.) |
| `Group` | Groupe d'objets |

### Polices personnalisees

```typescript
import { registerFonts } from "@frabr/fabric-editor/node";

// Doit etre appele AVANT createNodeEditor()
registerFonts([
  { family: "MyFont", path: "/path/to/font.ttf" },
  { family: "MyFont", path: "/path/to/font-bold.ttf", weight: "bold" },
  { family: "MyFont", path: "/path/to/font-italic.ttf", style: "italic" },
]);
```

---

## Verrouillage des calques

Trois modes de verrouillage :

| Mode | Position | Contenu | Forme/Z-index |
|------|----------|---------|---------------|
| `free` | Modifiable | Modifiable | Modifiable |
| `position` | Verrouillee | Modifiable | Verrouille |
| `full` | Verrouillee | Verrouille | Verrouille |

```typescript
import { applyLockMode, getLockMode, isContentLocked } from "@frabr/fabric-editor";

// Appliquer un mode
applyLockMode(obj, "position");

// Verifier
if (isContentLocked(obj)) {
  // Ne pas permettre le remplacement d'image
}
```

---

## Integration Docker (creatorstudio)

Pour utiliser fabric-editor en SSR dans un environnement Docker :

### 1. Dockerfile - Dependances systeme

```dockerfile
# Dependances pour compiler node-canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev
```

### 2. docker-compose.yml - Volume mount

```yaml
services:
  server:
    volumes:
      - ../fabric-editor:/fabric-editor
      - fabric_editor_node_modules:/fabric-editor/node_modules

volumes:
  fabric_editor_node_modules:  # Isole les node_modules
```

### 3. Installation dans le container

```bash
# Installer les deps de fabric-editor (compile canvas)
docker exec container sh -c "cd /fabric-editor && npm install && npm run build"

# Installer canvas dans l'app principale (pour registerFonts)
docker exec container npm install canvas
```

### 4. Utilisation

```typescript
import { createNodeEditor, registerFonts } from "@frabr/fabric-editor/node";

// Les polices doivent etre dans le container
registerFonts([
  { family: "Garet", path: "/app/src/fonts/garet.ttf" },
]);

const editor = createNodeEditor({ width: 1080, height: 1080 });
await editor.initialize(imageUrl, layers);
const buffer = editor.toBuffer();
```

---

## Tests

La bibliotheque a deux suites de tests pour les deux environnements :

```bash
npm run test:node     # Tests Node.js (rendu reel avec canvas)
npm run test:browser  # Tests Browser (jsdom)
npm run test:run      # Les deux
npm test              # Mode watch
```

### Structure des tests

```
src/
├── __tests__/
│   ├── node.test.ts              # 18 tests SSR
│   └── browser.browser.test.ts   # 13 tests jsdom
├── LayerManager.test.ts          # 14 tests unitaires
├── clipping/antiScale.test.ts    # 11 tests unitaires
└── shapes/shapeWheel.test.ts     # 8 tests unitaires
```

### Ce qui est teste

| Environnement | Fichier config | Tests |
|--------------|----------------|-------|
| **Node.js** | `vitest.config.ts` | Rendu PNG reel, export Buffer, chargement layers |
| **Browser** | `vitest.browser.config.ts` | Canvas interactif, setActiveObject, pas de crash |

---

## API Reference

### FabricEditor (Browser)

```typescript
class FabricEditor {
  canvas: Canvas;
  layers: LayerManager;
  selection: SelectionManager;
  masks: MaskManager;
  persistence: PersistenceManager;
  history: HistoryManager;
  snapping: SnappingManager;

  initialize(imageUrl: string, layers?: LayerData[]): Promise<void>;
  changeColor(color: string): void;
  changeOpacity(opacity: number): void;
  changeFont(family: string, weight?: string): void;
  toggleOutline(): void;
  switchClip(): void;
  switchShape(): void;
  deleteSelection(): void;
  dispose(): void;
}
```

### LayerManager

```typescript
class LayerManager {
  add(obj: FabricObject): FabricObject;
  remove(obj: FabricObject): void;
  addText(options: TextLayerOptions): Promise<CustomTextbox>;
  addShape(options: ShapeLayerOptions): Promise<FabricObject>;
  addImage(url: string): Promise<FabricObject>;
  loadLayers(layers: LayerData[]): Promise<FabricObject[]>;
  loadBackgroundImage(url: string, ratio: number): Promise<FabricImage>;
  serialize(): LayerData[];
  bringForward(obj: FabricObject): void;
  sendBackward(obj: FabricObject): void;
  applyLockMode(obj: FabricObject, mode: LockMode): void;
}
```

### Types de layers (LayerData)

```typescript
// Format serialise des calques
interface LayerData {
  type: "Circle" | "Rect" | "Path" | "IText" | "Image" | "ImageFrame" | "Group";
  left?: number;
  top?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  fill?: string;
  stroke?: string;
  layerId?: string;
  lockMode?: "free" | "position" | "full";
  lockContent?: boolean;
  // ... autres proprietes Fabric.js
}
```

---

## Cycle des formes

```
rect → rounded → circle → heart → hexagon → rect → ...
```

Utilisable comme :
- Objet independant (`addShape`)
- Clip sur une image (`switchClip`)

---

## Development

```bash
npm install
npm run build    # Build CJS + ESM + types
npm run dev      # Watch mode
npm test         # Tests en watch
npm run test:run # Tests une fois
```

### Build outputs

```
dist/
├── index.js       # CJS Browser
├── index.mjs      # ESM Browser
├── index.d.ts     # Types Browser
├── node.js        # CJS Node.js
├── node.mjs       # ESM Node.js
└── node.d.ts      # Types Node.js
```
