<script lang="ts">
  import { onMount } from "svelte";
  import X from "@lucide/svelte/icons/x";

  let { onClose }: { onClose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;

  onMount(() => { dialog.showModal(); closeButton.focus(); });
</script>

<dialog bind:this={dialog} aria-labelledby="settings-heading" oncancel={(event) => { event.preventDefault(); onClose(); }} onclick={(event) => { if (event.target === dialog) onClose(); }}>
  <header>
    <h2 id="settings-heading">Settings</h2>
    <button type="button" bind:this={closeButton} class="icon-button" aria-label="Close settings" onclick={onClose}><X size={18} /></button>
  </header>
  <p>No settings yet.</p>
</dialog>

<style>
  dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - var(--titlebar-height) - 32px); padding: 26px; color: var(--text); background: #202125; border: 1px solid #383941; border-radius: 12px; box-shadow: 0 24px 80px #0005; }
  dialog::backdrop { background: #08090bb8; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.6px; }
  p { margin: 18px 0 0; color: var(--sub); font-size: 13px; }
</style>