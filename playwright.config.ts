import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. They need a running app wired to a Supabase database that
 * has the migrations applied and `pnpm db:seed` data loaded (see README → Testing).
 *
 *   pnpm test:e2e                         # builds, starts on :3100, runs everything
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e   # use an app you already started
 *   CHROME_PATH=/usr/bin/google-chrome pnpm test:e2e   # use an installed Chrome
 *
 * Tests change attendance-window settings and create "E2E …" records, so they
 * refuse to run against a non-local Supabase unless E2E_ALLOW_REMOTE=1.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // tests share one database and its settings
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "mobile-360",
      testMatch: /(student|mobile-qa|pwa)\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2,
        launchOptions,
      },
    },
    {
      name: "desktop",
      testMatch: /staff\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, launchOptions },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: true,
        timeout: 300_000,
      },
});
