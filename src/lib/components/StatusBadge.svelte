<script lang="ts">
  import type { Status } from "$lib/types";
  let { status }: { status: Status } = $props();
</script>

<span class="badge" class:progress={status === "In progress"} class:done={status === "Done"}>{status}</span>

<style>
  .badge { display: inline-flex; align-items: center; border-radius: 5px; padding: 2px 7px; font-size: 11px; line-height: 1.5; background: #303137; color: #b4b5bf; white-space: nowrap; }
  .progress { background: #303047; color: #c4bdf3; }
  .done { background: #233a32; color: #9bd0b7; }
</style>
