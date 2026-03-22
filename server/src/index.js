import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();

function generateBeepWav(freq = 440, durationMs = 500) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(44 + numSamples * 2);
  // WAV header
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, Math.min(t * 10, (durationMs/1000 - t) * 10));
    const sample = Math.round(envelope * 16000 * Math.sin(2 * Math.PI * freq * t));
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  return 'data:audio/wav;base64,' + buffer.toString('base64');
}


const PORT = Number(process.env.PORT || 8787);
const VARCO_API_BASE = process.env.VARCO_API_BASE || "https://api.varco.ai";
const VARCO_OPENAPI_KEY = process.env.VARCO_OPENAPI_KEY || "";
const VARCO_TEXT2SOUND_PATH = process.env.VARCO_TEXT2SOUND_PATH || "/sound/varco/v1/api/text2sound";
const VARCO_IMAGE_TO_3D_PATH = process.env.VARCO_IMAGE_TO_3D_PATH || "/3d/varco/v1/api/imagetothree";
const CACHE_TTL_MS = 1000 * 60 * 30;

const heroProfiles = {
  modeler: {
    name: "3D Modeler",
    fantasy: "Builds hard-light mascots and promo artifacts on the fly",
    tone: "heroic industrial synth"
  },
  sounder: {
    name: "Sound Crafter",
    fantasy: "Turns spectator hype into arena sound design",
    tone: "rhythmic bass impact"
  },
  faceweaver: {
    name: "SyncFace Weaver",
    fantasy: "Creates viral character identity through expressive motion",
    tone: "glitch-pop cinematic"
  }
};

const channelPlaybooks = {
  x: {
    label: "X",
    cta: "Clip the wildest arena moment and invite remix battles."
  },
  instagram: {
    label: "Instagram Reel",
    cta: "Lead with the hero silhouette, then cut to the payoff asset swap."
  },
  discord: {
    label: "Discord",
    cta: "Share the brief, pack, and score so creators can iterate together."
  }
};

const varcoCache = new Map();
const cacheStats = {
  entries: 0,
  hits: 0,
  misses: 0,
  savedCalls: 0,
  studioPackHits: 0
};

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const matchState = {
  matchId: crypto.randomUUID(),
  status: "idle",
  startedAt: null,
  spectators: 137,
  pools: { player: 0, enemy: 0 },
  bets: [],
  agentLogs: [],
  swingEvent: null
};

function addAgentLog(level, message, meta = null) {
  const entry = {
    id: crypto.randomUUID(),
    level,
    message,
    meta,
    createdAt: new Date().toISOString()
  };
  matchState.agentLogs.unshift(entry);
  matchState.agentLogs = matchState.agentLogs.slice(0, 100);
  return entry;
}

function computeOdds() {
  const player = matchState.pools.player || 0;
  const enemy = matchState.pools.enemy || 0;
  const total = player + enemy;
  if (total <= 0) {
    return { player: 1.9, enemy: 1.9 };
  }

  const playerShare = player / total;
  const enemyShare = enemy / total;
  const adjust = 1.06;
  return {
    player: Number((1 / Math.max(playerShare, 0.05) / adjust).toFixed(2)),
    enemy: Number((1 / Math.max(enemyShare, 0.05) / adjust).toFixed(2))
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeCacheKey(scope, payload) {
  return crypto.createHash("sha1").update(`${scope}:${stableStringify(payload)}`).digest("hex");
}

function getCached(scope, payload) {
  const key = makeCacheKey(scope, payload);
  const cached = varcoCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    varcoCache.delete(key);
    cacheStats.entries = varcoCache.size;
    return null;
  }
  cacheStats.hits += 1;
  cacheStats.savedCalls += 1;
  if (scope === "studio-pack") {
    cacheStats.studioPackHits += 1;
  }
  return cached;
}

function setCached(scope, payload, value) {
  const key = makeCacheKey(scope, payload);
  varcoCache.set(key, {
    scope,
    createdAt: Date.now(),
    value
  });
  cacheStats.entries = varcoCache.size;
}

function buildStudioPack(brief, heroId = "modeler") {
  const hero = heroProfiles[heroId] || heroProfiles.modeler;
  const conciseBrief = brief.trim();
  const campaignTag = conciseBrief
    .split(/\s+/)
    .slice(0, 5)
    .join(" ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();

  const assetDirections = {
    player: `${hero.name} mascot, ${conciseBrief}, stylized promo hero, silhouette readable from far away`,
    enemy: `rogue ad-bot rival, ${conciseBrief}, readable threat shape, exaggerated silhouette`,
    orb: `ugc core collectible, ${conciseBrief}, glowing token, premium sponsor-friendly finish`
  };
  const soundDirections = {
    bgm: `${conciseBrief}, ${hero.tone}, looping promo game soundtrack, energetic but brand-safe`,
    orb: `${conciseBrief}, reward pickup stinger, short sparkling UI sound`,
    hit: `${conciseBrief}, impact hit, crunchy arena collision`,
    win: `${conciseBrief}, triumphant logo sting, sponsor-ready ending`,
    lose: `${conciseBrief}, dramatic fail cue, short and playful`
  };
  const marketingAngles = Object.entries(channelPlaybooks).map(([channel, playbook], index) => ({
    id: `${channel}-${index + 1}`,
    channel,
    label: playbook.label,
    hook: `${hero.name} turns "${campaignTag || conciseBrief}" into a live playable ad moment.`,
    copy: `${hero.name} enters the VARCO arena with ${conciseBrief}. Generate one reusable pack, ship the sound + asset stack, then let spectators remix the outcome.`,
    cta: playbook.cta
  }));
  const productionQueue = [
    {
      id: "sound-bgm",
      lane: "sound",
      key: "bgm",
      label: "Launch soundtrack",
      prompt: soundDirections.bgm
    },
    {
      id: "sound-win",
      lane: "sound",
      key: "win",
      label: "Victory sting",
      prompt: soundDirections.win
    },
    {
      id: "asset-player",
      lane: "asset",
      key: "player",
      label: "Hero showcase model",
      prompt: assetDirections.player
    },
    {
      id: "asset-enemy",
      lane: "asset",
      key: "enemy",
      label: "Rival silhouette",
      prompt: assetDirections.enemy
    },
    {
      id: "social-x",
      lane: "social",
      key: "x",
      label: "Social launch copy",
      prompt: marketingAngles[0].copy
    }
  ];

  return {
    packId: crypto.randomUUID(),
    brief: conciseBrief,
    heroId,
    heroName: hero.name,
    fantasy: hero.fantasy,
    campaign: {
      headline: `${hero.name} drops into ${campaignTag || "the VARCO arena"}`,
      tagline: `One brief, many reusable assets. ${hero.name} turns ${conciseBrief} into a playable promo loop.`,
      shareCopy: `${hero.name} is live in the VARCO arena: ${conciseBrief}. Generate once, remix everywhere.`,
      beats: [
        "Tease the arena fantasy with one hero hook.",
        "Show the player-generated sound/model loop in under 15 seconds.",
        "Push viewers into betting, sharing, or generating their own remix pack."
      ]
    },
    sounds: soundDirections,
    assets: assetDirections,
    marketingAngles,
    productionQueue,
    reusePlan: {
      briefFingerprint: campaignTag || conciseBrief,
      lanes: ["sound", "asset", "social"],
      queueDepth: productionQueue.length,
      generatedFromSingleBrief: true
    },
    savings: {
      estimatedCallsWithoutPack: 8,
      estimatedCallsWithPack: 3,
      estimatedCallsSaved: 5,
      rationale: [
        "Reuse one creative brief across all sound slots.",
        "Reuse one art direction across player/enemy/orb assets.",
        "Cache repeated generation prompts server-side during iteration."
      ]
    }
  };
}

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${VARCO_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function callVarco(path, body, extraHeaders = {}, options = {}) {
  const cacheScope = options.cacheScope || path;
  const cachePayload = { path, body, extraHeaders };
  const cached = options.cache === false ? null : getCached(cacheScope, cachePayload);
  if (cached) {
    return {
      ...cached.value,
      cache_hit: true,
      cached_at: new Date(cached.createdAt).toISOString()
    };
  }

  cacheStats.misses += 1;

  if (!VARCO_OPENAPI_KEY) {
    const isSoundEndpoint = path.includes("text2sound") || path.includes("sound");
    const mockResult = isSoundEndpoint
      ? { mocked: true, data: [{ audio: generateBeepWav(440 + Math.random() * 220, 600) }], version_id: Date.now().toString(), latency_ms: Math.floor(Math.random() * 2000) + 500 }
      : { mocked: true, data: [{ model_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', format: 'glb' }], version_id: Date.now().toString(), latency_ms: Math.floor(Math.random() * 3000) + 1000 };
    setCached(cacheScope, cachePayload, mockResult);
    return { ...mockResult, cache_hit: false };
  }

  const reqStart = Date.now();
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      openapi_key: VARCO_OPENAPI_KEY,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error("VARCO API request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const result = {
    ...data,
    version_id: data?.version_id || Date.now().toString(),
    latency_ms: data?.latency_ms || (Date.now() - reqStart)
  };
  setCached(cacheScope, cachePayload, result);
  return { ...result, cache_hit: false };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    varcoBase: VARCO_API_BASE,
    hasKey: Boolean(VARCO_OPENAPI_KEY),
    cache: cacheStats
  });
});

app.get("/api/match/state", (_req, res) => {
  const delta = Math.floor(Math.random() * 7) - 3;
  matchState.spectators = Math.max(80, matchState.spectators + delta);
  return res.json({
    ok: true,
    match: {
      matchId: matchState.matchId,
      status: matchState.status,
      startedAt: matchState.startedAt,
      spectators: matchState.spectators,
      pools: matchState.pools,
      swingEvent: matchState.swingEvent,
      odds: computeOdds(),
      totalBets: matchState.bets.length
    }
  });
});

app.post("/api/match/start", (_req, res) => {
  matchState.matchId = crypto.randomUUID();
  matchState.status = "running";
  matchState.startedAt = new Date().toISOString();
  matchState.pools = { player: 0, enemy: 0 };
  matchState.bets = [];
  matchState.swingEvent = null;
  addAgentLog("info", "match_started", {
    matchId: matchState.matchId,
    elapsedSeconds: 0
  });
  return res.json({ ok: true, matchId: matchState.matchId });
});

app.post("/api/match/finish", (req, res) => {
  const { winner = "player", elapsedSeconds = null, playerId = null } = req.body || {};
  if (!["player", "enemy"].includes(winner)) {
    return res.status(400).json({ ok: false, message: "winner must be player or enemy" });
  }
  matchState.status = "finished";
  addAgentLog("info", "match_ended", {
    winner,
    matchId: matchState.matchId,
    playerId,
    elapsedSeconds
  });
  return res.json({ ok: true, winner, settledBets: matchState.bets.length });
});

app.post("/api/match/bet", (req, res) => {
  const { userName, side, amount } = req.body || {};
  const normalizedAmount = Number(amount);
  if (!userName || typeof userName !== "string") {
    return res.status(400).json({ ok: false, message: "userName(string) is required" });
  }
  if (!["player", "enemy"].includes(side)) {
    return res.status(400).json({ ok: false, message: "side must be player or enemy" });
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return res.status(400).json({ ok: false, message: "amount(number > 0) is required" });
  }

  const bet = {
    id: crypto.randomUUID(),
    userName: userName.slice(0, 24),
    side,
    amount: normalizedAmount,
    createdAt: new Date().toISOString(),
    matchId: matchState.matchId
  };
  matchState.bets.push(bet);
  matchState.pools[side] += normalizedAmount;
  addAgentLog("info", "신규 배팅 접수", { userName: bet.userName, side, amount: normalizedAmount });
  return res.json({ ok: true, bet, pools: matchState.pools, odds: computeOdds() });
});

app.post("/api/match/swing-event", (req, res) => {
  const {
    type,
    title,
    body,
    targetCell = null,
    startPlayerCell = null,
    expiresAt = null,
    timer = null
  } = req.body || {};

  if (!type || !title || !body) {
    return res.status(400).json({ ok: false, message: "type, title, body are required" });
  }

  matchState.swingEvent = {
    id: crypto.randomUUID(),
    type,
    title,
    body,
    targetCell,
    startPlayerCell,
    expiresAt,
    timer,
    matchId: matchState.matchId,
    createdAt: new Date().toISOString()
  };

  addAgentLog("info", "swing_event_triggered", {
    type,
    title,
    targetCell,
    startPlayerCell,
    timer,
    matchId: matchState.matchId
  });

  return res.json({ ok: true, swingEvent: matchState.swingEvent });
});

app.get("/api/agent/logs", (_req, res) => {
  return res.json({ ok: true, logs: matchState.agentLogs.slice(0, 40) });
});

app.post("/api/agent/log", (req, res) => {
  const { level = "info", message, meta } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, message: "message(string) is required" });
  }
  if (!["info", "warn", "error"].includes(level)) {
    return res.status(400).json({ ok: false, message: "level must be info|warn|error" });
  }
  const entry = addAgentLog(level, message, meta || null);
  return res.json({ ok: true, entry });
});

app.post("/api/share/sns", (req, res) => {
  const {
    score = 0,
    winner = "player",
    hero = "Unknown Agent",
    matchId = matchState.matchId,
    variant = null,
    assetVariant = null,
    soundVariant = null
  } = req.body || {};
  const flavor = [variant, assetVariant, soundVariant].filter(Boolean).slice(0, 2).join(" / ");
  const text = `[VARCO Agent SAGA] ${hero}가 ${score}점으로 ${winner === "player" ? "승리" : "패배"}!${flavor ? ` ${flavor}` : ""} 관전/배팅 참여 중 #MoltyStyle #VARCO`;
  const encoded = encodeURIComponent(text);
  const shareUrl = encodeURIComponent(`https://varco-agent-saga.local/match/${matchId}`);
  return res.json({
    ok: true,
    text,
    links: {
      x: `https://x.com/intent/tweet?text=${encoded}&url=${shareUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${encoded}`,
      telegram: `https://t.me/share/url?url=${shareUrl}&text=${encoded}`
    }
  });
});

app.post("/api/varco/studio-pack", (req, res) => {
  const { brief, heroId = "modeler" } = req.body || {};
  if (!brief || typeof brief !== "string" || !brief.trim()) {
    return res.status(400).json({ ok: false, message: "brief(string) is required" });
  }

  const payload = { brief: brief.trim(), heroId };
  const cached = getCached("studio-pack", payload);
  if (cached) {
    return res.json({
      ok: true,
      studioPack: {
        ...cached.value,
        cache_hit: true,
        cached_at: new Date(cached.createdAt).toISOString()
      }
    });
  }

  const studioPack = buildStudioPack(brief, heroId);
  setCached("studio-pack", payload, studioPack);
  return res.json({
    ok: true,
    studioPack: {
      ...studioPack,
      cache_hit: false
    }
  });
});

app.get("/api/varco/cache/stats", (_req, res) => {
  return res.json({ ok: true, cache: cacheStats });
});

app.post("/api/varco/text2sound", async (req, res) => {
  try {
    const { prompt, version = "v1", num_sample = 1 } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ message: "prompt(string) is required" });
    }

    const result = await callVarco(VARCO_TEXT2SOUND_PATH, { prompt, version, num_sample }, {}, { cacheScope: "text2sound" });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message,
      data: error.data || null
    });
  }
});

app.post("/api/varco/image-to-3d", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.image && !payload.image_url) {
      return res.status(400).json({ message: "image or image_url field is required" });
    }

    const result = await callVarco(VARCO_IMAGE_TO_3D_PATH, payload, {}, { cacheScope: "image-to-3d" });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message,
      data: error.data || null
    });
  }
});

app.post("/api/varco/proxy", async (req, res) => {
  try {
    const { path, body, headers } = req.body || {};
    if (!path) {
      return res.status(400).json({ message: "path is required" });
    }

    const result = await callVarco(path, body || {}, headers || {}, { cacheScope: `proxy:${path}` });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      message: error.message,
      data: error.data || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`VARCO Agent SAGA server running on http://localhost:${PORT}`);
});
