/**
 * Le verre dépoli d'une forme (le `backdrop-filter: blur(Npx)` du CSS) : ce qui est peint SOUS la
 * forme se floute dans sa silhouette, puis la forme se dessine par-dessus (son fond translucide
 * teinte le flou).
 *
 * Fabric peint les calques l'un après l'autre sur le même canvas : au tour de la forme, ce qu'elle
 * recouvre est déjà là. On en lit les pixels (la boîte de la forme en pixels du canvas, élargie de
 * trois rayons pour que le flou ait de quoi mélanger), on les floute (le calcul du flou d'image,
 * cf. imageBlur), on les repeint découpés à la silhouette. Pareil dans l'éditeur et en node-canvas
 * (rendu image de creatorstudio).
 *
 * Ne marche PAS là où la forme est rendue seule : les calques vidéo (creatorstudio rend chaque
 * calque à part, posé ensuite sur la vidéo) et le canvas de l'éditeur vidéo, posé au-dessus de
 * l'élément vidéo. Il y faudra le `backdrop-filter` du CSS dans la composition ; d'ici là, le fond
 * translucide de la forme reste le repli.
 */
import { util, type FabricObject } from "#fabric";
import { gaussianApprox } from "../imageBlur";
import { traceShapePath, type PathBuilder } from "./outerShadow";

type Backdropped = FabricObject & { backdropBlur?: number };

export function installBackdropBlur(target: object, buildPath: PathBuilder): void {
  const proto = target as { render(ctx: CanvasRenderingContext2D): void };
  const originalRender = proto.render;

  proto.render = function (this: Backdropped, ctx: CanvasRenderingContext2D) {
    if (this.backdropBlur && this.backdropBlur > 0 && !this.isNotVisible()) {
      drawBackdrop(this, ctx, buildPath, this.backdropBlur);
    }
    originalRender.call(this, ctx);
  };
}

function drawBackdrop(shape: Backdropped, ctx: CanvasRenderingContext2D, buildPath: PathBuilder, radius: number): void {
  ctx.save();
  try {
    shape.transform(ctx);
    const m = ctx.getTransform();
    // Pixels du canvas par unité de la forme : le rayon en pixels
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const sigma = radius * scale;
    const margin = Math.ceil(3 * sigma);

    const box = deviceBox(m, shape.width / 2, shape.height / 2, margin, ctx.canvas);
    if (!box) return;

    const pixels = ctx.getImageData(box.x, box.y, box.w, box.h);
    gaussianApprox(pixels.data, box.w, box.h, sigma);
    const tile = util.createCanvasElement();
    tile.width = box.w;
    tile.height = box.h;
    tile.getContext("2d")!.putImageData(pixels, 0, 0);

    // La silhouette dans le repère de la forme, puis le flou posé en pixels du canvas
    traceShapePath(shape, ctx, buildPath);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = shape.opacity ?? 1;
    ctx.drawImage(tile, box.x, box.y);
  } finally {
    ctx.restore();
  }
}

/** La boîte (en pixels entiers du canvas, bornée au canvas) des coins ±hw, ±hh transformés par `m`. */
function deviceBox(m: DOMMatrix, hw: number, hh: number, margin: number,
                   canvas: { width: number; height: number }): { x: number; y: number; w: number; h: number } | null {
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [
    m.a * x + m.c * y + m.e,
    m.b * x + m.d * y + m.f,
  ]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.max(0, Math.floor(Math.min(...xs) - margin));
  const y = Math.max(0, Math.floor(Math.min(...ys) - margin));
  const right = Math.min(canvas.width, Math.ceil(Math.max(...xs) + margin));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...ys) + margin));
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, w: right - x, h: bottom - y };
}
