import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { api } from "./api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it.each([false, true])("passes minimize-to-tray (%j) through the typed command boundary", async (minimizeToTray) => {
  await api.setMinimizeToTray(minimizeToTray);
  expect(invoke).toHaveBeenCalledWith("set_minimize_to_tray", { minimizeToTray });
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
