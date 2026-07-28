import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let dashboardData = null;
let activeRange = "all";
let activeChart = null;
let activeChartMode = "pnl";

function normalOutcome(value) {
  const item = String(value || "").trim().toLowerCase();
  if (item === "win" || item === "small win") return "win";
  if (item === "loss" || item === "small loss") return "loss";
  if (["b/e", "be", "break even", "breakeven"].includes(item)) return "be";
  return null;
}

function isClosed(trade) {
  return String(trade.account || "").trim().toLowerCase() !== "theoretical" && String(trade.trade_status || "").trim().toLowerCase() !== "open";
}

function tradeOutcome(trade) {
  const direct = [trade.outcome, trade.win_loss, trade.result, trade.market_condition].map(normalOutcome).find(Boolean);
  if (direct) return direct;
  if (Number(trade.r_multiple) > 0) return "win";
  if (Number(trade.r_multiple) < 0) return "loss";
  return "be";
}

function levelFromXp(xp) {
  let level = 0;
  let current = Math.max(0, xp);
  let required = 100;
  while (current >= required) { current -= required; level += 1; required = Math.round(required * 1.16); }
  return { level, current, required, progress: (current / required) * 100 };
}

function missionProgress(mission) {
  if (!mission) return 0;
  if (mission.completion_type === "units" && Number(mission.target_count) > 0) return Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100);
  return mission.completed ? 100 : 0;
}

function calculateXp({ trades, operations, projects, content }) {
  const tradeMonths = new Map();
  trades.filter(isClosed).forEach((trade) => {
    const date = new Date(trade.traded_at || trade.created_at);
    if (Number.isNaN(date.getTime()) || trade.pnl_percent == null) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    tradeMonths.set(key, (tradeMonths.get(key) || 0) + Number(trade.pnl_percent || 0));
  });
  const trading = Math.max(0, [...tradeMonths.values()].reduce((total, pnl) => total + (pnl > 0 ? Math.min(55, Math.round(pnl * 6)) : Math.max(-12, Math.round(pnl * 2))), 0));
  const operationDays = new Map();
  operations.forEach((operation) => {
    if (!operation.scheduled_date) return;
    const day = operationDays.get(operation.scheduled_date) || { total: 0, done: 0 };
    day.total += 1; if (operation.completed) day.done += 1; operationDays.set(operation.scheduled_date, day);
  });
  const discipline = Math.max(0, [...operationDays.values()].reduce((total, day) => {
    const rate = day.done / day.total;
    return total + (rate >= .9 ? 6 : rate >= .75 ? 4 : rate >= .6 ? 2 : rate < .4 ? -1 : 0);
  }, 0));
  const projectXp = projects.filter((project) => project.status === "Complete").length * 30;
  const contentXp = content.filter((item) => item.status === "Published").length * 8;
  return discipline + trading + projectXp + contentXp;
}

function ratio(value, ceiling) {
  return Math.max(0, Math.min(1, Number(value || 0) / ceiling));
}

function radarPoints({ trades, operations, missions, projects, mastery }) {
  const closedTrades = trades.filter(isClosed).length;
  const operationRate = operations.length ? operations.filter((item) => item.completed).length / operations.length : 0;
  const recoveryMissions = missions.filter((item) => String(item.category || "").toLowerCase() === "recovery");
  const recovery = recoveryMissions.length ? recoveryMissions.reduce((sum, item) => sum + missionProgress(item), 0) / recoveryMissions.length / 100 : 0;
  const projectProgress = projects.length ? projects.filter((item) => String(item.status || "").toLowerCase() === "complete").length / projects.length : 0;
  const missionCompletion = missions.length ? missions.filter((item) => missionProgress(item) >= 100).length / missions.length : 0;
  const values = [ratio(closedTrades, 100), operationRate, recovery, projectProgress, ratio(mastery.length, 50), missionCompletion];
  const axes = [[50,7],[87,28],[87,72],[50,93],[13,72],[13,28]];
  return values.map((value, index) => {
    const [x, y] = axes[index];
    return `${50 + (x - 50) * value},${50 + (y - 50) * value}`;
  }).join(" ");
}

function rangeCutoff(trades) {
  const latestTrade = trades.at(-1);
  const latest = latestTrade ? new Date(latestTrade.traded_at || latestTrade.created_at) : new Date();
  const cutoff = new Date(latest);
  if (activeRange === "week") cutoff.setDate(cutoff.getDate() - 7);
  if (activeRange === "month") cutoff.setMonth(cutoff.getMonth() - 1);
  return cutoff;
}

function valueSeries(trades, accounts) {
  const completed = trades.filter(isClosed).sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at));
  const cutoff = rangeCutoff(completed);
  if (activeChartMode === "balance") {
    const account = (accounts || []).find((item) => item.is_primary) || (accounts || [])[0];
    if (!account) return { entries: [], total: 0, unit: "$", count: 0, accountName: null };
    let total = Number(account.starting_balance);
    const allEntries = completed.filter((trade) => String(trade.account || "").trim() === account.account_name).map((trade) => {
      const prior = total;
      total *= 1 + (Number(trade.pnl_percent) || 0) / 100;
      return { total, delta: total - prior, date: new Date(trade.traded_at || trade.created_at) };
    });
    const entries = activeRange === "all" ? allEntries : allEntries.filter((entry) => entry.date >= cutoff);
    return { entries, total: entries.at(-1)?.total ?? Number(account.starting_balance), unit: "$", count: entries.length, accountName: account.account_name };
  }
  const filtered = activeRange === "all" ? completed : completed.filter((trade) => new Date(trade.traded_at || trade.created_at) >= cutoff);
  const usablePnl = filtered.some((trade) => trade.pnl_percent != null && Number.isFinite(Number(trade.pnl_percent)));
  let total = 0;
  const entries = filtered.map((trade) => {
    total += usablePnl ? Number(trade.pnl_percent || 0) : Number(trade.r_multiple || 0);
    return { total, delta: usablePnl ? Number(trade.pnl_percent || 0) : Number(trade.r_multiple || 0), date: new Date(trade.traded_at || trade.created_at) };
  });
  return { entries, total, unit: usablePnl ? "%" : "R", count: filtered.length, accountName: null };
}

function formatChartValue(value, unit, withSign = true) {
  const number = Number(value) || 0;
  const sign = withSign && number > 0 ? "+" : "";
  return unit === "$" ? `${sign}$${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${sign}${number.toFixed(2)}${unit}`;
}

function chartSvg(entries, unit, total) {
  if (!entries.length) return '<div class="chart-empty">LOG CLOSED TRADE DATA TO ACTIVATE THIS DISPLAY</div>';
  const width = 620, height = 255, padLeft = 52, padRight = 16, padTop = 18, padBottom = 28;
  const values = [0, ...entries.map((entry) => entry.total)];
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const xAt = (index) => padLeft + (index / Math.max(1, entries.length - 1)) * (width - padLeft - padRight);
  const yAt = (value) => height - padBottom - ((value - min) / span) * (height - padTop - padBottom);
  const points = entries.map((entry, index) => `${xAt(index)},${yAt(entry.total)}`).join(" ");
  const area = `${padLeft},${height - padBottom} ${points} ${width - padRight},${height - padBottom}`;
  const horizontal = Array.from({ length: 5 }, (_, index) => { const value=min+(span*(4-index)/4);const y=yAt(value);return `<path d="M ${padLeft} ${y} H ${width-padRight}"/><text class="chart-axis-y" x="4" y="${y+3}">${formatChartValue(value, unit, false)}</text>`; }).join("");
  const vertical = Array.from({ length: 6 }, (_, index) => { const item=entries[Math.round((entries.length-1)*(index/5))];const x=padLeft+((width-padLeft-padRight)*(index/5));const label=item?.date?.toLocaleDateString(undefined,{month:"short",day:"numeric"})||"";return `<path d="M ${x} ${padTop} V ${height-padBottom}"/><text class="chart-axis-x" x="${x}" y="${height-7}" text-anchor="middle">${label}</text>`; }).join("");
  const formattedTotal = formatChartValue(total, unit);
  return `<div class="chart-summary-readout"><span>CUMULATIVE PNL</span><small>FROM LOGGED TRADES</small><b class="${total < 0 ? "negative" : ""}">${formattedTotal}</b></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><g class="chart-grid">${horizontal}${vertical}</g><defs><linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#58b4ff" stop-opacity=".34"/><stop offset="1" stop-color="#58b4ff" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#pnl-fill)"/><polyline points="${points}" class="chart-line"/></svg><div class="chart-crosshair" aria-hidden="true"></div><div class="chart-tooltip" aria-hidden="true"></div>`;
}

function attachCrosshair(chart) {
  const host = $("#hero-trade-chart");
  if (!host) return;
  host.onpointermove = (event) => {
    if (!chart?.entries?.length) return;
    const rect = host.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (chart.entries.length - 1));
    const entry = chart.entries[index];
    const x = (index / Math.max(1, chart.entries.length - 1)) * 100;
    const crosshair = host.querySelector(".chart-crosshair");
    const tooltip = host.querySelector(".chart-tooltip");
    if (!crosshair || !tooltip) return;
    crosshair.style.left = `${x}%`; crosshair.classList.add("visible");
    tooltip.innerHTML = `<b>${entry.total >= 0 ? "+" : ""}${entry.total.toFixed(2)}${chart.unit}</b><span>${entry.date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})} · ${entry.delta >= 0 ? "+" : ""}${entry.delta.toFixed(2)}${chart.unit}</span>`;
    tooltip.style.left = `${Math.min(78, Math.max(3, x))}%`; tooltip.classList.add("visible");
  };
  host.onpointerleave = () => { host.querySelector(".chart-crosshair")?.classList.remove("visible"); host.querySelector(".chart-tooltip")?.classList.remove("visible"); };
}

function render() {
  if (!dashboardData) return;
  const { trades, operations, missions, projects, content, mastery, accounts } = dashboardData;
  const chart = valueSeries(trades, accounts);
  $("#hero-trade-chart").innerHTML = chartSvg(chart.entries, chart.unit, chart.total);
  activeChart = chart;
  attachCrosshair(chart);
  $("#hero-chart-title").textContent = activeChartMode === "balance" ? `ACCOUNT BALANCE // ${chart.accountName || "SETUP REQUIRED"}` : "TRADE INTELLIGENCE // CUMULATIVE PNL";
  $("#hero-trade-caption").textContent = chart.count ? `${chart.count} CLOSED TRADES // ${activeRange.toUpperCase()}` : activeChartMode === "balance" ? "SET A STARTING BALANCE IN DETECTIVE" : "AWAITING TRADE DATA";
  const pnl = formatChartValue(chart.total, chart.unit);
  $("#hero-trade-pnl").textContent = chart.count ? pnl : "—";
  $("#hero-trade-pnl").classList.toggle("negative", chart.total < 0);

  const xp = calculateXp(dashboardData);
  const level = levelFromXp(xp);
  $("#hero-character-level").textContent = `LV ${level.level}`;
  $("#hero-character-xp").textContent = `${Math.round(level.current)} / ${level.required} XP`;
  $("#hero-character-radar")?.setAttribute("points", radarPoints({ trades, operations, missions, projects, mastery }));

  const activeMissions = missions.filter((mission) => missionProgress(mission) < 100);
  $("#hero-mission-count").textContent = `${activeMissions.length} ACTIVE`;
  const radar = $("#hero-mission-radar");
  radar.style.setProperty("--mission-scale", Math.max(.42, Math.min(1, activeMissions.length / 5)));

}

function money(value, digits = 2) {
  return Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}` : "UNAVAILABLE";
}

async function loadMarkets() {
  const xauPrice = $("#hero-xau-price");
  const xauState = $("#hero-xau-state");
  const xrpPrice = $("#hero-xrp-price");
  const xrpChange = $("#hero-xrp-change");
  if (!xauPrice || !xrpPrice) return;
  try {
    const [goldResponse, xrpResponse] = await Promise.all([
      fetch("https://xaus.com/api/v1/spot?compact=1"),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd&include_24hr_change=true")
    ]);
    if (!goldResponse.ok || !xrpResponse.ok) throw new Error("Market feed unavailable");
    const [gold, crypto] = await Promise.all([goldResponse.json(), xrpResponse.json()]);
    const xrp = crypto.ripple || {};
    xauPrice.textContent = money(gold.spot_usd_oz);
    xauState.textContent = gold.stale ? "LAST VERIFIED QUOTE" : "INDICATIVE SPOT";
    xrpPrice.textContent = money(xrp.usd, 4);
    const change = Number(xrp.usd_24h_change);
    xrpChange.textContent = Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}% / 24H` : "INDICATIVE SPOT";
    xrpChange.classList.toggle("negative", change < 0);
  } catch {
    xauPrice.textContent = "UNAVAILABLE";
    xauState.textContent = "FEED OFFLINE";
    xrpPrice.textContent = "UNAVAILABLE";
    xrpChange.textContent = "FEED OFFLINE";
  }
}

async function load() {
  if (!supabase) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;
  const [tradesResult, operationsResult, missionsResult, projectsResult, contentResult, masteryResult, accountsResult] = await Promise.all([
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: true }),
    supabase.from("operations").select("scheduled_date, completed"),
    supabase.from("missions").select("*"),
    supabase.from("business_projects").select("status"),
    supabase.from("content_items").select("status"),
    supabase.from("mastery_entries").select("id"),
    supabase.from("account_balances").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: true })
  ]);
  dashboardData = { trades: tradesResult.data || [], operations: operationsResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [], content: contentResult.data || [], mastery: masteryResult.data || [], accounts: accountsResult.data || [] };
  render();
}

document.addEventListener("click", (event) => {
  const range = event.target.closest("[data-chart-range]");
  if (range) { event.stopPropagation(); activeRange = range.dataset.chartRange; document.querySelectorAll("[data-chart-range]").forEach((button) => button.classList.toggle("active", button === range)); render(); return; }
  const mode = event.target.closest("[data-chart-mode]");
  if (mode) { event.stopPropagation(); activeChartMode = mode.dataset.chartMode; document.querySelectorAll("[data-chart-mode]").forEach((button) => button.classList.toggle("active", button === mode)); render(); return; }
  const target = event.target.closest("[data-dashboard-view]");
  if (target) document.querySelector(`.nav-link[data-view="${target.dataset.dashboardView}"]`)?.click();
});
document.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-dashboard-view]")) { event.preventDefault(); event.target.click(); } });

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 100));
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 120));
  window.addEventListener("aegis:operations-changed", () => setTimeout(load, 120));
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 120));
  window.addEventListener("aegis:accounts-changed", () => setTimeout(load, 120));
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
}

loadMarkets();
setInterval(loadMarkets, 60000);
