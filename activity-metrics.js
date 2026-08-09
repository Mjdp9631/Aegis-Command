export const MIND_CATEGORIES = [
  "Book",
  "Quote",
  "Trading Note",
  "Psychology",
  "Space",
  "Philosophy",
  "Business",
  "Stoicism",
  "Leadership",
  "Communication",
  "History",
  "Systems Thinking",
];

export const BODY_CATEGORIES = ["Health", "Gym", "Mobility", "Performance", "Sports", "Outdoor Skills"];

export const MIND_AWARDS = {
  Book: 50,
  Quote: 5,
  "Trading Note": 20,
  Psychology: 15,
  Space: 10,
  Philosophy: 15,
  Business: 15,
  Stoicism: 12,
  Leadership: 18,
  Communication: 15,
  History: 15,
  "Systems Thinking": 20,
};

export const BODY_AWARDS = {
  Health: 15,
  Gym: 25,
  Mobility: 18,
  Performance: 30,
  Sports: 30,
  "Outdoor Skills": 20,
};

export function levelFromXp(xp) {
  let level = 0;
  let remaining = Math.max(0, Number(xp) || 0);
  let required = 40;
  while (remaining >= required) {
    remaining -= required;
    level += 1;
    required = Math.round(required * 1.09);
  }
  return { level, current: remaining, required, progress: (remaining / required) * 100 };
}

function isOnOrAfter(value, startedAt) {
  if (!startedAt) return false;
  const timestamp = new Date(value || 0).getTime();
  return !Number.isNaN(timestamp) && timestamp >= new Date(startedAt).getTime();
}

function campaignDay(value) {
  return value ? String(value).slice(0, 10) : "";
}

function isOnOrAfterCampaignDay(value, startedAt) {
  const day = campaignDay(value);
  if (!day || !startedAt) return false;
  return day >= new Date(startedAt).toLocaleDateString("en-CA");
}

function monthKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function closedTrade(trade) {
  return String(trade.account || "").trim().toLowerCase() !== "theoretical"
    && String(trade.trade_status || "").trim().toLowerCase() !== "open"
    && trade.pnl_percent != null;
}

export function tradingXp(trades = [], startedAt) {
  const totals = new Map();
  trades.filter((trade) => isOnOrAfter(trade.traded_at || trade.created_at, startedAt) && closedTrade(trade)).forEach((trade) => {
    const key = monthKey(trade.traded_at || trade.created_at);
    if (key) totals.set(key, (totals.get(key) || 0) + Number(trade.pnl_percent || 0));
  });
  const ledger = [];
  totals.forEach((pnl, month) => {
    const change = pnl > 0 ? Math.min(55, Math.round(pnl * 6)) : Math.max(-12, Math.round(pnl * 2));
    ledger.push({ label: month, detail: `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% PnL`, change });
  });
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export function disciplineXp(operations = [], occurrences = [], startedAt) {
  const days = new Map();
  const recurringIds = new Set(operations.filter((operation) => ["daily", "weekly", "recurring"].includes(String(operation.schedule_mode || "").toLowerCase())).map((operation) => String(operation.id)));
  const occurrenceRows = occurrences.map((occurrence) => {
    const parent = operations.find((operation) => String(operation.id) === String(occurrence.operation_id)) || {};
    return { ...parent, operation_date: occurrence.occurrence_date, scheduled_date: occurrence.occurrence_date, completed_on: occurrence.completed_on, completed: occurrence.completed, id: `occurrence:${occurrence.id}` };
  });
  const rows = [...operations.filter((operation) => !recurringIds.has(String(operation.id)) || !occurrences.some((occurrence) => String(occurrence.operation_id) === String(operation.id))), ...occurrenceRows];
  rows.forEach((operation) => {
    const dayKey = campaignDay(operation.operation_date || operation.completed_on || operation.scheduled_date);
    if (!dayKey || !isOnOrAfterCampaignDay(dayKey, startedAt)) return;
    if (/evening\s+(mission\s+)?debrief/i.test(operation.title || "")) return;
    const day = days.get(dayKey) || { total: 0, done: 0 };
    day.total += 1;
    if (operation.completed) day.done += 1;
    days.set(dayKey, day);
  });
  const ledger = [];
  days.forEach(({ total, done }, date) => {
    const rate = total ? done / total : 0;
    const change = rate >= 0.9 ? 6 : rate >= 0.75 ? 4 : rate >= 0.6 ? 2 : rate < 0.4 ? -1 : 0;
    ledger.push({ label: date, detail: `${done}/${total} operations - ${Math.round(rate * 100)}%`, change });
  });
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export function enterpriseXp(projects = [], contentItems = [], startedAt) {
  const ledger = [];
  projects.filter((project) => isOnOrAfter(project.created_at, startedAt) && project.status === "Complete").forEach((project) => ledger.push({ label: new Date(project.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `Completed project: ${project.title || "project"}`, change: 30 }));
  contentItems.filter((item) => isOnOrAfter(item.created_at, startedAt) && item.status === "Published").forEach((item) => ledger.push({ label: new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `Published ${item.platform || "content"}: ${item.title || "item"}`, change: 8 }));
  return { xp: ledger.reduce((total, entry) => total + entry.change, 0), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export function masteryXp(entries = [], challenges = [], trainingSessions = [], startedAt) {
  const ledgerFor = (awards) => entries.filter((entry) => isOnOrAfter(entry.created_at, startedAt) && awards[entry.category]).map((entry) => ({
    label: new Date(entry.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    detail: `${entry.category}: ${entry.title || "entry"}`,
    change: awards[entry.category],
  }));
  const mindLedger = ledgerFor(MIND_AWARDS);
  const bodyLedger = ledgerFor(BODY_AWARDS);
  trainingSessions.filter((session) => isOnOrAfter(session.created_at || session.logged_on, startedAt)).forEach((session) => {
    const category = session.session_type || "Gym";
    const change = BODY_AWARDS[category] || BODY_AWARDS.Gym;
    bodyLedger.push({ label: new Date(session.created_at || `${session.logged_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${category}: ${session.title || "training session"}`, change });
  });
  challenges.filter((challenge) => challenge.status === "completed" && isOnOrAfter(challenge.completed_at, startedAt) && Number(challenge.xp_reward || 0) > 0).forEach((challenge) => {
    const ledger = challenge.lane === "body" ? bodyLedger : mindLedger;
    ledger.push({ label: new Date(challenge.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${challenge.category || "Mastery"} transmission: ${challenge.title || "challenge"}`, change: Number(challenge.xp_reward) });
  });
  return {
    mind: { xp: mindLedger.reduce((total, entry) => total + entry.change, 0), ledger: mindLedger.sort((a, b) => b.label.localeCompare(a.label)) },
    body: { xp: bodyLedger.reduce((total, entry) => total + entry.change, 0), ledger: bodyLedger.sort((a, b) => b.label.localeCompare(a.label)) },
  };
}

export function characterMetrics(data = {}, startedAt) {
  const empty = { xp: 0, ledger: [] };
  if (!startedAt) return { discipline: empty, trading: empty, ccfx: empty, mastery: { mind: empty, body: empty }, totalXp: 0 };
  const discipline = disciplineXp(data.operations, data.occurrences, startedAt);
  const trading = tradingXp(data.trades, startedAt);
  const ccfx = enterpriseXp(data.projects, data.contentItems, startedAt);
  const mastery = masteryXp(data.masteryEntries, data.masteryChallenges, data.trainingSessions, startedAt);
  const totalXp = discipline.xp + trading.xp + ccfx.xp + mastery.mind.xp + mastery.body.xp;
  return { discipline, trading, ccfx, mastery, totalXp };
}
