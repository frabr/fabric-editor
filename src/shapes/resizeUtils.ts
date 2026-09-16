/** Is the transform centered on both axes? */
export function isTransformCentered(transform: any): boolean {
  return transform.originX === "center" && transform.originY === "center";
}
