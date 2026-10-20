import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./ui", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./ui/test/setup.ts"],
    include: ["ui/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
