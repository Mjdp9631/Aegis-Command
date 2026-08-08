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
let currentUser = null;
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
const statusOrder = ["Queued", "Scheduled", "Ongoing", "Complete"];
const priorityFor = (category) => category === "Recovery" || category === "Trading" ? "High" : category === "Body" ? "High" : "Medium";
const dateOnly = (value) => value ? String(value).slice(0, 10) : "";

const starterOperations = () => {
  return [
    ["Pre-market analysis", "Trading"],
    ["Review charts and document one lesson", "Trading"],
    ["Read one chapter", "Mind"],
  ].map(([title, category]) => ({ title, category, completed: false, scheduled_date: null, scheduled_time: null, operation_date: todayKey(), is_daily: true, status: "Queued" }));
};

const gymSplitForToday = () => {
  const split = ["Rest", "Legs", "Push", "Pull", "Rest", "Upper Body", "Lower Body"];
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date());
  return split[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)];
};
const gymOperationForToday = () => {
  const split = gymSplitForToday();
  const isRest = split === "Rest";
  return {
    title: isRest ? "Recovery — rest and reset" : `Gym — ${split}`,
    category: isRest ? "Recovery" : "Body",
    priority: isRest ? "Medium" : "High",
    status: "Queued",
    completed: false,
    is_daily: true,
    operation_date: todayKey(),
    brief: isRest
      ? "Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan."
      : `Complete the ${split} session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.`,
  };
};

let operations = [];
let missions = [];
let cursor = new Date();
let selectedDay = todayKey();

function normalizedStatus(operation) {
  if (operation.completed) return "Complete";
  return statusOrder.includes(operation.status) ? operation.status : "Queued";
}

function isCompleteToday(operation) {
  if (normalizedStatus(operation) !== "Complete") return false;
  const completedOn = dateOnly(operation.completed_on || operation.local_completed_on);
  // Older saved operations may not have the new completion stamp yet. Keep a
  // just-completed item visible for the current browser session in that case.
  return completedOn ? completedOn === todayKey() : Boolean(operation.local_completed_today);
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
    "Read one complete chapter with notifications away.",
    "Capture one useful idea, quote, or action in Self Mastery.",
    "Only mark complete after the chapter and note are both finished.",
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

function resolveMission(operation) {
  if (operation.mission_id) return missions.find((mission) => mission.id === operation.mission_id) || null;
  const title = String(operation.title || "").toLowerCase();
  // These are intentionally exact enough to keep daily evidence attached to
  // the right Phase 0 mission instead of whichever mission happens to share a
  // category.
  const byPhrase = (phrases) => missions.find((mission) => !mission.completed && phrases.some((phrase) => `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().includes(phrase)));
  if (/pt session|orthopedic|acl rehab/.test(title)) return byPhrase(["orthopedic recovery", "pt sessions", "return to sports"]);
  if (/gym|legs|push|pull|upper body|lower body|rest and reset/.test(title)) return byPhrase(["training baseline", "recovery-safe"]);
  if (/review charts|trade review/.test(title)) return byPhrase(["evidence-based trade reviews", "process review"]);
  if (/mission debrief|evening debrief/.test(title)) return byPhrase(["operating debrief rhythm", "operating baseline"]);
  if (/read one chapter|read chapter/.test(title)) return byPhrase(["learning rhythm", "chapters"]);
  if (/pre-market/.test(title)) return byPhrase(["trading preparation rhythm", "execution playbook", "pre-market"]);
  const category = String(operation.category || "").toLowerCase();
  const candidates = missions.filter((mission) => !mission.completed && String(mission.category || "").toLowerCase() === category);
  if (!candidates.length) return null;
  const measured = candidates.filter((mission) => String(mission.completion_type || "").toLowerCase() === "units" && Number(mission.target_count) > 0);
  const unitMatch = measured.find((mission) => {
    const unit = String(mission.unit_label || "").toLowerCase();
    return (/acl|rehab|pt|orthopedic/.test(title) && /session|rehab|pt/.test(unit)) || (/read|chapter/.test(title) && /chapter|page/.test(unit));
  });
  const titleMatch = measured.find((mission) => {
    const text = `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase();
    return (/playbook|condition|location|cbr|shift|entry|review/.test(title) && /playbook|trading/.test(text)) ||
      (/daily scorecard|chapter|debrief/.test(title) && /scorecard|baseline|daily/.test(text));
  });
  return unitMatch || titleMatch || measured[0] || candidates[0];
}

// Every operation has a single, durable mission link before it is saved.  The
// database trigger can then advance the correct measured mission without the
// command center, calendar, and mission page trying to maintain separate
// counters in the browser.
function attachMissionLink(operation) {
  if (operation.mission_id) return;
  const mission = resolveMission(operation);
  if (!mission) return;
  operation.mission_id = mission.id;
  operation.metric_key = operation.metric_key || mission.metric_key || null;
}

function priorityClass(priority) {
  const value = String(priority || "").toLowerCase();
  return value === "high" ? "priority-high" : value === "low" ? "priority-low" : "priority-medium";
}

// The database is the source of record, but a just-changed status must never
// be replaced by an older cloud response during an auth refresh.
function mergeSavedStatus(remote = []) {
  // Supabase is the source of truth.  The old version copied every cached
  // property over the fresh row, which was exactly why a status could appear
  // to save until the next page refresh and why old scheduled dates resurfaced.
  // Cache is now only an offline fallback when Supabase cannot be reached.
  return Array.isArray(remote) ? remote : [];
}

  function ensureLiveQueueHost() {
    // Reuse the queue surface already present in the command layout.  The
    // earlier sibling-host experiment left the live rows outside the panel's
    // sizing rules, which is why a populated queue could look completely
    // blank.  A mutation repair below now protects this same, visible node
    // from legacy paints instead.
    const panel = document.querySelector("#command .operations-panel");
    if (!panel) return null;

    let host = panel.querySelector("#operations-list") || panel.querySelector("[data-aegis-operations-live]");
    if (!host) {
      host = document.createElement("div");
      host.id = "operations-list";
      host.className = "operations-list";
      panel.append(host);
    }
    host.hidden = false;
    host.removeAttribute("aria-hidden");
    host.classList.add("aegis-operations-live");
    host.dataset.aegisOperationsLive = "true";
    return host;
  }

  function queueTargets() {
    const liveHost = ensureLiveQueueHost();
    if (liveHost?.isConnected) return [liveHost];

    const selectors = ["#operations-list", "#command-operations-list", "#operations-queue-list"];
    return [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter((target) => target.isConnected);
  }

function isDailyOperation(operation) {
  return Boolean(operation.is_daily) || /pre-market|review charts|read one chapter|mission debrief|daily|^gym|rest and reset/i.test(String(operation.title || ""));
}

function queueOperations() {
  const start = todayKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const end = dayKey(horizon);
  const today = operations.filter((operation) => {
    if (normalizedStatus(operation) === "Complete" && !isCompleteToday(operation)) return false;
    const scheduled = dateOnly(operation.scheduled_date);
    const operationDay = dateOnly(operation.operation_date);
    if (isDailyOperation(operation) && operationDay && operationDay !== start) return false;
    if (isDailyOperation(operation)) return true;
    if (scheduled === start) return true;
    return !scheduled;
  });
  const upcoming = operations.filter((operation) => {
    if (normalizedStatus(operation) === "Complete") return false;
    const scheduled = dateOnly(operation.scheduled_date);
    return scheduled > start && scheduled <= end;
  });
  const sort = (items) => items.sort((a, b) => {
    const aDate = dateOnly(a.scheduled_date) || "9999-12-31";
    const bDate = dateOnly(b.scheduled_date) || "9999-12-31";
    return aDate.localeCompare(bDate) || String(a.title).localeCompare(String(b.title));
  });
  const unique = new Map();
  const uniqueItems = (items) => items.filter((operation) => {
    const key = `${String(operation.title || "").trim().toLowerCase()}|${dateOnly(operation.operation_date) || dateOnly(operation.scheduled_date) || "standing"}`;
    if (!unique.has(key)) unique.set(key, operation);
    else return false;
    return true;
  });
  const todayItems = uniqueItems(sort(today));
  const upcomingItems = uniqueItems(sort(upcoming));
  // Never show an empty command queue solely because a legacy record has a
  // malformed or stale date. Keep a compact operational fallback visible.
  if (!todayItems.length && operations.length) {
    const fallback = operations
      .filter((operation) => normalizedStatus(operation) !== "Complete" || isCompleteToday(operation))
      .slice(0, 8);
    return { today: uniqueItems(fallback), upcoming: upcomingItems };
  }
  return { today: todayItems, upcoming: upcomingItems };
}

function renderQueue() {
  const targets = queueTargets();
  if (!targets.length) return;
  if (!operations.length) operations = cachedOperations();
  if (!operations.length) operations = starterOperations();
  const active = queueOperations();
  const rows = (items, kind = "today") => items.map((operation) => {
      const status = normalizedStatus(operation);
      const priority = operation.priority || priorityFor(operation.category);
      const scheduled = dateOnly(operation.scheduled_date);
      const time = operation.scheduled_time ? ` · ${String(operation.scheduled_time).slice(0, 5)}` : "";
      const timing = scheduled ? `${new Date(`${scheduled}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${time}` : "+ Schedule";
      const doneClass = status === "Complete" ? " done operation-complete" : "";
      return `<article class="operation operation-table-row operation-table-v2${doneClass}">
        <button type="button" class="operation-status ${status.toLowerCase()}" data-hub-status="${esc(operation.id || operation.title)}"><i></i>${esc(status)}</button>
        <button type="button" class="hub-operation-title" data-hub-detail="${esc(operation.id || operation.title)}">${esc(operation.title)}</button>
        <button type="button" class="operation-schedule-control ${scheduled ? "is-scheduled" : ""}" data-hub-schedule="${esc(operation.id || operation.title)}">${esc(timing)}</button>
        <span>${esc(operation.category || "Mission")}</span>
        <b class="${priorityClass(priority)}">${esc(priority)}</b>
      </article>`;
    }).join("");
  if (!active.today.length && !active.upcoming.length) {
    targets.forEach((target) => { target.innerHTML = '<p class="empty-operations">No operations for today or the next seven days. Schedule the next deliberate move from Mission Control.</p>'; });
    return;
  }
  const markup = `
    <div class="operation-table-head operation-table-v2"><span>STATUS</span><span>OPERATION</span><span>SCHEDULE</span><span>CATEGORY</span><span>PRIORITY</span></div>
    ${rows(active.today)}
    ${active.upcoming.length ? `<p class="operations-upcoming-label">UPCOMING / NEXT 14 DAYS</p>${rows(active.upcoming, "upcoming")}` : ""}`;
  targets.forEach((target) => {
    target.innerHTML = markup;
    target.dataset.aegisQueueMounted = "true";
    target.querySelectorAll("[data-hub-status]").forEach((button) => button.addEventListener("click", () => cycleStatus(button.dataset.hubStatus)));
    target.querySelectorAll("[data-hub-schedule]").forEach((button) => button.addEventListener("click", () => openScheduleDialog(findOperation(button.dataset.hubSchedule))));
    target.querySelectorAll("[data-hub-detail]").forEach((button) => button.addEventListener("click", () => showOperationDetail(button.dataset.hubDetail)));
  });
}

function findOperation(key) {
  return operations.find((operation) => String(operation.id || operation.title) === String(key));
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
  const payload = {
    user_id: currentUser.id,
    title: operation.title,
    category: operation.category || "Mission",
    priority: operation.priority || priorityFor(operation.category),
    brief: operation.brief || operation.notes || null,
    status: operation.status,
    completed: operation.completed,
    completed_on: operation.completed_on || null,
    scheduled_date: operation.scheduled_date || null,
    scheduled_time: operation.scheduled_time || null,
    schedule_mode: operation.schedule_mode || "one_time",
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
  const { data, error } = await request;
  if (error) { console.warn("Could not save operation status", error.message); return false; }
  if (data) Object.assign(operation, data);
  return true;
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

async function cycleStatus(key) {
  const operation = findOperation(key);
  if (!operation) return;
  const index = statusOrder.indexOf(normalizedStatus(operation));
  const next = statusOrder[(index + 1) % statusOrder.length];
  const wasComplete = normalizedStatus(operation) === "Complete";
  operation.status = next;
  operation.completed = next === "Complete";
  if (next === "Complete") {
    operation.completed_on = todayKey();
  } else if (wasComplete) {
    operation.completed_on = null;
  }
  attachMissionLink(operation);
  // Preserve the director's update locally before the network round trip.
  // A refresh can no longer turn a just-clicked Ongoing/Complete operation
  // back into Queued simply because the database is temporarily unavailable.
  saveCachedOperations();
  renderQueue();
  renderCalendar();
  const saved = await persist(operation);
  if (!saved) {
    window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations, offline: true } }));
    return;
  }
  saveCachedOperations();
  // Mission progress is written by the shared database trigger.  Re-read it
  // after the operation save rather than maintaining a second local counter.
  if (currentUser) {
    await loadMissions();
    operations = await seedIfEmpty();
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
  if (data?.length) return ensureTodayOperations(mergeSavedStatus(data));
  const seed = starterOperations().map((operation) => ({ ...operation, user_id: currentUser.id }));
  const { data: inserted, error: insertError } = await client.from("operations").insert(seed).select();
  if (insertError) {
    console.warn("Could not seed operations", insertError.message);
    return seed;
  }
  return ensureTodayOperations(inserted || seed);
}

async function ensureTodayOperations(records = []) {
  const daily = [
    ["Pre-market analysis", "Trading", "Mark higher-timeframe condition, key liquidity/reaction levels, and the valid setup before active price reaches the area."],
    ["Review charts and document one lesson", "Trading", "Review one relevant chart or completed trade, capture one process lesson, and file it in Detective or Self Mastery."],
    ["Read one chapter", "Mind", "Read one chapter without notifications, then capture one useful idea, quote, or action in Self Mastery."],
  ].map(([title, category, brief]) => ({ title, category, brief, priority: priorityFor(category), status: "Queued", completed: false, is_daily: true, operation_date: todayKey(), metric_key: title === "Read one chapter" ? "chapters_read" : null }));
  daily.push(gymOperationForToday());

  const additions = daily.filter((planned) => !records.some((operation) => dateOnly(operation.operation_date) === todayKey() && String(operation.title || "").toLowerCase() === planned.title.toLowerCase()));
  const recovery = resolveMission({ title: "Orthopedic PT session", category: "Recovery" });
  const completedSessions = Number(recovery?.completed_count || 0);
  const targetSessions = Number(recovery?.target_count || 10);
  if (recovery && completedSessions < targetSessions) {
    const hasOpenPt = records.some((operation) => !operation.completed && /orthopedic pt session|prescribed acl rehab|pt session/.test(String(operation.title || "").toLowerCase()));
    if (!hasOpenPt) additions.push({ title: `Orthopedic PT session ${completedSessions + 1} of ${targetSessions}`, category: "Recovery", priority: "High", status: "Queued", completed: false, is_daily: false, mission_id: recovery.id, brief: "Complete only your clinician/PT-prescribed work. Log pain, swelling, range-of-motion changes, and the next session date after you finish." });
  }
  if (!additions.length) return records;
  if (!client || !currentUser) return [...records, ...additions.map((item, index) => ({ ...item, id: `local-${todayKey()}-${index}-${item.title}` }))];
  const prepared = additions.map((item) => {
    const mission = item.mission_id ? missions.find((candidate) => candidate.id === item.mission_id) : resolveMission(item);
    return { ...item, user_id: currentUser.id, mission_id: mission?.id || null, metric_key: item.metric_key || mission?.metric_key || null };
  });
  const { data, error } = await client.from("operations").insert(prepared).select();
  if (error) {
    console.warn("Could not create today's operations", error.message);
    return [...records, ...prepared.map((item, index) => ({ ...item, id: `local-${todayKey()}-${index}-${item.title}` }))];
  }
  return [...records, ...(data || prepared)];
}

async function loadMissions() {
  if (!client || !currentUser) return;
  const { data, error } = await client.from("missions").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: true });
  if (error) return console.warn("Could not load linked missions", error.message);
  missions = data || [];
}

function ensureScheduleDialog() {
  let dialog = $("#operation-schedule-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "operation-schedule-dialog";
  dialog.className = "dialog-card operation-schedule-card";
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><p class="eyebrow amber">OPERATIONS SCHEDULE</p><h2>Plan this operation.</h2><p class="schedule-copy">Scheduling is optional. A scheduled operation stays on the calendar until you complete it.</p><div class="schedule-input-grid"><label>Date<input id="operation-schedule-date" type="date" required></label><label>Time <span class="field-optional">optional</span><input id="operation-schedule-time" type="time"></label></div><label>Schedule type<select id="operation-schedule-mode"><option value="one_time">One-time</option><option value="weekly">Repeat weekly</option></select></label><div class="dialog-actions"><button value="clear" type="submit" class="text-button">Remove from calendar</button><button value="cancel" type="submit" class="text-button">Cancel</button><button value="schedule" type="submit" class="primary">Add to calendar</button></div></form>`;
  document.body.append(dialog);
  // Older markup used the label "weekly" while the database stores the
  // durable value "recurring". Normalize the UI option before it can write.
  dialog.querySelector('#operation-schedule-mode option[value="weekly"]')?.setAttribute('value', 'recurring');
  dialog.addEventListener("close", async () => {
    const operation = findOperation(dialog.dataset.operationKey);
    if (!operation || dialog.returnValue === "cancel") return;
    const date = dialog.returnValue === "clear" ? "" : $("#operation-schedule-date")?.value;
    const time = dialog.returnValue === "clear" ? "" : $("#operation-schedule-time")?.value;
    if (dialog.returnValue === "schedule" && !date) return;
    operation.scheduled_date = date || null;
    operation.scheduled_time = time || null;
    operation.schedule_mode = dialog.returnValue === "clear" ? "one_time" : ($("#operation-schedule-mode")?.value || "one_time");
    if (date && normalizedStatus(operation) === "Queued") operation.status = "Scheduled";
    const saved = await persist(operation);
    if (!saved) return;
    saveCachedOperations();
    if (date) selectedDay = date;
    renderQueue();
    renderCalendar();
  });
  return dialog;
}

function openScheduleDialog(operation) {
  if (!operation) return;
  const dialog = ensureScheduleDialog();
  dialog.dataset.operationKey = String(operation.id || operation.title);
  const input = $("#operation-schedule-date");
  if (input) input.value = dateOnly(operation.scheduled_date) || todayKey();
  const time = $("#operation-schedule-time");
  if (time) time.value = operation.scheduled_time || "";
  const mode = $("#operation-schedule-mode");
  if (mode) mode.value = operation.schedule_mode === "weekly" ? "recurring" : (operation.schedule_mode || "one_time");
  if (!dialog.open) dialog.showModal();
}

function monthTitle(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function renderCalendar() {
  const label = $("#operations-calendar-label");
  const grid = $("#operations-calendar-grid");
  const agendaLabel = $("#calendar-agenda-label");
  const agenda = $("#calendar-agenda-list");
  const needsScheduling = $("#calendar-needs-scheduling");
  if (!grid) return;
  if (label) label.textContent = monthTitle(cursor);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const first = start.getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let cell = 0; cell < 42; cell += 1) {
    const day = cell - first + 1;
    if (day < 1 || day > days) {
      cells.push('<button type="button" class="calendar-day blank" aria-hidden="true"></button>');
      continue;
    }
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    const key = dayKey(date);
    const scheduled = operations.filter((operation) => dateOnly(operation.scheduled_date) === key);
    const complete = scheduled.filter((operation) => normalizedStatus(operation) === "Complete").length;
    const classes = ["calendar-day", key === todayKey() ? "today" : "", key === selectedDay ? "selected" : ""].filter(Boolean).join(" ");
    cells.push(`<button type="button" class="${classes}" data-calendar-day="${key}"><b>${day}</b>${scheduled.length ? `<small>${complete}/${scheduled.length} OPS</small>` : '<small>—</small>'}</button>`);
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll("[data-calendar-day]").forEach((button) => button.addEventListener("click", () => {
    selectedDay = button.dataset.calendarDay;
    renderCalendar();
  }));
  const selected = operations.filter((operation) => dateOnly(operation.scheduled_date) === selectedDay);
  if (agendaLabel) agendaLabel.textContent = selectedDay ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Select a day";
  if (agenda) {
    agenda.innerHTML = selected.length ? `<div class="calendar-agenda-list">${selected.map((operation) => `<button type="button" class="calendar-agenda-item" data-calendar-status="${esc(operation.id || operation.title)}"><span class="operation-status ${normalizedStatus(operation).toLowerCase()}"><i></i>${esc(normalizedStatus(operation))}</span><strong>${esc(operation.title)}</strong><small>${esc(operation.category || "Mission")} · advance status</small></button>`).join("")}</div>` : '<p class="calendar-empty">No operations scheduled. Select another day or schedule an operation in Mission Control.</p>';
    agenda.querySelectorAll("[data-calendar-status]").forEach((button) => button.addEventListener("click", () => cycleStatus(button.dataset.calendarStatus)));
  }
  if (needsScheduling) {
    const measured = missions
      .filter((mission) => String(mission.completion_type || "").toLowerCase() === "units" && !mission.completed)
      .map((mission) => {
        const target = Math.max(0, Number(mission.target_count || 0));
        const scheduledCount = operations.filter((operation) => String(operation.mission_id || "") === String(mission.id) && Boolean(operation.scheduled_date)).length;
        return { mission, remaining: Math.max(0, target - scheduledCount) };
      })
      .filter(({ remaining }) => remaining > 0);
    needsScheduling.innerHTML = measured.length
      ? measured.map(({ mission, remaining }) => `<article class="calendar-needs-item"><div><strong>${esc(mission.title)}</strong><small>${remaining} remaining to schedule · ${esc(mission.unit_label || "units")}</small></div><button type="button" class="primary compact" data-schedule-mission="${esc(mission.id)}">Schedule next</button></article>`).join("")
      : '<p class="calendar-empty">Every measured mission has its remaining operations placed on the calendar.</p>';
    needsScheduling.querySelectorAll("[data-schedule-mission]").forEach((button) => button.addEventListener("click", () => {
      const mission = missions.find((item) => String(item.id) === String(button.dataset.scheduleMission));
      if (!mission) return;
      let operation = operations.find((item) => String(item.mission_id || "") === String(mission.id) && !item.scheduled_date && !item.completed);
      if (!operation) {
        const target = Math.max(1, Number(mission.target_count || 1));
        const done = Math.max(0, Number(mission.completed_count || 0));
        const scheduledCount = operations.filter((item) => String(item.mission_id || "") === String(mission.id) && Boolean(item.scheduled_date)).length;
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
  renderCalendar();
  const dialog = $("#operations-calendar-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function wireCalendarPanels() {
  document.querySelectorAll("[data-calendar-panel]").forEach((button) => button.addEventListener("click", () => {
    const name = button.dataset.calendarPanel;
    document.querySelectorAll("[data-calendar-panel]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-calendar-panel-body]").forEach((item) => item.classList.toggle("hidden", item.dataset.calendarPanelBody !== name));
  }));
}

async function boot() {
  try {
    if (client) {
      const { data } = await client.auth.getSession();
      currentUser = data?.session?.user || null;
    }
  // A queue must never disappear merely because an auth refresh is still in
  // flight. Cloud records replace this small local safety feed as soon as the
  // session is available.
  const local = cachedOperations();
  if (currentUser) await loadMissions();
  if (currentUser) operations = await seedIfEmpty();
  else operations = local;
  if (!operations.length) operations = local.length ? local : starterOperations();
    saveCachedOperations();
    renderQueue();
    renderCalendar();
  } catch (error) {
    console.warn("Operations hub recovered from a load error", error);
    operations = cachedOperations();
    if (!operations.length) operations = starterOperations();
    renderQueue();
    renderCalendar();
  }
}

window.AEGIS_OPEN_CALENDAR = openCalendar;
window.AEGIS_RENDER_OPERATIONS_QUEUE = () => {
  renderQueue();
  renderCalendar();
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("#open-operations-calendar");
  if (!button) return;
  event.preventDefault();
  openCalendar();
});
const startHub = () => {
  window.AEGIS_OPERATIONS_HUB_ACTIVE = true;
  // Paint a usable queue before any cloud request. A slow auth/database round
  // trip must never leave Command Center looking empty; boot() will replace
  // this safety feed with the authenticated records as soon as they arrive.
  if (!operations.length) {
    const local = cachedOperations();
    operations = local.length ? local : starterOperations();
    renderQueue();
  }
  // The staged paints protect against another module replacing the
  // command-center panel after this one has loaded.
  boot().finally(() => [0, 250, 1000, 2500].forEach((delay) => setTimeout(renderQueue, delay)));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startHub, { once: true });
else startHub();
window.addEventListener("aegis:auth-ready", boot);
window.addEventListener("aegis:missions-refresh", async (event) => {
  if (event.detail?.source === "operations-hub") return;
  await loadMissions();
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
  $("#calendar-prev")?.addEventListener("click", () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); renderCalendar(); });
  $("#calendar-next")?.addEventListener("click", () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); renderCalendar(); });
  wireCalendarPanels();
  if (!window.MutationObserver) return;
  let repairing = false;
  const repaintIfNeeded = () => {
    const targets = queueTargets();
    if (repairing || !operations.length || !targets.length || targets.every((target) => target.dataset.aegisQueueMounted === "true" && target.querySelector("[data-hub-status]"))) return;
    repairing = true;
    requestAnimationFrame(() => { renderQueue(); repairing = false; });
  };
  // Watch the document, not an initial queue node. The command dashboard
  // replaces queue markup after auth and after tab transitions.
  const observer = new MutationObserver(repaintIfNeeded);
  observer.observe(document.body, { childList: true, subtree: true });
  [100, 500, 1500, 3000].forEach((delay) => setTimeout(repaintIfNeeded, delay));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireCalendar, { once: true });
else wireCalendar();
