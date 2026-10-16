import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { api } from "$lib/api";
import Titlebar from "./Titlebar.svelte";

const { windowApi } = vi.hoisted(() => ({
  windowApi: {
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => windowApi }));
vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tauri-apps/api/core")>();
  return { ...original, isTauri: () => true };
});
vi.mock("$lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("$lib/api")>();
  return { ...original, api: { ...original.api, getWindowButtonLayout: vi.fn() } };
});

function buttonLabels() {
  return within(screen.getByRole("banner"))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
}

beforeEach(() => {
  vi.resetAllMocks();
  windowApi.isMaximized.mockResolvedValue(false);
  windowApi.onResized.mockImplementation(async () => () => {});
  vi.mocked(api.getWindowButtonLayout).mockResolvedValue({ left: [], right: ["minimize", "maximize", "close"] });
});

describe("Folio titlebar", () => {
  it("renders the detected buttons on the correct side in order", async () => {
    vi.mocked(api.getWindowButtonLayout).mockResolvedValue({ left: ["close", "maximize", "minimize"], right: [] });
    render(Titlebar);
    await screen.findByRole("button", { name: "Close" });
    expect(buttonLabels()).toEqual(["Close", "Maximize", "Minimize"]);
    expect(api.getWindowButtonLayout).toHaveBeenCalledOnce();
  });

  it("keeps the default right-side layout when detection fails", async () => {
    vi.mocked(api.getWindowButtonLayout).mockRejectedValue(new Error("detection unavailable"));
    render(Titlebar);
    expect(await screen.findByRole("button", { name: "Close" })).toBeTruthy();
    expect(buttonLabels()).toEqual(["Minimize", "Maximize", "Close"]);
  });

  it("wires close, minimize, and maximize to the window APIs", async () => {
    const user = userEvent.setup();
    render(Titlebar);
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(windowApi.close).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Minimize" }));
    expect(windowApi.minimize).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("switches the maximize control to restore while the window is maximized", async () => {
    let resized: (() => unknown) | undefined;
    windowApi.onResized.mockImplementation(async (handler: () => unknown) => {
      resized = handler;
      return () => {};
    });
    render(Titlebar);
    await screen.findByRole("button", { name: "Maximize" });
    expect(windowApi.isMaximized).toHaveBeenCalled();
    windowApi.isMaximized.mockResolvedValue(true);
    await resized!();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull());
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Restore" }));
    expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("operates the window controls from the keyboard", async () => {
    const user = userEvent.setup();
    render(Titlebar);
    const close = await screen.findByRole("button", { name: "Close" });
    close.focus();
    await user.keyboard("{Enter}");
    expect(windowApi.close).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Minimize" }).focus();
    await user.keyboard(" ");
    expect(windowApi.minimize).toHaveBeenCalledTimes(1);
  });
});
