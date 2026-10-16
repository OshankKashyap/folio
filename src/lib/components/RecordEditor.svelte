<script lang="ts">
  import { onMount, untrack } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { priorities, statuses, type RecordInput, type RecordItem } from "$lib/types";

  let { record, busy, error, onSave, onDelete, onClose }: {
    record: RecordItem;
    busy: boolean;
    error: string;
    onSave: (input: RecordInput) => Promise<void>;
    onDelete: (id: number) => Promise<void>;
    onClose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  const initial = untrack(() => record);
  let nameInput: HTMLInputElement;
  let name = $state(initial.name);
  let status = $state(initial.status);
  let priority = $state(initial.priority);
  let dueDate = $state(initial.dueDate ?? "");
  let owner = $state(initial.owner);
  let confirmDelete = $state(false);

  onMount(() => { dialog.showModal(); nameInput.focus(); nameInput.select(); });

  function close() {
    if (!busy) onClose();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!busy && name.trim()) {
      await onSave({ id: record.id, name: name.trim(), status, priority, dueDate: dueDate || null, owner: owner.trim() });
    }
  }
</script>

<dialog bind:this={dialog} oncancel={(event) => { event.preventDefault(); close(); }} aria-labelledby="record-heading">
  <form onsubmit={submit}>
    <header>
      <div><span class="eyebrow">RECORD</span><h2 id="record-heading">Edit record</h2></div>
      <button type="button" class="icon-button" aria-label="Close record" disabled={busy} onclick={close}><X size={18} /></button>
    </header>
    <fieldset disabled={busy}>
      <label>Name<input bind:this={nameInput} required maxlength="500" bind:value={name} placeholder="Untitled" /></label>
      <div class="fields">
        <label>Status<select bind:value={status}>{#each statuses as value}<option>{value}</option>{/each}</select></label>
        <label>Priority<select bind:value={priority}>{#each priorities as value}<option>{value}</option>{/each}</select></label>
      </div>
      <div class="fields">
        <label>Due date<input type="date" bind:value={dueDate} /></label>
        <label>Owner<input maxlength="200" bind:value={owner} placeholder="Unassigned" /></label>
      </div>
    </fieldset>
    {#if error}<p class="save-error" role="alert">{error}</p>{/if}
    {#if confirmDelete}
      <div class="delete-confirm" role="alert">
        <p>Delete this record permanently?</p>
        <button type="button" disabled={busy} onclick={() => confirmDelete = false}>Keep record</button>
        <button type="button" class="danger" disabled={busy} onclick={() => onDelete(record.id)}>Delete record</button>
      </div>
    {/if}
    <footer>
      <button type="button" class="danger" disabled={busy} onclick={() => confirmDelete = true}><Trash2 size={15} /> Delete</button>
      <span class="spacer"></span>
      <button type="button" disabled={busy} onclick={close}>Cancel</button>
      <button type="submit" class="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save changes"}</button>
    </footer>
    <p class="hint">Changes are saved locally on this device.</p>
  </form>
</dialog>

<style>
  dialog { width: min(520px, calc(100vw - 32px)); padding: 26px; color: var(--text); background: #202125; border: 1px solid #383941; border-radius: 12px; box-shadow: 0 24px 80px #0005; }
  dialog::backdrop { background: #08090bb8; }
  header, footer { display: flex; align-items: center; gap: 8px; }
  header { justify-content: space-between; margin-bottom: 24px; }
  h2 { margin: 4px 0 0; font-size: 22px; font-weight: 600; letter-spacing: -.6px; }
  .eyebrow, .hint { color: var(--sub); font-size: 11px; }
  .eyebrow { letter-spacing: 1px; }
  fieldset { border: 0; margin: 0; padding: 0; }
  label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: #bcbec8; margin-bottom: 18px; min-width: 0; }
  input, select { width: 100%; background: #18191c; border: 1px solid #3b3c44; border-radius: 6px; padding: 9px 10px; color: var(--text); min-width: 0; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  footer { margin-top: 12px; font-size: 12px; flex-wrap: wrap; }
  .danger { color: #e6a0a7; }
  .save-error { padding: 10px; border: 1px solid #67434b; background: #38282c; border-radius: 6px; color: #f1bbc2; font-size: 12px; }
  .delete-confirm { border: 1px solid #664046; padding: 12px; border-radius: 6px; font-size: 12px; }
  .delete-confirm p { margin: 0 0 8px; }
  .hint { margin: 16px 0 0; text-align: right; }
</style>
