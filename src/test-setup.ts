import { afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";

afterEach(cleanup);

// jsdom does not implement the native dialog APIs used by the desktop webview.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
HTMLElement.prototype.setPointerCapture = function () {};
