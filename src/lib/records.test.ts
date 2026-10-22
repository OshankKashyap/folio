import { describe, expect, it } from "vitest";
import { fixture } from "./test-fixture";
import { formatDate, visibleRecords } from "./records";

describe("record presentation", () => {
  it("scopes records and filters to the selected saved view", () => {
    const workspace = fixture();
    expect(visibleRecords(workspace.records, workspace.views[1], workspace.columns).map((record) => record.id)).toEqual([1, 2, 6]);
    expect(visibleRecords(workspace.records, workspace.views[3]).map((record) => record.id)).toEqual([7, 8]);
    expect(visibleRecords(workspace.records, undefined)).toEqual([]);
  });

  it("sorts without modifying the saved manual order", () => {
    const workspace = fixture();
    const original = workspace.records.map((record) => record.id);
    const sorted = visibleRecords(workspace.records, { ...workspace.views[0], sortActive: true });
    expect(sorted[0].name).toBe("API documentation");
    expect(workspace.records.map((record) => record.id)).toEqual(original);
  });

  it("formats date-only values and empty dates", () => {
    expect(formatDate("2026-10-20")).toBe("20-10-26");
    expect(formatDate(null)).toBe("No date");
  });
});
