import { afterEach, expect, it, vi } from "vitest";
import { floatingEditor } from "./columns";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["above", "below"] as const)("positions a floating editor %s its anchor and responds to resizing", (placement) => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const anchor = document.createElement("button");
  const panel = document.createElement("div");
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ left: 300, top: 600, bottom: 632, width: 80 } as DOMRect);
  vi.spyOn(panel, "offsetWidth", "get").mockReturnValue(320);
  vi.spyOn(panel, "offsetHeight", "get").mockReturnValue(120);
  const action = floatingEditor(panel, { anchor, close: vi.fn(), ...(placement === "above" ? { placement } : {}) });
  try {
    expect(panel.style.left).toBe(placement === "above" ? "180px" : "300px");
    expect(panel.style.top).toBe(placement === "above" ? "464px" : "636px");
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(360);
    window.dispatchEvent(new Event("resize"));
    expect(panel.style.left).toBe("32px");
  } finally {
    action.destroy();
  }
});
