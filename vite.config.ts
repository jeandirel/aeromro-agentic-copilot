import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Serves the Vercel proxy function during `vite dev`, so the app talks to the same route as in production. */
function vercelApi(): Plugin {
  return {
    name: "aeromro-vercel-api",
    configureServer(server) {
      server.middlewares.use("/api/proxy", async (req, res) => {
        // Restore the full path stripped by connect's mount point.
        req.url = `/api/proxy${req.url ?? ""}`;
        const [{ runVercelFunction }, { default: handler }] = await Promise.all([
          import("./scripts/vercel-adapter.mjs"),
          import("./api/proxy.js"),
        ]);
        await runVercelFunction(handler, req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApi()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./ui", import.meta.url)) },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5173 },
});
