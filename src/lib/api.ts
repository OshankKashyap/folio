import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RecordInput, RecordPageContent, RecordPageUpdatedAt, SavedView, Status, WindowButtonLayout, WindowButtonOverride, Workspace } from "./types";

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
  createDatabase(name: string, icon?: { emoji?: string; customIcon?: string }): Promise<Workspace> {
    return invoke("create_database", { name, ...icon });
  },
  pickDatabaseIcon(): Promise<string | null> {
    return invoke("pick_database_icon");
  },
  setFontFamily(fontFamily: string): Promise<Workspace> {
    return invoke("set_font_family", { fontFamily });
  },
  setSidebarWidth(sidebarWidth: number | null): Promise<Workspace> {
    return invoke("set_sidebar_width", { sidebarWidth });
  },
  setWindowButtonLayout(windowButtonLayout: WindowButtonOverride): Promise<Workspace> {
    return invoke("set_window_button_layout", { windowButtonLayout });
  },
  getDefaultFont(): Promise<string> {
    return invoke("get_default_font");
  },
  checkFontAvailable(fontFamily: string): Promise<boolean> {
    return invoke("check_font_available", { fontFamily });
  },
  update(input: RecordInput): Promise<Workspace> {
    return invoke("update_record", { input });
  },
  remove(id: number): Promise<Workspace> {
    return invoke("delete_record", { id });
  },
  getRecordPage(recordId: number): Promise<RecordPageContent> {
    return invoke("get_record_page", { recordId });
  },
  saveRecordPage(recordId: number, content: RecordPageContent): Promise<RecordPageUpdatedAt> {
    return invoke("save_record_page", { recordId, content });
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
