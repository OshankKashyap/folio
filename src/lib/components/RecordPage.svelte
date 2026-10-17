<script lang="ts">
  import { onMount } from "svelte";
  import Bold from "@lucide/svelte/icons/bold";
  import Italic from "@lucide/svelte/icons/italic";
  import Heading2 from "@lucide/svelte/icons/heading-2";
  import List from "@lucide/svelte/icons/list";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import Quote from "@lucide/svelte/icons/quote";
  import Code from "@lucide/svelte/icons/code";
  import SquareCode from "@lucide/svelte/icons/square-code";
  import Link from "@lucide/svelte/icons/link";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Minimize2 from "@lucide/svelte/icons/minimize-2";
  import X from "@lucide/svelte/icons/x";
  import { api, errorMessage } from "$lib/api";
  import { createEditor, type PageEditor, type ToolbarAction } from "$lib/editor";
  import type { RecordItem } from "$lib/types";

  let { record, onClose }: { record: RecordItem; onClose: (recordId: number) => void } = $props();
  let host: HTMLDivElement;
  let editor = $state<PageEditor>();
  let loading = $state(true);
  let expanded = $state(false);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state("");
  let content = "";
  let savedContent = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | undefined;
  let disposed = false;
  let closing = false;
  const tools: [ToolbarAction, typeof Bold][] = [["Bold", Bold], ["Italic", Italic], ["Heading", Heading2], ["Bullet list", List], ["Numbered list", ListOrdered], ["Quote", Quote], ["Inline code", Code], ["Code block", SquareCode], ["Link", Link]];

  onMount(() => {
    void load();
    return () => { disposed = true; clearTimeout(timer); editor?.destroy(); };
  });

  async function load() {
    loading = true;
    error = "";
    try {
      const loaded = await api.getRecordPage(record.id);
      if (disposed) return;
      content = savedContent = loaded;
      editor = createEditor(host, loaded, (value) => {
        content = value;
        dirty = content !== savedContent;
        clearTimeout(timer);
        timer = setTimeout(() => { void flush(); }, 600);
      });
      editor.focus();
    } catch (cause) {
      if (!disposed) error = errorMessage(cause);
    } finally {
      if (!disposed) loading = false;
    }
  }

  export async function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (inFlight) {
      if (!await inFlight) return false;
      return flush();
    }
    if (!dirty || disposed) return true;
    const snapshot = content;
    saving = true;
    error = "";
    inFlight = (async () => {
      try {
        await api.saveRecordPage(record.id, snapshot);
        savedContent = snapshot;
        dirty = content !== savedContent;
        return true;
      } catch (cause) {
        error = errorMessage(cause);
        return false;
      } finally {
        saving = false;
        inFlight = undefined;
      }
    })();
    const saved = await inFlight;
    return saved && dirty ? flush() : saved;
  }

  async function close() {
    if (closing) return;
    closing = true;
    if (await flush()) onClose(record.id);
    closing = false;
  }
</script>

<section class="record-page" class:expanded aria-label="Record page" aria-busy={loading}>
  <header>
    <h2 title={record.name}>{record.name}</h2>
    <span class="save-status" role="status">{loading ? "Loading…" : saving ? "Saving…" : dirty ? "Unsaved" : editor ? "Saved" : ""}</span>
    <button class="icon-button" aria-label={expanded ? "Collapse page" : "Expand page"} title={expanded ? "Collapse page" : "Expand page"} onclick={() => expanded = !expanded}>{#if expanded}<Minimize2 size={16} />{:else}<Maximize2 size={16} />{/if}</button>
    <button class="icon-button" aria-label="Close page" title="Close page" onclick={close}><X size={16} /></button>
  </header>
  <div class="formatting" role="toolbar" aria-label="Markdown formatting">
    {#each tools as [action, Icon]}
      <button class="icon-button" aria-label={action} title={action === "Heading" ? "Heading (H2)" : action} disabled={loading || !editor} onmousedown={(event) => event.preventDefault()} onclick={() => editor?.action(action)}><Icon size={16} /></button>
    {/each}
  </div>
  {#if error}<div class="page-error"><span role="alert">{error}</span><button onclick={() => editor ? flush() : load()}>Retry</button></div>{/if}
  <div class="editor-host" bind:this={host}></div>
</section>

<style>
  .record-page { position: absolute; top: 0; right: 0; bottom: 0; max-height: calc(100dvh - var(--titlebar-height)); width: min(100%, max(320px, min(50vw, 720px))); z-index: 10; background: #18191c; border-left: 1px solid var(--line); box-shadow: -12px 0 40px #0006; display: flex; flex-direction: column; min-height: 0; }
  .record-page.expanded { position: fixed; inset: var(--titlebar-height) 0 0; width: 100%; z-index: 20; }
  header { display: flex; flex-shrink: 0; align-items: center; gap: 6px; padding: 12px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; min-width: 0; margin: 0; font-size: 15px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .save-status { color: var(--sub); font-size: 11px; white-space: nowrap; }
  .formatting { display: flex; flex-shrink: 0; flex-wrap: wrap; gap: 2px; padding: 8px; border-bottom: 1px solid var(--line); }
  .editor-host { flex: 1; min-height: 0; overflow: hidden; font-family: var(--app-font); }
  .page-error { display: flex; gap: 8px; align-items: center; padding: 8px 12px; color: #f1bbc2; font-size: 12px; }
</style>
