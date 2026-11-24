/**
 * Une police qui arrive oublie les mesures prises sans elle (vrais objets Fabric).
 */
import { describe, it, expect } from "vitest";
import { cache } from "#fabric";
import { CustomTextbox } from "./controls/CustomTextbox";
import { forgetFontMeasures } from "./fonts";

describe("forgetFontMeasures", () => {
  it("purge les largeurs de caractères de la famille, et d'elle seule", () => {
    new CustomTextbox("06 10 98 78 63", { fontFamily: "Garet", fontSize: 20 });
    new CustomTextbox("Bonjour", { fontFamily: "Inter", fontSize: 20 });
    expect(cache.charWidthsCache.has("garet")).toBe(true);

    forgetFontMeasures("Garet");

    expect(cache.charWidthsCache.has("garet")).toBe(false);
    expect(cache.charWidthsCache.has("inter")).toBe(true);
  });
});
