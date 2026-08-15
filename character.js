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
let evolutionRoutineTimer = null;
let evolutionMoveTimer = null;
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

const evolutionActions = [
  { id: "reset", label: "Resetting in the lounge", sprite: 0, left: 20, bottom: 2, scale: 1 },
  { id: "journal", label: "Writing the next plan", sprite: 1, left: 59, bottom: 2, scale: 1 },
  { id: "study", label: "Studying in the library", sprite: 2, left: 79, bottom: 5, scale: .62 },
  { id: "train", label: "Training on the floor", sprite: 3, left: 52, bottom: 3, scale: .82 },
  { id: "charts", label: "Reviewing the charts", sprite: 4, left: 59, bottom: 2, scale: 1 },
  { id: "pullups", label: "Building the body", sprite: 5, left: 87, bottom: 3, scale: .76 },
  { id: "systems", label: "Building systems", sprite: 6, left: 62, bottom: 2, scale: 1 },
  { id: "sentinel", label: "Running the command bay", sprite: 7, left: 60, bottom: 3, scale: .7 },
  { id: "fridge", label: "Refueling at the fridge", sprite: 0, left: 37, bottom: 2, scale: 1 },
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

function evolutionSpriteStyle(action) {
  if (action.id === "reset") return `--avatar-image:url('assets/generated/aegis-character-couch-frames.webp');--avatar-size:300% 100%;--sprite-x:0%;--sprite-y:0%;--avatar-left:${action.left}%;--avatar-bottom:${action.bottom}%;--avatar-scale:${action.scale};`;
  if (action.id === "fridge") return `--avatar-image:url('assets/generated/aegis-character-fridge-frames.webp');--avatar-size:300% 100%;--sprite-x:0%;--sprite-y:0%;--avatar-left:${action.left}%;--avatar-bottom:${action.bottom}%;--avatar-scale:${action.scale};`;
  if (["journal", "charts", "systems"].includes(action.id)) return `--avatar-image:url('assets/generated/aegis-character-desk-frames.webp');--avatar-size:300% 100%;--sprite-x:0%;--sprite-y:0%;--avatar-left:${action.left}%;--avatar-bottom:${action.bottom}%;--avatar-scale:${action.scale};`;
  const column = action.sprite % 4;
  const row = Math.floor(action.sprite / 4);
  const x = ["0%", "33.333%", "66.667%", "100%"][column];
  return `--avatar-image:url('assets/generated/aegis-character-habit-sprite.webp');--avatar-size:400% 200%;--sprite-x:${x};--sprite-y:${row ? "100%" : "0%"};--avatar-left:${action.left}%;--avatar-bottom:${action.bottom}%;--avatar-scale:${action.scale};`;
}

function evolutionWalkStyle(action, flip) {
  return `--walker-left:${action.left}%;--walker-bottom:${action.bottom}%;--walker-flip:${flip};`;
}

function characterEvolution(levels) {
  const averageLevel = Math.round(Object.values(levels).reduce((sum, level) => sum + Number(level || 0), 0) / Math.max(1, Object.keys(levels).length));
  const stageIndex = evolutionStageConfig.reduce((selected, stage, index) => averageLevel >= stage.level ? index : selected, 0);
  const stage = evolutionStageConfig[stageIndex];
  const routine = stage.routine.map((index) => evolutionActions[index]);
  const initial = routine[0];
  const strengths = [
    ["MIND", levels.mind], ["BODY", levels.body], ["TRADING", levels.trading], ["BUSINESS", levels.ccfx], ["DISCIPLINE", levels.discipline],
  ].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<section class="character-evolution panel" data-evolution-stage="${stageIndex}"><div class="character-evolution-heading"><div><p class="eyebrow amber">CHARACTER EVOLUTION / PASSIVE VISUAL</p><h3>Watch the environment catch up to the work.</h3><p>${escape(stage.description)} It is visual only: no buttons, no new workload, and no change to the Character System itself.</p></div><div class="character-evolution-readout"><span>CURRENT CHAPTER</span><strong>${stage.name}</strong><small>Average system level: ${averageLevel}</small></div></div><div class="evolution-room" data-evolution-room data-stage="${stageIndex}" data-routine="${escape(JSON.stringify(routine))}"><div class="evolution-walker" data-evolution-walker aria-hidden="true"></div><div class="evolution-avatar" data-evolution-avatar data-action="${initial.id}" style="${evolutionSpriteStyle(initial)}" aria-hidden="true"></div><div class="evolution-status"><span>ROUTINE IN PROGRESS</span><b data-evolution-activity>${escape(initial.label)}</b></div><div class="evolution-strengths">${strengths.map(([label, level]) => `<span>${label}<b>LV ${level}</b></span>`).join("")}</div></div></section>`;
}

function bindCharacterEvolution() {
  if (evolutionRoutineTimer) window.clearInterval(evolutionRoutineTimer);
  if (evolutionMoveTimer) window.clearTimeout(evolutionMoveTimer);
  const room = document.querySelector("[data-evolution-room]");
  if (!room) return;
  const avatar = room.querySelector("[data-evolution-avatar]");
  const walker = room.querySelector("[data-evolution-walker]");
  const activity = room.querySelector("[data-evolution-activity]");
  let routine = [];
  try { routine = JSON.parse(room.dataset.routine || "[]"); } catch { return; }
  if (!avatar || !walker || !activity || routine.length < 2) return;
  const settle = (action) => {
    if (evolutionMoveTimer) window.clearTimeout(evolutionMoveTimer);
    avatar.style.cssText = evolutionSpriteStyle(action);
    avatar.dataset.action = action.id;
    avatar.hidden = false;
    walker.dataset.moving = "false";
    activity.textContent = action.label;
    room.dataset.activity = action.id;
  };
  let position = 0;
  settle(routine[position]);
  evolutionRoutineTimer = window.setInterval(() => {
    const current = routine[position];
    position = (position + 1) % routine.length;
    const next = routine[position];
    const flip = next.left < current.left ? 1 : -1;
    avatar.hidden = true;
    walker.dataset.moving = "true";
    walker.style.cssText = evolutionWalkStyle(current, flip);
    room.dataset.activity = "walking";
    activity.textContent = `Walking to ${next.id === "fridge" ? "the fridge" : next.label.replace(/^\w+ /, "")}`;
    requestAnimationFrame(() => { walker.style.cssText = evolutionWalkStyle(next, flip); });
    evolutionMoveTimer = window.setTimeout(() => settle(next), 2400);
  }, 8200);
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
  characterView.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>${xpCampaign ? `Campaign tracking began ${new Date(xpCampaign.started_at).toLocaleDateString()}. Only evidence logged after that date counts.` : "XP calibration is paused. Log normally; nothing is gained or lost until you authorize the start."}</p><div class="character-intro-actions"><button class="ghost compact" type="button" id="export-system-data">Export system data</button><small>Private JSON backup of records available to this account.</small></div></div>${launch}${characterFocus(metrics, recovery)}${directorReviewPanel()}<section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><div class="protocol-line"><p>&ldquo;The ledger records evidence, not ambition. Give it something worth recording.&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;And give the work your full attention, sir. The results will follow in their time.&rdquo;</p><span>- ALFRED</span></div></section>${characterEvolution(levels)}`;
  characterView.dataset.characterReady = "true";
  characterView.setAttribute("aria-busy", "false");
  bindCharacterFocusHover();
  bindCharacterEvolution();
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
