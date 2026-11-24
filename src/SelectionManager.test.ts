import { describe, it, expect, vi } from "vitest";
import { SelectionManager } from "./SelectionManager";

function object(layerId: string, parentId?: string) {
  const props: Record<string, unknown> = {
    layerId,
    layout: parentId ? { child: { parentId } } : undefined,
  };
  return { get: (key: string) => props[key] } as never;
}

function canvasWith(objects: unknown[]) {
  return {
    on: vi.fn(),
    originalFabricCanvas: { searchPossibleTargets: vi.fn() },
    getObjects: () => objects,
    setActiveObject: vi.fn(),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
  } as never;
}

describe("SelectionManager.selectByLayerId", () => {
  it("selects a container child itself, entering its container", () => {
    const box = object("box");
    const txt = object("txt", "box");
    const canvas = canvasWith([box, txt]);
    const selection = new SelectionManager(canvas);

    expect(selection.selectByLayerId("txt")).toBe(true);

    expect((canvas as { setActiveObject: ReturnType<typeof vi.fn> }).setActiveObject).toHaveBeenCalledWith(txt);
    expect(selection.enteredContainerId).toBe("box");
  });

  it("a free object leaves any entered container", () => {
    const box = object("box");
    const txt = object("txt", "box");
    const free = object("free");
    const selection = new SelectionManager(canvasWith([box, txt, free]));

    selection.selectByLayerId("txt");
    selection.selectByLayerId("free");

    expect(selection.enteredContainerId).toBeNull();
  });
});
