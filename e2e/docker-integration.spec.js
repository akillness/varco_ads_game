import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5173";

test.describe("Docker Integration - Nginx Proxy to API Server", () => {
  test("GET /api/health through nginx proxy", async ({ request }) => {
    const res = await request.get(`${WEB}/api/health`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.port).toBe(8787);
  });

  test("POST /api/match/start through nginx proxy", async ({ request }) => {
    const res = await request.post(`${WEB}/api/match/start`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.matchId).toBeTruthy();
  });

  test("POST /api/match/bet through nginx proxy", async ({ request }) => {
    await request.post(`${WEB}/api/match/start`);
    const res = await request.post(`${WEB}/api/match/bet`, {
      data: { userName: "docker_tester", side: "enemy", amount: 300 },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.bet.userName).toBe("docker_tester");
    expect(json.pools.enemy).toBeGreaterThanOrEqual(300);
  });

  test("POST /api/varco/text2sound through nginx proxy", async ({ request }) => {
    const res = await request.post(`${WEB}/api/varco/text2sound`, {
      data: { prompt: "docker test sound", version: "v1", num_sample: 1 },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.mocked).toBe(true);
  });

  test("POST /api/varco/image-to-3d through nginx proxy", async ({ request }) => {
    const res = await request.post(`${WEB}/api/varco/image-to-3d`, {
      data: { image_url: "https://example.com/docker-test.png" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.mocked).toBe(true);
    expect(json.result.data[0].model_url).toBeDefined();
  });

  test("POST /api/share/sns through nginx proxy", async ({ request }) => {
    const res = await request.post(`${WEB}/api/share/sns`, {
      data: { score: 100, winner: "player", hero: "Sound Crafter" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.links.x).toContain("x.com");
  });

  test("POST /api/agent/log through nginx proxy", async ({ request }) => {
    const res = await request.post(`${WEB}/api/agent/log`, {
      data: { level: "warn", message: "docker integration test" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.entry.level).toBe("warn");
  });

  test("GET /api/agent/logs through nginx proxy", async ({ request }) => {
    const res = await request.get(`${WEB}/api/agent/logs`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.logs)).toBe(true);
  });

  test("POST /api/match/finish through nginx proxy", async ({ request }) => {
    await request.post(`${WEB}/api/match/start`);
    const res = await request.post(`${WEB}/api/match/finish`, {
      data: { winner: "enemy" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.winner).toBe("enemy");
  });
});

test.describe("Docker Integration - Full User Flow via Browser", () => {
  test("complete game session through Docker", async ({ page }) => {
    await page.goto(WEB);

    // 1. Verify page loaded
    await expect(page.locator(".brand-title")).toContainText("VARCO AGENT SAGA");

    // 2. Select hero
    const soundBtn = page.locator(".hero-btn").filter({ hasText: "Sound Crafter" });
    await soundBtn.click();
    await expect(soundBtn).toHaveClass(/active/);
    await expect(page.locator(".hp-bar-text")).toContainText("5 / 5");

    // 3. Place a bet
    await page.locator(".bet-inputs input").first().fill("docker_e2e");
    await page.locator(".bet-inputs input[type='number']").fill("250");
    await page.locator(".bet-btn").click();
    await expect(page.locator(".log-list").first()).toContainText("Bet", { timeout: 3000 });

    // 4. Start the game
    await page.locator(".ctrl-btn").filter({ hasText: "Start" }).click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Pause" })).toBeVisible();

    // 5. Move with keyboard
    await page.keyboard.press("d");
    await page.waitForTimeout(200);
    await page.keyboard.press("s");
    await page.waitForTimeout(200);

    // 6. Pause
    await page.locator(".ctrl-btn").filter({ hasText: "Pause" }).click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Start" })).toBeVisible();

    // 7. Generate sound
    await page.locator(".api-btn").filter({ hasText: "Generate Sound" }).click();
    await expect(page.locator(".api-status").first()).toContainText(/mocked|ok/, { timeout: 5000 });

    // 8. Generate 3D model
    await page.locator(".api-btn").filter({ hasText: "Generate 3D Model" }).click();
    await expect(page.locator(".api-status").last()).toContainText(/mocked|ok/, { timeout: 5000 });

    // 9. Verify spectator stats loaded via polling
    await page.waitForTimeout(3000);
    const watchBox = page.locator(".watch-box");
    const watchText = await watchBox.textContent();
    expect(watchText).toMatch(/\d+/);

    // 10. Verify server logs populated
    const serverLogItems = page.locator(".server-log li");
    expect(await serverLogItems.count()).toBeGreaterThan(0);

    // 11. Reset match
    await page.locator(".ctrl-btn").filter({ hasText: "Reset" }).click();
    await expect(page.locator(".stat-val.score")).toContainText("0");
    await expect(page.locator(".hp-bar-text")).toContainText("5 / 5");
  });
});
