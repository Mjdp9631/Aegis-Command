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
let groupWithdrawals = [];
let withdrawalAllocations = [];
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

function groupForAccountAt(accountId, timestamp) {
  const membership = membershipAt(accountId, timestamp);
  return membership ? accountGroups.find((group) => group.id === membership.group_id) || null : null;
}

function accountGroupAccounts(groupId) {
  return accountBalances.filter((account) => currentMembership(account.id)?.group_id === groupId);
}

function groupLinksForAccount(accountId) {
  return groupTradeLinks.filter((link) => {
    const trade = loadedTrades.find((item) => item.id === link.trade_id);
    return trade && membershipAt(accountId, trade.traded_at || trade.created_at)?.group_id === link.group_id;
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
  balance += groupLinksForAccount(account.id).reduce((total, link) => total + Number(link.actual_pnl_usd || 0), 0);
  balance -= withdrawalAllocations.filter((allocation) => allocation.account_id === account.id).reduce((total, allocation) => total + Number(allocation.gross_deduction_usd || 0), 0);
  return cents(balance);
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
  $("#account-balance-type").onchange = syncGroupOptionsForAccountType;
  host.querySelector("#account-group-type").onchange = syncGroupSplitVisibility;
  syncGroupOptionsForAccountType();
  syncGroupSplitVisibility();
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
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">No group</option>' + accountGroups.filter((group) => group.account_type === type).map((group) => `<option value="${group.id}">${escapeHtml(group.name)} · ${escapeHtml(group.account_type)}</option>`).join("");
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function tradeNumberFor(tradeId) {
  return [...loadedTrades].sort((a, b) => tradeTime(a) - tradeTime(b)).findIndex((trade) => trade.id === tradeId) + 1;
}

function closedUnlinkedTrades() {
  const linkedIds = new Set(groupTradeLinks.map((link) => link.trade_id));
  return loadedTrades.filter((trade) => !isTheoretical(trade) && resolvedOutcome(trade) !== "Open" && !linkedIds.has(trade.id));
}

function groupWithdrawalLedger(group) {
  return groupWithdrawals.filter((withdrawal) => withdrawal.group_id === group.id).sort((a, b) => new Date(b.withdrawn_at) - new Date(a.withdrawn_at));
}

function totalEarned() {
  return cents(groupWithdrawals.reduce((total, withdrawal) => {
    const group = accountGroups.find((item) => item.id === withdrawal.group_id);
    const included = group?.account_type === "Theoretical"
      ? withdrawal.include_in_total_earned === true
      : withdrawal.include_in_total_earned !== false;
    return total + (included ? Number(withdrawal.payout_total_usd || 0) : 0);
  }, 0));
}

function renderEarnedSummary() {
  const summary = $("#account-earned-summary");
  if (!summary) return;
  summary.querySelector("strong").textContent = money(totalEarned());
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
  summary.querySelector("[data-account-live-total]").textContent = money(liveTotal);
  summary.querySelector("[data-account-funded-total]").textContent = money(fundedTotal);
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
  renderTheoreticalTradeControls();
  setTimeout(decorateTheoreticalWithdrawalForms, 0);
  setTimeout(decoratePropStatusControls, 0);
  setTimeout(decorateGroupAdminControls, 0);
  const groups = accountGroups.map((group) => {
    const members = accountGroupAccounts(group.id);
    const total = members.reduce((sum, account) => sum + calculatedBalance(account), 0);
    const withdrawals = groupWithdrawalLedger(group);
    const links = groupTradeLinks.filter((link) => link.group_id === group.id);
    const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
    const tradeOptions = closedUnlinkedTrades().map((trade) => `<option value="${trade.id}">#${String(tradeNumberFor(trade.id)).padStart(3, "0")} · ${escapeHtml(trade.pair)} · ${escapeHtml(resolvedOutcome(trade))}</option>`).join("");
    const ledger = withdrawals.length ? withdrawals.map((withdrawal) => `<div class="withdrawal-ledger-row"><div><strong>${new Date(withdrawal.withdrawn_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong><small>${withdrawal.account_count} account${withdrawal.account_count === 1 ? "" : "s"} · ${Number(withdrawal.profit_split_percent).toFixed(2).replace(/\.00$/, "")}% payout${withdrawal.note ? ` · ${escapeHtml(withdrawal.note)}` : ""}</small></div><span><b>-${money(withdrawal.gross_total_usd)}</b><em>tracked ${money(withdrawal.payout_total_usd)}</em></span></div>`).join("") : '<p class="ledger-empty">No withdrawals recorded for this group.</p>';
    const memberRows = members.length ? members.map((account) => `<div class="group-account-row"><span>${escapeHtml(account.account_name)}${account.is_primary ? " · PRIMARY" : ""}</span><select data-account-move="${account.id}" aria-label="Move ${escapeHtml(account.account_name)}"><option value="${group.id}">${escapeHtml(group.name)}</option>${accountGroups.filter((candidate) => candidate.id !== group.id && candidate.account_type === account.account_type).map((candidate) => `<option value="${candidate.id}">${escapeHtml(candidate.name)}</option>`).join("")}</select><b>${money(calculatedBalance(account))}</b><span class="account-actions"><button type="button" class="account-action" data-account-edit="${account.id}">Edit</button><button type="button" class="account-action danger" data-account-delete="${account.id}">Delete</button></span></div>`).join("") : '<p class="ledger-empty">Add a matching account to activate this group.</p>';
    const linkRows = links.length ? links.map((link) => { const trade = loadedTrades.find((item) => item.id === link.trade_id); return `<div class="group-account-row"><span>#${String(tradeNumberFor(link.trade_id)).padStart(3, "0")} · ${escapeHtml(trade?.pair || "Trade")} · ${escapeHtml(resolvedOutcome(trade || {}))}</span><b>${Number(link.actual_pnl_usd) >= 0 ? "+" : ""}${money(link.actual_pnl_usd)} / acct</b></div>`; }).join("") : '<p class="ledger-empty">No group trades attached yet.</p>';
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
  const [accountsResult, groupsResult, membershipsResult, linksResult, withdrawalsResult, allocationsResult, testTradesResult] = await Promise.all([
    supabase.from("account_balances").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: true }),
    supabase.from("account_groups").select("*").order("created_at", { ascending: true }),
    supabase.from("account_group_memberships").select("*").order("joined_at", { ascending: true }),
    supabase.from("account_group_trade_links").select("*").order("created_at", { ascending: true }),
    supabase.from("account_group_withdrawals").select("*").order("withdrawn_at", { ascending: false }),
    supabase.from("account_group_withdrawal_allocations").select("*").order("created_at", { ascending: true }),
    supabase.from("account_test_trades").select("*").order("traded_at", { ascending: false })
  ]);
  if (accountsResult.error) { console.error(accountsResult.error); return; }
  accountBalances = (accountsResult.data || []).map((account) => ({ ...account, account_type: account.account_type || "Live" }));
  accountGroups = groupsResult.data || [];
  accountMemberships = membershipsResult.data || [];
  groupTradeLinks = linksResult.data || [];
  groupWithdrawals = withdrawalsResult.data || [];
  withdrawalAllocations = allocationsResult.data || [];
  accountTestTrades = testTradesResult.data || [];
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
  if (!accountName || !startingBalance || startingBalance <= 0) return;
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
  if (groupId && (!current || current.group_id !== groupId)) {
    const membershipResult = await supabase.from("account_group_memberships").insert({ user_id: userId, account_id: account.id, group_id: groupId });
    if (membershipResult.error) return alert(`The account was saved, but could not join the group: ${membershipResult.error.message}`);
  }
  event.target.reset();
  editingAccountId = null;
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
  const pnl = numberOrNull(form.querySelector(`[data-group-trade-pnl="${groupId}"]`)?.value);
  if (!tradeId || pnl == null || !Number.isFinite(pnl)) return alert("Choose a closed journal trade and enter its exact dollar PnL per account.");
  const { data: sessionData } = await supabase.auth.getSession();
  const { error } = await supabase.from("account_group_trade_links").insert({ user_id: sessionData.session.user.id, group_id: groupId, trade_id: tradeId, actual_pnl_usd: cents(pnl) });
  if (error) return alert(`The trade could not be attached: ${error.message}`);
  await loadAccountLedger();
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
  const accounts = accountGroupAccounts(groupId);
  const gross = numberOrNull(form.querySelector(`[data-withdrawal-gross="${groupId}"]`)?.value);
  const withdrawnAt = form.querySelector(`[data-withdrawal-date="${groupId}"]`)?.value;
  const note = form.querySelector(`[data-withdrawal-note="${groupId}"]`)?.value.trim() || null;
  const includeInEarned = group?.account_type === "Theoretical"
    ? Boolean(form.querySelector(`[data-withdrawal-include="${groupId}"]`)?.checked)
    : true;
  if (!group || !accounts.length) return alert("Add at least one matching account to this group before recording a withdrawal.");
  if (!gross || gross <= 0 || !withdrawnAt) return alert("Enter a positive gross withdrawal and date.");
  const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
  const net = cents(gross * split / 100);
  const { data: sessionData } = await supabase.auth.getSession();
  const withdrawalResult = await supabase.from("account_group_withdrawals").insert({ user_id: sessionData.session.user.id, group_id: groupId, withdrawn_at: isoFromLocalDateTime(withdrawnAt), gross_amount_per_account_usd: cents(gross), payout_amount_per_account_usd: net, gross_total_usd: cents(gross * accounts.length), payout_total_usd: cents(net * accounts.length), profit_split_percent: split, account_count: accounts.length, include_in_total_earned: includeInEarned, note }).select().single();
  if (withdrawalResult.error) return alert(`The withdrawal could not be recorded: ${withdrawalResult.error.message}`);
  const allocationResult = await supabase.from("account_group_withdrawal_allocations").insert(accounts.map((account) => ({ user_id: sessionData.session.user.id, withdrawal_id: withdrawalResult.data.id, account_id: account.id, gross_deduction_usd: cents(gross), payout_amount_usd: net })));
  if (allocationResult.error) {
    await supabase.from("account_group_withdrawals").delete().eq("id", withdrawalResult.data.id);
    return alert(`The withdrawal could not be allocated: ${allocationResult.error.message}`);
  }
  await loadAccountLedger();
  window.dispatchEvent(new CustomEvent("aegis:accounts-changed"));
}

function updateWithdrawalPreview(groupId) {
  const group = accountGroups.find((item) => item.id === groupId);
  const accounts = accountGroupAccounts(groupId);
  const gross = numberOrNull(document.querySelector(`[data-withdrawal-gross="${groupId}"]`)?.value);
  const preview = document.querySelector(`[data-withdrawal-preview="${groupId}"]`);
  if (!preview || !group || !gross || gross <= 0) return;
  const split = group.account_type === "Prop Firm" ? Number(group.profit_split_percent) : 100;
  preview.textContent = `Deduct ${money(gross * accounts.length)} total · track ${money(cents(gross * split / 100) * accounts.length)} net at ${split}% payout.`;
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

let tradeHoverTimer = null;
let focusedTradeRow = null;
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
  const fields = [
    ["Time", date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "—"], ["Pair", trade.pair],
    ["Type", trade.trade_type], ["Setup", displaySetup(trade.setup)], ["Market condition", trade.market_condition],
    ["CB hour", trade.cb_hour], ["MAE", displayNumber(trade.mae_30m)], ["MFE", displayNumber(trade.mfe_30m)],
    ["Risk / reward", displayNumber(trade.r_multiple, "R")], ["PnL", displayNumber(trade.pnl_percent, "%")],
    ["Outcome", trade.trade_status === "Open" ? "Open" : resolvedOutcome(trade)], ["Position", trade.position],
    ["Account", trade.account], ["Day", trade.trade_day], ["Month", trade.trade_month],
    ["Session time", trade.session_time], ["Entry timeframe", trade.entry_timeframe], ["Wick", trade.wick],
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
  renderGroupedAccountBalances();
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
  $("#detective-debrief-note").value = "";
  syncPlanAdherenceUi();
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
  if ($("#detective-debrief-note")) return;
  const saveButton = $("#save-detective-trade");
  if (!saveButton) return;
  saveButton.insertAdjacentHTML("beforebegin", `<label class="debrief-note-field">Debrief note<textarea id="detective-debrief-note" rows="3" placeholder="What happened, what did you notice, and what should the record remember?"></textarea></label>`);
}

function setSelectValue(selector, value) {
  const control = $(selector);
  if (value == null || value === "") return;
  const normalized = String(value);
  if (!Array.from(control.options).some((option) => option.value === normalized)) control.add(new Option(normalized, normalized));
  control.value = normalized;
}

function readTradeFormValues() {
  return {
    pair: $("#detective-pair").value.trim().toUpperCase(),
    setup: JSON.stringify(Array.from($("#detective-setup").selectedOptions).map((option) => option.value)),
    trade_type: $("#detective-type").value.trim() || null,
    market_condition: $("#detective-market-condition").value.trim() || null,
    cb_hour: $("#detective-cb-hour").value.trim() || null,
    r_multiple: numberOrNull($("#detective-r").value),
    pnl_percent: numberOrNull($("#detective-pnl").value),
    outcome: $("#detective-outcome").value === "Open" ? null : $("#detective-outcome").value,
    trade_status: $("#detective-outcome").value === "Open" ? "Open" : "Closed",
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
    violation_type: $("#detective-followed-plan").value === "no" ? $("#detective-violation-reason").value.trim() || null : null,
    debrief_note: $("#detective-debrief-note").value.trim() || null,
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
  if (trade.traded_at) $("#detective-time").value = localDateTimeValue(trade.traded_at);
  $("#detective-followed-plan").value = trade.plan_violation ? "no" : "yes";
  $("#detective-violation-reason").value = trade.violation_type || "";
  $("#detective-debrief-note").value = trade.debrief_note || "";
  syncPlanAdherenceUi();
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

async function saveTrade(event) {
  event.preventDefault();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("Please sign in before logging a trade.");
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
  delete payload.traded_at_local;
  if (timeChanged) payload.traded_at = isoFromLocalDateTime(formValues.traded_at_local, existingTrade?.traded_at || new Date().toISOString());
  if (isNewTrade) payload.execution_grade = "A";
  if (!isNewTrade && Object.keys(payload).length === 0) {
    $("#detective-trade-dialog").close();
    clearForm();
    $("#save-detective-trade").textContent = "Save debrief";
    return;
  }
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
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "trade-debrief" } }));
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
  wireTradeHoverFocus();
  wireTradeRowClick();
  buildFilters();
  const pnlMetric = $("#detective-violations").closest(".metric");
  pnlMetric.querySelector("p").textContent = "TOTAL PNL";
  pnlMetric.querySelector("small").textContent = "Sum across logged trades";
  $("#detective-excursion").closest(".metric").querySelector("p").textContent = "AVG MAE / MFE";
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
  document.addEventListener("input", (event) => { const input = event.target.closest("[data-withdrawal-gross]"); if (input) updateWithdrawalPreview(input.dataset.withdrawalGross); });
  document.addEventListener("change", (event) => {
    const move = event.target.closest("[data-account-move]");
    if (move) moveAccount(move.dataset.accountMove, move.value);
    const status = event.target.closest("[data-group-status]");
    if (status) updatePropStatus(status.dataset.groupStatus, status.value);
  });
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
    const accountEditButton = event.target.closest("[data-account-edit]");
    if (accountEditButton) editAccount(accountEditButton.dataset.accountEdit);
    const accountDeleteButton = event.target.closest("[data-account-delete]");
    if (accountDeleteButton) deleteAccount(accountDeleteButton.dataset.accountDelete);
    const groupEditButton = event.target.closest("[data-group-edit]");
    if (groupEditButton) editGroup(groupEditButton.dataset.groupEdit);
    const groupDeleteButton = event.target.closest("[data-group-delete]");
    if (groupDeleteButton) deleteGroup(groupDeleteButton.dataset.groupDelete);
    const theoreticalDeleteButton = event.target.closest("[data-theoretical-trade-delete]");
    if (theoreticalDeleteButton) deleteTheoreticalTrade(theoreticalDeleteButton.dataset.theoreticalTradeDelete);
    if (event.target.closest("#detective-trade-dialog .dialog-close")) dialog.close();
  });
  dialog.querySelector("form").addEventListener("submit", saveTrade);
  if (supabase) {
    loadTrades();
    loadAccountLedger();
    supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(loadTrades, 50); });
  }
}

init();
