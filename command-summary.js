import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BODY_CATEGORIES, MIND_CATEGORIES } from "./activity-metrics.js?v=activity-counters-v1";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
})();

function dateOnly(value) { return value ? String(value).slice(0, 10) : ""; }

function operationIsToday(operation) {
  if (dateOnly(operation.operation_date) === today) return true;
  const start = dateOnly(operation.scheduled_date);
  if (!start || today < start) return false;
  const end = dateOnly(operation.scheduled_end_date);
  if (end && today > end) return false;
  const mode = String(operation.schedule_mode || "one_time").toLowerCase();
  if (mode === "daily") return true;
  if (mode !== "weekly" && mode !== "recurring") return today === start;
  return new Date(`${start}T17:00:00Z`).getUTCDay() === new Date(`${today}T17:00:00Z`).getUTCDay();
}

function normalizedOutcome(value) {
  const supplied = String(value || "").trim().toLowerCase();
  if (supplied === "win" || supplied === "small win") return "Win";
  if (supplied === "loss" || supplied === "small loss") return "Loss";
  if (supplied === "b/e" || supplied === "be" || supplied === "break even" || supplied === "breakeven") return "B/E";
  return null;
}

function outcome(trade) {
  if (String(trade.trade_status || "").trim().toLowerCase() === "open") return "Open";
  const explicit = [trade.outcome, trade.win_loss, trade.result, trade.market_condition]
    .map(normalizedOutcome)
    .find(Boolean);
  if (explicit) return explicit;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function missionProgress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
function missionLabel(mission) { return isMeasured(mission) ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission.completed ? "Complete" : "Not complete"; }

function card(view, label, value, note, className = "") {
  return `<button class="command-summary-card ${className}" data-summary-view="${view}"><p>${label}</p><strong>${value}</strong><small>${note}</small></button>`;
}

function render({ missions, trades, projects, content, recoveryLogs, operations, masteryEntries, trainingSessions }) {
  const target = $("#command-summary");
  if (!target) return;
  const activeMissions = missions.filter((mission) => missionProgress(mission) < 100);
  const priority = activeMissions.find((mission) => mission.priority === "Do now") || activeMissions[0];
  const closed = trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical" && outcome(trade) !== "Open");
  const wins = closed.filter((trade) => outcome(trade) === "Win").length;
  const losses = closed.filter((trade) => outcome(trade) === "Loss").length;
  const winRate = wins + losses ? `${Math.round((wins / (wins + losses)) * 100)}%` : "--";
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const published = content.filter((item) => item.status === "Published").length;
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const loggedRecovery = recoveryLogs[0];
  const recoveryValue = recovery && isMeasured(recovery)
    ? `${Math.min(Number(recovery.completed_count) || 0, Number(recovery.target_count))} / ${recovery.target_count}`
    : recovery ? missionLabel(recovery) : "Locked";
  const recoveryNote = recovery && isMeasured(recovery)
    ? (recovery.unit_label || "units")
    : loggedRecovery ? `Latest report: ${loggedRecovery.rehab_completed ? "rehab complete" : "rehab pending"}` : "Awaiting first recovery report";
  const completedOperations = operations.filter((operation) => operation.completed).length;
  const mindEntries = masteryEntries.filter((entry) => MIND_CATEGORIES.includes(entry.category)).length;
  const bodyEntries = masteryEntries.filter((entry) => BODY_CATEGORIES.includes(entry.category)).length + trainingSessions.length;
  target.innerHTML = `${card("missions", "MISSIONS", `${activeMissions.length} active`, priority ? `Next: ${priority.title}` : "No current objective", "missions")}${card("detective", "DETECTIVE", winRate, closed.length ? `${closed.length} closed trade debriefs` : "Log the next trade debrief", "detective")}${card("enterprise", "SPECIAL PROJECTS", `${activeProjects} active`, `${published} published item${published === 1 ? "" : "s"}`, "special-projects")}${card("recovery", "RECOVERY", recoveryValue, recoveryNote, "recovery")}${card("mastery", "MASTERY", `${mindEntries} mind`, `${bodyEntries} body entries`, "mastery")}${card("character", "CHARACTER", `${completedOperations}/${operations.length || 0}`, "Today's operations completed", "character")}`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [missionsResult, tradesResult, projectsResult, contentResult, recoveryResult, operationsResult, masteryResult, trainingResult] = await Promise.all([
    supabase.from("missions").select("*"),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("business_projects").select("*"),
    supabase.from("content_items").select("*"),
    supabase.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1),
    supabase.from("operations").select("*"),
    supabase.from("mastery_entries").select("*"),
    supabase.from("training_sessions").select("id")
  ]);
  const todayOperations = (operationsResult.data || []).filter(operationIsToday);
  render({ missions: missionsResult.data || [], trades: tradesResult.data || [], projects: projectsResult.data || [], content: contentResult.data || [], recoveryLogs: recoveryResult.data || [], operations: todayOperations, masteryEntries: masteryResult.data || [], trainingSessions: trainingResult.data || [] });
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-summary-view]")?.dataset.summaryView;
  if (view) document.querySelector(`.nav-link[data-view="${view}"]`)?.click();
});

if (supabase) {
  load();
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 100); });
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 100));
  window.addEventListener("aegis:operations-changed", () => setTimeout(load, 100));
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 100));
  window.addEventListener("aegis:data-changed", (event) => { if (["mastery", "missions", "operation-status"].includes(event.detail?.source)) return; setTimeout(load, 100); });
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
}
