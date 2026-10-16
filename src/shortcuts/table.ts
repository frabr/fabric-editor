/**
 * La table des raccourcis : chaque entrée est une DONNÉE — consultable (une page d'aide,
 * l'infobulle d'un outil : `tool`), reliée à un outil de la barre, et pilotée par
 * ShortcutManager. Deux sortes d'entrées :
 * - une touche (`keys`), qui exécute `run` ;
 * - un geste de souris (`gesture` + `modifiers`), que le code des gestes interroge
 *   (`shortcuts.gesture("duplicate-on-drag", e)`) — la table pilote, elle ne décrit pas.
 *
 * La portée (`when`) : `canvas` (défaut) ne tire ni dans un champ ni pendant la saisie
 * d'un texte ; `editing` tire aussi pendant la saisie d'un texte du canvas (⌘Z en sort et
 * annule) ; `always` partout.
 *
 * Les entrées de la lib (CANVAS_SHORTCUTS) : ce que tout éditeur fabric sait faire. L'hôte
 * y ajoute les siennes (annuler, lecture, timeline…) par `register`.
 */
import type { FabricEditor } from "../FabricEditor";
import type { ToolId } from "../tools";
import type { Modifier } from "./keys";

export type ShortcutGroup = "select" | "edit" | "move" | "text" | "image" | "view" | "timeline";
export type ShortcutScope = "canvas" | "editing" | "always";
export type Gesture = "drag" | "resize" | "rotate" | "wheel" | "dblclick";

export interface ShortcutContext {
  editor: FabricEditor;
  event: KeyboardEvent;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface KeyShortcut {
  id: string;
  keys: string[];
  group: ShortcutGroup;
  /** L'outil de la barre qu'il double : son infobulle montre la touche. */
  tool?: ToolId | string;
  when?: ShortcutScope;
  /** false : « pas pour moi » — l'événement n'est pas consommé par cette entrée. */
  run: (ctx: ShortcutContext) => void | boolean | Promise<void | boolean>;
}

export interface GestureShortcut {
  id: string;
  gesture: Gesture;
  modifiers: Modifier[];
  group: ShortcutGroup;
}

export type ShortcutEntry = KeyShortcut | GestureShortcut;

export const isKeyShortcut = (entry: ShortcutEntry): entry is KeyShortcut => "keys" in entry;

const nudge = (dx: number, dy: number) => (ctx: ShortcutContext) => {
  const step = ctx.shift ? 10 : 1;
  return ctx.editor.nudgeSelection(dx * step, dy * step);
};

/** Ce que tout canvas fabric sait faire au clavier. */
export const CANVAS_SHORTCUTS: ShortcutEntry[] = [
  { id: "delete", keys: ["Delete", "Backspace"], group: "edit", tool: "delete",
    run: ({ editor }) => editor.selection.hasSelection && (editor.deleteSelection(), true) },
  { id: "duplicate", keys: ["mod+d"], group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (void editor.duplicateSelection(), true) },
  { id: "copy", keys: ["mod+c"], group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (editor.copySelection(), true) },
  { id: "cut", keys: ["mod+x"], group: "edit",
    run: ({ editor }) => editor.selection.hasSelection && (editor.cutSelection(), true) },
  { id: "paste", keys: ["mod+v"], group: "edit", run: ({ editor }) => { void editor.pasteClipboard(); } },
  { id: "select-all", keys: ["mod+a"], group: "select", run: ({ editor }) => editor.selectAll().length > 0 },
  { id: "deselect", keys: ["Escape"], group: "select",
    run: ({ editor }) => editor.selection.hasSelection && (editor.deselect(), true) },
  { id: "group", keys: ["mod+g"], group: "edit", tool: "group", run: ({ editor }) => editor.groupSelection() !== null },
  { id: "ungroup", keys: ["mod+shift+g"], group: "edit", tool: "ungroup",
    run: ({ editor }) => editor.ungroupSelection().length > 0 },
  { id: "nudge-left", keys: ["ArrowLeft", "shift+ArrowLeft"], group: "move", run: nudge(-1, 0) },
  { id: "nudge-right", keys: ["ArrowRight", "shift+ArrowRight"], group: "move", run: nudge(1, 0) },
  { id: "nudge-up", keys: ["ArrowUp", "shift+ArrowUp"], group: "move", run: nudge(0, -1) },
  { id: "nudge-down", keys: ["ArrowDown", "shift+ArrowDown"], group: "move", run: nudge(0, 1) },
];
