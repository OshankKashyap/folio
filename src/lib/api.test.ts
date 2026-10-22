import { beforeEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api } from "./api";
import { fixture } from "./test-fixture";
import type { PropertyValue } from "./types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); vi.mocked(invoke).mockResolvedValue(fixture()); });

it.each([false, true])("passes minimize-to-tray (%j) through the typed command boundary", async (minimizeToTray) => {
  await api.setMinimizeToTray(minimizeToTray);
  expect(invoke).toHaveBeenCalledWith("set_minimize_to_tray", { minimizeToTray });
});

it.each([false, true])("passes autostart (%j) through the typed command boundary", async (autostart) => {
  await api.setAutostart(autostart);
  expect(invoke).toHaveBeenCalledWith("set_autostart", { autostart });
});

it("passes the build mode through the typed command boundary", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(true);
  expect(await api.isDevBuild()).toBe(true);
  expect(invoke).toHaveBeenCalledWith("is_dev_build");
});

it.each([false, true])("passes GPU acceleration (%j) through the typed command boundary", async (gpuAcceleration) => {
  await api.setGpuAcceleration(gpuAcceleration);
  expect(invoke).toHaveBeenCalledWith("set_gpu_acceleration", { gpuAcceleration });
});

it.each([false, true])("returns the Linux platform flag (%j)", async (linux) => {
  vi.mocked(invoke).mockResolvedValueOnce(linux);
  expect(await api.isLinux()).toBe(linux);
  expect(invoke).toHaveBeenCalledWith("is_linux");
});

it.each([null, 280])("passes sidebar width (%j) through the typed command boundary", async (sidebarWidth) => {
  await api.setSidebarWidth(sidebarWidth);
  expect(invoke).toHaveBeenCalledWith("set_sidebar_width", { sidebarWidth });
});

it.each([
  [undefined, { name: "Tasks" }],
  [{ emoji: "⭐" }, { name: "Tasks", emoji: "⭐" }],
  [{ customIcon: "data:image/png;base64,AAAA" }, { name: "Tasks", customIcon: "data:image/png;base64,AAAA" }],
])("passes optional creation icons through the existing camelCase command boundary (%j)", async (icon, args) => {
  await api.createDatabase("Tasks", icon);
  expect(invoke).toHaveBeenCalledWith("create_database", args);
});

it.each([null, "data:image/png;base64,AAAA"])("returns the native icon chooser result (%j) without accepting a file path", async (result) => {
  vi.mocked(invoke).mockResolvedValueOnce(result);
  expect(await api.pickDatabaseIcon()).toBe(result);
  expect(invoke).toHaveBeenCalledWith("pick_database_icon");
});

it("derives per-database columns from the unchanged flat workspace payload", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const payload = fixture();
  const raw = { ...payload, databases: payload.databases.map(({ columns: _columns, ...database }) => database) };
  vi.mocked(invoke).mockResolvedValue(raw);
  const workspace = await api.load();
  expect(workspace.columns).toEqual(raw.columns);
  expect(workspace.databases[0].columns).toEqual(raw.columns.filter((column) => column.databaseId === 1));
  expect(raw.databases[0]).not.toHaveProperty("columns");
});

it("creates records without a status and updates only the title", async () => {
  await api.createRecord(1);
  expect(invoke).toHaveBeenLastCalledWith("create_record", { databaseId: 1 });
  await api.update({ id: 2, name: "Renamed" });
  expect(invoke).toHaveBeenLastCalledWith("update_record", { input: { id: 2, name: "Renamed" } });
});

it("passes batch record IDs through the typed boundary and returns the deleted count", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(2);
  expect(await api.deleteRecords([1, 2, 999])).toBe(2);
  expect(invoke).toHaveBeenCalledWith("delete_records", { recordIds: [1, 2, 999] });
});

it("passes all column mutations through the camelCase boundary", async () => {
  const options = [{ id: 7, label: "Ready", emoji: "⭐", color: "blue" as const }];
  await api.createColumn(1, "State", "status", options);
  expect(invoke).toHaveBeenLastCalledWith("create_column", { databaseId: 1, name: "State", columnType: "status", options });
  await api.createColumn(1, "Notes", "text", null);
  expect(invoke).toHaveBeenLastCalledWith("create_column", { databaseId: 1, name: "Notes", columnType: "text", options: null });
  await api.renameColumn(2, "Renamed");
  expect(invoke).toHaveBeenLastCalledWith("rename_column", { columnId: 2, name: "Renamed" });
  await api.deleteColumn(2);
  expect(invoke).toHaveBeenLastCalledWith("delete_column", { columnId: 2 });
  await api.setColumnOptions(2, options);
  expect(invoke).toHaveBeenLastCalledWith("set_column_options", { columnId: 2, options });
});

it.each<PropertyValue | null>([{ Text: "hello" }, { Number: 2.5 }, { Select: 1 }, { Multi: [1, 2] }, { Checkbox: true }, { Status: 2 }, { Date: "2024-02-29" }, null])("preserves externally tagged cell values (%j)", async (value) => {
  await api.setRecordValue(1, 2, value);
  expect(invoke).toHaveBeenCalledWith("set_record_value", { recordId: 1, columnId: 2, value });
});

it("returns inline options as [optionId, normalized workspace]", async () => {
  vi.mocked(invoke).mockResolvedValueOnce([7, fixture()]);
  const [id, workspace] = await api.addInlineOption(2, "Ready");
  expect(invoke).toHaveBeenCalledWith("add_inline_option", { columnId: 2, label: "Ready" });
  expect(id).toBe(7);
  expect(workspace.databases[0].columns).toEqual(workspace.columns.filter((column) => column.databaseId === 1));
});
