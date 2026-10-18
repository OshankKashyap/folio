import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/** @returns {import("vite").Plugin} */
function ensureSvelteStyleSource() {
  /** @type {import("vite").ViteDevServer | undefined} */
  let server;
  return {
    name: "ensure-svelte-style-source",
    apply: "serve",
    enforce: "pre",
    configureServer(devServer) { server = devServer; },
    async load(id) {
      if (server && /\.svelte\?svelte&type=style/.test(id)) {
        // Populate Svelte's CSS metadata even when the stylesheet is requested first.
        await server.environments.client.transformRequest(id.split("?")[0]);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [ensureSvelteStyleSource(), sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
