import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const $ = selector => document.querySelector(selector);
const escape = value => { const el = document.createElement("span"); el.textContent = value; return el.innerHTML; };
let client = null;
let session = null;
let missions = [];
const eisenhowerOptions = '<option value="Do now">DO NOW — important + urgent</option><option value="Schedule">SCHEDULE — important + not urgent</option><option value="Delegate">DELEGATE — urgent + not important</option><option value="Eliminate">ELIMINATE — not urgent + not important</option>';

function renderMissions() {
  const target = $("#mission-cards");
  if (!target) return;
  target.innerHTML = missions.length ? missions.map(mission => `<button class="mission-card mission-open" data-mission-id="${mission.id}"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${mission.progress}% complete</p><div class="meter"><i style="width:${mission.progress}%"></i></div><small>Click to update</small></button>`).join("") : '<article class="mission-card"><span class="eyebrow amber">MISSION CONTROL</span><h3>No active missions yet.</h3><p>Open the few objectives that matter now.</p></article>';
}

function renderCommandMissions() {
  const target = $("#command-missions") || document.querySelector("#command .mission-panel .mission-list");
  if (!target) return;
  target.id = "command-missions";
  const priority = { "Do now": 0, Schedule: 1, Delegate: 2, Eliminate: 3 };
  const active = missions.filter(mission => Number(mission.progress) < 100).sort((a, b) => (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9) || b.progress - a.progress).slice(0, 3);
  const icon = category => category === "Recovery" ? "＋" : category === "Trading" ? "◈" : category === "Business" ? "▦" : "◇";
  const iconClass = category => category === "Recovery" ? "recovery-icon" : category === "Trading" ? "trade-icon" : "business-icon";
  target.innerHTML = active.length ? active.map(mission => `<article><div class="mission-icon ${iconClass(mission.category)}">${icon(mission.category)}</div><div><strong>${escape(mission.title)}</strong><small>${escape(mission.category)} - ${escape(mission.priority)}</small></div><span>${mission.progress}%</span></article>`).join("") : '<article><div><strong>No active missions</strong><small>Open the next objective from Mission Control.</small></div></article>';
}

function publishMissionChange() {
  window.dispatchEvent(new Event("aegis:missions-changed"));
}

function syncRecoveryVisibility() {
  const recoveryNav = document.querySelector("[data-recovery-nav]");
  if (!recoveryNav) return;
  const recoveryMissions = missions.filter(mission => mission.category === "Recovery");
  const recoveryIsActive = recoveryMissions.some(mission => Number(mission.progress) < 100);
  if (recoveryIsActive || !recoveryMissions.length) { localStorage.removeItem("aegis-recovery-archived"); recoveryNav.hidden = false; return; }
  if (localStorage.getItem("aegis-recovery-archived") === "yes") { recoveryNav.hidden = true; return; }
  const approved = window.confirm("Recovery has reached 100%. Archive the Recovery section from navigation? You can bring it back later if needed.");
  recoveryNav.hidden = approved;
  if (approved) localStorage.setItem("aegis-recovery-archived", "yes");
  if (approved && location.hash === "#recovery") location.hash = "#missions";
}

function renderRecovery(log) {
  const state = $("#recovery-state"), summary = $("#recovery-summary");
  if (!state || !summary) return;
  if (!log) { state.textContent = "—"; summary.innerHTML = '<div><span>No recovery reports logged yet.</span><b>Awaiting data</b></div>'; return; }
  state.textContent = log.rehab_completed ? "DONE" : "LOGGED";
  summary.innerHTML = `<div><span>Pain level</span><b>${log.pain}/10</b></div><div><span>Swelling</span><b>${log.swelling}/10</b></div><div><span>Prescribed rehab</span><b>${log.rehab_completed ? "Complete" : "Pending"}</b></div>`;
}

async function loadData() {
  const { data: missionData, error: missionError } = await client.from("missions").select("*").order("created_at", { ascending: false });
  if (missionError) { console.error(missionError); return; }
  if (missionData.length) missions = missionData;
  else {
    const seeds = [{ title: "Restore ACL capacity", category: "Recovery", priority: "Do now", progress: 72 }, { title: "Execute trading process", category: "Trading", priority: "Do now", progress: 86 }, { title: "Build Clarified Chaos FX foundation", category: "Business", priority: "Schedule", progress: 41 }];
    const { data, error } = await client.from("missions").insert(seeds).select();
    if (error) { console.error(error); return; }
    missions = data;
  }
  renderMissions();
  renderCommandMissions();
  publishMissionChange();
  syncRecoveryVisibility();
  const { data: logs } = await client.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1);
  renderRecovery(logs?.[0]);
}

function closeButtons() { document.querySelectorAll("#mission-dialog .dialog-close,#recovery-dialog .dialog-close").forEach(button => button.addEventListener("click", () => button.closest("dialog").close())); }
function buildMissionEditor() {
  const dialog = document.createElement("dialog");
  dialog.id = "mission-editor-dialog";
  dialog.innerHTML = `<form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">MISSION CONTROL</p><h2>Update the objective.</h2><label>Mission <input id="edit-mission-title" required /></label><label>Priority <select id="edit-mission-priority">${eisenhowerOptions}</select></label><label>Progress <input id="edit-mission-progress" type="number" min="0" max="100" required /></label><button class="primary" value="default">Save mission</button></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async event => {
    event.preventDefault();
    const mission = missions.find(item => item.id === dialog.dataset.missionId);
    const title = $("#edit-mission-title").value.trim(), progress = Number($("#edit-mission-progress").value), priority = $("#edit-mission-priority").value;
    if (!mission || !title || progress < 0 || progress > 100) return;
    const { data, error } = await client.from("missions").update({ title, progress, priority }).eq("id", mission.id).select().single();
    if (error) return alert(`Mission could not be updated: ${error.message}`);
    missions = missions.map(item => item.id === data.id ? data : item);
    dialog.close();
    renderMissions();
    renderCommandMissions();
    publishMissionChange();
    syncRecoveryVisibility();
  });
  return dialog;
}
function bindDialogs() {
  const missionDialog = $("#mission-dialog"), recoveryDialog = $("#recovery-dialog");
  $("#mission-priority").innerHTML = eisenhowerOptions;
  const editor = buildMissionEditor();
  document.addEventListener("click", event => {
    const button = event.target.closest(".mission-open");
    if (!button || !session) return;
    const mission = missions.find(item => item.id === button.dataset.missionId);
    if (!mission) return;
    editor.dataset.missionId = mission.id;
    $("#edit-mission-title").value = mission.title;
    $("#edit-mission-priority").value = ["Do now", "Schedule", "Delegate", "Eliminate"].includes(mission.priority) ? mission.priority : "Schedule";
    $("#edit-mission-progress").value = mission.progress;
    editor.showModal();
  });
  document.querySelectorAll('[data-action="add-mission"]').forEach(button => button.addEventListener("click", () => { if (!session) return alert("Sign in before opening a mission."); missionDialog.showModal(); }));
  $("#save-mission").addEventListener("click", async event => { const title = $("#mission-title").value.trim(); if (!title) return event.preventDefault(); const { data, error } = await client.from("missions").insert({ title, category: $("#mission-category").value, priority: $("#mission-priority").value, progress: Number($("#mission-progress").value || 0) }).select().single(); if (error) { event.preventDefault(); return console.error(error); } missions.unshift(data); renderMissions(); renderCommandMissions(); publishMissionChange(); $("#mission-title").value = ""; });
  document.querySelectorAll('[data-action="log-recovery"]').forEach(button => button.addEventListener("click", () => { if (!session) return alert("Sign in before logging recovery."); recoveryDialog.showModal(); }));
  $("#save-recovery").addEventListener("click", async event => { const pain = Number($("#recovery-pain").value), swelling = Number($("#recovery-swelling").value); if (!Number.isInteger(pain) || !Number.isInteger(swelling) || pain < 0 || pain > 10 || swelling < 0 || swelling > 10) return event.preventDefault(); const { data, error } = await client.from("recovery_logs").insert({ pain, swelling, rehab_completed: $("#recovery-rehab").checked, notes: $("#recovery-notes").value.trim() }).select().single(); if (error) { event.preventDefault(); return console.error(error); } renderRecovery(data); $("#recovery-notes").value = ""; });
}

if (cloudReady) {
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  ({ data: { session } } = await client.auth.getSession());
  if (session) await loadData();
  client.auth.onAuthStateChange(async (_event, nextSession) => { session = nextSession; if (session) await loadData(); });
}
closeButtons(); bindDialogs(); renderMissions(); renderRecovery();
