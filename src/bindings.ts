import { util, type FabricObject } from "#fabric";
import { drawFrameBadge, paintBadge } from "./ui/badges";

/**
 * Les bindings du dialecte template (apibots, plan media-template-generators §4) : un calque
 * peut porter `bindings` — { champ: { expr, scope, resolved } } — et le champ stocké reste
 * une valeur plate (le sample), donc le canvas rend le calque tel quel. L'éditeur, lui, doit
 * SAVOIR qu'un champ est lié :
 *
 * - la donnée voyage avec le calque (sérialisation/désérialisation, comme layerId) ;
 * - un texte lié s'édite dans sa textbox, valeurs affichées : l'hôte reporte les frappes dans
 *   l'expression et pose ses variables comme plages atomiques (`tokenSpans`, CustomTextbox) ;
 * - le lien se voit : un badge au coin du cadre (survol, sélection), dans la couleur d'édition
 *   (guideColor), et un liseré permanent sur les médias dynamiques.
 */

/** `media` : ce qu'une image liée désigne — le rang d'une photo du sujet, `"each"`, le nom
 *  d'une image du lecteur (cf. imageSlots), ou `"draw"` : une image que l'hôte tire, parmi
 *  `candidates` (ses nœuds de média, opaques ici) quand le binding en porte, parmi les images
 *  du sujet sinon. `key` : la liste d'images du sujet que la référence lit, quand il en a
 *  plusieurs (absente : sa liste par défaut). `hint` : la consigne d'une image à fournir
 *  (scope `user`, cf. userSlots). Un `text` de scope `user` est un texte à personnaliser
 *  (userTexts). */
export type BindingSpec = {
  expr?: string; scope?: string; resolved?: boolean; hint?: string; media?: number | string; key?: string;
  candidates?: unknown[];
};

/** `media` d'une image tirée, parmi les candidates du binding ou parmi les images du sujet. */
export const DRAW_MEDIA = "draw";
export type Bindings = Record<string, BindingSpec>;

export function pendingBindings(obj: FabricObject): Bindings {
  const bindings = (obj.get("bindings") as Bindings) || {};
  return Object.fromEntries(Object.entries(bindings).filter(([, spec]) => spec?.resolved !== true));
}

export function hasPendingBindings(obj: FabricObject): boolean {
  return Object.keys(pendingBindings(obj)).length > 0;
}

/** Restaure les bindings depuis le JSON. */
export function restoreBindings(obj: FabricObject, data: { bindings?: Bindings } & Record<string, unknown>): void {
  if (!data.bindings) return;

  obj.set("bindings", data.bindings);
}

/**
 * Pose un texte par programme et REMET LA MISE EN PAGE À JOUR : un `set("text", …)` nu ne
 * remesure pas l'objet et n'émet pas l'événement `changed` que les sessions de layout
 * écoutent — le conteneur (hug) garderait son ancienne taille alors que le texte a grandi.
 * C'est le verbe qu'utilise l'aperçu live d'une expression liée (apibots, §9).
 */
export function setTextContent(obj: FabricObject, text: string): void {
  if (!("text" in obj)) return;

  // Un texte posé par programme n'est plus l'exemple de départ (CustomTextbox#placeholder).
  const current = obj as unknown as { text?: string; placeholder?: boolean };
  if (current.placeholder && current.text !== text) obj.set("placeholder", false);
  obj.set("text", text);
  // Remesure immédiate (fabric ne le fait qu'à l'édition interactive), puis on prévient les
  // écouteurs — c'est ce que la mise en page consomme pour se recalculer.
  (obj as unknown as { initDimensions?: () => void }).initDimensions?.();
  obj.setCoords();
  (obj as unknown as { fire: (name: string) => void }).fire("changed");
}

/**
 * Le badge de liaison (cf. ui/badges : sous les poignées, avec le cadre) : il nomme les
 * tokens liés ($NOM), les images liées (`media 3`, `avatar`), les images à fournir et les
 * textes à personnaliser du calque.
 */
export function bindingBadgeLabel(obj: FabricObject, labels: BindingLabels = {}): string | null {
  if (!hasPendingBindings(obj)) return null;

  return bindingLabel(obj, labels);
}

/** Peint le badge de liaison d'un calque (la couche des badges le fait pour l'éditeur). */
export function drawBindingBadge(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  color: string,
  labels: BindingLabels = {},
): void {
  const label = bindingBadgeLabel(obj, labels);
  if (label) drawFrameBadge(ctx, obj, label, color);
}

/** Les mots des badges d'un calque lié — l'hôte passe ses traductions
 *  (`EditorConfig.userSlotLabel`, `userTextLabel`, `mediaLabels`). */
export interface BindingLabels {
  userSlot?: string;
  userText?: string;
  media?: MediaLabels;
}

/** Les mots d'une image tirée, à traduire par l'hôte : `draw` pour un tirage parmi les images
 *  du sujet (`%{list}` : la liste lue), `drawAmong` pour un tirage parmi les candidates du
 *  binding (`%{count}` : leur nombre). */
export interface MediaLabels {
  draw?: string;
  drawAmong?: string;
}

export const DEFAULT_MEDIA_LABELS: Required<MediaLabels> = { draw: "%{list} au hasard", drawAmong: "1 parmi %{count}" };

export const DEFAULT_USER_SLOT_LABEL = "À fournir";
export const DEFAULT_USER_TEXT_LABEL = "À personnaliser";

/** Le nom d'une image liée : `media 3`, `media i` (l'itération), `media au hasard` (une image
 *  tirée parmi celles du sujet), `1 parmi 7` (tirée parmi les candidates du binding), ou le
 *  nom de l'image du lecteur (`avatar`). Une référence qui dit sa liste (`key`) la nomme à la
 *  place de `media` : `galerie 3`. C'est ce que le badge et la timeline de l'hôte affichent ;
 *  les mots d'un tirage sont ceux de l'hôte (`labels`), le français à défaut. */
export function mediaLabel(spec: BindingSpec, labels: MediaLabels = {}): string {
  const list = spec.key || "media";
  if (typeof spec.media === "number") return `${list} ${spec.media}`;
  if (spec.media === "each") return `${list} i`;
  if (spec.media !== DRAW_MEDIA) return String(spec.media ?? "");
  if (!Array.isArray(spec.candidates)) return (labels.draw ?? DEFAULT_MEDIA_LABELS.draw).replace("%{list}", list);

  return (labels.drawAmong ?? DEFAULT_MEDIA_LABELS.drawAmong).replace("%{count}", String(spec.candidates.length));
}

function bindingLabel(obj: FabricObject, { userSlot, userText, media }: BindingLabels): string {
  const labels = Object.entries(pendingBindings(obj)).flatMap(([field, spec]) => {
    if (spec?.scope === "user") {
      return [field === "text" ? userText ?? DEFAULT_USER_TEXT_LABEL : userSlot ?? DEFAULT_USER_SLOT_LABEL];
    }
    if (spec?.media !== undefined) return [mediaLabel(spec, media)];
    return String(spec?.expr ?? "").match(/\$\w+/g) || [];
  });
  return labels.length ? [...new Set(labels)].join(" ") : "$";
}

/**
 * Le liseré des MÉDIAS dynamiques : un pointillé permanent dans la couleur d'édition autour
 * des calques dont un champ image est lié — le cadre dessine son emplacement ou montre la
 * valeur du lecteur (imageSlots), le liseré dit « celle-ci sera remplie à la publication ».
 *
 * Il suit le calque tel qu'il est peint : rien pour un calque masqué (hors de sa fenêtre de
 * temps dans l'éditeur vidéo), la forme de découpe d'une ImageFrame (un cercle reste un
 * cercle), et la position calculée au moment du dessin — viewport compris : les oCoords ne
 * sont recalculées qu'au setCoords, un redimensionnement du canvas les laissait en arrière.
 * Le tracé se fait dans le repère du calque, le trait dans celui de l'écran : épaisseur et
 * pointillé constants, quels que soient le zoom et l'échelle du calque.
 */
export function drawDynamicMediaOutline(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  color: string,
): void {
  if (!obj.visible || !obj.canvas) return;
  const pending = pendingBindings(obj);
  if (!Object.keys(pending).some((field) => field.startsWith("image."))) return;

  const screen = ctx.getTransform();
  ctx.save();
  ctx.transform(...(obj.canvas.viewportTransform as [number, number, number, number, number, number]));
  obj.transform(ctx);
  ctx.beginPath();
  traceOutline(ctx, obj);
  ctx.setTransform(screen);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.restore();
}

/**
 * Le badge PERMANENT d'un média dynamique inerte (le fond d'une page : ni survol ni sélection,
 * donc jamais de cadre ni de badge de cadre) : sans lui, un fond qui montre une valeur — la
 * première candidate d'une image tirée — passerait pour une image fixe. Posé DANS le coin
 * haut-gauche du calque (un fond plein cadre n'a rien au-dessus de lui), à la position
 * calculée au moment du dessin, comme le liseré.
 */
export function drawInertMediaBadge(
  ctx: CanvasRenderingContext2D,
  obj: FabricObject,
  color: string,
  labels: BindingLabels = {},
): void {
  if (obj.evented !== false || !obj.visible || !obj.canvas) return;
  if (!Object.keys(pendingBindings(obj)).some((field) => field.startsWith("image."))) return;

  const corner = util.transformPoint(obj.getCoords()[0], obj.canvas.viewportTransform);
  paintBadge(ctx, corner.x, corner.y, bindingLabel(obj, labels), color);
}

type Traceable = FabricObject & {
  rx?: number;
  ry?: number;
  radius?: number;
  _renderPathCommands?: (ctx: CanvasRenderingContext2D) => void;
};

/** Le contour du calque dans son repère : sa découpe (clipPath d'une ImageFrame) s'il en a
 *  une, son cadre sinon. */
function traceOutline(ctx: CanvasRenderingContext2D, obj: FabricObject): void {
  const shape = obj.clipPath as Traceable | undefined;
  if (!shape) {
    ctx.rect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    return;
  }

  shape.transform(ctx);
  if (shape._renderPathCommands) {
    // Le chemin se trace centré : _renderPathCommands retranche lui-même le pathOffset.
    shape._renderPathCommands(ctx);
  } else if (typeof shape.radius === "number") {
    ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
  } else {
    const radius = Math.min(shape.rx ?? 0, shape.width / 2, shape.height / 2);
    ctx.roundRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height, radius);
  }
}
