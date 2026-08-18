import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { characterMetrics, levelFromXp } from "./activity-metrics.js?v=capability-benchmarks-v1";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = new Date().toLocaleDateString("en-CA");
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
let xpCampaign = null;
let xpCampaignError = null;
let directorReviews = [];
let characterLifeAnimator = null;
const quarterKey = () => `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;

function missionProgress(mission) {
  return mission?.completion_type === "units" && Number(mission.target_count) > 0 ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission?.completed ? 100 : 0;
}

function xpLedger(entries, cadence) {
  const rows = entries.length ? entries.map((entry) => `<li><span><b>${escape(entry.label)}</b>${escape(entry.detail)}</span><strong class="${entry.change < 0 ? "negative" : ""}">${entry.change >= 0 ? "+" : ""}${entry.change} XP</strong></li>`).join("") : `<li class="ledger-empty">No ${cadence} XP evidence yet.</li>`;
  return `<details class="xp-ledger"><summary>View XP ledger</summary><ul>${rows}</ul></details>`;
}

function xpLedgerOrPaused(entries, cadence) {
  return xpCampaign ? xpLedger(entries, cadence) : `<div class="xp-ledger xp-paused"><span>Tracking begins when you authorize the campaign start.</span></div>`;
}

function radarValue(xp) {
  const meter = levelFromXp(xp);
  return Math.max(0, Math.min(1, (meter.level + meter.progress / 100) / 5));
}

function characterRadarData(metrics, recoveryProgress) {
  const values = [
    radarValue(metrics.discipline.xp),
    radarValue(metrics.trading.xp),
    radarValue(metrics.mastery.body.xp),
    radarValue(metrics.ccfx.xp),
    radarValue(metrics.mastery.mind.xp),
    Math.max(0, Math.min(1, recoveryProgress / 100)),
  ];
  const axes = [
    { x: 50, y: 7, label: "DISCIPLINE", anchor: "middle", labelX: 50, labelY: 2 },
    { x: 87, y: 28, label: "TRADING", anchor: "start", labelX: 91, labelY: 25 },
    { x: 87, y: 72, label: "BODY", anchor: "start", labelX: 91, labelY: 77 },
    { x: 50, y: 93, label: "CCFX", anchor: "middle", labelX: 50, labelY: 99 },
    { x: 13, y: 72, label: "MIND", anchor: "end", labelX: 9, labelY: 77 },
    { x: 13, y: 28, label: "RECOVERY", anchor: "end", labelX: 9, labelY: 25 },
  ];
  return values.map((value, index) => {
    const axis = axes[index];
    return { ...axis, value, pointX: 50 + (axis.x - 50) * value, pointY: 50 + (axis.y - 50) * value };
  });
}

function radarPoints(data) {
  return data.map((axis) => `${axis.pointX},${axis.pointY}`).join(" ");
}

function focusStat(label, metric, cadence, accent = "blue", axis = label.toLowerCase()) {
  const meter = levelFromXp(metric.xp);
  return `<div class="character-focus-stat ${accent}" data-focus-axis="${axis}" aria-label="${label}"><span class="character-focus-label">${label}</span><b>LV ${meter.level}</b><small>${Math.round(meter.current)} / ${meter.required} XP to next level</small><i><em style="width:${Math.max(0, Math.min(100, meter.progress))}%"></em></i>${xpLedgerOrPaused(metric.ledger, cadence)}</div>`;
}

function recoveryFocusStat(recovery) {
  const progress = recovery ? missionProgress(recovery) : 0;
  return `<div class="character-focus-stat green" data-focus-axis="recovery" aria-label="RECOVERY"><span class="character-focus-label">RECOVERY</span><b>${progress}%</b><small>${recovery ? escape(recovery.title) : "No Recovery mission open"}</small><i><em style="width:${progress}%"></em></i></div>`;
}

function characterFocus(metrics, recovery) {
  const level = levelFromXp(metrics.totalXp);
  const recoveryProgress = recovery ? missionProgress(recovery) : 0;
  const radarData = characterRadarData(metrics, recoveryProgress);
  const points = radarPoints(radarData);
  const axisMarkup = radarData.map((axis) => {
    const x = Number(axis.pointX).toFixed(2);
    const y = Number(axis.pointY).toFixed(2);
    return `<g class="character-radar-level" data-focus-axis="${axis.label.toLowerCase()}" tabindex="0" role="button" aria-label="${axis.label} level"><path class="character-radar-node" d="M${x} ${Number(y) - 1.7}L${Number(x) + 1.7} ${y}L${x} ${Number(y) + 1.7}L${Number(x) - 1.7} ${y}Z"></path><circle class="character-radar-hit" cx="${x}" cy="${y}" r="7"></circle><text class="character-radar-label" x="${axis.labelX}" y="${axis.labelY}" text-anchor="${axis.anchor}">${axis.label}</text></g>`;
  }).join("");
  return `<section class="character-focus panel"><div class="character-focus-heading"><p class="eyebrow blue-text">CHARACTER SYSTEMS / LIVE PROFILE</p><h3>The whole system at a glance.</h3><p>Hover or focus an axis to isolate that level. Each marker reflects evidence earned in its system.</p></div><div class="character-focus-layout"><div class="character-hexagon-wrap"><div class="character-hexagon"><svg viewBox="0 0 100 100" role="img" aria-label="Character level radar"><defs><radialGradient id="character-radar-level-fill" cx="50%" cy="50%" r="72%"><stop offset="0%" stop-color="#b9575b" stop-opacity=".84"></stop><stop offset="55%" stop-color="#a6aa72" stop-opacity=".7"></stop><stop offset="100%" stop-color="#55c794" stop-opacity=".66"></stop></radialGradient></defs><polygon class="character-radar-grid" points="50,7 87,28 87,72 50,93 13,72 13,28"></polygon><polygon class="character-radar-grid inner" points="50,22 74,36 74,64 50,78 26,64 26,36"></polygon><path class="character-radar-axis" d="M16 50H84M50 7V93M16 28L84 72M84 28L16 72"></path><path class="character-radar-brackets" d="M43 9h-5M38 9v5M57 9h5M62 9v5M88 40v-5h-5M88 60v5h-5M57 91h5v-5M43 91h-5v-5M12 60v5h5M12 40v-5h5"></path><polygon class="character-radar-data" points="${points}"></polygon>${axisMarkup}<circle class="character-radar-core-ring" cx="50" cy="50" r="5.5"></circle><circle class="character-radar-core" cx="50" cy="50" r="1.8"></circle></svg></div><div class="character-hexagon-readout"><span>CHARACTER LEVEL</span><strong>LV ${level.level}</strong><small>${Math.round(level.current)} / ${level.required} XP</small></div></div><div class="character-focus-stats">${focusStat("DISCIPLINE", metrics.discipline, "daily", "amber", "discipline")}${focusStat("TRADING", metrics.trading, "monthly", "blue", "trading")}${focusStat("BODY", metrics.mastery.body, "Body", "green", "body")}${focusStat("CCFX", metrics.ccfx, "CCFX", "amber", "ccfx")}${focusStat("MIND", metrics.mastery.mind, "Mind", "blue", "mind")}${recoveryFocusStat(recovery)}</div></div></section>`;
}

/* Retired Character Evolution experiment. Kept out of the runtime until a future rebuild. */
const evolutionActions = [
  { id: "couch", label: "Resetting in the lounge", target: "the couch", left: 19, bottom: 14 },
  { id: "fridge", label: "Refueling at the fridge", target: "the fridge", left: 39, bottom: 11 },
  { id: "desk", label: "Working at the desk", target: "the desk", left: 63, bottom: 11 },
  { id: "library", label: "Studying in the library", target: "the library", left: 80, bottom: 11 },
  { id: "training", label: "Training on the floor", target: "the training mat", left: 52, bottom: 5 },
  { id: "pullups", label: "Building the body", target: "the pull-up bar", left: 89, bottom: 7 },
];

const evolutionStageConfig = [
  { level: 0, name: "SURVIVAL", description: "A fixed room. The first job is simply to get moving.", routine: [0, 8, 0, 1] },
  { level: 3, name: "FOUNDATION", description: "The room clears. Planning begins to replace drift.", routine: [0, 8, 1, 2] },
  { level: 6, name: "MOMENTUM", description: "Books, training, and deliberate routines start to occupy the room.", routine: [1, 2, 3, 4] },
  { level: 10, name: "OPERATOR", description: "The workspace becomes a tool for focus, fitness, and clean execution.", routine: [2, 3, 4, 4, 5] },
  { level: 15, name: "BUILDER", description: "A serious body, library, and trading desk share the same mission space.", routine: [3, 4, 5, 6] },
  { level: 21, name: "ARCHITECT", description: "The room becomes a command studio: training, study, systems, then repeat.", routine: [4, 5, 6, 6] },
  { level: 28, name: "COMMANDER", description: "The command bay is deliberate in every detail—and so are its routines.", routine: [5, 6, 6, 7] },
  { level: 36, name: "SENTINEL", description: "The final environment is earned through years of consistent evidence.", routine: [6, 7, 7, 5] },
];

function evolutionBand(level) {
  if (level >= 21) return 5;
  if (level >= 15) return 4;
  if (level >= 10) return 3;
  if (level >= 6) return 2;
  if (level >= 3) return 1;
  return 0;
}

function evolutionRoutine(levels) {
  const routine = [evolutionActions[0], evolutionActions[1]];
  if (levels.mind >= 3) routine.push(evolutionActions[3]);
  if (levels.trading >= 3 || levels.ccfx >= 3) routine.push(evolutionActions[2]);
  if (levels.body >= 3) routine.push(evolutionActions[4]);
  if (levels.body >= 10) routine.push(evolutionActions[5]);
  return routine.length > 2 ? routine : [...routine, evolutionActions[0]];
}

function evolutionActorStyle(action) {
  return `--actor-left:${action.left}%;--actor-bottom:${action.bottom}%;`;
}

function characterEvolution(levels) {
  const averageLevel = Math.round(Object.values(levels).reduce((sum, level) => sum + Number(level || 0), 0) / Math.max(1, Object.keys(levels).length));
  const stageIndex = evolutionStageConfig.reduce((selected, stage, index) => averageLevel >= stage.level ? index : selected, 0);
  const stage = evolutionStageConfig[stageIndex];
  const routine = evolutionRoutine(levels);
  const initial = routine[0];
  const strengths = [
    ["MIND", levels.mind], ["BODY", levels.body], ["TRADING", levels.trading], ["BUSINESS", levels.ccfx], ["DISCIPLINE", levels.discipline],
  ].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bands = Object.fromEntries(Object.entries(levels).map(([key, level]) => [key, evolutionBand(level)]));
  return `<section class="character-evolution panel" data-evolution-stage="${stageIndex}"><div class="character-evolution-heading"><div><p class="eyebrow amber">CHARACTER EVOLUTION / PASSIVE VISUAL</p><h3>Watch the room evolve with the work.</h3><p>${escape(stage.description)} A living idle-game scene driven by your actual levels; visual only, with no extra workload.</p></div><div class="character-evolution-readout"><span>CURRENT CHAPTER</span><strong>${stage.name}</strong><small>Average system level: ${averageLevel}</small></div></div><div class="evolution-room idle-room" data-evolution-room data-stage="${stageIndex}" data-discipline="${bands.discipline}" data-trading="${bands.trading}" data-business="${bands.ccfx}" data-mind="${bands.mind}" data-body="${bands.body}" data-routine="${escape(JSON.stringify(routine))}"><div class="idle-sky" aria-hidden="true"><i></i><i></i><i></i></div><div class="idle-window" aria-hidden="true"><i></i></div><div class="idle-room-label" aria-hidden="true">MAT'S BASE // LV ${averageLevel}</div><div class="idle-couch idle-prop" aria-hidden="true"><i></i><b></b></div><div class="idle-fridge idle-prop" aria-hidden="true"><i></i><b></b></div><div class="idle-desk idle-prop" aria-hidden="true"><i></i><b></b><em></em></div><div class="idle-library idle-prop" aria-hidden="true"><i></i><b></b></div><div class="idle-gym idle-prop" aria-hidden="true"><i></i></div><div class="life-actor idle-avatar" data-life-actor data-pose="${initial.id}" data-action="idle" style="${evolutionActorStyle(initial)}" aria-hidden="true"><i class="life-shadow"></i><i class="life-leg life-leg-left"></i><i class="life-leg life-leg-right"></i><i class="life-torso"></i><i class="life-arm life-arm-left"></i><i class="life-arm life-arm-right"></i><i class="life-head"><b class="life-hair"></b><b class="life-beard"></b></i></div><div class="evolution-status"><span>ROUTINE IN PROGRESS</span><b data-evolution-activity>${escape(initial.label)}</b></div><div class="evolution-strengths">${strengths.map(([label, level]) => `<span>${label}<b>LV ${level}</b></span>`).join("")}</div></div></section>`;
}

function bindCharacterEvolution() {
  if (evolutionRoutineTimer) window.clearInterval(evolutionRoutineTimer);
  if (evolutionMoveTimer) window.clearTimeout(evolutionMoveTimer);
  const room = document.querySelector("[data-evolution-room]");
  if (!room) return;
  const actor = room.querySelector("[data-life-actor]");
  const activity = room.querySelector("[data-evolution-activity]");
  let routine = [];
  try { routine = JSON.parse(room.dataset.routine || "[]"); } catch { return; }
  if (!actor || !activity || routine.length < 2) return;
  actor.querySelectorAll(".life-arm").forEach((arm) => { arm.innerHTML = `<b class="life-forearm"><b class="life-hand"></b></b>`; });
  actor.querySelectorAll(".life-leg").forEach((leg) => { leg.innerHTML = `<b class="life-shin"><b class="life-boot"></b></b>`; });
  const settle = (action) => {
    if (evolutionMoveTimer) window.clearTimeout(evolutionMoveTimer);
    actor.style.cssText = evolutionActorStyle(action);
    actor.dataset.action = "idle";
    actor.dataset.pose = action.id;
    activity.textContent = action.label;
    room.dataset.activity = action.id;
  };
  let position = 0;
  settle(routine[position]);
  evolutionRoutineTimer = window.setInterval(() => {
    const current = routine[position];
    position = (position + 1) % routine.length;
    const next = routine[position];
    actor.dataset.action = "walking";
    actor.dataset.pose = "walking";
    room.dataset.activity = "walking";
    activity.textContent = `Walking to ${next.target}`;
    requestAnimationFrame(() => { actor.style.cssText = evolutionActorStyle(next); });
    evolutionMoveTimer = window.setTimeout(() => settle(next), 2400);
  }, 7200);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Full-scene art is intentionally grouped into a small number of earned
// chapters. A scene is never assembled from furniture/character overlays:
// every chapter will have complete room and action frames. The current
// starter bundle is chapter zero; later bundles are added only at meaningful
// thresholds, rather than for every possible combination of levels.
const roomChapters = [
  { min: 0, id: "survival", title: "SURVIVAL", summary: "Starter room / build the baseline." },
  { min: 4, id: "foundation", title: "FOUNDATION", summary: "Order and consistency begin to show." },
  { min: 9, id: "momentum", title: "MOMENTUM", summary: "The room becomes a deliberate workspace." },
  { min: 16, id: "operator", title: "OPERATOR", summary: "Training, study, and execution share one base." },
  { min: 25, id: "architect", title: "ARCHITECT", summary: "A serious command studio, earned over years." },
  { min: 36, id: "sentinel", title: "SENTINEL", summary: "The final Batcave-era command environment." },
];

const starterRoomBundle = {
  background: "assets/generated/aegis-character-room-starter-v1.png",
  actions: {
    couch: "assets/generated/aegis-character-room-starter-couch-action-v1.png",
    fridge: "assets/generated/aegis-character-room-starter-fridge-action-v1.png",
    desk: "assets/generated/aegis-character-room-starter-desk-action-v1.png",
  },
  loops: {
    couch: "assets/generated/aegis-character-room-starter-couch-scroll-v3.png",
    fridge: "assets/generated/aegis-character-room-starter-fridge-lower-v1.png",
    desk: "assets/generated/aegis-character-room-starter-desk-typing-v1.png",
  },
  walks: {
    "couch:fridge": [
      "assets/generated/aegis-character-room-starter-walk-couch-fridge-start-v1.png",
      "assets/generated/aegis-character-room-starter-walk-couch-fridge-v1.png",
      "assets/generated/aegis-character-room-starter-walk-couch-fridge-end-v1.png",
    ],
    "fridge:desk": [
      "assets/generated/aegis-character-room-starter-walk-fridge-desk-start-v1.png",
      "assets/generated/aegis-character-room-starter-walk-fridge-desk-v1.png",
      "assets/generated/aegis-character-room-starter-walk-fridge-desk-end-v1.png",
    ],
    "desk:couch": [
      "assets/generated/aegis-character-room-starter-walk-desk-couch-start-v1.png",
      "assets/generated/aegis-character-room-starter-walk-desk-couch-v1.png",
      "assets/generated/aegis-character-room-starter-walk-desk-couch-end-v1.png",
    ],
  },
};

// New chapter bundles are added here as the checkpoint art is authored. A
// missing chapter deliberately falls back to the starter room, never to a
// mismatched character or furniture layer.
const roomBundles = { survival: starterRoomBundle };

function roomVisualState(levels) {
  const systems = ["discipline", "mind", "body", "trading", "ccfx"];
  const total = systems.reduce((sum, key) => sum + Number(levels[key] || 0), 0);
  const average = total / systems.length;
  const earnedChapter = roomChapters.reduce((selected, candidate) => average >= candidate.min ? candidate : selected, roomChapters[0]);
  const chapter = roomBundles[earnedChapter.id] ? earnedChapter : roomChapters[0];
  return {
    chapter,
    earnedChapter,
    total,
    average,
    disciplineTier: Math.floor(Number(levels.discipline || 0) / 3),
    mindTier: Math.floor(Number(levels.mind || 0) / 3),
    bodyTier: Math.floor(Number(levels.body || 0) / 3),
    techTier: Math.floor((Number(levels.trading || 0) + Number(levels.ccfx || 0)) / 4),
  };
}

function characterLifePanel(levels) {
  const averageLevel = Math.round(Object.values(levels).reduce((sum, level) => sum + Number(level || 0), 0) / Math.max(1, Object.keys(levels).length));
  const visual = roomVisualState(levels);
  return `<section class="character-life panel" data-character-life data-room-chapter="${visual.chapter.id}"><div class="character-life-heading"><div><p class="eyebrow amber">LIVING QUARTERS / PASSIVE VISUAL</p><h3>Watch the work change the room.</h3><p>One fixed apartment, upgraded at earned milestones. The couch, fridge, desk, and future training bay keep their positions while the surrounding room evolves.</p></div><div class="character-life-readout"><span>ROOM CHAPTER</span><strong>${visual.chapter.title}</strong><small>LV ${averageLevel} · ${visual.chapter.summary}</small><small data-life-activity>Resetting in the lounge</small></div></div><div class="character-life-stage"><canvas data-character-life-canvas aria-label="Animated character routine: couch, fridge, and trading desk"></canvas><div class="character-life-key" aria-hidden="true"><span>DISCIPLINE <b>ROOM</b></span><span>MIND <b>LIBRARY</b></span><span>BODY <b>PHYSIQUE / TRAINING BAY</b></span><span>TRADING + CCFX <b>TECH</b></span></div></div></section>`;
}

class CharacterLifeScene {
  constructor(canvas, levels) {
    this.canvas = canvas;
    this.outputCtx = canvas.getContext("2d");
    this.buffer = document.createElement("canvas");
    this.buffer.width = 480;
    this.buffer.height = 270;
    this.ctx = this.buffer.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.levels = levels;
    this.visual = roomVisualState(levels);
    this.roomBundle = roomBundles[this.visual.chapter.id] || starterRoomBundle;
    this.activityLabel = canvas.closest("[data-character-life]")?.querySelector("[data-life-activity]");
    this.actions = [
      { id: "couch", label: "Resetting in the lounge", target: "the couch", x: .22, dwell: 14000 },
      { id: "fridge", label: "Refueling at the fridge", target: "the fridge", x: .505, dwell: 10000 },
      { id: "desk", label: "Reviewing charts at the desk", target: "the trading desk", x: .77, dwell: 18000 },
    ];
    this.index = 0;
    this.previousIndex = 0;
    this.mode = "acting";
    this.startedAt = performance.now();
    this.position = this.actions[0].x;
    this.from = this.position;
    this.to = this.position;
    // These are deliberately rendered as actual detailed pixel-art sprites,
    // not as another layer of geometric canvas parts.  The green studio
    // backing is keyed out once when each local asset loads, then the cropped
    // character sits inside the furniture the room renderer already owns.
    this.sprites = {};
    this.spriteSources = {
      walking: "assets/generated/aegis-character-manbun-pixel-standing-source.png",
      couch: "assets/generated/aegis-character-manbun-pixel-couch-front-source.png",
      fridge: "assets/generated/aegis-character-manbun-pixel-fridge-source.png",
      desk: "assets/generated/aegis-character-manbun-pixel-desk-source.png",
    };
    Object.entries(this.spriteSources).forEach(([key, source]) => this.loadSprite(key, source));
    this.roomBackground = new Image();
    this.roomBackground.decoding = "async";
    this.roomBackground.src = `${this.roomBundle.background}?v=room-starter-v2`;
    this.roomActionFrames = {};
    {
      const actionSources = this.roomBundle.actions;
      Object.entries(actionSources).forEach(([action, source]) => {
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "high";
        image.src = `${source}?v=room-starter-action-v2`;
        this.roomActionFrames[action] = image;
      });
    }
    this.roomActionLoopFrames = {};
    {
      const loopSources = this.roomBundle.loops;
      Object.entries(loopSources).forEach(([action, source]) => {
        const image = new Image();
        image.decoding = "async";
        image.src = `${source}?v=room-starter-action-loop-v2`;
        this.roomActionLoopFrames[action] = image;
      });
    }
    this.roomWalkFrames = {};
    {
      const walkSources = this.roomBundle.walks;
      Object.entries(walkSources).forEach(([route, sources]) => {
        this.roomWalkFrames[route] = sources.map((source) => {
          const image = new Image();
          image.decoding = "async";
          image.src = `${source}?v=room-starter-walk-v2`;
          return image;
        });
      });
    }
    this.roomFrame = null;
    this.usingActionFrame = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }

  destroy() { cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); }

  loadSprite(key, source) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      // Keeping the keyed copy modest avoids retaining four giant source
      // canvases while preserving all visible pixel detail in the scene.
      const maxHeight = 768;
      const scale = Math.min(1, maxHeight / image.naturalHeight);
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      sourceCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      sourceCtx.imageSmoothingEnabled = false;
      sourceCtx.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
      const pixels = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      const { data } = pixels;
      let left = sourceCanvas.width; let top = sourceCanvas.height; let right = -1; let bottom = -1;
      for (let offset = 0; offset < data.length; offset += 4) {
        const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
        // ImageGen's flat chroma-green studio backdrop.  Preserve the blue
        // bottle and every dark/skin tone pixel on the character.
        // Also remove the anti-aliased green fringe created where the source
        // sprite meets the studio backdrop.  The character has no green
        // material, so this intentionally favors a clean silhouette.
        if (green > 82 && green > red * 1.12 && green > blue * 1.12) data[offset + 3] = 0;
        if (!data[offset + 3]) continue;
        const pixel = offset / 4; const x = pixel % sourceCanvas.width; const y = Math.floor(pixel / sourceCanvas.width);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left || bottom < top) return;
      const padding = 3;
      left = Math.max(0, left - padding); right = Math.min(sourceCanvas.width - 1, right + padding);
      top = Math.max(0, top - padding); bottom = Math.min(sourceCanvas.height - 1, bottom + padding);
      const sprite = document.createElement("canvas");
      sprite.width = right - left + 1; sprite.height = bottom - top + 1;
      sprite.getContext("2d").putImageData(pixels, -left, -top);
      this.sprites[key] = sprite;
    };
    image.src = `${source}?v=manbun-pixel-v1`;
  }

  resize() {
    const width = Math.max(320, this.canvas.clientWidth || 960);
    const height = Math.round(clamp(width * .5625, 300, 560));
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.canvas.style.height = `${height}px`;
    this.outputCtx.setTransform(scale, 0, 0, scale, 0, 0);
    this.outputCtx.imageSmoothingEnabled = false;
    this.displayWidth = width;
    this.displayHeight = height;
    this.width = this.buffer.width;
    this.height = this.buffer.height;
  }

  rounded(x, y, width, height, radius, fill, stroke = null) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  line(points, color, width = 2) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  update(timestamp) {
    const action = this.actions[this.index];
    const elapsed = timestamp - this.startedAt;
    if (this.mode === "acting" && elapsed >= action.dwell) {
      this.mode = "transition";
      this.previousIndex = this.index;
      this.index = (this.index + 1) % this.actions.length;
      this.startedAt = timestamp;
      this.activityLabel.textContent = `Walking to ${this.actions[this.index].target}`;
      return;
    }
    if (this.mode !== "transition") return;
    const progress = clamp(elapsed / 3000, 0, 1);
    if (progress < 1) return;
    this.mode = "acting";
    this.startedAt = timestamp;
    this.activityLabel.textContent = this.actions[this.index].label;
  }

  drawRoom(time) {
    const { ctx, width: w, height: h } = this;
    const action = this.actions[this.index]?.id;
    const actionImage = this.roomActionFrames[action];
    const previousAction = this.actions[this.previousIndex]?.id;
    const previousImage = this.mode === "transition" ? this.roomActionFrames[previousAction] : null;
    const walkImages = this.mode === "transition" ? this.roomWalkFrames[`${previousAction}:${action}`] : null;
    const drawImageFrame = (image, alpha = 1, filter = "none") => {
      // Render a single painted room rather than layering unrelated canvas
      // furniture.  Cover preserves the full width of the walk route while
      // trimming only a little ceiling/floor from the cinematic 16:9 source.
      const imageAspect = image.naturalWidth / image.naturalHeight;
      const stageAspect = w / h;
      let sourceX = 0; let sourceY = 0; let sourceWidth = image.naturalWidth; let sourceHeight = image.naturalHeight;
      if (imageAspect > stageAspect) {
        sourceWidth = image.naturalHeight * stageAspect;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
      } else {
        sourceHeight = image.naturalWidth / stageAspect;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
      }
      this.roomFrame = { image, sourceX, sourceY, sourceWidth, sourceHeight };
      ctx.save(); ctx.globalAlpha = alpha; ctx.filter = filter;
      ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, w, h);
      ctx.restore();
    };
    // Starter means worn and inexpensive, not unreadably dark. Keep enough
    // blue/amber separation to see the room, Mat, and the single monitor.
    const brightFilter = "brightness(1.62) saturate(1.08) contrast(1.025)";
    const drawActionLoop = () => {
      const loopImage = this.roomActionLoopFrames[action];
      drawImageFrame(actionImage, 1, brightFilter);
      if (!loopImage?.complete || !loopImage.naturalWidth) return;
      // A gentle 3.6s base -> action -> base loop: phone scroll/head bob,
      // water down/sip, or finger movement/monitor pulse, without repainting
      // the whole room at a different exposure.
      const alpha = (Math.sin((time - this.startedAt) * (Math.PI * 2 / 2200) - Math.PI / 2) + 1) / 2;
      const loopAreas = {
        couch: { x: .08, y: .30, width: .29, height: .58, filter: brightFilter },
        fridge: { x: .32, y: .18, width: .28, height: .68, filter: brightFilter },
        desk: { x: .63, y: .28, width: .31, height: .64, filter: brightFilter },
      }[action];
      if (!loopAreas) return;
      // The crop includes surrounding furniture so occlusion remains painted
      // together, but its bounds prevent generated exposure changes from
      // flashing across windows, walls, and floor.
      ctx.save();
      ctx.beginPath();
      ctx.rect(loopAreas.x * w, loopAreas.y * h, loopAreas.width * w, loopAreas.height * h);
      ctx.clip();
      drawImageFrame(loopImage, alpha, loopAreas.filter);
      ctx.restore();
    };
    if (actionImage?.complete && actionImage.naturalWidth) {
      this.usingActionFrame = true;
      if (previousImage?.complete && previousImage.naturalWidth && Array.isArray(walkImages) && walkImages.every((image) => image.complete && image.naturalWidth)) {
        const progress = clamp((time - this.startedAt) / 3000, 0, 1);
        // A walk frame is a complete painted scene, not a character layer.
        // The room, furniture, contact shadows, Mat, and window weather are
        // authored together in every frame so nothing slides independently.
        if (progress < .16) {
          drawImageFrame(previousImage, 1, brightFilter);
          drawImageFrame(walkImages[0], progress / .16, brightFilter);
        } else if (progress < .84) {
          const stridePosition = ((progress - .16) / .68) * (walkImages.length - 1);
          const strideIndex = Math.min(walkImages.length - 2, Math.floor(stridePosition));
          const strideBlend = stridePosition - strideIndex;
          drawImageFrame(walkImages[strideIndex], 1, brightFilter);
          drawImageFrame(walkImages[strideIndex + 1], strideBlend, brightFilter);
        } else {
          const settle = (progress - .84) / .16;
          drawImageFrame(walkImages[walkImages.length - 1], 1, brightFilter);
          drawImageFrame(actionImage, settle, brightFilter);
        }
      } else if (previousImage?.complete && previousImage.naturalWidth) {
        const progress = clamp((time - this.startedAt) / 720, 0, 1);
        drawImageFrame(previousImage, 1, brightFilter);
        drawImageFrame(actionImage, progress, brightFilter);
      } else {
        drawActionLoop();
      }
      // A slight lower-third shade keeps the live character readable without
      // making the painted room look like it has been overlaid by an effect.
      const floorShade = ctx.createLinearGradient(0, h * .56, 0, h);
      floorShade.addColorStop(0, "rgba(2, 5, 11, 0)");
      floorShade.addColorStop(1, "rgba(2, 5, 11, .035)");
      ctx.fillStyle = floorShade; ctx.fillRect(0, 0, w, h);
      return;
    }
    this.roomFrame = null;
    this.usingActionFrame = false;
    // Do not fall back to the empty room or a standalone character: wait a
    // beat for the complete couch frame so every visible scene is one layer.
    ctx.fillStyle = "#080d14"; ctx.fillRect(0, 0, w, h);
    return;
    /* istanbul ignore next */
    const discipline = Number(this.levels.discipline || 0);
    const mind = Number(this.levels.mind || 0);
    const tech = Number(this.levels.trading || 0) + Number(this.levels.ccfx || 0);
    const body = Number(this.levels.body || 0);
    const wall = ctx.createLinearGradient(0, 0, 0, h * .74);
    wall.addColorStop(0, discipline >= 5 ? "#121b32" : "#21182b");
    wall.addColorStop(1, discipline >= 3 ? "#0b1020" : "#151323");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h * .76);
    const floor = ctx.createLinearGradient(0, h * .66, 0, h);
    floor.addColorStop(0, "#151a30"); floor.addColorStop(1, "#080914");
    ctx.fillStyle = floor; ctx.fillRect(0, h * .66, w, h * .34);
    for (let index = 0; index < 9; index += 1) this.line([0, h * (.69 + index * .04), w, h * (.69 + index * .04)], "rgba(111, 156, 190, .1)", 1);
    for (let index = -3; index < 7; index += 1) this.line([w * .5, h * .66, w * (index / 5), h], "rgba(111, 156, 190, .08)", 1);

    this.rounded(w * .055, h * .09, w * .19, h * .34, 5, "#080e18", "rgba(112, 189, 247, .34)");
    ctx.fillStyle = "rgba(48, 135, 200, .13)"; ctx.fillRect(w * .062, h * .103, w * .176, h * .312);
    for (let index = 0; index < 18; index += 1) {
      const x = w * (.067 + ((index * 23) % 160) / 1000);
      const y = h * (.15 + ((index * 37) % 190) / 1000);
      ctx.fillStyle = index % 3 ? "rgba(113, 193, 255, .58)" : "rgba(235, 174, 88, .55)";
      ctx.fillRect(x, y, 2 + (index % 3), 2 + (index % 2));
    }
    this.line([w * .15, h * .09, w * .15, h * .43], "rgba(160, 205, 235, .25)", 2);
    this.line([w * .055, h * .26, w * .245, h * .26], "rgba(160, 205, 235, .25)", 2);
    for (let streak = 0; streak < 12; streak += 1) {
      const rx = w * (.07 + ((streak * 17) % 155) / 1000);
      const ry = h * (.12 + ((streak * 29 + time / 80) % 170) / 1000);
      this.line([rx, ry, rx - 1.5, ry + 5], "rgba(168, 203, 255, .45)", 1);
    }

    if (discipline < 3) {
      this.line([w * .3, h * .11, w * .33, h * .22, w * .31, h * .32, w * .35, h * .43], "rgba(42, 30, 31, .88)", 3);
      this.line([w * .34, h * .22, w * .38, h * .18], "rgba(42, 30, 31, .72)", 2);
    } else {
      for (let index = 0; index < 5; index += 1) this.line([w * (.28 + index * .115), h * .08, w * (.28 + index * .115), h * .64], "rgba(91, 139, 170, .11)", 1);
    }

    this.rounded(w * .09, h * .54, w * .25, h * .12, 10, "#2a3037", "rgba(190, 205, 216, .16)");
    this.rounded(w * .105, h * .47, w * .22, h * .14, 10, "#333a41", "rgba(214, 224, 230, .14)");
    this.rounded(w * .07, h * .56, w * .05, h * .14, 8, "#262d34");
    this.rounded(w * .315, h * .56, w * .05, h * .14, 8, "#262d34");
    this.line([w * .105, h * .61, w * .325, h * .61], "rgba(5, 9, 13, .56)", 2);

    const fridgeX = w * .46; const fridgeY = h * .21;
    const atFridge = this.mode === "acting" && this.actions[this.index].id === "fridge";
    const door = atFridge ? 9 + Math.sin(time / 250) * 1.2 : 1;
    this.rounded(fridgeX, fridgeY, w * .115, h * .43, 6, tech >= 7 ? "#202d36" : "#30343a", "rgba(173, 207, 227, .28)");
    this.rounded(fridgeX + w * .008, fridgeY + h * .018, w * .098, h * .245, 4, "#1d242b");
    this.rounded(fridgeX + w * .008, fridgeY + h * .278, w * .098, h * .142, 4, "#1b2128");
    this.line([fridgeX + w * .09, fridgeY + h * .06, fridgeX + w * .09 + door, fridgeY + h * .22], "#a7c4d5", 3);
    if (atFridge) { ctx.fillStyle = "rgba(134, 211, 255, .18)"; ctx.fillRect(fridgeX + w * .02, fridgeY + h * .03, w * .075, h * .20); }

    const shelfX = w * .355;
    this.rounded(shelfX, h * .23, w * .075, h * .39, 3, "#1d2228", "rgba(179, 147, 95, .23)");
    for (let row = 0; row < 4; row += 1) this.line([shelfX, h * (.3 + row * .08), shelfX + w * .075, h * (.3 + row * .08)], "rgba(180, 202, 217, .17)", 2);
    for (let book = 0; book < clamp(Math.round(mind * 2), 0, 8); book += 1) {
      const row = Math.floor(book / 2); const column = book % 2;
      ctx.fillStyle = book % 2 ? "#b87945" : "#527b9b";
      ctx.fillRect(shelfX + w * (.012 + column * .027), h * (.25 + row * .08), w * .018, h * .047);
    }

    const deskX = w * .665; const deskY = h * .49;
    this.rounded(deskX, deskY, w * .24, h * .047, 4, "#2a2420", "rgba(230, 173, 93, .24)");
    this.line([deskX + w * .03, deskY + h * .04, deskX + w * .02, h * .71], "#251e1b", 6);
    this.line([deskX + w * .205, deskY + h * .04, deskX + w * .215, h * .71], "#251e1b", 6);
    // A proper chair keeps the seated desk pose inside the same room rather
    // than looking like a character laid over the furniture.
    this.rounded(deskX + w * .1, h * .43, w * .072, h * .16, 7, "#18243a", "rgba(86, 144, 224, .35)");
    this.rounded(deskX + w * .118, h * .56, w * .07, h * .045, 5, "#162037");
    this.line([deskX + w * .145, h * .60, deskX + w * .145, h * .68], "#101827", 3);
    this.line([deskX + w * .115, h * .685, deskX + w * .175, h * .685], "#101827", 2);
    for (let monitor = 0; monitor < (tech >= 4 ? 2 : 1); monitor += 1) {
      const mx = deskX + w * (.035 + monitor * .09);
      this.rounded(mx, h * .31, w * .078, h * .14, 3, "#09121e", "rgba(98, 193, 255, .55)");
      this.line([mx + w * .008, h * .41, mx + w * .07, h * .35, mx + w * .074, h * .38], "#4cb8ff", 1.6);
      this.line([mx + w * .039, h * .45, mx + w * .039, h * .49], "#516c80", 2);
    }
    if (body >= 3) {
      this.line([w * .91, h * .62, w * .97, h * .62], "#88aabf", 5);
      this.line([w * .92, h * .59, w * .93, h * .67], "#88aabf", 3);
      this.line([w * .96, h * .59, w * .95, h * .67], "#88aabf", 3);
      ctx.fillStyle = "#4e6578"; ctx.beginPath(); ctx.arc(w * .92, h * .62, 8, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(w * .96, h * .62, 8, 0, Math.PI * 2); ctx.fill();
    }
    this.rounded(w * .17, h * .73, w * .68, h * .15, h * .03, "rgba(14, 31, 47, .72)", "rgba(94, 181, 236, .18)");
  }

  limb(x1, y1, x2, y2, width, color) {
    this.line([x1, y1, x2, y2], color, width);
    this.ctx.fillStyle = "#0e151c";
    this.ctx.beginPath(); this.ctx.arc(x2, y2, Math.max(2, width * .16), 0, Math.PI * 2); this.ctx.fill();
  }

  drawSprite(pose, x, ground, height, time, flip = false) {
    const sprite = this.sprites[pose] || this.sprites.walking;
    if (!sprite) return false;
    const width = height * (sprite.width / sprite.height);
    const moving = this.mode === "walking";
    const bob = moving ? Math.abs(Math.sin(time / 105)) * -2 : Math.sin(time / 650) * .45;
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, ground + bob);
    if (flip) ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, .34)";
    ctx.beginPath(); ctx.ellipse(0, 2, width * .38, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(sprite, -width / 2, -height, width, height);
    ctx.restore();
    return true;
  }

  drawRoomForeground(action) {
    if (!this.roomFrame || this.mode === "transition" || this.usingActionFrame) return;
    const { ctx, width: w, height: h } = this;
    // Each rectangle is a real foreground piece re-painted from the same room
    // image after the character.  That gives the couch/table/chair depth
    // without a second mismatched illustration or a CSS overlay.
    const layers = {
      couch: [
        { x: .275, y: .59, width: .075, height: .22 }, // sofa arm
        { x: .35, y: .64, width: .205, height: .285 }, // coffee table
      ],
      desk: [
        { x: .695, y: .62, width: .095, height: .10 }, // chair arm + seat front
        { x: .755, y: .70, width: .085, height: .22 }, // chair base
        { x: .815, y: .56, width: .185, height: .31 }, // desk front edge
      ],
      fridge: [
        { x: .48, y: .57, width: .075, height: .18 }, // lower fridge edge
      ],
    }[action] || [];
    const frame = this.roomFrame;
    layers.forEach((layer) => {
      const dx = layer.x * w; const dy = layer.y * h; const dw = layer.width * w; const dh = layer.height * h;
      const sx = frame.sourceX + layer.x * frame.sourceWidth;
      const sy = frame.sourceY + layer.y * frame.sourceHeight;
      const sw = layer.width * frame.sourceWidth; const sh = layer.height * frame.sourceHeight;
      ctx.drawImage(frame.image, sx, sy, sw, sh, dx, dy, dw, dh);
    });
  }

  drawAvatar(time) {
    const { ctx, width: w, height: h } = this;
    const action = this.mode === "walking" ? "walking" : this.actions[this.index].id;
    // Couch/fridge/desk moments are complete painted frames.  Drawing a
    // cutout on top would undo their built-in furniture occlusion.
    if (this.mode === "acting" || this.mode === "transition") return;
    const x = this.position * w;
    const spriteSpec = {
      // The painted room's real floor is near the lower edge.  The prior
      // vector scene used a much higher imaginary ground line, which made
      // feet float through the couch and chair after the room upgrade.
      walking: { ground: h * .94, height: h * .69 },
      couch: { ground: h * .94, height: h * .57 },
      fridge: { ground: h * .94, height: h * .70 },
      desk: { ground: h * .94, height: h * .58 },
    }[action];
    // The desk is on the right, so this seated sprite is mirrored to face the
    // monitors.  The couch pose is replaced by a front-facing sprite below.
    if (spriteSpec && this.drawSprite(action, x, spriteSpec.ground, spriteSpec.height, time, action === "desk")) return;

    // Brief load fallback only: the detailed sprites above replace this as
    // soon as their local files are decoded.
    const bodyLevel = Number(this.levels.body || 0);
    const scale = clamp(w / 1100, .66, 1.05);
    const step = Math.sin(time / 120) * (action === "walking" ? 1 : .08);
    const broad = 19 + clamp(bodyLevel, 0, 18) * .62;
    const waist = Math.max(17, 25 - clamp(bodyLevel, 0, 16) * .45);
    const skin = "#b77d59"; const clothing = bodyLevel >= 7 ? "#233b56" : "#2c333f";
    const idleMotion = Math.sin(time / 460) * 2;
    ctx.save(); ctx.translate(x, h * .78); ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0, 0, 0, .34)"; ctx.beginPath(); ctx.ellipse(0, 6, 31, 7, 0, 0, Math.PI * 2); ctx.fill();
    const head = (hx, hy) => {
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 13, 0, Math.PI * 2); ctx.fill();
      // Man bun, beard, and a readable face hold together at the deliberately
      // small pixel resolution instead of reducing him to a featureless dot.
      ctx.fillStyle = "#1b1517"; ctx.beginPath(); ctx.arc(hx - 2, hy - 11, 11, Math.PI, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(hx + 9, hy - 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2b1d20"; ctx.beginPath(); ctx.arc(hx + 1, hy + 8, 10, 0, Math.PI); ctx.fill();
      this.line([hx - 6, hy - 3, hx - 2, hy - 4], "#3a2523", 1); this.line([hx + 2, hy - 4, hx + 6, hy - 3], "#3a2523", 1);
      ctx.fillStyle = "#101318"; ctx.fillRect(hx - 4, hy - 1, 2, 1); ctx.fillRect(hx + 3, hy - 1, 2, 1);
      this.line([hx, hy, hx - 1, hy + 3, hx + 1, hy + 4], "#774938", 1);
      this.line([hx - 2, hy + 6, hx + 3, hy + 6], "#9e5f50", 1);
      this.rounded(hx - 5, hy + 11, 10, 7, 2, skin);
    };
    const torso = (tx, ty, angle = 0) => { ctx.save(); ctx.translate(tx, ty); ctx.rotate(angle); this.rounded(-broad, -36, broad * 2, 47, 12, clothing, "#080c10"); ctx.fillStyle = "rgba(157, 196, 221, .22)"; ctx.fillRect(-waist, -8, waist * 2, 2); this.line([-6, -34, 0, -27, 6, -34], "rgba(194, 219, 235, .5)", 1); this.line([0, -27, 0, 3], "rgba(7, 10, 15, .45)", 1); ctx.fillStyle = "rgba(10, 15, 21, .38)"; ctx.fillRect(-broad + 5, -18, 5, 10); ctx.fillRect(broad - 10, -18, 5, 10); ctx.restore(); };
    const leg = (x1, y1, kneeX, kneeY, footX, footY) => { this.limb(x1, y1, kneeX, kneeY, 16, "#1b2833"); this.limb(kneeX, kneeY, footX, footY, 13, "#18222b"); this.line([kneeX - 3, kneeY, kneeX + 3, kneeY], "#4b6172", 1); this.rounded(footX - 8, footY - 3, 17, 7, 3, "#0c1014"); };
    const arm = (x1, y1, elbowX, elbowY, handX, handY) => { this.limb(x1, y1, elbowX, elbowY, 13, clothing); this.limb(elbowX, elbowY, handX, handY, 9, skin); this.line([elbowX - 2, elbowY, elbowX + 2, elbowY], "rgba(190, 214, 230, .3)", 1); };
    if (action === "couch") {
      torso(-2, -55 + idleMotion, -.1); head(-7, -105 + idleMotion); leg(-12, -48, 13, -42, 24, 0); leg(9, -48, 29, -37, 40, 0); arm(-broad + 3, -77 + idleMotion, -38, -60 + idleMotion, -30, -45 + idleMotion); arm(broad - 3, -77 + idleMotion, 21, -52 - idleMotion, 32, -42 - idleMotion);
    } else if (action === "desk") {
      torso(-3, -56 + idleMotion * .35, .04); head(-3, -106 + idleMotion * .35); leg(-12, -49, 10, -40, 21, 0); leg(9, -49, 26, -38, 36, 0); arm(-broad + 4, -79, 9, -71 + idleMotion, 29, -59 + idleMotion); arm(broad - 4, -79, 24, -70 - idleMotion, 39, -59 - idleMotion);
    } else {
      const sway = action === "walking" ? step * 12 : 0;
      torso(0, -58, action === "walking" ? step * .04 : 0); head(0, -108 + (action === "walking" ? Math.abs(step) * 2 : 0)); leg(-9, -51, -13 + sway, -20, -19 + sway * 1.2, 0); leg(9, -51, 13 - sway, -20, 19 - sway * 1.2, 0);
      if (action === "fridge") { arm(-broad + 2, -80, 17, -84 + idleMotion, 34, -76 + idleMotion); arm(broad - 2, -80, 31, -67 - idleMotion, 40, -55 - idleMotion); this.rounded(37, -64 + idleMotion, 8, 17, 3, "#68c6ee"); }
      else { arm(-broad + 2, -80, -30 - sway, -52, -27 - sway, -31); arm(broad - 2, -80, 30 + sway, -52, 28 + sway, -31); }
    }
    ctx.restore();
  }

  draw(time) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawRoom(time);
    this.drawAvatar(time);
    this.drawRoomForeground(this.mode === "walking" ? "walking" : this.actions[this.index].id);
    this.outputCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    this.outputCtx.drawImage(this.buffer, 0, 0, this.width, this.height, 0, 0, this.displayWidth, this.displayHeight);
  }
  loop(timestamp) { if (!document.hidden) { this.update(timestamp); this.draw(timestamp); } this.frame = requestAnimationFrame(this.loop); }
}

function bindCharacterLifeScene(levels) {
  characterLifeAnimator?.destroy();
  const canvas = document.querySelector("[data-character-life-canvas]");
  if (!canvas || !window.HTMLCanvasElement) return;
  characterLifeAnimator = new CharacterLifeScene(canvas, levels);
}

function bindCharacterFocusHover() {
  const items = Array.from(document.querySelectorAll("#character [data-focus-axis]"));
  const setHighlight = (axis, active) => items.filter((item) => item.dataset.focusAxis === axis).forEach((item) => item.classList.toggle("is-highlighted", active));
  items.forEach((item) => {
    item.addEventListener("mouseenter", () => setHighlight(item.dataset.focusAxis, true));
    item.addEventListener("mouseleave", () => setHighlight(item.dataset.focusAxis, false));
    item.addEventListener("focus", () => setHighlight(item.dataset.focusAxis, true));
    item.addEventListener("blur", () => setHighlight(item.dataset.focusAxis, false));
  });
}

function directorReviewPanel() {
  const review = directorReviews.find((item) => item.quarter_key === quarterKey()) || {};
  return `<section class="panel director-review-panel"><div><p class="eyebrow amber">QUARTERLY DIRECTOR REVIEW</p><h3>${quarterKey()} · Measure the whole system.</h3><p>Review the person behind the data: wins, bottlenecks, standards, and the next quarter’s focus.</p></div><button class="primary compact" type="button" id="open-director-review">${review.id ? "Update Director Review" : "Open Director Review"}</button>${review.id ? `<div class="director-review-preview"><span><b>Wins</b>${escape(review.wins || "Not recorded")}</span><span><b>Next focus</b>${escape(review.next_focus || "Not recorded")}</span></div>` : ""}</section>`;
}

async function exportSystemData(button) {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before exporting your data.");
  const tables = [
    "operations", "operation_occurrences", "missions", "mission_progress_events", "trade_debriefs", "trade_reviews", "trade_review_corrections", "ai_trade_scenarios",
    "mastery_entries", "mastery_challenges", "training_sessions", "training_sets", "health_weight_logs", "health_food_logs", "recovery_logs",
    "deep_work_logs", "capability_skills", "capability_skill_logs", "business_projects", "content_items", "financial_foundations", "activity_events",
    "account_balances", "account_deposits", "account_groups", "account_group_memberships", "account_group_trade_links", "account_group_withdrawals", "account_group_withdrawal_allocations",
    "xp_campaigns", "director_reviews", "ai_recommendation_feedback", "ai_calibration_reviews"
  ];
  button.disabled = true;
  button.textContent = "Preparing export…";
  const results = await Promise.all(tables.map(async (table) => {
    const { data, error } = await supabase.from(table).select("*");
    return [table, error ? { error: error.message, rows: [] } : { rows: data || [] }];
  }));
  const payload = { format: "aegis-command-export", version: 1, exported_at: new Date().toISOString(), user_id: sessionData.session.user.id, tables: Object.fromEntries(results) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aegis-command-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  button.disabled = false;
  button.textContent = "Export system data";
}

function render({ operations, occurrences, trades, missions, projects, contentItems, masteryEntries, masteryChallenges, trainingSessions, capabilityLogs, capabilityBenchmarkRewards, financialFoundation }) {
  const metrics = characterMetrics({ operations, occurrences, trades, projects, contentItems, masteryEntries, masteryChallenges, trainingSessions, capabilityLogs, capabilityBenchmarkRewards, financialFoundation }, xpCampaign?.started_at);
  const { discipline, trading, ccfx, mastery } = metrics;
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const levels = { discipline: levelFromXp(discipline.xp).level, trading: levelFromXp(trading.xp).level, ccfx: levelFromXp(ccfx.xp).level, mind: levelFromXp(mastery.mind.xp).level, body: levelFromXp(mastery.body.xp).level };
  localStorage.setItem("aegis-character-levels", JSON.stringify(levels));
  window.dispatchEvent(new CustomEvent("aegis:character-levels-changed", { detail: levels }));
  const launch = !xpCampaign ? `<section class="panel xp-launch-panel"><p class="eyebrow amber">CAMPAIGN CALIBRATION</p><h3>XP is paused.</h3><p class="body-copy">Nothing logged before activation will count. When you are ready, start the five-year campaign and the ledger will begin from that moment forward.</p>${xpCampaignError ? `<p class="body-copy">${escape(xpCampaignError)}</p>` : `<button class="primary compact" type="button" id="start-xp-campaign">Start campaign tracking</button>`}</section>` : "";
  const characterView = $("#character");
  characterView.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>${xpCampaign ? `Campaign tracking began ${new Date(xpCampaign.started_at).toLocaleDateString()}. Only evidence logged after that date counts.` : "XP calibration is paused. Log normally; nothing is gained or lost until you authorize the start."}</p><div class="character-intro-actions"><button class="ghost compact" type="button" id="export-system-data">Export system data</button><small>Private JSON backup of records available to this account.</small></div></div>${launch}${characterFocus(metrics, recovery)}${directorReviewPanel()}<section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><div class="protocol-line"><p>&ldquo;The ledger records evidence, not ambition. Give it something worth recording.&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;And give the work your full attention, sir. The results will follow in their time.&rdquo;</p><span>- ALFRED</span></div></section>${characterLifePanel(levels)}`;
  characterView.dataset.characterReady = "true";
  characterView.setAttribute("aria-busy", "false");
  bindCharacterFocusHover();
  bindCharacterLifeScene(levels);
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, occurrenceResult, tradesResult, missionsResult, projectsResult, contentResult, masteryResult, trainingResult, campaignResult, reviewResult, challengeResult, capabilityLogsResult, capabilityBenchmarkRewardsResult, financialFoundationResult] = await Promise.all([
    supabase.from("operations").select("id, title, scheduled_date, operation_date, completed_on, completed, status, schedule_mode, scheduled_time, mission_id"),
    supabase.from("operation_occurrences").select("id, operation_id, occurrence_date, completed_on, completed, status, scheduled_time"),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_projects").select("*"),
    supabase.from("content_items").select("*"),
    supabase.from("mastery_entries").select("*").order("created_at", { ascending: false }),
    supabase.from("training_sessions").select("*").order("logged_on", { ascending: false }),
    supabase.from("xp_campaigns").select("started_at").maybeSingle(),
    supabase.from("director_reviews").select("*").order("updated_at", { ascending: false }).limit(4),
    supabase.from("mastery_challenges").select("*").order("completed_at", { ascending: false }).limit(100),
    supabase.from("capability_skill_logs").select("*, capability_skills(skill_type, title)").order("practiced_on", { ascending: false }),
    supabase.from("capability_benchmark_completion_ledger").select("*, capability_benchmarks(level, xp_reward, capability_skills(skill_type, title))").order("created_at", { ascending: false }),
    supabase.from("financial_foundations").select("*").maybeSingle()
  ]);
  xpCampaign = campaignResult.data || null;
  directorReviews = reviewResult.data || [];
  xpCampaignError = campaignResult.error ? "XP campaign setup is awaiting its one-time database migration." : null;
  render({ operations: operationsResult.data || [], occurrences: occurrenceResult.data || [], trades: tradesResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [], contentItems: contentResult.data || [], masteryEntries: masteryResult.data || [], trainingSessions: trainingResult.data || [], masteryChallenges: challengeResult.data || [], capabilityLogs: capabilityLogsResult.data || [], capabilityBenchmarkRewards: capabilityBenchmarkRewardsResult.data || [], financialFoundation: financialFoundationResult.data || null });
}

document.addEventListener("click", async (event) => {
  if (event.target.id === "open-director-review") {
    const review = directorReviews.find((item) => item.quarter_key === quarterKey()) || {};
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form class="dialog-card mastery-form"><button class="dialog-close" type="button">×</button><p class="eyebrow amber">QUARTERLY DIRECTOR REVIEW</p><h2>${quarterKey()} review.</h2><p>Measure the whole system—not just the outcome.</p><label>Wins<textarea name="wins">${escape(review.wins || "")}</textarea></label><label>Bottlenecks<textarea name="bottlenecks">${escape(review.bottlenecks || "")}</textarea></label><label>Standards<textarea name="standards">${escape(review.standards || "")}</textarea></label><label>Next focus<textarea name="next_focus">${escape(review.next_focus || "")}</textarea></label><button class="primary" type="submit">Save Director Review</button></form>`;
    document.body.append(dialog); dialog.querySelector(".dialog-close").onclick = () => dialog.close();
    dialog.querySelector("form").onsubmit = async (submit) => { submit.preventDefault(); const data = new FormData(submit.currentTarget); const { data: sessionData } = await supabase.auth.getSession(); const { error } = await supabase.from("director_reviews").upsert({ user_id: sessionData.session.user.id, quarter_key: quarterKey(), wins: String(data.get("wins")).trim() || null, bottlenecks: String(data.get("bottlenecks")).trim() || null, standards: String(data.get("standards")).trim() || null, next_focus: String(data.get("next_focus")).trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id,quarter_key" }); if (error) return alert(error.message); dialog.close(); dialog.remove(); load(); window.dispatchEvent(new Event("aegis:mastery-changed")); };
    dialog.showModal(); return;
  }
  if (event.target.id === "export-system-data") return exportSystemData(event.target);
  if (event.target.id !== "start-xp-campaign" || !supabase || xpCampaign) return;
  if (!confirm("Start XP tracking now? Earlier records will never count, and this start control will disappear.")) return;
  event.target.disabled = true;
  event.target.textContent = "Starting campaign…";
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before starting the campaign.");
  const { error } = await supabase.from("xp_campaigns").insert({ user_id: sessionData.session.user.id }).select("started_at").single();
  if (error) return alert(`Campaign could not start: ${error.message}`);
  await load();
}, true);

if (supabase) {
  load();
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 80); });
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 120));
  window.addEventListener("aegis:data-changed", (event) => { if (["mastery", "operation-status"].includes(event.detail?.source)) return; setTimeout(load, 120); });
}
