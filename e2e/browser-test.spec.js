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

  test("POST /api/match/bet rejects invalid bet payloads", async ({ request }) => {
    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "arena_fan", side: "player", amount: 0 }
    });

    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain("amount(number > 0) is required");
  });

  test("POST /api/match/bet rejects bets after the match has finished", async ({ request }) => {
    const start = await request.post(`${API}/api/match/start`);
    expect(start.ok()).toBeTruthy();
    const startJson = await start.json();

    const finish = await request.post(`${API}/api/match/finish`, {
      data: { winner: "player", elapsedSeconds: 60, playerId: "sounder" }
    });
    expect(finish.ok()).toBeTruthy();

    const res = await request.post(`${API}/api/match/bet`, {
      data: { userName: "arena_fan", side: "player", amount: 100 }
    });

    expect(res.ok()).toBeFalsy();
    expect(res.status()).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain("betting is closed");
    expect(json.data.status).toBe("finished");
    expect(json.data.matchId).toBe(startJson.matchId);
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
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await page.waitForTimeout(50);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");

    await copyButton.click();
    await page.evaluate(() => window.__resolveClipboardWrite());
    await expect(copyButton).toHaveText("Copied Instagram Reel copy");
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
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy X copy");
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

  test("betting panel confirms accepted bets and clears feedback when the draft changes", async ({ page }) => {
    await page.route("**/api/match/bet", async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bet: {
            id: "bet-mock-1",
            userName: payload.userName,
            side: payload.side,
            amount: payload.amount,
            matchId: "match-mock-1",
            createdAt: "2026-04-09T07:30:00.000Z"
          },
          pools: {
            player: payload.side === "player" ? payload.amount : 0,
            enemy: payload.side === "enemy" ? payload.amount : 0
          },
          odds: {
            player: payload.side === "player" ? 1.4 : 2.2,
            enemy: payload.side === "enemy" ? 1.4 : 2.2
          }
        })
      });
    });

    await page.getByTestId("bet-name-input").fill(" arena_fan ");
    await page.getByTestId("bet-side-select").selectOption("enemy");
    await page.getByTestId("bet-amount-input").fill("150");
    await page.getByTestId("bet-submit-button").click();

    await expect(page.getByTestId("bet-feedback")).toContainText("arena_fan backed Enemy Win for 150.");
    await expect(page.getByTestId("bet-submit-button")).toHaveText("Place Bet");
    await expect(page.locator(".pool-bar-e")).toHaveAttribute("style", /width:\s*100%/);

    await page.getByTestId("bet-amount-input").fill("200");
    await expect(page.getByTestId("bet-feedback")).toHaveCount(0);
  });

  test("betting panel shows a live countdown badge for the current wager window", async ({ page }) => {
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting open");
    await expect(page.getByTestId("bet-status-note")).toContainText("60s left in match");

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: { running: true, timer: 12, score: 18, combo: 2, maxCombo: 2 }
      });
    });

    await expect(page.getByTestId("bet-status-note")).toContainText("12s left in match");
  });

  test("betting panel blocks empty bettor names before sending the request", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/match/bet", async (route) => {
      requestCount += 1;
      await route.abort();
    });

    await page.getByTestId("bet-name-input").fill("   ");
    await page.getByTestId("bet-amount-input").fill("100");
    await page.getByTestId("bet-submit-button").click();

    await expect(page.getByTestId("bet-feedback")).toContainText("Enter a bettor name before placing a bet.");
    expect(requestCount).toBe(0);
  });

  test("betting panel shows closed-match guidance after the run ends", async ({ page }) => {
    await page.getByRole("button", { name: "Start" }).click();
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: { running: true, timer: 1, score: 40, combo: 2, maxCombo: 2 }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-overlay")).toBeVisible();
    await expect(page.getByTestId("bet-status-chip")).toHaveText("CLOSED");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting closed");
    await expect(page.getByTestId("bet-status-note")).toContainText("ended after 60s");

    await page.getByTestId("bet-submit-button").click();
    await expect(page.getByTestId("bet-feedback")).toContainText("Betting is closed until the next match starts.");
  });

  test("betting panel surfaces server-side match closures without clearing the draft", async ({ page }) => {
    await page.route("**/api/match/bet", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "betting is closed while match status is finished",
          data: {
            status: "finished",
            matchId: "match-closed-1"
          }
        })
      });
    });

    await page.getByTestId("bet-name-input").fill("arena_fan");
    await page.getByTestId("bet-side-select").selectOption("enemy");
    await page.getByTestId("bet-amount-input").fill("120");
    await page.getByTestId("bet-submit-button").click();

    await expect(page.getByTestId("bet-feedback")).toContainText("betting is closed while match status is finished");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("CLOSED");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting closed");
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("120");
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

  test("share panel keeps the newest share action and ignores stale completions", async ({ page }) => {
    await page.evaluate(() => {
      window.__openedUrls = [];
      window.open = (url) => {
        window.__openedUrls.push(url);
        return null;
      };
    });

    let releaseFirstShare;
    const firstSharePending = new Promise((resolve) => {
      releaseFirstShare = resolve;
    });
    let shareRequestCount = 0;

    await page.route("**/api/share/sns", async (route) => {
      shareRequestCount += 1;
      if (shareRequestCount === 1) {
        await firstSharePending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            links: {
              x: "https://share.example/x-first",
              facebook: "https://share.example/facebook-first",
              telegram: "https://share.example/telegram-first"
            }
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          links: {
            x: "https://share.example/x-second",
            facebook: "https://share.example/facebook-second",
            telegram: "https://share.example/telegram-second"
          }
        })
      });
    });

    const shareButtonX = page.getByTestId("share-button-x");
    const shareButtonTelegram = page.getByTestId("share-button-telegram");

    await shareButtonX.click();
    await expect(shareButtonX).toHaveText("Sharing X...");
    await expect(page.getByTestId("share-feedback")).toContainText("Preparing X share link...");

    await shareButtonTelegram.click();
    await expect(shareButtonTelegram).toHaveText("Shared Telegram");
    await expect(page.getByTestId("share-feedback")).toContainText("Opened Telegram share link.");
    await expect(page.getByTestId("share-button-x")).toHaveText("Share X");

    let openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual(["https://share.example/telegram-second"]);

    releaseFirstShare();
    await page.waitForTimeout(50);

    await expect(page.getByTestId("share-feedback")).toContainText("Opened Telegram share link.");
    openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual(["https://share.example/telegram-second"]);
  });

  test("share panel surfaces backend failures without opening a share window", async ({ page }) => {
    await page.evaluate(() => {
      window.__openedUrls = [];
      window.open = (url) => {
        window.__openedUrls.push(url);
        return null;
      };
    });

    await page.route("**/api/share/sns", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "share backend unavailable" })
      });
    });

    const shareButtonFacebook = page.getByTestId("share-button-facebook");
    await shareButtonFacebook.click();

    await expect(page.getByTestId("share-feedback")).toContainText("share backend unavailable");
    await expect(shareButtonFacebook).toHaveText("Share Facebook");
    const openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual([]);
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

  test("leaderboard recap strip compares the current run against live board targets", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 132, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 128, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 124, combo: 4, date: "2026-03-31", createdAt: "2026-03-31T10:00:00.000Z" },
        { hero: "3D Modeler", score: 120, combo: 3, date: "2026-03-30", createdAt: "2026-03-30T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("TOP TARGET");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Beat 145 pts from SyncFace Weaver");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("120 pts currently enters the top 5");
    await expect(page.getByTestId("leaderboard-season-detail")).toContainText("SyncFace Weaver leads the season with 145 pts and a 6x benchmark combo.");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("3D Modeler currently defends the final slot at 120 pts / 3x combo.");

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          score: 133,
          combo: 4,
          maxCombo: 4,
          hero: { id: "modeler", name: "3D Modeler", hp: 6, speed: 1, desc: "HP 6 / SPD 1" }
        }
      });
    });

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("LIVE #2");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Current run would slot in at #2");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("12 more pts catches SyncFace Weaver above");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("SyncFace Weaver holds #1 at 145 pts. 12 more pts steals that rival spot.");
  });

  test("leaderboard recap strip shows likely cutline guidance when the run is outside top 5", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 132, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 128, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 124, combo: 4, date: "2026-03-31", createdAt: "2026-03-31T10:00:00.000Z" },
        { hero: "3D Modeler", score: 120, combo: 3, date: "2026-03-30", createdAt: "2026-03-30T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          score: 90,
          combo: 2,
          maxCombo: 2
        }
      });
    });

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("OUTSIDE TOP 5");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Current run sits outside the board");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("About 31 more pts likely needed to qualify");
    await expect(page.getByTestId("leaderboard-season-detail")).toContainText("SyncFace Weaver leads the season with 145 pts and a 6x benchmark combo.");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("3D Modeler defends #5 at 120 pts. 31 more pts bumps them off the board.");
  });

  test("leaderboard board-control panel ranks heroes by slot control before score", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "Sound Crafter", score: 132, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 128, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 124, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" },
        { hero: "3D Modeler", score: 120, combo: 3, date: "2026-03-30", createdAt: "2026-03-30T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 132, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 2, qualified: true },
        { hero: "Sound Crafter", score: 129, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T08:00:00.000Z", placement: 3, qualified: true },
        { hero: "Sound Crafter", score: 121, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T08:00:00.000Z", placement: 5, qualified: true },
        { hero: "3D Modeler", score: 128, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z", placement: 3, qualified: true }
      ]));
    });
    await page.reload();

    const controlRows = page.getByTestId("leaderboard-control-item");
    await expect(controlRows).toHaveCount(3);
    await expect(controlRows.nth(0)).toContainText("Sound Crafter");
    await expect(controlRows.nth(0)).toContainText("DOUBLE HOLD");
    await expect(controlRows.nth(0)).toContainText("#2 best · 2 slots · 132 pts · 5x combo");
    await expect(controlRows.nth(1)).toContainText("3D Modeler");
    await expect(controlRows.nth(1)).toContainText("DOUBLE HOLD");
    await expect(controlRows.nth(2)).toContainText("SyncFace Weaver");
    await expect(controlRows.nth(2)).toContainText("PACE SETTER");
    await expect(controlRows.nth(2)).toContainText("#1 best · 1 slot · 145 pts · 6x combo");
    await expect(page.getByTestId("leaderboard-control-momentum")).toContainText("Sound Crafter is riding a 3-run top-5 streak and has peaked at #2.");
  });

  test("leaderboard momentum summary preserves streak context even if the hero falls off the current board", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 141, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 136, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 133, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 129, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 138, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T08:00:00.000Z", placement: 2, qualified: true },
        { hero: "Sound Crafter", score: 131, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T08:00:00.000Z", placement: 3, qualified: true },
        { hero: "Sound Crafter", score: 124, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T08:00:00.000Z", placement: 4, qualified: true },
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-control-momentum")).toContainText("Sound Crafter is riding a 3-run top-5 streak and has peaked at #2.");
    await expect(page.getByTestId("leaderboard-control-list")).not.toContainText("Sound Crafter");
  });

  test("leaderboard momentum summary stays neutral when only the live board exists", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "Sound Crafter", score: 162, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 148, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 141, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 136, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 128, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.removeItem("saga_highscore_history");
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-control-item")).toHaveCount(3);
    await expect(page.getByTestId("leaderboard-control-momentum")).toContainText("Season streaks unlock after the first archived run.");
    await expect(page.getByTestId("leaderboard-archive-empty")).toContainText("Archived season history appears after the first completed run.");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("Trend chips unlock after the first completed run.");
  });

  test("leaderboard archive panel shows recent archived runs even when one falls outside the live board", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 141, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 136, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 133, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 129, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 118, combo: 4, date: "2026-04-06", createdAt: "2026-04-06T08:00:00.000Z", placement: 6, qualified: false },
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "Sound Crafter", score: 138, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T08:00:00.000Z", placement: 2, qualified: true },
        { hero: "Sound Crafter", score: 131, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T08:00:00.000Z", placement: 3, qualified: true },
        { hero: "3D Modeler", score: 127, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T08:00:00.000Z", placement: 5, qualified: true }
      ]));
    });
    await page.reload();

    const archiveRows = page.getByTestId("leaderboard-archive-item");
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 4 archived runs across the season table.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("3 heroes logged 5 archived runs. 4/5 stayed inside the top 5. Latest archive: Sound Crafter at 118 pts (outside the top 5).");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("CUTLINE DELTA");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive needs about 12 more pts to re-enter today's live top 5.");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("STREAK SNAPPED");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("Sound Crafter's best run was 2 straight top-5 archives.");
    await expect(page.getByTestId("leaderboard-archive-filters")).toBeVisible();
    await expect(archiveRows).toHaveCount(4);
    await expect(archiveRows.nth(0)).toContainText("Sound Crafter");
    await expect(archiveRows.nth(0)).toContainText("OUTSIDE TOP 5");
    await expect(archiveRows.nth(0)).toContainText("118 pts · 4x combo · 2026-04-06");
    await expect(archiveRows.nth(1)).toContainText("SyncFace Weaver");
    await expect(archiveRows.nth(1)).toContainText("#1 FINISH");
    await expect(archiveRows.nth(3)).toContainText("Sound Crafter");

    const archiveFilters = page.getByTestId("leaderboard-archive-filters");
    await archiveFilters.getByRole("button", { name: "Sound Crafter", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 3 archived runs for Sound Crafter.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("Sound Crafter has 3 archived runs, peaked at #2, and last archived run landed outside the top 5.");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("SOUND CRAFTER RETURN PATH");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive is 20 pts below their last top-5 finish (#2 at 138 pts).");
    await expect(archiveRows).toHaveCount(3);
    await expect(archiveRows.nth(0)).toContainText("118 pts · 4x combo · 2026-04-06");
    await expect(archiveRows.nth(2)).toContainText("131 pts · 5x combo · 2026-04-03");

    await archiveFilters.getByRole("button", { name: "SyncFace Weaver", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 1 archived run for SyncFace Weaver.");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("PACE SETTER");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("SyncFace Weaver owns the latest #1 archive.");
    await expect(archiveRows).toHaveCount(1);
    await expect(archiveRows.nth(0)).toContainText("#1 FINISH");

    await archiveFilters.getByRole("button", { name: "All heroes", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 4 archived runs across the season table.");
    await expect(archiveRows).toHaveCount(4);
    await expect(page.getByTestId("leaderboard-control-list")).not.toContainText("Sound Crafter");
  });

  test("leaderboard archive hero filter survives reloads and clears stale saved heroes", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 141, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 138, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 118, combo: 4, date: "2026-04-06", createdAt: "2026-04-06T08:00:00.000Z", placement: 3, qualified: true },
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "Sound Crafter", score: 138, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T08:00:00.000Z", placement: 2, qualified: true }
      ]));
      localStorage.removeItem("saga_archive_hero_filter");
    });
    await page.reload();

    const archiveFilters = page.getByTestId("leaderboard-archive-filters");
    await archiveFilters.getByRole("button", { name: "Sound Crafter", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 2 archived runs for Sound Crafter.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("Sound Crafter has 2 archived runs, peaked at #2, and is riding a 2-run top-5 streak.");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("SOUND CRAFTER SEASON-BEST CHASE");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive is 20 pts shy of their season-best finish (#2 at 138 pts).");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("HOT STREAK");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("Sound Crafter has 2 straight top-5 archives.");
    expect(await page.evaluate(() => localStorage.getItem("saga_archive_hero_filter"))).toBe("Sound Crafter");

    await page.reload();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 2 archived runs for Sound Crafter.");
    await expect(page.getByTestId("leaderboard-archive-filters").getByRole("button", { name: "Sound Crafter", exact: true })).toHaveClass(/active/);

    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 141, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "SyncFace Weaver", score: 145, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "3D Modeler", score: 141, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 2, qualified: true }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 2 archived runs across the season table.");
    await expect(page.getByTestId("leaderboard-archive-filters").getByRole("button", { name: "All heroes", exact: true })).toHaveClass(/active/);
    expect(await page.evaluate(() => localStorage.getItem("saga_archive_hero_filter"))).toBeNull();
  });

  test("leaderboard archive hides redundant hero filters when only one hero has archived runs", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "Sound Crafter", score: 142, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 139, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 135, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 142, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "Sound Crafter", score: 137, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 2, qualified: true },
        { hero: "Sound Crafter", score: 132, combo: 4, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z", placement: 4, qualified: true }
      ]));
      localStorage.setItem("saga_archive_hero_filter", "Sound Crafter");
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 3 archived runs across the season table.");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("BENCHMARK HOLD");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive already owns the season benchmark at 142 pts / 6x.");
    await expect(page.getByTestId("leaderboard-archive-item")).toHaveCount(3);
    await expect(page.getByTestId("leaderboard-archive-item").nth(0)).toContainText("Sound Crafter");
    await expect(page.getByTestId("leaderboard-archive-filters")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("saga_archive_hero_filter"))).toBeNull();
  });

  test("leaderboard board-control panel shows an empty-state prompt with no posted runs", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("saga_highscores");
      localStorage.removeItem("saga_highscore_history");
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-control-empty")).toContainText("Post the first clean run to reveal hero control badges.");
    await expect(page.getByTestId("leaderboard-control-item")).toHaveCount(0);
    await expect(page.getByTestId("leaderboard-control-momentum")).toContainText("Season streaks unlock after the first archived run.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("Archive summaries unlock after the first completed run.");
  });

  test("game over overlay highlights a new #1 leaderboard finish", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        {
          hero: "3D Modeler",
          score: 120,
          combo: 4,
          date: "2026-04-01",
          createdAt: "2026-04-01T10:00:00.000Z"
        },
        {
          hero: "Sound Crafter",
          score: 95,
          combo: 3,
          date: "2026-04-02",
          createdAt: "2026-04-02T10:00:00.000Z"
        }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 145,
          combo: 6,
          maxCombo: 6,
          hero: { id: "faceweaver", name: "SyncFace Weaver", hp: 4, speed: 2, desc: "HP 4 / SPD 2" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("New #1 high score");
    await expect(page.getByTestId("game-over-placement")).toContainText("SyncFace Weaver takes the lead");
    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("LIVE #1 PACE");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("move ahead of 3D Modeler");

    const rows = page.getByTestId("high-score-item");
    await expect(rows.nth(0)).toContainText("#1");
    await expect(rows.nth(0)).toContainText("SyncFace Weaver");
    await expect(rows.nth(0)).toContainText("145");
  });

  test("game over overlay reports when a run misses the top 5 leaderboard", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 180, combo: 6, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 160, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 140, combo: 4, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 130, combo: 4, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 120, combo: 3, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: { running: true, timer: 1, score: 90, combo: 2, maxCombo: 2 }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("Run archived outside the top 5.");
    const rows = page.getByTestId("high-score-item");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(4)).toContainText("120");
    await expect(page.getByTestId("high-scores-list")).not.toContainText("90");
  });

  test("game over overlay calls out a streak extension after another top-5 finish is archived", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "Sound Crafter", score: 162, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "3D Modeler", score: 148, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 141, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 136, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 128, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 162, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "Sound Crafter", score: 150, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 2, qualified: true },
        { hero: "3D Modeler", score: 148, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z", placement: 3, qualified: true }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 146,
          combo: 5,
          maxCombo: 5,
          hero: { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("High score secured at #3.");
    await expect(page.getByTestId("game-over-momentum")).toContainText("Sound Crafter extends their top-5 streak to 3 straight runs.");
  });

  test("game over overlay opens a first top-5 streak when a hero archives their first qualifying finish", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 168, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 154, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "3D Modeler", score: 149, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 142, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 136, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.removeItem("saga_highscore_history");
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 144,
          combo: 4,
          maxCombo: 4,
          hero: { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("High score secured at #4.");
    await expect(page.getByTestId("game-over-momentum")).toContainText("Sound Crafter opens a new top-5 streak with this #4 finish.");
  });

  test("game over overlay keeps the comeback message on a new streak when the hero does not beat their prior peak", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 175, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 164, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "3D Modeler", score: 152, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 148, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 139, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 130, combo: 4, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 6, qualified: false },
        { hero: "Sound Crafter", score: 164, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z", placement: 2, qualified: true },
        { hero: "3D Modeler", score: 175, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 150,
          combo: 5,
          maxCombo: 5,
          hero: { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("High score secured at #4.");
    await expect(page.getByTestId("game-over-momentum")).toContainText("Sound Crafter opens a new top-5 streak with this #4 finish.");
  });

  test("game over overlay prioritizes a new season-best placement when a comeback run beats the hero's previous peak", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 175, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 164, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "3D Modeler", score: 152, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 148, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 139, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 130, combo: 4, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 6, qualified: false },
        { hero: "Sound Crafter", score: 148, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z", placement: 4, qualified: true },
        { hero: "3D Modeler", score: 175, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 1, qualified: true }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 160,
          combo: 5,
          maxCombo: 5,
          hero: { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("High score secured at #3.");
    await expect(page.getByTestId("game-over-momentum")).toContainText("Sound Crafter locks in a new season-best placement at #3.");
  });

  test("game over overlay calls out when an archived finish snaps a top-5 streak", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 180, combo: 6, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 166, combo: 5, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "3D Modeler", score: 152, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 145, combo: 4, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 138, combo: 4, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 145, combo: 4, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z", placement: 4, qualified: true },
        { hero: "Sound Crafter", score: 139, combo: 4, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z", placement: 5, qualified: true },
        { hero: "3D Modeler", score: 180, combo: 6, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z", placement: 1, qualified: true }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 1,
          score: 90,
          combo: 2,
          maxCombo: 2,
          hero: { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" }
        }
      });
      window.__SAGA_DEBUG__.dispatch({ type: "TIMER_TICK" });
    });

    await expect(page.getByTestId("game-over-placement")).toContainText("Run archived outside the top 5.");
    await expect(page.getByTestId("game-over-momentum")).toContainText("Sound Crafter's 2-run top-5 streak snaps with this archived finish.");
  });

  test("leaderboard recap and rival summary use combo gaps when a tied score still trails on tiebreakers", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 170, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 150, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 141, combo: 4, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 132, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 124, combo: 3, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 20,
          score: 150,
          combo: 4,
          maxCombo: 4,
          hero: { id: "faceweaver", name: "SyncFace Weaver", hp: 4, speed: 2, desc: "HP 4 / SPD 2" }
        }
      });
    });

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("LIVE #3");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Matching 150 pts is not enough");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("1 more combo catches Sound Crafter above");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("Matching 150 pts still needs 1 more combo to steal that rival spot");
  });

  test("leaderboard recap uses combo gaps instead of phantom point gaps at the cutline", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 180, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 166, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 151, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 143, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 132, combo: 4, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 20,
          score: 132,
          combo: 3,
          maxCombo: 3,
          hero: { id: "faceweaver", name: "SyncFace Weaver", hp: 4, speed: 2, desc: "HP 4 / SPD 2" }
        }
      });
    });

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("OUTSIDE TOP 5");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Matching 132 pts still needs 1 more combo");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("bump Sound Crafter off the cutline");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("Matching 132 pts still needs 1 more combo to bump Sound Crafter off the board");
  });

  test("leaderboard recap explains a tied top score as a recency tiebreak instead of a phantom point lead", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 180, combo: 6, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 166, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 151, combo: 4, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" }
      ]));
    });
    await page.reload();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: true,
          timer: 18,
          score: 180,
          combo: 6,
          maxCombo: 6,
          hero: { id: "faceweaver", name: "SyncFace Weaver", hp: 4, speed: 2, desc: "HP 4 / SPD 2" }
        }
      });
    });

    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("LIVE #1 PACE");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("match 3D Modeler at 180 pts / 6x and take #1 on recency");
    await expect(page.getByTestId("leaderboard-rival-detail")).toContainText("3D Modeler owns the current benchmark at 180 pts / 6x, but matching that line already flips #1 on recency");
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
