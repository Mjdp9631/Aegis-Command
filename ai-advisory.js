import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
let latestContext = null;
let latestAdvisory = null;
let scanStageTimer = null;

function dateKey(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-CA");
}
function easternParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
function operatingDayKey(value = new Date()) {
  const parts = easternParts(value);
  const day = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  if (Number(parts.hour) < 5) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
function daysBetween(newer, older) { return Math.round((new Date(`${newer}T00:00:00`) - new Date(`${older}T00:00:00`)) / 86400000); }
function streakFor(dates) {
  const unique = [...new Set(dates.filter(Boolean))].sort().reverse();
  if (!unique.length) return { current: 0, best: 0, last: null };
  let current = 1, best = 1, run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (daysBetween(unique[index - 1], unique[index]) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  if (![today, yesterday].includes(unique[0])) current = 0;
  else {
    current = 1;
    for (let index = 1; index < unique.length && daysBetween(unique[index - 1], unique[index]) === 1; index += 1) current += 1;
  }
  return { current, best, last: unique[0] };
}

function normalizedOutcome(value) {
  const supplied = String(value || "").trim().toLowerCase();
  if (supplied === "win" || supplied === "small win") return "win";
  if (supplied === "loss" || supplied === "small loss") return "loss";
  if (supplied === "b/e" || supplied === "be" || supplied === "break even" || supplied === "breakeven") return "be";
  return null;
}

// This must match Detective exactly. The AI is not allowed to reinterpret a journal field.
function outcome(trade) {
  if (String(trade.trade_status || "").trim().toLowerCase() === "open") return "open";
  // `market_condition` describes context (range, trend, etc.), never the trade result.
  // Use the journal's outcome first; the remaining fields only support older imported rows.
  const explicit = [trade.outcome, trade.win_loss, trade.result].map(normalizedOutcome).find(Boolean);
  if (explicit) return explicit;
  if (Number(trade.r_multiple) > 0) return "win";
  if (Number(trade.r_multiple) < 0) return "loss";
  return "be";
}

function tradeStreaks(trades) {
  const decisive = [...trades]
    .sort((left, right) => new Date(left.traded_at || left.created_at || 0) - new Date(right.traded_at || right.created_at || 0))
    .map(outcome)
    .filter((item) => item === "win" || item === "loss");
  let current_type = null, current_length = 0, longest_win = 0, longest_loss = 0;
  for (const result of decisive) {
    current_length = result === current_type ? current_length + 1 : 1;
    current_type = result;
    if (result === "win") longest_win = Math.max(longest_win, current_length);
    else longest_loss = Math.max(longest_loss, current_length);
  }
  return { current_type, current_length, longest_win, longest_loss };
}

function missionProgress(mission) {
  if (mission.completion_type === "units" && Number(mission.target_count) > 0) return Math.round(Math.min(100, (Number(mission.completed_count || 0) / Number(mission.target_count)) * 100));
  return mission.completed ? 100 : 0;
}

function buildContext({ operations, missions, trades, recovery, mastery, projects, phase, directives = [], roadmap = [], deepWork = [], challenges = [], directorReviews = [] }, operatingDate = operatingDayKey()) {
  const liveTrades = trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical");
  const closed = liveTrades.filter((trade) => outcome(trade) !== "open");
  const wins = closed.filter((trade) => outcome(trade) === "win").length;
  const losses = closed.filter((trade) => outcome(trade) === "loss").length;
  const violations = liveTrades.filter((trade) => trade.plan_violation).length;
  const currentMonth = new Date().getMonth();
  const monthPnl = closed.filter((trade) => new Date(trade.traded_at || trade.created_at).getMonth() === currentMonth).reduce((sum, trade) => sum + Number(trade.pnl_percent || 0), 0);
  const tradeStreak = tradeStreaks(closed);
  const todayOps = operations.filter((operation) => dateKey(operation.scheduled_date) === operatingDate || dateKey(operation.operation_date) === operatingDate);
  const activeMissions = missions.filter((mission) => missionProgress(mission) < 100);
  const operationStreak = streakFor(operations.filter((operation) => operation.completed || operation.status === "Complete").map((operation) => operation.scheduled_date || operation.updated_at || operation.created_at));
  const tradingStreak = streakFor(liveTrades.map((trade) => trade.traded_at || trade.created_at));
  const masteryStreak = streakFor(mastery.map((entry) => entry.created_at));
  return {
    generated_on: new Date().toISOString(),
    operating_date: operatingDate,
    active_phase: `Phase ${phase?.active_phase ?? 0}`,
    streaks: { execution: operationStreak, trading_journal: tradingStreak, mastery: masteryStreak },
    operations: { today_total: todayOps.length, today_complete: todayOps.filter((operation) => operation.completed || operation.status === "Complete").length, open_total: operations.filter((operation) => !operation.completed && operation.status !== "Complete").length, next: operations.filter((operation) => !operation.completed && operation.status !== "Complete").slice(0, 8).map((operation) => ({ title: operation.title, category: operation.category, status: operation.status || "Queued" })) },
    missions: activeMissions.slice(0, 8).map((mission) => ({ title: mission.title, category: mission.category, priority: mission.priority, progress: missionProgress(mission), definition: mission.completion_definition || null })),
    trading: { closed_trades: closed.length, wins, losses, breakeven: closed.length - wins - losses, win_rate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null, plan_violations: violations, month_pnl_percent: Number(monthPnl.toFixed(2)), streaks: tradeStreak, authoritative_summary: `${closed.length} closed trades: ${wins} wins, ${losses} losses, ${closed.length - wins - losses} break-even; win rate ${wins + losses ? Math.round((wins / (wins + losses)) * 100) : "N/A"}%.`, recent: closed.slice(-12).map((trade) => ({ date: dateKey(trade.traded_at || trade.created_at), pair: trade.pair, outcome: outcome(trade), r: Number(trade.r_multiple || 0), pnl_percent: trade.pnl_percent == null ? null : Number(trade.pnl_percent), violation: Boolean(trade.plan_violation), setup: trade.setup || null })) },
    recovery: recovery.slice(0, 5).map((item) => ({ date: item.logged_on, pain: item.pain, swelling: item.swelling, rehab_completed: item.rehab_completed })),
    mastery: { total_entries: mastery.length, recent: mastery.slice(0, 8).map((entry) => ({ category: entry.category, title: entry.title, date: dateKey(entry.created_at) })), deep_work: { recent_minutes: deepWork.filter((item) => Date.now() - new Date(item.created_at || item.logged_on).getTime() < 7 * 86400000).reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0), recent: deepWork.slice(0, 8).map((item) => ({ area: item.area, focus: item.focus, minutes: item.duration_minutes, output: item.output, date: dateKey(item.created_at || item.logged_on) })) }, transmissions: { active: challenges.filter((item) => item.status === "accepted" && !item.completed_at).slice(0, 5).map((item) => ({ lane: item.lane, category: item.category, title: item.title, type: item.challenge_type, difficulty: item.difficulty })), recent_completed: challenges.filter((item) => item.completed_at).slice(0, 5).map((item) => ({ lane: item.lane, category: item.category, title: item.title, date: dateKey(item.completed_at) })) }, director_review: directorReviews[0] ? { quarter: directorReviews[0].quarter_key, wins: directorReviews[0].wins, bottlenecks: directorReviews[0].bottlenecks, standards: directorReviews[0].standards, next_focus: directorReviews[0].next_focus } : null },
    special_projects: projects.map((project) => ({ title: project.title, status: project.status, priority: project.priority })).slice(0, 8),
    roadmap_state: { pending_or_active: roadmap.filter((item) => ["pending", "accepted"].includes(item.status)).map((item) => ({ title: item.title, phase: item.phase, category: item.category, status: item.status })), recent: roadmap.slice(0, 8).map((item) => ({ title: item.title, status: item.status, created_at: item.created_at })) },
    directive_history: directives.slice(0, 18).map((item) => ({ kind: item.mission_kind, title: item.title, status: item.status, escalation_level: item.escalation_level || 1, cadence_key: item.cadence_key || null, created_at: item.created_at, resolved_at: item.resolved_at }))
  };
}

function setFocusStreak(streak) {
  const value = $("#focus-streak-value");
  const caption = $("#focus-streak-caption");
  const meter = $("#focus-streak-meter");
  if (value) value.innerHTML = `${String(streak.current).padStart(2, "0")}<span>d</span>`;
  if (caption) caption.textContent = streak.current ? `${streak.best} day best execution streak` : "Complete one operation today to restart";
  if (meter) meter.style.width = `${Math.min(100, Math.max(8, streak.current * 10))}%`;
}

function renderMorning(morning) {
  const target = $("#morning-briefing");
  if (!target || !morning) return;
  const grid = target.querySelector(".adviser-grid");
  if (!grid) return;
  const markup = `<article><span class="adviser-name jarvis">JARVIS / TODAY'S PLAN</span><p>${escape(morning.jarvis)}</p></article><article><span class="adviser-name alfred">ALFRED / STANDARD</span><p>${escape(morning.alfred)}</p></article>`;
  if (grid.innerHTML !== markup) grid.innerHTML = markup;
}

function renderSignal(signal) {
  if (!signal) return;
  const briefing = $(".command-briefing");
  if (!briefing) return;
  const jarvis = briefing.querySelector("#briefing-text");
  const alfred = briefing.querySelector(".alfred-signal p");
  if (jarvis) jarvis.textContent = signal.jarvis;
  if (alfred) alfred.textContent = signal.alfred;
  const map = { "#signal-market-tone": signal.market_tone, "#signal-window": signal.opportunity_window, "#signal-focus": signal.focus_area, "#signal-risk": signal.risk_posture };
  Object.entries(map).forEach(([selector, value]) => { const item = $(selector); if (item) item.textContent = value.toUpperCase(); });
}

function paired(advice) { return `<p><b>JARVIS</b>${escape(advice.jarvis)}</p><p><b>ALFRED</b>${escape(advice.alfred)}</p>`; }
function renderEvening(evening) {
  const target = $("#adviser-panel .evening-columns");
  if (!target || !evening) return;
  const markup = `<article><span>KEY TAKEAWAYS</span>${paired(evening.key_takeaways)}</article><article><span>WHAT WORKED</span>${paired(evening.what_worked)}</article><article><span>WHAT TO IMPROVE</span>${paired(evening.what_to_improve)}</article><article><span>TOMORROW'S FOCUS</span>${paired(evening.tomorrow_focus)}</article>`;
  if (target.innerHTML !== markup) target.innerHTML = markup;
}

function proposalMarkup(item) {
  const corrective = item.mission_kind === "corrective";
  const action = corrective ? `<button data-ai-acknowledge="${item.id}">Acknowledge directive</button>` : `<button data-ai-accept="${item.id}">Accept mission</button><button class="decline" data-ai-decline="${item.id}">Decline</button>`;
  return `<article class="ai-suggestion ${item.mission_kind}"><div><span class="eyebrow ${corrective ? "amber" : "blue-text"}">${corrective ? "SYSTEM DIRECTIVE" : "CHALLENGE TRANSMISSION"} / ${escape(item.advisor).toUpperCase()}</span><strong>${escape(item.title)}</strong><p>${escape(item.rationale)}</p><small>${(item.evidence || []).map(escape).join(" · ")}</small></div><div class="ai-actions">${action}</div></article>`;
}

function roadmapMarkup(item) {
  return `<article class="ai-suggestion roadmap"><div><span class="eyebrow blue-text">ROADMAP NAVIGATOR / PHASE ${item.phase}</span><strong>${escape(item.title)}</strong><p>${escape(item.objective)}</p><small>${escape(item.rationale)}${item.evidence?.length ? ` Â· ${item.evidence.map(escape).join(" Â· ")}` : ""}</small></div><div class="ai-actions"><button data-ai-roadmap-accept="${item.id}">Activate mission</button><button class="decline" data-ai-roadmap-decline="${item.id}">Archive</button></div></article>`;
}

async function loadSuggestions() {
  if (!supabase) return;
  // A transmission is a snapshot of the evidence available when it was issued.
  // Never mix pending items from older scans into the current assessment.
  const { data: latest } = await supabase.from("ai_advisories").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let data = [];
  if (latest?.id) {
    const response = await supabase.from("ai_mission_suggestions").select("*").eq("status", "pending").eq("advisory_id", latest.id).order("created_at", { ascending: false }).limit(8);
    if (response.error) throw response.error;
    data = response.data || [];
  }
  const target = $("#ai-suggestion-list");
  if (target) target.innerHTML = data.length ? data.map(proposalMarkup).join("") : '<p class="ai-status">No current scan transmissions. Run an intelligence scan when you want a fresh assessment.</p>';
}

async function loadRoadmap() {
  if (!supabase) return;
  const { data } = await supabase.from("ai_roadmap_missions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(4);
  const target = $("#ai-roadmap-list");
  if (target) target.innerHTML = data?.length ? data.map(roadmapMarkup).join("") : '<p class="ai-status">The campaign has enough active objectives. Navigator remains on watch.</p>';
}

async function loadLatestAdvisory() {
  if (!supabase) return;
  const { data } = await supabase.from("ai_advisories").select("payload").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.payload) return;
  latestAdvisory = data.payload;
  paintLatestAdvisory();
}

function paintLatestAdvisory() {
  if (!latestAdvisory) return;
  renderMorning(latestAdvisory.morning);
  renderSignal(latestAdvisory.signal);
  renderEvening(latestAdvisory.evening);
  window.dispatchEvent(new CustomEvent("aegis:advisory-updated", { detail: latestAdvisory }));
}

async function persist(advisory, type, { readOnly = false, operatingDate = operatingDayKey() } = {}) {
  const payload = { ...advisory, scan_mode: type, operating_date: operatingDate, completed_at: new Date().toISOString() };
  let result = await supabase.from("ai_advisories").insert({ advisory_type: type, payload }).select().single();
  // Older Supabase projects still have the original four-value advisory check.
  // Keep bedtime usable until migration 049 is applied without changing its
  // read-only semantics.
  if (result.error && type === "bedtime") {
    result = await supabase.from("ai_advisories").insert({ advisory_type: "evening", payload }).select().single();
  }
  const { data: stored, error } = result;
  if (error) throw error;
  if (readOnly) return [];
  const directives = advisory.directives || [];
  const roadmap = advisory.roadmap || [];
  if (directives.length) {
    const rows = directives.map((item) => ({ advisory_id: stored.id, advisor: item.advisor, mission_kind: item.mission_kind, title: item.title, category: item.category, priority: item.priority, rationale: item.rationale, evidence: item.evidence, cadence_key: item.cadence_key, escalation_level: item.escalation_level }));
    const { error: proposalError } = await supabase.from("ai_mission_suggestions").insert(rows);
    if (proposalError) throw proposalError;
    const { data: savedSuggestions } = await supabase.from("ai_mission_suggestions").select("*").eq("advisory_id", stored.id).order("created_at");
    if (roadmap.length) await supabase.from("ai_roadmap_missions").insert(roadmap.map((item) => ({ ...item, advisory_id: stored.id })));
    return savedSuggestions || [];
  }
  if (roadmap.length) await supabase.from("ai_roadmap_missions").insert(roadmap.map((item) => ({ ...item, advisory_id: stored.id })));
  return [];
}

async function issueCorrective(suggestion) {
  const { data: existing } = await supabase.from("missions").select("id").eq("title", suggestion.title).eq("completed", false).limit(1);
  if (existing?.length) {
    await supabase.from("ai_mission_suggestions").update({ status: "acknowledged", resolved_at: new Date().toISOString() }).eq("id", suggestion.id);
    return;
  }
  const mission = { title: suggestion.title, category: suggestion.category, priority: "Do now", completion_type: "binary", completion_definition: `System corrective from ${suggestion.advisor}: ${suggestion.rationale}`, completed: false, completed_count: 0, progress: 0 };
  const { error } = await supabase.from("missions").insert(mission);
  if (error) throw error;
  await supabase.from("ai_mission_suggestions").update({ status: "acknowledged", resolved_at: new Date().toISOString() }).eq("id", suggestion.id);
  window.dispatchEvent(new Event("aegis:missions-changed"));
}

let transmissionQueue = [];
function showTransmissionQueue() {
  const next = transmissionQueue.shift();
  if (!next) return;
  const dialog = $("#ai-transmission-dialog");
  if (!dialog) return;
  const challenge = next.mission_kind === "challenge";
  $("#ai-transmission-label").textContent = challenge ? `CHALLENGE TRANSMISSION / ${next.advisor.toUpperCase()}` : `SYSTEM DIRECTIVE / ${next.advisor.toUpperCase()}`;
  $("#ai-transmission-title").textContent = next.title;
  $("#ai-transmission-copy").textContent = next.rationale;
  $("#ai-transmission-evidence").innerHTML = (next.evidence || []).map((line) => `<li>${escape(line)}</li>`).join("");
  $("#ai-transmission-actions").innerHTML = challenge ? `<button class="primary" type="button" data-ai-accept="${next.id}">Accept mission</button><button class="secondary" type="button" data-ai-decline="${next.id}">Decline</button>` : '<button class="primary" type="button" data-ai-close-directive>Acknowledge</button>';
  dialog.showModal();
}

async function gather(operatingDate = operatingDayKey()) {
  const [operations, missions, trades, recovery, mastery, projects, phase, directives, roadmap, deepWork, challenges, directorReviews] = await Promise.all([
    supabase.from("operations").select("*").order("scheduled_date", { ascending: false }).limit(180),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: true }).limit(1000),
    supabase.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(10),
    supabase.from("mastery_entries").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("business_projects").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("phase_protocols").select("*").limit(1).maybeSingle(),
    supabase.from("ai_mission_suggestions").select("*").order("created_at", { ascending: false }).limit(24),
    supabase.from("ai_roadmap_missions").select("*").order("created_at", { ascending: false }).limit(12),
    supabase.from("deep_work_logs").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("mastery_challenges").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("director_reviews").select("*").order("updated_at", { ascending: false }).limit(4)
  ]);
  const values = [operations, missions, trades, recovery, mastery, projects, phase, directives, roadmap, deepWork, challenges, directorReviews];
  if (values.some((result) => result.error)) throw new Error(values.find((result) => result.error)?.error.message || "Could not load command data.");
  return buildContext({ operations: operations.data || [], missions: missions.data || [], trades: trades.data || [], recovery: recovery.data || [], mastery: mastery.data || [], projects: projects.data || [], phase: phase.data, directives: directives.data || [], roadmap: roadmap.data || [], deepWork: deepWork.data || [], challenges: challenges.data || [], directorReviews: directorReviews.data || [] }, operatingDate);
}

function ensureScanOverlay() {
  if ($("#ai-scan-overlay")) return $("#ai-scan-overlay");
  const overlay = document.createElement("div");
  overlay.id = "ai-scan-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<div class="ai-scan-frame"><div class="ai-scan-kicker"><span class="ai-scan-led"></span>AEGIS INTELLIGENCE / LIVE SCAN</div><div class="ai-scan-core"><div class="ai-scan-rings"><i></i><i></i><i></i><b></b></div><div class="ai-scan-grid"></div></div><h2>Analyzing the evidence.</h2><p id="ai-scan-stage">SECURING COMMAND DATA</p><div class="ai-scan-progress"><span></span></div><div class="ai-scan-readout"><span>JARVIS / ANALYTICS ONLINE</span><span>ALFRED / REVIEWING STANDARD</span></div></div>';
  document.body.append(overlay);
  return overlay;
}

function setScanOverlay(active) {
  const overlay = ensureScanOverlay();
  const stage = $("#ai-scan-stage");
  clearInterval(scanStageTimer);
  if (!active) { overlay.classList.remove("is-active"); overlay.setAttribute("aria-hidden", "true"); return; }
  const stages = ["SECURING COMMAND DATA", "MAPPING EXECUTION PATTERNS", "AUDITING TRADING PROCESS", "CALIBRATING NEXT DIRECTIVE", "SYNTHESIZING DUAL ADVISORY"];
  let index = 0;
  stage.textContent = stages[index];
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-active");
  scanStageTimer = setInterval(() => { index = (index + 1) % stages.length; stage.textContent = stages[index]; }, 900);
}

function setBusy(busy, label = "") {
  setScanOverlay(busy);
  document.querySelectorAll("[data-ai-run]").forEach((button) => { button.disabled = busy; if (busy) button.dataset.original = button.textContent; button.textContent = busy ? label || "ANALYZING…" : button.dataset.original || button.textContent; });
}

async function run(mode = "scan") {
  if (!supabase) return alert("AI requires the secure AEGIS connection.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return alert("Sign in before opening the intelligence layer.");
  const bedtime = mode === "bedtime";
  const operatingDate = operatingDayKey();
  try {
    setBusy(true, bedtime ? "COMPILING DEBRIEF…" : "ANALYZING…");
    latestContext = await gather(operatingDate);
    setFocusStreak(latestContext.streaks.execution);
    const response = await fetch("/api/advisory", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ mode, context: latestContext }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The advisory engine is unavailable.");
    latestAdvisory = payload.advisory;
    paintLatestAdvisory();
    const savedSuggestions = await persist(latestAdvisory, bedtime ? "bedtime" : (mode === "morning" || mode === "signal" || mode === "evening" ? mode : "scan"), { readOnly: bedtime, operatingDate });
    if (bedtime) {
      await loadSuggestions();
      return;
    }
    const correctives = savedSuggestions.filter((item) => item.mission_kind === "corrective");
    for (const corrective of correctives) await issueCorrective(corrective);
    transmissionQueue = [...correctives, ...savedSuggestions.filter((item) => item.mission_kind === "challenge")];
    await loadSuggestions();
    await loadRoadmap();
    showTransmissionQueue();
  } catch (error) { alert(`Intelligence scan unavailable: ${error.message}`); }
  finally { setBusy(false); }
}

async function resolveSuggestion(id, action) {
  const { data: suggestion, error } = await supabase.from("ai_mission_suggestions").select("*").eq("id", id).single();
  if (error || !suggestion) return alert("That transmission is no longer available.");
  if (action === "declined") {
    await supabase.from("ai_mission_suggestions").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", id);
  } else {
    const mission = { title: suggestion.title, category: suggestion.category, priority: suggestion.priority, completion_type: "binary", completion_definition: `AI ${suggestion.mission_kind} from ${suggestion.advisor}: ${suggestion.rationale}`, completed: false, completed_count: 0, progress: 0 };
    const { error: missionError } = await supabase.from("missions").insert(mission);
    if (missionError) return alert(`Mission could not be added: ${missionError.message}`);
    await supabase.from("ai_mission_suggestions").update({ status: action === "acknowledged" ? "acknowledged" : "accepted", resolved_at: new Date().toISOString() }).eq("id", id);
    window.dispatchEvent(new Event("aegis:missions-changed"));
  }
  await loadSuggestions();
  $("#ai-transmission-dialog")?.close();
  showTransmissionQueue();
}

async function resolveRoadmap(id, action) {
  const { data: item, error } = await supabase.from("ai_roadmap_missions").select("*").eq("id", id).single();
  if (error || !item) return alert("That roadmap objective is no longer available.");
  if (action === "declined") {
    await supabase.from("ai_roadmap_missions").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", id);
  } else {
    const mission = { title: item.title, category: item.category, priority: item.priority, completion_type: "binary", completion_definition: `Five-year Roadmap Navigator / Phase ${item.phase}: ${item.objective}. Why now: ${item.rationale}`, completed: false, completed_count: 0, progress: 0 };
    const { error: missionError } = await supabase.from("missions").insert(mission);
    if (missionError) return alert(`Mission could not be added: ${missionError.message}`);
    await supabase.from("ai_roadmap_missions").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id);
    window.dispatchEvent(new Event("aegis:missions-changed"));
  }
  await loadRoadmap();
}

function ensureBedtimeAction() {
  const anchor = $("#adviser-panel");
  if (!anchor) return;
  const existing = $("#ai-manual-scan");
  if (existing?.querySelector('[data-ai-run="scan"]')) existing.remove();
  if ($("#ai-manual-scan")) return;
  const panel = document.createElement("section");
  panel.id = "ai-manual-scan";
  panel.className = "panel ai-manual-scan";
  panel.innerHTML = '<div><p class="eyebrow blue-text">NIGHTLY DEBRIEF</p><h3>Close the operating day</h3><p>When you are finished for the night, mark <strong>Going to bed</strong> so the debrief includes activity completed after midnight and leaves the operation queue untouched.</p></div><div class="ai-scan-actions"><button class="primary compact" data-ai-run="bedtime">Going to bed</button></div>';
  anchor.insertAdjacentElement("afterend", panel);
}

function mount() {
  const missionView = $("#missions");
  if (missionView && !$("#ai-roadmap-navigator")) {
    const roadmap = document.createElement("section");
    roadmap.id = "ai-roadmap-navigator";
    roadmap.className = "panel ai-mission-control";
    roadmap.innerHTML = '<div class="panel-head"><div><p class="eyebrow amber">FIVE-YEAR ROADMAP NAVIGATOR</p><h3>Campaign objectives</h3><p class="body-copy">Strategic missions for the Bruce Wayne / Tony Stark campaign: recovery, capability, Detective-grade trading, intellectual range, and enterprise.</p></div></div><div class="ai-suggestion-list" id="ai-roadmap-list"><p class="ai-status">Navigator is preparing the campaign state.</p></div>';
    $("#phase-protocol")?.insertAdjacentElement("afterend", roadmap);
  }
  if (missionView && !$("#ai-mission-control")) {
    const panel = document.createElement("section");
    panel.id = "ai-mission-control";
    panel.className = "panel ai-mission-control";
    panel.innerHTML = '<div class="panel-head"><div><p class="eyebrow blue-text">ADAPTIVE DIRECTIVES</p><h3>Jarvis / Alfred transmissions</h3><p class="body-copy">Not routine. Correctives appear only when the evidence shows a meaningful repeating pattern; challenge transmissions appear when you have earned a higher standard.</p></div></div><div class="ai-suggestion-list" id="ai-suggestion-list"><p class="ai-status">No pending adaptive directives.</p></div>';
    $("#ai-roadmap-navigator")?.insertAdjacentElement("afterend", panel);
  }
  ensureBedtimeAction();
}

document.addEventListener("click", (event) => {
  const runButton = event.target.closest("[data-ai-run]");
  if (runButton) return run(runButton.dataset.aiRun);
  const accept = event.target.closest("[data-ai-accept]");
  if (accept) return resolveSuggestion(accept.dataset.aiAccept, "accepted");
  const acknowledge = event.target.closest("[data-ai-acknowledge]");
  if (acknowledge) return resolveSuggestion(acknowledge.dataset.aiAcknowledge, "acknowledged");
  const decline = event.target.closest("[data-ai-decline]");
  if (decline) return resolveSuggestion(decline.dataset.aiDecline, "declined");
  const roadmapAccept = event.target.closest("[data-ai-roadmap-accept]");
  if (roadmapAccept) return resolveRoadmap(roadmapAccept.dataset.aiRoadmapAccept, "accepted");
  const roadmapDecline = event.target.closest("[data-ai-roadmap-decline]");
  if (roadmapDecline) return resolveRoadmap(roadmapDecline.dataset.aiRoadmapDecline, "declined");
  if (event.target.closest("[data-ai-close-directive]")) { $("#ai-transmission-dialog")?.close(); return showTransmissionQueue(); }
  if (event.target.closest("#ai-transmission-dialog .dialog-close")) { $("#ai-transmission-dialog")?.close(); return showTransmissionQueue(); }
});

if (supabase) {
  supabase.auth.getSession().then(async ({ data: { session } }) => { if (!session) return; mount(); await loadLatestAdvisory(); await loadSuggestions(); await loadRoadmap(); try { latestContext = await gather(); setFocusStreak(latestContext.streaks.execution); } catch {} });
  supabase.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(async () => { mount(); await loadLatestAdvisory(); await loadSuggestions(); await loadRoadmap(); }, 150); });
  window.addEventListener("aegis:navigation", () => { mount(); paintLatestAdvisory(); });
  window.addEventListener("load", () => { mount(); paintLatestAdvisory(); }, { once: true });
}
