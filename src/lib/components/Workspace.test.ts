import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { api } from "$lib/api";
import { fixture } from "$lib/test-fixture";
import type { Workspace as WorkspaceData } from "$lib/types";
import Workspace from "./Workspace.svelte";

vi.mock("$lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("$lib/api")>();
  return { ...original, api: { load: vi.fn(), saveView: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() } };
});

let data: WorkspaceData;

beforeEach(() => {
  vi.resetAllMocks();
  data = fixture();
  vi.mocked(api.load).mockImplementation(async () => structuredClone(data));
  vi.mocked(api.saveView).mockImplementation(async (view) => {
    data.views = data.views.map((item) => item.id === view.id ? view : item);
    return structuredClone(data);
  });
});

async function openWorkspace() {
  const user = userEvent.setup();
  render(Workspace);
  await screen.findByRole("heading", { name: "Projects" });
  return user;
}

describe("Folio workspace", () => {
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

  it("shows a recoverable loading error rather than pretend browser persistence", async () => {
    vi.mocked(api.load).mockRejectedValueOnce(new Error("Desktop app required."));
    render(Workspace);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Desktop app required.");
    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
  });
});
