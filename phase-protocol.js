import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const db = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);

const phases = [
  {
    id: 0, code: "PHASE 0", title: "Recovery", label: "ACTIVE PROTOCOL",
    mandate: "Rebuild the foundation. Protect capital. Improve one deliberate action at a time.",
    focus: "ACL recovery evidence, clinician guidance, calm trading process, and daily consistency.",
    unlock: "Sports and Performance remain locked. Recovery stays visible.",
    evidence: ["Orthopedic assessment or clinician-directed return plan is in place.", "Recovery mission has a clear evidence-based finish line—not an arbitrary percentage.", "You can follow the prescribed plan without unresolved warning signs."],
    gate: null
  },
  {
    id: 1, code: "PHASE I", title: "Recruit", label: "NEXT PROTOCOL",
    mandate: "Build the habits and baseline capability that make discipline dependable.",
    focus: "Recovery-safe training, disciplined trading execution, useful study, and durable daily systems.",
    unlock: "Sports and Performance can be considered after Recovery is complete and you approve archiving it.",
    evidence: ["Recovery completion has been confirmed with the appropriate clinician guidance.", "A consistent training and recovery rhythm is sustainable.", "Trading and operations are being logged honestly and reviewed weekly."],
    gate: { discipline: 7, trading: 4, mind: 9, body: 5 }
  },
  {
    id: 2, code: "PHASE II", title: "Apprentice", label: "FUTURE PROTOCOL",
    mandate: "Train the systems until reliable execution becomes your default.",
    focus: "Verified trading process, stronger physical capacity, Special Projects execution, and deliberate skill-building.",
    unlock: "Higher-intensity performance goals and structured business growth become available.",
    evidence: ["Your core routines remain stable under normal life pressure.", "Trading decisions are supported by enough logged evidence to review objectively.", "You have a clear project system and ship consistently."],
    gate: { discipline: 15, trading: 11, mind: 18, body: 12 }
  },
  {
    id: 3, code: "PHASE III", title: "Vigilante", label: "FUTURE PROTOCOL",
    mandate: "Turn stable capability into a wider, calmer operating range under pressure.",
    focus: "Trading maturity, durable athletic capacity, Special Projects systems, and leadership under pressure.",
    unlock: "The system emphasizes scale through proof: more responsibility, never more chaos.",
    evidence: ["Your core routines stay intact through high-demand periods.", "Your trading review identifies repeatable strengths and mistakes with enough sample size.", "Projects, health, and capital are progressing without one area consuming the others."],
    gate: { discipline: 24, trading: 18, mind: 29, body: 23 }
  },
  {
    id: 4, code: "PHASE IV", title: "Legend", label: "LONG-TERM PROTOCOL",
    mandate: "Maintain capability. Compound judgment. Build a life that holds its standard.",
    focus: "Long-term health, financial resilience, leadership, contribution, and continuous refinement.",
    unlock: "The system shifts from unlocking basics to protecting and improving high standards.",
    evidence: ["This phase is ongoing: review annually, refine deliberately, and avoid needless escalation."],
    gate: { discipline: 34, trading: 26, mind: 40, body: 34 }
  }
];

let currentPhase = 0;

function currentLevels() {
  try { return JSON.parse(localStorage.getItem("aegis-character-levels") || "{}"); }
  catch { return {}; }
}

function gateRows(phase) {
  if (!phase.gate) return "<span class=\"phase-gate-clear\">No level gate — evidence review remains required.</span>";
  const levels = currentLevels();
  return Object.entries(phase.gate).map(([key, requirement]) => {
    const actual = Number(levels[key] || 0);
    return `<span class="${actual >= requirement ? "met" : ""}">${key.replace("ccfx", "CCFX").replace(/^./, character => character.toUpperCase())} LV ${actual} / ${requirement}</span>`;
  }).join("");
}

function gateMet(phase) {
  return !phase.gate || Object.entries(phase.gate).every(([key, requirement]) => Number(currentLevels()[key] || 0) >= requirement);
}

function dispatchPhase() {
  localStorage.setItem("aegis-active-phase", String(currentPhase));
  window.dispatchEvent(new CustomEvent("aegis:phase-changed", { detail: { phase: currentPhase } }));
}

function render() {
  const target = $("#phase-protocol");
  if (!target) return;
  const active = phases[currentPhase];
  const next = phases[currentPhase + 1];
  target.innerHTML = `
    <div class="phase-protocol-head">
      <div><p class="eyebrow amber">PHASE PROTOCOL</p><h3>${active.code} — ${active.title}</h3></div>
      <span class="phase-state">${active.label}</span>
    </div>
    <div class="phase-protocol-body">
      <div class="phase-main"><p>${active.mandate}</p><small>${active.focus}</small></div>
      <div class="phase-unlock"><span>STATUS</span><p>${active.unlock}</p></div>
    </div>
    <div class="phase-track" aria-label="Campaign phases">${phases.map((phase) => `<button type="button" class="phase-node ${phase.id === currentPhase ? "active" : ""} ${phase.id < currentPhase ? "complete" : ""}" data-phase-info="${phase.id}"><small>${phase.code}</small><strong>${phase.title}</strong></button>`).join("")}</div>
    ${next ? `<div class="phase-level-gate"><span>LEVEL GATE FOR ${next.code}</span><div>${gateRows(next)}</div></div>` : ""}
    <div class="phase-actions"><button class="text-button" type="button" data-phase-info="${currentPhase}">View current evidence</button>${next ? `<button class="primary compact" type="button" data-phase-review>Review for ${next.code}</button>` : `<span class="phase-complete">Long-term protocol active</span>`}</div>`;
}

function openReview(phaseId) {
  const phase = phases[phaseId];
  const dialog = $("#phase-review-dialog");
  $("#phase-review-title").textContent = phaseId > currentPhase ? `Advance to ${phase.code} — ${phase.title}?` : `${phase.code} — ${phase.title}`;
  const eligible = phaseId === currentPhase + 1 && gateMet(phase);
  $("#phase-review-copy").textContent = phaseId > currentPhase ? (eligible ? "Level gate met. Advancement is evidence-based and still requires your explicit confirmation. This does not automatically remove Recovery." : "The level gate is not met yet. Keep logging real work; review remains available so you can see exactly what is required.") : phase.mandate;
  $("#phase-evidence-list").innerHTML = phase.evidence.map((item) => `<div><span>◇</span>${item}</div>`).join("");
  const confirm = $("#phase-review-confirmed");
  const action = $("#confirm-phase-advance");
  confirm.checked = false;
  const advance = phaseId === currentPhase + 1 && eligible;
  confirm.closest("label").hidden = !advance;
  action.hidden = !advance;
  action.textContent = `Advance to ${phase.code}`;
  dialog.dataset.targetPhase = String(phaseId);
  dialog.showModal();
}

async function persistPhase(nextPhase) {
  if (!db) { currentPhase = nextPhase; dispatchPhase(); render(); return; }
  const { data: sessionData } = await db.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return alert("Sign in before changing your active phase.");
  const { error } = await db.from("phase_protocols").upsert({ user_id: userId, active_phase: nextPhase, advanced_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return alert(`Phase could not be updated: ${error.message}`);
  currentPhase = nextPhase;
  dispatchPhase(); render();
}

async function load() {
  currentPhase = Number(localStorage.getItem("aegis-active-phase") || 0);
  if (db) {
    const { data: sessionData } = await db.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (userId) {
      const { data, error } = await db.from("phase_protocols").select("active_phase").eq("user_id", userId).maybeSingle();
      if (!error && data) currentPhase = Number(data.active_phase) || 0;
      if (!error && !data) await db.from("phase_protocols").insert({ user_id: userId, active_phase: 0 });
    }
  }
  dispatchPhase(); render();
}

document.addEventListener("click", (event) => {
  const close = event.target.closest("#phase-review-dialog .dialog-close");
  if (close) return $("#phase-review-dialog").close();
  const review = event.target.closest("[data-phase-review]");
  if (review) return openReview(currentPhase + 1);
  const info = event.target.closest("[data-phase-info]");
  if (info) return openReview(Number(info.dataset.phaseInfo));
  const confirm = event.target.closest("#confirm-phase-advance");
  if (confirm) {
    const dialog = $("#phase-review-dialog");
    const target = Number(dialog.dataset.targetPhase);
    if (!$("#phase-review-confirmed").checked) return alert("Confirm that the evidence is true before advancing.");
    persistPhase(target).then(() => dialog.close());
  }
});

load();
if (db) db.auth.onAuthStateChange(() => setTimeout(load, 100));
window.addEventListener("aegis:character-levels-changed", render);
