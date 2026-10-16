<script lang="ts">
  import { accentInk } from "$lib/theme";

  let { busy, error, onSubmit }: {
    busy: boolean;
    error: string;
    onSubmit: (name: string, accentColor: string) => Promise<void>;
  } = $props();

  let name = $state("");
  let accent = $state("#b8aaf7");
  const colors = [
    { name: "Lavender", value: "#b8aaf7" },
    { name: "Blue", value: "#91baff" },
    { name: "Mint", value: "#8bd5b5" },
    { name: "Peach", value: "#f4b68a" },
    { name: "Rose", value: "#eea5bd" },
    { name: "Teal", value: "#5ecfca" },
    { name: "Amber", value: "#f5cd6f" },
  ];
</script>

<main class="setup" style:--accent={accent} style:--accent-ink={accentInk(accent)}>
  <form onsubmit={(event) => { event.preventDefault(); if (name.trim() && !busy) void onSubmit(name.trim(), accent); }}>
    <span class="wordmark"><span>f</span> folio</span>
    <p class="eyebrow">MAKE YOURSELF AT HOME</p>
    <h1>A little space, all yours.</h1>
    <p class="intro">Give your workspace a name and a color. Start fresh, with everything saved on this device.</p>
    <label class="name-label" for="workspace-name">Workspace name</label>
    <input id="workspace-name" name="workspaceName" bind:value={name} placeholder="e.g. My workspace" required maxlength="100" disabled={busy} autocomplete="organization" />
    <fieldset disabled={busy}>
      <legend>Accent color</legend>
      <p class="hint">For buttons, selections, and focus highlights.</p>
      <div class="swatches">
        {#each colors as color}
          <label class="swatch" style:--swatch={color.value} title={color.name}>
            <input type="radio" name="accent" value={color.value} bind:group={accent} aria-label={color.name} />
          </label>
        {/each}
      </div>
      <label class="custom">Custom color <input type="color" bind:value={accent} aria-label="Custom accent color" /><span>{accent.toUpperCase()}</span></label>
    </fieldset>
    {#if error}<p class="setup-error" role="alert">{error}</p>{/if}
    <button class="primary" type="submit" disabled={busy || !name.trim()}>{busy ? "Creating workspace…" : "Create workspace"}</button>
    <p class="privacy">Local only. No account, no cloud, no sample data.</p>
  </form>
</main>

<style>
  .setup { min-height: 100dvh; display: grid; place-items: center; padding: 40px 24px; }
  form { width: 100%; max-width: 420px; }
  .wordmark { display: inline-flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 600; }
  .wordmark > span { background: var(--accent); color: var(--accent-ink); border-radius: 7px; padding: 0 9px; }
  .eyebrow { color: var(--sub); font-size: 11px; letter-spacing: 1.4px; margin: 44px 0 8px; }
  h1 { font-size: 28px; letter-spacing: -.8px; font-weight: 600; margin: 0 0 12px; }
  .intro { color: var(--sub); margin-bottom: 30px; }
  .name-label, legend { font-size: 13px; font-weight: 500; }
  .name-label { display: block; margin-bottom: 8px; }
  #workspace-name { width: 100%; background: #202125; border: 1px solid #3b3c44; border-radius: 6px; padding: 10px 12px; }
  fieldset { border: 0; margin: 26px 0; padding: 0; }
  .hint, .privacy { color: var(--sub); font-size: 12px; }
  .hint { margin: 6px 0 16px; }
  .swatches { display: flex; flex-wrap: wrap; gap: 15px; }
  .swatch { display: grid; place-items: center; width: 34px; height: 34px; }
  /* Paint the input itself: native WebKit radios can cover a swatch placed behind them. */
  .swatch input { -webkit-appearance: none; appearance: none; display: block; width: 34px; height: 34px; margin: 0; padding: 0; border: 4px solid #18191c; border-radius: 50%; background: var(--swatch); cursor: pointer; }
  .swatch input:checked { box-shadow: 0 0 0 2px var(--swatch); }
  .swatch input:focus-visible { outline: 2px solid var(--text); outline-offset: 5px; }
  .custom { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--sub); margin-top: 18px; }
  .custom input { width: 32px; height: 30px; padding: 2px; border: 1px solid var(--line); border-radius: 5px; background: #202125; cursor: pointer; }
  button.primary { width: 100%; justify-content: center; padding: 11px; }
  .privacy { text-align: center; margin-top: 18px; }
  .setup-error { color: #f1bbc2; font-size: 13px; }
</style>
