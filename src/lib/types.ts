export const statuses = ["To do", "In progress", "Done"] as const;
export const priorities = ["High", "Medium", "Low"] as const;
export type Status = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];
export type Layout = "table" | "board" | "list";

export type ColumnType = "text" | "number" | "select" | "multiselect" | "checkbox" | "status" | "date";
export interface ColumnOption {
  id: number;
  label: string;
  emoji: string;
  color: "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
}
export interface Column {
  id: number;
  databaseId: number;
  name: string;
  type: ColumnType;
  options: ColumnOption[] | null;
  position: number;
}
export type PropertyValue = { Text: string } | { Number: number } | { Select: number } | { Multi: number[] } | { Checkbox: boolean } | { Status: number } | { Date: string };

export interface WorkspaceDatabase {
  id: number;
  name: string;
  description: string;
  icon: "layers" | "book" | "idea";
  emoji: string;
  customIcon: string | null;
  columns: Column[];
}

export interface SavedView {
  id: number;
  databaseId: number;
  name: string;
  layout: Layout;
  filterActive: boolean;
  sortActive: boolean;
  compact: boolean;
  showOwner: boolean;
}

export interface RecordItem {
  id: number;
  databaseId: number;
  name: string;
  values: Record<string, string>;
}

export type RecordInput = Pick<RecordItem, "id" | "name">;

export type RecordPageContent = string;
export type RecordPageUpdatedAt = string;

export interface Workspace {
  settings: { name: string; accentColor: string; fontFamily: string; sidebarWidth: number | null; windowButtonLayout: WindowButtonOverride; minimizeToTray: boolean; autostart: boolean } | null;
  databases: WorkspaceDatabase[];
  columns: Column[];
  views: SavedView[];
  records: RecordItem[];
}

export type WindowButton = "close" | "maximize" | "minimize";
export type WindowButtonOverride = "" | "left" | "right";

export interface WindowButtonLayout {
  left: WindowButton[];
  right: WindowButton[];
}
