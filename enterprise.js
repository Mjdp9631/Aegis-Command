import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const easternDateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
let projects = [], content = [], financialFoundation = null;

function render() {
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const readyContent = content.filter((item) => item.status === "Ready").length;
  const published = content.filter((item) => item.status === "Published").length;
  const reserves = Number(financialFoundation?.liquid_reserves || 0);
  const expenses = Number(financialFoundation?.monthly_expenses || 0);
  const runway = expenses > 0 ? (reserves / expenses).toFixed(1) : "—";
  const finance = financialFoundation ? `<div class="enterprise-finance-grid"><span><b>$${reserves.toFixed(2)}</b><small>Liquid reserves</small></span><span><b>${runway}</b><small>Months runway</small></span><span><b>$${Number(financialFoundation.business_revenue || 0).toFixed(2)}</b><small>Business revenue</small></span><span><b>$${Number(financialFoundation.debt_balance || 0).toFixed(2)}</b><small>Debt balance</small></span></div><p class="enterprise-xp-note">+20 XP for recording the financial foundation baseline.</p>` : '<p class="enterprise-empty">Set the baseline that protects the mission from financial fragility.</p>';
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">BUSINESS / SPECIAL PROJECTS</p><h2>Build assets that compound.</h2><p>Trading is the craft. Real projects and financial resilience are the enterprise.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>READY TO PUBLISH</p><strong>${readyContent}</strong><small>Content waiting for release</small></article><article class="metric"><p>PUBLISHED</p><strong>${published}</strong><small>Evidence of consistent output</small></article><article class="metric"><p>RUNWAY</p><strong>${runway}${runway === "—" ? "" : " mo"}</strong><small>Liquid reserves ÷ monthly expenses</small></article></div><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">01 - REAL PROJECTS</p><h3>Make something useful.</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projects.length ? projects.map((project) => `<article><div><strong>${escape(project.title)}</strong><small>${escape(project.project_type || "Real-world project")} · ${escape(project.priority)} · ${Number(project.progress || 0)}%</small>${project.next_action ? `<small>NEXT: ${escape(project.next_action)}</small>` : ""}</div><span class="enterprise-status ${String(project.status || "").toLowerCase()}">${escape(project.status)}</span></article>`).join("") : '<p class="enterprise-empty">Open a real project that creates a useful asset, capability, or service.</p>'}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">02 - FINANCIAL FOUNDATION</p><h3>Protect the mission.</h3></div><button class="primary compact" data-enterprise-action="finance">${financialFoundation ? "Edit foundation" : "Set foundation"}</button></div>${finance}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">03 - CONTENT PIPELINE</p><h3>Signal, not noise.</h3></div><button class="primary compact" data-enterprise-action="content">+ New content</button></div><div class="enterprise-list">${content.length ? content.map((item) => `<article><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} - ${escape(item.status)}</small></div><span class="enterprise-status ${String(item.status || "").toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">One clear idea is enough to start the pipeline.</p>'}</div></section></div>`;
}

async function load() {
  if (!supabase) return;
  if (window.AEGIS_ACTIVE_VIEW && window.AEGIS_ACTIVE_VIEW !== "enterprise") return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [projectResult, contentResult, foundationResult] = await Promise.all([
    supabase.from("business_projects").select("*").order("logged_on", { ascending: false }),
    supabase.from("content_items").select("*").order("logged_on", { ascending: false }),
    supabase.from("financial_foundations").select("*").maybeSingle()
  ]);
  if (projectResult.error || contentResult.error) return;
  projects = projectResult.data || []; content = contentResult.data || []; financialFoundation = foundationResult.error ? null : foundationResult.data || null; render();
}

function buildDialogs() {
  const dialogs = document.createElement("div");
  dialogs.innerHTML = '<dialog id="project-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW REAL PROJECT</p><h2>Build a useful asset.</h2><label>Project <input id="project-title" required placeholder="e.g. CCFX website foundation" /></label><div class="two-col"><label>Type <select id="project-type"><option>Real-world project</option><option>CCFX system</option><option>Business asset</option><option>Learning build</option></select></label><label>Status <select id="project-status"><option>Active</option><option>Backlog</option><option>Complete</option></select></label></div><div class="two-col"><label>Priority <select id="project-priority"><option>Do now</option><option>Schedule</option><option>Delegate</option><option>Eliminate</option></select></label><label>Progress % <input id="project-progress" type="number" min="0" max="100" value="0" /></label></div><label>Definition of useful outcome <textarea id="project-outcome" placeholder="What will exist, work, or help someone when this is done?"></textarea></label><label>Next physical action <input id="project-next-action" placeholder="The next visible step" /></label><label>Due date <input id="project-due" type="date" /></label><button class="primary" value="default">Open project</button></form></dialog><dialog id="content-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW CONTENT ITEM</p><h2>Ship a useful signal.</h2><label>Working title <input id="content-title" required placeholder="e.g. The risk rule that protects a funded account" /></label><div class="two-col"><label>Platform <select id="content-platform"><option>YouTube</option><option>Instagram</option><option>X</option><option>Newsletter</option></select></label><label>Status <select id="content-status"><option>Idea</option><option>Drafting</option><option>Ready</option><option>Published</option></select></label></div><button class="primary" value="default">Add to pipeline</button></form></dialog><dialog id="finance-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">FINANCIAL FOUNDATION</p><h2>Protect the mission.</h2><div class="two-col"><label>Monthly income <input id="finance-income" type="number" min="0" step="0.01" /></label><label>Monthly expenses <input id="finance-expenses" type="number" min="0" step="0.01" /></label><label>Liquid reserves <input id="finance-reserves" type="number" min="0" step="0.01" /></label><label>Emergency fund target <input id="finance-emergency" type="number" min="0" step="0.01" /></label><label>Debt balance <input id="finance-debt" type="number" min="0" step="0.01" /></label><label>Business revenue / month <input id="finance-revenue" type="number" min="0" step="0.01" /></label></div><label>Notes <textarea id="finance-notes" placeholder="Rules, obligations, or the next financial priority."></textarea></label><button class="primary" value="default">Save foundation</button></form></dialog>';
  document.body.append(...Array.from(dialogs.children));
  [["#project-dialog", "#project-title", "project-logged-on"], ["#content-dialog", "#content-title", "content-logged-on"], ["#finance-dialog", "#finance-income", "finance-logged-on"]].forEach(([dialogSelector, anchorSelector, id]) => {
    const anchor = document.querySelector(`${dialogSelector} ${anchorSelector}`);
    anchor?.closest("label")?.insertAdjacentHTML("beforebegin", `<label>Log date <input id="${id}" type="date" required /></label>`);
    const input = document.querySelector(`#${id}`); if (input) input.value = easternDateKey();
  });
  const evidenceDateSubmit = async (event) => {
    const form = event.target;
    if (!form?.closest("#project-dialog, #content-dialog, #finance-dialog")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    let error;
    if (form.closest("#project-dialog")) {
      const title = $("#project-title").value.trim(); if (!title) return;
      ({ error } = await supabase.from("business_projects").insert({ logged_on: $("#project-logged-on").value || easternDateKey(), title, project_type: $("#project-type").value, status: $("#project-status").value, priority: $("#project-priority").value, progress: Number($("#project-progress").value || 0), outcome: $("#project-outcome").value.trim() || null, next_action: $("#project-next-action").value.trim() || null, due_on: $("#project-due").value || null }));
      if (!error) { $("#project-dialog").close(); await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project" } })); }
    } else if (form.closest("#content-dialog")) {
      const title = $("#content-title").value.trim(); if (!title) return;
      ({ error } = await supabase.from("content_items").insert({ logged_on: $("#content-logged-on").value || easternDateKey(), title, platform: $("#content-platform").value, status: $("#content-status").value }));
      if (!error) { $("#content-dialog").close(); await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "content-item" } })); }
    } else {
      const { data: sessionData } = await supabase.auth.getSession(); const userId = sessionData.session?.user?.id; if (!userId) return alert("Sign in before saving your financial foundation.");
      ({ error } = await supabase.from("financial_foundations").upsert({ user_id: userId, logged_on: $("#finance-logged-on").value || easternDateKey(), monthly_income: Number($("#finance-income").value || 0), monthly_expenses: Number($("#finance-expenses").value || 0), liquid_reserves: Number($("#finance-reserves").value || 0), emergency_fund_target: Number($("#finance-emergency").value || 0), debt_balance: Number($("#finance-debt").value || 0), business_revenue: Number($("#finance-revenue").value || 0), notes: $("#finance-notes").value.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
      if (!error) { $("#finance-dialog").close(); await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "financial-foundation" } })); }
    }
    if (error) alert(error.message);
  };
  ["#project-dialog form", "#content-dialog form", "#finance-dialog form"].forEach((selector) => document.querySelector(selector)?.addEventListener("submit", evidenceDateSubmit, true));
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction;
    if (action === "project") $("#project-logged-on").value = easternDateKey();
    if (action === "content") $("#content-logged-on").value = easternDateKey();
    if (action === "finance") $("#finance-logged-on").value = financialFoundation?.logged_on || easternDateKey();
  }, true);
  document.querySelectorAll("#project-dialog .dialog-close,#content-dialog .dialog-close,#finance-dialog .dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#project-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#project-title").value.trim(); if (!title) return; const { error } = await supabase.from("business_projects").insert({ title, project_type: $("#project-type").value, status: $("#project-status").value, priority: $("#project-priority").value, progress: Number($("#project-progress").value || 0), outcome: $("#project-outcome").value.trim() || null, next_action: $("#project-next-action").value.trim() || null, due_on: $("#project-due").value || null }); if (error) return alert(error.message); $("#project-dialog").close(); $("#project-title").value = ""; load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project" } })); });
  $("#content-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#content-title").value.trim(); if (!title) return; const { error } = await supabase.from("content_items").insert({ title, platform: $("#content-platform").value, status: $("#content-status").value }); if (error) return alert(error.message); $("#content-dialog").close(); $("#content-title").value = ""; load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "content-item" } })); });
  $("#finance-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const { data: sessionData } = await supabase.auth.getSession(); const userId = sessionData.session?.user?.id; if (!userId) return alert("Sign in before saving your financial foundation."); const { error } = await supabase.from("financial_foundations").upsert({ user_id: userId, monthly_income: Number($("#finance-income").value || 0), monthly_expenses: Number($("#finance-expenses").value || 0), liquid_reserves: Number($("#finance-reserves").value || 0), emergency_fund_target: Number($("#finance-emergency").value || 0), debt_balance: Number($("#finance-debt").value || 0), business_revenue: Number($("#finance-revenue").value || 0), notes: $("#finance-notes").value.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); if (error) return alert(error.message); $("#finance-dialog").close(); await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "financial-foundation" } })); });
}

if (supabase) {
  buildDialogs(); render(); load();
  window.addEventListener("aegis:navigation", (event) => { if (event.detail?.view === "enterprise") void load(); });
  document.addEventListener("click", (event) => { const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction; if (!action) return; const dialog = action === "project" ? $("#project-dialog") : action === "finance" ? $("#finance-dialog") : $("#content-dialog"); if (action === "finance" && financialFoundation) { ["income", "expenses", "reserves", "emergency", "debt", "revenue"].forEach((key) => { const field = $(`#finance-${key}`); const source = { income: "monthly_income", expenses: "monthly_expenses", reserves: "liquid_reserves", emergency: "emergency_fund_target", debt: "debt_balance", revenue: "business_revenue" }[key]; if (field) field.value = financialFoundation[source] ?? ""; }); $("#finance-notes").value = financialFoundation.notes || ""; } dialog.showModal(); });
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 50); });
}

window.addEventListener("aegis:data-changed", (event) => {
  if (["remote-enterprise"].includes(event.detail?.source)) setTimeout(load, 120);
});
