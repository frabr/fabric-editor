/**
 * Les styles mixtes d'un texte : ce qu'un texte porte par plage de caractères (`styles`
 * de Fabric) en plus de ses propriétés d'objet — police, graisse, italique, souligné,
 * couleur. La taille reste une propriété du texte entier (l'autofit la pilote).
 *
 * Un état de style résume une plage : chaque clé vaut la valeur commune, ou "mixed" quand
 * la plage n'est pas homogène. Les helpers ici sont purs ; les commandes (StyleCommands)
 * décident où un réglage s'applique (la plage sélectionnée, ou le texte entier).
 */

/** Les propriétés qu'une plage de caractères peut porter. */
export const TEXT_STYLE_KEYS = ["fontFamily", "fontWeight", "fontStyle", "underline", "fill"] as const;

export type TextStyleKey = (typeof TEXT_STYLE_KEYS)[number];

export type TextStyleValue = string | number | boolean | undefined;

export const MIXED = "mixed";

/** Le style d'une plage (ou du texte) : une valeur par clé, ou "mixed". */
export type TextStyleState = Record<TextStyleKey, TextStyleValue | typeof MIXED>;

export type StyleDeclaration = Partial<Record<TextStyleKey, TextStyleValue>>;

/** Le `styles` de Fabric à l'exécution (ligne → caractère → déclaration), ou sérialisé
 *  (plages `{ start, end, style }`). */
export type CharStyles = Record<string, Record<string, StyleDeclaration>>;
export type RangeStyles = { start: number; end: number; style: StyleDeclaration }[];

/** Un poids compte comme gras à partir de 600. */
export function isBold(weight: TextStyleValue | typeof MIXED): boolean {
  return weight === "bold" || Number(weight) >= 600;
}

/**
 * Résume des déclarations complètes (objet + caractère) en un état : la valeur commune
 * par clé, "mixed" sinon. Sans déclaration, chaque clé est `undefined`.
 */
export function summarizeStyles(declarations: StyleDeclaration[]): TextStyleState {
  const state = {} as TextStyleState;
  for (const key of TEXT_STYLE_KEYS) {
    const values = new Set(declarations.map((d) => normalize(key, d[key])));
    state[key] = values.size > 1 ? MIXED : [...values][0];
  }
  return state;
}

/**
 * L'état d'un texte hors édition : ses propriétés d'objet, "mixed" là où des caractères
 * en dévient.
 */
export function summarizeObject(object: StyleDeclaration, styles: CharStyles | undefined): TextStyleState {
  const state = {} as TextStyleState;
  for (const key of TEXT_STYLE_KEYS) {
    const base = normalize(key, object[key]);
    const deviates = eachDeclaration(styles).some((d) => key in d && normalize(key, d[key]) !== base);
    state[key] = deviates ? MIXED : base;
  }
  return state;
}

/**
 * Les familles de police qu'utilisent ces calques, styles par caractère compris — ce
 * qu'il faut charger avant de les rendre. Descend dans les groupes.
 */
export function fontFamiliesOf(layers: object[]): string[] {
  const families = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const layer = node as { fontFamily?: unknown; styles?: unknown; objects?: unknown };
    if (typeof layer.fontFamily === "string") families.add(layer.fontFamily);
    for (const d of eachDeclaration(layer.styles)) {
      if (typeof d.fontFamily === "string") families.add(d.fontFamily);
    }
    if (Array.isArray(layer.objects)) layer.objects.forEach(visit);
  };
  layers.forEach(visit);
  return [...families];
}

/** Les déclarations d'un `styles`, quelle que soit sa forme (exécution ou sérialisée). */
function eachDeclaration(styles: unknown): StyleDeclaration[] {
  if (!styles || typeof styles !== "object") return [];
  if (Array.isArray(styles)) {
    return (styles as RangeStyles).map((range) => range.style).filter((s) => !!s && typeof s === "object");
  }
  return Object.values(styles as CharStyles).flatMap((line) => Object.values(line ?? {}));
}

/** Les poids se comparent en chaîne (900 et "900" sont le même poids) ; un souligné absent
 *  vaut faux. */
function normalize(key: TextStyleKey, value: TextStyleValue): TextStyleValue {
  if (key === "fontWeight") return value === undefined ? "normal" : String(value);
  if (key === "fontStyle") return value ?? "normal";
  if (key === "underline") return value === true;
  return value;
}
