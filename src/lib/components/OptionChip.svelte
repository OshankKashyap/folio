<script lang="ts">
  import { optionColors } from "$lib/columns";
  import type { ColumnOption } from "$lib/types";
  let { option }: { option: ColumnOption } = $props();
</script>

<span class="option-chip" style:background={optionColors[option.color].background} style:color={optionColors[option.color].text}>{option.emoji ? `${option.emoji} ` : ""}{option.label}</span>

<style>
  .option-chip { display: inline-flex; align-items: center; border-radius: 5px; padding: 2px 7px; font-size: 12px; font-weight: 400; line-height: 1.5; white-space: nowrap; }
</style>
