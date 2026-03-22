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
    startPlayerCell: null
  };
}

function triggerSwingEvent(state, timer) {
  const now = Date.now();
  const eventIndex = Math.abs(state.totalOrbs + state.level + timer) % 3;

  if (eventIndex === 0) {
    const powerType = POWERUP_TYPES[(state.level + state.totalOrbs) % POWERUP_TYPES.length];
    return {
      ...state,
      swingEventTriggered: true,
      swingEvent: createSwingEvent(
        "rare-drop-ping",
        "Rare Drop Ping",
        "희귀 보상 코어가 떨어졌다. 지금 라인을 바꾸면 큰 보상을 가져갈 수 있다.",
        state.bonusOrb || randomCellAway(state.player, 4),
        now
      ),
      swingEventEndsAt: now + 5000,
      bonusOrb: state.bonusOrb || randomCellAway(state.player, 4),
      powerup: state.powerup || { ...randomCellAway(state.player, 4), type: powerType },
      abilityCharge: clamp(state.abilityCharge + 20, 0, ABILITY_MAX),
      directorBeat: createDirectorBeat("30s Swing", "희귀 보상 드랍. 지금 이동 경로를 바꿔라.", now),
      directorBeatEndsAt: now + 8000
    };
  }

  if (eventIndex === 1) {
    return {
      ...state,
      swingEventTriggered: true,
      swingEvent: createSwingEvent(
        "zone-shift-alert",
        "Zone Shift Alert",
        "안전 루트가 무너졌다. 오브젝트 위치와 적 압박이 동시에 바뀐다.",
        randomCellAway(state.player, 5),
        now
      ),
      swingEventEndsAt: now + 5000,
      orb: randomCellAway(state.player, 5),
      enemies: state.enemies.length < 6 ? [...state.enemies, randomCellAway(state.player, 4)] : state.enemies,
      directorBeat: createDirectorBeat("30s Swing", "루트 붕괴. 즉시 새 경로를 잡아야 한다.", now),
      directorBeatEndsAt: now + 8000
    };
  }

  const bountyTarget = state.enemies[0] || randomCellAway(state.player, 4);

  return {
    ...state,
    swingEventTriggered: true,
    swingEvent: createSwingEvent(
      "bounty-signal",
      "Bounty Signal",
      "근처 목표가 강조됐다. 추격해 보상을 노릴지, 무시하고 생존을 우선할지 선택해야 한다.",
      bountyTarget,
      now
    ),
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

function loadHighScores() {
  try { return JSON.parse(localStorage.getItem("saga_highscores") || "[]").slice(0, 5); }
  catch { return []; }
}
function saveHighScore(entry) {
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem("saga_highscores", JSON.stringify(scores.slice(0, 5)));
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
  if (!res.ok) throw new Error(json.message || "request failed");
  return json;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, heroes[0], initState);
  const keysRef = useRef({});
  const [log, setLog] = useState([]);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [spectators, setSpectators] = useState(0);
  const [odds, setOdds] = useState({ player: 1.9, enemy: 1.9 });
  const [betPools, setBetPools] = useState({ player: 0, enemy: 0 });
  const [betName, setBetName] = useState("guest_player");
  const [editorTab, setEditorTab] = useState("sound");
  const [betSide, setBetSide] = useState("player");
  const [betAmount, setBetAmount] = useState(100);
  const [serverLogs, setServerLogs] = useState([]);
  const [highScores, setHighScores] = useState(loadHighScores());
  const [studioBrief, setStudioBrief] = useState("Neon sponsor arena for creator-made hero collectibles");
  const [studioPack, setStudioPack] = useState(null);
  const [studioStatus, setStudioStatus] = useState("idle");
  const [studioCache, setStudioCache] = useState(null);
  const [selectedMarketingAngle, setSelectedMarketingAngle] = useState(null);
  const [editorDrafts, setEditorDrafts] = useState({ sound: {}, asset: {} });
  const latestStateRef = useRef(state);

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

  const activeAbility = HERO_ABILITIES[hero.id];
  const directorPhase = getDirectorPhase(timer);
  const elapsedSeconds = GAME_TIME - timer;

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
    if (gameOver && score > 0) {
      saveHighScore({ hero: hero.name, score, combo: maxCombo, date: new Date().toISOString().slice(0, 10) });
      setHighScores(loadHighScores());
      jsonRequest("/api/match/finish", {
        method: "POST",
        body: JSON.stringify({
          winner: score >= 50 ? "player" : "enemy",
          elapsedSeconds,
          playerId: hero.id
        })
      }).catch(() => null);
    }
  }, [gameOver]);

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
    setEditorTab(kind === "sound" ? "sound" : "asset");
    setLog((prev) => [`Prompt loaded: ${key}`, ...prev].slice(0, 8));
  }

  function loadQueueItem(item) {
    if (item.lane === "social") {
      const angle = studioPack?.marketingAngles?.find((entry) => entry.channel === item.key) || null;
      setSelectedMarketingAngle(angle);
      setLog((prev) => [`Copy loaded: ${item.key}`, ...prev].slice(0, 8));
      return;
    }
    applyStudioSuggestion(item.lane, item.key, item.prompt);
  }

  async function copyMarketingCopy() {
    if (!selectedMarketingAngle?.copy || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(`${selectedMarketingAngle.copy}\nCTA: ${selectedMarketingAngle.cta}`);
      setLog((prev) => [`Copied ${selectedMarketingAngle.label} copy`, ...prev].slice(0, 8));
    } catch {
      setLog((prev) => ["Clipboard copy blocked", ...prev].slice(0, 8));
    }
  }

  async function generateStudioPack() {
    setStudioStatus("loading");
    try {
      const json = await jsonRequest("/api/varco/studio-pack", {
        method: "POST",
        body: JSON.stringify({ brief: studioBrief, heroId: hero.id })
      });
      setStudioPack(json.studioPack);
      setStudioStatus(json.studioPack.cache_hit ? "cached" : "ready");
      setEditorDrafts({
        sound: json.studioPack.sounds,
        asset: json.studioPack.assets
      });
      setSelectedMarketingAngle(json.studioPack.marketingAngles?.[0] || null);
      refreshCacheStats().catch(() => null);
      setLog((prev) => [`Studio pack ${json.studioPack.cache_hit ? "cached" : "ready"}`, ...prev].slice(0, 8));
    } catch (error) {
      setStudioStatus("error");
      setLog((prev) => [`Studio pack failed: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  async function placeBet() {
    try {
      const json = await jsonRequest("/api/match/bet", {
        method: "POST",
        body: JSON.stringify({ userName: betName, side: betSide, amount: Number(betAmount) })
      });
      setBetPools(json.pools);
      setOdds(json.odds);
      setLog((prev) => [`Bet: ${betSide} ${betAmount}`, ...prev].slice(0, 8));
    } catch (error) {
      setLog((prev) => [`Bet failed: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  async function shareResult(channel) {
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
      window.open(json.links[channel], "_blank", "noopener,noreferrer");
      setLog((prev) => [`Shared: ${channel}`, ...prev].slice(0, 8));
    } catch (error) {
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
    dispatch({ type: "RESET" });
    setLog([]);
    jsonRequest("/api/match/start", { method: "POST" })
      .then((json) => {
        setCurrentMatchId(json.matchId);
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
            <input value={betName} onChange={(e) => setBetName(e.target.value)} placeholder="user name" />
            <select value={betSide} onChange={(e) => setBetSide(e.target.value)}>
              <option value="player">Player Win</option>
              <option value="enemy">Enemy Win</option>
            </select>
            <input type="number" min="10" step="10" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} />
          </div>
          <button type="button" className="bet-btn" onClick={placeBet}>Place Bet</button>
        </div>

        <div className="panel promo-director" data-testid="studio-pack-panel">
          <div className="panel-title">Promo Director</div>
          <textarea
            className="studio-brief-input"
            value={studioBrief}
            onChange={(e) => setStudioBrief(e.target.value)}
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
                    onClick={() => setSelectedMarketingAngle(angle)}
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
                  <button type="button" className="share-btn" onClick={copyMarketingCopy}>
                    Copy launch copy
                  </button>
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
                onDraftChange={(key, value) => updateEditorDraft("sound", key, value)}
              />
            )}
            {editorTab === "asset" && (
              <AssetEditor
                editHistory={editHistory}
                dispatch={dispatch}
                studioPack={studioPack}
                draftPrompts={editorDrafts.asset}
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
            <button type="button" className="share-btn" onClick={() => shareResult("x")}>X</button>
            <button type="button" className="share-btn" onClick={() => shareResult("facebook")}>FB</button>
            <button type="button" className="share-btn" onClick={() => shareResult("telegram")}>TG</button>
          </div>
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
          <ul className="leaderboard">
            {highScores.length === 0 && <li style={{ color: "#8b949e", fontSize: "11px" }}>No scores yet</li>}
            {highScores.map((hs, i) => (
              <li key={`${i}-${hs.score}`}>
                <span className="rank">#{i + 1}</span>
                <span>{hs.hero}</span>
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
