import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const priorities = '<option value="Do now">DO NOW - important + urgent</option><option value="Schedule">SCHEDULE - important + not urgent</option><option value="Delegate">DELEGATE - urgent + not important</option><option value="Eliminate">ELIMINATE - not urgent + not important</option>';
let client = null, session = null, missions = [], missionOperations = [], currentBookTitle = "", currentBookMissionId = "";
let missionEditor = null;
let missionDetails = null;
let missionLoadTimer = null;
let missionLoadInFlight = null;

// A stalled optional query must never leave Mission Control on its static
// loading shell. Supabase query builders are thenable, so Promise.race can
// safely bound both normal requests and auth/database lock contention.
function withMissionTimeout(query, label, timeoutMs = 10000) {
  return Promise.race([
    query,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)),
  ]);
}

function renderMissionLoadFailure(error) {
  console.error("Mission ledger sync failed", error);
  const target = $("#mission-cards");
  const list = target?.querySelector("[data-mission-list]");
  if (!list || missions.length) return;
  list.innerHTML = `<article class="mission-card"><h3>Mission sync is taking longer than expected.</h3><small>${escape(error?.message || "Retrying the authenticated mission feed.")}</small></article>`;
}

function hydrateMissionLedgerFromSharedState() {
  if (missions.length) return true;
  const shared = window.AEGIS_MISSIONS;
  if (!Array.isArray(shared) || !shared.length) return false;
  applyMissionRows(shared);
  return true;
}

function bindMissionViewTabsFallback() {
  const target = $("#mission-cards");
  if (!target || target.dataset.missionTabsWired === "true") return;
  target.dataset.missionTabsWired = "true";
  target.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mission-view]");
    if (!button || target.dataset.missionRenderer === "mission") return;
    target.querySelectorAll("[data-mission-view]").forEach((item) => item.classList.toggle("active", item === button));
    const list = target.querySelector("[data-mission-list]");
    if (!list) return;
    if (!missions.length) {
      list.innerHTML = '<article class="mission-card"><h3>Mission data is still syncing.</h3><small>Refresh after authentication completes.</small></article>';
      return;
    }
    const complete = button.dataset.missionView === "complete";
    const rows = sortMissions(missions.filter((mission) => (mission.progress >= 100) === complete));
    list.innerHTML = rows.length ? rows.map((mission) => `<button type="button" class="mission-card mission-open" data-mission-ledger-card="true" data-mission-id="${escape(mission.id)}"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${escape(missionLabel(mission))}</p></button>`).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>';
  });
}

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function missionProgress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
function missionLabel(mission) { return isMeasured(mission) ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission.completed ? "Complete" : "Not complete"; }
function operationFamilyKey(operation) {
  if (operation?.operation_family_key) return String(operation.operation_family_key);
  const title = String(operation?.title || "").toLowerCase().trim()
    .replace(/\b20\d{2}[-/]\d{2}[-/]\d{2}\b/g, "")
    .replace(/\b(?:session|sessions|chapter|chapters)\s*#?\s*\d+\b/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "operation";
  const category = missionCategory(operation?.category).toLowerCase();
  return `${title}-${category.replace(/[^a-z0-9]+/g, "-")}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function operationMatchesMission(operation, mission) {
  // Mission pathways are explicit. Similarity can be useful as an editor
  // suggestion, but it must never make an unrelated operation advance a
  // mission automatically.
  if ((operation.mission_link_mode !== "family" && String(operation.mission_id || "") === String(mission.id))
    || (Array.isArray(operation.linked_mission_ids) && operation.linked_mission_ids.some((id) => String(id) === String(mission.id)))) return true;
  return false;
}
function operationsForMission(mission) {
  const grouped = new Map();
  missionOperations.filter((operation) => operationMatchesMission(operation, mission)).forEach((operation) => {
    const key = operationFamilyKey(operation);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...operation, family_count: 1 });
    else {
      current.family_count = Number(current.family_count || 1) + 1;
      if (String(operation.scheduled_date || operation.operation_date || "") < String(current.scheduled_date || current.operation_date || "")) grouped.set(key, { ...operation, family_count: current.family_count });
    }
  });
  return [...grouped.values()];
}
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
  const linked = [...new Map(operations.filter((operation) => (operation.mission_link_mode !== "family" && String(operation.mission_id || "") === String(mission.id))
    || (Array.isArray(operation.linked_mission_ids) && operation.linked_mission_ids.some((id) => String(id) === String(mission.id))));
  ).map((operation) => [operationFamilyKey(operation), operation])).values()];
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
  target.id = "command-missions";
  const active = sortMissions(nextMissions.filter((mission) => mission.progress < 100));
  // Command Center owns one expanded mission surface. The Mission tab has
  // its own ledger, but this renderer is the only writer for #command-missions.
  target.className = "mission-list command-mission-board";
  target.innerHTML = `<div class="command-mission-list" data-command-mission-list></div>`;
  const activeList = target.querySelector("[data-command-mission-list]");
  activeList.innerHTML = active.length
    ? active.map((mission) => commandMissionCard(mission, operations)).join("")
    : '<article class="command-mission-empty"><strong>No active missions.</strong><small>Open the next objective from Mission Control.</small></article>';
  target.querySelectorAll("[data-open-mission]").forEach((card) => card.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const mission = missions.find((item) => String(item.id) === String(card.dataset.missionId)) || nextMissions.find((item) => String(item.id) === String(card.dataset.missionId));
    if (mission) void openEditorFromMissionCard(mission);
  }));
}

function renderMissions() {
  const target = $("#mission-cards");
  if (!target) return;
  target.dataset.missionRenderer = "mission";
  const active = sortMissions(missions.filter((mission) => mission.progress < 100));
  const complete = sortMissions(missions.filter((mission) => mission.progress >= 100));
  target.innerHTML = `<div class="mission-view-tabs"><button type="button" class="mission-view-tab active" data-mission-view="active">ACTIVE · ${active.length}</button><button type="button" class="mission-view-tab" data-mission-view="complete">COMPLETED · ${complete.length}</button></div><div class="mission-card-list" data-mission-list></div>`;
  target.dataset.missionRenderer = "mission";
  const list = target.querySelector("[data-mission-list]");
  const draw = (items) => { list.innerHTML = items.length ? items.map((mission) => {
    const linked = operationsForMission(mission);
    const attached = linked.length ? `${linked.length} attached operation${linked.length === 1 ? "" : "s"}: ${linked.slice(0, 2).map((operation) => escape(operation.title)).join(" · ")}${linked.length > 2 ? " · …" : ""}` : "No operation attached yet";
    return `<button type="button" class="mission-card mission-open" data-mission-ledger-card="true" data-mission-id="${escape(mission.id)}"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${escape(missionLabel(mission))}</p><div class="meter"><i style="width:${mission.progress}%"></i></div><small class="mission-definition">${mission.completion_definition ? escape(mission.completion_definition) : "Define what completion means"}</small><small class="mission-attachment-summary">${attached}</small></button>`;
  }).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>'; };
  draw(active);
  list.querySelectorAll("[data-mission-ledger-card]").forEach((card) => card.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const mission = missions.find((item) => String(item.id) === String(card.dataset.missionId));
    openEditorFromMissionCard(mission);
  }, true));
  target.querySelectorAll("[data-mission-view]").forEach((button) => button.addEventListener("click", () => { target.querySelectorAll("[data-mission-view]").forEach((item) => item.classList.toggle("active", item === button)); draw(button.dataset.missionView === "complete" ? complete : active); }));
}

function renderCommandMissions() {
  renderCommandMissionBoard(missions, missionOperations);
}

function buildMissionDetails() {
  const dialog = document.createElement("dialog");
  dialog.id = "mission-details-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card mission-details-card"><button class="dialog-close" type="submit" value="cancel" aria-label="Close">×</button><p class="eyebrow amber">MISSION OPERATIONS</p><h2 id="mission-details-title">Mission</h2><p id="mission-details-progress" class="body-copy"></p><div id="mission-details-definition" class="mission-details-definition"></div><div><p class="eyebrow">ATTACHED OPERATIONS</p><div id="mission-details-operations" class="mission-details-operations"></div></div><button class="primary" id="mission-details-edit" type="button">Edit mission</button></form>`;
  document.body.appendChild(dialog);
  wireMissionDetailsDialog(dialog);
  return dialog;
}

function wireMissionDetailsDialog(dialog) {
  const button = dialog?.querySelector("#mission-details-edit");
  if (button && button.dataset.aegisWired !== "true") {
    button.dataset.aegisWired = "true";
    button.addEventListener("click", openMissionEditorFromDetails);
  }
  if (dialog && dialog.dataset.aegisUnlinkWired !== "true") {
    dialog.dataset.aegisUnlinkWired = "true";
    dialog.addEventListener("click", (event) => {
      const unlink = event.target.closest("[data-unlink-operation]");
      if (!unlink) return;
      event.preventDefault();
      event.stopPropagation();
      unlinkMissionOperation(unlink.dataset.unlinkOperation, unlink.dataset.unlinkMission);
    });
  }
}

async function unlinkMissionOperation(operationId, missionId) {
  if (!operationId || !missionId || !session?.user?.id) return;
  const operation = missionOperations.find((item) => String(item.id) === String(operationId));
  if (!operation) return;
  const familyKey = operationFamilyKey(operation);
  let manyToManyAvailable = false;
  if (client) {
    let result = await client.from("operation_family_mission_links")
      .delete()
      .eq("user_id", session.user.id)
      .eq("operation_family_key", familyKey)
      .eq("mission_id", missionId);
    if (!result.error) manyToManyAvailable = true;
    else {
      result = await client.from("operation_mission_links")
        .delete().eq("user_id", session.user.id).eq("operation_id", operationId).eq("mission_id", missionId);
      if (!result.error) manyToManyAvailable = true;
      else if (!/relation|table|schema cache|operation_mission_links|operation_family_mission_links/i.test(String(result.error.message || ""))) {
        window.alert(`Could not unlink operation: ${result.error.message}`);
        return;
      }
    }
  }
  let remainingIds = (Array.isArray(operation.linked_mission_ids) ? operation.linked_mission_ids : [])
    .filter((id) => String(id) !== String(missionId));
  if (client && manyToManyAvailable) {
    const { data: familyData, error: familyError } = await client.from("operation_family_mission_links")
      .select("mission_id")
      .eq("user_id", session.user.id)
      .eq("operation_family_key", familyKey);
    if (!familyError) remainingIds = (familyData || []).map((row) => row.mission_id);
    else {
      const { data } = await client.from("operation_mission_links").select("mission_id").eq("user_id", session.user.id).eq("operation_id", operationId);
      remainingIds = (data || []).map((row) => row.mission_id);
    }
  }
  const nextLegacyMission = remainingIds[0] || null;
  const familyOperations = missionOperations.filter((item) => operationFamilyKey(item) === familyKey && !isLocalOperationId(item.id));
  if (client && familyOperations.length) {
    const legacyResult = await client.from("operation_mission_links")
      .delete().eq("user_id", session.user.id).eq("mission_id", missionId)
      .in("operation_id", familyOperations.map((item) => item.id));
    if (legacyResult.error && !/relation|table|schema cache/i.test(String(legacyResult.error.message || ""))) {
      window.alert(`The family link was removed, but one legacy pathway could not be updated: ${legacyResult.error.message}`);
    }
    const legacyPrimary = nextLegacyMission
      ? await client.from("operations").update({ mission_id: nextLegacyMission }).eq("user_id", session.user.id).eq("mission_id", missionId).in("id", familyOperations.map((item) => item.id))
      : await client.from("operations").update({ mission_id: null }).eq("user_id", session.user.id).eq("mission_id", missionId).in("id", familyOperations.map((item) => item.id));
    if (legacyPrimary.error && !/column|schema cache/i.test(String(legacyPrimary.error.message || ""))) {
      window.alert(`The family link was removed, but one legacy operation path could not be updated: ${legacyPrimary.error.message}`);
    }
  }
  missionOperations = missionOperations.map((item) => operationFamilyKey(item) === familyKey
    ? { ...item, mission_id: String(item.mission_id || "") === String(missionId) ? nextLegacyMission : item.mission_id, linked_mission_ids: remainingIds, mission_link_mode: manyToManyAvailable ? "family" : item.mission_link_mode }
    : item);
  window.AEGIS_OPERATIONS = missionOperations;
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "mission-unlink", operations: missionOperations } }));
  const mission = missions.find((item) => String(item.id) === String(missionId));
  if (mission) openMissionDetails(mission);
}

function openMissionEditorFromDetails(event) {
  const button = event?.target?.closest?.("#mission-details-edit");
  if (!button) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  // Resolve the dialog that actually owns the clicked button. This survives
  // route transitions and stale dialog nodes left by an earlier module copy.
  const detailsDialog = button.closest("#mission-details-dialog") || missionDetails;
  if (!detailsDialog) return true;
  missionDetails = detailsDialog;
  wireMissionDetailsDialog(detailsDialog);
  if (!missionEditor || !missionEditor.isConnected) missionEditor = buildMissionEditor();
  const mission = missions.find((item) => String(item.id) === String(detailsDialog.dataset.missionId));
  if (!mission) return true;
  const launch = () => {
    try {
      if (!missionEditor.open) openEditor(missionEditor, mission);
    } catch (error) {
      console.warn("Mission editor could not open", error);
      setTimeout(() => {
        try { if (!missionEditor.open) openEditor(missionEditor, mission); }
        catch (retryError) { console.warn("Mission editor retry failed", retryError); }
      }, 50);
    }
  };
  // Close first, then open on the next task. A browser can reject two modal
  // dialogs being changed during the same event turn.
  if (missionDetails.open) {
    missionDetails.close();
    setTimeout(launch, 0);
  } else launch();
  return true;
}

function ensureMissionDetailsDialog() {
  if (!missionDetails || !missionDetails.isConnected) missionDetails = buildMissionDetails();
  wireMissionDetailsDialog(missionDetails);
  return missionDetails;
}

function openMissionDetails(mission) {
  if (!mission) return;
  const dialog = ensureMissionDetailsDialog();
  dialog.dataset.missionId = mission.id;
  dialog.querySelector("#mission-details-title").textContent = mission.title;
  dialog.querySelector("#mission-details-progress").textContent = `${mission.category} · ${missionLabel(mission)}`;
  dialog.querySelector("#mission-details-definition").textContent = mission.completion_definition || "Define the evidence that proves this mission is complete.";
  const linked = operationsForMission(mission);
  dialog.querySelector("#mission-details-operations").innerHTML = linked.length
    ? linked.map((operation) => `<article class="mission-operation-link"><div><strong>${escape(operation.title)}</strong><span>${escape(operationStatus(operation))}${operation.family_count > 1 ? ` · ${escape(operation.family_count)} completion records` : ""}${operationDate(operation) ? ` · ${escape(operationDate(operation))}` : ""}${operation.category ? ` · ${escape(operation.category)}` : ""}</span></div><button type="button" class="text-button mission-operation-unlink" data-unlink-operation="${escape(operation.id)}" data-unlink-mission="${escape(mission.id)}">Unlink pathway</button></article>`).join("")
    : '<p class="mission-details-empty">No operation is attached yet. Schedule one from this mission or link it when creating an operation.</p>';
  if (dialog.open) dialog.close();
  setTimeout(() => {
    try { if (!dialog.open) dialog.showModal(); }
    catch (error) { console.warn("Mission details could not open", error); }
  }, 0);
}

async function openEditorFromMissionCard(mission) {
  if (!mission) return;
  // Command Center can receive the shared mission feed a moment before this
  // module receives Supabase's auth callback. Resolve the current session at
  // click time so a valid signed-in click never becomes a silent no-op.
  if (!session) session = window.AEGIS_SESSION || null;
  if (!session && client) {
    const result = await client.auth.getSession();
    session = result.data?.session || null;
  }
  if (!session) return alert("Sign in before editing a mission.");
  try {
    if (!missionEditor || !missionEditor.isConnected) missionEditor = buildMissionEditor();
  } catch (error) {
    console.error("Mission editor could not be built", error);
    return alert("The mission editor could not load. Please refresh once and try again.");
  }
  const launch = () => {
    try {
      if (missionEditor.open) missionEditor.close();
      openEditor(missionEditor, mission);
    } catch (error) {
      console.warn("Mission editor could not open from ledger", error);
    }
  };
  if (missionDetails?.open) {
    missionDetails.close();
    setTimeout(launch, 0);
  } else launch();
}

window.AEGIS_OPEN_MISSION_DETAILS = (id) => {
  const mission = missions.find((item) => String(item.id) === String(id));
  openMissionDetails(mission);
};
window.AEGIS_OPEN_MISSION_EDITOR = (id) => {
  const rows = missions.length ? missions : (Array.isArray(window.AEGIS_MISSIONS) ? window.AEGIS_MISSIONS : []);
  const mission = rows.find((item) => String(item.id) === String(id));
  void openEditorFromMissionCard(mission);
};

window.AEGIS_RENDER_COMMAND_MISSIONS = renderCommandMissionBoard;
window.AEGIS_MISSION_RENDERER_READY = true;
window.dispatchEvent(new CustomEvent("aegis:mission-renderer-ready"));

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

function operationPlanMarkup(prefix) {
  return `<fieldset class="mission-operation-plan"><legend>Operation linkage</legend><p class="mission-operation-help">Each operation family linked here can advance this mission. Repeating dates are completion records for the same operation, not new pathways. One operation may advance multiple missions. Life Admin operations remain informational and do not advance progress.</p><label>Operation action <select id="${prefix}-operation-mode"><option value="none">No operation yet</option><option value="create">Create operation</option><option value="existing">Add existing operation</option></select></label><div id="${prefix}-create-operation" class="mission-operation-fields" hidden><label>Operation <input id="${prefix}-operation-title" placeholder="What moves this mission forward?" /></label><label>Brief <textarea id="${prefix}-operation-brief" rows="2" placeholder="What counts as one completed operation?"></textarea></label><div class="two-col"><label>First date <input id="${prefix}-operation-date" type="date" /></label><label>Time <span class="field-optional">optional</span><input id="${prefix}-operation-time" type="time" /></label></div><label>Cadence <select id="${prefix}-operation-cadence"><option value="one_time">One-time</option><option value="daily">Repeat daily</option><option value="weekly">Repeat weekly</option></select></label><label id="${prefix}-operation-end-wrap">End date <span class="field-optional">optional for repeats</span><input id="${prefix}-operation-end-date" type="date" /></label></div><div id="${prefix}-existing-operation" class="mission-operation-fields" hidden><label>Existing operation families<select id="${prefix}-operation-existing" multiple size="5"><option value="">Choose one or more operation families</option></select></label><small id="${prefix}-operation-existing-note" class="mission-operation-note"></small></div></fieldset>`;
}

function operationPlanRows() {
  const rows = [...missionOperations, ...(Array.isArray(window.AEGIS_OPERATIONS) ? window.AEGIS_OPERATIONS : [])];
  const grouped = new Map();
  rows.filter((operation) => {
    if (!operation || operation._occurrence) return false;
    if (operation.allow_unlinked || missionCategory(operation.category) === "Life Admin") return false;
    return true;
  }).forEach((operation) => {
    const key = operationFamilyKey(operation);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...operation, operation_family_key: key, family_operation_ids: [operation.id], family_count: 1 });
    else if (!current.family_operation_ids.some((id) => String(id) === String(operation.id))) {
      current.family_operation_ids.push(operation.id);
      current.family_count += 1;
    }
  });
  return [...grouped.values()];
}

function operationSuggestionScore(operation, mission) {
  if (!mission) return 0;
  let score = 0;
  if (mission.metric_key && operation.metric_key && String(mission.metric_key).toLowerCase() === String(operation.metric_key).toLowerCase()) score += 3;
  const missionWords = `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const operationText = `${operation.title || ""} ${operation.brief || ""}`.toLowerCase();
  if (missionWords.some((word) => operationText.includes(word))) score += 1;
  return score;
}

function isLocalOperationId(id) {
  return String(id || "").startsWith("local-");
}

async function insertMissionOperation(payload) {
  const attempt = { ...payload };
  let result = await client.from("operations").insert(attempt).select().single();
  if (!result.error || !/allow_unlinked|scheduled_end_date|schedule_mode|operation_date|is_daily|scheduled_time|metric_key|brief|operation_family_key|column|schema cache/i.test(String(result.error.message || ""))) return result;

  // Browser-cached operations can outlive a partially migrated database. Keep
  // the durable mission link and core schedule fields, while gracefully
  // dropping only columns that this older schema does not expose.
  ["allow_unlinked", "scheduled_end_date", "schedule_mode", "operation_date", "is_daily", "scheduled_time", "metric_key", "brief", "operation_family_key"].forEach((key) => delete attempt[key]);
  result = await client.from("operations").insert(attempt).select().single();
  return result;
}

async function attachExistingOperation(operation, mission) {
  const linkPayload = { user_id: session.user.id, operation_family_key: operationFamilyKey(operation), mission_id: mission.id, is_explicit: true };
  let result = await client.from("operation_family_mission_links").upsert(linkPayload, { onConflict: "user_id,operation_family_key,mission_id" }).select().maybeSingle();
  if (!result.error) return { data: operation, error: null, manyToMany: true };
  if (/relation|table|schema cache|column|operation_family_mission_links/i.test(String(result.error.message || ""))) {
    const legacyLink = await client.from("operation_mission_links")
      .upsert({ user_id: session.user.id, operation_id: operation.id, mission_id: mission.id, is_explicit: true }, { onConflict: "operation_id,mission_id" })
      .select().maybeSingle();
    if (!legacyLink.error) return { data: operation, error: null, manyToMany: true };
    result = legacyLink;
  } else return result;

  // Migration 073 is optional for older deployments. Preserve the old path
  // until the many-to-many table exists, without blocking mission saves.
  const fallback = { mission_id: mission.id, allow_unlinked: false };
  if (mission.metric_key) fallback.metric_key = mission.metric_key;
  result = await client.from("operations").update(fallback).eq("id", operation.id).eq("user_id", session.user.id).select().single();
  if (result.error && /allow_unlinked|column|schema cache/i.test(String(result.error.message || ""))) {
    delete fallback.allow_unlinked;
    result = await client.from("operations").update(fallback).eq("id", operation.id).eq("user_id", session.user.id).select().single();
  }
  return result;
}

function populateOperationPlanChoices(form, prefix, mission = null) {
  const select = form?.querySelector(`#${prefix}-operation-existing`);
  if (!select) return;
  const currentMissionId = String(mission?.id || "");
  const rows = operationPlanRows().sort((a, b) => operationSuggestionScore(b, mission) - operationSuggestionScore(a, mission) || String(a.title || "").localeCompare(String(b.title || "")));
  select.innerHTML = rows.length ? rows.map((operation) => {
    const suggestion = operationSuggestionScore(operation, mission) > 0 ? " · exact match suggestion" : "";
    const familyLabel = operation.family_count > 1 ? ` · ${operation.family_count} scheduled occurrences` : "";
    return `<option value="${escape(operation.id)}">${escape(operation.title)}${operation.scheduled_date ? ` · ${escape(operation.scheduled_date)}` : " · unscheduled"}${familyLabel}${operation.category ? ` · ${escape(operation.category)}` : ""}${operation.mission_id || operation.linked_mission_ids?.length ? " · pathway linked" : ""}${suggestion}</option>`;
  }).join("") : `<option value="">No existing operations available</option>`;
  const note = form.querySelector(`#${prefix}-operation-existing-note`);
  if (note) note.textContent = rows.length ? `${rows.length} existing operation${rows.length === 1 ? "" : "s"} available. Exact metric/title matches are shown first as suggestions; nothing is attached until you select it. One operation may advance multiple missions.` : "No existing operations are available yet.";
}

function refreshOperationPlanChoices() {
  const createForm = $("#mission-create-form");
  const editForm = $("#mission-edit-form");
  if (createForm) populateOperationPlanChoices(createForm, "new-mission");
  if (editForm) {
    const mission = missions.find((item) => String(item.id) === String(missionEditor?.dataset?.missionId || ""));
    populateOperationPlanChoices(editForm, "edit-mission", mission);
  }
}

function syncOperationPlanFields(form, prefix) {
  const mode = form?.querySelector(`#${prefix}-operation-mode`)?.value || "none";
  const createFields = form?.querySelector(`#${prefix}-create-operation`);
  const existingFields = form?.querySelector(`#${prefix}-existing-operation`);
  if (createFields) createFields.hidden = mode !== "create";
  if (existingFields) existingFields.hidden = mode !== "existing";
  const cadence = form?.querySelector(`#${prefix}-operation-cadence`);
  const endDate = form?.querySelector(`#${prefix}-operation-end-date`);
  const endWrap = form?.querySelector(`#${prefix}-operation-end-wrap`);
  const repeat = cadence && cadence.value !== "one_time";
  if (endDate) endDate.disabled = !repeat;
  if (endWrap) endWrap.classList.toggle("is-disabled", !repeat);
}

function readOperationPlan(form, prefix) {
  const mode = form?.querySelector(`#${prefix}-operation-mode`)?.value || "none";
  if (mode === "existing") return { mode, existingIds: [...(form.querySelector(`#${prefix}-operation-existing`)?.selectedOptions || [])].map((option) => option.value).filter(Boolean) };
  if (mode !== "create") return { mode };
  const cadence = form.querySelector(`#${prefix}-operation-cadence`)?.value || "one_time";
  const date = form.querySelector(`#${prefix}-operation-date`)?.value || easternDateKey();
  const endDate = cadence === "one_time" ? "" : form.querySelector(`#${prefix}-operation-end-date`)?.value || "";
  return {
    mode,
    title: form.querySelector(`#${prefix}-operation-title`)?.value.trim() || "",
    brief: form.querySelector(`#${prefix}-operation-brief`)?.value.trim() || "",
    date,
    time: form.querySelector(`#${prefix}-operation-time`)?.value || "",
    cadence,
    endDate,
  };
}

function missionOperationPayload(mission, plan) {
  const date = plan.date || easternDateKey();
  const today = easternDateKey();
  return {
    title: plan.title || mission.title,
    category: missionCategory(mission.category),
    brief: plan.brief || mission.completion_definition || `Complete one ${mission.unit_label || "operation"} for this mission.`,
    status: date > today ? "Scheduled" : "Queued",
    completed: false,
    scheduled_date: date,
    scheduled_time: plan.time || null,
    scheduled_end_date: plan.cadence === "one_time" ? null : plan.endDate || null,
    schedule_mode: plan.cadence === "weekly" ? "recurring" : plan.cadence,
    operation_date: date,
    is_daily: false,
    mission_id: mission.id,
    metric_key: mission.metric_key || "operation.complete",
    allow_unlinked: false,
    operation_family_key: operationFamilyKey({ title: plan.title || mission.title, category: mission.category }),
  };
}

async function applyMissionOperationPlan(mission, plan) {
  if (!mission || !plan || plan.mode === "none") return { ok: true };
  if (plan.mode === "existing") {
    const existingIds = Array.isArray(plan.existingIds) ? plan.existingIds : plan.existingId ? [plan.existingId] : [];
    if (!existingIds.length) return { ok: false, message: "Choose one or more operations to attach." };
    const selectedOperations = existingIds.map((id) => operationPlanRows().find((operation) => String(operation.id) === String(id))).filter(Boolean);
    if (!selectedOperations.length) return { ok: false, message: "Those operations are no longer available. Refresh and choose them again." };
    let latestData = null;
    for (const selectedOperation of selectedOperations) {

    // Local operation IDs are browser-cache placeholders, not UUIDs. Persist
    // the cached operation first, then use the returned UUID for the mission
    // link. Sending the local ID directly to operations.mission_id causes a
    // PostgreSQL invalid-input-syntax error.
      if (isLocalOperationId(selectedOperation.id)) {
      const localPayload = {
        title: selectedOperation.title || mission.title,
        category: missionCategory(selectedOperation.category || mission.category),
        brief: selectedOperation.brief || mission.completion_definition || `Complete one ${mission.unit_label || "operation"} for this mission.`,
        status: selectedOperation.status || (selectedOperation.completed ? "Complete" : "Queued"),
        completed: Boolean(selectedOperation.completed),
        scheduled_date: selectedOperation.scheduled_date || selectedOperation.operation_date || easternDateKey(),
        scheduled_time: selectedOperation.scheduled_time || null,
        scheduled_end_date: selectedOperation.scheduled_end_date || null,
        schedule_mode: selectedOperation.schedule_mode || "one_time",
        operation_date: selectedOperation.operation_date || selectedOperation.scheduled_date || null,
        is_daily: Boolean(selectedOperation.is_daily),
        mission_id: mission.id,
        operation_family_key: operationFamilyKey(selectedOperation),
        metric_key: mission.metric_key || selectedOperation.metric_key || "operation.complete",
        allow_unlinked: false,
      };
        const { data, error } = await insertMissionOperation(localPayload);
        if (error) return { ok: false, message: error.message };
        if (data) {
          const linkResult = await attachExistingOperation(data, mission);
          if (linkResult.error) return { ok: false, message: linkResult.error.message };
          latestData = data;
          missionOperations = [...missionOperations.filter((operation) => String(operation.id) !== String(selectedOperation.id)), data];
        }
        continue;
      }

      let { data, error } = await attachExistingOperation(selectedOperation, mission);
      if (error) return { ok: false, message: error.message };
      if (data) {
        latestData = data;
        missionOperations = [...missionOperations.filter((operation) => String(operation.id) !== String(data.id)), data];
      }
    }
    return { ok: true, data: latestData };
  }
  if (!plan.title) return { ok: false, message: "Enter an operation name." };
  if (plan.endDate && plan.endDate < plan.date) return { ok: false, message: "The operation end date must be on or after its first date." };
  const operationPayload = missionOperationPayload(mission, plan);
  const { data, error } = await insertMissionOperation(operationPayload);
  if (error) return { ok: false, message: error.message };
  if (data) {
    const linkResult = await attachExistingOperation(data, mission);
    if (linkResult.error) return { ok: false, message: linkResult.error.message };
    missionOperations = [data, ...missionOperations];
  }
  return { ok: true, data };
}

function announceMissionOperationChange() {
  window.AEGIS_OPERATIONS = missionOperations;
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "mission", operations: missionOperations } }));
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "mission-operation-link" } }));
}

function configureCreateDialog() {
  const dialog = $("#mission-dialog");
  dialog.innerHTML = `<form id="mission-create-form" class="dialog-card mission-editor-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW MISSION</p><h2>Define the finish line.</h2>${fieldMarkup("new-mission", true)}${operationPlanMarkup("new-mission")}<button class="primary" type="submit">Open mission</button></form>`;
  const form = $("#mission-create-form");
  form.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  $(`#new-mission-method`).addEventListener("change", () => updateTrackingFields(form, "new-mission"));
  $(`#new-mission-operation-mode`).addEventListener("change", () => { populateOperationPlanChoices(form, "new-mission"); syncOperationPlanFields(form, "new-mission"); });
  $(`#new-mission-operation-cadence`).addEventListener("change", () => syncOperationPlanFields(form, "new-mission"));
  $(`#new-mission-operation-date`).value = easternDateKey();
  populateOperationPlanChoices(form, "new-mission");
  syncOperationPlanFields(form, "new-mission");
  updateTrackingFields(form, "new-mission");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session || !client) return alert("Sign in before saving a mission.");
    const payload = readMission(form, "new-mission", true);
    if (!payload.title) return;
    const { data, error } = await client.from("missions").insert(payload).select().single();
    if (error) return alert(`Mission could not be created: ${error.message}`);
    const mission = normalize(data);
    const operationResult = await applyMissionOperationPlan(mission, readOperationPlan(form, "new-mission"));
    missions.unshift(mission);
    dialog.close(); renderMissions(); renderCommandMissions(); publishMissionChange();
    if (!operationResult.ok) alert(`Mission created, but its operation was not linked: ${operationResult.message}`);
    else if (operationResult.data) announceMissionOperationChange();
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
  dialog.innerHTML = `<form id="mission-edit-form" class="dialog-card mission-editor-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Define the evidence.</h2>${fieldMarkup("edit-mission", false)}${operationPlanMarkup("edit-mission")}<button class="primary" type="submit">Save mission</button></form>`;
  dialog.querySelector("#mission-edit-form button[type=submit]").insertAdjacentHTML("beforebegin", outcomeMarkup("edit-mission"));
  document.body.appendChild(dialog);
  const form = $("#mission-edit-form");
  form.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  $(`#edit-mission-method`).addEventListener("change", () => updateTrackingFields(form, "edit-mission"));
  $(`#edit-mission-operation-mode`).addEventListener("change", () => { populateOperationPlanChoices(form, "edit-mission"); syncOperationPlanFields(form, "edit-mission"); });
  $(`#edit-mission-operation-cadence`).addEventListener("change", () => syncOperationPlanFields(form, "edit-mission"));
  $(`#edit-mission-operation-date`).value = easternDateKey();
  populateOperationPlanChoices(form, "edit-mission");
  syncOperationPlanFields(form, "edit-mission");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = missions.find((item) => String(item.id) === String(dialog.dataset.missionId));
    const payload = { ...readMission(form, "edit-mission", false, mission), ...readOutcomeFields(form, "edit-mission", mission) };
    if (!mission || !payload.title) return;
    const { data, error } = await client.from("missions").update(payload).eq("id", mission.id).select().single();
    if (error) return alert(`Mission could not be updated: ${error.message}`);
    const updatedMission = normalize(data);
    const operationResult = await applyMissionOperationPlan(updatedMission, readOperationPlan(form, "edit-mission"));
    missions = missions.map((item) => item.id === data.id ? updatedMission : item);
    dialog.close();
    if (operationResult.ok && operationResult.data) {
      // Re-read both tables after linking so a stale operations-hub event
      // cannot immediately hide the newly attached operation.
      await loadData();
      announceMissionOperationChange();
    } else {
      renderMissions(); renderCommandMissions(); publishMissionChange(); syncRecoveryVisibility();
    }
    if (!operationResult.ok) alert(`Mission updated, but its operation was not linked: ${operationResult.message}`);
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
  $(`#edit-mission-operation-mode`).value = "none";
  $(`#edit-mission-operation-title`).value = "";
  $(`#edit-mission-operation-brief`).value = mission.completion_definition || "";
  $(`#edit-mission-operation-date`).value = easternDateKey();
  $(`#edit-mission-operation-time`).value = "";
  $(`#edit-mission-operation-cadence`).value = "one_time";
  $(`#edit-mission-operation-end-date`).value = "";
  populateOperationPlanChoices($("#mission-edit-form"), "edit-mission", mission);
  syncOperationPlanFields($("#mission-edit-form"), "edit-mission");
  updateTrackingFields($("#mission-edit-form"), "edit-mission");
  dialog.showModal();
}

async function loadData() {
  if (!session || !client) return;
  if (missionLoadInFlight) return missionLoadInFlight;
  missionLoadInFlight = (async () => {
    try {
      let { data, error } = await withMissionTimeout(
        client.from("missions").select("*").order("created_at", { ascending: false }),
        "Mission query",
      );
      // A legacy missions table may not expose the ordering column even though
      // the rows themselves are readable. Keep the data path resilient to that
      // older schema while preserving the normal newest-first ordering.
      if (error) ({ data, error } = await withMissionTimeout(client.from("missions").select("*"), "Mission fallback query"));
      if (error) {
        console.error("Could not load missions", error);
        renderMissionLoadFailure(error);
        return;
      }

      // Paint the authoritative mission rows before optional operation-link,
      // book, and recovery queries. The ledger should never depend on those
      // secondary feeds completing first.
      applyMissionRows(Array.isArray(data) ? data : []);

      let operationRows = [];
      let operationError = null;
      let operationResult = await withMissionTimeout(
        client.from("operations").select("*").eq("user_id", session.user.id),
        "Operation query",
      );
      operationRows = operationResult.data;
      operationError = operationResult.error;
      if (operationError) {
        // Keep attachment discovery readable across older deployments whose
        // operations table may not yet have every newer schedule column.
        operationResult = await withMissionTimeout(
          client.from("operations").select("id,title,mission_id,status,completed,scheduled_date,operation_date,completed_on,category,is_daily,metric_key,brief").eq("user_id", session.user.id),
          "Operation fallback query",
        );
        operationRows = operationResult.data;
        operationError = operationResult.error;
      }

      let operationLinkRows = [];
      let familyLinksAvailable = false;
      if (!operationError) {
        try {
          let linkResult = await withMissionTimeout(
            client.from("operation_family_mission_links").select("operation_family_key,mission_id").eq("user_id", session.user.id),
            "Operation family-link query",
          );
          familyLinksAvailable = !linkResult.error;
          if (linkResult.error) {
            linkResult = await withMissionTimeout(
              client.from("operation_mission_links").select("operation_id,mission_id").eq("user_id", session.user.id),
              "Operation link fallback query",
            );
          }
          if (!linkResult.error) operationLinkRows = (linkResult.data || []).map((link) => ({
            ...link,
            operation_id: familyLinksAvailable ? null : link.operation_id,
            operation_family_key: familyLinksAvailable ? link.operation_family_key : null,
          }));
        } catch (linkError) {
          // The family-link migration is optional during rollout. Existing
          // operation rows still render, and the editor can retry linking.
          console.warn("Mission operation links unavailable", linkError.message);
        }
      }
      const linkedMissionIds = new Map();
      operationLinkRows.forEach((link) => {
        const key = link.operation_family_key ? `family:${link.operation_family_key}` : `operation:${link.operation_id}`;
        const ids = linkedMissionIds.get(key) || [];
        if (!ids.some((id) => String(id) === String(link.mission_id))) ids.push(link.mission_id);
        linkedMissionIds.set(key, ids);
      });
      if (Array.isArray(operationRows)) operationRows = operationRows.map((operation) => ({
        ...operation,
        operation_family_key: operationFamilyKey(operation),
        mission_link_mode: familyLinksAvailable ? "family" : "operation",
        linked_mission_ids: linkedMissionIds.get(`family:${operationFamilyKey(operation)}`)
          || linkedMissionIds.get(`operation:${operation.id}`)
          || (familyLinksAvailable ? [] : (operation.mission_id ? [operation.mission_id] : [])),
      }));
      const sharedOperationRows = Array.isArray(window.AEGIS_OPERATIONS) ? window.AEGIS_OPERATIONS : [];
      if (!operationError && Array.isArray(operationRows)) missionOperations = [...operationRows, ...sharedOperationRows.filter((shared) => !operationRows.some((operation) => String(operation.id) === String(shared.id)))];
      else if (sharedOperationRows.length) missionOperations = sharedOperationRows;

      try {
        const { data: bookRow } = await withMissionTimeout(client.from("mastery_entries")
          .select("title")
          .eq("user_id", session.user.id)
          .ilike("category", "book")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(), "Active-book query");
        currentBookTitle = bookRow?.title || "";
      } catch (bookError) {
        console.warn("Active-book query unavailable", bookError.message);
        currentBookTitle = "";
      }
      const bookKey = currentBookTitle.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const bookMission = (data || []).find((mission) => bookKey.length >= 5
        && `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(bookKey)
        && !mission.completed);
      const hasBookSpecificMission = (data || []).some((mission) => bookKey.length >= 5
        && `${mission.title || ""} ${mission.completion_definition || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(bookKey));
      const fallbackBookMission = !currentBookTitle && (data || [])
        .filter((mission) => !mission.completed && String(mission.metric_key || "").toLowerCase() === "chapters_read")
        .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
      const latestChapterMission = (data || [])
        .filter((mission) => !mission.completed && String(mission.metric_key || "").toLowerCase() === "chapters_read")
        .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
      currentBookMissionId = bookMission?.id || (!hasBookSpecificMission ? (fallbackBookMission?.id || latestChapterMission?.id || "") : "");
      applyMissionRows(Array.isArray(data) ? data : []);

      try {
        const { data: logs } = await withMissionTimeout(client.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1), "Recovery query");
        renderRecovery(logs?.[0]);
      } catch (recoveryError) {
        console.warn("Recovery query unavailable", recoveryError.message);
      }
    } catch (error) {
      renderMissionLoadFailure(error);
    } finally {
      missionLoadInFlight = null;
    }
  })();
  return missionLoadInFlight;
}

async function refreshMissionSession() {
  if (!client) return;
  try {
    const { data, error } = await withMissionTimeout(client.auth.getSession(), "Auth session query");
    if (error || !data?.session) return;
    session = data.session;
    await loadData();
  } catch (error) {
    renderMissionLoadFailure(error);
  }
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
    if (card.dataset.missionLedgerCard === "true") openEditorFromMissionCard(mission);
    else openMission(card.dataset.missionId);
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="add-mission"]');
    if (!button) return;
    event.preventDefault();
    const dialog = $("#mission-dialog");
    if (dialog && !dialog.open) {
      const form = $("#mission-create-form");
      if (form) {
        form.reset();
        $(`#new-mission-operation-date`).value = easternDateKey();
        populateOperationPlanChoices(form, "new-mission");
        syncOperationPlanFields(form, "new-mission");
        updateTrackingFields(form, "new-mission");
      }
      dialog.showModal();
    }
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

// Mission-tab cards are the read-only ledger surface. Capture this before
// route/navigation handlers so the click always opens the attached-operation
// details panel instead of being interpreted as an old editor action.
document.addEventListener("click", (event) => {
  const card = event.target.closest?.("[data-mission-ledger-card]");
  if (!card) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.AEGIS_OPEN_MISSION_EDITOR?.(card.dataset.missionId);
}, true);

window.addEventListener("aegis:open-mission", (event) => {
  const id = event.detail?.id;
  if (!id || !missionEditor) return;
  const rows = missions.length ? missions : (Array.isArray(window.AEGIS_MISSIONS) ? window.AEGIS_MISSIONS : []);
  const mission = rows.find((item) => String(item.id) === String(id));
  void openEditorFromMissionCard(mission);
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
  renderCommandMissions();
  refreshOperationPlanChoices();
});

window.addEventListener("aegis:operations-loaded", (event) => {
  const rows = event.detail?.operations;
  if (!Array.isArray(rows)) return;
  missionOperations = rows.filter((operation) => !operation?._occurrence);
  renderMissions();
  renderCommandMissions();
  refreshOperationPlanChoices();
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
bindMissionViewTabsFallback();
bindDialogs();
missionDetails = buildMissionDetails();
hydrateMissionLedgerFromSharedState();

if (cloudReady) {
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
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
  // Do not top-level-await auth here. The mission module must finish
  // registering its event listeners so the operations module can hydrate the
  // ledger even when Supabase auth or an optional query is slow.
  void refreshMissionSession();
}

// Operations can supply measured evidence (for example one completed PT
// session or one finished chapter). Reload the mission views immediately.
window.addEventListener("aegis:missions-refresh", async (event) => {
  if (event.detail?.source !== "operations-hub" || !session) return;
  await loadData();
});

// Command Center and Operations Hub can finish their user-scoped mission
// query before this module's auth callback. Re-check the shared feed after
// the page has settled so the ledger never stays on its static loading shell.
window.addEventListener("load", () => {
  if (hydrateMissionLedgerFromSharedState()) return;
  if (session) void loadData();
});
setTimeout(() => {
  if (!missions.length) hydrateMissionLedgerFromSharedState();
}, 2500);
