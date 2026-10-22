<script lang="ts">
  import { tick } from "svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import { columnTypes, floatingEditor, hasOptions, optionColors } from "$lib/columns";
  import type { Column, ColumnOption, ColumnType } from "$lib/types";
  import OptionChip from "./OptionChip.svelte";

  let { column = null, emojis, busy, onCreate, onRename, onDelete, onOptions }: {
    column?: Column | null;
    emojis: string[];
    busy: boolean;
    onCreate: (name: string, type: ColumnType) => Promise<boolean>;
    onRename: (column: Column, name: string) => Promise<boolean>;
    onDelete: (column: Column) => Promise<boolean>;
    onOptions: (column: Column, options: ColumnOption[]) => Promise<boolean>;
  } = $props();

  let anchor = $state<HTMLButtonElement>(null!);
  let panel = $state<HTMLDivElement>();
  let open = $state(false);
  let name = $state("");
  let type = $state<ColumnType>("text");
  let options = $state<ColumnOption[]>([]);
  let mode = $state<"menu" | "rename" | "options" | "delete">("menu");
  let emojiId = $state<number | null>(null);
  const TypeIcon = $derived(column ? columnTypes.find((item) => item.type === column.type)!.icon : Plus);

  function toggle() {
    if (open) { open = false; return; }
    name = column?.name ?? "";
    type = "text";
    options = column?.options?.map((option) => ({ ...option })) ?? [];
    mode = "menu";
    emojiId = null;
    open = true;
  }

  async function showMode(next: typeof mode) {
    mode = next;
    await tick();
    panel?.querySelector<HTMLElement>("input, button")?.focus();
  }

  async function save() {
    const current = column;
    open = false;
    if (!current) await onCreate(name.trim() || columnTypes.find((item) => item.type === type)!.name, type);
    else if (mode === "rename") await onRename(current, name.trim());
    else if (mode === "options") await onOptions(current, options);
    else if (mode === "delete") await onDelete(current);
    await tick();
    anchor?.focus();
  }
</script>

<button bind:this={anchor} class="column-header" class:add-column={!column} aria-label={column ? `Column ${column.name}` : "Add column"} aria-expanded={open} disabled={busy} onclick={toggle}>
  {#if column}<span aria-hidden="true" class="type-icon" title={column.type}><TypeIcon size={18} /></span>{column.name}{:else}<Plus size={18} />{/if}
</button>
{#if open}
  <div bind:this={panel} class="column-popover" role="dialog" aria-label={column ? `${column.name} column settings` : "Create column"} use:floatingEditor={{ anchor, close: () => open = false }}>
    {#if !column}
      <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Column name<input bind:value={name} maxlength="64" placeholder="Column name" /></label>
        <div class="types" aria-label="Column type">
          {#each columnTypes as item}
            <button type="button" aria-pressed={type === item.type} onclick={() => type = item.type}><item.icon size={18} />{item.name}</button>
          {/each}
        </div>
        <button class="primary" type="submit">Create column</button>
      </form>
    {:else if mode === "menu"}
      <button onclick={() => showMode("rename")}>Rename</button>
      {#if hasOptions(column.type)}<button onclick={() => showMode("options")}>Edit options</button>{/if}
      <button class="danger" onclick={() => showMode("delete")}>Delete</button>
    {:else if mode === "rename"}
      <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Column name<input bind:value={name} maxlength="64" required /></label>
        <button class="primary" disabled={!name.trim()}>Rename column</button>
      </form>
    {:else if mode === "delete"}
      <p>Delete this column and all its values permanently?</p>
      <button onclick={() => open = false}>Keep column</button>
      <button class="danger" onclick={save}>Delete column</button>
    {:else}
      <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
        {#each options as option (option.id)}
          <div class="option-row">
            <OptionChip {option} />
            <label>Option label<input bind:value={option.label} required /></label>
            <button type="button" aria-label={`Emoji for ${option.label}`} onclick={() => emojiId = emojiId === option.id ? null : option.id}>{option.emoji || "Emoji"}</button>
            <label>Color<select bind:value={option.color}>{#each Object.keys(optionColors) as color}<option value={color}>{color}</option>{/each}</select></label>
            <button type="button" aria-label={`Remove ${option.label}`} onclick={() => options = options.filter((item) => item.id !== option.id)}>×</button>
            {#if emojiId === option.id}
              <div class="emoji-grid" aria-label="Common emojis">
                {#each emojis as emoji}<button type="button" aria-label={`Choose ${emoji}`} onclick={() => { option.emoji = emoji; emojiId = null; }}>{emoji}</button>{/each}
                <button type="button" onclick={() => { option.emoji = ""; emojiId = null; }}>Clear</button>
              </div>
            {/if}
          </div>
        {/each}
        <button type="button" onclick={() => options = [...options, { id: Math.max(0, ...(column?.options ?? []).map((item) => item.id), ...options.map((item) => item.id)) + 1, label: "", emoji: "", color: "gray" }]}>Add option</button>
        <button class="primary" disabled={options.some((option) => !option.label.trim())}>Save options</button>
      </form>
    {/if}
  </div>
{/if}

<style>
  .column-header { width: 100%; padding: 0; justify-content: flex-start; font-weight: 500; white-space: normal; overflow-wrap: anywhere; text-align: left; }
  .column-header.add-column { width: 28px; height: 28px; justify-content: center; }
  .type-icon { display: inline-flex; align-items: center; color: var(--sub); flex-shrink: 0; }
  .column-popover { position: fixed; z-index: 40; width: 320px; max-width: calc(100vw - 16px); max-height: min(560px, calc(100dvh - 16px)); overflow: auto; padding: 12px; background: #202125; border: 1px solid #42434d; border-radius: 8px; box-shadow: 0 12px 40px #0006; color: var(--text); white-space: normal; }
  .column-popover > button { display: flex; width: 100%; }
  label { display: block; font-size: 12px; color: var(--sub); margin-bottom: 8px; }
  input, select { display: block; width: 100%; background: #18191c; border: 1px solid #3b3c44; border-radius: 4px; padding: 6px; color: var(--text); }
  .types { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 12px; gap: 4px; }
  .types button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-text); }
  .option-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .option-row label { flex: 1; min-width: 90px; }
  .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); width: 100%; gap: 2px; }
  .emoji-grid button { justify-content: center; padding: 4px 0; font-size: 18px; }
  .danger { color: #efadb4; }
  p { font-size: 12px; }
</style>
