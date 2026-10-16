import { describe, expect, it } from "vitest";
import { accentInk } from "./theme";

describe("accent contrast", () => {
  it("uses dark text for light accents", () => {
    for (const color of ["#ffffff", "#b8aaf7", "#91baff", "#8bd5b5", "#f4b68a", "#eea5bd", "#5ecfca", "#f5cd6f"]) {
      expect(accentInk(color)).toBe("#000000");
    }
  });
  it("uses white text for dark custom accents", () => {
    expect(accentInk("#000000")).toBe("#ffffff");
    expect(accentInk("#123456")).toBe("#ffffff");
  });
});
