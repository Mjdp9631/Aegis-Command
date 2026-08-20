import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  if (operation?.operation_family_key && !/^operation(?:-[a-z0-9-]+)?$/i.test(String(operation.operation_family_key).trim())) return String(operation.operation_family_key);
  return `${String(operation?.title || "operation").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${normalizeCategory(operation?.category).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function fallbackDisplayFamilyKey(operation) {
  const rawTitle = String(operation?.title || "operation");
  if (/(?:physical therapy|\bpt\b|orthopedic|acl|rehab|rehabilitation)/i.test(rawTitle) && !/appointment|visit/i.test(rawTitle)) return `complete-10-pt-sessions-${normalizeCategory(operation?.category).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const title = rawTitle.toLowerCase().trim()
    .replace(/\b20\d{2}[-/]\d{2}[-/]\d{2}\b/g, "")
    .replace(/\b(?:session|sessions|chapter|chapters)\s*#?\s*\d+\b/g, "")
    .replace(/\s*[–—-]?\s*pt\s*$/i, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "operation";
  return `${title}-${normalizeCategory(operation?.category).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function fallbackOperationLabel(operation) {
  const title = String(operation?.title || "");
  if (/(?:physical therapy|\bpt\b|orthopedic|acl|rehab|rehabilitation)/i.test(title) && !/appointment|visit/i.test(title)) return "Complete 10 PT sessions";
  return title || "Operation";
}
function fallbackOperationTemplateRows() {
  return ["Legs", "Push", "Pull", "Upper Body", "Lower Body"].map((split) => ({
    id: `local-family-gym-${split.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `Gym - ${split}`,
    category: "Self Mastery",
    status: "Queued",
    completed: false,
    schedule_mode: "one_time",
    is_daily: true,
    scheduled_date: new Date().toISOString().slice(0, 10),
    operation_date: new Date().toISOString().slice(0, 10),
    brief: `Complete the ${split} session selected in Self Mastery. Log every exercise, weight, reps, and completed sets.`,
    is_operation_family_template: true,
  })).concat([{ id: "local-family-pt-sessions", title: "Complete 10 PT sessions", category: "Recovery", status: "Queued", completed: false, scheduled_date: new Date().toISOString().slice(0, 10), operation_date: new Date().toISOString().slice(0, 10), brief: "Complete one clinician-approved physical therapy session and record the recovery evidence.", is_operation_family_template: true }]);
}
function fallbackFamilyLinkKeys(operation) {
  return [...new Set([fallbackOperationFamilyKey(operation), fallbackDisplayFamilyKey(operation)].filter(Boolean))];
}

function fallbackOperationRows() {
  const rows = Array.isArray(window.AEGIS_OPERATION_FAMILIES)
    ? window.AEGIS_OPERATION_FAMILIES
    : (Array.isArray(window.AEGIS_OPERATIONS) ? window.AEGIS_OPERATIONS : []);
  const grouped = new Map();
  [...rows, ...fallbackOperationTemplateRows()].filter((operation) => operation && !operation._occurrence && normalizeCategory(operation.category) !== "Life Admin").forEach((operation) => {
    const key = fallbackDisplayFamilyKey(operation);
    const current = grouped.get(key);
    if (!current) grouped.set(key, { ...operation, operation_family_key: key, family_operation_ids: [operation.id], family_count: 1, linked_mission_ids: [...(operation.linked_mission_ids || [])] });
    else if (!current.family_operation_ids.some((id) => String(id) === String(operation.id))) {
      current.family_operation_ids.push(operation.id);
      current.family_count += 1;
      current.linked_mission_ids = [...new Set([...(current.linked_mission_ids || []), ...(operation.linked_mission_ids || [])])];
    }
  });
  return [...grouped.values()];
}

function fallbackLinkedOperations(mission) {
  return fallbackOperationRows().filter((operation) => {
    const linkedIds = Array.isArray(operation.linked_mission_ids) ? operation.linked_mission_ids : null;
    if (window.AEGIS_OPERATION_FAMILY_LINKS_AVAILABLE === true || window.AEGIS_OPERATION_LEGACY_LINKS_AVAILABLE === true || operation.mission_link_mode === "family" || operation.mission_link_mode === "legacy") {
      return Boolean(linkedIds?.some((id) => String(id) === String(mission?.id)));
    }
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
  return familyResult;
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
  const selected = new Set([...existing.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value));
  existing.innerHTML = rows.length ? rows.map((operation) => `<label class="mission-operation-choice"><input type="checkbox" name="operation_existing" value="${escape(operation.id)}"${selected.has(String(operation.id)) ? " checked" : ""} /><span>${escape(fallbackOperationLabel(operation))}${operation.family_count > 1 ? ` · ${operation.family_count} scheduled occurrences` : ""}${operation.category ? ` · ${escape(operation.category)}` : ""}${operation.mission_id ? " · pathway linked" : ""}</span></label>`).join("") : '<p class="mission-details-empty">No existing operations available.</p>';
}

async function applyFallbackOperationLinkage(mission, form) {
  if (!supabase || !mission) return;
  const mode = form.elements.operation_mode?.value || "none";
  const sessionResult = await supabase.auth.getSession();
  const userId = sessionResult.data?.session?.user?.id;
  if (!userId || mode === "none") return;
  if (mode === "existing") {
    const selected = [...form.querySelectorAll('#fallback-operation-existing input[type="checkbox"]:checked')].map((input) => input.value).filter(Boolean);
    for (const operationId of selected) {
      let operation = fallbackOperationRows().find((row) => String(row.id) === String(operationId));
      if (!operation) continue;
      if (operation.is_operation_family_template && String(operation.id).startsWith("local-")) {
        const inserted = await supabase.from("operations").insert({ user_id: userId, title: operation.title, category: operation.category, brief: operation.brief, mission_id: null, status: "Queued", completed: false, scheduled_date: operation.scheduled_date, operation_date: operation.operation_date, is_daily: true, schedule_mode: "one_time", allow_unlinked: true }).select().single();
        if (inserted.error) throw new Error(inserted.error.message);
        operation = inserted.data;
      }
      const result = await persistFallbackOperationLink(operation, mission, userId);
      if (result.error) throw new Error(result.error.message);
    }
  } else if (mode === "create") {
    const title = String(form.elements.operation_title?.value || "").trim();
    if (!title) return;
    const operationPayload = { user_id: userId, title, category: normalizeCategory(mission.category), brief: String(form.elements.operation_brief?.value || "").trim() || mission.completion_definition || "Complete one operation for this mission.", mission_id: null, status: "Queued", completed: false, scheduled_date: form.elements.operation_date?.value || new Date().toISOString().slice(0, 10), operation_family_key: fallbackOperationFamilyKey({ title, category: mission.category }), allow_unlinked: false };
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
  dialog.innerHTML = `<form method="dialog" class="dialog-card mission-editor-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Define the evidence.</h2><label>Mission <input name="title" required /></label><label>Matrix priority <select name="priority"><option>Do now</option><option>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>What does complete mean? <textarea name="definition" rows="4"></textarea></label><div class="two-col"><label>Completed count <input name="completed_count" type="number" min="0" step="1" /></label><label>Total required <input name="target_count" type="number" min="1" step="1" /></label></div><label class="check-label"><input name="completed" type="checkbox" /> Mission complete</label><fieldset class="mission-operation-plan"><legend>Operation linkage</legend><p class="mission-operation-help">Link an existing operation or create one. One operation may advance multiple missions.</p><p class="eyebrow">CURRENT LINKED PATHWAYS</p><div id="fallback-linked-operations" class="mission-editor-linked-list"></div><label>Operation action <select name="operation_mode"><option value="none">No operation change</option><option value="existing">Add existing operation</option><option value="create">Create operation</option></select></label><div class="mission-operation-fields" data-fallback-existing hidden><label>Existing operation families<div class="mission-operation-picker" data-operation-picker="fallback"><button type="button" class="mission-operation-picker-toggle" aria-expanded="false">Choose operation families</button><div class="mission-operation-picker-menu" hidden><div name="operation_existing" id="fallback-operation-existing" class="mission-operation-checklist" role="group" aria-label="Existing operation families"></div></div></div></label></div><div class="mission-operation-fields" data-fallback-create hidden><label>Operation <input name="operation_title" placeholder="What moves this mission forward?" /></label><label>Brief <textarea name="operation_brief" rows="2"></textarea></label><label>First date <input name="operation_date" type="date" /></label></div></fieldset><button class="primary" type="submit">Save mission</button></form>`;
  const titleLabel = dialog.querySelector('input[name="title"]')?.closest("label");
  titleLabel?.insertAdjacentHTML("afterend", '<label>Category <select name="category"><option>Recovery</option><option>Trading</option><option>Business</option><option>Self Mastery</option><option>Life Admin</option></select></label>');
  const definitionLabel = dialog.querySelector('textarea[name="definition"]')?.closest("label");
  definitionLabel?.insertAdjacentHTML("beforebegin", '<label>Completion method <select name="completion_type"><option value="binary">One-time completion</option><option value="units">Measured progress</option></select></label>');
  definitionLabel?.insertAdjacentHTML("afterend", '<div data-fallback-measured><label>What is being measured? <input name="unit_label" placeholder="e.g. chapters, days, months, or notes" /></label><div class="two-col"><label>Total required <input name="target_count" type="number" min="1" step="1" /></label><label>Completed count <input name="completed_count" type="number" min="0" step="1" /></label></div></div>');
  // The boot-safe template historically included these two fields before
  // measured progress was made explicit. Remove that legacy pair so the
  // editor has one source of truth for each value.
  const targetInputs = [...dialog.querySelectorAll('input[name="target_count"]')];
  const countInputs = [...dialog.querySelectorAll('input[name="completed_count"]')];
  targetInputs[0]?.closest("label")?.remove();
  countInputs[0]?.closest("label")?.remove();
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  form.elements.operation_mode.addEventListener("change", () => {
    form.querySelector("[data-fallback-existing]").hidden = form.elements.operation_mode.value !== "existing";
    form.querySelector("[data-fallback-create]").hidden = form.elements.operation_mode.value !== "create";
  });
  const picker = form.querySelector('[data-operation-picker="fallback"]');
  const toggle = picker?.querySelector(".mission-operation-picker-toggle");
  const menu = picker?.querySelector(".mission-operation-picker-menu");
  toggle?.addEventListener("click", (event) => {
    event.preventDefault();
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
  });
  const syncMeasuredFields = () => {
    const measured = form.elements.completion_type.value === "units";
    form.querySelector("[data-fallback-measured]").hidden = !measured;
    form.elements.completed.closest("label").hidden = measured;
    form.elements.completed_count.closest("label").hidden = !measured;
    form.elements.target_count.closest("label").hidden = !measured;
  };
  form.elements.completion_type.addEventListener("change", syncMeasuredFields);
  syncMeasuredFields();
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
    const familyKeys = fallbackFamilyLinkKeys(operation);
    let linkResult = await supabase.from("operation_family_mission_links").delete().eq("user_id", userId).in("operation_family_key", familyKeys).eq("mission_id", dialog.dataset.missionId);
    if (linkResult.error && /relation|table|schema cache|column/i.test(String(linkResult.error.message || ""))) {
      linkResult = await supabase.from("operation_mission_links").delete().eq("user_id", userId).eq("operation_id", operationId).eq("mission_id", dialog.dataset.missionId);
    }
    if (linkResult.error && !/relation|table|schema cache|column/i.test(String(linkResult.error.message || ""))) return alert(`Could not unlink operation: ${linkResult.error.message}`);
    const familyIds = fallbackOperationRows().filter((row) => fallbackFamilyLinkKeys(row).some((key) => familyKeys.includes(key))).flatMap((row) => row.family_operation_ids || [row.id]);
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
    const measured = values.get("completion_type") === "units";
    const completedCount = measured ? Math.min(target, Math.max(0, Number(values.get("completed_count") || 0))) : 0;
    const completed = measured ? completedCount >= target : form.elements.completed.checked;
    const manualProgressOverride = measured
      && (Boolean(mission.manual_progress_override) || completedCount !== Number(mission.completed_count || 0));
    const payload = {
      title: String(values.get("title") || "").trim(),
      category: normalizeCategory(values.get("category") || mission.category),
      priority: values.get("priority"),
      completion_type: measured ? "units" : "binary",
      completion_definition: String(values.get("definition") || "").trim() || null,
      completed,
      ...(measured ? { metric_key: mission.metric_key || "operation.complete", unit_label: String(values.get("unit_label") || "").trim() || "units", completed_count: completedCount, target_count: target, progress: Math.round((completedCount / target) * 100), manual_progress_override: manualProgressOverride } : { metric_key: null, unit_label: null, completed_count: 0, target_count: null, progress: completed ? 100 : 0, manual_progress_override: false }),
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
  form.elements.category.value = normalizeCategory(mission.category || "Self Mastery");
  form.elements.priority.value = mission.priority || "Schedule";
  form.elements.completion_type.value = mission.completion_type === "units" && Number(mission.target_count) > 0 ? "units" : "binary";
  form.elements.definition.value = mission.completion_definition || "";
  form.elements.completed_count.value = mission.completed_count || 0;
  form.elements.target_count.value = mission.target_count || 1;
  form.elements.unit_label.value = mission.unit_label || "";
  form.elements.completed.checked = Boolean(mission.completed);
  form.elements.completion_type.dispatchEvent(new Event("change"));
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
    const familyLinksAvailable = !familyLinksResult.error;
    const legacyLinksAvailable = !familyLinksAvailable && !legacyLinksResult.error;
    const familyLinks = familyLinksAvailable ? (familyLinksResult.data || []) : [];
    const legacyLinks = legacyLinksAvailable ? (legacyLinksResult.data || []) : [];
    window.AEGIS_OPERATION_FAMILY_LINKS_AVAILABLE = familyLinksAvailable;
    window.AEGIS_OPERATION_LEGACY_LINKS_AVAILABLE = legacyLinksAvailable;
    const rawOperations = operationsResult.data || [];
    const operations = rawOperations.map((operation) => {
      const normalizedFamilyKey = fallbackOperationFamilyKey(operation);
      return {
      ...operation,
      mission_id: familyLinksAvailable || legacyLinksAvailable ? null : operation.mission_id,
      operation_family_key: normalizedFamilyKey,
      linked_mission_ids: [...new Set([
        ...(Array.isArray(operation.linked_mission_ids) ? operation.linked_mission_ids : []),
        ...familyLinks.filter((link) => [normalizedFamilyKey, fallbackDisplayFamilyKey(operation)].includes(String(link.operation_family_key || ""))).map((link) => link.mission_id),
        ...(familyLinksResult.error ? legacyLinks.filter((link) => String(link.operation_id) === String(operation.id)).map((link) => link.mission_id) : []),
      ].filter(Boolean))],
      mission_link_mode: familyLinksAvailable ? "family" : (legacyLinksAvailable ? "legacy" : "operation"),
      };
    });
    window.AEGIS_OPERATION_FAMILIES = operations;
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
