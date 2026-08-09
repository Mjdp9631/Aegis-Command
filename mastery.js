import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const mindCategories = ["Book", "Trading Note", "Psychology", "Space", "Business", "Stoicism"];
let entries = [], sessions = [], area = "mind", bodyArea = "health", selectedCategory = "Book", recoveryUnlocked = false;

function entryCard(entry) {
  return `<article class="mastery-entry"><div class="entry-meta"><span>${escape(entry.category)}</span>${entry.rating ? `<b>${"★".repeat(entry.rating)}</b>` : ""}</div><h3>${escape(entry.title)}</h3>${entry.summary ? `<p>${escape(entry.summary)}</p>` : ""}${entry.key_lessons ? `<p><b>Key lesson:</b> ${escape(entry.key_lessons)}</p>` : ""}</article>`;
}

function sessionCard(session) {
  return `<article class="mastery-entry"><div class="entry-meta"><span>${escape(session.session_type)} SESSION</span><b>${escape(session.logged_on)}</b></div><h3>${escape(session.title)}</h3><p>${session.duration_minutes ? `${session.duration_minutes} minutes` : "Duration not logged"}${session.notes ? ` - ${escape(session.notes)}` : ""}</p></article>`;
}

function lockPanel(label) {
  return `<div class="mastery-lock"><h3>${label} locked</h3><p>Unlocks when Recovery is completed and you confirm archiving the Recovery section.</p></div>`;
}

function render() {
  const target = $("#mastery");
  if (!target) return;
  const mindEntries = entries.filter((entry) => mindCategories.includes(entry.category));
  const currentEntries = area === "mind" ? mindEntries.filter((entry) => entry.category === selectedCategory) : entries.filter((entry) => entry.category === (bodyArea === "performance" ? "Performance" : "Health"));
  const currentSessions = sessions.filter((session) => session.session_type === (bodyArea === "sports" ? "Sports" : "Gym"));
  const mindContent = `<div class="mastery-category-grid">${mindCategories.map((category) => { const count = mindEntries.filter((entry) => entry.category === category).length; return `<button class="mastery-category" data-category="${category}"><small>${category.toUpperCase()}</small><strong>${count}</strong><small>${category === "Book" ? "books and reading notes" : "entries captured"}</small></button>`; }).join("")}</div><div class="mastery-toolbar"><h3>${selectedCategory}</h3><button class="primary compact" data-mastery-action="entry">+ Add ${selectedCategory === "Book" ? "book" : "entry"}</button></div><div class="mastery-list">${currentEntries.length ? currentEntries.map(entryCard).join("") : '<div class="mastery-empty">Nothing logged here yet. Capture the first useful idea.</div>'}</div>`;
  let bodyContent = "";
  if (bodyArea === "health") bodyContent = `<div class="mastery-toolbar"><h3>Health Knowledge</h3><button class="primary compact" data-mastery-action="health">+ Add health note</button></div><div class="mastery-list">${currentEntries.length ? currentEntries.map(entryCard).join("") : '<div class="mastery-empty">Log health knowledge, clinician guidance, or recovery-safe principles here.</div>'}</div>`;
  if (bodyArea === "gym") bodyContent = `<div class="mastery-toolbar"><h3>Gym Sessions</h3><button class="primary compact" data-mastery-action="gym">+ Log session</button></div><div class="mastery-list">${currentSessions.length ? currentSessions.map(sessionCard).join("") : '<div class="mastery-empty">Light sessions count. Log what you can do safely and consistently.</div>'}</div>`;
  if (bodyArea === "sports") bodyContent = recoveryUnlocked ? `<div class="mastery-toolbar"><h3>Sports Sessions</h3><button class="primary compact" data-mastery-action="sports">+ Log session</button></div><div class="mastery-list">${currentSessions.length ? currentSessions.map(sessionCard).join("") : '<div class="mastery-empty">Sports is unlocked. Log your first session when ready.</div>'}</div>` : lockPanel("Sports");
  if (bodyArea === "performance") bodyContent = recoveryUnlocked ? `<div class="mastery-toolbar"><h3>Performance</h3><button class="primary compact" data-mastery-action="performance">+ Add performance note</button></div><div class="mastery-list">${currentEntries.length ? currentEntries.map(entryCard).join("") : '<div class="mastery-empty">Performance is unlocked. Capture the first useful insight.</div>'}</div>` : lockPanel("Performance");
  target.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">THE CRAFT OF MASTERY</p><h2>Build the mind. Restore the body.</h2><p>Collect knowledge worth using and train only what your current foundation can support.</p></div><div class="mastery-tabs"><button class="mastery-tab ${area === "mind" ? "active" : ""}" data-mastery-area="mind">Mind</button><button class="mastery-tab ${area === "body" ? "active" : ""}" data-mastery-area="body">Body</button></div>${area === "mind" ? mindContent : `<div class="mastery-subtabs"><button class="mastery-tab ${bodyArea === "health" ? "active" : ""}" data-body-area="health">Health</button><button class="mastery-tab ${bodyArea === "gym" ? "active" : ""}" data-body-area="gym">Gym</button><button class="mastery-tab ${bodyArea === "sports" ? "active" : ""} ${recoveryUnlocked ? "" : "locked"}" data-body-area="sports">Sports ${recoveryUnlocked ? "" : "LOCKED"}</button><button class="mastery-tab ${bodyArea === "performance" ? "active" : ""} ${recoveryUnlocked ? "" : "locked"}" data-body-area="performance">Performance ${recoveryUnlocked ? "" : "LOCKED"}</button></div>${bodyContent}`}</section>`;
}

function buildDialogs() {
  const container = document.createElement("div");
  container.innerHTML = `<dialog id="mastery-entry-dialog"><form class="dialog-card mastery-form"><button class="dialog-close" type="button">x</button><p class="eyebrow blue-text">KNOWLEDGE ENTRY</p><h2>Capture what matters.</h2><label>Category <select id="mastery-category">${[...mindCategories, "Health", "Performance"].map((category) => `<option>${category}</option>`).join("")}</select></label><label>Title <input id="mastery-title" required /></label><label>Rating <select id="mastery-rating"><option value="">No rating</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label><label>Summary <textarea id="mastery-summary"></textarea></label><label>Favorite quotes <textarea id="mastery-quotes"></textarea></label><label>Key lessons <textarea id="mastery-lessons"></textarea></label><label>Action items <textarea id="mastery-actions"></textarea></label><button class="primary" type="submit">Save entry</button></form></dialog><dialog id="gym-session-dialog"><form class="dialog-card mastery-form"><button class="dialog-close" type="button">x</button><p class="eyebrow green-text">GYM SESSION</p><h2>Log the session.</h2><label>Session <input id="gym-title" required placeholder="e.g. Upper-body strength" /></label><label>Duration (minutes) <input id="gym-duration" type="number" min="1" /></label><label>Notes <textarea id="gym-notes"></textarea></label><button class="primary" type="submit">Save session</button></form></dialog>`;
  document.body.append(...Array.from(container.children));
  document.querySelectorAll("#mastery-entry-dialog .dialog-close,#gym-session-dialog .dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#mastery-entry-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#mastery-title").value.trim(); if (!title) return; const { error } = await supabase.from("mastery_entries").insert({ category: $("#mastery-category").value, title, rating: $("#mastery-rating").value || null, summary: $("#mastery-summary").value.trim() || null, favorite_quotes: $("#mastery-quotes").value.trim() || null, key_lessons: $("#mastery-lessons").value.trim() || null, action_items: $("#mastery-actions").value.trim() || null }); if (error) return alert(error.message); $("#mastery-entry-dialog").close(); event.target.reset(); load(); });
  $("#gym-session-dialog form").addEventListener("submit", async (event) => { event.preventDefault(); const title = $("#gym-title").value.trim(); if (!title) return; const { error } = await supabase.from("training_sessions").insert({ session_type: event.target.dataset.sessionType || "Gym", title, duration_minutes: $("#gym-duration").value || null, notes: $("#gym-notes").value.trim() || null }); if (error) return alert(error.message); $("#gym-session-dialog").close(); event.target.reset(); load(); });
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [entriesResult, sessionsResult, missionsResult] = await Promise.all([supabase.from("mastery_entries").select("*").order("created_at", { ascending: false }), supabase.from("training_sessions").select("*").order("logged_on", { ascending: false }), supabase.from("missions").select("*")]);
  entries = entriesResult.data || []; sessions = sessionsResult.data || [];
  const recovery = (missionsResult.data || []).find((mission) => mission.category === "Recovery");
  recoveryUnlocked = Boolean(recovery && (recovery.completed || (recovery.completion_type === "units" && Number(recovery.completed_count) >= Number(recovery.target_count))) && localStorage.getItem("aegis-recovery-archived") === "yes";
  render();
}

render();

if (supabase) {
  buildDialogs(); load();
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 80); });
  document.addEventListener("click", (event) => { const areaButton = event.target.closest("[data-mastery-area]"); const bodyButton = event.target.closest("[data-body-area]"); const categoryButton = event.target.closest("[data-category]"); const action = event.target.closest("[data-mastery-action]")?.dataset.masteryAction; if (areaButton) { area = areaButton.dataset.masteryArea; render(); } if (bodyButton) { bodyArea = bodyButton.dataset.bodyArea; render(); } if (categoryButton) { selectedCategory = categoryButton.dataset.category; area = "mind"; render(); } if (action === "entry" || action === "health" || action === "performance") { $("#mastery-category").value = action === "health" ? "Health" : action === "performance" ? "Performance" : selectedCategory; $("#mastery-entry-dialog").showModal(); } if (action === "gym" || action === "sports") { $("#gym-session-dialog form").dataset.sessionType = action === "sports" ? "Sports" : "Gym"; $("#gym-session-dialog").showModal(); } });
}
