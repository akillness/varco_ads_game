import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import SoundEditor from "./SoundEditor.jsx";
import AssetEditor from "./AssetEditor.jsx";
import EditHistory from "./EditHistory.jsx";

const GRID_W = 14;
const GRID_H = 10;
const TICK_MS = 150;
const GAME_TIME = 60;
const COMBO_WINDOW = 2000;
const ABILITY_MAX = 100;

const heroes = [
  { id: "modeler", name: "3D Modeler", hp: 6, speed: 1, desc: "HP 6 / SPD 1" },
  { id: "sounder", name: "Sound Crafter", hp: 5, speed: 1, desc: "HP 5 / SPD 1" },
  { id: "faceweaver", name: "SyncFace Weaver", hp: 4, speed: 2, desc: "HP 4 / SPD 2" }
];

const POWERUP_TYPES = [
  { id: "shield", icon: "S", label: "Shield", duration: 5000, color: "#d2a8ff" },
  { id: "speed", icon: "F", label: "Speed+", duration: 4000, color: "#3fb9a0" },
  { id: "magnet", icon: "M", label: "Magnet", duration: 6000, color: "#58a6ff" }
];

const ACHIEVEMENTS = [
  { id: "first_orb", name: "First Blood", desc: "Collect 1 orb", check: (s) => s.totalOrbs >= 1 },
  { id: "combo3", name: "Triple Threat", desc: "3x combo", check: (s) => s.maxCombo >= 3 },
  { id: "combo5", name: "Unstoppable", desc: "5x combo", check: (s) => s.maxCombo >= 5 },
  { id: "score100", name: "Century", desc: "Score 100+", check: (s) => s.score >= 100 },
  { id: "score300", name: "Legendary", desc: "Score 300+", check: (s) => s.score >= 300 },
  { id: "survivor", name: "Survivor", desc: "Win with 1 HP", check: (s) => s.wonWith1Hp },
  { id: "speedster", name: "Speed Demon", desc: "Use Speed power-up", check: (s) => s.usedSpeed },
  { id: "collector", name: "Collector", desc: "Get 10 orbs in one game", check: (s) => s.totalOrbs >= 10 }
];

const HERO_ABILITIES = {
  modeler: {
    name: "Hard-Light Shield",
    hint: "Space",
    cooldownMs: 12000,
    summary: "Shield + heal + scatter enemies"
  },
  sounder: {
    name: "Bass Drop",
    hint: "Space",
    cooldownMs: 11000,
    summary: "Freeze enemies + protect your combo"
  },
  faceweaver: {
    name: "Phase Rush",
    hint: "Space",
    cooldownMs: 10000,
    summary: "Speed + magnet burst for orb routing"
  }
};

const SHARE_CHANNEL_LABELS = {
  x: "X",
  facebook: "Facebook",
  telegram: "Telegram"
};

const MISSION_TEMPLATES = [
  {
    kind: "collect",
    title: "Core Rush",
    build(difficulty) {
      const target = difficulty >= 4 ? 4 : 3;
      return {
        kind: "collect",
        title: "Core Rush",
        target,
        progress: 0,
        duration: 15,
        rewardLabel: `+${20 + difficulty * 3} score / +35 charge`
      };
    }
  },
  {
    kind: "combo",
    title: "Combo Broadcast",
    build(difficulty) {
      const target = difficulty >= 5 ? 4 : 3;
      return {
        kind: "combo",
        title: "Combo Broadcast",
        target,
        progress: 0,
        duration: 14,
        rewardLabel: "magnet pulse / +40 charge"
      };
    }
  },
  {
    kind: "survive",
    title: "Clean Take",
    build(difficulty) {
      return {
        kind: "survive",
        title: "Clean Take",
        target: 1,
        progress: 0,
        duration: Math.max(8, 12 - Math.floor(difficulty / 2)),
        rewardLabel: "heal 1 / shield refresh"
      };
    }
  }
];

const DIRECTOR_PHASES = [
  {
    id: "launch",
    minTime: 41,
    label: "Launch Window",
    callout: "Low pressure. Build combo routes and charge your hero ability.",
    threat: "Low"
  },
  {
    id: "broadcast",
    minTime: 21,
    label: "Broadcast Rush",
    callout: "Spectators spike. Expect support drops and harder pressure.",
    threat: "Medium"
  },
  {
    id: "overtime",
    minTime: 11,
    label: "Overdrive",
    callout: "Arena director starts forcing highlight moments.",
    threat: "High"
  },
  {
    id: "finale",
    minTime: 0,
    label: "Final Push",
    callout: "Cash in abilities and convert one last showcase moment.",
    threat: "Critical"
  }
];

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function randomCell() { return { x: Math.floor(Math.random() * GRID_W), y: Math.floor(Math.random() * GRID_H) }; }
function randomCellAway(pos, minDist = 3) {
  let cell;
  for (let i = 0; i < 20; i++) {
    cell = randomCell();
    if (Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y) >= minDist) return cell;
  }
  return cell;
}

function comboMultiplier(combo) {
  if (combo >= 5) return 3.0;
  if (combo >= 3) return 2.0;
  if (combo >= 2) return 1.5;
  return 1.0;
}
function manhattan(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function xpForLevel(level) { return 50 + level * 30; }
function getDirectorPhase(timer) {
  return DIRECTOR_PHASES.find((phase) => timer >= phase.minTime) || DIRECTOR_PHASES[DIRECTOR_PHASES.length - 1];
}
function missionProgressText(mission) {
  if (!mission) return "";
  if (mission.kind === "survive") return "No damage";
  return `${mission.progress}/${mission.target}`;
}

function formatMatchRef(matchId) {
  if (!matchId) return "pending sync";
  return matchId.split("-").pop()?.slice(0, 6) || matchId.slice(0, 6);
}

function getBettingStatusSnapshot(matchStatus, timer, elapsedSeconds, matchId) {
  const matchRef = formatMatchRef(matchId);
  if (matchStatus === "running") {
    return {
      chip: "LIVE WINDOW",
      tone: "live",
      detail: `Betting open • ${Math.max(timer, 0)}s left in match ${matchRef}.`
    };
  }
  if (matchStatus === "finished") {
    return {
      chip: "CLOSED",
      tone: "closed",
      detail: `Betting closed • match ${matchRef} ended after ${Math.max(elapsedSeconds, 0)}s.`
    };
  }
  return {
    chip: "STANDBY",
    tone: "idle",
    detail: "Betting opens when the live match is ready."
  };
}

function moveEnemy(enemy, player, difficulty) {
  const steps = Math.min(2, 1 + Math.floor(difficulty / 4));
  let current = { ...enemy };
  for (let step = 0; step < steps; step += 1) {
    const chase = Math.random() < 0.3 + difficulty * 0.05;
    if (chase) {
      current = {
        x: clamp(current.x + Math.sign(player.x - current.x), 0, GRID_W - 1),
        y: clamp(current.y + Math.sign(player.y - current.y), 0, GRID_H - 1)
      };
    } else {
      current = {
        x: clamp(current.x + Math.floor(Math.random() * 3) - 1, 0, GRID_W - 1),
        y: clamp(current.y + Math.floor(Math.random() * 3) - 1, 0, GRID_H - 1)
      };
    }
  }
  return current;
}

function createMission(difficulty = 1, excludeKind = null) {
  const pool = MISSION_TEMPLATES.filter((mission) => mission.kind !== excludeKind);
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template.build(difficulty);
}

function advanceMissionState(state, eventText, rewardEffect) {
  const now = Date.now();
  const next = rewardEffect ? rewardEffect(state) : state;
  const mission = createMission(next.difficulty, state.mission?.kind);
  return {
    ...next,
    mission,
    missionSecondsLeft: mission.duration,
    missionEvent: { id: now, text: eventText }
  };
}

function completeMission(state) {
  const mission = state.mission;
  if (!mission) return state;

  if (mission.kind === "collect") {
    return advanceMissionState(
      {
        ...state,
        score: state.score + 20 + state.difficulty * 3,
        abilityCharge: clamp(state.abilityCharge + 35, 0, ABILITY_MAX)
      },
      `${mission.title} cleared`
    );
  }

  if (mission.kind === "combo") {
    const now = Date.now();
    return advanceMissionState(
      {
        ...state,
        abilityCharge: clamp(state.abilityCharge + 40, 0, ABILITY_MAX),
        activePowerups: { ...state.activePowerups, magnet: now + 5000 }
      },
      `${mission.title} cleared`
    );
  }

  return advanceMissionState(
    {
      ...state,
      hp: Math.min(state.hero.hp, state.hp + 1),
      activePowerups: { ...state.activePowerups, shield: Date.now() + 3500 }
    },
    `${mission.title} cleared`
  );
}

function failMission(state) {
  if (!state.mission) return state;
  return advanceMissionState(state, `${state.mission.title} missed`);
}

function createDirectorBeat(title, text, now = Date.now()) {
  return {
    id: now,
    title,
    text
  };
}

function createSwingEvent(type, title, text, targetCell = null, now = Date.now()) {
  return {
    id: now,
    type,
    title,
    text,
    targetCell,
    startPlayerCell: null,
    eventVariant: type,
    zoneShiftMode: null
  };
}

function pickWeightedSwingVariant(state, timer) {
  const weights = [
    {
      type: "rare-drop-ping",
      weight: 3 + (state.totalOrbs < 3 ? 2 : 0)
    },
    {
      type: "zone-shift-alert",
      weight: 2 + (state.hp <= 2 ? 2 : 0) + (state.enemies.length >= 4 ? 1 : 0)
    },
    {
      type: "bounty-signal",
      weight: 2 + (state.abilityCharge >= 50 ? 1 : 0) + (state.enemies.length > 0 ? 1 : 0)
    }
  ];
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  const pivot = Math.abs(state.totalOrbs * 31 + state.level * 17 + timer * 13) % totalWeight;

  let cursor = 0;
  for (const entry of weights) {
    cursor += entry.weight;
    if (pivot < cursor) return entry.type;
  }
  return weights[0].type;
}

function triggerSwingEvent(state, timer) {
  const now = Date.now();
  const eventVariant = pickWeightedSwingVariant(state, timer);

  if (eventVariant === "rare-drop-ping") {
    const powerType = POWERUP_TYPES[(state.level + state.totalOrbs) % POWERUP_TYPES.length];
    return {
      ...state,
      swingEventTriggered: true,
      swingEvent: {
        ...createSwingEvent(
        "rare-drop-ping",
        "Rare Drop Ping",
        "희귀 보상 코어가 떨어졌다. 지금 라인을 바꾸면 큰 보상을 가져갈 수 있다.",
        state.bonusOrb || randomCellAway(state.player, 4),
        now
        ),
        eventVariant
      },
      swingEventEndsAt: now + 5000,
      bonusOrb: state.bonusOrb || randomCellAway(state.player, 4),
      powerup: state.powerup || { ...randomCellAway(state.player, 4), type: powerType },
      abilityCharge: clamp(state.abilityCharge + 20, 0, ABILITY_MAX),
      directorBeat: createDirectorBeat("30s Swing", "희귀 보상 드랍. 지금 이동 경로를 바꿔라.", now),
      directorBeatEndsAt: now + 8000
    };
  }

  if (eventVariant === "zone-shift-alert") {
    const zoneShiftMode = state.difficulty >= 3 ? "map-impact" : "warning";
    const zoneTarget = randomCellAway(state.player, 5);
    return {
      ...state,
      swingEventTriggered: true,
      swingEvent: {
        ...createSwingEvent(
        "zone-shift-alert",
        "Zone Shift Alert",
        zoneShiftMode === "map-impact"
          ? "안전 루트가 무너졌다. 오브젝트 위치와 적 압박이 동시에 바뀐다."
          : "안전 구역 경고가 떴다. 경로를 바꿀지 유지할지 빠르게 결정해야 한다.",
        zoneTarget,
        now
        ),
        eventVariant,
        zoneShiftMode
      },
      swingEventEndsAt: now + 5000,
      orb: zoneShiftMode === "map-impact" ? zoneTarget : state.orb,
      enemies:
        zoneShiftMode === "map-impact" && state.enemies.length < 6
          ? [...state.enemies, randomCellAway(state.player, 4)]
          : state.enemies,
      directorBeat: createDirectorBeat(
        "30s Swing",
        zoneShiftMode === "map-impact"
          ? "루트 붕괴. 즉시 새 경로를 잡아야 한다."
          : "경고만 떴다. 지금 경로를 바꿀지 유지할지 판단해야 한다.",
        now
      ),
      directorBeatEndsAt: now + 8000
    };
  }

  const bountyTarget = state.enemies[0] || randomCellAway(state.player, 4);

  return {
    ...state,
    swingEventTriggered: true,
    swingEvent: {
      ...createSwingEvent(
      "bounty-signal",
      "Bounty Signal",
      "근처 목표가 강조됐다. 추격해 보상을 노릴지, 무시하고 생존을 우선할지 선택해야 한다.",
      bountyTarget,
      now
      ),
      eventVariant
    },
    swingEventEndsAt: now + 5000,
    abilityCharge: clamp(state.abilityCharge + 15, 0, ABILITY_MAX),
    directorBeat: createDirectorBeat("30s Swing", "현상금 신호 포착. 지금 추격할지 결정해야 한다.", now),
    directorBeatEndsAt: now + 8000
  };
}

function triggerDirectorBeat(state, timer) {
  const now = Date.now();
  const eventIndex = Math.abs(timer + state.totalOrbs + state.level) % 3;

  if (eventIndex === 0) {
    const powerType = POWERUP_TYPES[(state.level + state.totalOrbs) % POWERUP_TYPES.length];
    return {
      ...state,
      powerup: state.powerup || { ...randomCellAway(state.player, 4), type: powerType },
      abilityCharge: clamp(state.abilityCharge + 18, 0, ABILITY_MAX),
      directorBeat: createDirectorBeat("Sponsor Drop", `${powerType.label} deployed for the next promo beat`, now),
      directorBeatEndsAt: now + 6000
    };
  }

  if (eventIndex === 1) {
    return {
      ...state,
      bonusOrb: randomCellAway(state.player, 4),
      enemyFreezeUntil: Math.max(state.enemyFreezeUntil || 0, now + 2500),
      directorBeat: createDirectorBeat("Focus Window", "Bonus core live. Secure it before the cutaway ends.", now),
      directorBeatEndsAt: now + 6000
    };
  }

  return {
    ...state,
    enemies: state.enemies.length < 6 ? [...state.enemies, randomCellAway(state.player)] : state.enemies,
    abilityCharge: clamp(state.abilityCharge + 10, 0, ABILITY_MAX),
    directorBeat: createDirectorBeat("Drone Surge", "Rival drones rush the frame. Hold the route.", now),
    directorBeatEndsAt: now + 6000
  };
}

const HIGH_SCORE_LIMIT = 5;
const HIGH_SCORE_HISTORY_LIMIT = 30;

function compareHighScores(a, b) {
  return (
    b.score - a.score ||
    b.combo - a.combo ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.hero.localeCompare(b.hero)
  );
}

function normalizeHighScoreEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const score = Number(entry.score);
  const combo = Number(entry.combo ?? 0);
  const hero = typeof entry.hero === "string" && entry.hero.trim() ? entry.hero.trim() : "Unknown Agent";
  const createdAt = typeof entry.createdAt === "string" && entry.createdAt
    ? entry.createdAt
    : typeof entry.date === "string" && entry.date
      ? `${entry.date}T00:00:00.000Z`
      : "1970-01-01T00:00:00.000Z";

  if (!Number.isFinite(score)) return null;

  return {
    hero,
    score,
    combo: Number.isFinite(combo) ? combo : 0,
    createdAt,
    date: typeof entry.date === "string" && entry.date ? entry.date : createdAt.slice(0, 10)
  };
}

function isSameHighScoreEntry(a, b) {
  return Boolean(a) && Boolean(b)
    && a.hero === b.hero
    && a.score === b.score
    && a.combo === b.combo
    && a.createdAt === b.createdAt;
}

function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem("saga_highscores") || "[]")
      .map(normalizeHighScoreEntry)
      .filter(Boolean)
      .sort(compareHighScores)
      .slice(0, HIGH_SCORE_LIMIT);
  }
  catch {
    return [];
  }
}

function normalizeHighScoreHistoryEntry(entry) {
  const normalizedEntry = normalizeHighScoreEntry(entry);
  if (!normalizedEntry) return null;

  const rawPlacement = Number(entry.placement);
  const placement = Number.isFinite(rawPlacement) && rawPlacement > 0 ? Math.floor(rawPlacement) : null;
  const qualified = typeof entry.qualified === "boolean"
    ? entry.qualified
    : placement !== null && placement <= HIGH_SCORE_LIMIT;

  return {
    ...normalizedEntry,
    placement,
    qualified
  };
}

function buildHighScoreHistoryFallback(scores) {
  return scores.map((scoreEntry, index) => normalizeHighScoreHistoryEntry({
    ...scoreEntry,
    placement: index + 1,
    qualified: index < HIGH_SCORE_LIMIT
  })).filter(Boolean);
}

function compareHighScoreHistory(a, b) {
  return (
    b.createdAt.localeCompare(a.createdAt)
    || (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER)
    || compareHighScores(a, b)
  );
}

function loadArchivedHighScoreHistory() {
  try {
    const rawHistory = localStorage.getItem("saga_highscore_history");
    if (rawHistory === null) {
      return [];
    }

    return JSON.parse(rawHistory)
      .map(normalizeHighScoreHistoryEntry)
      .filter(Boolean)
      .sort(compareHighScoreHistory)
      .slice(0, HIGH_SCORE_HISTORY_LIMIT);
  }
  catch {
    return [];
  }
}

function loadHighScoreHistory(scores = [], { allowFallback = true } = {}) {
  const archivedHistory = loadArchivedHighScoreHistory();
  if (archivedHistory.length > 0 || !allowFallback) {
    return archivedHistory;
  }

  return buildHighScoreHistoryFallback(scores)
    .sort(compareHighScoreHistory)
    .slice(0, HIGH_SCORE_HISTORY_LIMIT);
}

function saveHighScore(entry) {
  const previousScores = loadHighScores();
  const previousHistory = loadHighScoreHistory(previousScores, { allowFallback: false });
  const normalizedEntry = normalizeHighScoreEntry(entry);
  if (!normalizedEntry) {
    return {
      scores: previousScores,
      placement: null,
      qualified: false,
      entry: null,
      history: previousHistory,
      previousHistory
    };
  }

  const sortedScores = [...previousScores, normalizedEntry]
    .filter(Boolean)
    .sort(compareHighScores);
  const placementIndex = sortedScores.findIndex((scoreEntry) => isSameHighScoreEntry(scoreEntry, normalizedEntry));
  const overallPlacement = placementIndex === -1 ? null : placementIndex + 1;
  const qualified = overallPlacement !== null && overallPlacement <= HIGH_SCORE_LIMIT;
  const scores = sortedScores.slice(0, HIGH_SCORE_LIMIT);

  localStorage.setItem("saga_highscores", JSON.stringify(scores));
  const historyEntry = normalizeHighScoreHistoryEntry({
    ...normalizedEntry,
    placement: overallPlacement,
    qualified
  });
  const history = historyEntry
    ? [historyEntry, ...previousHistory.filter((item) => !isSameHighScoreEntry(item, historyEntry))]
      .slice(0, HIGH_SCORE_HISTORY_LIMIT)
    : previousHistory;
  localStorage.setItem("saga_highscore_history", JSON.stringify(history));

  return {
    scores,
    placement: qualified ? overallPlacement : null,
    qualified,
    entry: normalizedEntry,
    history,
    previousHistory
  };
}

function describeLeaderboardPlacement(result) {
  if (!result?.entry) return null;
  if (result.placement === 1) {
    return {
      tone: "top",
      message: `New #1 high score — ${result.entry.hero} takes the lead.`
    };
  }
  if (result.placement) {
    return {
      tone: "qualified",
      message: `High score secured at #${result.placement}.`
    };
  }
  return {
    tone: "archived",
    message: `Run archived outside the top ${HIGH_SCORE_LIMIT}.`
  };
}

function previewHighScorePlacement(scores, entry) {
  const normalizedEntry = normalizeHighScoreEntry(entry);
  if (!normalizedEntry) {
    return {
      scores,
      placement: null,
      qualified: false,
      entry: null
    };
  }

  const sortedScores = [...scores, normalizedEntry]
    .filter(Boolean)
    .sort(compareHighScores);
  const placementIndex = sortedScores.findIndex((scoreEntry) => isSameHighScoreEntry(scoreEntry, normalizedEntry));

  return {
    scores: sortedScores.slice(0, HIGH_SCORE_LIMIT),
    placement: placementIndex === -1 ? null : placementIndex + 1,
    qualified: placementIndex !== -1 && placementIndex < HIGH_SCORE_LIMIT,
    entry: normalizedEntry
  };
}

function getLeaderboardTargetGap(entry, target) {
  if (!entry || !target) return null;

  const scoreGap = target.score - entry.score;
  if (scoreGap > 0) {
    return { kind: "score", amount: scoreGap };
  }

  const comboGap = target.combo - entry.combo;
  if (comboGap > 0) {
    return { kind: "combo", amount: comboGap };
  }

  if (scoreGap === 0 && comboGap === 0) {
    return { kind: "tiebreak", amount: 0 };
  }

  return { kind: "ahead", amount: 0 };
}

function getLeaderboardRecap(scores, entry) {
  const leader = scores[0] || null;
  const cutoff = scores[Math.min(scores.length, HIGH_SCORE_LIMIT) - 1] || null;

  if (!leader) {
    if ((entry?.score || 0) > 0) {
      return {
        tone: "open",
        chip: "OPENING MARK",
        detail: `${entry.hero} would set the first leaderboard mark at ${entry.score} pts.`
      };
    }

    return {
      tone: "idle",
      chip: "OPEN BOARD",
      detail: "No scores posted yet. The next clean run sets the opening mark."
    };
  }

  if ((entry?.score || 0) <= 0) {
    if (scores.length < HIGH_SCORE_LIMIT) {
      return {
        tone: "idle",
        chip: "TOP TARGET",
        detail: `Beat ${leader.score} pts from ${leader.hero}. ${HIGH_SCORE_LIMIT - scores.length} leaderboard slot${HIGH_SCORE_LIMIT - scores.length === 1 ? "" : "s"} still open.`
      };
    }

    return {
      tone: "idle",
      chip: "TOP TARGET",
      detail: `Beat ${leader.score} pts from ${leader.hero}. ${cutoff.score} pts currently enters the top ${HIGH_SCORE_LIMIT}.`
    };
  }

  const preview = previewHighScorePlacement(scores, {
    ...entry,
    createdAt: entry.createdAt || "9999-12-31T23:59:59.999Z"
  });

  if (preview.placement === 1) {
    const leaderGap = getLeaderboardTargetGap(entry, leader);
    let detail = `${entry.hero} would move ahead of ${leader.hero} with ${entry.score} pts / ${entry.combo}x combo.`;
    if (leaderGap?.kind === "tiebreak") {
      detail = `${entry.hero} would match ${leader.hero} at ${entry.score} pts / ${entry.combo}x and take #1 on recency.`;
    }

    return {
      tone: "top",
      chip: "LIVE #1 PACE",
      detail
    };
  }

  if (preview.placement && preview.qualified) {
    const nextTarget = scores[preview.placement - 2] || leader;
    const gap = getLeaderboardTargetGap(entry, nextTarget);

    let detail = `Current run would slot in at #${preview.placement}. ${Math.max(nextTarget.score - entry.score, 0)} more pts catches ${nextTarget.hero} above.`;
    if (gap?.kind === "combo") {
      detail = `Current run would slot in at #${preview.placement}. Matching ${nextTarget.score} pts is not enough — ${gap.amount} more combo catches ${nextTarget.hero} above.`;
    } else if (gap?.kind === "tiebreak") {
      detail = `Current run would slot in at #${preview.placement}. Matching ${nextTarget.score} pts / ${nextTarget.combo}x already edges ${nextTarget.hero} on recency.`;
    }

    return {
      tone: "qualified",
      chip: `LIVE #${preview.placement}`,
      detail
    };
  }

  const gap = getLeaderboardTargetGap(entry, cutoff);
  const pointsNeeded = cutoff ? Math.max(cutoff.score - entry.score + 1, 1) : 1;
  let detail = `Current run sits outside the board. About ${pointsNeeded} more pts likely needed to qualify.`;
  if (gap?.kind === "combo") {
    detail = `Current run sits outside the board. Matching ${cutoff.score} pts still needs ${gap.amount} more combo to bump ${cutoff.hero} off the cutline.`;
  }

  return {
    tone: "archived",
    chip: `OUTSIDE TOP ${HIGH_SCORE_LIMIT}`,
    detail
  };
}

function getLeaderboardSeasonSummary(scores, entry) {
  const leader = scores[0] || null;
  const cutoff = scores[Math.min(scores.length, HIGH_SCORE_LIMIT) - 1] || null;

  if (!leader) {
    return {
      seasonDetail: "No leaderboard runs posted yet. The next clean run opens the season table.",
      rivalDetail: (entry?.score || 0) > 0
        ? `${entry.hero} can post the opening season mark at ${entry.score} pts.`
        : "The first clean run claims the opening rivalry mark."
    };
  }

  const leaderRuns = scores.filter((scoreEntry) => scoreEntry.hero === leader.hero).length;
  const seasonDetail = leaderRuns > 1
    ? `${leader.hero} leads the season with ${leader.score} pts and controls ${leaderRuns}/${scores.length} leaderboard slots.`
    : `${leader.hero} leads the season with ${leader.score} pts and a ${leader.combo}x benchmark combo.`;

  if ((entry?.score || 0) <= 0) {
    if (scores.length < HIGH_SCORE_LIMIT) {
      return {
        seasonDetail,
        rivalDetail: `${HIGH_SCORE_LIMIT - scores.length} leaderboard slot${HIGH_SCORE_LIMIT - scores.length === 1 ? " is" : "s are"} still open before the cutline locks.`
      };
    }

    return {
      seasonDetail,
      rivalDetail: `${cutoff.hero} currently defends the final slot at ${cutoff.score} pts / ${cutoff.combo}x combo.`
    };
  }

  const preview = previewHighScorePlacement(scores, {
    ...entry,
    createdAt: entry.createdAt || "9999-12-31T23:59:59.999Z"
  });

  if (preview.placement === 1) {
    const leaderGap = getLeaderboardTargetGap(entry, leader);
    let rivalDetail = `${leader.hero} owns the current benchmark at ${leader.score} pts. ${entry.hero} is ${Math.max(entry.score - leader.score, 1)} pt${Math.max(entry.score - leader.score, 1) === 1 ? "" : "s"} ahead on live pace.`;
    if (leaderGap?.kind === "tiebreak") {
      rivalDetail = `${leader.hero} owns the current benchmark at ${leader.score} pts / ${leader.combo}x, but matching that line already flips #1 on recency.`;
    }

    return {
      seasonDetail,
      rivalDetail
    };
  }

  if (preview.placement && preview.qualified) {
    const rival = scores[preview.placement - 2] || leader;
    const gap = getLeaderboardTargetGap(entry, rival);
    const chasePoints = Math.max(rival.score - entry.score, 0);

    let rivalDetail = `${rival.hero} holds #${preview.placement - 1} at ${rival.score} pts. ${chasePoints} more pt${chasePoints === 1 ? "" : "s"} steals that rival spot.`;
    if (gap?.kind === "combo") {
      rivalDetail = `${rival.hero} holds #${preview.placement - 1} at ${rival.score} pts. Matching ${rival.score} pts still needs ${gap.amount} more combo to steal that rival spot.`;
    } else if (gap?.kind === "tiebreak") {
      rivalDetail = `${rival.hero} holds #${preview.placement - 1} at ${rival.score} pts, but matching ${rival.score} pts / ${rival.combo}x already flips the tiebreak.`;
    }

    return {
      seasonDetail,
      rivalDetail
    };
  }

  const gap = getLeaderboardTargetGap(entry, cutoff);
  const pointsNeeded = cutoff ? Math.max(cutoff.score - entry.score + 1, 1) : 1;
  let rivalDetail = `${cutoff.hero} defends #${HIGH_SCORE_LIMIT} at ${cutoff.score} pts. ${pointsNeeded} more pt${pointsNeeded === 1 ? "" : "s"} bumps them off the board.`;
  if (gap?.kind === "combo") {
    rivalDetail = `${cutoff.hero} defends #${HIGH_SCORE_LIMIT} at ${cutoff.score} pts. Matching ${cutoff.score} pts still needs ${gap.amount} more combo to bump ${cutoff.hero} off the board.`;
  }

  return {
    seasonDetail,
    rivalDetail
  };
}

function getLeaderboardBoardControl(scores) {
  if (!scores.length) {
    return [];
  }

  const heroStats = new Map();
  scores.forEach((scoreEntry, index) => {
    const rank = index + 1;
    const existing = heroStats.get(scoreEntry.hero);
    if (!existing) {
      heroStats.set(scoreEntry.hero, {
        hero: scoreEntry.hero,
        slots: 1,
        bestRank: rank,
        bestScore: scoreEntry.score,
        bestCombo: scoreEntry.combo
      });
      return;
    }

    existing.slots += 1;
  });

  return Array.from(heroStats.values())
    .sort((a, b) => (
      b.slots - a.slots
      || a.bestRank - b.bestRank
      || b.bestScore - a.bestScore
      || b.bestCombo - a.bestCombo
      || a.hero.localeCompare(b.hero)
    ))
    .map((stat) => {
      let badge = "CHASER";
      if (stat.slots >= 3) {
        badge = "BOARD CONTROL";
      } else if (stat.slots === 2) {
        badge = "DOUBLE HOLD";
      } else if (stat.bestRank === 1) {
        badge = "PACE SETTER";
      } else if (stat.bestRank === HIGH_SCORE_LIMIT) {
        badge = "CUTLINE DEFENDER";
      }

      return {
        ...stat,
        badge,
        detail: `#${stat.bestRank} best · ${stat.slots} slot${stat.slots === 1 ? "" : "s"} · ${stat.bestScore} pts · ${stat.bestCombo}x combo`
      };
    });
}

function getHeroMomentumStats(history, hero) {
  const entries = history.filter((entry) => entry.hero === hero);
  if (!entries.length) {
    return {
      hero,
      currentStreak: 0,
      longestStreak: 0,
      latestQualifiedAt: "1970-01-01T00:00:00.000Z",
      bestPlacement: Number.MAX_SAFE_INTEGER
    };
  }

  let currentStreak = 0;
  while (currentStreak < entries.length && entries[currentStreak].qualified) {
    currentStreak += 1;
  }

  let longestStreak = 0;
  let streakCursor = 0;
  entries.forEach((entry) => {
    if (entry.qualified) {
      streakCursor += 1;
      longestStreak = Math.max(longestStreak, streakCursor);
    } else {
      streakCursor = 0;
    }
  });

  const latestQualified = entries.find((entry) => entry.qualified) || null;
  const bestPlacement = entries.reduce((best, entry) => {
    if (entry.placement === null) return best;
    return Math.min(best, entry.placement);
  }, Number.MAX_SAFE_INTEGER);

  return {
    hero,
    currentStreak,
    longestStreak,
    latestQualifiedAt: latestQualified?.createdAt || "1970-01-01T00:00:00.000Z",
    bestPlacement
  };
}

function getLeaderboardMomentum(scores) {
  const history = loadHighScoreHistory(scores, { allowFallback: false });
  if (!history.length) {
    return {
      label: "MOMENTUM",
      detail: "Season streaks unlock after the first archived run."
    };
  }

  const momentumTable = Array.from(new Set(history.map((entry) => entry.hero)))
    .map((hero) => getHeroMomentumStats(history, hero))
    .filter((entry) => entry.longestStreak > 0)
    .sort((a, b) => (
      b.longestStreak - a.longestStreak
      || b.currentStreak - a.currentStreak
      || a.bestPlacement - b.bestPlacement
      || b.latestQualifiedAt.localeCompare(a.latestQualifiedAt)
      || a.hero.localeCompare(b.hero)
    ));

  const momentumLeader = momentumTable[0];
  if (!momentumLeader) {
    return {
      label: "MOMENTUM",
      detail: "Season streaks unlock after the first top-5 finish is archived."
    };
  }

  if (momentumLeader.currentStreak > 1) {
    return {
      label: "MOMENTUM",
      detail: `${momentumLeader.hero} is riding a ${momentumLeader.currentStreak}-run top-${HIGH_SCORE_LIMIT} streak and has peaked at #${momentumLeader.bestPlacement}.`
    };
  }

  if (momentumLeader.longestStreak > 1) {
    return {
      label: "MOMENTUM",
      detail: `${momentumLeader.hero} owns the best season streak at ${momentumLeader.longestStreak} straight top-${HIGH_SCORE_LIMIT} finishes.`
    };
  }

  return {
    label: "MOMENTUM",
    detail: `${momentumLeader.hero} posted the latest archived top-${HIGH_SCORE_LIMIT} finish and peaked at #${momentumLeader.bestPlacement}.`
  };
}

function getLeaderboardSeasonArchive(scores, heroFilter = "all") {
  const history = loadHighScoreHistory(scores, { allowFallback: false });
  const heroFilters = Array.from(new Set(history.map((entry) => entry.hero)))
    .sort((a, b) => a.localeCompare(b));
  const activeFilter = heroFilter === "all" || heroFilters.includes(heroFilter) ? heroFilter : "all";
  const filteredHistory = (activeFilter === "all"
    ? history
    : history.filter((entry) => entry.hero === activeFilter)
  ).slice(0, 4);

  if (!history.length) {
    return {
      label: "SEASON ARCHIVE",
      detail: "Archived season history appears after the first completed run.",
      filters: [],
      activeFilter,
      entries: []
    };
  }

  return {
    label: "SEASON ARCHIVE",
    detail: activeFilter === "all"
      ? `Latest ${filteredHistory.length} archived run${filteredHistory.length === 1 ? "" : "s"} across the season table.`
      : `Latest ${filteredHistory.length} archived run${filteredHistory.length === 1 ? "" : "s"} for ${activeFilter}.`,
    filters: [
      { id: "all", label: "All heroes" },
      ...heroFilters.map((hero) => ({ id: hero, label: hero }))
    ],
    activeFilter,
    entries: filteredHistory.map((entry) => ({
      ...entry,
      chip: entry.qualified && entry.placement
        ? `#${entry.placement} FINISH`
        : `OUTSIDE TOP ${HIGH_SCORE_LIMIT}`,
      detail: `${entry.score} pts · ${entry.combo}x combo · ${entry.date}`
    }))
  };
}

function describeLeaderboardMomentumShift(previousHistory, history, result) {
  if (!result?.entry) return null;

  const before = getHeroMomentumStats(previousHistory || [], result.entry.hero);
  const after = getHeroMomentumStats(history || [], result.entry.hero);
  const tone = result.placement === 1 ? "top" : result.qualified ? "qualified" : "archived";
  const improvedBestPlacement = after.bestPlacement < before.bestPlacement && Number.isFinite(after.bestPlacement);

  if (!result.qualified) {
    if (before.currentStreak > 0 && after.currentStreak === 0) {
      return {
        tone,
        message: `${result.entry.hero}'s ${before.currentStreak}-run top-${HIGH_SCORE_LIMIT} streak snaps with this archived finish.`
      };
    }
    return null;
  }

  if (after.currentStreak > before.currentStreak) {
    if (before.currentStreak === 0) {
      if (improvedBestPlacement && before.bestPlacement < Number.MAX_SAFE_INTEGER) {
        return {
          tone,
          message: `${result.entry.hero} locks in a new season-best placement at #${after.bestPlacement}.`
        };
      }

      return {
        tone,
        message: `${result.entry.hero} opens a new top-${HIGH_SCORE_LIMIT} streak with this #${result.placement} finish.`
      };
    }

    return {
      tone,
      message: `${result.entry.hero} extends their top-${HIGH_SCORE_LIMIT} streak to ${after.currentStreak} straight runs.`
    };
  }

  if (improvedBestPlacement) {
    return {
      tone,
      message: `${result.entry.hero} locks in a new season-best placement at #${after.bestPlacement}.`
    };
  }

  return null;
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("saga_progress") || "{}"); }
  catch { return {}; }
}
function saveProgress(data) {
  localStorage.setItem("saga_progress", JSON.stringify(data));
}

const initState = (hero) => {
  const mission = createMission(1);
  return {
    hero,
    running: false,
    gameOver: false,
    score: 0,
    hp: hero.hp,
    player: { x: 2, y: 2 },
    orb: randomCell(),
    enemies: [randomCellAway({ x: 2, y: 2 }), randomCellAway({ x: 2, y: 2 })],
    powerup: null,
    activePowerups: {},
    timer: GAME_TIME,
    combo: 0,
    lastOrbTime: 0,
    maxCombo: 0,
    totalOrbs: 0,
    wonWith1Hp: false,
    usedSpeed: false,
    xp: loadProgress().xp || 0,
    level: loadProgress().level || 1,
    achievements: loadProgress().achievements || [],
    scoreFloats: [],
    shaking: false,
    difficulty: 1,
    abilityCharge: 0,
    abilityCooldownUntil: 0,
    enemyFreezeUntil: 0,
    mission,
    missionSecondsLeft: mission.duration,
    missionEvent: null,
    abilityEvent: null,
    directorBeat: createDirectorBeat("Launch Window", getDirectorPhase(GAME_TIME).callout),
    directorBeatEndsAt: Date.now() + 5000,
    swingEventTriggered: false,
    swingTriggerAt: 25 + Math.floor(Math.random() * 11),
    swingEvent: null,
    swingEventEndsAt: 0,
    bonusOrb: null,
    editHistory: [],
    appliedSounds: { orb: null, hit: null, win: null, lose: null, bgm: null },
    appliedAssets: { orb: null, enemy: null, player: null },
  };
};

function reducer(state, action) {
  switch (action.type) {
    case "TICK": {
      if (!state.running || state.gameOver) return state;
      const now = Date.now();
      const keys = action.keys;
      const hasSpeed = state.activePowerups.speed && now < state.activePowerups.speed;
      const step = hasSpeed ? state.hero.speed + 1 : state.hero.speed;
      let nx = state.player.x, ny = state.player.y;
      if (keys.ArrowUp || keys.w) ny -= step;
      if (keys.ArrowDown || keys.s) ny += step;
      if (keys.ArrowLeft || keys.a) nx -= step;
      if (keys.ArrowRight || keys.d) nx += step;
      const player = { x: clamp(nx, 0, GRID_W - 1), y: clamp(ny, 0, GRID_H - 1) };

      const enemies =
        state.enemyFreezeUntil && now < state.enemyFreezeUntil
          ? state.enemies
          : state.enemies.map((enemy) => moveEnemy(enemy, player, state.difficulty));

      let next = { ...state, player, enemies };
      let collectedCollectibleCount = 0;
      let orbCollected = false;

      // Magnet: pull orb closer
      if (state.activePowerups.magnet && now < state.activePowerups.magnet) {
        const odx = Math.sign(player.x - state.orb.x);
        const ody = Math.sign(player.y - state.orb.y);
        next.orb = { x: state.orb.x + odx, y: state.orb.y + ody };
        if (state.bonusOrb) {
          next.bonusOrb = {
            x: clamp(state.bonusOrb.x + odx, 0, GRID_W - 1),
            y: clamp(state.bonusOrb.y + ody, 0, GRID_H - 1)
          };
        }
      }

      // Orb collection
      if (player.x === next.orb.x && player.y === next.orb.y) {
        const isCombo = now - state.lastOrbTime < COMBO_WINDOW;
        const newCombo = isCombo ? state.combo + 1 : 1;
        const mult = comboMultiplier(newCombo);
        const points = Math.round(10 * mult);
        const newTotalOrbs = state.totalOrbs + 1;
        next = {
          ...next,
          score: state.score + points,
          orb: randomCellAway(player),
          combo: newCombo,
          lastOrbTime: now,
          maxCombo: Math.max(state.maxCombo, newCombo),
          totalOrbs: newTotalOrbs,
          scoreFloats: [...state.scoreFloats, { id: now, x: player.x, y: player.y, text: `+${points}` }],
          difficulty: 1 + Math.floor(newTotalOrbs / 5),
          abilityCharge: clamp(state.abilityCharge + 28, 0, ABILITY_MAX)
        };

        // XP gain
        const xpGain = points;
        let xp = state.xp + xpGain;
        let level = state.level;
        while (xp >= xpForLevel(level)) {
          xp -= xpForLevel(level);
          level += 1;
        }
        next.xp = xp;
        next.level = level;

        // Maybe spawn power-up
        if (!state.powerup && Math.random() < 0.25) {
          const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
          next.powerup = { ...randomCellAway(player, 4), type };
        }

        // Spawn extra enemy at difficulty milestones
        if (newTotalOrbs % 8 === 0 && enemies.length < 6) {
          next.enemies = [...next.enemies, randomCellAway(player)];
        }
        collectedCollectibleCount += 1;
        orbCollected = true;
      }

      if (next.bonusOrb && player.x === next.bonusOrb.x && player.y === next.bonusOrb.y) {
        next = {
          ...next,
          bonusOrb: null,
          score: next.score + 25,
          abilityCharge: clamp(next.abilityCharge + 35, 0, ABILITY_MAX),
          scoreFloats: [...next.scoreFloats, { id: now + 1, x: player.x, y: player.y, text: "+25" }],
          directorBeat: createDirectorBeat("Bonus Core Secured", "Sponsor highlight locked in for the next asset pass.", now),
          directorBeatEndsAt: now + 5000
        };
        collectedCollectibleCount += 1;
      }

      if (state.mission?.kind === "collect" && collectedCollectibleCount > 0) {
        next.mission = {
          ...state.mission,
          progress: Math.min(state.mission.target, state.mission.progress + collectedCollectibleCount)
        };
      }
      if (state.mission?.kind === "combo" && orbCollected) {
        next.mission = {
          ...state.mission,
          progress: Math.max(state.mission.progress, next.combo)
        };
      }

      // Powerup collection
      if (state.powerup && player.x === state.powerup.x && player.y === state.powerup.y) {
        const pType = state.powerup.type;
        next.powerup = null;
        next.activePowerups = { ...state.activePowerups, [pType.id]: now + pType.duration };
        if (pType.id === "speed") next.usedSpeed = true;
      }

      // Enemy collision
      const shielded = state.activePowerups.shield && now < state.activePowerups.shield;
      const hit = enemies.some((e) => e.x === player.x && e.y === player.y);
      if (hit && !shielded) {
        const newHp = state.hp - 1;
        next.hp = newHp;
        next.shaking = true;
        next.combo = 0;
        if (state.mission?.kind === "survive") {
          next = failMission(next);
        }
        if (newHp <= 0) {
          next.running = false;
          next.gameOver = true;
          next.hp = 0;
          const winner = state.score >= 50 ? "player" : "enemy";
          if (winner === "player" && state.hp === 1) next.wonWith1Hp = true;
        }
      }

      // Clean expired powerups
      const ap = { ...next.activePowerups };
      for (const k of Object.keys(ap)) {
        if (ap[k] < now) delete ap[k];
      }
      next.activePowerups = ap;
      if (next.directorBeatEndsAt && next.directorBeatEndsAt < now) {
        next.directorBeat = null;
        next.directorBeatEndsAt = 0;
      }
      if (next.swingEventEndsAt && next.swingEventEndsAt < now) {
        next.swingEvent = null;
        next.swingEventEndsAt = 0;
      }

      // Clean old score floats
      next.scoreFloats = next.scoreFloats.filter((f) => now - f.id < 800);

      if (next.mission && next.mission.kind !== "survive" && next.mission.progress >= next.mission.target) {
        next = completeMission(next);
      }

      // Check achievements
      const newAch = [];
      for (const ach of ACHIEVEMENTS) {
        if (!next.achievements.includes(ach.id) && ach.check(next)) {
          newAch.push(ach.id);
        }
      }
      if (newAch.length > 0) {
        next.achievements = [...next.achievements, ...newAch];
      }

      return next;
    }

    case "TIMER_TICK": {
      if (!state.running || state.gameOver) return state;
      const newTimer = state.timer - 1;
      if (newTimer <= 0) {
        return { ...state, timer: 0, running: false, gameOver: true };
      }

      const missionSecondsLeft = state.missionSecondsLeft - 1;
      let next = {
        ...state,
        timer: newTimer,
        missionSecondsLeft
      };

      const previousPhase = getDirectorPhase(state.timer);
      const nextPhase = getDirectorPhase(newTimer);
      if (previousPhase.id !== nextPhase.id) {
        const now = Date.now();
        next = {
          ...next,
          abilityCharge: clamp(next.abilityCharge + 20, 0, ABILITY_MAX),
          powerup: next.powerup || { ...randomCellAway(state.player, 4), type: POWERUP_TYPES[(state.level + newTimer) % POWERUP_TYPES.length] },
          directorBeat: createDirectorBeat(nextPhase.label, nextPhase.callout, now),
          directorBeatEndsAt: now + 6000
        };
      }

      if (missionSecondsLeft <= 0) {
        const missionResolved = state.mission?.kind === "survive" ? completeMission(next) : failMission(next);
        next = { ...missionResolved, timer: newTimer };
      }

      if (newTimer === state.swingTriggerAt && !state.swingEventTriggered) {
        next = triggerSwingEvent(next, newTimer);
        if (next.swingEvent) {
          next.swingEvent = {
            ...next.swingEvent,
            startPlayerCell: { ...state.player }
          };
        }
      }

      if (newTimer > 0 && newTimer % 12 === 0) {
        next = triggerDirectorBeat(next, newTimer);
      }

      return next;
    }

    case "SET_HERO": {
      const s = initState(action.hero);
      s.xp = state.xp;
      s.level = state.level;
      s.achievements = state.achievements;
      return s;
    }

    case "TOGGLE_RUN":
      if (state.gameOver) return state;
      return { ...state, running: !state.running };

    case "RESET": {
      const s = initState(state.hero);
      s.xp = state.xp;
      s.level = state.level;
      s.achievements = state.achievements;
      return s;
    }

    case "CLEAR_SHAKE":
      return { ...state, shaking: false };

    case "CLEAR_MISSION_EVENT":
      return { ...state, missionEvent: null };

    case "CLEAR_ABILITY_EVENT":
      return { ...state, abilityEvent: null };

    case "DEBUG_PATCH_STATE":
      return { ...state, ...(action.patch || {}) };

    case "ACTIVATE_ABILITY": {
      if (!state.running || state.gameOver) return state;
      const now = Date.now();
      const ability = HERO_ABILITIES[state.hero.id];
      if (!ability || state.abilityCharge < ABILITY_MAX || now < state.abilityCooldownUntil) return state;

      if (state.hero.id === "modeler") {
        return {
          ...state,
          hp: Math.min(state.hero.hp, state.hp + 1),
          abilityCharge: 0,
          abilityCooldownUntil: now + ability.cooldownMs,
          activePowerups: { ...state.activePowerups, shield: now + 4500 },
          enemies: state.enemies.map(() => randomCellAway(state.player, 5)),
          abilityEvent: { id: now, text: `${ability.name} deployed` }
        };
      }

      if (state.hero.id === "sounder") {
        return {
          ...state,
          combo: Math.max(state.combo, 2),
          abilityCharge: 0,
          abilityCooldownUntil: now + ability.cooldownMs,
          enemyFreezeUntil: now + 3500,
          abilityEvent: { id: now, text: `${ability.name} stunned the arena` }
        };
      }

      return {
        ...state,
        abilityCharge: 0,
        abilityCooldownUntil: now + ability.cooldownMs,
        activePowerups: {
          ...state.activePowerups,
          speed: now + 5000,
          magnet: now + 5000
        },
        abilityEvent: { id: now, text: `${ability.name} engaged` }
      };
    }

    case 'EDIT_GENERATE': {
      const newEntry = {
        id: Date.now().toString(),
        type: action.editType,
        subType: action.subType,
        prompt: action.prompt,
        result: action.result,
        appliedAt: null,
        versionNum: (state.editHistory || []).filter(e => e.subType === action.subType).length + 1,
        latencyMs: action.latencyMs,
        cacheHit: Boolean(action.cacheHit),
      };
      return { ...state, editHistory: [...(state.editHistory || []), newEntry] };
    }

    case 'EDIT_APPLY': {
      const entry = (state.editHistory || []).find(e => e.id === action.historyId);
      if (!entry) return state;
      const now = new Date().toISOString();
      const updatedHistory = (state.editHistory || []).map(e =>
        e.id === action.historyId ? { ...e, appliedAt: now } : e
      );
      if (entry.type === 'sound') {
        const newSounds = { ...state.appliedSounds, [entry.subType]: entry.result?.audioUrl };
        return { ...state, editHistory: updatedHistory, appliedSounds: newSounds };
      } else {
        const newAssets = { ...state.appliedAssets, [entry.subType]: entry.result?.modelUrl };
        return { ...state, editHistory: updatedHistory, appliedAssets: newAssets };
      }
    }

    case 'EDIT_REVERT':
      {
        const target = (state.editHistory || []).find((entry) => entry.id === action.historyId);
        if (!target) return state;
        const updatedHistory = (state.editHistory || []).map((entry) =>
          entry.id === action.historyId ? { ...entry, appliedAt: null } : entry
        );
        const previousApplied = [...updatedHistory]
          .reverse()
          .find((entry) => entry.type === target.type && entry.subType === target.subType && entry.appliedAt);

        if (target.type === "sound") {
          return {
            ...state,
            editHistory: updatedHistory,
            appliedSounds: {
              ...state.appliedSounds,
              [target.subType]: previousApplied?.result?.audioUrl || null
            }
          };
        }

        return {
          ...state,
          editHistory: updatedHistory,
          appliedAssets: {
            ...state.appliedAssets,
            [target.subType]: previousApplied?.result?.modelUrl || null
          }
        };
      }

    default:
      return state;
  }
}

async function jsonRequest(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const json = await res.json();
  if (!res.ok) {
    const error = new Error(json.message || "request failed");
    error.status = res.status;
    error.data = json.data;
    throw error;
  }
  return json;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, heroes[0], initState);
  const keysRef = useRef({});
  const [log, setLog] = useState([]);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [matchStatus, setMatchStatus] = useState("idle");
  const [spectators, setSpectators] = useState(0);
  const [odds, setOdds] = useState({ player: 1.9, enemy: 1.9 });
  const [betPools, setBetPools] = useState({ player: 0, enemy: 0 });
  const [betName, setBetName] = useState("guest_player");
  const [editorTab, setEditorTab] = useState("sound");
  const [betSide, setBetSide] = useState("player");
  const [betAmount, setBetAmount] = useState(100);
  const [serverLogs, setServerLogs] = useState([]);
  const [highScores, setHighScores] = useState(loadHighScores());
  const [leaderboardUpdate, setLeaderboardUpdate] = useState(null);
  const [leaderboardMomentumUpdate, setLeaderboardMomentumUpdate] = useState(null);
  const [selectedArchiveHero, setSelectedArchiveHero] = useState("all");
  const [studioBrief, setStudioBrief] = useState("Neon sponsor arena for creator-made hero collectibles");
  const [studioPack, setStudioPack] = useState(null);
  const [studioStatus, setStudioStatus] = useState("idle");
  const [studioCache, setStudioCache] = useState(null);
  const [selectedMarketingAngle, setSelectedMarketingAngle] = useState(null);
  const [marketingCopyFeedback, setMarketingCopyFeedback] = useState(null);
  const [betFeedback, setBetFeedback] = useState(null);
  const [betPending, setBetPending] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(null);
  const [sharePendingChannel, setSharePendingChannel] = useState(null);
  const [editorDrafts, setEditorDrafts] = useState({ sound: {}, asset: {} });
  const [editorSelection, setEditorSelection] = useState({ sound: "bgm", asset: "orb" });
  const latestStateRef = useRef(state);
  const marketingCopyActionRef = useRef(0);
  const studioPackRequestRef = useRef(0);
  const betActionRef = useRef(0);
  const shareActionRef = useRef(0);
  const gameOverHandledRef = useRef(false);
  const leaderboardBaselineRef = useRef(highScores);

  const {
    hero,
    running,
    gameOver,
    score,
    hp,
    player,
    orb,
    enemies,
    powerup,
    activePowerups,
    timer,
    combo,
    maxCombo,
    totalOrbs,
    xp,
    level,
    achievements,
    scoreFloats,
    shaking,
    difficulty,
    abilityCharge,
    abilityCooldownUntil,
    enemyFreezeUntil,
    mission,
    missionSecondsLeft,
    missionEvent,
    abilityEvent,
    directorBeat,
    swingEvent,
    bonusOrb,
    editHistory,
    appliedSounds,
    appliedAssets
  } = state;

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!gameOver) {
      leaderboardBaselineRef.current = highScores;
    }
  }, [gameOver, highScores]);

  const activeAbility = HERO_ABILITIES[hero.id];
  const directorPhase = getDirectorPhase(timer);
  const elapsedSeconds = GAME_TIME - timer;
  const bettingStatus = getBettingStatusSnapshot(matchStatus, timer, elapsedSeconds, currentMatchId);
  const leaderboardReference = gameOver ? leaderboardBaselineRef.current : highScores;
  const leaderboardEntryPreview = {
    hero: hero.name,
    score,
    combo: maxCombo,
    date: "live-run",
    createdAt: "9999-12-31T23:59:59.999Z"
  };
  const leaderboardRecap = getLeaderboardRecap(leaderboardReference, leaderboardEntryPreview);
  const leaderboardSeasonSummary = getLeaderboardSeasonSummary(leaderboardReference, leaderboardEntryPreview);
  const leaderboardBoardControl = getLeaderboardBoardControl(leaderboardReference);
  const leaderboardMomentum = getLeaderboardMomentum(leaderboardReference);
  const leaderboardSeasonArchive = getLeaderboardSeasonArchive(leaderboardReference, selectedArchiveHero);

  useEffect(() => {
    if (selectedArchiveHero !== "all" && !leaderboardSeasonArchive.filters.some((filter) => filter.id === selectedArchiveHero)) {
      setSelectedArchiveHero("all");
    }
  }, [leaderboardSeasonArchive.filters, selectedArchiveHero]);

  async function trackEvent(message, meta = {}) {
    try {
      await jsonRequest("/api/agent/log", {
        method: "POST",
        body: JSON.stringify({
          level: "info",
          message,
          meta
        })
      });
    } catch {
      /* telemetry is non-blocking */
    }
  }

  // Save progress on achievement / level change
  useEffect(() => {
    saveProgress({ xp, level, achievements });
  }, [xp, level, achievements]);

  // Save high score on game over
  useEffect(() => {
    if (!gameOver) {
      gameOverHandledRef.current = false;
      setLeaderboardMomentumUpdate(null);
      return;
    }
    if (gameOverHandledRef.current || score <= 0) return;

    gameOverHandledRef.current = true;
    leaderboardBaselineRef.current = highScores;
    const completedAt = new Date().toISOString();
    const highScoreResult = saveHighScore({
      hero: hero.name,
      score,
      combo: maxCombo,
      date: completedAt.slice(0, 10),
      createdAt: completedAt
    });
    setHighScores(highScoreResult.scores);
    setLeaderboardUpdate(describeLeaderboardPlacement(highScoreResult));
    setLeaderboardMomentumUpdate(
      describeLeaderboardMomentumShift(
        highScoreResult.previousHistory,
        highScoreResult.history,
        highScoreResult
      )
    );

    jsonRequest("/api/match/finish", {
      method: "POST",
      body: JSON.stringify({
        winner: score >= 50 ? "player" : "enemy",
        elapsedSeconds,
        playerId: hero.id
      })
    })
      .then((json) => {
        setMatchStatus(json.status || "finished");
      })
      .catch(() => null);
  }, [elapsedSeconds, gameOver, hero.id, hero.name, maxCombo, score]);

  async function refreshCacheStats() {
    try {
      const json = await jsonRequest("/api/varco/cache/stats");
      setStudioCache(json.cache);
    } catch {
      /* cache polling is non-fatal */
    }
  }

  // Keyboard
  useEffect(() => {
    const down = (e) => { keysRef.current = { ...keysRef.current, [e.key]: true }; };
    const up = (e) => { keysRef.current = { ...keysRef.current, [e.key]: false }; };
    const onKeyDown = (e) => {
      down(e);
      if ((e.code === "Space" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        dispatch({ type: "ACTIVATE_ABILITY" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => dispatch({ type: "TICK", keys: keysRef.current }), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // Timer countdown
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => dispatch({ type: "TIMER_TICK" }), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Clear shake
  useEffect(() => {
    if (shaking) {
      const t = setTimeout(() => dispatch({ type: "CLEAR_SHAKE" }), 300);
      return () => clearTimeout(t);
    }
  }, [shaking]);

  // Server polling
  useEffect(() => {
    jsonRequest("/api/match/start", { method: "POST" })
      .then((json) => {
        setCurrentMatchId(json.matchId);
        setMatchStatus(json.status || "running");
        return trackEvent("match_started", {
          matchId: json.matchId,
          playerId: hero.id,
          elapsedSeconds: 0
        });
      })
      .catch(() => null);
    refreshCacheStats().catch(() => null);
    const poll = setInterval(async () => {
      try {
        const [match, logsRes] = await Promise.all([
          jsonRequest("/api/match/state"),
          jsonRequest("/api/agent/logs")
        ]);
        setCurrentMatchId(match.match.matchId);
        setMatchStatus(match.match.status);
        setSpectators(match.match.spectators);
        setOdds(match.match.odds);
        setBetPools(match.match.pools);
        setServerLogs(logsRes.logs);
      } catch { /* polling non-fatal */ }
    }, 2500);
    const cachePoll = setInterval(() => {
      refreshCacheStats().catch(() => null);
    }, 10000);
    return () => {
      clearInterval(poll);
      clearInterval(cachePoll);
    };
  }, []);

  // Log orb collect
  useEffect(() => {
    if (totalOrbs > 0 && running) {
      const mult = comboMultiplier(combo);
      const pts = Math.round(10 * mult);
      const msg = combo > 1 ? `+${pts} (${combo}x combo!)` : `+${pts} UGC Core`;
      setLog((prev) => [msg, ...prev].slice(0, 8));
      jsonRequest("/api/agent/log", {
        method: "POST",
        body: JSON.stringify({ level: "info", message: "orb collected", meta: { score, combo } })
      }).catch(() => null);
    }
  }, [totalOrbs]);

  // Log hit
  useEffect(() => {
    if (hp < hero.hp && hp > 0 && running) {
      setLog((prev) => [`-1 HP (${hp} left)`, ...prev].slice(0, 8));
    }
  }, [hp]);

  useEffect(() => {
    if (!missionEvent) return;
    setLog((prev) => [missionEvent.text, ...prev].slice(0, 8));
    dispatch({ type: "CLEAR_MISSION_EVENT" });
  }, [missionEvent?.id]);

  useEffect(() => {
    if (!abilityEvent) return;
    setLog((prev) => [abilityEvent.text, ...prev].slice(0, 8));
    jsonRequest("/api/agent/log", {
      method: "POST",
      body: JSON.stringify({ level: "info", message: "ability activated", meta: { hero: hero.id, ability: abilityEvent.text } })
    }).catch(() => null);
    dispatch({ type: "CLEAR_ABILITY_EVENT" });
  }, [abilityEvent?.id]);

  useEffect(() => {
    if (!directorBeat) return;
    setLog((prev) => [`${directorBeat.title}: ${directorBeat.text}`, ...prev].slice(0, 8));
  }, [directorBeat?.id]);

  useEffect(() => {
    if (!swingEvent) return;
    setLog((prev) => [`${swingEvent.title}: ${swingEvent.text}`, ...prev].slice(0, 8));
    jsonRequest("/api/match/swing-event", {
      method: "POST",
      body: JSON.stringify({
        type: swingEvent.type,
        title: swingEvent.title,
        body: swingEvent.text,
        targetCell: swingEvent.targetCell || null,
        startPlayerCell: swingEvent.startPlayerCell || null,
        expiresAt: swingEventEndsAt || null,
        timer
      })
    }).catch(() => null);
  }, [swingEvent?.id]);

  useEffect(() => {
    if (!swingEvent?.id) return;
    const origin = swingEvent.startPlayerCell;
    const target = swingEvent.targetCell;
    if (!origin || !target) return;

    const t = setTimeout(() => {
      const latest = latestStateRef.current;
      const routeChanged = latest.player.x !== origin.x || latest.player.y !== origin.y;
      const targetApproached =
        manhattan(latest.player, target) < manhattan(origin, target);

      const commonMeta = {
        matchId: currentMatchId,
        playerId: latest.hero.id,
        elapsedSeconds: GAME_TIME - latest.timer,
        eventType: swingEvent.type,
        eventVariant: swingEvent.eventVariant || swingEvent.type,
        zoneShiftMode: swingEvent.zoneShiftMode || null,
        targetCell: target,
        playerPositionAtTrigger: origin,
        playerPosition10sAfter: latest.player
      };

      if (routeChanged) {
        trackEvent("player_route_changed", {
          ...commonMeta,
          pathChangedWithin10s: true
        });
      }

      if (targetApproached) {
        trackEvent("event_target_approached", {
          ...commonMeta,
          targetApproachedWithin10s: true
        });
      }
    }, 10000);

    return () => clearTimeout(t);
  }, [swingEvent?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__SAGA_DEBUG__ = {
      dispatch,
      getState: () => state
    };
    return () => {
      delete window.__SAGA_DEBUG__;
    };
  }, [state]);

  // Play orb sound
  useEffect(() => {
    if (totalOrbs > 0 && running && appliedSounds.orb) {
      try { new Audio(appliedSounds.orb).play(); } catch(e) {}
    }
  }, [totalOrbs, running, appliedSounds.orb]);

  // Play hit sound
  const prevHpRef = useRef(hero.hp);
  useEffect(() => {
    if (hp < prevHpRef.current && hp > 0 && running && appliedSounds.hit) {
      try { new Audio(appliedSounds.hit).play(); } catch(e) {}
    }
    prevHpRef.current = hp;
  }, [hp, running, appliedSounds.hit]);

  // Play win/lose sound on game over
  useEffect(() => {
    if (gameOver) {
      const winner = score >= 50 ? "player" : "enemy";
      const soundUrl = winner === "player" ? appliedSounds.win : appliedSounds.lose;
      if (soundUrl) {
        try { new Audio(soundUrl).play(); } catch(e) {}
      }
    }
  }, [gameOver, score, appliedSounds.win, appliedSounds.lose]);

  useEffect(() => {
    if (studioPack?.marketingAngles?.length) {
      setSelectedMarketingAngle(studioPack.marketingAngles[0]);
    } else {
      setSelectedMarketingAngle(null);
    }
    clearMarketingCopyFeedback();
  }, [studioPack?.packId]);

  const totalPool = betPools.player + betPools.enemy || 1;
  const abilityPercent = (abilityCharge / ABILITY_MAX) * 100;
  const abilityCooldown = Math.max(0, Math.ceil((abilityCooldownUntil - Date.now()) / 1000));
  const abilityReady = abilityCharge >= ABILITY_MAX && abilityCooldown <= 0;
  const enemyFrozen = enemyFreezeUntil && Date.now() < enemyFreezeUntil;

  // Build tile data
  const tiles = useMemo(() => {
    const map = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let entity = null;
        let classes = "tile";
        if ((x + y) % 2 === 0) classes += " light";

        if (powerup && x === powerup.x && y === powerup.y) {
          entity = "powerup";
          classes += " has-powerup";
        }
        if (x === orb.x && y === orb.y) {
          entity = "orb";
          classes += " has-orb";
          if (appliedAssets.orb) classes += " custom-orb";
        }
        if (bonusOrb && x === bonusOrb.x && y === bonusOrb.y) {
          entity = "bonus";
          classes += " has-bonus-orb";
        }
        if (enemies.some((e) => e.x === x && e.y === y)) {
          entity = "enemy";
          classes += " has-enemy";
          if (appliedAssets.enemy) classes += " custom-enemy";
          if (enemyFrozen) classes += " frozen";
        }
        if (swingEvent?.targetCell && swingEvent.targetCell.x === x && swingEvent.targetCell.y === y) {
          classes += " swing-target";
        }
        if (player.x === x && player.y === y) {
          entity = "player";
          classes += " has-player";
          if (activePowerups.shield && Date.now() < activePowerups.shield) classes += " shielded";
          if (appliedAssets.player) classes += " custom-player";
        }

        map.push({ key: `${x}-${y}`, classes, entity, x, y });
      }
    }
    return map;
  }, [player, orb, bonusOrb, enemies, powerup, activePowerups, appliedAssets, enemyFrozen, swingEvent]);

  const hpPercent = (hp / hero.hp) * 100;
  const xpPercent = (xp / xpForLevel(level)) * 100;
  const liveAssetCount = Object.values(appliedAssets).filter(Boolean).length;
  const liveSoundCount = Object.values(appliedSounds).filter(Boolean).length;

  function updateEditorDraft(kind, key, value) {
    setEditorDrafts((prev) => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [key]: value
      }
    }));
  }

  function applyStudioSuggestion(kind, key, prompt) {
    updateEditorDraft(kind, key, prompt);
    setEditorSelection((prev) => ({ ...prev, [kind]: key }));
    setEditorTab(kind === "sound" ? "sound" : "asset");
    setLog((prev) => [`Prompt loaded: ${key}`, ...prev].slice(0, 8));
  }

  function clearMarketingCopyFeedback() {
    marketingCopyActionRef.current += 1;
    setMarketingCopyFeedback(null);
  }

  function resetStudioPackState({ cancelInFlight = false, nextStatus = "idle" } = {}) {
    if (cancelInFlight) {
      studioPackRequestRef.current += 1;
    }
    setStudioPack(null);
    setStudioStatus(nextStatus);
    setEditorDrafts({ sound: {}, asset: {} });
    setSelectedMarketingAngle(null);
    clearMarketingCopyFeedback();
  }

  function marketingCopyButtonLabel() {
    const angleLabel = selectedMarketingAngle?.label || "launch";
    return marketingCopyFeedback?.tone === "ready"
      ? `Copied ${angleLabel} copy`
      : `Copy ${angleLabel} copy`;
  }

  function selectMarketingAngle(angle) {
    setSelectedMarketingAngle(angle);
    clearMarketingCopyFeedback();
  }

  function shareButtonLabel(channel) {
    const label = SHARE_CHANNEL_LABELS[channel] || channel;
    if (sharePendingChannel === channel) return `Sharing ${label}...`;
    if (shareFeedback?.tone === "ready" && shareFeedback.channel === channel) return `Shared ${label}`;
    return `Share ${label}`;
  }

  function loadQueueItem(item) {
    if (item.lane === "social") {
      const angle = studioPack?.marketingAngles?.find((entry) => entry.channel === item.key) || null;
      selectMarketingAngle(angle);
      setLog((prev) => [`Copy loaded: ${item.key}`, ...prev].slice(0, 8));
      return;
    }
    applyStudioSuggestion(item.lane, item.key, item.prompt);
  }

  function clearBetFeedback() {
    betActionRef.current += 1;
    setBetPending(false);
    setBetFeedback(null);
  }

  function betSideLabel(side) {
    return side === "enemy" ? "Enemy Win" : "Player Win";
  }

  function validateBetDraft(name, amount) {
    if (!name.trim()) return "Enter a bettor name before placing a bet.";
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return "Enter a bet amount greater than zero.";
    }
    if (matchStatus !== "running") {
      return matchStatus === "finished"
        ? "Betting is closed until the next match starts."
        : "Betting will open when the live match starts.";
    }
    return null;
  }

  async function copyMarketingCopy() {
    if (!selectedMarketingAngle?.copy) return;

    const actionId = marketingCopyActionRef.current + 1;
    marketingCopyActionRef.current = actionId;
    setMarketingCopyFeedback(null);

    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
      if (marketingCopyActionRef.current !== actionId) return;
      setMarketingCopyFeedback({ tone: "error", message: "Clipboard unavailable in this browser." });
      setLog((prev) => ["Clipboard unavailable", ...prev].slice(0, 8));
      return;
    }

    try {
      await navigator.clipboard.writeText(`${selectedMarketingAngle.copy}\nCTA: ${selectedMarketingAngle.cta}`);
      if (marketingCopyActionRef.current !== actionId) return;
      setMarketingCopyFeedback({ tone: "ready", message: `${selectedMarketingAngle.label} copy copied.` });
      setLog((prev) => [`Copied ${selectedMarketingAngle.label} copy`, ...prev].slice(0, 8));
    } catch {
      if (marketingCopyActionRef.current !== actionId) return;
      setMarketingCopyFeedback({ tone: "error", message: "Clipboard copy blocked. Try again after granting permissions." });
      setLog((prev) => ["Clipboard copy blocked", ...prev].slice(0, 8));
    }
  }

  async function generateStudioPack() {
    const requestToken = studioPackRequestRef.current + 1;
    studioPackRequestRef.current = requestToken;
    const briefAtStart = studioBrief;
    const heroIdAtStart = hero.id;
    const applyIfActive = (callback) => {
      if (studioPackRequestRef.current !== requestToken) return;
      callback();
    };

    resetStudioPackState({ nextStatus: "loading" });
    try {
      const json = await jsonRequest("/api/varco/studio-pack", {
        method: "POST",
        body: JSON.stringify({ brief: briefAtStart, heroId: heroIdAtStart })
      });
      applyIfActive(() => {
        setStudioPack(json.studioPack);
        setStudioStatus(json.studioPack.cache_hit ? "cached" : "ready");
        setEditorDrafts({
          sound: json.studioPack.sounds,
          asset: json.studioPack.assets
        });
        setSelectedMarketingAngle(json.studioPack.marketingAngles?.[0] || null);
        clearMarketingCopyFeedback();
        refreshCacheStats().catch(() => null);
        setLog((prev) => [`Studio pack ${json.studioPack.cache_hit ? "cached" : "ready"}`, ...prev].slice(0, 8));
      });
    } catch (error) {
      applyIfActive(() => {
        setStudioStatus("error");
        setLog((prev) => [`Studio pack failed: ${error.message}`, ...prev].slice(0, 8));
      });
    }
  }

  async function placeBet() {
    const userName = betName.trim();
    const amount = Number(betAmount);
    const validationMessage = validateBetDraft(userName, amount);
    if (validationMessage) {
      setBetFeedback({ tone: "error", message: validationMessage });
      setLog((prev) => [`Bet blocked: ${validationMessage}`, ...prev].slice(0, 8));
      return;
    }

    const actionId = betActionRef.current + 1;
    betActionRef.current = actionId;
    setBetPending(true);
    setBetFeedback({ tone: "pending", message: `Submitting ${betSideLabel(betSide)} for ${amount}.` });

    try {
      const json = await jsonRequest("/api/match/bet", {
        method: "POST",
        body: JSON.stringify({ userName, side: betSide, amount })
      });
      if (betActionRef.current !== actionId) return;
      setBetName(userName);
      setBetPending(false);
      setBetPools(json.pools);
      setOdds(json.odds);
      setBetFeedback({ tone: "ready", message: `${userName} backed ${betSideLabel(betSide)} for ${amount}.` });
      setLog((prev) => [`Bet: ${betSide} ${amount}`, ...prev].slice(0, 8));
    } catch (error) {
      if (betActionRef.current !== actionId) return;
      setBetPending(false);
      if (error?.data?.status) {
        setMatchStatus(error.data.status);
      }
      if (error?.data?.matchId) {
        setCurrentMatchId(error.data.matchId);
      }
      setBetFeedback({ tone: "error", message: error.message || "Bet failed." });
      setLog((prev) => [`Bet failed: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  async function shareResult(channel) {
    const actionId = shareActionRef.current + 1;
    shareActionRef.current = actionId;
    const channelLabel = SHARE_CHANNEL_LABELS[channel] || channel;
    setSharePendingChannel(channel);
    setShareFeedback({ tone: "pending", channel, message: `Preparing ${channelLabel} share link...` });

    try {
      const winner = score >= 50 ? "player" : "enemy";
      const json = await jsonRequest("/api/share/sns", {
        method: "POST",
        body: JSON.stringify({
          score,
          winner,
          hero: hero.name,
          variant: studioPack?.campaign?.headline || null,
          assetVariant: editHistory.findLast?.((entry) => entry.type === "asset" && entry.appliedAt)?.prompt || null,
          soundVariant: editHistory.findLast?.((entry) => entry.type === "sound" && entry.appliedAt)?.prompt || null
        })
      });
      if (shareActionRef.current !== actionId) return;

      const shareUrl = json.links?.[channel];
      if (!shareUrl) {
        throw new Error(`${channelLabel} share link unavailable.`);
      }

      window.open(shareUrl, "_blank", "noopener,noreferrer");
      setSharePendingChannel(null);
      setShareFeedback({ tone: "ready", channel, message: `Opened ${channelLabel} share link.` });
      setLog((prev) => [`Shared: ${channel}`, ...prev].slice(0, 8));
    } catch (error) {
      if (shareActionRef.current !== actionId) return;
      setSharePendingChannel(null);
      setShareFeedback({ tone: "error", channel, message: error.message || `${channelLabel} share failed.` });
      setLog((prev) => [`Share failed: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  function handleReset() {
    if (running && !gameOver) {
      trackEvent("match_abandoned", {
        matchId: currentMatchId,
        playerId: hero.id,
        elapsedSeconds
      });
    }
    gameOverHandledRef.current = false;
    setLeaderboardUpdate(null);
    setLeaderboardMomentumUpdate(null);
    dispatch({ type: "RESET" });
    setLog([]);
    setMatchStatus("idle");
    jsonRequest("/api/match/start", { method: "POST" })
      .then((json) => {
        setCurrentMatchId(json.matchId);
        setMatchStatus(json.status || "running");
        return trackEvent("match_started", {
          matchId: json.matchId,
          playerId: hero.id,
          elapsedSeconds: 0
        });
      })
      .catch(() => null);
  }

  return (
    <main>
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <span className="brand-title">VARCO AGENT SAGA</span>
          <div className="hero-select">
            {heroes.map((h) => (
              <button key={h.id} type="button" className={`hero-btn${hero.id === h.id ? " active" : ""}`} onClick={() => dispatch({ type: "SET_HERO", hero: h })}>
                {h.name}
              </button>
            ))}
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-label">SCORE</span>
            <span className="stat-val score">{score}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">TIME</span>
            <span className="stat-val timer">{timer}s</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">LV</span>
            <span className="stat-val">{level}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">DIFF</span>
            <span className="stat-val">{difficulty}</span>
          </div>
        </div>
      </header>

      {/* LEFT PANEL */}
      <div className="left-panel">
        {/* HP */}
        <div className="panel">
          <div className="panel-title">HP</div>
          <div className="hp-bar-wrap">
            <div className={`hp-bar-fill${hpPercent <= 30 ? " low" : ""}`} style={{ width: `${hpPercent}%` }} />
            <div className="hp-bar-text">{hp} / {hero.hp}</div>
          </div>
        </div>

        {/* XP / Level */}
        <div className="panel">
          <div className="panel-title">Level {level}</div>
          <div className="xp-bar-wrap">
            <div className="xp-bar-fill" style={{ width: `${xpPercent}%` }} />
          </div>
          <div className="xp-info">
            <span>XP {xp}/{xpForLevel(level)}</span>
            <span>{hero.desc}</span>
          </div>
        </div>

        {/* Combo */}
        <div className="panel">
          <div className="panel-title">Combo</div>
          <div className="combo-display">
            <div className={`combo-count${combo > 1 ? " bump" : ""}`}>{combo}x</div>
            <div className="combo-label">Multiplier</div>
            <div className="combo-mult">{comboMultiplier(combo).toFixed(1)}x pts</div>
          </div>
        </div>

        <div className="panel mission-panel" data-testid="mission-panel">
          <div className="panel-title">Director Mission</div>
          <div className="mission-header">
            <strong>{mission.title}</strong>
            <span>{missionSecondsLeft}s</span>
          </div>
          <div className="mission-progress-row">
            <span>{missionProgressText(mission)}</span>
            <span>{mission.rewardLabel}</span>
          </div>
          <div className="mission-progress-bar">
            <div
              className="mission-progress-fill"
              style={{ width: `${mission.kind === "survive" ? ((mission.duration - missionSecondsLeft) / mission.duration) * 100 : (mission.progress / mission.target) * 100}%` }}
            />
          </div>
        </div>

        <div className="panel ability-panel" data-testid="ability-panel">
          <div className="panel-title">Hero Ability</div>
          <div className="ability-header">
            <strong>{activeAbility.name}</strong>
            <span>{activeAbility.hint}</span>
          </div>
          <div className="ability-summary">{activeAbility.summary}</div>
          <div className="ability-bar-wrap">
            <div className={`ability-bar-fill${abilityReady ? " ready" : ""}`} style={{ width: `${abilityPercent}%` }} />
          </div>
          <div className="ability-meta">
            <span>{Math.round(abilityPercent)}% charged</span>
            <span>{abilityReady ? "Ready" : `${abilityCooldown}s cd`}</span>
          </div>
          <button
            type="button"
            className={`ability-btn${abilityReady ? " ready" : ""}`}
            onClick={() => dispatch({ type: "ACTIVATE_ABILITY" })}
            disabled={!abilityReady}
          >
            {abilityReady ? `Activate ${activeAbility.name}` : "Build charge by collecting cores"}
          </button>
        </div>

        <div className="panel director-panel" data-testid="director-panel">
          <div className="panel-title">Arena Director</div>
          <div className="director-phase-row">
            <strong>{directorPhase.label}</strong>
            <span>{directorPhase.threat} threat</span>
          </div>
          <p className="director-phase-copy">{directorPhase.callout}</p>
          {directorBeat && (
            <div className="director-beat-card">
              <strong>{directorBeat.title}</strong>
              <span>{directorBeat.text}</span>
            </div>
          )}
          {swingEvent && (
            <div className="director-beat-card" data-testid="swing-event-card">
              <strong>{swingEvent.title}</strong>
              <span>{swingEvent.text}</span>
            </div>
          )}
          <div className="director-kpis">
            <div>
              <span>Bonus core</span>
              <strong>{bonusOrb ? "Live" : "Offline"}</strong>
            </div>
            <div>
              <span>Live assets</span>
              <strong>{liveAssetCount}/3</strong>
            </div>
            <div>
              <span>Live cues</span>
              <strong>{liveSoundCount}/5</strong>
            </div>
          </div>
        </div>

        {/* Power-ups */}
        <div className="panel">
          <div className="panel-title">Power-ups</div>
          <div className="powerup-list">
            {POWERUP_TYPES.map((pt) => {
              const activeUntil = activePowerups[pt.id];
              const isActive = activeUntil && Date.now() < activeUntil;
              const secs = isActive ? Math.ceil((activeUntil - Date.now()) / 1000) : 0;
              return (
                <div key={pt.id} className={`powerup-item${isActive ? " active" : ""}`}>
                  <span>{pt.icon}</span>
                  <span>{pt.label}</span>
                  {isActive && <span className="powerup-timer">{secs}s</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Watch / Spectators */}
        <div className="panel watch-box">
          <div className="panel-title">Live</div>
          <div className="watch-live">{spectators}</div>
          <div className="odds-row">
            <span>P: {odds.player}x</span>
            <span>E: {odds.enemy}x</span>
          </div>
          <div className="live-state-row">
            <span>{enemyFrozen ? "ENEMIES FROZEN" : "ARENA HOT"}</span>
            <span>{liveAssetCount} skins live</span>
          </div>
          <div className="pool-bar">
            <div className="pool-bar-p" style={{ width: `${(betPools.player / totalPool) * 100}%` }} />
            <div className="pool-bar-e" style={{ width: `${(betPools.enemy / totalPool) * 100}%` }} />
          </div>
        </div>

        {/* Game Controls */}
        <div className="panel">
          <div className="panel-title">Controls</div>
          <div className="game-controls">
            <button type="button" className={`ctrl-btn${running ? " pause" : " start"}`} onClick={() => dispatch({ type: "TOGGLE_RUN" })}>
              {running ? "Pause" : "Start"}
            </button>
            <button type="button" className="ctrl-btn" onClick={handleReset}>Reset</button>
          </div>
        </div>
      </div>

      {/* ARENA */}
      <div className="arena-wrap">
        <div className="arena-status-strip" data-testid="arena-status-strip">
          <span>Phase: {directorPhase.label}</span>
          <span>Mission: {mission.title}</span>
          <span>Ability: {activeAbility.name}</span>
          <span>Swing: {state.swingEventTriggered ? "Triggered" : "Pending"}</span>
          <span>Assets live: {liveAssetCount}/3</span>
          <span>Sound cues live: {liveSoundCount}/5</span>
        </div>
        <div className={`arena-3d${shaking ? " shake" : ""}`} role="application" aria-label="game grid">
          {tiles.map((t) => (
            <div key={t.key} className={t.classes}>
              {t.entity && (
                <div
                  className="entity"
                  data-icon={
                    t.entity === "powerup" && powerup
                      ? powerup.type.icon
                      : t.entity === "bonus"
                        ? "★"
                        : undefined
                  }
                />
              )}
            </div>
          ))}
          {scoreFloats.map((f) => (
            <div
              key={f.id}
              className="score-float"
              style={{ gridColumn: f.x + 1, gridRow: f.y + 1 }}
            >
              {f.text}
            </div>
          ))}
        </div>

        {gameOver && (
          <div className="game-over-overlay" data-testid="game-over-overlay">
            <div className="game-over-title">GAME OVER</div>
            <div className="game-over-score">Score: {score} | Best Combo: {maxCombo}x</div>
            {leaderboardUpdate && (
              <div
                className={`game-over-placement game-over-placement-${leaderboardUpdate.tone}`}
                data-testid="game-over-placement"
              >
                {leaderboardUpdate.message}
              </div>
            )}
            {leaderboardMomentumUpdate && (
              <div
                className={`game-over-placement game-over-placement-${leaderboardMomentumUpdate.tone} game-over-momentum`}
                data-testid="game-over-momentum"
              >
                {leaderboardMomentumUpdate.message}
              </div>
            )}
            <button type="button" onClick={handleReset}>Play Again</button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        {/* Betting */}
        <div className="panel">
          <div className="panel-title">Betting</div>
          <div className="bet-inputs">
            <input
              data-testid="bet-name-input"
              value={betName}
              onChange={(e) => {
                clearBetFeedback();
                setBetName(e.target.value);
              }}
              placeholder="user name"
            />
            <select
              data-testid="bet-side-select"
              value={betSide}
              onChange={(e) => {
                clearBetFeedback();
                setBetSide(e.target.value);
              }}
            >
              <option value="player">Player Win</option>
              <option value="enemy">Enemy Win</option>
            </select>
            <input
              data-testid="bet-amount-input"
              type="number"
              min="10"
              step="10"
              value={betAmount}
              onChange={(e) => {
                clearBetFeedback();
                setBetAmount(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="bet-btn"
            data-testid="bet-submit-button"
            onClick={placeBet}
            disabled={betPending}
          >
            {betPending ? "Placing Bet..." : "Place Bet"}
          </button>
          <div className="bet-status-strip" data-testid="bet-status-strip">
            <span className={`bet-status-chip bet-status-chip-${bettingStatus.tone}`} data-testid="bet-status-chip">
              {bettingStatus.chip}
            </span>
            <span className="bet-status-note" data-testid="bet-status-note">{bettingStatus.detail}</span>
          </div>
          {betFeedback && (
            <div className={`bet-feedback share-feedback share-feedback-${betFeedback.tone}`} data-testid="bet-feedback">
              {betFeedback.message}
            </div>
          )}
        </div>

        <div className="panel promo-director" data-testid="studio-pack-panel">
          <div className="panel-title">Promo Director</div>
          <textarea
            className="studio-brief-input"
            value={studioBrief}
            onChange={(e) => {
              setStudioBrief(e.target.value);
              if (studioStatus === "loading" || studioPack) {
                resetStudioPackState({ cancelInFlight: studioStatus === "loading" });
              }
            }}
            placeholder="Describe the campaign brief once, then reuse it across sounds, assets, and social copy."
          />
          <button type="button" className="bet-btn" onClick={generateStudioPack} disabled={studioStatus === "loading"}>
            {studioStatus === "loading" ? "Building Pack..." : "Generate Studio Pack"}
          </button>
          <div className="studio-kpi-strip" data-testid="studio-kpi-strip">
            <span>cache hits {studioCache?.hits ?? 0}</span>
            <span>saved calls {studioCache?.savedCalls ?? 0}</span>
            <span>studio hits {studioCache?.studioPackHits ?? 0}</span>
          </div>
          {studioPack && (
            <div className="studio-pack-card">
              <div className="studio-pack-header">
                <strong>{studioPack.campaign.headline}</strong>
                <span>{studioPack.cache_hit ? "cached" : "fresh"}</span>
              </div>
              <p>{studioPack.campaign.tagline}</p>
              <div className="studio-savings">
                <span>{studioPack.savings.estimatedCallsSaved} calls saved</span>
                <span>{studioPack.savings.estimatedCallsWithPack}/{studioPack.savings.estimatedCallsWithoutPack} planned</span>
              </div>
              <div className="studio-queue">
                <div className="studio-suggestion-title">Production Queue</div>
                {studioPack.productionQueue.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="studio-queue-item"
                    onClick={() => loadQueueItem(item)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.lane} / {item.key}</span>
                  </button>
                ))}
              </div>
              <div className="studio-suggestion-group">
                <div className="studio-suggestion-title">Sound Prompts</div>
                {Object.entries(studioPack.sounds).map(([key, prompt]) => (
                  <button key={key} type="button" className="studio-chip" onClick={() => applyStudioSuggestion("sound", key, prompt)}>
                    {key}
                  </button>
                ))}
              </div>
              <div className="studio-suggestion-group">
                <div className="studio-suggestion-title">Asset Directions</div>
                {Object.entries(studioPack.assets).map(([key, prompt]) => (
                  <button key={key} type="button" className="studio-chip" onClick={() => applyStudioSuggestion("asset", key, prompt)}>
                    {key}
                  </button>
                ))}
              </div>
              <div className="studio-suggestion-group">
                <div className="studio-suggestion-title">Marketing Copy</div>
                {studioPack.marketingAngles.map((angle) => (
                  <button
                    key={angle.id}
                    type="button"
                    className={`studio-chip${selectedMarketingAngle?.id === angle.id ? " active" : ""}`}
                    onClick={() => selectMarketingAngle(angle)}
                  >
                    {angle.label}
                  </button>
                ))}
              </div>
              {selectedMarketingAngle && (
                <div className="studio-copy-card" data-testid="studio-copy-card">
                  <strong>{selectedMarketingAngle.label}</strong>
                  <p>{selectedMarketingAngle.copy}</p>
                  <span>{selectedMarketingAngle.cta}</span>
                  <button type="button" className="share-btn" data-testid="studio-copy-button" onClick={copyMarketingCopy}>
                    {marketingCopyButtonLabel()}
                  </button>
                  {marketingCopyFeedback && (
                    <div
                      className={`studio-copy-feedback studio-copy-feedback-${marketingCopyFeedback.tone}`}
                      data-testid="studio-copy-feedback"
                    >
                      {marketingCopyFeedback.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* VARCO STUDIO EDITOR */}
        <div className="panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">VARCO Studio Editor</div>
          <div className="editor-tabs">
            <button className={`editor-tab-btn ${editorTab === "sound" ? "active" : ""}`} onClick={() => setEditorTab("sound")}>🎵 사운드</button>
            <button className={`editor-tab-btn ${editorTab === "asset" ? "active" : ""}`} onClick={() => setEditorTab("asset")}>🧊 에셋</button>
            <button className={`editor-tab-btn ${editorTab === "history" ? "active" : ""}`} onClick={() => setEditorTab("history")}>📋 이력</button>
          </div>
          <div className="editor-panel">
            {editorTab === "sound" && (
              <SoundEditor
                editHistory={editHistory}
                dispatch={dispatch}
                studioPack={studioPack}
                draftPrompts={editorDrafts.sound}
                selectedKey={editorSelection.sound}
                onSelectKey={(key) => setEditorSelection((prev) => ({ ...prev, sound: key }))}
                onDraftChange={(key, value) => updateEditorDraft("sound", key, value)}
              />
            )}
            {editorTab === "asset" && (
              <AssetEditor
                editHistory={editHistory}
                dispatch={dispatch}
                studioPack={studioPack}
                draftPrompts={editorDrafts.asset}
                selectedKey={editorSelection.asset}
                onSelectKey={(key) => setEditorSelection((prev) => ({ ...prev, asset: key }))}
                onDraftChange={(key, value) => updateEditorDraft("asset", key, value)}
              />
            )}
            {editorTab === "history" && <EditHistory editHistory={editHistory} dispatch={dispatch} />}
          </div>
        </div>

        {/* SNS Share */}
        <div className="panel">
          <div className="panel-title">Share</div>
          <div className="share-btns">
            <button type="button" className="share-btn" data-testid="share-button-x" onClick={() => shareResult("x")}>{shareButtonLabel("x")}</button>
            <button type="button" className="share-btn" data-testid="share-button-facebook" onClick={() => shareResult("facebook")}>{shareButtonLabel("facebook")}</button>
            <button type="button" className="share-btn" data-testid="share-button-telegram" onClick={() => shareResult("telegram")}>{shareButtonLabel("telegram")}</button>
          </div>
          {shareFeedback && (
            <div className={`share-feedback share-feedback-${shareFeedback.tone}`} data-testid="share-feedback">
              {shareFeedback.message}
            </div>
          )}
        </div>

        {/* Achievements */}
        <div className="panel">
          <div className="panel-title">Achievements</div>
          <div className="achievement-list">
            {ACHIEVEMENTS.map((a) => {
              const unlocked = achievements.includes(a.id);
              return (
                <div key={a.id} className={`achievement-item${unlocked ? " unlocked" : ""}`}>
                  <span className="achievement-icon">{unlocked ? "*" : "-"}</span>
                  <span>{a.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="panel">
          <div className="panel-title">High Scores</div>
          <div className={`leaderboard-recap leaderboard-recap-${leaderboardRecap.tone}`} data-testid="leaderboard-recap">
            <span className="leaderboard-recap-chip" data-testid="leaderboard-recap-chip">{leaderboardRecap.chip}</span>
            <span className="leaderboard-recap-detail" data-testid="leaderboard-recap-detail">{leaderboardRecap.detail}</span>
          </div>
          <div className="leaderboard-summary-grid" data-testid="leaderboard-summary-grid">
            <div className="leaderboard-summary-card" data-testid="leaderboard-season-summary">
              <span className="leaderboard-summary-label">SEASON LEAD</span>
              <span className="leaderboard-summary-detail" data-testid="leaderboard-season-detail">{leaderboardSeasonSummary.seasonDetail}</span>
            </div>
            <div className="leaderboard-summary-card" data-testid="leaderboard-rival-summary">
              <span className="leaderboard-summary-label">RIVAL TARGET</span>
              <span className="leaderboard-summary-detail" data-testid="leaderboard-rival-detail">{leaderboardSeasonSummary.rivalDetail}</span>
            </div>
          </div>
          <div className="leaderboard-control-panel" data-testid="leaderboard-control-panel">
            <div className="leaderboard-control-label">BOARD CONTROL</div>
            <div className="leaderboard-control-momentum" data-testid="leaderboard-control-momentum">
              <span className="leaderboard-control-momentum-label">{leaderboardMomentum.label}</span>
              <span className="leaderboard-control-momentum-detail">{leaderboardMomentum.detail}</span>
            </div>
            {leaderboardBoardControl.length > 0 ? (
              <div className="leaderboard-control-list" data-testid="leaderboard-control-list">
                {leaderboardBoardControl.map((control) => (
                  <div
                    key={control.hero}
                    className="leaderboard-control-card"
                    data-testid="leaderboard-control-item"
                  >
                    <div className="leaderboard-control-topline">
                      <span className="leaderboard-control-hero">{control.hero}</span>
                      <span className="leaderboard-control-badge">{control.badge}</span>
                    </div>
                    <div className="leaderboard-control-detail">{control.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="leaderboard-control-empty" data-testid="leaderboard-control-empty">
                Post the first clean run to reveal hero control badges.
              </div>
            )}
          </div>
          <div className="leaderboard-archive-panel" data-testid="leaderboard-archive-panel">
            <div className="leaderboard-archive-label">{leaderboardSeasonArchive.label}</div>
            {leaderboardSeasonArchive.filters.length > 1 && (
              <div className="leaderboard-archive-filters" data-testid="leaderboard-archive-filters">
                {leaderboardSeasonArchive.filters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={`leaderboard-archive-filter${leaderboardSeasonArchive.activeFilter === filter.id ? " active" : ""}`}
                    data-testid="leaderboard-archive-filter"
                    onClick={() => setSelectedArchiveHero(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
            <div className="leaderboard-archive-detail" data-testid="leaderboard-archive-detail">{leaderboardSeasonArchive.detail}</div>
            {leaderboardSeasonArchive.entries.length > 0 ? (
              <div className="leaderboard-archive-list" data-testid="leaderboard-archive-list">
                {leaderboardSeasonArchive.entries.map((entry) => (
                  <div
                    key={`${entry.hero}-${entry.score}-${entry.combo}-${entry.createdAt}`}
                    className="leaderboard-archive-card"
                    data-testid="leaderboard-archive-item"
                  >
                    <div className="leaderboard-archive-topline">
                      <span className="leaderboard-archive-hero">{entry.hero}</span>
                      <span className={`leaderboard-archive-chip${entry.qualified ? "" : " leaderboard-archive-chip-archived"}`}>{entry.chip}</span>
                    </div>
                    <div className="leaderboard-archive-meta">{entry.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="leaderboard-archive-empty" data-testid="leaderboard-archive-empty">
                Archived season history appears after the first completed run.
              </div>
            )}
          </div>
          <ul className="leaderboard" data-testid="high-scores-list">
            {highScores.length === 0 && <li style={{ color: "#8b949e", fontSize: "11px" }}>No scores yet</li>}
            {highScores.map((hs, i) => (
              <li key={`${hs.hero}-${hs.score}-${hs.combo}-${hs.createdAt}-${i}`} data-testid="high-score-item">
                <span className="rank">#{i + 1}</span>
                <span>{hs.hero}</span>
                <span style={{ color: "#8b949e", fontSize: "11px" }}>Combo {hs.combo} · {hs.date}</span>
                <span className="lb-score">{hs.score}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* FOOTER */}
      <div className="footer">
        <div className="panel">
          <div className="panel-title">Game Log</div>
          <ul className="log-list">{log.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>
        </div>
        <div className="panel">
          <div className="panel-title">Agent Log Feed</div>
          <ul className="log-list server-log">
            {serverLogs.map((entry) => (
              <li key={entry.id}>[{entry.level}] {entry.message}</li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
