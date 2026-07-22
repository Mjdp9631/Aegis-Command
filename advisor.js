import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const today = new Date().toLocaleDateString("en-CA");
const $ = (selector) => document.querySelector(selector);

function ensurePanel() {
  let panel = $("#adviser-panel");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "adviser-panel";
  panel.className = "adviser-panel";
  $(".intel-strip").insertAdjacentElement("afterend", panel);
  return panel;
}

function outcomeOf(trade) {
  if (trade.trade_status === "Open") return "Open";
  if (trade.outcome) return trade.outcome;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function render({ operations, missions, trades }) {
  const panel = ensurePanel();
  const remaining = operations.filter((operation) => !operation.completed);
  const completed = operations.length - remaining.length;
  const priority = remaining[0]?.title || "Protect recovery and capital.";
  const activeMission = [...missions].sort((a, b) => b.progress - a.progress)[0];
  const closedTrades = trades.filter((trade) => trade.trade_status !== "Open");
  const wins = closedTrades.filter((trade) => ["Win", "Small win"].includes(outcomeOf(trade))).length;
  const losses = closedTrades.filter((trade) => ["Loss", "Small loss"].includes(outcomeOf(trade))).length;
  const decisive = wins + losses;
  const winRate = decisive ? `${Math.round((wins / decisive) * 100)}%` : "awaiting data";

  panel.innerHTML = `
    <div class="adviser-head"><p class="eyebrow blue-text">DUAL ADVISORY SYSTEM</p><h3>JARVIS &amp; ALFRED</h3></div>
    <div class="adviser-grid">
      <article><span class="adviser-name jarvis">JARVIS / PLAN</span><p>Priority identified: <strong>${priority}</strong>${activeMission ? ` This supports <strong>${activeMission.title}</strong>.` : ""}</p></article>
      <article><span class="adviser-name alfred">ALFRED / PLAN</span><p>${remaining.length ? `There are ${remaining.length} commitments left. Complete the next one cleanly; do not negotiate with the plan.` : "The work is complete. Protect the standard and recover deliberately."}</p></article>
      <article><span class="adviser-name jarvis">JARVIS / EVALUATION</span><p>Operations: <strong>${completed}/${operations.length || 0}</strong> complete. Closed trade win rate: <strong>${winRate}</strong>.</p></article>
      <article><span class="adviser-name alfred">ALFRED / EVALUATION</span><p>${operations.length && completed === operations.length ? "A disciplined day. Record the lesson, then leave the result alone." : completed ? "Progress is real. Finish the remaining commitments before judging the day." : "The day has not been lost; it has simply not been executed yet."}</p></article>
    </div>`;
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
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-operation]")) setTimeout(loadAdvisory, 700);
  });
}
