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
        estimatedCallsSaved: 5,
        estimatedCallsWithPack: 3,
        estimatedCallsWithoutPack: 8
      },
      productionQueue: [
        { id: `queue-sound-${suffix}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: `${brief} bgm prompt` },
        { id: `queue-asset-player-${suffix}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: `${brief} player direction` },
        { id: `queue-asset-enemy-${suffix}`, label: "Rival silhouette", lane: "asset", key: "enemy", prompt: `${brief} enemy direction` },
        { id: `queue-copy-${suffix}`, label: "Social launch copy", lane: "social", key: "x", prompt: `${brief} launch copy` }
      ],
      marketingAngles: [
        {
          id: `launch-${suffix}`,
          channel: "x",
          label: `Launch ${suffix}`,
          copy: `${brief} launch copy`,
          cta: `${brief} CTA`
        }
      ]
    }
  };
}

function createCachedStudioPackSelectionFixture(brief, { suffix }) {
  const fixture = createStudioPackFixture(brief, { suffix });
  fixture.studioPack.packId = `pack-${suffix}`;
  fixture.studioPack.marketingAngles = [
    {
      id: `${suffix}-x`,
      channel: "x",
      label: "X",
      copy: `${brief} X copy`,
      cta: "Drop into the arena"
    },
    {
      id: `${suffix}-instagram`,
      channel: "instagram",
      label: "Instagram Reel",
      copy: `${brief} Instagram Reel copy`,
      cta: "Swipe into the spotlight"
    }
  ];
  fixture.studioPack.productionQueue = [
    { id: `queue-sound-${suffix}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: `${brief} bgm prompt` },
    { id: `queue-asset-player-${suffix}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: `${brief} player direction` },
    { id: `queue-social-${suffix}`, label: "Social launch copy", lane: "social", key: "x", prompt: `${brief} X copy` }
  ];
  return fixture;
}

function waitForStudioPackResponse(page, matcher) {
  return page.waitForResponse((response) => {
    if (!response.url().includes("/api/varco/studio-pack")) return false;
    try {
      return matcher(response.request().postDataJSON());
    } catch {
      return false;
    }
  });
}

function waitForApiResponse(page, urlPart) {
  return page.waitForResponse((response) => response.url().includes(urlPart));
}

function waitForClipboardSettlement(page, expectedCount = 1) {
  return page.waitForFunction((count) => (window.__clipboardSettled || 0) >= count, expectedCount);
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

    const hpPanel = page.getByTestId("hp-panel");
    const levelPanel = page.getByTestId("level-panel");
    const comboPanel = page.getByTestId("combo-panel");
    const missionPanel = page.getByTestId("mission-panel");
    const abilityPanel = page.getByTestId("ability-panel");
    const directorPanel = page.getByTestId("director-panel");
    const powerupPanel = page.getByTestId("powerup-panel");
    const liveWatchPanel = page.getByTestId("live-watch-panel");
    const directorKpiCards = page.getByTestId("director-kpi-card");
    const studioPackPanel = page.getByTestId("studio-pack-panel");
    const studioKpiStrip = page.getByTestId("studio-kpi-strip");
    const arenaStatusStrip = page.getByTestId("arena-status-strip");
    const controlLegend = page.getByTestId("control-legend");
    const runBriefing = page.getByTestId("run-briefing");
    const achievementList = page.getByTestId("achievement-list");
    const achievementItems = page.getByTestId("achievement-item");
    const betNameInput = page.getByTestId("bet-name-input");
    const betSideSelect = page.getByTestId("bet-side-select");
    const betAmountInput = page.getByTestId("bet-amount-input");
    const betSubmitButton = page.getByTestId("bet-submit-button");

    await expect(hpPanel).toBeVisible();
    await expect(levelPanel).toBeVisible();
    await expect(comboPanel).toBeVisible();
    await expect(missionPanel).toBeVisible();
    await expect(abilityPanel).toBeVisible();
    await expect(directorPanel).toBeVisible();
    await expect(powerupPanel).toBeVisible();
    await expect(liveWatchPanel).toBeVisible();
    await expect(directorKpiCards).toHaveCount(3);
    await expect(page.getByTestId("studio-pack-panel")).toBeVisible();
    await expect(hpPanel).toContainText("HP");
    await expect(levelPanel).toContainText("Level");
    await expect(comboPanel).toContainText("Multiplier");
    await expect(powerupPanel).toContainText("Shield");
    await expect(liveWatchPanel).toContainText("Live");
    await expect(studioKpiStrip).toContainText("cache hits");
    await expect(arenaStatusStrip).toContainText("Mission:");
    await expect(controlLegend).toContainText("Arrow keys / WASD");
    await expect(controlLegend).toContainText("Space · Hard-Light Shield");
    await expect(runBriefing).toContainText("UGC cores = 10 pts");
    await expect(runBriefing).toContainText("1.5x / 2x / 3x");
    await expect(runBriefing).toContainText("Hard-Light Shield");
    await expect(achievementList).toBeVisible();
    await expect(achievementItems).toHaveCount(8);

    await expect(hpPanel).toHaveAttribute("tabindex", "0");
    await expect(hpPanel).toHaveAttribute("aria-label", "Health. 6 of 6 HP. 100 percent. Healthy.");
    await expect(levelPanel).toHaveAttribute("tabindex", "0");
    await expect(levelPanel).toHaveAttribute("aria-label", "Level. 1. XP 0 of 80. HP 6 / SPD 1");
    await expect(comboPanel).toHaveAttribute("tabindex", "0");
    await expect(comboPanel).toHaveAttribute("aria-label", "Combo. 0x multiplier. 1.0x points.");
    await expect(missionPanel).toHaveAttribute("tabindex", "0");
    await expect(missionPanel).toHaveAttribute("aria-label", /Director Mission\./);
    await expect(abilityPanel).toHaveAttribute("tabindex", "0");
    await expect(abilityPanel).toHaveAttribute("aria-label", /Hero Ability\./);
    await expect(directorPanel).toHaveAttribute("tabindex", "0");
    await expect(directorPanel).toHaveAttribute("aria-label", /Arena Director\./);
    await expect(powerupPanel).toHaveAttribute("tabindex", "0");
    await expect(powerupPanel).toHaveAttribute("aria-label", /Power-ups\. Shield inactive\./);
    await expect(liveWatchPanel).toHaveAttribute("tabindex", "0");
    await expect(liveWatchPanel).toHaveAttribute("aria-label", /Live board\. \d+ spectators watching\./);
    await expect(directorKpiCards.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(directorKpiCards.nth(0)).toHaveAttribute("aria-label", "Bonus core. Offline.");
    await expect(directorKpiCards.nth(1)).toHaveAttribute("aria-label", "Live assets. 0/3.");
    await expect(directorKpiCards.nth(2)).toHaveAttribute("aria-label", "Live cues. 0/5.");
    await expect(studioPackPanel).toHaveAttribute("tabindex", "0");
    await expect(studioPackPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(betNameInput).toHaveAttribute("aria-label", "Betting user name. Enter the bettor name before placing a wager.");
    await expect(betSideSelect).toHaveAttribute("aria-label", "Betting side. Choose whether the player or enemy wins.");
    await expect(betAmountInput).toHaveAttribute("aria-label", "Betting amount. Enter the wager amount in credits.");
    await expect(betSubmitButton).toHaveAttribute("aria-label", "Place bet. Submit the current wager.");
    await expect(studioKpiStrip).toHaveAttribute("tabindex", "0");
    await expect(studioKpiStrip).toHaveAttribute("aria-label", /Studio cache\. cache hits \d+\./);
    await expect(arenaStatusStrip).toHaveAttribute("tabindex", "0");
    await expect(arenaStatusStrip).toHaveAttribute("aria-label", /Arena status\. Phase:/);
    await expect(controlLegend).toHaveAttribute("tabindex", "0");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Hard-Light Shield. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("tabindex", "0");
    await expect(runBriefing).toHaveAttribute("aria-label", /Run briefing\. Collect UGC cores for 10 points each\./);
    await expect(runBriefing).toHaveAttribute("aria-label", /Hard-Light Shield: Shield \+ heal \+ scatter enemies\./);
    await expect(achievementList).toHaveAttribute("aria-label", "Achievements. 0 unlocked of 8.");
    await expect(achievementItems.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(achievementItems.nth(0)).toHaveAttribute("aria-label", "First Blood. Collect 1 orb. Locked.");
    await expect(achievementItems.nth(0)).toHaveAttribute("title", "First Blood. Collect 1 orb. Locked.");

    await hpPanel.focus();
    await expect(hpPanel).toBeFocused();
    await levelPanel.focus();
    await expect(levelPanel).toBeFocused();
    await comboPanel.focus();
    await expect(comboPanel).toBeFocused();
    await directorPanel.focus();
    await expect(directorPanel).toBeFocused();
    await powerupPanel.focus();
    await expect(powerupPanel).toBeFocused();
    await liveWatchPanel.focus();
    await expect(liveWatchPanel).toBeFocused();
    await directorKpiCards.nth(0).focus();
    await expect(directorKpiCards.nth(0)).toBeFocused();
    await studioPackPanel.focus();
    await expect(studioPackPanel).toBeFocused();
    await betNameInput.focus();
    await expect(betNameInput).toBeFocused();
    await studioKpiStrip.focus();
    await expect(studioKpiStrip).toBeFocused();
    await arenaStatusStrip.focus();
    await expect(arenaStatusStrip).toBeFocused();
    await controlLegend.focus();
    await expect(controlLegend).toBeFocused();
    await runBriefing.focus();
    await expect(runBriefing).toBeFocused();
    await achievementItems.nth(0).focus();
    await expect(achievementItems.nth(0)).toBeFocused();
  });

  test("achievement list announces unlocked progress and supports keyboard navigation", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_progress", JSON.stringify({
        xp: 90,
        level: 2,
        achievements: ["first_orb", "combo3"]
      }));
    });
    await page.reload();

    const achievementList = page.getByTestId("achievement-list");
    const achievementItems = page.getByTestId("achievement-item");
    await expect(achievementList).toHaveAttribute("aria-label", "Achievements. 2 unlocked of 8.");
    await expect(achievementItems).toHaveCount(8);
    await expect(achievementItems.nth(0)).toHaveAttribute("aria-label", "First Blood. Collect 1 orb. Unlocked.");
    await expect(achievementItems.nth(1)).toHaveAttribute("aria-label", "Triple Threat. 3x combo. Unlocked.");
    await expect(achievementItems.nth(2)).toHaveAttribute("aria-label", "Unstoppable. 5x combo. Locked.");

    await achievementItems.nth(0).focus();
    await expect(achievementItems.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(achievementItems.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(achievementItems.nth(7)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(achievementItems.nth(0)).toBeFocused();
  });

  test("agent log feed shows an empty state and focusable server log rows", async ({ page }) => {
    let logsPayload = [];
    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: logsPayload })
      });
    });

    await page.reload();
    await expect(page.getByTestId("agent-log-empty")).toContainText("No agent logs yet.");

    logsPayload = [
      { id: "log-warn", level: "warn", message: "sponsor swing queued" },
      { id: "log-info", level: "info", message: "orb collected" }
    ];

    await page.reload();

    const agentLogList = page.getByTestId("agent-log-list");
    const agentLogRows = page.getByTestId("agent-log-item");
    await expect(agentLogList).toHaveAttribute("aria-label", "Agent log feed");
    await expect(agentLogRows).toHaveCount(2);
    await expect(agentLogRows.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(agentLogRows.nth(0)).toHaveAttribute("aria-label", "Agent log 1. WARN. sponsor swing queued");
    await expect(agentLogRows.nth(1)).toHaveAttribute("title", "Agent log 2. INFO. orb collected");
    await agentLogRows.nth(0).focus();
    await expect(agentLogRows.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(agentLogRows.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(agentLogRows.nth(0)).toBeFocused();
    await page.keyboard.press("End");
    await expect(agentLogRows.nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(agentLogRows.nth(0)).toBeFocused();
  });

  test("agent log feed announces fresh server updates with a compact status summary", async ({ page }) => {
    let logsPayload = [];
    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: logsPayload })
      });
    });

    await page.reload();
    await expect(page.getByTestId("agent-log-empty")).toContainText("No agent logs yet.");
    await expect(page.getByTestId("agent-log-summary")).toHaveCount(0);
    await waitForApiResponse(page, "/api/agent/logs");
    await expect(page.getByTestId("agent-log-summary")).toHaveCount(0);

    logsPayload = [
      { id: "log-alert", level: "warn", message: "director swing locked in" },
      { id: "log-info", level: "info", message: "studio cache warmed" }
    ];

    const agentLogSummary = page.getByTestId("agent-log-summary");
    await expect(agentLogSummary).toContainText("2 logs synced. Latest WARN. director swing locked in");
    await expect(agentLogSummary).toHaveAttribute("role", "status");
    await expect(agentLogSummary).toHaveAttribute("aria-label", "Agent log update. 2 logs synced. Latest WARN. director swing locked in");
    await agentLogSummary.focus();
    await expect(agentLogSummary).toBeFocused();
    await expect(page.getByTestId("agent-log-item").nth(0)).toHaveAttribute("aria-label", "Agent log 1. WARN. director swing locked in");

    logsPayload = [
      { id: "log-bonus", level: "info", message: "bonus core routed to main lane" },
      { id: "log-alert", level: "warn", message: "director swing locked in" },
      { id: "log-info", level: "info", message: "studio cache warmed" }
    ];

    await expect(agentLogSummary).toContainText("3 logs synced. Latest INFO. bonus core routed to main lane");
    await expect(agentLogSummary).toHaveAttribute("title", "Agent log update. 3 logs synced. Latest INFO. bonus core routed to main lane");

    logsPayload = [
      { id: "log-bonus", level: "info", message: "bonus core routed to main lane" },
      { id: "log-alert", level: "warn", message: "director swing locked in" },
      { id: "log-info", level: "info", message: "studio cache warmed" },
      { id: "log-older", level: "info", message: "older archive note synced" }
    ];

    await waitForApiResponse(page, "/api/agent/logs");
    await expect(page.getByTestId("agent-log-summary")).toHaveCount(0);
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

  test("studio pack status is keyboard-readable and ignores stale success after the brief changes", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    const staleRetroPackResponse = waitForStudioPackResponse(page, ({ brief }) => brief === "Retro arcade launch for creator heroes");
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
    const studioStatus = page.getByTestId("studio-pack-status");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(generateButton).toHaveText("Building Pack...");
    await expect(studioStatus).toContainText("BUILDING PACK");
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");
    await expect(studioStatus).toHaveAttribute("aria-label", /Studio pack status\. Pending\. BUILDING PACK\./);
    await studioStatus.focus();
    await expect(studioStatus).toBeFocused();

    await briefInput.fill("Midnight remix pack for creator duels");
    await expect(generateButton).toHaveText("Generate Studio Pack");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(studioStatus).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("PACK READY");
    await expect(studioStatus).toContainText("Fresh studio pack ready for 3D Modeler.");
    await expect(studioStatus).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.locator(".studio-pack-card")).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Midnight remix pack for creator duels launch copy");

    releaseFirstPack();
    await staleRetroPackResponse;

    await expect(studioStatus).toContainText("PACK READY");
    await expect(studioStatus).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.locator(".studio-pack-card")).toContainText("Midnight remix pack for creator duels headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Retro arcade launch for creator heroes headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Midnight remix pack for creator duels launch copy");
  });

  test("studio pack resets stale hero-specific state when switching heroes before the run starts", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    const staleModelerPackResponse = waitForStudioPackResponse(page, ({ heroId }) => heroId === "modeler");
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", {
            heroName: "3D Modeler",
            suffix: "modeler"
          }))
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", {
          heroName: "Sound Crafter",
          suffix: "sounder"
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(briefInput).toHaveValue("Retro arcade launch for creator heroes");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-card")).toHaveCount(0);

    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Retro arcade launch for creator heroes headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Retro arcade launch for creator heroes launch copy");
    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);

    releaseFirstPack();
    await staleModelerPackResponse;

    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.getByTestId("studio-pack-panel")).not.toContainText("3D Modeler");
  });

  test("switching heroes during an in-flight studio pack failure keeps stale errors from restoring cleared pack UI", async ({ page }) => {
    let releaseFirstFailure;
    const firstFailurePending = new Promise((resolve) => {
      releaseFirstFailure = resolve;
    });
    const staleModelerFailureResponse = waitForStudioPackResponse(page, ({ heroId }) => heroId === "modeler");
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstFailurePending;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: `studio pack timeout for ${payload.heroId}` })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", {
          heroName: "Sound Crafter",
          suffix: payload.heroId
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const assetPromptInput = page.locator(".asset-editor .prompt-input");
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const assetCardGroup = page.getByTestId("asset-card-group");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(briefInput).toHaveValue("Retro arcade launch for creator heroes");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-card")).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected BGM\./);
    await expect(soundTabGroup).not.toHaveAttribute("aria-label", /Selected Orb 수집음\./);

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Orb\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Selected Player\./);

    releaseFirstFailure();
    await staleModelerFailureResponse;

    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-card")).toHaveCount(0);
    await expect(page.getByText("studio pack timeout for modeler")).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    expect(requestedHeroIds).toEqual(["modeler"]);
  });

  test("switching heroes after generating a fresh pack ignores stale delayed success from the previous hero", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    const staleModelerPackResponse = waitForStudioPackResponse(page, ({ heroId }) => heroId === "modeler");
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createStudioPackFixture("Modeler delayed pack", {
            heroName: "3D Modeler",
            suffix: payload.heroId
          }))
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Sounder fresh pack", {
          heroName: "Sound Crafter",
          suffix: payload.heroId
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const assetPromptInput = page.locator(".asset-editor .prompt-input");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(studioStatus).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(studioStatus).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Sounder fresh pack launch copy");

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("Sounder fresh pack bgm prompt");

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Sounder fresh pack orb direction");

    releaseFirstPack();
    await staleModelerPackResponse;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(studioStatus).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Sounder fresh pack launch copy");
    await expect(studioPanel).not.toContainText("3D Modeler");
    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes during a stale delayed success keeps the fresh marketing selection and queue state", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    const staleModelerPackResponse = waitForStudioPackResponse(page, ({ heroId }) => heroId === "modeler");
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(studioStatus).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    releaseFirstPack();
    await staleModelerPackResponse;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");
    await expect(studioPanel).not.toContainText("3D Modeler");
    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes during a stale delayed success keeps pending clipboard feedback on the fresh marketing selection", async ({ page }) => {
    const staleModelerPackResponse = waitForStudioPackResponse(page, ({ heroId }) => heroId === "modeler");

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

    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Pending. Instagram Reel. Copying Instagram Reel copy to the clipboard..."
    );

    releaseFirstPack();
    await staleModelerPackResponse;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await expect(copyButton).toHaveText("Copied Instagram Reel copy");
    await expect(copyFeedback).toContainText("Instagram Reel copy copied.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Ready. Instagram Reel. Instagram Reel copy copied."
    );

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes after a stale response resolves keeps clipboard-ready feedback on the fresh default X selection", async ({ page }) => {
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
          writeText: (text) => {
            window.__copiedText = text;
            return new Promise((resolve) => {
              window.__clipboardResolves.push(resolve);
            });
          },
        },
      });
    });

    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let resolveFirstPackFulfilled;
    const firstPackFulfilled = new Promise((resolve) => {
      resolveFirstPackFulfilled = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        resolveFirstPackFulfilled();
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying X copy...");
    await expect(copyFeedback).toContainText("Copying X copy to the clipboard...");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Pending. X. Copying X copy to the clipboard..."
    );

    releaseFirstPack();
    await firstPackFulfilled;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(copyButton).toHaveText("Copying X copy...");
    await expect(copyFeedback).toContainText("Copying X copy to the clipboard...");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await expect(copyButton).toHaveText("Copied X copy");
    await expect(copyFeedback).toContainText("X copy copied.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Ready. X. X copy copied."
    );
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
    await expect(page.evaluate(() => window.__copiedText)).resolves.toBe("Sounder fresh pack X copy\nCTA: Drop into the arena");

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes during a stale delayed clipboard failure keeps the fresh marketing error on the active selection", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardRejects = [];
      window.__rejectClipboardWrite = () => {
        const reject = window.__clipboardRejects.shift();
        if (reject) reject(new Error("clipboard permissions denied"));
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => new Promise((resolve, reject) => {
            window.__clipboardRejects.push(reject);
          }),
        },
      });
    });

    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let resolveFirstPackFulfilled;
    const firstPackFulfilled = new Promise((resolve) => {
      resolveFirstPackFulfilled = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        resolveFirstPackFulfilled();
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Pending. Instagram Reel. Copying Instagram Reel copy to the clipboard..."
    );

    releaseFirstPack();
    await firstPackFulfilled;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await page.evaluate(() => window.__rejectClipboardWrite());
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(copyFeedback).toContainText("Clipboard copy blocked. Try again after granting permissions.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Error. Instagram Reel. Clipboard copy blocked. Try again after granting permissions."
    );
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes after a stale response resolves still scopes clipboard-unavailable feedback to the fresh marketing selection", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let resolveFirstPackFulfilled;
    const firstPackFulfilled = new Promise((resolve) => {
      resolveFirstPackFulfilled = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        resolveFirstPackFulfilled();
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    releaseFirstPack();
    await firstPackFulfilled;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined,
      });
    });

    await copyButton.click();
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(copyFeedback).toContainText("Clipboard unavailable in this browser.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Error. Instagram Reel. Clipboard unavailable in this browser."
    );
    await expect(copyCard).toContainText("Sounder fresh pack Instagram Reel copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes after a stale response resolves keeps clipboard-unavailable feedback on the fresh default X selection", async ({ page }) => {
    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let resolveFirstPackFulfilled;
    const firstPackFulfilled = new Promise((resolve) => {
      resolveFirstPackFulfilled = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        resolveFirstPackFulfilled();
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    releaseFirstPack();
    await firstPackFulfilled;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined,
      });
    });

    await copyButton.click();
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(copyFeedback).toContainText("Clipboard unavailable in this browser.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Error. X. Clipboard unavailable in this browser."
    );
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes after a stale response resolves keeps clipboard-failure feedback on the fresh default X selection", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardRejects = [];
      window.__rejectClipboardWrite = () => {
        const reject = window.__clipboardRejects.shift();
        if (reject) reject(new Error("clipboard permissions denied"));
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => new Promise((resolve, reject) => {
            window.__clipboardRejects.push(reject);
          }),
        },
      });
    });

    let releaseFirstPack;
    const firstPackPending = new Promise((resolve) => {
      releaseFirstPack = resolve;
    });
    let resolveFirstPackFulfilled;
    const firstPackFulfilled = new Promise((resolve) => {
      resolveFirstPackFulfilled = resolve;
    });
    const requestedHeroIds = [];
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      requestedHeroIds.push(payload.heroId);

      if (requestCount === 1) {
        await firstPackPending;
        const fixture = createStudioPackFixture("Modeler delayed pack", {
          heroName: "3D Modeler",
          suffix: payload.heroId
        });
        fixture.studioPack.marketingAngles = [
          {
            id: `${payload.heroId}-launch-x`,
            channel: "x",
            label: "X",
            copy: "Modeler delayed pack X copy",
            cta: "Queue the creator drop"
          },
          {
            id: `${payload.heroId}-launch-instagram`,
            channel: "instagram",
            label: "Instagram Reel",
            copy: "Modeler delayed pack Instagram Reel copy",
            cta: "Spin the arena spotlight"
          }
        ];
        fixture.studioPack.productionQueue = [
          { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Modeler delayed pack bgm prompt" },
          { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Modeler delayed pack player direction" },
          { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Modeler delayed pack X copy" }
        ];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
        resolveFirstPackFulfilled();
        return;
      }

      const fixture = createStudioPackFixture("Sounder fresh pack", {
        heroName: "Sound Crafter",
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: "Sounder fresh pack X copy",
          cta: "Drop into the arena"
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Sounder fresh pack Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: `queue-sound-${payload.heroId}`, label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Sounder fresh pack bgm prompt" },
        { id: `queue-asset-player-${payload.heroId}`, label: "Hero showcase model", lane: "asset", key: "player", prompt: "Sounder fresh pack player direction" },
        { id: `queue-social-${payload.heroId}`, label: "Social launch copy", lane: "social", key: "x", prompt: "Sounder fresh pack X copy" }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const studioStatus = page.getByTestId("studio-pack-status");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await sounderButton.click();
    await expect(studioStatus).toHaveCount(0);
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);

    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying X copy...");
    await expect(copyFeedback).toContainText("Copying X copy to the clipboard...");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Pending. X. Copying X copy to the clipboard..."
    );

    releaseFirstPack();
    await firstPackFulfilled;

    await expect(studioStatus).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(page.locator(".studio-pack-card")).toContainText("Sounder fresh pack headline");
    await expect(page.locator(".studio-pack-card")).not.toContainText("Modeler delayed pack headline");
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(copyButton).toHaveText("Copying X copy...");
    await expect(copyFeedback).toContainText("Copying X copy to the clipboard...");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.__rejectClipboardWrite());
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(copyFeedback).toContainText("Clipboard copy blocked. Try again after granting permissions.");
    await expect(copyFeedback).toHaveAttribute(
      "aria-label",
      "Marketing copy status. Error. X. Clipboard copy blocked. Try again after granting permissions."
    );
    await expect(copyCard).toContainText("Sounder fresh pack X copy");
    await expect(copyCard).not.toContainText("Modeler delayed pack X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "false");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    expect(requestedHeroIds).toEqual(["modeler", "sounder"]);
  });

  test("switching heroes after a ready studio pack clears stale loaded sound prompts", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      const payload = route.request().postDataJSON();
      const heroName = payload.heroId === "sounder" ? "Sound Crafter" : "3D Modeler";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", {
          heroName,
          suffix: payload.heroId
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const orbSoundTab = page.getByTestId("sound-tab-orb");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await orbSoundTab.click();
    await expect(orbSoundTab).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("Retro arcade launch for creator heroes orb prompt");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected Orb 수집음\./);
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Current prompt Retro arcade launch for creator heroes orb prompt\./);

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-card")).toHaveCount(0);
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected BGM\./);
    await expect(soundTabGroup).not.toHaveAttribute("aria-label", /Selected Orb 수집음\./);
  });

  test("switching heroes after a ready studio pack clears stale loaded asset directions", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      const payload = route.request().postDataJSON();
      const heroName = payload.heroId === "sounder" ? "Sound Crafter" : "3D Modeler";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", {
          heroName,
          suffix: payload.heroId
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const assetPromptInput = page.locator(".asset-editor .prompt-input");
    const assetCardGroup = page.getByTestId("asset-card-group");
    const heroShowcaseQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Hero showcase model" });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await heroShowcaseQueueItem.click();
    await expect(page.getByRole("button", { name: /^🧊 에셋$/ })).toHaveClass(/active/);
    await expect(page.getByTestId("asset-card-player")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Retro arcade launch for creator heroes player direction");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Retro arcade launch for creator heroes player direction/);

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Orb\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Retro arcade launch for creator heroes player direction/);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Selected Player\./);
  });

  test("editing the brief after a ready studio pack clears stale sound and asset selections", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture(payload.brief, {
          heroName: "3D Modeler",
          suffix: payload.heroId
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const assetPromptInput = page.locator(".asset-editor .prompt-input");
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const assetCardGroup = page.getByTestId("asset-card-group");
    const orbSoundTab = page.getByTestId("sound-tab-orb");
    const heroShowcaseQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Hero showcase model" });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await orbSoundTab.click();
    await expect(orbSoundTab).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("Retro arcade launch for creator heroes orb prompt");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected Orb 수집음\./);
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Current prompt Retro arcade launch for creator heroes orb prompt\./);

    await heroShowcaseQueueItem.click();
    await expect(page.getByRole("button", { name: /^🧊 에셋$/ })).toHaveClass(/active/);
    await expect(page.getByTestId("asset-card-player")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Retro arcade launch for creator heroes player direction");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Player\./);
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Current direction Retro arcade launch for creator heroes player direction\./);

    await briefInput.fill("Midnight remix pack for creator duels");
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-card")).toHaveCount(0);
    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected BGM\./);
    await expect(soundTabGroup).not.toHaveAttribute("aria-label", /Selected Orb 수집음\./);
    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Orb\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Selected Player\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Retro arcade launch for creator heroes player direction/);
  });

  test("editing the brief during an in-flight studio pack request keeps stale completions from restoring cleared pack UI", async ({ page }) => {
    let releasePendingPack;
    const pendingPack = new Promise((resolve) => {
      releasePendingPack = resolve;
    });
    const staleMidnightPackResponse = waitForStudioPackResponse(page, ({ brief }) => brief === "Midnight remix pack for creator duels");
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      if (requestCount === 2) {
        await pendingPack;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture(payload.brief, {
          heroName: "3D Modeler",
          suffix: `request-${requestCount}`
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const assetPromptInput = page.locator(".asset-editor .prompt-input");
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const assetCardGroup = page.getByTestId("asset-card-group");
    const orbSoundTab = page.getByTestId("sound-tab-orb");
    const heroShowcaseQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Hero showcase model" });
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const copyCard = page.getByTestId("studio-copy-card");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await orbSoundTab.click();
    await heroShowcaseQueueItem.click();
    await socialQueueItem.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes launch copy");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await briefInput.fill("Midnight remix pack for creator duels");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await briefInput.fill("Sunset arcade relaunch for creator heroes");
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(copyCard).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected BGM\./);
    await expect(soundTabGroup).not.toHaveAttribute("aria-label", /Selected Orb 수집음\./);

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Orb\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Selected Player\./);

    releasePendingPack();
    await staleMidnightPackResponse;

    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(copyCard).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
  });

  test("editing the brief during an in-flight studio pack failure keeps stale errors from restoring cleared pack UI", async ({ page }) => {
    let releasePendingFailure;
    const pendingFailure = new Promise((resolve) => {
      releasePendingFailure = resolve;
    });
    const staleMidnightFailureResponse = waitForStudioPackResponse(page, ({ brief }) => brief === "Midnight remix pack for creator duels");
    let requestCount = 0;

    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON();
      if (requestCount === 2) {
        await pendingFailure;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, message: `studio pack timeout for ${payload.brief}` })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture(payload.brief, {
          heroName: "3D Modeler",
          suffix: `request-${requestCount}`
        }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const soundPromptInput = page.locator(".sound-editor .prompt-input");
    const assetPromptInput = page.locator(".asset-editor .prompt-input");
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const assetCardGroup = page.getByTestId("asset-card-group");
    const orbSoundTab = page.getByTestId("sound-tab-orb");
    const heroShowcaseQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Hero showcase model" });
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const copyCard = page.getByTestId("studio-copy-card");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await orbSoundTab.click();
    await heroShowcaseQueueItem.click();
    await socialQueueItem.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes launch copy");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await briefInput.fill("Midnight remix pack for creator duels");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Generating a reusable promo pack for 3D Modeler.");

    await briefInput.fill("Sunset arcade relaunch for creator heroes");
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(copyCard).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");
    await expect(soundTabGroup).toHaveAttribute("aria-label", /Selected BGM\./);
    await expect(soundTabGroup).not.toHaveAttribute("aria-label", /Selected Orb 수집음\./);

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
    await expect(assetCardGroup).toHaveAttribute("aria-label", /Selected Orb\./);
    await expect(assetCardGroup).not.toHaveAttribute("aria-label", /Selected Player\./);

    releasePendingFailure();
    await staleMidnightFailureResponse;

    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(copyCard).toHaveCount(0);
    await expect(page.getByText("studio pack timeout for Midnight remix pack for creator duels")).toHaveCount(0);

    await page.getByRole("button", { name: /^🎵 사운드$/ }).click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(soundPromptInput).toHaveValue("ambient game background music");

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    await expect(page.getByTestId("asset-card-orb")).toHaveClass(/selected/);
    await expect(assetPromptInput).toHaveValue("Orb");
  });

  test("switching heroes after loading social queue copy resets the next hero pack to its default copy", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      const payload = route.request().postDataJSON();
      const heroName = payload.heroId === "sounder" ? "Sound Crafter" : "3D Modeler";
      const brief = payload.heroId === "sounder"
        ? "Midnight remix pack for creator duels"
        : "Retro arcade launch for creator heroes";
      const fixture = createStudioPackFixture(brief, {
        heroName,
        suffix: payload.heroId
      });
      fixture.studioPack.marketingAngles = [
        {
          id: `${payload.heroId}-launch-x`,
          channel: "x",
          label: "X",
          copy: `${brief} X copy`,
          cta: `${heroName} CTA`
        },
        {
          id: `${payload.heroId}-launch-instagram`,
          channel: "instagram",
          label: "Instagram Reel",
          copy: `${brief} Instagram Reel copy`,
          cta: `${heroName} Reel CTA`
        }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const heroGroup = page.getByTestId("hero-select-group");
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const copyCard = page.getByTestId("studio-copy-card");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for 3D Modeler.");

    await socialQueueItem.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await sounderButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for Sound Crafter. Ready for a new campaign brief.");
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    await expect(page.getByTestId("studio-pack-status")).toHaveCount(0);
    await expect(copyCard).toHaveCount(0);

    await briefInput.fill("Midnight remix pack for creator duels");
    await generateButton.click();
    await expect(page.getByTestId("studio-pack-status")).toContainText("Fresh studio pack ready for Sound Crafter.");
    await expect(copyCard).toContainText("Midnight remix pack for creator duels X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("regenerating a cached pack restores the default social queue highlight for the active copy", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const fixture = createStudioPackFixture("Retro arcade launch for creator heroes", {
        suffix: "cached-social-reset"
      });
      fixture.studioPack.packId = "pack-cached-social-reset";
      fixture.studioPack.marketingAngles = [
        {
          id: "cached-launch-x",
          channel: "x",
          label: "X",
          copy: "Retro arcade launch for creator heroes X copy",
          cta: "Drop into the arena"
        },
        {
          id: "cached-launch-instagram",
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Retro arcade launch for creator heroes Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      fixture.studioPack.productionQueue = [
        { id: "queue-sound-cached", label: "Launch soundtrack", lane: "sound", key: "bgm", prompt: "Retro arcade launch bgm prompt" },
        { id: "queue-asset-player-cached", label: "Hero showcase model", lane: "asset", key: "player", prompt: "Retro arcade launch player direction" },
        { id: "queue-social-cached", label: "Social launch copy", lane: "social", key: "x", prompt: "Retro arcade launch for creator heroes X copy" }
      ];
      fixture.studioPack.cache_hit = requestCount > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });
    const copyCard = page.getByTestId("studio-copy-card");
    const studioStatus = page.getByTestId("studio-pack-status");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for 3D Modeler.");
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await generateButton.click();
    await expect(studioStatus).toContainText("CACHE HIT");
    await expect(studioStatus).toContainText("Reused the latest studio pack for 3D Modeler.");
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("studio pack status surfaces backend failures without leaving stale content behind", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "studio pack timeout" })
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const studioStatus = page.getByTestId("studio-pack-status");
    await expect(studioStatus).toContainText("PACK ERROR");
    await expect(studioStatus).toContainText("Studio pack request failed. studio pack timeout");
    await expect(studioStatus).toHaveAttribute("aria-label", /Studio pack status\. Error\. PACK ERROR\. Studio pack request failed\. studio pack timeout/);
    await studioStatus.focus();
    await expect(studioStatus).toBeFocused();
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
  });

  test("studio pack blocks blank briefs before making a request", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Unexpected request", { suffix: "unexpected" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });

    await briefInput.fill("   ");
    await generateButton.click();

    const studioStatus = page.getByTestId("studio-pack-status");
    await expect(studioStatus).toContainText("BRIEF REQUIRED");
    await expect(studioStatus).toContainText("Enter a campaign brief before generating a studio pack.");
    await expect(studioStatus).toHaveAttribute(
      "aria-label",
      "Studio pack status. Error. BRIEF REQUIRED. Enter a campaign brief before generating a studio pack."
    );
    await studioStatus.focus();
    await expect(studioStatus).toBeFocused();
    await expect(page.locator(".studio-pack-card")).toHaveCount(0);
    expect(requestCount).toBe(0);

    await briefInput.fill("Creator soundtrack launch brief");
    await expect(studioStatus).toHaveCount(0);
    await generateButton.click();
    expect(requestCount).toBe(1);
  });

  test("studio pack card exposes a focusable summary label for the latest generated pack", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", { suffix: "retro" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const studioPackCard = page.getByTestId("studio-pack-card");
    const expectedLabel = "Studio pack. Retro arcade launch for creator heroes headline Retro arcade launch for creator heroes tagline fresh pack. 2 calls saved. 3/5 planned. 2 production queue items. 1 marketing angle.";

    await expect(studioPackCard).toContainText("Retro arcade launch for creator heroes headline");
    await expect(studioPackCard).toContainText("Retro arcade launch for creator heroes tagline");
    await expect(studioPackCard).toHaveAttribute("tabindex", "0");
    await expect(studioPackCard).toHaveAttribute("aria-label", expectedLabel);
    await expect(studioPackCard).toHaveAttribute("title", expectedLabel);
    await studioPackCard.focus();
    await expect(studioPackCard).toBeFocused();
  });

  test("sound and asset prompt collections expose focusable studio-pack summaries", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", { suffix: "retro" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const soundGroup = page.getByTestId("sound-tab-group");
    const soundSummary = "Sound prompt collection. 5 cues. Selected BGM. Current prompt Retro arcade launch for creator heroes bgm prompt. Available cues: BGM — Retro arcade launch for creator heroes bgm prompt. Orb 수집음 — Retro arcade launch for creator heroes orb prompt. 적 충돌음 — Retro arcade launch for creator heroes hit prompt. 승리음 — Retro arcade launch for creator heroes win prompt. 패배음 — Retro arcade launch for creator heroes lose prompt.";
    await expect(soundGroup).toHaveAttribute("role", "group");
    await expect(soundGroup).toHaveAttribute("tabindex", "0");
    await expect(soundGroup).toHaveAttribute("aria-label", soundSummary);
    await expect(soundGroup).toHaveAttribute("title", soundSummary);
    await soundGroup.focus();
    await expect(soundGroup).toBeFocused();

    await page.getByRole("button", { name: /^🧊 에셋$/ }).click();
    const assetGroup = page.getByTestId("asset-card-group");
    const assetSummary = "Asset direction collection. 3 assets. Selected Orb. Current direction Retro arcade launch for creator heroes orb direction. Available assets: Orb — Retro arcade launch for creator heroes orb direction. Enemy — Retro arcade launch for creator heroes enemy direction. Player — Retro arcade launch for creator heroes player direction.";
    await expect(assetGroup).toHaveAttribute("role", "group");
    await expect(assetGroup).toHaveAttribute("tabindex", "0");
    await expect(assetGroup).toHaveAttribute("aria-label", assetSummary);
    await expect(assetGroup).toHaveAttribute("title", assetSummary);
    await assetGroup.focus();
    await expect(assetGroup).toBeFocused();
  });

  test("marketing copy card exposes pending and ready clipboard feedback, then clears stale feedback when switching channels", async ({ page }) => {
    await page.evaluate(() => {
      window.__copiedText = "";
      window.__clipboardResolves = [];
      window.__clipboardSettled = 0;
      window.__resolveClipboardWrite = () => {
        const resolve = window.__clipboardResolves.shift();
        if (resolve) resolve();
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text) => new Promise((resolve) => {
            window.__copiedText = text;
            window.__clipboardResolves.push(() => {
              resolve();
              window.__clipboardSettled += 1;
            });
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

    await expect(copyCard).toHaveAttribute("tabindex", "0");
    await expect(copyCard).toHaveAttribute("aria-label", /Marketing copy card\. X\./);
    await expect(copyCard).toHaveAttribute("aria-label", /VARCO arena/);
    await expect(copyCard).toHaveAttribute("aria-label", /Call to action:/);
    await expect(copyCard).toHaveAttribute("title", /Marketing copy card\. X\./);
    await copyCard.focus();
    await expect(copyCard).toBeFocused();

    await copyButton.click();
    const copiedText = await page.evaluate(() => window.__copiedText);
    expect(copiedText).toContain("CTA:");
    expect(copiedText).toContain("VARCO arena");
    await expect(copyButton).toHaveText("Copying X copy...");

    const copyFeedback = page.getByTestId("studio-copy-feedback");
    await expect(copyFeedback).toContainText("Copying X copy to the clipboard...");
    await expect(copyFeedback).toHaveAttribute("role", "status");
    await expect(copyFeedback).toHaveAttribute("aria-label", "Marketing copy status. Pending. X. Copying X copy to the clipboard...");
    await copyFeedback.focus();
    await expect(copyFeedback).toBeFocused();

    await studioPanel.getByRole("button", { name: "Instagram Reel", exact: true }).click();
    await expect(copyCard).toContainText("Instagram Reel");
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await waitForClipboardSettlement(page);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");

    await copyButton.click();
    await page.evaluate(() => window.__resolveClipboardWrite());
    await expect(copyButton).toHaveText("Copied Instagram Reel copy");
    await expect(copyFeedback).toContainText(/instagram reel copy copied\./i);
    await expect(copyFeedback).toHaveAttribute("aria-label", "Marketing copy status. Ready. Instagram Reel. Instagram Reel copy copied.");
    await copyFeedback.focus();
    await expect(copyFeedback).toBeFocused();
  });

  test("marketing channel chips keep the social queue highlight aligned with the active copy", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      const fixture = createStudioPackFixture("Retro arcade launch for creator heroes", { suffix: "marketing-sync" });
      fixture.studioPack.marketingAngles = [
        {
          id: "launch-x",
          channel: "x",
          label: "X",
          copy: "Retro arcade launch for creator heroes X copy",
          cta: "Drop into the arena"
        },
        {
          id: "launch-instagram",
          channel: "instagram",
          label: "Instagram Reel",
          copy: "Retro arcade launch for creator heroes Instagram Reel copy",
          cta: "Swipe into the spotlight"
        }
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });
    const copyCard = page.getByTestId("studio-copy-card");

    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await socialQueueItem.click();
    await expect(copyCard).toContainText("X");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Instagram Reel");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await xAngleButton.click();
    await expect(copyCard).toContainText("X");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("marketing copy feedback surfaces clipboard failures with a keyboard-readable status", async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("clipboard permissions denied");
          },
        },
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const copyButton = page.getByTestId("studio-copy-button");
    const copyFeedback = page.getByTestId("studio-copy-feedback");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(copyFeedback).toContainText("Clipboard copy blocked. Try again after granting permissions.");
    await expect(copyFeedback).toHaveAttribute("role", "status");
    await expect(copyFeedback).toHaveAttribute("aria-label", "Marketing copy status. Error. X. Clipboard copy blocked. Try again after granting permissions.");
    await copyFeedback.focus();
    await expect(copyFeedback).toBeFocused();
  });

  test("marketing copy feedback stays cleared when a new pack is generated mid-copy", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardResolves = [];
      window.__clipboardSettled = 0;
      window.__resolveClipboardWrite = () => {
        const resolve = window.__clipboardResolves.shift();
        if (resolve) resolve();
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text) => new Promise((resolve) => {
            window.__clipboardResolves.push(() => {
              resolve();
              window.__clipboardSettled += 1;
            });
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
    await waitForClipboardSettlement(page);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy X copy");
  });

  test("cached pack reload clears stale clipboard feedback and restores the default social selection", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardResolves = [];
      window.__clipboardSettled = 0;
      window.__resolveClipboardWrite = () => {
        const resolve = window.__clipboardResolves.shift();
        if (resolve) resolve();
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => new Promise((resolve) => {
            window.__clipboardResolves.push(() => {
              resolve();
              window.__clipboardSettled += 1;
            });
          }),
        },
      });
    });

    let requestCount = 0;
    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const fixture = createCachedStudioPackSelectionFixture("Retro arcade launch for creator heroes", {
        suffix: "cached-copy-feedback"
      });
      fixture.studioPack.cache_hit = requestCount > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const copyButton = page.getByTestId("studio-copy-button");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const studioStatus = page.getByTestId("studio-pack-status");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for 3D Modeler.");
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes Instagram Reel copy");
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");

    await generateButton.click();
    await expect(studioStatus).toContainText("CACHE HIT");
    await expect(studioStatus).toContainText("Reused the latest studio pack for 3D Modeler.");
    await expect(copyFeedback).toHaveCount(0);
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.__resolveClipboardWrite());
    await waitForClipboardSettlement(page);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("cached pack reload keeps stale clipboard failures cleared while restoring the default social selection", async ({ page }) => {
    await page.evaluate(() => {
      window.__clipboardRejects = [];
      window.__clipboardSettled = 0;
      window.__rejectClipboardWrite = () => {
        const reject = window.__clipboardRejects.shift();
        if (reject) reject(new Error("clipboard permissions denied"));
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () => new Promise((resolve, reject) => {
            window.__clipboardRejects.push((error) => {
              reject(error);
              window.__clipboardSettled += 1;
            });
          }),
        },
      });
    });

    let requestCount = 0;
    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const fixture = createCachedStudioPackSelectionFixture("Retro arcade launch for creator heroes", {
        suffix: "cached-copy-error"
      });
      fixture.studioPack.cache_hit = requestCount > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const copyButton = page.getByTestId("studio-copy-button");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const studioStatus = page.getByTestId("studio-pack-status");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for 3D Modeler.");
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes Instagram Reel copy");
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copying Instagram Reel copy...");
    await expect(copyFeedback).toContainText("Copying Instagram Reel copy to the clipboard...");

    await generateButton.click();
    await expect(studioStatus).toContainText("CACHE HIT");
    await expect(studioStatus).toContainText("Reused the latest studio pack for 3D Modeler.");
    await expect(copyFeedback).toHaveCount(0);
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.__rejectClipboardWrite());
    await waitForClipboardSettlement(page);
    await expect(page.getByTestId("studio-copy-feedback")).toHaveCount(0);
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("cached pack reload clears clipboard-unavailable errors while restoring the default social selection", async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {},
      });
    });

    let requestCount = 0;
    await page.route("**/api/varco/studio-pack", async (route) => {
      requestCount += 1;
      const fixture = createCachedStudioPackSelectionFixture("Retro arcade launch for creator heroes", {
        suffix: "cached-copy-unavailable"
      });
      fixture.studioPack.cache_hit = requestCount > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const copyButton = page.getByTestId("studio-copy-button");
    const copyCard = page.getByTestId("studio-copy-card");
    const copyFeedback = page.getByTestId("studio-copy-feedback");
    const studioStatus = page.getByTestId("studio-pack-status");
    const socialQueueItem = page.getByTestId("studio-queue-item").filter({ hasText: "Social launch copy" });
    const xAngleButton = page.getByRole("button", { name: "X", exact: true });
    const instagramAngleButton = page.getByRole("button", { name: "Instagram Reel", exact: true });

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioStatus).toContainText("Fresh studio pack ready for 3D Modeler.");
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");

    await instagramAngleButton.click();
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes Instagram Reel copy");
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(instagramAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "false");

    await copyButton.click();
    await expect(copyButton).toHaveText("Copy Instagram Reel copy");
    await expect(copyFeedback).toContainText("Clipboard unavailable in this browser.");
    await expect(copyFeedback).toHaveAttribute("aria-label", "Marketing copy status. Error. Instagram Reel. Clipboard unavailable in this browser.");

    await generateButton.click();
    await expect(studioStatus).toContainText("CACHE HIT");
    await expect(studioStatus).toContainText("Reused the latest studio pack for 3D Modeler.");
    await expect(copyFeedback).toHaveCount(0);
    await expect(copyCard).toContainText("Retro arcade launch for creator heroes X copy");
    await expect(copyButton).toHaveText("Copy X copy");
    await expect(xAngleButton).toHaveAttribute("aria-pressed", "true");
    await expect(socialQueueItem).toHaveAttribute("aria-pressed", "true");
  });

  test("marketing copy channels support keyboard cycling and pressed-state accessibility", async ({ page }) => {
    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const channelGroup = page.getByTestId("studio-marketing-angle-group");
    const xChannel = channelGroup.getByRole("button", { name: "X", exact: true });
    const instagramChannel = channelGroup.getByRole("button", { name: "Instagram Reel", exact: true });
    const discordChannel = channelGroup.getByRole("button", { name: "Discord", exact: true });

    await expect(xChannel).toHaveAttribute("aria-pressed", "true");
    await expect(xChannel).toHaveAttribute("aria-description", "Show X marketing copy; currently selected.");
    await expect(instagramChannel).toHaveAttribute("aria-pressed", "false");
    await expect(instagramChannel).toHaveAttribute("aria-description", "Show Instagram Reel marketing copy.");

    await xChannel.focus();
    await expect(xChannel).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(instagramChannel).toBeFocused();
    await expect(instagramChannel).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Instagram Reel");
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy Instagram Reel copy");

    await page.keyboard.press("End");
    await expect(discordChannel).toBeFocused();
    await expect(discordChannel).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Discord");
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy Discord copy");

    await page.keyboard.press("Home");
    await expect(xChannel).toBeFocused();
    await expect(xChannel).toHaveAttribute("aria-pressed", "true");
    await expect(discordChannel).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("studio-copy-card")).toContainText("X");
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy X copy");

    await page.keyboard.press("ArrowLeft");
    await expect(discordChannel).toBeFocused();
    await expect(discordChannel).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Discord");
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy Discord copy");
  });

  test("production queue supports keyboard cycling and pressed-state accessibility", async ({ page }) => {
    await page.route("**/api/varco/studio-pack", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", { suffix: "retro" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    await studioPanel.locator("textarea").fill("Retro arcade launch for creator heroes");
    await studioPanel.getByRole("button", { name: "Generate Studio Pack" }).click();

    const queueGroup = page.getByTestId("studio-queue-group");
    const queueItems = queueGroup.locator('button[data-testid="studio-queue-item"]');
    const queueSound = queueGroup.getByRole("button", { name: /Launch soundtrack/i });
    const queueCopy = queueGroup.getByRole("button", { name: /Social launch copy/i });

    await expect(queueItems).toHaveCount(4);
    await expect(queueSound).toHaveAttribute("aria-pressed", "false");
    await expect(queueSound).toHaveAttribute("aria-description", "Load Launch soundtrack into sound prompt for bgm.");
    await expect(queueCopy).toHaveAttribute("aria-pressed", "true");
    await expect(queueCopy).toHaveAttribute("aria-description", "Load Social launch copy into marketing copy for x; currently selected.");

    await queueSound.focus();
    await expect(queueSound).toBeFocused();
    await page.keyboard.press("End");
    await expect(queueCopy).toBeFocused();
    await expect(queueCopy).toHaveAttribute("aria-pressed", "true");
    await expect(queueSound).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Launch retro");
    await expect(page.getByTestId("studio-copy-button")).toHaveText("Copy Launch retro copy");

    await page.keyboard.press("Home");
    await expect(queueSound).toBeFocused();
    await expect(queueSound).toHaveAttribute("aria-pressed", "true");
    await expect(queueCopy).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/Retro arcade launch/);

    await page.keyboard.press("ArrowLeft");
    await expect(queueCopy).toBeFocused();
    await expect(queueCopy).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("studio-copy-card")).toContainText("Launch retro");
  });

  test("hero selector supports keyboard cycling and pressed-state accessibility", async ({ page }) => {
    const heroGroup = page.getByTestId("hero-select-group");
    const modelerButton = heroGroup.getByRole("button", { name: "3D Modeler", exact: true });
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const faceweaverButton = heroGroup.getByRole("button", { name: "SyncFace Weaver", exact: true });
    const controlLegend = page.getByTestId("control-legend");
    const runBriefing = page.getByTestId("run-briefing");

    await expect(modelerButton).toHaveAttribute("aria-pressed", "true");
    await expect(modelerButton).toHaveAttribute("aria-description", "Select 3D Modeler; currently selected.");
    await expect(sounderButton).toHaveAttribute("aria-pressed", "false");
    await expect(sounderButton).toHaveAttribute("aria-description", "Select Sound Crafter.");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Hard-Light Shield. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Hard-Light Shield: Shield \+ heal \+ scatter enemies\./);
    await expect(page.locator(".xp-info")).toContainText("HP 6 / SPD 1");

    await modelerButton.focus();
    await expect(modelerButton).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(sounderButton).toBeFocused();
    await expect(sounderButton).toHaveAttribute("aria-pressed", "true");
    await expect(modelerButton).toHaveAttribute("aria-pressed", "false");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Bass Drop. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Bass Drop: Freeze enemies \+ protect your combo\./);
    await expect(page.locator(".xp-info")).toContainText("HP 5 / SPD 1");

    await page.keyboard.press("End");
    await expect(faceweaverButton).toBeFocused();
    await expect(faceweaverButton).toHaveAttribute("aria-pressed", "true");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Phase Rush. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Phase Rush: Speed \+ magnet burst for orb routing\./);
    await expect(page.locator(".xp-info")).toContainText("HP 4 / SPD 2");

    await page.keyboard.press("Home");
    await expect(modelerButton).toBeFocused();
    await expect(modelerButton).toHaveAttribute("aria-pressed", "true");
    await expect(faceweaverButton).toHaveAttribute("aria-pressed", "false");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Hard-Light Shield. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Hard-Light Shield: Shield \+ heal \+ scatter enemies\./);
    await expect(page.locator(".xp-info")).toContainText("HP 6 / SPD 1");

    await page.keyboard.press("ArrowLeft");
    await expect(faceweaverButton).toBeFocused();
    await expect(faceweaverButton).toHaveAttribute("aria-pressed", "true");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Phase Rush. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Phase Rush: Speed \+ magnet burst for orb routing\./);
    await expect(page.locator(".xp-info")).toContainText("HP 4 / SPD 2");
  });

  test("hero selector locks after the run starts until reset reopens hero choice", async ({ page }) => {
    const heroGroup = page.getByTestId("hero-select-group");
    const modelerButton = heroGroup.getByRole("button", { name: "3D Modeler", exact: true });
    const sounderButton = heroGroup.getByRole("button", { name: "Sound Crafter", exact: true });
    const heroLockHint = page.getByTestId("hero-lock-hint");
    const controlLegend = page.getByTestId("control-legend");
    const runBriefing = page.getByTestId("run-briefing");
    const timer = page.locator(".timer");
    const score = page.locator(".score");

    await page.getByRole("button", { name: "Start" }).click();
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          running: false,
          hasStartedRun: true,
          timer: 45,
          score: 12
        }
      });
    });

    await expect(modelerButton).toHaveAttribute("aria-disabled", "true");
    await expect(sounderButton).toHaveAttribute("aria-disabled", "true");
    await expect(modelerButton).toHaveAttribute("aria-description", "Select 3D Modeler; currently selected. Reset to change hero after a run starts.");
    await expect(sounderButton).toHaveAttribute("aria-description", "Select Sound Crafter. Reset to change hero after a run starts.");
    await expect(heroLockHint).toContainText("Locked • Reset to switch agents");
    await expect(heroLockHint).toHaveAttribute("aria-label", "Hero lock active. Reset to switch agents.");
    await expect(timer).toHaveText("45s");
    await expect(score).toHaveText("12");
    await expect(modelerButton).toHaveAttribute("aria-pressed", "true");
    await expect(sounderButton).toHaveAttribute("aria-pressed", "false");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Hard-Light Shield. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Hard-Light Shield: Shield \+ heal \+ scatter enemies\./);
    await expect(page.locator(".xp-info")).toContainText("HP 6 / SPD 1");

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(modelerButton).toHaveAttribute("aria-disabled", "false");
    await expect(sounderButton).toHaveAttribute("aria-disabled", "false");
    await expect(heroLockHint).toHaveCount(0);
    await expect(timer).toHaveText("60s");
    await expect(score).toHaveText("0");

    await sounderButton.click();
    await expect(sounderButton).toHaveAttribute("aria-pressed", "true");
    await expect(controlLegend).toHaveAttribute("aria-label", "Controls legend. Move with Arrow keys or WASD. Press Space to activate Bass Drop. Use Start or Pause to control the match timer. Reset opens a fresh live match.");
    await expect(runBriefing).toHaveAttribute("aria-label", /Bass Drop: Freeze enemies \+ protect your combo\./);
    await expect(page.locator(".xp-info")).toContainText("HP 5 / SPD 1");
  });

  test("betting and promo director controls expose stable labels through pending states", async ({ page }) => {
    let releaseBetResponse;
    const betResponsePending = new Promise((resolve) => {
      releaseBetResponse = resolve;
    });

    let releaseStudioResponse;
    const studioResponsePending = new Promise((resolve) => {
      releaseStudioResponse = resolve;
    });

    await page.route("**/api/match/bet", async (route) => {
      await betResponsePending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bet: {
            userName: "arena_fan",
            side: "player",
            amount: 120
          },
          odds: {
            player: 1.4,
            enemy: 2.1
          },
          pools: {
            player: 120,
            enemy: 0
          }
        })
      });
    });

    await page.route("**/api/varco/studio-pack", async (route) => {
      await studioResponsePending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createStudioPackFixture("Retro arcade launch for creator heroes", { heroName: "3D Modeler", suffix: "accessibility" }))
      });
    });

    const studioPanel = page.getByTestId("studio-pack-panel");
    const briefInput = studioPanel.locator("textarea");
    const generateButton = studioPanel.getByRole("button", { name: "Generate Studio Pack" });
    const betNameInput = page.getByTestId("bet-name-input");
    const betSideSelect = page.getByTestId("bet-side-select");
    const betAmountInput = page.getByTestId("bet-amount-input");
    const betSubmitButton = page.getByTestId("bet-submit-button");

    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Ready for a new campaign brief.");
    await expect(briefInput).toHaveAttribute("aria-label", "Studio brief. Describe one campaign brief for 3D Modeler and reuse it across sounds, assets, and social copy.");
    await expect(generateButton).toHaveAttribute("aria-label", "Generate Studio Pack. Build a reusable promo pack for 3D Modeler.");
    await expect(betNameInput).toHaveAttribute("title", "Betting user name. Enter the bettor name before placing a wager.");
    await expect(betSideSelect).toHaveAttribute("title", "Betting side. Choose whether the player or enemy wins.");
    await expect(betAmountInput).toHaveAttribute("title", "Betting amount. Enter the wager amount in credits.");
    await expect(betSubmitButton).toHaveAttribute("title", "Place bet. Submit the current wager.");

    await betNameInput.fill("arena_fan");
    await betAmountInput.fill("120");
    await betSubmitButton.click();
    await expect(betSubmitButton).toHaveAttribute("aria-label", "Place bet. Submitting the current wager.");

    await briefInput.fill("Retro arcade launch for creator heroes");
    await generateButton.click();
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Building a studio pack for 3D Modeler.");
    await expect(generateButton).toHaveAttribute("aria-label", "Generate Studio Pack. Building a reusable promo pack for 3D Modeler.");

    releaseBetResponse();
    releaseStudioResponse();

    await expect(betSubmitButton).toHaveAttribute("aria-label", "Place bet. Submit the current wager.");
    await expect(studioPanel).toHaveAttribute("aria-label", "Promo Director. Build one campaign brief into reusable sound, asset, and marketing prompts for 3D Modeler. Studio pack ready for 3D Modeler.");
    await expect(generateButton).toHaveAttribute("aria-label", "Generate Studio Pack. Build a reusable promo pack for 3D Modeler.");
  });

  test("director event cards are keyboard-readable and support vertical focus cycling", async ({ page }) => {
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          directorBeat: {
            id: "director-beat-focus-window",
            title: "Focus Window",
            text: "Combo boosts are live for the next beat."
          },
          directorBeatEndsAt: Date.now() + 60_000,
          swingEvent: {
            id: "swing-event-sponsor-drop",
            type: "rare-drop-ping",
            title: "Sponsor Drop",
            text: "A bonus core just landed near the south lane."
          },
          swingEventEndsAt: Date.now() + 60_000
        }
      });
    });

    const directorBeatCard = page.getByTestId("director-beat-card");
    const swingEventCard = page.getByTestId("swing-event-card");

    await expect(page.getByTestId("director-panel")).toContainText("Focus Window");
    await expect(page.getByTestId("director-panel")).toContainText("Sponsor Drop");
    await expect(directorBeatCard).toHaveAttribute("tabindex", "0");
    await expect(directorBeatCard).toHaveAttribute("aria-label", "Director beat. Focus Window. Combo boosts are live for the next beat.");
    await expect(directorBeatCard).toHaveAttribute("title", "Director beat. Focus Window. Combo boosts are live for the next beat.");
    await expect(swingEventCard).toHaveAttribute("tabindex", "0");
    await expect(swingEventCard).toHaveAttribute("aria-label", "Swing event. Sponsor Drop. A bonus core just landed near the south lane.");
    await expect(swingEventCard).toHaveAttribute("title", "Swing event. Sponsor Drop. A bonus core just landed near the south lane.");

    await directorBeatCard.focus();
    await expect(directorBeatCard).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(swingEventCard).toBeFocused();
    await page.keyboard.press("Home");
    await expect(directorBeatCard).toBeFocused();
    await page.keyboard.press("End");
    await expect(swingEventCard).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(directorBeatCard).toBeFocused();
  });

  test("director KPI cards are keyboard-readable and support horizontal focus cycling", async ({ page }) => {
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          bonusOrb: { x: 5, y: 5 },
          appliedAssets: {
            orb: "/debug/orb.glb",
            enemy: "/debug/enemy.glb",
            player: null
          },
          appliedSounds: {
            bgm: "/debug/bgm.mp3",
            orb: "/debug/orb.wav",
            hit: null,
            win: null,
            lose: null
          }
        }
      });
    });

    const directorKpiCards = page.getByTestId("director-kpi-card");
    await expect(directorKpiCards).toHaveCount(3);
    await expect(directorKpiCards.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(directorKpiCards.nth(0)).toHaveAttribute("aria-label", "Bonus core. Live.");
    await expect(directorKpiCards.nth(0)).toHaveAttribute("title", "Bonus core. Live.");
    await expect(directorKpiCards.nth(1)).toHaveAttribute("aria-label", "Live assets. 2/3.");
    await expect(directorKpiCards.nth(1)).toHaveAttribute("title", "Live assets. 2/3.");
    await expect(directorKpiCards.nth(2)).toHaveAttribute("aria-label", "Live cues. 2/5.");
    await expect(directorKpiCards.nth(2)).toHaveAttribute("title", "Live cues. 2/5.");

    await directorKpiCards.nth(0).focus();
    await expect(directorKpiCards.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(directorKpiCards.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(directorKpiCards.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(directorKpiCards.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(directorKpiCards.nth(2)).toBeFocused();
  });

  test("studio editor tabs support keyboard cycling and pressed-state accessibility", async ({ page }) => {
    const tabGroup = page.getByTestId("studio-editor-tab-group");
    const soundTab = tabGroup.getByRole("button", { name: "🎵 사운드", exact: true });
    const assetTab = tabGroup.getByRole("button", { name: "🧊 에셋", exact: true });
    const historyTab = tabGroup.getByRole("button", { name: "📋 이력", exact: true });

    await expect(soundTab).toHaveAttribute("aria-pressed", "true");
    await expect(soundTab).toHaveAttribute("aria-description", "Show the sound editor; currently selected.");
    await expect(assetTab).toHaveAttribute("aria-pressed", "false");
    await expect(assetTab).toHaveAttribute("aria-description", "Show the asset editor.");
    await expect(page.locator(".sound-editor")).toBeVisible();

    await soundTab.focus();
    await expect(soundTab).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(assetTab).toBeFocused();
    await expect(assetTab).toHaveAttribute("aria-pressed", "true");
    await expect(soundTab).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".asset-editor")).toBeVisible();

    await page.keyboard.press("End");
    await expect(historyTab).toBeFocused();
    await expect(historyTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".edit-history")).toBeVisible();

    await page.keyboard.press("Home");
    await expect(soundTab).toBeFocused();
    await expect(soundTab).toHaveAttribute("aria-pressed", "true");
    await expect(historyTab).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".sound-editor")).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(historyTab).toBeFocused();
    await expect(historyTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".edit-history")).toBeVisible();
  });

  test("edit history entries support keyboard cycling and keyboard apply", async ({ page }) => {
    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: {
          editHistory: [
            {
              id: "history-sound-v1",
              type: "sound",
              subType: "bgm",
              prompt: "Retro arena baseline loop",
              result: { audioUrl: "https://example.com/audio-v1.mp3" },
              appliedAt: null,
              versionNum: 1,
              latencyMs: 900,
              cacheHit: false
            },
            {
              id: "history-sound-v2",
              type: "sound",
              subType: "bgm",
              prompt: "Retro arena baseline loop extended mix",
              result: { audioUrl: "https://example.com/audio-v2.mp3" },
              appliedAt: null,
              versionNum: 2,
              latencyMs: 700,
              cacheHit: true
            }
          ]
        }
      });
    });

    const tabGroup = page.getByTestId("studio-editor-tab-group");
    await tabGroup.getByRole("button", { name: "📋 이력", exact: true }).click();

    const historyList = page.getByTestId("edit-history-list");
    const historyEntries = page.getByTestId("edit-history-entry");
    await expect(historyList).toHaveAttribute("aria-label", "Edit history list");
    await expect(historyEntries).toHaveCount(2);
    await expect(historyEntries.nth(0)).toHaveAttribute("aria-label", /Edit history 1 of 2\./);
    await expect(historyEntries.nth(0)).toHaveAttribute("aria-label", /Cache hit\./);
    await expect(historyEntries.nth(0)).toHaveAttribute("aria-description", "Press Enter or Space to apply this version.");
    await expect(historyEntries.nth(0)).toHaveAttribute("title", /Cache hit\./);
    await expect(historyEntries.nth(1)).toHaveAttribute("aria-label", /Edit history 2 of 2\./);
    await expect(historyEntries.nth(1)).toHaveAttribute("aria-description", /Press Enter or Space to apply this version\./);

    await historyEntries.nth(0).focus();
    await expect(historyEntries.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(historyEntries.nth(1)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(historyEntries.nth(0)).toBeFocused();

    await page.keyboard.press("End");
    await expect(historyEntries.nth(1)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(historyEntries.nth(0)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(historyEntries.nth(0)).toHaveAttribute("aria-label", /Currently applied\./);
    await expect(historyEntries.nth(0)).toHaveAttribute("aria-description", /Currently applied\./);
    await expect(historyEntries.nth(0)).toContainText("적용됨");

    const secondApplyButton = historyEntries.nth(1).getByRole("button", { name: "Apply", exact: true });
    await secondApplyButton.focus();
    await expect(secondApplyButton).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(secondApplyButton).toBeFocused();
    await expect(historyEntries.nth(1)).not.toBeFocused();

    await page.keyboard.press("Home");
    await expect(secondApplyButton).toBeFocused();
    await expect(historyEntries.nth(0)).not.toBeFocused();

    await page.keyboard.press("Enter");
    await expect(historyEntries.nth(1)).toHaveAttribute("aria-label", /Currently applied\./);
    await expect(historyEntries.nth(1)).toHaveAttribute("aria-description", /Currently applied\./);
    await expect(historyEntries.nth(1)).toContainText("적용됨");
  });

  test("asset editor cards support keyboard cycling and pressed-state accessibility", async ({ page }) => {
    await page.getByRole("button", { name: /에셋/ }).click();

    const assetCardGroup = page.getByTestId("asset-card-group");
    const orbCard = page.getByTestId("asset-card-orb");
    const enemyCard = page.getByTestId("asset-card-enemy");
    const playerCard = page.getByTestId("asset-card-player");

    await expect(assetCardGroup).toBeVisible();
    await expect(orbCard).toHaveAttribute("aria-pressed", "true");
    await expect(orbCard).toHaveAttribute("aria-description", "Show the Orb asset editor; currently selected.");
    await expect(enemyCard).toHaveAttribute("aria-pressed", "false");
    await expect(enemyCard).toHaveAttribute("title", "Show the Enemy asset editor.");

    await orbCard.focus();
    await expect(orbCard).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(enemyCard).toBeFocused();
    await expect(enemyCard).toHaveClass(/selected/);
    await expect(enemyCard).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("End");
    await expect(playerCard).toBeFocused();
    await expect(playerCard).toHaveClass(/selected/);

    await page.keyboard.press("Home");
    await expect(orbCard).toBeFocused();
    await expect(orbCard).toHaveClass(/selected/);

    await page.keyboard.press("ArrowLeft");
    await expect(playerCard).toBeFocused();
    await expect(playerCard).toHaveClass(/selected/);
  });

  test("sound cue tabs support keyboard cycling and pressed-state accessibility", async ({ page }) => {
    const soundTabGroup = page.getByTestId("sound-tab-group");
    const bgmTab = soundTabGroup.getByRole("button", { name: "BGM", exact: true });
    const orbTab = soundTabGroup.getByRole("button", { name: "Orb 수집음", exact: true });
    const loseTab = soundTabGroup.getByRole("button", { name: "패배음", exact: true });

    await expect(bgmTab).toHaveAttribute("aria-pressed", "true");
    await expect(bgmTab).toHaveAttribute("aria-description", "Show the BGM sound cue editor; currently selected.");
    await expect(orbTab).toHaveAttribute("aria-pressed", "false");
    await expect(orbTab).toHaveAttribute("aria-description", "Show the Orb 수집음 sound cue editor.");
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/ambient game background music/i);

    await bgmTab.focus();
    await expect(bgmTab).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(orbTab).toBeFocused();
    await expect(orbTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/collect orb pickup sound/i);

    await page.keyboard.press("End");
    await expect(loseTab).toBeFocused();
    await expect(loseTab).toHaveAttribute("aria-pressed", "true");
    await expect(loseTab).toHaveAttribute("aria-description", "Show the 패배음 sound cue editor; currently selected.");
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/game over defeat sound/i);

    await page.keyboard.press("Home");
    await expect(bgmTab).toBeFocused();
    await expect(bgmTab).toHaveAttribute("aria-pressed", "true");
    await expect(loseTab).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/ambient game background music/i);

    await page.keyboard.press("ArrowLeft");
    await expect(loseTab).toBeFocused();
    await expect(loseTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".sound-editor .prompt-input")).toHaveValue(/game over defeat sound/i);
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

  test("places a bet and keeps betting feedback keyboard-readable from pending to ready", async ({ page }) => {
    let releaseBetResponse;
    const betResponsePending = new Promise((resolve) => {
      releaseBetResponse = resolve;
    });

    await page.route("**/api/match/bet", async (route) => {
      const payload = route.request().postDataJSON();
      await betResponsePending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bet: {
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

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Submitting Enemy Win for 150.");
    await expect(betFeedback).toHaveAttribute("role", "status");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Pending. Submitting Enemy Win for 150.");
    await betFeedback.focus();
    await expect(betFeedback).toBeFocused();
    await expect(page.getByTestId("bet-submit-button")).toHaveText("Placing Bet...");

    releaseBetResponse();

    await expect(betFeedback).toContainText("arena_fan backed Enemy Win for 150.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Ready. arena_fan backed Enemy Win for 150.");
    await expect(page.getByTestId("bet-submit-button")).toHaveText("Place Bet");
    await expect(page.locator(".pool-bar-e")).toHaveAttribute("style", /width:\s*100%/);

    await page.getByTestId("bet-amount-input").fill("200");
    await expect(page.getByTestId("bet-feedback")).toHaveCount(0);
  });

  test("betting panel shows a live countdown badge for the current wager window", async ({ page }) => {
    const betStatusStrip = page.getByTestId("bet-status-strip");

    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting open");
    await expect(page.getByTestId("bet-status-note")).toContainText("60s left in match");
    await expect(betStatusStrip).toHaveAttribute("tabindex", "0");
    await expect(betStatusStrip).toHaveAttribute("aria-label", /LIVE WINDOW\. Betting open • 60s left in match/);

    await betStatusStrip.focus();
    await expect(betStatusStrip).toBeFocused();

    await page.evaluate(() => {
      window.__SAGA_DEBUG__.dispatch({
        type: "DEBUG_PATCH_STATE",
        patch: { running: true, timer: 12, score: 18, combo: 2, maxCombo: 2 }
      });
    });

    await expect(page.getByTestId("bet-status-note")).toContainText("12s left in match");
    await expect(betStatusStrip).toHaveAttribute("aria-label", /LIVE WINDOW\. Betting open • 12s left in match/);
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

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Enter a bettor name before placing a bet.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. Enter a bettor name before placing a bet.");
    await betFeedback.focus();
    await expect(betFeedback).toBeFocused();
    expect(requestCount).toBe(0);
  });

  test("betting panel shows closed-match guidance after the run ends", async ({ page }) => {
    const betStatusStrip = page.getByTestId("bet-status-strip");

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
    await expect(betStatusStrip).toHaveAttribute("aria-label", /CLOSED\. Betting closed • match .* ended after 60s\./);

    await betStatusStrip.focus();
    await expect(betStatusStrip).toBeFocused();

    await page.getByTestId("bet-submit-button").click();
    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Betting is closed until the next match starts.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. Betting is closed until the next match starts.");
  });

  test("betting panel hydrates a server-closed match from polling before the next bet", async ({ page }) => {
    let betRequestCount = 0;
    let matchState = {
      matchId: "match-closed-1",
      status: "running",
      startedAt: "2026-04-10T23:12:00.000Z",
      spectators: 144,
      pools: { player: 120, enemy: 80 },
      swingEvent: null,
      odds: { player: 1.8, enemy: 2.1 },
      totalBets: 3
    };

    await page.route("**/api/match/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          matchId: matchState.matchId,
          status: "running"
        })
      });
    });

    await page.route("**/api/match/state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          match: matchState
        })
      });
    });

    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: [] })
      });
    });

    await page.route("**/api/match/bet", async (route) => {
      betRequestCount += 1;
      await route.abort();
    });

    await page.reload();

    const firstPollResponse = await waitForApiResponse(page, "/api/match/state");
    const firstPollJson = await firstPollResponse.json();
    expect(firstPollJson.match.status).toBe("running");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");

    matchState = {
      ...matchState,
      status: "finished"
    };

    const closedPollResponse = await waitForApiResponse(page, "/api/match/state");
    const closedPollJson = await closedPollResponse.json();
    expect(closedPollJson.match.status).toBe("finished");

    const betStatusStrip = page.getByTestId("bet-status-strip");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("CLOSED");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting closed");
    await expect(betStatusStrip).toHaveAttribute("aria-label", /CLOSED\. Betting closed • match .* ended after 0s\./);

    await page.getByTestId("bet-name-input").fill("arena_fan");
    await page.getByTestId("bet-side-select").selectOption("enemy");
    await page.getByTestId("bet-amount-input").fill("120");
    await page.getByTestId("bet-submit-button").click();

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Betting is closed until the next match starts.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. Betting is closed until the next match starts.");
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("120");
    expect(betRequestCount).toBe(0);
  });

  test("betting panel returns to standby when polling hydrates a non-running match before the next round", async ({ page }) => {
    let betRequestCount = 0;
    let matchState = {
      matchId: "match-idle-1",
      status: "running",
      startedAt: "2026-04-11T13:58:00.000Z",
      spectators: 101,
      pools: { player: 40, enemy: 20 },
      swingEvent: null,
      odds: { player: 1.7, enemy: 2.3 },
      totalBets: 2
    };

    await page.route("**/api/match/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          matchId: matchState.matchId,
          status: "running"
        })
      });
    });

    await page.route("**/api/match/state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          match: matchState
        })
      });
    });

    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: [] })
      });
    });

    await page.route("**/api/match/bet", async (route) => {
      betRequestCount += 1;
      await route.abort();
    });

    await page.reload();

    const firstPollResponse = await waitForApiResponse(page, "/api/match/state");
    const firstPollJson = await firstPollResponse.json();
    expect(firstPollJson.match.status).toBe("running");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");

    matchState = {
      ...matchState,
      status: "idle",
      startedAt: null,
      pools: { player: 0, enemy: 0 },
      totalBets: 0
    };

    const idlePollResponse = await waitForApiResponse(page, "/api/match/state");
    const idlePollJson = await idlePollResponse.json();
    expect(idlePollJson.match.status).toBe("idle");

    const betStatusStrip = page.getByTestId("bet-status-strip");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("STANDBY");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting opens when the live match is ready.");
    await expect(betStatusStrip).toHaveAttribute("aria-label", "STANDBY. Betting opens when the live match is ready.");

    await page.getByTestId("bet-name-input").fill("arena_fan");
    await page.getByTestId("bet-side-select").selectOption("player");
    await page.getByTestId("bet-amount-input").fill("75");
    await page.getByTestId("bet-submit-button").click();

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Betting will open when the live match starts.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. Betting will open when the live match starts.");
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-side-select")).toHaveValue("player");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("75");
    expect(betRequestCount).toBe(0);
  });

  test("betting panel reopens the wager window when polling hydrates a fresh running match after standby", async ({ page }) => {
    let betRequestCount = 0;
    let submittedPayload = null;
    let matchState = {
      matchId: "match-reopen-seed",
      status: "running",
      startedAt: "2026-04-11T14:00:00.000Z",
      spectators: 120,
      pools: { player: 30, enemy: 20 },
      swingEvent: null,
      odds: { player: 1.8, enemy: 2.1 },
      totalBets: 2
    };

    await page.route("**/api/match/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          matchId: matchState.matchId,
          status: "running"
        })
      });
    });

    await page.route("**/api/match/state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          match: matchState
        })
      });
    });

    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: [] })
      });
    });

    await page.route("**/api/match/bet", async (route) => {
      betRequestCount += 1;
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          bet: {
            id: "bet-reopen-1",
            userName: submittedPayload.userName,
            side: submittedPayload.side,
            amount: submittedPayload.amount,
            matchId: matchState.matchId
          },
          pools: { player: 30, enemy: 85 },
          odds: { player: 2.4, enemy: 1.5 }
        })
      });
    });

    await page.reload();

    const firstPollResponse = await waitForApiResponse(page, "/api/match/state");
    const firstPollJson = await firstPollResponse.json();
    expect(firstPollJson.match.status).toBe("running");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");

    matchState = {
      ...matchState,
      status: "idle",
      startedAt: null,
      pools: { player: 0, enemy: 0 },
      odds: { player: 1.9, enemy: 1.9 },
      totalBets: 0
    };

    const idlePollResponse = await waitForApiResponse(page, "/api/match/state");
    const idlePollJson = await idlePollResponse.json();
    expect(idlePollJson.match.status).toBe("idle");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("STANDBY");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting opens when the live match is ready.");

    await page.getByTestId("bet-name-input").fill("arena_fan");
    await page.getByTestId("bet-side-select").selectOption("enemy");
    await page.getByTestId("bet-amount-input").fill("65");

    matchState = {
      matchId: "match-reopen-123456",
      status: "running",
      startedAt: "2026-04-11T14:05:00.000Z",
      spectators: 166,
      pools: { player: 30, enemy: 20 },
      swingEvent: null,
      odds: { player: 1.8, enemy: 2.1 },
      totalBets: 2
    };

    const reopenedPollResponse = await waitForApiResponse(page, "/api/match/state");
    const reopenedPollJson = await reopenedPollResponse.json();
    expect(reopenedPollJson.match.status).toBe("running");

    const betStatusStrip = page.getByTestId("bet-status-strip");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting open");
    await expect(page.getByTestId("bet-status-note")).toContainText("60s left in match 123456");
    await expect(betStatusStrip).toHaveAttribute("aria-label", /LIVE WINDOW\. Betting open • 60s left in match 123456\./);

    await page.getByTestId("bet-submit-button").click();

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("arena_fan backed Enemy Win for 65.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Ready. arena_fan backed Enemy Win for 65.");
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-side-select")).toHaveValue("enemy");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("65");
    expect(submittedPayload).toEqual({ userName: "arena_fan", side: "enemy", amount: 65 });
    expect(betRequestCount).toBe(1);
  });

  test("betting panel clears stale standby feedback when polling reopens a fresh live window", async ({ page }) => {
    let matchState = {
      matchId: "match-standby-seed",
      status: "idle",
      startedAt: null,
      spectators: 96,
      pools: { player: 0, enemy: 0 },
      swingEvent: null,
      odds: { player: 1.9, enemy: 1.9 },
      totalBets: 0
    };

    await page.route("**/api/match/start", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          matchId: matchState.matchId,
          status: matchState.status
        })
      });
    });

    await page.route("**/api/match/state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          match: matchState
        })
      });
    });

    await page.route("**/api/agent/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, logs: [] })
      });
    });

    await page.route("**/api/match/bet", async (route) => {
      await route.abort();
    });

    await page.reload();

    const initialPollResponse = await waitForApiResponse(page, "/api/match/state");
    const initialPollJson = await initialPollResponse.json();
    expect(initialPollJson.match.status).toBe("idle");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("STANDBY");

    await page.getByTestId("bet-name-input").fill("arena_fan");
    await page.getByTestId("bet-side-select").selectOption("player");
    await page.getByTestId("bet-amount-input").fill("90");
    await page.getByTestId("bet-submit-button").click();

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("Betting will open when the live match starts.");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. Betting will open when the live match starts.");

    matchState = {
      matchId: "match-live-654321",
      status: "running",
      startedAt: "2026-04-11T14:08:00.000Z",
      spectators: 188,
      pools: { player: 45, enemy: 30 },
      swingEvent: null,
      odds: { player: 1.7, enemy: 2.2 },
      totalBets: 3
    };

    const reopenedPollResponse = await waitForApiResponse(page, "/api/match/state");
    const reopenedPollJson = await reopenedPollResponse.json();
    expect(reopenedPollJson.match.status).toBe("running");

    const betStatusStrip = page.getByTestId("bet-status-strip");
    await expect(page.getByTestId("bet-status-chip")).toHaveText("LIVE WINDOW");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting open");
    await expect(page.getByTestId("bet-status-note")).toContainText("60s left in match 654321");
    await expect(betStatusStrip).toHaveAttribute("aria-label", /LIVE WINDOW\. Betting open • 60s left in match 654321\./);
    await expect(page.getByTestId("bet-feedback")).toHaveCount(0);
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-side-select")).toHaveValue("player");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("90");
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

    const betFeedback = page.getByTestId("bet-feedback");
    await expect(betFeedback).toContainText("betting is closed while match status is finished");
    await expect(betFeedback).toHaveAttribute("aria-label", "Bet status. Error. betting is closed while match status is finished");
    await betFeedback.focus();
    await expect(betFeedback).toBeFocused();
    await expect(page.getByTestId("bet-status-chip")).toHaveText("CLOSED");
    await expect(page.getByTestId("bet-status-note")).toContainText("Betting closed");
    await expect(page.getByTestId("bet-name-input")).toHaveValue("arena_fan");
    await expect(page.getByTestId("bet-amount-input")).toHaveValue("120");
  });

  test("sound editor keeps the latest cue result keyboard-readable and applies it from the result card", async ({ page }) => {
    const soundPrompt = page.locator(".sound-editor .prompt-input");
    await soundPrompt.fill("victory sting for sponsor-ready arcade arena");
    await page.locator(".sound-editor .regenerate-btn").click();

    const soundStatus = page.getByTestId("sound-generation-status");
    await expect(soundStatus).toContainText("Sound ready");
    await expect(soundStatus).toHaveAttribute("role", "status");
    await expect(soundStatus).toHaveAttribute("aria-label", /Sound generation status\. Ready\. BGM cue\. Sound ready\./);
    await soundStatus.focus();
    await expect(soundStatus).toBeFocused();

    const soundResult = page.getByTestId("sound-generation-result");
    await expect(soundResult).toBeVisible();
    await expect(soundResult).toHaveAttribute("aria-label", /Latest BGM sound result\./);
    await expect(soundResult).toHaveAttribute("aria-description", "Press Enter or Space to apply the latest BGM sound result.");
    await expect(soundResult.getByLabel("Latest BGM sound preview")).toBeVisible();
    await expect(soundResult.getByRole("button", { name: "Apply latest BGM sound result to the game" })).toBeVisible();

    await soundResult.focus();
    await expect(soundResult).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("sound-version-history")).toContainText("적용됨");
  });

  test("sound version history supports keyboard review and apply", async ({ page }) => {
    const soundPrompt = page.locator(".sound-editor .prompt-input");

    await soundPrompt.fill("victory sting for sponsor-ready arcade arena");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.getByTestId("sound-generation-result")).toBeVisible();
    await page.getByTestId("sound-generation-result").getByRole("button", { name: /Apply/ }).click();

    await soundPrompt.fill("midnight sponsor countdown sting");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.getByTestId("sound-generation-result")).toBeVisible();

    const versionHistory = page.getByTestId("sound-version-history");
    const versionEntries = page.getByTestId("sound-version-entry");
    await expect(versionHistory).toHaveAttribute("aria-label", "Sound version history list");
    await expect(versionEntries).toHaveCount(2);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-label", /Sound version 1 of 2\./);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-description", "Press Enter or Space to apply this sound version.");
    await expect(versionEntries.nth(1)).toHaveAttribute("aria-description", "Currently applied.");

    await versionEntries.nth(0).focus();
    await expect(versionEntries.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(versionEntries.nth(1)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(versionEntries.nth(0)).toBeFocused();

    await page.keyboard.press("End");
    await expect(versionEntries.nth(1)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(versionEntries.nth(0)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-label", /Currently applied\./);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-description", "Currently applied.");
    await expect(versionEntries.nth(0)).toContainText("적용됨");
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
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute(
      "aria-label",
      "Sound generation status. Error. BGM cue. Sound generation failed. Upstream sound render timed out Result ID mock-sound-fail."
    );
    await status.focus();
    await expect(status).toBeFocused();
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

    const staleSoundResponse = waitForApiResponse(page, "/api/varco/text2sound");
    await page.locator(".sound-editor .prompt-input").fill("slow-burn sponsor anthem");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("⏳ Generating...");

    await page.getByTestId("sound-tab-win").click();
    await expect(page.getByTestId("sound-tab-win")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("▶ 재생성");
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);

    releaseGeneration();
    await staleSoundResponse;

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

    const staleSoundResponse = waitForApiResponse(page, "/api/varco/text2sound");
    await page.locator(".sound-editor .prompt-input").fill("glitch sponsor outro");
    await page.locator(".sound-editor .regenerate-btn").click();
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("⏳ Generating...");

    await page.getByTestId("sound-tab-win").click();
    await expect(page.getByTestId("sound-tab-win")).toHaveClass(/active/);
    await expect(page.locator(".sound-editor .regenerate-btn")).toHaveText("▶ 재생성");
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);

    releaseGeneration();
    await staleSoundResponse;

    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);

    await page.getByTestId("sound-tab-bgm").click();
    await expect(page.getByTestId("sound-tab-bgm")).toHaveClass(/active/);
    await expect(page.getByTestId("sound-generation-status")).toHaveCount(0);
    await expect(page.getByTestId("sound-generation-result")).toHaveCount(0);
    await expect(page.getByTestId("sound-version-history")).toHaveCount(0);
  });

  test("asset editor keeps the latest 3D result keyboard-readable and applies it from the result card", async ({ page }) => {
    await page.getByRole("button", { name: /에셋/ }).click();

    const directionInput = page.locator(".asset-editor .prompt-input");
    await directionInput.fill("hero orb with premium holographic sponsor finish");
    await page.locator(".asset-editor .regenerate-btn").click();

    const assetStatus = page.getByTestId("asset-conversion-status");
    await expect(assetStatus).toContainText("Preview ready");
    await expect(assetStatus).toHaveAttribute("role", "status");
    await expect(assetStatus).toHaveAttribute("aria-label", /Asset conversion status\. Ready\. Orb asset\. Preview ready\./);
    await assetStatus.focus();
    await expect(assetStatus).toBeFocused();

    const assetResult = page.getByTestId("asset-generation-result");
    await expect(assetResult).toBeVisible();
    await expect(assetResult).toHaveAttribute("aria-label", /Latest Orb asset preview\./);
    await expect(assetResult).toHaveAttribute("aria-description", "Press Enter or Space to apply the latest Orb asset result.");
    await expect(assetResult.locator("model-viewer")).toHaveAttribute("aria-label", "Latest Orb 3D preview");
    await expect(assetResult.getByRole("button", { name: "Apply latest Orb asset result to the game" })).toBeVisible();

    await assetResult.focus();
    await expect(assetResult).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("asset-version-history")).toContainText("적용됨");
    await expect(page.getByTestId("arena-status-strip")).toContainText("Assets live: 1/3");
  });

  test("asset version history supports keyboard review and apply", async ({ page }) => {
    await page.getByRole("button", { name: /에셋/ }).click();

    const directionInput = page.locator(".asset-editor .prompt-input");
    await directionInput.fill("hero orb with premium holographic sponsor finish");
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-generation-result")).toBeVisible();
    await page.getByTestId("asset-generation-result").getByRole("button", { name: /Apply/ }).click();

    await directionInput.fill("hero orb with molten sponsor trim");
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-generation-result")).toBeVisible();

    const versionHistory = page.getByTestId("asset-version-history");
    const versionEntries = page.getByTestId("asset-version-entry");
    await expect(versionHistory).toHaveAttribute("aria-label", "Asset version history list");
    await expect(versionEntries).toHaveCount(2);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-label", /Asset version 1 of 2\./);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-description", "Press Enter or Space to apply this asset version.");
    await expect(versionEntries.nth(1)).toHaveAttribute("aria-description", "Currently applied.");

    await versionEntries.nth(0).focus();
    await expect(versionEntries.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(versionEntries.nth(1)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(versionEntries.nth(0)).toBeFocused();

    await page.keyboard.press("End");
    await expect(versionEntries.nth(1)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(versionEntries.nth(0)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-label", /Currently applied\./);
    await expect(versionEntries.nth(0)).toHaveAttribute("aria-description", "Currently applied.");
    await expect(versionEntries.nth(0)).toContainText("적용됨");
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
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-label", /Asset conversion status\. Ready\. Orb asset\. Preview ready\./);
    await status.focus();
    await expect(status).toBeFocused();
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
    await expect(status).toHaveAttribute("role", "status");
    await expect(
      status
    ).toHaveAttribute(
      "aria-label",
      "Asset conversion status. Error. Orb asset. Conversion failed. Upstream render timed out Request ID mock-request-fail."
    );
    await status.focus();
    await expect(status).toBeFocused();
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

    const stalePollResponse = waitForApiResponse(page, "/api/varco/image-to-3d/result/mock-request-stale-success");
    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-conversion-status")).toContainText("mock-request-stale-success");

    await page.getByTestId("asset-card-enemy").click();
    await expect(page.getByTestId("asset-card-enemy")).toHaveClass(/selected/);
    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.locator(".asset-editor .regenerate-btn")).toHaveText("▶ 3D 변환");

    releasePoll();
    await stalePollResponse;

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

    const stalePollResponse = waitForApiResponse(page, "/api/varco/image-to-3d/result/mock-request-stale-fail");
    await page.getByRole("button", { name: /에셋/ }).click();
    await page.locator(".asset-editor .regenerate-btn").click();
    await expect(page.getByTestId("asset-conversion-status")).toContainText("mock-request-stale-fail");

    await page.getByTestId("asset-card-enemy").click();
    await expect(page.getByTestId("asset-card-enemy")).toHaveClass(/selected/);
    await expect(page.getByTestId("asset-conversion-status")).toHaveCount(0);
    await expect(page.locator(".asset-editor .regenerate-btn")).toHaveText("▶ 3D 변환");

    releasePoll();
    await stalePollResponse;

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
    let resolveFirstShareSettled;
    const firstShareSettled = new Promise((resolve) => {
      resolveFirstShareSettled = resolve;
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
        resolveFirstShareSettled();
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
    const shareFeedback = page.getByTestId("share-feedback");
    await expect(shareFeedback).toContainText("Preparing X share link...");
    await expect(shareFeedback).toHaveAttribute("role", "status");
    await expect(shareFeedback).toHaveAttribute("aria-label", "Share status. Pending X. Preparing X share link...");
    await shareFeedback.focus();
    await expect(shareFeedback).toBeFocused();

    await shareButtonTelegram.click();
    await expect(shareButtonTelegram).toHaveText("Shared Telegram");
    await expect(shareFeedback).toContainText("Opened Telegram share link.");
    await expect(shareFeedback).toHaveAttribute("aria-label", "Share status. Ready Telegram. Opened Telegram share link.");
    await expect(page.getByTestId("share-button-x")).toHaveText("Share X");

    let openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual(["https://share.example/telegram-second"]);

    releaseFirstShare();
    await firstShareSettled;

    await expect(page.getByTestId("share-feedback")).toContainText("Opened Telegram share link.");
    openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual(["https://share.example/telegram-second"]);
  });

  test("share panel keyboard navigation moves focus without triggering share requests", async ({ page }) => {
    await page.evaluate(() => {
      window.__openedUrls = [];
      window.open = (url) => {
        window.__openedUrls.push(url);
        return null;
      };
    });

    let shareRequestCount = 0;
    await page.route("**/api/share/sns", async (route) => {
      shareRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          links: {
            x: "https://share.example/x",
            facebook: "https://share.example/facebook",
            telegram: "https://share.example/telegram"
          }
        })
      });
    });

    const shareButtonGroup = page.getByTestId("share-button-group");
    const shareButtonX = page.getByTestId("share-button-x");
    const shareButtonFacebook = page.getByTestId("share-button-facebook");
    const shareButtonTelegram = page.getByTestId("share-button-telegram");

    await expect(shareButtonGroup).toHaveAttribute("role", "group");
    await expect(shareButtonGroup).toHaveAttribute("aria-label", "Share match recap");
    await expect(shareButtonX).toHaveAttribute("aria-label", "Share X. Open the X share flow.");
    await expect(shareButtonFacebook).toHaveAttribute("title", "Share Facebook");
    await expect(shareButtonTelegram).toHaveAttribute("title", "Share Telegram");

    await shareButtonX.focus();
    await expect(shareButtonX).toBeFocused();

    await shareButtonX.press("ArrowRight");
    await expect(shareButtonFacebook).toBeFocused();
    await expect(page.getByTestId("share-feedback")).toHaveCount(0);

    await shareButtonFacebook.press("End");
    await expect(shareButtonTelegram).toBeFocused();
    await expect(page.getByTestId("share-feedback")).toHaveCount(0);

    await shareButtonTelegram.press("Home");
    await expect(shareButtonX).toBeFocused();

    await shareButtonX.press("ArrowLeft");
    await expect(shareButtonTelegram).toBeFocused();
    await expect(page.getByTestId("share-feedback")).toHaveCount(0);

    let openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual([]);
    expect(shareRequestCount).toBe(0);

    await shareButtonTelegram.press("Enter");
    const shareFeedback = page.getByTestId("share-feedback");
    await expect(shareFeedback).toContainText("Opened Telegram share link.");
    await expect(shareButtonTelegram).toHaveText("Shared Telegram");
    await expect(shareButtonTelegram).toHaveAttribute("title", "Shared Telegram");
    await expect(shareButtonTelegram).toHaveAttribute("aria-label", "Shared Telegram. Open the Telegram share flow.");

    openedUrls = await page.evaluate(() => window.__openedUrls.slice());
    expect(openedUrls).toEqual(["https://share.example/telegram"]);
    expect(shareRequestCount).toBe(1);
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

    const shareFeedback = page.getByTestId("share-feedback");
    await expect(shareFeedback).toContainText("share backend unavailable");
    await expect(shareFeedback).toHaveAttribute("aria-label", "Share status. Error Facebook. share backend unavailable");
    await shareButtonFacebook.focus();
    await shareFeedback.focus();
    await expect(shareFeedback).toBeFocused();
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

    const leaderboardRecap = page.getByTestId("leaderboard-recap");
    await expect(page.getByTestId("leaderboard-recap-chip")).toHaveText("TOP TARGET");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("Beat 145 pts from SyncFace Weaver");
    await expect(page.getByTestId("leaderboard-recap-detail")).toContainText("120 pts currently enters the top 5");
    await expect(leaderboardRecap).toHaveAttribute("tabindex", "0");
    await expect(leaderboardRecap).toHaveAttribute("aria-label", "TOP TARGET. Beat 145 pts from SyncFace Weaver. 120 pts currently enters the top 5.");
    await leaderboardRecap.focus();
    await expect(leaderboardRecap).toBeFocused();
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

    const seasonSummary = page.getByTestId("leaderboard-season-summary");
    const rivalSummary = page.getByTestId("leaderboard-rival-summary");
    await expect(seasonSummary).toHaveAttribute("tabindex", "0");
    await expect(seasonSummary).toHaveAttribute("aria-label", "SEASON LEAD. SyncFace Weaver leads the season with 145 pts and a 6x benchmark combo.");
    await expect(rivalSummary).toHaveAttribute("tabindex", "0");
    await expect(rivalSummary).toHaveAttribute("aria-label", "RIVAL TARGET. 3D Modeler currently defends the final slot at 120 pts / 3x combo.");

    const momentumCard = page.getByTestId("leaderboard-control-momentum");
    await expect(momentumCard).toHaveAttribute("tabindex", "0");
    await expect(momentumCard).toHaveAttribute("aria-label", "MOMENTUM. Sound Crafter is riding a 3-run top-5 streak and has peaked at #2.");
    await momentumCard.focus();
    await expect(momentumCard).toBeFocused();

    const controlRows = page.getByTestId("leaderboard-control-item");
    await expect(controlRows).toHaveCount(3);
    await expect(controlRows.nth(0)).toContainText("Sound Crafter");
    await expect(controlRows.nth(0)).toContainText("DOUBLE HOLD");
    await expect(controlRows.nth(0)).toContainText("#2 best · 2 slots · 132 pts · 5x combo");
    await expect(controlRows.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(controlRows.nth(0)).toHaveAttribute("aria-label", "Sound Crafter. DOUBLE HOLD. #2 best · 2 slots · 132 pts · 5x combo");
    await expect(controlRows.nth(1)).toContainText("3D Modeler");
    await expect(controlRows.nth(1)).toContainText("DOUBLE HOLD");
    await expect(controlRows.nth(2)).toContainText("SyncFace Weaver");
    await expect(controlRows.nth(2)).toContainText("PACE SETTER");
    await expect(controlRows.nth(2)).toContainText("#1 best · 1 slot · 145 pts · 6x combo");
    await expect(controlRows.nth(2)).toHaveAttribute("aria-label", "SyncFace Weaver. PACE SETTER. #1 best · 1 slot · 145 pts · 6x combo");
    await controlRows.nth(2).focus();
    await expect(controlRows.nth(2)).toBeFocused();

    const highScoreRows = page.getByTestId("high-score-item");
    await expect(highScoreRows).toHaveCount(5);
    await expect(highScoreRows.nth(0)).toHaveAttribute("tabindex", "0");
    await expect(highScoreRows.nth(0)).toHaveAttribute("aria-label", "Leaderboard rank 1. SyncFace Weaver. 145 pts. 6x combo on 2026-04-03.");
    await expect(highScoreRows.nth(1)).toHaveAttribute("aria-label", "Leaderboard rank 2. Sound Crafter. 132 pts. 5x combo on 2026-04-04.");
    await highScoreRows.nth(0).focus();
    await expect(highScoreRows.nth(0)).toBeFocused();
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
    const archiveEntryTrends = page.getByTestId("leaderboard-archive-entry-trend");
    const archiveEntryForms = page.getByTestId("leaderboard-archive-entry-form");
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 4 archived runs across the season table.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("3 heroes logged 5 archived runs. 4/5 stayed inside the top 5. Latest archive: Sound Crafter at 118 pts (outside the top 5).");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("CUTLINE DELTA");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive needs about 12 more pts to re-enter today's live top 5.");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("STREAK SNAPPED");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("Sound Crafter's best run was 2 straight top-5 archives.");
    await expect(page.getByTestId("leaderboard-archive-filters")).toBeVisible();
    await expect(archiveRows).toHaveCount(4);
    await expect(archiveEntryTrends).toHaveCount(4);
    await expect(archiveEntryForms).toHaveCount(4);
    await expect(archiveRows.nth(0)).toContainText("Sound Crafter");
    await expect(archiveRows.nth(0)).toContainText("OUTSIDE TOP 5");
    await expect(archiveRows.nth(0)).toContainText("118 pts · 4x combo · 2026-04-06");
    await expect(archiveEntryTrends.nth(0)).toContainText("SLIPPED");
    await expect(archiveEntryTrends.nth(0)).toContainText("Sound Crafter fell from #2 to outside the top 5.");
    await expect(archiveEntryForms.nth(0)).toContainText("RECENT FORM");
    await expect(archiveRows.nth(0).getByTestId("leaderboard-archive-entry-form-chip")).toHaveText(["OUT", "#2", "#3"]);
    await expect(archiveRows.nth(1)).toContainText("SyncFace Weaver");
    await expect(archiveRows.nth(1)).toContainText("#1 FINISH");
    await expect(archiveRows.nth(1).getByTestId("leaderboard-archive-entry-form-chip")).toHaveText(["#1"]);
    await expect(archiveRows.nth(2)).toContainText("Sound Crafter");
    await expect(archiveEntryTrends.nth(2)).toContainText("CLIMBING");
    await expect(archiveEntryTrends.nth(2)).toContainText("Sound Crafter improved from #3 to #2.");
    await expect(archiveRows.nth(3)).toContainText("Sound Crafter");

    const archiveFilters = page.getByTestId("leaderboard-archive-filters");
    await archiveFilters.getByRole("button", { name: "Sound Crafter", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 3 archived runs for Sound Crafter.");
    await expect(page.getByTestId("leaderboard-archive-story")).toContainText("Sound Crafter has 3 archived runs, peaked at #2, and last archived run landed outside the top 5.");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("SOUND CRAFTER RETURN PATH");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive is 20 pts below their last top-5 finish (#2 at 138 pts).");
    await expect(archiveRows).toHaveCount(3);
    await expect(archiveEntryTrends).toHaveCount(3);
    await expect(archiveEntryForms).toHaveCount(3);
    await expect(archiveRows.nth(0)).toContainText("118 pts · 4x combo · 2026-04-06");
    await expect(archiveEntryTrends.nth(0)).toContainText("SLIPPED");
    await expect(archiveRows.nth(0).getByTestId("leaderboard-archive-entry-form-chip")).toHaveText(["OUT", "#2", "#3"]);
    await expect(archiveRows.nth(2)).toContainText("131 pts · 5x combo · 2026-04-03");
    await expect(archiveEntryTrends.nth(2)).toContainText("SEASON OPENER");

    await archiveFilters.getByRole("button", { name: "SyncFace Weaver", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 1 archived run for SyncFace Weaver.");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("PACE SETTER");
    await expect(page.getByTestId("leaderboard-archive-trend")).toContainText("SyncFace Weaver owns the latest #1 archive.");
    await expect(archiveRows).toHaveCount(1);
    await expect(archiveEntryTrends).toHaveCount(1);
    await expect(archiveEntryForms).toHaveCount(1);
    await expect(archiveRows.nth(0)).toContainText("#1 FINISH");
    await expect(archiveRows.nth(0).getByTestId("leaderboard-archive-entry-form-chip")).toHaveText(["#1"]);
    await expect(archiveEntryTrends.nth(0)).toContainText("SEASON OPENER");

    await archiveFilters.getByRole("button", { name: "All heroes", exact: true }).click();
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 4 archived runs across the season table.");
    await expect(archiveRows).toHaveCount(4);
    await expect(page.getByTestId("leaderboard-control-list")).not.toContainText("Sound Crafter");
  });

  test("leaderboard archive delta falls back to today's cutline when a historical top-5 finish slips off the live board", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 150, combo: 6, date: "2026-04-06", createdAt: "2026-04-06T10:00:00.000Z" },
        { hero: "3D Modeler", score: 144, combo: 5, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 140, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 137, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 133, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 129, combo: 4, date: "2026-04-07", createdAt: "2026-04-07T08:00:00.000Z", placement: 5, qualified: true },
        { hero: "SyncFace Weaver", score: 150, combo: 6, date: "2026-04-06", createdAt: "2026-04-06T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "3D Modeler", score: 144, combo: 5, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 2, qualified: true }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("CUTLINE DELTA");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive needs about 5 more pts to re-enter today's live top 5.");
    await expect(page.getByTestId("leaderboard-archive-delta")).not.toContainText("LEADER GAP");
    await expect(page.getByTestId("leaderboard-archive-item").first()).toContainText("#5 FINISH");
    await expect(page.getByTestId("leaderboard-archive-item").first()).toContainText("129 pts · 4x combo · 2026-04-07");
  });

  test("leaderboard archive delta still recognizes date-only archived rows that remain on the live board", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "SyncFace Weaver", score: 150, combo: 6, date: "2026-04-06", createdAt: "2026-04-06T10:00:00.000Z" },
        { hero: "3D Modeler", score: 144, combo: 5, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 140, combo: 5, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 137, combo: 5, date: "2026-04-03", createdAt: "2026-04-03T10:00:00.000Z" },
        { hero: "3D Modeler", score: 133, combo: 4, date: "2026-04-02", createdAt: "2026-04-02T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 140, combo: 5, date: "2026-04-04", placement: 3, qualified: true },
        { hero: "SyncFace Weaver", score: 150, combo: 6, date: "2026-04-01", createdAt: "2026-04-01T10:00:00.000Z", placement: 1, qualified: true }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("LEADER GAP");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive is 4 pts shy of 3D Modeler's higher live slot (#2 at 144 pts).");
    await expect(page.getByTestId("leaderboard-archive-delta")).not.toContainText("CUTLINE DELTA");
    await expect(page.getByTestId("leaderboard-archive-item").first()).toContainText("#3 FINISH");
  });

  test("leaderboard archive delta treats tied higher slots as recency losses when the live rival is newer", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("saga_highscores", JSON.stringify([
        { hero: "3D Modeler", score: 140, combo: 5, date: "2026-04-08", createdAt: "2026-04-08T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 140, combo: 5, date: "2026-04-07", createdAt: "2026-04-07T10:00:00.000Z" },
        { hero: "SyncFace Weaver", score: 134, combo: 4, date: "2026-04-06", createdAt: "2026-04-06T10:00:00.000Z" },
        { hero: "3D Modeler", score: 129, combo: 4, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z" },
        { hero: "Sound Crafter", score: 123, combo: 3, date: "2026-04-04", createdAt: "2026-04-04T10:00:00.000Z" }
      ]));
      localStorage.setItem("saga_highscore_history", JSON.stringify([
        { hero: "Sound Crafter", score: 140, combo: 5, date: "2026-04-07", createdAt: "2026-04-07T10:00:00.000Z", placement: 1, qualified: true },
        { hero: "3D Modeler", score: 129, combo: 4, date: "2026-04-05", createdAt: "2026-04-05T10:00:00.000Z", placement: 4, qualified: true }
      ]));
    });
    await page.reload();

    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("LEADER GAP");
    await expect(page.getByTestId("leaderboard-archive-delta")).toContainText("Sound Crafter's latest archive matches 3D Modeler's 140-pt / 5x line, but still trails that higher live slot on recency.");
    await expect(page.getByTestId("leaderboard-archive-delta")).not.toContainText("would flip that higher slot on recency");
    await expect(page.getByTestId("leaderboard-archive-item").first()).toContainText("#1 FINISH");
  });

  test("leaderboard archive controls expose keyboard-friendly labels for filters, summary cards, and recent-form chips", async ({ page }) => {
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

    const archiveFilters = page.getByTestId("leaderboard-archive-filters");
    const allHeroesFilter = archiveFilters.getByRole("button", { name: "All heroes", exact: true });
    const soundCrafterFilter = archiveFilters.getByRole("button", { name: "Sound Crafter", exact: true });
    await expect(allHeroesFilter).toHaveAttribute("aria-pressed", "true");
    await expect(allHeroesFilter).toHaveAttribute("aria-description", "Show archived runs for all heroes; currently selected.");
    await expect(soundCrafterFilter).toHaveAttribute("aria-pressed", "false");
    await expect(soundCrafterFilter).toHaveAttribute("aria-description", "Show archived runs for Sound Crafter.");

    await soundCrafterFilter.click();
    await expect(soundCrafterFilter).toHaveAttribute("aria-pressed", "true");
    await expect(soundCrafterFilter).toHaveAttribute("aria-description", "Show archived runs for Sound Crafter; currently selected.");
    await expect(allHeroesFilter).toHaveAttribute("aria-pressed", "false");
    await expect(allHeroesFilter).toHaveAttribute("aria-description", "Show archived runs for all heroes.");

    const syncFaceFilter = archiveFilters.getByRole("button", { name: "SyncFace Weaver", exact: true });
    await soundCrafterFilter.focus();
    await expect(soundCrafterFilter).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(syncFaceFilter).toBeFocused();
    await expect(syncFaceFilter).toHaveAttribute("aria-pressed", "true");
    await expect(soundCrafterFilter).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 1 archived run for SyncFace Weaver.");

    await page.keyboard.press("Home");
    await expect(allHeroesFilter).toBeFocused();
    await expect(allHeroesFilter).toHaveAttribute("aria-pressed", "true");
    await expect(syncFaceFilter).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 4 archived runs across the season table.");

    await page.keyboard.press("End");
    await expect(syncFaceFilter).toBeFocused();
    await expect(syncFaceFilter).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowLeft");
    await expect(soundCrafterFilter).toBeFocused();
    await expect(soundCrafterFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("leaderboard-archive-detail")).toContainText("Latest 3 archived runs for Sound Crafter.");

    const archiveStory = page.getByTestId("leaderboard-archive-story");
    const archiveDelta = page.getByTestId("leaderboard-archive-delta");
    const archiveTrend = page.getByTestId("leaderboard-archive-trend");
    await expect(archiveStory).toHaveAttribute("tabindex", "0");
    await expect(archiveStory).toHaveAttribute("aria-label", "SOUND CRAFTER STORY. Sound Crafter has 3 archived runs, peaked at #2, and last archived run landed outside the top 5.");
    await expect(archiveDelta).toHaveAttribute("tabindex", "0");
    await expect(archiveDelta).toHaveAttribute("aria-label", "SOUND CRAFTER RETURN PATH. Sound Crafter's latest archive is 20 pts below their last top-5 finish (#2 at 138 pts).");
    await expect(archiveTrend).toHaveAttribute("tabindex", "0");
    await expect(archiveTrend).toHaveAttribute("aria-label", "STREAK SNAPPED. Sound Crafter's best run was 2 straight top-5 archives.");
    await archiveTrend.focus();
    await expect(archiveTrend).toBeFocused();

    const archiveRows = page.getByTestId("leaderboard-archive-item");
    await expect(archiveRows.first()).toHaveAttribute("tabindex", "0");
    await expect(archiveRows.first()).toHaveAttribute("aria-label", "Sound Crafter. OUTSIDE TOP 5. 118 pts · 4x combo · 2026-04-06. SLIPPED. Sound Crafter fell from #2 to outside the top 5.");
    await archiveRows.first().focus();
    await expect(archiveRows.first()).toBeFocused();

    const entryTrends = page.getByTestId("leaderboard-archive-entry-trend");
    await expect(entryTrends.first()).toHaveAttribute("tabindex", "0");
    await expect(entryTrends.first()).toHaveAttribute("aria-label", "Sound Crafter. SLIPPED. Sound Crafter fell from #2 to outside the top 5.");
    await expect(entryTrends.nth(1)).toHaveAttribute("aria-label", "Sound Crafter. CLIMBING. Sound Crafter improved from #3 to #2.");

    const formGroups = page.getByTestId("leaderboard-archive-entry-form");
    await expect(formGroups.first()).toHaveAttribute("tabindex", "0");
    await expect(formGroups.first()).toHaveAttribute("aria-label", "Sound Crafter. RECENT FORM. Current archived run: outside the top 5. Previous archived run: rank 2. Previous archived run: rank 3.");

    const formChips = page.getByTestId("leaderboard-archive-entry-form-chip");
    await expect(formChips.first()).toHaveAttribute("tabindex", "0");
    await expect(formChips.first()).toHaveAttribute("aria-label", "Sound Crafter. Current archived run. outside the top 5. 118 pts · 4x combo · 2026-04-06.");
    await expect(formChips.nth(1)).toHaveAttribute("aria-label", "Sound Crafter. Previous archived run. rank 2. 138 pts · 5x combo · 2026-04-04.");
    await formGroups.first().focus();
    await expect(formGroups.first()).toBeFocused();
  });

  test("leaderboard board-control cards, archive trend chips, archive form groups, and archive form chips support keyboard cycling", async ({ page }) => {
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
    await controlRows.nth(0).focus();
    await expect(controlRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(controlRows.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(controlRows.nth(2)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(controlRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(controlRows.nth(2)).toBeFocused();

    const archiveEntryTrends = page.getByTestId("leaderboard-archive-entry-trend");
    await expect(archiveEntryTrends).toHaveCount(4);
    await archiveEntryTrends.nth(0).focus();
    await expect(archiveEntryTrends.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(archiveEntryTrends.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(archiveEntryTrends.nth(3)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(archiveEntryTrends.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(archiveEntryTrends.nth(3)).toBeFocused();

    const formGroups = page.getByTestId("leaderboard-archive-entry-form");
    await expect(formGroups).toHaveCount(4);
    await formGroups.nth(0).focus();
    await expect(formGroups.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(formGroups.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(formGroups.nth(3)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(formGroups.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(formGroups.nth(3)).toBeFocused();

    const firstFormChips = formGroups.first().getByTestId("leaderboard-archive-entry-form-chip");
    await expect(firstFormChips).toHaveCount(3);
    await firstFormChips.nth(0).focus();
    await expect(firstFormChips.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(firstFormChips.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(firstFormChips.nth(2)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(firstFormChips.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(firstFormChips.nth(2)).toBeFocused();
  });

  test("leaderboard summary cards, archive cards, and live rows support keyboard cycling", async ({ page }) => {
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

    const seasonSummary = page.getByTestId("leaderboard-season-summary");
    const rivalSummary = page.getByTestId("leaderboard-rival-summary");
    await seasonSummary.focus();
    await expect(seasonSummary).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(rivalSummary).toBeFocused();

    await page.keyboard.press("Home");
    await expect(seasonSummary).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(rivalSummary).toBeFocused();

    const archiveStory = page.getByTestId("leaderboard-archive-story");
    const archiveDelta = page.getByTestId("leaderboard-archive-delta");
    const archiveTrend = page.getByTestId("leaderboard-archive-trend");
    await archiveStory.focus();
    await expect(archiveStory).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(archiveDelta).toBeFocused();

    await page.keyboard.press("End");
    await expect(archiveTrend).toBeFocused();

    await page.keyboard.press("Home");
    await expect(archiveStory).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(archiveTrend).toBeFocused();

    const archiveRows = page.getByTestId("leaderboard-archive-item");
    await expect(archiveRows).toHaveCount(4);
    await archiveRows.nth(0).focus();
    await expect(archiveRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(archiveRows.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(archiveRows.nth(3)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(archiveRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(archiveRows.nth(3)).toBeFocused();

    const highScoreRows = page.getByTestId("high-score-item");
    await expect(highScoreRows).toHaveCount(5);
    await highScoreRows.nth(0).focus();
    await expect(highScoreRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(highScoreRows.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(highScoreRows.nth(4)).toBeFocused();

    await page.keyboard.press("Home");
    await expect(highScoreRows.nth(0)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(highScoreRows.nth(4)).toBeFocused();
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

    const placementCallout = page.getByTestId("game-over-placement");
    await expect(placementCallout).toContainText("New #1 high score");
    await expect(placementCallout).toContainText("SyncFace Weaver takes the lead");
    await expect(placementCallout).toHaveAttribute("tabindex", "0");
    await expect(placementCallout).toHaveAttribute("aria-label", "LEADERBOARD UPDATE. New #1 high score — SyncFace Weaver takes the lead.");
    await placementCallout.focus();
    await expect(placementCallout).toBeFocused();
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

    const placementCallout = page.getByTestId("game-over-placement");
    await expect(placementCallout).toContainText("High score secured at #3.");
    await expect(placementCallout).toHaveAttribute("tabindex", "0");
    await expect(placementCallout).toHaveAttribute("aria-label", "LEADERBOARD UPDATE. High score secured at #3.");

    const momentumCallout = page.getByTestId("game-over-momentum");
    await expect(momentumCallout).toContainText("Sound Crafter extends their top-5 streak to 3 straight runs.");
    await expect(momentumCallout).toHaveAttribute("tabindex", "0");
    await expect(momentumCallout).toHaveAttribute("aria-label", "MOMENTUM UPDATE. Sound Crafter extends their top-5 streak to 3 straight runs.");

    await placementCallout.focus();
    await expect(placementCallout).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(momentumCallout).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(placementCallout).toBeFocused();
    await page.keyboard.press("End");
    await expect(momentumCallout).toBeFocused();
    await page.keyboard.press("Home");
    await expect(placementCallout).toBeFocused();
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

    const placementCallout = page.getByTestId("game-over-placement");
    await expect(placementCallout).toContainText("Run archived outside the top 5.");
    await expect(placementCallout).toHaveAttribute("aria-label", "LEADERBOARD UPDATE. Run archived outside the top 5.");

    const momentumCallout = page.getByTestId("game-over-momentum");
    await expect(momentumCallout).toContainText("Sound Crafter's 2-run top-5 streak snaps with this archived finish.");
    await expect(momentumCallout).toHaveAttribute("aria-label", "MOMENTUM UPDATE. Sound Crafter's 2-run top-5 streak snaps with this archived finish.");
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
