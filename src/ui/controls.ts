/**
 * Canva-style object controls: rounded pill handles with animated
 * hover feedback, full-side edge hit areas, and hover borders.
 *
 * Call `applyControlStyle(canvas, guideColor)` once after creating
 * the DesignCanvas to install all behaviours.
 */
import { FabricObject, Control, controlsUtils, type TPointerEvent } from "#fabric";
import type { DesignCanvas } from "../DesignCanvas";
import { parseHex, hexAlpha } from "./color";
import { bindingBadgeLabel, drawDynamicMediaOutline } from "../bindings";
import { installBadgeLayer } from "./badges";
import { isFreeContainer } from "../layout/types";
import { getLockMode } from "../locking";

// ── Public entry point ─────────────────────────────────────────────

/** Optional callback to redirect hover targets (e.g. child → container). */
export type ResolveTargetFn = (obj: FabricObject) => FabricObject;

export function applyControlStyle(
  canvas: DesignCanvas,
  guideColor: string,
  resolveTarget?: ResolveTargetFn,
  userSlotLabel?: string,
): void {
  const gc = guideColor;

  // Defaults
  FabricObject.ownDefaults.borderColor = gc;
  FabricObject.ownDefaults.borderScaleFactor = 2;
  FabricObject.ownDefaults.borderOpacityWhenMoving = 1;
  FabricObject.ownDefaults.cornerColor = "#ffffff";
  FabricObject.ownDefaults.cornerStrokeColor = "#000000";
  FabricObject.ownDefaults.transparentCorners = false;
  FabricObject.ownDefaults.cornerSize = 16;

  // Install custom control renderer
  const hoverProgress = new WeakMap<Control, number>();
  installControlRenderer(gc, hoverProgress);

  // Wire up canvas events
  installControlHitAreas(canvas);
  installHoverAnimation(canvas, hoverProgress);
  installHoverBorder(canvas, gc, resolveTarget, userSlotLabel);
}

// ── Custom control renderer ────────────────────────────────────────

const EDGE_CONTROLS = new Set(["mt", "mb", "ml", "mr"]);
const CORNER_CONTROLS = new Set(["tl", "tr", "bl", "br"]);
const DEFAULT_COLOR = "#ffffff";
const HOVER_DELAY = 60;   // ms — just enough to ignore fast cursor pass-through
const ANIM_SPEED = 10;    // fast transition once delay elapsed

function installControlRenderer(
  gc: string,
  hoverProgress: WeakMap<Control, number>,
): void {
  const [activeR, activeG, activeB] = parseHex(gc);
  const hoverStart = new WeakMap<Control, number>();

  Control.prototype.render = function (
    this: Control, ctx, left, top, styleOverride, fabricObject,
  ) {
    // Hide handles while moving (border stays visible)
    if (fabricObject.isMoving) return;

    const baseColor = styleOverride?.cornerColor ?? fabricObject.cornerColor;
    const isDefault = baseColor === DEFAULT_COLOR;
    const hoveredCtrl = isDefault && fabricObject.__corner
      ? fabricObject.controls[fabricObject.__corner]
      : undefined;
    const isHovered = hoveredCtrl === this;
    const now = performance.now();

    // Detect if this control is being dragged
    const cvs = fabricObject.canvas as any;
    const transform = cvs?._currentTransform;
    const isGrabbed = transform
      && transform.target === fabricObject
      && transform.corner
      && fabricObject.controls[transform.corner] === this;

    // Track hover start time
    if (isHovered && !hoverStart.has(this)) {
      hoverStart.set(this, now);
    } else if (!isHovered && !isGrabbed) {
      hoverStart.delete(this);
    }

    // Grabbed: lock at 1. Otherwise: delay then animate.
    const elapsed = isHovered ? now - (hoverStart.get(this) ?? now) : 0;
    const target = isGrabbed ? 1
      : isHovered && elapsed >= HOVER_DELAY ? 1 : 0;

    const prev = hoverProgress.get(this) ?? 0;
    const dt = 1 / 60;
    const t = Math.min(1, ANIM_SPEED * dt);
    const progress = prev + (target - prev) * t;
    hoverProgress.set(this, progress);

    // Interpolate fill color
    const p = progress;
    const r = Math.round(255 + (activeR - 255) * p);
    const g = Math.round(255 + (activeG - 255) * p);
    const b = Math.round(255 + (activeB - 255) * p);
    const fill = isDefault ? `rgb(${r}, ${g}, ${b})` : baseColor;

    // Find control key for this instance
    let key = "";
    for (const [k, c] of Object.entries(fabricObject.controls)) {
      if (c === this) { key = k; break; }
    }

    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabricObject.getTotalAngle() * Math.PI / 180);

    let w: number, h: number, cr: number;
    if (EDGE_CONTROLS.has(key)) {
      const long = 20, short = 8;
      const horizontal = key === "mt" || key === "mb";
      w = horizontal ? long : short;
      h = horizontal ? short : long;
      cr = short / 2;
    } else if (CORNER_CONTROLS.has(key)) {
      w = 12; h = 12; cr = 3;
    } else {
      w = 10; h = 10; cr = 3;
    }

    const x = -w / 2, y = -h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, cr);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  };
}

// ── Groups ──────────────────────────────────────────────────────────

/**
 * Un groupe ne se redimensionne que par les coins (uniforme : son contenu absorbe
 * l'agrandissement sans se déformer) et ne tourne pas. À rappeler quand un objet
 * devient ou cesse d'être un groupe.
 */
export function syncGroupControls(obj: FabricObject): void {
  const group = isFreeContainer(obj);
  obj.setControlsVisibility({ ml: !group, mr: !group, mt: !group, mb: !group, mtr: !group });
  // Hors groupe, la rotation reste celle du verrou
  if (group) obj.lockRotation = true;
  else if (getLockMode(obj) === "free") obj.lockRotation = false;
}

// ── Edge hit areas + rotation control ──────────────────────────────

const HIT_DEPTH = 14;
const CORNER_INSET = 20;
const RESIZING = "resizing";

// ── Resize action handlers ───────────────────────────────────────────

/** Fire resizing event on both the object and the canvas. */
function fireResizing(target: any, e: TPointerEvent, transform: any, x: number, y: number): void {
  target.fire("resizing");
  target.canvas?.fire("object:resizing", { target, e, transform, pointer: { x, y } });
}

/** Corner handler — delegates to the target's handleCornerResize(). */
const resizeBoth = (
  eventData: TPointerEvent,
  transform: any,
  x: number,
  y: number,
): boolean => {
  const { target } = transform;
  const changed = target.handleCornerResize(transform, x, y);
  if (changed) fireResizing(target, eventData, transform, x, y);
  return changed;
};

/** Edge handler — delegates to the target's handleEdgeResize(). */
const resizeEdge = (
  eventData: TPointerEvent,
  transform: any,
  x: number,
  y: number,
): boolean => {
  const { target } = transform;
  const changed = target.handleEdgeResize(transform, x, y);
  if (changed) fireResizing(target, eventData, transform, x, y);
  return changed;
};

function installControlHitAreas(canvas: DesignCanvas): void {
  const createSideRotationControl = () =>
    new Control({
      x: 0.5,
      y: 0,
      offsetX: 30,
      offsetY: 0,
      actionHandler: controlsUtils.rotationWithSnapping,
      cursorStyleHandler: controlsUtils.rotationStyleHandler,
      withConnection: true,
      actionName: "rotate",
    });

  canvas.on("object:added", (e) => {
    const obj = e.target;
    if (!obj?.controls) return;
    if (isFreeContainer(obj)) syncGroupControls(obj);

    // Rotation on the right side
    if (obj.controls.mtr) {
      obj.controls.mtr = createSideRotationControl();
    }

    // Replace scale controls with resize controls — only for objects that actually
    // implement the handleEdgeResize/handleCornerResize contract resizeEdge/resizeBoth
    // delegate to (e.g. FabRect/FabCircle/FabPath). ImageFrame manages its own corner
    // and edge actionHandlers in _setupControls(), so it must be left untouched here.
    const resizingActionName = () => RESIZING;
    if (typeof (obj as any).handleEdgeResize === "function") {
      for (const key of ["ml", "mr", "mt", "mb"]) {
        const ctrl = obj.controls[key];
        if (!ctrl) continue;
        ctrl.actionHandler = resizeEdge;
        ctrl.actionName = RESIZING;
        ctrl.getActionName = resizingActionName;
      }
    }
    if (typeof (obj as any).handleCornerResize === "function") {
      for (const key of ["tl", "tr", "bl", "br"]) {
        const ctrl = obj.controls[key];
        if (!ctrl) continue;
        ctrl.actionHandler = resizeBoth;
        ctrl.actionName = RESIZING;
        ctrl.getActionName = resizingActionName;
      }
    }

    // Edge controls: hit area spans the full side, minus corner zones
    for (const key of ["mt", "mb", "ml", "mr"] as const) {
      const ctrl = obj.controls[key];
      if (!ctrl) continue;
      const horizontal = key === "mt" || key === "mb";
      const origCalc = ctrl.calcCornerCoords.bind(ctrl);
      ctrl.calcCornerCoords = (angle: any, cornerSize: any, cx: any, cy: any, isTouch: any, fObj: any) => {
        const dim = (fObj as any)._calculateCurrentDimensions();
        const along = horizontal ? dim.x : dim.y;
        const edgeLen = Math.max(0, along - CORNER_INSET * 2);
        ctrl.sizeX = horizontal ? edgeLen : HIT_DEPTH;
        ctrl.sizeY = horizontal ? HIT_DEPTH : edgeLen;
        return origCalc(angle, cornerSize, cx, cy, isTouch, fObj);
      };
    }
  });
}

// ── Hover animation loop ───────────────────────────────────────────

function installHoverAnimation(
  canvas: DesignCanvas,
  hoverProgress: WeakMap<Control, number>,
): void {
  let animating = false;
  const tick = () => {
    const active = canvas.getActiveObject();
    if (!active?.controls) { animating = false; return; }
    let needsFrame = false;
    for (const ctrl of Object.values(active.controls)) {
      const p = hoverProgress.get(ctrl) ?? 0;
      if (p > 0.01 && p < 0.99) { needsFrame = true; break; }
      const isHovered = active.__corner
        ? active.controls[active.__corner] === ctrl
        : false;
      if (isHovered && p < 0.99) { needsFrame = true; break; }
    }
    if (needsFrame) {
      canvas.requestRenderAll();
      requestAnimationFrame(tick);
    } else {
      animating = false;
    }
  };

  let lastCorner: string | undefined;
  canvas.on("mouse:move", () => {
    const active = canvas.getActiveObject();
    const corner = active?.__corner;
    if (corner !== lastCorner) {
      lastCorner = corner;
      canvas.requestRenderAll();
      if (!animating) {
        animating = true;
        requestAnimationFrame(tick);
      }
    }
  });
}

// ── Hover border on non-selected objects ───────────────────────────

function installHoverBorder(
  canvas: DesignCanvas,
  guideColor: string,
  resolveTarget?: ResolveTargetFn,
  userSlotLabel?: string,
): void {
  let hoveredObj: FabricObject | null = null;

  // Le lasso vit sur le calque du dessus, peint juste avant after:render : on le repeint
  // après l'effacement, sinon il n'apparaît jamais pendant qu'on le trace.
  const clearTopCtx = () => {
    const fc = canvas.originalFabricCanvas as any;
    const ctx = fc.contextTop as CanvasRenderingContext2D;
    if (!ctx) return;
    ctx.clearRect(0, 0, fc.width, fc.height);
    if (fc._groupSelector) fc.renderTopLayer(ctx);
  };

  canvas.on("mouse:over", (e: any) => {
    const raw = e.target as FabricObject | undefined;
    if (!raw) return;
    const target = resolveTarget ? resolveTarget(raw) : raw;
    if (target === canvas.getActiveObject()) return;
    hoveredObj = target;
    canvas.requestRenderAll();
  });

  canvas.on("mouse:out", (e: any) => {
    const raw = e.target as FabricObject | undefined;
    if (!raw) return;
    const resolved = resolveTarget ? resolveTarget(raw) : raw;
    if (resolved === hoveredObj || raw === hoveredObj) {
      hoveredObj = null;
      // Re-render plutôt qu'effacement sec : la passe after:render repeint ce qui doit
      // rester (liserés des médias dynamiques) — un clear nu les faisait disparaître
      // jusqu'au prochain render.
      canvas.requestRenderAll();
    }
  });


  canvas.on("after:render", () => {
    clearTopCtx();
    const ctx = (canvas.originalFabricCanvas as any).contextTop as CanvasRenderingContext2D;
    if (!ctx) return;

    // Les médias dynamiques portent un liseré PERMANENT : l'aperçu montre la vraie image
    // d'exemple, le pointillé dit « remplie à la publication ». L'objet visé (survol,
    // sélection) s'en passe : son cadre plein le remplace, le badge nomme le lien.
    const active = canvas.getActiveObject();
    canvas.getObjects().forEach((obj) => {
      if (obj === active || obj === hoveredObj) return;

      drawDynamicMediaOutline(ctx, obj, guideColor);
    });

    if (!hoveredObj || hoveredObj === active) return;
    (hoveredObj as any)._renderControls(ctx, { hasControls: false, hasBorders: true });
  });

  // Les badges des objets visés, sous les poignées (cf. ui/badges)
  installBadgeLayer(
    canvas.originalFabricCanvas as any,
    guideColor,
    [(obj) => bindingBadgeLabel(obj, userSlotLabel)],
    () => {
      const active = canvas.getActiveObject();
      return [active, hoveredObj !== active ? hoveredObj : null].filter((obj): obj is FabricObject => Boolean(obj));
    },
  );
}
