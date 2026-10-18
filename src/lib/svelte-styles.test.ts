import { expect, it } from "vitest";
import { createServer } from "vite";

it("serves scoped component CSS when styles load before their JavaScript", async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    for (const [component, rule] of [
      ["/src/lib/components/Workspace.svelte", "display: grid"],
      ["/src/lib/components/Titlebar.svelte", "height: var(--titlebar-height)"],
      ["/src/routes/+layout.svelte", "flex-direction: column"],
    ]) {
      const styleId = `${component}?svelte&type=style&lang.css`;
      const first = await server.environments.client.transformRequest(styleId);
      expect(first?.code).toContain(rule);
      expect(first?.code).toMatch(/\.svelte-[\w-]+/);
      expect(first?.code).not.toContain("<script");
      await server.environments.client.transformRequest(component);
      const repeated = await server.environments.client.transformRequest(styleId);
      expect(repeated?.code).toBe(first?.code);
    }
  } finally {
    await server.close();
  }
}, 60000);
