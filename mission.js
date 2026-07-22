import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const $ = selector => document.querySelector(selector);
const escape = value => { const el = document.createElement("span"); el.textContent = value; return el.innerHTML; };
let client = null;
let session = null;
let missions = [];

function renderMissions() {
  const target = $("#mission-cards");
  if (!target) return;
  target.innerHTML = missions.length ? missions.map(mission => `<article class="mission-card"><span class="eyebrow amber">${escape(mission.priority)}</span><h3>${escape(mission.title)}</h3><p>${escape(mission.category)} mission · ${mission.progress}% complete</p><div class="meter"><i style="width:${mission.progress}%"></i></div></article>`).join("") : '<article class="mission-card"><span class="eyebrow amber">MISSION CONTROL</span><h3>No active missions yet.</h3><p>Open the few objectives that matter now.</p></article>';
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
    const seeds = [{ title: "Restore ACL capacity", category: "Recovery", priority: "Non-negotiable", progress: 72 }, { title: "Execute trading process", category: "Trading", priority: "Non-negotiable", progress: 86 }, { title: "Build Clarified Chaos FX foundation", category: "Business", priority: "Strategic", progress: 41 }];
    const { data, error } = await client.from("missions").insert(seeds).select();
    if (error) { console.error(error); return; }
    missions = data;
  }
  renderMissions();
  const { data: logs } = await client.from("recovery_logs").select("*").order("logged_on", { ascending: false }).limit(1);
  renderRecovery(logs?.[0]);
}

function closeButtons() { document.querySelectorAll("#mission-dialog .dialog-close,#recovery-dialog .dialog-close").forEach(button => button.addEventListener("click", () => button.closest("dialog").close())); }
function bindDialogs() {
  const missionDialog = $("#mission-dialog"), recoveryDialog = $("#recovery-dialog");
  document.querySelectorAll('[data-action="add-mission"]').forEach(button => button.addEventListener("click", () => { if (!session) return alert("Sign in before opening a mission."); missionDialog.showModal(); }));
  $("#save-mission").addEventListener("click", async event => { const title = $("#mission-title").value.trim(); if (!title) return event.preventDefault(); const { data, error } = await client.from("missions").insert({ title, category: $("#mission-category").value, priority: $("#mission-priority").value, progress: Number($("#mission-progress").value || 0) }).select().single(); if (error) { event.preventDefault(); return console.error(error); } missions.unshift(data); renderMissions(); $("#mission-title").value = ""; });
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
