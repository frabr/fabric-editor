/**
 * Tests for layout helpers: sortChildrenByOrder, resolveContainerChildren.
 *
 * Uses minimal mock objects — no real Fabric canvas needed.
 */
import { describe, it, expect } from "vitest";
import type { ResolvedChild, ChildData } from "./types";
import { sortChildrenByOrder } from "./geometry";

// ── Helpers ─────────────────────────────────────────────────────────

function mockObj(layerId: string, w: number, h: number): any {
  return {
    width: w,
    height: h,
    scaleX: 1,
    scaleY: 1,
    left: 0,
    top: 0,
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

// ── Tests ───────────────────────────────────────────────────────────

describe("sortChildrenByOrder", () => {
  it("returns single child as-is", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });
    const sorted = sortChildrenByOrder([c1]);
    expect(sorted).toEqual([c1]);
  });

  it("sorts by order property", () => {
    const c1 = rc("a", 100, 20, { parentId: "container", order: 2 });
    const c2 = rc("b", 100, 30, { parentId: "container", order: 1 });

    const sorted = sortChildrenByOrder([c1, c2]);
    expect(sorted[0]).toBe(c2);
    expect(sorted[1]).toBe(c1);
  });

  it("children without order come after those with order", () => {
    const c1 = rc("a", 100, 20, { parentId: "container" });
    const c2 = rc("b", 100, 30, { parentId: "container", order: 0 });

    const sorted = sortChildrenByOrder([c1, c2]);
    expect(sorted[0]).toBe(c2); // order: 0
    expect(sorted[1]).toBe(c1); // order: undefined → Infinity
  });

  it("preserves relative order for children with same order", () => {
    const c1 = rc("a", 100, 20, { parentId: "container", order: 1 });
    const c2 = rc("b", 100, 30, { parentId: "container", order: 1 });
    const c3 = rc("c", 100, 25, { parentId: "container", order: 0 });

    const sorted = sortChildrenByOrder([c1, c2, c3]);
    expect(sorted[0]).toBe(c3); // order: 0
    // c1 and c2 both order: 1, preserve original order
    expect(sorted[1]).toBe(c1);
    expect(sorted[2]).toBe(c2);
  });

  it("handles fractional orders (insertion between children)", () => {
    const c1 = rc("a", 100, 20, { parentId: "container", order: 0 });
    const c2 = rc("b", 100, 30, { parentId: "container", order: 2 });
    const c3 = rc("c", 100, 25, { parentId: "container", order: 1 });

    const sorted = sortChildrenByOrder([c2, c3, c1]);
    expect(sorted.map(c => (c.obj as any).get("layerId"))).toEqual(["a", "c", "b"]);
  });
});
