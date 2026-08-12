import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const priorities = '<option value="Do now">DO NOW - important + urgent</option><option value="Schedule">SCHEDULE - important + not urgent</option><option value="Delegate">DELEGATE - urgent + not important</option><option value="Eliminate">ELIMINATE - not urgent + not important</option>';
let client = null, session = null, missions = [], missionOperations = [];
let missionEditor = null;
let missionDetails = null;
let missionLoadTimer = null;

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function missionProgress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
function missionLabel(mission) { return isMeasured(mission) ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission.completed ? "Complete" : "Not complete"; }
function operationMatchesMission(operation, mission) {
  if (String(operation.mission_id || "") === String(mission.id)) return true;
  const operationText = `${operation.title || ""} ${operation.metric_key || ""}`.toLowerCase();
  const missionText = `${mission.title || ""} ${mission.completion_definition || ""} ${mission.metric_key || ""}`.toLowerCase();
  if (/chapter|read|book/.test(operationText) && /chapter|read|book|think and grow rich/.test(missionText)) return true;
  if (/pt|physical therapy|orthopedic|acl|rehab/.test(operationText) && /pt|physical therapy|orthopedic|acl|rehab|recovery/.test(missionText)) return true;
  if (/gym|workout|strength/.test(operationText) && /gym|workout|strength|training/.test(missionText)) return true;
  if (/journal|mastery\.entry/.test(operationText) && /journal|mastery\.entry|self mastery/.test(missionText)) return true;
  return false;
}
function operationsForMission(mission) { return missionOperations.filter((operation) => operationMatchesMission(operation, mission)); }
function operationStatus(operation) { return operation.completed || String(operation.status || "").toLowerCase() === "complete" ? "Complete" : operation.status || "Queued"; }
function operationDate(operation) { return operation.completed_on || operation.scheduled_date || operation.operation_date || ""; }
function missionCategory(value) { const category = String(value || "").trim().toLowerCase(); return category === "mind" || category === "body" || category === "mastery" ? "Self Mastery" : category === "life admin" || category === "day to day" ? "Life Admin" : value || "Self Mastery"; }
function normalize(mission) { return { ...mission, category: missionCategory(mission.category), progress: missionProgress(mission) }; }
function applyMissionRows(rows) {
  // During startup one module can briefly receive an empty response while the
  // authenticated operations module already has the durable rows. Never let
  // that transient response erase a valid mission ledger.
  if (!rows.length && missions.length) return;
  missions = rows.map(normalize);
  renderMissions(); renderCommandMissions(); publishMissionChange(); syncRecoveryVisibility();
}
function icon(category) { return category === "Recovery" ? "＋" : category === "Trading" ? "◈" : category === "Business" ? "▦" : "◇"; }
function iconClass(category) { return category === "Recovery" ? "recovery-icon" : category === "Trading" ? "trade-icon" : "business-icon"; }
const missionPriorityOrder = { "Do now": 0, Schedule: 1, Delegate: 2, Eliminate: 3 };
function sortMissions(items) {
  return [...items].sort((a, b) => (missionPriorityOrder[a.priority] ?? 9) - (missionPriorityOrder[b.priority] ?? 9) || b.progress - a.progress || String(a.title || "").localeCompare(String(b.title || "")));
}

function commandMissionCard(mission, operations = []) {
  const linked = operations.filter((operation) => String(operation.mission_id || "") === String(mission.id));
  const completedOperations = linked.filter((operation) => Boolean(operation.completed)).length;
  const measured = isMeasured(mission);
  const progressValue = mission.progress;
  const progressLabel = measured
    ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}`
    : linked.length ? `${completedOperations} / ${linked.length} linked operations complete` : missionLabel(mission);
  const evidence = mission.completion_definition || "Define the evidence that proves this mission is complete.";
  const scheduleAction = mission.progress < 100
    ? `<button type="button" class="command-mission-schedule" data-schedule-mission="${escape(mission.id)}">+ Schedule operation</button>`
    : "";
  return `<article class="command-mission-card mission-open" data-mission-id="${escape(mission.id)}" data-open-mission="${escape(mission.id)}" tabindex="0"><div class="command-mission-heading"><div class="mission-icon ${iconClass(mission.category)}">${icon(mission.category)}</div><div class="command-mission-copy"><strong>${escape(mission.title)}</strong><small>${escape(mission.category)} · ${escape(mission.priority)}</small></div><span class="command-mission-percent">${progressValue}%</span></div><div class="meter command-mission-meter"><i style="width:${progressValue}%"></i></div><p class="command-mission-progress">${escape(progressLabel)}</p><p class="command-mission-evidence"><b>Completion evidence:</b> ${escape(evidence)}</p><div class="command-mission-actions">${scheduleAction}<button type="button" class="command-mission-details">View details →</button></div></article>`;
}

function renderCommandMissionBoard(nextMissions = missions, operations = []) {
  const target = $("#command-missions") || document.querySelector("#command .mission-panel .mission-list");
  if (!target) return;
  const active = sortMissions(nextMissions.filter((mission) => mission.progress < 100));
  target.className = "mission-list command-mission-board";
  target.innerHTML = `<div class="command-mission-list" data-command-mission-list></div>`;
  const activeList = target.querySelector("[data-command-mission-list]");
  activeList.innerHTML = active.length ? active.map((mission) => commandMissionCard(mission, operations)).join("") : '<article class="command-mission-empty"><strong>No active missions.</strong><small>Open the next objective from Mission Control.</small></article>';
}

function renderMissions() {
  const target = $("#mission-cards");
  if (!target) return;
  const active = sortMissions(missions.filter((mission) => mission.progress < 100));
  const complete = sortMissions(missions.filter((mission) => mission.progress >= 100));
  target.innerHTML = `<div class="mission-view-tabs"><button type="button" class="mission-view-tab active" data-mission-view="active">ACTIVE · ${active.length}</button><button type="button" class="mission-view-tab" data-mission-view="complete">COMPLETED · ${complete.length}</button></div><div class="mission-card-list" data-mission-list></div>`;
  const list = target.querySelector("[data-mission-list]");
  const draw = (items) => { list.innerHTML = items.length ? items.map((mission) => {
    const linked = operationsForMission(mission);
    const attached = linked.length ? `${linked.length} attached operation${linked.length === 1 ? "" : "s"}: ${linked.slice(0, 2).map((operation) => escape(operation.title)).join(" · ")}${linked.length > 2 ? " · …" : ""}` : "No operation attached yet";
    return `<button class="mission-card mission-open" data-mission-ledger-card="true" data-mission-id="${escape(mission.id)}"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${escape(missionLabel(mission))}</p><div class="meter"><i style="width:${mission.progress}%"></i></div><small class="mission-definition">${mission.completion_definition ? escape(mission.completion_definition) : "Define what completion means"}</small><small class="mission-attachment-summary">${attached}</small></button>`;
  }).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>'; };
  draw(active);
  target.querySelectorAll("[data-mission-view]").forEach((button) => button.addEventListener("click", () => { target.querySelectorAll("[data-mission-view]").forEach((item) => item.classList.toggle("active", item === button)); draw(button.dataset.missionView === "complete" ? complete : active); }));
}

function renderCommandMissions() {
  renderCommandMissionBoard();
}

function buildMissionDetails() {
  const dialog = document.createElement("dialog");
  dialog.id = "mission-details-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card mission-details-card"><button class="dialog-close" type="submit" value="cancel" aria-label="Close">×</button><p class="eyebrow amber">MISSION OPERATIONS</p><h2 id="mission-details-title">Mission</h2><p id="mission-details-progress" class="body-copy"></p><div id="mission-details-definition" class="mission-details-definition"></div><div><p class="eyebrow">ATTACHED OPERATIONS</p><div id="mission-details-operations" class="mission-details-operations"></div></div><button class="primary" id="mission-details-edit" type="button">Edit mission</button></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector("#mission-details-edit").addEventListener("click", () => {
    const mission = missions.find((item) => String(item.id) === String(dialog.dataset.missionId));
    if (!mission || !missionEditor) return;
    dialog.close();
    openEditor(missionEditor, mission);
  });
  return dialog;
}

function openMissionDetails(mission) {
  if (!missionDetails || !mission) return;
  missionDetails.dataset.missionId = mission.id;
  missionDetails.querySelector("#mission-details-title").textContent = mission.title;
  missionDetails.querySelector("#mission-details-progress").textContent = `${mission.category} · ${missionLabel(mission)}`;
  missionDetails.querySelector("#mission-details-definition").textContent = mission.completion_definition || "Define the evidence that proves this mission is complete.";
  const linked = operationsForMission(mission);
  missionDetails.querySelector("#mission-details-operations").innerHTML = linked.length
    ? linked.map((operation) => `<article class="mission-operation-link"><strong>${escape(operation.title)}</strong><span>${escape(operationStatus(operation))}${operationDate(operation) ? ` · ${escape(operationDate(operation))}` : ""}${operation.category ? ` · ${escape(operation.category)}` : ""}</span></article>`).join("")
    : '<p class="mission-details-empty">No operation is attached yet. Schedule one from this mission or link it when creating an operation.</p>';
  missionDetails.showModal();
}

window.AEGIS_RENDER_COMMAND_MISSIONS = renderCommandMissionBoard;

function publishDataChange(source) { window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source } })); }
function publishMissionChange() { window.dispatchEvent(new Event("aegis:missions-changed")); publishDataChange("missions"); }

function syncRecoveryVisibility() {
  const recoveryNav = document.querySelector("[data-recovery-nav]");
  if (!recoveryNav) return;
  const recoveryMissions = missions.filter((mission) => mission.category === "Recovery");
  const recoveryIsActive = recoveryMissions.some((mission) => mission.progress < 100);
  if (recoveryIsActive || !recoveryMissions.length) { localStorage.removeItem("aegis-recovery-archived"); recoveryNav.hidden = false; return; }
  if (localStorage.getItem("aegis-recovery-archived") === "yes") { recoveryNav.hidden = true; return; }
  const approved = window.confirm("Recovery has reached its defined completion criteria. Archive the Recovery section from navigation? You can bring it back later if needed.");
  recoveryNav.hidden = approved;
  if (approved) localStorage.setItem("aegis-recovery-archived", "yes");
  if (approved && location.hash === "#recovery") location.hash = "#missions";
}

function renderRecovery(log) {
  const state = $("#recovery-state"), summary = $("#recovery-summary");
  if (!state || !summary) return;
  if (!log) { state.textContent = "-"; summary.innerHTML = '<div><span>No recovery reports logged yet.</span><b>Awaiting data</b></div>'; return; }
  state.textContent = log.rehab_completed ? "DONE" : "LOGGED";
  summary.innerHTML = `<div><span>Pain level</span><b>${log.pain}/10</b></div><div><span>Swelling</span><b>${log.swelling}/10</b></div><div><span>Prescribed rehab</span><b>${log.rehab_completed ? "Complete" : "Pending"}</b></div>`;
}

function fieldMarkup(prefix, includeCategory) {
  return `<label>Mission <input id="${prefix}-title" required /></label>${includeCategory ? `<label>Department <select id="${prefix}-category"><option>Recovery</option><option>Trading</option><option>Business</option><option>Self Mastery</option><option>Life Admin</option></select></label>` : ""}<label>Matrix priority <select id="${prefix}-priority">${priorities}</select></label><label>Completion method <select id="${prefix}-method"><option value="binary">One-time completion</option><option value="units">Measured progress</option></select></label><label>What does complete mean? <textarea id="${prefix}-definition" placeholder="Describe the evidence for completion"></textarea></label><div class="unit-fields" data-unit-fields="${prefix}"><div class="two-col"><label>Tracked metric <select id="${prefix}-metric"><option value="chapters_read">Chapter read</option><option value="pt_session">PT session</option><option value="body.gym">Gym workout</option><option value="trading.trade">Trade logged</option><option value="mastery.entry">Self Mastery entry</option><option value="operation.complete">Completed operation</option></select></label><label>Total required <input id="${prefix}-target" type="number" min="1" step="1" value="1" /></label></div><div class="two-col"><label>Cadence <select id="${prefix}-cadence"><option value="">No cadence</option><option value="daily">Daily</option><option value="weekly">Times per week</option></select></label><label>Cadence target <input id="${prefix}-cadence-target" type="number" min="1" step="1" value="1" /></label></div><label>Unit label <input id="${prefix}-unit-label" placeholder="e.g. chapters or sessions" /></label></div><label class="binary-fields" data-binary-fields="${prefix}"><input id="${prefix}-completed" type="checkbox" /> Mission complete</label>`;
}

function updateTrackingFields(root, prefix) {
  const measured = $(`#${prefix}-method`).value === "units";
  root.querySelector(`[data-unit-fields="${prefix}"]`).hidden = !measured;
  root.querySelector(`[data-binary-fields="${prefix}"]`).hidden = measured;
}

function readMission(root, prefix, includeCategory, existing = null) {
  const method = $(`#${prefix}-method`).value;
  const target = Math.max(1, Number($(`#${prefix}-target`).value || 1));
  const completedCount = Math.max(0, Math.min(target, Number(existing?.completed_count || 0)));
  const completed = $(`#${prefix}-completed`).checked;
  const progress = method === "units" ? Math.round((completedCount / target) * 100) : completed ? 100 : 0;
  return { title: $(`#${prefix}-title`).value.trim(), priority: $(`#${prefix}-priority`).value, ...(includeCategory ? { category: $(`#${prefix}-category`).value } : {}), completion_type: method, completion_definition: $(`#${prefix}-definition`).value.trim() || null, unit_label: method === "units" ? $(`#${prefix}-unit-label`).value.trim() || "units" : null, target_count: method === "units" ? target : null, completed_count: method === "units" ? completedCount : 0, metric_key: method === "units" ? $(`#${prefix}-metric`).value : null, cadence_type: method === "units" ? ($(`#${prefix}-cadence`).value || null) : null, cadence_target: method === "units" && $(`#${prefix}-cadence`).value ? Math.max(1, Number($(`#${prefix}-cadence-target`).value || 1)) : null, completed: method === "binary" ? completed : completedCount >= target, progress };
}

function configureCreateDialog() {
  const dialog = $("#mission-dialog");
  dialog.innerHTML = `<form id="mission-create-form" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW MISSION</p><h2>Define the finish line.</h2>${fieldMarkup("new-mission", true)}<button class="primary" type="submit">Open mission</button></form>`;
  const form = $("#mission-create-form");
  form.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  $(`#new-mission-method`).addEventListener("change", () => updateTrackingFields(form, "new-mission"));
  updateTrackingFields(form, "new-mission");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !client) return alert("Sign in before saving a mission.");
    const payload = readMission(form, "new-mission", true);
    if (!payload.title) return;
    const { data, error } = await client.from("missions").insert(payload).select().single();
    if (error) return alert(`Mission could not be created: ${error.message}`);
    missions.unshift(normalize(data)); dialog.close(); renderMissions(); renderCommandMissions(); publishMissionChange();
  });
}

function outcomeMarkup(prefix) {
  return `<div class="two-col"><label>Outcome <select id="${prefix}-outcome-status"><option value="accepted">Accepted</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="ineffective">Ineffective</option></select></label><label>Outcome rating <input id="${prefix}-outcome-rating" type="number" min="1" max="5" step="1" placeholder="1–5" /></label></div><label>Outcome note <textarea id="${prefix}-outcome-note" placeholder="What happened? Was this mission useful, too easy, or ineffective?"></textarea></label>`;
}

function readOutcomeFields(root, prefix, mission) {
  const completed = Boolean(root.querySelector(`#${prefix}-completed`)?.checked);
  return { outcome_status: root.querySelector(`#${prefix}-outcome-status`)?.value || (completed ? "completed" : mission?.outcome_status || "accepted"), outcome_rating: Number(root.querySelector(`#${prefix}-outcome-rating`)?.value || 0) || null, outcome_note: root.querySelector(`#${prefix}-outcome-note`)?.value.trim() || null };
}

function buildMissionEditor() {
  const dialog = document.createElement("dialog");
  dialog.id = "mission-editor-dialog";
  dialog.innerHTML = `<form id="mission-edit-form" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Define the evidence.</h2>${fieldMarkup("edit-mission", false)}<button class="primary" type="submit">Save mission</button></form>`;
  dialog.querySelector("#edit-mission-form button[type=submit]").insertAdjacentHTML("beforebegin", outcomeMarkup("edit-mission"));
  document.body.appendChild(dialog);
  const form = $("#mission-edit-form");
  form.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  $(`#edit-mission-method`).addEventListener("change", () => updateTrackingFields(form, "edit-mission"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = missions.find((item) => item.id === dialog.dataset.missionId);
    const payload = { ...readMission(form, "edit-mission", false, mission), ...readOutcomeFields(form, "edit-mission", mission) };
    if (!mission || !payload.title) return;
    const { data, error } = await client.from("missions").update(payload).eq("id", mission.id).select().single();
    if (error) return alert(`Mission could not be updated: ${error.message}`);
    missions = missions.map((item) => item.id === data.id ? normalize(data) : item);
    dialog.close(); renderMissions(); renderCommandMissions(); publishMissionChange(); syncRecoveryVisibility();
  });
  return dialog;
}

function openEditor(dialog, mission) {
  dialog.dataset.missionId = mission.id;
  $(`#edit-mission-title`).value = mission.title;
  $(`#edit-mission-priority`).value = mission.priority;
  $(`#edit-mission-method`).value = isMeasured(mission) ? "units" : "binary";
  $(`#edit-mission-definition`).value = mission.completion_definition || "";
  $(`#edit-mission-unit-label`).value = mission.unit_label || "";
  $(`#edit-mission-target`).value = mission.target_count || 1;
  $(`#edit-mission-metric`).value = mission.metric_key || "operation.complete";
  $(`#edit-mission-cadence`).value = mission.cadence_type || "";
  $(`#edit-mission-cadence-target`).value = mission.cadence_target || 1;
  $(`#edit-mission-completed`).checked = Boolean(mission.completed);
  $(`#edit-mission-outcome-status`).value = mission.outcome_status || (mission.completed ? "completed" : "accepted");
  $(`#edit-mission-outcome-rating`).value = mission.outcome_rating || "";
  $(`#edit-mission-outcome-note`).value = mission.outcome_note || "";
  updateTrackingFields($("#mission-edit-form"), "edit-mission");
  dialog.showModal();
}

async function loadData() {
  if (!session || !client) return;
  let { data, error } = await client.from("missions").select("*").order("created_at", { ascending: false });
  // A legacy missions table may not expose the ordering column even though
  // the rows themselves are readable. Keep the data path resilient to that
  // older schema while preserving the normal newest-first ordering.
  if (error) ({ data, error } = await client.from("missions").select("*"));
  if (error) {
    console.error("Could not load missions", error);
    const target = $("#mission-cards");
    if (target) target.querySelector("[data-mission-list]")?.replaceChildren(Object.assign(document.createElement("article"), { className: "mission-card", innerHTML: `<h3>Mission sync unavailable.</h3><small>${escape(error.message || "Supabase could not return mission records.")}</small>` }));
    return;
  }
  const { data: operationRows, error: operationError } = await client.from("operations")
    .select("id,title,mission_id,status,completed,scheduled_date,operation_date,completed_on,category,schedule_mode,scheduled_time")
    .eq("user_id", session.user.id);
  if (!operationError && Array.isArray(operationRows)) missionOperations = operationRows;
  applyMissionRows(data || []);
  const { data: logs } = await client.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1);
  renderRecovery(logs?.[0]);
}

async function refreshMissionSession() {
  if (!client) return;
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session) return;
  session = data.session;
  await loadData();
}

function bindDialogs() {
  configureCreateDialog();
  const editor = buildMissionEditor();
  missionEditor = editor;
  const openMission = (id) => {
    if (!session) return alert("Sign in before opening a mission.");
    const mission = missions.find((item) => String(item.id) === String(id));
    if (mission) openEditor(editor, mission);
  };
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-schedule-mission]")) return;
    const card = event.target.closest(".mission-open");
    if (!card) return;
    const mission = missions.find((item) => String(item.id) === String(card.dataset.missionId));
    if (card.dataset.missionLedgerCard === "true") openMissionDetails(mission);
    else openMission(card.dataset.missionId);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="add-mission"]');
    if (!button) return;
    event.preventDefault();
    const dialog = $("#mission-dialog");
    if (dialog && !dialog.open) dialog.showModal();
  });
  document.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-action="log-recovery"]');
    if (!button) return;
    event.preventDefault();
    // This is delegated so it still works when the Recovery tab is routed or
    // rebuilt after the module initially loads. Read the current auth state at
    // click time instead of relying on a stale module-local snapshot.
    if (!session && client) {
      const result = await client.auth.getSession();
      session = result.data?.session || null;
    }
    if (!session) return alert("Sign in before logging recovery.");
    const dialog = $("#recovery-dialog");
    if (!dialog) return;
    $("#recovery-logged-on").value = easternDateKey();
    if (!dialog.open) dialog.showModal();
  });
  $("#recovery-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !client) return alert("Sign in before saving recovery.");
    const pain = Number($("#recovery-pain").value);
    const swelling = Number($("#recovery-swelling").value);
    const logged_on = $("#recovery-logged-on").value || easternDateKey();
    if (!Number.isInteger(pain) || !Number.isInteger(swelling) || pain < 0 || pain > 10 || swelling < 0 || swelling > 10 || !logged_on) return;
    const { data, error } = await client.from("recovery_logs").insert({ logged_on, pain, swelling, rehab_completed: $("#recovery-rehab").checked, notes: $("#recovery-notes").value.trim() }).select().single();
    if (error) return alert(`Recovery could not be saved: ${error.message}`);
    renderRecovery(data);
    $("#recovery-notes").value = "";
    $("#recovery-dialog").close();
    publishDataChange("recovery");
  });
}

window.addEventListener("aegis:open-mission", (event) => {
  const id = event.detail?.id;
  if (!id || !missionEditor) return;
  if (!session) return alert("Sign in before opening a mission.");
  const mission = missions.find((item) => String(item.id) === String(id));
  if (mission) openEditor(missionEditor, mission);
});

window.addEventListener("aegis:missions-changed", (event) => {
  if (event.detail?.remote) setTimeout(loadData, 120);
});

window.addEventListener("aegis:missions-loaded", (event) => {
  const rows = event.detail?.missions;
  if (!Array.isArray(rows)) return;
  applyMissionRows(rows);
});

window.addEventListener("aegis:operations-changed", (event) => {
  const rows = event.detail?.operations;
  if (!Array.isArray(rows)) return;
  missionOperations = rows.filter((operation) => !operation?._occurrence);
  renderMissions();
});

window.addEventListener("aegis:phase-mission-template", (event) => {
  const detail = event.detail || {};
  const dialog = $("#mission-dialog");
  if (!dialog || !$("#new-mission-title")) return;
  $("#new-mission-title").value = detail.title || "";
  $("#new-mission-category").value = missionCategory(detail.category);
  $("#new-mission-priority").value = detail.priority || "Schedule";
  $("#new-mission-definition").value = detail.definition || "";
  $("#new-mission-method").value = "binary";
  updateTrackingFields($("#mission-create-form"), "new-mission");
  dialog.showModal();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-mission]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (typeof window.AEGIS_SCHEDULE_MISSION === "function") window.AEGIS_SCHEDULE_MISSION(button.dataset.scheduleMission);
});

// Paint the mission ledger before optional dialog wiring. A missing optional
// control must never leave Active / Completed invisible.
renderMissions(); renderCommandMissions(); renderRecovery();
bindDialogs();
missionDetails = buildMissionDetails();

if (cloudReady) {
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  await refreshMissionSession();
  client.auth.onAuthStateChange((_event, nextSession) => {
    if (_event === "SIGNED_OUT") {
      session = null;
      missions = [];
      renderMissions();
      renderCommandMissions();
      return;
    }
    // The auth callback already gives us the authoritative session. Do not
    // immediately call getSession() again: during token refresh Supabase can
    // briefly return an empty snapshot, leaving the mission ledger on its
    // boot-time 0/0 shell even though the user is signed in.
    session = nextSession || session;
    if (!session) return;
    // Never await Supabase work inside its auth callback. Supabase can hold
    // the auth lock while dispatching this event, which can freeze refreshes.
    clearTimeout(missionLoadTimer);
    missionLoadTimer = setTimeout(() => { void loadData(); }, 0);
  });
}

// Operations can supply measured evidence (for example one completed PT
// session or one finished chapter). Reload the mission views immediately.
window.addEventListener("aegis:missions-refresh", async (event) => {
  if (event.detail?.source !== "operations-hub" || !session) return;
  await loadData();
});
