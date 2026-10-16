import type { RecordItem, SavedView } from "./types";

export function visibleRecords(records: RecordItem[], view: SavedView | undefined): RecordItem[] {
  if (!view) return [];
  const visible = records.filter((record) => record.databaseId === view.databaseId && (!view.filterActive || record.status === "In progress"));
  return view.sortActive ? visible.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id) : visible;
}

export function formatDate(date: string | null): string {
  if (!date) return "No date";
  // Local midnight avoids shifting a date-only value into the previous day in western time zones.
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}
