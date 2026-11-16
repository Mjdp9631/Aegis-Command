import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let activeProtocol = null;
let activeUserId = null;
let activeRecommendations = [];

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

function operatingWeekKey(key = dayKey()) {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return shiftDay(key, -((weekday + 6) % 7));
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

function correctiveDomain(row, operationById = new Map()) {
  const operation = operationById.get(String(row?.operation_id || "")) || row || {};
  const title = `${operation.title || ""} ${operation.brief || ""}`.toLowerCase();
  const category = String(operation.category || "").toLowerCase();
  const metric = String(operation.metric_key || "").toLowerCase();
  if (metric === "chapters_read" || /\b(read|reading|chapter|book)\b/.test(title)) return "reading";
  if (metric === "gym_session" || /\b(gym|workout|strength|resistance|upper body|lower body|legs|push|pull)\b/.test(title)) return "gym";
  if (/\b(journal|debrief|reflection|today'?s focus)\b/.test(title)) return "journal";
  if (category === "trading" || /\b(pre-market|chart|trade review|trading)\b/.test(title)) return "trading";
  if (category === "business" || /\b(client|business|sales|proposal|content)\b/.test(title)) return "business";
  if (category === "recovery" || /\b(recovery|rest and reset|mobility)\b/.test(title)) return "recovery";
  return "general";
}

function domainLabel(domain) {
  return ({ reading: "Reading", gym: "Gym training", journal: "Journaling", trading: "Trading", business: "Business", recovery: "Recovery", general: "General execution" })[domain] || "General execution";
}

function severityPlan(severity) {
  return ({
    moderate: { reading: "two complete chapters", minutes: 30, days: 1, restriction: "No recreational feeds, video, or gaming until the completion evidence is logged." },
    major: { reading: "three complete chapters", minutes: 45, days: 2, restriction: "No recreational feeds, video, or gaming for the rest of today; restore access only after the completion evidence is logged." },
    critical: { reading: "four complete chapters across two focused blocks", minutes: 60, days: 3, restriction: "No recreational feeds, video, or gaming for 48 hours; restore access only after the completion evidence is logged." },
  })[severity] || { reading: "two complete chapters", minutes: 30, days: 1, restriction: "No recreational media until the completion evidence is logged." };
}

function protocolDomain(protocol) {
  const summary = String(protocol?.summary || "");
  const focus = summary.match(/Primary corrective focus:\s*([^.(]+)/i)?.[1]?.trim().toLowerCase();
  return ({ reading: "reading", "gym training": "gym", journaling: "journal", trading: "trading", business: "business", recovery: "recovery", "general execution": "general" })[focus] || "general";
}

function correctiveRecommendations(protocol) {
  const plan = severityPlan(protocol?.severity);
  const domain = protocolDomain(protocol);
  const shared = { category: "Self Mastery", priority: protocol?.severity === "critical" ? "High" : "Medium", consequence: plan.restriction };
  const byDomain = {
    reading: [
      { title: "Restore reading momentum", task: `Read ${plan.reading} with notifications away, then record three useful takeaways.`, ...shared },
      { title: "Complete a focused reading block", task: `Complete ${plan.minutes} uninterrupted minutes of reading and write a five-bullet summary.`, ...shared },
      { title: "Rebuild the reading cadence", task: `Schedule and complete a 20-minute reading block on each of the next ${plan.days} operating day${plan.days === 1 ? "" : "s"}.`, ...shared },
    ],
    gym: [
      { title: "Resume the planned training split", task: `Complete the next planned gym session at its normal programmed load, then add ${Math.min(plan.minutes, 30)} minutes of recovery-safe mobility or walking. Do not double a missed heavy session.`, ...shared },
      { title: "Rebuild training readiness", task: `Complete ${plan.minutes} minutes of recovery-safe walking or zone 2 work plus a full mobility sequence, then schedule the next gym session.`, ...shared },
      { title: "Restore the training cadence", task: `Complete and log the next ${plan.days} scheduled gym session${plan.days === 1 ? "" : "s"} on their assigned days.`, ...shared },
    ],
    journal: [
      { title: "Run an after-action review", task: `Write a ${plan.minutes}-minute journal entry: what failed, what changes tomorrow, and the first action to take.`, ...shared },
      { title: "Restore the daily close", task: `Complete the mission debrief and tomorrow's focus for each of the next ${plan.days} operating day${plan.days === 1 ? "" : "s"}.`, ...shared },
      { title: "Create an operating reset", task: "Write a one-page operating reset with three non-negotiables and place the first one on tomorrow's schedule.", ...shared },
    ],
    trading: [
      { title: "Complete a no-trade review", task: `Review the last ${plan.days + 1} trading sessions, log one setup and one invalidation rule for each, and make no live trade until the review is complete.`, category: "Trading", priority: "High", consequence: "Live trading is paused until the review is logged." },
      { title: "Rebuild pre-market discipline", task: `Complete a full pre-market plan for each of the next ${plan.days} trading day${plan.days === 1 ? "" : "s"}, including risk limits and an explicit no-trade condition.`, category: "Trading", priority: "High", consequence: "No discretionary chart watching or live trading until the plan is logged." },
      { title: "Perform a risk reset", task: "Write a risk-reset checklist and complete one paper-trade review against it before any live execution.", category: "Trading", priority: "High", consequence: "Live trading remains paused until the paper-trade review is logged." },
    ],
    business: [
      { title: "Restore the business block", task: `Complete one ${plan.minutes}-minute distraction-free business block on the highest-leverage queued task and record its outcome.`, category: "Business", priority: "High", consequence: plan.restriction },
      { title: "Rebuild execution cadence", task: `Schedule and complete one focused business block on each of the next ${plan.days} operating day${plan.days === 1 ? "" : "s"}.`, category: "Business", priority: "High", consequence: plan.restriction },
      { title: "Close a concrete loop", task: "Choose the oldest high-value open business task, define its next deliverable, and finish that deliverable before opening a new task.", category: "Business", priority: "High", consequence: plan.restriction },
    ],
    recovery: [
      { title: "Execute a recovery reset", task: `Complete ${plan.minutes} minutes of recovery-safe mobility, hydrate, and set tonight's sleep window before planning any extra training.`, ...shared },
      { title: "Re-establish recovery basics", task: `Complete a recovery check-in and protect the next ${plan.days} sleep window${plan.days === 1 ? "" : "s"}; log any pain or limitation instead of training through it.`, ...shared },
      { title: "Create a safe return plan", task: "Write tomorrow's recovery-safe training plan, including the stop condition that prevents overcompensation.", ...shared },
    ],
    general: [
      { title: "Close the highest-priority loop", task: `Complete one ${plan.minutes}-minute focused block on the highest-priority queued operation and record the outcome.`, ...shared },
      { title: "Restore a minimum viable day", task: `Complete the next ${plan.days} operating day${plan.days === 1 ? "" : "s"} with a written focus, one completed operation, and a mission debrief.`, ...shared },
      { title: "Build a re-entry plan", task: "Create tomorrow's three-operation plan and complete the first operation before any recreational media.", ...shared },
    ],
  };
  return byDomain[domain] || byDomain.general;
}

function evaluateExecution(operations, occurrences) {
  const today = dayKey();
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 7));
  const operationById = new Map((operations || []).map((operation) => [String(operation.id), operation]));
  const occurrencesByDay = new Map();
  (occurrences || []).forEach((occurrence) => {
    const date = dateOnly(occurrence?.occurrence_date);
    if (!days.includes(date)) return;
    const rows = occurrencesByDay.get(date) || [];
    rows.push(occurrence);
    occurrencesByDay.set(date, rows);
  });
  const missedByDomain = new Map();
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
    rows.filter((row) => !isComplete(row)).forEach((row) => {
      const domain = correctiveDomain(row, operationById);
      missedByDomain.set(domain, (missedByDomain.get(domain) || 0) + 1);
    });
    return { date, total, done, rate: total ? done / total : null };
  }).filter((day) => day.total > 0);
  if (dailyRates.length < 3) return null;
  const total = dailyRates.reduce((sum, day) => sum + day.total, 0);
  const done = dailyRates.reduce((sum, day) => sum + day.done, 0);
  const rate = total ? done / total : 0;
  if (rate >= .7) return null;
  const severity = rate < .4 ? "critical" : rate < .6 ? "major" : "moderate";
  const primaryDomain = [...missedByDomain.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "general";
  const primaryMisses = missedByDomain.get(primaryDomain) || 0;
  return {
    severity,
    trigger_type: "weekly_execution",
    // The review stays one occurrence for the whole operating week. Without
    // this stable key, a rolling seven-day calculation can create the same
    // breach again after every login or refresh.
    trigger_date: operatingWeekKey(today),
    execution_rate: Number((rate * 100).toFixed(2)),
    summary: `${done}/${total} scheduled operations completed over the last ${dailyRates.length} scheduled days (${Math.round(rate * 100)}%). Primary corrective focus: ${domainLabel(primaryDomain)} (${primaryMisses} missed operations).`,
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

function isHandledProtocol(protocol) {
  return ["acknowledged", "completed"].includes(String(protocol?.status || "").toLowerCase());
}

function isSameBreachOccurrence(existing, breach) {
  if (!existing || !breach || existing.trigger_type !== breach.trigger_type) return false;
  if (breach.trigger_type === "weekly_execution") return operatingWeekKey(existing.trigger_date) === operatingWeekKey(breach.trigger_date);
  // A seven-day inactivity gap is one ongoing occurrence. It becomes eligible
  // again only after a completed action breaks the gap and a later gap forms.
  return existing.trigger_type === "inactivity" && existing.trigger_date >= shiftDay(dayKey(), -7);
}

function hasHandledOccurrence(protocols, breach, ignoreId = null) {
  return (protocols || []).some((protocol) => String(protocol.id) !== String(ignoreId || "")
    && isHandledProtocol(protocol)
    && isSameBreachOccurrence(protocol, breach));
}

function ensureGate() {
  let gate = document.querySelector("#aegis-accountability-gate");
  if (gate) return gate;
  document.body.insertAdjacentHTML("beforeend", `<section id="aegis-accountability-gate" aria-label="AEGIS accountability protocol"><form class="accountability-gate-card" id="accountability-gate-form" novalidate><p class="eyebrow amber">ACCOUNTABILITY PROTOCOL / <span class="accountability-severity" data-accountability-severity>REVIEW</span></p><h1>Re-entry required.</h1><p>Before the command center reopens, record what happened and accept one corrective order. AEGIS assigns the work from the missed domain; you do not have to invent the remedy.</p><div class="accountability-brief"><strong data-accountability-title>PROTOCOL</strong><span data-accountability-summary>Reviewing your operating record.</span></div><label>What happened?<textarea name="reason" required minlength="20" maxlength="2000" placeholder="State the cause plainly. No performance—just the facts."></textarea></label><fieldset class="accountability-options"><legend>Select a corrective order</legend><p class="accountability-option-hint">Each order includes its required consequence. Complete it before treating the breach as closed.</p><div data-accountability-options></div></fieldset><p class="accountability-gate-message" role="status"></p><button class="primary" type="submit">Accept correction and reopen command</button></form></section>`);
  gate = document.querySelector("#aegis-accountability-gate");
  gate.querySelector("form")?.addEventListener("submit", submitCorrection);
  return gate;
}

function renderRecommendations(gate, protocol) {
  activeRecommendations = correctiveRecommendations(protocol);
  const target = gate.querySelector("[data-accountability-options]");
  if (!target) return;
  target.replaceChildren();
  activeRecommendations.forEach((recommendation, index) => {
    const label = document.createElement("label");
    label.className = "accountability-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "corrective_order";
    input.value = String(index);
    input.required = true;
    const copy = document.createElement("span");
    copy.className = "accountability-option-copy";
    const title = document.createElement("strong");
    title.textContent = recommendation.title;
    const task = document.createElement("span");
    task.textContent = recommendation.task;
    const consequence = document.createElement("small");
    consequence.textContent = `CONSEQUENCE — ${recommendation.consequence}`;
    copy.append(title, task, consequence);
    label.append(input, copy);
    target.append(label);
  });
}

function showProtocol(protocol) {
  activeProtocol = protocol;
  const gate = ensureGate();
  gate.querySelector("[data-accountability-severity]").textContent = `${String(protocol.severity || "review").toUpperCase()} BREACH`;
  gate.querySelector("[data-accountability-title]").textContent = `${String(protocol.trigger_type || "accountability").replace(/_/g, " ").toUpperCase()} DETECTED`;
  gate.querySelector("[data-accountability-summary]").textContent = protocol.summary || "A correction protocol is required.";
  renderRecommendations(gate, protocol);
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
  const selectedValue = new FormData(form).get("corrective_order");
  const selectedIndex = selectedValue === null ? Number.NaN : Number(selectedValue);
  const recommendation = activeRecommendations[selectedIndex];
  if (reason.length < 20 || !recommendation) return message("Write a plain explanation and select one assigned corrective order before reopening the system.");
  const makeUpTask = `${recommendation.task} Consequence: ${recommendation.consequence}`;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  message("Creating the corrective operation…");
  const date = dayKey();
  const { data: operation, error: operationError } = await supabase.from("operations").insert({
    user_id: activeUserId,
    title: `Correction protocol — ${recommendation.title}`.slice(0, 220),
    category: recommendation.category,
    brief: `Accountability correction for ${activeProtocol.trigger_type.replace(/_/g, " ")}.\n\nAssigned corrective order: ${recommendation.task}\n\nConsequence: ${recommendation.consequence}\n\nReason recorded: ${reason}`,
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
    supabase.from("accountability_protocols").select("id,trigger_type,trigger_date,status").eq("user_id", activeUserId).gte("trigger_date", shiftDay(dayKey(), -8)).order("created_at", { ascending: false }).limit(30),
    supabase.from("operations").select("id,title,brief,category,metric_key,scheduled_date,scheduled_end_date,operation_date,schedule_mode,is_daily,completed,completed_on,status,created_at").eq("user_id", activeUserId).or(`scheduled_date.gte.${shiftDay(dayKey(), -10)},schedule_mode.in.(daily,weekly,recurring)`).limit(250),
    supabase.from("operation_occurrences").select("id,operation_id,occurrence_date,completed,completed_on,status").eq("user_id", activeUserId).gte("occurrence_date", shiftDay(dayKey(), -10)).lt("occurrence_date", dayKey()),
    supabase.from("xp_campaigns").select("started_at").eq("user_id", activeUserId).maybeSingle(),
  ]);
  const [protocolResult, protocolHistoryResult, operationsResult, occurrencesResult, campaignResult] = window.AEGIS_DATA_GUARD
    ? await window.AEGIS_DATA_GUARD.run("accountability:gate", load, { ttl: 60000 })
    : await load();
  if (protocolResult.error || protocolHistoryResult.error) {
    // The migration may be deployed after this client bundle. Do not make a
    // missing table look like a user discipline failure.
    console.warn("Accountability protocol unavailable", protocolResult.error?.message || protocolHistoryResult.error?.message);
    unlock();
    return;
  }
  const history = protocolHistoryResult.data || [];
  if (protocolResult.data) {
    if (hasHandledOccurrence(history, protocolResult.data, protocolResult.data.id)) return unlock();
    return showProtocol(protocolResult.data);
  }
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
  if (hasHandledOccurrence(history, breach)) return unlock();
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
