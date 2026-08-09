import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { characterMetrics, levelFromXp } from "./activity-metrics.js?v=activity-counters-v1";

const config = window.AEGIS_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = (selector) => document.querySelector(selector);
const today = new Date().toLocaleDateString("en-CA");
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
let xpCampaign = null;
let xpCampaignError = null;
let directorReviews = [];
const quarterKey = () => `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;

function missionProgress(mission) {
  return mission?.completion_type === "units" && Number(mission.target_count) > 0 ? Math.round((Math.min(Number(mission.completed_count) || 0, Number(mission.target_count)) / Number(mission.target_count)) * 100) : mission?.completed ? 100 : 0;
}

function missionLabel(mission) {
  return mission?.completion_type === "units" && Number(mission.target_count) > 0 ? `${Math.min(Number(mission.completed_count) || 0, Number(mission.target_count))} / ${mission.target_count} ${mission.unit_label || "units"}` : mission?.completed ? "Complete" : "Not complete";
}

function xpLedger(entries, cadence) {
  const rows = entries.length ? entries.map((entry) => `<li><span><b>${escape(entry.label)}</b>${escape(entry.detail)}</span><strong class="${entry.change < 0 ? "negative" : ""}">${entry.change >= 0 ? "+" : ""}${entry.change} XP</strong></li>`).join("") : `<li class="ledger-empty">No ${cadence} XP evidence yet.</li>`;
  return `<details class="xp-ledger"><summary>View XP ledger</summary><ul>${rows}</ul></details>`;
}

function xpStat(label, xp, entries, cadence, accent = "blue") {
  if (!xpCampaign) return `<div class="xp-stat-group"><article class="evidence-card ${accent}"><span>${label}</span><strong>LV 0</strong><div class="stat-meter"><i style="width:0%"></i></div><small><b>XP CALIBRATION PENDING</b></small></article><div class="xp-ledger xp-paused"><span>Tracking begins when you authorize the campaign start.</span></div></div>`;
  const meter = levelFromXp(xp);
  return `<div class="xp-stat-group"><article class="evidence-card ${accent}"><span>${label}</span><strong>LV ${meter.level}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, meter.progress))}%"></i></div><small><b>${Math.round(meter.current)} / ${meter.required} XP to LV ${meter.level + 1}</b></small></article>${xpLedger(entries, cadence)}</div>`;
}

function metricCard(label, value, detail, progress, accent = "blue") {
  return `<article class="evidence-card ${accent}"><span>${label}</span><strong>${value}</strong><div class="stat-meter"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div><small>${detail}</small></article>`;
}

function directorReviewPanel() {
  const review = directorReviews.find((item) => item.quarter_key === quarterKey()) || {};
  return `<section class="panel director-review-panel"><div><p class="eyebrow amber">QUARTERLY DIRECTOR REVIEW</p><h3>${quarterKey()} · Measure the whole system.</h3><p>Review the person behind the data: wins, bottlenecks, standards, and the next quarter’s focus.</p></div><button class="primary compact" type="button" id="open-director-review">${review.id ? "Update Director Review" : "Open Director Review"}</button>${review.id ? `<div class="director-review-preview"><span><b>Wins</b>${escape(review.wins || "Not recorded")}</span><span><b>Next focus</b>${escape(review.next_focus || "Not recorded")}</span></div>` : ""}</section>`;
}

function render({ operations, occurrences, trades, missions, projects, contentItems, masteryEntries, masteryChallenges, trainingSessions }) {
  const metrics = characterMetrics({ operations, occurrences, trades, projects, contentItems, masteryEntries, masteryChallenges, trainingSessions }, xpCampaign?.started_at);
  const { discipline, trading, ccfx, mastery } = metrics;
  const recovery = missions.find((mission) => mission.category === "Recovery");
  const levels = { discipline: levelFromXp(discipline.xp).level, trading: levelFromXp(trading.xp).level, ccfx: levelFromXp(ccfx.xp).level, mind: levelFromXp(mastery.mind.xp).level, body: levelFromXp(mastery.body.xp).level };
  localStorage.setItem("aegis-character-levels", JSON.stringify(levels));
  window.dispatchEvent(new CustomEvent("aegis:character-levels-changed", { detail: levels }));
  const launch = !xpCampaign ? `<section class="panel xp-launch-panel"><p class="eyebrow amber">CAMPAIGN CALIBRATION</p><h3>XP is paused.</h3><p class="body-copy">Nothing logged before activation will count. When you are ready, start the five-year campaign and the ledger will begin from that moment forward.</p>${xpCampaignError ? `<p class="body-copy">${escape(xpCampaignError)}</p>` : `<button class="primary compact" type="button" id="start-xp-campaign">Start campaign tracking</button>`}</section>` : "";
  $("#character").innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">CHARACTER SYSTEMS / EARNED LOADOUT</p><h2>Level the person doing the work.</h2><p>${xpCampaign ? `Campaign tracking began ${new Date(xpCampaign.started_at).toLocaleDateString()}. Only evidence logged after that date counts.` : "XP calibration is paused. Log normally; nothing is gained or lost until you authorize the start."}</p></div>${launch}<section class="evidence-grid">${xpStat("DISCIPLINE", discipline.xp, discipline.ledger, "daily", "amber")}${xpStat("TRADING INTEL", trading.xp, trading.ledger, "monthly", "blue")}${xpStat("MIND MASTERY", mastery.mind.xp, mastery.mind.ledger, "Mind", "blue")}${xpStat("BODY MASTERY", mastery.body.xp, mastery.body.ledger, "Body", "green")}${xpStat("CCFX QUESTS", ccfx.xp, ccfx.ledger, "CCFX", "amber")}${metricCard("RECOVERY QUEST", recovery ? missionLabel(recovery) : "LOCKED", recovery ? escape(recovery.title) : "Awaiting a Recovery mission", missionProgress(recovery), "green")}</section>${directorReviewPanel()}<section class="panel evidence-note"><p class="eyebrow">JARVIS / ALFRED PROTOCOL</p><div class="protocol-line"><p>&ldquo;The ledger records evidence, not ambition. Give it something worth recording.&rdquo;</p><span>- JARVIS</span></div><div class="protocol-line"><p>&ldquo;And give the work your full attention, sir. The results will follow in their time.&rdquo;</p><span>- ALFRED</span></div></section>`;
}

async function load() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  const [operationsResult, occurrenceResult, tradesResult, missionsResult, projectsResult, contentResult, masteryResult, trainingResult, campaignResult, reviewResult, challengeResult] = await Promise.all([
    supabase.from("operations").select("id, title, scheduled_date, operation_date, completed_on, completed, schedule_mode"),
    supabase.from("operation_occurrences").select("id, operation_id, occurrence_date, completed_on, completed"),
    supabase.from("trade_debriefs").select("*").order("traded_at", { ascending: false }),
    supabase.from("missions").select("*").order("created_at", { ascending: false }),
    supabase.from("business_projects").select("*"),
    supabase.from("content_items").select("*"),
    supabase.from("mastery_entries").select("*").order("created_at", { ascending: false }),
    supabase.from("training_sessions").select("*").order("logged_on", { ascending: false }),
    supabase.from("xp_campaigns").select("started_at").maybeSingle(),
    supabase.from("director_reviews").select("*").order("updated_at", { ascending: false }).limit(4),
    supabase.from("mastery_challenges").select("*").order("completed_at", { ascending: false }).limit(100)
  ]);
  xpCampaign = campaignResult.data || null;
  directorReviews = reviewResult.data || [];
  xpCampaignError = campaignResult.error ? "XP campaign setup is awaiting its one-time database migration." : null;
  render({ operations: operationsResult.data || [], occurrences: occurrenceResult.data || [], trades: tradesResult.data || [], missions: missionsResult.data || [], projects: projectsResult.data || [], contentItems: contentResult.data || [], masteryEntries: masteryResult.data || [], trainingSessions: trainingResult.data || [], masteryChallenges: challengeResult.data || [] });
}

document.addEventListener("click", async (event) => {
  if (event.target.id === "open-director-review") {
    const review = directorReviews.find((item) => item.quarter_key === quarterKey()) || {};
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<form class="dialog-card mastery-form"><button class="dialog-close" type="button">×</button><p class="eyebrow amber">QUARTERLY DIRECTOR REVIEW</p><h2>${quarterKey()} review.</h2><p>Measure the whole system—not just the outcome.</p><label>Wins<textarea name="wins">${escape(review.wins || "")}</textarea></label><label>Bottlenecks<textarea name="bottlenecks">${escape(review.bottlenecks || "")}</textarea></label><label>Standards<textarea name="standards">${escape(review.standards || "")}</textarea></label><label>Next focus<textarea name="next_focus">${escape(review.next_focus || "")}</textarea></label><button class="primary" type="submit">Save Director Review</button></form>`;
    document.body.append(dialog); dialog.querySelector(".dialog-close").onclick = () => dialog.close();
    dialog.querySelector("form").onsubmit = async (submit) => { submit.preventDefault(); const data = new FormData(submit.currentTarget); const { data: sessionData } = await supabase.auth.getSession(); const { error } = await supabase.from("director_reviews").upsert({ user_id: sessionData.session.user.id, quarter_key: quarterKey(), wins: String(data.get("wins")).trim() || null, bottlenecks: String(data.get("bottlenecks")).trim() || null, standards: String(data.get("standards")).trim() || null, next_focus: String(data.get("next_focus")).trim() || null, updated_at: new Date().toISOString() }, { onConflict: "user_id,quarter_key" }); if (error) return alert(error.message); dialog.close(); dialog.remove(); load(); window.dispatchEvent(new Event("aegis:mastery-changed")); };
    dialog.showModal(); return;
  }
  if (event.target.id !== "start-xp-campaign" || !supabase || xpCampaign) return;
  if (!confirm("Start XP tracking now? Earlier records will never count, and this start control will disappear.")) return;
  event.target.disabled = true;
  event.target.textContent = "Starting campaign…";
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return alert("Please sign in before starting the campaign.");
  const { error } = await supabase.from("xp_campaigns").insert({ user_id: sessionData.session.user.id }).select("started_at").single();
  if (error) return alert(`Campaign could not start: ${error.message}`);
  await load();
}, true);

if (supabase) {
  load();
  supabase.auth.onAuthStateChange((event) => { if (event === "INITIAL_SESSION") return; setTimeout(load, 80); });
  document.addEventListener("change", (event) => { if (event.target.matches("[data-operation]")) setTimeout(load, 700); });
  window.addEventListener("aegis:mastery-changed", () => setTimeout(load, 120));
}
