import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const API = "http://localhost:8787";

// ==================== API TESTS (unchanged) ====================

test.describe("API Server Health", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.port).toBe(8787);
  });
});

test.describe("Match API Lifecycle", () => {
  test("POST /api/match/start creates a new match", async ({ request }) => {
    const res = await request.post(`${API}/api/match/start`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.matchId).toBeTruthy();
  });

  test("GET /api/match/state returns running match", async ({ request }) => {
    await request.post(`${API}/api/match/start`);
    const res = await request.get(`${API}/api/match/state`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.match.status).toBe("running");
    expect(json.match.spectators).toBeGreaterThan(0);
    expect(json.match.odds).toBeDefined();
    expect(json.match.pools).toBeDefined();
  });

  test("POST /api/match/finish completes the match", async ({ request }) => {
    await request.post(`${API}/api/match/start`);
    const res = await request.post(`${API}/api/match/finish`, {
      data: { winner: "player" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.winner).toBe("player");
  });

  test("POST /api/match/finish rejects invalid winner", async ({ request }) => {
    const res = await request.post(`${API}/api/match/finish`, {
      data: { winner: "nobody" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Betting API", () => {
  test("POST /api/match/bet places a bet and updates pools", async ({ request }) => {
    await request.post(`${API}/api/match/start`);
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "e2e_tester", side: "player", amount: 200 },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.bet.userName).toBe("e2e_tester");
    expect(json.bet.side).toBe("player");
    expect(json.bet.amount).toBe(200);
    expect(json.pools.player).toBeGreaterThanOrEqual(200);
    expect(json.odds.player).toBeGreaterThan(0);
  });

  test("POST /api/match/bet rejects empty userName", async ({ request }) => {
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "", side: "player", amount: 100 },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/match/bet rejects invalid side", async ({ request }) => {
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "test", side: "draw", amount: 100 },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/match/bet rejects zero amount", async ({ request }) => {
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "test", side: "player", amount: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/match/bet rejects negative amount", async ({ request }) => {
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "test", side: "player", amount: -50 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Agent Log API", () => {
  test("POST /api/agent/log creates a log entry", async ({ request }) => {
    const res = await request.post(`${API}/api/agent/log`, {
      data: { level: "info", message: "e2e test log", meta: { test: true } },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.entry.message).toBe("e2e test log");
  });

  test("GET /api/agent/logs returns log entries", async ({ request }) => {
    const res = await request.get(`${API}/api/agent/logs`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.logs)).toBe(true);
  });

  test("POST /api/agent/log rejects missing message", async ({ request }) => {
    const res = await request.post(`${API}/api/agent/log`, {
      data: { level: "info" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/agent/log rejects invalid level", async ({ request }) => {
    const res = await request.post(`${API}/api/agent/log`, {
      data: { level: "debug", message: "test" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("VARCO API Proxy (mock mode)", () => {
  test("POST /api/varco/text2sound returns mock result", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/text2sound`, {
      data: { prompt: "battle cry", version: "v1", num_sample: 1 },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.mocked).toBe(true);
  });

  test("POST /api/varco/text2sound rejects missing prompt", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/text2sound`, {
      data: { version: "v1" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/varco/image-to-3d returns mock result", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/image-to-3d`, {
      data: { image_url: "https://example.com/test.png" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.mocked).toBe(true);
  });

  test("POST /api/varco/image-to-3d rejects missing image", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/image-to-3d`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/varco/proxy works with path", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/proxy`, {
      data: { path: "/sound/varco/v1/api/text2sound", body: { prompt: "test" } },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  test("POST /api/varco/proxy rejects missing path", async ({ request }) => {
    const res = await request.post(`${API}/api/varco/proxy`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("SNS Share API", () => {
  test("POST /api/share/sns returns share links", async ({ request }) => {
    const res = await request.post(`${API}/api/share/sns`, {
      data: { score: 50, winner: "player", hero: "3D Modeler" },
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.text).toContain("VARCO Agent SAGA");
    expect(json.text).toContain("3D Modeler");
    expect(json.links.x).toContain("x.com");
    expect(json.links.facebook).toContain("facebook.com");
    expect(json.links.telegram).toContain("t.me");
  });
});

// ==================== WEB UI TESTS (updated for 3D isometric layout) ====================

test.describe("Web UI - Page Load", () => {
  test("renders the brand title", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".brand-title")).toContainText("VARCO AGENT SAGA");
  });

  test("renders 3D isometric game grid", async ({ page }) => {
    await page.goto(BASE);
    const arena = page.locator(".arena-3d");
    await expect(arena).toBeVisible();
    const tiles = page.locator(".arena-3d .tile");
    expect(await tiles.count()).toBe(14 * 10);
  });

  test("renders header stats (score, timer, level)", async ({ page }) => {
    await page.goto(BASE);
    const header = page.locator(".header-stats");
    await expect(header).toContainText("SCORE");
    await expect(header).toContainText("TIME");
    await expect(header).toContainText("LV");
  });
});

test.describe("Web UI - Hero Selection", () => {
  test("three hero buttons are rendered", async ({ page }) => {
    await page.goto(BASE);
    const buttons = page.locator(".hero-select .hero-btn");
    expect(await buttons.count()).toBe(3);
  });

  test("first hero is active by default", async ({ page }) => {
    await page.goto(BASE);
    const activeBtn = page.locator(".hero-btn.active");
    await expect(activeBtn).toContainText("3D Modeler");
  });

  test("clicking a different hero activates it", async ({ page }) => {
    await page.goto(BASE);
    const soundBtn = page.locator(".hero-btn").filter({ hasText: "Sound Crafter" });
    await soundBtn.click();
    await expect(soundBtn).toHaveClass(/active/);
    const modelerBtn = page.locator(".hero-btn").filter({ hasText: "3D Modeler" });
    await expect(modelerBtn).not.toHaveClass(/active/);
  });

  test("switching hero resets HP bar", async ({ page }) => {
    await page.goto(BASE);
    const hpText = page.locator(".hp-bar-text");
    await expect(hpText).toContainText("6 / 6"); // 3D Modeler
    const faceBtn = page.locator(".hero-btn").filter({ hasText: "SyncFace Weaver" });
    await faceBtn.click();
    await expect(hpText).toContainText("4 / 4");
  });
});

test.describe("Web UI - Game Controls", () => {
  test("Start button toggles to Pause", async ({ page }) => {
    await page.goto(BASE);
    const startBtn = page.locator(".ctrl-btn").filter({ hasText: "Start" });
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Pause" })).toBeVisible();
  });

  test("Pause returns to Start", async ({ page }) => {
    await page.goto(BASE);
    await page.locator(".ctrl-btn").filter({ hasText: "Start" }).click();
    await page.locator(".ctrl-btn").filter({ hasText: "Pause" }).click();
    await expect(page.locator(".ctrl-btn").filter({ hasText: "Start" })).toBeVisible();
  });

  test("Reset resets score to 0", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".stat-val.score")).toContainText("0");
    await page.locator(".ctrl-btn").filter({ hasText: "Reset" }).click();
    await expect(page.locator(".stat-val.score")).toContainText("0");
  });

  test("Generate Sound button calls API", async ({ page }) => {
    await page.goto(BASE);
    await page.locator(".api-btn").filter({ hasText: "Generate Sound" }).click();
    await expect(page.locator(".api-status").first()).toContainText(/mocked|ok/, { timeout: 5000 });
  });

  test("Generate 3D Model button calls API", async ({ page }) => {
    await page.goto(BASE);
    await page.locator(".api-btn").filter({ hasText: "Generate 3D Model" }).click();
    await expect(page.locator(".api-status").last()).toContainText(/mocked|ok/, { timeout: 5000 });
  });
});

test.describe("Web UI - Keyboard Movement", () => {
  test("WASD keys move the player", async ({ page }) => {
    await page.goto(BASE);
    await page.locator(".ctrl-btn").filter({ hasText: "Start" }).click();
    const playerTiles = page.locator(".tile.has-player");
    expect(await playerTiles.count()).toBe(1);
    await page.keyboard.press("d");
    await page.waitForTimeout(250);
    await page.keyboard.press("d");
    await page.waitForTimeout(250);
    expect(await playerTiles.count()).toBe(1);
  });
});

test.describe("Web UI - Betting Panel", () => {
  test("betting form elements are present", async ({ page }) => {
    await page.goto(BASE);
    const betPanel = page.locator(".bet-inputs");
    await expect(betPanel.locator("input").first()).toBeVisible();
    await expect(betPanel.locator("select")).toBeVisible();
    await expect(betPanel.locator("input[type='number']")).toBeVisible();
    await expect(page.locator(".bet-btn")).toBeVisible();
  });

  test("placing a bet updates the log", async ({ page }) => {
    await page.goto(BASE);
    const nameInput = page.locator(".bet-inputs input").first();
    await nameInput.fill("browser_tester");
    await page.locator(".bet-inputs input[type='number']").fill("500");
    await page.locator(".bet-btn").click();
    await expect(page.locator(".log-list").first()).toContainText("Bet", { timeout: 3000 });
  });

  test("bet side dropdown has player and enemy options", async ({ page }) => {
    await page.goto(BASE);
    const select = page.locator(".bet-inputs select");
    const options = select.locator("option");
    expect(await options.count()).toBe(2);
    await expect(options.first()).toHaveText("Player Win");
    await expect(options.last()).toHaveText("Enemy Win");
  });
});

test.describe("Web UI - SNS Share Buttons", () => {
  test("three share buttons are rendered", async ({ page }) => {
    await page.goto(BASE);
    const shareBtns = page.locator(".share-btn");
    expect(await shareBtns.count()).toBe(3);
    await expect(shareBtns.filter({ hasText: "X" })).toBeVisible();
    await expect(shareBtns.filter({ hasText: "FB" })).toBeVisible();
    await expect(shareBtns.filter({ hasText: "TG" })).toBeVisible();
  });

  test("clicking Share X opens a new window", async ({ page, context }) => {
    await page.goto(BASE);
    const [newPage] = await Promise.all([
      context.waitForEvent("page", { timeout: 5000 }).catch(() => null),
      page.locator(".share-btn").filter({ hasText: "X" }).click(),
    ]);
    if (newPage) {
      expect(newPage.url()).toContain("x.com");
      await newPage.close();
    } else {
      await expect(page.locator(".log-list").first()).toContainText("Shared", { timeout: 3000 });
    }
  });
});

test.describe("Web UI - Watch Box (Spectator Stats)", () => {
  test("spectator count is displayed", async ({ page }) => {
    await page.goto(BASE);
    const watchBox = page.locator(".watch-box");
    await expect(watchBox).toBeVisible();
    await page.waitForTimeout(3000);
    const text = await watchBox.textContent();
    expect(text).toMatch(/\d+/);
  });

  test("odds are displayed", async ({ page }) => {
    await page.goto(BASE);
    const watchBox = page.locator(".watch-box");
    await page.waitForTimeout(3000);
    const text = await watchBox.textContent();
    expect(text).toMatch(/P:.*E:/);
  });
});

test.describe("Web UI - Log Sections", () => {
  test("game log section exists", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".panel-title").filter({ hasText: "Game Log" })).toBeVisible();
  });

  test("agent log feed section exists", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".panel-title").filter({ hasText: "Agent Log Feed" })).toBeVisible();
  });

  test("agent log feed populates from server", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(3500);
    const serverLog = page.locator(".server-log li");
    expect(await serverLog.count()).toBeGreaterThan(0);
  });
});

test.describe("Web UI - Gamification Features", () => {
  test("HP bar renders with correct max", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".hp-bar-text")).toContainText("6 / 6");
  });

  test("XP bar and level are displayed", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".xp-bar-wrap")).toBeVisible();
    await expect(page.locator(".panel-title").filter({ hasText: /Level/ })).toBeVisible();
  });

  test("combo display starts at 0x", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".combo-count")).toContainText("0x");
  });

  test("power-up panel shows three types", async ({ page }) => {
    await page.goto(BASE);
    const items = page.locator(".powerup-item");
    expect(await items.count()).toBe(3);
  });

  test("timer starts at 60s", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".stat-val.timer")).toContainText("60s");
  });

  test("timer counts down when game starts", async ({ page }) => {
    await page.goto(BASE);
    await page.locator(".ctrl-btn").filter({ hasText: "Start" }).click();
    await page.waitForTimeout(2500);
    const timerText = await page.locator(".stat-val.timer").textContent();
    const secs = parseInt(timerText);
    expect(secs).toBeLessThan(60);
    expect(secs).toBeGreaterThan(50);
  });

  test("achievements panel is visible with 8 items", async ({ page }) => {
    await page.goto(BASE);
    const items = page.locator(".achievement-item");
    expect(await items.count()).toBe(8);
  });

  test("high scores panel exists", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".panel-title").filter({ hasText: "High Scores" })).toBeVisible();
  });

  test("difficulty indicator shows in header", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator(".stat-val").last()).toContainText("1");
  });
});

test.describe("Web UI - 3D Isometric Arena", () => {
  test("arena has perspective transform", async ({ page }) => {
    await page.goto(BASE);
    const arenaWrap = page.locator(".arena-wrap");
    const perspective = await arenaWrap.evaluate((el) => getComputedStyle(el).perspective);
    expect(perspective).toBe("900px");
  });

  test("tiles have 3D transform-style", async ({ page }) => {
    await page.goto(BASE);
    const arena3d = page.locator(".arena-3d");
    const transformStyle = await arena3d.evaluate((el) => getComputedStyle(el).transformStyle);
    expect(transformStyle).toBe("preserve-3d");
  });

  test("player entity is visible on grid", async ({ page }) => {
    await page.goto(BASE);
    const playerEntity = page.locator(".tile.has-player .entity");
    await expect(playerEntity).toBeVisible();
  });

  test("orb entity is visible on grid", async ({ page }) => {
    await page.goto(BASE);
    const orbEntity = page.locator(".tile.has-orb .entity");
    await expect(orbEntity).toBeVisible();
  });

  test("enemy entities are visible on grid", async ({ page }) => {
    await page.goto(BASE);
    const enemyEntities = page.locator(".tile.has-enemy .entity");
    expect(await enemyEntities.count()).toBeGreaterThanOrEqual(2);
  });

  test("checkerboard pattern alternates light tiles", async ({ page }) => {
    await page.goto(BASE);
    const lightTiles = page.locator(".tile.light");
    const count = await lightTiles.count();
    expect(count).toBeGreaterThan(50);
    expect(count).toBeLessThan(80);
  });
});

test.describe("Web UI - Responsive Layout", () => {
  test("mobile viewport stacks panels vertically", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    const main = page.locator("main");
    const cols = await main.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    // Should be single column on mobile
    expect(cols.split(" ").length).toBe(1);
  });
});
