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

function renderMissionLedgerFallback(missions) {
  const target = $("#mission-cards");
  if (!target) return;
  const loading = /Loading mission ledger/i.test(target.textContent || "");
  if (!loading && target.dataset.missionRenderer === "mission") return;
  const active = missions.filter((mission) => progress(mission) < 100);
  const complete = missions.filter((mission) => progress(mission) >= 100);
  const card = (mission) => `<button type="button" class="mission-card mission-open" data-mission-ledger-card="true" data-mission-id="${escape(mission.id)}"><span class="eyebrow amber">${escape(mission.priority || "Schedule")}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${escape(label(mission))}</p><div class="meter"><i style="width:${progress(mission)}%"></i></div></button>`;
  target.dataset.missionRenderer = "fallback";
  target.innerHTML = `<div class="mission-view-tabs"><button type="button" class="mission-view-tab active" data-mission-view="active">ACTIVE · ${active.length}</button><button type="button" class="mission-view-tab" data-mission-view="complete">COMPLETED · ${complete.length}</button></div><div class="mission-card-list" data-mission-list>${active.length ? active.map(card).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>'}</div>`;
  if (target.dataset.missionFallbackWired === "true") return;
  target.dataset.missionFallbackWired = "true";
  target.addEventListener("click", (event) => {
    if (target.dataset.missionRenderer !== "fallback") return;
    const card = event.target.closest("[data-mission-ledger-card]");
    if (card) {
      event.preventDefault();
      window.AEGIS_OPEN_MISSION_EDITOR?.(card.dataset.missionId);
      return;
    }
    const button = event.target.closest("[data-mission-view]");
    if (!button) return;
    target.querySelectorAll("[data-mission-view]").forEach((item) => item.classList.toggle("active", item === button));
    const completeView = button.dataset.missionView === "complete";
    const rows = completeView ? complete : active;
    target.querySelector("[data-mission-list]").innerHTML = rows.length ? rows.map(card).join("") : '<article class="mission-card"><h3>No missions in this view.</h3></article>';
  });
}

function render(missions, operations = []) {
  const normalizedMissions = missions.map((mission) => ({ ...mission, category: normalizeCategory(mission.category), progress: progress(mission) }));
  // Share the authoritative mission rows with Mission Control. This avoids a
  // race where the Command Center fetch completes before mission.js receives
  // its auth callback.
  window.AEGIS_MISSIONS = normalizedMissions;
  window.dispatchEvent(new CustomEvent("aegis:missions-loaded", {
    detail: { missions: normalizedMissions, source: "command-center" },
  }));
  renderMissionLedgerFallback(normalizedMissions);
  if (typeof window.AEGIS_RENDER_COMMAND_MISSIONS === "function") window.AEGIS_RENDER_COMMAND_MISSIONS(normalizedMissions, operations);
  const target = $("#command-missions") || document.querySelector("#command .mission-panel .mission-list");
  if (target) {
    target.id = "command-missions";
  }
  updateMetric("RECOVERY", normalizedMissions.find((mission) => mission.category === "Recovery"));
  updateMetric("TRADING PROCESS", normalizedMissions.find((mission) => mission.category === "Trading"));
}

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
