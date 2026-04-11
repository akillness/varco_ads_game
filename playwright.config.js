import { defineConfig } from "@playwright/test";

const host = process.env.HOST || "127.0.0.1";
const webPort = Number(process.env.WEB_PORT || 4173);
const apiPort = Number(process.env.API_PORT || 4174);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: `http://${host}:${webPort}`,
    headless: true,
  },
  webServer: [
    {
      command: `PORT=${apiPort} npm -C server start`,
      url: `http://${host}:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `API_PORT=${apiPort} npm -C web run dev -- --host ${host} --port ${webPort}`,
      url: `http://${host}:${webPort}`,
      reuseExistingServer: false,
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
