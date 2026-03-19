import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
  },
  webServer: [
    {
      command: "npm -C server start",
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm -C web run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
