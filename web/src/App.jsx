import { useEffect, useMemo, useReducer, useRef, useCallback, useState } from "react";

const GRID_W = 14;
const GRID_H = 10;
const TICK_MS = 150;
const GAME_TIME = 60;
const COMBO_WINDOW = 2000;

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

function xpForLevel(level) { return 50 + level * 30; }

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

const initState = (hero) => ({
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
  difficulty: 1
});

function reducer(state, action) {
  switch (action.type) {
    case "TICK": {
      if (!state.running || state.gameOver) return state;
      const keys = action.keys;
      const step = state.activePowerups.speed ? state.hero.speed + 1 : state.hero.speed;
      let nx = state.player.x, ny = state.player.y;
      if (keys.ArrowUp || keys.w) ny -= step;
      if (keys.ArrowDown || keys.s) ny += step;
      if (keys.ArrowLeft || keys.a) nx -= step;
      if (keys.ArrowRight || keys.d) nx += step;
      const player = { x: clamp(nx, 0, GRID_W - 1), y: clamp(ny, 0, GRID_H - 1) };

      const enemySpeed = 1 + Math.floor(state.difficulty / 3);
      const enemies = state.enemies.map((e) => {
        const chase = Math.random() < 0.3 + state.difficulty * 0.05;
        if (chase) {
          const dx = Math.sign(player.x - e.x);
          const dy = Math.sign(player.y - e.y);
          return {
            x: clamp(e.x + dx, 0, GRID_W - 1),
            y: clamp(e.y + dy, 0, GRID_H - 1)
          };
        }
        return {
          x: clamp(e.x + Math.floor(Math.random() * 3) - 1, 0, GRID_W - 1),
          y: clamp(e.y + Math.floor(Math.random() * 3) - 1, 0, GRID_H - 1)
        };
      });

      let next = { ...state, player, enemies };

      // Magnet: pull orb closer
      if (state.activePowerups.magnet) {
        const odx = Math.sign(player.x - state.orb.x);
        const ody = Math.sign(player.y - state.orb.y);
        next.orb = { x: state.orb.x + odx, y: state.orb.y + ody };
      }

      // Orb collection
      if (player.x === next.orb.x && player.y === next.orb.y) {
        const now = Date.now();
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
          difficulty: 1 + Math.floor(newTotalOrbs / 5)
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
      }

      // Powerup collection
      if (state.powerup && player.x === state.powerup.x && player.y === state.powerup.y) {
        const pType = state.powerup.type;
        next.powerup = null;
        next.activePowerups = { ...state.activePowerups, [pType.id]: Date.now() + pType.duration };
        if (pType.id === "speed") next.usedSpeed = true;
      }

      // Enemy collision
      const shielded = state.activePowerups.shield && Date.now() < state.activePowerups.shield;
      const hit = enemies.some((e) => e.x === player.x && e.y === player.y);
      if (hit && !shielded) {
        const newHp = state.hp - 1;
        next.hp = newHp;
        next.shaking = true;
        next.combo = 0;
        if (newHp <= 0) {
          next.running = false;
          next.gameOver = true;
          next.hp = 0;
          const winner = state.score >= 50 ? "player" : "enemy";
          if (winner === "player" && state.hp === 1) next.wonWith1Hp = true;
        }
      }

      // Clean expired powerups
      const now2 = Date.now();
      const ap = { ...next.activePowerups };
      for (const k of Object.keys(ap)) {
        if (ap[k] < now2) delete ap[k];
      }
      next.activePowerups = ap;

      // Clean old score floats
      next.scoreFloats = next.scoreFloats.filter((f) => Date.now() - f.id < 800);

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
      return { ...state, timer: newTimer };
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
  const [apiResult, setApiResult] = useState("idle");
  const [modelResult, setModelResult] = useState("idle");
  const [log, setLog] = useState([]);
  const [spectators, setSpectators] = useState(0);
  const [odds, setOdds] = useState({ player: 1.9, enemy: 1.9 });
  const [betPools, setBetPools] = useState({ player: 0, enemy: 0 });
  const [betName, setBetName] = useState("guest_player");
  const [betSide, setBetSide] = useState("player");
  const [betAmount, setBetAmount] = useState(100);
  const [serverLogs, setServerLogs] = useState([]);
  const [highScores, setHighScores] = useState(loadHighScores());

  const { hero, running, gameOver, score, hp, player, orb, enemies, powerup, activePowerups, timer, combo, maxCombo, totalOrbs, xp, level, achievements, scoreFloats, shaking, difficulty } = state;

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
        body: JSON.stringify({ winner: score >= 50 ? "player" : "enemy" })
      }).catch(() => null);
    }
  }, [gameOver]);

  // Keyboard
  useEffect(() => {
    const down = (e) => { keysRef.current = { ...keysRef.current, [e.key]: true }; };
    const up = (e) => { keysRef.current = { ...keysRef.current, [e.key]: false }; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
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
    jsonRequest("/api/match/start", { method: "POST" }).catch(() => null);
    const poll = setInterval(async () => {
      try {
        const [match, logsRes] = await Promise.all([
          jsonRequest("/api/match/state"),
          jsonRequest("/api/agent/logs")
        ]);
        setSpectators(match.match.spectators);
        setOdds(match.match.odds);
        setBetPools(match.match.pools);
        setServerLogs(logsRes.logs);
      } catch { /* polling non-fatal */ }
    }, 2500);
    return () => clearInterval(poll);
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
        }
        if (enemies.some((e) => e.x === x && e.y === y)) {
          entity = "enemy";
          classes += " has-enemy";
        }
        if (player.x === x && player.y === y) {
          entity = "player";
          classes += " has-player";
          if (activePowerups.shield && Date.now() < activePowerups.shield) classes += " shielded";
        }

        map.push({ key: `${x}-${y}`, classes, entity, x, y });
      }
    }
    return map;
  }, [player, orb, enemies, powerup, activePowerups]);

  const hpPercent = (hp / hero.hp) * 100;
  const xpPercent = (xp / xpForLevel(level)) * 100;
  const totalPool = betPools.player + betPools.enemy || 1;

  async function requestTextToSound() {
    setApiResult("requesting");
    try {
      const json = await jsonRequest("/api/varco/text2sound", {
        method: "POST",
        body: JSON.stringify({ prompt: `${hero.name} battle cry at ${score} points`, version: "v1", num_sample: 1 })
      });
      setApiResult(json?.result?.mocked ? "mocked" : "ok");
      setLog((prev) => [`Sound: ${json?.result?.mocked ? "mocked" : "ok"}`, ...prev].slice(0, 8));
    } catch (error) {
      setApiResult("error");
      setLog((prev) => [`Sound error: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  async function requestImageTo3D() {
    setModelResult("requesting");
    try {
      const json = await jsonRequest("/api/varco/image-to-3d", {
        method: "POST",
        body: JSON.stringify({ image_url: `https://placeholder.varco.ai/${hero.id}.png` })
      });
      setModelResult(json?.result?.mocked ? "mocked" : "ok");
      setLog((prev) => [`3D: ${json?.result?.mocked ? "mocked" : "ok"}`, ...prev].slice(0, 8));
    } catch (error) {
      setModelResult("error");
      setLog((prev) => [`3D error: ${error.message}`, ...prev].slice(0, 8));
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
        body: JSON.stringify({ score, winner, hero: hero.name })
      });
      window.open(json.links[channel], "_blank", "noopener,noreferrer");
      setLog((prev) => [`Shared: ${channel}`, ...prev].slice(0, 8));
    } catch (error) {
      setLog((prev) => [`Share failed: ${error.message}`, ...prev].slice(0, 8));
    }
  }

  function handleReset() {
    dispatch({ type: "RESET" });
    setLog([]);
    setApiResult("idle");
    setModelResult("idle");
    jsonRequest("/api/match/start", { method: "POST" }).catch(() => null);
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
        <div className={`arena-3d${shaking ? " shake" : ""}`} role="application" aria-label="game grid">
          {tiles.map((t) => (
            <div key={t.key} className={t.classes}>
              {t.entity && (
                <div
                  className="entity"
                  data-icon={t.entity === "powerup" && powerup ? powerup.type.icon : undefined}
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
          <div className="game-over-overlay">
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

        {/* VARCO API */}
        <div className="panel">
          <div className="panel-title">VARCO API</div>
          <div className="api-btns">
            <button type="button" className="api-btn" onClick={requestTextToSound}>
              Generate Sound
              <div className={`api-status ${apiResult}`}>Sound: {apiResult}</div>
            </button>
            <button type="button" className="api-btn" onClick={requestImageTo3D}>
              Generate 3D Model
              <div className={`api-status ${modelResult}`}>3D: {modelResult}</div>
            </button>
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
