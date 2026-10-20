/**
 * Launches Chromium for the end-to-end checks.
 * - CHROMIUM_PATH: explicit executable (any Chromium/Chrome build).
 * - otherwise the browser installed by `npx playwright-core install chromium`.
 */
import { chromium } from "playwright-core";

export async function launch() {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({
    executablePath,
    headless: true,
    args: executablePath ? ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] : [],
  });
}
