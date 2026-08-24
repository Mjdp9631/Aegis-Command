import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const ready = config.supabaseUrl && config.supabaseAnonKey;
const supabase = ready ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
let syncSetupUi = () => {};
let currentTradeId = null;
let editFormSnapshot = null;
let loadedTrades = [];
let activeFilters = {};
let includeTheoreticalInAnalysis = false;
let accountBalances = [];
let accountGroups = [];
let accountMemberships = [];
let groupTradeLinks = [];
let groupTradeAllocations = [];
let tradeAccountExecutions = [];
let groupWithdrawals = [];
let withdrawalAllocations = [];
let accountDeposits = [];
let accountTestTrades = [];
let editingAccountId = null;
let editingGroupId = null;
let activeDetectiveTab = localStorage.getItem("aegis.detective-tab") || "journal";
const PROP_STATUSES = ["pending", "funded"];

function normalizedPropStatus(value) {
  return PROP_STATUSES.includes(value) ? value : "funded";
}

function numberOrNull(value) {
  return value === "" || value == null ? null : Number(value);
}

function displayNumber(value, suffix = "") {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(2).replace(/\.00$/, "")}${suffix}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoFromLocalDateTime(value, fallback = new Date().toISOString()) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return fallback;
  const [, year, month, day, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0).toISOString();
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
  if (Number(trade.pnl_percent) > 0) return "Win";
  if (Number(trade.pnl_percent) < 0) return "Loss";
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

function riskRewardEstimate(trade) {
  const entry = Number(trade?.entry_price);
  const takeProfit = Number(trade?.take_profit_price);
  const stopLoss = Number(trade?.stop_loss_price);
  if (![entry, takeProfit, stopLoss].every((value) => Number.isFinite(value) && value > 0)) return null;

  const position = String(trade?.position || "").trim().toLowerCase();
  const isLongStructure = stopLoss < entry && takeProfit > entry;
  const isShortStructure = stopLoss > entry && takeProfit < entry;
  if ((position === "long" && !isLongStructure) || (position === "short" && !isShortStructure)) return null;

  const riskDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entry);
  if (riskDistance === 0 || rewardDistance === 0) return null;
  return { ratio: rewardDistance / riskDistance, riskDistance, rewardDistance };
}

function syncRiskRewardInput() {
  const input = $("#detective-r");
  if (!input) return null;
  const estimate = riskRewardEstimate({
    position: $("#detective-position")?.value,
    entry_price: $("#detective-entry-price")?.value,
    take_profit_price: $("#detective-take-profit")?.value,
    stop_loss_price: $("#detective-stop-loss")?.value,
  });
  if (!estimate) {
    if (input.dataset.autoRiskReward === "true") {
      input.value = "";
      delete input.dataset.autoRiskReward;
    }
    return null;
  }

  if (input.dataset.autoRiskReward === "true" || !input.value.trim()) {
    input.value = String(Math.round(estimate.ratio * 100) / 100);
    input.dataset.autoRiskReward = "true";
  }
  return estimate;
}

function executionEstimate(trade, lotSize = trade?.lot_size) {
  const entry = Number(trade?.entry_price);
  const takeProfit = Number(trade?.take_profit_price);
  const stopLoss = Number(trade?.stop_loss_price);
  const lots = Number(lotSize);
  if (![entry, lots].every((value) => Number.isFinite(value) && value > 0)) return null;
  const pair = String(trade?.pair || "").toUpperCase().replace(/[^A-Z]/g, "");
  const dollarMove = (exit) => {
    if (!Number.isFinite(exit) || exit <= 0) return null;
    const distance = Math.abs(exit - entry);
    if (pair === "XAUUSD") return distance * 100 * lots;
    if (pair === "USDJPY") return (distance * 100000 * lots) / exit;
    if (pair.endsWith("USD")) return distance * 100000 * lots;
    return null;
  };
  const target = dollarMove(takeProfit);
  const risk = dollarMove(stopLoss);
  if (target == null && risk == null) return { target: null, risk: null, basis: null };
  const basis = pair === "XAUUSD" ? "XAU/USD · 100 oz per standard lot" : pair === "USDJPY" ? "USD/JPY · converted at the exit level" : pair.endsWith("USD") ? "Forex · 100,000 units per standard lot" : null;
  return { target, risk, basis };
}

function tradeExecutionsFor(tradeId) {
  return tradeAccountExecutions.filter((execution) => String(execution.trade_debrief_id) === String(tradeId));
}

function executionAccount(execution) {
  return accountBalances.find((account) => String(account.id) === String(execution.account_id)) || null;
}

function executionAccountName(execution) {
  return executionAccount(execution)?.account_name || "Unknown account";
}

function tradeAccountLabel(trade) {
  const executions = tradeExecutionsFor(trade.id);
  if (!executions.length) return trade.account || "â€”";
  const names = executions.map(executionAccountName);
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

function rawTradeExecutionRows() {
  return Array.from(document.querySelectorAll("[data-trade-execution-row]")).map((row) => ({
    account_id: row.querySelector("[data-trade-execution-account]")?.value || "",
    lot_size: row.querySelector("[data-trade-execution-lot]")?.value || "",
  }));
}

function executionRowsFromForm({ validate = false } = {}) {
  const rawRows = rawTradeExecutionRows();
  const hasIncompleteRow = rawRows.some((row) => !row.account_id || !(Number(row.lot_size) > 0));
  const rows = rawRows
    .filter((row) => row.account_id && Number(row.lot_size) > 0)
    .map((row) => ({ account_id: row.account_id, lot_size: Number(row.lot_size) }));
  const hasDuplicateAccount = new Set(rows.map((row) => row.account_id)).size !== rows.length;
  if (validate && (!rows.length || hasIncompleteRow || hasDuplicateAccount)) {
    return { rows, error: !rows.length ? "Add at least one account execution with a lot size." : hasDuplicateAccount ? "Each account can appear only once per trade." : "Complete or remove every account execution row." };
  }
  return { rows, error: null };
}

function executionRowMarkup(execution = {}) {
  const selected = String(execution.account_id || "");
  const options = accountBalances.length
    ? `<option value="">Choose account</option>${accountBalances.map((account) => `<option value="${escapeHtml(account.id)}" ${String(account.id) === selected ? "selected" : ""}>${escapeHtml(account.account_name)}</option>`).join("")}`
    : '<option value="">Create an account in Accounts first</option>';
  return `<div class="trade-execution-row" data-trade-execution-row><label>Account<select data-trade-execution-account required ${accountBalances.length ? "" : "disabled"}>${options}</select></label><label>Lot size<input data-trade-execution-lot required type="number" min="0" step="any" inputmode="decimal" value="${execution.lot_size ?? ""}" placeholder="e.g. 0.50" /></label><small data-trade-execution-estimate>Enter levels to estimate this account.</small><button class="trade-execution-remove" type="button" data-trade-execution-remove aria-label="Remove account execution">Remove</button></div>`;
}

function renderTradeExecutionRows(rows = []) {
  const host = $("#detective-account-execution-rows");
  if (!host) return;
  host.innerHTML = (rows.length ? rows : [{}]).map(executionRowMarkup).join("");
  syncExecutionEstimate();
}

function refreshTradeExecutionAccountOptions() {
  if (!$("#detective-account-execution-rows")) return;
  renderTradeExecutionRows(rawTradeExecutionRows());
}

function ensureTradeExecutionFields() {
  const form = $("#detective-trade-dialog form");
  const estimate = $("#detective-execution-estimate");
  if (!form || !estimate) return;
  const lotSizeField = $("#detective-lot-size")?.closest("label");
  if (lotSizeField) {
    lotSizeField.closest(".two-col")?.classList.add("single-col");
    lotSizeField.remove();
  }
  const accountField = $("#detective-account")?.closest("label");
  if (accountField) {
    accountField.closest(".two-col")?.classList.add("single-col");
    accountField.remove();
  }
  if (!$("#detective-account-executions")) {
    estimate.insertAdjacentHTML("beforebegin", `<section class="trade-account-executions" id="detective-account-executions"><div class="trade-execution-heading"><div><p>ACCOUNT EXECUTIONS</p><small>Use one row per account. Estimates are calculated per account and combined below.</small></div><button class="secondary compact" type="button" data-trade-execution-add>+ Add account</button></div><div id="detective-account-execution-rows"></div></section>`);
  }
  renderTradeExecutionRows();
}

function combinedExecutionEstimate(trade, rows) {
  const estimates = rows.map((row) => ({ row, estimate: executionEstimate(trade, row.lot_size) })).filter((item) => item.estimate?.basis);
  if (!estimates.length) return null;
  return {
    target: estimates.reduce((total, item) => total + Number(item.estimate.target || 0), 0),
    risk: estimates.reduce((total, item) => total + Number(item.estimate.risk || 0), 0),
    basis: estimates[0].estimate.basis,
    estimates,
  };
}

function estimatedPnlLabel(value, sign) {
  return value == null ? "—" : `${sign}${money(Math.abs(value))}`;
}

function syncExecutionEstimate() {
  const preview = $("#detective-execution-estimate");
  if (!preview) return;
  const riskReward = syncRiskRewardInput();
  const riskRewardLabel = riskReward ? `Planned R:R 1:${riskReward.ratio.toFixed(2)}.` : "";
  const { rows } = executionRowsFromForm();
  const estimate = combinedExecutionEstimate({
    pair: $("#detective-pair")?.value,
    entry_price: $("#detective-entry-price")?.value,
    take_profit_price: $("#detective-take-profit")?.value,
    stop_loss_price: $("#detective-stop-loss")?.value,
  }, rows);
  document.querySelectorAll("[data-trade-execution-row]").forEach((row) => {
    const lotSize = row.querySelector("[data-trade-execution-lot]")?.value;
    const rowEstimate = executionEstimate({
      pair: $("#detective-pair")?.value,
      entry_price: $("#detective-entry-price")?.value,
      take_profit_price: $("#detective-take-profit")?.value,
      stop_loss_price: $("#detective-stop-loss")?.value,
    }, lotSize);
    const rowPreview = row.querySelector("[data-trade-execution-estimate]");
    if (!rowPreview) return;
    rowPreview.textContent = rowEstimate?.basis
      ? `TP ${estimatedPnlLabel(rowEstimate.target, "+")} · SL ${estimatedPnlLabel(rowEstimate.risk, "−")}`
      : "Enter entry, TP, SL, and lot size to estimate this account.";
  });
  if (!estimate) {
    preview.textContent = riskRewardLabel
      ? `${riskRewardLabel} Add an account execution and lot size to estimate gross P&L.`
      : "Enter entry, take profit, and stop loss to calculate R:R. Add account executions to estimate gross P&L.";
    return;
  }
  if (!estimate.basis) {
    preview.textContent = `${riskRewardLabel ? `${riskRewardLabel} ` : ""}Estimate unavailable for this pair. The saved levels will still appear in the trade detail.`;
    return;
  }
  const parts = [];
  if (estimate.target != null) parts.push(`TP ${estimatedPnlLabel(estimate.target, "+")}`);
  if (estimate.risk != null) parts.push(`SL ${estimatedPnlLabel(estimate.risk, "−")}`);
  preview.textContent = `${riskRewardLabel ? `${riskRewardLabel} ` : ""}Combined estimated gross P&L across ${estimate.estimates.length} account${estimate.estimates.length === 1 ? "" : "s"}: ${parts.join(" · ")} · ${estimate.basis}. Excludes spread and commission.`;
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function localDateTimeInput(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function membershipAt(accountId, timestamp) {
  const time = new Date(timestamp || 0).getTime();
  return accountMemberships
    .filter((membership) => membership.account_id === accountId && new Date(membership.joined_at).getTime() <= time && (!membership.left_at || new Date(membership.left_at).getTime() > time))
    .sort((left, right) => new Date(right.joined_at) - new Date(left.joined_at))[0] || null;
}

function currentMembership(accountId) {
  return accountMemberships.find((membership) => membership.account_id === accountId && !membership.left_at) || null;
}

function accountDepositTotal(accountId) {
  return accountDeposits
    .filter((deposit) => deposit.account_id === accountId)
    .reduce((total, deposit) => total + Number(deposit.amount_usd || 0), 0);
}

function accountWithdrawalTotal(accountId) {
  return withdrawalAllocations
    .filter((allocation) => allocation.account_id === accountId)
    .reduce((total, allocation) => total + Number(allocation.gross_deduction_usd || 0), 0);
}

function groupForAccountAt(accountId, timestamp) {
  const membership = membershipAt(accountId, timestamp);
  return membership ? accountGroups.find((group) => group.id === membership.group_id) || null : null;
}

function accountGroupAccounts(groupId) {
  return accountBalances.filter((account) => currentMembership(account.id)?.group_id === groupId);
}

function groupLinksForAccount(accountId) {
  return groupTradeLinks.filter((link) => {
    // A group link is an allocation made now, so historical journal dates must
    // not prevent an account from receiving its share of the linked PnL.
    return membershipAt(accountId, link.created_at || new Date().toISOString())?.group_id === link.group_id;
  });
}

function accountTrades(accountName) {
  return loadedTrades
    .filter((trade) => !isTheoretical(trade) && String(trade.account || "").trim() === accountName && resolvedOutcome(trade) !== "Open")
    .sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at));
}

function calculatedBalance(account) {
  let balance = accountTrades(account.account_name).reduce(
    (balance, trade) => balance * (1 + (Number(trade.pnl_percent) || 0) / 100),
    Number(account.starting_balance)
  );
  balance += accountTestTrades
    .filter((trade) => trade.account_id === account.id)
    .reduce((total, trade) => total + Number(trade.pnl_usd || 0), 0);
  balance += groupTradePnlForAccount(account.id);
  balance += accountDepositTotal(account.id);
  balance -= accountWithdrawalTotal(account.id);
  return cents(balance);
}

function accountProfit(account) {
  return cents(calculatedBalance(account) - Number(account.starting_balance || 0) - accountDepositTotal(account.id) + accountWithdrawalTotal(account.id));
}

function updateAccountSelect() {
  const control = $("#detective-account");
  if (!control || !accountBalances.length) return;
  const selected = control.value;
  const names = [...new Set([...Array.from(control.options).map((option) => option.value), ...accountBalances.map((account) => account.account_name)])];
  control.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (names.includes(selected)) control.value = selected;
}

function renderAccountAdminControls() {
  const host = $("#account-ledger-controls");
  const accountForm = $("#account-balance-form");
  if (!host || !accountForm) return;
  if (!host.querySelector("#account-group-form")) host.innerHTML = `<form id="account-group-form" class="account-group-form"><div class="account-form-heading"><p class="eyebrow amber">CREATE GROUP</p><small>Separate live, prop-firm, and theoretical accounting.</small></div><label>Group name <input id="account-group-name" required maxlength="80" placeholder="e.g. Prop Group 1" /></label><label>Type <select id="account-group-type"><option>Live</option><option>Prop Firm</option><option>Theoretical</option></select></label><label id="account-group-split-wrap">Payout split (%) <input id="account-group-split" type="number" min="0" max="100" step="0.01" placeholder="e.g. 80" /></label><label id="account-group-status-wrap">Prop status <select id="account-group-status"><option value="pending">Pending</option><option value="funded">Funded</option></select></label><button class="primary compact" type="submit">Create group</button></form>`;
  accountForm.classList.remove("account-balance-form");
  accountForm.classList.add("account-group-account-form");
  const typeField = $("#account-balance-type") || document.createElement("label");
  if (!$("#account-balance-type")) {
    typeField.innerHTML = 'Type <select id="account-balance-type"><option>Live</option><option>Prop Firm</option><option>Theoretical</option></select>';
    accountForm.insertBefore(typeField, accountForm.querySelector(".account-primary") || accountForm.querySelector("button"));
  }
  if (!$("#account-balance-group")) {
    const groupField = document.createElement("label");
    groupField.innerHTML = 'Group <select id="account-balance-group"><option value="">No group</option></select>';
    accountForm.insertBefore(groupField, accountForm.querySelector(".account-primary") || accountForm.querySelector("button"));
  }
  if (!$("#account-deposit-wrap")) {
    const depositField = document.createElement("label");
    depositField.id = "account-deposit-wrap";
    depositField.innerHTML = 'Deposit funds <span class="field-optional">optional · does not count as profit</span><input id="account-deposit-amount" type="number" min="0.01" step="0.01" placeholder="e.g. 500.00" disabled />';
    accountForm.insertBefore(depositField, accountForm.querySelector(".account-primary") || accountForm.querySelector("button"));
  }
  $("#account-balance-type").onchange = syncGroupOptionsForAccountType;
  host.querySelector("#account-group-type").onchange = syncGroupSplitVisibility;
  syncGroupOptionsForAccountType();
  syncGroupSplitVisibility();
}

function syncDepositVisibility() {
  const wrap = $("#account-deposit-wrap");
  const input = $("#account-deposit-amount");
  if (!wrap || !input) return;
  const account = editingAccountId ? accountBalances.find((item) => item.id === editingAccountId) : null;
  const visible = Boolean(editingAccountId && (account?.account_type || $("#account-balance-type")?.value) === "Live");
  wrap.hidden = !visible;
  input.disabled = !visible;
  input.required = false;
}

function syncGroupSplitVisibility() {
  const type = $("#account-group-type")?.value;
  const wrap = $("#account-group-split-wrap");
  if (!wrap) return;
  const input = $("#account-group-split");
  wrap.hidden = type !== "Prop Firm";
  input.disabled = type !== "Prop Firm";
  input.required = type === "Prop Firm";
  const statusWrap = $("#account-group-status-wrap");
  const status = $("#account-group-status");
  if (statusWrap) statusWrap.hidden = type !== "Prop Firm";
  if (status) status.disabled = type !== "Prop Firm";
}

function syncGroupOptionsForAccountType() {
  const select = $("#account-balance-group");
  const type = $("#account-balance-type")?.value;
  if (!select) { syncDepositVisibility(); return; }
  const selected = select.value;
  select.innerHTML = '<option value="">No group</option>' + accountGroups.filter((group) => group.account_type === type).map((group) => `<option value="${group.id}">${escapeHtml(group.name)} · ${escapeHtml(group.account_type)}</option>`).join("");
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  syncDepositVisibility();
}

function tradeNumberFor(tradeId) {
  return [...loadedTrades].sort((a, b) => tradeTime(a) - tradeTime(b)).findIndex((trade) => trade.id === tradeId) + 1;
}

function closedTradesAvailableForGroup(groupId) {
  // Trade links are allocations, not ownership. A journal trade can belong
  // to several account groups, but only once within each individual group.
  const linkedToThisGroup = new Set(groupTradeLinks
    .filter((link) => String(link.group_id) === String(groupId))
    .map((link) => String(link.trade_id)));
  return loadedTrades.filter((trade) => !isTheoretical(trade)
    && resolvedOutcome(trade) !== "Open"
    && !linkedToThisGroup.has(String(trade.id)));
}

function groupTradePnlForAccount(accountId) {
  return groupLinksForAccount(accountId).reduce((total, link) => {
    const allocations = groupTradeAllocations.filter((allocation) => String(allocation.group_trade_link_id) === String(link.id));
    if (!allocations.length) return total + Number(link.actual_pnl_usd || 0);
    const allocation = allocations.find((item) => String(item.account_id) === String(accountId));
    return total + Number(allocation?.pnl_usd || 0);
  }, 0);
}

function tradeAllocationsForLink(linkId) {
  return groupTradeAllocations.filter((allocation) => String(allocation.group_trade_link_id) === String(linkId));
}

function groupWithdrawalLedger(group) {
  return groupWithdrawals.filter((withdrawal) => withdrawal.group_id === group.id).sort((a, b) => new Date(b.withdrawn_at) - new Date(a.withdrawn_at));
}

function withdrawalIsEligible(withdrawal) {
  const group = accountGroups.find((item) => item.id === withdrawal.group_id);
  return group?.account_type === "Theoretical"
    ? withdrawal.include_in_total_earned === true
    : withdrawal.include_in_total_earned !== false;
}

function earnedForAccountType(accountType) {
  return cents(groupWithdrawals.reduce((total, withdrawal) => {
    const group = accountGroups.find((item) => item.id === withdrawal.group_id);
    return withdrawalIsEligible(withdrawal) && group?.account_type === accountType
      ? total + Number(withdrawal.payout_total_usd || 0)
      : total;
  }, 0));
}

function totalEarned() {
  return cents(groupWithdrawals.reduce((total, withdrawal) => (
    total + (withdrawalIsEligible(withdrawal) ? Number(withdrawal.payout_total_usd || 0) : 0)
  ), 0));
}

function renderEarnedSummary() {
  const summary = $("#account-earned-summary");
  if (!summary) return;
  summary.querySelector("[data-account-live-earned]").textContent = money(earnedForAccountType("Live"));
  summary.querySelector("[data-account-funded-earned]").textContent = money(earnedForAccountType("Prop Firm"));
  summary.querySelector("[data-account-total-earned]").textContent = money(totalEarned());
}

function renderBalanceSummary() {
  const summary = $("#account-balance-summary");
  if (!summary) return;
  const liveTotal = accountBalances
    .filter((account) => (account.account_type || "Live") === "Live")
    .reduce((total, account) => total + calculatedBalance(account), 0);
  const fundedTotal = accountBalances
    .filter((account) => (account.account_type || "Live") === "Prop Firm")
    .filter((account) => {
      const membership = currentMembership(account.id);
      const group = membership ? accountGroups.find((item) => item.id === membership.group_id) : null;
      return group && normalizedPropStatus(group.prop_status) === "funded";
    })
    .reduce((total, account) => total + calculatedBalance(account), 0);
  const liveProfit = accountBalances
    .filter((account) => (account.account_type || "Live") === "Live")
    .reduce((total, account) => total + accountProfit(account), 0);
  const fundedProfit = accountBalances
    .filter((account) => (account.account_type || "Live") === "Prop Firm")
    .filter((account) => {
      const membership = currentMembership(account.id);
      const group = membership ? accountGroups.find((item) => item.id === membership.group_id) : null;
      return group && normalizedPropStatus(group.prop_status) === "funded";
    })
    .reduce((total, account) => total + accountProfit(account), 0);
  summary.querySelector("[data-account-live-total]").textContent = money(liveTotal);
  summary.querySelector("[data-account-funded-total]").textContent = money(fundedTotal);
  summary.querySelector("[data-account-live-profit]").textContent = money(liveProfit);
  summary.querySelector("[data-account-funded-profit]").textContent = money(fundedProfit);
}

let accountCalendarMonth = null;
let accountCalendarScope = localStorage.getItem("aegis.account-calendar-scope") || "all";

function accountCalendarDateKey(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function accountDollarLabel(value) {
  const amount = cents(value);
  return `${amount > 0 ? "+" : amount < 0 ? "-" : ""}${money(Math.abs(amount))}`;
}

function accountCalendarEvents() {
  const linkedTradeIds = new Set(groupTradeLinks.map((link) => String(link.trade_id)));
  const withdrawalsById = new Map(groupWithdrawals.map((withdrawal) => [String(withdrawal.id), withdrawal]));
  const events = [];

  accountBalances.forEach((account) => {
    const entries = [
      ...accountDeposits.filter((deposit) => String(deposit.account_id) === String(account.id)).map((deposit) => ({ type: "deposit", at: deposit.deposited_at || deposit.created_at, amount: Number(deposit.amount_usd || 0) })),
      ...withdrawalAllocations.filter((allocation) => String(allocation.account_id) === String(account.id)).map((allocation) => {
        const withdrawal = withdrawalsById.get(String(allocation.withdrawal_id));
        return { type: "withdrawal", at: withdrawal?.withdrawn_at || allocation.created_at, amount: Number(allocation.gross_deduction_usd || 0), groupId: withdrawal?.group_id || null };
      }),
      ...groupTradeAllocations.filter((allocation) => String(allocation.account_id) === String(account.id)).map((allocation) => {
        const link = groupTradeLinks.find((item) => String(item.id) === String(allocation.group_trade_link_id));
        const trade = loadedTrades.find((item) => String(item.id) === String(link?.trade_id));
        return { type: "pnl", at: trade?.traded_at || trade?.created_at || link?.created_at, amount: Number(allocation.pnl_usd || 0), groupId: link?.group_id || null };
      }),
      ...accountTestTrades.filter((trade) => String(trade.account_id) === String(account.id)).map((trade) => ({ type: "pnl", at: trade.traded_at || trade.created_at, amount: Number(trade.pnl_usd || 0), groupId: groupForAccountAt(account.id, trade.traded_at || trade.created_at)?.id || null })),
      ...accountTrades(account.account_name).filter((trade) => !linkedTradeIds.has(String(trade.id))).map((trade) => ({ type: "percent", at: trade.traded_at || trade.created_at, percent: Number(trade.pnl_percent || 0), groupId: groupForAccountAt(account.id, trade.traded_at || trade.created_at)?.id || null })),
    ].filter((entry) => entry.at && !Number.isNaN(new Date(entry.at).getTime()))
      .sort((left, right) => new Date(left.at) - new Date(right.at));

    let balance = Number(account.starting_balance || 0);
    entries.forEach((entry) => {
      if (entry.type === "deposit") {
        balance += entry.amount;
        return;
      }
      if (entry.type === "withdrawal") {
        balance -= entry.amount;
        events.push({ type: "withdrawal", accountId: account.id, groupId: entry.groupId, at: entry.at, amount: entry.amount });
        return;
      }
      const amount = entry.type === "percent" ? cents(balance * entry.percent / 100) : cents(entry.amount);
      balance += amount;
      events.push({ type: "pnl", accountId: account.id, groupId: entry.groupId, at: entry.at, amount });
    });
  });
  return events;
}

function accountCalendarInScope(event) {
  if (accountCalendarScope === "all") return true;
  const [kind, id] = accountCalendarScope.split(":");
  return kind === "account" ? String(event.accountId) === id : kind === "group" && String(event.groupId) === id;
}

function renderAccountCalendar() {
  const root = $("#account-calendar");
  if (!root) return;
  if (!accountCalendarMonth) {
    const today = new Date();
    accountCalendarMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12));
  }
  const scopeOptions = [
    '<option value="all">All accounts</option>',
    ...accountGroups.map((group) => `<option value="group:${group.id}">Group · ${escapeHtml(group.name)}</option>`),
    ...accountBalances.map((account) => `<option value="account:${account.id}">Account · ${escapeHtml(account.account_name)}</option>`),
  ].join("");
  if (!accountCalendarScope || !scopeOptions.includes(`value="${accountCalendarScope}"`)) accountCalendarScope = "all";
  const year = accountCalendarMonth.getUTCFullYear();
  const month = accountCalendarMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 12));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12));
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const grouped = new Map();
  accountCalendarEvents().filter(accountCalendarInScope).forEach((event) => {
    const key = accountCalendarDateKey(event.at);
    if (!key.startsWith(monthKey)) return;
    const day = grouped.get(key) || { pnl: 0, withdrawals: 0, count: 0 };
    if (event.type === "withdrawal") day.withdrawals += event.amount;
    else { day.pnl += event.amount; day.count += 1; }
    grouped.set(key, day);
  });
  const daysInGrid = Math.ceil((firstDay.getUTCDay() + monthEnd.getUTCDate()) / 7) * 7;
  const calendarDays = Array.from({ length: daysInGrid }, (_, index) => {
    const day = index - firstDay.getUTCDay() + 1;
    if (day < 1 || day > monthEnd.getUTCDate()) return '<div class="account-calendar-day empty" aria-hidden="true"></div>';
    const data = grouped.get(`${monthKey}-${String(day).padStart(2, "0")}`);
    const tone = data?.pnl > 0 ? "positive" : data?.pnl < 0 ? "negative" : data?.count ? "flat" : "";
    return `<article class="account-calendar-day ${tone}"><span>${day}</span>${data?.count ? `<strong>${accountDollarLabel(data.pnl)}</strong><small>${data.count} PnL event${data.count === 1 ? "" : "s"}</small>` : ""}${data?.withdrawals ? `<em>Withdrawal ${money(data.withdrawals)}</em>` : ""}</article>`;
  }).join("");
  const weekCount = daysInGrid / 7;
  const weekTotals = Array.from({ length: weekCount }, (_, week) => {
    const totals = Array.from({ length: 7 }, (_, offset) => {
      const day = week * 7 + offset - firstDay.getUTCDay() + 1;
      return day < 1 || day > monthEnd.getUTCDate() ? null : grouped.get(`${monthKey}-${String(day).padStart(2, "0")}`) || null;
    }).filter(Boolean).reduce((total, day) => ({ pnl: total.pnl + day.pnl, withdrawals: total.withdrawals + day.withdrawals, count: total.count + day.count }), { pnl: 0, withdrawals: 0, count: 0 });
    const tone = totals.pnl > 0 ? "positive" : totals.pnl < 0 ? "negative" : "";
    return `<article class="account-week-total ${tone}"><span>WEEK TOTAL</span><strong>${accountDollarLabel(totals.pnl)}</strong><small>${totals.count} PnL event${totals.count === 1 ? "" : "s"}</small>${totals.withdrawals ? `<em>Withdrawal ${money(totals.withdrawals)}</em>` : ""}</article>`;
  }).join("");
  const monthTotals = [...grouped.values()].reduce((total, day) => ({ pnl: total.pnl + day.pnl, withdrawals: total.withdrawals + day.withdrawals, count: total.count + day.count }), { pnl: 0, withdrawals: 0, count: 0 });
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  root.innerHTML = `<div class="account-calendar-head"><div><p class="eyebrow amber">ACCOUNT CASH CALENDAR</p><h3>${monthName}</h3></div><div class="account-calendar-controls"><select data-account-calendar-scope aria-label="Account calendar scope">${scopeOptions}</select><button type="button" data-account-calendar="previous" aria-label="Previous month">‹</button><button type="button" data-account-calendar="current">This month</button><button type="button" data-account-calendar="next" aria-label="Next month">›</button></div></div><div class="account-calendar-stats"><b class="${monthTotals.pnl > 0 ? "result-positive" : monthTotals.pnl < 0 ? "result-negative" : ""}">${accountDollarLabel(monthTotals.pnl)} realized PnL</b><span>${monthTotals.count} PnL event${monthTotals.count === 1 ? "" : "s"}</span>${monthTotals.withdrawals ? `<em>${money(monthTotals.withdrawals)} withdrawn</em>` : ""}<small>Withdrawals are cash flow, not trading PnL.</small></div><div class="account-calendar-body"><div class="account-calendar-main"><div class="account-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="account-calendar-grid">${calendarDays}</div></div><aside class="account-week-totals" style="--account-week-count:${weekCount}"><span class="account-week-total-head">WEEKLY</span>${weekTotals}</aside></div>`;
  root.querySelector("[data-account-calendar-scope]").value = accountCalendarScope;
}

function renderTheoreticalTradeControls() {
  const list = $("#account-balance-list");
  if (!list) return;
  let panel = $("#theoretical-account-controls");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "theoretical-account-controls";
    panel.className = "theoretical-account-controls";
    list.before(panel);
  }
  const accounts = accountBalances.filter((account) => account.account_type === "Theoretical");
  panel.innerHTML = accounts.length ? `<p class="account-group-kicker">THEORETICAL STRATEGY TESTING</p>${accounts.map((account) => {
    const trades = accountTestTrades.filter((trade) => trade.account_id === account.id).sort((a, b) => new Date(b.traded_at) - new Date(a.traded_at));
    const rows = trades.length ? trades.map((trade) => `<div class="theoretical-trade-row"><span>${escapeHtml(trade.strategy || "Unlabeled test")} · ${new Date(trade.traded_at).toLocaleDateString()}</span><b class="${Number(trade.pnl_usd) >= 0 ? "result-positive" : "result-negative"}">${Number(trade.pnl_usd) >= 0 ? "+" : ""}${money(trade.pnl_usd)}</b><button type="button" class="account-action danger" data-theoretical-trade-delete="${trade.id}">Delete</button></div>`).join("") : '<p class="ledger-empty">No strategy tests recorded yet.</p>';
    return `<article class="theoretical-account-card"><div class="account-group-header"><div><p class="account-group-kicker">${escapeHtml(account.account_name)}</p><h4>Testing PnL</h4></div><strong>${money(accountTestTrades.filter((trade) => trade.account_id === account.id).reduce((sum, trade) => sum + Number(trade.pnl_usd || 0), 0))}</strong></div><form class="theoretical-trade-form" data-theoretical-trade-form="${account.id}"><label>Strategy / test<input name="strategy" maxlength="80" placeholder="e.g. London sweep" /></label><label>Trade date<input name="traded_at" type="date" required value="${localDateTimeInput().slice(0, 10)}" /></label><label>Win / loss amount<input name="pnl_usd" type="number" step="0.01" required placeholder="250 or -125" /></label><label>Note<input name="note" maxlength="240" placeholder="Optional" /></label><button class="primary compact" type="submit">Add test trade</button></form><div class="theoretical-trade-ledger">${rows}</div></article>`;
  }).join("")}` : "";
}

function decorateTheoreticalWithdrawalForms() {
  document.querySelectorAll("[data-group-withdrawal-form]").forEach((form) => {
    const group = accountGroups.find((item) => item.id === form.dataset.groupWithdrawalForm);
    if (!group || group.account_type !== "Theoretical" || form.querySelector("[data-withdrawal-include]")) return;
    form.insertAdjacentHTML("beforeend", `<label class="withdrawal-earned-toggle"><input type="checkbox" data-withdrawal-include="${group.id}" /> Include in Total Earned</label>`);
    const preview = form.querySelector(`[data-withdrawal-preview="${group.id}"]`);
    if (preview) preview.textContent = "Excluded from Total Earned unless you check the box.";
  });
}

function decoratePropStatusControls() {
  document.querySelectorAll(".account-group-card[data-group-id]").forEach((card) => {
    const group = accountGroups.find((item) => item.id === card.dataset.groupId);
    const header = card.querySelector(".account-group-header");
    if (!group || group.account_type !== "Prop Firm" || !header || header.querySelector("[data-group-status]")) return;
    const details = document.createElement("details");
    details.className = "account-group-status-details";
    details.innerHTML = `<summary>Account stage</summary><select data-group-status="${group.id}" aria-label="Prop firm account stage"><option value="pending">Pending</option><option value="funded">Funded</option></select>`;
    details.querySelector("select").value = normalizedPropStatus(group.prop_status);
    header.querySelector(".account-group-total")?.before(details);
  });
}

function decorateGroupAdminControls() {
  document.querySelectorAll(".account-group-card[data-group-id]").forEach((card) => {
    const header = card.querySelector(".account-group-header");
    if (!header || header.querySelector("[data-group-edit]")) return;
    header.insertAdjacentHTML("beforeend", `<span class="account-actions group-admin-actions"><button type="button" class="account-action" data-group-edit="${card.dataset.groupId}">Edit</button><button type="button" class="account-action danger" data-group-delete="${card.dataset.groupId}">Delete</button></span>`);
  });
}

function groupAllocationInputs(groupId, type) {
  const members = accountGroupAccounts(groupId);
  const attribute = type === "trade" ? "data-group-trade-allocation" : "data-withdrawal-allocation";
  const label = type === "trade" ? "Exact PnL" : "Gross withdrawal";
  const placeholder = type === "trade" ? "e.g. 1000 or -500" : "e.g. 1000";
  return `<div class="group-allocation-grid"><p>${label} by account</p>${members.map((account) => `<label><span>${escapeHtml(account.account_name)} · starts ${money(account.starting_balance)}</span><input ${attribute}="${groupId}" data-account-id="${account.id}" type="number" min="${type === "withdrawal" ? "0" : ""}" step="0.01" required placeholder="${placeholder}" /></label>`).join("")}</div>`;
}

function formAllocations(form, selector, { allowZero = true, allowNegative = false } = {}) {
  const inputs = [...form.querySelectorAll(selector)];
  const allocations = [];
  for (const input of inputs) {
    const raw = String(input.value || "").trim();
    const value = numberOrNull(raw);
    if (raw === "" || value == null || !Number.isFinite(value) || (!allowNegative && value < 0) || (!allowZero && value === 0)) return null;
    if (value !== 0) allocations.push({ accountId: input.dataset.accountId, amount: cents(value) });
  }
  return allocations;
}

function decorateGroupAllocationForms() {
  document.querySelectorAll("[data-group-trade-form]").forEach((form) => {
    const group = accountGroups.find((item) => String(item.id) === String(form.dataset.groupTradeForm));
    if (!group) return;
    const selected = form.querySelector(`[data-group-trade-select="${group.id}"]`)?.value || "";
    const options = closedTradesAvailableForGroup(group.id).map((trade) => `<option value="${trade.id}">#${String(tradeNumberFor(trade.id)).padStart(3, "0")} · ${escapeHtml(trade.pair)} · ${escapeHtml(resolvedOutcome(trade))}</option>`).join("");
    form.innerHTML = `<label>Attach journal trade <select data-group-trade-select="${group.id}"><option value="">Choose a closed trade</option>${options}</select></label>${groupAllocationInputs(group.id, "trade")}<button class="primary compact" type="submit">Add trade allocations</button>`;
    const select = form.querySelector(`[data-group-trade-select="${group.id}"]`);
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  });
  document.querySelectorAll("[data-group-withdrawal-form]").forEach((form) => {
    const group = accountGroups.find((item) => String(item.id) === String(form.dataset.groupWithdrawalForm));
    if (!group) return;
    form.innerHTML = `${groupAllocationInputs(group.id, "withdrawal")}<label>Withdrawal date <input data-withdrawal-date="${group.id}" type="datetime-local" value="${localDateTimeInput()}" required /></label><label>Note <input data-withdrawal-note="${group.id}" maxlength="240" placeholder="Optional" /></label><button class="primary compact" type="submit">Record withdrawal allocations</button><small class="withdrawal-preview" data-withdrawal-preview="${group.id}">Enter each account’s deduction to calculate the group total and net payout.</small>`;
  });
}

function decorateGroupTradeAllocations() {
  document.querySelectorAll("[data-group-trade-unlink]").forEach((button) => {
    const link = groupTradeLinks.find((item) => String(item.id) === String(button.dataset.groupTradeUnlink));
    const allocations = link ? tradeAllocationsForLink(link.id) : [];
    if (!link || !allocations.length) return;
    const row = button.closest(".group-account-row");
    const total = Number(link.actual_pnl_usd || 0);
    const amount = row?.querySelector("b");
    if (amount) amount.textContent = `${total > 0 ? "+" : ""}${money(total)} total`;
    const breakdown = document.createElement("small");
    breakdown.className = "group-allocation-breakdown";
    breakdown.textContent = allocations.map((allocation) => {
      const account = accountBalances.find((item) => String(item.id) === String(allocation.account_id));
      const pnl = Number(allocation.pnl_usd || 0);
      return `${account?.account_name || "Account"}: ${pnl > 0 ? "+" : ""}${money(pnl)}`;
    }).join(" · ");
    row?.append(breakdown);
  });
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

function renderGroupedAccountBalances() {
  const list = $("#account-balance-list");
  if (!list) return;
  renderAccountAdminControls();
  renderEarnedSummary();
  renderBalanceSummary();
  renderAccountCalendar();
  renderTheoreticalTradeControls();
  setTimeout(decorateGroupAllocationForms, 0);
  setTimeout(decorateGroupTradeAllocations, 0);
  setTimeout(decorateTheoreticalWithdrawalForms, 0);
  setTimeout(decoratePropStatusControls, 0);
  setTimeout(decorateGroupAdminControls, 0);
  const groups = accountGroups.map((group) => {
    const members = accountGroupAccounts(group.id);
    const total = members.reduce((sum, account) => sum + calculatedBalance(account), 0);
    const withdrawals = groupWithdrawalLedger(group);
    const links = groupTradeLinks
      .filter((link) => link.group_id === group.id)
      .sort((a, b) => tradeTime(loadedTrades.find((trade) => trade.id === b.trade_id) || {}) - tradeTime(loadedTrades.find((trade) => trade.id === a.trade_id) || {}));
    const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
    const tradeOptions = closedTradesAvailableForGroup(group.id).map((trade) => `<option value="${trade.id}">#${String(tradeNumberFor(trade.id)).padStart(3, "0")} · ${escapeHtml(trade.pair)} · ${escapeHtml(resolvedOutcome(trade))}</option>`).join("");
    const ledger = withdrawals.length ? withdrawals.map((withdrawal) => `<div class="withdrawal-ledger-row"><div><strong>${new Date(withdrawal.withdrawn_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong><small>${withdrawal.account_count} account${withdrawal.account_count === 1 ? "" : "s"} · ${Number(withdrawal.profit_split_percent).toFixed(2).replace(/\.00$/, "")}% payout${withdrawal.note ? ` · ${escapeHtml(withdrawal.note)}` : ""}</small></div><span><b>-${money(withdrawal.gross_total_usd)}</b><em>tracked ${money(withdrawal.payout_total_usd)}</em></span></div>`).join("") : '<p class="ledger-empty">No withdrawals recorded for this group.</p>';
    const memberRows = members.length ? members.map((account) => `<div class="group-account-row"><span>${escapeHtml(account.account_name)}${account.is_primary ? " · PRIMARY" : ""}</span><select data-account-move="${account.id}" aria-label="Move ${escapeHtml(account.account_name)}"><option value="${group.id}">${escapeHtml(group.name)}</option>${accountGroups.filter((candidate) => candidate.id !== group.id && candidate.account_type === account.account_type).map((candidate) => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`).join("")}</select><b>${money(calculatedBalance(account))}</b><span class="account-actions"><button type="button" class="account-action" data-account-edit="${account.id}">Edit</button><button type="button" class="account-action danger" data-account-delete="${account.id}">Delete</button></span></div>`).join("") : '<p class="ledger-empty">Add a matching account to activate this group.</p>';
    const linkRows = links.length ? links.map((link) => { const trade = loadedTrades.find((item) => item.id === link.trade_id); const pnl = Number(link.actual_pnl_usd || 0); return `<div class="group-account-row"><span>#${String(tradeNumberFor(link.trade_id)).padStart(3, "0")} · ${escapeHtml(trade?.pair || "Trade")} · ${escapeHtml(resolvedOutcome(trade || {}))}</span><b class="${pnl > 0 ? "result-positive" : pnl < 0 ? "result-negative" : ""}">${pnl > 0 ? "+" : ""}${money(pnl)} / acct</b><button type="button" class="account-action danger" data-group-trade-unlink="${link.id}" title="Remove this trade from the group without deleting the journal trade">Unlink</button></div>`; }).join("") : '<p class="ledger-empty">No group trades attached yet.</p>';
    return `<article class="account-group-card" data-group-id="${group.id}"><div class="account-group-header"><div><p class="account-group-kicker">${escapeHtml(group.account_type)} GROUP</p><h4>${escapeHtml(group.name)}</h4><small>${members.length} account${members.length === 1 ? "" : "s"} · ${group.account_type === "Prop Firm" ? `${split}% payout` : "100% payout"}</small></div><div class="account-group-total"><span>GROUP BALANCE</span><strong>${money(total)}</strong></div></div><div class="group-accounts">${memberRows}</div><form class="group-trade-form" data-group-trade-form="${group.id}"><label>Attach journal trade <select data-group-trade-select="${group.id}"><option value="">Choose a closed trade</option>${tradeOptions}</select></label><label>Exact PnL / account <input data-group-trade-pnl="${group.id}" type="number" step="0.01" placeholder="e.g. 250.00" /></label><button class="primary compact" type="submit">Add trade</button></form><details class="group-withdrawal-details"><summary>Record / view withdrawals <span>${withdrawals.length} record${withdrawals.length === 1 ? "" : "s"}</span></summary><form class="group-withdrawal-form" data-group-withdrawal-form="${group.id}"><label>Gross withdrawal / account <input data-withdrawal-gross="${group.id}" type="number" min="0.01" step="0.01" required placeholder="1000.00" /></label><label>Withdrawal date <input data-withdrawal-date="${group.id}" type="datetime-local" value="${localDateTimeInput()}" required /></label><label>Note <input data-withdrawal-note="${group.id}" maxlength="240" placeholder="Optional" /></label><button class="primary compact" type="submit">Record withdrawal</button><small class="withdrawal-preview" data-withdrawal-preview="${group.id}">Gross deduction and net payout will calculate from the group split.</small></form><div class="withdrawal-ledger">${ledger}</div></details><details class="group-trade-details"><summary>Linked journal trades <span>${links.length} trade${links.length === 1 ? "" : "s"}</span></summary><div class="withdrawal-ledger">${linkRows}</div></details></article>`;
  }).join("");
  const ungrouped = accountBalances.filter((account) => !currentMembership(account.id)).map((account) => { const current = calculatedBalance(account); const delta = current - Number(account.starting_balance); const tradeCount = accountTrades(account.account_name).length; const options = accountGroups.filter((group) => group.account_type === account.account_type).map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join(""); return `<article class="account-balance-card"><div><p>${escapeHtml(account.account_name)} ${account.is_primary ? '<span>COMMAND CENTER</span>' : ""}</p><strong>${money(current)}</strong><small>${escapeHtml(account.account_type || "Live")} · Started at ${money(account.starting_balance)} · ${tradeCount} closed trade${tradeCount === 1 ? "" : "s"}</small></div><label class="account-move-control">Move to <select data-account-move="${account.id}"><option value="">Choose group</option>${options}</select></label><b class="${delta >= 0 ? "result-positive" : "result-negative"}">${delta >= 0 ? "+" : ""}${money(delta)}</b><span class="account-actions"><button type="button" class="account-action" data-account-edit="${account.id}">Edit</button><button type="button" class="account-action danger" data-account-delete="${account.id}">Delete</button></span></article>`; }).join("");
  list.innerHTML = groups + (ungrouped ? `<div class="ungrouped-account-section"><p class="account-group-kicker">UNGROUPED ACCOUNTS</p>${ungrouped}</div>` : "") || '<p class="empty-account-state">No account balance is configured yet. Add the account you want the Command Center to track.</p>';
  updateAccountSelect();
  syncGroupOptionsForAccountType();
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
  renderGroupedAccountBalances();
}

async function saveAccountBalance(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before saving an account.");
  const accountName = $("#account-balance-name").value.trim();
  const startingBalance = numberOrNull($("#account-starting-balance").value);
  const primary = accountType !== "Theoretical" && $("#account-primary").checked;
  if (!accountName || !startingBalance || startingBalance <= 0) return;
  if (primary) await supabase.from("account_balances").update({ is_primary: false }).eq("user_id", sessionData.session.user.id);
  const { error } = await supabase.from("account_balances").upsert({ user_id: sessionData.session.user.id, account_name: accountName, starting_balance: startingBalance, is_primary: primary }, { onConflict: "user_id,account_name" });
  if (error) return alert(`The account could not be saved: ${error.message}`);
  event.target.reset();
  await loadAccountBalances();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function loadAccountLedger() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const userId = sessionData.session.user.id;
  const [accountsResult, groupsResult, membershipsResult, linksResult, tradeAllocationsResult, withdrawalsResult, allocationsResult, depositsResult, testTradesResult] = await Promise.all([
    supabase.from("account_balances").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: true }),
    supabase.from("account_groups").select("*").order("created_at", { ascending: true }),
    supabase.from("account_group_memberships").select("*").order("joined_at", { ascending: true }),
    supabase.from("account_group_trade_links").select("*").order("created_at", { ascending: true }),
    supabase.from("account_group_trade_allocations").select("*").order("created_at", { ascending: true }),
    supabase.from("account_group_withdrawals").select("*").order("withdrawn_at", { ascending: false }),
    supabase.from("account_group_withdrawal_allocations").select("*").order("created_at", { ascending: true }),
    supabase.from("account_deposits").select("*").order("deposited_at", { ascending: false }),
    supabase.from("account_test_trades").select("*").order("traded_at", { ascending: false })
  ]);
  if (accountsResult.error) { console.error(accountsResult.error); return; }
  accountBalances = (accountsResult.data || []).map((account) => ({ ...account, account_type: account.account_type || "Live" }));
  accountGroups = groupsResult.data || [];
  accountMemberships = membershipsResult.data || [];
  groupTradeLinks = linksResult.data || [];
  groupTradeAllocations = tradeAllocationsResult.error ? [] : tradeAllocationsResult.data || [];
  groupWithdrawals = withdrawalsResult.data || [];
  withdrawalAllocations = allocationsResult.data || [];
  accountDeposits = depositsResult.error ? [] : (depositsResult.data || []);
  accountTestTrades = testTradesResult.data || [];
  refreshTradeExecutionAccountOptions();
  if (loadedTrades.length) applyFilters();
  renderGroupedAccountBalances();
}

async function saveAccountWithGroup(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before saving an account.");
  const userId = sessionData.session.user.id;
  const accountName = $("#account-balance-name").value.trim();
  const startingBalance = numberOrNull($("#account-starting-balance").value);
  const accountType = $("#account-balance-type")?.value || "Live";
  const groupId = $("#account-balance-group")?.value || "";
  const primary = $("#account-primary").checked;
  const depositAmount = editingAccountId && accountType === "Live" ? numberOrNull($("#account-deposit-amount")?.value) : null;
  if (!accountName || !startingBalance || startingBalance <= 0) return;
  if (depositAmount != null && (!Number.isFinite(depositAmount) || depositAmount <= 0)) return alert("Enter a positive deposit amount or leave it blank.");
  const group = accountGroups.find((item) => item.id === groupId);
  if (group && group.account_type !== accountType) return alert("The account type must match the group type.");
  const existingAccount = editingAccountId ? accountBalances.find((item) => item.id === editingAccountId) : accountBalances.find((item) => item.account_name === accountName);
  let current = existingAccount ? currentMembership(existingAccount.id) : null;
  if (current && (current.group_id !== groupId || existingAccount.account_type !== accountType)) {
    await supabase.from("account_group_memberships").update({ left_at: new Date().toISOString() }).eq("id", current.id);
    current = null;
  }
  if (primary) await supabase.from("account_balances").update({ is_primary: false }).eq("user_id", userId);
  const accountPayload = { user_id: userId, account_name: accountName, starting_balance: startingBalance, account_type: accountType, is_primary: primary };
  const accountQuery = editingAccountId
    ? supabase.from("account_balances").update(accountPayload).eq("id", editingAccountId).select().single()
    : supabase.from("account_balances").upsert(accountPayload, { onConflict: "user_id,account_name" }).select().single();
  const { data: account, error } = await accountQuery;
  if (error) return alert(`The account could not be saved: ${error.message}`);
  if (depositAmount != null) {
    const depositResult = await supabase.from("account_deposits").insert({ user_id: userId, account_id: account.id, amount_usd: cents(depositAmount) });
    if (depositResult.error) return alert(`The account was updated, but the deposit could not be recorded: ${depositResult.error.message}`);
  }
  if (groupId && (!current || current.group_id !== groupId)) {
    const membershipResult = await supabase.from("account_group_memberships").insert({ user_id: userId, account_id: account.id, group_id: groupId });
    if (membershipResult.error) return alert(`The account was saved, but could not join the group: ${membershipResult.error.message}`);
  }
  event.target.reset();
  editingAccountId = null;
  $("#account-deposit-amount").value = "";
  syncDepositVisibility();
  event.target.querySelector("button[type=submit]").textContent = "Save account";
  $("#account-balance-type").value = "Live";
  syncGroupOptionsForAccountType();
  $("#account-balance-group").value = "";
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function saveAccountGroup(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before creating a group.");
  const accountType = $("#account-group-type").value;
  const split = accountType === "Prop Firm" ? numberOrNull($("#account-group-split").value) : null;
  const propStatus = accountType === "Prop Firm" ? normalizedPropStatus($("#account-group-status")?.value) : "funded";
  const name = $("#account-group-name").value.trim();
  if (!name || (accountType === "Prop Firm" && (split == null || split < 0 || split > 100))) return alert("Enter a valid group name and payout split.");
  const existingGroup = editingGroupId ? accountGroups.find((item) => item.id === editingGroupId) : null;
  if (existingGroup && existingGroup.account_type !== accountType && accountGroupAccounts(existingGroup.id).length) return alert("Move or remove the group accounts before changing its type.");
  const groupPayload = { user_id: sessionData.session.user.id, name, account_type: accountType, profit_split_percent: split, prop_status: propStatus };
  const request = editingGroupId
    ? supabase.from("account_groups").update(groupPayload).eq("id", editingGroupId)
    : supabase.from("account_groups").insert(groupPayload);
  const { error } = await request;
  if (error) return alert(`The group could not be saved: ${error.message}`);
  event.target.reset();
  $("#account-group-split").value = "";
  editingGroupId = null;
  event.target.querySelector("button[type=submit]").textContent = "Create group";
  syncGroupSplitVisibility();
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function updatePropStatus(groupId, status) {
  if (!supabase || !PROP_STATUSES.includes(status)) return;
  const group = accountGroups.find((item) => item.id === groupId);
  if (!group || group.account_type !== "Prop Firm") return;
  const previous = normalizedPropStatus(group.prop_status);
  if (previous === status) return;
  const { error } = await supabase.from("account_groups").update({ prop_status: status }).eq("id", groupId);
  if (error) {
    alert(`The prop status could not be updated: ${error.message}`);
    await loadAccountLedger();
    return;
  }
  group.prop_status = status;
  renderGroupedAccountBalances();
}

function editGroup(groupId) {
  const group = accountGroups.find((item) => item.id === groupId);
  if (!group) return;
  editingGroupId = groupId;
  $("#account-group-name").value = group.name;
  $("#account-group-type").value = group.account_type || "Live";
  $("#account-group-split").value = group.account_type === "Prop Firm" ? group.profit_split_percent : "";
  $("#account-group-status").value = normalizedPropStatus(group.prop_status);
  $("#account-group-form button[type=submit]").textContent = "Update group";
  syncGroupSplitVisibility();
  $("#account-group-name").focus();
}

async function deleteGroup(groupId) {
  const group = accountGroups.find((item) => item.id === groupId);
  if (!group || !confirm(`Delete group “${group.name}”? Accounts will remain, but group links, withdrawals, and memberships will be removed.`)) return;
  const { error } = await supabase.from("account_groups").delete().eq("id", groupId);
  if (error) return alert(`The group could not be deleted: ${error.message}`);
  if (editingGroupId === groupId) {
    editingGroupId = null;
    $("#account-group-form")?.reset();
    const submit = $("#account-group-form button[type=submit]");
    if (submit) submit.textContent = "Create group";
    syncGroupSplitVisibility();
  }
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

function editAccount(accountId) {
  const account = accountBalances.find((item) => item.id === accountId);
  if (!account) return;
  editingAccountId = accountId;
  $("#account-balance-name").value = account.account_name;
  $("#account-starting-balance").value = account.starting_balance;
  $("#account-balance-type").value = account.account_type || "Live";
  syncGroupOptionsForAccountType();
  $("#account-balance-group").value = currentMembership(accountId)?.group_id || "";
  $("#account-primary").checked = Boolean(account.is_primary);
  $("#account-deposit-amount").value = "";
  syncDepositVisibility();
  $("#account-balance-form button[type=submit]").textContent = "Update account";
  $("#account-balance-name").focus();
}

async function deleteAccount(accountId) {
  const account = accountBalances.find((item) => item.id === accountId);
  if (!account || !confirm(`Delete account “${account.account_name}”? Its account history and withdrawal allocations will be removed.`)) return;
  const { error } = await supabase.from("account_balances").delete().eq("id", accountId);
  if (error) return alert(`The account could not be deleted: ${error.message}`);
  if (editingAccountId === accountId) editingAccountId = null;
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function moveAccount(accountId, groupId) {
  if (!supabase) return;
  const account = accountBalances.find((item) => item.id === accountId);
  const group = accountGroups.find((item) => item.id === groupId);
  if (!account || !group) return;
  if (account.account_type !== group.account_type) return alert("The account type must match the group type.");
  const current = currentMembership(accountId);
  if (current?.group_id === groupId) return;
  if (current) await supabase.from("account_group_memberships").update({ left_at: new Date().toISOString() }).eq("id", current.id);
  const { error } = await supabase.from("account_group_memberships").insert({ user_id: account.user_id, account_id: accountId, group_id: groupId });
  if (error) return alert(`The account could not be moved: ${error.message}`);
  await loadAccountLedger();
}

async function saveGroupTrade(groupId, form) {
  const tradeId = form.querySelector(`[data-group-trade-select="${groupId}"]`)?.value;
  const allocations = formAllocations(form, `[data-group-trade-allocation="${groupId}"]`, { allowNegative: true });
  if (!tradeId || !allocations?.length) return alert("Choose a closed journal trade and enter a non-zero exact dollar PnL for each participating account.");
  if (groupTradeLinks.some((link) => String(link.group_id) === String(groupId) && String(link.trade_id) === String(tradeId))) return alert("This journal trade is already linked to this group.");
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before linking a group trade.");
  const totalPnl = cents(allocations.reduce((total, allocation) => total + allocation.amount, 0));
  const { data: link, error } = await supabase.from("account_group_trade_links").insert({ user_id: sessionData.session.user.id, group_id: groupId, trade_id: tradeId, actual_pnl_usd: totalPnl }).select().single();
  if (error) return alert(`The trade could not be attached: ${error.message}`);
  const allocationResult = await supabase.from("account_group_trade_allocations").insert(allocations.map((allocation) => ({
    user_id: sessionData.session.user.id,
    group_trade_link_id: link.id,
    account_id: allocation.accountId,
    pnl_usd: allocation.amount,
  })));
  if (allocationResult.error) {
    await supabase.from("account_group_trade_links").delete().eq("id", link.id);
    const migrationHint = /relation|schema cache|does not exist/i.test(String(allocationResult.error.message || "")) ? " Run migration 094 first." : "";
    return alert(`The trade could not be allocated: ${allocationResult.error.message}.${migrationHint}`);
  }
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function unlinkGroupTrade(linkId) {
  const link = groupTradeLinks.find((item) => String(item.id) === String(linkId));
  if (!link || !supabase) return;
  const trade = loadedTrades.find((item) => String(item.id) === String(link.trade_id));
  const label = trade ? `#${String(tradeNumberFor(trade.id)).padStart(3, "0")} ${trade.pair || "trade"}` : "this trade";
  if (!window.confirm(`Unlink ${label} from this account group? The journal trade will remain saved.`)) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before changing a group trade.");
  const { error } = await supabase.from("account_group_trade_links")
    .delete()
    .eq("id", link.id)
    .eq("user_id", sessionData.session.user.id);
  if (error) return alert(`The trade could not be unlinked: ${error.message}`);
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

async function saveTheoreticalTrade(accountId, form) {
  const account = accountBalances.find((item) => item.id === accountId);
  const pnl = numberOrNull(form.querySelector('[name="pnl_usd"]')?.value);
  const tradedAt = form.querySelector('[name="traded_at"]')?.value;
  if (!account || account.account_type !== "Theoretical") return;
  if (pnl == null || !Number.isFinite(pnl) || !tradedAt) return alert("Enter a valid testing win/loss amount and date.");
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase.from("account_test_trades").insert({ user_id: sessionData.session.user.id, account_id: accountId, traded_at: isoFromLocalDateTime(`${tradedAt}T12:00`), strategy: form.querySelector('[name="strategy"]')?.value.trim() || null, pnl_usd: cents(pnl), note: form.querySelector('[name="note"]')?.value.trim() || null });
  if (error) return alert(`The theoretical trade could not be saved: ${error.message}`);
  await loadAccountLedger();
}

async function deleteTheoreticalTrade(tradeId) {
  if (!tradeId || !confirm("Delete this theoretical test trade?")) return;
  const { error } = await supabase.from("account_test_trades").delete().eq("id", tradeId);
  if (error) return alert(`The theoretical trade could not be deleted: ${error.message}`);
  await loadAccountLedger();
}

async function saveGroupWithdrawal(groupId, form) {
  const group = accountGroups.find((item) => item.id === groupId);
  const allocations = formAllocations(form, `[data-withdrawal-allocation="${groupId}"]`);
  const withdrawnAt = form.querySelector(`[data-withdrawal-date="${groupId}"]`)?.value;
  const note = form.querySelector(`[data-withdrawal-note="${groupId}"]`)?.value.trim() || null;
  const includeInEarned = group?.account_type === "Theoretical"
    ? Boolean(form.querySelector(`[data-withdrawal-include="${groupId}"]`)?.checked)
    : true;
  if (!group || !accountGroupAccounts(groupId).length) return alert("Add at least one matching account to this group before recording a withdrawal.");
  if (!allocations?.length || !withdrawnAt) return alert("Enter the gross withdrawal for every account involved and a withdrawal date.");
  const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
  const grossTotal = cents(allocations.reduce((total, allocation) => total + allocation.amount, 0));
  const payoutTotal = cents(allocations.reduce((total, allocation) => total + cents(allocation.amount * split / 100), 0));
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before recording a withdrawal.");
  const withdrawalResult = await supabase.from("account_group_withdrawals").insert({ user_id: sessionData.session.user.id, group_id: groupId, withdrawn_at: isoFromLocalDateTime(withdrawnAt), gross_amount_per_account_usd: cents(grossTotal / allocations.length), payout_amount_per_account_usd: cents(payoutTotal / allocations.length), gross_total_usd: grossTotal, payout_total_usd: payoutTotal, profit_split_percent: split, account_count: allocations.length, include_in_total_earned: includeInEarned, note }).select().single();
  if (withdrawalResult.error) return alert(`The withdrawal could not be recorded: ${withdrawalResult.error.message}`);
  const allocationResult = await supabase.from("account_group_withdrawal_allocations").insert(allocations.map((allocation) => ({ user_id: sessionData.session.user.id, withdrawal_id: withdrawalResult.data.id, account_id: allocation.accountId, gross_deduction_usd: allocation.amount, payout_amount_usd: cents(allocation.amount * split / 100) })));
  if (allocationResult.error) {
    await supabase.from("account_group_withdrawals").delete().eq("id", withdrawalResult.data.id);
    return alert(`The withdrawal could not be allocated: ${allocationResult.error.message}`);
  }
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

function updateWithdrawalPreview(groupId) {
  const group = accountGroups.find((item) => item.id === groupId);
  const form = document.querySelector(`[data-group-withdrawal-form="${groupId}"]`);
  const allocations = form ? formAllocations(form, `[data-withdrawal-allocation="${groupId}"]`) : null;
  const preview = form?.querySelector(`[data-withdrawal-preview="${groupId}"]`);
  if (!preview || !group || !allocations?.length) return;
  const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
  const grossTotal = cents(allocations.reduce((total, allocation) => total + allocation.amount, 0));
  const payoutTotal = cents(allocations.reduce((total, allocation) => total + cents(allocation.amount * split / 100), 0));
  preview.textContent = `Deduct ${money(grossTotal)} across ${allocations.length} account${allocations.length === 1 ? "" : "s"} · track ${money(payoutTotal)} net at ${split}% payout.`;
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
  const positivePnl = closedTrades.map((trade) => Number(trade.pnl_percent)).filter((value) => Number.isFinite(value) && value > 0);
  const negativePnl = closedTrades.map((trade) => Number(trade.pnl_percent)).filter((value) => Number.isFinite(value) && value < 0);
  const grossProfit = positivePnl.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(negativePnl.reduce((total, value) => total + value, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null;
  const averageWin = average(positivePnl);
  const averageLoss = average(negativePnl.map(Math.abs));
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
  const pnlElement = $("#detective-net-pnl");
  pnlElement.textContent = displayNumber(totalPnl, "%");
  setTone(pnlElement, totalPnl > 0 ? "streak-win" : totalPnl < 0 ? "streak-loss" : null);
  const profitFactorElement = $("#detective-profit-factor");
  profitFactorElement.textContent = profitFactor == null ? "—" : profitFactor === Infinity ? "∞" : profitFactor.toFixed(2);
  setTone(profitFactorElement, profitFactor > 1 ? "streak-win" : profitFactor != null && profitFactor < 1 ? "streak-loss" : null);
  $("#detective-profit-factor-note").textContent = profitFactor == null ? "Log positive and negative P&L to calculate" : grossLoss === 0 ? "No closed losses recorded" : `Gross profit +${displayNumber(grossProfit, "%")} ÷ gross loss ${displayNumber(grossLoss, "%")}`;
  const averageWinLossElement = $("#detective-average-win-loss");
  averageWinLossElement.textContent = averageWin == null && averageLoss == null ? "—" : `${averageWin == null ? "—" : `+${displayNumber(averageWin, "%")}`} / ${averageLoss == null ? "—" : `−${displayNumber(averageLoss, "%")}`}`;
  $("#detective-average-win-loss-note").textContent = "Positive / negative closed-trade P&L";

  const visual = (id) => $(`#${id}`);
  const setVisual = (id, variables = {}, classes = []) => {
    const element = visual(id);
    if (!element) return;
    Object.entries(variables).forEach(([name, value]) => element.style.setProperty(name, value));
    classes.forEach(([name, enabled]) => element.classList.toggle(name, Boolean(enabled)));
  };
  const be = Math.max(0, closedTrades.length - decisiveTrades);
  const outcomeTotal = Math.max(1, wins + losses + be);
  setVisual("detective-win-visual", {
    "--wins": `${(wins / outcomeTotal) * 100}%`,
    "--losses": `${(losses / outcomeTotal) * 100}%`,
    "--breakeven": `${(be / outcomeTotal) * 100}%`,
  });
  const currentStreak = Math.min(10, streaks.currentLength || 0);
  setVisual("detective-current-streak-visual", { "--streak": `${currentStreak * 10}%` }, [["is-loss", streaks.currentType === "Loss"], ["is-empty", !currentStreak]]);
  setVisual("detective-longest-visual", {
    "--long-win": `${Math.min(100, (streaks.longestWin || 0) * 10)}%`,
    "--long-loss": `${Math.min(100, (streaks.longestLoss || 0) * 10)}%`,
  });
  const rPosition = averageR == null ? 0 : Math.max(0, Math.min(100, (averageR / 5) * 100));
  setVisual("detective-average-r-visual", { "--r-position": `${rPosition}%` }, [["is-negative", Number(averageR) < 0], ["is-empty", averageR == null]]);
  const maeMagnitude = Math.abs(Number(averageMae) || 0);
  const mfeMagnitude = Math.abs(Number(averageMfe) || 0);
  const excursionTotal = Math.max(1, maeMagnitude + mfeMagnitude);
  setVisual("detective-excursion-visual", { "--mae": `${(maeMagnitude / excursionTotal) * 100}%`, "--mfe": `${(mfeMagnitude / excursionTotal) * 100}%` }, [["is-empty", averageMae == null && averageMfe == null]]);
  const grossTotal = Math.max(.01, grossProfit + grossLoss);
  const profitFactorVisual = visual("detective-profit-factor-visual");
  if (profitFactorVisual && profitFactorVisual.dataset.breakdownVisual !== "true") {
    profitFactorVisual.innerHTML = "<i>PROFIT</i><b>LOSS</b>";
    profitFactorVisual.setAttribute("aria-label", "Gross profit versus gross loss");
    profitFactorVisual.dataset.breakdownVisual = "true";
  }
  setVisual("detective-profit-factor-visual", {
    "--gross-profit": `${(grossProfit / grossTotal) * 100}%`,
    "--gross-loss": `${(grossLoss / grossTotal) * 100}%`,
  }, [["is-empty", profitFactor == null], ["is-profitable", profitFactor > 1], ["is-losing", profitFactor != null && profitFactor < 1]]);
  const averageOutcomeTotal = Math.max(.01, (averageWin || 0) + (averageLoss || 0));
  setVisual("detective-average-outcome-visual", { "--average-win": `${((averageWin || 0) / averageOutcomeTotal) * 100}%`, "--average-loss": `${((averageLoss || 0) / averageOutcomeTotal) * 100}%` }, [["is-empty", averageWin == null && averageLoss == null]]);
  const pnlSeries = [0];
  [...closedTrades].sort((left, right) => tradeTime(left) - tradeTime(right)).forEach((trade) => pnlSeries.push(pnlSeries[pnlSeries.length - 1] + (Number(trade.pnl_percent) || 0)));
  const minPnl = Math.min(...pnlSeries);
  const maxPnl = Math.max(...pnlSeries);
  const pnlRange = Math.max(.01, maxPnl - minPnl);
  const points = pnlSeries.map((value, index) => `${(index / Math.max(1, pnlSeries.length - 1)) * 100},${100 - ((value - minPnl) / pnlRange) * 100}`).join(" ");
  const pnlVisual = visual("detective-pnl-visual");
  if (pnlVisual) {
    pnlVisual.innerHTML = closedTrades.length ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" /></svg>` : "";
    const zeroPosition = 100 - ((0 - minPnl) / pnlRange) * 100;
    setVisual("detective-pnl-visual", { "--zero-position": `${Math.max(0, Math.min(100, zeroPosition))}%` }, [["is-positive", totalPnl > 0], ["is-negative", totalPnl < 0], ["is-empty", !closedTrades.length]]);
  }
}

let tradeHoverTimer = null;
let focusedTradeRow = null;
let journalCalendarMonth = null;

const journalDateKey = (trade) => {
  const date = new Date(trade?.traded_at || trade?.created_at || "");
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const journalPnlLabel = (value) => {
  const pnl = Number(value || 0);
  const precision = Math.abs(pnl) >= 10 ? 1 : 2;
  return `${pnl > 0 ? "+" : ""}${pnl.toFixed(precision).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
};

function renderJournalCalendar(trades) {
  const root = $("#journal-calendar");
  if (!root) return;
  if (!journalCalendarMonth) {
    const today = new Date();
    journalCalendarMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12));
  }
  const year = journalCalendarMonth.getUTCFullYear();
  const month = journalCalendarMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 12));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12));
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const grouped = new Map();
  (trades || []).forEach((trade) => {
    const key = journalDateKey(trade);
    if (!key.startsWith(monthKey)) return;
    const day = grouped.get(key) || { count: 0, pnl: 0 };
    day.count += 1;
    day.pnl += Number(trade.pnl_percent || 0);
    grouped.set(key, day);
  });
  const daysInGrid = Math.ceil((firstDay.getUTCDay() + monthEnd.getUTCDate()) / 7) * 7;
  const calendarDays = Array.from({ length: daysInGrid }, (_, index) => {
    const day = index - firstDay.getUTCDay() + 1;
    if (day < 1 || day > monthEnd.getUTCDate()) return '<div class="journal-calendar-day empty" aria-hidden="true"></div>';
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    const data = grouped.get(key);
    const tone = data?.pnl > 0 ? "positive" : data?.pnl < 0 ? "negative" : data ? "flat" : "";
    return `<article class="journal-calendar-day ${tone}"><span>${day}</span>${data ? `<strong>${journalPnlLabel(data.pnl)}</strong><small>${data.count} trade${data.count === 1 ? "" : "s"}</small>` : ""}</article>`;
  }).join("");
  const weekCount = daysInGrid / 7;
  const weekTotals = Array.from({ length: weekCount }, (_, week) => {
    const totals = Array.from({ length: 7 }, (_, offset) => {
      const day = week * 7 + offset - firstDay.getUTCDay() + 1;
      if (day < 1 || day > monthEnd.getUTCDate()) return null;
      return grouped.get(`${monthKey}-${String(day).padStart(2, "0")}`) || null;
    }).filter(Boolean).reduce((total, day) => ({ count: total.count + day.count, pnl: total.pnl + day.pnl }), { count: 0, pnl: 0 });
    return `<article class="journal-week-total ${totals.pnl > 0 ? "positive" : totals.pnl < 0 ? "negative" : ""}"><span>WEEK TOTAL</span><strong>${journalPnlLabel(totals.pnl)}</strong><small>${totals.count} trade${totals.count === 1 ? "" : "s"}</small></article>`;
  }).join("");
  const monthTrades = [...grouped.values()].reduce((total, day) => total + day.count, 0);
  const monthPnl = [...grouped.values()].reduce((total, day) => total + day.pnl, 0);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  root.innerHTML = `<div class="journal-calendar-head"><div><p class="eyebrow blue-text">03 — JOURNAL CALENDAR</p><h3>${monthName}</h3></div><div class="journal-calendar-actions"><button type="button" data-journal-calendar="previous" aria-label="Previous month">‹</button><button type="button" data-journal-calendar="current">This month</button><button type="button" data-journal-calendar="next" aria-label="Next month">›</button></div></div><div class="journal-calendar-stats"><span>${monthTrades} trade${monthTrades === 1 ? "" : "s"}</span><b class="${monthPnl > 0 ? "result-positive" : monthPnl < 0 ? "result-negative" : ""}">${journalPnlLabel(monthPnl)} logged PnL</b><small>Reflects current journal filters</small></div><div class="journal-calendar-body"><div class="journal-calendar-main"><div class="journal-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="journal-calendar-grid">${calendarDays}</div></div><aside class="journal-week-totals" style="--journal-week-count:${weekCount}"><span class="journal-week-total-head">WEEKLY</span>${weekTotals}</aside></div>`;
}

function clearTradeHoverFocus() {
  if (tradeHoverTimer) clearTimeout(tradeHoverTimer);
  tradeHoverTimer = null;
  focusedTradeRow?.classList.remove("trade-hover-focus");
  focusedTradeRow = null;
}
function wireTradeHoverFocus() {
  const table = $("#trade-log")?.closest("table");
  if (!table || table.dataset.hoverFocusWired === "true") return;
  table.dataset.hoverFocusWired = "true";
  table.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const row = event.target.closest?.("tbody tr:not(.empty-row)");
    if (!row || !table.contains(row) || (event.relatedTarget && row.contains(event.relatedTarget))) return;
    clearTradeHoverFocus();
    tradeHoverTimer = setTimeout(() => {
      focusedTradeRow = row;
      row.classList.add("trade-hover-focus");
    }, 120);
  });
  table.addEventListener("pointerout", (event) => {
    const row = event.target.closest?.("tbody tr:not(.empty-row)");
    if (!row || (event.relatedTarget && row.contains(event.relatedTarget))) return;
    if (focusedTradeRow === row) clearTradeHoverFocus();
    else if (tradeHoverTimer) { clearTimeout(tradeHoverTimer); tradeHoverTimer = null; }
  });
}

function ensureTradeDetailDialog() {
  let dialog = $("#trade-detail-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "trade-detail-dialog";
  dialog.className = "trade-detail-dialog";
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-trade-detail-close]")) {
      dialog.close();
      return;
    }
    const trade = loadedTrades.find((item) => String(item.id) === String(dialog.dataset.tradeId));
    if (!trade) return;
    if (event.target.closest("[data-trade-detail-edit]")) {
      dialog.close();
      editTrade(trade);
    }
    if (event.target.closest("[data-trade-detail-delete]")) {
      dialog.close();
      deleteTrade(trade.id);
    }
  });
  return dialog;
}

function showTradeDetail(trade) {
  if (!trade) return;
  clearTradeHoverFocus();
  const dialog = ensureTradeDetailDialog();
  const date = trade.traded_at ? new Date(trade.traded_at) : null;
  const value = (item) => item == null || item === "" ? "—" : escapeHtml(String(item));
  const savedExecutions = tradeExecutionsFor(trade.id);
  const legacyAccount = accountBalances.find((account) => account.account_name === trade.account);
  const executions = savedExecutions.length ? savedExecutions : legacyAccount && Number(trade.lot_size) > 0 ? [{ account_id: legacyAccount.id, lot_size: trade.lot_size }] : [];
  const estimate = combinedExecutionEstimate(trade, executions);
  const estimatedGross = estimate?.basis
    ? `TP ${estimatedPnlLabel(estimate.target, "+")} · SL ${estimatedPnlLabel(estimate.risk, "−")} (spread / commission excluded)`
    : "—";
  const fields = [
    ["Time", date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "—"], ["Pair", trade.pair],
    ["Type", trade.trade_type], ["Setup", displaySetup(trade.setup)], ["Market condition", trade.market_condition],
    ["CB hour", trade.cb_hour], ["MAE", displayNumber(trade.mae_30m)], ["MFE", displayNumber(trade.mfe_30m)],
    ["Risk / reward", displayNumber(trade.r_multiple, "R")], ["PnL", displayNumber(trade.pnl_percent, "%")],
    ["Outcome", trade.trade_status === "Open" ? "Open" : resolvedOutcome(trade)], ["Position", trade.position],
    ["Account", tradeAccountLabel(trade)], ["Account executions", executions.length ? executions.map((execution) => `${executionAccountName(execution)} · ${displayNumber(execution.lot_size)} lots`).join(" | ") : null], ["Day", trade.trade_day], ["Month", trade.trade_month],
    ["Session time", trade.session_time], ["Entry timeframe", trade.entry_timeframe], ["Wick", trade.wick],
    ["Entry price", trade.entry_price], ["Take profit", trade.take_profit_price], ["Stop loss", trade.stop_loss_price],
    ["Estimated gross P&L", estimatedGross], ["Estimate basis", estimate?.basis],
    ["Followed plan", trade.plan_violation ? "No" : "Yes"], ["Rule violation", trade.violation_type],
  ];
  const number = loadedTrades.slice().sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at)).findIndex((item) => String(item.id) === String(trade.id)) + 1;
  dialog.dataset.tradeId = trade.id;
  dialog.innerHTML = `<div class="dialog-card"><button class="dialog-close" type="button" data-trade-detail-close aria-label="Close">×</button><p class="eyebrow blue-text">TRADE DEBRIEF / READ ONLY</p><h2>#${String(number).padStart(3, "0")} · ${value(trade.pair)}</h2><div class="trade-detail-grid">${fields.map(([label, item]) => `<div class="trade-detail-field"><span>${escapeHtml(label)}</span><strong>${value(item)}</strong></div>`).join("")}</div><div class="trade-detail-notes"><div><span>Debrief note</span><p>${value(trade.debrief_note)}</p></div><div><span>Additional note</span><p>${value(trade.note)}</p></div></div><div class="trade-detail-actions"><button type="button" class="secondary compact" data-trade-detail-delete>Delete trade</button><button type="button" class="primary compact" data-trade-detail-edit>Edit trade</button></div></div>`;
  dialog.showModal();
}

function wireTradeRowClick() {
  const table = $("#trade-log")?.closest("table");
  if (!table || table.dataset.rowClickWired === "true") return;
  table.dataset.rowClickWired = "true";
  const openFromEvent = (event) => {
    if (event.target.closest?.("button, a, input, select, textarea")) return;
    const row = event.target.closest?.("tbody tr[data-trade-id]");
    if (!row) return;
    showTradeDetail(loadedTrades.find((trade) => String(trade.id) === String(row.dataset.tradeId)));
  };
  table.addEventListener("click", openFromEvent);
  table.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest?.("tbody tr[data-trade-id]");
    if (!row) return;
    event.preventDefault();
    showTradeDetail(loadedTrades.find((trade) => String(trade.id) === String(row.dataset.tradeId)));
  });
}

function renderTrades(trades) {
  clearTradeHoverFocus();
  const table = $("#trade-log");
  renderJournalCalendar(trades);
  if (!trades.length) {
    table.innerHTML = '<tr class="empty-row"><td colspan="19">No trade debriefs yet. Preserve data; log the next execution.</td></tr>';
    return;
  }

  const tradeNumbers = new Map([...loadedTrades].sort((a, b) => new Date(a.traded_at || a.created_at) - new Date(b.traded_at || b.created_at)).map((trade, index) => [trade.id, index + 1]));
  table.innerHTML = trades.map((trade) => {
    const outcome = resolvedOutcome(trade);
    const resultClass = outcome === "Win" || outcome === "Small win" ? "result-positive" : outcome === "Loss" || outcome === "Small loss" ? "result-negative" : "";
    const date = new Date(trade.traded_at || trade.created_at);
    return `<tr data-trade-id="${escapeHtml(String(trade.id))}" tabindex="0" aria-label="Open trade ${escapeHtml(trade.pair || "debrief")}">
      <td class="trade-number">#${String(tradeNumbers.get(trade.id) || 0).padStart(3, "0")}</td>
      <td>${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
      <td><strong>${escapeHtml(trade.pair)}</strong></td>
      <td>${escapeHtml(trade.trade_type || "—")}</td>
      <td>${escapeHtml(displaySetup(trade.setup))}</td>
      <td>${escapeHtml(trade.market_condition || "—")}</td>
      <td>${escapeHtml(trade.cb_hour || "—")}</td>
      <td>${displayNumber(trade.mae_30m)}</td>
      <td>${displayNumber(trade.mfe_30m)}</td>
      <td>${displayNumber(trade.r_multiple, "R")}</td>
      <td class="${Number(trade.pnl_percent) > 0 ? "result-positive" : Number(trade.pnl_percent) < 0 ? "result-negative" : ""}">${displayNumber(trade.pnl_percent, "%")}</td>
      <td class="${resultClass}">${outcome}</td>
      <td>${escapeHtml(trade.position || "—")}</td>
      <td>${escapeHtml(tradeAccountLabel(trade))}${isTheoretical(trade) ? "<small class=\"theoretical-account\">Review only</small>" : ""}</td>
      <td>${escapeHtml(trade.trade_day || "—")}</td>
      <td>${escapeHtml(trade.trade_month || "—")}</td>
      <td>${escapeHtml(trade.session_time || "—")}</td>
      <td>${escapeHtml(trade.entry_timeframe || "—")}</td>
      <td>${escapeHtml(trade.wick || "—")}</td>
    </tr>`;
  }).join("");
  table.querySelectorAll("tr").forEach((row) => {
    const positionCell = row.children[12];
    const position = positionCell?.textContent.trim().toLowerCase();
    positionCell?.classList.toggle("position-long", position === "long");
    positionCell?.classList.toggle("position-short", position === "short");
  });
}

let tradeLoadInFlight = false;
let tradeLoadQueued = false;
let tradeLoadTimer = null;

function scheduleTradeLoad(delay = 120) {
  clearTimeout(tradeLoadTimer);
  tradeLoadTimer = setTimeout(() => { void loadTrades(); }, delay);
}

async function loadTrades() {
  if (!supabase) return;
  if (tradeLoadInFlight) {
    tradeLoadQueued = true;
    return;
  }
  tradeLoadInFlight = true;
  try {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;
  const loadSnapshot = () => supabase.from("trade_debriefs").select("*").eq("user_id", userId).order("traded_at", { ascending: false });
  const { data, error } = window.AEGIS_DATA_GUARD
    ? await window.AEGIS_DATA_GUARD.run("detective:trades", loadSnapshot)
    : await loadSnapshot();
  if (error) {
    console.error(error);
    return;
  }
  loadedTrades = data || [];
  const loadExecutions = () => supabase.from("trade_account_executions").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  const executionsResult = window.AEGIS_DATA_GUARD
    ? await window.AEGIS_DATA_GUARD.run("detective:trade-executions", loadExecutions)
    : await loadExecutions();
  tradeAccountExecutions = executionsResult.error ? [] : executionsResult.data || [];
  applyFilters();
  renderGroupedAccountBalances();
  } finally {
    tradeLoadInFlight = false;
    if (tradeLoadQueued) {
      tradeLoadQueued = false;
      scheduleTradeLoad(250);
    }
  }
}

function buildFilters() {
  const selectOptions = (selector) => Array.from($(selector).options).map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.text)}</option>`).join("");
  const filterBar = document.createElement("section");
  filterBar.className = "detective-filter-bar";
  filterBar.innerHTML = `<div class="filter-heading"><p class="eyebrow blue-text">02 — FILTER INTELLIGENCE</p><small id="filter-result-count">All trades</small></div><div class="filter-controls"><label>Pair <select data-filter="pair"><option value="">All pairs</option>${selectOptions("#detective-pair")}</select></label><label>Setup <select data-filter="setup"><option value="">All setups</option>${selectOptions("#detective-setup")}</select></label><label>CB Hour <select data-filter="cb_hour"><option value="">All CB hours</option>${selectOptions("#detective-cb-hour")}</select></label><label>Session time <select data-filter="session_time"><option value="">All sessions</option>${selectOptions("#detective-session-time")}</select></label><label>Type <select data-filter="trade_type"><option value="">All types</option>${selectOptions("#detective-type")}</select></label><label>Market condition <select data-filter="market_condition"><option value="">All conditions</option>${selectOptions("#detective-market-condition")}</select></label><label>Position <select data-filter="position"><option value="">Long + Short</option>${selectOptions("#detective-position")}</select></label><button type="button" class="clear-filters">Clear filters</button></div>`;
  const journalWindow = $(".trade-panel .journal-trade-window");
  const tradeTable = $(".trade-panel .table-wrap");
  // The table now lives inside its own scroll surface. Keep filters in that
  // surface, but insert them relative to their actual parent so startup does
  // not abort before the stored journal can load.
  journalWindow?.insertBefore(filterBar, tradeTable);
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
  delete $("#detective-r")?.dataset.autoRiskReward;
  renderTradeExecutionRows();
  $("#detective-outcome").value = "Open";
  $("#detective-followed-plan").value = "yes";
  $("#detective-debrief-note").value = "";
  $("#detective-additional-note").value = "";
  syncPlanAdherenceUi();
  syncExecutionEstimate();
  syncSetupUi();
  currentTradeId = null;
  editFormSnapshot = null;
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
  if ($("#detective-followed-plan")) {
    ensureDebriefNoteField();
    return;
  }
  const saveButton = $("#save-detective-trade");
  if (!saveButton) return;
  const wrap = document.createElement("div");
  wrap.className = "two-col process-adherence";
  wrap.innerHTML = `<label>Followed plan?<select id="detective-followed-plan"><option value="yes">Yes</option><option value="no">No</option></select></label><label id="detective-violation-wrap" hidden>Rule violation / why?<textarea id="detective-violation-reason" placeholder="Name the rule and what happened."></textarea></label>`;
  saveButton.before(wrap);
  $("#detective-followed-plan")?.addEventListener("change", syncPlanAdherenceUi);
  ensureDebriefNoteField();
}

function ensureDebriefNoteField() {
  if ($("#detective-debrief-note")) {
    ensureAdditionalNoteField();
    return;
  }
  const saveButton = $("#save-detective-trade");
  if (!saveButton) return;
  saveButton.insertAdjacentHTML("beforebegin", `<label class="debrief-note-field">Debrief note<textarea id="detective-debrief-note" rows="3" placeholder="What happened, what did you notice, and what should the record remember?"></textarea></label>`);
  ensureAdditionalNoteField();
}

function ensureAdditionalNoteField() {
  if ($("#detective-additional-note")) return;
  const saveButton = $("#save-detective-trade");
  if (!saveButton) return;
  saveButton.insertAdjacentHTML("beforebegin", `<label class="debrief-note-field">Additional note<textarea id="detective-additional-note" rows="3" placeholder="Separate note for context, emotion, or anything else worth preserving."></textarea></label>`);
}

function setSelectValue(selector, value) {
  const control = $(selector);
  if (!control) return;
  if (value == null || value === "") return;
  const normalized = String(value);
  if (!Array.from(control.options).some((option) => option.value === normalized)) control.add(new Option(normalized, normalized));
  control.value = normalized;
}

function readTradeFormValues() {
  const executionRows = executionRowsFromForm().rows;
  const executionAccounts = executionRows.map((row) => executionAccount(row)?.account_name).filter(Boolean);
  return {
    pair: $("#detective-pair").value.trim().toUpperCase(),
    setup: JSON.stringify(Array.from($("#detective-setup").selectedOptions).map((option) => option.value)),
    trade_type: $("#detective-type").value.trim() || null,
    market_condition: $("#detective-market-condition").value.trim() || null,
    cb_hour: $("#detective-cb-hour").value.trim() || null,
    r_multiple: numberOrNull($("#detective-r").value),
    pnl_percent: numberOrNull($("#detective-pnl").value),
    entry_price: numberOrNull($("#detective-entry-price").value),
    take_profit_price: numberOrNull($("#detective-take-profit").value),
    stop_loss_price: numberOrNull($("#detective-stop-loss").value),
    lot_size: null,
    outcome: $("#detective-outcome").value === "Open" ? null : $("#detective-outcome").value,
    trade_status: $("#detective-outcome").value === "Open" ? "Open" : "Closed",
    mae_30m: numberOrNull($("#detective-mae").value),
    mfe_30m: numberOrNull($("#detective-mfe").value),
    position: $("#detective-position").value.trim() || null,
    account: executionAccounts.length === 1 ? executionAccounts[0] : executionAccounts.length > 1 ? "Multiple accounts" : null,
    trade_day: $("#detective-day").value.trim() || null,
    trade_month: $("#detective-month").value.trim() || null,
    session_time: $("#detective-session-time").value.trim() || null,
    entry_timeframe: $("#detective-entry-tf").value.trim() || null,
    wick: $("#detective-wick").value.trim() || null,
    plan_violation: $("#detective-followed-plan").value === "no",
    violation_type: $("#detective-followed-plan").value === "no" ? $("#detective-violation-reason").value.trim() || null : null,
    debrief_note: $("#detective-debrief-note").value.trim() || null,
    note: $("#detective-additional-note").value.trim() || null,
    traded_at_local: $("#detective-time").value
  };
}

function editTrade(trade) {
  currentTradeId = trade.id;
  const form = $("#detective-trade-dialog form");
  form.reset();
  setSelectValue("#detective-pair", trade.pair);
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
  selectedSetups.filter(Boolean).forEach((setup) => {
    if (!Array.from($("#detective-setup").options).some((option) => option.value === setup)) $("#detective-setup").add(new Option(setup, setup));
  });
  Array.from($("#detective-setup").options).forEach((option) => { option.selected = selectedSetups.includes(option.value); });
  ["mae", "mfe", "r", "pnl"].forEach((field) => { $("#detective-" + field).value = trade[{ mae: "mae_30m", mfe: "mfe_30m", r: "r_multiple", pnl: "pnl_percent" }[field]] ?? ""; });
  [["entry-price", "entry_price"], ["take-profit", "take_profit_price"], ["stop-loss", "stop_loss_price"]].forEach(([field, column]) => { $("#detective-" + field).value = trade[column] ?? ""; });
  const savedExecutions = tradeExecutionsFor(trade.id);
  const legacyAccount = accountBalances.find((account) => account.account_name === trade.account);
  renderTradeExecutionRows(savedExecutions.length ? savedExecutions : legacyAccount && Number(trade.lot_size) > 0 ? [{ account_id: legacyAccount.id, lot_size: trade.lot_size }] : []);
  const savedRiskReward = Number(trade.r_multiple);
  const calculatedRiskReward = riskRewardEstimate(trade);
  if (calculatedRiskReward && Number.isFinite(savedRiskReward) && Math.abs(savedRiskReward - calculatedRiskReward.ratio) < 0.01) {
    $("#detective-r").dataset.autoRiskReward = "true";
  } else {
    delete $("#detective-r")?.dataset.autoRiskReward;
  }
  if (trade.traded_at) $("#detective-time").value = localDateTimeValue(trade.traded_at);
  $("#detective-followed-plan").value = trade.plan_violation ? "no" : "yes";
  $("#detective-violation-reason").value = trade.violation_type || "";
  $("#detective-debrief-note").value = trade.debrief_note || "";
  $("#detective-additional-note").value = trade.note || "";
  syncPlanAdherenceUi();
  syncExecutionEstimate();
  syncSetupUi();
  editFormSnapshot = readTradeFormValues();
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

function sameTradeExecutions(left, right) {
  const normalized = (rows) => rows.map((row) => `${row.account_id}:${Number(row.lot_size)}`).sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

async function saveTradeExecutions(tradeId, rows, userId) {
  const removeResult = await supabase.from("trade_account_executions").delete().eq("trade_debrief_id", tradeId).eq("user_id", userId);
  if (removeResult.error) return removeResult.error;
  const insertResult = await supabase.from("trade_account_executions").insert(rows.map((row) => ({
    user_id: userId,
    trade_debrief_id: tradeId,
    account_id: row.account_id,
    lot_size: row.lot_size,
  })));
  return insertResult.error || null;
}

async function verifyTradeExecutionStorage() {
  const { error } = await supabase.from("trade_account_executions").select("id").limit(1);
  return error || null;
}

async function saveTrade(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("Please sign in before logging a trade.");
    return;
  }
  const storageError = await verifyTradeExecutionStorage();
  if (storageError) {
    alert(`Account execution storage is not ready: ${storageError.message}. Run migration 101 first.`);
    return;
  }
  const executionState = executionRowsFromForm({ validate: true });
  if (executionState.error) {
    alert(executionState.error);
    return;
  }
  const formValues = readTradeFormValues();
  const existingTrade = currentTradeId ? loadedTrades.find((trade) => String(trade.id) === String(currentTradeId)) : null;
  const hasSnapshot = Boolean(currentTradeId && editFormSnapshot);
  const isNewTrade = !currentTradeId;
  const payload = hasSnapshot
    ? Object.fromEntries(Object.entries(formValues).filter(([field, value]) => value !== editFormSnapshot[field]))
    : { ...formValues };
  const timeChanged = !hasSnapshot || formValues.traded_at_local !== editFormSnapshot.traded_at_local;
  const executionsChanged = isNewTrade || !sameTradeExecutions(executionState.rows, tradeExecutionsFor(currentTradeId));
  delete payload.traded_at_local;
  if (timeChanged) payload.traded_at = isoFromLocalDateTime(formValues.traded_at_local, existingTrade?.traded_at || new Date().toISOString());
  if (isNewTrade) payload.execution_grade = "A";
  if (!isNewTrade && Object.keys(payload).length === 0 && !executionsChanged) {
    $("#detective-trade-dialog").close();
    clearForm();
    $("#save-detective-trade").textContent = "Save debrief";
    return;
  }
  const request = isNewTrade
    ? supabase.from("trade_debriefs").insert(payload).select().single()
    : Object.keys(payload).length
      ? supabase.from("trade_debriefs").update(payload).eq("id", currentTradeId).select().single()
      : null;
  const { data: savedTrade, error } = request ? await request : { data: existingTrade, error: null };
  if (error) {
    alert(`The debrief could not be saved: ${error.message}`);
    return;
  }
  if (executionsChanged) {
    const executionError = await saveTradeExecutions(savedTrade?.id || currentTradeId, executionState.rows, sessionData.session.user.id);
    if (executionError) {
      const migrationHint = /relation|schema cache|does not exist/i.test(String(executionError.message || "")) ? " Run migration 101 first." : "";
      alert(`The trade was saved, but its account executions could not be saved: ${executionError.message}.${migrationHint}`);
      return;
    }
  }
  $("#detective-trade-dialog").close();
  clearForm();
  $("#save-detective-trade").textContent = "Save debrief";
  await loadTrades();
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "trade-debrief" } }));
}

function init() {
  ensurePlanAdherenceFields();
  ensureTradeExecutionFields();
  const dialog = $("#detective-trade-dialog");
  const tradeTime = $("#detective-time");
  if (tradeTime) {
    // Preserve the original datetime-local format and value behavior. The
    // calendar affordance is hidden in detective.css; users still enter the
    // same date/time format and the existing timestamp conversion is unchanged.
    tradeTime.type = "datetime-local";
  }
  const sessionTime = $("#detective-session-time");
  if (sessionTime) {
    const sessionOptions = [
      ["L5 (7 est)", "L5 (7 est)"],
      ["NY0 (8 est)", "NY0 (8 est)"],
      ["NY1 (9 est)", "NY1 (9 est)"],
      ["NY2 (10 est)", "NY2 (10 est)"],
      ["NY3 (11 est)", "NY3 (11 est)"],
      ["NY4 (12 est)", "NY4 (12 est)"],
      ["NY5 (13 est)", "NY5 (13 est)"],
      ["NY6 (14 est)", "NY6 (14 est)"],
      ["NY7 (15 est)", "NY7 (15 est)"],
      ["NY8 (16 est)", "NY8 (16 est)"],
      ["NY9 (17 est)", "NY9 (17 est)"],
    ];
    const existing = new Set(Array.from(sessionTime.options).map((option) => option.value));
    sessionOptions.forEach(([value, label]) => {
      if (!existing.has(value)) sessionTime.add(new Option(label, value));
    });
  }
  ["#detective-pair", "#detective-position", "#detective-entry-price", "#detective-take-profit", "#detective-stop-loss"].forEach((selector) => {
    const input = $(selector);
    input?.addEventListener("input", syncExecutionEstimate);
    input?.addEventListener("change", syncExecutionEstimate);
  });
  $("#detective-r")?.addEventListener("input", (event) => {
    if (event.isTrusted) delete event.currentTarget.dataset.autoRiskReward;
  });
  dialog?.addEventListener("input", (event) => {
    if (event.target.closest("[data-trade-execution-account], [data-trade-execution-lot]")) syncExecutionEstimate();
  });
  dialog?.addEventListener("change", (event) => {
    if (event.target.closest("[data-trade-execution-account], [data-trade-execution-lot]")) syncExecutionEstimate();
  });
  dialog?.addEventListener("click", (event) => {
    if (event.target.closest("[data-trade-execution-add]")) {
      const rows = rawTradeExecutionRows();
      renderTradeExecutionRows([...rows, {}]);
      return;
    }
    const remove = event.target.closest("[data-trade-execution-remove]");
    if (!remove) return;
    remove.closest("[data-trade-execution-row]")?.remove();
    if (!document.querySelector("[data-trade-execution-row]")) renderTradeExecutionRows();
    syncExecutionEstimate();
  });
  syncExecutionEstimate();
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
  const outcomeHeader = Array.from(header.cells).find((cell) => cell.textContent.trim() === "WIN / B/E / LOSS");
  if (outcomeHeader) outcomeHeader.textContent = "WIN / LOSS";
  header.insertAdjacentHTML("afterbegin", "<th>#</th>");
  wireTradeHoverFocus();
  wireTradeRowClick();
  buildFilters();
  const pnlMetric = $("#detective-net-pnl").closest(".metric");
  pnlMetric.querySelector("p").textContent = "NET P&L";
  pnlMetric.querySelector("small").textContent = "Combined closed-trade return";
  $("#detective-excursion").closest(".metric").querySelector("p").textContent = "AVG MAE / MFE";
  const metricExplanations = {
    "detective-win-rate": "Wins ÷ (wins + losses). Break-even trades are excluded.",
    "detective-current-streak": "Current consecutive win or loss run in chronological order. Break-even trades are neutral.",
    "detective-longest-win": "Longest historical consecutive win run / loss run.",
    "detective-average-r": "Average recorded R-multiple across closed trades.",
    "detective-excursion": "Average maximum adverse excursion / maximum favorable excursion recorded 30 minutes after entry.",
    "detective-net-pnl": "Sum of logged closed-trade P&L percentages.",
    "detective-profit-factor": "Total positive P&L ÷ absolute total negative P&L. Above 1.00 is profitable.",
    "detective-average-win-loss": "Average positive P&L / average absolute negative P&L across closed trades.",
  };
  Object.entries(metricExplanations).forEach(([id, explanation]) => {
    const card = $(`#${id}`)?.closest(".metric");
    const label = card?.querySelector("p");
    if (!label || label.querySelector(".metric-info")) return;
    label.insertAdjacentHTML("beforeend", `<button class="metric-info" type="button" aria-label="How this metric is calculated" data-tooltip="${escapeHtml(explanation)}">i</button>`);
  });
  document.querySelectorAll("[data-detective-tab]").forEach((button) => button.addEventListener("click", () => setDetectiveTab(button.dataset.detectiveTab)));
  $("#account-balance-form")?.addEventListener("submit", saveAccountWithGroup);
  document.addEventListener("submit", (event) => {
    const groupForm = event.target.closest("#account-group-form");
    if (groupForm) saveAccountGroup(event);
    const tradeForm = event.target.closest("[data-group-trade-form]");
    if (tradeForm) { event.preventDefault(); saveGroupTrade(tradeForm.dataset.groupTradeForm, tradeForm); }
    const withdrawalForm = event.target.closest("[data-group-withdrawal-form]");
    if (withdrawalForm) { event.preventDefault(); saveGroupWithdrawal(withdrawalForm.dataset.groupWithdrawalForm, withdrawalForm); }
    const theoreticalForm = event.target.closest("[data-theoretical-trade-form]");
    if (theoreticalForm) { event.preventDefault(); saveTheoreticalTrade(theoreticalForm.dataset.theoreticalTradeForm, theoreticalForm); }
  });
  document.addEventListener("input", (event) => { const input = event.target.closest("[data-withdrawal-allocation]"); if (input) updateWithdrawalPreview(input.dataset.withdrawalAllocation); });
  document.addEventListener("change", (event) => {
    const accountCalendarScopeControl = event.target.closest("[data-account-calendar-scope]");
    if (accountCalendarScopeControl) {
      accountCalendarScope = accountCalendarScopeControl.value;
      localStorage.setItem("aegis.account-calendar-scope", accountCalendarScope);
      renderAccountCalendar();
      return;
    }
    const move = event.target.closest("[data-account-move]");
    if (move) moveAccount(move.dataset.accountMove, move.value);
    const status = event.target.closest("[data-group-status]");
    if (status) updatePropStatus(status.dataset.groupStatus, status.value);
  });
  setDetectiveTab(activeDetectiveTab);
  document.addEventListener("click", (event) => {
    const accountCalendarControl = event.target.closest("[data-account-calendar]");
    if (accountCalendarControl) {
      const action = accountCalendarControl.dataset.accountCalendar;
      const current = accountCalendarMonth || new Date();
      if (action === "previous") accountCalendarMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1, 12));
      if (action === "next") accountCalendarMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 12));
      if (action === "current") { const now = new Date(); accountCalendarMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12)); }
      renderAccountCalendar();
      return;
    }
    const calendarControl = event.target.closest("[data-journal-calendar]");
    if (calendarControl) {
      const action = calendarControl.dataset.journalCalendar;
      const current = journalCalendarMonth || new Date();
      if (action === "previous") journalCalendarMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1, 12));
      if (action === "next") journalCalendarMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 12));
      if (action === "current") { const now = new Date(); journalCalendarMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12)); }
      renderJournalCalendar(filteredTrades());
      return;
    }
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
    const accountEditButton = event.target.closest("[data-account-edit]");
    if (accountEditButton) editAccount(accountEditButton.dataset.accountEdit);
    const accountDeleteButton = event.target.closest("[data-account-delete]");
    if (accountDeleteButton) deleteAccount(accountDeleteButton.dataset.accountDelete);
    const groupEditButton = event.target.closest("[data-group-edit]");
    if (groupEditButton) editGroup(groupEditButton.dataset.groupEdit);
    const groupDeleteButton = event.target.closest("[data-group-delete]");
    if (groupDeleteButton) deleteGroup(groupDeleteButton.dataset.groupDelete);
    const groupTradeUnlinkButton = event.target.closest("[data-group-trade-unlink]");
    if (groupTradeUnlinkButton) unlinkGroupTrade(groupTradeUnlinkButton.dataset.groupTradeUnlink);
    const theoreticalDeleteButton = event.target.closest("[data-theoretical-trade-delete]");
    if (theoreticalDeleteButton) deleteTheoreticalTrade(theoreticalDeleteButton.dataset.theoreticalTradeDelete);
    if (event.target.closest("#detective-trade-dialog .dialog-close")) dialog.close();
  });
  dialog.querySelector("form").addEventListener("submit", saveTrade);
  if (supabase) {
    void loadTrades();
    void loadAccountLedger();
    supabase.auth.onAuthStateChange((event) => { if (event !== "SIGNED_IN") return; scheduleTradeLoad(100); });
  }
}

init();

window.addEventListener("aegis:data-changed", (event) => {
  if (event.detail?.source === "remote-trades") scheduleTradeLoad(180);
  if (event.detail?.source === "remote-accounts") setTimeout(loadAccountLedger, 120);
});
