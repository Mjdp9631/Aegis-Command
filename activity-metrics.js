export const MIND_CATEGORIES = [
  "Book",
  "Quote",
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

function easternDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(value, amount) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function trainingSessionDay(session) {
  const logged = campaignDay(session?.logged_on);
  const created = session?.created_at ? easternDateKey(new Date(session.created_at)) : "";
  return logged && created && logged === shiftDateKey(created, 1) ? created : logged || created;
}

function evidenceDay(record, explicitKey = "logged_on", createdKey = "created_at") {
  const explicit = campaignDay(record?.[explicitKey]);
  if (explicit) return explicit;
  const created = record?.[createdKey] ? easternDateKey(new Date(record[createdKey])) : "";
  return created || campaignDay(record?.[createdKey]);
}

function operatingDayKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  if (Number(parts.hour) < 5) date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
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

const TRADING_NOTE_AWARD = 5;

export function tradingXp(trades = [], tradingNotes = [], startedAt) {
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
  tradingNotes
    .filter((entry) => entry.category === "Trading Note" && isOnOrAfter(evidenceDay(entry), startedAt))
    .forEach((entry) => ledger.push({
      label: evidenceDay(entry),
      detail: `Trading Note: ${entry.title || "entry"} · process evidence XP`,
      change: TRADING_NOTE_AWARD,
    }));
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export function disciplineXp(operations = [], occurrences = [], startedAt) {
  const days = new Map();
  const recurringIds = new Set(operations.filter((operation) => ["daily", "weekly", "recurring"].includes(String(operation.schedule_mode || "").toLowerCase())).map((operation) => String(operation.id)));
  const occurrenceRows = occurrences.map((occurrence) => {
    const parent = operations.find((operation) => String(operation.id) === String(occurrence.operation_id)) || {};
    return { ...parent, operation_date: occurrence.occurrence_date, scheduled_date: occurrence.occurrence_date, scheduled_time: occurrence.scheduled_time || parent.scheduled_time, completed_on: occurrence.completed_on, completed: Boolean(occurrence.completed) || String(occurrence.status || "").toLowerCase() === "complete", status: occurrence.status, id: `occurrence:${occurrence.id}` };
  });
  const rows = [...operations.filter((operation) => !recurringIds.has(String(operation.id)) || !occurrences.some((occurrence) => String(occurrence.operation_id) === String(operation.id))), ...occurrenceRows];
  const uniqueRows = new Map();
  rows.forEach((operation) => {
    const key = String(operation.id || "").startsWith("occurrence:")
      ? String(operation.id)
      : [String(operation.title || "").trim().toLowerCase().replace(/\s+/g, " "), campaignDay(operation.scheduled_date || operation.operation_date), String(operation.scheduled_time || "").slice(0, 5), String(operation.mission_id || "")].join("|");
    const existing = uniqueRows.get(key);
    if (!existing || (!existing.completed && operation.completed)) uniqueRows.set(key, operation);
  });
  [...uniqueRows.values()].forEach((operation) => {
    const dayKey = campaignDay(operation.operation_date || operation.completed_on || operation.scheduled_date);
    // Do not penalize the active operating day or any future plan. The day is
    // not measurable until the 5 AM rollover makes it historical.
    if (!dayKey || dayKey >= operatingDayKey() || !isOnOrAfterCampaignDay(dayKey, startedAt)) return;
    if (/evening\s+(mission\s+)?debrief/i.test(operation.title || "")) return;
    const day = days.get(dayKey) || { total: 0, done: 0 };
    day.total += 1;
    if (operation.completed) day.done += 1;
    days.set(dayKey, day);
  });
  const ledger = [];
  days.forEach(({ total, done }, date) => {
    const rate = total ? done / total : 0;
    // Discipline is a daily operating score, so its reward is intentionally
    // larger than the previous 6/4/2 bands while remaining below one-off
    // mastery and project evidence rewards.
    const change = rate >= 0.9 ? 12 : rate >= 0.75 ? 8 : rate >= 0.6 ? 4 : rate < 0.4 ? -1 : 0;
    ledger.push({ label: date, detail: `${done}/${total} operations - ${Math.round(rate * 100)}%`, change });
  });
  return { xp: Math.max(0, ledger.reduce((total, entry) => total + entry.change, 0)), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export const PROJECT_COMPLETION_XP = Object.freeze({ Minor: 10, Standard: 25, Major: 50, Flagship: 100 });

const projectCompletionXp = (project) => {
  const stored = Number(project?.xp_reward);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return PROJECT_COMPLETION_XP[project?.effort_band] || PROJECT_COMPLETION_XP.Standard;
};

export function enterpriseXp(projects = [], contentItems = [], financialFoundation = null, startedAt) {
  const ledger = [];
  projects.filter((project) => isOnOrAfter(evidenceDay(project), startedAt)).forEach((project) => {
    const label = evidenceDay(project);
    if (project.status === "Complete" && project.project_mode !== "Ongoing system") {
      ledger.push({ label, detail: `Completed ${project.effort_band || "Standard"} project: ${project.title || "project"}`, change: projectCompletionXp(project) });
    }
  });
  contentItems.filter((item) => isOnOrAfter(evidenceDay(item), startedAt) && item.status === "Published").forEach((item) => ledger.push({ label: evidenceDay(item), detail: `Published ${item.platform || "content"}: ${item.title || "item"}`, change: 8 }));
  if (financialFoundation && isOnOrAfter(evidenceDay(financialFoundation), startedAt)) {
    ledger.push({ label: evidenceDay(financialFoundation), detail: "Financial foundation baseline recorded", change: 20 });
  }
  return { xp: ledger.reduce((total, entry) => total + entry.change, 0), ledger: ledger.sort((a, b) => b.label.localeCompare(a.label)) };
}

export function masteryXp(entries = [], challenges = [], trainingSessions = [], capabilityLogs = [], capabilityBenchmarkRewards = [], startedAt) {
  const ledgerFor = (awards) => entries.filter((entry) => isOnOrAfter(evidenceDay(entry), startedAt) && awards[entry.category]).map((entry) => ({
    label: evidenceDay(entry),
    detail: `${entry.category}: ${entry.title || "entry"} · base evidence XP`,
    change: awards[entry.category],
    evidenceKey: `entry|${evidenceDay(entry)}|${String(entry.category || "").toLowerCase()}|${String(entry.title || "entry").trim().toLowerCase()}`,
  }));
  const mindLedger = ledgerFor(MIND_AWARDS);
  const bodyLedger = ledgerFor(BODY_AWARDS);
  const uniqueTrainingSessions = new Map();
  trainingSessions.filter((session) => isOnOrAfter(trainingSessionDay(session), startedAt)).forEach((session) => {
    const category = session.session_type || "Gym";
    const day = trainingSessionDay(session);
    const title = String(session.title || "training session").trim().toLowerCase().replace(/\s+/g, " ");
    const key = `${day}|${String(category).toLowerCase()}|${title}`;
    if (uniqueTrainingSessions.has(key)) return;
    uniqueTrainingSessions.set(key, session);
    const change = BODY_AWARDS[category] || BODY_AWARDS.Gym;
    bodyLedger.push({ label: new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${category}: ${session.title || "training session"}`, change, evidenceKey: `training|${key}` });
  });
  challenges.filter((challenge) => challenge.status === "completed" && isOnOrAfter(challenge.completed_at, startedAt) && Number(challenge.xp_reward || 0) > 0).forEach((challenge) => {
    const ledger = challenge.lane === "body" ? bodyLedger : mindLedger;
    ledger.push({ label: new Date(challenge.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${challenge.category || "Mastery"} transmission: ${challenge.title || "challenge"} · bonus XP`, change: Number(challenge.xp_reward), evidenceKey: `challenge|${challenge.id || challenge.completed_at}` });
  });
  capabilityLogs.filter((log) => isOnOrAfter(log.practiced_on || log.created_at, startedAt)).forEach((log) => {
    const skillType = log.skill_type || log.capability_skills?.skill_type || "Practical";
    const skillTitle = log.skill_title || log.capability_skills?.title || "capability practice";
    const pressureBonus = log.pressure_level === "High" ? 3 : log.pressure_level === "Moderate" ? 1 : 0;
    const change = (skillType === "Adversarial" ? 12 : 10) + pressureBonus;
    const practiceDay = campaignDay(log.practiced_on || log.created_at);
    mindLedger.push({ label: new Date(`${practiceDay}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${skillType}: ${skillTitle} · practice evidence`, change, evidenceKey: `capability|${log.id || practiceDay}|${skillTitle}` });
  });
  capabilityBenchmarkRewards.filter((reward) => isOnOrAfter(reward.created_at, startedAt)).forEach((reward) => {
    const benchmark = reward.capability_benchmarks || {};
    const skill = benchmark.capability_skills || {};
    const day = campaignDay(reward.created_at);
    mindLedger.push({ label: new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), detail: `${skill.skill_type || "Capability"}: ${skill.title || "skill"} · ${benchmark.level || "benchmark"} tier`, change: Number(reward.xp_reward || benchmark.xp_reward || 0), evidenceKey: `capability-benchmark|${reward.id || `${reward.benchmark_id}|${reward.operation_id}`}` });
  });
  const uniqueBodyLedger = new Map();
  bodyLedger.forEach((entry) => {
    const key = entry.evidenceKey || `${entry.label}|${entry.detail}|${entry.change}`;
    if (!uniqueBodyLedger.has(key)) uniqueBodyLedger.set(key, entry);
  });
  const dedupedBodyLedger = [...uniqueBodyLedger.values()].map(({ evidenceKey, ...entry }) => entry);
  return {
    mind: { xp: mindLedger.reduce((total, entry) => total + entry.change, 0), ledger: mindLedger.sort((a, b) => b.label.localeCompare(a.label)) },
    body: { xp: dedupedBodyLedger.reduce((total, entry) => total + entry.change, 0), ledger: dedupedBodyLedger.sort((a, b) => b.label.localeCompare(a.label)) },
  };
}

export function characterMetrics(data = {}, startedAt) {
  const empty = { xp: 0, ledger: [] };
  if (!startedAt) return { discipline: empty, trading: empty, ccfx: empty, mastery: { mind: empty, body: empty }, totalXp: 0 };
  const discipline = disciplineXp(data.operations, data.occurrences, startedAt);
  const trading = tradingXp(data.trades, data.masteryEntries, startedAt);
  const ccfx = enterpriseXp(data.projects, data.contentItems, data.financialFoundation, startedAt);
  const mastery = masteryXp(data.masteryEntries, data.masteryChallenges, data.trainingSessions, data.capabilityLogs, data.capabilityBenchmarkRewards, startedAt);
  const totalXp = discipline.xp + trading.xp + ccfx.xp + mastery.mind.xp + mastery.body.xp;
  return { discipline, trading, ccfx, mastery, totalXp };
}
