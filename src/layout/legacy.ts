/**
 * Legacy layout data → current model, applied at load (LayerManager.deserialize).
 * Idempotent: an up-to-date layout comes back untouched.
 */
import type { LayoutData, SizingData } from "./types";

/** Shape of a container block before `layout.sizing` existed. */
interface LegacyContainerData {
  sizeMode?: { x: SizingData["x"]; y: SizingData["y"] };
  minSize?: { w: number; h: number };
  overflow?: unknown;
}

/**
 * `container.sizeMode` / `container.minSize` move to `layout.sizing` (shared
 * with texts); the container's unused `overflow` is dropped. Returns a new
 * layout object, or null when nothing changes.
 */
export function migrateLegacyLayout(layout: LayoutData | undefined): LayoutData | null {
  const legacy = layout?.container as (LayoutData["container"] & LegacyContainerData) | undefined;
  if (!layout || !legacy) return null;
  if (!("sizeMode" in legacy) && !("minSize" in legacy) && !("overflow" in legacy)) return null;

  const { sizeMode, minSize, overflow: _overflow, ...container } = legacy;
  const sizing: SizingData = layout.sizing ?? {
    x: sizeMode?.x ?? "hug",
    y: sizeMode?.y ?? "hug",
    ...(minSize ? { minSize } : {}),
  };
  return { ...layout, sizing, container };
}
