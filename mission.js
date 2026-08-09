import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const priorities = '<option value="Do now">DO NOW - important + urgent</option><option value="Schedule">SCHEDULE - important + not urgent</option><option value="Delegate">DELEGATE - urgent + not important</option><option value="Eliminate">ELIMINATE - not urgent + not important</option>';
let client = null, session = null, missions = [];

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function missionProgress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
function missionLabel(mission) { return isMeasured(mission) ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission.completed ? "Complete" : "Not complete"; }
function normalize(mission) { return { ...mission, progress: missionProgress(mission) }; }
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
  const complete = sortMissions(nextMissions.filter((mission) => mission.progress >= 100));
  target.className = "mission-list command-mission-board";
  target.innerHTML = `<div class="command-mission-tabs" role="tablist" aria-label="Mission status"><button type="button" class="command-mission-tab active" data-command-mission-view="active" role="tab" aria-selected="true">ACTIVE · ${active.length}</button><button type="button" class="command-mission-tab" data-command-mission-view="complete" role="tab" aria-selected="false">COMPLETED · ${complete.length}</button></div><div class="command-mission-list" data-command-mission-list></div>`;
  const list = target.querySelector("[data-command-mission-list]");
  const draw = (items) => {
    list.innerHTML = items.length ? items.map((mission) => commandMissionCard(mission, operations)).join("") : '<article class="command-mission-empty"><strong>No missions in this view.</strong><small>Open the next objective from Mission Control.</small></article>';
  };
  draw(active);
  target.querySelectorAll("[data-command-mission-view]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const completedView = button.dataset.commandMissionView === "complete";
    target.querySelectorAll("[data-command-mission-view]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    draw(completedView ? complete : active);
  }));
}

function renderMissions() {
  const target = $("#mission-cards");
  if (!target) return;
  const active = sortMissions(missions.filter((mission) => mission.progress < 100));
  const complete = sortMissions(missions.filter((mission) => mission.progress >= 100));
  target.innerHTML = `<div class="mission-view-tabs"><button type="button" class="mission-view-tab active" data-mission-view="active">ACTIVE · ${active.length}</button><button type="button" class="mission-view-tab" data-mission-view="complete">COMPLETED · ${complete.length}</button></div><div class="mission-card-list" data-mission-list></div>`;
  const list = target.querySelector("[data-mission-list]");
  const draw = (items) => { list.innerHTML = items.length ? items.map((mission) => `<button class="mission-card mission-open" data-mission-id="${mission.id}"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${escape(missionLabel(mission))}</p><div class="meter"><i style="width:${mission.progress}%"></i></div><small class="mission-definition">${mission.completion_definition ? escape(mission.completion_definition) : "Define what completion means"}</small></button>`).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>'; };
  draw(active);
  target.querySelectorAll("[data-mission-view]").forEach((button) => button.addEventListener("click", () => { target.querySelectorAll("[data-mission-view]").forEach((item) => item.classList.toggle("active", item === button)); draw(button.dataset.missionView === "complete" ? complete : active); }));
}

function renderCommandMissions() {
  renderCommandMissionBoard();
}

window.AEGIS_RENDER_COMMAND_MISSIONS = renderCommandMissionBoard;

function publishMissionChange() { window.dispatchEvent(new Event("aegis:missions-changed")); }

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
  return `<label>Mission <input id="${prefix}-title" required /></label>${includeCategory ? `<label>Department <select id="${prefix}-category"><option>Recovery</option><option>Trading</option><option>Business</option><option>Mind</option><option>Body</option></select></label>` : ""}<label>Matrix priority <select id="${prefix}-priority">${priorities}</select></label><label>Completion method <select id="${prefix}-method"><option value="binary">One-time completion</option><option value="units">Measured progress</option></select></label><label>What does complete mean? <textarea id="${prefix}-definition" placeholder="Describe the evidence for completion"></textarea></label><div class="unit-fields" data-unit-fields="${prefix}"><div class="two-col"><label>Tracked metric <select id="${prefix}-metric"><option value="chapters_read">Chapter read</option><option value="pt_session">PT session</option><option value="body.gym">Gym workout</option><option value="trading.trade">Trade logged</option><option value="mastery.entry">Self Mastery entry</option><option value="operation.complete">Completed operation</option></select></label><label>Total required <input id="${prefix}-target" type="number" min="1" step="1" value="1" /></label></div><div class="two-col"><label>Cadence <select id="${prefix}-cadence"><option value="">No cadence</option><option value="daily">Daily</option><option value="weekly">Times per week</option></select></label><label>Cadence target <input id="${prefix}-cadence-target" type="number" min="1" step="1" value="1" /></label></div><label>Unit label <input id="${prefix}-unit-label" placeholder="e.g. chapters or sessions" /></label></div><label class="binary-fields" data-binary-fields="${prefix}"><input id="${prefix}-completed" type="checkbox" /> Mission complete</label>`;
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
    const payload = readMission(form, "new-mission", true);
    if (!payload.title) return;
    const { data, error } = await client.from("missions").insert(payload).select().single();
    if (error) return alert(`Mission could not be created: ${error.message}`);
    missions.unshift(normalize(data)); dialog.close(); renderMissions(); renderCommandMissions(); publishMissionChange();
  });
}

function buildMissionEditor() {
  const dialog = document.createElement("dialog");
  dialog.id = "mission-editor-dialog";
  dialog.innerHTML = `<form id="mission-edit-form" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Define the evidence.</h2>${fieldMarkup("edit-mission", false)}<button class="primary" type="submit">Save mission</button></form>`;
  document.body.appendChild(dialog);
  const form = $("#mission-edit-form");
  form.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  $(`#edit-mission-method`).addEventListener("change", () => updateTrackingFields(form, "edit-mission"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = missions.find((item) => item.id === dialog.dataset.missionId);
    const payload = readMission(form, "edit-mission", false, mission);
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
  updateTrackingFields($("#mission-edit-form"), "edit-mission");
  dialog.showModal();
}

async function loadData() {
  const { data, error } = await client.from("missions").select("*").order("created_at", { ascending: false });
  if (error) return console.error(error);
  missions = (data || []).map(normalize);
  renderMissions(); renderCommandMissions(); publishMissionChange(); syncRecoveryVisibility();
  const { data: logs } = await client.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1);
  renderRecovery(logs?.[0]);
}

function bindDialogs() {
  configureCreateDialog();
  const editor = buildMissionEditor();
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".mission-open");
    if (!card || !session) return;
    const mission = missions.find((item) => item.id === card.dataset.missionId);
    if (mission) openEditor(editor, mission);
  });
  document.querySelectorAll('[data-action="add-mission"]').forEach((button) => button.addEventListener("click", () => { if (!session) return alert("Sign in before opening a mission."); $("#mission-dialog").showModal(); }));
  document.querySelectorAll('[data-action="log-recovery"]').forEach((button) => button.addEventListener("click", () => { if (!session) return alert("Sign in before logging recovery."); $("#recovery-dialog").showModal(); }));
  $("#save-recovery").addEventListener("click", async (event) => { const pain = Number($("#recovery-pain").value), swelling = Number($("#recovery-swelling").value); if (!Number.isInteger(pain) || !Number.isInteger(swelling) || pain < 0 || pain > 10 || swelling < 0 || swelling > 10) return event.preventDefault(); const { data, error } = await client.from("recovery_logs").insert({ pain, swelling, rehab_completed: $("#recovery-rehab").checked, notes: $("#recovery-notes").value.trim() }).select().single(); if (error) { event.preventDefault(); return console.error(error); } renderRecovery(data); $("#recovery-notes").value = ""; });
}

window.addEventListener("aegis:phase-mission-template", (event) => {
  const detail = event.detail || {};
  const dialog = $("#mission-dialog");
  if (!dialog || !$("#new-mission-title")) return;
  $("#new-mission-title").value = detail.title || "";
  $("#new-mission-category").value = detail.category || "Mind";
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

if (cloudReady) {
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  ({ data: { session } } = await client.auth.getSession());
  if (session) await loadData();
  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    if (!session || _event === "INITIAL_SESSION") return;
    // Never await Supabase work inside its auth callback. Supabase can hold
    // the auth lock while dispatching this event, which can freeze refreshes.
    setTimeout(() => loadData(), 0);
  });
}

bindDialogs(); renderMissions(); renderCommandMissions(); renderRecovery();

// Operations can supply measured evidence (for example one completed PT
// session or one finished chapter). Reload the mission views immediately.
window.addEventListener("aegis:missions-refresh", async (event) => {
  if (event.detail?.source !== "operations-hub" || !session) return;
  await loadData();
});
