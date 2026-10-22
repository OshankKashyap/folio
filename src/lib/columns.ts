import CaseSensitive from "@lucide/svelte/icons/case-sensitive";
import Hash from "@lucide/svelte/icons/hash";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ListChecks from "@lucide/svelte/icons/list-checks";
import SquareCheck from "@lucide/svelte/icons/square-check";
import CircleDot from "@lucide/svelte/icons/circle-dot";
import CalendarDays from "@lucide/svelte/icons/calendar-days";
import type { ColumnOption, ColumnType } from "./types";

export const columnTypes: { type: ColumnType; name: string; icon: typeof CaseSensitive }[] = [
  { type: "text", name: "Text", icon: CaseSensitive },
  { type: "number", name: "Number", icon: Hash },
  { type: "select", name: "Select", icon: ChevronDown },
  { type: "multiselect", name: "Multiselect", icon: ListChecks },
  { type: "checkbox", name: "Checkbox", icon: SquareCheck },
  { type: "status", name: "Status", icon: CircleDot },
  { type: "date", name: "Date", icon: CalendarDays },
];

export const optionColors: Record<ColumnOption["color"], { background: string; text: string }> = {
  gray: { background: "#303137", text: "#c1c2ca" },
  brown: { background: "#49372e", text: "#d8b49e" },
  orange: { background: "#4c3524", text: "#efb078" },
  yellow: { background: "#484126", text: "#e7cf7d" },
  green: { background: "#233a32", text: "#9bd0b7" },
  blue: { background: "#263b50", text: "#9dc7ed" },
  purple: { background: "#3b304d", text: "#cbb0ed" },
  pink: { background: "#4a2e42", text: "#e7abd3" },
  red: { background: "#4c2c30", text: "#efadb4" },
};

export function hasOptions(type: ColumnType): boolean {
  return type === "select" || type === "multiselect" || type === "status";
}

// Fixed positioning keeps editors outside the table's horizontal scroll clipping.
export function floatingEditor(node: HTMLElement, { anchor, close }: { anchor: HTMLElement; close: () => void }) {
  const position = () => {
    const rect = anchor.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - node.offsetWidth - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - node.offsetHeight - 8))}px`;
  };
  const outside = (event: PointerEvent) => {
    if (!node.contains(event.target as Node) && !anchor.contains(event.target as Node)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      anchor.focus();
    }
  };
  position();
  node.querySelector<HTMLElement>("input, button")?.focus();
  document.addEventListener("pointerdown", outside);
  node.addEventListener("keydown", escape);
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
  const observer = new ResizeObserver(position);
  observer.observe(node);
  return { destroy() {
    observer.disconnect();
    document.removeEventListener("pointerdown", outside);
    node.removeEventListener("keydown", escape);
    window.removeEventListener("resize", position);
    document.removeEventListener("scroll", position, true);
  } };
}
