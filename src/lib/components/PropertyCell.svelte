<script lang="ts">
  import { tick } from "svelte";
  import Plus from "@lucide/svelte/icons/plus";
  import Square from "@lucide/svelte/icons/square";
  import SquareCheck from "@lucide/svelte/icons/square-check";
  import { floatingEditor, hasOptions } from "$lib/columns";
  import { formatDate, propertyValue } from "$lib/records";
  import type { Column, PropertyValue, RecordItem } from "$lib/types";
  import OptionChip from "./OptionChip.svelte";

  let { record, column, busy, onSave, onAddOption }: {
    record: RecordItem;
    column: Column;
    busy: boolean;
    onSave: (recordId: number, columnId: number, value: PropertyValue | null) => Promise<boolean>;
    onAddOption: (columnId: number, label: string) => Promise<number | null>;
  } = $props();
  let anchor = $state<HTMLButtonElement>(null!);
  let input = $state<HTMLInputElement>();
  let open = $state(false);
  let draft = $state("");
  let validation = $state("");
  let adding = $state("");
  let optimistic = $state<{ value: PropertyValue | null } | null>(null);
  const value = $derived(optimistic ? optimistic.value : propertyValue(record, column));
  const ids = $derived(value && "Multi" in value ? value.Multi : value && "Select" in value ? [value.Select] : value && "Status" in value ? [value.Status] : []);
  let month = $state(0);
  let year = $state(0);
  const days = $derived(Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1));
  const offset = $derived(new Date(year, month, 1).getDay());

  async function save(next: PropertyValue | null, close = true, restoreFocus = true) {
    if (busy) return;
    const focused = document.activeElement as HTMLElement | null;
    if (close) open = false;
    optimistic = { value: next };
    await onSave(record.id, column.id, next);
    optimistic = null;
    await tick();
    if (restoreFocus && close) anchor?.focus();
    else if (restoreFocus && open) focused?.focus();
  }

  async function begin() {
    if (busy) return;
    validation = "";
    if (column.type === "checkbox") { await save({ Checkbox: !(value && "Checkbox" in value && value.Checkbox) }); return; }
    if (open) { open = false; return; }
    draft = value && "Text" in value ? value.Text : value && "Number" in value ? String(value.Number) : "";
    adding = "";
    const date = value && "Date" in value ? new Date(`${value.Date}T00:00:00`) : new Date();
    month = date.getMonth();
    year = date.getFullYear();
    open = true;
    if (column.type === "text" || column.type === "number") { await tick(); input?.focus(); input?.select(); }
  }

  function saveInput(restoreFocus = true) {
    if (!open || busy) return;
    if (column.type === "number" && draft.trim() && !Number.isFinite(Number(draft))) {
      validation = "Enter a valid finite number.";
      if (!restoreFocus) open = false;
      return;
    }
    void save(!draft.trim() ? null : column.type === "text" ? { Text: draft } : { Number: Number(draft) }, true, restoreFocus);
  }

  function choose(id: number) {
    void save(column.type === "multiselect" ? { Multi: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] } : column.type === "status" ? { Status: id } : { Select: id }, column.type !== "multiselect");
  }

  async function addOption(event: SubmitEvent) {
    event.preventDefault();
    if (!adding.trim() || busy) return;
    const id = await onAddOption(column.id, adding.trim());
    if (id !== null) { adding = ""; choose(id); }
  }

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    year = next.getFullYear(); month = next.getMonth();
  }
</script>

<div class="property-cell">
  <button bind:this={anchor} class="cell-button" class:empty={!value} class:icon-only={column.type === "checkbox" || (hasOptions(column.type) && ids.length === 0)} aria-label={`${column.name} for ${record.name}`} aria-expanded={column.type === "checkbox" ? undefined : open} aria-pressed={column.type === "checkbox" ? !!(value && "Checkbox" in value && value.Checkbox) : undefined} disabled={busy} onclick={begin}>
    {#if column.type === "checkbox"}{#if value && "Checkbox" in value && value.Checkbox}<SquareCheck size={18} />{:else}<Square size={18} />{/if}
    {:else if ids.length}{#each column.options?.filter((option) => ids.includes(option.id)) ?? [] as option (option.id)}<OptionChip {option} />{/each}
    {:else if value && "Text" in value}{value.Text}
    {:else if value && "Number" in value}{value.Number}
    {:else if column.type === "date"}{formatDate(value && "Date" in value ? value.Date : null)}
    {:else if column.type === "text" || column.type === "number"}<span class="placeholder">{column.type === "text" ? "Empty" : "—"}</span>
    {:else}<span class="add-affordance"><Plus size={18} /></span>{/if}
  </button>
  {#if open && (column.type === "text" || column.type === "number")}
    <input bind:this={input} class="inline-input" aria-label={`Edit ${column.name} for ${record.name}`} inputmode={column.type === "number" ? "decimal" : "text"} bind:value={draft} aria-invalid={!!validation} onblur={() => saveInput(false)} onkeydown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); open = false; validation = ""; anchor.focus(); }
      else if (event.key === "Enter") { event.preventDefault(); saveInput(); }
    }} />
  {:else if open}
    <div class="cell-popover" role="dialog" aria-label={`Edit ${column.name}`} use:floatingEditor={{ anchor, close: () => open = false }}>
      {#if column.type === "date"}
        <div class="month"><button aria-label="Previous month" onclick={() => changeMonth(-1)}>‹</button><span>{new Date(year, month, 1).toLocaleDateString("en", { month: "long", year: "numeric" })}</span><button aria-label="Next month" onclick={() => changeMonth(1)}>›</button></div>
        <div class="calendar">
          {#each ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as day}<span>{day}</span>{/each}
          {#each Array(offset) as _}<span></span>{/each}
          {#each days as day}
            {@const iso = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`}
            <button aria-label={formatDate(iso)} aria-pressed={!!(value && "Date" in value && value.Date === iso)} disabled={busy} onclick={() => save({ Date: iso })}>{day}</button>
          {/each}
        </div>
      {:else}
        <form onsubmit={addOption}><input aria-label="New option" placeholder="Type to add option…" bind:value={adding} disabled={busy} /><button disabled={busy || !adding.trim()}>Add option</button></form>
        <div class="option-list">
          {#each column.options ?? [] as option (option.id)}<button aria-pressed={ids.includes(option.id)} disabled={busy} onclick={() => choose(option.id)}><OptionChip {option} />{ids.includes(option.id) ? "✓" : ""}</button>{/each}
        </div>
      {/if}
      <button disabled={busy} onclick={() => save(null)}>Clear</button>
    </div>
  {/if}
  {#if validation}<span class="validation" role="alert">{validation}</span>{/if}
</div>

<style>
  .property-cell { position: relative; width: 160px; min-height: 24px; font-size: 13px; font-weight: 400; }
  .cell-button { width: 100%; min-height: 24px; padding: 0; justify-content: flex-start; flex-wrap: wrap; gap: 6px; text-align: left; font-size: inherit; overflow-wrap: anywhere; white-space: normal; }
  .cell-button.icon-only { width: 28px; min-height: 28px; justify-content: center; }
  .cell-button:not(.icon-only):hover:not(:disabled) { background: transparent; }
  .empty { color: var(--sub); }
  .placeholder { opacity: .35; }
  .add-affordance { display: inline-flex; align-items: center; opacity: 0; }
  .cell-button:hover .add-affordance, .cell-button:focus-visible .add-affordance { opacity: .7; }
  .inline-input { position: absolute; top: 0; left: 0; width: 100%; height: 24px; padding: 2px 4px; background: #202125; border: 1px solid var(--accent); color: var(--text); }
  .validation { display: block; color: #f1bbc2; background: #38282c; border: 1px solid #67434b; padding: 4px; white-space: normal; font-size: 11px; }
  .cell-popover { position: fixed; z-index: 40; width: 260px; max-width: calc(100vw - 16px); max-height: min(430px, calc(100dvh - 16px)); overflow: auto; padding: 10px; background: #202125; border: 1px solid #42434d; border-radius: 8px; box-shadow: 0 12px 40px #0006; color: var(--text); }
  form { display: flex; flex-wrap: wrap; gap: 4px; }
  form input { width: 100%; background: #18191c; border: 1px solid #3b3c44; padding: 6px; border-radius: 4px; color: var(--text); }
  .option-list > button { display: flex; width: 100%; justify-content: space-between; margin: 3px 0; }
  .month { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
  .calendar { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; gap: 2px; font-size: 12px; margin: 8px 0; }
  .calendar button { justify-content: center; padding: 6px 0; }
  .calendar button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-text); }
</style>
