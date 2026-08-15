import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const PROJECT_XP = Object.freeze({ Minor: 10, Standard: 25, Major: 50, Flagship: 100 });
let projects = [], projectSteps = [], content = [], financialFoundation = null;

const isLegacyAegisTitle = (title) => ["created aegis", "create aegis"].includes(String(title || "").trim().toLowerCase());
const projectPriority = (priority) => ({ "do now": "Do now", delegate: "Delegate", eliminate: "Eliminate" }[String(priority || "").trim().toLowerCase()] || "Schedule");
const missionProject = (mission) => {
  const aegis = isLegacyAegisTitle(mission.title);
  const complete = Boolean(mission.completed) || Number(mission.progress || 0) >= 100;
  return {
    id: `mission:${mission.id}`,
    source_mission_id: mission.id,
    title: mission.title,
    status: complete ? "Complete" : "Active",
    priority: projectPriority(mission.priority),
    project_type: "Mission-backed project",
    project_mode: "Milestone",
    effort_band: aegis ? "Flagship" : "Standard",
    estimated_hours: aegis ? 120 : null,
    xp_reward: aegis ? 100 : 25,
    progress: Math.max(0, Math.min(100, Number(mission.progress || 0))),
    outcome: mission.completion_definition || mission.description || null,
    next_action: mission.completion_definition || null,
    completion_evidence: complete ? mission.completion_definition || "Mission completed." : null,
    _missionOnly: true,
  };
};

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
  const projectsById = new Map(projects.map((project) => [String(project.id), project]));
  const projectList = projects.length
    ? projects.map((project) => {
      const steps = projectSteps.filter((step) => String(step.project_id) === String(project.id));
      const completeSteps = steps.filter((step) => step.status === "Complete").length;
      const stepsLabel = steps.length ? `${completeSteps}/${steps.length} steps` : "No step list";
      const parent = project.parent_project_id ? projectsById.get(String(project.parent_project_id)) : null;
      const lineage = parent ? `<small class="enterprise-lineage">UPGRADE OF: ${escape(parent.title)}</small>` : "";
      return `<article><div><strong>${escape(project.title)}</strong><small>${escape(project.project_type || "Real-world project")} · ${escape(project.priority)} · ${Number(project.progress || 0)}% · ${stepsLabel}</small><small>${escape(projectMeta(project))}</small>${lineage}${project.next_action ? `<small>NEXT: ${escape(project.next_action)}</small>` : ""}${project.status === "Complete" && project.completion_evidence ? `<small>PROOF: ${escape(project.completion_evidence)}</small>` : ""}</div><div class="enterprise-project-actions">${project._missionOnly ? "" : `<button class="enterprise-upgrade" type="button" data-enterprise-upgrade="${escape(project.id)}">Upgrade</button>`}<span class="enterprise-status ${String(project.status || "").toLowerCase()}">${escape(project.status)}</span></div></article>`;
    }).join("")
    : '<p class="enterprise-empty">Open a finite project that creates a useful asset, capability, or service.</p>';
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">BUSINESS / SPECIAL PROJECTS</p><h2>Build assets that compound.</h2><p>Every Special Project has a Business mission; ordinary missions stay in Missions. Its ordered steps become the operations that advance it.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>READY TO PUBLISH</p><strong>${readyContent}</strong><small>Content waiting for release</small></article><article class="metric"><p>PUBLISHED</p><strong>${published}</strong><small>Evidence of consistent output</small></article><article class="metric"><p>RUNWAY</p><strong>${runway}${runway === "—" ? "" : " mo"}</strong><small>Liquid reserves ÷ monthly expenses</small></article></div><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">01 - SPECIAL PROJECTS</p><h3>Finish useful milestones.</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projectList}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">02 - FINANCIAL FOUNDATION</p><h3>Protect the mission.</h3></div><button class="primary compact" data-enterprise-action="finance">${financialFoundation ? "Edit foundation" : "Set foundation"}</button></div>${finance}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">03 - CONTENT PIPELINE</p><h3>Signal, not noise.</h3></div><button class="primary compact" data-enterprise-action="content">+ New content</button></div><div class="enterprise-list">${content.length ? content.map((item) => `<article><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} - ${escape(item.status)}</small></div><span class="enterprise-status ${String(item.status || "").toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">One clear idea is enough to start the pipeline.</p>'}</div></section></div>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [projectResult, stepResult, contentResult, foundationResult, missionResult] = await Promise.all([
    supabase.from("business_projects").select("*").order("logged_on", { ascending: false }),
    supabase.from("business_project_steps").select("*").order("project_id").order("position"),
    supabase.from("content_items").select("*").order("logged_on", { ascending: false }),
    supabase.from("financial_foundations").select("*").maybeSingle(),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
  ]);
  if (projectResult.error || contentResult.error) return;
  projectSteps = stepResult.error ? [] : stepResult.data || [];
  const storedProjects = (projectResult.data || []).map((project) => {
    const steps = projectSteps.filter((step) => String(step.project_id) === String(project.id));
    if (!steps.length) return project;
    const completeSteps = steps.filter((step) => step.status === "Complete").length;
    const next = steps.find((step) => step.status !== "Complete");
    return { ...project, progress: Math.round((completeSteps / steps.length) * 100), next_action: next?.title || null };
  });
  const missionOnlyProjects = (missionResult.error ? [] : missionResult.data || [])
    .filter((mission) => String(mission.category || "").toLowerCase() === "business" || isLegacyAegisTitle(mission.title))
    .filter((mission) => !storedProjects.some((project) => String(project.source_mission_id || "") === String(mission.id)))
    .map(missionProject);
  projects = [...storedProjects, ...missionOnlyProjects];
  content = contentResult.data || [];
  financialFoundation = foundationResult.error ? null : foundationResult.data || null;
  render();
}

const projectStepsFromInput = (value) => String(value || "").split(/\n+/).map((step) => step.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
const projectOperationPriority = (priority) => priority === "Do now" ? "High" : priority === "Schedule" ? "Medium" : "Low";
const projectStepOperationTitle = (project, step) => `${project.title} — ${step.title}`;

async function createProjectStepOperation(project, step) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Sign in before creating project operations.");
  const { data, error } = await supabase.from("operations").insert({
    user_id: userId, title: projectStepOperationTitle(project, step), category: "Business", priority: projectOperationPriority(project.priority),
    status: "Queued", completed: false, scheduled_date: easternDateKey(), operation_date: easternDateKey(), schedule_mode: "one_time",
    is_daily: false, mission_id: project.source_mission_id || null, allow_unlinked: !project.source_mission_id, brief: `Project step ${step.position}: ${step.title}`,
  }).select().single();
  if (error) throw error;
  const { error: stepError } = await supabase.from("business_project_steps").update({ operation_id: data.id, updated_at: new Date().toISOString() }).eq("id", step.id);
  if (stepError) throw stepError;
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "enterprise-project-step" } }));
  return data;
}

async function advanceProjectFromSteps(projectId) {
  const [{ data: project, error: projectError }, { data: steps, error: stepError }] = await Promise.all([
    supabase.from("business_projects").select("*").eq("id", projectId).single(),
    supabase.from("business_project_steps").select("*").eq("project_id", projectId).order("position"),
  ]);
  if (projectError || stepError || !project || !steps?.length) throw projectError || stepError || new Error("Project steps were not found.");
  const completed = steps.filter((step) => step.status === "Complete").length;
  const next = steps.find((step) => step.status !== "Complete");
  const allComplete = completed === steps.length;
  const update = { progress: Math.round((completed / steps.length) * 100), next_action: next?.title || null };
  if (allComplete && project.project_mode !== "Ongoing system") {
    update.status = "Complete";
    update.progress = 100;
    update.completion_evidence = project.completion_evidence || `All ${steps.length} defined project steps completed.`;
  } else if (project.status !== "Complete") update.status = "Active";
  const { error: updateError } = await supabase.from("business_projects").update(update).eq("id", project.id);
  if (updateError) throw updateError;
  if (next && !next.operation_id) await createProjectStepOperation(project, next);
  await load();
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project-progress" } }));
}

async function synchronizeProjectStep(operation) {
  const operationId = String(operation?._base?.id || operation?.id || "");
  if (!operationId || operationId.startsWith("local-") || operationId.startsWith("virtual:")) return;
  const { data: step, error } = await supabase.from("business_project_steps").select("*").eq("operation_id", operationId).maybeSingle();
  if (error || !step) return;
  const status = operation.completed || String(operation.status || "").toLowerCase() === "complete" ? "Complete" : String(operation.status || "").toLowerCase() === "ongoing" ? "Ongoing" : "Pending";
  const { error: updateError } = await supabase.from("business_project_steps").update({ status, completed_at: status === "Complete" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", step.id);
  if (updateError) return console.warn("Could not update project step", updateError.message);
  await advanceProjectFromSteps(step.project_id);
}

function syncProjectReward() {
  const mode = $("#project-mode")?.value || "Milestone";
  const band = $("#project-effort-band")?.value || "Standard";
  const reward = $("#project-xp-reward");
  if (reward) reward.textContent = mode === "Ongoing system" ? "No terminal XP — complete finite releases instead." : `${PROJECT_XP[band]} XP when the full step list is complete.`;
}

function openProjectDialog(parent = null) {
  $("#project-dialog form").reset();
  $("#project-logged-on").value = easternDateKey();
  $("#project-parent-id").value = parent?.id || "";
  $("#project-dialog .eyebrow").textContent = parent ? "NEW LINKED RELEASE" : "NEW SPECIAL PROJECT";
  $("#project-dialog h2").textContent = parent ? "Ship a focused upgrade." : "Finish a useful milestone.";
  $("#project-submit").textContent = parent ? "Open linked release and first operation" : "Open project and first operation";
  $("#project-parent-context").textContent = parent ? `UPGRADE OF: ${parent.title}. This is its own finite project with separate XP; the original stays unchanged.` : "";
  if (parent) {
    $("#project-title").value = `${parent.title} — Upgrade`;
    $("#project-type").value = parent.project_type || "Real-world project";
    $("#project-effort-band").value = parent.effort_band || "Standard";
    $("#project-estimated-hours").value = parent.estimated_hours || "";
    $("#project-priority").value = parent.priority || "Schedule";
  }
  syncProjectReward();
  $("#project-dialog").showModal();
}

function buildDialogs() {
  const dialogs = document.createElement("div");
  dialogs.innerHTML = `<dialog id="project-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW SPECIAL PROJECT</p><h2>Finish a useful milestone.</h2><input id="project-parent-id" type="hidden" /><p class="enterprise-parent-context" id="project-parent-context" aria-live="polite"></p><label>Log date <input id="project-logged-on" type="date" required /></label><label>Project <input id="project-title" required placeholder="e.g. Aegis Command v2" /></label><div class="two-col"><label>Type <select id="project-type"><option>Real-world project</option><option>Aegis system</option><option>CCFX system</option><option>Business asset</option><option>Learning build</option></select></label><label>Mode <select id="project-mode"><option value="Milestone">Finite milestone</option><option value="Ongoing system">Ongoing system</option></select></label></div><div class="two-col"><label>Weight <select id="project-effort-band"><option value="Minor">Minor — 2–8 hr / 10 XP</option><option value="Standard" selected>Standard — 8–24 hr / 25 XP</option><option value="Major">Major — 24–80 hr / 50 XP</option><option value="Flagship">Flagship — 80+ hr / 100 XP</option></select></label><label>Estimated effort (hours) <input id="project-estimated-hours" type="number" min="1" max="10000" placeholder="e.g. 120" /></label></div><p class="enterprise-xp-note" id="project-xp-reward"></p><label>Priority <select id="project-priority"><option>Do now</option><option selected>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>Definition of done <textarea id="project-outcome" required placeholder="What must exist, work, or be delivered for this milestone to be complete?"></textarea></label><label>Project steps — one per line <textarea id="project-steps" required placeholder="Deploy the first usable version&#10;Verify login and saved data&#10;Run a production walkthrough"></textarea></label><p class="body-copy">Only the next incomplete step enters Operations. Project progress is completed steps ÷ total steps, and the project closes automatically when every step is complete.</p><label>Due date <input id="project-due" type="date" /></label><button class="primary" id="project-submit" value="default">Open project and first operation</button></form></dialog><dialog id="content-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW CONTENT ITEM</p><h2>Ship a useful signal.</h2><label>Log date <input id="content-logged-on" type="date" required /></label><label>Working title <input id="content-title" required placeholder="e.g. The risk rule that protects a funded account" /></label><div class="two-col"><label>Platform <select id="content-platform"><option>YouTube</option><option>Instagram</option><option>X</option><option>Newsletter</option></select></label><label>Status <select id="content-status"><option>Idea</option><option>Drafting</option><option>Ready</option><option>Published</option></select></label></div><button class="primary" value="default">Add to pipeline</button></form></dialog><dialog id="finance-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">FINANCIAL FOUNDATION</p><h2>Protect the mission.</h2><label>Log date <input id="finance-logged-on" type="date" required /></label><div class="two-col"><label>Monthly income <input id="finance-income" type="number" min="0" step="0.01" /></label><label>Monthly expenses <input id="finance-expenses" type="number" min="0" step="0.01" /></label><label>Liquid reserves <input id="finance-reserves" type="number" min="0" step="0.01" /></label><label>Emergency fund target <input id="finance-emergency" type="number" min="0" step="0.01" /></label><label>Debt balance <input id="finance-debt" type="number" min="0" step="0.01" /></label><label>Business revenue / month <input id="finance-revenue" type="number" min="0" step="0.01" /></label></div><label>Notes <textarea id="finance-notes" placeholder="Rules, obligations, or the next financial priority."></textarea></label><button class="primary" value="default">Save foundation</button></form></dialog>`;
  document.body.append(...Array.from(dialogs.children));
  ["project", "content", "finance"].forEach((name) => { const input = $(`#${name}-logged-on`); if (input) input.value = easternDateKey(); });
  $("#project-mode")?.addEventListener("change", syncProjectReward);
  $("#project-effort-band")?.addEventListener("change", syncProjectReward);
  syncProjectReward();

  $("#project-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#project-title").value.trim();
    const projectMode = $("#project-mode").value;
    const steps = projectStepsFromInput($("#project-steps").value);
    if (!title || !steps.length) return alert("Add at least one ordered project step.");
    const effortBand = $("#project-effort-band").value;
    const loggedOn = $("#project-logged-on").value || easternDateKey();
    const priority = $("#project-priority").value;
    const outcome = $("#project-outcome").value.trim();
    const { data: mission, error: missionError } = await supabase.from("missions").insert({
      title,
      category: "Business",
      priority,
      completion_type: "units",
      completion_definition: outcome,
      unit_label: "project step",
      target_count: steps.length,
      completed_count: 0,
      completed: false,
      progress: 0,
      description: `Special Project · ${$("#project-type").value} · ${projectMode}`,
    }).select().single();
    if (missionError) return alert(`Project mission could not be created: ${missionError.message}`);
    const { data: project, error } = await supabase.from("business_projects").insert({
      logged_on: loggedOn, title, project_type: $("#project-type").value, project_mode: projectMode,
      effort_band: effortBand, estimated_hours: Number($("#project-estimated-hours").value) || null, xp_reward: projectMode === "Ongoing system" ? 0 : PROJECT_XP[effortBand],
      status: "Active", priority, progress: 0, outcome, next_action: steps[0], due_on: $("#project-due").value || null,
      parent_project_id: $("#project-parent-id").value || null, source_mission_id: mission.id,
    }).select().single();
    if (error) {
      await supabase.from("missions").delete().eq("id", mission.id);
      return alert(error.message);
    }
    const { data: savedSteps, error: stepError } = await supabase.from("business_project_steps").insert(steps.map((step, index) => ({ project_id: project.id, title: step, position: index + 1 }))).select();
    if (stepError) return alert(stepError.message);
    try { await createProjectStepOperation(project, savedSteps.find((step) => step.position === 1)); }
    catch (operationError) { return alert(`Project created, but the first operation could not be created: ${operationError.message}`); }
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
    const upgradeId = event.target.closest("[data-enterprise-upgrade]")?.dataset.enterpriseUpgrade;
    if (upgradeId) return openProjectDialog(projects.find((project) => String(project.id) === String(upgradeId)) || null);
    const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction;
    if (!action) return;
    if (action === "project") return openProjectDialog();
    if (action === "content") $("#content-logged-on").value = easternDateKey();
    if (action === "finance") {
      $("#finance-logged-on").value = financialFoundation?.logged_on || easternDateKey();
      if (financialFoundation) {
        const fields = { income: "monthly_income", expenses: "monthly_expenses", reserves: "liquid_reserves", emergency: "emergency_fund_target", debt: "debt_balance", revenue: "business_revenue" };
        Object.entries(fields).forEach(([input, column]) => { $(`#finance-${input}`).value = financialFoundation[column] ?? ""; });
        $("#finance-notes").value = financialFoundation.notes || "";
      }
    }
    (action === "finance" ? $("#finance-dialog") : $("#content-dialog")).showModal();
  });
  supabase.auth.onAuthStateChange((event) => { if (event !== "INITIAL_SESSION") setTimeout(load, 50); });
}

window.addEventListener("aegis:data-changed", (event) => {
  if (["remote-enterprise"].includes(event.detail?.source)) setTimeout(load, 120);
  if (event.detail?.source === "operation-status" && event.detail.operation) void synchronizeProjectStep(event.detail.operation).catch((error) => console.warn("Project step sync failed", error));
});
