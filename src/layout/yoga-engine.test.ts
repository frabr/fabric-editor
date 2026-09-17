/**
 * Tests for the Yoga layout engine (Flexbox model).
 *
 * Uses minimal mock objects (same pattern as chain.test.ts).
 * Verifies that yogaLayout() produces correct positions for
 * single children, multiple children, alignment, stretch, gap,
 * row direction, and flexGrow.
 *
 * The layout model uses container `padding` (not per-child margins).
 * Default alignItems is "flex-start" (children keep their size).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { ResolvedChild, ChildData, ContainerData } from "./types";
import { initYoga, yogaLayout } from "./yoga-engine";

// ── Setup ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await initYoga();
});

// ── Helpers ───────────────────────────────────────────────────────

function mockObj(layerId: string, w: number, h: number): any {
  return {
    width: w,
    height: h,
    scaleX: 1,
    scaleY: 1,
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    type: "rect",
    get(key: string) {
      if (key === "layerId") return layerId;
      return undefined;
    },
    set(props: any) {
      if (typeof props === "object") {
        Object.assign(this, props);
      }
    },
    getRelativeCenterPoint() {
      return { x: this.left + this.width / 2, y: this.top + this.height / 2 };
    },
    setCoords() {},
  };
}

function rc(layerId: string, w: number, h: number, cl: ChildData): ResolvedChild {
  return { obj: mockObj(layerId, w, h), cl };
}

function cd(overrides: Partial<ContainerData> = {}): ContainerData {
  return {
    sizeMode: { x: "hug", y: "hug" },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("yogaLayout — single child", () => {
  it("positions child with padding in hug mode", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });

    const result = yogaLayout([c1], 0, 0, 200, 200,
      cd({ padding: { top: 15, right: 10, bottom: 15, left: 10 } }));

    expect(c1.obj.left).toBe(10);
    expect(c1.obj.top).toBe(15);
    expect(result.w).toBe(10 + 100 + 10); // 120
    expect(result.h).toBe(15 + 20 + 15);  // 50
  });

  it("positions child in fixed-mode container", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });

    const result = yogaLayout([c1], 50, 100, 300, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 15, right: 10, bottom: 15, left: 10 },
      }));

    expect(c1.obj.left).toBe(50 + 10);
    expect(c1.obj.top).toBe(100 + 15);
    expect(result.w).toBe(300);
    expect(result.h).toBe(200);
  });

  it("stretches child width when alignItems is stretch", () => {
    const c1 = rc("a", 60, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 200, 100,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        alignItems: "stretch",
      }));

    // Child should stretch to fill: 200 - 10 - 10 = 180
    expect(c1.obj.width).toBe(180);
  });
});

describe("yogaLayout — multiple children (column)", () => {
  it("two children stack vertically", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });
    const c2 = rc("b", 100, 30, { parentId: "container" });

    const result = yogaLayout([c1, c2], 0, 0, 200, 300,
      cd({ padding: { top: 15, right: 10, bottom: 12, left: 10 } }));

    expect(c1.obj.top).toBe(15);
    expect(c1.obj.left).toBe(10);

    // c2: top = 15 + 20 = 35
    expect(c2.obj.top).toBe(35);
    expect(c2.obj.left).toBe(10);

    // h = 15 + 20 + 30 + 12 = 77
    expect(result.h).toBe(77);
  });

  it("gap adds space between children", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });
    const c2 = rc("b", 100, 30, { parentId: "container" });

    const result = yogaLayout([c1, c2], 0, 0, 200, 300,
      cd({ gap: 8, padding: { top: 10, right: 10, bottom: 10, left: 10 } }));

    expect(c1.obj.top).toBe(10);
    // c2: top = 10 + 20 + 8 = 38
    expect(c2.obj.top).toBe(38);

    // h = 10 + 20 + 8 + 30 + 10 = 78
    expect(result.h).toBe(78);
  });

  it("three children with gap", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });
    const c2 = rc("b", 80, 30, { parentId: "container" });
    const c3 = rc("c", 80, 25, { parentId: "container" });

    const result = yogaLayout([c1, c2, c3], 100, 200, 150, 500,
      cd({ gap: 8, padding: { top: 10, right: 10, bottom: 10, left: 10 } }));

    expect(c1.obj.top).toBe(210);
    expect(c1.obj.left).toBe(110);

    // c2: 210 + 20 + 8 = 238
    expect(c2.obj.top).toBe(238);

    // c3: 238 + 30 + 8 = 276
    expect(c3.obj.top).toBe(276);

    // h = 10 + 20 + 8 + 30 + 8 + 25 + 10 = 111
    expect(result.h).toBe(111);
  });
});

describe("yogaLayout — row direction", () => {
  it("children stack horizontally", () => {
    const c1 = rc("a", 80, 40, { parentId: "container" });
    const c2 = rc("b", 60, 30, { parentId: "container" });

    const result = yogaLayout([c1, c2], 0, 0, 300, 200,
      cd({ flexDirection: "row", padding: { top: 10, right: 10, bottom: 10, left: 10 } }));

    expect(c1.obj.left).toBe(10);
    expect(c1.obj.top).toBe(10);

    // c2: left = 10 + 80 = 90
    expect(c2.obj.left).toBe(90);
    expect(c2.obj.top).toBe(10);

    // w = 10 + 80 + 60 + 10 = 160
    expect(result.w).toBe(160);
  });

  it("row with gap", () => {
    const c1 = rc("a", 80, 40, { parentId: "container" });
    const c2 = rc("b", 60, 30, { parentId: "container" });

    const result = yogaLayout([c1, c2], 0, 0, 300, 200,
      cd({ flexDirection: "row", gap: 12, padding: { top: 10, right: 10, bottom: 10, left: 10 } }));

    expect(c1.obj.left).toBe(10);
    // c2: left = 10 + 80 + 12 = 102
    expect(c2.obj.left).toBe(102);

    // w = 10 + 80 + 12 + 60 + 10 = 172
    expect(result.w).toBe(172);
  });
});

describe("yogaLayout — alignment", () => {
  it("alignSelf flex-end: child right-aligned in column", () => {
    const c1 = rc("a", 80, 20, {
      parentId: "container",
      alignSelf: "flex-end",
    });

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      }));

    // right-aligned: left = 200 - 10 (padding-right) - 80 = 110
    expect(c1.obj.left).toBe(110);
  });

  it("alignSelf center: child centered", () => {
    const c1 = rc("a", 80, 20, {
      parentId: "container",
      alignSelf: "center",
    });

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      }));

    // centered in padded area: left = 10 + (180 - 80) / 2 = 60
    expect(c1.obj.left).toBe(60);
  });

  it("alignItems flex-end on container", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        alignItems: "flex-end",
      }));

    // right-aligned: left = 200 - 10 (padding-right) - 80 = 110
    expect(c1.obj.left).toBe(110);
  });

  it("justifyContent center", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        justifyContent: "center",
      }));

    // centered vertically: top = (200 - 20) / 2 = 90
    expect(c1.obj.top).toBe(90);
  });

  it("justifyContent space-between distributes children", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });
    const c2 = rc("b", 80, 20, { parentId: "container" });

    yogaLayout([c1, c2], 0, 0, 200, 200,
      cd({ sizeMode: { x: "fixed", y: "fixed" }, justifyContent: "space-between" }));

    // First at top, second at bottom
    expect(c1.obj.top).toBe(0);
    expect(c2.obj.top).toBe(180); // 200 - 20 = 180
  });
});

describe("yogaLayout — stretch", () => {
  it("children stretch to fill fixed-x container width", () => {
    const c1 = rc("a", 60, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 300, 200,
      cd({
        sizeMode: { x: "fixed", y: "hug" },
        padding: { top: 10, right: 15, bottom: 10, left: 15 },
        alignItems: "stretch",
      }));

    // Stretched: width = 300 - 15 - 15 = 270
    expect(c1.obj.width).toBe(270);
  });

  it("alignSelf flex-end prevents stretch", () => {
    const c1 = rc("a", 60, 20, {
      parentId: "container",
      alignSelf: "flex-end",
    });

    yogaLayout([c1], 0, 0, 300, 200,
      cd({
        sizeMode: { x: "fixed", y: "hug" },
        padding: { top: 10, right: 15, bottom: 10, left: 15 },
        alignItems: "stretch",
      }));

    // Not stretched: keeps original width
    expect(c1.obj.width).toBe(60);
  });

  it("hug-x does not stretch children even with alignItems stretch", () => {
    const c1 = rc("a", 60, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 300, 200,
      cd({
        padding: { top: 10, right: 15, bottom: 10, left: 15 },
        alignItems: "stretch",
      }));

    // Hug mode: child keeps its natural size
    expect(c1.obj.width).toBe(60);
  });

  it("default alignItems (flex-start) does not stretch", () => {
    const c1 = rc("a", 60, 20, { parentId: "container" });

    yogaLayout([c1], 0, 0, 300, 200,
      cd({ sizeMode: { x: "fixed", y: "hug" } }));

    // Default is flex-start, no stretch
    expect(c1.obj.width).toBe(60);
  });
});

describe("yogaLayout — order", () => {
  it("children are laid out in array order (order not set)", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });
    const c2 = rc("b", 80, 30, { parentId: "container" });

    yogaLayout([c1, c2], 0, 0, 200, 300, cd());

    // c1 first, c2 second (no padding → starts at 0)
    expect(c1.obj.top).toBe(0);
    expect(c2.obj.top).toBe(20);
  });

  it("children with padding are laid out in array order", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });
    const c2 = rc("b", 80, 30, { parentId: "container" });

    yogaLayout([c1, c2], 0, 0, 200, 300,
      cd({ padding: { top: 10, right: 10, bottom: 10, left: 10 } }));

    expect(c1.obj.top).toBe(10);
    expect(c2.obj.top).toBe(30);
  });
});

describe("yogaLayout — origin correction", () => {
  it("handles center origin objects", () => {
    const c1 = rc("a", 100, 40, { parentId: "container" });
    c1.obj.originX = "center";
    c1.obj.originY = "center";

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
      }));

    // With default flex-start, child keeps its width (100) and is at left: 10, top: 10
    // Center origin: left = 10 + 100/2 = 60, top = 10 + 40/2 = 30
    expect(c1.obj.left).toBe(60);
    expect(c1.obj.top).toBe(30);
  });

  it("handles center origin objects with stretch", () => {
    const c1 = rc("a", 100, 40, { parentId: "container" });
    c1.obj.originX = "center";
    c1.obj.originY = "center";

    yogaLayout([c1], 0, 0, 200, 200,
      cd({
        sizeMode: { x: "fixed", y: "fixed" },
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        alignItems: "stretch",
      }));

    // Stretched: width = 200 - 10 - 10 = 180
    // Center origin: left = 10 + 180/2 = 100, top = 10 + 40/2 = 30
    expect(c1.obj.left).toBe(100);
    expect(c1.obj.top).toBe(30);
  });
});

describe("yogaLayout — flexGrow", () => {
  it("flexGrow child fills remaining space", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });
    const c2 = rc("b", 80, 30, { parentId: "container", flexGrow: 1 });

    yogaLayout([c1, c2], 0, 0, 200, 200,
      cd({ sizeMode: { x: "fixed", y: "fixed" } }));

    // c1 is 20px tall, c2 grows to fill remaining: 200 - 20 = 180
    expect(c1.obj.top).toBe(0);
    expect(c1.obj.height).toBe(20);
    expect(c2.obj.top).toBe(20);
    expect(c2.obj.height).toBe(180);
  });
});

describe("yogaLayout — no padding", () => {
  it("children start at container origin when no padding", () => {
    const c1 = rc("a", 80, 20, { parentId: "container" });

    yogaLayout([c1], 50, 100, 200, 200, cd());

    expect(c1.obj.left).toBe(50);
    expect(c1.obj.top).toBe(100);
  });
});
