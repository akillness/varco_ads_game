import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();

const PORT = Number(process.env.PORT || 8787);
const VARCO_API_BASE = process.env.VARCO_API_BASE || "https://api.varco.ai";
const VARCO_OPENAPI_KEY = process.env.VARCO_OPENAPI_KEY || "";
const VARCO_TEXT2SOUND_PATH = process.env.VARCO_TEXT2SOUND_PATH || "/sound/varco/v1/api/text2sound";
const VARCO_IMAGE_TO_3D_PATH = process.env.VARCO_IMAGE_TO_3D_PATH || "/3d/varco/v1/api/imagetothree";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

const matchState = {
  matchId: crypto.randomUUID(),
  status: "idle",
  startedAt: null,
  spectators: 137,
  pools: { player: 0, enemy: 0 },
  bets: [],
  agentLogs: []
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

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${VARCO_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function callVarco(path, body, extraHeaders = {}) {
  if (!VARCO_OPENAPI_KEY) {
    const isSoundEndpoint = path.includes("text2sound") || path.includes("sound");
    return {
      mocked: true,
      reason: "VARCO_OPENAPI_KEY is not set",
      endpoint: path,
      data: [
        isSoundEndpoint
          ? { audio: "mock://audio-preview" }
          : { model_url: "mock://3d-model-preview", format: "glb" }
      ]
    };
  }

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
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error("VARCO API request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT, varcoBase: VARCO_API_BASE, hasKey: Boolean(VARCO_OPENAPI_KEY) });
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
  addAgentLog("info", "신규 매치 시작", { matchId: matchState.matchId });
  return res.json({ ok: true, matchId: matchState.matchId });
});

app.post("/api/match/finish", (req, res) => {
  const { winner = "player" } = req.body || {};
  if (!["player", "enemy"].includes(winner)) {
    return res.status(400).json({ ok: false, message: "winner must be player or enemy" });
  }
  matchState.status = "finished";
  addAgentLog("info", "매치 종료", { winner, matchId: matchState.matchId });
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
  const { score = 0, winner = "player", hero = "Unknown Agent", matchId = matchState.matchId } = req.body || {};
  const text = `[VARCO Agent SAGA] ${hero}가 ${score}점으로 ${winner === "player" ? "승리" : "패배"}! 관전/배팅 참여 중 #MoltyStyle #VARCO`;
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

app.post("/api/varco/text2sound", async (req, res) => {
  try {
    const { prompt, version = "v1", num_sample = 1 } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ message: "prompt(string) is required" });
    }

    const result = await callVarco(VARCO_TEXT2SOUND_PATH, { prompt, version, num_sample });
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

    const result = await callVarco(VARCO_IMAGE_TO_3D_PATH, payload);
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

    const result = await callVarco(path, body || {}, headers || {});
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
