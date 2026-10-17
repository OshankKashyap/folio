export const statuses = ["To do", "In progress", "Done"] as const;
export const priorities = ["High", "Medium", "Low"] as const;
export type Status = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];
export type Layout = "table" | "board" | "list";

export interface WorkspaceDatabase {
  id: number;
  name: string;
  description: string;
  icon: "layers" | "book" | "idea";
  emoji: string;
  customIcon: string | null;
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
  status: Status;
  priority: Priority;
  dueDate: string | null;
  owner: string;
}

export type RecordInput = Omit<RecordItem, "databaseId">;

export type RecordPageContent = string;
export type RecordPageUpdatedAt = string;

export interface Workspace {
  settings: { name: string; accentColor: string; fontFamily: string } | null;
  databases: WorkspaceDatabase[];
  views: SavedView[];
  records: RecordItem[];
}

export type WindowButton = "close" | "maximize" | "minimize";

export interface WindowButtonLayout {
  left: WindowButton[];
  right: WindowButton[];
}
