import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ColumnOption, ColumnType, PropertyValue, RecordInput, RecordPageContent, RecordPageUpdatedAt, SavedView, WindowButtonLayout, WindowButtonOverride, Workspace } from "./types";

type WorkspacePayload = Omit<Workspace, "databases"> & { databases: Omit<Workspace["databases"][number], "columns">[] };

export function withDatabaseColumns(workspace: WorkspacePayload): Workspace {
  return { ...workspace, databases: workspace.databases.map((database) => ({ ...database, columns: workspace.columns.filter((column) => column.databaseId === database.id) })) };
}

function invokeWorkspace(command: string, args?: Record<string, unknown>): Promise<Workspace> {
  return invoke<WorkspacePayload>(command, args).then(withDatabaseColumns);
}

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
    return invokeWorkspace("load_workspace");
  },
  createRecord(databaseId: number): Promise<Workspace> {
    return invokeWorkspace("create_record", { databaseId });
  },
  createColumn(databaseId: number, name: string, columnType: ColumnType, options: ColumnOption[] | null): Promise<Workspace> {
    return invokeWorkspace("create_column", { databaseId, name, columnType, options });
  },
  renameColumn(columnId: number, name: string): Promise<Workspace> {
    return invokeWorkspace("rename_column", { columnId, name });
  },
  deleteColumn(columnId: number): Promise<Workspace> {
    return invokeWorkspace("delete_column", { columnId });
  },
  setColumnOptions(columnId: number, options: ColumnOption[]): Promise<Workspace> {
    return invokeWorkspace("set_column_options", { columnId, options });
  },
  setRecordValue(recordId: number, columnId: number, value: PropertyValue | null): Promise<Workspace> {
    return invokeWorkspace("set_record_value", { recordId, columnId, value });
  },
  async addInlineOption(columnId: number, label: string): Promise<[number, Workspace]> {
    const [id, workspace] = await invoke<[number, WorkspacePayload]>("add_inline_option", { columnId, label });
    return [id, withDatabaseColumns(workspace)];
  },
  setup(name: string, accentColor: string): Promise<Workspace> {
    return invokeWorkspace("setup_workspace", { name, accentColor });
  },
  createDatabase(name: string, icon?: { emoji?: string; customIcon?: string }): Promise<Workspace> {
    return invokeWorkspace("create_database", { name, ...icon });
  },
  pickDatabaseIcon(): Promise<string | null> {
    return invoke("pick_database_icon");
  },
  setFontFamily(fontFamily: string): Promise<Workspace> {
    return invokeWorkspace("set_font_family", { fontFamily });
  },
  setSidebarWidth(sidebarWidth: number | null): Promise<Workspace> {
    return invokeWorkspace("set_sidebar_width", { sidebarWidth });
  },
  setWindowButtonLayout(windowButtonLayout: WindowButtonOverride): Promise<Workspace> {
    return invokeWorkspace("set_window_button_layout", { windowButtonLayout });
  },
  setMinimizeToTray(minimizeToTray: boolean): Promise<Workspace> {
    return invokeWorkspace("set_minimize_to_tray", { minimizeToTray });
  },
  setAutostart(autostart: boolean): Promise<Workspace> {
    return invokeWorkspace("set_autostart", { autostart });
  },
  isDevBuild(): Promise<boolean> {
    return invoke("is_dev_build");
  },
  getDefaultFont(): Promise<string> {
    return invoke("get_default_font");
  },
  checkFontAvailable(fontFamily: string): Promise<boolean> {
    return invoke("check_font_available", { fontFamily });
  },
  update(input: RecordInput): Promise<Workspace> {
    return invokeWorkspace("update_record", { input });
  },
  remove(id: number): Promise<Workspace> {
    return invokeWorkspace("delete_record", { id });
  },
  getRecordPage(recordId: number): Promise<RecordPageContent> {
    return invoke("get_record_page", { recordId });
  },
  saveRecordPage(recordId: number, content: RecordPageContent): Promise<RecordPageUpdatedAt> {
    return invoke("save_record_page", { recordId, content });
  },
  saveView(view: SavedView): Promise<Workspace> {
    return invokeWorkspace("update_view", { view });
  },
  reorder(databaseId: number, recordId: number, targetId: number, after: boolean): Promise<Workspace> {
    return invokeWorkspace("reorder_record", { databaseId, recordId, targetId, after });
  },
  getWindowButtonLayout(): Promise<WindowButtonLayout> {
    return invoke("get_window_button_layout");
  },
};
