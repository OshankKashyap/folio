<script lang="ts">
  import "./app.css";
  import Titlebar from "$lib/components/Titlebar.svelte";
  let { children } = $props();
</script>

<div class="app-shell">
  <Titlebar />
  {@render children()}
</div>

<style>
  .app-shell { display: flex; flex-direction: column; min-height: 100dvh; }
</style>
