import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = new Date().toLocaleDateString("en-CA");
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

function levelFromXp(xp) {
  let level = 0;
  let remaining = Math.max(0, xp);
  // A long-game curve: early levels establish habits, while LV 50 remains an elite five-year target.
  let required = 40;
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = Math.round(required * 1.09);
  }
  return { level, current: remaining, required, progress: (remaining / required) * 100 };
}

function missionProgress(mission) {
  return mission?.completion_type === "units" && Number(mission.target_count) > 0 ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission?.completed ? 100 : 0;
}

function missionLabel(mission) {
  return mission?.completion_type === "units" && Number(mission.target_count) > 0 ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission?.completed ? "Complete" : "Not complete";
}

function monthKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function tradingXp(trades) {
  const totals = new Map();
  trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical" && trade.trade_status !== "Open" && trade.pnl_percent != null).forEach((trade) => {
    const key = monthKey(trade.traded_at);
    if (key) totals.set(key, (totals.get(key) || 0) + Number(trade.pnl_percent || 0));
  });
  const ledger = [];
  totals.forEach((pnl, month) => {
    const change = pnl > 0 ? Math.min(55, Math.round(pnl * 6)) : Math.max(-12, Math.round(pnl * 2));
    ledger.push({ label: month, detail: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% PnL`, change });
  });
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
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
  const ledger = [];
  days.forEach(({ total, done }, date) => {
    const rate = total ? done / total : 0;
    const change = rate >= 0.9 ? 6 : rate >= 0.75 ? 4 : rate >= 0.6 ? 2 : rate < 0.4 ? -1 : 0;
    ledger.push({ label: date, detail: `${done}/${total} operations - ${Math.round(rate * 100)}%`, change });
  });
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

function ccfxXp(projects, contentItems) {
  const ledger = [];
  projects.filter((project) => project.status === "Complete").forEach((project) => {
    ledger.push({ label: new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `Completed project: ${escape(project.title)}`, change: 30 });
  });
  contentItems.filter((item) => item.status === "Published").forEach((item) => {
    ledger.push({ label: new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `Published ${escape(item.platform)}: ${escape(item.title)}`, change: 8 });
  });
  return { xp: ledger.reduce((total, entry) => total + entry.change, 0), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

function masteryXp(entries) {
  const mindAwards = { "Book": 50, "Quote": 5, "Trading Note": 20, "Psychology": 15, "Space": 10, "Business": 15, "Stoicism": 12 };
  const bodyAwards = { "Health": 15, "Gym": 25, "Sports": 35, "Performance": 20 };
  const ledgerFor = (awards) => entries.filter((entry) => awards[entry.category]).map((entry) => ({
    label: new Date(entry.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    detail: `${entry.category}: ${escape(entry.title || "entry")}`,
    change: awards[entry.category]
  })).sort((a, b) => b.label.localeCompare(a.label));
  const mindLedger = ledgerFor(mindAwards);
  const bodyLedger = ledgerFor(bodyAwards);
  return {
    mind: { xp: mindLedger.reduce((total, entry) => total + entry.change, 0), ledger: mindLedger },
    body: { xp: bodyLedger.reduce((total, entry) => total + entry.change, 0), ledger: bodyLedger }
  };
}

function xpLedger(entries, cadence) {
  const rows = entries.length ? entries.map((entry) => `<li><span><b>${entry.label}</b>${entry.detail}</span><strong class="${entry.change < 0 ? "negative" : ""}">${entry.change >= 0 ? "+" : ""}${entry.change} XP</strong></li>`).join("") : `<li class="ledger-empty">No ${cadence} XP evidence yet.</li>`;
  return `<details class="xp-ledger"><summary>View XP ledger</summary><ul>${rows}</ul></details>`;
}

function xpStat(label, xp, entries, cadence, accent = "blue") {
  const meter = levelFromXp(xp);
  return `<div class="xp-stat-group"><article class="evidence-card ${accent}"><span>${label}</span><strong>LV ${meter.level}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, meter.progress))}%"></i></div><small><b>${Math.round(meter.current)} / ${meter.required} XP to LV ${meter.level + 1}</b></small></article>${xpLedger(entries, cadence)}</div>`;
}

function metricCard(label, value, detail, progress, accent = "blue") {
  return `<article class="evidence-card ${accent}"><span>${label}</span><strong>${value}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div><small>${detail}</small></article>`;
}

function render({ operations, trades, missions, projects, contentItems, masteryEntries }) {
  const discipline = disciplineXp(operations);
  const trading = tradingXp(trades);
  const ccfx = ccfxXp(projects, contentItems);
  const mastery = masteryXp(masteryEntries);
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const levels = { discipline: levelFromXp(discipline.xp).level, trading: levelFromXp(trading.xp).level, ccfx: levelFromXp(ccfx.xp).level, mind: levelFromXp(mastery.mind.xp).level, body: levelFromXp(mastery.body.xp).level };
  localStorage.setItem("aegis-character-levels", JSON.stringify(levels));
  window.dispatchEvent(new CustomEvent("aegis:character-levels-changed", { detail: levels }));
  $("#character").innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>Real execution earns XP. Levels require sustained proof.</p></div><section class="evidence-grid">${xpStat("DISCIPLINE", discipline.xp, discipline.ledger, "daily", "amber")}${xpStat("TRADING INTEL", trading.xp, trading.ledger, "monthly", "blue")}${xpStat("MIND MASTERY", mastery.mind.xp, mastery.mind.ledger, "Mind", "blue")}${xpStat("BODY MASTERY", mastery.body.xp, mastery.body.ledger, "Body", "green")}${xpStat("CCFX QUESTS", ccfx.xp, ccfx.ledger, "CCFX", "amber")}${metricCard("RECOVERY QUEST", recovery ? missionLabel(recovery) : "LOCKED", recovery ? escape(recovery.title) : "Awaiting a Recovery mission", missionProgress(recovery), "green")}</section><section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><div class="protocol-line"><p>&ldquo;The ledger records evidence, not ambition. Give it something worth recording.&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;And give the work your full attention, sir. The results will follow in their time.&rdquo;</p><span>- ALFRED</span></div></section>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, tradesResult, missionsResult, projectsResult, contentResult, masteryResult] = await Promise.all([
    supabase.from("operations").select("scheduled_date, completed"),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_projects").select("*"),
    supabase.from("content_items").select("*"),
    supabase.from("mastery_entries").select("*").order("created_at", { ascending: false })
  ]);
  render({ operations: operationsResult.data || [], trades: tradesResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [], contentItems: contentResult.data || [], masteryEntries: masteryResult.data || [] });
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 80));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 120));
}
