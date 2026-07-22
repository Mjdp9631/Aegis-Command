import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = new Date().toLocaleDateString("en-CA");

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

function render({ missions, trades, projects, content, recoveryLogs, operations, masteryEntries }) {
  const target = $("#command-summary");
  if (!target) return;
  const activeMissions = missions.filter((mission) => missionProgress(mission) < 100);
  const priority = activeMissions.find((mission) => mission.priority === "Do now") || activeMissions[0];
  const closed = trades.filter((trade) => outcome(trade) !== "Open");
  const wins = closed.filter((trade) => outcome(trade) === "Win").length;
  const losses = closed.filter((trade) => outcome(trade) === "Loss").length;
  const winRate = wins + losses ? `${Math.round((wins / (wins + losses)) * 100)}%` : "--";
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const published = content.filter((item) => item.status === "Published").length;
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const loggedRecovery = recoveryLogs[0];
  const completedOperations = operations.filter((operation) => operation.completed).length;
  const mindEntries = masteryEntries.filter((entry) => ["Book", "Quote", "Trading Note", "Psychology", "Space", "Business", "Stoicism"].includes(entry.category)).length;
  const bodyEntries = masteryEntries.filter((entry) => ["Health", "Gym", "Sports", "Performance"].includes(entry.category)).length;
  target.innerHTML = `${card("missions", "MISSIONS", `${activeMissions.length} active`, priority ? `Next: ${priority.title}` : "No current objective", "missions")}${card("detective", "DETECTIVE", winRate, closed.length ? `${closed.length} closed trade debriefs` : "Log the next trade debrief", "detective")}${card("enterprise", "SPECIAL PROJECTS", `${activeProjects} active`, `${published} published item${published === 1 ? "" : "s"}`, "special-projects")}${card("recovery", "RECOVERY", recovery ? missionLabel(recovery) : "Locked", loggedRecovery ? `Latest report: ${loggedRecovery.rehab_completed ? "rehab complete" : "rehab pending"}` : "Awaiting first recovery report", "recovery")}${card("mastery", "MASTERY", `${mindEntries} mind`, `${bodyEntries} body entries`, "mastery")}${card("character", "CHARACTER", `${completedOperations}/${operations.length || 0}`, "Today's operations completed", "character")}`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [missionsResult, tradesResult, projectsResult, contentResult, recoveryResult, operationsResult, masteryResult] = await Promise.all([
    supabase.from("missions").select("*"),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("business_projects").select("*"),
    supabase.from("content_items").select("*"),
    supabase.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1),
    supabase.from("operations").select("*").eq("scheduled_date", today),
    supabase.from("mastery_entries").select("*")
  ]);
  render({ missions: missionsResult.data || [], trades: tradesResult.data || [], projects: projectsResult.data || [], content: contentResult.data || [], recoveryLogs: recoveryResult.data || [], operations: operationsResult.data || [], masteryEntries: masteryResult.data || [] });
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-summary-view]")?.dataset.summaryView;
  if (view) document.querySelector(`.nav-link[data-view="${view}"]`)?.click();
});

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 100));
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 100));
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 100));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
}
