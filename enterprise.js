import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const PROJECT_XP = Object.freeze({ Minor: 10, Standard: 25, Major: 50, Flagship: 100 });
let projects = [], projectSteps = [], content = [], financialFoundation = null, capitalEntries = [], businessAssets = [], accountBalances = [];
let activeEnterpriseTab = "projects";
let projectOperationRepairInFlight = false;

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

const money = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const capitalChange = (entry) => ["Expense", "Capital withdrawal"].includes(String(entry.entry_type || "")) ? -Number(entry.amount_usd || 0) : Number(entry.amount_usd || 0);
const capitalTotal = () => capitalEntries.reduce((total, entry) => total + capitalChange(entry), 0);
const accountName = (accountId) => accountBalances.find((account) => String(account.id) === String(accountId))?.account_name || "Unlinked account";

function enterpriseTabs() {
  return `<div class="enterprise-tabs" role="tablist" aria-label="Enterprise HQ areas">${[["projects", "Projects"], ["capital", "Capital"], ["assets", "Assets"]].map(([id, label]) => `<button type="button" class="enterprise-tab ${activeEnterpriseTab === id ? "active" : ""}" role="tab" aria-selected="${activeEnterpriseTab === id}" data-enterprise-tab="${id}">${label}</button>`).join("")}</div>`;
}

function capitalPanel() {
  const total = capitalTotal();
  const earned = capitalEntries.filter((entry) => entry.entry_type === "Account earning").reduce((sum, entry) => sum + Number(entry.amount_usd || 0), 0);
  const spent = capitalEntries.filter((entry) => entry.entry_type === "Expense").reduce((sum, entry) => sum + Number(entry.amount_usd || 0), 0);
  const ledger = capitalEntries.length ? capitalEntries.map((entry) => {
    const change = capitalChange(entry);
    const account = entry.account_id ? `<small>LINKED ACCOUNT: ${escape(accountName(entry.account_id))}</small>` : "";
    return `<article class="enterprise-ledger-row"><div><strong>${escape(entry.title)}</strong><small>${escape(entry.entry_type)} · ${escape(entry.entry_date || "")}</small>${account}${entry.notes ? `<small>${escape(entry.notes)}</small>` : ""}</div><div class="enterprise-ledger-actions"><b class="${change < 0 ? "negative" : "positive"}">${change < 0 ? "−" : "+"}${money(Math.abs(change))}</b><button class="enterprise-edit" type="button" data-capital-edit="${escape(entry.id)}">Edit</button><button class="enterprise-remove" type="button" data-capital-remove="${escape(entry.id)}">Remove</button></div></article>`;
  }).join("") : '<p class="enterprise-empty">No capital movements recorded. Add the first prop-firm challenge fee or account earning.</p>';
  return `<div class="enterprise-tab-panel"><div class="enterprise-tab-heading"><div><p class="eyebrow amber">CAPITAL LEDGER</p><h3>What the enterprise can deploy.</h3><p class="body-copy">Account earnings add capital. Challenge fees and every other expense reduce it.</p></div><button class="primary compact" type="button" data-enterprise-action="capital">+ Record movement</button></div><div class="enterprise-capital-metrics"><article><small>NET CAPITAL</small><strong class="${total < 0 ? "negative" : ""}">${money(total)}</strong><span>Recorded inflows − outflows</span></article><article><small>ACCOUNT EARNINGS</small><strong>${money(earned)}</strong><span>Explicitly allocated from accounts</span></article><article><small>BUSINESS EXPENSES</small><strong class="negative">${money(spent)}</strong><span>Challenge fees and operating costs</span></article></div><section class="panel enterprise-ledger"><div class="panel-head"><div><p class="eyebrow">MOVEMENT HISTORY</p><h3>Capital in motion.</h3></div><span class="status-pill muted">${capitalEntries.length} ENTRIES</span></div>${ledger}</section></div>`;
}

function assetsPanel() {
  const manualValue = businessAssets.reduce((sum, asset) => sum + Number(asset.current_value_usd || 0), 0);
  const assets = businessAssets.length ? businessAssets.map((asset) => `<article class="enterprise-ledger-row"><div><strong>${escape(asset.title)}${asset.symbol ? ` (${escape(asset.symbol)})` : ""}</strong><small>${escape(asset.asset_type)} · acquired ${escape(asset.acquired_on || "")}</small>${asset.quantity != null ? `<small>QUANTITY: ${escape(asset.quantity)}</small>` : ""}${asset.notes ? `<small>${escape(asset.notes)}</small>` : ""}</div><div class="enterprise-ledger-actions"><b>${money(asset.current_value_usd)}</b><button class="enterprise-edit" type="button" data-asset-edit="${escape(asset.id)}">Edit</button><button class="enterprise-remove" type="button" data-asset-remove="${escape(asset.id)}">Remove</button></div></article>`).join("") : '<p class="enterprise-empty">No owned assets registered yet. Crypto, equity, cash holdings, and business assets all belong here.</p>';
  const contentAssets = content.length ? content.map((item) => `<article class="enterprise-ledger-row enterprise-content-asset"><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} · ${escape(item.status)}</small></div><span class="enterprise-status ${String(item.status || "").toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">No content assets captured yet.</p>';
  return `<div class="enterprise-tab-panel"><div class="enterprise-tab-heading"><div><p class="eyebrow amber">OWNED ASSETS</p><h3>Build and protect what you own.</h3><p class="body-copy">Track investable holdings and durable business assets separately from deployable Capital.</p></div><button class="primary compact" type="button" data-enterprise-action="asset">+ Add asset</button></div><div class="enterprise-capital-metrics"><article><small>TRACKED ASSET VALUE</small><strong>${money(manualValue)}</strong><span>Manual valuation, updated by you</span></article><article><small>REGISTERED ASSETS</small><strong>${businessAssets.length}</strong><span>Crypto, equity, cash, and business assets</span></article><article><small>CONTENT ASSETS</small><strong>${content.length}</strong><span>Existing content pipeline records</span></article></div><section class="panel enterprise-ledger"><div class="panel-head"><div><p class="eyebrow">ASSET REGISTER</p><h3>Things the enterprise owns.</h3></div><span class="status-pill muted">${businessAssets.length} TRACKED</span></div>${assets}</section><section class="panel enterprise-ledger enterprise-content-ledger"><div class="panel-head"><div><p class="eyebrow">CONTENT ASSETS</p><h3>Published signal and works in progress.</h3></div><button class="ghost compact" type="button" data-enterprise-action="content">+ New content</button></div>${contentAssets}</section></div>`;
}

function projectCard(project, releases = [], nested = false) {
  const steps = projectSteps.filter((step) => String(step.project_id) === String(project.id));
  const completeSteps = steps.filter((step) => step.status === "Complete").length;
  const stepsLabel = steps.length ? `${completeSteps}/${steps.length} steps` : "No step list";
  const controls = project._missionOnly ? "" : `
    <button class="enterprise-edit" type="button" data-enterprise-edit="${escape(project.id)}">Edit</button>
    ${project.status === "Complete" ? "" : `<button class="enterprise-operation" type="button" data-enterprise-operation="${escape(project.id)}">Add operation</button>`}
    ${nested ? "" : `<button class="enterprise-upgrade" type="button" data-enterprise-upgrade="${escape(project.id)}">Upgrade</button>`}
    <button class="enterprise-remove" type="button" data-enterprise-remove="${escape(project.id)}">Remove</button>`;
  const releaseLedger = !nested && (project.project_mode === "Ongoing system" || releases.length)
    ? `<section class="enterprise-release-ledger"><p class="eyebrow">RELEASE LEDGER · ${releases.length}</p>${releases.length ? releases.map((release) => projectCard(release, [], true)).join("") : '<p class="enterprise-empty">No linked releases yet. Add an upgrade when the system needs a focused improvement.</p>'}</section>`
    : "";
  return `<article class="enterprise-project ${nested ? "enterprise-release" : ""}"><div><strong>${escape(project.title)}</strong><small>${escape(project.project_type || "Real-world project")} · ${escape(project.priority)} · ${Number(project.progress || 0)}% · ${stepsLabel}</small><small>${escape(projectMeta(project))}</small>${project.next_action ? `<small>NEXT: ${escape(project.next_action)}</small>` : ""}${project.status === "Complete" && project.completion_evidence ? `<small>PROOF: ${escape(project.completion_evidence)}</small>` : ""}</div><div class="enterprise-project-actions">${controls}<span class="enterprise-status ${String(project.status || "").toLowerCase()}">${escape(project.status)}</span></div>${releaseLedger}</article>`;
}

function render() {
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const readyContent = content.filter((item) => item.status === "Ready").length;
  const published = content.filter((item) => item.status === "Published").length + projects.filter((project) => project.status === "Complete").length;
  const emergencyTarget = Number(financialFoundation?.emergency_fund_target || 0);
  const debtBalance = Number(financialFoundation?.debt_balance || 0);
  const finance = financialFoundation
    ? `<div class="enterprise-finance-grid"><span><b>${money(emergencyTarget)}</b><small>Emergency fund target</small></span><span><b>${money(debtBalance)}</b><small>Debt balance</small></span></div><p class="enterprise-xp-note">Capital tracks deployable money. This baseline tracks the reserve you are protecting.</p>`
    : '<p class="enterprise-empty">Set the emergency-fund target and debt baseline you want the enterprise to protect.</p>';
  const projectsById = new Map(projects.map((project) => [String(project.id), project]));
  const rootProjects = projects.filter((project) => !project.parent_project_id || !projectsById.has(String(project.parent_project_id)));
  const projectList = rootProjects.length
    ? rootProjects.map((project) => projectCard(project, projects.filter((candidate) => String(candidate.parent_project_id || "") === String(project.id)))).join("")
    : '<p class="enterprise-empty">Open a finite project that creates a useful asset, capability, or service.</p>';
  const projectsPanel = `<div class="enterprise-tab-panel"><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">PROJECTS</p><h3>Finish useful milestones.</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projectList}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">FINANCIAL FOUNDATION</p><h3>Protect the mission.</h3></div><button class="primary compact" data-enterprise-action="finance">${financialFoundation ? "Edit foundation" : "Set foundation"}</button></div>${finance}</section></div></div>`;
  const panel = activeEnterpriseTab === "capital" ? capitalPanel() : activeEnterpriseTab === "assets" ? assetsPanel() : projectsPanel;
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">ENTERPRISE HQ / CCFX</p><h2>Build what you own.</h2><p>Projects create assets. Capital funds the next move. The ledger keeps both honest.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>NET CAPITAL</p><strong>${money(capitalTotal())}</strong><small>Recorded inflows − outflows</small></article><article class="metric"><p>OWNED ASSETS</p><strong>${businessAssets.length}</strong><small>Crypto and durable holdings</small></article><article class="metric"><p>EMERGENCY TARGET</p><strong>${emergencyTarget ? money(emergencyTarget) : "—"}</strong><small>Personal reserve to protect</small></article></div>${enterpriseTabs()}${panel}`;
  return;
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">BUSINESS / SPECIAL PROJECTS</p><h2>Build assets that compound.</h2><p>Every Special Project has a Business mission; ordinary missions stay in Missions. Its ordered steps become the operations that advance it.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>READY TO PUBLISH</p><strong>${readyContent}</strong><small>Content waiting for release</small></article><article class="metric"><p>PUBLISHED</p><strong>${published}</strong><small>Released content + completed projects</small></article><article class="metric"><p>RUNWAY</p><strong>${runway}${runway === "—" ? "" : " mo"}</strong><small>Liquid reserves ÷ monthly expenses</small></article></div><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">01 - SPECIAL PROJECTS</p><h3>Finish useful milestones.</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projectList}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">02 - FINANCIAL FOUNDATION</p><h3>Protect the mission.</h3></div><button class="primary compact" data-enterprise-action="finance">${financialFoundation ? "Edit foundation" : "Set foundation"}</button></div>${finance}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">03 - CONTENT PIPELINE</p><h3>Signal, not noise.</h3></div><button class="primary compact" data-enterprise-action="content">+ New content</button></div><div class="enterprise-list">${content.length ? content.map((item) => `<article><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} - ${escape(item.status)}</small></div><span class="enterprise-status ${String(item.status || "").toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">One clear idea is enough to start the pipeline.</p>'}</div></section></div>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  let [projectResult, stepResult, contentResult, foundationResult, missionResult, capitalResult, assetResult, accountResult] = await Promise.all([
    supabase.from("business_projects").select("*").order("logged_on", { ascending: false }),
    supabase.from("business_project_steps").select("*").order("project_id").order("position"),
    supabase.from("content_items").select("*").order("logged_on", { ascending: false }),
    supabase.from("financial_foundations").select("*").maybeSingle(),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_capital_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("business_assets").select("*").order("acquired_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("account_balances").select("id, account_name, account_type").order("account_name"),
  ]);
  if (projectResult.error) {
    projectResult = await supabase.from("business_projects").select("*").order("created_at", { ascending: false });
    if (projectResult.error) projectResult = await supabase.from("business_projects").select("*");
  }
  if (contentResult.error) {
    contentResult = await supabase.from("content_items").select("*").order("created_at", { ascending: false });
    if (contentResult.error) contentResult = await supabase.from("content_items").select("*");
  }
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
    .filter((mission) => !storedProjects.some((project) => String(project.source_mission_id || "") === String(mission.id) || (isLegacyAegisTitle(mission.title) && isLegacyAegisTitle(project.title))))
    .map(missionProject);
  projects = [...storedProjects, ...missionOnlyProjects];
  content = contentResult.data || [];
  financialFoundation = foundationResult.error ? null : foundationResult.data || null;
  capitalEntries = capitalResult.error ? [] : capitalResult.data || [];
  businessAssets = assetResult.error ? [] : assetResult.data || [];
  accountBalances = accountResult.error ? [] : accountResult.data || [];
  render();
  void repairMissingProjectOperations();
}

const projectStepsFromInput = (value) => String(value || "").split(/\n+/).map((step) => step.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
const projectOperationPriority = (priority) => priority === "Do now" ? "High" : priority === "Schedule" ? "Medium" : "Low";
const projectStepOperationTitle = (project, step) => `${project.title} — ${step.title}`;

async function createProjectStepOperation(project, step, scheduledDate = easternDateKey()) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Sign in before creating project operations.");
  const payload = {
    user_id: userId, title: projectStepOperationTitle(project, step), category: "Business", priority: projectOperationPriority(project.priority),
    status: "Queued", completed: false, scheduled_date: scheduledDate, operation_date: scheduledDate, schedule_mode: "one_time",
    is_daily: false, mission_id: project.source_mission_id || null, allow_unlinked: !project.source_mission_id, brief: `Project step ${step.position}: ${step.title}`,
  };
  let { data, error } = await supabase.from("operations").insert(payload).select().single();
  // Some established AEGIS databases predate operations.priority. Priority
  // remains on the project, while the operation safely uses that older shape.
  if (error && /priority.*(?:column|schema cache)|(?:column|schema cache).*priority/i.test(String(error.message || ""))) {
    delete payload.priority;
    ({ data, error } = await supabase.from("operations").insert(payload).select().single());
  }
  if (error) throw error;
  const { error: stepError } = await supabase.from("business_project_steps").update({ operation_id: data.id, updated_at: new Date().toISOString() }).eq("id", step.id);
  if (stepError) throw stepError;
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "enterprise-project-step" } }));
  return data;
}

async function repairMissingProjectOperations() {
  if (projectOperationRepairInFlight || !supabase) return;
  const repairable = projects
    .filter((project) => !project._missionOnly && project.status !== "Complete")
    .map((project) => ({ project, step: projectSteps.find((step) => String(step.project_id) === String(project.id) && step.status !== "Complete" && !step.operation_id) }))
    .filter(({ step }) => step);
  if (!repairable.length) return;
  projectOperationRepairInFlight = true;
  try {
    await Promise.all(repairable.map(({ project, step }) => createProjectStepOperation(project, step)));
    await load();
  } catch (error) {
    console.warn("Could not repair a project step operation", error.message);
  } finally {
    projectOperationRepairInFlight = false;
  }
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

function projectBranch(projectId) {
  const ids = new Set([String(projectId)]);
  let changed = true;
  while (changed) {
    changed = false;
    projects.forEach((project) => {
      if (ids.has(String(project.parent_project_id || "")) && !ids.has(String(project.id))) {
        ids.add(String(project.id));
        changed = true;
      }
    });
  }
  return [...ids];
}

async function removeProject(projectId) {
  const project = projects.find((item) => String(item.id) === String(projectId));
  if (!project || project._missionOnly) return;
  const branchIds = projectBranch(project.id);
  const releaseCount = Math.max(0, branchIds.length - 1);
  const message = releaseCount
    ? `Remove “${project.title}” and its ${releaseCount} linked release${releaseCount === 1 ? "" : "s"}? Their steps, generated operations, and linked project missions will also be removed.`
    : `Remove “${project.title}”? Its steps, generated operations, and linked project mission will also be removed.`;
  if (!window.confirm(message)) return;
  const branchProjects = projects.filter((item) => branchIds.includes(String(item.id)));
  const branchSteps = projectSteps.filter((step) => branchIds.includes(String(step.project_id)));
  const operationIds = branchSteps.map((step) => step.operation_id).filter(Boolean);
  const missionIds = branchProjects.map((item) => item.source_mission_id).filter(Boolean);
  if (operationIds.length) {
    const { error } = await supabase.from("operations").delete().in("id", operationIds);
    if (error) return alert(`Project removal stopped: ${error.message}`);
  }
  const { error: projectError } = await supabase.from("business_projects").delete().in("id", branchIds);
  if (projectError) return alert(`Project removal stopped: ${projectError.message}`);
  if (missionIds.length) {
    const { error } = await supabase.from("missions").delete().in("id", missionIds);
    if (error) console.warn("Project removed, but a linked mission could not be removed", error.message);
  }
  await load();
  window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project-remove" } }));
}

function openProjectOperationDialog(project) {
  if (!project || project._missionOnly || project.status === "Complete") return;
  const dialog = $("#project-operation-dialog");
  if (!dialog) return;
  dialog.dataset.projectId = project.id;
  $("#project-operation-project").value = project.title;
  $("#project-operation-title").value = "";
  $("#project-operation-date").value = easternDateKey();
  dialog.showModal();
}

async function extendProjectMissionForStep(project) {
  if (!project.source_mission_id) return;
  const { data: mission, error: readError } = await supabase.from("missions")
    .select("id,target_count,completed_count")
    .eq("id", project.source_mission_id)
    .maybeSingle();
  if (readError || !mission) return;
  const target = Math.max(1, Number(mission.target_count || 1)) + 1;
  const completed = Math.max(0, Math.min(target, Number(mission.completed_count || 0)));
  const { error } = await supabase.from("missions").update({
    target_count: target,
    completed: completed >= target,
    progress: Math.round((completed / target) * 100),
  }).eq("id", mission.id);
  if (error) throw error;
}

async function rollBackProjectMissionStep(project) {
  if (!project.source_mission_id) return;
  const { data: mission } = await supabase.from("missions")
    .select("id,target_count,completed_count")
    .eq("id", project.source_mission_id)
    .maybeSingle();
  if (!mission) return;
  const target = Math.max(1, Number(mission.target_count || 1) - 1);
  const completed = Math.max(0, Math.min(target, Number(mission.completed_count || 0)));
  await supabase.from("missions").update({ target_count: target, completed: completed >= target, progress: Math.round((completed / target) * 100) }).eq("id", mission.id);
}

async function syncProjectMissionTarget(project, targetCount) {
  if (!project.source_mission_id) return;
  const { data: mission, error: readError } = await supabase.from("missions")
    .select("id,completed_count")
    .eq("id", project.source_mission_id)
    .maybeSingle();
  if (readError || !mission) return;
  const target = Math.max(1, targetCount);
  const completed = Math.max(0, Math.min(target, Number(mission.completed_count || 0)));
  const { error } = await supabase.from("missions").update({
    target_count: target,
    completed_count: completed,
    completed: completed >= target,
    progress: Math.round((completed / target) * 100),
  }).eq("id", mission.id);
  if (error) throw error;
}

async function saveProjectSteps(project, desiredTitles) {
  const existing = projectSteps
    .filter((step) => String(step.project_id) === String(project.id))
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
  if (!desiredTitles.length) throw new Error("Add at least one ordered project step.");
  if (new Set(desiredTitles.map((title) => title.toLowerCase())).size !== desiredTitles.length) {
    throw new Error("Each project step needs a unique title so its linked operation can be kept in sync.");
  }

  const changedCompleted = existing.some((step, index) => step.status === "Complete" && index < desiredTitles.length && step.title !== desiredTitles[index]);
  const removedCompleted = existing.slice(desiredTitles.length).some((step) => step.status === "Complete");
  if (changedCompleted || removedCompleted) {
    throw new Error("Completed project steps are kept as history. Leave them unchanged; you can still edit, add, or remove pending steps.");
  }

  // Match unchanged step titles first, regardless of position. This makes a
  // middle-step removal delete that step's operation instead of renaming it
  // into the following step and deleting an unrelated operation at the end.
  const assignments = new Array(desiredTitles.length).fill(null);
  const unmatched = new Set(existing);
  existing.forEach((step, index) => {
    if (step.status === "Complete") {
      assignments[index] = step;
      unmatched.delete(step);
    }
  });
  desiredTitles.forEach((title, index) => {
    if (assignments[index]) return;
    const exact = [...unmatched].find((step) => step.status !== "Complete" && step.title === title);
    if (exact) {
      assignments[index] = exact;
      unmatched.delete(exact);
    }
  });
  const additions = [];
  desiredTitles.forEach((title, index) => {
    if (assignments[index]) return;
    const replacement = [...unmatched].find((step) => step.status !== "Complete" && Number(step.position || 0) === index + 1)
      || [...unmatched].find((step) => step.status !== "Complete");
    if (replacement) {
      assignments[index] = replacement;
      unmatched.delete(replacement);
    } else additions.push({ title, position: index + 1 });
  });
  const removed = [...unmatched];
  const removedOperationIds = removed.map((step) => step.operation_id).filter(Boolean);
  if (removedOperationIds.length) {
    const { error } = await supabase.from("operations").delete().in("id", removedOperationIds);
    if (error) throw error;
  }
  if (removed.length) {
    const { error } = await supabase.from("business_project_steps").delete().in("id", removed.map((step) => step.id));
    if (error) throw error;
  }

  for (const [index, step] of assignments.entries()) {
    if (!step) continue;
    const title = desiredTitles[index];
    const changed = step.title !== title || Number(step.position) !== index + 1;
    if (!changed) continue;
    const { error: stepError } = await supabase.from("business_project_steps").update({ title, position: index + 1, updated_at: new Date().toISOString() }).eq("id", step.id);
    if (stepError) throw stepError;
    if (step.operation_id) {
      const { error: operationError } = await supabase.from("operations").update({
        title: projectStepOperationTitle(project, { title }),
        brief: `Project step ${index + 1}: ${title}`,
      }).eq("id", step.operation_id);
      if (operationError) throw operationError;
    }
  }

  if (additions.length) {
    const { error } = await supabase.from("business_project_steps").insert(additions.map(({ title, position }) => ({
      project_id: project.id,
      title,
      position,
    })));
    if (error) throw error;
  }
  await syncProjectMissionTarget(project, desiredTitles.length);
  await advanceProjectFromSteps(project.id);
  window.dispatchEvent(new CustomEvent("aegis:operations-changed", { detail: { source: "enterprise-project-step-edit" } }));
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
  $("#project-edit-id").value = "";
  $("#project-parent-id").value = parent?.id || "";
  $("#project-steps").disabled = false;
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

function openProjectEditor(project) {
  $("#project-dialog form").reset();
  $("#project-edit-id").value = project.id;
  $("#project-parent-id").value = "";
  $("#project-logged-on").value = project.logged_on || easternDateKey();
  $("#project-title").value = project.title || "";
  $("#project-type").value = project.project_type || "Real-world project";
  $("#project-mode").value = project.project_mode || "Milestone";
  $("#project-effort-band").value = project.effort_band || "Standard";
  $("#project-estimated-hours").value = project.estimated_hours || "";
  $("#project-priority").value = project.priority || "Schedule";
  $("#project-outcome").value = project.outcome || "";
  $("#project-due").value = project.due_on || "";
  const savedSteps = projectSteps.filter((step) => String(step.project_id) === String(project.id)).map((step) => step.title);
  $("#project-steps").value = savedSteps.join("\n");
  $("#project-steps").disabled = project.status === "Complete";
  $("#project-dialog .eyebrow").textContent = "EDIT SPECIAL PROJECT";
  $("#project-dialog h2").textContent = "Refine the existing project.";
  $("#project-submit").textContent = "Save project";
  $("#project-parent-context").textContent = project.status === "Complete"
    ? "Completed projects keep their recorded step sequence. Create an upgrade for the next release."
    : "Edit the step sequence here. Completed steps are locked as history; pending steps can be renamed, added, or removed.";
  syncProjectReward();
  $("#project-dialog").showModal();
}

function openCapitalDialog(entry = null) {
  const form = $("#capital-dialog form");
  form.reset();
  form.dataset.editId = entry?.id || "";
  $("#capital-date").value = entry?.entry_date || easternDateKey();
  $("#capital-account").innerHTML = `<option value="">No linked account</option>${accountBalances.map((account) => `<option value="${escape(account.id)}">${escape(account.account_name)} · ${escape(account.account_type || "Account")}</option>`).join("")}`;
  if (entry) {
    $("#capital-type").value = entry.entry_type || "Expense";
    $("#capital-amount").value = entry.amount_usd ?? "";
    $("#capital-title").value = entry.title || "";
    $("#capital-account").value = entry.account_id || "";
    $("#capital-notes").value = entry.notes || "";
  }
  $("#capital-dialog .eyebrow").textContent = entry ? "EDIT CAPITAL MOVEMENT" : "CAPITAL MOVEMENT";
  $("#capital-dialog h2").textContent = entry ? "Correct the money flow." : "Record the money flow.";
  $("#capital-dialog button[type=submit]").textContent = entry ? "Save movement" : "Record movement";
  $("#capital-dialog").showModal();
}

function openAssetDialog(asset = null) {
  const form = $("#asset-dialog form");
  form.reset();
  form.dataset.editId = asset?.id || "";
  $("#asset-date").value = asset?.acquired_on || easternDateKey();
  if (asset) {
    $("#asset-type").value = asset.asset_type || "Other";
    $("#asset-symbol").value = asset.symbol || "";
    $("#asset-title").value = asset.title || "";
    $("#asset-quantity").value = asset.quantity ?? "";
    $("#asset-cost").value = asset.cost_basis_usd ?? "";
    $("#asset-value").value = asset.current_value_usd ?? "";
    $("#asset-notes").value = asset.notes || "";
  }
  $("#asset-dialog .eyebrow").textContent = asset ? "EDIT OWNED ASSET" : "OWNED ASSET";
  $("#asset-dialog h2").textContent = asset ? "Correct the asset record." : "Register what you own.";
  $("#asset-dialog button[type=submit]").textContent = asset ? "Save asset" : "Add asset";
  $("#asset-dialog").showModal();
}

function buildDialogs() {
  const dialogs = document.createElement("div");
  dialogs.innerHTML = `<dialog id="project-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW SPECIAL PROJECT</p><h2>Finish a useful milestone.</h2><input id="project-edit-id" type="hidden" /><input id="project-parent-id" type="hidden" /><p class="enterprise-parent-context" id="project-parent-context" aria-live="polite"></p><label>Log date <input id="project-logged-on" type="date" required /></label><label>Project <input id="project-title" required placeholder="e.g. Aegis Command v2" /></label><div class="two-col"><label>Type <select id="project-type"><option>Real-world project</option><option>Aegis system</option><option>CCFX system</option><option>Business asset</option><option>Learning build</option></select></label><label>Mode <select id="project-mode"><option value="Milestone">Finite milestone</option><option value="Ongoing system">Ongoing system</option></select></label></div><div class="two-col"><label>Weight <select id="project-effort-band"><option value="Minor">Minor — 2–8 hr / 10 XP</option><option value="Standard" selected>Standard — 8–24 hr / 25 XP</option><option value="Major">Major — 24–80 hr / 50 XP</option><option value="Flagship">Flagship — 80+ hr / 100 XP</option></select></label><label>Estimated effort (hours) <input id="project-estimated-hours" type="number" min="1" max="10000" placeholder="e.g. 120" /></label></div><p class="enterprise-xp-note" id="project-xp-reward"></p><label>Priority <select id="project-priority"><option>Do now</option><option selected>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>Definition of done <textarea id="project-outcome" required placeholder="What must exist, work, or be delivered for this milestone to be complete?"></textarea></label><label>Project steps — one per line <textarea id="project-steps" required placeholder="Deploy the first usable version&#10;Verify login and saved data&#10;Run a production walkthrough"></textarea></label><p class="body-copy">Only the next incomplete step enters Operations. Project progress is completed steps ÷ total steps, and the project closes automatically when every step is complete.</p><label>Due date <input id="project-due" type="date" /></label><button class="primary" id="project-submit" value="default">Open project and first operation</button></form></dialog><dialog id="content-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">NEW CONTENT ITEM</p><h2>Ship a useful signal.</h2><label>Log date <input id="content-logged-on" type="date" required /></label><label>Working title <input id="content-title" required placeholder="e.g. The risk rule that protects a funded account" /></label><div class="two-col"><label>Platform <select id="content-platform"><option>YouTube</option><option>Instagram</option><option>X</option><option>Newsletter</option></select></label><label>Status <select id="content-status"><option>Idea</option><option>Drafting</option><option>Ready</option><option>Published</option></select></label></div><button class="primary" value="default">Add to pipeline</button></form></dialog><dialog id="finance-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">FINANCIAL FOUNDATION</p><h2>Protect the mission.</h2><label>Log date <input id="finance-logged-on" type="date" required /></label><div class="two-col"><label>Monthly income <input id="finance-income" type="number" min="0" step="0.01" /></label><label>Monthly expenses <input id="finance-expenses" type="number" min="0" step="0.01" /></label><label>Liquid reserves <input id="finance-reserves" type="number" min="0" step="0.01" /></label><label>Emergency fund target <input id="finance-emergency" type="number" min="0" step="0.01" /></label><label>Debt balance <input id="finance-debt" type="number" min="0" step="0.01" /></label><label>Business revenue / month <input id="finance-revenue" type="number" min="0" step="0.01" /></label></div><label>Notes <textarea id="finance-notes" placeholder="Rules, obligations, or the next financial priority."></textarea></label><button class="primary" value="default">Save foundation</button></form></dialog>`;
  document.body.append(...Array.from(dialogs.children));
  const ledgerDialogs = document.createElement("div");
  ledgerDialogs.innerHTML = `<dialog id="capital-dialog"><form class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">CAPITAL MOVEMENT</p><h2>Record the money flow.</h2><label>Date <input id="capital-date" type="date" required /></label><div class="two-col"><label>Movement <select id="capital-type"><option>Account earning</option><option>Capital added</option><option>Expense</option><option>Capital withdrawal</option></select></label><label>Amount (USD) <input id="capital-amount" type="number" min="0.01" step="0.01" required /></label></div><label>Purpose <input id="capital-title" required placeholder="e.g. Apex Trader Funding 50K challenge" /></label><label>Source account <select id="capital-account"><option value="">No linked account</option></select></label><p class="body-copy">Use a linked account only when this is an account earning. Expenses and capital withdrawals subtract from net Capital.</p><label>Notes <textarea id="capital-notes" placeholder="Optional context"></textarea></label><button class="primary" type="submit">Record movement</button></form></dialog><dialog id="asset-dialog"><form class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">OWNED ASSET</p><h2>Register what you own.</h2><label>Acquired on <input id="asset-date" type="date" required /></label><div class="two-col"><label>Asset type <select id="asset-type"><option>Crypto</option><option>Business asset</option><option>Equity</option><option>Cash</option><option>Other</option></select></label><label>Symbol (optional) <input id="asset-symbol" maxlength="24" placeholder="BTC" /></label></div><label>Asset <input id="asset-title" required placeholder="e.g. Bitcoin" /></label><div class="two-col"><label>Quantity (optional) <input id="asset-quantity" type="number" min="0" step="any" /></label><label>Cost basis (USD) <input id="asset-cost" type="number" min="0" step="0.01" /></label><label>Current value (USD) <input id="asset-value" type="number" min="0" step="0.01" /></label></div><label>Notes <textarea id="asset-notes" placeholder="Wallet, broker, or ownership details"></textarea></label><button class="primary" type="submit">Add asset</button></form></dialog>`;
  document.body.append(...Array.from(ledgerDialogs.children));
  // Capital is the variable ledger for trading and business. The foundation
  // only holds the stable personal safeguards, not assumed monthly income.
  ["finance-income", "finance-expenses", "finance-reserves", "finance-revenue"].forEach((id) => $(`#${id}`)?.closest("label")?.remove());
  Array.from($("#asset-type")?.options || []).find((option) => option.value === "Cash")?.remove();
  $("#finance-dialog .eyebrow").textContent = "FINANCIAL BASELINE";
  $("#finance-dialog h2").textContent = "Protect the reserve.";
  $("#finance-dialog button[type=submit]").textContent = "Save baseline";
  const projectOperationDialog = document.createElement("dialog");
  projectOperationDialog.id = "project-operation-dialog";
  projectOperationDialog.innerHTML = `<form class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">×</button><p class="eyebrow amber">PROJECT OPERATION</p><h2>Add a concrete next action.</h2><label>Project <input id="project-operation-project" disabled /></label><label>Operation <input id="project-operation-title" required placeholder="What needs to happen?" /></label><label>Schedule date <input id="project-operation-date" type="date" required /></label><p class="body-copy">This is added to the project’s step ledger and the Operations Queue.</p><button class="primary" type="submit">Add operation</button></form>`;
  document.body.append(projectOperationDialog);
  ["project", "content", "finance"].forEach((name) => { const input = $(`#${name}-logged-on`); if (input) input.value = easternDateKey(); });
  ["capital-date", "asset-date"].forEach((id) => { const input = $(`#${id}`); if (input) input.value = easternDateKey(); });
  $("#project-mode")?.addEventListener("change", syncProjectReward);
  $("#project-effort-band")?.addEventListener("change", syncProjectReward);
  syncProjectReward();

  projectOperationDialog.querySelector(".dialog-close")?.addEventListener("click", () => projectOperationDialog.close());
  projectOperationDialog.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const project = projects.find((item) => String(item.id) === String(projectOperationDialog.dataset.projectId));
    const title = $("#project-operation-title").value.trim();
    if (!project || !title) return;
    const position = Math.max(0, ...projectSteps.filter((step) => String(step.project_id) === String(project.id)).map((step) => Number(step.position || 0))) + 1;
    const { data: step, error: stepError } = await supabase.from("business_project_steps")
      .insert({ project_id: project.id, title, position })
      .select()
      .single();
    if (stepError) return alert(`Project operation could not be added: ${stepError.message}`);
    let missionExtended = false;
    try {
      await extendProjectMissionForStep(project);
      missionExtended = true;
      await createProjectStepOperation(project, step, $("#project-operation-date").value || easternDateKey());
    } catch (error) {
      await supabase.from("business_project_steps").delete().eq("id", step.id);
      if (missionExtended) await rollBackProjectMissionStep(project);
      return alert(`Project operation could not be created: ${error.message}`);
    }
    projectOperationDialog.close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project-operation" } }));
  });

  $("#project-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#project-title").value.trim();
    const projectMode = $("#project-mode").value;
    const effortBand = $("#project-effort-band").value;
    const loggedOn = $("#project-logged-on").value || easternDateKey();
    const priority = $("#project-priority").value;
    const outcome = $("#project-outcome").value.trim();
    const editProjectId = $("#project-edit-id").value;
    if (!title) return alert("Add a project title.");
    if (editProjectId) {
      const original = projects.find((project) => String(project.id) === String(editProjectId));
      if (!original) return alert("This project is no longer available. Refresh and try again.");
      const steps = projectStepsFromInput($("#project-steps").value);
      if (!steps.length) return alert("Add at least one ordered project step.");
      const projectUpdate = {
        logged_on: loggedOn, title, project_type: $("#project-type").value, project_mode: projectMode,
        effort_band: effortBand, estimated_hours: Number($("#project-estimated-hours").value) || null,
        xp_reward: projectMode === "Ongoing system" ? 0 : PROJECT_XP[effortBand], priority, outcome,
        due_on: $("#project-due").value || null,
      };
      const { error: projectError } = await supabase.from("business_projects").update(projectUpdate).eq("id", editProjectId);
      if (projectError) return alert(projectError.message);
      if (original.source_mission_id) {
        const { error: missionError } = await supabase.from("missions").update({ title, priority, completion_definition: outcome || null, description: `Special Project · ${$("#project-type").value} · ${projectMode}` }).eq("id", original.source_mission_id);
        if (missionError) console.warn("Project saved, but its linked mission could not be updated", missionError.message);
      }
      try {
        await saveProjectSteps({ ...original, ...projectUpdate }, steps);
      } catch (stepError) {
        return alert(`Project details saved, but its steps could not be updated: ${stepError.message}`);
      }
      $("#project-dialog").close();
      await load();
      window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project-edit" } }));
      return;
    }
    const steps = projectStepsFromInput($("#project-steps").value);
    if (!steps.length) return alert("Add at least one ordered project step.");
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
    const payload = {
      emergency_fund_target: Number($("#finance-emergency").value || 0),
      debt_balance: Number($("#finance-debt").value || 0),
    };
    const { error } = await supabase.from("financial_foundations").upsert({ user_id: userId, logged_on: $("#finance-logged-on").value || easternDateKey(), ...payload, notes: $("#finance-notes").value.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return alert(error.message);
    $("#finance-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "financial-foundation" } }));
  });
  $("#capital-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return alert("Sign in before recording capital.");
    const amount = Number($("#capital-amount").value);
    const title = $("#capital-title").value.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !title) return alert("Add a purpose and an amount greater than zero.");
    const payload = { entry_date: $("#capital-date").value || easternDateKey(), entry_type: $("#capital-type").value, title, amount_usd: amount, account_id: $("#capital-account").value || null, notes: $("#capital-notes").value.trim() || null };
    const editId = form.dataset.editId;
    const { error } = editId
      ? await supabase.from("business_capital_entries").update(payload).eq("id", editId).eq("user_id", userId)
      : await supabase.from("business_capital_entries").insert({ user_id: userId, ...payload });
    if (error) return alert(`Capital movement could not be saved: ${error.message}`);
    $("#capital-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-capital" } }));
  });
  $("#asset-dialog form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return alert("Sign in before registering an asset.");
    const title = $("#asset-title").value.trim();
    if (!title) return alert("Add an asset name.");
    const numberOrNull = (selector) => { const value = $(selector).value; return value === "" ? null : Number(value); };
    const payload = { acquired_on: $("#asset-date").value || easternDateKey(), asset_type: $("#asset-type").value, title, symbol: $("#asset-symbol").value.trim().toUpperCase() || null, quantity: numberOrNull("#asset-quantity"), cost_basis_usd: numberOrNull("#asset-cost"), current_value_usd: numberOrNull("#asset-value"), notes: $("#asset-notes").value.trim() || null };
    const editId = form.dataset.editId;
    const { error } = editId
      ? await supabase.from("business_assets").update(payload).eq("id", editId).eq("user_id", userId)
      : await supabase.from("business_assets").insert({ user_id: userId, ...payload });
    if (error) return alert(`Asset could not be saved: ${error.message}`);
    $("#asset-dialog").close();
    await load();
    window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-asset" } }));
  });
  document.querySelectorAll("#project-dialog .dialog-close,#content-dialog .dialog-close,#finance-dialog .dialog-close,#capital-dialog .dialog-close,#asset-dialog .dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
}

if (supabase) {
  buildDialogs();
  render();
  load();
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-enterprise-tab]")?.dataset.enterpriseTab;
    if (tab) {
      activeEnterpriseTab = tab;
      render();
      return;
    }
    const capitalEditId = event.target.closest("[data-capital-edit]")?.dataset.capitalEdit;
    if (capitalEditId) {
      const entry = capitalEntries.find((item) => String(item.id) === String(capitalEditId));
      if (entry) openCapitalDialog(entry);
      return;
    }
    const capitalRemoveId = event.target.closest("[data-capital-remove]")?.dataset.capitalRemove;
    if (capitalRemoveId) {
      const entry = capitalEntries.find((item) => String(item.id) === String(capitalRemoveId));
      if (!entry || !confirm(`Remove capital movement “${entry.title}”?`)) return;
      void supabase.from("business_capital_entries").delete().eq("id", capitalRemoveId).then(async ({ error }) => {
        if (error) return alert(`Capital movement could not be removed: ${error.message}`);
        await load();
        window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-capital-remove" } }));
      });
      return;
    }
    const assetEditId = event.target.closest("[data-asset-edit]")?.dataset.assetEdit;
    if (assetEditId) {
      const asset = businessAssets.find((item) => String(item.id) === String(assetEditId));
      if (asset) openAssetDialog(asset);
      return;
    }
    const assetRemoveId = event.target.closest("[data-asset-remove]")?.dataset.assetRemove;
    if (assetRemoveId) {
      const asset = businessAssets.find((item) => String(item.id) === String(assetRemoveId));
      if (!asset || !confirm(`Remove asset “${asset.title}”?`)) return;
      void supabase.from("business_assets").delete().eq("id", assetRemoveId).then(async ({ error }) => {
        if (error) return alert(`Asset could not be removed: ${error.message}`);
        await load();
        window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-asset-remove" } }));
      });
      return;
    }
    const editId = event.target.closest("[data-enterprise-edit]")?.dataset.enterpriseEdit;
    if (editId) {
      const project = projects.find((item) => String(item.id) === String(editId));
      if (project) return openProjectEditor(project);
    }
    const projectOperationId = event.target.closest("[data-enterprise-operation]")?.dataset.enterpriseOperation;
    if (projectOperationId) return openProjectOperationDialog(projects.find((project) => String(project.id) === String(projectOperationId)) || null);
    const upgradeId = event.target.closest("[data-enterprise-upgrade]")?.dataset.enterpriseUpgrade;
    if (upgradeId) return openProjectDialog(projects.find((project) => String(project.id) === String(upgradeId)) || null);
    const removeId = event.target.closest("[data-enterprise-remove]")?.dataset.enterpriseRemove;
    if (removeId) return void removeProject(removeId);
    const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction;
    if (!action) return;
    if (action === "project") return openProjectDialog();
    if (action === "capital") return openCapitalDialog();
    if (action === "asset") return openAssetDialog();
    if (action === "content") $("#content-logged-on").value = easternDateKey();
    if (action === "finance") {
      $("#finance-logged-on").value = financialFoundation?.logged_on || easternDateKey();
      if (financialFoundation) {
        const fields = { emergency: "emergency_fund_target", debt: "debt_balance" };
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
