import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const ready = config.supabaseUrl && config.supabaseAnonKey;
const supabase = ready ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let syncSetupUi = () => {};
let currentTradeId = null;
let loadedTrades = [];
let activeFilters = {};
let includeTheoreticalInAnalysis = false;
let accountBalances = [];
let activeDetectiveTab = localStorage.getItem("aegis.detective-tab") || "journal";

function numberOrNull(value) {
  return value === "" || value == null ? null : Number(value);
}

function displayNumber(value, suffix = "") {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function normalizedOutcome(value) {
  const supplied = String(value || "").trim().toLowerCase();
  if (supplied === "win" || supplied === "small win") return "Win";
  if (supplied === "loss" || supplied === "small loss") return "Loss";
  if (supplied === "b/e" || supplied === "be" || supplied === "break even" || supplied === "breakeven") return "B/E";
  return null;
}

function resolvedOutcome(trade) {
  if (String(trade.trade_status || "").trim().toLowerCase() === "open") return "Open";
  const explicit = [trade.outcome, trade.win_loss, trade.result]
    .map(normalizedOutcome)
    .find(Boolean);
  if (explicit) return explicit;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
}

function isTheoretical(trade) {
  return String(trade.account || "").trim().toLowerCase() === "theoretical";
}

function tradeTime(trade) {
  const value = new Date(trade.traded_at || trade.created_at || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function streakMetrics(trades) {
  // Break-even trades are neutral: they do not create or break a decisive W/L streak.
  const decisive = [...trades].sort((left, right) => tradeTime(left) - tradeTime(right)).map(resolvedOutcome).filter((item) => item === "Win" || item === "Loss");
  let runType = null;
  let runLength = 0;
  let longestWin = 0;
  let longestLoss = 0;
  for (const result of decisive) {
    runLength = result === runType ? runLength + 1 : 1;
    runType = result;
    if (result === "Win") longestWin = Math.max(longestWin, runLength);
    else longestLoss = Math.max(longestLoss, runLength);
  }
  return { currentType: runType, currentLength: runLength, longestWin, longestLoss };
}

function setTone(element, tone) {
  if (!element) return;
  element.classList.remove("metric-tone-green", "metric-tone-lime", "metric-tone-yellow", "metric-tone-orange", "metric-tone-red", "streak-win", "streak-loss");
  if (tone) element.classList.add(tone);
}

function winRateTone(rate) {
  if (rate == null) return null;
  if (rate < 30) return "metric-tone-red";
  if (rate < 40) return "metric-tone-orange";
  if (rate < 50) return "metric-tone-yellow";
  if (rate < 60) return "metric-tone-lime";
  return "metric-tone-green";
}

function displaySetup(value) {
  if (!value) return "—";
  try {
    const choices = JSON.parse(value);
    return Array.isArray(choices) ? choices.join(" + ") : value;
  } catch {
    return value;
  }
}

function setupValues(value) {
  try { const choices = JSON.parse(value || "[]"); return Array.isArray(choices) ? choices : [value]; }
  catch { return value ? [value] : []; }
}

function money(value) {
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function accountTrades(accountName) {
  return loadedTrades
    .filter((trade) => !isTheoretical(trade) && String(trade.account || "").trim() === accountName && resolvedOutcome(trade) !== "Open")
    .sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at));
}

function calculatedBalance(account) {
  return accountTrades(account.account_name).reduce(
    (balance, trade) => balance * (1 + (Number(trade.pnl_percent) || 0) / 100),
    Number(account.starting_balance)
  );
}

function updateAccountSelect() {
  const control = $("#detective-account");
  if (!control || !accountBalances.length) return;
  const selected = control.value;
  const names = [...new Set([...Array.from(control.options).map((option) => option.value), ...accountBalances.map((account) => account.account_name)])];
  control.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (names.includes(selected)) control.value = selected;
}

function renderAccountBalances() {
  const list = $("#account-balance-list");
  if (!list) return;
  if (!accountBalances.length) {
    list.innerHTML = '<p class="empty-account-state">No account balance is configured yet. Add the account you want the Command Center to track.</p>';
    updateAccountSelect();
    return;
  }
  list.innerHTML = accountBalances.map((account) => {
    const current = calculatedBalance(account);
    const delta = current - Number(account.starting_balance);
    const tradeCount = accountTrades(account.account_name).length;
    return `<article class="account-balance-card"><div><p>${escapeHtml(account.account_name)} ${account.is_primary ? '<span>COMMAND CENTER</span>' : ""}</p><strong>${money(current)}</strong><small>Started at ${money(account.starting_balance)} · ${tradeCount} closed trade${tradeCount === 1 ? "" : "s"}</small></div><b class="${delta >= 0 ? "result-positive" : "result-negative"}">${delta >= 0 ? "+" : ""}${money(delta)}</b></article>`;
  }).join("");
  updateAccountSelect();
}

function setDetectiveTab(tab) {
  activeDetectiveTab = tab;
  localStorage.setItem("aegis.detective-tab", tab);
  $("#detective-journal").hidden = tab !== "journal";
  $("#detective-accounts").hidden = tab !== "accounts";
  $("#detective-brain").hidden = tab !== "brain";
  document.querySelectorAll("[data-detective-tab]").forEach((button) => button.classList.toggle("active", button.dataset.detectiveTab === tab));
}

async function loadAccountBalances() {
  if (!supabase) return;
  const { data, error } = await supabase.from("account_balances").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  accountBalances = data || [];
  renderAccountBalances();
}

async function saveAccountBalance(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before saving an account.");
  const accountName = $("#account-balance-name").value.trim();
  const startingBalance = numberOrNull($("#account-starting-balance").value);
  const primary = $("#account-primary").checked;
  if (!accountName || !startingBalance || startingBalance <= 0) return;
  if (primary) await supabase.from("account_balances").update({ is_primary: false }).eq("user_id", sessionData.session.user.id);
  const { error } = await supabase.from("account_balances").upsert({ user_id: sessionData.session.user.id, account_name: accountName, starting_balance: startingBalance, is_primary: primary }, { onConflict: "user_id,account_name" });
  if (error) return alert(`The account could not be saved: ${error.message}`);
  event.target.reset();
  await loadAccountBalances();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

function filteredTrades() {
  return loadedTrades.filter((trade) => {
    if (activeFilters.pair && trade.pair !== activeFilters.pair) return false;
    if (Array.isArray(activeFilters.setup) && activeFilters.setup.length && !activeFilters.setup.some((setup) => setupValues(trade.setup).includes(setup))) return false;
    if (activeFilters.cb_hour && trade.cb_hour !== activeFilters.cb_hour) return false;
    if (activeFilters.session_time && trade.session_time !== activeFilters.session_time) return false;
    if (activeFilters.trade_type && trade.trade_type !== activeFilters.trade_type) return false;
    if (activeFilters.market_condition && trade.market_condition !== activeFilters.market_condition) return false;
    if (activeFilters.position && trade.position !== activeFilters.position) return false;
    return true;
  });
}

function applyFilters() {
  const trades = filteredTrades();
  renderMetrics(trades);
  renderTrades(trades);
  const count = $("#filter-result-count");
  if (count) count.textContent = `${trades.length} matching trade${trades.length === 1 ? "" : "s"} · ${includeTheoreticalInAnalysis ? "live + theoretical analysis" : "live analysis"}`;
}

function renderMetrics(trades) {
  const closedTrades = trades.filter((trade) => (includeTheoreticalInAnalysis || !isTheoretical(trade)) && resolvedOutcome(trade) !== "Open");
  const outcomes = closedTrades.map(resolvedOutcome);
  const wins = outcomes.filter((outcome) => outcome === "Win").length;
  const losses = outcomes.filter((outcome) => outcome === "Loss").length;
  const decisiveTrades = wins + losses;
  const average = (items) => items.length ? items.reduce((total, value) => total + Number(value), 0) / items.length : null;
  const averageR = average(closedTrades.filter((trade) => trade.r_multiple != null).map((trade) => trade.r_multiple));
  const averageMae = average(closedTrades.filter((trade) => trade.mae_30m != null).map((trade) => trade.mae_30m));
  const averageMfe = average(closedTrades.filter((trade) => trade.mfe_30m != null).map((trade) => trade.mfe_30m));
  const totalPnl = closedTrades.reduce((total, trade) => total + (Number(trade.pnl_percent) || 0), 0);
  const winRate = decisiveTrades ? Math.round((wins / decisiveTrades) * 100) : null;
  const streaks = streakMetrics(closedTrades);
  const winRateElement = $("#detective-win-rate");
  const currentStreakElement = $("#detective-current-streak");
  const currentStreakNote = $("#detective-current-streak-note");
  const longestWinElement = $("#detective-longest-win");
  const longestLossElement = $("#detective-longest-loss");

  winRateElement.textContent = winRate == null ? "—" : `${winRate}%`;
  setTone(winRateElement, winRateTone(winRate));
  $("#detective-win-rate-note").textContent = decisiveTrades ? `${wins} win${wins === 1 ? "" : "s"} / ${decisiveTrades} closed trade${decisiveTrades === 1 ? "" : "s"}${includeTheoreticalInAnalysis ? " · theoretical included" : ""}` : "Log closed trades to calculate";
  currentStreakElement.textContent = streaks.currentLength ? `${streaks.currentLength}${streaks.currentType === "Win" ? "W" : "L"}` : "—";
  setTone(currentStreakElement, streaks.currentType === "Win" ? "streak-win" : streaks.currentType === "Loss" ? "streak-loss" : null);
  currentStreakNote.textContent = streaks.currentLength ? `Current ${streaks.currentType.toLowerCase()} streak` : "Awaiting decisive trades";
  longestWinElement.textContent = streaks.longestWin ? `${streaks.longestWin}W` : "—";
  longestLossElement.textContent = streaks.longestLoss ? `${streaks.longestLoss}L` : "—";
  setTone(longestWinElement, "streak-win");
  setTone(longestLossElement, "streak-loss");
  $("#detective-average-r").textContent = displayNumber(averageR, "R");
  $("#detective-excursion").textContent = averageMae == null && averageMfe == null ? "—" : `${displayNumber(averageMae)} / ${displayNumber(averageMfe)}`;
  $("#detective-violations").textContent = displayNumber(totalPnl, "%");
}

function renderTrades(trades) {
  const table = $("#trade-log");
  if (!trades.length) {
    table.innerHTML = '<tr class="empty-row"><td colspan="20">No trade debriefs yet. Preserve data; log the next execution.</td></tr>';
    return;
  }

  const tradeNumbers = new Map([...loadedTrades].sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at)).map((trade, index) => [trade.id, index + 1]));
  table.innerHTML = trades.map((trade) => {
    const outcome = resolvedOutcome(trade);
    const resultClass = outcome === "Win" || outcome === "Small win" ? "result-positive" : outcome === "Loss" || outcome === "Small loss" ? "result-negative" : "";
    const date = new Date(trade.traded_at || trade.created_at);
    return `<tr>
      <td class="trade-number">#${String(tradeNumbers.get(trade.id) || 0).padStart(3, "0")}</td>
      <td>${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
      <td><strong>${escapeHtml(trade.pair)}</strong></td>
      <td>${escapeHtml(trade.trade_type || "—")}</td>
      <td>${escapeHtml(displaySetup(trade.setup))}</td>
      <td>${escapeHtml(trade.market_condition || "—")}</td>
      <td>${escapeHtml(trade.cb_hour || "—")}</td>
      <td>${displayNumber(trade.mae_30m)}</td>
      <td>${displayNumber(trade.mfe_30m)}</td>
      <td class="${Number(trade.r_multiple) >= 0 ? "result-positive" : "result-negative"}">${displayNumber(trade.r_multiple, "R")}</td>
      <td>${displayNumber(trade.pnl_percent, "%")}</td>
      <td class="${resultClass}">${outcome}</td>
      <td>${escapeHtml(trade.position || "—")}</td>
      <td>${escapeHtml(trade.account || "—")}${isTheoretical(trade) ? "<small class=\"theoretical-account\">Review only</small>" : ""}</td>
      <td>${escapeHtml(trade.trade_day || "—")}</td>
      <td>${escapeHtml(trade.trade_month || "—")}</td>
      <td>${escapeHtml(trade.session_time || "—")}</td>
      <td>${escapeHtml(trade.entry_timeframe || "—")}</td>
      <td>${escapeHtml(trade.wick || "—")}</td>
      <td><div class="trade-actions"><button class="edit-trade" data-trade-id="${trade.id}">Edit</button><button class="delete-trade" data-trade-id="${trade.id}">Delete</button></div></td>
    </tr>`;
  }).join("");
}

async function loadTrades() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const { data, error } = await supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  loadedTrades = data || [];
  applyFilters();
  renderAccountBalances();
}

function buildFilters() {
  const selectOptions = (selector) => Array.from($(selector).options).map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.text)}</option>`).join("");
  const filterBar = document.createElement("section");
  filterBar.className = "detective-filter-bar";
  filterBar.innerHTML = `<div class="filter-heading"><p class="eyebrow blue-text">02 — FILTER INTELLIGENCE</p><small id="filter-result-count">All trades</small></div><div class="filter-controls"><label>Pair <select data-filter="pair"><option value="">All pairs</option>${selectOptions("#detective-pair")}</select></label><label>Setup <select data-filter="setup"><option value="">All setups</option>${selectOptions("#detective-setup")}</select></label><label>CB Hour <select data-filter="cb_hour"><option value="">All CB hours</option>${selectOptions("#detective-cb-hour")}</select></label><label>Session time <select data-filter="session_time"><option value="">All sessions</option>${selectOptions("#detective-session-time")}</select></label><label>Type <select data-filter="trade_type"><option value="">All types</option>${selectOptions("#detective-type")}</select></label><label>Market condition <select data-filter="market_condition"><option value="">All conditions</option>${selectOptions("#detective-market-condition")}</select></label><label>Position <select data-filter="position"><option value="">Long + Short</option>${selectOptions("#detective-position")}</select></label><button type="button" class="clear-filters">Clear filters</button></div>`;
  $(".trade-panel").insertBefore(filterBar, $(".trade-panel .table-wrap"));
  const theoreticalToggle = document.createElement("label");
  theoreticalToggle.className = "theoretical-analysis-toggle";
  theoreticalToggle.innerHTML = '<input type="checkbox" id="filter-include-theoretical" /> Include theoretical trades <small>Detective calculations only</small>';
  filterBar.querySelector(".clear-filters").insertAdjacentElement("beforebegin", theoreticalToggle);
  filterBar.addEventListener("change", (event) => {
    if (event.target.id === "filter-include-theoretical") {
      includeTheoreticalInAnalysis = event.target.checked;
      applyFilters();
      return;
    }
    if (!event.target.matches("[data-filter]")) return;
    activeFilters[event.target.dataset.filter] = event.target.value;
    applyFilters();
  });
  const setupFilter = filterBar.querySelector('[data-filter="setup"]');
  setupFilter.multiple = true;
  setupFilter.style.display = "none";
  const setupFilterMenu = document.createElement("details");
  setupFilterMenu.className = "setup-multi-select";
  setupFilterMenu.style.width = "100%";
  setupFilterMenu.innerHTML = `<summary>All setups</summary><div class="setup-options">${Array.from(setupFilter.options).filter((option) => option.value).map((option, index) => `<label><input type="checkbox" data-filter-setup-index="${index}" value="${escapeHtml(option.value)}" /> ${escapeHtml(option.text)}</label>`).join("")}</div>`;
  setupFilter.insertAdjacentElement("afterend", setupFilterMenu);
  const setupFilterSummary = setupFilterMenu.querySelector("summary");
  const syncSetupFilter = () => {
    const selected = Array.isArray(activeFilters.setup) ? activeFilters.setup : [];
    setupFilterMenu.querySelectorAll("input").forEach((checkbox) => { checkbox.checked = selected.includes(checkbox.value); });
    setupFilterSummary.textContent = selected.length ? selected.join(" + ") : "All setups";
  };
  setupFilterMenu.addEventListener("change", (event) => {
    if (!event.target.matches("[data-filter-setup-index]")) return;
    activeFilters.setup = Array.from(setupFilterMenu.querySelectorAll("input:checked")).map((checkbox) => checkbox.value);
    syncSetupFilter();
    applyFilters();
  });
  filterBar.querySelector(".clear-filters").addEventListener("click", () => {
    activeFilters = {};
    includeTheoreticalInAnalysis = false;
    filterBar.querySelectorAll("select").forEach((select) => { select.value = ""; });
    $("#filter-include-theoretical").checked = false;
    syncSetupFilter();
    applyFilters();
  });
}

function resetTheoreticalAnalysis() {
  if (!includeTheoreticalInAnalysis) return;
  includeTheoreticalInAnalysis = false;
  const toggle = $("#filter-include-theoretical");
  if (toggle) toggle.checked = false;
  applyFilters();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest(".nav-link, .brand, [data-view-target], [data-dashboard-view]");
  const destination = link?.dataset.view || link?.dataset.viewTarget || link?.dataset.dashboardView || (link?.classList.contains("brand") ? "command" : null);
  if (destination && destination !== "detective") resetTheoreticalAnalysis();
}, true);

function clearForm() {
  $("#detective-trade-dialog form").reset();
  $("#detective-outcome").value = "Open";
  $("#detective-followed-plan").value = "yes";
  syncPlanAdherenceUi();
  syncSetupUi();
  currentTradeId = null;
}

function syncPlanAdherenceUi() {
  const followed = $("#detective-followed-plan");
  const wrap = $("#detective-violation-wrap");
  const reason = $("#detective-violation-reason");
  if (!followed || !wrap || !reason) return;
  const violated = followed.value === "no";
  wrap.hidden = !violated;
  reason.required = violated;
  if (!violated) reason.value = "";
}

function ensurePlanAdherenceFields() {
  if ($("#detective-followed-plan")) return;
  const saveButton = $("#save-detective-trade");
  if (!saveButton) return;
  const wrap = document.createElement("div");
  wrap.className = "two-col process-adherence";
  wrap.innerHTML = `<label>Followed plan?<select id="detective-followed-plan"><option value="yes">Yes</option><option value="no">No</option></select></label><label id="detective-violation-wrap" hidden>Rule violation / why?<textarea id="detective-violation-reason" placeholder="Name the rule and what happened."></textarea></label>`;
  saveButton.before(wrap);
  $("#detective-followed-plan")?.addEventListener("change", syncPlanAdherenceUi);
}

function setSelectValue(selector, value) {
  const control = $(selector);
  if (value != null && Array.from(control.options).some((option) => option.value === value)) control.value = value;
}

function editTrade(trade) {
  currentTradeId = trade.id;
  const form = $("#detective-trade-dialog form");
  form.reset();
  $("#detective-pair").value = trade.pair || "";
  setSelectValue("#detective-type", trade.trade_type);
  setSelectValue("#detective-market-condition", trade.market_condition);
  setSelectValue("#detective-cb-hour", trade.cb_hour);
  setSelectValue("#detective-outcome", trade.trade_status === "Open" ? "Open" : resolvedOutcome(trade));
  setSelectValue("#detective-position", trade.position);
  setSelectValue("#detective-account", trade.account);
  setSelectValue("#detective-day", trade.trade_day);
  setSelectValue("#detective-month", trade.trade_month);
  setSelectValue("#detective-session-time", trade.session_time);
  setSelectValue("#detective-entry-tf", trade.entry_timeframe);
  setSelectValue("#detective-wick", trade.wick);
  const selectedSetups = (() => { try { return JSON.parse(trade.setup || "[]"); } catch { return [trade.setup]; } })();
  Array.from($("#detective-setup").options).forEach((option) => { option.selected = selectedSetups.includes(option.value); });
  ["mae", "mfe", "r", "pnl"].forEach((field) => { $("#detective-" + field).value = trade[{ mae: "mae_30m", mfe: "mfe_30m", r: "r_multiple", pnl: "pnl_percent" }[field]] ?? ""; });
  if (trade.traded_at) $("#detective-time").value = new Date(trade.traded_at).toISOString().slice(0, 16);
  $("#detective-followed-plan").value = trade.plan_violation ? "no" : "yes";
  $("#detective-violation-reason").value = trade.violation_type || "";
  syncPlanAdherenceUi();
  syncSetupUi();
  $("#save-detective-trade").textContent = "Update debrief";
  $("#detective-trade-dialog").showModal();
}

async function deleteTrade(id) {
  if (!confirm("Delete this trade log permanently? This cannot be undone.")) return;
  const { error } = await supabase.from("trade_debriefs").delete().eq("id", id);
  if (error) {
    alert(`The trade could not be deleted: ${error.message}`);
    return;
  }
  await loadTrades();
}

async function saveTrade(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("Please sign in before logging a trade.");
    return;
  }
  const payload = {
    pair: $("#detective-pair").value.trim().toUpperCase(),
    setup: JSON.stringify(Array.from($("#detective-setup").selectedOptions).map((option) => option.value)),
    trade_type: $("#detective-type").value.trim() || null,
    market_condition: $("#detective-market-condition").value.trim() || null,
    cb_hour: $("#detective-cb-hour").value.trim() || null,
    r_multiple: numberOrNull($("#detective-r").value),
    pnl_percent: numberOrNull($("#detective-pnl").value),
    outcome: $("#detective-outcome").value === "Open" ? null : $("#detective-outcome").value,
    trade_status: $("#detective-outcome").value === "Open" ? "Open" : "Closed",
    execution_grade: "A",
    mae_30m: numberOrNull($("#detective-mae").value),
    mfe_30m: numberOrNull($("#detective-mfe").value),
    position: $("#detective-position").value.trim() || null,
    account: $("#detective-account").value.trim() || null,
    trade_day: $("#detective-day").value.trim() || null,
    trade_month: $("#detective-month").value.trim() || null,
    session_time: $("#detective-session-time").value.trim() || null,
    entry_timeframe: $("#detective-entry-tf").value.trim() || null,
    wick: $("#detective-wick").value.trim() || null,
    plan_violation: $("#detective-followed-plan").value === "no",
    violation_type: $("#detective-followed-plan").value === "no" ? $("#detective-violation-reason").value.trim() : null,
    traded_at: $("#detective-time").value ? new Date($("#detective-time").value).toISOString() : new Date().toISOString()
  };
  const request = currentTradeId
    ? supabase.from("trade_debriefs").update(payload).eq("id", currentTradeId)
    : supabase.from("trade_debriefs").insert(payload);
  const { error } = await request;
  if (error) {
    alert(`The debrief could not be saved: ${error.message}`);
    return;
  }
  $("#detective-trade-dialog").close();
  clearForm();
  $("#save-detective-trade").textContent = "Save debrief";
  await loadTrades();
}

function init() {
  ensurePlanAdherenceFields();
  const dialog = $("#detective-trade-dialog");
  const account = $("#detective-account");
  if (account && !Array.from(account.options).some((option) => option.value === "Theoretical")) account.insertAdjacentHTML("beforeend", '<option>Theoretical</option>');
  const setup = $("#detective-setup");
  setup.multiple = true;
  setup.style.display = "none";
  const setupMenu = document.createElement("details");
  setupMenu.className = "setup-multi-select";
  setupMenu.innerHTML = `<summary>Choose setup(s)</summary><div class="setup-options">${Array.from(setup.options).map((option, index) => `<label><input type="checkbox" data-setup-index="${index}" /> ${option.text}</label>`).join("")}</div>`;
  setup.insertAdjacentElement("afterend", setupMenu);
  const summary = setupMenu.querySelector("summary");
  const updateSummary = () => {
    const selected = Array.from(setup.selectedOptions).map((option) => option.text);
    summary.textContent = selected.length ? selected.join(" + ") : "Choose setup(s)";
  };
  syncSetupUi = () => {
    setupMenu.querySelectorAll("input").forEach((checkbox) => { checkbox.checked = setup.options[Number(checkbox.dataset.setupIndex)].selected; });
    updateSummary();
  };
  setupMenu.addEventListener("change", (event) => {
    if (!event.target.matches("input[data-setup-index]")) return;
    setup.options[Number(event.target.dataset.setupIndex)].selected = event.target.checked;
    updateSummary();
  });
  syncSetupUi();
  const outcome = $("#detective-outcome");
  outcome.insertAdjacentHTML("afterbegin", '<option value="Open">Open</option>');
  syncPlanAdherenceUi();
  const header = $("#trade-log").closest("table").querySelector("thead tr");
  header.insertAdjacentHTML("afterbegin", "<th>#</th>");
  header.insertAdjacentHTML("beforeend", "<th>ACTION</th>");
  buildFilters();
  const pnlMetric = $("#detective-violations").closest(".metric");
  pnlMetric.querySelector("p").textContent = "TOTAL PNL";
  pnlMetric.querySelector("small").textContent = "Sum across logged trades";
  $("#detective-excursion").closest(".metric").querySelector("p").textContent = "AVG MAE / MFE";
  document.querySelectorAll("[data-detective-tab]").forEach((button) => button.addEventListener("click", () => setDetectiveTab(button.dataset.detectiveTab)));
  $("#account-balance-form")?.addEventListener("submit", saveAccountBalance);
  setDetectiveTab(activeDetectiveTab);
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="add-trade-v2"]')) {
      if (!supabase) {
        alert("Cloud connection is not configured yet.");
        return;
      }
      clearForm();
      $("#save-detective-trade").textContent = "Save debrief";
      dialog.showModal();
    }
    const editButton = event.target.closest(".edit-trade");
    if (editButton) editTrade(loadedTrades.find((trade) => trade.id === editButton.dataset.tradeId));
    const deleteButton = event.target.closest(".delete-trade");
    if (deleteButton) deleteTrade(deleteButton.dataset.tradeId);
    if (event.target.closest("#detective-trade-dialog .dialog-close")) dialog.close();
  });
  dialog.querySelector("form").addEventListener("submit", saveTrade);
  if (supabase) {
    loadTrades();
    loadAccountBalances();
    supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(loadTrades, 50); });
  }
}

init();
