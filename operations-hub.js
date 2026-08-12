import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * Independent operations feed.  It deliberately owns only the queue and the
 * calendar, so a non-critical feature elsewhere cannot leave Mission Control
 * empty.
 */
const cfg = window.AEGIS_CONFIG || {};
const client = cfg.supabaseUrl && cfg.supabaseAnonKey
  ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
  : null;
const $ = (selector) => document.querySelector(selector);
// All daily decisions belong to the director's timezone, not the browser or
// Vercel server timezone. This prevents old dates and premature rollovers.
const dayKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayKey = () => dayKey();
const newYorkHour = (date = new Date()) => Number(new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23",
}).format(date));
// Use an instant that is safely inside the New York calendar day.  Parsing a
// bare YYYY-MM-DD string otherwise lets the browser timezone move labels back
// a day for some visitors.
const dateForKey = (key) => key ? new Date(`${key}T17:00:00.000Z`) : null;
// AEGIS operates on a 5 AM boundary.  Between midnight and 4:59 AM, the
// previous day's operations remain active so the bedtime review can include
// late work without creating or displaying the next day's plan early.
const operatingDayKey = (date = new Date()) => {
  const key = dayKey(date);
  if (newYorkHour(date) >= 5) return key;
  const previous = dateForKey(key);
  previous?.setUTCDate(previous.getUTCDate() - 1);
  return previous ? dayKey(previous) : key;
};
const morningRolloverReached = () => newYorkHour() >= 5;
const BEDTIME_WINDOW_MS = 9 * 60 * 60 * 1000;
const bedtimeStorageKey = (key) => `aegis-bedtime:${currentUser?.id || "anonymous"}:${key}`;
const shiftDayKey = (key, amount) => {
  const date = dateForKey(key);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return dayKey(date);
};
let bedtimeRecords = new Map();
function rememberCachedBedtime(day, value) {
  if (!day || !value || Number.isNaN(Date.parse(value))) return;
  bedtimeRecords.set(day, value);
  try { localStorage.setItem(bedtimeStorageKey(day), value); } catch { /* optional cache */ }
}
function bedtimeForDay(day) {
  if (!day) return null;
  const remembered = bedtimeRecords.get(day);
  if (remembered) return remembered;
  try {
    const stored = localStorage.getItem(bedtimeStorageKey(day));
    if (stored && !Number.isNaN(Date.parse(stored))) {
      bedtimeRecords.set(day, stored);
      return stored;
    }
  } catch { /* optional cache */ }
  return null;
}
async function loadBedtimeRecords() {
  bedtimeRecords = new Map();
  const today = operatingDayKey();
  for (let offset = -14; offset <= 2; offset += 1) bedtimeForDay(shiftDayKey(today, offset));
  if (!client || !currentUser) return;
  let { data, error } = await client.from("ai_advisories")
    .select("advisory_type, operating_date, payload, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(40);
  // Projects that have not applied the bedtime migration can still recover
  // the timestamp from the JSON payload written by ai-advisory.js.
  if (error) {
    ({ data, error } = await client.from("ai_advisories")
      .select("advisory_type, payload, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(40));
  }
  if (error) {
    console.warn("Could not load bedtime records", error.message);
    return;
  }
  (data || []).forEach((row) => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    if (row.advisory_type !== "bedtime" && payload.scan_mode !== "bedtime") return;
    rememberCachedBedtime(row.operating_date || payload.operating_date, payload.bedtime_at || payload.completed_at || row.created_at);
  });
}
window.addEventListener("aegis:bedtime-recorded", (event) => {
  const { operatingDate, bedtimeAt } = event.detail || {};
  rememberCachedBedtime(operatingDate, bedtimeAt);
  renderQueue();
});
const formatKey = (key, options = { month: "short", day: "numeric" }) => {
  const date = dateForKey(key);
  return date ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...options }).format(date) : "";
};
const newYorkTodayDate = () => dateForKey(todayKey());
const syncSystemDate = () => {
  const label = $("#system-date");
  if (!label) return;
  label.textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
  }).format(new Date()).toUpperCase().replace(",", " ·");
};
let currentUser = null;
let operationsReady = false;
const operationsCacheKey = () => `aegis-operations:${currentUser?.id || "anonymous"}`;
const cachedOperations = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(operationsCacheKey()) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};
const saveCachedOperations = () => localStorage.setItem(operationsCacheKey(), JSON.stringify(operations));
const esc = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
// Claim the queue before legacy dashboard code has a chance to repaint it.
window.AEGIS_OPERATIONS_HUB_ACTIVE = true;
const statusOrder = ["Queued", "Scheduled", "Ongoing", "Complete", "Missed"];
const LONG_RUNNING_OPERATION_DAYS = 3;
const priorityFor = (category) => category === "Recovery" || category === "Trading" ? "High" : "Medium";
const operationCategories = new Set(["Recovery", "Trading", "Business", "Self Mastery", "Life Admin"]);
const canonicalOperationCategory = (value) => {
  const category = String(value || "").trim().toLowerCase();
  if (category === "mind" || category === "body" || category === "mastery" || category === "self mastery") return "Self Mastery";
  if (category === "life admin" || category === "day to day" || category === "day-to-day") return "Life Admin";
  if (category === "recovery" || category === "trading" || category === "business") return category.replace(/^./, (letter) => letter.toUpperCase());
  return "";
};
const operationCategoryForTitle = (title = "") => {
  const name = String(title).toLowerCase();
  if (/physical therapy|\bpt\b|orthopedic|acl|rehab|recovery|mobility/.test(name)) return "Recovery";
  if (/trade|trading|pre-market|pre market|chart|backtest|risk limit|market plan/.test(name)) return "Trading";
  if (/business|ccfx|content|project|enterprise|publish|deep-work|deep work/.test(name)) return "Business";
  if (/dentist|doctor appointment|appointment|lunch|errand|grocery|tax|bill|commute/.test(name)) return "Life Admin";
  if (/read one chapter|read chapter|chapter|conquer the morning|^journal$|mission debrief|meditat|mobility practice/.test(name)) return "Self Mastery";
  return "";
};
const operationCategory = (operation, mission = null) => {
  const titleCategory = operationCategoryForTitle(operation?.title);
  if (titleCategory) return titleCategory;
  const missionCategory = canonicalOperationCategory(mission?.category);
  if (missionCategory) return missionCategory;
  return canonicalOperationCategory(operation?.category) || operationCategoryForTitle(operation?.title) || "Self Mastery";
};
const metricAliases = {
  pt_session: ["pt_session", "recovery.pt_session", "recovery.report"],
  chapters_read: ["chapters_read", "mastery.book", "mind.book"],
  gym_session: ["gym_session", "body.gym", "mastery.gym"],
  trading_trade: ["trading.trade", "trading.review", "trade_review"],
  mastery_entry: ["mastery.entry", "mastery.journal", "mind.entry"],
  recovery_report: ["recovery.report", "recovery.pt_session"],
};
const metricsMatch = (missionMetric, operationMetric) => {
  const missionKey = String(missionMetric || "").toLowerCase();
  const operationKey = String(operationMetric || "").toLowerCase();
  if (!missionKey || !operationKey) return false;
  if (missionKey === operationKey) return true;
  return (metricAliases[missionKey] || [missionKey]).includes(operationKey)
    || (metricAliases[operationKey] || [operationKey]).includes(missionKey);
};
const inferredMetricForOperation = (operation) => {
  const title = String(operation?.title || "").toLowerCase();
  const explicit = String(operation?.metric_key || "").toLowerCase();
  if (explicit && !["operation.complete", "operation_completion"].includes(explicit)) return explicit;
  if (/physical therapy|\bpt\b|orthopedic|acl|rehab/.test(title)) return "pt_session";
  if (/read one chapter|read chapter|chapter/.test(title)) return "chapters_read";
  if (/gym|workout|strength training|resistance/.test(title)) return "gym_session";
  if (/trade|trading|pre-market|chart|backtest/.test(title)) return "trading.trade";
  if (/^journal$|journal|mind entry|self mastery entry/.test(title)) return "mastery.entry";
  if (/recovery report|log recovery|pain|swelling/.test(title)) return "recovery.report";
  return explicit || null;
};
const dateOnly = (value) => value ? String(value).slice(0, 10) : "";
const newYorkWeekday = (date = new Date()) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short",
}).format(date);
const isPreMarketDay = (date = new Date()) => !["Fri", "Sat"].includes(newYorkWeekday(date));

function operationIsOngoing(operation) {
  return !operation?.completed
    && String(operation?.status || "").toLowerCase() === "ongoing"
    && !operation?._occurrence?.completed;
}

function ongoingStartDay(operation, fallback = operatingDayKey()) {
  return dateOnly(operation?.started_on || operation?._occurrence?.started_on || operation?._base?.started_on || operation?.scheduled_date || operation?._base?.scheduled_date || operation?.operation_date || operation?._base?.operation_date) || fallback;
}

function ongoingDays(operation, day = operatingDayKey()) {
  const start = dateForKey(ongoingStartDay(operation, day));
  const end = dateForKey(day);
  if (!start || !end || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function ongoingDisplayOperation(operation, day = operatingDayKey()) {
  if (!operationIsOngoing(operation)) return operation;
  const started = ongoingStartDay(operation, day);
  const days = ongoingDays(operation, day);
  return {
    ...operation,
    _base: operation,
    scheduled_date: day,
    operation_date: day,
    ongoing_since: started,
    ongoing_days: days,
    needs_attention: days >= LONG_RUNNING_OPERATION_DAYS,
  };
}

function completedDisplayOperation(operation) {
  const completedOn = dateOnly(operation?.completed_on || operation?._occurrence?.completed_on);
  const complete = Boolean(operation?.completed || operation?._occurrence?.completed)
    || String(operation?.status || operation?._occurrence?.status || "").toLowerCase() === "complete";
  return complete && completedOn
    ? { ...operation, scheduled_date: completedOn, operation_date: completedOn }
    : operation;
}

// Scheduling uses one durable start date plus an optional repeat rule. The
// database keeps the historical value "recurring"; the UI calls it weekly.
// Keeping the interpretation here means the queue and calendar cannot drift
// apart when a row was created by an older version of the app.
function scheduleMode(operation) {
  const source = operation?._series || operation;
  const mode = String(source?.schedule_mode || "one_time").toLowerCase();
  if (mode === "daily") return "daily";
  if (mode === "weekly" || mode === "recurring") return "weekly";
  return "one_time";
}

function isScheduledOn(operation, key) {
  if (operationIsOngoing(operation)) return key === operatingDayKey();
  // A recurring series is materialized into independent occurrence rows. Each
  // occurrence is only valid for its own date; never let the parent status
  // bleed across the rest of the series.
  if (operation?._occurrence) return dateOnly(operation.scheduled_date) === key;
  // Daily command-center rows are durable per-day records and historically
  // used operation_date without scheduled_date. Treat that date as the
  // calendar anchor so completed prior-day daily work remains visible.
  const start = dateOnly(operation?.scheduled_date || (operation?.is_daily ? operation?.operation_date : ""));
  if (!start || !key || key < start) return false;
  const end = dateOnly(operation?.scheduled_end_date);
  if (end && key > end) return false;
  const mode = scheduleMode(operation);
  if (mode === "one_time") return key === start;
  if (mode === "daily") return true;
  const startDate = dateForKey(start);
  const keyDate = dateForKey(key);
  return Boolean(startDate && keyDate && startDate.getUTCDay() === keyDate.getUTCDay());
}

function nextScheduledDate(operation, fromKey = todayKey(), includeFrom = true, maxDays = 370) {
  if (!dateOnly(operation?.scheduled_date)) return "";
  const cursor = dateForKey(fromKey);
  if (!cursor) return "";
  if (!includeFrom) cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let index = 0; index <= maxDays; index += 1) {
    const key = dayKey(cursor);
    if (isScheduledOn(operation, key)) return key;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return "";
}

function scheduleLabel(operation, fromKey = todayKey()) {
  const next = nextScheduledDate(operation, fromKey, true);
  if (!next) return "+ Schedule";
  const date = formatKey(next);
  const time = operation.scheduled_time ? ` · ${String(operation.scheduled_time).slice(0, 5)}` : "";
  return `${date}${time}`;
}

// Forex preparation is deliberate calendar work, not a generic everyday
// placeholder.  It belongs at 18:00 ET Sunday through Thursday only.
const preMarketOperationForToday = () => {
  const operationDay = operatingDayKey();
  return isPreMarketDay(dateForKey(operationDay)) ? ({
  title: "Pre-market analysis",
  category: "Trading",
  priority: "High",
  brief: "Mark the higher-timeframe condition, key liquidity/reaction levels, and the valid setup before active price reaches the area.",
  status: "Scheduled",
  completed: false,
  is_daily: true,
  operation_date: operationDay,
  scheduled_date: operationDay,
  scheduled_time: "18:00",
  schedule_mode: "recurring",
  }) : null;
};

const starterOperations = () => {
  return [
    ...(preMarketOperationForToday() ? [["Pre-market analysis", "Trading"]] : []),
    ["Review charts and document one lesson", "Trading"],
    ["Conquer the morning", "Self Mastery"],
    ["Read one chapter", "Self Mastery"],
    ["Journal", "Self Mastery"],
    ["Complete evening mission debrief", "Self Mastery"],
  ].map(([title, category]) => title === "Pre-market analysis"
    ? preMarketOperationForToday()
    : ({ title, category, completed: false, scheduled_date: operatingDayKey(), scheduled_time: null, operation_date: operatingDayKey(), is_daily: true, status: "Queued" }))
    .concat(gymOperationForToday());
};

const gymSplitForToday = () => {
  const split = ["Rest", "Legs", "Push", "Pull", "Rest", "Upper Body", "Lower Body"];
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(dateForKey(operatingDayKey()));
  return split[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)];
};
const gymOperationForToday = () => {
  const split = gymSplitForToday();
  const isRest = split === "Rest";
  return {
    title: isRest ? "Recovery — rest and reset" : `Gym — ${split}`,
    category: isRest ? "Recovery" : "Self Mastery",
    priority: isRest ? "Medium" : "High",
    status: "Queued",
    completed: false,
    is_daily: true,
    operation_date: operatingDayKey(),
    scheduled_date: operatingDayKey(),
    brief: isRest
      ? "Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan."
      : `Complete the ${split} session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.`,
  };
};

let operations = [];
let operationOccurrences = [];
let missions = [];
let currentBook = null;
let cursor = newYorkTodayDate();
let selectedDay = operatingDayKey();

const occurrenceCacheKey = () => `aegis-operation-occurrences:${currentUser?.id || "anonymous"}`;
const cachedOccurrences = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(occurrenceCacheKey()) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};
const saveCachedOccurrences = () => localStorage.setItem(occurrenceCacheKey(), JSON.stringify(operationOccurrences));
function announceOperationsLoaded() {
  window.AEGIS_OPERATIONS = operations;
  window.dispatchEvent(new CustomEvent("aegis:operations-loaded", { detail: { operations, source: "operations-hub" } }));
}

function occurrenceIdentity(row) {
  return `${String(row?.operation_id || "")}|${dateOnly(row?.occurrence_date)}`;
}

function cachedOccurrenceIsCurrent(row) {
  const key = dateOnly(row?.occurrence_date);
  if (!key) return false;
  const series = operations.find((operation) => String(operation.id) === String(row.operation_id));
  // Occurrences are historical calendar records as well as live queue rows.
  // Keep prior-day entries when a refresh has to use the local cache.
  if (!series) return true;
  const end = dateOnly(series.scheduled_end_date);
  return !end || key <= end;
}

function recurringDateKeys(operation, maxDays = 370) {
  const start = dateOnly(operation?.scheduled_date);
  if (!start) return [];
  // Repeating schedules remain active until an explicit end date. Materialize
  // a bounded horizon so weekly/daily instances are independently trackable
  // without creating an unbounded insert.
  let end = dateOnly(operation?.scheduled_end_date);
  if (!end && scheduleMode(operation) !== "one_time") {
    const horizon = dateForKey(start);
    horizon.setUTCDate(horizon.getUTCDate() + maxDays);
    end = dayKey(horizon);
  }
  end = end || start;
  const startDate = dateForKey(start);
  const endDate = dateForKey(end);
  if (!startDate || !endDate || endDate < startDate) return [];
  const keys = [];
  const cursor = new Date(startDate);
  for (let index = 0; index <= maxDays && cursor <= endDate; index += 1) {
    const key = dayKey(cursor);
    if (isScheduledOn({ ...operation, _occurrence: null }, key)) keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function operationInstances() {
  const instances = [];
  operations.forEach((operation) => {
    if (scheduleMode(operation) === "one_time" || !operation.id || String(operation.id).startsWith("local-")) {
      instances.push(ongoingDisplayOperation(completedDisplayOperation(operation)));
      return;
    }
    const rows = operationOccurrences.filter((row) => String(row.operation_id) === String(operation.id));
    if (!rows.length) {
      // Before migration 044 is run, retain a safe single display instance;
      // after it runs, every scheduled date gets its own durable row.
      const first = recurringDateKeys(operation, 0)[0];
      if (first) instances.push(ongoingDisplayOperation(completedDisplayOperation({ ...operation, id: `virtual:${operation.id}:${first}`, _series: operation, _occurrence: { occurrence_date: first, status_override: false }, scheduled_date: first, status: operation.status, completed: operation.completed })));
      return;
    }
    rows.forEach((row) => instances.push(ongoingDisplayOperation(completedDisplayOperation({
      ...operation,
      id: `occurrence:${row.id}`,
      _series: operation,
      _occurrence: row,
      scheduled_date: row.occurrence_date,
      scheduled_time: row.scheduled_time || operation.scheduled_time,
      status: row.status || "Scheduled",
      completed: Boolean(row.completed),
      completed_on: row.completed_on || null,
      status_override: Boolean(row.status_override),
    }))));
  });
  return instances;
}

function operationDisplayIdentity(operation) {
  if (operation?._occurrence?.id) return `occurrence:${operation._occurrence.id}`;
  const title = String(operation?.title || "").trim().toLowerCase().replace(/\s+/g, " ");
  const date = dateOnly(operation?.scheduled_date) || dateOnly(operation?.operation_date) || "standing";
  const time = String(operation?.scheduled_time || "").slice(0, 5);
  const mission = String(operation?.mission_id || operation?._series?.mission_id || "");
  return [title, date, time, mission].join("|");
}

function reconcileOperationIdentity(operation) {
  const before = `${operation?.category || ""}|${operation?.mission_id || ""}|${operation?.metric_key || ""}`;
  attachMissionLink(operation);
  const after = `${operation?.category || ""}|${operation?.mission_id || ""}|${operation?.metric_key || ""}`;
  return before !== after;
}

function dedupeOperationInstances(items) {
  const unique = new Map();
  items.forEach((operation) => {
    const key = operationDisplayIdentity(operation);
    const existing = unique.get(key);
    const completion = normalizedStatus(operation) === "Complete" || operation.completed ? 1 : 0;
    const timestamp = Date.parse(operation.updated_at || operation.created_at || operation.local_updated_at || 0) || 0;
    const existingCompletion = existing && (normalizedStatus(existing) === "Complete" || existing.completed) ? 1 : 0;
    const existingTimestamp = Date.parse(existing?.updated_at || existing?.created_at || existing?.local_updated_at || 0) || 0;
    if (!existing || completion > existingCompletion || (completion === existingCompletion && timestamp >= existingTimestamp)) {
      unique.set(key, operation);
    }
  });
  return [...unique.values()];
}

function duplicateScheduledOperation(candidate) {
  if (scheduleMode(candidate) !== "one_time" || !dateOnly(candidate?.scheduled_date)) return null;
  const candidateKey = operationDisplayIdentity(candidate);
  return dedupeOperationInstances(operationInstances()).find((operation) => (
    String(operation.id || "") !== String(candidate.id || "")
    && scheduleMode(operation) === "one_time"
    && operationDisplayIdentity(operation) === candidateKey
  )) || null;
}

async function loadOccurrences() {
  if (!client || !currentUser) {
    operationOccurrences = cachedOccurrences();
    return;
  }
  const { data, error } = await client.from("operation_occurrences").select("*").eq("user_id", currentUser.id);
  if (error) {
    // Migration 044 may not have been run yet. Keep the legacy view usable and
    // avoid replacing valid operations with an empty queue.
    console.warn("Could not load operation occurrences", error.message);
    operationOccurrences = cachedOccurrences();
    return;
  }
  // Keep locally-created current/future rows while Supabase catches up. This
  // prevents scheduled dates from disappearing after leaving/reopening the
  // calendar, including completed prior-day occurrences.
  const merged = new Map((Array.isArray(data) ? data : []).map((row) => [occurrenceIdentity(row), row]));
  for (const row of cachedOccurrences().filter(cachedOccurrenceIsCurrent)) {
    const key = occurrenceIdentity(row);
    const remote = merged.get(key);
    if (!remote) {
      merged.set(key, row);
      continue;
    }
    // A completed cloud occurrence is authoritative. An older browser can
    // still have a stale queued/missed cache entry with a later local stamp;
    // never let that stale cache undo a completion made elsewhere.
    if ((Boolean(remote.completed) || String(remote.status || "").toLowerCase() === "complete") && !row.status_override) continue;
    // Authenticated browsers use Supabase as the shared source of truth. If a
    // cached row has a newer explicit click than the remote snapshot, first
    // reconcile that pending click to Supabase; otherwise the remote row wins.
    const localStamp = Date.parse(row.local_updated_at || 0) || Number(row.local_updated_at) || 0;
    const remoteStamp = Date.parse(remote.updated_at || remote.created_at || 0) || 0;
    if (localStamp > remoteStamp && row.id) {
      const { data: synced, error: syncError } = await client.from("operation_occurrences")
        .update({ status: row.status, completed: Boolean(row.completed), completed_on: row.completed_on || null, status_override: Boolean(row.status_override), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", currentUser.id)
        .select()
        .single();
      if (!syncError && synced) merged.set(key, synced);
    }
  }
  operationOccurrences = [...merged.values()];
  saveCachedOccurrences();
}

async function markExpiredOperationsMissed() {
  const today = operatingDayKey();
  if (!today) return false;
  const changedOperations = operations.filter((operation) => {
    if (scheduleMode(operation) !== "one_time" || operation.status_override) return false;
    const date = dateOnly(operation.scheduled_date || operation.operation_date);
    const status = String(operation.status || "").toLowerCase();
    return Boolean(date && date < today && !operation.completed && status !== "complete" && status !== "ongoing" && status !== "missed");
  });
  const changedOccurrences = operationOccurrences.filter((occurrence) => {
    const date = dateOnly(occurrence.occurrence_date);
    const status = String(occurrence.status || "").toLowerCase();
    return Boolean(date && date < today && !occurrence.status_override && !occurrence.completed && status !== "complete" && status !== "ongoing" && status !== "missed");
  });
  if (!changedOperations.length && !changedOccurrences.length) return false;

  changedOperations.forEach((operation) => Object.assign(operation, {
    status: "Missed",
    completed: false,
    completed_on: null,
    status_override: false,
  }));
  changedOccurrences.forEach((occurrence) => Object.assign(occurrence, {
    status: "Missed",
    completed: false,
    completed_on: null,
    status_override: false,
  }));
  saveCachedOperations();
  saveCachedOccurrences();

  if (!client || !currentUser) return true;
  const writes = [
    ...changedOperations.filter((operation) => operation.id && !String(operation.id).startsWith("local-")).map((operation) =>
      client.from("operations").update({ status: "Missed", completed: false, completed_on: null, status_override: false, updated_at: new Date().toISOString() }).eq("id", operation.id).eq("user_id", currentUser.id)
    ),
    ...changedOccurrences.filter((occurrence) => occurrence.id).map((occurrence) =>
      client.from("operation_occurrences").update({ status: "Missed", completed: false, completed_on: null, status_override: false, updated_at: new Date().toISOString() }).eq("id", occurrence.id).eq("user_id", currentUser.id)
    ),
  ];
  const results = await Promise.all(writes);
  results.filter((result) => result.error).forEach((result) => console.warn("Could not mark expired operation Missed", result.error.message));
  return true;
}

async function ensureRecurringOccurrences() {
  if (!client || !currentUser || !operationOccurrences) return;
  const desired = [];
  operations.filter((operation) => scheduleMode(operation) !== "one_time" && operation.id && !String(operation.id).startsWith("local-")).forEach((operation) => {
    recurringDateKeys(operation).forEach((date) => desired.push({ user_id: currentUser.id, operation_id: operation.id, occurrence_date: date, scheduled_time: operation.scheduled_time || null }));
  });
  if (!desired.length) return;
  const existing = new Set(operationOccurrences.map((row) => `${row.operation_id}|${dateOnly(row.occurrence_date)}`));
  const missing = desired.filter((row) => !existing.has(`${row.operation_id}|${row.occurrence_date}`));
  if (!missing.length) return;
  const { data, error } = await client.from("operation_occurrences").insert(missing).select();
  if (!error && data?.length) operationOccurrences = [...operationOccurrences, ...data];
  saveCachedOccurrences();
}

async function reconcileRecurringCompletion() {
  const completedSeries = operations.filter((operation) => scheduleMode(operation) !== "one_time" && operation.id && !String(operation.id).startsWith("local-") && Boolean(operation.completed) && dateOnly(operation.completed_on || operation.local_completed_on));
  for (const series of completedSeries) {
    const completedDay = dateOnly(series.completed_on || series.local_completed_on);
    const occurrence = operationOccurrences.find((row) => String(row.operation_id) === String(series.id) && dateOnly(row.occurrence_date) === completedDay);
    if (!occurrence || Boolean(occurrence.completed)) continue;
    Object.assign(occurrence, { status: "Complete", completed: true, completed_on: completedDay });
    if (client && currentUser) {
      const { error } = await client.from("operation_occurrences")
        .update({ status: "Complete", completed: true, completed_on: completedDay, updated_at: new Date().toISOString() })
        .eq("id", occurrence.id)
        .eq("user_id", currentUser.id);
      if (error) console.warn("Could not reconcile recurring operation completion", error.message);
    }
  }
  saveCachedOccurrences();
}

let operationSyncChannel = null;
let operationSyncInFlight = false;
async function refreshDurableOperationState() {
  if (!client || !currentUser || operationSyncInFlight) return;
  operationSyncInFlight = true;
  try {
    const [operationResult, occurrenceResult] = await Promise.all([
      client.from("operations").select("*").eq("user_id", currentUser.id).order("scheduled_date", { ascending: true }).order("created_at", { ascending: true }),
      client.from("operation_occurrences").select("*").eq("user_id", currentUser.id),
    ]);
    if (operationResult.error || occurrenceResult.error) return;
    const remoteOperations = Array.isArray(operationResult.data) ? operationResult.data : null;
    const remoteOccurrences = Array.isArray(occurrenceResult.data) ? occurrenceResult.data : null;
    if (!remoteOperations || !remoteOccurrences) return;
    // Realtime can deliver an event while the auth/session snapshot is still
    // settling. Never turn a populated queue into an empty one because of
    // that transient response; the next realtime event or boot will retry.
    if (!remoteOperations.length && operations.length) return;
    if (!remoteOccurrences.length && operationOccurrences.length) return;
    // A realtime/focus refresh returns only durable rows.  The initial boot
    // also repairs the current day's standing operations (morning, journal,
    // reading, gym, and evening debrief).  Replacing the repaired queue with
    // the raw snapshot made those rows flash in, then disappear seconds later.
    // Reconcile the snapshot through the same path as boot so every refresh
    // has the same complete queue shape.
    operations = await ensureTodayOperations(await reconcileCachedOperationEdits(remoteOperations));
    operationOccurrences = remoteOccurrences;
    await syncOperationMissionLinks();
    await markExpiredOperationsMissed();
    await rollOverOngoingOperations();
    await reconcileRecurringCompletion();
    saveCachedOperations();
    announceOperationsLoaded();
    renderQueue();
    renderCalendar();
  } finally {
    operationSyncInFlight = false;
  }
}

function subscribeToOperationSync() {
  if (!client || !currentUser || typeof client.channel !== "function") return;
  try {
    if (operationSyncChannel) client.removeChannel(operationSyncChannel);
    operationSyncChannel = client.channel(`aegis-operation-sync-${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "operations", filter: `user_id=eq.${currentUser.id}` }, () => { void refreshDurableOperationState(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "operation_occurrences", filter: `user_id=eq.${currentUser.id}` }, () => { void refreshDurableOperationState(); })
      .subscribe();
  } catch (error) {
    // Realtime is an enhancement only. A channel failure must not abort boot
    // or replace the already-renderable local/cloud queue with starter data.
    console.warn("Operation realtime sync unavailable", error);
    operationSyncChannel = null;
  }
}

let operationRefreshTimer = null;
function scheduleDurableOperationRefresh() {
  if (!client || !currentUser) return;
  clearTimeout(operationRefreshTimer);
  operationRefreshTimer = setTimeout(() => { void refreshDurableOperationState(); }, 80);
}

window.addEventListener("focus", scheduleDurableOperationRefresh);
window.addEventListener("online", scheduleDurableOperationRefresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleDurableOperationRefresh();
});
window.addEventListener("storage", (event) => {
  if (event.key === operationsCacheKey() || event.key === occurrenceCacheKey()) scheduleDurableOperationRefresh();
});

function normalizedStatus(operation) {
  if (operation.completed || String(operation.status || "").toLowerCase() === "complete") return "Complete";
  if (operation._occurrence?.completed || String(operation._occurrence?.status || "").toLowerCase() === "complete") return "Complete";
  const operationDay = dateOnly(operation?.scheduled_date || operation?.operation_date);
  const operationCompletion = dateOnly(operation.completed_on || operation.local_completed_on || operation._occurrence?.completed_on);
  if (operationCompletion && (!operationDay || operationCompletion === operationDay)) return "Complete";
  const series = operation?._series;
  const instanceDay = operationDay;
  if (series && series !== operation && !operation?._occurrence?.status_override && (Boolean(series.completed) || String(series.status || "").toLowerCase() === "complete") && dateOnly(series.completed_on || series.local_completed_on) === instanceDay) return "Complete";
  if (series?.id && !operation?._occurrence?.status_override) {
    const matchingOccurrence = operationOccurrences.find((row) => String(row.operation_id) === String(series.id) && dateOnly(row.occurrence_date) === instanceDay);
    if (matchingOccurrence && (Boolean(matchingOccurrence.completed) || String(matchingOccurrence.status || "").toLowerCase() === "complete")) return "Complete";
  }
  return statusOrder.includes(operation.status) ? operation.status : "Queued";
}

function isDayOfOperation(operation, day = operatingDayKey()) {
  if (!day) return false;
  const scheduled = dateOnly(operation?.scheduled_date);
  if (scheduled) return isScheduledOn(operation, day);
  return dateOnly(operation?.operation_date) === day;
}

function displayStatus(operation, day = operatingDayKey()) {
  const status = normalizedStatus(operation);
  if (status === "Complete" || status === "Ongoing" || status === "Missed") return status;
  const operationDay = dateOnly(operation?._occurrence?.occurrence_date || operation?.scheduled_date || operation?.operation_date);
  const manuallyOverridden = Boolean(operation?.status_override || operation?._occurrence?.status_override);
  // A non-ongoing operation that was left behind its scheduled day becomes
  // Missed automatically. Keep this derived fallback for offline/cache-first
  // renders; the durable reconciliation below writes the same state to both
  // the operation and its occurrence row.
  if (operationDay && operatingDayKey() && operationDay < operatingDayKey() && !manuallyOverridden) return "Missed";
  // A schedule is already visible in its own column. Once its date arrives,
  // present it as actionable queued work instead of adding a redundant state.
  return status === "Scheduled" && isDayOfOperation(operation, day) ? "Queued" : status;
}

function statusOptionsFor(operation, day = operatingDayKey()) {
  const operationDay = dateOnly(operation?._occurrence?.occurrence_date || operation?.scheduled_date || operation?.operation_date);
  const isHistorical = operationDay && operatingDayKey() && operationDay < operatingDayKey();
  if (isDayOfOperation(operation, day) && !isHistorical) return ["Queued", "Ongoing", "Complete"];
  return statusOrder;
}

function statusControlMarkup(operation, day = operatingDayKey(), key = operation.id || operation.title) {
  const gate = morningGate(operation);
  const gateExpired = gate?.state === "expired";
  const status = gateExpired ? "Missed" : displayStatus(operation, day);
  const options = gateExpired ? ["Missed", "Complete"] : statusOptionsFor(operation, day);
  const gateTitle = gateExpired
    ? "This morning window expired. Choose Complete to correct the record, or leave it Missed."
    : "Choose an operation status";
  return `<select class="operation-status ${status.toLowerCase()}${gateExpired ? " morning-gated" : ""}" data-hub-set-status="${esc(key)}" data-hub-status-day="${esc(day)}" aria-label="Status for ${esc(operation.title)}" title="${esc(gateTitle)}">${options.map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${option}</option>`).join("")}</select>`;
}

function calendarStatusMarkup(operation, day) {
  return statusControlMarkup(operation, day, operation.id || operation.title);
}

function isReadingOperation(operation) {
  return /^read one chapter$/i.test(String(operation?.title || "").trim());
}

function readingBrief() {
  const book = currentBook?.title ? ` of "${currentBook.title}"` : " from your current book";
  return `Read one chapter${book} without notifications, then capture one useful idea, quote, or action in Self Mastery.`;
}

function readingBookLabel() {
  return currentBook?.title ? `"${currentBook.title}"` : "your current book";
}

function isCompleteToday(operation) {
  if (normalizedStatus(operation) !== "Complete") return false;
  const completedOn = dateOnly(operation.completed_on || operation.local_completed_on);
  // Older saved operations may not have the new completion stamp yet. Keep a
  // current-day item visible by its assigned operating date in that case.
  if (completedOn) return completedOn === operatingDayKey();
  const assignedDay = dateOnly(operation.operation_date || operation.scheduled_date);
  return assignedDay === operatingDayKey() || Boolean(operation.local_completed_today);
}

function checklistFor(operation) {
  const supplied = String(operation.brief || operation.notes || "").trim();
  if (supplied) return supplied.split(/\n+/).map((item) => item.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  const name = String(operation.title || "").toLowerCase();
  if (/acl|rehab|physical therapy|pt session|orthopedic/.test(name)) return [
    "Complete only the exercises your clinician or PT prescribed for this session.",
    "Use the assigned sets, range, and load; do not add painful or unapproved work.",
    "Log pain, swelling, or an unusual response after the session.",
  ];
  if (/pre-market/.test(name)) return [
    "Mark the higher-timeframe condition before the active session.",
    "Identify key liquidity, reaction, and invalidation levels.",
    "Write the valid setup and risk limits before price reaches the area.",
  ];
  if (/review charts|document one lesson/.test(name)) return [
    "Review the relevant chart or completed trade without changing the result.",
    "Capture one specific lesson about condition, location, execution, or risk.",
    "File the lesson in Detective or Self Mastery so it can compound.",
  ];
  if (/read one chapter/.test(name)) return [
    `Read one complete chapter of ${readingBookLabel()} with notifications away.`,
    "Capture one useful idea, quote, or action in Self Mastery.",
    "Only mark complete after the chapter and note are both finished.",
  ];
  if (/conquer the morning/.test(name)) return [
    "Start with the first deliberate action before the day starts making decisions for you.",
    "Keep attention on the morning standard: no avoidable drift, no negotiation with the first duty.",
    "Mark complete only after the morning was directed by choice rather than impulse.",
  ];
  if (/^journal$|journal/.test(name)) return [
    "Write the facts of the day without flattering or condemning yourself.",
    "Separate what is within your control from what is not, then name the next right action.",
    "Record one lesson or correction so the experience becomes usable evidence.",
  ];
  if (/mission debrief/.test(name)) return [
    "Read Jarvis and Alfred's evening reflection for the completed day.",
    "Compare the feedback with what was actually executed, not intention.",
    "Record one adjustment or schedule tomorrow's first clear operation.",
  ];
  if (/gym.*legs/.test(name)) return ["Open Self Mastery > Body > Gym.", "Choose Legs and log each exercise, load, reps, and completed sets.", "Stop at the recovery-safe limit and record anything that needs attention."];
  if (/gym.*push/.test(name)) return ["Open Self Mastery > Body > Gym.", "Choose Push and log each exercise, load, reps, and completed sets.", "Use controlled form; record the work so progression is measurable."];
  if (/gym.*pull/.test(name)) return ["Open Self Mastery > Body > Gym.", "Choose Pull and log each exercise, load, reps, and completed sets.", "Record any pain, limitation, or performance change honestly."];
  if (/gym.*upper body/.test(name)) return ["Open Self Mastery > Body > Gym.", "Choose Upper Body and log every exercise, load, reps, and sets.", "Keep the session consistent enough for next week's comparison."];
  if (/gym.*lower body/.test(name)) return ["Open Self Mastery > Body > Gym.", "Choose Lower Body only within your PT/orthopedic clearance.", "Log exercise, weight, reps, and sets; flag knee symptoms rather than pushing through them."];
  if (/rest and reset/.test(name)) return ["Keep training load intentionally low.", "Log AM/PM weight or nutrition if useful.", "Prepare the next training day and protect sleep."];
  return [
    "Read the mission this operation advances and define the evidence of completion.",
    "Do the work deliberately and update the status honestly.",
    "Log the result or lesson where the mission can use it.",
  ];
}

function resolveMission(operation, includeCompleted = false) {
  // Reading is a standing operation for the book currently being read. Do
  // this before honoring a legacy mission_id so changing books moves the
  // operation to the new book mission instead of remaining attached to an old
  // title such as Think and Grow Rich.
  const readingDay = dateOnly(operation?.operation_date || operation?.scheduled_date);
  const isCurrentReadingOperation = isReadingOperation(operation) && (!readingDay || readingDay === operatingDayKey());
  if (isCurrentReadingOperation) {
    // There is exactly one reading operation: the daily operation. It follows
    // the active book only while that book still has chapters remaining.
    // Never fall back to another book or to a completed mission here.
    if (!currentBook?.title) return null;
    const bookTitle = currentBook.title.toLowerCase();
    const bookMission = missions.find((mission) => !mission.completed
      && `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().includes(bookTitle));
    return bookMission || null;
  }
  const operationCategoryKey = operationCategory(operation).toLowerCase();
  // Life Admin is intentionally independent work: appointments, errands, and
  // similar day-to-day items must never advance a growth mission.
  if (operationCategoryKey === "life admin") return null;
  if (operation.mission_id) {
    const explicit = missions.find((mission) => String(mission.id) === String(operation.mission_id));
    if (explicit && canonicalOperationCategory(explicit.category) !== "Life Admin"
      && (!explicit.completed || Boolean(operation.completed))) return explicit;
  }
  const operationMetric = inferredMetricForOperation(operation);
  if (operationMetric) {
    const metricMatch = missions.find((mission) => canAdvance(mission) && metricsMatch(mission.metric_key, operationMetric));
    if (metricMatch) return metricMatch;
  }
  const title = String(operation.title || "").toLowerCase();
  // These are intentionally exact enough to keep daily evidence attached to
  // the right Phase 0 mission instead of whichever mission happens to share a
  // category.
  const canAdvance = (mission) => !mission.completed || Boolean(operation.completed);
  const byPhrase = (phrases) => missions.find((mission) => canAdvance(mission) && phrases.some((phrase) => `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().includes(phrase)));
  const phraseMatch = /pt session|orthopedic|acl rehab/.test(title) ? byPhrase(["orthopedic recovery", "pt sessions", "return to sports"])
    : /gym|legs|push|pull|upper body|lower body|rest and reset/.test(title) ? byPhrase(["training baseline", "recovery-safe"])
      : /review charts|trade review/.test(title) ? byPhrase(["evidence-based trade reviews", "process review"])
        : /mission debrief|evening debrief/.test(title) ? byPhrase(["operating debrief rhythm", "operating baseline"])
          : /read one chapter|read chapter/.test(title) ? byPhrase(["learning rhythm", "chapters"])
            : /conquer the morning/.test(title) ? byPhrase(["morning discipline", "operating baseline", "daily rhythm"])
              : /^journal$|journal/.test(title) ? byPhrase(["journal", "operating debrief rhythm", "self mastery"])
                : /pre-market/.test(title) ? byPhrase(["trading preparation rhythm", "execution playbook", "pre-market"]) : null;
  if (phraseMatch) return phraseMatch;
  const candidates = missions.filter((mission) => canAdvance(mission) && canonicalOperationCategory(mission.category).toLowerCase() === operationCategoryKey);
  const measured = candidates.filter((mission) => String(mission.completion_type || "").toLowerCase() === "units" && Number(mission.target_count) > 0);
  const unitMatch = measured.find((mission) => {
    const unit = String(mission.unit_label || "").toLowerCase();
    return (/acl|rehab|pt|orthopedic|physical therapy/.test(title) && /session|rehab|pt/.test(unit)) || (/read|chapter/.test(title) && /chapter|page/.test(unit));
  });
  const titleMatch = measured.find((mission) => {
    const text = `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase();
    return (/playbook|condition|location|cbr|shift|entry|review/.test(title) && /playbook|trading/.test(text)) ||
      (/daily scorecard|chapter|debrief/.test(title) && /scorecard|baseline|daily/.test(text));
  });
  const categoryMatch = unitMatch || titleMatch || measured[0] || candidates[0];
  if (categoryMatch) return categoryMatch;
  // Every non-Life-Admin operation must still advance a mission. If its
  // category has no dedicated mission, use the newest active mission as the
  // durable destination instead of leaving an untracked operation behind.
  const activeFallback = missions
    .filter((mission) => !mission.completed)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
  if (activeFallback) return activeFallback;
  return operation.completed ? missions[0] || null : null;
}

// Every operation has a single, durable mission link before it is saved.  The
// database trigger can then advance the correct measured mission without the
// command center, calendar, and mission page trying to maintain separate
// counters in the browser.
function attachMissionLink(operation) {
  const mission = resolveMission(operation, true);
  const category = operationCategory(operation, mission);
  const metric = inferredMetricForOperation(operation) || mission?.metric_key || null;
  if (category && operation.category !== category) operation.category = category;
  if (metric && operation.metric_key !== metric) operation.metric_key = metric;
  if (category === "Life Admin") {
    operation.mission_id = null;
    return;
  }
  if (!mission) {
    // After the final chapter, keep the standing daily operation available for
    // the next book but do not leave it attached to a completed book mission.
    if (isReadingOperation(operation) && (!dateOnly(operation.operation_date || operation.scheduled_date)
      || dateOnly(operation.operation_date || operation.scheduled_date) === operatingDayKey())) {
      operation.mission_id = null;
      operation.metric_key = "chapters_read";
    }
    return;
  }
  operation.mission_id = mission.id;
  operation.metric_key = operation.metric_key || mission.metric_key || null;
}

function missionNeedsScheduling(mission) {
  if (String(mission?.completion_type || "").toLowerCase() !== "units" || Number(mission?.target_count || 0) <= 0) return false;
  // Reading is fulfilled by the standing daily operation. A book mission is
  // the finish line for the current book, not a second calendar workload.
  if (String(mission?.metric_key || "").toLowerCase() === "chapters_read") return false;
  const missionText = `${mission?.title || ""} ${mission?.completion_definition || ""}`.toLowerCase();
  if (["mind", "body", "self mastery"].includes(String(mission?.category || "").toLowerCase()) && (/\bbook\b|\bchapter/.test(missionText) || /^read\b/.test(missionText.trim()))) return false;
  return true;
}

function priorityClass(priority) {
  const value = String(priority || "").toLowerCase();
  return value === "high" ? "priority-high" : value === "low" ? "priority-low" : "priority-medium";
}

// The database is the source of record, but a just-changed status must never
// be replaced by an older cloud response during an auth refresh.
function mergeSavedStatus(remote = []) {
  const cached = cachedOperations().filter((candidate) => candidate?.title);
  const cachedById = new Map(cached.filter((candidate) => candidate.id && !String(candidate.id).startsWith("local-")).map((candidate) => [String(candidate.id), candidate]));
  const merged = (Array.isArray(remote) ? remote : []).map((operation) => {
    const local = cachedById.get(String(operation.id));
    if (!local || !local.local_updated_at) return operation;
    const localStamp = Date.parse(local.local_updated_at) || Number(local.local_updated_at) || 0;
    const remoteStamp = Date.parse(operation.updated_at || operation.created_at) || 0;
    if (localStamp <= remoteStamp) return operation;
    // A completion received from Supabase must not be overwritten by a stale
    // browser cache that still thinks the operation is queued or missed.
    if ((Boolean(operation.completed) || String(operation.status || "").toLowerCase() === "complete") && !local.status_override) return operation;
    // A local schedule or status edit is newer than the cloud snapshot.
    // Overlay only mutable execution fields; identity and ownership remain
    // cloud-owned.
    return {
      ...operation,
      scheduled_date: local.scheduled_date || null,
      scheduled_time: local.scheduled_time || null,
      scheduled_end_date: local.scheduled_end_date || null,
      schedule_mode: local.schedule_mode || "one_time",
      status: local.status || operation.status,
      completed: Boolean(local.completed),
      completed_on: local.completed_on || null,
      status_override: Boolean(local.status_override),
      local_updated_at: local.local_updated_at,
    };
  });
  const identity = (operation) => [
    String(operation?.title || "").trim().toLowerCase(),
    dateOnly(operation?.scheduled_date),
    String(operation?.scheduled_time || "").slice(0, 5),
    dateOnly(operation?.operation_date),
    scheduleMode(operation),
    String(operation?.mission_id || ""),
  ].join("|");
  const currentOrUpcoming = (operation) => {
    const start = dateOnly(operation?.scheduled_date);
    if (!start) return scheduleMode(operation) !== "one_time";
    const end = dateOnly(operation?.scheduled_end_date);
    if (end && end < operatingDayKey()) return false;
    // Keep dated history available to the calendar when the local cache is
    // merged with a fresh cloud response.
    return true;
  };
  const known = new Set(merged.map(identity));
  cached.filter((candidate) => currentOrUpcoming(candidate)).forEach((candidate) => {
    const key = identity(candidate);
    if (!known.has(key)) {
      merged.push(candidate);
      known.add(key);
    }
  });
  return merged;
}

async function reconcileCachedOperationEdits(remote = []) {
  if (!client || !currentUser) return remote;
  const cached = cachedOperations().filter((candidate) => candidate?.id && !String(candidate.id).startsWith("local-"));
  const cachedById = new Map(cached.map((candidate) => [String(candidate.id), candidate]));
  const pending = remote.filter((operation) => {
    const local = cachedById.get(String(operation.id));
    if (!local?.local_updated_at) return false;
    if ((Boolean(operation.completed) || String(operation.status || "").toLowerCase() === "complete") && !local.status_override) return false;
    const localStamp = Date.parse(local.local_updated_at) || Number(local.local_updated_at) || 0;
    const remoteStamp = Date.parse(operation.updated_at || operation.created_at) || 0;
    return localStamp > remoteStamp;
  });
  if (!pending.length) return remote;
  const results = await Promise.all(pending.map(async (operation) => {
    const local = cachedById.get(String(operation.id));
    const { data, error } = await client.from("operations")
      .update({
        scheduled_date: local.scheduled_date || null,
        scheduled_time: local.scheduled_time || null,
        scheduled_end_date: local.scheduled_end_date || null,
        schedule_mode: local.schedule_mode || "one_time",
        status: local.status || operation.status,
        completed: Boolean(local.completed),
        completed_on: local.completed_on || null,
        status_override: Boolean(local.status_override),
        updated_at: new Date().toISOString(),
      })
      .eq("id", operation.id)
      .eq("user_id", currentUser.id)
      .select()
      .single();
    return error || !data ? operation : data;
  }));
  return remote.map((operation) => results.find((candidate) => String(candidate.id) === String(operation.id)) || operation);
}

function ensureLiveQueueHost() {
    // Keep one stable queue host. A second sibling can land in an implicit
    // grid row and appear blank even when it contains the correct operations.
    const panel = document.querySelector("#command .operations-panel");
    if (!panel) return null;

    let host = panel.querySelector("#operations-list") || panel.querySelector("#aegis-operations-list");
    if (!host) {
      host = document.createElement("div");
      host.id = "operations-list";
      host.className = "operations-list aegis-operations-live";
      panel.append(host);
    }
    host.hidden = false;
    host.removeAttribute("aria-hidden");
    host.classList.add("aegis-operations-live");
    host.dataset.aegisOperationsLive = "true";
    // Do not reset this marker every time the command layout is observed.
    // Resetting it made the repair observer repaint the same queue forever,
    // which could leave the panel looking blank after a navigation/refresh.
    if (!host.dataset.aegisQueueMounted) host.dataset.aegisQueueMounted = "false";
    return host;
  }

function queueTargets() {
    const liveHost = ensureLiveQueueHost();
    if (liveHost?.isConnected) return [liveHost];

    const selectors = ["#aegis-operations-list", "#command-operations-list", "#operations-queue-list"];
    return [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter((target) => target.isConnected);
  }

function isDailyOperation(operation) {
  return Boolean(operation.is_daily) || /pre-market|review charts|conquer the morning|read one chapter|^journal$|mission debrief|daily|^gym|rest and reset/i.test(String(operation.title || ""));
}

function operationStateSignature(operation) {
  return JSON.stringify({
    id: operation?.id || null,
    status: operation?.status || null,
    completed: Boolean(operation?.completed),
    completed_on: operation?.completed_on || null,
    scheduled_date: operation?.scheduled_date || null,
    scheduled_time: operation?.scheduled_time || null,
    scheduled_end_date: operation?.scheduled_end_date || null,
    schedule_mode: operation?.schedule_mode || null,
  });
}

function appendOperationsWithoutTouchingExisting(existing, additions) {
  const before = new Map(existing.map((operation) => [String(operation.id || `${operation.title}|${operation.created_at || ""}`), operationStateSignature(operation)]));
  const combined = [...existing, ...additions];
  const changed = existing.some((operation) => before.get(String(operation.id || `${operation.title}|${operation.created_at || ""}`)) !== operationStateSignature(operation));
  if (changed) console.warn("Operation seeding attempted to change an existing status or schedule; preserving the existing record.");
  return combined;
}

function queueOperations() {
  const start = operatingDayKey();
  const horizon = dateForKey(start);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const end = dayKey(horizon);
  const displayOperations = dedupeOperationInstances(operationInstances());
  const today = displayOperations.filter((operation) => {
    if (normalizedStatus(operation) === "Complete" && !isCompleteToday(operation)) return false;
    const scheduled = dateOnly(operation.scheduled_date);
    const operationDay = dateOnly(operation.operation_date);
    // A dated schedule wins over the daily template. Recurring rows are
    // included on each valid occurrence, not only on their start date.
    if (scheduled) return isScheduledOn(operation, start);
    // Daily rows written by the old system without a date belong to no day.
    // They must not masquerade as today's work or suppress today's fresh plan.
    if (isDailyOperation(operation)) return operationDay === start;
    return !scheduled && (!operationDay || operationDay === start);
  });
  const upcoming = displayOperations.filter((operation) => {
    if (normalizedStatus(operation) === "Complete") return false;
    const next = nextScheduledDate(operation, start, false);
    return Boolean(next && next >= start && next <= end);
  });
  const sort = (items) => items.slice().sort((a, b) => {
    const aDate = nextScheduledDate(a, start, true) || dateOnly(a.operation_date) || "9999-12-31";
    const bDate = nextScheduledDate(b, start, true) || dateOnly(b.operation_date) || "9999-12-31";
    return aDate.localeCompare(bDate) || String(a.title).localeCompare(String(b.title));
  });
  const uniqueItems = (items) => {
    return dedupeOperationInstances(items);
  };
  const todayItems = uniqueItems(sort(today));
  const todayKeys = new Set(todayItems.map(operationDisplayIdentity));
  // The upcoming query includes its start boundary so a dated item can be
  // found by both filters. Once it is in TODAY, never render it a second time
  // under UPCOMING / NEXT 14 DAYS.
  const upcomingItems = uniqueItems(sort(upcoming).filter((operation) => !todayKeys.has(operationDisplayIdentity(operation))));
  return { today: todayItems, upcoming: upcomingItems };
}

// This is deliberately display-only insurance.  A legacy record with an old
// date must never produce a blank Command Center while the current-day rows
// are being written.  boot()/ensureTodayOperations still create the durable
// rows; this simply gives the director a usable queue during that hand-off.
function queueFallback() {
  const planned = starterOperations()
    .filter((operation) => !operation.scheduled_date || dateOnly(operation.scheduled_date) === operatingDayKey());
  return { today: planned, upcoming: [] };
}

function morningGate(operation) {
  if (String(operation?.title || "").trim().toLowerCase() !== "conquer the morning") return null;
  if (normalizedStatus(operation) === "Complete") return { state: "complete" };
  const operationDay = dateOnly(operation?.scheduled_date || operation?.operation_date);
  const priorDay = shiftDayKey(operationDay, -1);
  const bedtimeAt = bedtimeForDay(priorDay);
  // No bedtime means no lockout. This preserves the regular operation when
  // the director forgot to close the previous day.
  if (!bedtimeAt) return { state: "open", unrestricted: true };
  const bedtimeMs = Date.parse(bedtimeAt);
  if (Number.isNaN(bedtimeMs)) return { state: "open", unrestricted: true };
  const deadline = bedtimeMs + BEDTIME_WINDOW_MS;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { state: "expired", deadline };
  return { state: "open", deadline, remaining };
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

// This intentionally does not depend on Supabase, missions, or calendar
// state.  It is the last-resort queue paint used if a non-critical renderer
// throws during a refresh.  Command Center must always show the day's work.
function emergencyQueueMarkup() {
  const fallback = queueFallback().today;
  const rows = fallback.map((operation) => {
    const gate = morningGate(operation);
    const gateExpired = gate?.state === "expired";
    const priority = operation.priority || priorityFor(operation.category);
    return `<article class="operation operation-table-row operation-table-v2">
      ${statusControlMarkup(operation, operatingDayKey(), operation.title)}
      <button type="button" class="hub-operation-title" data-hub-detail="${esc(operation.title)}">${esc(operation.title)}</button>
      <button type="button" class="operation-schedule-control" data-hub-schedule="${esc(operation.title)}">+ Schedule</button>
      <span>${esc(operation.category || "Mission")}</span>
      <b class="${priorityClass(priority)}">${esc(priority)}</b>
    </article>`;
  }).join("");
  return `<div class="operation-table-head operation-table-v2"><span>STATUS</span><span>OPERATION</span><span>SCHEDULE</span><span>CATEGORY</span><span>PRIORITY</span></div>${rows}`;
}

function renderQueue() {
  const targets = queueTargets();
  if (!targets.length) return;
  if (!operationsReady) return;
  try {
    syncSystemDate();
    if (!operations.length) operations = cachedOperations();
    if (!operations.length) operations = starterOperations();
    const calculated = queueOperations();
    const active = (!calculated.today.length && !calculated.upcoming.length) ? queueFallback() : calculated;
    const operationCount = $("#operation-count");
    const operationMeter = $("#operation-meter");
    const operationCaption = $("#operation-caption");
    const completedToday = active.today.filter((operation) => normalizedStatus(operation) === "Complete").length;
    if (operationCount) operationCount.innerHTML = `${completedToday}<span>/${active.today.length}</span>`;
    if (operationMeter) operationMeter.style.width = `${active.today.length ? (completedToday / active.today.length) * 100 : 0}%`;
    if (operationCaption) operationCaption.textContent = active.today.length ? `${active.today.length} operations today` : "No operations today";
    const rows = (items, dayOf = false) => items.map((operation) => {
      const status = dayOf ? displayStatus(operation) : normalizedStatus(operation);
      const gate = morningGate(operation);
      const priority = operation.priority || priorityFor(operation.category);
      const scheduled = dateOnly(operation.scheduled_date);
      const time = operation.scheduled_time ? ` · ${String(operation.scheduled_time).slice(0, 5)}` : "";
      const timing = scheduleLabel(operation, operatingDayKey());
      const doneClass = status === "Complete" ? " done operation-complete" : "";
      const gateExpired = gate?.state === "expired";
      const gateNote = gateExpired
        ? '<small class="morning-window-note is-expired">9-hour window expired</small>'
        : gate?.deadline
          ? `<small class="morning-window-note" data-morning-deadline="${gate.deadline}">${formatRemaining(gate.remaining)} left</small>`
          : "";
      const gateTitle = gateExpired
        ? "Conquer the morning was not completed within nine hours of the prior bedtime."
        : gate?.deadline
          ? `Conquer the morning window: ${formatRemaining(gate.remaining)} remaining.`
          : "";
      return `<article class="operation operation-table-row operation-table-v2${doneClass}">
        ${statusControlMarkup(operation, operatingDayKey(), operation.id || operation.title)}
        <button type="button" class="hub-operation-title" data-hub-detail="${esc(operation.id || operation.title)}">${esc(operation.title)}${gateNote}</button>
        <button type="button" class="operation-schedule-control ${scheduled ? "is-scheduled" : ""}" data-hub-schedule="${esc(operation.id || operation.title)}">${esc(timing)}</button>
        <span>${esc(operation.category || "Mission")}</span>
        <b class="${priorityClass(priority)}">${esc(priority)}</b>
      </article>`;
    }).join("");
    if (!active.today.length && !active.upcoming.length) {
      targets.forEach((target) => {
        target.innerHTML = '<p class="empty-operations">No operations for today or the next seven days. Schedule the next deliberate move from Mission Control.</p>';
        target.dataset.aegisQueueMounted = "true";
      });
      return;
    }
    const markup = `
      <div class="operation-table-head operation-table-v2"><span>STATUS</span><span>OPERATION</span><span>SCHEDULE</span><span>CATEGORY</span><span>PRIORITY</span></div>
      ${rows(active.today, true)}
      ${active.upcoming.length ? `<p class="operations-upcoming-label">UPCOMING / NEXT 14 DAYS</p>${rows(active.upcoming)}` : ""}`;
    targets.forEach((target) => {
      target.innerHTML = markup;
      target.dataset.aegisQueueMounted = "true";
      target.querySelectorAll("[data-hub-set-status]").forEach((select) => select.addEventListener("change", () => setOperationStatus(select.dataset.hubSetStatus, select.value, select.dataset.hubStatusDay)));
      target.querySelectorAll("[data-hub-schedule]").forEach((button) => button.addEventListener("click", () => openScheduleDialog(findOperation(button.dataset.hubSchedule))));
      target.querySelectorAll("[data-hub-detail]").forEach((button) => button.addEventListener("click", () => showOperationDetail(button.dataset.hubDetail)));
    });
  } catch (error) {
    console.warn("Operations Queue failed its normal render; applying local safety feed.", error);
    targets.forEach((target) => {
      target.innerHTML = emergencyQueueMarkup();
      target.dataset.aegisQueueMounted = "true";
      target.querySelectorAll("[data-hub-set-status]").forEach((select) => select.addEventListener("change", () => setOperationStatus(select.dataset.hubSetStatus, select.value, select.dataset.hubStatusDay)));
      target.querySelectorAll("[data-hub-schedule]").forEach((button) => button.addEventListener("click", () => openScheduleDialog(findOperation(button.dataset.hubSchedule))));
      target.querySelectorAll("[data-hub-detail]").forEach((button) => button.addEventListener("click", () => showOperationDetail(button.dataset.hubDetail)));
    });
  }
}

function refreshMorningCountdown() {
  let expired = false;
  document.querySelectorAll("[data-morning-deadline]").forEach((element) => {
    const remaining = Number(element.dataset.morningDeadline) - Date.now();
    if (remaining <= 0) expired = true;
    else element.textContent = `${formatRemaining(remaining)} left`;
  });
  if (expired) renderQueue();
}

function findOperation(key) {
  const instance = operationInstances().find((operation) => String(operation.id || operation.title) === String(key));
  if (!instance) return operations.find((operation) => String(operation.id || operation.title) === String(key));
  // Calendar rendering can return a copy when a completed operation is pinned
  // to its completion date. Status edits must target the canonical operation,
  // or the next repaint will restore the old Complete value from `operations`.
  // Recurring instances remain instance-specific so their occurrence row is
  // still the record being edited.
  if (instance._occurrence || instance._series) return instance;
  const canonical = operations.find((operation) => String(operation.id || operation.title) === String(instance._base?.id || instance.id || key));
  return canonical || instance._base || instance;
}

function showOperationDetail(key) {
  const operation = findOperation(key);
  if (!operation) return;
  const mission = resolveMission(operation);
  const checklist = checklistFor(operation).map((item, index) => `${index + 1}. ${item}`).join("\n");
  const advances = mission ? `\n\nADVANCES: ${mission.title}${mission.completion_type === "units" ? ` (${Number(mission.completed_count || 0)}/${Number(mission.target_count || 0)} ${mission.unit_label || "units"})` : ""}` : "";
  window.alert(`${operation.title}${advances}\n\nDEFINITION OF DONE\n${checklist}`);
}

async function persist(operation) {
  if (!client || !currentUser) return true;
  if (operation?._occurrence?.id) {
    let { data, error } = await client.from("operation_occurrences")
      .update({
        status: operation.status,
        completed: Boolean(operation.completed),
        completed_on: operation.completed_on || null,
        status_override: Boolean(operation.status_override ?? operation._occurrence.status_override),
        started_on: operation.started_on || operation._occurrence.started_on || null,
        last_rollover_on: operation.last_rollover_on || operation._occurrence.last_rollover_on || null,
        rollover_count: Number(operation.rollover_count ?? operation._occurrence.rollover_count ?? 0),
        scheduled_time: operation.scheduled_time || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operation._occurrence.id)
      .eq("user_id", currentUser.id)
      .select()
      .single();
    if (error && /column|schema cache|rollover|status_override/i.test(String(error.message || ""))) {
      ({ data, error } = await client.from("operation_occurrences")
        .update({ status: operation.status, completed: Boolean(operation.completed), completed_on: operation.completed_on || null, scheduled_time: operation.scheduled_time || null, updated_at: new Date().toISOString() })
        .eq("id", operation._occurrence.id)
        .eq("user_id", currentUser.id)
        .select()
        .single());
    }
    if (error) { console.warn("Could not save operation occurrence", error.message); return false; }
    if (data) Object.assign(operation._occurrence, data);
    return true;
  }
  // A recurring series can render a virtual instance before migration 044 has
  // returned its occurrence row. Persist that instance as its own durable
  // occurrence instead of trying to update the synthetic virtual id.
  if (operation?._occurrence?.occurrence_date && operation?._series?.id) {
    const occurrencePayload = {
      user_id: currentUser.id,
      operation_id: operation._series.id,
      occurrence_date: dateOnly(operation._occurrence.occurrence_date),
      scheduled_time: operation.scheduled_time || operation._series.scheduled_time || null,
      status: operation.status,
      completed: Boolean(operation.completed),
      completed_on: operation.completed_on || null,
      status_override: Boolean(operation.status_override),
      started_on: operation.started_on || null,
      last_rollover_on: operation.last_rollover_on || null,
      rollover_count: Number(operation.rollover_count || 0),
    };
    let { data, error } = await client.from("operation_occurrences")
      .upsert(occurrencePayload, { onConflict: "operation_id,occurrence_date" })
      .select()
      .single();
    if (error && /column|schema cache|rollover|status_override/i.test(String(error.message || ""))) {
      const legacyPayload = { ...occurrencePayload };
      delete legacyPayload.status_override;
      delete legacyPayload.started_on;
      delete legacyPayload.last_rollover_on;
      delete legacyPayload.rollover_count;
      ({ data, error } = await client.from("operation_occurrences")
        .upsert(legacyPayload, { onConflict: "operation_id,occurrence_date" })
        .select()
        .single());
    }
    if (!error && data) {
      operation._occurrence = data;
      operation.id = `occurrence:${data.id}`;
      const existingIndex = operationOccurrences.findIndex((row) => occurrenceIdentity(row) === occurrenceIdentity(data));
      if (existingIndex >= 0) operationOccurrences[existingIndex] = data;
      else operationOccurrences.push(data);
      saveCachedOccurrences();
      return true;
    }
    // Keep legacy projects usable when the occurrence migration is not yet
    // installed; the durable parent remains the fallback record.
    if (error) {
      console.warn("Could not save virtual operation occurrence", error.message);
      Object.assign(operation._series, { status: operation.status, completed: Boolean(operation.completed), completed_on: operation.completed_on || null });
    }
    operation = operation._series;
  }
  const payload = {
    user_id: currentUser.id,
    title: operation.title,
    category: operation.category || "Mission",
    brief: operation.brief || operation.notes || null,
    status: operation.status,
    completed: operation.completed,
    completed_on: operation.completed_on || null,
    status_override: Boolean(operation.status_override),
    started_on: operation.started_on || null,
    last_rollover_on: operation.last_rollover_on || null,
    rollover_count: Number(operation.rollover_count || 0),
    scheduled_date: operation.scheduled_date || null,
    scheduled_time: operation.scheduled_time || null,
    scheduled_end_date: operation.scheduled_end_date || null,
    // The database stores recurring schedules as `recurring`; the UI also
    // accepts the clearer `weekly` label. Normalize before every write so a
    // status change cannot fail the schedule constraint for older rows.
    schedule_mode: scheduleMode(operation) === "weekly" ? "recurring" : scheduleMode(operation),
    operation_date: operation.operation_date || null,
    is_daily: Boolean(operation.is_daily),
    mission_id: operation.mission_id || null,
    metric_key: operation.metric_key || null,
  };
  // Daily and calendar-created operations begin as local objects. The old
  // update-only path silently discarded those rows, which made the queue look
  // correct until refresh and then empty. Insert them first; later edits use
  // the durable database id.
  const isNew = !operation.id || String(operation.id).startsWith("local-");
  const request = isNew
    ? client.from("operations").insert(payload).select().single()
    : client.from("operations").update(payload).eq("id", operation.id).eq("user_id", currentUser.id).select().single();
  let { data, error } = await request;
  if (error && /column|schema cache|rollover|status_override/i.test(String(error.message || ""))) {
    const legacyPayload = { ...payload };
    delete legacyPayload.status_override;
    delete legacyPayload.started_on;
    delete legacyPayload.last_rollover_on;
    delete legacyPayload.rollover_count;
    const legacyRequest = isNew
      ? client.from("operations").insert(legacyPayload).select().single()
      : client.from("operations").update(legacyPayload).eq("id", operation.id).eq("user_id", currentUser.id).select().single();
    ({ data, error } = await legacyRequest);
  }
  if (error) { console.warn("Could not save operation status", error.message); return false; }
  if (data) Object.assign(operation, data);
  return true;
}

async function rollOverOngoingOperations() {
  const today = operatingDayKey();
  let changed = false;
  const candidates = dedupeOperationInstances(operationInstances()).filter(operationIsOngoing);
  for (const operation of candidates) {
    const source = operation._base || operation;
    const currentDate = dateOnly(operation.scheduled_date || operation._occurrence?.occurrence_date);
    const lastRollover = dateOnly(operation.last_rollover_on || operation._occurrence?.last_rollover_on);
    const shouldRollover = !lastRollover || lastRollover < today || currentDate !== today;
    if (!shouldRollover) continue;

    const started = ongoingStartDay(operation, today);
    const rolloverCount = Math.max(0, Number(operation.rollover_count ?? operation._occurrence?.rollover_count ?? 0))
      + (lastRollover && lastRollover < today ? 1 : 0);
    Object.assign(operation, { scheduled_date: today, operation_date: today, started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    Object.assign(source, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    if (operation._occurrence) {
      // Keep the occurrence's original scheduled date as its durable identity.
      // The display layer already rolls ongoing work onto the current day;
      // mutating occurrence_date here can collide with the current daily row
      // and erase the historical calendar entry.
      Object.assign(operation._occurrence, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    } else if (scheduleMode(source) === "one_time") {
      source.scheduled_date = today;
      source.operation_date = today;
    }
    changed = true;
    await persist(operation);
  }
  if (changed) {
    saveCachedOperations();
    saveCachedOccurrences();
  }
  return changed;
}

async function updateMissionEvidence(operation, direction) {
  // A debrief is the daily audit, not a second unit of progress. The chapter
  // (or another explicitly-linked operation) supplies the evidence; reading
  // the advisory must never advance the same 30-day mission twice.
  if (/evening\s+mission\s+debrief/i.test(String(operation.title || ""))) return;
  const mission = resolveMission(operation);
  if (!mission || String(mission.completion_type || "").toLowerCase() !== "units") return;
  const target = Math.max(1, Number(mission.target_count || 1));
  const current = Math.max(0, Number(mission.completed_count || 0));
  const next = Math.max(0, Math.min(target, current + direction));
  const completed = next >= target;
  mission.completed_count = next;
  mission.completed = completed;
  operation.mission_id = mission.id;
  if (client && currentUser) {
    const { error } = await client.from("missions").update({ completed_count: next, completed, progress: Math.round((next / target) * 100) }).eq("id", mission.id).eq("user_id", currentUser.id);
    if (error) {
      console.warn("Could not update mission evidence", error.message);
      return;
    }
  }
  window.dispatchEvent(new CustomEvent("aegis:missions-refresh", { detail: { source: "operations-hub" } }));
}

// Reconcile every measured mission from completed operation instances. This
// shared path covers PT sessions, chapters, workouts, reviews, and future
// unit-based missions while deduplicating recurring occurrence rows.
async function reconcileMeasuredMissionCounts() {
  if (!missions.length) return;
  const completedByMission = new Map();
  operationInstances().forEach((operation) => {
    if (normalizedStatus(operation) !== "Complete") return;
    if (/evening\s+mission\s+debrief/i.test(String(operation.title || ""))) return;
    reconcileOperationIdentity(operation);
    const linkedMissionId = operation.mission_id || resolveMission(operation, true)?.id;
    if (!linkedMissionId) return;
    // Occurrence rows are already unique by their durable occurrence id.
    // Legacy/one-time rows need a semantic key instead of their database id,
    // otherwise duplicate rows from the old scheduler inflate every measured
    // mission (PT, chapters, gym, reviews, and future unit-based missions).
    const occurrenceDate = dateOnly(operation._occurrence?.occurrence_date || operation.completed_on || operation.operation_date || operation.scheduled_date);
    const key = operation._occurrence?.id
      ? `occurrence:${operation._occurrence.id}`
      : `operation:${String(linkedMissionId)}|${String(operation.title || "").trim().toLowerCase()}|${occurrenceDate}|${String(operation.scheduled_time || "").slice(0, 5)}`;
    const missionKey = String(linkedMissionId);
    if (!completedByMission.has(missionKey)) completedByMission.set(missionKey, new Set());
    completedByMission.get(missionKey).add(key);
  });
  const updates = [];
  missions.forEach((mission) => {
    if (String(mission.completion_type || "").toLowerCase() !== "units") return;
    const target = Math.max(0, Number(mission.target_count || 0));
    if (!target) return;
    const evidence = completedByMission.get(String(mission.id));
    const observed = Math.min(target, evidence?.size || 0);
    const current = Math.max(0, Math.min(target, Number(mission.completed_count || 0)));
    // A refresh can briefly contain no linked/completed rows while the
    // operation snapshot is still settling. Never interpret that absence as
    // evidence that the user lost progress. Automatic reconciliation is
    // deliberately monotonic; an intentional correction can still be made in
    // the mission editor, while real completed operations continue advancing
    // the durable count.
    if (!evidence || observed <= current) return;
    mission.completed_count = observed;
    mission.completed = observed >= target;
    mission.progress = Math.round((observed / target) * 100);
    updates.push({ mission, completed_count: observed, completed: mission.completed, progress: mission.progress });
  });
  if (client && currentUser && updates.length) {
    await Promise.all(updates.map(({ mission, ...payload }) =>
      client.from("missions").update(payload).eq("id", mission.id).eq("user_id", currentUser.id)
    ));
  }
  if (updates.length) window.dispatchEvent(new CustomEvent("aegis:missions-refresh", { detail: { source: "operations-hub-reconcile" } }));
}

async function changeGatedStatus(key) {
  const operation = findOperation(key);
  if (!operation || morningGate(operation)?.state !== "expired") return;
  const choice = window.prompt("This operation is marked Missed. Enter Complete to correct it, or Cancel to leave it missed.", "Complete");
  const next = String(choice || "").trim().toLowerCase();
  if (next === "missed" || !next) {
    renderQueue();
    return;
  }
  if (next !== "complete") {
    window.alert("Enter Complete to apply the correction, or cancel to leave the operation marked Missed.");
    return;
  }
  await cycleStatus(key, "Complete");
}

async function setOperationStatus(key, requestedStatus, selectedDay = operatingDayKey()) {
  const operation = findOperation(key);
  if (!operation) return;
  const next = String(requestedStatus || "").trim();
  if (!statusOrder.includes(next)) return;
  const gate = morningGate(operation);
  if (gate?.state === "expired" && !["Missed", "Complete"].includes(next)) {
    renderQueue();
    renderCalendar();
    return;
  }
  const sourceOperation = operation._base || operation;
  const currentStatus = displayStatus(operation, selectedDay || operatingDayKey());
  const wasComplete = normalizedStatus(operation) === "Complete" || currentStatus === "Complete";
  const nextCompleted = next === "Complete";
  const series = operation._series || operation;
  let seriesNeedsPersistence = false;
  Object.assign(operation, { status: next, completed: nextCompleted, status_override: true });
  if (sourceOperation !== operation) Object.assign(sourceOperation, { status: next, completed: nextCompleted, status_override: true });
  // The rendered recurring instance is a copy of its durable occurrence.
  // Update that row before the first repaint, otherwise normalizedStatus()
  // sees the old Complete flag and immediately locks the select again.
  if (operation._occurrence) Object.assign(operation._occurrence, { status: next, completed: nextCompleted, status_override: true });
  if (next === "Ongoing") {
    const today = operatingDayKey();
    const started = ongoingStartDay(operation, dateOnly(selectedDay) || today);
    const rolloverCount = Number(operation.rollover_count ?? operation._occurrence?.rollover_count ?? 0);
    Object.assign(operation, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    if (sourceOperation !== operation) Object.assign(sourceOperation, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    if (operation._occurrence) Object.assign(operation._occurrence, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    else if (scheduleMode(sourceOperation) === "one_time" && dateOnly(selectedDay) === today) Object.assign(sourceOperation, { scheduled_date: today, operation_date: today });
  }
  if (next === "Complete") {
    // Completing from a calendar day belongs to that occurrence/date. Never
    // use the browser's current day for a historical correction.
    const completionDay = dateOnly(operation._occurrence?.occurrence_date || operation.scheduled_date || operation.operation_date || selectedDay) || operatingDayKey();
    operation.completed_on = completionDay;
    if (sourceOperation !== operation) sourceOperation.completed_on = completionDay;
    if (operation._occurrence) operation._occurrence.completed_on = completionDay;
  } else if (wasComplete || next === "Missed") {
    operation.completed_on = null;
    if (sourceOperation !== operation) sourceOperation.completed_on = null;
    if (operation._occurrence) operation._occurrence.completed_on = null;
  }
  // A recurring parent is a schedule, not an individual completion. Older
  // status writes could leave the parent marked Complete, and that stale
  // stamp would make a corrected occurrence appear Complete again after a
  // reload. Clear and persist it whenever this occurrence is moved away from
  // Complete.
  if (series !== operation && operation._occurrence?.id && next !== "Complete"
    && (Boolean(series.completed) || String(series.status || "").toLowerCase() === "complete")) {
    Object.assign(series, {
      status: series.status === "Complete" ? "Scheduled" : series.status,
      completed: false,
      completed_on: null,
      status_override: true,
    });
    seriesNeedsPersistence = true;
  }
  attachMissionLink(series);
  if (series !== operation) {
    operation.mission_id = series.mission_id;
    operation.metric_key = series.metric_key;
    if (!operation._occurrence?.id) Object.assign(series, { status: operation.status, completed: Boolean(operation.completed), completed_on: operation.completed_on || null });
  }
  const localUpdatedAt = new Date().toISOString();
  operation.local_updated_at = localUpdatedAt;
  if (operation._occurrence) operation._occurrence.local_updated_at = localUpdatedAt;
  saveCachedOperations();
  if (operation._occurrence) saveCachedOccurrences();
  renderQueue();
  renderCalendar();
  const saved = await persist(operation);
  if (saved && seriesNeedsPersistence) await persist(series);
  if (!saved) {
    window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations, offline: true } }));
    return;
  }
  saveCachedOperations();
  if (operation._occurrence) saveCachedOccurrences();
  if (currentUser) {
    await loadMissions();
    operations = await seedIfEmpty();
    await loadOccurrences();
    await ensureRecurringOccurrences();
    await markExpiredOperationsMissed();
    await rollOverOngoingOperations();
    await reconcileRecurringCompletion();
    await reconcileMeasuredMissionCounts();
    await syncDailyReadingOperation();
    subscribeToOperationSync();
    saveCachedOperations();
  }
  renderQueue();
  renderCalendar();
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations } }));
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "operation-status", operation } }));
  setTimeout(() => { renderQueue(); renderCalendar(); }, 0);
}

async function cycleStatus(key, forcedStatus = null) {
  const operation = findOperation(key);
  if (!operation) return;
  const sourceOperation = operation._base || operation;
  if (!forcedStatus && morningGate(operation)?.state === "expired") {
    renderQueue();
    return;
  }
  const currentStatus = displayStatus(operation);
  const cycle = isDayOfOperation(operation) ? ["Queued", "Ongoing", "Complete"] : statusOrder;
  const index = cycle.indexOf(currentStatus);
  const next = forcedStatus || cycle[(index + 1) % cycle.length];
  const wasComplete = currentStatus === "Complete";
  Object.assign(operation, { status: next, completed: next === "Complete" });
  if (sourceOperation !== operation) Object.assign(sourceOperation, { status: next, completed: next === "Complete" });
  if (next === "Ongoing") {
    const today = operatingDayKey();
    const started = ongoingStartDay(operation, today);
    const rolloverCount = Number(operation.rollover_count ?? operation._occurrence?.rollover_count ?? 0);
    Object.assign(operation, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    if (sourceOperation !== operation) Object.assign(sourceOperation, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    if (operation._occurrence) Object.assign(operation._occurrence, { started_on: started, last_rollover_on: today, rollover_count: rolloverCount });
    else if (scheduleMode(sourceOperation) === "one_time") Object.assign(sourceOperation, { scheduled_date: today, operation_date: today });
  }
  if (next === "Complete") {
    operation.completed_on = operatingDayKey();
    if (sourceOperation !== operation) sourceOperation.completed_on = operation.completed_on;
  } else if (wasComplete) {
    operation.completed_on = null;
    if (sourceOperation !== operation) sourceOperation.completed_on = null;
  }
  const series = operation._series || operation;
  attachMissionLink(series);
  if (series !== operation) {
    operation.mission_id = series.mission_id;
    operation.metric_key = series.metric_key;
    if (!operation._occurrence?.id) Object.assign(series, { status: operation.status, completed: Boolean(operation.completed), completed_on: operation.completed_on || null });
  }
  const localUpdatedAt = new Date().toISOString();
  operation.local_updated_at = localUpdatedAt;
  if (operation._occurrence) operation._occurrence.local_updated_at = localUpdatedAt;
  // Preserve the director's update locally before the network round trip.
  // A refresh can no longer turn a just-clicked Ongoing/Complete operation
  // back into Queued simply because the database is temporarily unavailable.
  saveCachedOperations();
  if (operation._occurrence) saveCachedOccurrences();
  renderQueue();
  renderCalendar();
  const saved = await persist(operation);
  if (!saved) {
    window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations, offline: true } }));
    return;
  }
  saveCachedOperations();
  if (operation._occurrence) saveCachedOccurrences();
  // Occurrence progress is applied by the database trigger using the durable
  // occurrence id. Keep the old local-only fallback for offline mode.
  if (operation._occurrence && (!client || !currentUser)) {
    if (next === "Complete" && !wasComplete) await updateMissionEvidence(series, 1);
    if (next !== "Complete" && wasComplete) await updateMissionEvidence(series, -1);
  }
  // Database progress triggers are the one source of truth for linked
  // missions.  Do not apply a second browser-side increment here: doing so
  // created duplicate chapter/PT progress after a refresh.
  if (currentUser) {
    await loadMissions();
    operations = await seedIfEmpty();
    await loadOccurrences();
    await ensureRecurringOccurrences();
    await markExpiredOperationsMissed();
    await rollOverOngoingOperations();
    await reconcileRecurringCompletion();
    await reconcileMeasuredMissionCounts();
    await syncDailyReadingOperation();
    subscribeToOperationSync();
    saveCachedOperations();
  }
  renderQueue();
  renderCalendar();
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations } }));
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "operation-status", operation } }));
  // app.js still receives the public change event for calendars and summaries.
  // It must not get the final paint over this queue.
  setTimeout(() => { renderQueue(); renderCalendar(); }, 0);
}

async function seedIfEmpty() {
  if (!client || !currentUser) return starterOperations();
  const { data, error } = await client.from("operations").select("*").eq("user_id", currentUser.id).order("scheduled_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    console.warn("Could not load operations", error.message);
    const local = cachedOperations();
    return ensureTodayOperations(local.length ? local : starterOperations());
  }
  if (data?.length) return ensureTodayOperations(mergeSavedStatus(await reconcileCachedOperationEdits(data)));
  // operatingDayKey() remains on the prior day from midnight through 4:59 AM,
  // so this repair can restore missing prior-day pillars without creating the
  // new day's plan before the 5 AM rollover.
  const seed = starterOperations().map(({ priority, ...operation }) => ({ ...operation, user_id: currentUser.id }));
  const { data: inserted, error: insertError } = await client.from("operations").insert(seed).select();
  if (insertError) {
    console.warn("Could not seed operations", insertError.message);
    return seed;
  }
  return ensureTodayOperations(inserted || seed);
}

async function ensureTodayOperations(records = []) {
  // operatingDayKey() keeps this on the prior day before 5 AM. Repairing that
  // day is safe; the next day's pillars still cannot appear until rollover.
  const activeDay = operatingDayKey();
  const daily = [
    ["Review charts and document one lesson", "Trading", "Review one relevant chart or completed trade, capture one process lesson, and file it in Detective or Self Mastery."],
    ["Conquer the morning", "Self Mastery", "Begin the day with one deliberate first action, protect the first block from avoidable distraction, and execute the morning standard before reactive work."],
    ["Read one chapter", "Self Mastery", readingBrief()],
    ["Journal", "Self Mastery", "Write the facts, name what is within your control, and record one lesson or next right action."],
    ["Complete evening mission debrief", "Self Mastery", "Read the Going to bed debrief, apply its priorities, and close the operating day honestly."],
  ].map(([title, category, brief]) => ({ title, category, brief, priority: priorityFor(category), status: "Queued", completed: false, is_daily: true, operation_date: activeDay, scheduled_date: activeDay, metric_key: title === "Read one chapter" ? "chapters_read" : title === "Journal" ? "mastery.entry" : null }));
  const preMarket = preMarketOperationForToday();
  if (preMarket) daily.unshift(preMarket);
  daily.push(gymOperationForToday());

  const hasTodayPlan = (planned) => records.some((operation) => {
    const sameTitle = String(operation.title || "").trim().toLowerCase() === planned.title.toLowerCase();
    if (!sameTitle) return false;
    const operationDay = dateOnly(operation.operation_date);
    const scheduledDay = dateOnly(operation.scheduled_date);
    // Only a row explicitly assigned to today can satisfy today's plan.  The
    // legacy system created undated daily rows, which caused old July work to
    // block the new day and produced an empty queue on later dates.
    return operationDay === activeDay || scheduledDay === activeDay;
  });
  const additions = daily.filter((planned) => !hasTodayPlan(planned));
  // Measured work such as PT sessions is deliberately scheduled from Mission
  // Control.  Auto-creating an undated next session made the calendar invent
  // appointments and caused duplicate recovery operations.
  if (!additions.length) return records;
  if (!client || !currentUser) return appendOperationsWithoutTouchingExisting(records, additions.map((item, index) => ({ ...item, id: `local-${activeDay}-${index}-${item.title}` })));
  const prepared = additions.map((item) => {
    const { priority, ...operationFields } = item;
    const mission = item.mission_id ? missions.find((candidate) => candidate.id === item.mission_id) : resolveMission(item);
    return { ...operationFields, user_id: currentUser.id, mission_id: mission?.id || null, metric_key: item.metric_key || mission?.metric_key || null };
  });
  const { data, error } = await client.from("operations").insert(prepared).select();
  if (error) {
    console.warn("Could not create today's operations", error.message);
    return appendOperationsWithoutTouchingExisting(records, prepared.map((item, index) => ({ ...item, id: `local-${activeDay}-${index}-${item.title}` })));
  }
  return appendOperationsWithoutTouchingExisting(records, data || prepared);
}

async function loadMissions() {
  if (!client || !currentUser) return;
  let { data, error } = await client.from("missions").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: true });
  // Keep older deployments readable if created_at was not present when the
  // mission rows were created. The user-scoped query remains authoritative.
  if (error) ({ data, error } = await client.from("missions").select("*").eq("user_id", currentUser.id));
  if (error) return console.warn("Could not load linked missions", error.message);
  missions = data || [];
  window.AEGIS_MISSIONS = missions;
  window.dispatchEvent(new CustomEvent("aegis:missions-loaded", {
    detail: { missions, source: "operations-hub" },
  }));
}

async function loadCurrentBook() {
  currentBook = null;
  if (!client || !currentUser) return;
  const { data, error } = await client.from("mastery_entries")
    .select("id, title, created_at")
    .eq("user_id", currentUser.id)
    .eq("category", "Book")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Could not load current book", error.message);
    return;
  }
  currentBook = data || null;
}

async function syncDailyReadingOperation() {
  const operation = operations.find((item) => isReadingOperation(item) && dateOnly(item.operation_date) === operatingDayKey() && !item._occurrence);
  if (!operation) return;
  const before = `${operation.brief || ""}|${operation.mission_id || ""}|${operation.metric_key || ""}`;
  operation.brief = readingBrief();
  operation.metric_key = "chapters_read";
  attachMissionLink(operation);
  const after = `${operation.brief || ""}|${operation.mission_id || ""}|${operation.metric_key || ""}`;
  if (before === after) return;
  saveCachedOperations();
  if (client && currentUser && operation.id && !String(operation.id).startsWith("local-")) {
    const { error } = await client.from("operations")
      .update({ brief: operation.brief, category: operation.category || "Self Mastery", mission_id: operation.mission_id || null, metric_key: operation.metric_key })
      .eq("id", operation.id)
      .eq("user_id", currentUser.id);
    if (error) console.warn("Could not sync current book to reading operation", error.message);
  }
}

async function syncOperationMissionLinks() {
  const pending = [];
  operations.forEach((operation) => {
    const before = `${operation.mission_id || ""}|${operation.metric_key || ""}|${operation.category || ""}`;
    attachMissionLink(operation);
    const after = `${operation.mission_id || ""}|${operation.metric_key || ""}|${operation.category || ""}`;
    if (before === after || !operation.id || String(operation.id).startsWith("local-")) return;
    pending.push({ operation, payload: { mission_id: operation.mission_id || null, metric_key: operation.metric_key || null, category: operation.category || "Self Mastery" } });
  });
  if (!pending.length) return;
  saveCachedOperations();
  if (!client || !currentUser) return;
  await Promise.all(pending.map(({ operation, payload }) =>
    client.from("operations").update(payload).eq("id", operation.id).eq("user_id", currentUser.id)
  ));
}

function ensureScheduleDialog() {
  let dialog = $("#operation-schedule-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "operation-schedule-dialog";
  dialog.className = "dialog-card operation-schedule-card";
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><p class="eyebrow amber">OPERATIONS SCHEDULE</p><h2>Plan this operation.</h2><p class="schedule-copy">Scheduling is optional. A scheduled operation stays on the calendar until you complete it.</p><div class="schedule-input-grid"><label>Date<input id="operation-schedule-date" type="date" required></label><label>Time <span class="field-optional">optional</span><input id="operation-schedule-time" type="time"></label></div><label>Schedule type<select id="operation-schedule-mode"><option value="one_time">One-time</option><option value="weekly">Repeat weekly</option></select></label><div class="dialog-actions"><button value="clear" type="submit" class="text-button">Remove from calendar</button><button value="cancel" type="submit" class="text-button">Cancel</button><button value="schedule" type="submit" class="primary">Add to calendar</button></div></form>`;
  dialog.querySelector("form")?.insertAdjacentHTML("afterbegin", '<label id="operation-schedule-choice-wrap" hidden>Unscheduled operation<select id="operation-schedule-operation"></select></label>');
  dialog.querySelector("#operation-schedule-choice-wrap")?.insertAdjacentHTML("afterend", '<div id="operation-schedule-create-fields" hidden><label>New operation<input id="operation-schedule-new-title" placeholder="What needs to happen?" /></label><label>Department<select id="operation-schedule-new-category"><option>Recovery</option><option>Trading</option><option>Business</option><option>Self Mastery</option><option>Life Admin</option></select></label></div>');
  document.body.append(dialog);
  const scheduleDate = dialog.querySelector("#operation-schedule-date");
  scheduleDate?.removeAttribute("required");
  const scheduleMode = dialog.querySelector("#operation-schedule-mode");
  if (scheduleMode) {
    scheduleMode.innerHTML = '<option value="one_time">One-time</option><option value="daily">Repeat daily</option><option value="weekly">Repeat weekly</option>';
  }
  const endWrap = document.createElement("label");
  endWrap.id = "operation-schedule-end-wrap";
  endWrap.innerHTML = 'End date <span class="field-optional">optional for repeats</span><input id="operation-schedule-end-date" type="date">';
  dialog.querySelector(".dialog-actions")?.before(endWrap);
  const syncScheduleEnd = () => {
    const mode = scheduleMode?.value || "one_time";
    const end = dialog.querySelector("#operation-schedule-end-date");
    if (end) end.disabled = mode === "one_time";
    endWrap.classList.toggle("is-disabled", mode === "one_time");
  };
  scheduleMode?.addEventListener("change", syncScheduleEnd);
  syncScheduleEnd();
  dialog.querySelector("#operation-schedule-operation")?.addEventListener("change", (event) => {
    removePickerCreatedOperation(dialog);
    const value = event.target.value;
    const createFields = dialog.querySelector("#operation-schedule-create-fields");
    if (createFields) createFields.hidden = value !== "__create__";
    if (!value) {
      dialog.dataset.operationKey = "";
      return;
    }
    if (value === "__create__") {
      dialog.dataset.operationKey = "";
      return;
    }
    if (value.startsWith("mission:")) {
      const mission = missions.find((item) => String(item.id) === value.slice("mission:".length));
      if (!mission) return;
       const scheduledCount = scheduledCountForMission(mission.id);
       const nextNumber = Math.min(Math.max(1, Number(mission.target_count || 1)), Math.max(Number(mission.completed_count || 0), scheduledCount) + 1);
       const category = mission.category === "Mind" ? "Self Mastery" : mission.category || "Self Mastery";
       const operation = {
         id: `local-${Date.now()}-${mission.id}`,
         title: `${mission.title} — ${mission.unit_label || "unit"} ${nextNumber}`,
         category,
        priority: mission.priority || priorityFor(mission.category),
        status: "Queued",
        completed: false,
        is_daily: false,
        mission_id: mission.id,
        metric_key: mission.metric_key || null,
        brief: mission.operation_template?.brief || mission.completion_definition || `Complete one measured ${mission.unit_label || "unit"} for this mission.`,
      };
      operations.push(operation);
      dialog.dataset.createdOperationId = operation.id;
      dialog.dataset.operationKey = operation.id;
      saveCachedOperations();
      return;
    }
    dialog.dataset.operationKey = value;
  });
  dialog.addEventListener("close", async () => {
    const choice = dialog.querySelector("#operation-schedule-operation");
    const createFields = dialog.querySelector("#operation-schedule-create-fields");
    let found = findOperation(dialog.dataset.operationKey);
    let operation = found?._series || found;
    if (!operation && dialog.returnValue === "schedule" && choice?.value === "__create__") {
      const title = dialog.querySelector("#operation-schedule-new-title")?.value.trim();
      if (!title) {
        window.alert("Enter an operation before adding it to the calendar.");
        setTimeout(() => dialog.showModal(), 0);
        return;
      }
      const category = dialog.querySelector("#operation-schedule-new-category")?.value || "Self Mastery";
      operation = {
        id: `local-${Date.now()}-new-operation`,
        title,
        category,
        priority: priorityFor(category),
        status: "Queued",
        completed: false,
        is_daily: false,
        scheduled_date: null,
        scheduled_time: null,
        scheduled_end_date: null,
        schedule_mode: "one_time",
        operation_date: null,
      };
      attachMissionLink(operation);
      operations.push(operation);
      dialog.dataset.createdOperationId = operation.id;
      dialog.dataset.operationKey = operation.id;
      found = operation;
    }
    if (!operation || dialog.returnValue === "cancel") {
      removePickerCreatedOperation(dialog);
      return;
    }
    const date = dialog.returnValue === "clear" ? "" : $("#operation-schedule-date")?.value;
    const time = dialog.returnValue === "clear" ? "" : $("#operation-schedule-time")?.value;
    const selectedMode = dialog.returnValue === "clear" ? "one_time" : ($("#operation-schedule-mode")?.value || "one_time");
    const endDate = dialog.returnValue === "clear" || selectedMode === "one_time" ? "" : ($("#operation-schedule-end-date")?.value || "");
    if (dialog.returnValue === "schedule" && (!date || (endDate && endDate < date))) return;
    if (dialog.returnValue === "schedule") {
      const candidate = {
        ...operation,
        scheduled_date: date || null,
        scheduled_time: time || null,
        scheduled_end_date: endDate || null,
        schedule_mode: selectedMode === "weekly" ? "recurring" : selectedMode,
      };
      const duplicate = duplicateScheduledOperation(candidate);
      if (duplicate) {
        window.alert(`This operation is already scheduled for ${date}${time ? ` at ${time}` : ""}.`);
        removePickerCreatedOperation(dialog);
        renderQueue();
        renderCalendar();
        return;
      }
    }
    operation.scheduled_date = date || null;
    operation.scheduled_time = time || null;
    operation.scheduled_end_date = endDate || null;
    operation.schedule_mode = selectedMode === "weekly" ? "recurring" : selectedMode;
    if (date > operatingDayKey() && normalizedStatus(operation) === "Queued") operation.status = "Scheduled";
    if (date === operatingDayKey() && normalizedStatus(operation) === "Scheduled") operation.status = "Queued";
    operation.local_updated_at = new Date().toISOString();
    // Preserve the user's schedule before any network round trip. If a
    // migration is missing or the connection drops, reopening the calendar
    // must still show the plan and give the next sync a chance to repair it.
    saveCachedOperations();
    const saved = await persist(operation);
    if (!saved) {
      saveCachedOperations();
      renderQueue();
      renderCalendar();
      return;
    }
    await loadOccurrences();
    await ensureRecurringOccurrences();
    saveCachedOperations();
    if (date) selectedDay = date;
    renderQueue();
    renderCalendar();
    delete dialog.dataset.createdOperationId;
    if (createFields) createFields.hidden = true;
  });
  return dialog;
}

function removePickerCreatedOperation(dialog) {
  const createdId = dialog?.dataset.createdOperationId;
  if (!createdId) return;
  operations = operations.filter((operation) => String(operation.id) !== String(createdId));
  delete dialog.dataset.createdOperationId;
  saveCachedOperations();
}

function unscheduledPickerItems() {
  const items = operations
    .filter((operation) => !operation.completed && !dateOnly(operation.scheduled_date) && !isDailyOperation(operation))
    .map((operation) => ({ value: String(operation.id || operation.title), label: operation.title, operation }));
  const linkedMissionIds = new Set(items.map((item) => String(item.operation?.mission_id || "")));
  missions
    .filter((mission) => missionNeedsScheduling(mission) && !mission.completed && scheduledCountForMission(mission.id) < Number(mission.target_count || 0) && !linkedMissionIds.has(String(mission.id)))
    .forEach((mission) => items.push({ value: `mission:${mission.id}`, label: `${mission.title} — next ${mission.unit_label || "unit"}`, mission }));
  return items;
}

function openDaySchedulePicker(date) {
  const dialog = ensureScheduleDialog();
  const choiceWrap = dialog.querySelector("#operation-schedule-choice-wrap");
  const choice = dialog.querySelector("#operation-schedule-operation");
  if (!choiceWrap || !choice) return;
  removePickerCreatedOperation(dialog);
  const items = unscheduledPickerItems();
  choice.innerHTML = `<option value="">Choose an operation</option>${items.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join("")}<option value="__create__">Create an operation…</option>`;
  choiceWrap.hidden = false;
  choice.value = "";
  dialog.dataset.operationKey = "";
  const createFields = dialog.querySelector("#operation-schedule-create-fields");
  if (createFields) createFields.hidden = true;
  const newTitle = dialog.querySelector("#operation-schedule-new-title");
  if (newTitle) newTitle.value = "";
  const dateInput = dialog.querySelector("#operation-schedule-date");
  if (dateInput) dateInput.value = date;
  const mode = dialog.querySelector("#operation-schedule-mode");
  if (mode) mode.value = "one_time";
  mode?.dispatchEvent(new Event("change"));
  if (!dialog.open) dialog.showModal();
}

function openScheduleDialog(operation) {
  if (!operation) return;
  operation = operation._series || operation;
  const dialog = ensureScheduleDialog();
  dialog.dataset.operationKey = String(operation.id || operation.title);
  delete dialog.dataset.createdOperationId;
  const choiceWrap = dialog.querySelector("#operation-schedule-choice-wrap");
  if (choiceWrap) choiceWrap.hidden = true;
  const createFields = dialog.querySelector("#operation-schedule-create-fields");
  if (createFields) createFields.hidden = true;
  const input = $("#operation-schedule-date");
  if (input) input.value = dateOnly(operation.scheduled_date) || operatingDayKey();
  const time = $("#operation-schedule-time");
  if (time) time.value = operation.scheduled_time || "";
  const mode = $("#operation-schedule-mode");
  if (mode) mode.value = scheduleMode(operation);
  const end = $("#operation-schedule-end-date");
  if (end) end.value = dateOnly(operation.scheduled_end_date) || "";
  mode?.dispatchEvent(new Event("change"));
  if (!dialog.open) dialog.showModal();
}

function openMissionScheduleDialog(missionId) {
  const mission = missions.find((item) => String(item.id) === String(missionId));
  if (!mission || mission.completed) return;
  const dialog = ensureScheduleDialog();
  removePickerCreatedOperation(dialog);
  const measured = String(mission.completion_type || "").toLowerCase() === "units";
  const category = mission.category === "Mind" ? "Self Mastery" : mission.category || "Self Mastery";
  const scheduledCount = scheduledCountForMission(mission.id);
  const nextNumber = Math.max(1, Math.max(Number(mission.completed_count || 0), scheduledCount) + 1);
  const operation = {
    id: `local-${Date.now()}-${mission.id}`,
    title: `${mission.title}${measured ? ` — ${mission.unit_label || "unit"} ${nextNumber}` : ""}`,
    category,
    priority: mission.priority || priorityFor(mission.category),
    status: "Queued",
    completed: false,
    is_daily: false,
    mission_id: mission.id,
    metric_key: mission.metric_key || null,
    brief: mission.operation_template?.brief || mission.completion_definition || `Complete one ${mission.unit_label || "operation"} for this mission.`,
  };
  operations.push(operation);
  dialog.dataset.createdOperationId = operation.id;
  dialog.dataset.operationKey = operation.id;
  const choiceWrap = dialog.querySelector("#operation-schedule-choice-wrap");
  if (choiceWrap) choiceWrap.hidden = true;
  const createFields = dialog.querySelector("#operation-schedule-create-fields");
  if (createFields) createFields.hidden = true;
  const date = dialog.querySelector("#operation-schedule-date");
  if (date) date.value = operatingDayKey();
  const time = dialog.querySelector("#operation-schedule-time");
  if (time) time.value = "";
  const mode = dialog.querySelector("#operation-schedule-mode");
  if (mode) mode.value = "one_time";
  mode?.dispatchEvent(new Event("change"));
  saveCachedOperations();
  if (!dialog.open) dialog.showModal();
}

function monthTitle(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", year: "numeric" }).format(date);
}

// Count scheduled instances, not parent series rows. Recurring schedules are
// counted from their rule as well as from materialized occurrence rows, so the
// Needs Scheduling panel updates even when migration 044 has not finished
// writing the occurrence records yet.
function scheduledCountForMission(missionId) {
  const seen = new Set();
  dedupeOperationInstances(operationInstances()).forEach((operation) => {
    const series = operation._series || operation;
    const linkedMissionId = operation.mission_id || resolveMission(operation)?.id;
    if (String(linkedMissionId || "") !== String(missionId)) return;
    const mode = scheduleMode(series);
    if (mode !== "one_time") {
      const date = dateOnly(operation.scheduled_date || operation._occurrence?.occurrence_date);
      if (date) seen.add(`series:${series.id || series.title}|${date}`);
      else recurringDateKeys(series).forEach((itemDate) => seen.add(`series:${series.id || series.title}|${itemDate}`));
      return;
    }
    const scheduledDate = dateOnly(operation.scheduled_date);
    if (scheduledDate) seen.add(`${String(linkedMissionId)}|${operationDisplayIdentity(operation)}`);
  });
  return seen.size;
}

function ensurePermanentMissionCalendar() {
  const missionsView = $("#missions");
  const dialog = $("#operations-calendar-dialog");
  if (!missionsView || missionsView.querySelector("#mission-calendar") || !dialog) return;
  const source = dialog.querySelector(".operation-calendar-card");
  if (!source) return;
  source.classList.remove("dialog-card", "operation-calendar-card");
  source.querySelector(".dialog-close")?.remove();
  source.querySelector(".eyebrow")?.remove();
  source.querySelector("h2")?.remove();
  source.querySelector(".calendar-panel-tabs")?.remove();
  source.querySelector('[data-calendar-panel-body="needed"]')?.remove();
  const shell = document.createElement("div");
  shell.className = "mission-calendar-shell";
  while (source.firstChild) shell.append(source.firstChild);
  const panel = document.createElement("section");
  panel.id = "mission-calendar";
  panel.className = "mission-calendar panel";
  panel.innerHTML = '<div class="panel-head mission-calendar-head"><div><p class="eyebrow amber">OPERATIONS SCHEDULE</p><h3>Mission calendar</h3><p class="body-copy">Select a date to review its tasks. Use Add operation to schedule an unscheduled item or create something new.</p></div><button class="primary compact" id="mission-add-operation" type="button">+ Add operation</button></div>';
  panel.append(shell);
  const missionCards = missionsView.querySelector("#mission-cards");
  const phaseProtocol = missionsView.querySelector("#phase-protocol");
  // Keep the Active / Completed mission ledger first, the roadmap/directives
  // second, and the calendar below both surfaces.
  if (phaseProtocol) phaseProtocol.after(panel);
  else if (missionCards) missionCards.after(panel);
  else missionsView.append(panel);
  dialog.remove();
  $("#open-operations-calendar")?.remove();
  wireCalendarPanels();
  $("#mission-add-operation")?.addEventListener("click", () => openDaySchedulePicker(selectedDay || operatingDayKey()));
}

function renderCalendar() {
  syncSystemDate();
  const label = $("#operations-calendar-label");
  const grid = $("#operations-calendar-grid");
  const agendaLabel = $("#calendar-agenda-label");
  const agenda = $("#calendar-agenda-list");
  const needsScheduling = $("#calendar-needs-scheduling");
  if (!grid) return;
  const displayOperations = dedupeOperationInstances(operationInstances());
  if (label) label.textContent = monthTitle(cursor);
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" }).format(cursor));
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric" }).format(cursor)) - 1;
  const start = new Date(Date.UTC(year, month, 1, 17));
  const first = start.getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0, 17)).getUTCDate();
  const cells = [];
  for (let cell = 0; cell < 42; cell += 1) {
    const day = cell - first + 1;
    if (day < 1 || day > days) {
      cells.push('<button type="button" class="calendar-day blank" aria-hidden="true"></button>');
      continue;
    }
    const date = new Date(Date.UTC(year, month, day, 17));
    const key = dayKey(date);
    const scheduled = displayOperations.filter((operation) => isScheduledOn(operation, key));
    const complete = scheduled.filter((operation) => displayStatus(operation, key) === "Complete").length;
    const classes = ["calendar-day", key === todayKey() ? "today" : "", key === selectedDay ? "selected" : ""].filter(Boolean).join(" ");
    cells.push(`<button type="button" class="${classes}" data-calendar-day="${key}"><b>${day}</b>${scheduled.length ? `<small>${complete}/${scheduled.length} OPS</small>` : '<small>—</small>'}</button>`);
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll("[data-calendar-day]").forEach((button) => button.addEventListener("click", () => {
    selectedDay = button.dataset.calendarDay;
    renderCalendar();
  }));
  const selected = displayOperations.filter((operation) => isScheduledOn(operation, selectedDay));
  if (agendaLabel) agendaLabel.textContent = selectedDay ? formatKey(selectedDay, { weekday: "long", month: "long", day: "numeric" }) : "Select a day";
  if (agenda) {
    agenda.innerHTML = selected.length ? `<div class="calendar-agenda-list">${selected.map((operation) => `<article class="calendar-agenda-item">${calendarStatusMarkup(operation, selectedDay)}<strong>${esc(operation.title)}</strong><small>${esc(operation.category || "Mission")} · choose status</small></article>`).join("")}</div>` : '<p class="calendar-empty">No operations scheduled. Select another day or schedule an operation in Mission Control.</p>';
    agenda.querySelectorAll("[data-hub-set-status]").forEach((select) => select.addEventListener("change", () => setOperationStatus(select.dataset.hubSetStatus, select.value, select.dataset.hubStatusDay)));
  }
  if (needsScheduling) {
    const measured = missions
      .filter((mission) => missionNeedsScheduling(mission) && !mission.completed)
      .map((mission) => {
        const target = Math.max(0, Number(mission.target_count || 0));
        const completedCount = Math.max(0, Math.min(target, Number(mission.completed_count || 0)));
        const scheduledCount = scheduledCountForMission(mission.id);
        const remaining = Math.max(0, target - completedCount);
        const unscheduled = Math.max(0, target - scheduledCount);
        return { mission, completedCount, remaining, unscheduled };
      })
      .filter(({ unscheduled }) => unscheduled > 0);
    needsScheduling.innerHTML = measured.length
      ? measured.map(({ mission, remaining }) => `<article class="calendar-needs-item"><div><strong>${esc(mission.title)}</strong><small>${remaining} remaining to schedule · ${esc(mission.unit_label || "units")}</small></div><button type="button" class="primary compact" data-schedule-mission="${esc(mission.id)}">Schedule next</button></article>`).join("")
      : '<p class="calendar-empty">Every measured mission has its remaining operations placed on the calendar.</p>';
    needsScheduling.querySelectorAll(".calendar-needs-item small").forEach((small, index) => {
      const item = measured[index];
      if (!item) return;
      const target = Math.max(0, Number(item.mission.target_count || 0));
      small.textContent = `${item.completedCount}/${target} complete · ${item.remaining} remaining to complete · ${item.unscheduled} unscheduled · ${item.mission.unit_label || "units"}`;
    });
    needsScheduling.querySelectorAll("[data-schedule-mission]").forEach((button) => button.addEventListener("click", () => {
      const mission = missions.find((item) => String(item.id) === String(button.dataset.scheduleMission));
      if (!mission) return;
      let operation = operations.find((item) => String(item.mission_id || "") === String(mission.id) && !item.scheduled_date && !item.completed);
      if (!operation) {
        const target = Math.max(1, Number(mission.target_count || 1));
        const done = Math.max(0, Number(mission.completed_count || 0));
        const scheduledCount = scheduledCountForMission(mission.id);
        const nextNumber = Math.min(target, Math.max(done, scheduledCount) + 1);
        operation = {
          id: `local-${Date.now()}-${mission.id}`,
          title: `${mission.title} — ${mission.unit_label || "unit"} ${nextNumber}`,
          category: mission.category || "Mission",
          priority: mission.priority || priorityFor(mission.category),
          status: "Queued",
          completed: false,
          is_daily: false,
          mission_id: mission.id,
          metric_key: mission.metric_key || null,
          brief: mission.operation_template?.brief || mission.completion_definition || `Complete one measured ${mission.unit_label || "unit"} for this mission.`,
        };
        operations.push(operation);
      }
      openScheduleDialog(operation);
    }));
  }
}

function openCalendar() {
  // The calendar is permanently mounted in Mission Control. Legacy callers
  // now just scroll to that surface instead of opening a second dialog.
  // A previous legacy cursor must never reopen July after the calendar has moved
  // into a later month.
  cursor = newYorkTodayDate();
  selectedDay = operatingDayKey();
  ensurePermanentMissionCalendar();
  renderCalendar();
  $("#mission-calendar")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function wireCalendarPanels() {
  document.querySelectorAll("[data-calendar-panel]").forEach((button) => {
    if (button.dataset.calendarPanelWired === "true") return;
    button.dataset.calendarPanelWired = "true";
    button.addEventListener("click", () => {
    const name = button.dataset.calendarPanel;
    document.querySelectorAll("[data-calendar-panel]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-calendar-panel-body]").forEach((item) => item.classList.toggle("hidden", item.dataset.calendarPanelBody !== name));
    });
  });
}

let bootInFlight = false;
async function boot() {
  if (bootInFlight) return;
  bootInFlight = true;
  operationsReady = false;
  try {
    ensurePermanentMissionCalendar();
  if (client) {
      const { data } = await client.auth.getSession();
      currentUser = data?.session?.user || null;
    }
    await loadBedtimeRecords();
  // A queue must never disappear merely because an auth refresh is still in
  // flight. Cloud records replace this small local safety feed as soon as the
  // session is available.
  const local = cachedOperations();
  if (currentUser) {
    await loadMissions();
    await loadCurrentBook();
  }
  if (currentUser) {
    operations = await seedIfEmpty();
    await syncOperationMissionLinks();
    await syncDailyReadingOperation();
    await loadOccurrences();
    await ensureRecurringOccurrences();
    await markExpiredOperationsMissed();
    await reconcileRecurringCompletion();
    await reconcileMeasuredMissionCounts();
    await syncDailyReadingOperation();
    subscribeToOperationSync();
  } else {
    operations = await ensureTodayOperations(local.length ? local : starterOperations());
    operationOccurrences = cachedOccurrences();
  }
  if (!operations.length) operations = local.length ? local : starterOperations();
    saveCachedOperations();
    operationsReady = true;
    announceOperationsLoaded();
    renderQueue();
    renderCalendar();
  } catch (error) {
    console.warn("Operations hub recovered from a load error", error);
    operations = cachedOperations();
    if (!operations.length) operations = starterOperations();
    operationsReady = true;
    announceOperationsLoaded();
    renderQueue();
    renderCalendar();
  } finally {
    bootInFlight = false;
  }
}

window.AEGIS_OPEN_CALENDAR = openCalendar;
window.AEGIS_SCHEDULE_MISSION = openMissionScheduleDialog;
window.AEGIS_RENDER_OPERATIONS_QUEUE = () => {
  renderQueue();
  renderCalendar();
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("#open-operations-calendar");
  if (!button) return;
  event.preventDefault();
  // The old app.js calendar handler is still present.  Letting it receive the
  // same click opens its outdated dialog after this current-month calendar.
  event.stopImmediatePropagation();
  openCalendar();
}, true);
const startHub = () => {
  window.AEGIS_OPERATIONS_HUB_ACTIVE = true;
  setInterval(refreshMorningCountdown, 1000);
  ensurePermanentMissionCalendar();
  syncSystemDate();
  // Keep one stable surface while auth and Supabase synchronize. Painting the
  // local starter feed first made it flash over the durable queue milliseconds
  // later, which looked like the operation box was changing by itself.
  const host = ensureLiveQueueHost();
  if (host && host.dataset.aegisQueueMounted !== "true") {
    host.innerHTML = '<p class="empty-operations">Syncing today\'s operations…</p>';
  }
  boot().finally(() => [0, 250, 1000, 2500, 5000, 9000, 14000].forEach((delay) => setTimeout(renderQueue, delay)));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startHub, { once: true });
else startHub();
window.addEventListener("aegis:auth-ready", boot);
// A full refresh and a route transition each recreate parts of the Command
// Center.  These last-resort paints make the queue independent of render
// order, while the durable Supabase rows remain the source of truth.
window.addEventListener("load", () => [0, 300, 1200, 3500].forEach((delay) => setTimeout(renderQueue, delay)));
window.addEventListener("aegis:missions-refresh", async (event) => {
  if (event.detail?.source === "operations-hub") return;
  await loadMissions();
  renderQueue();
});
window.addEventListener("aegis:mastery-changed", async () => {
  if (!currentUser) return;
  await loadCurrentBook();
  await syncDailyReadingOperation();
  renderQueue();
});
window.addEventListener("aegis:operations-changed", async (event) => {
  if (event.detail?.source === "operations-hub" || !currentUser) return;
  operations = await seedIfEmpty();
  await loadMissions();
  saveCachedOperations();
  renderQueue();
  renderCalendar();
});

const wireCalendar = () => {
  const moveMonth = (delta) => {
    const values = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
    }).formatToParts(cursor).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    cursor = new Date(Date.UTC(Number(values.year), Number(values.month) - 1 + delta, 1, 17));
    renderCalendar();
  };
  // app.js still has legacy calendar listeners. Capture these controls before
  // they reach that code so there is one calendar renderer and one cursor.
  const captureCalendarMove = (selector, delta) => {
    document.addEventListener("click", (event) => {
      const control = event.target.closest(selector);
      if (!control) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moveMonth(delta);
    }, true);
  };
  captureCalendarMove("#calendar-prev", -1);
  captureCalendarMove("#calendar-next", 1);
  wireCalendarPanels();
  // The queue is painted by startHub(), boot(), and the route hooks below.
  // Avoid a document-wide observer here: queue repainting itself changes the
  // dashboard DOM and can otherwise schedule an endless refresh loop.

  // Navigation swaps the active view without a full page reload. Repaint the
  // durable queue after the new Command Center surface is in the DOM instead
  // of relying on a stale July-era placeholder from the legacy script.
  const refreshCommandSurface = () => setTimeout(() => {
    syncSystemDate();
    renderQueue();
    renderCalendar();
  }, 0);
  window.addEventListener("hashchange", refreshCommandSurface);
  window.addEventListener("aegis:navigation", refreshCommandSurface);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireCalendar, { once: true });
else wireCalendar();
