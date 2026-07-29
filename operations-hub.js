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
const dayKey = (date = new Date()) => {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
};
const todayKey = () => dayKey();
const cachedOperations = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("aegis-operations") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};
const saveCachedOperations = () => localStorage.setItem("aegis-operations", JSON.stringify(operations));
const esc = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const statusOrder = ["Queued", "Ongoing", "Complete"];
const priorityFor = (category) => category === "Recovery" || category === "Trading" ? "High" : "Medium";
const dateOnly = (value) => value ? String(value).slice(0, 10) : "";

const starterOperations = () => {
  return [
    ["Complete prescribed ACL rehab", "Recovery"],
    ["Pre-market analysis", "Trading"],
    ["Review charts and document one lesson", "Trading"],
    ["Read one chapter", "Mind"],
    ["Evening mission debrief", "Mind"],
  ].map(([title, category]) => ({ title, category, completed: false, scheduled_date: null, status: "Queued" }));
};

let operations = [];
let missions = [];
let cursor = new Date();
let selectedDay = todayKey();
let currentUser = null;

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
  return [
    "Read the mission this operation advances and define the evidence of completion.",
    "Do the work deliberately and update the status honestly.",
    "Log the result or lesson where the mission can use it.",
  ];
}

function resolveMission(operation) {
  if (operation.mission_id) return missions.find((mission) => mission.id === operation.mission_id) || null;
  const category = String(operation.category || "").toLowerCase();
  const title = String(operation.title || "").toLowerCase();
  const candidates = missions.filter((mission) => !mission.completed && String(mission.category || "").toLowerCase() === category);
  if (!candidates.length) return null;
  const measured = candidates.filter((mission) => String(mission.completion_type || "").toLowerCase() === "units" && Number(mission.target_count) > 0);
  const unitMatch = measured.find((mission) => {
    const unit = String(mission.unit_label || "").toLowerCase();
    return (/acl|rehab|pt|orthopedic/.test(title) && /session|rehab|pt/.test(unit)) || (/read|chapter/.test(title) && /chapter|page/.test(unit));
  });
  return unitMatch || measured[0] || candidates[0];
}

function priorityClass(priority) {
  const value = String(priority || "").toLowerCase();
  return value === "high" ? "priority-high" : value === "low" ? "priority-low" : "priority-medium";
}

// The database is the source of record, but a just-changed status must never
// be replaced by an older cloud response during an auth refresh.
function mergeSavedStatus(remote = []) {
  const saved = cachedOperations();
  if (!saved.length) return remote;
  return remote.map((operation) => {
    const local = saved.find((item) => String(item.id || item.title) === String(operation.id || operation.title));
    return local ? {
      ...operation,
      // Preserve every client-side evidence field while an update is in
      // flight. The cloud record remains the source of truth on the next
      // successful fetch, but a completed PT session must not look undone in
      // the meantime.
      ...Object.fromEntries(Object.entries(local).filter(([, value]) => value !== undefined)),
    } : operation;
  });
}

function queueTarget() {
  return $("#operations-list") || $("#command-operations-list");
}

function isDailyOperation(operation) {
  return /pre-market|review charts|read one chapter|mission debrief|daily/i.test(String(operation.title || ""));
}

function queueOperations() {
  const start = todayKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const end = dayKey(horizon);
  const relevant = operations.filter((operation) => {
    if (normalizedStatus(operation) === "Complete" && !isCompleteToday(operation)) return false;
    const scheduled = dateOnly(operation.scheduled_date);
    // Recurring routines are a single current-day item, not calendar events.
    if (isDailyOperation(operation)) return true;
    if (scheduled === start) return true;
    if (scheduled > start && scheduled <= end) return true;
    // Important standing operations remain visible without becoming calendar clutter.
    return !scheduled;
  }).sort((a, b) => {
    const aDate = dateOnly(a.scheduled_date) || "9999-12-31";
    const bDate = dateOnly(b.scheduled_date) || "9999-12-31";
    return aDate.localeCompare(bDate) || String(a.title).localeCompare(String(b.title));
  });
  const unique = new Map();
  relevant.forEach((operation) => {
    const key = String(operation.title || "").trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, operation);
  });
  return [...unique.values()];
}

function renderQueue() {
  const target = queueTarget();
  if (!target) return;
  if (!operations.length) operations = cachedOperations();
  if (!operations.length) operations = starterOperations();
  const active = queueOperations();
  if (!active.length) {
    target.innerHTML = '<p class="empty-operations">No operations for today or the next seven days. Schedule the next deliberate move from Mission Control.</p>';
    return;
  }
  target.innerHTML = `
    <div class="operation-table-head operation-table-v2"><span>STATUS</span><span>OPERATION</span><span>WHEN</span><span>CATEGORY</span><span>PRIORITY</span></div>
    ${active.map((operation) => {
      const status = normalizedStatus(operation);
      const priority = operation.priority || priorityFor(operation.category);
      const scheduled = dateOnly(operation.scheduled_date);
      const timing = scheduled ? new Date(`${scheduled}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Schedule";
      const doneClass = status === "Complete" ? " done operation-complete" : "";
      return `<article class="operation operation-table-row operation-table-v2${doneClass}">
        <button type="button" class="operation-status ${status.toLowerCase()}" data-hub-status="${esc(operation.id || operation.title)}"><i></i>${esc(status)}</button>
        <button type="button" class="hub-operation-title" data-hub-detail="${esc(operation.id || operation.title)}">${esc(operation.title)}</button>
        <button type="button" class="operation-schedule-control ${scheduled ? "is-scheduled" : ""}" data-hub-schedule="${esc(operation.id || operation.title)}">${esc(timing)}</button>
        <span>${esc(operation.category || "Mission")}</span>
        <b class="${priorityClass(priority)}">${esc(priority)}</b>
      </article>`;
    }).join("")}`;
  target.querySelectorAll("[data-hub-status]").forEach((button) => button.addEventListener("click", () => cycleStatus(button.dataset.hubStatus)));
  target.querySelectorAll("[data-hub-schedule]").forEach((button) => button.addEventListener("click", () => openScheduleDialog(findOperation(button.dataset.hubSchedule))));
  target.querySelectorAll("[data-hub-detail]").forEach((button) => button.addEventListener("click", () => showOperationDetail(button.dataset.hubDetail)));
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
  if (!client || !currentUser || !operation.id) return;
  const payload = { status: operation.status, completed: operation.completed, scheduled_date: operation.scheduled_date || null };
  const { error } = await client.from("operations").update(payload).eq("id", operation.id).eq("user_id", currentUser.id);
  if (error) console.warn("Could not save operation status", error.message);
  const evidence = {
    completed_on: operation.completed_on || null,
    mission_id: operation.mission_id || null,
    mission_incremented: Boolean(operation.mission_incremented),
  };
  const { error: evidenceError } = await client.from("operations").update(evidence).eq("id", operation.id).eq("user_id", currentUser.id);
  if (evidenceError) console.warn("Operation evidence columns are not ready yet", evidenceError.message);
}

async function updateMissionEvidence(operation, direction) {
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
  if (next === "Complete" && !operation.mission_incremented) {
    operation.completed_on = todayKey();
    operation.local_completed_on = todayKey();
    operation.local_completed_today = true;
    await updateMissionEvidence(operation, 1);
    operation.mission_incremented = true;
  } else if (wasComplete && next === "Queued" && operation.mission_incremented) {
    await updateMissionEvidence(operation, -1);
    operation.mission_incremented = false;
    operation.completed_on = null;
    operation.local_completed_on = null;
    operation.local_completed_today = false;
  }
  await persist(operation);
  saveCachedOperations();
  renderQueue();
  renderCalendar();
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "operations-hub", operations } }));
  // app.js still receives the public change event for calendars and summaries.
  // It must not get the final paint over this queue.
  setTimeout(() => { renderQueue(); renderCalendar(); }, 0);
}

async function seedIfEmpty() {
  if (!client || !currentUser) return starterOperations();
  const { data, error } = await client.from("operations").select("*").eq("user_id", currentUser.id).order("scheduled_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    console.warn("Could not load operations", error.message);
    return starterOperations();
  }
  if (data?.length) return mergeSavedStatus(data);
  const seed = starterOperations().map((operation) => ({ ...operation, user_id: currentUser.id }));
  const { data: inserted, error: insertError } = await client.from("operations").insert(seed).select();
  if (insertError) {
    console.warn("Could not seed operations", insertError.message);
    return seed;
  }
  return inserted || seed;
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
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Close">×</button><p class="eyebrow amber">OPERATIONS SCHEDULE</p><h2>Plan this operation.</h2><p class="schedule-copy">Scheduling is optional. It adds this one operation to the calendar without changing its execution status.</p><label>Date<input id="operation-schedule-date" type="date" required></label><div class="dialog-actions"><button value="clear" type="submit" class="text-button">Remove from calendar</button><button value="cancel" type="submit" class="text-button">Cancel</button><button value="schedule" type="submit" class="primary">Add to calendar</button></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", async () => {
    const operation = findOperation(dialog.dataset.operationKey);
    if (!operation || dialog.returnValue === "cancel") return;
    const date = dialog.returnValue === "clear" ? "" : $("#operation-schedule-date")?.value;
    if (dialog.returnValue === "schedule" && !date) return;
    operation.scheduled_date = date || null;
    await persist(operation);
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
}

function openCalendar() {
  renderCalendar();
  const dialog = $("#operations-calendar-dialog");
  if (dialog && !dialog.open) dialog.showModal();
}

async function boot() {
  if (client) {
    const { data } = await client.auth.getSession();
    currentUser = data?.session?.user || null;
  }
  // A queue must never disappear merely because an auth refresh is still in
  // flight. Cloud records replace this small local safety feed as soon as the
  // session is available.
  const local = cachedOperations();
  if (currentUser) operations = await seedIfEmpty();
  else operations = local;
  if (!operations.length) operations = local.length ? local : starterOperations();
  await loadMissions();
  saveCachedOperations();
  renderQueue();
  renderCalendar();
}

window.AEGIS_OPEN_CALENDAR = openCalendar;
document.addEventListener("click", (event) => {
  const button = event.target.closest("#open-operations-calendar");
  if (!button) return;
  event.preventDefault();
  openCalendar();
});
const startHub = () => {
  window.AEGIS_OPERATIONS_HUB_ACTIVE = true;
  boot();
  // Older dashboard modules also render this panel. Reassert the shared queue
  // after their initial pass rather than allowing a blank Mission Control panel.
  setTimeout(renderQueue, 350);
  setTimeout(renderQueue, 1200);
  setTimeout(renderQueue, 3000);
  setTimeout(renderQueue, 5000);
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
  const target = queueTarget();
  if (!target || !window.MutationObserver) return;
  let repairing = false;
  new MutationObserver(() => {
    if (repairing || !operations.length || target.querySelector("[data-hub-status]")) return;
    repairing = true;
    requestAnimationFrame(() => { renderQueue(); repairing = false; });
  }).observe(target, { childList: true, subtree: true });
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireCalendar, { once: true });
else wireCalendar();
