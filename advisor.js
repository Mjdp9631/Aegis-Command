import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const today = new Date().toLocaleDateString("en-CA");
const $ = (selector) => document.querySelector(selector);

function ensurePanel(id, className, anchor, position) {
  let panel = $(`#${id}`);
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = id;
  panel.className = className;
  $(anchor).insertAdjacentElement(position, panel);
  return panel;
}

function normalizedOutcome(value) {
  const supplied = String(value || "").trim().toLowerCase();
  if (supplied === "win" || supplied === "small win") return "Win";
  if (supplied === "loss" || supplied === "small loss") return "Loss";
  if (supplied === "b/e" || supplied === "be" || supplied === "break even" || supplied === "breakeven") return "B/E";
  return null;
}

function outcomeOf(trade) {
  if (String(trade.trade_status || "").trim().toLowerCase() === "open") return "Open";
  const explicit = [trade.outcome, trade.win_loss, trade.result, trade.market_condition].map(normalizedOutcome).find(Boolean);
  if (explicit) return explicit;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function missionProgress(mission) {
  return mission.completion_type === "units" && Number(mission.target_count) > 0 ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0;
}

function render({ operations, missions, trades }) {
  const morning = ensurePanel("morning-briefing", "adviser-panel morning-briefing", ".hero", "afterend");
  const panel = ensurePanel("adviser-panel", "adviser-panel", ".intel-strip", "afterend");
  const remaining = operations.filter((operation) => !operation.completed);
  const completed = operations.length - remaining.length;
  const nextOperation = remaining[0]?.title || "Close the day deliberately and protect recovery.";
  const activeMission = [...missions].filter((mission) => missionProgress(mission) < 100).sort((a, b) => missionProgress(b) - missionProgress(a))[0];
  const closedTrades = trades.filter((trade) => outcomeOf(trade) !== "Open");
  const wins = closedTrades.filter((trade) => outcomeOf(trade) === "Win").length;
  const losses = closedTrades.filter((trade) => outcomeOf(trade) === "Loss").length;
  const decisive = wins + losses;
  const winRate = decisive ? `${Math.round((wins / decisive) * 100)}%` : "awaiting data";

  morning.innerHTML = `<div class="adviser-head"><p class="eyebrow amber">MORNING DIRECTIVE</p><h3>GOOD MORNING</h3></div><div class="adviser-grid"><article><span class="adviser-name jarvis">JARVIS / TODAY'S PLAN</span><p>Today’s priority is <strong>${nextOperation}</strong>${activeMission ? `. It supports <strong>${activeMission.title}</strong>.` : ""}</p></article><article><span class="adviser-name alfred">ALFRED / STANDARD</span><p>${remaining.length ? `There are ${remaining.length} commitments on the board. Begin with the first; do not spend energy negotiating with the plan.` : "The day’s commitments are complete. Preserve the standard and recover deliberately."}</p></article></div>`;

  panel.innerHTML = `<div class="adviser-head"><p class="eyebrow blue-text">EVENING DEBRIEF</p><h3>EXAMINATION / RE-EVALUATION</h3></div><div class="adviser-grid"><article><span class="adviser-name jarvis">JARVIS / EXAMINATION</span><p>Operations: <strong>${completed}/${operations.length || 0}</strong> complete. Closed trade win rate: <strong>${winRate}</strong> (${wins} wins / ${losses} losses; B/E excluded). Current data indicates ${remaining.length ? `${remaining.length} unfinished commitment${remaining.length === 1 ? "" : "s"}` : "the plan is complete"}.</p></article><article><span class="adviser-name alfred">ALFRED / RE-EVALUATION</span><p>${operations.length && completed === operations.length ? "A disciplined day. Record the lesson, then leave the result alone." : completed ? "Progress is real. Finish the remaining commitments before judging the day." : "The day has not been lost; it has simply not been executed yet."}</p></article></div>`;
}

async function loadAdvisory() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, missionsResult, tradesResult] = await Promise.all([
    supabase.from("operations").select("*").eq("scheduled_date", today).order("created_at"),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }).limit(50)
  ]);
  if (operationsResult.error || missionsResult.error || tradesResult.error) return;
  render({ operations: operationsResult.data || [], missions: missionsResult.data || [], trades: tradesResult.data || [] });
}

if (supabase) {
  loadAdvisory();
  supabase.auth.onAuthStateChange(() => setTimeout(loadAdvisory, 100));
  window.addEventListener("aegis:missions-changed", () => setTimeout(loadAdvisory, 100));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(loadAdvisory, 700); });
}
