import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const ready = config.supabaseUrl && config.supabaseAnonKey;
const supabase = ready ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let syncSetupUi = () => {};
let currentTradeId = null;
let loadedTrades = [];

function numberOrNull(value) {
  return value === "" || value == null ? null : Number(value);
}

function displayNumber(value, suffix = "") {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function resolvedOutcome(trade) {
  if (trade.trade_status === "Open") return "Open";
  if (trade.outcome) return trade.outcome;
  if (Number(trade.r_multiple) > 0) return "Win";
  if (Number(trade.r_multiple) < 0) return "Loss";
  return "B/E";
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

function renderMetrics(trades) {
  const closedTrades = trades.filter((trade) => trade.trade_status !== "Open");
  const outcomes = closedTrades.map(resolvedOutcome);
  const wins = outcomes.filter((outcome) => outcome === "Win" || outcome === "Small win").length;
  const losses = outcomes.filter((outcome) => outcome === "Loss" || outcome === "Small loss").length;
  const decisiveTrades = wins + losses;
  const average = (items) => items.length ? items.reduce((total, value) => total + Number(value), 0) / items.length : null;
  const averageR = average(closedTrades.filter((trade) => trade.r_multiple != null).map((trade) => trade.r_multiple));
  const averageMae = average(closedTrades.filter((trade) => trade.mae_30m != null).map((trade) => trade.mae_30m));
  const averageMfe = average(closedTrades.filter((trade) => trade.mfe_30m != null).map((trade) => trade.mfe_30m));
  const totalPnl = closedTrades.reduce((total, trade) => total + (Number(trade.pnl_percent) || 0), 0);

  $("#detective-win-rate").textContent = decisiveTrades ? `${Math.round((wins / decisiveTrades) * 100)}%` : "—";
  $("#detective-win-rate-note").textContent = decisiveTrades ? `${wins} win${wins === 1 ? "" : "s"} / ${decisiveTrades} closed trade${decisiveTrades === 1 ? "" : "s"}` : "Log closed trades to calculate";
  $("#detective-average-r").textContent = displayNumber(averageR, "R");
  $("#detective-excursion").textContent = averageMae == null && averageMfe == null ? "—" : `${displayNumber(averageMae)} / ${displayNumber(averageMfe)}`;
  $("#detective-violations").textContent = displayNumber(totalPnl, "%");
}

function renderTrades(trades) {
  const table = $("#trade-log");
  if (!trades.length) {
    table.innerHTML = '<tr class="empty-row"><td colspan="19">No trade debriefs yet. Preserve data; log the next execution.</td></tr>';
    return;
  }

  table.innerHTML = trades.map((trade) => {
    const outcome = resolvedOutcome(trade);
    const resultClass = outcome === "Win" || outcome === "Small win" ? "result-positive" : outcome === "Loss" || outcome === "Small loss" ? "result-negative" : "";
    const date = new Date(trade.traded_at || trade.created_at);
    return `<tr>
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
      <td>${escapeHtml(trade.account || "—")}</td>
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
  renderMetrics(data || []);
  renderTrades(data || []);
  loadedTrades = data || [];
}

function clearForm() {
  $("#detective-trade-dialog form").reset();
  $("#detective-outcome").value = "Open";
  syncSetupUi();
  currentTradeId = null;
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
  const dialog = $("#detective-trade-dialog");
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
  const header = $("#trade-log").closest("table").querySelector("thead tr");
  header.insertAdjacentHTML("beforeend", "<th>ACTION</th>");
  const pnlMetric = $("#detective-violations").closest(".metric");
  pnlMetric.querySelector("p").textContent = "TOTAL PNL";
  pnlMetric.querySelector("small").textContent = "Sum across logged trades";
  $("#detective-excursion").closest(".metric").querySelector("p").textContent = "AVG MAE / MFE";
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
    supabase.auth.onAuthStateChange(() => setTimeout(loadTrades, 50));
  }
}

init();
