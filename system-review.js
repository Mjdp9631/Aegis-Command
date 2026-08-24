import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const dayMs = 24 * 60 * 60 * 1000;
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const normalize = (value = "") => String(value).trim().toLowerCase().replace(/\s+/g, " ");
const dayKey = (value) => value ? String(value).slice(0, 10) : "";

function dateValue(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function inWindow(value, start, end) {
  const timestamp = dateValue(value);
  return timestamp != null && timestamp >= start.getTime() && timestamp <= end.getTime();
}

function progress(mission) {
  if (mission.completion_type === "units" && Number(mission.target_count) > 0) return Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100);
  return mission.completed ? 100 : 0;
}

function closedTrade(trade) {
  return String(trade.account || "").trim().toLowerCase() !== "theoretical" && String(trade.trade_status || "").trim().toLowerCase() !== "open";
}

function tradeOutcome(trade) {
  const supplied = [trade.outcome, trade.win_loss, trade.result].map(normalize);
  if (supplied.some((value) => ["win", "small win"].includes(value))) return "Win";
  if (supplied.some((value) => ["loss", "small loss"].includes(value))) return "Loss";
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function operationRows(operations, occurrences) {
  const parentIds = new Set(operations.map((operation) => String(operation.id)));
  const occurrenceIds = new Set(occurrences.map((occurrence) => String(occurrence.operation_id)));
  const occurrenceRows = occurrences.map((occurrence) => {
    const parent = operations.find((operation) => String(operation.id) === String(occurrence.operation_id)) || {};
    return { ...parent, id: `occurrence:${occurrence.id}`, occurrence_id: occurrence.id, operation_date: occurrence.occurrence_date, scheduled_date: occurrence.occurrence_date, completed_on: occurrence.completed_on, completed: occurrence.completed };
  });
  const parents = operations.filter((operation) => !occurrenceIds.has(String(operation.id)));
  return { rows: [...parents, ...occurrenceRows], parentIds };
}

function qualityReport({ operations, occurrences, missions, trades, masteryEntries, trainingSessions, projects }) {
  const issues = [];
  const add = (severity, title, detail) => issues.push({ severity, title, detail });
  const operationGroups = new Map();
  operations.forEach((operation) => {
    const key = [normalize(operation.title), dayKey(operation.scheduled_date || operation.operation_date), String(operation.scheduled_time || "").slice(0, 5), String(operation.mission_id || "")].join("|");
    if (normalize(operation.title) && dayKey(operation.scheduled_date || operation.operation_date)) operationGroups.set(key, [...(operationGroups.get(key) || []), operation]);
    if (!normalize(operation.title)) add("error", "Operation is missing a title", `Record ${operation.id || "without an id"} cannot be identified reliably.`);
    if (!dayKey(operation.scheduled_date || operation.operation_date) && !["daily", "weekly", "recurring"].includes(normalize(operation.schedule_mode))) add("warning", "One-time operation is missing a date", operation.title || `Record ${operation.id || "without an id"}`);
  });
  operationGroups.forEach((group) => { if (group.length > 1) add("error", "Duplicate operation detected", `${group[0].title} appears ${group.length} times on ${dayKey(group[0].scheduled_date || group[0].operation_date)}.`); });

  const missionGroups = new Map();
  missions.forEach((mission) => {
    const key = `${normalize(mission.title)}|${normalize(mission.category)}`;
    if (normalize(mission.title)) missionGroups.set(key, [...(missionGroups.get(key) || []), mission]);
    if (!normalize(mission.title)) add("error", "Mission is missing a title", `Record ${mission.id || "without an id"} cannot be reviewed.`);
  });
  missionGroups.forEach((group) => {
    const active = group.filter((mission) => progress(mission) < 100);
    if (active.length > 1) add("warning", "Similar active missions may overlap", `${group[0].title} has ${active.length} active copies in ${group[0].category || "an uncategorized lane"}.`);
  });

  const tradeMissing = trades.filter((trade) => !dateValue(trade.traded_at || trade.created_at) || !normalize(trade.pair));
  if (tradeMissing.length) add("warning", "Trade records need required fields", `${tradeMissing.length} trade${tradeMissing.length === 1 ? "" : "s"} missing a timestamp or pair.`);
  const masteryMissing = masteryEntries.filter((entry) => !dateValue(entry.logged_on || entry.created_at) || !normalize(entry.category) || !normalize(entry.title));
  if (masteryMissing.length) add("warning", "Mastery records need required fields", `${masteryMissing.length} entry record${masteryMissing.length === 1 ? "" : "s"} missing a date, category, or title.`);
  const trainingMissing = trainingSessions.filter((session) => !dateValue(session.logged_on || session.created_at));
  if (trainingMissing.length) add("warning", "Training records need a date", `${trainingMissing.length} workout record${trainingMissing.length === 1 ? "" : "s"} cannot be placed on the timeline.`);

  const operationIds = new Set(operations.map((operation) => String(operation.id)));
  const orphanOccurrences = occurrences.filter((occurrence) => !operationIds.has(String(occurrence.operation_id)));
  if (orphanOccurrences.length) add("error", "Orphaned operation occurrence", `${orphanOccurrences.length} occurrence${orphanOccurrences.length === 1 ? "" : "s"} point to an operation that no longer exists.`);

  const staleCutoff = Date.now() - 14 * dayMs;
  const staleMissions = missions.filter((mission) => progress(mission) < 100 && dateValue(mission.updated_at || mission.created_at) < staleCutoff);
  if (staleMissions.length) add("warning", "Active missions are stale", `${staleMissions.length} active mission${staleMissions.length === 1 ? "" : "s"} have not changed in 14 days.`);
  const staleProjects = projects.filter((project) => normalize(project.status) === "active" && dateValue(project.updated_at || project.created_at) < staleCutoff);
  if (staleProjects.length) add("info", "Projects need a status check", `${staleProjects.length} active project${staleProjects.length === 1 ? "" : "s"} have not changed in 14 days.`);

  return issues;
}

function weekWindow() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function crossSystemSignals(data) {
  const cutoff = Date.now() - 30 * dayMs;
  const evidenceDays = new Set();
  const completedOperationDays = new Set();
  const rows = operationRows(data.operations, data.occurrences).rows;
  rows.forEach((operation) => {
    if (operation.completed) completedOperationDays.add(dayKey(operation.completed_on || operation.operation_date || operation.scheduled_date));
  });
  data.masteryEntries.forEach((entry) => { if (dateValue(entry.logged_on || entry.created_at) >= cutoff) evidenceDays.add(dayKey(entry.logged_on || entry.created_at)); });
  data.trainingSessions.forEach((session) => { if (dateValue(session.logged_on || session.created_at) >= cutoff) evidenceDays.add(dayKey(session.logged_on || session.created_at)); });
  data.recoveryLogs.forEach((log) => { if (dateValue(log.logged_on || log.created_at) >= cutoff) evidenceDays.add(dayKey(log.logged_on || log.created_at)); });
  completedOperationDays.forEach((day) => evidenceDays.add(day));
  const trades = data.trades.filter((trade) => closedTrade(trade) && dateValue(trade.traded_at || trade.created_at) >= cutoff);
  const compare = (label, richDays, sparseDays) => {
    const rich = trades.filter((trade) => richDays.has(dayKey(trade.traded_at || trade.created_at)) && ["Win", "Loss"].includes(tradeOutcome(trade)));
    const sparse = trades.filter((trade) => !sparseDays.has(dayKey(trade.traded_at || trade.created_at)) && ["Win", "Loss"].includes(tradeOutcome(trade)));
    if (rich.length < 3 || sparse.length < 3) return { label, text: "Not enough comparable trades yet; need at least 3 in each group." };
    const richWins = rich.filter((trade) => tradeOutcome(trade) === "Win").length;
    const sparseWins = sparse.filter((trade) => tradeOutcome(trade) === "Win").length;
    const richRate = Math.round((richWins / rich.length) * 100);
    const sparseRate = Math.round((sparseWins / sparse.length) * 100);
    const difference = richRate - sparseRate;
    return { label, text: `${richRate}% win rate on evidence-rich days vs ${sparseRate}% on comparison days (${difference >= 0 ? "+" : ""}${difference} points). Treat this as a lead, not proof.` };
  };
  return [
    compare("Foundation evidence vs sparse days", evidenceDays, evidenceDays),
    compare("Completed-operation days vs incomplete days", completedOperationDays, completedOperationDays),
  ];
}

function weeklyReview(data, issues) {
  const { start, end } = weekWindow();
  const rows = operationRows(data.operations, data.occurrences).rows.filter((operation) => inWindow(operation.operation_date || operation.scheduled_date || operation.completed_on, start, end));
  const completedOperations = rows.filter((operation) => operation.completed).length;
  const closedTrades = data.trades.filter((trade) => closedTrade(trade) && inWindow(trade.traded_at || trade.created_at, start, end));
  const wins = closedTrades.filter((trade) => tradeOutcome(trade) === "Win").length;
  const losses = closedTrades.filter((trade) => tradeOutcome(trade) === "Loss").length;
  const pnl = closedTrades.reduce((total, trade) => total + Number(trade.pnl_percent || 0), 0);
  const mindEntries = data.masteryEntries.filter((entry) => inWindow(entry.logged_on || entry.created_at, start, end)).length;
  const workouts = data.trainingSessions.filter((session) => inWindow(session.logged_on || session.created_at, start, end)).length;
  const recoveryLogs = data.recoveryLogs.filter((log) => inWindow(log.logged_on || log.created_at, start, end)).length;
  const projectsStarted = data.projects.filter((project) => inWindow(project.logged_on || project.created_at, start, end)).length;
  const missionWins = data.missions.filter((mission) => mission.completed && inWindow(mission.completed_on || mission.updated_at, start, end)).length;
  const operationRate = rows.length ? Math.round((completedOperations / rows.length) * 100) : null;
  const tradeRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : null;
  let focus = "Repeat the strongest routine and keep the system simple.";
  if (issues.length) focus = "Resolve the data-quality queue before adding new commitments.";
  else if (rows.length && operationRate < 60) focus = "Stabilize the operating rhythm: fewer commitments, cleaner completions.";
  else if (closedTrades.length >= 3 && losses > wins) focus = "Review the losing pattern before increasing trading exposure.";
  else if (!mindEntries && !workouts && !recoveryLogs) focus = "Create one evidence record each day instead of relying on memory.";
  return { start, end, stats: [
    { label: "OPERATIONS", value: rows.length ? `${completedOperations}/${rows.length}` : "—", note: operationRate == null ? "No scheduled evidence" : `${operationRate}% completed` },
    { label: "TRADING", value: tradeRate == null ? "—" : `${tradeRate}%`, note: `${closedTrades.length} closed trade${closedTrades.length === 1 ? "" : "s"}${pnl ? ` · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% PnL` : ""}` },
    { label: "MASTERY", value: `${mindEntries}`, note: `${workouts} workout${workouts === 1 ? "" : "s"} · ${recoveryLogs} recovery log${recoveryLogs === 1 ? "" : "s"}` },
    { label: "BUILDING", value: `${projectsStarted + missionWins}`, note: `${projectsStarted} project${projectsStarted === 1 ? "" : "s"} · ${missionWins} mission${missionWins === 1 ? "" : "s"} completed` },
  ], focus };
}

function render({ data, issues }) {
  const target = $("#system-review");
  if (!target) return;
  const review = weeklyReview(data, issues);
  const signals = crossSystemSignals(data);
  const severity = issues.some((issue) => issue.severity === "error") ? "NEEDS ATTENTION" : issues.length ? "REVIEW RECOMMENDED" : "CLEAN SIGNAL";
  const issueRows = issues.length ? issues.slice(0, 6).map((issue) => `<li class="system-audit-${issue.severity}"><span>${escape(issue.title)}</span><small>${escape(issue.detail)}</small></li>`).join("") : '<li class="system-audit-clean"><span>No integrity issues detected.</span><small>Required fields, operation links, and active-record freshness look consistent.</small></li>';
  const stats = review.stats.map((stat) => `<div><span>${stat.label}</span><strong>${escape(stat.value)}</strong><small>${escape(stat.note)}</small></div>`).join("");
  target.innerHTML = `<div class="panel-head"><div><p class="eyebrow blue-text">SYSTEM INTEGRITY / WEEKLY REVIEW</p><h3>Clean inputs. Better decisions.</h3><p class="body-copy">${review.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${review.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. This review observes the record; it does not rewrite it.</p></div><span class="system-audit-status ${issues.length ? "has-issues" : "clean"}">${severity}</span></div><div class="system-review-columns"><section><p class="eyebrow">DATA QUALITY MONITOR · ${issues.length} ISSUE${issues.length === 1 ? "" : "S"}</p><ul class="system-audit-list">${issueRows}</ul></section><section><p class="eyebrow">SEVEN-DAY OPERATING REVIEW</p><div class="system-review-stats">${stats}</div><div class="system-review-focus"><span>TOMORROW'S FOCUS</span><strong>${escape(review.focus)}</strong></div></section></div><div class="system-review-signals"><p class="eyebrow">THIRTY-DAY CROSS-SYSTEM SIGNALS</p><ul>${signals.map((signal) => `<li><span>${escape(signal.label)}</span><small>${escape(signal.text)}</small></li>`).join("")}</ul></div>`;
}

let reviewLoadTimer = null;
let reviewLoadInFlight = false;
let reviewLoadQueued = false;

function scheduleReviewLoad(delay = 180) {
  if (!supabase) return;
  clearTimeout(reviewLoadTimer);
  reviewLoadTimer = setTimeout(() => { void load(); }, delay);
}

async function load() {
  if (!supabase) return;
  if (reviewLoadInFlight) {
    reviewLoadQueued = true;
    return;
  }
  reviewLoadInFlight = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;
  const loadSnapshot = () => Promise.all([
    supabase.from("operations").select("*").eq("user_id", userId),
    supabase.from("operation_occurrences").select("*").eq("user_id", userId),
    supabase.from("missions").select("*").eq("user_id", userId),
    supabase.from("trade_debriefs").select("*").eq("user_id", userId),
    supabase.from("mastery_entries").select("*").eq("user_id", userId),
    supabase.from("training_sessions").select("*").eq("user_id", userId),
    supabase.from("business_projects").select("*").eq("user_id", userId),
    supabase.from("recovery_logs").select("*").eq("user_id", userId)
  ]);
  const [operationsResult, occurrencesResult, missionsResult, tradesResult, masteryResult, trainingResult, projectsResult, recoveryResult] = window.AEGIS_DATA_GUARD
    ? await window.AEGIS_DATA_GUARD.run("system-review:snapshot", loadSnapshot)
    : await loadSnapshot();
  const data = { operations: operationsResult.data || [], occurrences: occurrencesResult.data || [], missions: missionsResult.data || [], trades: tradesResult.data || [], masteryEntries: masteryResult.data || [], trainingSessions: trainingResult.data || [], projects: projectsResult.data || [], recoveryLogs: recoveryResult.data || [] };
  render({ data, issues: qualityReport(data) });
  } finally {
    reviewLoadInFlight = false;
    if (reviewLoadQueued) {
      reviewLoadQueued = false;
      scheduleReviewLoad(250);
    }
  }
}

if (supabase) {
  void load();
  ["aegis:missions-changed", "aegis:operations-changed", "aegis:mastery-changed", "aegis:data-changed"].forEach((eventName) => window.addEventListener(eventName, () => scheduleReviewLoad(220)));
  supabase.auth.onAuthStateChange((event) => { if (event !== "SIGNED_IN") return; scheduleReviewLoad(180); });
}
