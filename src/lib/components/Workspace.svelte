<script lang="ts">
  import { onMount, tick } from "svelte";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowDownUp from "@lucide/svelte/icons/arrow-down-up";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Columns3 from "@lucide/svelte/icons/columns-3";
  import Database from "@lucide/svelte/icons/database";
  import Filter from "@lucide/svelte/icons/filter";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Layers from "@lucide/svelte/icons/layers";
  import Lightbulb from "@lucide/svelte/icons/lightbulb";
  import List from "@lucide/svelte/icons/list";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Table2 from "@lucide/svelte/icons/table-2";
  import X from "@lucide/svelte/icons/x";
  import { api, errorMessage } from "$lib/api";
  import { formatDate, visibleRecords } from "$lib/records";
  import { statuses, type Layout, type RecordInput, type RecordItem, type SavedView, type Workspace } from "$lib/types";
  import RecordEditor from "./RecordEditor.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  let workspace = $state<Workspace>({ databases: [], views: [], records: [] });
  let loading = $state(true);
  let busy = $state(false);
  let error = $state("");
  let announcement = $state("");
  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let databaseId = $state<number | null>(null);
  let selectedViews = $state<Record<number, number>>({});
  let editing = $state<RecordItem | null>(null);
  let selectedRow = $state<number | null>(null);
  let recordsElement = $state<HTMLDivElement>();
  let drag = $state<{ recordId: number; startX: number; startY: number; targetId: number | null; after: boolean; moved: boolean } | null>(null);
  let suppressGripClick = false;

  const database = $derived(workspace.databases.find((item) => item.id === databaseId) ?? workspace.databases[0]);
  const views = $derived(workspace.views.filter((item) => item.databaseId === database?.id));
  const view = $derived(views.find((item) => item.id === selectedViews[database?.id ?? 0]) ?? views[0]);
  const rows = $derived(visibleRecords(workspace.records, view));
  const selectedIndex = $derived(rows.findIndex((record) => record.id === selectedRow));

  onMount(() => { void load(); });

  async function load() {
    if (busy) return;
    loading = true;
    error = "";
    try {
      workspace = await api.load();
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      loading = false;
    }
  }

  async function mutate(operation: () => Promise<Workspace>): Promise<boolean> {
    if (busy) return false;
    busy = true;
    error = "";
    try {
      workspace = await operation();
      return true;
    } catch (cause) {
      error = errorMessage(cause);
      return false;
    } finally {
      busy = false;
    }
  }

  function selectDatabase(id: number) {
    databaseId = id;
    selectedRow = null;
    settingsOpen = false;
  }

  function selectView(id: number) {
    if (!database) return;
    selectedViews[database.id] = id;
    selectedRow = null;
  }

  async function updateView(changes: Partial<SavedView>) {
    if (!view || busy) return;
    const next = { ...view, ...changes };
    await mutate(() => api.saveView(next));
  }

  async function createRecord() {
    if (!database || !view || busy) return;
    const id = database.id;
    const status = view.filterActive ? "In progress" : "To do";
    const existingIds = new Set(workspace.records.map((record) => record.id));
    if (await mutate(() => api.create(id, status))) {
      editing = workspace.records.find((record) => !existingIds.has(record.id)) ?? null;
    }
  }

  function edit(record: RecordItem) {
    if (!busy) { error = ""; editing = record; }
  }

  async function saveRecord(input: RecordInput) {
    if (await mutate(() => api.update(input))) {
      editing = null;
      announcement = "Record saved.";
    }
  }

  async function deleteRecord(id: number) {
    if (await mutate(() => api.remove(id))) {
      editing = null;
      if (selectedRow === id) selectedRow = null;
      announcement = "Record deleted.";
    }
  }

  async function reorder(recordId: number, targetId: number, after: boolean, focus = false) {
    if (!database || view?.sortActive || busy || recordId === targetId) return;
    const id = database.id;
    if (await mutate(() => api.reorder(id, recordId, targetId, after))) {
      selectedRow = recordId;
      announcement = "Record order saved.";
    }
    if (focus) {
      await tick();
      recordsElement?.querySelector<HTMLButtonElement>(`[data-grip="${recordId}"]`)?.focus();
    }
  }

  function move(recordId: number, direction: -1 | 1, focus = false) {
    const index = rows.findIndex((record) => record.id === recordId);
    const target = rows[index + direction];
    if (index !== -1 && target) void reorder(recordId, target.id, direction === 1, focus);
  }

  function gripKeydown(event: KeyboardEvent, recordId: number) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      move(recordId, event.key === "ArrowUp" ? -1 : 1, true);
    }
  }

  function pointerDown(event: PointerEvent, recordId: number) {
    if (event.button !== 0 || busy || view?.sortActive) return;
    suppressGripClick = false;
    drag = { recordId, startX: event.clientX, startY: event.clientY, targetId: null, after: false, moved: false };
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent) {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5 && !drag.moved) return;
    drag.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>("tr[data-record-id]");
    if (!target || !recordsElement?.contains(target)) { drag.targetId = null; return; }
    drag.targetId = Number(target.dataset.recordId);
    const bounds = target.getBoundingClientRect();
    drag.after = event.clientY > bounds.top + bounds.height / 2;
  }

  function pointerUp() {
    const finished = drag;
    drag = null;
    if (!finished?.moved) return;
    suppressGripClick = true;
    if (finished.targetId !== null) void reorder(finished.recordId, finished.targetId, finished.after, true);
  }
</script>

<svelte:head><meta name="description" content="Folio — a calm, local-first database workspace." /></svelte:head>

<div class="shell">
  {#if sidebarOpen}
    <aside id="database-sidebar" aria-label="Workspace navigation">
      <div class="brand"><span class="logo">f</span> folio</div>
      <div class="caption">WORKSPACE</div>
      <nav aria-label="Databases">
        {#each workspace.databases as item (item.id)}
          <button class="db" class:active={database?.id === item.id} aria-current={database?.id === item.id ? "page" : undefined} disabled={busy} onclick={() => selectDatabase(item.id)}>
            {#if item.icon === "book"}<BookOpen size={16} />{:else if item.icon === "idea"}<Lightbulb size={16} />{:else}<Layers size={16} />{/if}
            {item.name}
          </button>
        {/each}
      </nav>
      <div class="side-bottom"><span class="avatar">OK</span><div>Oshank’s workspace</div><small>Local workspace</small></div>
    </aside>
  {/if}

  <main>
    <header class="chrome">
      <button class="icon-button" aria-label="Toggle database sidebar" aria-expanded={sidebarOpen} aria-controls="database-sidebar" onclick={() => sidebarOpen = !sidebarOpen}><PanelLeft size={16} /></button>
      <div class="path">Workspace <span>/</span> <span class="current-path">{database?.name ?? "Folio"}</span></div>
      <span class="local-indicator"><span></span> Local only</span>
    </header>

    <div class="content">
      {#if loading}
        <div class="load-state" role="status"><Database size={24} /><h1>Opening your workspace…</h1><p>Everything stays on this device.</p></div>
      {:else if !database}
        <div class="load-state"><Database size={28} /><h1>Your local workspace</h1><p role="alert">{error || "No databases are available."}</p><button class="primary" onclick={load}><RefreshCw size={15} /> Try again</button></div>
      {:else}
        <div class="eyebrow"><Database size={14} /> DATABASE</div>
        <h1>{database.name}</h1>
        <p class="description">{database.description}</p>

        <nav class="tabs" aria-label="Saved views">
          {#each views as item (item.id)}
            <button class:selected={view?.id === item.id} aria-pressed={view?.id === item.id} disabled={busy} onclick={() => selectView(item.id)}>
              {#if item.layout === "board"}<Columns3 size={16} />{:else if item.layout === "list"}<List size={16} />{:else if item.filterActive}<ListFilter size={16} />{:else}<Table2 size={16} />{/if}
              {item.name}
            </button>
          {/each}
        </nav>

        {#if view}
          <div class="toolbar" aria-label="Database controls">
            <button class:on={view.filterActive} aria-pressed={view.filterActive} disabled={busy} onclick={() => updateView({ filterActive: !view.filterActive })}><Filter size={15} />{view.filterActive ? "In progress ×" : "Filter"}</button>
            <button class:on={view.sortActive} aria-pressed={view.sortActive} title={view.sortActive ? "Turn off alphabetical sorting" : "Sort by name, A–Z"} disabled={busy} onclick={() => updateView({ sortActive: !view.sortActive })}><ArrowDownUp size={15} />Sort{view.sortActive ? " A–Z" : ""}</button>
            <button class:on={settingsOpen} aria-expanded={settingsOpen} aria-controls="view-options" onclick={() => settingsOpen = !settingsOpen}><SlidersHorizontal size={15} />View settings</button>
            <span class="spacer"></span>
            <button class="primary" disabled={busy} onclick={createRecord}><Plus size={16} />New record</button>
          </div>

          {#if settingsOpen}
            <section class="settings" id="view-options" aria-label="View settings">
              <label>Layout <span class="select-wrap"><select aria-label="Layout" value={view.layout} disabled={busy} onchange={(event) => { const layout = event.currentTarget.value as Layout; event.currentTarget.value = view.layout; void updateView({ layout }); }}><option value="table">Table</option><option value="board">Board</option><option value="list">List</option></select><ChevronDown size={14} /></span></label>
              <label>Compact rows <input type="checkbox" checked={view.compact} disabled={busy} onchange={(event) => { const compact = event.currentTarget.checked; event.currentTarget.checked = view.compact; void updateView({ compact }); }} /></label>
              <label>Show owner <input type="checkbox" checked={view.showOwner} disabled={busy} onchange={(event) => { const showOwner = event.currentTarget.checked; event.currentTarget.checked = view.showOwner; void updateView({ showOwner }); }} /></label>
            </section>
          {/if}

          {#if error && !editing}
            <div class="error-banner" role="alert"><span>{error}</span><button class="icon-button" aria-label="Dismiss error" onclick={() => error = ""}><X size={16} /></button></div>
          {/if}

          <div class="records" class:compact={view.compact} bind:this={recordsElement} aria-busy={busy}>
            {#if view.layout === "table"}
              <div class="table-wrap">
                <table>
                  <thead><tr><th class="grip-cell" scope="col"><span class="sr-only">Reorder</span></th><th scope="col"><span class="column-icon">Aa</span> Name</th><th scope="col"><span class="column-icon">◉</span> Status</th><th scope="col">Priority</th><th scope="col">Due date</th>{#if view.showOwner}<th scope="col">Owner</th>{/if}</tr></thead>
                  <tbody>
                    {#each rows as record (record.id)}
                      <tr data-record-id={record.id} class:drop-before={drag?.moved && drag.targetId === record.id && drag.recordId !== record.id && !drag.after} class:drop-after={drag?.moved && drag.targetId === record.id && drag.recordId !== record.id && drag.after}>
                        <td class="grip-cell">
                          <span title={view.sortActive ? "Turn off sorting to reorder" : "Drag to reorder · click for move controls · use ↑ or ↓"}>
                            <button class="row-grip" data-grip={record.id} aria-label={`Reorder ${record.name}`} disabled={view.sortActive || busy} onclick={() => { if (suppressGripClick) { suppressGripClick = false; return; } selectedRow = record.id; }} onkeydown={(event) => gripKeydown(event, record.id)} onpointerdown={(event) => pointerDown(event, record.id)} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => drag = null} onlostpointercapture={() => drag = null}><GripVertical size={16} /></button>
                          </span>
                        </td>
                        <td class="name-cell"><button class="record-name" disabled={busy} onclick={() => edit(record)}>{record.name}</button></td>
                        <td><StatusBadge status={record.status} /></td>
                        <td class="muted">{record.priority}</td>
                        <td class="muted"><span title={record.dueDate ?? "No due date"}>{formatDate(record.dueDate)}</span></td>
                        {#if view.showOwner}<td class="muted">{record.owner || "Unassigned"}</td>{/if}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              {#if selectedIndex !== -1 && !view.sortActive}
                <div class="move-actions" aria-label="Move record controls">
                  <span>{rows[selectedIndex].name}</span>
                  <button disabled={selectedIndex === 0 || busy} onclick={() => move(rows[selectedIndex].id, -1)}><ArrowUp size={13} />Move up</button>
                  <button disabled={selectedIndex === rows.length - 1 || busy} onclick={() => move(rows[selectedIndex].id, 1)}><ArrowDown size={13} />Move down</button>
                  <button onclick={() => selectedRow = null}>Done</button>
                </div>
              {/if}
            {:else if view.layout === "board"}
              <div class="board">
                {#each statuses as status}
                  {@const cards = rows.filter((record) => record.status === status)}
                  <section class="lane" aria-label={`${status} records`}>
                    <header class="lane-title"><StatusBadge {status} /><span>{cards.length}</span></header>
                    {#each cards as record (record.id)}
                      <button class="record" disabled={busy} onclick={() => edit(record)}><span>{record.name}</span><small>{record.priority} · {formatDate(record.dueDate)}{view.showOwner ? ` · ${record.owner || "Unassigned"}` : ""}</small></button>
                    {/each}
                    {#if cards.length === 0}<p class="lane-empty">No records</p>{/if}
                  </section>
                {/each}
              </div>
            {:else}
              <div class="list">
                {#each rows as record (record.id)}
                  <button class="list-row" disabled={busy} onclick={() => edit(record)}><span>{record.name}</span><StatusBadge status={record.status} /></button>
                {/each}
              </div>
            {/if}
            {#if rows.length === 0}
              <div class="empty"><p>{view.filterActive ? "No records in progress." : "A little space for your next idea."}</p><button disabled={busy} onclick={createRecord}><Plus size={15} />Add a record</button></div>
            {/if}
          </div>
          <footer class="footer"><span>{rows.length} {rows.length === 1 ? "record" : "records"}</span><span>{busy ? "Saving…" : "Saved on this device · SQLite"}</span></footer>
        {/if}
      {/if}
    </div>
  </main>
</div>

<div class="sr-only" role="status" aria-live="polite">{announcement}</div>

{#if editing}
  {#key editing.id}
    <RecordEditor record={editing} {busy} {error} onSave={saveRecord} onDelete={deleteRecord} onClose={() => { editing = null; error = ""; }} />
  {/key}
{/if}

<style>
  .shell { display: flex; min-height: 100dvh; }
  aside { width: 210px; flex-shrink: 0; background: #141518; border-right: 1px solid var(--line); padding: 20px 12px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 10px 26px; font-weight: 600; letter-spacing: -.4px; font-size: 18px; }
  .logo { background: #b8aaf7; color: #252034; border-radius: 7px; padding: 2px 8px; }
  .caption { color: var(--sub); font-size: 11px; letter-spacing: 1px; padding: 20px 10px 8px; }
  .db { width: 100%; margin: 2px 0; color: #b7b8c1; }
  .db.active { background: #292631; color: #e1dafa; }
  .side-bottom { margin-top: auto; color: var(--sub); padding: 28px 10px 0; font-size: 12px; }
  .side-bottom div { padding-top: 8px; }
  .side-bottom small { font-size: 11px; color: #737680; }
  .avatar { background: #34313f; border-radius: 50%; width: 26px; height: 26px; display: grid; place-items: center; color: #d7cdee; font-size: 11px; }
  main { flex: 1; min-width: 0; }
  .chrome { min-height: 56px; border-bottom: 1px solid var(--line); padding: 0 22px; display: flex; align-items: center; gap: 12px; color: var(--sub); font-size: 12px; }
  .path { flex: 1; }
  .path > span:first-child { margin: 0 8px; color: #61636e; }
  .current-path { color: #c8c9d0; }
  .local-indicator { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; white-space: nowrap; }
  .local-indicator > span { height: 5px; width: 5px; background: #91b29f; border-radius: 50%; }
  .content { padding: 30px 28px; }
  .eyebrow { color: var(--sub); font-size: 12px; display: flex; gap: 8px; align-items: center; }
  h1 { font-size: 28px; letter-spacing: -1px; font-weight: 600; margin: 8px 0 4px; }
  .description { color: var(--sub); margin: 0 0 26px; font-size: 13px; }
  .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .tabs button { border-radius: 0; padding: 10px 9px; color: var(--sub); border-bottom: 2px solid transparent; }
  .tabs button.selected { color: #d9d0ff; border-bottom-color: var(--accent); }
  .toolbar { display: flex; align-items: center; gap: 5px; padding: 16px 0; flex-wrap: wrap; font-size: 12px; }
  button.on { color: #c8bbff; background: #292535; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; white-space: nowrap; font-size: 12px; }
  th { font-weight: 400; color: var(--sub); background: #1c1d21; text-align: left; padding: 10px 12px; border: 1px solid var(--line); }
  .column-icon { margin-right: 7px; color: #777a86; }
  td { padding: 13px 12px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); }
  td:first-child { border-left: 1px solid var(--line); }
  tr:hover td { background: #202126; }
  .name-cell { min-width: 210px; width: 35%; }
  button.record-name { padding: 0; border-radius: 2px; color: #e8e8ec; }
  button.record-name:hover:not(:disabled) { background: none; color: #d9d0ff; text-decoration: underline; text-underline-offset: 3px; }
  .muted { color: var(--sub); }
  .grip-cell { width: 34px; padding: 3px 2px !important; border-right: 0; background: #18191c; }
  .row-grip { padding: 6px; color: #81838f; cursor: grab; touch-action: none; }
  .row-grip:hover:not(:disabled) { color: #d9d0ff; background: #302b3d; }
  .row-grip:active { cursor: grabbing; }
  tr.drop-before td { box-shadow: inset 0 2px #b8aaf7; }
  tr.drop-after td { box-shadow: inset 0 -2px #b8aaf7; }
  .compact td { padding: 8px 12px; }
  .move-actions { display: flex; align-items: center; gap: 6px; margin-top: 12px; flex-wrap: wrap; font-size: 12px; color: #bbb5cf; }
  .move-actions > span { margin-right: 6px; }
  .move-actions button { border: 1px solid #393540; background: #25222d; }
  .footer { display: flex; justify-content: space-between; margin-top: 16px; color: #858994; font-size: 11px; gap: 12px; flex-wrap: wrap; }
  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .lane { background: #151619; padding: 10px; border-radius: 8px; }
  .lane-title { display: flex; justify-content: space-between; color: #a7a9b4; font-size: 12px; margin-bottom: 14px; }
  button.record { display: block; width: 100%; background: #222328; border: 1px solid #303138; border-radius: 7px; padding: 12px; margin: 8px 0; font-size: 12px; overflow-wrap: anywhere; }
  .record small { display: block; margin-top: 14px; color: var(--sub); font-size: 11px; }
  .lane-empty { color: #737680; font-size: 12px; padding: 12px 0; margin: 0; }
  .settings { display: flex; padding: 6px 16px; flex-direction: column; max-width: 340px; margin-bottom: 14px; background: #202125; border: 1px solid #35363d; border-radius: 8px; font-size: 12px; }
  .settings label { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 49px; width: 100%; color: #c7c8d0; }
  .settings label + label { border-top: 1px solid #2f3037; }
  .settings select { appearance: none; min-width: 135px; padding: 7px 32px 7px 11px; background: #292a31; border: 1px solid #42434d; border-radius: 6px; color: #e4dfff; font-size: 12px; line-height: 20px; }
  .select-wrap { position: relative; display: inline-flex; }
  .select-wrap :global(svg) { position: absolute; right: 10px; top: 10px; pointer-events: none; color: #aaa6b9; }
  .settings input[type="checkbox"] { appearance: none; flex-shrink: 0; width: 17px; height: 17px; border: 1px solid #555461; border-radius: 4px; background: #292a31; margin: 0; display: grid; place-content: center; cursor: pointer; }
  .settings input[type="checkbox"]:checked { background: #b8aaf7; border-color: #b8aaf7; }
  .settings input[type="checkbox"]:checked::after { content: ""; width: 8px; height: 4px; border-left: 2px solid #272135; border-bottom: 2px solid #272135; transform: translateY(-1px) rotate(-45deg); }
  .list-row { display: flex; width: 100%; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); border-radius: 0; padding: 14px 5px; font-size: 13px; }
  .list-row > span { overflow-wrap: anywhere; }
  .empty { padding: 32px 12px; color: var(--sub); font-size: 13px; text-align: center; }
  .empty p { margin: 0 0 12px; }
  .load-state { padding: 80px 16px; max-width: 560px; margin: 0 auto; text-align: center; color: var(--sub); }
  .load-state h1 { font-size: 24px; color: var(--text); }
  .load-state p { font-size: 13px; margin-bottom: 24px; }
  .error-banner { display: flex; align-items: center; justify-content: space-between; background: #38282c; border: 1px solid #67434b; color: #f1bbc2; padding: 8px 12px; margin-bottom: 16px; border-radius: 6px; font-size: 12px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 700px) {
    aside { width: 165px; }
    .content { padding: 22px 16px; }
    .board { grid-template-columns: 1fr; }
    .chrome { padding: 0 12px; }
    .local-indicator { display: none; }
  }
  @media (max-width: 500px) {
    .shell { flex-direction: column; }
    aside { width: 100%; border-right: 0; border-bottom: 1px solid var(--line); padding: 12px; display: block; }
    .brand { padding-bottom: 8px; }
    .db { width: auto; font-size: 12px; }
    .caption, .side-bottom { display: none; }
    h1 { font-size: 24px; }
    .tabs { gap: 0; }
    .tabs button { font-size: 12px; padding: 10px 7px; }
  }
</style>
