import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { api } from "$lib/api";
import { fixture } from "$lib/test-fixture";
import type { Column, ColumnOption, ColumnType, PropertyValue, Workspace as WorkspaceData } from "$lib/types";
import { columnTypes, optionColors } from "$lib/columns";
import Workspace from "./Workspace.svelte";
import Titlebar from "./Titlebar.svelte";
import { uiState } from "$lib/uiState.svelte";
import settingsSource from "./SettingsPanel.svelte?raw";
import workspaceSource from "./Workspace.svelte?raw";
import columnHeaderSource from "./ColumnHeader.svelte?raw";
import propertyCellSource from "./PropertyCell.svelte?raw";
import optionChipSource from "./OptionChip.svelte?raw";
import pageSource from "./RecordPage.svelte?raw";
import { createEditor } from "$lib/editor";

vi.mock("$lib/editor", () => ({
  createEditor: vi.fn((parent: HTMLElement, content: string, onChange: (value: string) => void) => {
    const input = document.createElement("textarea");
    input.setAttribute("aria-label", "Page notes");
    input.value = content;
    input.oninput = () => onChange(input.value);
    parent.append(input);
    return { destroy: vi.fn(() => input.remove()), getValue: () => input.value, setContent: (value: string) => { input.value = value; }, focus: () => input.focus(), action: vi.fn() };
  }),
}));

vi.mock("$lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("$lib/api")>();
  return { ...original, api: { load: vi.fn(), setup: vi.fn(), createDatabase: vi.fn(), pickDatabaseIcon: vi.fn(), saveView: vi.fn(), createRecord: vi.fn(), createColumn: vi.fn(), renameColumn: vi.fn(), deleteColumn: vi.fn(), setColumnOptions: vi.fn(), setRecordValue: vi.fn(), addInlineOption: vi.fn(), update: vi.fn(), remove: vi.fn(), deleteRecords: vi.fn(), reorder: vi.fn(), setFontFamily: vi.fn(), setSidebarWidth: vi.fn(), setWindowButtonLayout: vi.fn(), setMinimizeToTray: vi.fn(), setAutostart: vi.fn(), setGpuAcceleration: vi.fn(), isLinux: vi.fn(), isDevBuild: vi.fn(), getWindowButtonLayout: vi.fn(), getDefaultFont: vi.fn(), checkFontAvailable: vi.fn(), getRecordPage: vi.fn(), saveRecordPage: vi.fn() } };
});

let data: WorkspaceData;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  data = fixture();
  uiState.windowButtonLayout = null;
  vi.mocked(api.getWindowButtonLayout).mockResolvedValue({ left: ["close", "maximize", "minimize"], right: [] });
  vi.mocked(api.setWindowButtonLayout).mockImplementation(async (windowButtonLayout) => {
    data.settings!.windowButtonLayout = windowButtonLayout;
    return structuredClone(data);
  });
  vi.mocked(api.load).mockImplementation(async () => structuredClone(data));
  vi.mocked(api.setMinimizeToTray).mockImplementation(async (minimizeToTray) => {
    data.settings!.minimizeToTray = minimizeToTray;
    return structuredClone(data);
  });
  vi.mocked(api.setAutostart).mockImplementation(async (autostart) => {
    data.settings!.autostart = autostart;
    return structuredClone(data);
  });
  vi.mocked(api.isDevBuild).mockResolvedValue(false);
  vi.mocked(api.isLinux).mockResolvedValue(true);
  vi.mocked(api.setGpuAcceleration).mockImplementation(async (gpuAcceleration) => {
    data.settings!.gpuAcceleration = gpuAcceleration;
    return structuredClone(data);
  });
  vi.mocked(api.pickDatabaseIcon).mockResolvedValue(null);
  vi.mocked(api.getRecordPage).mockResolvedValue("# Notes");
  vi.mocked(api.saveRecordPage).mockResolvedValue("2026-10-17T12:00:00.000Z");
  document.documentElement.style.removeProperty("--app-font");
  vi.mocked(api.getDefaultFont).mockResolvedValue("Noto Sans Display");
  vi.mocked(api.checkFontAvailable).mockImplementation(async (font) => font === "Installed Font");
  vi.mocked(api.setFontFamily).mockImplementation(async (fontFamily) => {
    data.settings!.fontFamily = fontFamily;
    return structuredClone(data);
  });
  vi.mocked(api.setSidebarWidth).mockImplementation(async (sidebarWidth) => {
    data.settings!.sidebarWidth = sidebarWidth;
    return structuredClone(data);
  });
  vi.mocked(api.saveView).mockImplementation(async (view) => {
    data.views = data.views.map((item) => item.id === view.id ? view : item);
    return structuredClone(data);
  });
  vi.mocked(api.setRecordValue).mockImplementation(async (recordId, columnId, value) => {
    const record = data.records.find((item) => item.id === recordId)!;
    if (value === null) delete record.values[String(columnId)];
    else record.values[String(columnId)] = JSON.stringify(value);
    return structuredClone(data);
  });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openWorkspace() {
  const user = userEvent.setup();
  render(Workspace);
  await screen.findByRole("heading", { name: "Projects" });
  return user;
}

describe("table row selection", () => {
  it("keeps selection controls compact and blends the gutter into the table header", () => {
    const gutter = workspaceSource.split(".grip-cell {")[1].split("}")[0];
    expect(gutter).toContain("width: 32px;");
    expect(gutter).toContain("max-width: 32px;");
    expect(gutter).toContain("padding: 3px 0 !important;");
    expect(workspaceSource.split("th.grip-cell {")[1].split("}")[0]).toContain("background: #1c1d21;");
    expect(workspaceSource.split("th.grip-cell + th {")[1].split("}")[0]).toContain("border-left: 0;");
    const checkbox = workspaceSource.split(".row-checkbox {")[1].split("}")[0];
    expect(checkbox).toContain("position: absolute;");
    expect(checkbox).toContain("left: 8px;");
    expect(checkbox).toContain("width: 14px;");
    expect(workspaceSource).toContain('.settings input[type="checkbox"], .row-checkbox { appearance: none;');
    expect(workspaceSource).toContain(".row-checkbox:indeterminate::after");
    expect(workspaceSource.split(".row-grip {")[1].split("}")[0]).toContain("padding: 6px 4px;");
  });

  it("positions drag grips outside the table in an unclipped scroll gutter", () => {
    const grip = workspaceSource.split(".row-grip {")[1].split("}")[0];
    expect(grip).toContain("position: absolute;");
    expect(grip).toContain("left: -26px;");
    expect(grip).toContain("top: 50%;");
    const scroll = workspaceSource.split(".table-wrap {")[1].split("}")[0];
    expect(scroll).toContain("overflow-x: auto;");
    expect(scroll).toContain("padding-left: 28px;");
    expect(scroll).toContain("margin-left: -28px;");
    expect(workspaceSource.split("@media (max-width: 700px)")[1]).toContain(".table-wrap { margin-left: -12px; }");
  });

  beforeEach(() => {
    vi.mocked(api.deleteRecords).mockImplementation(async (ids) => {
      const before = data.records.length;
      data.records = data.records.filter((record) => !ids.includes(record.id));
      return before - data.records.length;
    });
  });

  it("selects individual rows and toggles all with an indeterminate header", async () => {
    const user = await openWorkspace();
    const header = screen.getByRole("checkbox", { name: "Select all rows" }) as HTMLInputElement;
    const row = screen.getByRole("checkbox", { name: "Select row Network monitor" }) as HTMLInputElement;
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(false);
    await user.click(row);
    expect(row.checked).toBe(true);
    expect(header.indeterminate).toBe(true);
    expect(screen.getByText("1 selected")).toBeTruthy();
    await user.click(header);
    expect(header.checked).toBe(true);
    expect(header.indeterminate).toBe(false);
    expect(screen.getByText("6 selected")).toBeTruthy();
    await user.click(header);
    expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull();
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(false);
  });

  it("cancels without deleting, then confirms and closes a deleted record's page", async () => {
    const user = await openWorkspace();
    await user.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    await screen.findByRole("textbox", { name: "Page notes" });
    await user.click(screen.getByRole("checkbox", { name: "Select row Network monitor" }));
    await user.click(screen.getByRole("checkbox", { name: "Select row Database workspace" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete 2 rows? This cannot be undone.")).toBeTruthy();
    expect(workspaceSource.split(".selection-confirm p {")[1].split("}")[0]).toContain("text-align: center;");
    const actions = screen.getByRole("button", { name: "Cancel" }).parentElement!;
    expect(actions.classList.contains("selection-confirm-actions")).toBe(true);
    expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Delete rows"]);
    const actionStyle = workspaceSource.split(".selection-confirm-actions {")[1].split("}")[0];
    expect(actionStyle).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(actionStyle).toContain("gap: 8px;");
    expect(workspaceSource.split(".selection-confirm-actions button {")[1].split("}")[0]).toContain("background: #292a31;");
    expect(workspaceSource.split(".selection-confirm-actions button:hover:not(:disabled) {")[1].split("}")[0]).toContain("background: #32333b;");
    expect(workspaceSource.split(".selection-confirm-actions button.danger {")[1].split("}")[0]).toContain("background: #38282c;");
    expect(workspaceSource.split(".selection-confirm-actions button.danger:hover:not(:disabled) {")[1].split("}")[0]).toContain("background: #453035;");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteRecords).not.toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete rows" })).getByRole("button", { name: "Delete rows" }));
    await waitFor(() => expect(api.deleteRecords).toHaveBeenCalledWith([1, 2]));
    expect(screen.queryByRole("checkbox", { name: "Select row Network monitor" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select row Database workspace" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Page notes" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull();
  });

  it("keeps rows and selection unchanged on failure and disables selection while deleting", async () => {
    const user = await openWorkspace();
    let reject!: (cause: Error) => void;
    vi.mocked(api.deleteRecords).mockReturnValueOnce(new Promise((_resolve, fail) => reject = fail));
    const row = screen.getByRole("checkbox", { name: "Select row Network monitor" }) as HTMLInputElement;
    await user.click(row);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete rows" }));
    expect(row.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Deleting…" }).hasAttribute("disabled")).toBe(true);
    reject(new Error("Could not delete rows."));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not delete rows.");
    expect(row.checked).toBe(true);
    expect(row.disabled).toBe(false);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Network monitor" })).toBeTruthy();
  });

  it("preserves selection after a successful cell edit", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("checkbox", { name: "Select row Network monitor" }));
    await user.click(screen.getByRole("button", { name: "Owner for Network monitor" }));
    const input = screen.getByLabelText("Edit Owner for Network monitor");
    await user.clear(input);
    await user.type(input, "Updated owner{Enter}");
    await waitFor(() => expect(api.setRecordValue).toHaveBeenCalledWith(1, 13, { Text: "Updated owner" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Owner for Network monitor" }).textContent).toContain("Updated owner"));
    expect(within(screen.getByRole("group", { name: "Row selection" })).getByText("1 selected")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Select row Network monitor" }) as HTMLInputElement).checked).toBe(true);
  });

  it("clears with table focus, on database switches, and on visible-row changes but not sorting", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("checkbox", { name: "Select row Network monitor" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(document.activeElement).toBe(screen.getByRole("table", { name: "Records" }));
    await user.click(screen.getByRole("checkbox", { name: "Select row Network monitor" }));
    await user.click(screen.getByRole("button", { name: "Reading list" }));
    expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Projects" }));
    const row = screen.getByRole("checkbox", { name: "Select row Network monitor" }) as HTMLInputElement;
    expect(row.checked).toBe(false);
    await user.click(row);
    await user.click(screen.getByRole("button", { name: "Sort" }));
    expect(within(screen.getByRole("group", { name: "Row selection" })).getByText("1 selected")).toBeTruthy();
    expect(row.checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull());
    expect(row.checked).toBe(false);
    await user.click(row);
    await user.click(screen.getByRole("button", { name: "By status" }));
    expect(screen.queryByRole("checkbox", { name: /Select row/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull();
  });
});

describe("dynamic columns", () => {
  it("keeps column headings above the readable row text size", () => {
    expect(workspaceSource.split("\n  th {")[1].split("}")[0]).toContain("font-size: 14px;");
    expect(workspaceSource.split("table {")[1].split("}")[0]).toContain("font-size: 13px;");
  });

  it("uses a consistent workspace text hierarchy and spacing", () => {
    for (const selector of [".chrome", ".toolbar", ".side-bottom"]) {
      expect(workspaceSource.split(`${selector} {`)[1].split("}")[0], selector).toContain("font-size: 13px;");
    }
    for (const selector of [".local-indicator", ".footer", ".side-bottom small", ".page-button"]) {
      expect(workspaceSource.split(`${selector} {`)[1].split("}")[0], selector).toContain("font-size: 12px;");
    }
    for (const selector of [".caption", ".eyebrow"]) {
      const rule = workspaceSource.split(`${selector} {`)[1].split("}")[0];
      expect(rule, selector).toContain("font-size: 11px;");
      expect(rule, selector).toContain("letter-spacing: 1px;");
    }
    const valueRule = propertyCellSource.split(".property-cell {")[1].split("}")[0];
    expect(valueRule).toContain("font-size: 13px;");
    expect(valueRule).toContain("font-weight: 400;");
    const chipRule = optionChipSource.split(".option-chip {")[1].split("}")[0];
    expect(chipRule).toContain("font-size: 12px;");
    expect(chipRule).toContain("font-weight: 400;");
    expect(workspaceSource.split(".toolbar {")[1].split("}")[0]).toContain("gap: 8px;");
    expect(propertyCellSource.split(".cell-button {")[1].split("}")[0]).toContain("gap: 6px;");
  });

  it("keeps the add-column hover target compact and uses a larger plus icon", async () => {
    const user = await openWorkspace();
    const button = screen.getByRole("button", { name: "Add column" });
    expect(button.classList.contains("add-column")).toBe(true);
    expect(button.querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(button.querySelector("svg")?.getAttribute("height")).toBe("18");
    const rule = columnHeaderSource.split(".column-header.add-column {")[1].split("}")[0];
    expect(rule).toContain("width: 28px;");
    expect(rule).toContain("height: 28px;");
    expect(rule).toContain("justify-content: center;");
    expect(screen.getByRole("button", { name: "Column Status" }).classList.contains("add-column")).toBe(false);
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Create column" })).toBeTruthy();
  });

  it("prevents table line-selection highlights while preserving selection in cell inputs", async () => {
    // jsdom cannot render native triple-click selection across table-cell padding.
    const tableRule = workspaceSource.split(".table-wrap {")[1].split("}")[0];
    expect(tableRule).toContain("-webkit-user-select: none;");
    expect(tableRule).toContain("user-select: none;");
    const inputRule = workspaceSource.split(".table-wrap :global(input) {")[1].split("}")[0];
    expect(inputRule).toContain("-webkit-user-select: text;");
    expect(inputRule).toContain("user-select: text;");

    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Owner for Network monitor" }));
    const input = screen.getByLabelText("Edit Owner for Network monitor") as HTMLInputElement;
    await user.tripleClick(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Oshank".length);
    await user.keyboard("Replacement{Enter}");
    await waitFor(() => expect(api.setRecordValue).toHaveBeenCalledWith(1, 13, { Text: "Replacement" }));
  });

  function syncColumns() {
    for (const database of data.databases) database.columns = data.columns.filter((column) => column.databaseId === database.id);
    return structuredClone(data);
  }

  beforeEach(() => {
    vi.mocked(api.createColumn).mockImplementation(async (databaseId, name, type, options) => {
      data.columns.push({ id: 99, databaseId, name, type, options, position: 4 });
      return syncColumns();
    });
    vi.mocked(api.renameColumn).mockImplementation(async (id, name) => {
      data.columns = data.columns.map((column) => column.id === id ? { ...column, name } : column);
      return syncColumns();
    });
    vi.mocked(api.deleteColumn).mockImplementation(async (id) => {
      data.columns = data.columns.filter((column) => column.id !== id);
      return syncColumns();
    });
    vi.mocked(api.setColumnOptions).mockImplementation(async (id, options) => {
      data.columns = data.columns.map((column) => column.id === id ? { ...column, options: options.map((option) => ({ ...option })) } : column);
      return syncColumns();
    });
    vi.mocked(api.addInlineOption).mockImplementation(async (id, label) => {
      data.columns.find((column) => column.id === id)!.options!.push({ id: 4, label, emoji: "", color: "yellow" });
      return [4, syncColumns()];
    });
  });

  it.each(columnTypes)("creates a $name column with its type icon and a default name", async ({ type, name }) => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    const dialog = screen.getByRole("dialog", { name: "Create column" });
    const typeButton = within(dialog).getByRole("button", { name });
    const menuIcon = typeButton.querySelector("svg")!;
    expect(menuIcon.getAttribute("width")).toBe("18");
    expect(menuIcon.getAttribute("height")).toBe("18");
    const iconMarkup = menuIcon.innerHTML;
    await user.click(typeButton);
    await user.click(within(dialog).getByRole("button", { name: "Create column" }));
    await waitFor(() => expect(api.createColumn).toHaveBeenCalledWith(1, name, type, ["select", "status", "multiselect"].includes(type) ? [] : null));
    const header = (await screen.findAllByRole("button", { name: `Column ${name}` })).at(-1)!;
    const headerIcon = header.querySelector(".type-icon svg")!;
    expect(headerIcon.getAttribute("width")).toBe("18");
    expect(headerIcon.getAttribute("height")).toBe("18");
    expect(headerIcon.innerHTML).toBe(iconMarkup);
    const row = screen.getAllByRole("row")[1];
    const pageCell = within(row).getByRole("button", { name: "Open page" }).closest("td")!;
    expect(pageCell).toBe(row.lastElementChild);
    expect(screen.queryByRole("columnheader", { name: "Page" })).toBeNull();
    expect(within(row).getAllByRole("cell")).toHaveLength(data.databases[0].columns.length + 3);
    expect(within(pageCell.previousElementSibling as HTMLElement).getByRole("button").getAttribute("aria-label")).toBe(`${name} for Network monitor`);
  });

  it.each(["select", "multiselect", "status"] as const)("keeps populated %s chips free of a full-width hover background", async (type) => {
    const options: ColumnOption[] = [{ id: 1, label: "First", emoji: "", color: "gray" }, { id: 2, label: "Second", emoji: "", color: "brown" }];
    data.columns.push({ id: 99, databaseId: 1, name: "Test", type, options, position: 4 });
    data.records[0].values["99"] = JSON.stringify(type === "multiselect" ? { Multi: [1, 2] } : type === "status" ? { Status: 1 } : { Select: 1 });
    syncColumns();
    const user = await openWorkspace();
    const cell = screen.getByRole("button", { name: "Test for Network monitor" });
    expect(cell.classList.contains("icon-only")).toBe(false);
    await user.hover(cell);
    const rule = propertyCellSource.split(".cell-button:not(.icon-only):hover:not(:disabled) {")[1].split("}")[0];
    expect(rule.trim()).toBe("background: transparent;");
    const chips = cell.querySelectorAll<HTMLElement>(".option-chip");
    expect(chips).toHaveLength(type === "multiselect" ? 2 : 1);
    expect(chips[0].style.background).toBe("rgb(48, 49, 55)");
    if (type === "multiselect") expect(chips[1].style.background).toBe("rgb(73, 55, 46)");
    await user.click(cell);
    expect(screen.getByRole("dialog", { name: "Edit Test" })).toBeTruthy();
  });

  it.each([
    { type: "number", value: null, text: "—" },
    { type: "number", value: { Number: 0 }, text: "0" },
    { type: "number", value: { Number: 2.5 }, text: "2.5" },
    { type: "text", value: null, text: "Empty" },
    { type: "text", value: { Text: "Notes" }, text: "Notes" },
    { type: "date", value: null, text: "No date" },
    { type: "date", value: { Date: "2026-10-10" }, text: "10-10-26" },
  ] satisfies { type: ColumnType; value: PropertyValue | null; text: string }[])("keeps $type cells ($text) free of full-width hover backgrounds and editable", async ({ type, value, text }) => {
    data.columns.push({ id: 99, databaseId: 1, name: "Test", type, options: null, position: 4 });
    if (value !== null) data.records[0].values["99"] = JSON.stringify(value);
    syncColumns();
    const user = await openWorkspace();
    const cell = screen.getByRole("button", { name: "Test for Network monitor" });
    expect(cell.textContent).toBe(text);
    expect(cell.classList.contains("icon-only")).toBe(false);
    await user.hover(cell);
    const rule = propertyCellSource.split(".cell-button:not(.icon-only):hover:not(:disabled) {")[1].split("}")[0];
    expect(rule.trim()).toBe("background: transparent;");
    await user.click(cell);
    if (type === "date") expect(screen.getByRole("dialog", { name: "Edit Test" })).toBeTruthy();
    else expect(screen.getByLabelText("Edit Test for Network monitor")).toBe(document.activeElement);
  });

  it.each(["select", "multiselect", "status", "checkbox"] as const)("uses a readable, compact %s cell control instead of a full-width hover target", async (type) => {
    data.columns.push({ id: 99, databaseId: 1, name: "Test", type, options: type === "checkbox" ? null : [], position: 4 });
    syncColumns();
    const user = await openWorkspace();
    const cell = screen.getByRole("button", { name: "Test for Network monitor" });
    expect(cell.classList.contains("icon-only")).toBe(true);
    expect(cell.querySelector("svg")?.getAttribute("width")).toBe("18");
    expect(cell.querySelector("svg")?.getAttribute("height")).toBe("18");
    const rule = propertyCellSource.split(".cell-button.icon-only {")[1].split("}")[0];
    expect(rule).toContain("width: 28px;");
    expect(rule).toContain("min-height: 28px;");
    expect(rule).toContain("justify-content: center;");
    cell.focus();
    await user.keyboard(type === "checkbox" ? " " : "{Enter}");
    if (type === "checkbox") {
      await waitFor(() => expect(api.setRecordValue).toHaveBeenCalledWith(1, 99, { Checkbox: true }));
      expect(cell.getAttribute("aria-pressed")).toBe("true");
      expect(cell.querySelector("svg")?.getAttribute("width")).toBe("18");
    } else {
      expect(screen.getByRole("dialog", { name: "Edit Test" })).toBeTruthy();
    }
  });

  it("renames inline and confirms deletion before calling the API", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Column Owner" }));
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByLabelText("Column name"));
    await user.type(screen.getByLabelText("Column name"), "Contact");
    await user.click(screen.getByRole("button", { name: "Rename column" }));
    expect(api.renameColumn).toHaveBeenCalledWith(13, "Contact");
    await user.click(await screen.findByRole("button", { name: "Column Contact" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteColumn).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this column and all its values permanently?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete column" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Column Contact" })).toBeNull());
    expect(api.deleteColumn).toHaveBeenCalledWith(13);
  });

  it.each(["create", "rename", "delete"])("reverts a failed %s column mutation", async (operation) => {
    const user = await openWorkspace();
    if (operation === "create") {
      vi.mocked(api.createColumn).mockRejectedValueOnce({ message: "Column save failed." });
      await user.click(screen.getByRole("button", { name: "Add column" }));
      await user.type(screen.getByLabelText("Column name"), "Failed column");
      await user.click(screen.getByRole("button", { name: "Create column" }));
    } else {
      await user.click(screen.getByRole("button", { name: "Column Owner" }));
      if (operation === "rename") {
        vi.mocked(api.renameColumn).mockRejectedValueOnce({ message: "Column save failed." });
        await user.click(screen.getByRole("button", { name: "Rename" }));
        await user.clear(screen.getByLabelText("Column name"));
        await user.type(screen.getByLabelText("Column name"), "Failed column");
        await user.click(screen.getByRole("button", { name: "Rename column" }));
      } else {
        vi.mocked(api.deleteColumn).mockRejectedValueOnce({ message: "Column save failed." });
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(screen.getByRole("button", { name: "Delete column" }));
      }
    }
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Column save failed."));
    expect(screen.queryByRole("button", { name: "Column Failed column" })).toBeNull();
    expect(screen.getByRole("button", { name: "Column Owner" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Owner for Network monitor" })).toHaveProperty("textContent", "Oshank");
  });

  it.each([false, true])("prunes deleted row IDs after removing an option (surviving selection: %s)", async (selectSurvivor) => {
    const saveOptions = vi.mocked(api.setColumnOptions).getMockImplementation()!;
    vi.mocked(api.setColumnOptions).mockImplementationOnce(async (id, options) => {
      data.records = data.records.filter((record) => {
        const value = record.values[String(id)];
        return !value || options.some((option) => option.id === JSON.parse(value).Select);
      });
      return saveOptions(id, options);
    });
    const user = await openWorkspace();
    await user.click(screen.getByRole("checkbox", { name: "Select row Network monitor" }));
    if (selectSurvivor) await user.click(screen.getByRole("checkbox", { name: "Select row Portfolio refresh" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete rows" })).toBeTruthy();

    // Keyboard activation keeps the confirmation open until selection pruning closes it.
    for (const name of ["Column Priority", "Edit options", "Remove High", "Save options"]) {
      screen.getByRole("button", { name }).focus();
      await user.keyboard("{Enter}");
    }
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select row Network monitor" })).toBeNull());
    expect(api.setColumnOptions).toHaveBeenCalledWith(11, expect.not.arrayContaining([expect.objectContaining({ id: 1 })]));
    if (selectSurvivor) {
      expect(within(screen.getByRole("group", { name: "Row selection" })).getByText("1 selected")).toBeTruthy();
      expect((screen.getByRole("checkbox", { name: "Select row Portfolio refresh" }) as HTMLInputElement).checked).toBe(true);
    } else {
      expect(screen.queryByRole("group", { name: "Row selection" })).toBeNull();
      expect(screen.queryByRole("dialog", { name: "Delete rows" })).toBeNull();
      await user.click(screen.getByRole("checkbox", { name: "Select row Portfolio refresh" }));
      expect(within(screen.getByRole("group", { name: "Row selection" })).getByText("1 selected")).toBeTruthy();
      expect(screen.queryByRole("dialog", { name: "Delete rows" })).toBeNull();
    }
  });

  it("edits option labels, emoji from the 48-item grid, colors, and removals as a whole list", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Column Priority" }));
    await user.click(screen.getByRole("button", { name: "Edit options" }));
    await user.click(screen.getByRole("button", { name: "Remove Medium" }));
    await user.clear(screen.getAllByLabelText("Option label")[0]);
    await user.type(screen.getAllByLabelText("Option label")[0], "Urgent");
    await user.click(screen.getByRole("button", { name: "Emoji for Urgent" }));
    expect(screen.getAllByRole("button", { name: /^Choose / })).toHaveLength(48);
    await user.click(screen.getByRole("button", { name: "Choose ⭐" }));
    await user.selectOptions(screen.getAllByLabelText("Color")[0], "purple");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getAllByLabelText("Option label")[2], "Later");
    await user.click(screen.getByRole("button", { name: "Save options" }));
    expect(api.setColumnOptions).toHaveBeenCalledWith(11, [
      { id: 1, label: "Urgent", emoji: "⭐", color: "purple" },
      { id: 3, label: "Low", emoji: "", color: "gray" },
      { id: 4, label: "Later", emoji: "", color: "gray" },
    ]);
    const cell = await screen.findByRole("button", { name: "Priority for Network monitor" });
    expect(cell.textContent).toBe("⭐ Urgent");
    const chip = cell.querySelector(".option-chip") as HTMLElement;
    expect(chip.style.background).toBe("rgb(59, 48, 77)");
    expect(chip.style.color).toBe("rgb(203, 176, 237)");
    expect(Object.keys(optionColors)).toHaveLength(9);
  });

  it.each([
    ["text", { Text: "Original" }, { Text: "Changed" }],
    ["number", { Number: 1 }, { Number: 2.5 }],
    ["checkbox", { Checkbox: false }, { Checkbox: true }],
    ["select", { Select: 1 }, { Select: 2 }],
    ["status", { Status: 1 }, { Status: 2 }],
    ["multiselect", { Multi: [1] }, { Multi: [1, 2] }],
    ["date", { Date: "2024-02-28" }, { Date: "2024-02-29" }],
  ] as [ColumnType, PropertyValue, PropertyValue][])("saves the %s editor through the API", async (type, initial, expected) => {
    const options: ColumnOption[] = [{ id: 1, label: "First", emoji: "⭐", color: "blue" }, { id: 2, label: "Second", emoji: "", color: "green" }];
    const column: Column = { id: 99, databaseId: 1, name: "Test", type, options: ["select", "status", "multiselect"].includes(type) ? options : null, position: 4 };
    data.columns.push(column); syncColumns();
    data.records[0].values["99"] = JSON.stringify(initial);
    const user = await openWorkspace();
    const cell = screen.getByRole("button", { name: "Test for Network monitor" });
    cell.focus();
    await user.keyboard(type === "checkbox" ? " " : "{Enter}");
    if (type === "text" || type === "number") {
      const input = screen.getByLabelText("Edit Test for Network monitor");
      await user.clear(input);
      await user.type(input, type === "text" ? "Changed" : "2.5");
      await user.keyboard("{Enter}");
    } else if (type === "date") {
      await user.click(screen.getByRole("button", { name: "29-02-24" }));
    } else if (type !== "checkbox") {
      await user.click(screen.getByRole("button", { name: "Second" }));
    }
    await waitFor(() => expect(api.setRecordValue).toHaveBeenCalledWith(1, 99, expected));
    if (type === "date") expect(cell.textContent).toBe("29-02-24");
    if (type === "multiselect") {
      expect(screen.getByRole("dialog", { name: "Edit Test" })).toBeTruthy();
      await user.click(screen.getByRole("button", { name: /First/ }));
      await waitFor(() => expect(api.setRecordValue).toHaveBeenLastCalledWith(1, 99, { Multi: [2] }));
      await user.click(screen.getByRole("button", { name: "Clear" }));
      await waitFor(() => expect(api.setRecordValue).toHaveBeenLastCalledWith(1, 99, null));
    }
  });

  it("adds an option inline and immediately selects the returned stable id", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Priority for Network monitor" }));
    await user.type(screen.getByPlaceholderText("Type to add option…"), "Urgent");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await waitFor(() => expect(api.addInlineOption).toHaveBeenCalledWith(11, "Urgent"));
    await waitFor(() => expect(api.setRecordValue).toHaveBeenCalledWith(1, 11, { Select: 4 }));
    expect(screen.getByRole("button", { name: "Priority for Network monitor" }).textContent).toBe("Urgent");
  });

  it("reverts failed header option edits and leaves failed inline additions unselected", async () => {
    const user = await openWorkspace();
    vi.mocked(api.setColumnOptions).mockRejectedValueOnce({ message: "Options save failed." });
    await user.click(screen.getByRole("button", { name: "Column Priority" }));
    await user.click(screen.getByRole("button", { name: "Edit options" }));
    await user.clear(screen.getAllByLabelText("Option label")[0]);
    await user.type(screen.getAllByLabelText("Option label")[0], "Failed option");
    await user.click(screen.getByRole("button", { name: "Save options" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Priority for Network monitor" }).textContent).toBe("High");
    vi.mocked(api.addInlineOption).mockRejectedValueOnce({ message: "Option creation failed." });
    await user.click(screen.getByRole("button", { name: "Priority for Network monitor" }));
    await user.type(screen.getByPlaceholderText("Type to add option…"), "Failed option");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Option creation failed."));
    expect(api.setRecordValue).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Priority for Network monitor" }).textContent).toBe("High");
  });

  it("keeps February 29 out of a non-leap-year calendar and supports month navigation", async () => {
    data.records[0].values["12"] = JSON.stringify({ Date: "2026-02-28" });
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Due date for Network monitor" }));
    expect(screen.queryByRole("button", { name: "29-02-26" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("button", { name: "31-03-26" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("button", { name: "28-02-26" }).getAttribute("aria-pressed")).toBe("true");
    expect(api.setRecordValue).not.toHaveBeenCalled();
  });

  it("optimistically displays edits, reverts failed saves, and supports Escape and blur", async () => {
    let reject!: (cause: unknown) => void;
    vi.mocked(api.setRecordValue).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const user = await openWorkspace();
    const cell = screen.getByRole("button", { name: "Owner for Network monitor" });
    await user.click(cell);
    await user.clear(screen.getByLabelText("Edit Owner for Network monitor"));
    await user.type(screen.getByLabelText("Edit Owner for Network monitor"), "Changed");
    await user.keyboard("{Enter}");
    expect(cell.textContent).toBe("Changed");
    reject({ message: "Cell save failed." });
    await screen.findByRole("alert");
    await waitFor(() => expect(cell.textContent).toBe("Oshank"));
    await user.click(cell);
    await user.type(screen.getByLabelText("Edit Owner for Network monitor"), "Discard");
    await user.keyboard("{Escape}");
    expect(cell.textContent).toBe("Oshank");
    expect(api.setRecordValue).toHaveBeenCalledTimes(1);
    await user.click(cell);
    const input = screen.getByLabelText("Edit Owner for Network monitor");
    await user.clear(input); await user.type(input, "Blur saved");
    await user.tab();
    await waitFor(() => expect(api.setRecordValue).toHaveBeenLastCalledWith(1, 13, { Text: "Blur saved" }));
  });

  it("rejects invalid numbers inline without calling the API", async () => {
    data.columns.push({ id: 99, databaseId: 1, name: "Amount", type: "number", options: null, position: 4 }); syncColumns();
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Amount for Network monitor" }));
    await user.type(screen.getByLabelText("Edit Amount for Network monitor"), "Infinity");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveProperty("textContent", "Enter a valid finite number.");
    expect(api.setRecordValue).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes popovers on outside clicks and Escape and clears date/select values", async () => {
    const user = await openWorkspace();
    for (const name of ["Priority", "Due date"]) {
      const cell = screen.getByRole("button", { name: `${name} for Network monitor` });
      await user.click(cell);
      await user.click(screen.getByRole("button", { name: "Clear" }));
      await waitFor(() => expect(api.setRecordValue).toHaveBeenLastCalledWith(1, name === "Priority" ? 11 : 12, null));
      if (name === "Due date") expect(cell.textContent).toBe("No date");
      await user.click(cell);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(cell);
      await user.click(cell);
      await user.click(screen.getByRole("heading", { name: "Projects" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  it("groups dynamic status options and gracefully handles a deleted status column", async () => {
    data.records[0].values = {};
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "By status" }));
    expect(within(screen.getByRole("region", { name: "No status records" })).getByRole("button", { name: "Network monitor" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All records" }));
    await user.click(screen.getByRole("button", { name: "Column Status" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete column" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Column Status" })).toBeNull());
    await user.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getAllByRole("row")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "By status" }));
    expect(within(screen.getByRole("region", { name: "No status records" })).getAllByRole("button")).toHaveLength(6);
  });
});

describe("Folio workspace", () => {
  describe("sidebar resizing", () => {
    beforeEach(() => { vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000); });

    it("clears keyboard focus when dragging and restores it through Tab navigation", async () => {
      const user = await openWorkspace();
      const handle = screen.getByRole("separator", { name: "Sidebar width" });
      handle.focus();
      expect(document.activeElement).toBe(handle);
      await pointer(handle, "pointerdown", 210);
      expect(document.activeElement).not.toBe(handle);
      await pointer(handle, "pointermove", 240);
      await pointer(handle, "pointerup", 240);
      expect(document.activeElement).not.toBe(handle);
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenCalledWith(240));
      screen.getByRole("button", { name: "Settings" }).focus();
      await user.tab();
      expect(document.activeElement).toBe(handle);
      await user.keyboard("{ArrowRight}");
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenLastCalledWith(256));
      expect(workspaceSource.split(".sidebar-resize {")[1].split("}")[0]).toContain("outline: none;");
      expect(workspaceSource).toContain(".sidebar-resize:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }");
    });

    function pointer(handle: HTMLElement, type: string, clientX: number, pointerId = 1) {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      return fireEvent(handle, event);
    }

    it("captures a drag, clamps live against the viewport, and saves only on release", async () => {
      await openWorkspace();
      const handle = screen.getByRole("separator", { name: "Sidebar width" });
      const shell = screen.getByRole("main").parentElement!;
      const capture = vi.spyOn(handle, "setPointerCapture");
      expect(handle.getAttribute("aria-orientation")).toBe("vertical");
      expect(handle.tabIndex).toBe(0);
      expect(shell.style.gridTemplateColumns).toBe("210px minmax(0, 1fr)");
      await pointer(handle, "pointerdown", 210);
      expect(capture).toHaveBeenCalledWith(1);
      await pointer(handle, "pointermove", 100);
      expect(shell.style.gridTemplateColumns).toBe("180px minmax(0, 1fr)");
      await pointer(handle, "pointermove", 900, 2);
      expect(shell.style.gridTemplateColumns).toBe("180px minmax(0, 1fr)");
      await pointer(handle, "pointermove", 900);
      expect(shell.style.gridTemplateColumns).toBe("300px minmax(0, 1fr)");
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(800);
      await fireEvent(window, new Event("resize"));
      await pointer(handle, "pointermove", 900);
      expect(shell.style.gridTemplateColumns).toBe("240px minmax(0, 1fr)");
      expect(api.setSidebarWidth).not.toHaveBeenCalled();
      await pointer(handle, "pointerup", 900);
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenCalledExactlyOnceWith(240));
      await pointer(handle, "pointermove", 100);
      expect(shell.style.gridTemplateColumns).toBe("240px minmax(0, 1fr)");
    });

    it("persists each keyboard adjustment, Home/End, and double-click reset as NULL", async () => {
      const user = await openWorkspace();
      const handle = screen.getByRole("separator", { name: "Sidebar width" });
      const shell = screen.getByRole("main").parentElement!;
      handle.focus();
      for (const [key, width] of [["ArrowRight", 226], ["ArrowLeft", 210], ["Home", 180], ["End", 300]] as const) {
        await user.keyboard(`{${key}}`);
        expect(shell.style.gridTemplateColumns).toBe(`${width}px minmax(0, 1fr)`);
        await waitFor(() => expect(api.setSidebarWidth).toHaveBeenLastCalledWith(width));
      }
      expect(api.setSidebarWidth).toHaveBeenCalledTimes(4);
      await fireEvent.doubleClick(handle);
      expect(shell.style.gridTemplateColumns).toBe("210px minmax(0, 1fr)");
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenLastCalledWith(null));
      await user.click(screen.getByRole("button", { name: "Toggle database sidebar" }));
      expect(shell.style.gridTemplateColumns).toBe("");
    });

    it("initializes the saved width before revealing the workspace and restores it on remount", async () => {
      data.settings!.sidebarWidth = 280;
      let finishLoad!: (value: WorkspaceData) => void;
      vi.mocked(api.load).mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
      const mounted = render(Workspace);
      expect((mounted.container.firstElementChild as HTMLElement).style.visibility).toBe("hidden");
      finishLoad(structuredClone(data));
      await screen.findByRole("heading", { name: "Projects" });
      expect((mounted.container.firstElementChild as HTMLElement).style.visibility).not.toBe("hidden");
      expect(screen.getByRole("main").parentElement!.style.gridTemplateColumns).toBe("280px minmax(0, 1fr)");
      await fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenCalledWith(264));
      mounted.unmount();
      render(Workspace);
      await screen.findByRole("heading", { name: "Projects" });
      expect(screen.getByRole("main").parentElement!.style.gridTemplateColumns).toBe("264px minmax(0, 1fr)");
    });

    it("preserves the narrow default, prioritizes the minimum, and leaves the mobile grid untouched", async () => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(550);
      await openWorkspace();
      const shell = screen.getByRole("main").parentElement!;
      expect(shell.style.gridTemplateColumns).toBe("165px minmax(0, 1fr)");
      await fireEvent.keyDown(screen.getByRole("separator"), { key: "End" });
      expect(shell.style.gridTemplateColumns).toBe("180px minmax(0, 1fr)");
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenCalledWith(180));
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(380);
      await fireEvent(window, new Event("resize"));
      expect(shell.style.gridTemplateColumns).toBe("");
      // jsdom does not evaluate media queries; assert the existing breakpoint's hide rule.
      expect(workspaceSource.split("@media (max-width: 500px) {")[1]).toContain(".sidebar-resize { display: none; }");
      expect(workspaceSource).toContain(".sidebar-resize { position: absolute;");
    });

    it("keeps the session width after a save failure and allows another adjustment", async () => {
      vi.mocked(api.setSidebarWidth).mockRejectedValueOnce({ message: "Could not save sidebar width." });
      await openWorkspace();
      const handle = screen.getByRole("separator");
      const shell = screen.getByRole("main").parentElement!;
      await fireEvent.keyDown(handle, { key: "ArrowRight" });
      expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Could not save sidebar width."));
      expect(shell.style.gridTemplateColumns).toBe("226px minmax(0, 1fr)");
      await fireEvent.keyDown(handle, { key: "ArrowRight" });
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenLastCalledWith(242));
      expect(shell.style.gridTemplateColumns).toBe("242px minmax(0, 1fr)");
    });

    it("serializes saves without blocking interaction or replacing workspace data", async () => {
      let finish!: (value: WorkspaceData) => void;
      vi.mocked(api.setSidebarWidth).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      const user = await openWorkspace();
      const handle = screen.getByRole("separator");
      await fireEvent.keyDown(handle, { key: "ArrowRight" });
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenCalledWith(226));
      await fireEvent.keyDown(handle, { key: "ArrowRight" });
      expect(screen.getByRole("main").parentElement!.style.gridTemplateColumns).toBe("242px minmax(0, 1fr)");
      await user.click(screen.getByRole("button", { name: "Reading list" }));
      finish(structuredClone(data));
      await waitFor(() => expect(api.setSidebarWidth).toHaveBeenLastCalledWith(242));
      expect(screen.getByRole("heading", { name: "Reading list" })).toBeTruthy();
    });
  });

  it("opens pages with keyboard focus, without adding in-flow row geometry", async () => {
    const user = await openWorkspace();
    const trigger = screen.getAllByRole("button", { name: "Open page" })[0];
    expect(trigger.tagName).toBe("BUTTON");
    expect(workspaceSource).toContain("tr:hover .page-button, tr:focus-within .page-button");
    expect(workspaceSource.split(".page-button {")[1].split("}")[0]).toContain("position: absolute");
    trigger.focus();
    await user.keyboard("{Enter}");
    const panel = await screen.findByRole("region", { name: "Record page" });
    expect(within(panel).getByRole("heading", { name: "Network monitor" })).toBeTruthy();
    const notes = await screen.findByLabelText("Page notes");
    expect(notes).toHaveProperty("value", "# Notes");
    expect(document.activeElement).toBe(notes);
    expect(api.getRecordPage).toHaveBeenCalledWith(1);
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it("overlays Page at the row's right edge without a separate column when there are no properties", async () => {
    data.columns = [];
    for (const database of data.databases) database.columns = [];
    const user = await openWorkspace();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3); // Reorder, Name, add column.
    expect(screen.queryByRole("columnheader", { name: "Page" })).toBeNull();
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByRole("cell")).toHaveLength(3);
    const trigger = within(row).getByRole("button", { name: "Open page" });
    expect(trigger.closest("td")).toBe(row.lastElementChild);
    const actionsRule = workspaceSource.split(".row-actions {")[1].split("}")[0];
    expect(actionsRule).toContain("position: relative;");
    expect(actionsRule).toContain("min-width: 80px;");
    expect(workspaceSource.split(".table-wrap {")[1].split("}")[0]).toContain("overflow-x: auto;");
    expect(workspaceSource.split(".page-button {")[1].split("}")[0]).toContain("right: 4px;");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("region", { name: "Record page" })).toBeTruthy();
    expect(api.getRecordPage).toHaveBeenCalledWith(1);
  });

  it("debounces notes and displays Saving then Saved", async () => {
    await openWorkspace();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    const input = await screen.findByLabelText("Page notes");
    let finish!: (value: string) => void;
    vi.mocked(api.saveRecordPage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    vi.useFakeTimers();
    await fireEvent.input(input, { target: { value: "First" } });
    await vi.advanceTimersByTimeAsync(400);
    await fireEvent.input(input, { target: { value: "Latest" } });
    await vi.advanceTimersByTimeAsync(599);
    expect(api.saveRecordPage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveRecordPage).toHaveBeenCalledExactlyOnceWith(1, "Latest");
    expect(screen.getByText("Saving…")).toBeTruthy();
    finish("timestamp");
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
  });

  it("flushes on close and returns focus to the Page trigger", async () => {
    await openWorkspace();
    const trigger = screen.getAllByRole("button", { name: "Open page" })[0];
    await fireEvent.click(trigger);
    await fireEvent.input(await screen.findByLabelText("Page notes"), { target: { value: "Flush me" } });
    await fireEvent.click(screen.getByRole("button", { name: "Close page" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Record page" })).toBeNull());
    expect(api.saveRecordPage).toHaveBeenCalledWith(1, "Flush me");
    expect(document.activeElement).toBe(trigger);
    expect(vi.mocked(createEditor).mock.results[0].value.destroy).toHaveBeenCalledOnce();
  });

  it("expands, collapses, keeps both controls and leaves Escape to the editor", async () => {
    const user = await openWorkspace();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    await screen.findByLabelText("Page notes");
    const panel = screen.getByRole("region", { name: "Record page" });
    await fireEvent.click(screen.getByRole("button", { name: "Expand page" }));
    expect(panel.classList.contains("expanded")).toBe(true);
    expect(screen.getByRole("button", { name: "Close page" })).toBeTruthy();
    expect(pageSource).toContain("position: fixed; inset: var(--titlebar-height) 0 0; width: 100%");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Record page" })).toBe(panel);
    await fireEvent.click(screen.getByRole("button", { name: "Collapse page" }));
    expect(panel.classList.contains("expanded")).toBe(false);
  });

  it("keeps failed drafts open on close and retries without losing content", async () => {
    await openWorkspace();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    const input = await screen.findByLabelText("Page notes");
    vi.mocked(api.saveRecordPage).mockRejectedValueOnce({ message: "Could not save page." });
    await fireEvent.input(input, { target: { value: "Keep this draft" } });
    await fireEvent.click(screen.getByRole("button", { name: "Close page" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save page.");
    expect(input).toHaveProperty("value", "Keep this draft");
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Saved", { exact: true });
    expect(api.saveRecordPage).toHaveBeenLastCalledWith(1, "Keep this draft");
  });

  it("flushes before switching, destroys the old editor and resets content and dirty state", async () => {
    await openWorkspace();
    const triggers = screen.getAllByRole("button", { name: "Open page" });
    await fireEvent.click(triggers[0]);
    await fireEvent.input(await screen.findByLabelText("Page notes"), { target: { value: "First record draft" } });
    vi.mocked(api.getRecordPage).mockResolvedValueOnce("Second record notes");
    await fireEvent.click(triggers[1]);
    await waitFor(() => expect(screen.getByLabelText("Page notes")).toHaveProperty("value", "Second record notes"));
    expect(api.saveRecordPage).toHaveBeenCalledExactlyOnceWith(1, "First record draft");
    expect(api.getRecordPage).toHaveBeenLastCalledWith(2);
    expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
    expect(vi.mocked(createEditor).mock.results[0].value.destroy).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole("button", { name: "Close page" }));
    expect(api.saveRecordPage).toHaveBeenCalledTimes(1);
  });

  it("blocks switching when the old draft cannot be saved", async () => {
    await openWorkspace();
    const triggers = screen.getAllByRole("button", { name: "Open page" });
    await fireEvent.click(triggers[0]);
    await fireEvent.input(await screen.findByLabelText("Page notes"), { target: { value: "Unsaved first" } });
    vi.mocked(api.saveRecordPage).mockRejectedValue({ message: "Try again." });
    await fireEvent.click(triggers[1]);
    await screen.findByRole("alert");
    expect(api.getRecordPage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Page notes")).toHaveProperty("value", "Unsaved first");
  });

  it("serializes a slow save and flushes edits made while closing", async () => {
    await openWorkspace();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    const input = await screen.findByLabelText("Page notes");
    let finish!: (value: string) => void;
    vi.mocked(api.saveRecordPage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    vi.useFakeTimers();
    await fireEvent.input(input, { target: { value: "First save" } });
    await vi.advanceTimersByTimeAsync(600);
    await fireEvent.input(input, { target: { value: "Latest during save" } });
    await fireEvent.click(screen.getByRole("button", { name: "Close page" }));
    expect(api.saveRecordPage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Page notes")).toBe(input);
    finish("timestamp");
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveRecordPage).toHaveBeenLastCalledWith(1, "Latest during save");
    expect(screen.queryByRole("region", { name: "Record page" })).toBeNull();
  });

  it("ignores an old page load after switching records", async () => {
    await openWorkspace();
    let finish!: (value: string) => void;
    vi.mocked(api.getRecordPage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const triggers = screen.getAllByRole("button", { name: "Open page" });
    await fireEvent.click(triggers[0]);
    vi.mocked(api.getRecordPage).mockResolvedValueOnce("Second page");
    await fireEvent.click(triggers[1]);
    expect(await screen.findByLabelText("Page notes")).toHaveProperty("value", "Second page");
    finish("Stale first page");
    await waitFor(() => expect(createEditor).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Page notes")).toHaveProperty("value", "Second page");
  });

  it("closes and destroys the page when its record is deleted", async () => {
    const user = await openWorkspace();
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    await screen.findByLabelText("Page notes");
    vi.mocked(api.remove).mockResolvedValue({ ...data, records: data.records.filter((record) => record.id !== 1) });
    await user.click(screen.getByRole("button", { name: "Network monitor" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Record page" })).toBeNull());
    expect(vi.mocked(createEditor).mock.results[0].value.destroy).toHaveBeenCalledOnce();
  });

  it("retries page loading and routes all toolbar actions through the editor boundary", async () => {
    await openWorkspace();
    vi.mocked(api.getRecordPage).mockRejectedValueOnce({ message: "Could not load notes." });
    await fireEvent.click(screen.getAllByRole("button", { name: "Open page" })[0]);
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Page notes")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByLabelText("Page notes");
    for (const action of ["Bold", "Italic", "Heading", "Bullet list", "Numbered list", "Quote", "Inline code", "Code block", "Link"]) {
      await fireEvent.click(screen.getByRole("button", { name: action }));
      expect(vi.mocked(createEditor).mock.results[0].value.action).toHaveBeenLastCalledWith(action);
    }
  });

  it("uses medium weight for table text, breadcrumbs, and workspace details without changing heading weight", () => {
    for (const selector of [".side-bottom", ".path", "table", "th"]) {
      const rule = workspaceSource.split(`${selector} {`)[1].split("}")[0];
      expect(rule, selector).toContain("font-weight: 500;");
    }
    expect(workspaceSource.split("h1 {")[1].split("}")[0]).toContain("font-weight: 600;");
  });

  it("keeps navigation and main content in the same layout container when toggling the sidebar", async () => {
    const user = await openWorkspace();
    const main = screen.getByRole("main");
    const shell = main.parentElement!;
    const sidebar = screen.getByRole("complementary", { name: "Workspace navigation" });
    expect(sidebar.parentElement).toBe(shell);
    expect(shell.classList.contains("sidebar-open")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Toggle database sidebar" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(shell.classList.contains("sidebar-open")).toBe(false);
    expect(main.parentElement).toBe(shell);
    await user.click(screen.getByRole("button", { name: "Toggle database sidebar" }));
    expect(screen.getByRole("complementary").parentElement).toBe(shell);
    expect(shell.classList.contains("sidebar-open")).toBe(true);
  });

  it.each([["Teal", "#5ecfca"], ["Amber", "#f5cd6f"]])("saves the %s accent preset", async (label, accentColor) => {
    data = { settings: null, databases: [], columns: [], views: [], records: [] };
    vi.mocked(api.setup).mockResolvedValue({ ...data, settings: { name: "Home", accentColor, fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false, autostart: false, gpuAcceleration: true } });
    const user = userEvent.setup();
    render(Workspace);
    await user.type(await screen.findByLabelText("Workspace name"), "Home");
    await user.click(screen.getByRole("radio", { name: label }));
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await screen.findByRole("heading", { name: "Welcome to Home" });
    expect(api.setup).toHaveBeenCalledWith("Home", accentColor);
  });

  it("sets up an empty workspace and creates its first database without sample records", async () => {
    data = { settings: null, databases: [], columns: [], views: [], records: [] };
    vi.mocked(api.setup).mockImplementation(async (name, accentColor) => {
      data.settings = { name, accentColor, fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false, autostart: false, gpuAcceleration: true };
      return structuredClone(data);
    });
    vi.mocked(api.createDatabase).mockImplementation(async (name) => {
      data.databases.push({ id: 1, name, description: "", icon: "layers", emoji: "", customIcon: null, columns: [] });
      data.views.push({ id: 1, databaseId: 1, name: "All records", layout: "table", filterActive: false, sortActive: false, compact: false, showOwner: true });
      return structuredClone(data);
    });
    const user = userEvent.setup();
    const mounted = render(Workspace);
    await screen.findByRole("heading", { name: "A little space, all yours." });
    expect((screen.getByRole("button", { name: "Create workspace" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Workspace name"), "  My studio  ");
    await user.click(screen.getByRole("radio", { name: "Mint" }));
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await screen.findByRole("heading", { name: "Welcome to My studio" });
    expect(api.setup).toHaveBeenCalledWith("My studio", "#8bd5b5");
    expect(screen.queryByRole("button", { name: "Projects" })).toBeNull();
    await user.type(screen.getByLabelText("Database name"), "Tasks");
    await user.click(screen.getByRole("button", { name: "Create database" }));
    await screen.findByRole("heading", { name: "Tasks" });
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.getByText("0 records")).toBeTruthy();
    expect(mounted.container.firstElementChild?.getAttribute("style")).toContain("--accent: #8bd5b5");
    mounted.unmount();
    render(Workspace);
    await screen.findByRole("heading", { name: "Tasks" });
    expect(screen.queryByLabelText("Workspace name")).toBeNull();
  });

  it("keeps setup inputs on save failure and retries with a custom color", async () => {
    data = { settings: null, databases: [], columns: [], views: [], records: [] };
    vi.mocked(api.setup).mockRejectedValueOnce({ message: "Could not save workspace." });
    const user = userEvent.setup();
    render(Workspace);
    const name = await screen.findByLabelText("Workspace name");
    await user.type(name, "Home");
    await fireEvent.input(screen.getByLabelText("Custom accent color"), { target: { value: "#123456" } });
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save workspace.");
    expect(name).toHaveProperty("value", "Home");
    vi.mocked(api.setup).mockResolvedValue({ ...data, settings: { name: "Home", accentColor: "#123456", fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false, autostart: false, gpuAcceleration: true } });
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await screen.findByRole("heading", { name: "Welcome to Home" });
    expect(api.setup).toHaveBeenLastCalledWith("Home", "#123456");
  });

  it("shows database creation errors without leaving the empty workspace", async () => {
    data = { settings: { name: "Home", accentColor: "#b8aaf7", fontFamily: "", sidebarWidth: null, windowButtonLayout: "", minimizeToTray: false, autostart: false, gpuAcceleration: true }, databases: [], columns: [], views: [], records: [] };
    vi.mocked(api.createDatabase).mockRejectedValue({ message: "Could not create database." });
    const user = userEvent.setup();
    render(Workspace);
    await user.type(await screen.findByLabelText("Database name"), "Tasks");
    await user.click(screen.getByRole("button", { name: "Create database" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not create database.");
    expect(screen.getByLabelText("Database name")).toHaveProperty("value", "Tasks");
  });

  it("loads records and switches databases and saved views", async () => {
    const user = await openWorkspace();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getAllByRole("row")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Reading list" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "By status" }));
    expect(screen.getByRole("region", { name: "To do records" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("saves view settings without affecting another database", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "View settings" }));
    expect(screen.getByRole("checkbox", { name: "Show owner" })).toHaveProperty("disabled", true);
    await user.selectOptions(screen.getByRole("combobox", { name: "Layout" }), "list");
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
    await user.click(screen.getByRole("checkbox", { name: "Show owner" }));
    await waitFor(() => expect(api.saveView).toHaveBeenCalledWith(expect.objectContaining({ id: 10, showOwner: false })));
    await user.click(screen.getByRole("button", { name: "Reading list" }));
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeTruthy();
  });

  it("disables manual order during sorting and sends keyboard reorder commands", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Sort" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Reorder Network monitor" }) as HTMLButtonElement).disabled).toBe(true));
    await user.click(screen.getByRole("button", { name: "Sort A–Z" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Reorder Network monitor" }) as HTMLButtonElement).disabled).toBe(false));
    vi.mocked(api.reorder).mockResolvedValue(structuredClone(data));
    const grip = screen.getByRole("button", { name: "Reorder Network monitor" });
    grip.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith(1, 1, 2, true));
    await waitFor(() => expect(document.activeElement).toBe(grip));
  });

  it("offers accessible move buttons and enforces visible boundaries", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Reorder Network monitor" }));
    expect((screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
    vi.mocked(api.reorder).mockResolvedValue(structuredClone(data));
    await user.click(screen.getByRole("button", { name: "Move down" }));
    expect(api.reorder).toHaveBeenCalledWith(1, 1, 2, true);
  });

  it("creates a visible record under a filter and saves edits", async () => {
    const user = await openWorkspace();
    vi.mocked(api.createRecord).mockImplementation(async (databaseId) => {
      data.records.push({ id: 11, databaseId, name: "Untitled", values: {} });
      return structuredClone(data);
    });
    vi.mocked(api.update).mockImplementation(async (input) => {
      data.records = data.records.map((record) => record.id === input.id ? { ...record, ...input } : record);
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "In progress" }));
    await user.click(screen.getByRole("button", { name: "New record" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.createRecord).toHaveBeenCalledWith(1);
    expect(api.setRecordValue).toHaveBeenCalledWith(11, 10, { Status: 2 });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "A real project");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "A real project" })).toBeTruthy();
  });

  it("keeps unsaved edits and shows an error if SQLite rejects a save", async () => {
    const user = await openWorkspace();
    vi.mocked(api.update).mockRejectedValue({ code: "storage_error", message: "Your changes could not be saved." });
    await user.click(screen.getByRole("button", { name: "Network monitor" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Keep this draft");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Your changes could not be saved.");
    expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Keep this draft");
  });

  it("requires confirmation before deleting a record", async () => {
    const user = await openWorkspace();
    vi.mocked(api.remove).mockImplementation(async (id) => {
      data.records = data.records.filter((record) => record.id !== id);
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "Network monitor" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Network monitor" })).toBeNull();
  });

  it("places a keyboard-operable settings control beside the workspace identity block", async () => {
    const user = await openWorkspace();
    const sidebar = screen.getByRole("complementary", { name: "Workspace navigation" });
    const button = within(sidebar).getByRole("button", { name: "Settings" });
    expect(button.tagName).toBe("BUTTON");
    // The gear must sit inside the text block that positions it, so it can centre on
    // the name/subtitle only. The avatar stays a sibling, as the block's top anchor.
    const text = button.parentElement!;
    expect(text.classList.contains("identity-text")).toBe(true);
    expect(text.parentElement!.classList.contains("side-bottom")).toBe(true);
    expect(text.previousElementSibling!.classList.contains("avatar")).toBe(true);
    expect(text.textContent).toContain("Test workspace");
    expect(text.textContent).toContain("Local workspace");
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
  });

  it("opens Interface settings with the Font input and moves focus into it", async () => {
    const user = await openWorkspace();
    const button = screen.getByRole("button", { name: "Settings" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Interface" })).toBeTruthy();
    const categories = within(dialog).getByRole("navigation", { name: "Settings categories" });
    const category = within(categories).getByRole("button", { name: "Interface" });
    expect(category.tagName).toBe("BUTTON");
    expect(category.getAttribute("aria-current")).toBe("page");
    expect(category.getAttribute("aria-controls")).toBe("interface-settings");
    expect(categories.parentElement).toBe(within(dialog).getByRole("region", { name: "Interface" }).parentElement);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close settings" }));
    category.focus();
    await user.keyboard("{Enter}");
    expect(category.getAttribute("aria-current")).toBe("page");
    expect(within(dialog).getByLabelText("Font")).toHaveProperty("placeholder", "Auto (Noto Sans Display)");
    expect(within(dialog).getByLabelText("Font").parentElement).toBe(within(dialog).getByText("Font", { selector: "label" }).parentElement);
    expect(within(dialog).queryByText("Auto — Noto Sans Display")).toBeNull();
    expect(dialog.querySelector("#font-hint")?.textContent).toBe("");
  });

  it.each([false, true])("selects System by keyboard, loads %s, and persists tray changes on remount", async (enabled) => {
    data.settings!.minimizeToTray = enabled;
    const mounted = render(Workspace);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    screen.getByRole("button", { name: "Interface" }).focus();
    await user.tab();
    const system = screen.getByRole("button", { name: "System" });
    expect(document.activeElement).toBe(system);
    await user.keyboard("{Enter}");
    expect(system.getAttribute("aria-current")).toBe("page");
    expect(system.getAttribute("aria-controls")).toBe("system-settings");
    expect(screen.getByRole("heading", { name: "System" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Interface" })).toBeNull();
    const checkbox = screen.getByRole("checkbox", { name: "Minimize to tray when closed" });
    expect(checkbox).toHaveProperty("checked", enabled);
    await user.tab();
    expect(document.activeElement).toBe(checkbox);
    await user.keyboard(" ");
    await waitFor(() => expect(api.setMinimizeToTray).toHaveBeenCalledExactlyOnceWith(!enabled));
    expect(data.settings!.minimizeToTray).toBe(!enabled);
    mounted.unmount();
    render(Workspace);
    await screen.findByRole("heading", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByRole("checkbox", { name: "Minimize to tray when closed" })).toHaveProperty("checked", !enabled);
  });

  it.each([false, true])("reverts a failed tray save to %s and disables the checkbox while busy", async (enabled) => {
    data.settings!.minimizeToTray = enabled;
    let failSave!: (error: unknown) => void;
    vi.mocked(api.setMinimizeToTray).mockImplementationOnce(() => new Promise((_, reject) => { failSave = reject; }));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "Minimize to tray when closed" });
    await user.click(checkbox);
    expect(checkbox).toHaveProperty("disabled", true);
    failSave({ message: "Could not save tray setting." });
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveProperty("textContent", "Could not save tray setting.");
    expect(checkbox).toHaveProperty("checked", enabled);
    expect(checkbox).toHaveProperty("disabled", false);
    expect(data.settings!.minimizeToTray).toBe(enabled);
  });

  it.each([false, true])("saves autostart from the System pane (%s)", async (enabled) => {
    data.settings!.autostart = enabled;
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "Start minimized in tray on login" });
    expect(checkbox).toHaveProperty("checked", enabled);
    await user.click(checkbox);
    await waitFor(() => expect(api.setAutostart).toHaveBeenCalledExactlyOnceWith(!enabled));
    expect(data.settings!.autostart).toBe(!enabled);
    expect(screen.getByText("Folio starts in the background when you log in, with no window.")).toBeTruthy();
  });

  it("reverts a failed autostart save and disables the checkbox while busy", async () => {
    let failSave!: (error: unknown) => void;
    vi.mocked(api.setAutostart).mockImplementationOnce(() => new Promise((_, reject) => { failSave = reject; }));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "Start minimized in tray on login" });
    await user.click(checkbox);
    expect(checkbox).toHaveProperty("disabled", true);
    failSave({ message: "Could not save autostart setting." });
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveProperty("textContent", "Could not save autostart setting.");
    expect(checkbox).toHaveProperty("checked", false);
    expect(checkbox).toHaveProperty("disabled", false);
    expect(data.settings!.autostart).toBe(false);
  });

  it("disables autostart in development builds with an explanatory hint", async () => {
    vi.mocked(api.isDevBuild).mockResolvedValue(true);
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "Start minimized in tray on login" });
    await waitFor(() => expect(checkbox).toHaveProperty("disabled", true));
    expect(screen.getByText("Autostart is unavailable in development builds.")).toBeTruthy();
  });

  it.each([false, true])("saves GPU acceleration by keyboard and persists on remount (%s)", async (enabled) => {
    data.settings!.gpuAcceleration = enabled;
    vi.mocked(api.isDevBuild).mockResolvedValue(true);
    const mounted = render(Workspace);
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "GPU acceleration" });
    expect(checkbox).toHaveProperty("checked", enabled);
    expect(checkbox).toHaveProperty("disabled", false);
    expect(screen.getByText(/Takes effect after restarting Folio/)).toBeTruthy();
    checkbox.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(api.setGpuAcceleration).toHaveBeenCalledExactlyOnceWith(!enabled));
    expect(data.settings!.gpuAcceleration).toBe(!enabled);
    mounted.unmount();
    render(Workspace);
    await screen.findByRole("heading", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByRole("checkbox", { name: "GPU acceleration" })).toHaveProperty("checked", !enabled);
  });

  it("does not render GPU acceleration on non-Linux platforms", async () => {
    vi.mocked(api.isLinux).mockResolvedValue(false);
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.queryByLabelText("GPU acceleration")).toBeNull();
    expect(screen.queryByText(/Takes effect after restarting Folio/)).toBeNull();
  });

  it.each([false, true])("reverts a failed GPU save to %s and disables the checkbox while busy", async (enabled) => {
    data.settings!.gpuAcceleration = enabled;
    let failSave!: (error: unknown) => void;
    vi.mocked(api.setGpuAcceleration).mockImplementationOnce(() => new Promise((_, reject) => { failSave = reject; }));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "System" }));
    const checkbox = screen.getByRole("checkbox", { name: "GPU acceleration" });
    await user.click(checkbox);
    expect(checkbox).toHaveProperty("checked", !enabled);
    expect(checkbox).toHaveProperty("disabled", true);
    failSave({ message: "Could not save GPU setting." });
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveProperty("textContent", "Could not save GPU setting.");
    expect(checkbox).toHaveProperty("checked", enabled);
    expect(checkbox).toHaveProperty("disabled", false);
    expect(data.settings!.gpuAcceleration).toBe(enabled);
  });

  it("saves window button overrides live and restores the cached detected order in Auto", async () => {
    const mounted = render(Titlebar);
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const group = within(screen.getByRole("group", { name: "Window buttons" }));
    expect(group.getByRole("heading", { name: "Window buttons", level: 3 })).toBeTruthy();
    expect(group.getAllByRole("radio")).toHaveLength(3);
    expect(await group.findByRole("radio", { name: "Auto (currently Left)" })).toHaveProperty("checked", true);
    const titlebar = within(mounted.container).getByRole("banner");
    const labels = () => within(titlebar).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    for (const [name, value, order] of [
      ["Left", "left", ["Close", "Minimize", "Maximize"]],
      ["Right", "right", ["Minimize", "Maximize", "Close"]],
      ["Auto (currently Left)", "", ["Close", "Maximize", "Minimize"]],
    ] as const) {
      await user.click(group.getByRole("radio", { name }));
      await waitFor(() => expect(api.setWindowButtonLayout).toHaveBeenLastCalledWith(value));
      await waitFor(() => expect(labels()).toEqual(order));
      const spacer = titlebar.querySelector(".spacer")!;
      expect(value === "right" ? spacer.previousElementSibling : spacer.nextElementSibling).toBeNull();
    }
    expect(api.getWindowButtonLayout).toHaveBeenCalledTimes(2); // Titlebar mount and panel label only.
  });

  it("reverts failed window button saves to the persisted value and supports keyboard selection", async () => {
    data.settings!.windowButtonLayout = "left";
    vi.mocked(api.setWindowButtonLayout).mockRejectedValueOnce({ message: "Could not save window buttons." });
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = within(screen.getByRole("dialog"));
    dialog.getByRole("radio", { name: "Left" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(await dialog.findByRole("alert")).toHaveProperty("textContent", "Could not save window buttons.");
    expect(dialog.getByRole("radio", { name: "Left" })).toHaveProperty("checked", true);
    expect(dialog.getByRole("radio", { name: "Right" })).toHaveProperty("checked", false);
    expect(uiState.windowButtonLayout).toBe("left");
  });

  it("silently uses a plain Auto label when window layout detection fails", async () => {
    vi.mocked(api.getWindowButtonLayout).mockRejectedValue(new Error("unavailable"));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("radio", { name: "Auto" })).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("labels right-side detection and disables choices while saving", async () => {
    vi.mocked(api.getWindowButtonLayout).mockResolvedValue({ left: [], right: ["minimize", "maximize", "close"] });
    let finishSave!: (value: WorkspaceData) => void;
    vi.mocked(api.setWindowButtonLayout).mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const group = screen.getByRole("group", { name: "Window buttons" }) as HTMLFieldSetElement;
    expect(await within(group).findByRole("radio", { name: "Auto (currently Right)" })).toHaveProperty("checked", true);
    await user.click(within(group).getByRole("radio", { name: "Left" }));
    expect(group.disabled).toBe(true);
    data.settings!.windowButtonLayout = "left";
    finishSave(structuredClone(data));
    await waitFor(() => expect(group.disabled).toBe(false));
    expect(uiState.windowButtonLayout).toBe("left");
  });

  it.each(["left", "right"] as const)("loads saved %s window buttons before revealing the titlebar and restores them on remount", async (side) => {
    data.settings!.windowButtonLayout = side;
    let finishLoad!: (value: WorkspaceData) => void;
    vi.mocked(api.load).mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
    const titlebar = render(Titlebar);
    const workspace = render(Workspace);
    const header = titlebar.container.querySelector("header")!;
    expect(header.style.visibility).toBe("hidden");
    finishLoad(structuredClone(data));
    await screen.findByRole("heading", { name: "Projects" });
    await waitFor(() => expect(header.style.visibility).not.toBe("hidden"));
    expect(header.firstElementChild?.getAttribute("aria-label")).toBe(side === "left" ? "Close" : null);
    workspace.unmount();
    titlebar.unmount();
    render(Workspace);
    render(Titlebar);
    await screen.findByRole("heading", { name: "Projects" });
    expect(uiState.windowButtonLayout).toBe(side);
  });

  it("debounces live font preview, persists available fonts, and resets to Auto", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const input = screen.getByLabelText("Font");
    await fireEvent.input(input, { target: { value: "Installed" } });
    await fireEvent.input(input, { target: { value: "Installed Font" } });
    expect(api.setFontFamily).not.toHaveBeenCalled();
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledExactlyOnceWith("Installed Font"));
    expect(api.checkFontAvailable).toHaveBeenCalledExactlyOnceWith("Installed Font");
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe('"Installed Font", var(--default-app-font)');
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(api.setFontFamily).toHaveBeenLastCalledWith(""));
    expect(input).toHaveProperty("value", "");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
    expect(input).toHaveProperty("placeholder", "Auto (Noto Sans Display)");
    expect(screen.queryByText("Auto — Noto Sans Display")).toBeNull();
  });

  it("uses the generic Auto placeholder without a duplicate caption when default-font detection fails", async () => {
    vi.mocked(api.getDefaultFont).mockRejectedValue("Font detection unavailable");
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Font")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Font")).toHaveProperty("placeholder", "Auto");
    expect(screen.queryByText("Auto — using the default font.")).toBeNull();
  });

  it("uses the width heuristic only when the Rust availability command fails", async () => {
    vi.mocked(api.checkFontAvailable).mockRejectedValue("Font detection unavailable");
    const context = {
      font: "",
      measureText: () => ({ width: context.font.includes('"Installed Font"') ? 250 : context.font.endsWith("monospace") ? 100 : context.font.endsWith("sans-serif") ? 120 : 140 }),
    };
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await fireEvent.input(screen.getByLabelText("Font"), { target: { value: "Installed Font" } });
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledWith("Installed Font"));
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith("2d");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe('"Installed Font", var(--default-app-font)');
  });

  it("keeps the default font when both availability checks fail", async () => {
    vi.mocked(api.getDefaultFont).mockRejectedValue("Font detection unavailable");
    vi.mocked(api.checkFontAvailable).mockRejectedValue("Font detection unavailable");
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => { throw new Error("No measurement context"); });
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await fireEvent.input(screen.getByLabelText("Font"), { target: { value: "Unknown" } });
    await screen.findByText("Font not found on this system — using default.");
    expect(api.setFontFamily).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(screen.getByLabelText("Font")).toHaveProperty("placeholder", "Auto");
    expect(screen.queryByText("Auto — using the default font.")).toBeNull();
  });

  it("ignores stale availability results after the input changes", async () => {
    let finishCheck!: (available: boolean) => void;
    vi.mocked(api.checkFontAvailable).mockImplementationOnce(() => new Promise((resolve) => { finishCheck = resolve; }));
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const input = screen.getByLabelText("Font");
    await fireEvent.input(input, { target: { value: "Old Font" } });
    await waitFor(() => expect(api.checkFontAvailable).toHaveBeenCalledWith("Old Font"));
    await fireEvent.input(input, { target: { value: "Installed Font" } });
    finishCheck(false);
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledExactlyOnceWith("Installed Font"));
    expect(screen.queryByText("Font not found on this system — using default.")).toBeNull();
  });

  it("falls back without persisting an unavailable font and clears the hint when cleared", async () => {
    data.settings!.fontFamily = "Installed Font";
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const input = screen.getByLabelText("Font");
    await fireEvent.input(input, { target: { value: "Nonsense" } });
    await screen.findByText("Font not found on this system — using default.");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
    expect(api.setFontFamily).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    await fireEvent.input(input, { target: { value: "" } });
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledWith(""));
    expect(screen.queryByText("Font not found on this system — using default.")).toBeNull();
  });

  it("clears the unavailable hint when a font applies and restores the preference after remount", async () => {
    const user = userEvent.setup();
    const mounted = render(Workspace);
    await screen.findByRole("heading", { name: "Projects" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await fireEvent.input(screen.getByLabelText("Font"), { target: { value: "Nonsense" } });
    await screen.findByText("Font not found on this system — using default.");
    await fireEvent.input(screen.getByLabelText("Font"), { target: { value: "Installed Font" } });
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledWith("Installed Font"));
    expect(screen.queryByText("Font not found on this system — using default.")).toBeNull();
    mounted.unmount();
    document.documentElement.style.removeProperty("--app-font");
    render(Workspace);
    await screen.findByRole("heading", { name: "Projects" });
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe('"Installed Font", var(--default-app-font)');
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Font")).toHaveProperty("value", "Installed Font");
  });

  it("keeps a missing saved font in Auto after other workspace mutations", async () => {
    data.settings!.fontFamily = "Missing Font";
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Sort" }));
    await waitFor(() => expect(api.saveView).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Font")).toHaveProperty("value", "");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
  });

  it("keeps typing focused during a slow save and saves the latest input afterwards", async () => {
    let finishSave!: (workspace: WorkspaceData) => void;
    vi.mocked(api.setFontFamily).mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    vi.mocked(api.checkFontAvailable).mockResolvedValue(true);
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const input = screen.getByLabelText("Font");
    await user.click(input);
    await fireEvent.input(input, { target: { value: "First Font" } });
    await waitFor(() => expect(api.setFontFamily).toHaveBeenCalledWith("First Font"));
    expect(document.activeElement).toBe(input);
    expect(input).toHaveProperty("disabled", false);
    await fireEvent.input(input, { target: { value: "Latest Font" } });
    data.settings!.fontFamily = "First Font";
    finishSave(structuredClone(data));
    await waitFor(() => expect(api.setFontFamily).toHaveBeenLastCalledWith("Latest Font"));
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe('"Latest Font", var(--default-app-font)');
  });

  it.each(["Installed Font", "Missing Font"])("loads %s before revealing the workspace and shows the effective setting", async (font) => {
    data.settings!.fontFamily = font;
    const mounted = render(Workspace);
    expect(mounted.container.firstElementChild?.getAttribute("style")).toContain("visibility: hidden");
    await screen.findByRole("heading", { name: "Projects" });
    const available = font === "Installed Font";
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe(available ? '"Installed Font", var(--default-app-font)' : "");
    expect(mounted.container.firstElementChild?.getAttribute("style")).not.toContain("visibility: hidden");
    await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Font")).toHaveProperty("value", available ? font : "");
    expect(screen.queryByText("Font not found on this system — using default.")).toBeNull();
  });

  it("shows font save errors and restores the saved font", async () => {
    vi.mocked(api.setFontFamily).mockRejectedValue({ message: "Could not save font." });
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await fireEvent.input(screen.getByLabelText("Font"), { target: { value: "Installed Font" } });
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveProperty("textContent", "Could not save font.");
    expect(document.documentElement.style.getPropertyValue("--app-font")).toBe("");
  });

  it("uses viewport sizing and a scrolling settings body", () => {
    expect(settingsSource).toMatch(/dialog\s*\{[^}]*outline: none/);
    expect(settingsSource).toContain("width: min(800px, calc(100vw - 48px))");
    expect(settingsSource).toContain("height: min(520px, calc(100dvh - var(--titlebar-height) - 48px))");
    expect(settingsSource).toContain("max-height: calc(100dvh - var(--titlebar-height) - 48px)");
    expect(settingsSource).toMatch(/\.body\s*\{[^}]*overflow: auto/);
    expect(settingsSource).toContain("grid-template-columns: 120px minmax(0, 1fr)");
    expect(settingsSource).toContain("grid-template-columns: 88px minmax(0, 1fr)");
    expect(settingsSource).toMatch(/nav button\s*\{[^}]*font-size: 14px/);
    expect(settingsSource).toMatch(/nav button\[aria-current="page"\]\s*\{[^}]*font-weight: 700/);
    expect(settingsSource).toMatch(/\.font-row\s*\{[^}]*grid-template-columns: 64px minmax\(0, 1fr\)/);
    expect(settingsSource).toMatch(/h3\s*\{[^}]*font-size: 15px;[^}]*font-weight: 600/);
    expect(settingsSource).toMatch(/\n  label\s*\{[^}]*font-size: 14px;[^}]*font-weight: 400/);
  });

  it("closes the settings panel from its close button and returns focus to the sidebar control", async () => {
    const user = await openWorkspace();
    const button = screen.getByRole("button", { name: "Settings" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Close settings" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("closes the settings panel from the backdrop or the Esc key and returns focus to the sidebar control", async () => {
    const user = await openWorkspace();
    const button = screen.getByRole("button", { name: "Settings" });
    await user.click(button);
    await fireEvent.click(await screen.findByRole("dialog"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(button);
    // jsdom has no native dialog, so Esc is dispatched as the `cancel` event it raises.
    await fireEvent(await screen.findByRole("dialog"), new Event("cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("shows a recoverable loading error rather than pretend browser persistence", async () => {
    vi.mocked(api.load).mockRejectedValueOnce(new Error("Desktop app required."));
    render(Workspace);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Desktop app required.");
    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
  });

  it("renders the New database button in the caption row of the sidebar", async () => {
    await openWorkspace();
    const sidebar = screen.getByRole("complementary", { name: "Workspace navigation" });
    const btn = within(sidebar).getByRole("button", { name: "New database" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("clicking New database opens the dialog and focuses the name input", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "New database" }));
    const dialog = await screen.findByRole("dialog", { name: "New database" });
    expect(within(dialog).getByRole("heading", { name: "New database" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Database name")).toBeTruthy();
  });

  it("Create calls api.createDatabase, selects the new database, and closes the dialog", async () => {
    const user = await openWorkspace();
    vi.mocked(api.createDatabase).mockImplementation(async (name) => {
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: "", customIcon: null, columns: [] });
      data.views.push({ id: 99, databaseId: 99, name: "All records", layout: "table", filterActive: false, sortActive: false, compact: false, showOwner: true });
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "New database" }));
    const dialog = await screen.findByRole("dialog", { name: "New database" });
    await user.type(within(dialog).getByLabelText("Database name"), "Archive");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New database" })).toBeNull());
    expect(api.createDatabase).toHaveBeenCalledWith("Archive");
    expect(await screen.findByRole("heading", { name: "Archive" })).toBeTruthy();
  });

  it("Cancel closes the dialog and returns focus to the New database button", async () => {
    const user = await openWorkspace();
    const trigger = screen.getByRole("button", { name: "New database" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "New database" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New database" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("offers three native radio modes and resets the picker when reopened", async () => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "New database" }));
    const dialog = screen.getByRole("dialog", { name: "New database" });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(3);
    expect((within(dialog).getByRole("radio", { name: "Default" }) as HTMLInputElement).checked).toBe(true);
    await user.click(within(dialog).getByRole("radio", { name: "Emoji" }));
    expect(within(dialog).getAllByRole("button", { name: /^Choose / })).toHaveLength(48);
    await user.click(within(dialog).getByRole("button", { name: "Choose ⭐" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New database" }));
    expect((screen.getByRole("radio", { name: "Default" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Emoji" }));
    expect((screen.getByLabelText("Paste any emoji") as HTMLInputElement).value).toBe("");
  });

  it("passes a selected emoji to creation and renders it in the sidebar", async () => {
    const user = await openWorkspace();
    vi.mocked(api.createDatabase).mockImplementation(async (name, icon) => {
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: icon?.emoji ?? "", customIcon: null, columns: [] });
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Stars");
    await user.click(screen.getByRole("radio", { name: "Emoji" }));
    await user.click(screen.getByRole("button", { name: "Choose ⭐" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.createDatabase).toHaveBeenCalledWith("Stars", { emoji: "⭐" }));
    expect(await screen.findByRole("button", { name: "Stars" })).toHaveProperty("textContent", "⭐ Stars");
  });

  it.each(["👩‍💻", "🇮🇳", "1️⃣"])("accepts the single-grapheme emoji %s", async (emoji) => {
    const user = await openWorkspace();
    vi.mocked(api.createDatabase).mockResolvedValue(data);
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Emoji");
    await user.click(screen.getByRole("radio", { name: "Emoji" }));
    await fireEvent.input(screen.getByLabelText("Paste any emoji"), { target: { value: emoji } });
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).toHaveBeenCalledWith("Emoji", { emoji });
  });

  it.each(["⭐🚀", "a", "⭐".repeat(17)])("rejects invalid pasted emoji %s without creating", async (emoji) => {
    const user = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Invalid");
    await user.click(screen.getByRole("radio", { name: "Emoji" }));
    await fireEvent.input(screen.getByLabelText("Paste any emoji"), { target: { value: emoji } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Choose or paste exactly one emoji (up to 16 characters).");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).not.toHaveBeenCalled();
  });

  it("opens the system chooser, previews the returned data URI and passes it to creation", async () => {
    const user = await openWorkspace();
    const uri = "data:image/png;base64,AAAA";
    vi.mocked(api.pickDatabaseIcon).mockResolvedValue(uri);
    vi.mocked(api.createDatabase).mockImplementation(async (name, icon) => {
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: "⭐", customIcon: icon?.customIcon ?? null, columns: [] });
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Photo");
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: "Upload image (PNG, JPEG, WebP; up to 256 KB)" }));
    expect(api.pickDatabaseIcon).toHaveBeenCalledWith();
    expect(screen.getByRole("img", { name: "Uploaded database icon preview" }).getAttribute("src")).toBe(uri);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).toHaveBeenCalledWith("Photo", { customIcon: uri });
    const icon = await screen.findByRole("img", { name: "Photo icon" });
    expect(icon.getAttribute("src")).toBe(uri);
    expect(icon.parentElement?.querySelector(".database-emoji")).toBeNull();
  });

  it("shows native upload validation errors inline without creating", async () => {
    const user = await openWorkspace();
    vi.mocked(api.pickDatabaseIcon).mockRejectedValue({ message: "Choose a PNG, JPEG, or WebP image up to 256 KB." });
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Invalid");
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Choose a PNG, JPEG, or WebP image up to 256 KB.");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).not.toHaveBeenCalled();
  });

  it("ignores inactive icon fields in Default mode", async () => {
    const user = await openWorkspace();
    vi.mocked(api.createDatabase).mockResolvedValue(data);
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Default");
    await user.click(screen.getByRole("radio", { name: "Emoji" }));
    await user.click(screen.getByRole("button", { name: "Choose ⭐" }));
    await user.click(screen.getByRole("radio", { name: "Default" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).toHaveBeenCalledWith("Default");
  });

  it("blocks submission and duplicate picks while choosing and lets the preview be removed", async () => {
    const user = await openWorkspace();
    let finish: (icon: string | null) => void;
    vi.mocked(api.pickDatabaseIcon).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    vi.mocked(api.createDatabase).mockResolvedValue(data);
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Removed");
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    expect(api.pickDatabaseIcon).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).not.toHaveBeenCalled();
    finish!("data:image/png;base64,AAAA");
    expect(await screen.findByRole("img", { name: "Uploaded database icon preview" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.queryByRole("img", { name: "Uploaded database icon preview" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).toHaveBeenCalledWith("Removed");
  });

  it("shows file read failures inline without creating", async () => {
    const user = await openWorkspace();
    vi.mocked(api.pickDatabaseIcon).mockRejectedValue({ message: "Could not read this image. Please try again." });
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Unreadable");
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not read this image. Please try again.");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createDatabase).not.toHaveBeenCalled();
  });

  it("leaves the selected image unchanged when the native chooser is cancelled", async () => {
    const user = await openWorkspace();
    const uri = "data:image/png;base64,AAAA";
    vi.mocked(api.pickDatabaseIcon).mockResolvedValueOnce(uri).mockResolvedValueOnce(null);
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    expect(screen.getByRole("img", { name: "Uploaded database icon preview" }).getAttribute("src")).toBe(uri);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(api.createDatabase).not.toHaveBeenCalled();
  });

  it("ignores a native chooser result after closing and reopening the creation dialog", async () => {
    const user = await openWorkspace();
    let finish: (icon: string | null) => void;
    vi.mocked(api.pickDatabaseIcon).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    await user.click(screen.getByRole("button", { name: /Upload image/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.click(screen.getByRole("radio", { name: "Upload" }));
    finish!("data:image/png;base64,AAAA");
    await waitFor(() => expect(within(screen.getByRole("dialog")).queryByRole("status")).toBeNull());
    expect(screen.queryByRole("img", { name: "Uploaded database icon preview" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("guards duplicate submission and disables the picker while creating", async () => {
    const user = await openWorkspace();
    let finish: (workspace: WorkspaceData) => void;
    vi.mocked(api.createDatabase).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "New database" }));
    await user.type(screen.getByLabelText("Database name"), "Busy");
    const form = screen.getByLabelText("Database name").closest("form")!;
    await fireEvent.submit(form);
    await fireEvent.submit(form);
    expect(api.createDatabase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "Emoji" }).closest("fieldset")?.disabled).toBe(true);
    finish!(data);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Esc closes the New database dialog and returns focus to the trigger", async () => {
    const user = await openWorkspace();
    const trigger = screen.getByRole("button", { name: "New database" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "New database" });
    await fireEvent(screen.getByRole("dialog", { name: "New database" }), new Event("cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New database" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("backdrop click closes the New database dialog", async () => {
    const user = await openWorkspace();
    const trigger = screen.getByRole("button", { name: "New database" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "New database" });
    await fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New database" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("api error keeps the dialog open and shows the error inline", async () => {
    const user = await openWorkspace();
    vi.mocked(api.createDatabase).mockRejectedValue({ message: "Could not create database." });
    await user.click(screen.getByRole("button", { name: "New database" }));
    const dialog = await screen.findByRole("dialog", { name: "New database" });
    await user.type(within(dialog).getByLabelText("Database name"), "Broken");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Could not create database.");
    expect(screen.getByRole("dialog", { name: "New database" })).toBeTruthy();
  });
});
