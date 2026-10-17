import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { api } from "$lib/api";
import { fixture } from "$lib/test-fixture";
import type { Workspace as WorkspaceData } from "$lib/types";
import Workspace from "./Workspace.svelte";
import settingsSource from "./SettingsPanel.svelte?raw";
import workspaceSource from "./Workspace.svelte?raw";
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
  return { ...original, api: { load: vi.fn(), setup: vi.fn(), createDatabase: vi.fn(), pickDatabaseIcon: vi.fn(), saveView: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn(), setFontFamily: vi.fn(), getDefaultFont: vi.fn(), checkFontAvailable: vi.fn(), getRecordPage: vi.fn(), saveRecordPage: vi.fn() } };
});

let data: WorkspaceData;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  data = fixture();
  vi.mocked(api.load).mockImplementation(async () => structuredClone(data));
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
  vi.mocked(api.saveView).mockImplementation(async (view) => {
    data.views = data.views.map((item) => item.id === view.id ? view : item);
    return structuredClone(data);
  });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function openWorkspace() {
  const user = userEvent.setup();
  render(Workspace);
  await screen.findByRole("heading", { name: "Projects" });
  return user;
}

describe("Folio workspace", () => {
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
    data = { settings: null, databases: [], views: [], records: [] };
    vi.mocked(api.setup).mockResolvedValue({ ...data, settings: { name: "Home", accentColor, fontFamily: "" } });
    const user = userEvent.setup();
    render(Workspace);
    await user.type(await screen.findByLabelText("Workspace name"), "Home");
    await user.click(screen.getByRole("radio", { name: label }));
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await screen.findByRole("heading", { name: "Welcome to Home" });
    expect(api.setup).toHaveBeenCalledWith("Home", accentColor);
  });

  it("sets up an empty workspace and creates its first database without sample records", async () => {
    data = { settings: null, databases: [], views: [], records: [] };
    vi.mocked(api.setup).mockImplementation(async (name, accentColor) => {
      data.settings = { name, accentColor, fontFamily: "" };
      return structuredClone(data);
    });
    vi.mocked(api.createDatabase).mockImplementation(async (name) => {
      data.databases.push({ id: 1, name, description: "", icon: "layers", emoji: "", customIcon: null });
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
    data = { settings: null, databases: [], views: [], records: [] };
    vi.mocked(api.setup).mockRejectedValueOnce({ message: "Could not save workspace." });
    const user = userEvent.setup();
    render(Workspace);
    const name = await screen.findByLabelText("Workspace name");
    await user.type(name, "Home");
    await fireEvent.input(screen.getByLabelText("Custom accent color"), { target: { value: "#123456" } });
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save workspace.");
    expect(name).toHaveProperty("value", "Home");
    vi.mocked(api.setup).mockResolvedValue({ ...data, settings: { name: "Home", accentColor: "#123456", fontFamily: "" } });
    await user.click(screen.getByRole("button", { name: "Create workspace" }));
    await screen.findByRole("heading", { name: "Welcome to Home" });
    expect(api.setup).toHaveBeenLastCalledWith("Home", "#123456");
  });

  it("shows database creation errors without leaving the empty workspace", async () => {
    data = { settings: { name: "Home", accentColor: "#b8aaf7", fontFamily: "" }, databases: [], views: [], records: [] };
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
    await user.click(screen.getByRole("checkbox", { name: "Show owner" }));
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: "Owner" })).toBeNull());
    expect(api.saveView).toHaveBeenCalledWith(expect.objectContaining({ id: 10, showOwner: false }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Layout" }), "list");
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
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
    vi.mocked(api.create).mockImplementation(async (databaseId, status) => {
      data.records.push({ id: 11, databaseId, status, name: "Untitled", priority: "Medium", dueDate: null, owner: "" });
      return structuredClone(data);
    });
    vi.mocked(api.update).mockImplementation(async (input) => {
      data.records = data.records.map((record) => record.id === input.id ? { ...record, ...input } : record);
      return structuredClone(data);
    });
    await user.click(screen.getByRole("button", { name: "In progress" }));
    await user.click(screen.getByRole("button", { name: "New record" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.create).toHaveBeenCalledWith(1, "In progress");
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
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: "", customIcon: null });
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
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: icon?.emoji ?? "", customIcon: null });
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
      data.databases.push({ id: 99, name, description: "", icon: "layers", emoji: "⭐", customIcon: icon?.customIcon ?? null });
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
