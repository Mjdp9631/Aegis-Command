import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.AEGIS_CONFIG || {};
const db = config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const root = document.querySelector("#mastery");
window.addEventListener("aegis:mastery-changed", () => window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "mastery" } })));

// Performance: Debounce render to prevent multiple rapid renders
let renderTimer = null;
const debounceRender = (fn, delay = 100) => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(fn, delay);
};

// Cache commonly accessed DOM elements
const cacheDOM = () => ({
  root,
  entryDialog: () => document.querySelector("#mastery-clean-dialog"),
  systemDialog: () => document.querySelector("#mastery-system-dialog"),
  capabilityDialog: () => document.querySelector("#capability-dialog"),
  fitnessDialog: () => document.querySelector("#mastery-fitness-dialog"),
});
const mindTypes = ["Book", "Quote", "Trading Note", "Psychology", "Space", "Philosophy", "Business", "Stoicism", "Leadership", "Communication", "History", "Systems Thinking"];
// Body is deliberately broad enough to hold the full capability campaign, without
// confusing a rehabilitation log with a sport, combat session, or outdoor skill.
const bodyTypes = ["Health", "Gym", "Mobility", "Performance", "Sports", "Outdoor Skills"];
function easternDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function shiftDateKey(value, amount) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function sessionLoggedDay(session) {
  const logged = String(session?.logged_on || "").slice(0, 10);
  const created = session?.created_at ? easternDateKey(new Date(session.created_at)) : "";
  // Older rows were created after 8 PM ET with UTC's next calendar date.
  // Treat that exact one-day mismatch as a legacy timestamp error.
  if (logged && created && logged === shiftDateKey(created, 1)) return created;
  return logged || created || easternDateKey();
}
function entryLoggedDay(entry) {
  return String(entry?.logged_on || (entry?.created_at ? easternDateKey(new Date(entry.created_at)) : easternDateKey())).slice(0, 10);
}
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
let entries = [], deepWork = [], challenges = [], trainingSessions = [], trainingSets = [], weightLogs = [], foodLogs = [], capabilities = [], capabilityLogs = [], capabilityBenchmarks = [], capabilityRecommendations = [];
let recoveryReady = false, cleanRendering = false;

const capabilityDefaults = [
  ["Practical", "First aid & CPR", "Learn and refresh basic first aid, CPR, and emergency response knowledge."],
  ["Practical", "Emergency preparedness", "Build calm, practical readiness for common household and travel emergencies."],
  ["Practical", "Navigation & route planning", "Read maps, plan routes, and make safe decisions when conditions change."],
  ["Practical", "Cybersecurity hygiene", "Protect accounts, devices, identity, and information with repeatable habits."],
  ["Practical", "Communication & negotiation", "Communicate clearly, listen accurately, and negotiate without avoidable escalation."],
  ["Practical", "Learning a language", "Build useful language ability through consistent listening, speaking, reading, and recall."],
  ["Adversarial", "Red-team planning", "Find failure points in a plan before reality finds them for you."],
  ["Adversarial", "Time-boxed problem solving", "Solve unfamiliar problems with limited time, information, and tools."],
  ["Adversarial", "Information verification under pressure", "Separate signal from manipulation, assumptions, and incomplete evidence."],
  ["Adversarial", "Stress decision drill", "Make and document a safe decision while tired, rushed, or uncertain."],
  ["Adversarial", "Deception resistance", "Recognize pressure tactics, false certainty, and incentives that distort judgment."],
  ["Adversarial", "Crisis communication", "Deliver concise, accurate communication when stakes and emotions are elevated."]
];
const capabilityCampaignTemplates = [
  { type: "Practical", title: "First aid & CPR", description: "Build calm, usable emergency response skill.", benchmarks: [["Novice", "Complete an accredited basic first-aid / CPR course and explain the response sequence.", 8], ["Competent", "Renew certification or complete a supervised scenario assessment with correct priorities.", 20], ["Proficient", "Complete an advanced first-aid module and run a timed multi-step response drill.", 45], ["Master", "Maintain current credentials and teach or lead a rigorous scenario review with documented corrections.", 80]] },
  { type: "Practical", title: "Cybersecurity hygiene", description: "Protect accounts, devices, and identity with repeatable security practice.", benchmarks: [["Novice", "Secure primary accounts with a password manager, unique passwords, and MFA.", 10], ["Competent", "Complete a threat-model audit of your accounts and devices, then remediate the findings.", 25], ["Proficient", "Complete a recognized security fundamentals course or equivalent hands-on lab sequence.", 55], ["Master", "Build and maintain a documented personal security protocol that survives an adversarial review.", 95]] },
  { type: "Practical", title: "Learning a language", description: "Build useful real-world language ability through active recall and conversation.", benchmarks: [["Novice", "Complete a structured beginner unit and hold a basic self-introduction without notes.", 6], ["Competent", "Complete 30 guided lessons and sustain a ten-minute conversation on familiar topics.", 24], ["Proficient", "Pass an intermediate assessment or complete 100 hours of deliberate study with recorded speaking evidence.", 60], ["Master", "Use the language independently in demanding real-world conversations or pass an advanced certification.", 130]] },
  { type: "Adversarial", title: "Information verification under pressure", description: "Separate signal from manipulation, assumptions, and incomplete evidence.", benchmarks: [["Novice", "Use a written source-checking protocol on five claims and document the outcome.", 12], ["Competent", "Complete ten timed verification drills with source quality, uncertainty, and correction notes.", 30], ["Proficient", "Build a repeatable verification playbook and pass a difficult adversarial misinformation exercise.", 65], ["Master", "Lead or complete a high-stakes red-team review with no uncorrected material errors.", 115]] },
  { type: "Adversarial", title: "Stress decision drill", description: "Make safe, documented decisions while time and information are constrained.", benchmarks: [["Novice", "Complete five short decision drills using a written decision framework.", 10], ["Competent", "Complete ten timed drills and review errors, assumptions, and missed information.", 32], ["Proficient", "Pass a scenario-based course or simulation with documented after-action improvement.", 70], ["Master", "Perform consistently in complex high-pressure simulations and mentor an after-action review.", 125]] },
  { type: "Adversarial", title: "Crisis communication", description: "Deliver concise, accurate communication when stakes and emotions are elevated.", benchmarks: [["Novice", "Learn a concise crisis-message framework and produce five accurate practice statements.", 14], ["Competent", "Complete timed role-play drills with feedback and a documented correction loop.", 35], ["Proficient", "Complete formal training or pass a realistic multi-party communication simulation.", 75], ["Master", "Lead a complex simulation with clear decisions, accurate updates, and an audited debrief.", 120]] },
];
const capabilityLevels = ["Novice", "Competent", "Proficient", "Master"];
const capabilityRecommendationTemplates = [
  ...capabilityCampaignTemplates,
  { type: "Practical", family: "learn-language", title: "Learn a new language", description: "Build useful real-world ability through deliberate study and conversation.", variants: ["Japanese", "Spanish", "French", "Italian", "Russian", "Dutch", "Korean", "Mandarin", "Arabic", "German", "Portuguese"], benchmarks: [["Novice", "Complete a structured beginner unit and introduce yourself without notes.", 6], ["Competent", "Complete 30 guided lessons and sustain a ten-minute conversation on familiar topics.", 24], ["Proficient", "Pass an intermediate assessment or complete 100 hours of deliberate study with speaking evidence.", 60], ["Master", "Use the language independently in demanding real-world conversation or pass an advanced certification.", 130]] },
  { type: "Practical", family: "learn-sport", title: "Learn a new sport", description: "Build safe, repeatable technical ability in a chosen sport.", variants: ["Tennis", "Basketball", "Swimming", "Golf", "Pickleball", "Billiards", "Bowling", "Martial arts", "Kayaking", "Volleyball", "Boxing", "Rock climbing", "Table tennis", "Soccer"], benchmarks: [["Novice", "Complete a beginner lesson or course and demonstrate safe fundamental technique.", 10], ["Competent", "Complete ten purposeful practice sessions and play in a structured recreational setting.", 28], ["Proficient", "Receive coached assessment and perform consistently in competitive or demanding play.", 60], ["Master", "Demonstrate advanced technique under pressure and maintain a deliberate improvement practice.", 105]] },
  { type: "Practical", family: "learn-instrument", title: "Learn a new instrument", description: "Develop musical fluency through technique, repertoire, and performance.", variants: ["Piano", "Guitar", "Ukulele", "Kalimba", "Stylophone", "Hang", "Ocarina", "Drums", "Violin", "Cello", "Bass", "Clarinet", "Flute", "Saxophone", "Trumpet", "Harmonica"], benchmarks: [["Novice", "Complete a beginner method unit and perform one short piece cleanly.", 8], ["Competent", "Learn and perform five pieces using consistent technique and timing.", 26], ["Proficient", "Complete intermediate repertoire or a graded performance assessment.", 58], ["Master", "Perform advanced repertoire reliably in front of others or achieve an advanced certification.", 110]] },
];
const capabilityPracticeXp = (skillType, pressure = "Low") => (skillType === "Adversarial" ? 12 : 10) + (pressure === "High" ? 3 : pressure === "Moderate" ? 1 : 0);
const capabilityRefreshDue = (skill) => skill.status !== "Complete" && skill.last_practiced_on && Date.now() - new Date(`${skill.last_practiced_on}T23:59:59`).getTime() > 30 * 86400000;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const isLocked = type => ["Sports", "Performance"].includes(type) && !recoveryReady;
const typeLabel = type => type === "Trading Note" ? "Trading Notes" : type;
const saveView = () => { localStorage.setItem("aegis-mastery-lane", lane); localStorage.setItem("aegis-mastery-type", activeType); };
const dateOnly = value => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const activeChallenge = kind => challenges.find(item => item.lane === kind && ["generated", "accepted"].includes(item.status || "generated") && !item.completed_at);
const difficultyLabel = challenge => `${String(challenge.difficulty || "standard").toUpperCase()} · +${Number(challenge.xp_reward || 0)} BONUS XP`;

function entryCard(entry) {
  return `<article class="mastery-entry"><div class="entry-meta"><span>${escapeHtml(entry.category)}</span><b>${escapeHtml(entryLoggedDay(entry))}</b>${entry.rating ? `<b>${entry.rating}/5</b>` : ""}</div><h3>${escapeHtml(entry.title)}</h3>${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ""}${entry.key_lessons ? `<p><b>Key takeaways:</b> ${escapeHtml(entry.key_lessons)}</p>` : ""}<button type="button" class="ghost compact mastery-entry-edit" data-mastery-edit-entry="${escapeHtml(entry.id)}">Edit entry</button></article>`;
}

function sessionTimestamp(session) {
  const value = sessionLoggedDay(session);
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
  if (["Bands", "Bodyweight"].includes(resistanceType)) {
    const delta = currentReps - previousReps;
    return delta ? `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)} total reps vs ${sessionLoggedDay(previous.session)}` : `→ holding reps vs ${sessionLoggedDay(previous.session)}`;
  }
  const currentTop = Math.max(...rows.map(row => Number(row.weight_lbs || 0)));
  const previousTop = Math.max(...previous.rows.map(row => Number(row.weight_lbs || 0)));
  const currentVolume = rows.reduce((sum, row) => sum + Number(row.weight_lbs || 0) * Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  const previousVolume = previous.rows.reduce((sum, row) => sum + Number(row.weight_lbs || 0) * Number(row.reps || 0) * Math.max(1, Number(row.sets || 1)), 0);
  if (currentTop !== previousTop) return `${currentTop > previousTop ? "↑" : "↓"} ${Math.abs(currentTop - previousTop).toFixed(1).replace(/\.0$/, "")} lb top set vs ${sessionLoggedDay(previous.session)}`;
  if (currentVolume !== previousVolume) return `${currentVolume > previousVolume ? "↑" : "↓"} ${Math.abs(currentVolume - previousVolume).toFixed(0)} lb volume vs ${sessionLoggedDay(previous.session)}`;
  return `→ holding load and volume vs ${sessionLoggedDay(previous.session)}`;
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
      const resistance = resistanceType === "Bands" ? (set.band_resistance || "Band") : resistanceType === "Bodyweight" ? "Bodyweight" : `${Number(set.weight_lbs || 0)} lb`;
      return `<span><b>S${setNumber}</b> ${escapeHtml(resistance)} × ${Number(set.reps || 0)} reps</span>`;
    }).join("");
    return `<div class="training-exercise"><div class="training-exercise-head"><b>${escapeHtml(exerciseName)}</b><small>${escapeHtml(resistanceType)}</small></div><div class="training-set-summary">${detail}</div><small class="training-progress">${escapeHtml(progressForExercise(session, rows, exerciseName, resistanceType))}</small></div>`;
  }).join("");
  return `<article class="mastery-entry training-entry"><div class="entry-meta"><span>${escapeHtml(session.workout_split || session.session_type || "GYM")}</span><b>${sessionLoggedDay(session)}</b></div><h3>${escapeHtml(session.title || "Training session")}</h3>${exerciseBlocks ? `<div class="training-exercise-list">${exerciseBlocks}</div>` : ""}${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : ""}<button type="button" class="ghost compact mastery-entry-edit" data-mastery-edit-session="${escapeHtml(session.id)}">Edit session</button></article>`;
}

function trainingProgressOverview() {
  const latest = trainingSessions[0];
  if (!latest) return "";
  const latestSets = trainingSets.filter(set => set.session_id === latest.id);
  const weightedVolume = latestSets.reduce((sum, set) => sum + Number(set.weight_lbs || 0) * Number(set.reps || 0) * Math.max(1, Number(set.sets || 1)), 0);
  const resistanceTypes = new Set(latestSets.map(set => set.resistance_type || "Weights"));
  const volumeLabel = weightedVolume ? `${weightedVolume.toFixed(0)} lb` : resistanceTypes.has("Bodyweight") ? "Bodyweight" : "Bands";
  const exercises = new Set(latestSets.map(set => String(set.exercise_name || "").trim().toLowerCase()).filter(Boolean));
  return `<section class="training-progress-overview"><div><p class="eyebrow green-text">PROGRESS TRACKING</p><h3>${escapeHtml(latest.workout_split || latest.title || "Latest session")}</h3><small>Latest session · ${sessionLoggedDay(latest)} · compare each exercise below against its prior entry.</small></div><div class="training-progress-stats"><span><b>${trainingSessions.length}</b> sessions</span><span><b>${exercises.size}</b> exercises</span><span><b>${volumeLabel}</b> latest volume</span></div></section>`;
}

function laneInputDock() {
  const types = lane === "mind" ? mindTypes : bodyTypes;
  return `<section class="mastery-input-dock"><div><p class="eyebrow ${lane === "mind" ? "blue-text" : "green-text"}">${lane.toUpperCase()} INPUT ACCESS</p><small>Log any ${lane === "mind" ? "Mind" : "Body"} evidence from here. AEGIS files it under the correct category automatically.</small></div><div class="mastery-input-actions">${types.map(type => `<button type="button" class="mastery-input-action ${isLocked(type) ? "locked" : ""}" data-mastery-clean-input="${escapeHtml(type)}" ${isLocked(type) ? "disabled title=\"Complete Recovery to unlock\"" : ""}>+ ${escapeHtml(typeLabel(type))}${isLocked(type) ? " · LOCKED" : ""}</button>`).join("")}</div></section>`;
}

function capabilityRecommendationMarkup(type) {
  const recommendations = capabilityRecommendations.filter((item) => item.skill_type === type && item.status === "Pending");
  if (!recommendations.length) return "";
  return `<div class="capability-recommendations">${recommendations.map((item) => { const variants = Array.isArray(item.variant_options) ? item.variant_options : []; const started = new Set(capabilities.filter((skill) => skill.family_key === item.family_key).map((skill) => String(skill.variant_key || "__default__").toLowerCase())); const available = variants.filter((variant) => !started.has(String(variant).toLowerCase())); const template = Array.isArray(item.benchmark_template) ? item.benchmark_template : []; return `<article class="capability-recommendation" data-capability-recommendation-details="${escapeHtml(item.id)}"><p class="eyebrow blue-text">AI RECOMMENDATION · PENDING</p><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description || "Review the benchmark campaign.")}</p>${variants.length ? `<label>Choose variant<select data-capability-variant="${escapeHtml(item.id)}">${variants.map((variant) => `<option value="${escapeHtml(variant)}"${started.has(String(variant).toLowerCase()) ? " disabled" : ""}>${escapeHtml(variant)}${started.has(String(variant).toLowerCase()) ? " — already started" : ""}</option>`).join("")}</select></label>` : ""}<small>${template.map((benchmark) => `${escapeHtml(benchmark[0])} +${Number(benchmark[2] || 0)} XP`).join(" · ")}</small><div><button class="primary compact" type="button" data-capability-accept="${escapeHtml(item.id)}" ${variants.length && !available.length ? "disabled" : ""}>Accept campaign</button><button class="ghost compact" type="button" data-capability-deny="${escapeHtml(item.id)}">Deny</button></div></article>`; }).join("")}</div>`;
}

function capabilityPanel() {
  const groups = ["Practical", "Adversarial"].map((type) => {
    const items = capabilities.filter((skill) => skill.skill_type === type);
    return `<div class="capability-group"><div class="capability-group-head"><span class="eyebrow ${type === "Practical" ? "blue-text" : "amber"}">${type.toUpperCase()} SKILLS</span><div><button class="ghost compact" type="button" data-capability-generate="${type}">✦ Generate skill</button><button class="ghost compact" type="button" data-capability-add="${type}">+ Add skill</button></div></div>${capabilityRecommendationMarkup(type)}${items.length ? items.map((skill) => { const benchmarks = capabilityBenchmarks.filter((benchmark) => String(benchmark.skill_id) === String(skill.id)).sort((a, b) => a.sort_order - b.sort_order); const done = benchmarks.filter((benchmark) => benchmark.completed).length; const next = benchmarks.find((benchmark) => !benchmark.completed); const totalXp = benchmarks.filter((sum) => sum.completed).reduce((sum, benchmark) => sum + Number(benchmark.xp_reward || 0), 0); return `<article class="capability-row"><div><strong>${escapeHtml(skill.title)}</strong><small>${escapeHtml(skill.description || "Define the next useful practice.")}</small>${benchmarks.length ? `<small class="capability-campaign-meta">${done}/${benchmarks.length} benchmarks complete · ${totalXp} cumulative XP earned</small><p><b>${next ? `NEXT — ${next.level}:` : "CAMPAIGN COMPLETE:"}</b> ${escapeHtml(next?.requirement || "All mastery benchmarks are complete.")}${next ? ` · +${Number(next.xp_reward || 0)} XP` : ""}</p>` : '<small class="capability-campaign-meta">Legacy skill — create a new benchmark campaign to track tier progress.</small>'}${skill.latest_note ? `<p>${escapeHtml(skill.latest_note)}</p>` : ""}</div><div class="capability-actions"><span class="enterprise-status ${String(skill.status || "Planned").toLowerCase()}">${escapeHtml(skill.status || "Planned")}</span>${skill.status === "Paused" ? `<button class="primary compact" type="button" data-capability-continue="${escapeHtml(skill.id)}">Continue</button>` : (next ? `<button class="ghost compact" type="button" data-capability-pause="${escapeHtml(skill.id)}">Pause</button>` : "")}${capabilityRefreshDue(skill) ? '<span class="capability-refresh">Refresh</span>' : ""}<button class="primary compact" type="button" data-capability-log="${escapeHtml(skill.id)}">Log practice</button></div></article>`; }).join("") : '<p class="mastery-empty">No tracks yet. Generate a recommendation or create one.</p>'}</div>`;
  }).join("");
  return `<section class="mastery-capabilities panel"><div class="panel-head"><div><p class="eyebrow blue-text">CAPABILITY DEVELOPMENT</p><h3>Practical and adversarial skills</h3><p class="body-copy">Choose an AI-guided campaign or create your own. Each custom-weighted benchmark becomes the next operation; completion unlocks the next level and stacks its XP.</p></div></div>${groups}</section>`;
}

function healthCard() {
  const today = easternDateKey();
  const todayWeights = weightLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today);
  const todayFoods = foodLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today);
  const sum = field => Math.round(todayFoods.reduce((total, item) => total + Number(item[field] || 0), 0));
  const weights = weightLogs.slice(0, 12).map(item => `<div class="health-log-row"><span><b>${escapeHtml(item.measured_at)}</b> ${escapeHtml(item.weight_lbs)} lb · ${dateOnly(item.logged_on)}</span></div>`).join("");
  const foods = foodLogs.slice(0, 12).map(item => `<div class="health-log-row"><span><b>${escapeHtml(item.food_name)}</b> · ${escapeHtml(item.quantity_text || "quantity not recorded")} · ${Number(item.calories || 0)} kcal · ${dateOnly(item.logged_on)}</span></div>`).join("");
  return `<article class="mastery-entry health-entry"><div class="entry-meta"><span>HEALTH PULSE · TODAY</span></div><h3>${todayWeights.length ? todayWeights.map(item => `${item.measured_at}: ${item.weight_lbs} lb`).join(" · ") : "No weigh-ins logged today"}</h3><p>${todayFoods.length ? `${todayFoods.length} foods · ~${sum("calories")} kcal · ${sum("protein_g")}g protein · ${sum("carbs_g")}g carbs · ${sum("fiber_g")}g fiber · ${sum("fat_g")}g fat · ${sum("sugar_g")}g sugar` : "Add a food and quantity for an automatic rough estimate; precision is optional, consistency is the point."}</p>${weights || foods ? `<div class="health-log-list"><p class="eyebrow green-text">RECENT HEALTH LOGS</p>${weights}${foods}</div>` : ""}<button type="button" class="ghost compact mastery-entry-edit" data-mastery-edit-health>Edit health log</button></article>`;
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
  const recentMinutes = deepWork.filter(log => Date.now() - new Date(log.logged_on || log.created_at).getTime() < 7 * 86400000).reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0);
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
  const categoryCards = `<div class="mastery-category-grid">${types.map(type => { const count = type === "Gym" ? trainingSessions.length : entries.filter(entry => entry.category === type).length; const countLabel = type === "Gym" ? "sessions captured" : type === "Book" ? "books and reading notes" : isLocked(type) ? "complete Recovery to unlock" : "entries captured"; return `<button class="mastery-category ${type === activeType ? "active" : ""} ${isLocked(type) ? "locked" : ""}" data-mastery-clean-type="${type}"><small>${type.toUpperCase()}${isLocked(type) ? " · LOCKED" : ""}</small><strong>${count}</strong><small>${countLabel}</small></button>`; }).join("")}</div>`;
  const specialContent = activeType === "Gym" ? `${trainingProgressOverview()}${trainingSessions.slice(0, 12).map(trainingCard).join("")}` : activeType === "Health" ? healthCard() : "";
  const content = isCurrentLocked ? `<div class="mastery-lock"><h3>${activeType} locked</h3><p>Unlocks after Recovery is completed and you confirm archiving the Recovery section.</p></div>` : (specialContent || visible.map(entryCard).join("") || `<div class="mastery-empty">Nothing logged here yet. Capture the first useful item.</div>`);
  // Render critical content first, defer heavy panels
  root.innerHTML = `<div class="section-intro"><p class="eyebrow blue-text">THE CRAFT OF MASTERY</p><h2>Build the mind. Restore the body.</h2><p>Capture knowledge worth using, produce focused work, and train only what your foundation supports.</p></div><div class="mastery-tabs"><button class="mastery-tab ${lane === "mind" ? "active" : ""}" data-mastery-clean-lane="mind">Mind</button><button class="mastery-tab ${lane === "body" ? "active" : ""}" data-mastery-clean-lane="body">Body</button></div>${laneInputDock()}${categoryCards}${lane === "mind" ? "" : ""}<div class="mastery-deferred-panels"></div><div class="mastery-toolbar"><h3>${typeLabel(activeType)}</h3></div><div class="mastery-list">${content}</div>`;
  // Render heavy panels after critical content via requestAnimationFrame
  requestAnimationFrame(() => {
    const deferredPanel = root.querySelector(".mastery-deferred-panels");
    if (deferredPanel) {
      let panelHtml = "";
      if (lane === "mind") panelHtml += capabilityPanel();
      panelHtml += systemsPanel();
      deferredPanel.innerHTML = panelHtml;
      cleanRendering = false;
    }
  });
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
  entryDialog.querySelector('select[name="category"]')?.closest("label")?.insertAdjacentHTML("afterend", `<label>Log date<input name="logged_on" type="date" value="${easternDateKey()}" required /></label>`);
  document.body.append(entryDialog);
  entryDialog.querySelector(".dialog-close").addEventListener("click", () => entryDialog.close());
  entryDialog.querySelector("select").addEventListener("change", event => { entryDialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(event.target.value); });
  entryDialog.querySelector("form").addEventListener("submit", saveEntry);
  const systemDialog = document.createElement("dialog"); systemDialog.id = "mastery-system-dialog"; document.body.append(systemDialog);
  const capabilityDialog = document.createElement("dialog"); capabilityDialog.id = "capability-dialog"; document.body.append(capabilityDialog);
  const fitnessDialog = document.createElement("dialog");
  fitnessDialog.id = "mastery-fitness-dialog";
  document.body.append(fitnessDialog);
}

function capabilityBenchmarkFields(template = null) {
  const levels = template?.benchmarks || capabilityLevels.map((level, index) => [level, "", [5, 12, 30, 60][index]]);
  return `<fieldset class="capability-benchmark-fields"><legend>Campaign benchmarks</legend><p>Define what proves each level. Weight XP by difficulty, risk, credential, and real-world usefulness; earned tiers stack.</p>${levels.map(([level, requirement, xp]) => `<div class="capability-benchmark-field"><label>${level} — proof of competence<textarea name="benchmark_${level.toLowerCase()}" required placeholder="Lessons, certificate, knowledge, or evidence required">${escapeHtml(requirement)}</textarea></label><label>${level} XP<input name="benchmark_${level.toLowerCase()}_xp" type="number" min="0" max="500" required value="${Number(xp)}" /></label></div>`).join("")}</fieldset>`;
}

function suggestedCapabilityBenchmarks(title, skillType) {
  const name = String(title || "this skill").trim();
  const difficult = /(first aid|cpr|medical|cyber|security|crisis|combat|emergency|legal|financial)/i.test(name);
  const longHorizon = /(language|programming|coding|music|instrument|engineering|mathematics)/i.test(name);
  const weights = difficult ? [12, 30, 65, 115] : longHorizon ? [6, 22, 55, 120] : skillType === "Adversarial" ? [10, 28, 60, 105] : [8, 20, 45, 85];
  return [
    [`Complete a structured introductory course or guide for ${name}, then demonstrate the core workflow without notes.`, weights[0]],
    [`Finish a deliberate practice block for ${name} with at least ten documented applications and a review of recurring errors.`, weights[1]],
    [`Complete intermediate training, a recognized assessment, or a verified real-world project that proves reliable ${name} performance.`, weights[2]],
    [`Earn an advanced credential where one exists, or deliver consistent high-stakes ${name} results that survive an independent review.`, weights[3]],
  ];
}

const capabilityFamilyKey = (template) => template.family || `skill-${String(template.title || "capability").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

async function createCapabilityRecommendation(skillType) {
  if (!db) return alert("Connect your private system database before generating a skill.");
  const userId = await currentUserId();
  if (!userId) return alert("Your session has expired. Please sign in again.");
  const candidates = capabilityRecommendationTemplates.filter((template) => {
    if (template.type !== skillType || capabilityRecommendations.some((recommendation) => recommendation.family_key === capabilityFamilyKey(template) && recommendation.status === "Pending")) return false;
    const started = capabilities.filter((skill) => skill.family_key === capabilityFamilyKey(template)).map((skill) => String(skill.variant_key || "__default__").toLowerCase());
    return template.variants ? template.variants.some((variant) => !started.includes(String(variant).toLowerCase())) : !started.includes("__default__");
  });
  if (!candidates.length) return alert(`Every available ${skillType.toLowerCase()} recommendation has already been started. Continue an existing skill or create a custom one.`);
  const template = candidates[Math.floor(Math.random() * candidates.length)];
  const { error } = await db.from("capability_recommendations").insert({ user_id: userId, skill_type: template.type, family_key: capabilityFamilyKey(template), title: template.title, description: template.description, variant_options: template.variants || [], benchmark_template: template.benchmarks });
  if (error) return alert(`${error.message} Run migration 084 if this is a new feature.`);
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function acceptCapabilityRecommendation(recommendation, variant = "") {
  if (!db) return;
  const userId = await currentUserId();
  if (!userId) return alert("Your session has expired. Please sign in again.");
  const options = Array.isArray(recommendation.variant_options) ? recommendation.variant_options : [];
  const selectedVariant = options.length ? String(variant || "").trim() : "__default__";
  if (options.length && !selectedVariant) return alert("Choose a variant before accepting this campaign.");
  if (capabilities.some((skill) => skill.family_key === recommendation.family_key && String(skill.variant_key || "__default__").toLowerCase() === selectedVariant.toLowerCase())) return alert("You already started that variant. Continue it from your saved capability list.");
  const title = options.length ? `${recommendation.title} — ${selectedVariant}` : recommendation.title;
  const { data: skill, error } = await db.from("capability_skills").insert({ user_id: userId, skill_type: recommendation.skill_type, title, description: recommendation.description || "", status: "Active", family_key: recommendation.family_key, variant_key: selectedVariant }).select().single();
  if (error || !skill) return alert(error?.message || "Could not accept this capability campaign.");
  const template = Array.isArray(recommendation.benchmark_template) ? recommendation.benchmark_template : [];
  const { data: benchmarks, error: benchmarkError } = await db.from("capability_benchmarks").insert(template.map(([level, requirement, xp], index) => ({ user_id: userId, skill_id: skill.id, level, sort_order: index + 1, requirement, xp_reward: Number(xp) }))).select();
  if (benchmarkError || !benchmarks?.length) return alert(benchmarkError?.message || "Could not create the benchmark path.");
  const first = benchmarks.sort((a, b) => a.sort_order - b.sort_order)[0];
  const { data: operation, error: operationError } = await db.from("operations").insert({ user_id: userId, title: `${skill.title} — ${first.level} benchmark`, category: "Self Mastery", brief: `${first.requirement}\n\nCapability campaign: complete this benchmark to unlock the next level and earn +${first.xp_reward} XP.`, status: "Queued", completed: false, scheduled_date: easternDateKey(), operation_date: easternDateKey(), is_daily: false, allow_unlinked: true, operation_family_key: `capability-${String(skill.id).replace(/-/g, "")}-${first.sort_order}` }).select().single();
  if (operationError || !operation) return alert(operationError?.message || "Could not create the first benchmark operation.");
  const { error: linkError } = await db.from("capability_benchmarks").update({ operation_id: operation.id }).eq("id", first.id);
  if (linkError) return alert(linkError.message);
  const { error: recommendationError } = await db.from("capability_recommendations").update({ status: "Accepted", selected_variant: selectedVariant, decided_at: new Date().toISOString() }).eq("id", recommendation.id);
  if (recommendationError) return alert(recommendationError.message);
  await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "capability" } }));
}

async function pauseCapabilityCampaign(skill) {
  const next = capabilityBenchmarks.filter((benchmark) => String(benchmark.skill_id) === String(skill.id) && !benchmark.completed).sort((a, b) => a.sort_order - b.sort_order)[0];
  if (next?.operation_id) await db.from("operations").delete().eq("id", next.operation_id);
  const { error } = await db.from("capability_skills").update({ status: "Paused", updated_at: new Date().toISOString() }).eq("id", skill.id);
  if (error) return alert(error.message);
  await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "capability" } }));
}

async function continueCapabilityCampaign(skill) {
  const { error } = await db.rpc("aegis_resume_capability_skill", { p_skill_id: skill.id });
  if (error) return alert(`${error.message} Run migration 084 if this is a new feature.`);
  await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "capability" } }));
}

function openCapabilityRecommendation(recommendation) {
  const dialog = document.createElement("dialog");
  const benchmarks = Array.isArray(recommendation.benchmark_template) ? recommendation.benchmark_template : [];
  dialog.innerHTML = `<form method="dialog" class="dialog-card"><button class="dialog-close" value="cancel" aria-label="Close">×</button><p class="eyebrow blue-text">AI CAPABILITY RECOMMENDATION</p><h2>${escapeHtml(recommendation.title)}</h2><p class="body-copy">${escapeHtml(recommendation.description || "Review the proposed path.")}</p><div class="capability-recommendation-benchmarks">${benchmarks.map(([level, requirement, xp]) => `<article><b>${escapeHtml(level)} · +${Number(xp)} XP</b><p>${escapeHtml(requirement)}</p></article>`).join("")}</div></form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

function openCapabilityDialog(mode, skillType = "Practical", skill = null, template = null) {
  const dialog = document.querySelector("#capability-dialog");
  if (!dialog) return;
  const close = `<button class="dialog-close" type="button" data-capability-close>×</button>`;
  if (mode === "add") {
    dialog.innerHTML = `<form class="dialog-card mastery-form capability-campaign-form" data-capability-mode="add"><div>${close}</div><p class="eyebrow blue-text">${template ? "AI-GUIDED" : "CUSTOM"} CAPABILITY CAMPAIGN</p><h2>${template ? "Review the recommended path." : "Define the path to mastery."}</h2><p class="body-copy">What moves this skill from novice to competent, proficient, then master? Use meaningful proof—not just time spent.</p><label>Track <select name="skill_type"><option ${skillType === "Practical" ? "selected" : ""}>Practical</option><option ${skillType === "Adversarial" ? "selected" : ""}>Adversarial</option></select></label><label>Skill <input name="title" required placeholder="e.g. Learning a language" value="${escapeHtml(template?.title || "")}" /></label><button class="ghost compact capability-suggest" type="button" data-capability-suggest>✦ Suggest benchmarks</button><label>Definition <textarea name="description" required placeholder="What does useful competence look like?">${escapeHtml(template?.description || "")}</textarea></label>${capabilityBenchmarkFields(template)}<button class="primary" type="submit">Launch capability campaign</button></form>`;
  } else {
    dialog.innerHTML = `<form class="dialog-card mastery-form" data-capability-mode="log" data-capability-id="${escapeHtml(skill.id)}"><div>${close}</div><p class="eyebrow ${skill.skill_type === "Practical" ? "blue-text" : "amber"}">${escapeHtml(skill.skill_type)} SKILL</p><h2>${escapeHtml(skill.title)}</h2><p class="body-copy">${escapeHtml(skill.description || "Record the conditions and result, not just the intention.")}</p><div class="two-col"><label>Practice date <input name="practiced_on" type="date" value="${easternDateKey()}" required /></label><label>Minutes <input name="duration_minutes" type="number" min="1" max="1440" /></label></div><label>Pressure <select name="pressure_level"><option>Low</option><option>Moderate</option><option>High</option></select></label><label>Result / evidence <textarea name="result" required placeholder="What did you practice, what happened, and what needs work next?"></textarea></label><label>Status <select name="status"><option>Active</option><option>Complete</option><option>Paused</option></select></label><button class="primary" type="submit">Save practice</button></form>`;
  }
  dialog.querySelector("[data-capability-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-capability-suggest]")?.addEventListener("click", () => {
    const form = dialog.querySelector("form");
    const title = String(form?.elements.title?.value || "").trim();
    if (!title) return alert("Name the skill first, then I can suggest its benchmark path.");
    const suggestions = suggestedCapabilityBenchmarks(title, String(form.elements.skill_type.value || skillType));
    capabilityLevels.forEach((level, index) => {
      form.elements[`benchmark_${level.toLowerCase()}`].value = suggestions[index][0];
      form.elements[`benchmark_${level.toLowerCase()}_xp`].value = suggestions[index][1];
    });
  });
  dialog.querySelector("form").addEventListener("submit", saveCapability);
  dialog.showModal();
}

async function saveCapability(event) {
  event.preventDefault();
  if (!db) return alert("Connect your private system database before saving capability evidence.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const userId = await currentUserId();
  if (!userId) return alert("Your session has expired. Please sign in again.");
  if (form.dataset.capabilityMode === "add") {
    const title = String(data.get("title") || "").trim();
    const skillType = String(data.get("skill_type") || "Practical");
    const benchmarkRows = capabilityLevels.map((level, index) => ({ user_id: userId, level, sort_order: index + 1, requirement: String(data.get(`benchmark_${level.toLowerCase()}`) || "").trim(), xp_reward: Number(data.get(`benchmark_${level.toLowerCase()}_xp`)) }));
    if (!title || benchmarkRows.some((row) => row.requirement.length < 3 || !Number.isFinite(row.xp_reward) || row.xp_reward < 0 || row.xp_reward > 500)) return alert("Define all four benchmarks and give each a valid custom XP weight.");
    const { data: skill, error } = await db.from("capability_skills").insert({ user_id: userId, skill_type: skillType, title, description: String(data.get("description") || "").trim(), status: "Active" }).select().single();
    if (error || !skill) return alert(error?.message || "Could not create this capability.");
    const { data: benchmarks, error: benchmarkError } = await db.from("capability_benchmarks").insert(benchmarkRows.map((row) => ({ ...row, skill_id: skill.id }))).select();
    if (benchmarkError || !benchmarks?.length) { await db.from("capability_skills").delete().eq("id", skill.id); return alert(benchmarkError?.message || "Run migration 083 before launching benchmark campaigns."); }
    const first = benchmarks.sort((a, b) => a.sort_order - b.sort_order)[0];
    const familyKey = `capability-${String(skill.id).replace(/-/g, "")}-${first.sort_order}`;
    const { data: operation, error: operationError } = await db.from("operations").insert({ user_id: userId, title: `${skill.title} — ${first.level} benchmark`, category: "Self Mastery", brief: `${first.requirement}\n\nCapability campaign: complete this benchmark to unlock the next level and earn +${first.xp_reward} XP.`, status: "Queued", completed: false, scheduled_date: easternDateKey(), operation_date: easternDateKey(), is_daily: false, allow_unlinked: true, operation_family_key: familyKey }).select().single();
    if (operationError || !operation) { await db.from("capability_benchmarks").delete().eq("skill_id", skill.id); await db.from("capability_skills").delete().eq("id", skill.id); return alert(operationError?.message || "Could not create the first benchmark operation."); }
    const { error: linkError } = await db.from("capability_benchmarks").update({ operation_id: operation.id }).eq("id", first.id).eq("user_id", userId);
    if (linkError) return alert(linkError.message);
  } else {
    const skill = capabilities.find((item) => String(item.id) === String(form.dataset.capabilityId));
    if (!skill) return;
    const result = String(data.get("result") || "").trim();
    const { error: logError } = await db.from("capability_skill_logs").insert({ user_id: userId, skill_id: skill.id, practiced_on: data.get("practiced_on"), duration_minutes: Number(data.get("duration_minutes")) || null, pressure_level: data.get("pressure_level") || null, result });
    if (logError) return alert(logError.message);
    const { error } = await db.from("capability_skills").update({ status: data.get("status"), practice_count: Number(skill.practice_count || 0) + 1, last_practiced_on: data.get("practiced_on"), latest_note: result, updated_at: new Date().toISOString() }).eq("id", skill.id).eq("user_id", userId);
    if (error) return alert(error.message);
  }
  dialog.close(); await load(); window.dispatchEvent(new CustomEvent("aegis:data-changed", { detail: { source: "capability" } }));
}

async function loadCapabilities() {
  if (!db) return;
  const skillResult = await db.from("capability_skills").select("*").order("skill_type").order("created_at");
  if (skillResult.error) { capabilities = []; capabilityLogs = []; capabilityBenchmarks = []; return; }
  capabilities = skillResult.data || [];
  if (!capabilities.length) {
    const { error } = await db.from("capability_skills").upsert(capabilityDefaults.map(([skill_type, title, description]) => ({ user_id: undefined, skill_type, title, description })), { onConflict: "user_id,skill_type,title", ignoreDuplicates: true });
    if (!error) {
      const refreshed = await db.from("capability_skills").select("*").order("skill_type").order("created_at");
      capabilities = refreshed.data || [];
    }
  }
  const logs = await db.from("capability_skill_logs").select("*").order("practiced_on", { ascending: false }).limit(120);
  capabilityLogs = logs.error ? [] : logs.data || [];
  const benchmarkResult = await db.from("capability_benchmarks").select("*").order("sort_order");
  capabilityBenchmarks = benchmarkResult.error ? [] : benchmarkResult.data || [];
  const recommendationResult = await db.from("capability_recommendations").select("*").eq("status", "Pending").order("created_at", { ascending: false });
  capabilityRecommendations = recommendationResult.error ? [] : recommendationResult.data || [];
}

function openDialog(existing = null) {
  if (activeType === "Gym" || activeType === "Health") return openFitnessDialog(activeType);
  const dialog = document.querySelector("#mastery-clean-dialog"), select = dialog.querySelector("select");
  const allowed = lane === "mind" ? mindTypes : bodyTypes.filter(type => !isLocked(type));
  const category = existing?.category || activeType;
  select.innerHTML = allowed.map(type => `<option value="${type}">${typeLabel(type)}</option>`).join(""); select.value = category;
  dialog.querySelector("#mastery-clean-fields").innerHTML = fieldsFor(category);
  const form = dialog.querySelector("form");
  form.dataset.editId = existing?.id || "";
  if (form.elements.logged_on) form.elements.logged_on.value = entryLoggedDay(existing);
  dialog.querySelector("h2").textContent = existing ? "Edit the useful thing." : "Capture the useful thing.";
  dialog.querySelector(".primary").textContent = existing ? "Update entry" : "Save entry";
  form.querySelector("[data-mastery-delete-entry]")?.remove();
  if (existing) {
    dialog.querySelector(".primary")?.insertAdjacentHTML("afterend", `<button type="button" class="ghost compact mastery-delete-action" data-mastery-delete-entry="${escapeHtml(existing.id)}">Delete entry</button>`);
    ["title", "rating", "summary", "quotes", "lessons", "actions"].forEach(field => {
      const input = form.elements[field];
      if (input) input.value = existing[field === "quotes" ? "favorite_quotes" : field] || "";
    });
  }
  dialog.showModal();
}

async function deleteMasteryEntry(id) {
  if (!id || !db || !confirm("Delete this Self Mastery entry? This cannot be undone.")) return;
  const { error } = await db.from("mastery_entries").delete().eq("id", id);
  if (error) return alert(`Could not delete this entry: ${error.message}`);
  document.querySelector("#mastery-clean-dialog")?.close();
  await load();
  window.dispatchEvent(new Event("aegis:mastery-changed"));
}

function gymSetRow() {
  return `<div class="exercise-row" data-set-number="1"><label class="set-number-label">Set <b data-set-number-label>1</b></label><label>Exercise<input name="exercise_name" required placeholder="e.g. DB bench press" /></label><label>Resistance<select name="resistance_type" data-resistance-type><option value="Weights">Weights</option><option value="Bands">Bands</option><option value="Bodyweight">Bodyweight</option></select></label><label data-weight-field>Weight (lb)<input name="weight_lbs" type="number" min="0" step="0.5" required /></label><label data-band-field hidden>Band resistance<select name="band_resistance" disabled><option value="">Select band</option><option>Light</option><option>Medium</option><option>Heavy</option><option>Extra heavy</option><option>Other</option></select></label><label>Reps<input name="reps" type="number" min="1" required /></label><button class="ghost compact" type="button" data-add-set>+ Set</button><button class="ghost compact" type="button" data-remove-exercise>Remove</button></div>`;
}

function syncResistanceFields(row) {
  const type = row.querySelector("[data-resistance-type]")?.value || "Weights";
  const weightField = row.querySelector("[data-weight-field]");
  const bandField = row.querySelector("[data-band-field]");
  const weight = row.querySelector('[name="weight_lbs"]');
  const band = row.querySelector('[name="band_resistance"]');
  const bands = type === "Bands";
  const bodyweight = type === "Bodyweight";
  if (weightField) weightField.hidden = bands || bodyweight;
  if (bandField) bandField.hidden = !bands;
  if (weight) { weight.disabled = bands || bodyweight; weight.required = !bands && !bodyweight; if (bands || bodyweight) weight.value = ""; }
  if (band) { band.disabled = !bands; band.required = bands; if (!bands) band.value = ""; }
}

function foodRow() {
  return `<div class="nutrition-row" data-nutrition-row data-estimated="false"><div class="nutrition-food-fields"><label>Food<input name="food_name" required placeholder="e.g. Chicken rice bowl" /></label><label>Quantity<input name="quantity_text" required placeholder="e.g. 1 bowl, 8 oz, 2 eggs" /></label></div><div class="nutrition-estimate-grid"><label>Calories<input name="calories" type="number" min="0" readonly placeholder="—" /></label><label>Protein g<input name="protein_g" type="number" min="0" step="0.1" readonly placeholder="—" /></label><label>Carbs g<input name="carbs_g" type="number" min="0" step="0.1" readonly placeholder="—" /></label><label>Fat g<input name="fat_g" type="number" min="0" step="0.1" readonly placeholder="—" /></label><label>Fiber g<input name="fiber_g" type="number" min="0" step="0.1" readonly placeholder="—" /></label><label>Sugar g<input name="sugar_g" type="number" min="0" step="0.1" readonly placeholder="—" /></label></div><div class="nutrition-row-actions"><button class="ghost compact" type="button" data-estimate-food>Estimate</button><button class="ghost compact" type="button" data-remove-food>Remove</button></div><p class="nutrition-estimate-status" data-estimate-status aria-live="polite">Enter the food and quantity, then estimate.</p></div>`;
}

async function estimateFoodRow(row) {
  if (!row) return;
  const foodName = String(row.querySelector('[name="food_name"]')?.value || "").trim();
  const quantity = String(row.querySelector('[name="quantity_text"]')?.value || "").trim();
  const status = row.querySelector("[data-estimate-status]");
  const button = row.querySelector("[data-estimate-food]");
  if (!foodName || !quantity) { if (status) status.textContent = "Add a food name and quantity first."; return; }
  const { data: { session } } = await db.auth.getSession();
  if (!session) { if (status) status.textContent = "Your session has expired. Please sign in again."; return; }
  if (button) { button.disabled = true; button.textContent = "Estimating…"; }
  if (status) status.textContent = "Looking up a reasonable estimate…";
  try {
    const response = await fetch("/api/nutrition-estimate", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ food_name: foodName, quantity }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The nutrition estimator is unavailable.");
    const estimate = payload.estimate || {};
    ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"].forEach(field => {
      const input = row.querySelector(`[name="${field}"]`);
      if (input) input.value = estimate[field] ?? "";
    });
    row.dataset.estimated = "true";
    row.dataset.estimateSource = "AI";
    row.dataset.estimatedAt = new Date().toISOString();
    if (status) status.textContent = `${String(estimate.confidence || "medium").toUpperCase()} confidence · ${estimate.assumptions || "Rough estimate based on the stated quantity."}`;
  } catch (error) {
    row.dataset.estimated = "false";
    if (status) status.textContent = error.message || "Could not estimate this food.";
  } finally {
    if (button) { button.disabled = false; button.textContent = "Estimate"; }
  }
}

function openFitnessDialog(type, existing = null, editKind = "") {
  const dialog = document.querySelector("#mastery-fitness-dialog");
  if (type === "Gym") dialog.innerHTML = `<form class="dialog-card mastery-form fitness-form" data-fitness-mode="gym"><button class="dialog-close" type="button">×</button><p class="eyebrow green-text">GYM LOG</p><h2>Record the work.</h2><p class="schedule-copy">Each line becomes training evidence. AEGIS compares the same exercise over time for load, reps, and total volume.</p><label>Workout split<select name="workout_split" required><option>Legs</option><option>Push</option><option>Pull</option><option>Upper Body</option><option>Lower Body</option><option>Recovery-safe mobility</option></select></label><label>Session note <span class="field-optional">optional</span><textarea name="notes" placeholder="Energy, pain, form cue, or anything worth tracking."></textarea></label><div class="form-subhead"><b>Exercise sets</b></div><div class="exercise-list">${gymSetRow()}</div><button class="ghost compact exercise-add-control" type="button" data-add-exercise>+ Add exercise</button><button class="primary" type="submit">Save gym session</button></form>`;
  else dialog.innerHTML = `<form class="dialog-card mastery-form fitness-form" data-fitness-mode="health"><button class="dialog-close" type="button">×</button><p class="eyebrow green-text">HEALTH LOG</p><h2>Capture the signal.</h2><p class="schedule-copy">Enter a food and quantity. AEGIS will estimate calories and macros; review the assumptions before saving.</p><div class="health-weight-grid"><label>AM weight (lb) <span class="field-optional">optional</span><input name="am_weight" type="number" min="1" step="0.1" /></label><label>PM weight (lb) <span class="field-optional">optional</span><input name="pm_weight" type="number" min="1" step="0.1" /></label></div><div class="form-subhead"><b>Food intake · auto-estimated</b><button class="ghost compact" type="button" data-add-food>+ Add food</button></div><div class="food-list">${foodRow()}</div><label>Health note <span class="field-optional">optional</span><textarea name="notes" placeholder="Sleep, hydration, appetite, recovery, or a pattern worth remembering."></textarea></label><button class="primary" type="submit">Save health log</button></form>`;
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  const logDate = existing ? sessionLoggedDay(existing) : easternDateKey();
  dialog.querySelector("form")?.insertAdjacentHTML("afterbegin", `<label>Log date<input name="logged_on" type="date" value="${escapeHtml(logDate)}" required /></label>`);
  dialog.querySelector("[data-add-exercise]")?.addEventListener("click", () => dialog.querySelector(".exercise-list").insertAdjacentHTML("beforeend", gymSetRow()));
  dialog.querySelector("[data-add-food]")?.addEventListener("click", () => dialog.querySelector(".food-list").insertAdjacentHTML("beforeend", foodRow()));
  dialog.onclick = async event => {
     const removeExercise = event.target.closest("[data-remove-exercise]");
     const removeFood = event.target.closest("[data-remove-food]");
     const estimateFood = event.target.closest("[data-estimate-food]");
     const addSet = event.target.closest("[data-add-set]");
     const deleteFitness = event.target.closest("[data-mastery-delete-fitness]");
     if (deleteFitness) {
       event.preventDefault();
       await deleteFitnessLog(form);
       return;
     }
     if (removeExercise) removeExercise.closest(".exercise-row")?.remove();
     if (removeFood) removeFood.closest(".nutrition-row")?.remove();
     if (estimateFood) { estimateFoodRow(estimateFood.closest(".nutrition-row")); return; }
     if (addSet) {
       const source = addSet.closest(".exercise-row");
       const list = source?.closest(".exercise-list");
       if (!source || !list) return;
       const exerciseName = source.querySelector('[name="exercise_name"]')?.value.trim().toLowerCase();
       const matching = [...list.querySelectorAll(".exercise-row")].filter(row => row.querySelector('[name="exercise_name"]')?.value.trim().toLowerCase() === exerciseName);
       const nextNumber = matching.reduce((max, row) => Math.max(max, Number(row.dataset.setNumber || 0)), 0) + 1;
       const clone = source.cloneNode(true);
       // cloneNode copies markup defaults, not the live values the user just entered.
       // Copy each field explicitly so the new set starts as an exact duplicate.
       const sourceFields = [...source.querySelectorAll("input, select, textarea")];
       const cloneFields = [...clone.querySelectorAll("input, select, textarea")];
       sourceFields.forEach((field, index) => {
         const copy = cloneFields[index];
         if (!copy) return;
         if (field.type === "checkbox" || field.type === "radio") copy.checked = field.checked;
         else copy.value = field.value;
       });
       clone.dataset.setNumber = String(nextNumber);
       clone.querySelector("[data-set-number-label]").textContent = nextNumber;
       source.after(clone);
       syncResistanceFields(clone);
     }
   };
  dialog.querySelector(".food-list")?.addEventListener("input", event => {
    if (!event.target.matches('[name="food_name"], [name="quantity_text"]')) return;
    const row = event.target.closest(".nutrition-row");
    if (!row || row.dataset.estimated !== "true") return;
    row.dataset.estimated = "false";
    const status = row.querySelector("[data-estimate-status]");
    if (status) status.textContent = "Food or quantity changed. Estimate again before saving.";
  });
  dialog.querySelector(".exercise-list")?.addEventListener("change", event => { if (event.target.matches("[data-resistance-type]")) syncResistanceFields(event.target.closest(".exercise-row")); });
  const form = dialog.querySelector("form");
  form.dataset.editId = existing?.id || "";
  form.dataset.editKind = editKind;
  form.dataset.editLoggedOn = existing ? sessionLoggedDay(existing) : "";
  form.dataset.editMeasuredAt = existing?.measured_at || "";
  form.querySelector("[data-mastery-delete-fitness]")?.remove();
  if (existing) {
    dialog.querySelector("h2").textContent = type === "Gym" ? "Edit the training record." : "Edit the health record.";
    form.querySelector(".primary").textContent = type === "Gym" ? "Update gym session" : "Update health log";
    form.querySelector(".primary")?.insertAdjacentHTML("afterend", `<button type="button" class="ghost compact mastery-delete-action" data-mastery-delete-fitness>Delete ${type === "Gym" ? "gym session" : "health log"}</button>`);
    if (type === "Gym") {
      form.elements.workout_split.value = existing.workout_split || existing.session_type || "Legs";
      form.elements.notes.value = existing.notes || "";
      const rows = trainingSets.filter(set => set.session_id === existing.id).sort((a, b) => Number(a.set_number || 1) - Number(b.set_number || 1));
      const list = form.querySelector(".exercise-list");
      list.innerHTML = (rows.length ? rows : [{}]).map(() => gymSetRow()).join("");
      [...list.querySelectorAll(".exercise-row")].forEach((row, index) => {
        const set = rows[index] || {};
        row.dataset.setNumber = set.set_number || index + 1;
        row.querySelector("[data-set-number-label]").textContent = set.set_number || index + 1;
        row.querySelector('[name="exercise_name"]').value = set.exercise_name || "";
        row.querySelector('[name="resistance_type"]').value = set.resistance_type || "Weights";
        row.querySelector('[name="weight_lbs"]').value = set.weight_lbs ?? "";
        row.querySelector('[name="band_resistance"]').value = set.band_resistance || "";
        row.querySelector('[name="reps"]').value = set.reps ?? "";
        syncResistanceFields(row);
      });
    } else if (editKind === "weight") {
      form.querySelectorAll(".health-weight-grid label").forEach(label => { label.hidden = !label.querySelector(`[name="${String(existing.measured_at || "AM").toLowerCase()}_weight"]`); });
      const input = form.elements[`${String(existing.measured_at || "AM").toLowerCase()}_weight`];
      if (input) input.value = existing.weight_lbs ?? "";
    } else if (editKind === "food") {
      const list = form.querySelector(".food-list");
      list.innerHTML = foodRow();
      const row = list.querySelector(".nutrition-row");
      ["food_name", "quantity_text", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"].forEach(field => { const input = row.querySelector(`[name="${field}"]`); if (input) input.value = existing[field] ?? ""; });
      row.dataset.estimated = "true";
      row.dataset.estimateSource = existing.estimate_source || "AI";
      row.dataset.estimatedAt = existing.estimated_at || new Date().toISOString();
      row.querySelector("[data-estimate-status]").textContent = "Saved estimate loaded. Re-estimate if the food or quantity changes.";
    } else if (editKind === "health") {
      form.dataset.editWeightIds = JSON.stringify(Object.fromEntries((existing.weights || []).map(item => [item.measured_at, item.id])));
      form.dataset.editFoodIds = JSON.stringify((existing.foods || []).map(item => item.id).filter(Boolean));
      const weightByTime = Object.fromEntries((existing.weights || []).map(item => [item.measured_at, item]));
      ["AM", "PM"].forEach(time => { const input = form.elements[`${time.toLowerCase()}_weight`]; if (input) input.value = weightByTime[time]?.weight_lbs ?? ""; });
      const list = form.querySelector(".food-list");
      const foods = existing.foods || [];
      list.innerHTML = (foods.length ? foods : [{}]).map(() => foodRow()).join("");
      [...list.querySelectorAll(".nutrition-row")].forEach((row, index) => {
        const food = foods[index] || {};
        row.dataset.recordId = food.id || "";
        ["food_name", "quantity_text", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g"].forEach(field => { const input = row.querySelector(`[name="${field}"]`); if (input) input.value = food[field] ?? ""; });
        if (food.id) {
          row.dataset.estimated = "true";
          row.dataset.estimateSource = food.estimate_source || "AI";
          row.dataset.estimatedAt = food.estimated_at || new Date().toISOString();
          row.querySelector("[data-estimate-status]").textContent = "Saved estimate loaded. Re-estimate if the food or quantity changes.";
        }
      });
    }
  }
  form.addEventListener("submit", saveFitnessLog);
  dialog.showModal();
}

async function deleteFitnessLog(form) {
  if (!db || !form || !confirm("Delete this Self Mastery log? This cannot be undone.")) return;
  const userId = await currentUserId();
  if (!userId) return alert("Your session has expired. Please sign in again.");
  const editId = form.dataset.editId || "";
  const editKind = form.dataset.editKind || "";
  try {
    if (form.dataset.fitnessMode === "gym") {
      const { error: setError } = await db.from("training_sets").delete().eq("session_id", editId).eq("user_id", userId);
      if (setError) throw setError;
      const { error } = await db.from("training_sessions").delete().eq("id", editId).eq("user_id", userId);
      if (error) throw error;
    } else if (editKind === "weight") {
      const { error } = await db.from("health_weight_logs").delete().eq("id", editId).eq("user_id", userId);
      if (error) throw error;
    } else if (editKind === "food") {
      const { error } = await db.from("health_food_logs").delete().eq("id", editId).eq("user_id", userId);
      if (error) throw error;
    } else if (editKind === "health") {
      const weightIds = Object.values(JSON.parse(form.dataset.editWeightIds || "{}"));
      const foodIds = JSON.parse(form.dataset.editFoodIds || "[]");
      const [weights, foods] = await Promise.all([
        weightIds.length ? db.from("health_weight_logs").delete().in("id", weightIds).eq("user_id", userId) : Promise.resolve({ error: null }),
        foodIds.length ? db.from("health_food_logs").delete().in("id", foodIds).eq("user_id", userId) : Promise.resolve({ error: null }),
      ]);
      if (weights.error) throw weights.error;
      if (foods.error) throw foods.error;
    } else {
      return;
    }
    document.querySelector("#mastery-fitness-dialog")?.close();
    await load();
    window.dispatchEvent(new Event("aegis:mastery-changed"));
  } catch (error) {
    alert(`Could not delete this log: ${error.message || error}`);
  }
}

function openSystemDialog(mode, challenge) {
  const dialog = document.querySelector("#mastery-system-dialog"), close = `<button class="dialog-close" type="button" data-mastery-system-close>×</button>`;
  if (mode === "deep-work") dialog.innerHTML = `<form class="dialog-card mastery-form" data-system-mode="deep-work">${close}<p class="eyebrow blue-text">DEEP-WORK OUTPUT</p><h2>What did focused work produce?</h2><label>Focus area<select name="area"><option>Mind</option><option>Trading</option><option>Business</option></select></label><label>Focus<input name="focus" required placeholder="e.g. Market replay and structured notes" /></label><label>Minutes<input name="duration_minutes" type="number" min="1" max="1440" value="30" required /></label><label>Tangible output<textarea name="output" required placeholder="What exists now that did not exist before this session?"></textarea></label><button class="primary" type="submit">Log deep work</button></form>`;
  if (mode === "complete") dialog.innerHTML = `<form class="dialog-card mastery-form" data-system-mode="complete" data-challenge-id="${challenge.id}">${close}<p class="eyebrow ${challenge.lane === "mind" ? "blue-text" : "green-text"}">TRANSMISSION DEBRIEF</p><h2>${escapeHtml(challenge.title)}</h2><p>${escapeHtml(challenge.instructions)}</p>${challenge.lane === "mind" ? `<label class="mastery-check"><input name="spoken_confirmed" type="checkbox" required /> I explained this aloud for at least 30 seconds.</label><label>1 - What is it?<small>Define the concept in your own words.</small><textarea name="definition" required placeholder="Give a clear, accurate definition."></textarea></label><label>2 - What does this mean for you?<small>Connect it to your decisions, behavior, or perspective.</small><textarea name="personal_meaning" required placeholder="What does this clarify, challenge, or change for you?"></textarea></label><label>3 - How can you apply this?<small>Name one concrete action, experiment, or decision rule.</small><textarea name="application" required placeholder="How will you use this in real life?"></textarea></label><p class="mastery-ai-note">AEGIS will check factual accuracy and name corrections. It will not grade you for agreeing with it.</p>` : `<label>Your summary / observation<textarea name="summary" required placeholder="What did you learn, notice, or change your mind about?"></textarea></label>`}<button class="primary" type="submit">${challenge.lane === "mind" ? "Submit for AEGIS accuracy check" : "Complete transmission"}</button><p class="mastery-form-status" aria-live="polite"></p></form>`;
  if (mode === "deep-work") dialog.querySelector("form")?.querySelector('[name="area"]')?.closest("label")?.insertAdjacentHTML("beforebegin", `<label>Log date<input name="logged_on" type="date" value="${easternDateKey()}" required /></label>`);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close()); dialog.querySelector("form").addEventListener("submit", saveSystem); dialog.showModal();
}

async function currentUserId() { if (!db) return null; const { data: { user } } = await db.auth.getUser(); return user?.id || null; }

async function saveEntry(event) {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), category = data.get("category");
  const record = { category, logged_on: String(data.get("logged_on") || easternDateKey()).slice(0, 10), title: String(data.get("title") || "").trim(), rating: Number(data.get("rating")) || null, summary: String(data.get("summary") || "").trim() || null, favorite_quotes: String(data.get("quotes") || "").trim() || null, key_lessons: String(data.get("lessons") || "").trim() || null, action_items: String(data.get("actions") || "").trim() || null };
  if (!record.title) return;
  const editId = form.dataset.editId;
  if (db) {
    const request = editId ? db.from("mastery_entries").update(record).eq("id", editId) : db.from("mastery_entries").insert(record);
    const { error } = await request;
    if (error) return alert(error.message);
  } else if (editId) {
    entries = entries.map(entry => entry.id === editId ? { ...entry, ...record } : entry);
  } else entries.unshift({ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  form.dataset.editId = "";
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
  const editId = form.dataset.editId || "";
  const editKind = form.dataset.editKind || "";
  const loggedOn = String(data.get("logged_on") || form.dataset.editLoggedOn || easternDateKey()).slice(0, 10);
  try {
    if (mode === "gym") {
      const workoutSplit = String(data.get("workout_split") || "").trim();
       const rows = [...form.querySelectorAll(".exercise-row")].map(row => ({
         set_number: Number(row.dataset.setNumber || 1),
         exercise_name: String(row.querySelector('[name="exercise_name"]')?.value || "").trim(),
        resistance_type: String(row.querySelector('[name="resistance_type"]')?.value || "Weights"),
        weight_lbs: ["Bands", "Bodyweight"].includes(row.querySelector('[name="resistance_type"]')?.value) ? null : Number(row.querySelector('[name="weight_lbs"]')?.value || 0),
        band_resistance: row.querySelector('[name="resistance_type"]')?.value === "Bands" ? String(row.querySelector('[name="band_resistance"]')?.value || "").trim() : null,
        reps: Number(row.querySelector('[name="reps"]')?.value || 0),
         sets: 1
       })).filter(row => row.exercise_name && row.reps > 0 && (row.resistance_type === "Bands" ? row.band_resistance : true));
      if (!rows.length) return alert("Add at least one completed exercise set.");
      let session;
      if (editId) {
        const { data: updated, error: sessionError } = await db.from("training_sessions").update({ title: `${workoutSplit} workout`, workout_split: workoutSplit, notes: String(data.get("notes") || "").trim() || null, logged_on: loggedOn }).eq("id", editId).eq("user_id", userId).select().single();
        if (sessionError) throw sessionError;
        session = updated;
        const { error: deleteError } = await db.from("training_sets").delete().eq("session_id", editId).eq("user_id", userId);
        if (deleteError) throw deleteError;
      } else {
        const { data: inserted, error: sessionError } = await db.from("training_sessions").insert({
          user_id: userId, session_type: "Gym", title: `${workoutSplit} workout`, workout_split: workoutSplit,
          notes: String(data.get("notes") || "").trim() || null, logged_on: loggedOn
        }).select().single();
        if (sessionError) throw sessionError;
        session = inserted;
      }
      const { error: setError } = await db.from("training_sets").insert(rows.map(row => ({ ...row, user_id: userId, session_id: session.id, logged_on: loggedOn })));
      if (setError) throw setError;
    } else {
      const weights = [["AM", data.get("am_weight")], ["PM", data.get("pm_weight")]]
        .filter(([, value]) => value !== null && String(value).trim() !== "")
        .map(([measured_at, value]) => ({ user_id: userId, measured_at, weight_lbs: Number(value), logged_on: loggedOn }));
      const foodRows = [...form.querySelectorAll(".nutrition-row")];
      const namedFoodRows = foodRows.filter(row => String(row.querySelector('[name="food_name"]')?.value || "").trim());
      if (namedFoodRows.some(row => row.dataset.estimated !== "true")) return alert("Estimate each food after entering its quantity.");
      const foods = foodRows.map(row => ({
        record_id: row.dataset.recordId || null,
        food_name: String(row.querySelector('[name="food_name"]')?.value || "").trim(),
        quantity_text: String(row.querySelector('[name="quantity_text"]')?.value || "").trim(),
        calories: Number(row.querySelector('[name="calories"]')?.value || 0) || null,
        protein_g: Number(row.querySelector('[name="protein_g"]')?.value || 0) || null,
        carbs_g: Number(row.querySelector('[name="carbs_g"]')?.value || 0) || null,
        fiber_g: Number(row.querySelector('[name="fiber_g"]')?.value || 0) || null,
        fat_g: Number(row.querySelector('[name="fat_g"]')?.value || 0) || null,
        sugar_g: Number(row.querySelector('[name="sugar_g"]')?.value || 0) || null,
        notes: String(data.get("notes") || "").trim() || null,
        estimate_source: row.dataset.estimateSource || "AI",
        estimated_at: row.dataset.estimatedAt || new Date().toISOString(),
        user_id: userId, logged_on: loggedOn
      })).filter(row => row.food_name);
      if (editId && editKind === "weight") {
        const measuredAt = String(form.dataset.editMeasuredAt || "AM");
        const edited = weights.find(item => item.measured_at === measuredAt) || weights[0];
        if (!edited) return alert("Enter a weight before saving.");
        const { error } = await db.from("health_weight_logs").update({ measured_at: edited.measured_at, weight_lbs: edited.weight_lbs, logged_on: loggedOn }).eq("id", editId).eq("user_id", userId);
        if (error) throw error;
      } else if (editId && editKind === "food") {
        if (!foods[0]) return alert("Enter a food before saving.");
        const { record_id, ...food } = foods[0];
        const { error } = await db.from("health_food_logs").update(food).eq("id", editId).eq("user_id", userId);
        if (error) throw error;
      } else if (editKind === "health") {
        const weightIds = JSON.parse(form.dataset.editWeightIds || "{}");
        const submittedTimes = new Set(weights.map(item => item.measured_at));
        for (const [measuredAt, id] of Object.entries(weightIds)) {
          if (!submittedTimes.has(measuredAt)) {
            const { error } = await db.from("health_weight_logs").delete().eq("id", id).eq("user_id", userId);
            if (error) throw error;
          }
        }
        for (const weight of weights) {
          const id = weightIds[weight.measured_at];
          const request = id
            ? db.from("health_weight_logs").update({ measured_at: weight.measured_at, weight_lbs: weight.weight_lbs, logged_on: loggedOn }).eq("id", id).eq("user_id", userId)
            : db.from("health_weight_logs").insert(weight);
          const { error } = await request;
          if (error) throw error;
        }
        const submittedFoodIds = new Set(foods.map(item => item.record_id).filter(Boolean));
        const originalFoodIds = JSON.parse(form.dataset.editFoodIds || "[]");
        for (const id of originalFoodIds) {
          if (!submittedFoodIds.has(id)) {
            const { error } = await db.from("health_food_logs").delete().eq("id", id).eq("user_id", userId);
            if (error) throw error;
          }
        }
        for (const item of foods) {
          const { record_id, ...food } = item;
          const request = record_id
            ? db.from("health_food_logs").update(food).eq("id", record_id).eq("user_id", userId)
            : db.from("health_food_logs").insert(food);
          const { error } = await request;
          if (error) throw error;
        }
      } else {
        if (weights.length) { const { error } = await db.from("health_weight_logs").insert(weights); if (error) throw error; }
        if (foods.length) { const { error } = await db.from("health_food_logs").insert(foods.map(({ record_id, ...food }) => food)); if (error) throw error; }
      }
      if (!weights.length && !foods.length) return alert("Add a weigh-in or at least one food item.");
    }
    form.dataset.editId = "";
    form.dataset.editKind = "";
    form.dataset.editLoggedOn = "";
    form.dataset.editMeasuredAt = "";
    form.dataset.editWeightIds = "";
    form.dataset.editFoodIds = "";
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
  if (!db) { challenges.unshift({ ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() }); debounceRender(render); return; }
  const { error } = await db.from("mastery_challenges").insert(record); if (error) return alert(`Could not create transmission: ${error.message}`);
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function readApiResponse(response, routeName) {
  const body = await response.text();
  let result = null;
  try {
    result = body ? JSON.parse(body) : null;
  } catch {
    const deploymentHint = response.status === 404
      ? `The ${routeName} endpoint is not available on this deployment. Redeploy the current GitHub branch so the server route is included.`
      : `The ${routeName} endpoint returned a non-JSON response (HTTP ${response.status}).`;
    throw new Error(deploymentHint);
  }
  if (!response.ok) throw new Error(result?.error || `${routeName} failed with HTTP ${response.status}.`);
  return result || {};
}

async function actOnChallenge(id, action) {
  const challenge = challenges.find(item => item.id === id); if (!challenge) return;
  if (!db) { challenges = challenges.filter(item => action === "clear" ? item.id !== id : true).map(item => item.id === id ? { ...item, status: action === "accept" ? "accepted" : "denied" } : item); debounceRender(render); return; }
  if (action === "clear") { const { error } = await db.from("mastery_challenges").delete().eq("id", id); if (error) return alert(error.message); }
  else { const patch = action === "accept" ? { status: "accepted", accepted_at: new Date().toISOString() } : { status: "denied", denied_at: new Date().toISOString() }; const { error } = await db.from("mastery_challenges").update(patch).eq("id", id); if (error) return alert(error.message); }
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function clearLaneQueue(kind) {
  const queued = challenges.filter(item => item.lane === kind && !item.completed_at && ["generated", "accepted"].includes(item.status || "generated"));
  if (!queued.length || !confirm(`Clear ${queued.length} uncompleted ${kind} transmission${queued.length === 1 ? "" : "s"}? Completed work remains in your Mastery archive.`)) return;
  if (!db) { challenges = challenges.filter(item => !queued.some(target => target.id === item.id)); debounceRender(render); return; }
  const { error } = await db.from("mastery_challenges").delete().in("id", queued.map(item => item.id));
  if (error) return alert(error.message);
  await load(); window.dispatchEvent(new Event("aegis:mastery-changed"));
}

async function saveSystem(event) {
  event.preventDefault(); const form = event.currentTarget, mode = form.dataset.systemMode, data = new FormData(form); if (!db) return alert("Connect your private system database before using this feature.");
  let error;
  if (mode === "deep-work") ({ error } = await db.from("deep_work_logs").insert({ area: data.get("area"), logged_on: String(data.get("logged_on") || easternDateKey()).slice(0, 10), focus: String(data.get("focus")).trim(), duration_minutes: Number(data.get("duration_minutes")), output: String(data.get("output")).trim() }));
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
        const result = await readApiResponse(response, "mastery review");
        assessment = result.assessment;
      } catch (reviewError) {
        if (reviewStatus) reviewStatus.textContent = reviewError.message || "The accuracy check failed. This transmission was not filed.";
        return;
      }
    }
    ({ error } = await db.from("mastery_challenges").update({ summary, spoken_confirmed: data.get("spoken_confirmed") === "on", research_definition: definition || null, research_personal_meaning: personalMeaning || null, research_application: application || null, ai_assessment: assessment, status: "completed", completed_at: new Date().toISOString() }).eq("id", challenge.id));
    if (!error) ({ error } = await db.from("mastery_entries").insert({ category: challenge.category, logged_on: easternDateKey(), title: challenge.title, summary, key_lessons: `Completed ${challenge.lane === "mind" ? "research" : "activity"} transmission · ${String(challenge.difficulty).toUpperCase()} difficulty.`, action_items: `Potential bonus XP reserved: +${Number(challenge.xp_reward || 0)}. XP remains paused until the campaign is launched.` }));
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
    await loadCapabilities();
    const recovery = (missionResult.data || []).find(mission => mission.category === "Recovery"); const recoveryComplete = recovery && (recovery.completed || (recovery.completion_type === "units" && Number(recovery.completed_count) >= Number(recovery.target_count)));
    recoveryReady = Boolean(recoveryComplete && localStorage.getItem("aegis-recovery-archived") === "yes");
  } debounceRender(render, 50);
}

document.addEventListener("click", async event => {
  const laneButton = event.target.closest("[data-mastery-clean-lane]"), typeButton = event.target.closest("[data-mastery-clean-type]"), inputButton = event.target.closest("[data-mastery-clean-input]");
  if (laneButton) { lane = laneButton.dataset.masteryCleanLane; activeType = lane === "mind" ? "Book" : "Health"; saveView(); debounceRender(render); return; }
  const editEntry = event.target.closest("[data-mastery-edit-entry]");
  if (editEntry) { const entry = entries.find(item => String(item.id) === String(editEntry.dataset.masteryEditEntry)); if (entry) { lane = bodyTypes.includes(entry.category) ? "body" : "mind"; activeType = entry.category; saveView(); openDialog(entry); } return; }
  const deleteEntry = event.target.closest("[data-mastery-delete-entry]");
  if (deleteEntry) return deleteMasteryEntry(deleteEntry.dataset.masteryDeleteEntry);
  const editSession = event.target.closest("[data-mastery-edit-session]");
  if (editSession) { const session = trainingSessions.find(item => String(item.id) === String(editSession.dataset.masteryEditSession)); if (session) { lane = "body"; activeType = "Gym"; saveView(); openFitnessDialog("Gym", session); } return; }
  const editHealth = event.target.closest("[data-mastery-edit-health]");
  if (editHealth) { const today = easternDateKey(); lane = "body"; activeType = "Health"; saveView(); openFitnessDialog("Health", { logged_on: today, weights: weightLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today), foods: foodLogs.filter(item => String(item.logged_on || "").slice(0, 10) === today) }, "health"); return; }
  const editWeight = event.target.closest("[data-mastery-edit-weight]");
  if (editWeight) { const weight = weightLogs.find(item => String(item.id) === String(editWeight.dataset.masteryEditWeight)); if (weight) { lane = "body"; activeType = "Health"; saveView(); openFitnessDialog("Health", weight, "weight"); } return; }
  const editFood = event.target.closest("[data-mastery-edit-food]");
  if (editFood) { const food = foodLogs.find(item => String(item.id) === String(editFood.dataset.masteryEditFood)); if (food) { lane = "body"; activeType = "Health"; saveView(); openFitnessDialog("Health", food, "food"); } return; }
  if (inputButton) { const next = inputButton.dataset.masteryCleanInput; if (!isLocked(next)) { activeType = next; saveView(); openDialog(); } return; }
  if (typeButton) { const next = typeButton.dataset.masteryCleanType; if (!isLocked(next)) { activeType = next; saveView(); debounceRender(render); } return; }
  const capabilityAdd = event.target.closest("[data-capability-add]"); if (capabilityAdd) return openCapabilityDialog("add", capabilityAdd.dataset.capabilityAdd);
  const capabilityGenerate = event.target.closest("[data-capability-generate]"); if (capabilityGenerate) return createCapabilityRecommendation(capabilityGenerate.dataset.capabilityGenerate);
  const recommendationAccept = event.target.closest("[data-capability-accept]"); if (recommendationAccept) { const recommendation = capabilityRecommendations.find((item) => String(item.id) === String(recommendationAccept.dataset.capabilityAccept)); const variant = document.querySelector(`[data-capability-variant="${recommendationAccept.dataset.capabilityAccept}"]`)?.value || ""; if (recommendation) return acceptCapabilityRecommendation(recommendation, variant); }
  const recommendationDeny = event.target.closest("[data-capability-deny]"); if (recommendationDeny) { const { error } = await db.from("capability_recommendations").update({ status: "Denied", decided_at: new Date().toISOString() }).eq("id", recommendationDeny.dataset.capabilityDeny); if (error) return alert(error.message); await load(); return; }
  const recommendationDetails = event.target.closest("[data-capability-recommendation-details]"); if (recommendationDetails && !event.target.closest("button,select")) { const recommendation = capabilityRecommendations.find((item) => String(item.id) === String(recommendationDetails.dataset.capabilityRecommendationDetails)); if (recommendation) return openCapabilityRecommendation(recommendation); }
  const capabilityPause = event.target.closest("[data-capability-pause]"); if (capabilityPause) { const skill = capabilities.find((item) => String(item.id) === String(capabilityPause.dataset.capabilityPause)); if (skill) return pauseCapabilityCampaign(skill); }
  const capabilityContinue = event.target.closest("[data-capability-continue]"); if (capabilityContinue) { const skill = capabilities.find((item) => String(item.id) === String(capabilityContinue.dataset.capabilityContinue)); if (skill) return continueCapabilityCampaign(skill); }
  const capabilityLog = event.target.closest("[data-capability-log]"); if (capabilityLog) { const skill = capabilities.find((item) => String(item.id) === String(capabilityLog.dataset.capabilityLog)); if (skill) return openCapabilityDialog("log", skill.skill_type, skill); }
  if (event.target.closest("[data-mastery-clean-add]")) return openDialog();
  if (event.target.closest("[data-mastery-deep-work]")) return openSystemDialog("deep-work");
  const generate = event.target.closest("[data-mastery-generate]"); if (generate) return generateChallenge(generate.dataset.masteryGenerate);
  const accept = event.target.closest("[data-mastery-accept]"); if (accept) return actOnChallenge(accept.dataset.masteryAccept, "accept");
  const deny = event.target.closest("[data-mastery-deny]"); if (deny) return actOnChallenge(deny.dataset.masteryDeny, "deny");
  const clearLane = event.target.closest("[data-mastery-clear-lane]"); if (clearLane) return clearLaneQueue(clearLane.dataset.masteryClearLane);
  const complete = event.target.closest("[data-mastery-complete-challenge]"); if (complete) { const challenge = challenges.find(item => item.id === complete.dataset.masteryCompleteChallenge); if (challenge) openSystemDialog("complete", challenge); }
});

function startMastery() { if (window.__aegisMasteryCleanStarted) return; window.__aegisMasteryCleanStarted = true; buildDialogs(); load(); }
if (document.readyState === "complete") startMastery(); else window.addEventListener("load", startMastery, { once: true });
window.addEventListener("aegis:mastery-changed", (event) => {
  if (event.detail?.remote) setTimeout(load, 120);
});
