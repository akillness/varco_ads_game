import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8787";

test.describe("API contracts", () => {
  test("GET /api/health exposes cache stats", async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.cache).toBeDefined();
    expect(typeof json.cache.entries).toBe("number");
  });

  test("POST /api/varco/studio-pack returns reusable prompts and caches repeats", async ({ request }) => {
    const payload = {
      brief: "Neon sponsor arena for creator-made hero collectibles",
      heroId: "sounder",
    };

    const first = await request.post(`${API}/api/varco/studio-pack`, { data: payload });
    expect(first.ok()).toBeTruthy();
    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    expect(firstJson.studioPack.campaign.headline).toContain("Sound Crafter");
    expect(firstJson.studioPack.sounds.bgm).toContain("Neon sponsor arena");
    expect(firstJson.studioPack.assets.enemy).toContain("rogue ad-bot");
    expect(firstJson.studioPack.cache_hit).toBe(false);

    const second = await request.post(`${API}/api/varco/studio-pack`, { data: payload });
    expect(second.ok()).toBeTruthy();
    const secondJson = await second.json();
    expect(secondJson.ok).toBe(true);
    expect(secondJson.studioPack.cache_hit).toBe(true);
  });

  test("POST /api/varco/text2sound reuses cache for the same prompt", async ({ request }) => {
    const payload = { prompt: "arena pickup stinger", version: "v1", num_sample: 1 };
    const first = await request.post(`${API}/api/varco/text2sound`, { data: payload });
    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    expect(firstJson.result.cache_hit).toBe(false);

    const second = await request.post(`${API}/api/varco/text2sound`, { data: payload });
    const secondJson = await second.json();
    expect(secondJson.ok).toBe(true);
    expect(secondJson.result.cache_hit).toBe(true);
  });
});

test.describe("Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test("renders gameplay HUD and promo director", async ({ page }) => {
    await expect(page.locator(".brand-title")).toContainText("VARCO AGENT SAGA");
    await expect(page.getByTestId("mission-panel")).toBeVisible();
    await expect(page.getByTestId("ability-panel")).toBeVisible();
    await expect(page.getByTestId("director-panel")).toBeVisible();
    await expect(page.getByTestId("studio-pack-panel")).toBeVisible();
    await expect(page.getByTestId("studio-kpi-strip")).toContainText("cache hits");
    await expect(page.getByTestId("arena-status-strip")).toContainText("Mission:");
  });

  test("generates a studio pack and injects prompts into the editor flow", async ({ page }) => {
    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    await expect(studioPanel).toContainText("calls saved");
    await expect(studioPanel).toContainText("Production Queue");
    await studioPanel.getByRole("button", { name: "bgm", exact: true }).click();

    const soundPrompt = page.locator(".sound-editor .prompt-input");
    await expect(soundPrompt).toHaveValue(/Retro arcade launch/);
  });

  test("real input can collect a core after director setup", async ({ page }) => {
    await page.getByRole("button", { name: "Start" }).click();
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          player: { x: 2, y: 2 },
          orb: { x: 3, y: 2 },
          enemies: [],
          powerup: null,
          combo: 0,
          totalOrbs: 0,
          score: 0,
          abilityCharge: 0,
        },
      });
    });

    await page.keyboard.down("ArrowRight");
    await expect(page.locator(".stat-val.score")).toHaveText("10");
    await page.keyboard.up("ArrowRight");
    await expect(page.getByTestId("director-panel")).toContainText(/Launch Window|Broadcast Rush|Overdrive|Final Push/);
  });

  test("sound editor generates and applies a reusable cue", async ({ page }) => {
    const soundPrompt = page.locator(".sound-editor .prompt-input");
    await soundPrompt.fill("victory sting for sponsor-ready arcade arena");
    await page.locator(".sound-editor .regenerate-btn").click();

    await expect(page.getByTestId("sound-generation-result")).toBeVisible();
    await page.getByTestId("sound-generation-result").getByRole("button", { name: /Apply/ }).click();
    await expect(page.getByTestId("sound-version-history")).toContainText("적용됨");
  });

  test("asset editor converts and applies a 3D variant", async ({ page }) => {
    await page.getByRole("button", { name: /에셋/ }).click();

    const directionInput = page.locator(".asset-editor .prompt-input");
    await directionInput.fill("hero orb with premium holographic sponsor finish");
    await page.locator(".asset-editor .regenerate-btn").click();

    await expect(page.getByTestId("asset-generation-result")).toBeVisible();
    await page.getByTestId("asset-generation-result").getByRole("button", { name: /Apply/ }).click();
    await expect(page.getByTestId("asset-version-history")).toContainText("적용됨");
    await expect(page.getByTestId("arena-status-strip")).toContainText("Assets live: 1/3");
  });

  test("debug bridge can drive game over and reset deterministically", async ({ page }) => {
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: { running: true, timer: 1, score: 77, combo: 4, maxCombo: 4 }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-overlay")).toBeVisible();
    await expect(page.getByTestId("game-over-overlay")).toContainText("Score: 77");

    await page.getByRole("button", { name: "Play Again" }).click();
    await expect(page.getByTestId("game-over-overlay")).toHaveCount(0);
    await expect(page.locator(".stat-val.score")).toHaveText("0");
  });
});
