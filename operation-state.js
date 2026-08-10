/* Shared operation state for Command Center surfaces.
 *
 * Operations Hub is the interactive owner, but read-only panels must use the
 * same occurrence rows and 5 AM Eastern operating-day boundary. Keeping this
 * small normalizer here prevents each panel from inventing its own totals.
 */
const AEGIS_TIME_ZONE = "America/New_York";

export function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function easternParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AEGIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function operatingDayKey(value = new Date()) {
  const parts = easternParts(value);
  const day = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  if (Number(parts.hour) < 5) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function shiftDay(key, amount) {
  const day = new Date(`${key}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

function scheduleMode(operation) {
  return String(operation?.schedule_mode || (operation?.is_daily ? "daily" : "one_time")).toLowerCase();
}

function isRecurring(operation) {
  return ["daily", "weekly", "recurring"].includes(scheduleMode(operation));
}

export function operationComplete(operation) {
  return Boolean(operation?.completed) || String(operation?.status || "").toLowerCase() === "complete";
}

export function effectiveOperations(operations = [], occurrences = []) {
  const recurringIds = new Set(operations.filter(isRecurring).map((operation) => String(operation.id)));
  const occurrenceOperationIds = new Set(occurrences.map((occurrence) => String(occurrence.operation_id)));
  const parents = operations.filter((operation) => !recurringIds.has(String(operation.id)) || !occurrenceOperationIds.has(String(operation.id)));
  const rows = occurrences.map((occurrence) => {
    const parent = operations.find((operation) => String(operation.id) === String(occurrence.operation_id)) || {};
    return {
      ...parent,
      id: `occurrence:${occurrence.id}`,
      operation_id: occurrence.operation_id,
      occurrence_date: occurrence.occurrence_date,
      operation_date: occurrence.occurrence_date,
      scheduled_date: occurrence.occurrence_date,
      scheduled_time: occurrence.scheduled_time || parent.scheduled_time || parent.recurrence_time || null,
      completed_on: occurrence.completed_on || null,
      status: occurrence.status || (occurrence.completed ? "Complete" : parent.status || "Queued"),
      completed: Boolean(occurrence.completed) || String(occurrence.status || "").toLowerCase() === "complete",
      _occurrence: occurrence,
    };
  });
  return [...parents, ...rows];
}

export function operationIsOnDay(operation, day = operatingDayKey()) {
  const occurrenceDay = dateOnly(operation?.occurrence_date);
  if (occurrenceDay) return occurrenceDay === day;

  const start = dateOnly(operation?.scheduled_date || operation?.operation_date);
  if (!start || day < start) return false;
  const end = dateOnly(operation?.scheduled_end_date);
  if (end && day > end) return false;

  const mode = scheduleMode(operation);
  if (mode === "daily") return true;
  if (mode !== "weekly" && mode !== "recurring") return day === start;

  const startWeekday = new Date(`${start}T12:00:00Z`).getUTCDay();
  const dayWeekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return startWeekday === dayWeekday;
}

export function operationsForDay(operations = [], occurrences = [], day = operatingDayKey()) {
  return effectiveOperations(operations, occurrences).filter((operation) => operationIsOnDay(operation, day));
}

export function operationDay(operation) {
  return dateOnly(operation?.occurrence_date || operation?.scheduled_date || operation?.operation_date || operation?.completed_on || operation?.created_at);
}

export function operationIdentity(operation) {
  return operation?._occurrence?.id
    ? `occurrence:${operation._occurrence.id}`
    : [String(operation?.title || "").trim().toLowerCase(), dateOnly(operation?.scheduled_date || operation?.operation_date), String(operation?.scheduled_time || "").slice(0, 5)].join("|");
}

