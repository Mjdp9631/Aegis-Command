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

function ensureFallbackMissionEditor() {
  if (fallbackMissionEditor?.isConnected) return fallbackMissionEditor;
  const dialog = document.createElement("dialog");
  dialog.id = "fallback-mission-editor-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card mission-editor-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Edit the objective.</h2><label>Mission <input name="title" required /></label><label>Matrix priority <select name="priority"><option>Do now</option><option>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>What does complete mean? <textarea name="definition" rows="4"></textarea></label><div class="two-col"><label>Completed count <input name="completed_count" type="number" min="0" step="1" /></label><label>Total required <input name="target_count" type="number" min="1" step="1" /></label></div><label class="check-label"><input name="completed" type="checkbox" /> Mission complete</label><button class="primary" type="submit">Save mission</button></form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector("form");
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
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

// mission.js is an ordered module, but network imports can still make its
// renderer become available after this module's first data fetch. Repaint the
// Command Center once, using the expanded renderer, instead of leaving the
// static compact placeholders from index.html in place.
window.addEventListener("aegis:mission-renderer-ready", () => {
  if (typeof window.AEGIS_RENDER_COMMAND_MISSIONS !== "function") return;
  const rows = Array.isArray(window.AEGIS_MISSIONS) ? window.AEGIS_MISSIONS : [];
  if (rows.length) window.AEGIS_RENDER_COMMAND_MISSIONS(rows, window.AEGIS_OPERATIONS || []);
});

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [missionsResult, operationsResult, occurrenceResult] = await Promise.all([
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("operations").select("id, mission_id, title, category, schedule_mode, scheduled_date, operation_date, scheduled_time, completed_on, status, completed"),
    supabase.from("operation_occurrences").select("*")
  ]);
  if (!missionsResult.error) render(missionsResult.data || [], effectiveOperations(operationsResult.data || [], occurrenceResult.data || []));
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
