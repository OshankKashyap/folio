import type { Column, PropertyValue, RecordItem, SavedView } from "./types";

export function propertyValue(record: RecordItem, column: Column): PropertyValue | null {
  const raw = record.values[String(column.id)];
  return raw === undefined ? null : JSON.parse(raw) as PropertyValue;
}

export function statusLabel(record: RecordItem, column: Column | undefined): string {
  const value = column ? propertyValue(record, column) : null;
  return value && "Status" in value ? column?.options?.find((option) => option.id === value.Status)?.label ?? "No status" : "No status";
}

export function visibleRecords(records: RecordItem[], view: SavedView | undefined, columns: Column[] = []): RecordItem[] {
  if (!view) return [];
  const status = columns.find((column) => column.databaseId === view.databaseId && column.type === "status");
  const canFilter = status?.options?.some((option) => option.label === "In progress");
  const visible = records.filter((record) => record.databaseId === view.databaseId && (!view.filterActive || !canFilter || statusLabel(record, status) === "In progress"));
  return view.sortActive ? visible.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id) : visible;
}

export function formatDate(date: string | null): string {
  if (!date) return "No date";
  return `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(2, 4)}`;
}
