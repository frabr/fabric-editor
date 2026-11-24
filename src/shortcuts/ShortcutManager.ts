/**
 * Le gestionnaire des raccourcis d'un éditeur : une table déclarative (ShortcutEntry) qu'il
 * fait vivre — les touches sur `keydown`, les gestes de souris à la demande du code des
 * gestes — et qu'il rend consultable (étiquettes selon la plateforme, raccourci d'un outil).
 *
 * Plusieurs entrées peuvent répondre à la même touche (Échap : fermer un menu, puis
 * désélectionner) : toutes celles dont la portée convient s'exécutent, dans l'ordre
 * d'enregistrement ; l'événement est consommé dès qu'une l'a prise (`run` ≠ false).
 *
 * Ce qui compte comme « en saisie » : un champ de formulaire, un élément éditable, et le
 * textarea caché de fabric (la saisie d'un texte du canvas) — là, seules les entrées
 * `editing` et `always` tirent ; dans un champ ordinaire, `always` seulement.
 */
import type { FabricEditor } from "../FabricEditor";
import { detectPlatform, formatCombos, matchesCombo, parseCombo, type KeyCombo, type KeyLike, type Platform } from "./keys";
import { CANVAS_SHORTCUTS, isKeyShortcut, type GestureShortcut, type KeyShortcut, type ShortcutEntry, type ShortcutScope } from "./table";

type Scope = "canvas" | "editing" | "field";

interface Bound {
  entry: KeyShortcut;
  combos: KeyCombo[];
}

export interface ShortcutManagerOptions {
  /** Les entrées de départ (défaut : CANVAS_SHORTCUTS). */
  entries?: ShortcutEntry[];
  /** Où écouter les touches — injectable pour les tests. */
  doc?: Pick<Document, "addEventListener" | "removeEventListener">;
  platform?: Platform;
}

export class ShortcutManager {
  readonly platform: Platform;
  private readonly doc: ShortcutManagerOptions["doc"];
  private list: ShortcutEntry[] = [];
  private bound: Bound[] = [];
  private readonly onKeyDown = (e: Event) => { void this.handle(e as KeyboardEvent); };

  constructor(private readonly editor: FabricEditor, options: ShortcutManagerOptions = {}) {
    this.platform = options.platform ?? detectPlatform();
    this.doc = options.doc ?? (typeof document !== "undefined" ? document : undefined);
    this.register(options.entries ?? CANVAS_SHORTCUTS);
    this.doc?.addEventListener("keydown", this.onKeyDown);
  }

  /** Ajoute des entrées (celles de l'hôte) ; rend de quoi les retirer. */
  register(entries: ShortcutEntry[]): () => void {
    this.list = [...this.list, ...entries];
    this.rebind();
    return () => {
      this.list = this.list.filter((entry) => !entries.includes(entry));
      this.rebind();
    };
  }

  /** La table, consultable. */
  entries(): readonly ShortcutEntry[] { return this.list; }

  keyEntries(): KeyShortcut[] { return this.list.filter(isKeyShortcut); }

  gestures(): GestureShortcut[] { return this.list.filter((entry): entry is GestureShortcut => !isKeyShortcut(entry)); }

  /** L'étiquette d'un raccourci (« ⌘D », « ⌫ ou Suppr »), null s'il n'existe pas. */
  labelFor(id: string): string | null {
    const found = this.bound.find((item) => item.entry.id === id);
    return found ? formatCombos(found.combos, this.platform) : null;
  }

  /** L'étiquette du raccourci qui double un outil de la barre. */
  labelForTool(tool: string): string | null {
    const found = this.bound.find((item) => item.entry.tool === tool);
    return found ? formatCombos(found.combos, this.platform) : null;
  }

  /** Un geste déclaré est-il demandé par les touches tenues pendant l'événement ? */
  gesture(id: string, e: Pick<KeyLike, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
    const found = this.gestures().find((entry) => entry.id === id);
    if (!found) return false;
    return found.modifiers.every((modifier) => {
      if (modifier === "mod") return this.platform === "mac" ? e.metaKey : e.ctrlKey;
      return modifier === "shift" ? e.shiftKey : e.altKey;
    });
  }

  /** Traite une touche ; vrai si une entrée l'a prise (l'événement est alors consommé). */
  async handle(e: KeyboardEvent): Promise<boolean> {
    const scope = scopeOf(e);
    let handled = false;
    for (const { entry, combos } of this.bound) {
      if (!allowed(entry.when ?? "canvas", scope)) continue;
      if (!combos.some((combo) => matchesCombo(combo, e, this.platform))) continue;
      const result = await entry.run({
        editor: this.editor, event: e, shift: e.shiftKey, alt: e.altKey,
        mod: this.platform === "mac" ? e.metaKey : e.ctrlKey,
      });
      if (result !== false) {
        handled = true;
        e.preventDefault();
      }
    }
    return handled;
  }

  dispose(): void {
    this.doc?.removeEventListener("keydown", this.onKeyDown);
    this.list = [];
    this.bound = [];
  }

  private rebind(): void {
    this.bound = this.keyEntries().map((entry) => ({ entry, combos: entry.keys.map(parseCombo) }));
  }
}

function allowed(when: ShortcutScope, scope: Scope): boolean {
  if (when === "always") return true;
  if (scope === "canvas") return true;
  return when === "editing" && scope === "editing";
}

/** Où la touche a été tapée : sur le canvas, dans la saisie d'un texte du canvas, dans un champ. */
function scopeOf(e: KeyboardEvent): Scope {
  const target = e.target as HTMLElement | null;
  if (!target || typeof target.closest !== "function") return "canvas";
  const field = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  if (!field) return "canvas";
  return target.closest(".canvas-container") ? "editing" : "field";
}
