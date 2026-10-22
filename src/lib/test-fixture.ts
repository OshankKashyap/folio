import type { Column, Workspace } from "./types";

export function fixture(): Workspace {
  const columns: Column[] = [1, 2, 3].flatMap((databaseId) => [
    { id: databaseId * 10, databaseId, name: "Status", type: "status", position: 0, options: [{ id: 1, label: "To do", emoji: "", color: "gray" }, { id: 2, label: "In progress", emoji: "", color: "blue" }, { id: 3, label: "Done", emoji: "", color: "green" }] },
    { id: databaseId * 10 + 1, databaseId, name: "Priority", type: "select", position: 1, options: [{ id: 1, label: "High", emoji: "", color: "red" }, { id: 2, label: "Medium", emoji: "", color: "orange" }, { id: 3, label: "Low", emoji: "", color: "gray" }] },
    { id: databaseId * 10 + 2, databaseId, name: "Due date", type: "date", position: 2, options: null },
    { id: databaseId * 10 + 3, databaseId, name: "Owner", type: "text", position: 3, options: null },
  ] as Column[]);
  const record = (id: number, databaseId: number, name: string, status: number, priority: number, date: string) => ({
    id, databaseId, name, values: {
      [databaseId * 10]: JSON.stringify({ Status: status }),
      [databaseId * 10 + 1]: JSON.stringify({ Select: priority }),
      [databaseId * 10 + 2]: JSON.stringify({ Date: date }),
      [databaseId * 10 + 3]: JSON.stringify({ Text: "Oshank" }),
    },
  });
  return {
    settings: { name: "Test workspace", accentColor: "#b8aaf7", fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false, autostart: false },
    databases: [
      { id: 1, name: "Projects", description: "A little structure for everything you’re building.", icon: "layers", emoji: "", customIcon: null, columns: columns.filter((column) => column.databaseId === 1) },
      { id: 2, name: "Reading list", description: "Good ideas start with a good book.", icon: "book", emoji: "", customIcon: null, columns: columns.filter((column) => column.databaseId === 2) },
      { id: 3, name: "Ideas", description: "A home for your next big thing.", icon: "idea", emoji: "", customIcon: null, columns: columns.filter((column) => column.databaseId === 3) },
    ],
    columns,
    views: [1, 2, 3].flatMap((databaseId) => [
      { id: databaseId * 10, databaseId, name: "All records", layout: "table" as const, filterActive: false, sortActive: false, compact: false, showOwner: true },
      { id: databaseId * 10 + 1, databaseId, name: "In progress", layout: "table" as const, filterActive: true, sortActive: false, compact: false, showOwner: true },
      { id: databaseId * 10 + 2, databaseId, name: "By status", layout: "board" as const, filterActive: false, sortActive: false, compact: false, showOwner: true },
    ]),
    records: [
      record(1, 1, "Network monitor", 2, 1, "2026-10-20"),
      record(2, 1, "Database workspace", 2, 1, "2026-10-24"),
      record(3, 1, "Portfolio refresh", 1, 2, "2026-10-28"),
      record(4, 1, "API documentation", 3, 2, "2026-10-14"),
      record(5, 1, "CLI utilities", 1, 3, "2026-11-02"),
      record(6, 1, "Design system", 2, 2, "2026-10-22"),
      record(7, 2, "Designing Data-Intensive Applications", 2, 1, "2026-10-30"),
      record(8, 2, "The Pragmatic Programmer", 1, 2, "2026-11-05"),
      record(9, 3, "Offline-first notes", 1, 1, "2026-10-25"),
      record(10, 3, "A calmer task manager", 2, 2, "2026-11-01"),
    ],
  };
}
