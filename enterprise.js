import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const PROJECT_XP = Object.freeze({ Minor: 20, Standard: 60, Major: 120, Flagship: 250 });
let projects = [], content = [], financialFoundation = null;

const projectReward = (project) => {
  if (project?.project_mode === "Ongoing system") return 0;
  const stored = Number(project?.xp_reward);
  return Number.isFinite(stored) && stored >= 0 ? stored : PROJECT_XP[project?.effort_band] || PROJECT_XP.Standard;
};

const projectMeta = (project) => {
  if (project?.project_mode === "Ongoing system") return "Ongoing system · completed releases earn their own XP";
  const hours = Number(project?.estimated_hours || 0);
  return `${project?.effort_band || "Standard"} · ${hours ? `${hours}+ hr` : "effort not estimated"} · ${projectReward(project)} XP on completion`;
};

function render() {
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const readyContent = content.filter((item) => item.status === "Ready").length;
  const published = content.filter((item) => item.status === "Published").length;
  const reserves = Number(financialFoundation?.liquid_reserves || 0);
  const expenses = Number(financialFoundation?.monthly_expenses || 0);
  const runway = expenses > 0 ? (reserves / expenses).toFixed(1) : "—";
  const finance = financialFoundation
    ? `<div class="enterprise-finance-grid"><span><b>$${reserves.toFixed(2)}</b><small>Liquid reserves</small></span><span><b>${runway}</b><small>Months runway</small></span><span><b>$${Number(financialFoundation.business_revenue || 0).toFixed(2)}</b><small>Business revenue</small></span><span><b>$${Number(financialFoundation.debt_balance || 0).toFixed(2)}</b><small>Debt balance</small></span></div><p class="enterprise-xp-note">+20 XP for recording the financial foundation baseline.</p>`
    : '<p class="enterprise-empty">Set the baseline that protects the mission from financial fragility.</p>';
  const projectList = projects.length
    ? projects.map((project) => `<article><div><strong>${escape(project.title)}</strong><small>${escape(project.project_type || "Real-world project")} · ${escape(project.priority)} · ${Number(project.progress || 0)}%</small><small>${escape(projectMeta(project))}</small>${project.next_action ? `<small>NEXT: ${escape(project.next_action)}</small>` : ""}${project.status === "Complete" && project.completion_evidence ? `<small>PROOF: ${escape(project.completion_evidence)}</small>` : ""}</div><span class="enterprise-status ${String(project.status || "").toLowerCase()}">${escape(project.status)}</span></article>`).join("")
    : '<p class="enterprise-empty">Open a finite project that creates a useful asset, capability, or service.</p>';
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">BUSINESS / SPECIAL PROJECTS</p><h2>Build assets that compound.</h2><p>Trading is the craft. Real projects and financial resilience are the enterprise.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>READY TO PUBLISH</p><strong>${readyContent}</strong><small>Content waiting for release</small></article><article class="metric"><p>PUBLISHED</p><strong>${published}</strong><small>Evidence of consistent output</small></article><article class="metric"><p>RUNWAY</p><strong>${runway}${runway === "—" ? "" : " mo"}</strong><small>Liquid reserves ÷ monthly expenses</small></article></div><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">01 - SPECIAL PROJECTS</p><h3>Finish useful milestones.</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projectList}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">02 - FINANCIAL FOUNDATION</p><h3>Protect the mission.</h3></div><button class="primary compact" data-enterprise-action="finance">${financialFoundation ? "Edit foundation" : "Set foundation"}</button></div>${finance}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">03 - CONTENT PIPELINE</p><h3>Signal, not noise.</h3></div><button class="primary compact" data-enterprise-action="content">+ New content</button></div><div class="enterprise-list">${content.length ? content.map((item) => `<article><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} - ${escape(item.status)}</small></div><span class="enterprise-status ${String(item.status || "").toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">One clear idea is enough to start the pipeline.</p>'}</div></section></div>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [projectResult, contentResult, foundationResult] = await Promise.all([
    supabase.from("business_projects").select("*").order("logged_on", { ascending: false }),
    supabase.from("content_items").select("*").order("logged_on", { ascending: false }),
    supabase.from("financial_foundations").select("*").maybeSingle(),
  ]);
  if (projectResult.error || contentResult.error) return;
  projects = projectResult.data || [];
  content = contentResult.data || [];
  financialFoundation = foundationResult.error ? null : foundationResult.data || null;
  render();
}

function syncProjectReward() {
  const mode = $("#project-mode")?.value || "Milestone";
  const band = $("#project-effort-band")?.value || "Standard";
  const reward = $("#project-xp-reward");
  if (!reward) return;
  reward.textContent = mode === "Ongoing system" ? "No terminal XP — complete finite releases instead." : `${PROJECT_XP[band]} XP when completion evidence is recorded.`;
}

function buildDialogs() {
  const dialogs = document.createElement("div");
  dialogs.innerHTML = `<dialog id="project-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW SPECIAL PROJECT</p><h2>Finish a useful milestone.</h2><label>Log date <input id="project-logged-on" type="date" required /></label><label>Project <input id="project-title" required placeholder="e.g. Aegis Command v1" /></label><div class="two-col"><label>Type <select id="project-type"><option>Real-world project</option><option>Aegis system</option><option>CCFX system</option><option>Business asset</option><option>Learning build</option></select></label><label>Mode <select id="project-mode"><option value="Milestone">Finite milestone</option><option value="Ongoing system">Ongoing system</option></select></label></div><div class="two-col"><label>Weight <select id="project-effort-band"><option value="Minor">Minor — 2–8 hr / 20 XP</option><option value="Standard" selected>Standard — 8–24 hr / 60 XP</option><option value="Major">Major — 24–80 hr / 120 XP</option><option value="Flagship">Flagship — 80+ hr / 250 XP</option></select></label><label>Estimated effort (hours) <input id="project-estimated-hours" type="number" min="1" max="10000" placeholder="e.g. 120" /></label></div><p class="enterprise-xp-note" id="project-xp-reward"></p><div class="two-col"><label>Priority <select id="project-priority"><option>Do now</option><option selected>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>Status <select id="project-status"><option>Active</option><option>Backlog</option><option>Complete</option></select></label></div><label>Progress % <input id="project-progress" type="number" min="0" max="100" value="0" /></label><label>Definition of done <textarea id="project-outcome" required placeholder="What must exist, work, or be delivered for this milestone to be complete?"></textarea></label><label>Completion evidence <textarea id="project-completion-evidence" placeholder="Link, deployment, delivered asset, result, or proof of completion."></textarea></label><label>Next physical action <input id="project-next-action" placeholder="The next visible step" /></label><label>Due date <input id="project-due" type="date" /></label><button class="primary" value="default">Open project</button></form></dialog><dialog id="content-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW CONTENT ITEM</p><h2>Ship a useful signal.</h2><label>Log date <input id="content-logged-on" type="date" required /></label><label>Working title <input id="content-title" required placeholder="e.g. The risk rule that protects a funded account" /></label><div class="two-col"><label>Platform <select id="content-platform"><option>YouTube</option><option>Instagram</option><option>X</option><option>Newsletter</option></select></label><label>Status <select id="content-status"><option>Idea</option><option>Drafting</option><option>Ready</option><option>Published</option></select></label></div><button class="primary" value="default">Add to pipeline</button></form></dialog><dialog id="finance-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">FINANCIAL FOUNDATION</p><h2>Protect the mission.</h2><label>Log date <input id="finance-logged-on" type="date" required /></label><div class="two-col"><label>Monthly income <input id="finance-income" type="number" min="0" step="0.01" /></label><label>Monthly expenses <input id="finance-expenses" type="number" min="0" step="0.01" /></label><label>Liquid reserves <input id="finance-reserves" type="number" min="0" step="0.01" /></label><label>Emergency fund target <input id="finance-emergency" type="number" min="0" step="0.01" /></label><label>Debt balance <input id="finance-debt" type="number" min="0" step="0.01" /></label><label>Business revenue / month <input id="finance-revenue" type="number" min="0" step="0.01" /></label></div><label>Notes <textarea id="finance-notes" placeholder="Rules, obligations, or the next financial priority."></textarea></label><button class="primary" value="default">Save foundation</button></form></dialog>`;
  document.body.append(...Array.from(dialogs.children));
  ["project", "content", "finance"].forEach((name) => { const input = $(`#${name}-logged-on`); if (input) input.value = easternDateKey(); });
  $("#project-mode")?.addEventListener("change", syncProjectReward);
  $("#project-effort-band")?.addEventListener("change", syncProjectReward);
  syncProjectReward();

  $("#project-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#project-title").value.trim();
    const projectMode = $("#project-mode").value;
    const status = $("#project-status").value;
    const completionEvidence = $("#project-completion-evidence").value.trim();
    if (!title) return;
    if (projectMode === "Ongoing system" && status === "Complete") return alert("An ongoing system does not complete. Create and complete a finite release instead.");
    if (projectMode === "Milestone" && status === "Complete" && !completionEvidence) return alert("Record completion evidence before closing a milestone.");
    const effortBand = $("#project-effort-band").value;
    const { error } = await supabase.from("business_projects").insert({
      logged_on: $("#project-logged-on").value || easternDateKey(),
      title,
      project_type: $("#project-type").value,
      project_mode: projectMode,
      effort_band: effortBand,
      estimated_hours: Number($("#project-estimated-hours").value) || null,
      xp_reward: projectMode === "Ongoing system" ? 0 : PROJECT_XP[effortBand],
      status,
      priority: $("#project-priority").value,
      progress: status === "Complete" ? 100 : Number($("#project-progress").value || 0),
      outcome: $("#project-outcome").value.trim(),
      completion_evidence: completionEvidence || null,
      next_action: $("#project-next-action").value.trim() || null,
      due_on: $("#project-due").value || null,
    });
    if (error) return alert(error.message);
    $("#project-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project" } }));
  });

  $("#content-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#content-title").value.trim();
    if (!title) return;
    const { error } = await supabase.from("content_items").insert({ logged_on: $("#content-logged-on").value || easternDateKey(), title, platform: $("#content-platform").value, status: $("#content-status").value });
    if (error) return alert(error.message);
    $("#content-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "content-item" } }));
  });

  $("#finance-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return alert("Sign in before saving your financial foundation.");
    const fields = { income: "monthly_income", expenses: "monthly_expenses", reserves: "liquid_reserves", emergency: "emergency_fund_target", debt: "debt_balance", revenue: "business_revenue" };
    const payload = Object.fromEntries(Object.entries(fields).map(([input, column]) => [column, Number($(`#finance-${input}`).value || 0)]));
    const { error } = await supabase.from("financial_foundations").upsert({ user_id: userId, logged_on: $("#finance-logged-on").value || easternDateKey(), ...payload, notes: $("#finance-notes").value.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return alert(error.message);
    $("#finance-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "financial-foundation" } }));
  });

  document.querySelectorAll("#project-dialog .dialog-close,#content-dialog .dialog-close,#finance-dialog .dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
}

if (supabase) {
  buildDialogs();
  render();
  load();
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction;
    if (!action) return;
    if (action === "project") $("#project-logged-on").value = easternDateKey();
    if (action === "content") $("#content-logged-on").value = easternDateKey();
    if (action === "finance") {
      $("#finance-logged-on").value = financialFoundation?.logged_on || easternDateKey();
      if (financialFoundation) {
        const fields = { income: "monthly_income", expenses: "monthly_expenses", reserves: "liquid_reserves", emergency: "emergency_fund_target", debt: "debt_balance", revenue: "business_revenue" };
        Object.entries(fields).forEach(([input, column]) => { $(`#finance-${input}`).value = financialFoundation[column] ?? ""; });
        $("#finance-notes").value = financialFoundation.notes || "";
      }
    }
    (action === "project" ? $("#project-dialog") : action === "finance" ? $("#finance-dialog") : $("#content-dialog")).showModal();
  });
  supabase.auth.onAuthStateChange((event) => { if (event !== "INITIAL_SESSION") setTimeout(load, 50); });
}

window.addEventListener("aegis:data-changed", (event) => {
  if (["remote-enterprise"].includes(event.detail?.source)) setTimeout(load, 120);
});
