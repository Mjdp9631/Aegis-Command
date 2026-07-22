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

function levelFromXp(xp) {
  let level = 0;
  let remaining = Math.max(0, xp);
  let required = 100;
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = Math.round(required * 1.16);
  }
  return { level, current: remaining, required, progress: (remaining / required) * 100 };
}

function monthKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function tradingXp(trades) {
  const totals = new Map();
  trades.filter((trade) => trade.trade_status !== "Open" && trade.pnl_percent != null).forEach((trade) => {
    const key = monthKey(trade.traded_at);
    if (key) totals.set(key, (totals.get(key) || 0) + Number(trade.pnl_percent || 0));
  });
  let xp = 0;
  const ledger = [];
  totals.forEach((pnl, month) => {
    // +1% for a month earns 6 XP; gains are capped at +55 and a bad month at -12.
    const change = pnl > 0 ? Math.min(55, Math.round(pnl * 6)) : Math.max(-12, Math.round(pnl * 2));
    xp += change;
    ledger.push({ label: month, detail: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% PnL`, change });
  });
  return { xp: Math.max(0, xp), months: totals.size, currentPnl: totals.get(monthKey(new Date())) || 0, ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

function disciplineXp(operations) {
  const days = new Map();
  operations.forEach((operation) => {
    if (!operation.scheduled_date || operation.scheduled_date >= today) return;
    const day = days.get(operation.scheduled_date) || { total: 0, done: 0 };
    day.total += 1;
    if (operation.completed) day.done += 1;
    days.set(operation.scheduled_date, day);
  });
  let xp = 0;
  const ledger = [];
  days.forEach(({ total, done }, date) => {
    const rate = total ? done / total : 0;
    let change = 0;
    if (rate >= 0.9) change = 6;
    else if (rate >= 0.75) change = 4;
    else if (rate >= 0.6) change = 2;
    else if (rate < 0.4) change = -1;
    xp += change;
    ledger.push({ label: date, detail: `${done}/${total} operations · ${Math.round(rate * 100)}%`, change });
  });
  return { xp: Math.max(0, xp), scoredDays: days.size, ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

function xpLedger(entries, cadence) {
  const rows = entries.length ? entries.map((entry) => `<li><span><b>${entry.label}</b>${entry.detail}</span><strong class="${entry.change < 0 ? "negative" : ""}">${entry.change >= 0 ? "+" : ""}${entry.change} XP</strong></li>`).join("") : `<li class="ledger-empty">No ${cadence} XP evidence yet.</li>`;
  return `<details class="xp-ledger"><summary>View XP ledger</summary><ul>${rows}</ul></details>`;
}

function statCard(label, xp, entries, cadence, accent = "blue") {
  const meter = levelFromXp(xp);
  return `<article class="evidence-card ${accent}"><span>${label}</span><strong>LV ${meter.level}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, meter.progress))}%"></i></div><small><b>${Math.round(meter.current)} / ${meter.required} XP to LV ${meter.level + 1}</b></small>${xpLedger(entries, cadence)}</article>`;
}

function metricCard(label, value, detail, progress, accent = "blue") {
  return `<article class="evidence-card ${accent}"><span>${label}</span><strong>${value}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div><small>${detail}</small></article>`;
}

function render({ operations, todayOperations, trades, missions, projects }) {
  const done = todayOperations.filter((operation) => operation.completed).length;
  const disciplineRate = todayOperations.length ? Math.round((done / todayOperations.length) * 100) : 0;
  const discipline = disciplineXp(operations);
  const closedTrades = trades.filter((trade) => trade.trade_status !== "Open");
  const wins = closedTrades.filter((trade) => ["Win", "Small win"].includes(outcome(trade))).length;
  const losses = closedTrades.filter((trade) => ["Loss", "Small loss"].includes(outcome(trade))).length;
  const winRate = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const trading = tradingXp(trades);
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  $("#character").innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>Real execution earns XP. Levels require sustained proof.</p></div><section class="evidence-grid">${statCard("DISCIPLINE", discipline.xp, discipline.ledger, "daily", "amber")}${statCard("TRADING INTEL", trading.xp, trading.ledger, "monthly", "blue")}${metricCard("RECOVERY QUEST", recovery ? `${recovery.progress}%` : "LOCKED", recovery ? recovery.title : "Awaiting a Recovery mission", recovery ? recovery.progress : 0, "green")}${metricCard("CCFX QUESTS", String(activeProjects), `${activeProjects === 1 ? "active project in progress" : "active projects in progress"}`, Math.min(activeProjects * 25, 100), "amber")}</section><section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><h3>Stats rise when evidence does.</h3><p>Jarvis scores the data. Alfred protects the standard. No single win, loss, or missed day defines you—consistent execution does.</p></section>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, todayOperationsResult, tradesResult, missionsResult, projectsResult] = await Promise.all([
    supabase.from("operations").select("scheduled_date, completed"),
    supabase.from("operations").select("*").eq("scheduled_date", today),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_projects").select("*")
  ]);
  render({ operations: operationsResult.data || [], todayOperations: todayOperationsResult.data || [], trades: tradesResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [] });
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 80));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
}
