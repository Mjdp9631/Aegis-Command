import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = new Date().toLocaleDateString("en-CA");

function outcome(trade) {
  if (trade.trade_status === "Open") return "Open";
  if (trade.outcome) return trade.outcome;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function statCard(label, value, detail, progress, accent = "blue") {
  return `<article class="evidence-card ${accent}"><span>${label}</span><strong>${value}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div><small>${detail}</small></article>`;
}

function render({ operations, trades, missions, projects }) {
  const done = operations.filter((operation) => operation.completed).length;
  const discipline = operations.length ? Math.round((done / operations.length) * 100) : 0;
  const closedTrades = trades.filter((trade) => trade.trade_status !== "Open");
  const wins = closedTrades.filter((trade) => ["Win", "Small win"].includes(outcome(trade))).length;
  const losses = closedTrades.filter((trade) => ["Loss", "Small loss"].includes(outcome(trade))).length;
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  $("#character").innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>Every stat is derived from real execution. No imaginary XP.</p></div><section class="evidence-grid">${statCard(`DISCIPLINE · LV ${discipline}`, `${discipline}%`, `${done}/${operations.length || 0} operations completed today`, discipline, "amber")}${statCard(`TRADING · LV ${winRate}`, `${winRate}%`, `${wins} wins / ${losses} losses across closed trades`, winRate, "blue")}${statCard("RECOVERY QUEST", recovery ? `${recovery.progress}%` : "LOCKED", recovery ? recovery.title : "Awaiting a Recovery mission", recovery ? recovery.progress : 0, "green")}${statCard("CCFX QUESTS", String(activeProjects), `${activeProjects === 1 ? "active project in progress" : "active projects in progress"}`, Math.min(activeProjects * 25, 100), "amber")}</section><section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><h3>Stats rise when evidence does.</h3><p>Complete the work. Log it honestly. Let the trend—not a single day—tell the story.</p></section>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, tradesResult, missionsResult, projectsResult] = await Promise.all([
    supabase.from("operations").select("*").eq("scheduled_date", today),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_projects").select("*")
  ]);
  render({ operations: operationsResult.data || [], trades: tradesResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [] });
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 80));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
}
