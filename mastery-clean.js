import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const db = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const root = document.querySelector("#mastery");
const mindTypes = ["Book", "Quote", "Trading Note", "Psychology", "Space", "Business", "Stoicism"];
const bodyTypes = ["Health", "Gym", "Sports", "Performance"];
let lane = "mind";
let activeType = "Book";
let entries = [];
let recoveryReady = false;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const isLocked = type => ["Sports", "Performance"].includes(type) && !recoveryReady;
const typeLabel = type => type === "Trading Note" ? "Trading Notes" : type;

function entryCard(entry) {
  return `<article class="mastery-entry"><div class="entry-meta"><span>${escapeHtml(entry.category)}</span>${entry.rating ? `<b>${entry.rating}/5</b>` : ""}</div><h3>${escapeHtml(entry.title)}</h3>${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ""}${entry.key_lessons ? `<p><b>Key takeaways:</b> ${escapeHtml(entry.key_lessons)}</p>` : ""}</article>`;
}

function tabs(types, current, attribute) {
  return types.map(type => `<button class="mastery-tab ${type === current ? "active" : ""} ${isLocked(type) ? "locked" : ""}" data-mastery-clean-${attribute}="${type}">${typeLabel(type)}${isLocked(type) ? " LOCKED" : ""}</button>`).join("");
}

function render() {
  if (!root) return;
  const types = lane === "mind" ? mindTypes : bodyTypes;
  const visible = entries.filter(entry => entry.category === activeType);
  const isCurrentLocked = isLocked(activeType);
  const categoryCards = `<div class="mastery-category-grid">${types.map(type => `<button class="mastery-category ${type === activeType ? "active" : ""} ${isLocked(type) ? "locked" : ""}" data-mastery-clean-type="${type}"><small>${type.toUpperCase()}${isLocked(type) ? " · LOCKED" : ""}</small><strong>${entries.filter(entry => entry.category === type).length}</strong><small>${type === "Book" ? "books and reading notes" : isLocked(type) ? "complete Recovery to unlock" : "entries captured"}</small></button>`).join("")}</div>`;
  const content = isCurrentLocked ? `<div class="mastery-lock"><h3>${activeType} locked</h3><p>Unlocks after Recovery is completed and you confirm archiving the Recovery section.</p></div>` : (visible.map(entryCard).join("") || `<div class="mastery-empty">Nothing logged here yet. Capture the first useful item.</div>`);
  root.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">THE CRAFT OF MASTERY</p><h2>Build the mind. Restore the body.</h2><p>Capture knowledge worth using and train what your current foundation supports.</p></div><div class="mastery-tabs"><button class="mastery-tab ${lane === "mind" ? "active" : ""}" data-mastery-clean-lane="mind">Mind</button><button class="mastery-tab ${lane === "body" ? "active" : ""}" data-mastery-clean-lane="body">Body</button></div>${categoryCards}<div class="mastery-toolbar"><h3>${typeLabel(activeType)}</h3>${isCurrentLocked ? "" : `<button class="primary compact" data-mastery-clean-add>+ Add entry</button>`}</div><div class="mastery-list">${content}</div>`;
}

function fieldsFor(type) {
  const base = `<label>${type === "Quote" ? "Quote" : type === "Book" ? "Book title" : type === "Space" ? "Fact or headline" : type === "Gym" || type === "Sports" ? "Session name" : "Title"}<input name="title" required /></label>`;
  if (type === "Book") return `${base}<label>Rating<select name="rating"><option value="">Not rated</option>${[1, 2, 3, 4, 5].map(number => `<option value="${number}">${number} / 5</option>`).join("")}</select></label><label>Summary<textarea name="summary"></textarea></label><label>Favorite quotes<textarea name="quotes"></textarea></label><label>Key takeaways<textarea name="lessons"></textarea></label><label>Action items<textarea name="actions"></textarea></label>`;
  if (type === "Quote") return `${base}<label>Source or context<textarea name="summary"></textarea></label>`;
  if (type === "Trading Note") return `${base}<label>Trade context / observation<textarea name="summary"></textarea></label><label>Key takeaway<textarea name="lessons"></textarea></label><label>Rule to test or follow<textarea name="actions"></textarea></label>`;
  if (type === "Psychology") return `${base}<label>Explanation<textarea name="summary"></textarea></label><label>Key takeaway<textarea name="lessons"></textarea></label>`;
  if (type === "Business" || type === "Stoicism") return `${base}<label>Summary / reflection<textarea name="summary"></textarea></label><label>Action item<textarea name="actions"></textarea></label>`;
  return `${base}<label>${type === "Space" ? "Explanation or source" : "Notes"}<textarea name="summary"></textarea></label>`;
}

function buildDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "mastery-clean-dialog";
  dialog.innerHTML = `<form class="dialog-card mastery-form"><button class="dialog-close" type="button">×</button><p class="eyebrow blue-text">MASTERY ENTRY</p><h2>Capture the useful thing.</h2><label>Entry type<select name="category"></select></label><div id="mastery-clean-fields"></div><button class="primary" type="submit">Save entry</button></form>`;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("select").addEventListener("change", event => {
    dialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(event.target.value);
  });
  dialog.querySelector("form").addEventListener("submit", saveEntry);
}

function openDialog() {
  const dialog = document.querySelector("#mastery-clean-dialog");
  const select = dialog.querySelector("select");
  const allowed = lane === "mind" ? mindTypes : bodyTypes.filter(type => !isLocked(type));
  select.innerHTML = allowed.map(type => `<option value="${type}">${typeLabel(type)}</option>`).join("");
  select.value = activeType;
  dialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(activeType);
  dialog.showModal();
}

async function saveEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const category = data.get("category");
  const record = { category, title: String(data.get("title") || "").trim(), rating: Number(data.get("rating")) || null, summary: String(data.get("summary") || "").trim() || null, favorite_quotes: String(data.get("quotes") || "").trim() || null, key_lessons: String(data.get("lessons") || "").trim() || null, action_items: String(data.get("actions") || "").trim() || null };
  if (!record.title) return;
  if (db) {
    const { error } = await db.from("mastery_entries").insert(record);
    if (error) return alert(error.message);
  } else {
    entries.unshift(record);
  }
  lane = bodyTypes.includes(category) ? "body" : "mind";
  activeType = category;
  document.querySelector("#mastery-clean-dialog").close();
  await load();
  window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function load() {
  if (db) {
    const [{ data: entryData }, { data: missionData }] = await Promise.all([db.from("mastery_entries").select("*").order("created_at", { ascending: false }), db.from("missions").select("*")]);
    entries = entryData || [];
    const recovery = (missionData || []).find(mission => mission.category === "Recovery");
    const recoveryComplete = recovery && (recovery.completed || (recovery.completion_type === "units" && Number(recovery.completed_count) >= Number(recovery.target_count)));
    recoveryReady = Boolean(recoveryComplete && localStorage.getItem("aegis-recovery-archived") === "yes");
  }
  render();
}

document.addEventListener("click", event => {
  const laneButton = event.target.closest("[data-mastery-clean-lane]");
  const typeButton = event.target.closest("[data-mastery-clean-type]");
  const categoryCard = event.target.closest("[data-mastery-clean-type]");
  if (laneButton) { lane = laneButton.dataset.masteryCleanLane; activeType = lane === "mind" ? "Book" : "Health"; render(); return; }
  if (typeButton || categoryCard) { const next = (typeButton || categoryCard).dataset.masteryCleanType; if (!isLocked(next)) { activeType = next; render(); } return; }
  if (event.target.closest("[data-mastery-clean-add]")) openDialog();
});

function startMastery() {
  if (window.__aegisMasteryCleanStarted) return;
  window.__aegisMasteryCleanStarted = true;
  buildDialog();
  load();
}

if (document.readyState === "complete") startMastery();
else window.addEventListener("load", startMastery, { once: true });
