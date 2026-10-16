import { api } from "./api";

export async function checkFontAvailable(family: string): Promise<boolean> {
  try {
    return await api.checkFontAvailable(family);
  } catch {
    try {
      return isFontAvailable(family);
    } catch {
      return false;
    }
  }
}

// Compare against multiple baselines: missing families simply use each fallback.
export function isFontAvailable(family: string): boolean {
  if (!family.trim() || /[\u0000-\u001f\u007f]/.test(family)) return false;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return false;
  const sample = "mmmmmmmmmmWWWWWWWiiiiiii0123456789";
  const baselines = ["monospace", "sans-serif", "serif"];
  const measure = (font: string) => {
    context.font = `72px ${font}`;
    return context.measureText(sample).width;
  };
  const defaults = baselines.map(measure);
  const widths = baselines.map((fallback) => measure(`${JSON.stringify(family)}, ${fallback}`));
  return defaults.every((width) => Number.isFinite(width) && width > 0)
    && new Set(defaults).size > 1
    && widths.every((width) => Number.isFinite(width) && width > 0 && width === widths[0])
    && defaults.some((width, index) => width !== widths[index]);
}

export function applyFont(family: string): void {
  if (family) {
    document.documentElement.style.setProperty("--app-font", `${JSON.stringify(family)}, var(--default-app-font)`);
  } else {
    document.documentElement.style.removeProperty("--app-font");
  }
}
