import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
let projects = [], content = [];

function render() {
  const activeProjects = projects.filter((project) => project.status === "Active").length;
  const readyContent = content.filter((item) => item.status === "Ready").length;
  const published = content.filter((item) => item.status === "Published").length;
  $("#enterprise").innerHTML = `<div class="section-intro"><p class="eyebrow amber">SPECIAL PROJECTS / CCFX</p><h2>Build assets that compound.</h2><p>Trading is the craft. Clarified Chaos FX is the enterprise.</p></div><div class="metric-grid enterprise-metrics"><article class="metric"><p>ACTIVE PROJECTS</p><strong>${activeProjects}</strong><small>Few priorities. Clean execution.</small></article><article class="metric"><p>READY TO PUBLISH</p><strong>${readyContent}</strong><small>Content waiting for release</small></article><article class="metric"><p>PUBLISHED</p><strong>${published}</strong><small>Evidence of consistent output</small></article></div><div class="content-grid enterprise-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">01 - PROJECTS</p><h3>Strategic Assets</h3></div><button class="primary compact" data-enterprise-action="project">+ New project</button></div><div class="enterprise-list">${projects.length ? projects.map((project) => `<article><div><strong>${escape(project.title)}</strong><small>${escape(project.priority)} - ${escape(project.status)}</small></div><span class="enterprise-status ${project.status.toLowerCase()}">${escape(project.status)}</span></article>`).join("") : '<p class="enterprise-empty">Open the first CCFX project that creates a real asset.</p>'}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">02 - CONTENT PIPELINE</p><h3>Signal, not noise</h3></div><button class="primary compact" data-enterprise-action="content">+ New content</button></div><div class="enterprise-list">${content.length ? content.map((item) => `<article><div><strong>${escape(item.title)}</strong><small>${escape(item.platform)} - ${escape(item.status)}</small></div><span class="enterprise-status ${item.status.toLowerCase()}">${escape(item.status)}</span></article>`).join("") : '<p class="enterprise-empty">One clear idea is enough to start the pipeline.</p>'}</div></section></div>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [projectResult, contentResult] = await Promise.all([
    supabase.from("business_projects").select("*").order("created_at", { ascending: false }),
    supabase.from("content_items").select("*").order("created_at", { ascending: false })
  ]);
  if (projectResult.error || contentResult.error) return;
  projects = projectResult.data || []; content = contentResult.data || []; render();
}

function buildDialogs() {
  const dialogs = document.createElement("div");
  dialogs.innerHTML = '<dialog id="project-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW CCFX PROJECT</p><h2>Build a strategic asset.</h2><label>Project <input id="project-title" required placeholder="e.g. CCFX website foundation" /></label><div class="two-col"><label>Status <select id="project-status"><option>Active</option><option>Backlog</option><option>Complete</option></select></label><label>Matrix priority <select id="project-priority"><option>Schedule</option><option>Do now</option><option>Delegate</option><option>Eliminate</option></select></label></div><button class="primary" value="default">Open project</button></form></dialog><dialog id="content-dialog"><form method="dialog" class="dialog-card"><button class="dialog-close" type="button" aria-label="Close">x</button><p class="eyebrow amber">NEW CONTENT ITEM</p><h2>Ship a useful signal.</h2><label>Working title <input id="content-title" required placeholder="e.g. The risk rule that protects a funded account" /></label><div class="two-col"><label>Platform <select id="content-platform"><option>YouTube</option><option>Instagram</option><option>X</option><option>Newsletter</option></select></label><label>Status <select id="content-status"><option>Idea</option><option>Drafting</option><option>Ready</option><option>Published</option></select></label></div><button class="primary" value="default">Add to pipeline</button></form></dialog>';
  document.body.append(...Array.from(dialogs.children));
  document.querySelectorAll("#project-dialog .dialog-close,#content-dialog .dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#project-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#project-title").value.trim(); if (!title) return; const { error } = await supabase.from("business_projects").insert({ title, status: $("#project-status").value, priority: $("#project-priority").value }); if (error) return alert(error.message); $("#project-dialog").close(); $("#project-title").value = ""; load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "business-project" } })); });
  $("#content-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#content-title").value.trim(); if (!title) return; const { error } = await supabase.from("content_items").insert({ title, platform: $("#content-platform").value, status: $("#content-status").value }); if (error) return alert(error.message); $("#content-dialog").close(); $("#content-title").value = ""; load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "content-item" } })); });
}

if (supabase) {
  buildDialogs(); render(); load();
  document.addEventListener("click", (event) => { const action = event.target.closest("[data-enterprise-action]")?.dataset.enterpriseAction; if (action) $(action === "project" ? "#project-dialog" : "#content-dialog").showModal(); });
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 50); });
}

window.addEventListener("aegis:data-changed", (event) => {
  if (["remote-enterprise"].includes(event.detail?.source)) setTimeout(load, 120);
});
