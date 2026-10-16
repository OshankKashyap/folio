import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFont, isFontAvailable } from "./fonts";
// @ts-expect-error Vitest has Node built-ins; the frontend intentionally has no Node type dependency.
import { readdirSync, readFileSync } from "node:fs";

const appCss = readFileSync("src/routes/app.css", "utf8");

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty("--app-font");
});

describe("font availability", () => {
  it("keeps component font families on the app token and explicitly covers tables", () => {
    for (const path of readdirSync("src", { recursive: true }).filter((path: string) => /\.(svelte|css)$/.test(path))) {
      const source = readFileSync(`src/${path}`, "utf8");
      for (const declaration of source.matchAll(/\bfont-family\s*:\s*([^;}]+)/g)) {
        expect(declaration[1], path).toContain("var(--app-font)");
      }
    }
    expect(appCss).toMatch(/table\s*\{\s*font-family:\s*var\(--app-font\)/);
  });

  it("contains text-control focus rings without changing radio, checkbox, or color outlines", () => {
    expect(appCss).toContain('input:not([type="radio"]):not([type="checkbox"]):not([type="color"]):focus-visible, select:focus-visible { outline-offset: -2px; }');
    expect(appCss).toContain("outline: 2px solid var(--accent); outline-offset: 3px;");
  });
  it.each([true, false])("compares a requested family with fallback widths (available: %s)", (available) => {
    const context = {
      font: "",
      measureText: () => ({ width: available && context.font.includes('"Installed Font"') ? 250 : context.font.endsWith("monospace") ? 100 : context.font.endsWith("sans-serif") ? 120 : 140 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    expect(isFontAvailable("Installed Font")).toBe(available);
  });

  it("rejects inconclusive, invalid, or unavailable measurements", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(isFontAvailable("Font")).toBe(false);
    for (const width of [0, NaN, 100]) {
      getContext.mockReturnValue({ measureText: () => ({ width }) } as unknown as CanvasRenderingContext2D);
      expect(isFontAvailable("Font")).toBe(false);
    }
    expect(isFontAvailable("")).toBe(false);
    expect(isFontAvailable("Bad\nFont")).toBe(false);
  });

  it("rejects a requested font that still depends on the fallback", () => {
    const context = {
      font: "",
      measureText: () => ({ width: context.font.endsWith("monospace") ? 100 : context.font.includes('"Font"') ? 200 : 120 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    expect(isFontAvailable("Font")).toBe(false);
  });

  it("quotes a single family safely and restores the CSS default for Auto", () => {
    applyFont('A "Font", serif');
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe(`${JSON.stringify('A "Font", serif')}, var(--default-app-font)`);
    applyFont("");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
  });
});
