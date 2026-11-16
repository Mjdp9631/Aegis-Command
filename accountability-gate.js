import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let activeProtocol = null;
let activeUserId = null;

function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDay(key, amount) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function scheduleMode(operation) {
  const mode = String(operation?.schedule_mode || "one_time").toLowerCase();
  if (mode === "daily") return "daily";
  if (mode === "weekly" || mode === "recurring") return "weekly";
  return "one_time";
}

function scheduledOn(operation, key) {
  const start = dateOnly(operation?.scheduled_date || (operation?.is_daily ? operation?.operation_date : ""));
  if (!start || !key || key < start) return false;
  const end = dateOnly(operation?.scheduled_end_date);
  if (end && key > end) return false;
  const mode = scheduleMode(operation);
  if (mode === "one_time") return key === start;
  if (mode === "daily") return true;
  return new Date(`${start}T12:00:00Z`).getUTCDay() === new Date(`${key}T12:00:00Z`).getUTCDay();
}

function isComplete(row) {
  return Boolean(row?.completed) || String(row?.status || "").toLowerCase() === "complete";
}

function evaluateExecution(operations, occurrences) {
  const today = dayKey();
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 7));
  const occurrencesByDay = new Map();
  (occurrences || []).forEach((occurrence) => {
    const date = dateOnly(occurrence?.occurrence_date);
    if (!days.includes(date)) return;
    const rows = occurrencesByDay.get(date) || [];
    rows.push(occurrence);
    occurrencesByDay.set(date, rows);
  });
  const dailyRates = days.map((date) => {
    const rows = [];
    const materializedOperationIds = new Set((occurrencesByDay.get(date) || []).map((row) => String(row.operation_id)));
    (occurrencesByDay.get(date) || []).forEach((row) => rows.push(row));
    (operations || []).forEach((operation) => {
      if (!scheduledOn(operation, date)) return;
      if (scheduleMode(operation) !== "one_time" && materializedOperationIds.has(String(operation.id))) return;
      rows.push(operation);
    });
    const total = rows.length;
    const done = rows.filter(isComplete).length;
    return { date, total, done, rate: total ? done / total : null };
  }).filter((day) => day.total > 0);
  if (dailyRates.length < 3) return null;
  const total = dailyRates.reduce((sum, day) => sum + day.total, 0);
  const done = dailyRates.reduce((sum, day) => sum + day.done, 0);
  const rate = total ? done / total : 0;
  if (rate >= .7) return null;
  const severity = rate < .4 ? "critical" : rate < .6 ? "major" : "moderate";
  return {
    severity,
    trigger_type: "weekly_execution",
    trigger_date: shiftDay(today, -1),
    execution_rate: Number((rate * 100).toFixed(2)),
    summary: `${done}/${total} scheduled operations completed over the last ${dailyRates.length} scheduled days (${Math.round(rate * 100)}%).`,
  };
}

function inactivityProtocol(operations, occurrences, campaign) {
  if (!campaign?.started_at) return null;
  const evidence = [...(operations || []), ...(occurrences || [])]
    .filter(isComplete)
    .map((row) => dateOnly(row.completed_on || row.occurrence_date || row.scheduled_date || row.operation_date))
    .filter(Boolean)
    .sort();
  const today = dayKey();
  const cutoff = shiftDay(today, -7);
  if (evidence.some((date) => date >= cutoff && date < today)) return null;
  return {
    severity: "critical",
    trigger_type: "inactivity",
    trigger_date: today,
    execution_rate: null,
    summary: "No completed execution evidence has been recorded in the last seven operating days. Re-entry is required before the command center reopens.",
  };
}

function ensureGate() {
  let gate = document.querySelector("#aegis-accountability-gate");
  if (gate) return gate;
  document.body.insertAdjacentHTML("beforeend", `<section id="aegis-accountability-gate" aria-label="AEGIS accountability protocol"><form class="accountability-gate-card" id="accountability-gate-form" novalidate><p class="eyebrow amber">ACCOUNTABILITY PROTOCOL / <span class="accountability-severity" data-accountability-severity>REVIEW</span></p><h1>Re-entry required.</h1><p>Before the command center reopens, record what happened and name the concrete task that repairs the breach. The task will be placed in your operation queue immediately.</p><div class="accountability-brief"><strong data-accountability-title>PROTOCOL</strong><span data-accountability-summary>Reviewing your operating record.</span></div><label>What happened?<textarea name="reason" required minlength="20" maxlength="2000" placeholder="State the cause plainly. No performance—just the facts."></textarea></label><label>What is the make-up task?<textarea name="make_up_task" required minlength="10" maxlength="500" placeholder="One concrete, finishable action that begins the repair."></textarea></label><p class="accountability-gate-message" role="status"></p><button class="primary" type="submit">Record correction and reopen command</button></form></section>`);
  gate = document.querySelector("#aegis-accountability-gate");
  gate.querySelector("form")?.addEventListener("submit", submitCorrection);
  return gate;
}

function showProtocol(protocol) {
  activeProtocol = protocol;
  const gate = ensureGate();
  gate.querySelector("[data-accountability-severity]").textContent = `${String(protocol.severity || "review").toUpperCase()} BREACH`;
  gate.querySelector("[data-accountability-title]").textContent = `${String(protocol.trigger_type || "accountability").replace(/_/g, " ").toUpperCase()} DETECTED`;
  gate.querySelector("[data-accountability-summary]").textContent = protocol.summary || "A correction protocol is required.";
  document.body.classList.remove("accountability-pending");
  document.body.classList.add("accountability-locked");
}

function unlock() {
  activeProtocol = null;
  document.body.classList.remove("accountability-pending", "accountability-locked");
  window.dispatchEvent(new CustomEvent("aegis:accountability-ready", { detail: { unlocked: true } }));
}

function message(text) {
  const target = document.querySelector(".accountability-gate-message");
  if (target) target.textContent = text;
}

async function submitCorrection(event) {
  event.preventDefault();
  if (!supabase || !activeProtocol || !activeUserId) return;
  const form = event.currentTarget;
  const reason = String(new FormData(form).get("reason") || "").trim();
  const makeUpTask = String(new FormData(form).get("make_up_task") || "").trim();
  if (reason.length < 20 || makeUpTask.length < 10) return message("Write a plain explanation and one concrete make-up task before reopening the system.");
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  message("Creating the corrective operation…");
  const date = dayKey();
  const { data: operation, error: operationError } = await supabase.from("operations").insert({
    user_id: activeUserId,
    title: `Correction protocol — ${makeUpTask}`.slice(0, 220),
    category: "Self Mastery",
    priority: activeProtocol.severity === "critical" ? "High" : "Medium",
    brief: `Accountability correction for ${activeProtocol.trigger_type.replace(/_/g, " ")}.\n\nReason recorded: ${reason}`,
    status: "Queued",
    completed: false,
    is_daily: false,
    scheduled_date: date,
    operation_date: date,
    allow_unlinked: true,
  }).select("id").single();
  if (operationError || !operation) {
    submit.disabled = false;
    return message(operationError?.message || "The make-up operation could not be created. Nothing has been unlocked.");
  }
  message("Recording the correction…");
  const { error } = await supabase.from("accountability_protocols").update({
    status: "acknowledged",
    reason,
    make_up_task: makeUpTask,
    make_up_operation_id: operation.id,
    acknowledged_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", activeProtocol.id).eq("user_id", activeUserId).eq("status", "open");
  if (error) {
    submit.disabled = false;
    return message(`The correction record could not be saved. The new operation remains queued: ${error.message}`);
  }
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "accountability-gate" } }));
  window.dispatchEvent(new Event("aegis:data-changed"));
  unlock();
}

async function loadGate(session) {
  ensureGate();
  activeUserId = session?.user?.id || null;
  if (!supabase || !activeUserId) {
    unlock();
    return;
  }
  document.body.classList.add("accountability-pending");
  const load = async () => Promise.all([
    supabase.from("accountability_protocols").select("id,severity,trigger_type,trigger_date,execution_rate,summary,status").eq("user_id", activeUserId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("operations").select("id,scheduled_date,scheduled_end_date,operation_date,schedule_mode,is_daily,completed,completed_on,status,created_at").eq("user_id", activeUserId).or(`scheduled_date.gte.${shiftDay(dayKey(), -10)},schedule_mode.in.(daily,weekly,recurring)`).limit(250),
    supabase.from("operation_occurrences").select("id,operation_id,occurrence_date,completed,completed_on,status").eq("user_id", activeUserId).gte("occurrence_date", shiftDay(dayKey(), -10)).lt("occurrence_date", dayKey()),
    supabase.from("xp_campaigns").select("started_at").eq("user_id", activeUserId).maybeSingle(),
  ]);
  const [protocolResult, operationsResult, occurrencesResult, campaignResult] = window.AEGIS_DATA_GUARD
    ? await window.AEGIS_DATA_GUARD.run("accountability:gate", load, { ttl: 60000 })
    : await load();
  if (protocolResult.error) {
    // The migration may be deployed after this client bundle. Do not make a
    // missing table look like a user discipline failure.
    console.warn("Accountability protocol unavailable", protocolResult.error.message);
    unlock();
    return;
  }
  if (protocolResult.data) return showProtocol(protocolResult.data);
  if (operationsResult.error || occurrencesResult.error || campaignResult.error) {
    console.warn("Accountability evaluation deferred until the activity snapshot is available", operationsResult.error?.message || occurrencesResult.error?.message || campaignResult.error?.message);
    unlock();
    return;
  }
  const operations = operationsResult.data || [];
  const occurrences = occurrencesResult.data || [];
  const breach = inactivityProtocol(operations, occurrences, campaignResult.data)
    || evaluateExecution(operations, occurrences);
  if (!breach) return unlock();
  const { data: created, error } = await supabase.from("accountability_protocols").insert({ ...breach, user_id: activeUserId }).select("id,severity,trigger_type,trigger_date,execution_rate,summary,status").single();
  if (error) {
    console.warn("Could not create accountability protocol", error.message);
    unlock();
    return;
  }
  showProtocol(created);
}

function handleAuth(event) {
  const session = event.detail?.session || null;
  if (!session) {
    activeProtocol = null;
    activeUserId = null;
    document.body.classList.remove("accountability-pending", "accountability-locked");
    return;
  }
  void loadGate(session);
}

ensureGate();
window.addEventListener("aegis:auth-ready", handleAuth);
if (window.AEGIS_AUTH_RESOLVED) handleAuth({ detail: { session: window.AEGIS_AUTH_SESSION } });
