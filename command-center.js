import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const icons = { Recovery: "+", Trading: "O", Business: "#", Mind: "*" };

function isMeasured(mission) { return mission.completion_type === "units" && Number(mission.target_count) > 0; }
function progress(mission) { return isMeasured(mission) ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission.completed ? 100 : 0; }
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

function render(missions, operations = []) {
  const target = $("#command-missions") || document.querySelector("#command .mission-panel .mission-list");
  if (target) {
    target.id = "command-missions";
    const priority = { "Do now": 0, Schedule: 1, Delegate: 2, Eliminate: 3 };
    const active = missions.filter((mission) => progress(mission) < 100).sort((a, b) => (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9) || progress(b) - progress(a)).slice(0, 3);
    target.innerHTML = active.length ? active.map((mission) => { const linked = operations.filter(operation => operation.mission_id === mission.id); const total = linked.length, complete = linked.filter(operation => operation.completed).length, operationProgress = total ? Math.round((complete / total) * 100) : progress(mission); const operationLabel = total ? `${complete} / ${total} operations complete` : label(mission); return `<article><div class="mission-icon ${iconClass(mission.category)}">${icons[mission.category] || "*"}</div><div class="command-mission-copy"><strong>${escape(mission.title)}</strong><small>${escape(mission.category)} - ${escape(mission.priority)}</small><div class="meter command-mission-meter"><i style="width:${operationProgress}%"></i></div><small>${operationLabel}</small></div><span>${operationProgress}%</span></article>`; }).join("") : '<article><div><strong>No active missions</strong><small>Open the next objective from Mission Control.</small></div></article>';
  }
  updateMetric("RECOVERY", missions.find((mission) => mission.category === "Recovery"));
  updateMetric("TRADING PROCESS", missions.find((mission) => mission.category === "Trading"));
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [missionsResult, operationsResult] = await Promise.all([supabase.from("missions").select("*").order("created_at", { ascending: false }), supabase.from("operations").select("mission_id, completed")]);
  if (!missionsResult.error) render(missionsResult.data || [], operationsResult.data || []);
}

if (supabase) {
  load();
  supabase.auth.onAuthStateChange(() => setTimeout(load, 80));
  window.addEventListener("aegis:missions-changed", () => setTimeout(load, 80));
  document.addEventListener("click", (event) => { if (event.target.closest("#save-mission, #mission-editor-dialog .primary")) setTimeout(load, 1200); });
}
