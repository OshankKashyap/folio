import type { WindowButtonOverride } from "./types";

// null keeps titlebar controls hidden until workspace settings have loaded.
export const uiState = $state<{ windowButtonLayout: WindowButtonOverride | null }>({ windowButtonLayout: null });
