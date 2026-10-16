<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Copy from "@lucide/svelte/icons/copy";
  import Minus from "@lucide/svelte/icons/minus";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import { api } from "$lib/api";
  import type { WindowButton, WindowButtonLayout } from "$lib/types";

  let layout = $state<WindowButtonLayout>({ left: [], right: ["minimize", "maximize", "close"] });
  let maximized = $state(false);
  const appWindow = isTauri() ? getCurrentWindow() : null;

  onMount(() => {
    void api
      .getWindowButtonLayout()
      .then((detected) => {
        layout = detected;
      })
      .catch(() => {
        // Detection failed; keep the default right-side layout.
      });
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        maximized = await appWindow.isMaximized();
        const listener = await appWindow.onResized(async () => {
          maximized = await appWindow.isMaximized();
        });
        if (disposed) listener();
        else unlisten = listener;
      } catch {
        // Window state is unavailable outside the desktop runtime.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  });
</script>

<!-- The drag attribute is "deep" so the empty space between the button groups drags too. -->
<header class="titlebar" data-tauri-drag-region="deep">
  {#each layout.left as button (button)}
    {@render windowControl(button)}
  {/each}
  <span class="spacer"></span>
  {#each layout.right as button (button)}
    {@render windowControl(button)}
  {/each}
</header>

{#snippet windowControl(button: WindowButton)}
  {#if button === "close"}
    <button class="window-control close" aria-label="Close" onclick={() => { if (appWindow) void appWindow.close(); }}><X size={13} /></button>
  {:else if button === "maximize"}
    <button class="window-control" aria-label={maximized ? "Restore" : "Maximize"} onclick={() => { if (appWindow) void appWindow.toggleMaximize(); }}>
      {#if maximized}<Copy size={12} />{:else}<Square size={12} />{/if}
    </button>
  {:else}
    <button class="window-control" aria-label="Minimize" onclick={() => { if (appWindow) void appWindow.minimize(); }}><Minus size={13} /></button>
  {/if}
{/snippet}

<style>
  .titlebar { display: flex; align-items: center; flex-shrink: 0; height: var(--titlebar-height); padding: 0 8px; background: #141518; border-bottom: 1px solid var(--line); user-select: none; }
  .window-control { justify-content: center; padding: 6px 8px; border-radius: 6px; color: #b7b8c1; }
  .window-control:hover:not(:disabled) { color: var(--text); }
  .window-control.close:hover:not(:disabled) { background: #67434b; color: #f1bbc2; }
</style>
