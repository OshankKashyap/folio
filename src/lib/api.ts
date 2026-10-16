import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RecordInput, SavedView, Status, WindowButtonLayout, Workspace } from "./types";

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export const api = {
  load(): Promise<Workspace> {
    if (!isTauri()) {
      return Promise.reject(new Error("Open Folio in the desktop app to access your SQLite workspace. Run npm run tauri dev from the project directory."));
    }
    return invoke("load_workspace");
  },
  create(databaseId: number, status: Status): Promise<Workspace> {
    return invoke("create_record", { databaseId, status });
  },
  setup(name: string, accentColor: string): Promise<Workspace> {
    return invoke("setup_workspace", { name, accentColor });
  },
  createDatabase(name: string): Promise<Workspace> {
    return invoke("create_database", { name });
  },
  update(input: RecordInput): Promise<Workspace> {
    return invoke("update_record", { input });
  },
  remove(id: number): Promise<Workspace> {
    return invoke("delete_record", { id });
  },
  saveView(view: SavedView): Promise<Workspace> {
    return invoke("update_view", { view });
  },
  reorder(databaseId: number, recordId: number, targetId: number, after: boolean): Promise<Workspace> {
    return invoke("reorder_record", { databaseId, recordId, targetId, after });
  },
  getWindowButtonLayout(): Promise<WindowButtonLayout> {
    return invoke("get_window_button_layout");
  },
};
