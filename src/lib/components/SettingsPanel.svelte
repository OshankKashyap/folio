<script lang="ts">
  import { onMount, untrack } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import { applyFont, checkFontAvailable } from "$lib/fonts";
  import { api } from "$lib/api";
  import type { WindowButtonOverride } from "$lib/types";

  let { fontFamily, windowButtonLayout, busy, error, onSave, onSaveWindowButtonLayout, onClose }: {
    fontFamily: string;
    windowButtonLayout: WindowButtonOverride;
    busy: boolean;
    error: string;
    onSave: (font: string) => Promise<boolean>;
    onSaveWindowButtonLayout: (layout: WindowButtonOverride) => Promise<boolean>;
    onClose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;
  let font = $state(untrack(() => fontFamily));
  let notFound = $state(false);
  let defaultFont = $state("");
  let buttonLayout = $state(untrack(() => windowButtonLayout));
  let detectedSide = $state("");
  let category = $state("interface");
  let timer: ReturnType<typeof setTimeout>;
  let revision = 0;
  let active = true;

  onMount(() => {
    dialog.showModal(); closeButton.focus();
    void api.getDefaultFont().then((family) => { if (active) defaultFont = family; }).catch(() => {});
    void api.getWindowButtonLayout().then((layout) => {
      if (active) detectedSide = layout.left.length ? "Left" : layout.right.length ? "Right" : "";
    }).catch(() => {});
    return () => { active = false; clearTimeout(timer); };
  });

  async function updateFont() {
    if (busy) { scheduleFont(); return; }
    const currentRevision = revision;
    const family = font.trim();
    const available = !family || await checkFontAvailable(family);
    if (!active || currentRevision !== revision) return;
    notFound = !available;
    applyFont(notFound ? "" : family);
    if (!notFound && !await onSave(family)) applyFont(fontFamily);
  }

  function scheduleFont() {
    revision++;
    clearTimeout(timer);
    timer = setTimeout(() => { void updateFont(); }, 300);
  }

  function resetFont() {
    revision++;
    clearTimeout(timer);
    font = "";
    void updateFont();
  }

  async function updateWindowButtonLayout(layout: WindowButtonOverride) {
    buttonLayout = layout;
    if (!await onSaveWindowButtonLayout(layout)) buttonLayout = windowButtonLayout;
  }
</script>

<dialog bind:this={dialog} aria-labelledby="settings-heading" oncancel={(event) => { event.preventDefault(); onClose(); }} onclick={(event) => { if (event.target === dialog) onClose(); }}>
  <header>
    <h2 id="settings-heading">Settings</h2>
    <button type="button" bind:this={closeButton} class="icon-button" aria-label="Close settings" onclick={onClose}><X size={18} /></button>
  </header>
  <div class="body">
    <nav aria-label="Settings categories">
      <button type="button" aria-current={category === "interface" ? "page" : undefined} aria-controls="interface-settings" onclick={() => category = "interface"}>Interface</button>
    </nav>
    <section id="interface-settings" aria-labelledby="interface-heading" hidden={category !== "interface"}>
      <h3 id="interface-heading">Interface</h3>
      <div class="font-row">
        <label for="settings-font">Font</label>
        <input id="settings-font" maxlength="200" placeholder={defaultFont ? `Auto (${defaultFont})` : "Auto"} bind:value={font} oninput={scheduleFont} aria-describedby="font-hint" />
      </div>
      <p id="font-hint" aria-live="polite">{notFound ? "Font not found on this system — using default." : ""}</p>
      <button type="button" disabled={busy} onclick={resetFont}>Reset to default</button>
      <fieldset class="window-buttons" disabled={busy}>
        <legend><h3>Window buttons</h3></legend>
        {#each ["", "left", "right"] as value}
          <label><input type="radio" name="window-buttons" value={value} checked={buttonLayout === value} onchange={() => { void updateWindowButtonLayout(value as WindowButtonOverride); }} />{value === "" ? detectedSide ? `Auto (currently ${detectedSide})` : "Auto" : value === "left" ? "Left" : "Right"}</label>
        {/each}
      </fieldset>
      {#if error}<p class="save-error" role="alert">{error}</p>{/if}
    </section>
  </div>
</dialog>

<style>
  dialog { width: min(800px, calc(100vw - 48px)); height: min(520px, calc(100dvh - var(--titlebar-height) - 48px)); max-height: calc(100dvh - var(--titlebar-height) - 48px); padding: 26px; color: var(--text); background: #202125; border: 1px solid #383941; border-radius: 12px; outline: none; box-shadow: 0 24px 80px #0005; overflow: auto; }
  dialog::backdrop { background: #08090bb8; }
  dialog[open] { display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; }
  h2 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.6px; }
  .body { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 20px; margin-top: 24px; overflow: auto; min-height: 0; flex: 1; }
  nav { border-right: 1px solid var(--line); padding-right: 12px; }
  nav button { width: 100%; font-size: 14px; }
  nav button[aria-current="page"] { background: var(--accent-soft); color: var(--accent-text); font-weight: 700; }
  section { min-width: 0; }
  h3 { margin: 0 0 18px; font-size: 15px; font-weight: 600; }
  .font-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 12px; margin-bottom: 12px; }
  label { font-size: 14px; font-weight: 400; color: #bcbec8; min-width: 0; }
  input { width: 100%; background: #18191c; border: 1px solid #3b3c44; border-radius: 6px; padding: 9px 10px; color: var(--text); min-width: 0; }
  p { margin: 8px 0; color: var(--sub); font-size: 12px; }
  p:empty { display: none; }
  .save-error { color: #f1bbc2; }
  .window-buttons { border: 0; padding: 0; margin: 24px 0 0; min-width: 0; }
  .window-buttons legend { padding: 0; }
  .window-buttons label { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
  .window-buttons input { width: auto; margin: 0; flex-shrink: 0; }
  @media (max-width: 480px) {
    dialog { padding: 18px; }
    .body { grid-template-columns: 88px minmax(0, 1fr); gap: 12px; }
    nav { padding-right: 8px; }
    nav button { padding: 7px 6px; }
  }
</style>
