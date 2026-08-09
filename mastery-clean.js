import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const db = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const root = document.querySelector("#mastery");
const mindTypes = ["Book", "Quote", "Trading Note", "Psychology", "Space", "Philosophy", "Business", "Stoicism", "Leadership", "Communication", "History", "Systems Thinking"];
// Body is deliberately broad enough to hold the full capability campaign, without
// confusing a rehabilitation log with a sport, combat session, or outdoor skill.
const bodyTypes = ["Health", "Gym", "Mobility", "Performance", "Sports", "Outdoor Skills"];
const researchTopics = [
  ["Self-determination theory", "Psychology", "advanced", 55, "How autonomy, competence, and relatedness affect durable motivation."],
  ["Locus of control", "Psychology", "standard", 35, "How internal and external control beliefs shape decisions, responsibility, and resilience."],
  ["Attachment styles", "Psychology", "advanced", 55, "How attachment patterns can affect trust, conflict, independence, and relationships."],
  ["Mere-exposure effect", "Psychology", "standard", 35, "Why repeated exposure can increase familiarity and preference without proving quality."],
  ["Peak-end rule", "Psychology", "standard", 35, "Why people often judge an experience from its emotional peak and ending rather than its full duration."],
  ["Ego depletion debate", "Psychology", "advanced", 55, "What the original self-control theory proposed, why replication matters, and what practical conclusion is justified."],
  ["Yerkes-Dodson law", "Psychology", "standard", 35, "How arousal can help performance up to a point, then impair it as pressure rises."],
  ["Law of averages", "Systems Thinking", "standard", 35, "Why small samples and gambler's-fallacy thinking can distort probability judgments."],
  ["Solomon's paradox", "Psychology", "advanced", 55, "Why people can reason more wisely about another person's problem than their own."],
  ["Pavlovian conditioning", "Psychology", "standard", 35, "What Pavlov's conditioning experiments actually showed about learned associations."],
  ["The Coriolis effect", "Space", "advanced", 55, "How rotation changes apparent motion and why common weather explanations can be oversimplified."],
  ["The Cambrian explosion", "History", "advanced", 55, "What rapid diversification in early animal life means and what it does not prove."],
  ["The Pareto principle", "Systems Thinking", "standard", 35, "How uneven distributions can guide focus without becoming an excuse to ignore the remaining work."],
  ["Emotional granularity", "Psychology", "advanced", 55, "How naming emotions precisely can improve regulation and decision-making."],
  ["Ironic process theory", "Psychology", "advanced", 55, "Why trying not to think about something can make the thought more persistent."],
  ["White holes", "Space", "advanced", 55, "What a white hole is as a theoretical time-reversal concept and why none are confirmed."],
  ["The black hole information paradox", "Space", "advanced", 55, "Why black-hole evaporation creates a conflict between quantum information and classical gravity."],
  ["Vacuum decay", "Space", "advanced", 55, "What a metastable vacuum would mean in quantum field theory, including uncertainty and timescale."],
  ["Boltzmann brains", "Space", "advanced", 55, "Why this thought experiment tests cosmological models and assumptions about observers."],
  ["Cognitive dissonance", "Psychology", "standard", 35, "How conflict between beliefs and behavior can drive rationalization or change."],
  ["Prisoner's dilemma", "Systems Thinking", "standard", 35, "How individual incentives can produce a worse collective result and what cooperation changes."],
  ["The Drake equation", "Space", "advanced", 55, "How the equation frames uncertainty about communicative civilizations rather than predicting a known answer."],
  ["Antifragility", "Systems Thinking", "advanced", 55, "The distinction between fragile, robust, and systems that can benefit from manageable stressors."],
  ["The Lindy effect", "History", "standard", 35, "Why the continued survival of some non-perishable ideas can affect estimates of their future life."],
  ["Inversion", "Philosophy", "standard", 35, "How asking how to fail can reveal risks that a direct success-only plan misses."],
  ["Baader-Meinhof phenomenon", "Psychology", "standard", 35, "Why recently learned ideas seem to appear everywhere."],
  ["Paradox of choice", "Psychology", "standard", 35, "How too many options can reduce action and satisfaction."],
  ["Double-slit experiment", "Space", "advanced", 55, "What the experiment actually demonstrates and what it does not."],
  ["State-dependent memory", "Psychology", "standard", 35, "How internal state can affect recall."],
  ["Fundamental attribution error", "Psychology", "standard", 35, "Why we over-credit character and under-credit context."],
  ["Stoic dichotomy of control", "Stoicism", "standard", 35, "Separate controllable actions from uncontrollable outcomes."],
  ["Fermi paradox", "Space", "advanced", 55, "The tension between the scale of the universe and the lack of confirmed contact."],
  ["Opportunity cost", "Business", "standard", 35, "The value of the best alternative given up by a choice."],
  ["The Ship of Theseus", "Philosophy", "advanced", 55, "Identity when all parts of something change over time."],
  ["The hedonic treadmill", "Psychology", "standard", 35, "Why achievement alone does not permanently raise satisfaction."],
  ["The absurd", "Philosophy", "advanced", 55, "Camus' problem of meaning and how to act without false certainty."]
  ,["The responsibility of leadership", "Leadership", "standard", 35, "How leaders make decisions, set standards, and take responsibility when outcomes are uncertain."]
  ,["The art of the difficult conversation", "Communication", "standard", 35, "How to communicate clearly when stakes, emotions, and disagreement are present."]
  ,["The fall of the Roman Republic", "History", "advanced", 55, "How institutions, incentives, ambition, and public trust can reshape a republic."]
  ,["Second-order effects", "Systems Thinking", "advanced", 55, "How an action’s indirect consequences can matter more than its immediate result."]
];
const bodyChallenges = [
  // Health: recovery, nutrition, and resilience.
  ["Nutrition audit", "Health", "easy", 20, "Plan and document one day of nutrition that supports your current goal and any medical guidance. Record one adjustment worth keeping."],
  ["Resilience reset", "Health", "standard", 30, "Complete a deliberate recovery reset: sleep plan, hydration, stress-management practice, and a short written check-in on what would make the next seven days more sustainable."],
  // Gym: intentionally separate from field performance.
  ["Upper-body strength circuit", "Gym", "standard", 30, "Complete a 30-minute upper-body or clinician-cleared full-body session. Record the exercises and one performance note."],
  ["Grip and carries session", "Gym", "standard", 30, "Complete a clinician-cleared grip, carry, or upper-body accessory session. Record load, sets, and one technique cue."],
  // Mobility: movement quality belongs here, not in the recovery metric alone.
  ["Movement-quality session", "Mobility", "easy", 20, "Complete 30 minutes of clinician-approved mobility, balance, or movement-quality work. Record one range, position, or coordination detail that improved."],
  ["Joint-control audit", "Mobility", "standard", 30, "Use a clinician-cleared mobility routine and compare your control at the beginning and end. Log the tightest area and one useful adjustment."],
  // Performance: conditioning, athleticism, and combat all live here once cleared.
  ["Measured walk or run benchmark", "Performance", "advanced", 55, "Only if cleared: complete a measured walk, jog, or run and record distance, time, and how the body responded."],
  ["Conditioning block", "Performance", "standard", 40, "Only if cleared: complete a focused conditioning session at an intentional pace. Record duration, effort, and recovery quality."],
  ["Athletic skill session", "Performance", "standard", 40, "Only if cleared: complete a session focused on speed, coordination, footwork, or athletic mechanics. Record one skill cue and one result."],
  ["Combat fundamentals session", "Performance", "advanced", 55, "Only if cleared and coached: complete a technical boxing, Muay Thai, grappling, or self-defense fundamentals session. Prioritize control and learning over intensity."],
  // Sports: accessible, low-friction options only.
  ["Shootaround session", "Sports", "standard", 40, "Find an accessible hoop and spend 30 minutes shooting, dribbling, and moving at your own pace. Use a public court or a ball you already own."],
  ["Pickleball sampler", "Sports", "standard", 40, "Use a public court or borrow a paddle for a casual 30-minute beginner session. Avoid buying equipment just for this mission."],
  ["Casual swimming session", "Sports", "standard", 40, "If you have pool access and clearance, complete a relaxed 30-minute swim or water-walk session."],
  // Outdoor Skills: capability without requiring expensive, one-off gear.
  ["Navigation walk", "Outdoor Skills", "easy", 20, "Plan an accessible outdoor walk using a map. Identify your route, one landmark, one safety consideration, and document what you noticed."],
  ["Day-hike readiness brief", "Outdoor Skills", "standard", 30, "Prepare for and complete a local, accessible nature walk or park session. Bring appropriate water and weather gear; record one practical lesson about preparation."],
  ["Practical outdoor skill", "Outdoor Skills", "standard", 30, "Practice one low-cost outdoor skill for 30 minutes: map reading, weather interpretation, knot work, or a basic safety checklist. Capture what you learned." ]
];
const recoverySafeChallenges = [
  ["Recovery-safe movement brief", "Health", "easy", 20, "Choose one clinician-approved light movement session you already have access to. Record what felt stable and what did not."],
  ["Mobility and coordination brief", "Mobility", "easy", 20, "Complete 30 minutes of clinician-approved mobility, upper-body, or balance work. Record one useful recovery observation afterward."],
  ["Resilience routine brief", "Health", "easy", 20, "Build and complete a recovery-support routine for today: hydration, sleep preparation, and one stress-management practice. Record the useful part."],
  ["Outdoor observation walk", "Outdoor Skills", "easy", 20, "Take a short, accessible outdoor walk if cleared. Notice terrain, weather, and route safety; record one practical observation."]
];

let lane = localStorage.getItem("aegis-mastery-lane") === "body" ? "body" : "mind";
let activeType = localStorage.getItem("aegis-mastery-type") || (lane === "body" ? "Health" : "Book");
let entries = [], deepWork = [], challenges = [], trainingSessions = [], trainingSets = [], weightLogs = [], foodLogs = [];
let recoveryReady = false, cleanRendering = false;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const isLocked = type => ["Sports", "Performance"].includes(type) && !recoveryReady;
const typeLabel = type => type === "Trading Note" ? "Trading Notes" : type;
const saveView = () => { localStorage.setItem("aegis-mastery-lane", lane); localStorage.setItem("aegis-mastery-type", activeType); };
const dateOnly = value => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const activeChallenge = kind => challenges.find(item => item.lane === kind && ["generated", "accepted"].includes(item.status || "generated") && !item.completed_at);
const difficultyLabel = challenge => `${String(challenge.difficulty || "standard").toUpperCase()} · +${Number(challenge.xp_reward || 0)} BONUS XP`;

function entryCard(entry) {
  return `<article class="mastery-entry"><div class="entry-meta"><span>${escapeHtml(entry.category)}</span>${entry.rating ? `<b>${entry.rating}/5</b>` : ""}</div><h3>${escapeHtml(entry.title)}</h3>${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ""}${entry.key_lessons ? `<p><b>Key takeaways:</b> ${escapeHtml(entry.key_lessons)}</p>` : ""}</article>`;
}

function sessionTimestamp(session) {
  const value = session.logged_on || session.created_at;
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function setRowsFor(sessionId, exerciseName, resistanceType) {
  return trainingSets.filter(set => set.session_id === sessionId
    && String(set.exercise_name || "").trim().toLowerCase() === String(exerciseName || "").trim().toLowerCase()
    && String(set.resistance_type || "Weights") === String(resistanceType || "Weights"));
}

function previousSetRows(session, exerciseName, resistanceType) {
  const previousSessions = trainingSessions
    .filter(item => item.id !== session.id && sessionTimestamp(item) < sessionTimestamp(session))
    .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
  for (const previous of previousSessions) {
    const rows = setRowsFor(previous.id, exerciseName, resistanceType);
    if (rows.length) return { session: previous, rows };
  }
  return null;
}

function progressForExercise(session, rows, exerciseName, resistanceType) {
  const previous = previousSetRows(session, exerciseName, resistanceType);
  if (!previous) return "BASELINE · first logged comparison";
  const currentReps = rows.reduce((sum, row) => sum + Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  const previousReps = previous.rows.reduce((sum, row) => sum + Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  if (resistanceType === "Bands") {
    const delta = currentReps - previousReps;
    return delta ? `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} total reps vs ${dateOnly(previous.session.logged_on || previous.session.created_at)}` : `→ holding reps vs ${dateOnly(previous.session.logged_on || previous.session.created_at)}`;
  }
  const currentTop = Math.max(...rows.map(row => Number(row.weight_lbs || 0)));
  const previousTop = Math.max(...previous.rows.map(row => Number(row.weight_lbs || 0)));
  const currentVolume = rows.reduce((sum, row) => sum + Number(row.weight_lbs || 0) * Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  const previousVolume = previous.rows.reduce((sum, row) => sum + Number(row.weight_lbs || 0) * Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  if (currentTop !== previousTop) return `${currentTop > previousTop ? "↑" : "↓"} ${Math.abs(currentTop - previousTop).toFixed(1).replace(/\.0$/, "")} lb top set vs ${dateOnly(previous.session.logged_on || previous.session.created_at)}`;
  if (currentVolume !== previousVolume) return `${currentVolume > previousVolume ? "↑" : "↓"} ${Math.abs(currentVolume - previousVolume).toFixed(0)} lb volume vs ${dateOnly(previous.session.logged_on || previous.session.created_at)}`;
  return `→ holding load and volume vs ${dateOnly(previous.session.logged_on || previous.session.created_at)}`;
}

function trainingCard(session) {
  const sets = trainingSets.filter(set => set.session_id === session.id);
  const groups = [...new Map(sets.map(set => [`${String(set.exercise_name || "").trim().toLowerCase()}|${set.resistance_type || "Weights"}`, set])).values()];
  const exerciseBlocks = groups.map(group => {
    const exerciseName = group.exercise_name || "Exercise";
    const resistanceType = group.resistance_type || "Weights";
    const rows = sets.filter(set => String(set.exercise_name || "").trim().toLowerCase() === String(exerciseName).trim().toLowerCase() && String(set.resistance_type || "Weights") === resistanceType);
    const detail = rows.map((set, index) => {
      const setNumber = Number(set.set_number || index + 1);
      const resistance = resistanceType === "Bands" ? (set.band_resistance || "Band") : `${Number(set.weight_lbs || 0)} lb`;
      return `<span><b>S${setNumber}</b> ${escapeHtml(resistance)} × ${Number(set.reps || 0)} reps</span>`;
    }).join("");
    return `<div class="training-exercise"><div class="training-exercise-head"><b>${escapeHtml(exerciseName)}</b><small>${escapeHtml(resistanceType)}</small></div><div class="training-set-summary">${detail}</div><small class="training-progress">${escapeHtml(progressForExercise(session, rows, exerciseName, resistanceType))}</small></div>`;
  }).join("");
  return `<article class="mastery-entry training-entry"><div class="entry-meta"><span>${escapeHtml(session.workout_split || session.session_type || "GYM")}</span><b>${dateOnly(session.logged_on || session.created_at)}</b></div><h3>${escapeHtml(session.title || "Training session")}</h3>${exerciseBlocks ? `<div class="training-exercise-list">${exerciseBlocks}</div>` : ""}${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : ""}</article>`;
}

function trainingProgressOverview() {
  const latest = trainingSessions[0];
  if (!latest) return "";
  const latestSets = trainingSets.filter(set => set.session_id === latest.id);
  const weightedVolume = latestSets.reduce((sum, set) => sum + Number(set.weight_lbs || 0) * Number(set.reps || 0) * Math.max(1, Number(set.sets || 1)), 0);
  const exercises = new Set(latestSets.map(set => String(set.exercise_name || "").trim().toLowerCase()).filter(Boolean));
  return `<section class="training-progress-overview"><div><p class="eyebrow green-text">PROGRESS TRACKING</p><h3>${escapeHtml(latest.workout_split || latest.title || "Latest session")}</h3><small>Latest session · ${dateOnly(latest.logged_on || latest.created_at)} · compare each exercise below against its prior entry.</small></div><div class="training-progress-stats"><span><b>${trainingSessions.length}</b> sessions</span><span><b>${exercises.size}</b> exercises</span><span><b>${weightedVolume ? `${weightedVolume.toFixed(0)} lb` : "Bands"}</b> latest volume</span></div></section>`;
}

function healthCard() {
  const today = new Date().toISOString().slice(0, 10);
  const todayWeights = weightLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today);
  const todayFoods = foodLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today);
  const sum = field => Math.round(todayFoods.reduce((total, item) => total + Number(item[field] || 0), 0));
  return `<article class="mastery-entry health-entry"><div class="entry-meta"><span>HEALTH PULSE · TODAY</span></div><h3>${todayWeights.length ? todayWeights.map(item => `${item.measured_at}: ${item.weight_lbs} lb`).join(" · ") : "No weigh-ins logged today"}</h3><p>${todayFoods.length ? `${todayFoods.length} foods · ~${sum("calories")} kcal · ${sum("protein_g")}g protein · ${sum("fiber_g")}g fiber · ${sum("fat_g")}g fat · ${sum("sugar_g")}g sugar` : "Add food as a rough estimate—precision is optional; consistency is the point."}</p></article>`;
}

function challengeCard(challenge) {
  const complete = Boolean(challenge.completed_at);
  const status = challenge.status || "generated";
  const laneLabel = challenge.lane === "mind" ? "RESEARCH TRANSMISSION" : "BODY TRANSMISSION";
  const reward = `<small class="challenge-reward">${difficultyLabel(challenge)}${complete ? " · recorded when XP campaign launches" : " · reserved on acceptance"}</small>`;
  const assessment = typeof challenge.ai_assessment === "string" ? (() => { try { return JSON.parse(challenge.ai_assessment); } catch { return null; } })() : challenge.ai_assessment;
  const feedback = complete && assessment ? `<div class="challenge-ai-feedback"><b>AEGIS accuracy check: ${escapeHtml(assessment.accuracy_grade || "Reviewed")}</b><span>${escapeHtml(assessment.overall_assessment || "")}</span>${Array.isArray(assessment.corrections) && assessment.corrections.length ? `<small>Correction: ${escapeHtml(assessment.corrections[0])}</small>` : ""}</div>` : "";
  let actions = "";
  if (complete) actions = `<span class="system-status">Filed to ${escapeHtml(challenge.category || "Mastery")} · ${dateOnly(challenge.completed_at)}</span>`;
  else if (status === "accepted") actions = `<div class="challenge-actions"><button class="primary compact" data-mastery-complete-challenge="${challenge.id}">Complete transmission</button><button class="ghost compact" data-mastery-deny="${challenge.id}">Deny</button></div>`;
  else actions = `<div class="challenge-actions"><button class="primary compact" data-mastery-accept="${challenge.id}">Accept</button><button class="ghost compact" data-mastery-deny="${challenge.id}">Deny</button></div>`;
  if (complete && feedback) actions = `<div class="challenge-actions challenge-ai-result">${feedback}${actions}</div>`;
  return `<article class="mastery-challenge ${complete ? "complete" : ""} ${status}"><div><p class="eyebrow ${challenge.lane === "mind" ? "blue-text" : "green-text"}">${laneLabel}${complete ? " · COMPLETE" : status === "accepted" ? " · ACCEPTED" : " · AWAITING DECISION"}</p><h4>${escapeHtml(challenge.title)}</h4><p>${escapeHtml(challenge.instructions)}</p>${challenge.lane === "mind" ? `<small>30 minutes, no AI · explain it aloud for 30+ seconds, then write your own synthesis.</small>` : `<small>Use accessible, clinician-cleared activity only. No specialist purchase or team required.</small>`}${reward}${challenge.summary ? `<p class="challenge-summary"><b>Your debrief:</b> ${escapeHtml(challenge.summary)}</p>` : ""}</div>${actions}</article>`;
}

function systemsPanel() {
  const current = activeChallenge(lane);
  const recentMinutes = deepWork.filter(log => Date.now() - new Date(log.created_at || log.logged_on).getTime() < 7 * 86400000).reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0);
  const label = lane === "mind" ? "Generate research mission" : recoveryReady ? "Generate body mission" : "Generate recovery-safe mission";
  const copy = lane === "mind" ? "Generate a topic, then decide deliberately. Acceptance reserves bonus XP; completion files the work under its subject." : recoveryReady ? "Generate an accessible activity, then decide deliberately. Completion files it under Health, Gym, Mobility, Performance, Sports, or Outdoor Skills." : "Generate only recovery-safe Health, Mobility, and Outdoor Skills activity until Recovery is cleared.";
  const deep = lane === "mind" ? `<article class="mastery-system-card deep-work-card"><div><p class="eyebrow blue-text">DEEP-WORK OUTPUT</p><h3>${recentMinutes} min</h3><p>Focused work from the last seven days. The output matters more than the timer.</p></div><button class="primary compact" data-mastery-deep-work>+ Log deep work</button></article>` : "";
  return `<section class="mastery-systems ${lane === "mind" ? "mind-systems" : "body-systems"}">${deep}<article class="mastery-system-card transmission-card"><div><p class="eyebrow ${lane === "mind" ? "blue-text" : "green-text"}">RANDOM ${lane.toUpperCase()} MISSION</p><h3>${lane === "mind" ? "Research transmission" : "Accessible activity transmission"}</h3><p>${copy}</p></div><div class="transmission-controls"><button class="primary compact" data-mastery-generate="${lane}" ${current ? "disabled title=\"Resolve the current transmission first\"" : ""}>${label}</button><button class="ghost compact" data-mastery-clear-lane="${lane}" ${current ? "" : "disabled"}>Clear queue</button></div>${current ? `<div class="transmission-state"><span>${current.status === "accepted" ? "Accepted transmission in progress. Deny this one to decline it, or clear the queue to discard every unresolved transmission in this lane." : "Transmission awaiting your decision. Deny this one to decline it, or clear the queue to discard every unresolved transmission in this lane."}</span></div><div class="challenge-stack">${challengeCard(current)}</div>` : ""}</article></section>`;
}

function render() {
  if (!root) return;
  cleanRendering = true;
  root.dataset.masteryLane = lane;
  const types = lane === "mind" ? mindTypes : bodyTypes;
  if (!types.includes(activeType)) activeType = types[0];
  const visible = entries.filter(entry => entry.category === activeType);
  const isCurrentLocked = isLocked(activeType);
  const categoryCards = `<div class="mastery-category-grid">${types.map(type => `<button class="mastery-category ${type === activeType ? "active" : ""} ${isLocked(type) ? "locked" : ""}" data-mastery-clean-type="${type}"><small>${type.toUpperCase()}${isLocked(type) ? " · LOCKED" : ""}</small><strong>${entries.filter(entry => entry.category === type).length}</strong><small>${type === "Book" ? "books and reading notes" : isLocked(type) ? "complete Recovery to unlock" : "entries captured"}</small></button>`).join("")}</div>`;
  const specialContent = activeType === "Gym" ? `${trainingProgressOverview()}${trainingSessions.slice(0, 12).map(trainingCard).join("")}` : activeType === "Health" ? healthCard() : "";
  const content = isCurrentLocked ? `<div class="mastery-lock"><h3>${activeType} locked</h3><p>Unlocks after Recovery is completed and you confirm archiving the Recovery section.</p></div>` : (specialContent || visible.map(entryCard).join("") || `<div class="mastery-empty">Nothing logged here yet. Capture the first useful item.</div>`);
  root.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">THE CRAFT OF MASTERY</p><h2>Build the mind. Restore the body.</h2><p>Capture knowledge worth using, produce focused work, and train only what your foundation supports.</p></div><div class="mastery-tabs"><button class="mastery-tab ${lane === "mind" ? "active" : ""}" data-mastery-clean-lane="mind">Mind</button><button class="mastery-tab ${lane === "body" ? "active" : ""}" data-mastery-clean-lane="body">Body</button></div>${categoryCards}${systemsPanel()}<div class="mastery-toolbar"><h3>${typeLabel(activeType)}</h3>${isCurrentLocked ? "" : `<button class="primary compact" data-mastery-clean-add>+ Add entry</button>`}</div><div class="mastery-list">${content}</div>`;
  setTimeout(() => { cleanRendering = false; }, 0);
}

function fieldsFor(type) {
  const title = type === "Quote" ? "Quote" : type === "Book" ? "Book title" : type === "Space" ? "Fact or headline" : ["Gym", "Mobility", "Sports", "Performance", "Outdoor Skills"].includes(type) ? "Session name" : "Title";
  const base = `<label>${title}<input name="title" required /></label>`;
  if (type === "Book") return `${base}<label>Rating<select name="rating"><option value="">Not rated</option>${[1,2,3,4,5].map(number => `<option value="${number}">${number} / 5</option>`).join("")}</select></label><label>Summary<textarea name="summary"></textarea></label><label>Favorite quotes<textarea name="quotes"></textarea></label><label>Key takeaways<textarea name="lessons"></textarea></label><label>Action items<textarea name="actions"></textarea></label>`;
  if (type === "Quote") return `${base}<label>Source or context<textarea name="summary"></textarea></label>`;
  if (type === "Trading Note") return `${base}<label>Trade context / observation<textarea name="summary"></textarea></label><label>Key takeaway<textarea name="lessons"></textarea></label><label>Rule to test or follow<textarea name="actions"></textarea></label>`;
  if (["Psychology", "Philosophy", "Space", "Leadership", "Communication", "History", "Systems Thinking"].includes(type)) return `${base}<label>Explanation or source<textarea name="summary"></textarea></label><label>Key takeaway<textarea name="lessons"></textarea></label>`;
  if (["Business", "Stoicism"].includes(type)) return `${base}<label>Summary / reflection<textarea name="summary"></textarea></label><label>Action item<textarea name="actions"></textarea></label>`;
  return `${base}<label>Notes / observation<textarea name="summary"></textarea></label>`;
}

function buildDialogs() {
  const entryDialog = document.createElement("dialog");
  entryDialog.id = "mastery-clean-dialog";
  entryDialog.innerHTML = `<form class="dialog-card mastery-form"><button class="dialog-close" type="button">×</button><p class="eyebrow blue-text">MASTERY ENTRY</p><h2>Capture the useful thing.</h2><label>Entry type<select name="category"></select></label><div id="mastery-clean-fields"></div><button class="primary" type="submit">Save entry</button></form>`;
  document.body.append(entryDialog);
  entryDialog.querySelector(".dialog-close").addEventListener("click", () => entryDialog.close());
  entryDialog.querySelector("select").addEventListener("change", event => { entryDialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(event.target.value); });
  entryDialog.querySelector("form").addEventListener("submit", saveEntry);
  const systemDialog = document.createElement("dialog"); systemDialog.id = "mastery-system-dialog"; document.body.append(systemDialog);
  const fitnessDialog = document.createElement("dialog");
  fitnessDialog.id = "mastery-fitness-dialog";
  document.body.append(fitnessDialog);
}

function openDialog() {
  if (activeType === "Gym" || activeType === "Health") return openFitnessDialog(activeType);
  const dialog = document.querySelector("#mastery-clean-dialog"), select = dialog.querySelector("select");
  const allowed = lane === "mind" ? mindTypes : bodyTypes.filter(type => !isLocked(type));
  select.innerHTML = allowed.map(type => `<option value="${type}">${typeLabel(type)}</option>`).join(""); select.value = activeType;
  dialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(activeType); dialog.showModal();
}

function gymSetRow() {
  return `<div class="exercise-row" data-set-number="1"><label class="set-number-label">Set <b data-set-number-label>1</b></label><label>Exercise<input name="exercise_name" required placeholder="e.g. DB bench press" /></label><label>Resistance<select name="resistance_type" data-resistance-type><option value="Weights">Weights</option><option value="Bands">Bands</option></select></label><label data-weight-field>Weight (lb)<input name="weight_lbs" type="number" min="0" step="0.5" required /></label><label data-band-field hidden>Band resistance<select name="band_resistance" disabled><option value="">Select band</option><option>Light</option><option>Medium</option><option>Heavy</option><option>Extra heavy</option><option>Other</option></select></label><label>Reps<input name="reps" type="number" min="1" required /></label><button class="ghost compact" type="button" data-add-set>+ Set</button><button class="ghost compact" type="button" data-remove-exercise>Remove</button></div>`;
}

function syncResistanceFields(row) {
  const type = row.querySelector("[data-resistance-type]")?.value || "Weights";
  const weightField = row.querySelector("[data-weight-field]");
  const bandField = row.querySelector("[data-band-field]");
  const weight = row.querySelector('[name="weight_lbs"]');
  const band = row.querySelector('[name="band_resistance"]');
  const bands = type === "Bands";
  if (weightField) weightField.hidden = bands;
  if (bandField) bandField.hidden = !bands;
  if (weight) { weight.disabled = bands; weight.required = !bands; if (bands) weight.value = ""; }
  if (band) { band.disabled = !bands; band.required = bands; if (!bands) band.value = ""; }
}

function foodRow() {
  return `<div class="nutrition-row"><label>Food<input name="food_name" required placeholder="e.g. Chicken rice bowl" /></label><label>Calories<input name="calories" type="number" min="0" placeholder="rough" /></label><label>Protein g<input name="protein_g" type="number" min="0" step="0.1" /></label><label>Fiber g<input name="fiber_g" type="number" min="0" step="0.1" /></label><label>Fat g<input name="fat_g" type="number" min="0" step="0.1" /></label><label>Sugar g<input name="sugar_g" type="number" min="0" step="0.1" /></label><button class="ghost compact" type="button" data-remove-food>Remove</button></div>`;
}

function openFitnessDialog(type) {
  const dialog = document.querySelector("#mastery-fitness-dialog");
  if (type === "Gym") dialog.innerHTML = `<form class="dialog-card mastery-form fitness-form" data-fitness-mode="gym"><button class="dialog-close" type="button">×</button><p class="eyebrow green-text">GYM LOG</p><h2>Record the work.</h2><p class="schedule-copy">Each line becomes training evidence. AEGIS compares the same exercise over time for load, reps, and total volume.</p><label>Workout split<select name="workout_split" required><option>Legs</option><option>Push</option><option>Pull</option><option>Upper Body</option><option>Lower Body</option><option>Recovery-safe mobility</option></select></label><label>Session note <span class="field-optional">optional</span><textarea name="notes" placeholder="Energy, pain, form cue, or anything worth tracking."></textarea></label><div class="form-subhead"><b>Exercise sets</b><button class="ghost compact" type="button" data-add-exercise>+ Add exercise</button></div><div class="exercise-list">${gymSetRow()}</div><button class="primary" type="submit">Save gym session</button></form>`;
  else dialog.innerHTML = `<form class="dialog-card mastery-form fitness-form" data-fitness-mode="health"><button class="dialog-close" type="button">×</button><p class="eyebrow green-text">HEALTH LOG</p><h2>Capture the signal.</h2><p class="schedule-copy">Use rough estimates. The trend matters more than pretending every macro is exact.</p><div class="health-weight-grid"><label>AM weight (lb) <span class="field-optional">optional</span><input name="am_weight" type="number" min="1" step="0.1" /></label><label>PM weight (lb) <span class="field-optional">optional</span><input name="pm_weight" type="number" min="1" step="0.1" /></label></div><div class="form-subhead"><b>Food intake · rough estimates</b><button class="ghost compact" type="button" data-add-food>+ Add food</button></div><div class="food-list">${foodRow()}</div><label>Health note <span class="field-optional">optional</span><textarea name="notes" placeholder="Sleep, hydration, appetite, recovery, or a pattern worth remembering."></textarea></label><button class="primary" type="submit">Save health log</button></form>`;
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-add-exercise]")?.addEventListener("click", () => dialog.querySelector(".exercise-list").insertAdjacentHTML("beforeend", gymSetRow()));
  dialog.querySelector("[data-add-food]")?.addEventListener("click", () => dialog.querySelector(".food-list").insertAdjacentHTML("beforeend", foodRow()));
   dialog.onclick = event => {
     const removeExercise = event.target.closest("[data-remove-exercise]");
     const removeFood = event.target.closest("[data-remove-food]");
     const addSet = event.target.closest("[data-add-set]");
     if (removeExercise) removeExercise.closest(".exercise-row")?.remove();
     if (removeFood) removeFood.closest(".nutrition-row")?.remove();
     if (addSet) {
       const source = addSet.closest(".exercise-row");
       const list = source?.closest(".exercise-list");
       if (!source || !list) return;
       const exerciseName = source.querySelector('[name="exercise_name"]')?.value.trim().toLowerCase();
       const matching = [...list.querySelectorAll(".exercise-row")].filter(row => row.querySelector('[name="exercise_name"]')?.value.trim().toLowerCase() === exerciseName);
       const nextNumber = matching.reduce((max, row) => Math.max(max, Number(row.dataset.setNumber || 0)), 0) + 1;
       const clone = source.cloneNode(true);
       clone.dataset.setNumber = nextNumber;
       clone.querySelector("[data-set-number-label]").textContent = nextNumber;
       source.after(clone);
       syncResistanceFields(clone);
     }
   };
  dialog.querySelector(".exercise-list")?.addEventListener("change", event => { if (event.target.matches("[data-resistance-type]")) syncResistanceFields(event.target.closest(".exercise-row")); });
  dialog.querySelector("form").addEventListener("submit", saveFitnessLog);
  dialog.showModal();
}

function openSystemDialog(mode, challenge) {
  const dialog = document.querySelector("#mastery-system-dialog"), close = `<button class="dialog-close" type="button" data-mastery-system-close>×</button>`;
  if (mode === "deep-work") dialog.innerHTML = `<form class="dialog-card mastery-form" data-system-mode="deep-work">${close}<p class="eyebrow blue-text">DEEP-WORK OUTPUT</p><h2>What did focused work produce?</h2><label>Focus area<select name="area"><option>Mind</option><option>Trading</option><option>Business</option></select></label><label>Focus<input name="focus" required placeholder="e.g. Market replay and structured notes" /></label><label>Minutes<input name="duration_minutes" type="number" min="1" max="1440" value="30" required /></label><label>Tangible output<textarea name="output" required placeholder="What exists now that did not exist before this session?"></textarea></label><button class="primary" type="submit">Log deep work</button></form>`;
  if (mode === "complete") dialog.innerHTML = `<form class="dialog-card mastery-form" data-system-mode="complete" data-challenge-id="${challenge.id}">${close}<p class="eyebrow ${challenge.lane === "mind" ? "blue-text" : "green-text"}">TRANSMISSION DEBRIEF</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.instructions)}</p>${challenge.lane === "mind" ? `<label class="mastery-check"><input name="spoken_confirmed" type="checkbox" required /> I explained this aloud for at least 30 seconds.</label><label>1 - What is it?<small>Define the concept in your own words.</small><textarea name="definition" required placeholder="Give a clear, accurate definition."></textarea></label><label>2 - What does this mean for you?<small>Connect it to your decisions, behavior, or perspective.</small><textarea name="personal_meaning" required placeholder="What does this clarify, challenge, or change for you?"></textarea></label><label>3 - How can you apply this?<small>Name one concrete action, experiment, or decision rule.</small><textarea name="application" required placeholder="How will you use this in real life?"></textarea></label><p class="mastery-ai-note">AEGIS will check factual accuracy and name corrections. It will not grade you for agreeing with it.</p>` : `<label>Your summary / observation<textarea name="summary" required placeholder="What did you learn, notice, or change your mind about?"></textarea></label>`}<button class="primary" type="submit">${challenge.lane === "mind" ? "Submit for AEGIS accuracy check" : "Complete transmission"}</button><p class="mastery-form-status" aria-live="polite"></p></form>`;
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close()); dialog.querySelector("form").addEventListener("submit", saveSystem); dialog.showModal();
}

async function currentUserId() { if (!db) return null; const { data: { user } } = await db.auth.getUser(); return user?.id || null; }

async function saveEntry(event) {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), category = data.get("category");
  const record = { category, title: String(data.get("title") || "").trim(), rating: Number(data.get("rating")) || null, summary: String(data.get("summary") || "").trim() || null, favorite_quotes: String(data.get("quotes") || "").trim() || null, key_lessons: String(data.get("lessons") || "").trim() || null, action_items: String(data.get("actions") || "").trim() || null };
  if (!record.title) return;
  if (db) { const { error } = await db.from("mastery_entries").insert(record); if (error) return alert(error.message); } else entries.unshift(record);
  lane = bodyTypes.includes(category) ? "body" : "mind"; activeType = category; saveView(); document.querySelector("#mastery-clean-dialog").close(); await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function saveFitnessLog(event) {
  event.preventDefault();
  if (!db) return alert("Connect your private system database before saving fitness evidence.");
  const form = event.currentTarget;
  const mode = form.dataset.fitnessMode;
  const data = new FormData(form);
  const userId = await currentUserId();
  if (!userId) return alert("Your session has expired. Please sign in again.");
  const loggedOn = new Date().toISOString().slice(0, 10);
  try {
    if (mode === "gym") {
      const workoutSplit = String(data.get("workout_split") || "").trim();
       const rows = [...form.querySelectorAll(".exercise-row")].map(row => ({
         set_number: Number(row.dataset.setNumber || 1),
         exercise_name: String(row.querySelector('[name="exercise_name"]')?.value || "").trim(),
        resistance_type: String(row.querySelector('[name="resistance_type"]')?.value || "Weights"),
        weight_lbs: row.querySelector('[name="resistance_type"]')?.value === "Bands" ? null : Number(row.querySelector('[name="weight_lbs"]')?.value || 0),
        band_resistance: row.querySelector('[name="resistance_type"]')?.value === "Bands" ? String(row.querySelector('[name="band_resistance"]')?.value || "").trim() : null,
        reps: Number(row.querySelector('[name="reps"]')?.value || 0),
         sets: 1
       })).filter(row => row.exercise_name && row.reps > 0 && (row.resistance_type === "Bands" ? row.band_resistance : row.weight_lbs !== null));
      if (!rows.length) return alert("Add at least one completed exercise set.");
      const { data: session, error: sessionError } = await db.from("training_sessions").insert({
        user_id: userId, session_type: "Gym", title: `${workoutSplit} workout`, workout_split: workoutSplit,
        notes: String(data.get("notes") || "").trim() || null, logged_on: loggedOn
      }).select().single();
      if (sessionError) throw sessionError;
      const { error: setError } = await db.from("training_sets").insert(rows.map(row => ({ ...row, user_id: userId, session_id: session.id, logged_on: loggedOn })));
      if (setError) throw setError;
    } else {
      const weights = [["AM", data.get("am_weight")], ["PM", data.get("pm_weight")]]
        .filter(([, value]) => value !== null && String(value).trim() !== "")
        .map(([measured_at, value]) => ({ user_id: userId, measured_at, weight_lbs: Number(value), logged_on: loggedOn }));
      const foods = [...form.querySelectorAll(".nutrition-row")].map(row => ({
        food_name: String(row.querySelector('[name="food_name"]')?.value || "").trim(),
        calories: Number(row.querySelector('[name="calories"]')?.value || 0) || null,
        protein_g: Number(row.querySelector('[name="protein_g"]')?.value || 0) || null,
        fiber_g: Number(row.querySelector('[name="fiber_g"]')?.value || 0) || null,
        fat_g: Number(row.querySelector('[name="fat_g"]')?.value || 0) || null,
        sugar_g: Number(row.querySelector('[name="sugar_g"]')?.value || 0) || null,
        user_id: userId, logged_on: loggedOn
      })).filter(row => row.food_name);
      if (weights.length) { const { error } = await db.from("health_weight_logs").insert(weights); if (error) throw error; }
      if (foods.length) { const { error } = await db.from("health_food_logs").insert(foods); if (error) throw error; }
      if (!weights.length && !foods.length) return alert("Add a weigh-in or at least one food item.");
    }
    document.querySelector("#mastery-fitness-dialog")?.close();
    await load();
    window.dispatchEvent(new Event("aegis:mastery-changed"));
  } catch (error) {
    alert(`Could not save this evidence: ${error.message || error}. Run the Phase 0 fitness migration first if this is a new feature.`);
  }
}

async function generateChallenge(kind) {
  if (activeChallenge(kind)) return;
  const pool = kind === "mind" ? researchTopics : (recoveryReady ? bodyChallenges : recoverySafeChallenges);
  const recent = challenges.filter(item => item.lane === kind).slice(0, 4).map(item => item.title);
  const available = pool.filter(item => !recent.includes(item[0]));
  const [title, category, difficulty, xp_reward, brief] = (available.length ? available : pool)[Math.floor(Math.random() * (available.length ? available.length : pool.length))];
  const record = kind === "mind" ? { lane: "mind", challenge_type: "research", title, category, difficulty, xp_reward, status: "generated", instructions: `Research “${title}” for 30 minutes using no AI. Focus: ${brief} Then explain it aloud for at least 30 seconds and write your own summary.`, research_minutes: 30 } : { lane: "body", challenge_type: "body_activity", title, category, difficulty, xp_reward, status: "generated", instructions: brief, research_minutes: null };
  if (!db) { challenges.unshift({ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() }); render(); return; }
  const { error } = await db.from("mastery_challenges").insert(record); if (error) return alert(`Could not create transmission: ${error.message}`);
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function actOnChallenge(id, action) {
  const challenge = challenges.find(item => item.id === id); if (!challenge) return;
  if (!db) { challenges = challenges.filter(item => action === "clear" ? item.id !== id : true).map(item => item.id === id ? { ...item, status: action === "accept" ? "accepted" : "denied" } : item); render(); return; }
  if (action === "clear") { const { error } = await db.from("mastery_challenges").delete().eq("id", id); if (error) return alert(error.message); }
  else { const patch = action === "accept" ? { status: "accepted", accepted_at: new Date().toISOString() } : { status: "denied", denied_at: new Date().toISOString() }; const { error } = await db.from("mastery_challenges").update(patch).eq("id", id); if (error) return alert(error.message); }
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function clearLaneQueue(kind) {
  const queued = challenges.filter(item => item.lane === kind && !item.completed_at && ["generated", "accepted"].includes(item.status || "generated"));
  if (!queued.length || !confirm(`Clear ${queued.length} uncompleted ${kind} transmission${queued.length === 1 ? "" : "s"}? Completed work remains in your Mastery archive.`)) return;
  if (!db) { challenges = challenges.filter(item => !queued.some(target => target.id === item.id)); render(); return; }
  const { error } = await db.from("mastery_challenges").delete().in("id", queued.map(item => item.id));
  if (error) return alert(error.message);
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function saveSystem(event) {
  event.preventDefault(); const form = event.currentTarget, mode = form.dataset.systemMode, data = new FormData(form); if (!db) return alert("Connect your private system database before using this feature.");
  let error;
  if (mode === "deep-work") ({ error } = await db.from("deep_work_logs").insert({ area: data.get("area"), focus: String(data.get("focus")).trim(), duration_minutes: Number(data.get("duration_minutes")), output: String(data.get("output")).trim() }));
  if (mode === "complete") {
    const challenge = challenges.find(item => item.id === form.dataset.challengeId); if (!challenge) return;
    const definition = String(data.get("definition") || "").trim();
    const personalMeaning = String(data.get("personal_meaning") || "").trim();
    const application = String(data.get("application") || "").trim();
    const summary = challenge.lane === "mind" ? `Definition: ${definition}\n\nWhat it means for me: ${personalMeaning}\n\nApplication: ${application}` : String(data.get("summary")).trim();
    let assessment = null;
    if (challenge.lane === "mind") {
      const reviewStatus = form.querySelector(".mastery-form-status");
      if (reviewStatus) reviewStatus.textContent = "AEGIS is checking the accuracy of your synthesis...";
      try {
        const { data: { session } } = await db.auth.getSession();
        const response = await fetch("/api/mastery-review", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token || ""}` }, body: JSON.stringify({ topic: challenge.title, category: challenge.category, definition, personal_meaning: personalMeaning, application }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "AEGIS could not review this synthesis.");
        assessment = result.assessment;
      } catch (reviewError) {
        if (reviewStatus) reviewStatus.textContent = reviewError.message || "The accuracy check failed. This transmission was not filed.";
        return;
      }
    }
    ({ error } = await db.from("mastery_challenges").update({ summary, spoken_confirmed: data.get("spoken_confirmed") === "on", research_definition: definition || null, research_personal_meaning: personalMeaning || null, research_application: application || null, ai_assessment: assessment, status: "completed", completed_at: new Date().toISOString() }).eq("id", challenge.id));
    if (!error) ({ error } = await db.from("mastery_entries").insert({ category: challenge.category, title: challenge.title, summary, key_lessons: `Completed ${challenge.lane === "mind" ? "research" : "activity"} transmission · ${String(challenge.difficulty).toUpperCase()} difficulty.`, action_items: `Potential bonus XP reserved: +${Number(challenge.xp_reward || 0)}. XP remains paused until the campaign is launched.` }));
  }
  if (error) return alert(error.message);
  document.querySelector("#mastery-system-dialog").close(); await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function load() {
  if (db) {
    const [entryResult, missionResult, workResult, challengeResult, sessionResult, setResult, weightResult, foodResult] = await Promise.all([
      db.from("mastery_entries").select("*").order("created_at", { ascending: false }), db.from("missions").select("*"), db.from("deep_work_logs").select("*").order("created_at", { ascending: false }).limit(30), db.from("mastery_challenges").select("*").order("created_at", { ascending: false }).limit(30),
      db.from("training_sessions").select("*").order("logged_on", { ascending: false }).limit(40), db.from("training_sets").select("*").order("logged_on", { ascending: false }).limit(240),
      db.from("health_weight_logs").select("*").order("logged_on", { ascending: false }).limit(60), db.from("health_food_logs").select("*").order("logged_on", { ascending: false }).limit(240)
    ]);
    entries = entryResult.data || []; deepWork = workResult.data || []; challenges = challengeResult.data || [];
    trainingSessions = sessionResult.data || []; trainingSets = setResult.data || []; weightLogs = weightResult.data || []; foodLogs = foodResult.data || [];
    const recovery = (missionResult.data || []).find(mission => mission.category === "Recovery"); const recoveryComplete = recovery && (recovery.completed || (recovery.completion_type === "units" && Number(recovery.completed_count) >= Number(recovery.target_count)));
    recoveryReady = Boolean(recoveryComplete && localStorage.getItem("aegis-recovery-archived") === "yes");
  } render();
}

document.addEventListener("click", event => {
  const laneButton = event.target.closest("[data-mastery-clean-lane]"), typeButton = event.target.closest("[data-mastery-clean-type]");
  if (laneButton) { lane = laneButton.dataset.masteryCleanLane; activeType = lane === "mind" ? "Book" : "Health"; saveView(); render(); return; }
  if (typeButton) { const next = typeButton.dataset.masteryCleanType; if (!isLocked(next)) { activeType = next; saveView(); render(); } return; }
  if (event.target.closest("[data-mastery-clean-add]")) return openDialog();
  if (event.target.closest("[data-mastery-deep-work]")) return openSystemDialog("deep-work");
  const generate = event.target.closest("[data-mastery-generate]"); if (generate) return generateChallenge(generate.dataset.masteryGenerate);
  const accept = event.target.closest("[data-mastery-accept]"); if (accept) return actOnChallenge(accept.dataset.masteryAccept, "accept");
  const deny = event.target.closest("[data-mastery-deny]"); if (deny) return actOnChallenge(deny.dataset.masteryDeny, "deny");
  const clearLane = event.target.closest("[data-mastery-clear-lane]"); if (clearLane) return clearLaneQueue(clearLane.dataset.masteryClearLane);
  const complete = event.target.closest("[data-mastery-complete-challenge]"); if (complete) { const challenge = challenges.find(item => item.id === complete.dataset.masteryCompleteChallenge); if (challenge) openSystemDialog("complete", challenge); }
});

function startMastery() { if (window.__aegisMasteryCleanStarted) return; window.__aegisMasteryCleanStarted = true; new MutationObserver(() => { if (!cleanRendering) render(); }).observe(root, { childList: true }); buildDialogs(); load(); }
if (document.readyState === "complete") startMastery(); else window.addEventListener("load", startMastery, { once: true });
