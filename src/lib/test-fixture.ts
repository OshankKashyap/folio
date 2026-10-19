import type { Workspace } from "./types";

export function fixture(): Workspace {
  return {
    settings: { name: "Test workspace", accentColor: "#b8aaf7", fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false },
    databases: [
      { id: 1, name: "Projects", description: "A little structure for everything you’re building.", icon: "layers", emoji: "", customIcon: null },
      { id: 2, name: "Reading list", description: "Good ideas start with a good book.", icon: "book", emoji: "", customIcon: null },
      { id: 3, name: "Ideas", description: "A home for your next big thing.", icon: "idea", emoji: "", customIcon: null },
    ],
    views: [1, 2, 3].flatMap((databaseId) => [
      { id: databaseId * 10, databaseId, name: "All records", layout: "table" as const, filterActive: false, sortActive: false, compact: false, showOwner: true },
      { id: databaseId * 10 + 1, databaseId, name: "In progress", layout: "table" as const, filterActive: true, sortActive: false, compact: false, showOwner: true },
      { id: databaseId * 10 + 2, databaseId, name: "By status", layout: "board" as const, filterActive: false, sortActive: false, compact: false, showOwner: true },
    ]),
    records: [
      { id: 1, databaseId: 1, name: "Network monitor", status: "In progress", priority: "High", dueDate: "2026-10-20", owner: "Oshank" },
      { id: 2, databaseId: 1, name: "Database workspace", status: "In progress", priority: "High", dueDate: "2026-10-24", owner: "Oshank" },
      { id: 3, databaseId: 1, name: "Portfolio refresh", status: "To do", priority: "Medium", dueDate: "2026-10-28", owner: "Oshank" },
      { id: 4, databaseId: 1, name: "API documentation", status: "Done", priority: "Medium", dueDate: "2026-10-14", owner: "Oshank" },
      { id: 5, databaseId: 1, name: "CLI utilities", status: "To do", priority: "Low", dueDate: "2026-11-02", owner: "Oshank" },
      { id: 6, databaseId: 1, name: "Design system", status: "In progress", priority: "Medium", dueDate: "2026-10-22", owner: "Oshank" },
      { id: 7, databaseId: 2, name: "Designing Data-Intensive Applications", status: "In progress", priority: "High", dueDate: "2026-10-30", owner: "Oshank" },
      { id: 8, databaseId: 2, name: "The Pragmatic Programmer", status: "To do", priority: "Medium", dueDate: "2026-11-05", owner: "Oshank" },
      { id: 9, databaseId: 3, name: "Offline-first notes", status: "To do", priority: "High", dueDate: "2026-10-25", owner: "Oshank" },
      { id: 10, databaseId: 3, name: "A calmer task manager", status: "In progress", priority: "Medium", dueDate: "2026-11-01", owner: "Oshank" },
    ],
  };
}
