import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { effectiveOperations } from "./operation-state.js?v=shared-operation-state-v2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const icons = { Recovery: "+", Trading: "O", Business: "#", "Self Mastery": "*", "Life Admin": "·" };

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function progress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
function normalizeCategory(value) { const category = String(value || "").trim().toLowerCase(); return category === "mind" || category === "body" || category === "mastery" ? "Self Mastery" : category === "life admin" || category === "day to day" ? "Life Admin" : value || "Self Mastery"; }
function label(mission) { return isMeasured(mission) ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission.completed ? "Complete" : "Not complete"; }
function iconClass(category) { return category === "Recovery" ? "recovery-icon" : category === "Trading" ? "trade-icon" : "business-icon"; }

function updateMetric(title, mission) {
  const card = [...document.querySelectorAll(".metric")].find((item) => item.querySelector("p")?.textContent.trim() === title);
  if (!card || !mission) return;
  card.querySelector("strong").textContent = label(mission);
  const meter = card.querySelector(".meter i");
  if (meter) meter.style.width = `${progress(mission)}%`;
  const note = card.querySelector("small");
  if (note) note.textContent = mission.completion_definition || "Define completion evidence";
}

let fallbackMissionEditor = null;

function fallbackMissionProgress(mission) {
  if (mission?.completion_type === "units" && Number(mission.target_count) > 0) {
    return Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100);
  }
  return mission?.completed ? 100 : Number(mission?.progress) || 0;
}

function fallbackOperationFamilyKey(operation) {
  if (operation?.operation_family_key) return String(operation.operation_family_key);
  return `${String(operation?.title || "operation").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${normalizeCategory(operation?.category).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function fallbackOperationRows() {
  const rows = Array.isArray(window.AEGIS_OPERATIONS) ? window.AEGIS_OPERATIONS : [];
  const grouped = new Map();
  rows.filter((operation) => operation && !operation._occurrence && normalizeCategory(operation.category) !== "Life Admin").forEach((operation) => {
    const key = fallbackOperationFamilyKey(operation);
    if (!grouped.has(key)) grouped.set(key, { ...operation, operation_family_key: key });
  });
  return [...grouped.values()];
}

function fallbackLinkedOperations(mission) {
  return fallbackOperationRows().filter((operation) => {
    const linkedIds = Array.isArray(operation.linked_mission_ids) ? operation.linked_mission_ids : null;
    if (linkedIds && linkedIds.length) return linkedIds.some((id) => String(id) === String(mission?.id));
    return String(operation.mission_id || "") === String(mission?.id);
  });
}

async function persistFallbackOperationLink(operation, mission, userId) {
  const familyKey = fallbackOperationFamilyKey(operation);
  let familyResult = await supabase.from("operation_family_mission_links").upsert({ user_id: userId, operation_family_key: familyKey, mission_id: mission.id, is_explicit: true }, { onConflict: "user_id,operation_family_key,mission_id" });
  if (familyResult.error && /relation|table|schema cache|column/i.test(String(familyResult.error.message || ""))) {
    familyResult = await supabase.from("operation_mission_links").upsert({ user_id: userId, operation_id: operation.id, mission_id: mission.id, is_explicit: true }, { onConflict: "operation_id,mission_id" });
  }
  if (familyResult.error && !/relation|table|schema cache|column/i.test(String(familyResult.error.message || ""))) return familyResult;
  const update = await supabase.from("operations").update({ mission_id: mission.id, allow_unlinked: false }).eq("id", operation.id).eq("user_id", userId);
  if (update.error && /allow_unlinked|column|schema cache/i.test(String(update.error.message || ""))) return supabase.from("operations").update({ mission_id: mission.id }).eq("id", operation.id).eq("user_id", userId);
  return update;
}

function renderFallbackOperationLinkage(form, mission) {
  const linkedTarget = form.querySelector("#fallback-linked-operations");
  const existing = form.querySelector("#fallback-operation-existing");
  if (!linkedTarget || !existing) return;
  const linked = fallbackLinkedOperations(mission);
  linkedTarget.innerHTML = linked.length
    ? linked.map((operation) => `<article class="mission-editor-linked-row"><div><strong>${escape(operation.title)}</strong><span>${escape(operation.status || (operation.completed ? "Complete" : "Queued"))}${operation.category ? ` · ${escape(operation.category)}` : ""}</span></div><button type="button" class="text-button mission-operation-unlink" data-fallback-unlink-operation="${escape(operation.id)}">Unlink pathway</button></article>`).join("")
    : '<p class="mission-details-empty">No operation is attached yet. Choose Add existing operation or Create operation below.</p>';
  const rows = fallbackOperationRows();
  existing.innerHTML = rows.length ? rows.map((operation) => `<option value="${escape(operation.id)}">${escape(operation.title)}${operation.scheduled_date ? ` · ${escape(operation.scheduled_date)}` : " · unscheduled"}${operation.category ? ` · ${escape(operation.category)}` : ""}${operation.mission_id ? " · pathway linked" : ""}</option>`).join("") : '<option value="">No existing operations available</option>';
}

async function applyFallbackOperationLinkage(mission, form) {
  if (!supabase || !mission) return;
  const mode = form.elements.operation_mode?.value || "none";
  const sessionResult = await supabase.auth.getSession();
  const userId = sessionResult.data?.session?.user?.id;
  if (!userId || mode === "none") return;
  if (mode === "existing") {
    const selected = [...(form.elements.operation_existing?.selectedOptions || [])].map((option) => option.value).filter(Boolean);
    for (const operationId of selected) {
      const operation = fallbackOperationRows().find((row) => String(row.id) === String(operationId));
      if (!operation) continue;
      const result = await persistFallbackOperationLink(operation, mission, userId);
      if (result.error) throw new Error(result.error.message);
    }
  } else if (mode === "create") {
    const title = String(form.elements.operation_title?.value || "").trim();
    if (!title) return;
    const operationPayload = { user_id: userId, title, category: normalizeCategory(mission.category), brief: String(form.elements.operation_brief?.value || "").trim() || mission.completion_definition || "Complete one operation for this mission.", mission_id: mission.id, status: "Queued", completed: false, scheduled_date: form.elements.operation_date?.value || new Date().toISOString().slice(0, 10), operation_family_key: fallbackOperationFamilyKey({ title, category: mission.category }), allow_unlinked: false };
    const inserted = await supabase.from("operations").insert(operationPayload).select().single();
    if (inserted.error) throw new Error(inserted.error.message);
    const result = await persistFallbackOperationLink(inserted.data, mission, userId);
    if (result.error) throw new Error(result.error.message);
  }
}

function ensureFallbackMissionEditor() {
  if (fallbackMissionEditor?.isConnected) return fallbackMissionEditor;
  const dialog = document.createElement("dialog");
  dialog.id = "fallback-mission-editor-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card mission-editor-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Define the evidence.</h2><label>Mission <input name="title" required /></label><label>Matrix priority <select name="priority"><option>Do now</option><option>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>What does complete mean? <textarea name="definition" rows="4"></textarea></label><div class="two-col"><label>Completed count <input name="completed_count" type="number" min="0" step="1" /></label><label>Total required <input name="target_count" type="number" min="1" step="1" /></label></div><label class="check-label"><input name="completed" type="checkbox" /> Mission complete</label><fieldset class="mission-operation-plan"><legend>Operation linkage</legend><p class="mission-operation-help">Link an existing operation or create one. One operation may advance multiple missions.</p><p class="eyebrow">CURRENT LINKED PATHWAYS</p><div id="fallback-linked-operations" class="mission-editor-linked-list"></div><label>Operation action <select name="operation_mode"><option value="none">No operation change</option><option value="existing">Add existing operation</option><option value="create">Create operation</option></select></label><div class="mission-operation-fields" data-fallback-existing hidden><label>Existing operation<select name="operation_existing" id="fallback-operation-existing" multiple size="5"></select></label></div><div class="mission-operation-fields" data-fallback-create hidden><label>Operation <input name="operation_title" placeholder="What moves this mission forward?" /></label><label>Brief <textarea name="operation_brief" rows="2"></textarea></label><label>First date <input name="operation_date" type="date" /></label></div></fieldset><button class="primary" type="submit">Save mission</button></form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  form.elements.operation_mode.addEventListener("change", () => {
    form.querySelector("[data-fallback-existing]").hidden = form.elements.operation_mode.value !== "existing";
    form.querySelector("[data-fallback-create]").hidden = form.elements.operation_mode.value !== "create";
  });
  form.addEventListener("click", async (event) => {
    const unlink = event.target.closest("[data-fallback-unlink-operation]");
    if (!unlink) return;
    event.preventDefault();
    const sessionResult = await supabase?.auth.getSession();
    const userId = sessionResult?.data?.session?.user?.id;
    if (!userId) return alert("Sign in before unlinking an operation.");
    const operationId = unlink.dataset.fallbackUnlinkOperation;
    const operation = fallbackOperationRows().find((row) => String(row.id) === String(operationId));
    if (!operation) return alert("That operation is no longer available. Refresh and try again.");
    const familyKey = fallbackOperationFamilyKey(operation);
    let linkResult = await supabase.from("operation_family_mission_links").delete().eq("user_id", userId).eq("operation_family_key", familyKey).eq("mission_id", dialog.dataset.missionId);
    if (linkResult.error && /relation|table|schema cache|column/i.test(String(linkResult.error.message || ""))) {
      linkResult = await supabase.from("operation_mission_links").delete().eq("user_id", userId).eq("operation_id", operationId).eq("mission_id", dialog.dataset.missionId);
    }
    if (linkResult.error && !/relation|table|schema cache|column/i.test(String(linkResult.error.message || ""))) return alert(`Could not unlink operation: ${linkResult.error.message}`);
    const familyIds = fallbackOperationRows().filter((row) => fallbackOperationFamilyKey(row) === familyKey).map((row) => row.id);
    const updateResult = await supabase.from("operations").update({ mission_id: null, allow_unlinked: true }).eq("user_id", userId).in("id", familyIds);
    if (updateResult.error && !/allow_unlinked|column|schema cache/i.test(String(updateResult.error.message || ""))) return alert(`Could not update the operation pathway: ${updateResult.error.message}`);
    window.AEGIS_OPERATIONS = (window.AEGIS_OPERATIONS || []).map((row) => familyIds.some((id) => String(id) === String(row.id)) ? { ...row, mission_id: null, allow_unlinked: true } : row);
    renderFallbackOperationLinkage(form, (window.AEGIS_MISSIONS || []).find((row) => String(row.id) === String(dialog.dataset.missionId)));
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = (window.AEGIS_MISSIONS || []).find((row) => String(row.id) === String(dialog.dataset.missionId));
    if (!mission) return dialog.close();
    const values = new FormData(form);
    const target = Math.max(1, Number(values.get("target_count") || mission.target_count || 1));
    const measured = mission.completion_type === "units" && Number(mission.target_count) > 0;
    const completedCount = measured ? Math.min(target, Math.max(0, Number(values.get("completed_count") || 0))) : 0;
    const completed = measured ? completedCount >= target : form.elements.completed.checked;
    const payload = {
      title: String(values.get("title") || "").trim(),
      priority: values.get("priority"),
      completion_definition: String(values.get("definition") || "").trim() || null,
      completed,
      ...(measured ? { completed_count: completedCount, target_count: target, progress: Math.round((completedCount / target) * 100) } : { progress: completed ? 100 : 0 }),
    };
    if (!payload.title) return;
    if (!supabase) return alert("Sign in before editing a mission.");
    const { data, error } = await supabase.from("missions").update(payload).eq("id", mission.id).select().single();
    if (error) return alert(`Mission could not be updated: ${error.message}`);
    try { await applyFallbackOperationLinkage(data, form); }
    catch (linkError) { return alert(`Mission saved, but operation linkage failed: ${linkError.message}`); }
    dialog.close();
    window.AEGIS_MISSIONS = (window.AEGIS_MISSIONS || []).map((row) => String(row.id) === String(data.id) ? data : row);
    window.dispatchEvent(new CustomEvent("aegis:missions-loaded", { detail: { missions: window.AEGIS_MISSIONS, source: "fallback-mission-editor" } }));
  });
  fallbackMissionEditor = dialog;
  return dialog;
}

async function openFallbackMissionEditor(id) {
  const mission = (window.AEGIS_MISSIONS || []).find((row) => String(row.id) === String(id));
  if (!mission) return;
  const dialog = ensureFallbackMissionEditor();
  const form = dialog.querySelector("form");
  form.elements.title.value = mission.title || "";
  form.elements.priority.value = mission.priority || "Schedule";
  form.elements.definition.value = mission.completion_definition || "";
  form.elements.completed_count.value = mission.completed_count || 0;
  form.elements.target_count.value = mission.target_count || 1;
  form.elements.completed.checked = Boolean(mission.completed);
  renderFallbackOperationLinkage(form, mission);
  dialog.dataset.missionId = mission.id;
  if (!dialog.open) dialog.showModal();
}

// Do not replace the canonical editor when mission.js has already registered;
// this is only the boot-safe path for the visible fallback ledger.
if (typeof window.AEGIS_OPEN_MISSION_EDITOR !== "function") {
  window.AEGIS_OPEN_MISSION_EDITOR = (id) => openFallbackMissionEditor(id);
}

function render(missions, operations = []) {
  const normalizedMissions = missions.map((mission) => ({ ...mission, category: normalizeCategory(mission.category), progress: progress(mission) }));
  // A transient empty response can arrive while the authenticated mission
  // feed is still hydrating. Never let that response erase cards that are
  // already present in the shared ledger.
  const sharedMissions = Array.isArray(window.AEGIS_MISSIONS) ? window.AEGIS_MISSIONS : [];
  const authoritativeMissions = normalizedMissions.length ? normalizedMissions : sharedMissions;
  if (!authoritativeMissions.length) return;
  // Share the authoritative mission rows with Mission Control. This avoids a
  // race where the Command Center fetch completes before mission.js receives
  // its auth callback.
  window.AEGIS_MISSIONS = authoritativeMissions;
  window.AEGIS_OPERATIONS = Array.isArray(operations) ? operations : [];
  window.dispatchEvent(new CustomEvent("aegis:missions-loaded", {
    detail: { missions: authoritativeMissions, source: "command-center" },
  }));
  // Mission Control owns #mission-cards. Command Center only publishes the
  // shared feed and renders its own #command-missions surface; it must never
  // repaint the Mission tab with a competing legacy layout.
  if (typeof window.AEGIS_RENDER_COMMAND_MISSIONS === "function") window.AEGIS_RENDER_COMMAND_MISSIONS(authoritativeMissions, operations);
  const target = $("#command-missions") || document.querySelector("#command .mission-panel .mission-list");
  if (target) {
    target.id = "command-missions";
  }
  updateMetric("RECOVERY", authoritativeMissions.find((mission) => mission.category === "Recovery"));
  updateMetric("TRADING PROCESS", authoritativeMissions.find((mission) => mission.category === "Trading"));
}

// Module evaluation and authenticated queries can finish in either order.
// Repaint after either side becomes ready; the renderer normalizes raw rows.
function repaintCommandMissions() {
  if (typeof window.AEGIS_RENDER_COMMAND_MISSIONS !== "function") return;
  const rows = Array.isArray(window.AEGIS_MISSIONS) ? window.AEGIS_MISSIONS : [];
  if (rows.length) window.AEGIS_RENDER_COMMAND_MISSIONS(rows, window.AEGIS_OPERATIONS || []);
}
window.addEventListener("aegis:mission-renderer-ready", repaintCommandMissions);
window.addEventListener("aegis:missions-loaded", () => setTimeout(repaintCommandMissions, 0));
window.addEventListener("aegis:operations-loaded", () => setTimeout(repaintCommandMissions, 0));
window.addEventListener("load", () => setTimeout(repaintCommandMissions, 0), { once: true });

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [missionsResult, operationsResult, occurrenceResult, familyLinksResult, legacyLinksResult] = await Promise.all([
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("operations").select("id, mission_id, title, category, schedule_mode, scheduled_date, operation_date, scheduled_time, completed_on, status, completed, operation_family_key, allow_unlinked"),
    supabase.from("operation_occurrences").select("*"),
    supabase.from("operation_family_mission_links").select("operation_family_key, mission_id"),
    supabase.from("operation_mission_links").select("operation_id, mission_id")
  ]);
  if (!missionsResult.error) {
    const familyLinks = familyLinksResult.error ? [] : (familyLinksResult.data || []);
    const legacyLinks = legacyLinksResult.error ? [] : (legacyLinksResult.data || []);
    const operations = effectiveOperations(operationsResult.data || [], occurrenceResult.data || []).map((operation) => ({
      ...operation,
      linked_mission_ids: [...new Set([
        ...(Array.isArray(operation.linked_mission_ids) ? operation.linked_mission_ids : []),
        ...familyLinks.filter((link) => String(link.operation_family_key || "") === String(operation.operation_family_key || fallbackOperationFamilyKey(operation))).map((link) => link.mission_id),
        ...legacyLinks.filter((link) => String(link.operation_id) === String(operation.id)).map((link) => link.mission_id),
      ].filter(Boolean))],
    }));
    render(missionsResult.data || [], operations);
  }
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 80); });
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 80));
  document.addEventListener("click", (event) => { if (event.target.closest("#save-mission, #mission-editor-dialog .primary")) setTimeout(load, 1200); });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-schedule-mission]")) return;
    const row = event.target.closest("[data-open-mission]");
    if (!row) return;
    window.location.hash = "#missions";
  });
}
