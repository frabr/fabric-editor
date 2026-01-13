# @frabr/fabric-editor

Éditeur d'images basé sur Fabric.js, avec support des calques, clipping et frames.

## Installation

```bash
npm install git+ssh://git@github.com/frabr/fabric-editor.git#v1.0.1
```

## Architecture

```
src/
├── FabricEditor.ts         # Classe principale, coordonne les managers
├── LayerManager.ts         # Gestion des calques (CRUD, sérialisation)
├── SelectionManager.ts     # Gestion de la sélection et callbacks
├── MaskManager.ts          # Application des masques
├── PersistenceManager.ts   # Sauvegarde, export, rasterisation
├── ImageDropHandler.ts     # Drag & drop d'images (ajout/remplacement)
├── PendingUploadsManager.ts # Lazy upload vers Cloudinary
├── ImageFrame.ts           # Conteneur d'image avec cadre fixe
├── HistoryManager.ts       # Undo/redo
├── locking.ts              # Verrouillage des calques (position/contenu)
├── shapes/
│   ├── paths.ts            # Constantes SVG (coeur, hexagone)
│   ├── factories.ts        # Création d'objets (rect, circle, image...)
│   └── shapeWheel.ts       # Cycle entre les formes
├── clipping/
│   ├── antiScale.ts        # Compensation du scale pour les clips
│   └── clipStrategies.ts   # Stratégies de clip (circle, heart, etc.)
├── controls/
│   ├── cropControls.ts     # Contrôles de recadrage
│   └── CustomTextbox.ts    # Extension IText avec layerId
├── types.ts                # Interfaces TypeScript
└── index.ts                # Exports publics
```

## Utilisation

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

// Remplacer la source d'une image existante
await editor.layers.replaceImageSource(imageObject, newUrl);

// Supprimer la sélection
editor.deleteSelection();

// Ordonner les calques
editor.layers.bringForward(obj);
editor.layers.sendBackward(obj);
```

### Sélection

```typescript
// Objet actuellement sélectionné
const obj = editor.selection.current;

// Tous les objets sélectionnés
const objects = editor.selection.selected;

// Callbacks
editor.selection.onSelect = (obj) => { /* ... */ };
editor.selection.onDeselect = () => { /* ... */ };
editor.selection.onTransformStart = () => { /* cacher la barre de contrôles */ };
editor.selection.onModified = () => { /* réafficher la barre */ };

// Contrôles disponibles selon le type d'objet
const controls = editor.selection.getAvailableControls();
// => ["clip", "color", "font", "outline"]
```

### Modification d'objets

```typescript
// Changer la couleur
editor.changeColor("#ff0000");

// Changer l'opacité (0-100)
editor.changeOpacity(50);

// Changer la police (texte uniquement)
editor.changeFont("Roboto", "bold");

// Basculer remplissage/contour
editor.toggleOutline();

// Changer la forme du clip (images)
editor.switchClip();

// Changer le type de forme
editor.switchShape();
```

### Verrouillage des calques

Le module `locking.ts` permet de verrouiller les calques avec 3 modes :

| Mode | Position | Contenu (image) | Forme/Z-index | Cas d'usage |
|------|----------|-----------------|---------------|-------------|
| `free` | Modifiable | Modifiable | Modifiable | Comportement par défaut |
| `position` | Verrouillée | Modifiable | Verrouillé | Template : l'utilisateur peut changer l'image mais pas la déplacer ni modifier la forme |
| `full` | Verrouillée | Verrouillé | Verrouillé | Élément fixe non modifiable |

**Restrictions par mode :**

- **`position` et `full`** : bloquent le changement de forme (`switchShape`, `switchClip`) et de z-index (`up`, `down`)
- **`full` uniquement** : bloque également le repositionnement de l'image dans son cadre (ImageFrame) et le remplacement par drag & drop

```typescript
import {
  getLockMode,
  getNextLockMode,
  applyLockMode,
  isContentLocked,
  isPositionLocked,
  type LockMode
} from "@frabr/fabric-editor";

// Récupérer le mode actuel
const mode = getLockMode(obj); // "free" | "position" | "full"

// Passer au mode suivant (cycle: free → position → full → free)
const nextMode = getNextLockMode(mode);

// Appliquer un mode
applyLockMode(obj, "position");

// Vérifications
if (isContentLocked(obj)) {
  // Ne pas permettre le remplacement d'image
}
if (isPositionLocked(obj)) {
  // Ne pas permettre le déplacement
}

// Via LayerManager (méthode wrapper)
editor.layers.applyLockMode(obj, "full");
```

**Propriétés Fabric.js affectées :**
- `lockMovementX`, `lockMovementY` : empêche le déplacement
- `lockRotation` : empêche la rotation
- `lockScalingX`, `lockScalingY` : empêche le redimensionnement
- `hasControls` : masque les poignées de contrôle

**Propriétés custom :**
- `lockMode` : stocke le mode actuel ("free" | "position" | "full")
- `lockContent` : `true` si le contenu est verrouillé (bloque le remplacement d'image)

**Sérialisation :**

Les propriétés `lockMode` et `lockContent` sont sérialisées avec les layers et restaurées au chargement.

```typescript
// Sérialisation automatique
const layers = editor.layers.serialize();
// => [{ type: "image", lockMode: "position", lockContent: false, ... }]

// Au chargement, les locks sont automatiquement réappliqués
await editor.layers.loadLayers(layers);
```

### Persistance

```typescript
// Sauvegarder
const result = await editor.persistence.save({
  rasterize: true, // Génère un dataUrl PNG
});
// result.layers : LayerData[]
// result.dataUrl : string (si rasterize=true)

// Exporter en JSON
const json = editor.persistence.exportLayersJSON();

// Importer du JSON
await editor.persistence.importLayersJSON(json);

// Compacter autour des calques (mode standalone)
editor.persistence.compactAroundLayers();

// Réinitialiser
editor.persistence.reset();
```

### Masques

```typescript
// Configurer le masque
await editor.masks.setup(containerElement, maxSize);

// Appliquer un masque
await editor.masks.applyMask(maskUrl);
```

## Drag & Drop d'images

L'`ImageDropHandler` gère le drag & drop d'images avec deux modes :

```typescript
import { ImageDropHandler } from "@frabr/fabric-editor";

const dropHandler = new ImageDropHandler(editor, {
  hoverDelay: 1000, // ms avant activation du mode remplacement
  getImageUrl: (file) => pendingUploads.add(file), // blob URL
  overlayElement: document.getElementById("replace-overlay"), // optionnel
  overlayContent: "Remplacer", // texte par défaut si pas d'overlayElement
  onSuccess: () => console.log("Image ajoutée/remplacée"),
  onError: (err) => console.error(err),
});

// Attacher à un élément
dropHandler.attach(containerElement);

// Nettoyer
dropHandler.detach();
```

**Comportement :**
- **Drop rapide** (< 1s sur une image) : ajoute une nouvelle image à la position du drop
- **Drop après attente** (>= 1s sur une image) : remplace l'image survolée

Pendant le survol prolongé, un overlay visuel apparaît sur l'image cible avec le texte "Remplacer".

**Note :** Si l'image cible a `lockContent: true` (mode de verrouillage `full`), le mode remplacement ne s'active pas.

## Lazy Upload (PendingUploadsManager)

Les images sont uploadées vers Cloudinary uniquement à la sauvegarde, pas au moment du drop :

```typescript
import { PendingUploadsManager } from "@frabr/fabric-editor";

const pendingUploads = new PendingUploadsManager(async (file) => {
  // Upload vers Cloudinary et retourner l'URL
  return await cloudinaryUpload(file);
});

// Pendant l'édition : utiliser des blob URLs
const blobUrl = pendingUploads.add(file);
await editor.layers.addImage(blobUrl);

// À la sauvegarde : uploader et remplacer les URLs
const urlMap = await pendingUploads.uploadAll();
const layers = PendingUploadsManager.replaceUrls(editor.layers.exportData(), urlMap);

// Si l'utilisateur abandonne
pendingUploads.clear(); // Libère les blob URLs sans uploader
```

**Avantages :**
- UX réactive (pas d'attente à l'ajout d'image)
- Économie de bande passante (n'upload que si sauvegarde)
- Gestion propre des ressources (blob URLs libérées)

## Positionnement d'éléments HTML sur le canvas

Pour positionner des contrôles HTML au-dessus d'objets Fabric :

```typescript
// Positionner un élément centré sur l'objet
editor.positionElementOverObject(element, fabricObject);

// Positionner au-dessus avec offset
editor.positionElementOverObject(element, fabricObject, {
  anchor: "top",
  offset: 8,
  autoFlip: true, // bascule en bas si pas assez d'espace en haut
});

// Options d'ancrage : "center" | "top" | "bottom"
```

Le contrôle de rotation a été déplacé sur le côté droit de l'objet pour éviter les conflits avec la barre de contrôles positionnée au-dessus.

## Types de formes

Le cycle des formes (`shapeWheel`) :

```
rect → rounded → circle → heart → hexagon → rect → ...
```

Chaque forme peut être utilisée comme :
- Objet indépendant (`addShape`)
- Clip sur une image (`switchClip`)

## Tests

Les tests sont colocalisés avec le code source :

```bash
npm test        # Mode watch
npm run test:run    # Exécution unique
```

Fichiers de test :
- `shapes/shapeWheel.test.ts`
- `clipping/antiScale.test.ts`
- `LayerManager.test.ts`

## Development

```bash
npm install
npm run build
npm test
```
