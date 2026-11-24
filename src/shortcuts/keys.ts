/**
 * Les combinaisons de touches : leur écriture déclarative (`mod+shift+z`, `Delete`,
 * `shift+ArrowUp`, `Space`), leur reconnaissance sur un KeyboardEvent, et leur affichage
 * selon la plateforme (`⌘⇧Z` sur Mac, `Ctrl+Shift+Z` ailleurs).
 *
 * `mod` est la touche de commande de la plateforme : ⌘ sur Mac, Ctrl ailleurs. Les
 * modificateurs doivent correspondre EXACTEMENT : `mod+z` ne reconnaît pas ⌘⇧Z.
 */
export type Platform = "mac" | "other";
export type Modifier = "mod" | "shift" | "alt";

export interface KeyCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/** Les touches nommées, telles que KeyboardEvent.key les donne ; `Space` est un alias de " ". */
const ALIASES: Record<string, string> = { space: " ", esc: "Escape", del: "Delete" };
const NAMED = ["Delete", "Backspace", "Escape", "Enter", "Tab", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export function parseCombo(combo: string): KeyCombo {
  const parts = combo.split("+");
  const raw = parts.pop() ?? "";
  const lower = raw.toLowerCase();
  const named = NAMED.find((name) => name.toLowerCase() === lower);
  const key = ALIASES[lower] ?? named ?? (raw.length === 1 ? lower : raw);
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  return { key, mod: mods.has("mod"), shift: mods.has("shift"), alt: mods.has("alt") };
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Le modificateur de commande de la plateforme est-il enfoncé ? */
export function modPressed(e: Pick<KeyLike, "metaKey" | "ctrlKey">, platform: Platform): boolean {
  return platform === "mac" ? e.metaKey : e.ctrlKey;
}

export function matchesCombo(combo: KeyCombo, e: KeyLike, platform: Platform): boolean {
  if (combo.mod !== modPressed(e, platform)) return false;
  if (combo.shift !== e.shiftKey || combo.alt !== e.altKey) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return key === combo.key;
}

export function detectPlatform(nav: { platform?: string; userAgent?: string } | undefined = globalThis.navigator): Platform {
  const hint = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(hint) ? "mac" : "other";
}

/* ---------- l'affichage ---------- */

const KEY_NAMES: Record<string, string> = {
  " ": "Espace", Escape: "Échap", Enter: "↵", Backspace: "⌫", Delete: "Suppr",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Tab: "Tab", Home: "Début", End: "Fin",
};

/** Une combinaison telle qu'on l'écrit pour l'utilisateur : `⌘⇧Z`, `Ctrl+Shift+Z`, `⇧↑`. */
export function formatCombo(combo: KeyCombo, platform: Platform): string {
  const key = KEY_NAMES[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  if (platform === "mac") {
    return `${combo.mod ? "⌘" : ""}${combo.alt ? "⌥" : ""}${combo.shift ? "⇧" : ""}${key}`;
  }
  return [combo.mod && "Ctrl", combo.alt && "Alt", combo.shift && "Shift", key].filter(Boolean).join("+");
}

/** Plusieurs écritures d'un même raccourci : `⌫ ou Suppr`. */
export function formatCombos(combos: KeyCombo[], platform: Platform): string {
  return combos.map((combo) => formatCombo(combo, platform)).join(" ou ");
}

export function formatModifier(modifier: Modifier, platform: Platform): string {
  if (platform === "mac") return { mod: "⌘", shift: "⇧", alt: "⌥" }[modifier];
  return { mod: "Ctrl", shift: "Shift", alt: "Alt" }[modifier];
}
