import { test, expect } from "@playwright/test";

const WEB = "http://localhost:5173";

function waitForApiResponse(page, urlPart) {
  return page.waitForResponse((response) => response.url().includes(urlPart) && response.ok());
}

function getPlayerTileIndex(page) {
  return page.locator(".arena-3d .tile").evaluateAll((tiles) => tiles.findIndex((tile) => tile.classList.contains("has-player")));
}

function waitForPlayerTileIndexChange(page, previousIndex) {
  return page.waitForFunction(
    (index) => Array.from(document.querySelectorAll(".arena-3d .tile")).findIndex((tile) => tile.classList.contains("has-player")) !== index,
    previousIndex
  );
}

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
    const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2XMcAAAAASUVORK5CYII=";
    const res = await request.post(`${WEB}/api/varco/image-to-3d`, {
      data: { image: pngDataUrl },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.mocked).toBe(true);
    expect(json.result.requestId).toMatch(/^mock-image3d-/);

    const resultRes = await request.get(`${WEB}/api/varco/image-to-3d/result/${json.result.requestId}`);
    expect(resultRes.ok()).toBeTruthy();
    const resultJson = await resultRes.json();
    expect(resultJson.ok).toBe(true);
    expect(resultJson.result.model_url).toBeDefined();
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

    // 1. Verify page loaded and live match polling hydrated the betting state.
    await expect(page.locator(".brand-title")).toContainText("VARCO AGENT SAGA");
    const initialMatchStateResponse = await waitForApiResponse(page, "/api/match/state");
    const initialMatchStateJson = await initialMatchStateResponse.json();
    expect(initialMatchStateJson.ok).toBe(true);
    await expect(page.getByTestId("bet-status-chip")).toContainText("LIVE WINDOW");

    // 2. Select hero.
    const soundBtn = page.locator(".hero-btn").filter({ hasText: "Sound Crafter" });
    await soundBtn.click();
    await expect(soundBtn).toHaveClass(/active/);
    await expect(page.locator(".hp-bar-text")).toContainText("5 / 5");

    // 3. Place a bet with the current betting controls.
    await page.getByTestId("bet-name-input").fill("docker_e2e");
    await page.getByTestId("bet-amount-input").fill("250");
    await page.getByTestId("bet-submit-button").click();
    await expect(page.getByTestId("bet-feedback")).toContainText("docker_e2e backed Player Win for 250.");

    // 4. Start the game.
    await page.locator(".ctrl-btn").filter({ hasText: "Start" }).click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Pause" })).toBeVisible();

    // 5. Move with keyboard.
    let playerTileIndex = await getPlayerTileIndex(page);
    let playerMove = waitForPlayerTileIndexChange(page, playerTileIndex);
    await page.keyboard.down("d");
    await playerMove;
    await page.keyboard.up("d");
    playerTileIndex = await getPlayerTileIndex(page);
    playerMove = waitForPlayerTileIndexChange(page, playerTileIndex);
    await page.keyboard.down("s");
    await playerMove;
    await page.keyboard.up("s");

    // 6. Pause.
    await page.locator(".ctrl-btn").filter({ hasText: "Pause" }).click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Start" })).toBeVisible();

    // 7. Generate a sound cue through the current sound editor contract.
    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.getByTestId("sound-generation-status")).toContainText(/Generating sound|Sound ready/);
    await expect(page.getByTestId("sound-generation-result")).toBeVisible({ timeout: 5000 });

    // 8. Generate a 3D asset through the current asset editor contract.
    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-conversion-status")).toContainText(/Converting to 3D|Preview ready|Request accepted/);
    await expect(page.getByTestId("asset-generation-result")).toBeVisible({ timeout: 5000 });

    // 9. Verify spectator stats and agent logs loaded via polling.
    const [matchStateResponse, agentLogsResponse] = await Promise.all([
      waitForApiResponse(page, "/api/match/state"),
      waitForApiResponse(page, "/api/agent/logs")
    ]);
    const matchStateJson = await matchStateResponse.json();
    expect(matchStateJson.ok).toBe(true);
    expect(matchStateJson.match.spectators).toBeGreaterThanOrEqual(0);
    const agentLogsJson = await agentLogsResponse.json();
    expect(agentLogsJson.ok).toBe(true);
    const watchBox = page.locator(".watch-box");
    await expect(watchBox.locator(".watch-live")).toContainText(/\d+/);

    // 10. Verify server logs populated.
    const serverLogItems = page.locator(".server-log li");
    await expect(serverLogItems).toHaveCount(agentLogsJson.logs.length);
    expect(agentLogsJson.logs.length).toBeGreaterThan(0);

    // 11. Reset match.
    await page.locator(".ctrl-btn").filter({ hasText: "Reset" }).click();
    await expect(page.locator(".stat-val.score")).toContainText("0");
    await expect(page.locator(".hp-bar-text")).toContainText("5 / 5");
  });
});
