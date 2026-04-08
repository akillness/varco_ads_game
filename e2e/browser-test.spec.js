import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8787";

function createStudioPackFixture(brief, { heroName = "Sound Crafter", suffix = "launch" } = {}) {
  return {
    ok: true,
    studioPack: {
      packId: `pack-${suffix}`,
      heroName,
      cache_hit: false,
      campaign: {
        headline: `${brief} headline`,
        tagline: `${brief} tagline`
      },
      sounds: {
        bgm: `${brief} bgm prompt`,
        orb: `${brief} orb prompt`,
        hit: `${brief} hit prompt`,
        win: `${brief} win prompt`,
        lose: `${brief} lose prompt`
      },
      assets: {
        orb: `${brief} orb direction`,
        enemy: `${brief} enemy direction`,
        player: `${brief} player direction`
      },
      savings: {
        estimatedCallsSaved: 2,
        estimatedCallsWithPack: 3,
        estimatedCallsWithoutPack: 5
      },
      productionQueue: [
        { id: `queue-sound-${suffix}`, label: "Queue sound", lane: "sound", key: "bgm", prompt: `${brief} bgm prompt` },
        { id: `queue-copy-${suffix}`, label: "Queue copy", lane: "social", key: "launch", prompt: `${brief} launch copy` }
      ],
      marketingAngles: [
        {
          id: `launch-${suffix}`,
          channel: "launch",
          label: `Launch ${suffix}`,
          copy: `${brief} launch copy`,
          cta: `${brief} CTA`
        }
      ]
    }
  };
}

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

  test("generates a studio pack and routes prompt chips into the matching editor slot", async ({ page }) => {
    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    await expect(studioPanel).toContainText("calls saved");
    await expect(studioPanel).toContainText("Production Queue");

    await studioPanel.getByRole("button", { name: "win", exact: true }).click();
    await expect(page.getByTestId("sound-tab-win")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/Retro arcade launch/);

    await studioPanel.getByRole("button", { name: "enemy", exact: true }).click();
    await expect(page.getByRole("button", { name: /^🧊 에셋$/ })).toHaveClass(/active/);
    await expect(page.getByTestId("asset-card-enemy")).toHaveClass(/selected/);
    await expect(page.locator(".asset-editor .prompt-input")).toHaveValue(/rogue ad-bot/i);
  });

  test("studio pack ignores stale success after the brief changes and a newer pack is generated", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await firstPackPending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", { suffix: "retro" }))
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Midnight remix pack for creator duels", { suffix: "midnight" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.locator("button.bet-btn").first();

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(generateButton).toHaveText("Building Pack...");

    await briefInput.fill("Midnight remix pack for creator duels");
    await expect(generateButton).toHaveText("Generate Studio Pack");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(page.locator(".studio-pack-card")).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Midnight remix pack for creator duels launch copy");

    releaseFirstPack();
    await page.waitForTimeout(50);

    await expect(page.locator(".studio-pack-card")).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Retro arcade launch for creator heroes headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Midnight remix pack for creator duels launch copy");
  });

  test("marketing copy card confirms clipboard copies and clears feedback when switching channels", async ({ page }) => {
    await page.evaluate(() => {
      window.__copiedText = "";
      window.__clipboardResolves = [];
      window.__resolveClipboardWrite = () => {
        const resolve = window.__clipboardResolves.shift();
        if (resolve) resolve();
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text) => new Promise((resolve) => {
            window.__copiedText = text;
            window.__clipboardResolves.push(resolve);
          }),
          readText: async () => window.__copiedText,
        },
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");

    await copyButton.click();
    const copiedText = await page.evaluate(() => window.__copiedText);
    expect(copiedText).toContain("CTA:");
    expect(copiedText).toContain("VARCO arena");

    await studioPanel.getByRole("button", { name: "Instagram Reel", exact: true }).click();
    await expect(copyCard).toContainText("Instagram Reel");
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyButton).toHaveText("Copy launch copy");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await page.waitForTimeout(50);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyButton).toHaveText("Copy launch copy");

    await copyButton.click();
    await page.evaluate(() => window.__resolveClipboardWrite());
    await expect(copyButton).toHaveText("Copied launch copy");
    await expect(page.getByTestId("studio-copy-feedback")).toContainText(/instagram reel copy copied\./i);
  });

  test("marketing copy feedback stays cleared when a new pack is generated mid-copy", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardResolves = [];
      window.__resolveClipboardWrite = () => {
        const resolve = window.__clipboardResolves.shift();
        if (resolve) resolve();
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text) => new Promise((resolve) => {
            window.__clipboardResolves.push(resolve);
          }),
        },
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.locator("button.bet-btn").first();

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-copy-card")).toBeVisible();

    await page.getByTestId("studio-copy-button").click();
    await briefInput.fill("Midnight remix pack for creator duels");
    await generateButton.click();
    await expect(page.getByTestId("studio-copy-card")).toContainText(/Midnight remix pack|creator duels/i);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);

    await page.evaluate(() => window.__resolveClipboardWrite());
    await page.waitForTimeout(50);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy launch copy");
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

    await expect(page.getByTestId("sound-generation-status")).toContainText("Sound ready");
    await expect(page.getByTestId("sound-generation-result")).toBeVisible();
    await page.getByTestId("sound-generation-result").getByRole("button", { name: /Apply/ }).click();
    await expect(page.getByTestId("sound-version-history")).toContainText("적용됨");
  });

  test("sound editor surfaces upstream failure details without creating a stale version", async ({ page }) => {
    await page.route("**/api/varco/text2sound", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Upstream sound render timed out",
          data: {
            requestId: "mock-sound-fail"
          }
        })
      });
    });

    await page.locator(".sound-editor .prompt-input").fill("late-night sponsor sting");
    await page.locator(".sound-editor .regenerate-btn").click();

    const status = page.getByTestId("sound-generation-status");
    await expect(status).toContainText("Sound generation failed");
    await expect(status).toContainText("Upstream sound render timed out");
    await expect(status).toContainText("mock-sound-fail");
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);
  });

  test("sound editor ignores stale success after switching tabs mid-generation", async ({ page }) => {
    let releaseGeneration;
    const generationRelease = new Promise((resolve) => {
      releaseGeneration = resolve;
    });

    await page.route("**/api/varco/text2sound", async (route) => {
      await generationRelease;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            version_id: "mock-sound-stale-success",
            data: [
              {
                audio: "https://cdn.example.com/mock-sound-stale-success.mp3"
              }
            ]
          }
        })
      });
    });

    await page.locator(".sound-editor .prompt-input").fill("slow-burn sponsor anthem");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("⏳ Generating...");

    await page.getByTestId("sound-tab-win").click();
    await expect(page.getByTestId("sound-tab-win")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("▶ 재생성");
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);

    releaseGeneration();
    await page.waitForTimeout(100);

    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);

    await page.getByTestId("sound-tab-bgm").click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);
  });

  test("sound editor ignores stale failures after switching tabs mid-generation", async ({ page }) => {
    let releaseGeneration;
    const generationRelease = new Promise((resolve) => {
      releaseGeneration = resolve;
    });

    await page.route("**/api/varco/text2sound", async (route) => {
      await generationRelease;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Queued render failed after tab switch",
          data: {
            requestId: "mock-sound-stale-fail"
          }
        })
      });
    });

    await page.locator(".sound-editor .prompt-input").fill("glitch sponsor outro");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("⏳ Generating...");

    await page.getByTestId("sound-tab-win").click();
    await expect(page.getByTestId("sound-tab-win")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("▶ 재생성");
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);

    releaseGeneration();
    await page.waitForTimeout(100);

    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);

    await page.getByTestId("sound-tab-bgm").click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);
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

  test("asset editor shows accepted and ready states for requestId-based conversions", async ({ page }) => {
    let pollCount = 0;

    await page.route("**/api/varco/image-to-3d", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestId: "mock-request-123",
            accepted: true,
            message: "mock accepted"
          }
        })
      });
    });

    await page.route("**/api/varco/image-to-3d/result/mock-request-123", async (route) => {
      pollCount += 1;
      if (pollCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: pollCount === 1
            ? {
                requestId: "mock-request-123",
                status: "processing"
              }
            : {
                requestId: "mock-request-123",
                status: "succeeded",
                model_url: "https://modelviewer.dev/shared-assets/models/Astronaut.glb"
              }
        })
      });
    });

    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();

    const status = page.getByTestId("asset-conversion-status");
    await expect(status).toContainText("Request accepted");
    await expect(status).toContainText("mock-request-123");
    await expect(status).toContainText("Waiting for 3D preview");
    await expect(status).toContainText("Preview ready");
    await expect(page.getByTestId("asset-generation-result")).toBeVisible();
  });

  test("asset editor preserves request id when requestId-based poll requests fail", async ({ page }) => {
    await page.route("**/api/varco/image-to-3d", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestId: "mock-request-fail",
            accepted: true,
            message: "mock accepted"
          }
        })
      });
    });

    await page.route("**/api/varco/image-to-3d/result/mock-request-fail", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Upstream render timed out"
        })
      });
    });

    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();

    const status = page.getByTestId("asset-conversion-status");
    await expect(status).toContainText("Conversion failed");
    await expect(status).toContainText("Upstream render timed out");
    await expect(status).toContainText("mock-request-fail");
    await expect(page.getByTestId("asset-generation-result")).toHaveCount(0);
  });

  test("asset editor surfaces initial proxy failures without polling and preserves nested request ids", async ({ page }) => {
    let pollTriggered = false;

    await page.route("**/api/varco/image-to-3d", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Upstream image-to-3d render timed out",
          data: {
            requestId: "mock-request-initial-fail"
          }
        })
      });
    });

    await page.route("**/api/varco/image-to-3d/result/**", async (route) => {
      pollTriggered = true;
      await route.abort();
    });

    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();

    const status = page.getByTestId("asset-conversion-status");
    await expect(status).toContainText("Conversion failed");
    await expect(status).toContainText("Upstream image-to-3d render timed out");
    await expect(status).toContainText("mock-request-initial-fail");
    await expect(page.getByTestId("asset-generation-result")).toHaveCount(0);
    expect(pollTriggered).toBe(false);
  });

  test("asset editor ignores stale success after switching asset cards mid-conversion", async ({ page }) => {
    let releasePoll;
    const pollRelease = new Promise((resolve) => {
      releasePoll = resolve;
    });

    await page.route("**/api/varco/image-to-3d", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestId: "mock-request-stale-success",
            accepted: true,
            message: "mock accepted"
          }
        })
      });
    });

    await page.route("**/api/varco/image-to-3d/result/mock-request-stale-success", async (route) => {
      await pollRelease;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestId: "mock-request-stale-success",
            status: "succeeded",
            model_url: "https://modelviewer.dev/shared-assets/models/Astronaut.glb"
          }
        })
      });
    });

    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-conversion-status")).toContainText("mock-request-stale-success");

    await page.getByTestId("asset-card-enemy").click();
    await expect(page.getByTestId("asset-card-enemy")).toHaveClass(/selected/);
    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.locator(".asset-editor .regenerate-btn")).toHaveText("▶ 3D 변환");

    releasePoll();
    await page.waitForTimeout(100);

    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.getByTestId("asset-generation-result")).toHaveCount(0);
  });

  test("asset editor ignores stale failures after switching asset cards mid-conversion", async ({ page }) => {
    let releasePoll;
    const pollRelease = new Promise((resolve) => {
      releasePoll = resolve;
    });

    await page.route("**/api/varco/image-to-3d", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            requestId: "mock-request-stale-fail",
            accepted: true,
            message: "mock accepted"
          }
        })
      });
    });

    await page.route("**/api/varco/image-to-3d/result/mock-request-stale-fail", async (route) => {
      await pollRelease;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Late failure should stay hidden"
        })
      });
    });

    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-conversion-status")).toContainText("mock-request-stale-fail");

    await page.getByTestId("asset-card-enemy").click();
    await expect(page.getByTestId("asset-card-enemy")).toHaveClass(/selected/);
    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.locator(".asset-editor .regenerate-btn")).toHaveText("▶ 3D 변환");

    releasePoll();
    await page.waitForTimeout(100);

    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.getByTestId("asset-generation-result")).toHaveCount(0);
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

  test("leaderboard sorts tied scores by combo and recency", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        {
          hero: "3D Modeler",
          score: 120,
          combo: 3,
          date: "2026-04-01",
          createdAt: "2026-04-01T10:00:00.000Z"
        },
        {
          hero: "Sound Crafter",
          score: 120,
          combo: 5,
          date: "2026-04-02",
          createdAt: "2026-04-02T10:00:00.000Z"
        },
        {
          hero: "SyncFace Weaver",
          score: 120,
          combo: 5,
          date: "2026-04-03",
          createdAt: "2026-04-03T10:00:00.000Z"
        }
      ]));
    });
    await page.reload();

    const rows = page.getByTestId("high-score-item");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("#1");
    await expect(rows.nth(0)).toContainText("SyncFace Weaver");
    await expect(rows.nth(0)).toContainText("Combo 5 · 2026-04-03");
    await expect(rows.nth(1)).toContainText("Sound Crafter");
    await expect(rows.nth(2)).toContainText("3D Modeler");
  });

  test("leaderboard keeps duplicate legacy rows visible after normalization", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "Sound Crafter", score: 88, combo: 2, date: "2026-04-01" },
        { hero: "Sound Crafter", score: 88, combo: 2, date: "2026-04-01" },
        { hero: "3D Modeler", score: 70, combo: 1, date: "2026-04-02" }
      ]));
    });
    await page.reload();

    const rows = page.getByTestId("high-score-item");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Sound Crafter");
    await expect(rows.nth(1)).toContainText("Sound Crafter");
    await expect(rows.nth(2)).toContainText("3D Modeler");
  });
});
