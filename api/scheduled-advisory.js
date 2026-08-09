const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";
const { CAMPAIGN_CHARTER } = require("../campaign-charter.js");

const schema = {
  type: "object", additionalProperties: false, required: ["morning", "signal", "evening", "sections", "roadmap", "directives"],
  properties: {
    morning: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
    signal: { type: "object", additionalProperties: false, required: ["jarvis", "alfred", "market_tone", "opportunity_window", "focus_area", "risk_posture"], properties: { jarvis: { type: "string" }, alfred: { type: "string" }, market_tone: { type: "string" }, opportunity_window: { type: "string" }, focus_area: { type: "string" }, risk_posture: { type: "string" } } },
    evening: { type: "object", additionalProperties: false, required: ["key_takeaways", "what_worked", "what_to_improve", "tomorrow_focus"], properties: {
      key_takeaways: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_worked: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_to_improve: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      tomorrow_focus: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } }
    } },
    sections: { type: "object", additionalProperties: false, required: ["detective", "missions", "enterprise", "recovery", "mastery", "character"], properties: {
      detective: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      missions: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      enterprise: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      recovery: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      mastery: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      character: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } }
    } },
    roadmap: { type: "array", maxItems: 1, items: { type: "object", additionalProperties: false, required: ["phase", "title", "category", "priority", "objective", "rationale", "evidence"], properties: { phase: { type: "integer", minimum: 0, maximum: 4 }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Mind", "Body"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, objective: { type: "string" }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } } } } },
    directives: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, required: ["advisor", "mission_kind", "title", "category", "priority", "rationale", "evidence", "cadence_key", "escalation_level"], properties: { advisor: { type: "string", enum: ["Jarvis", "Alfred"] }, mission_kind: { type: "string", enum: ["corrective", "challenge"] }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Mind", "Body"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } }, cadence_key: { type: "string" }, escalation_level: { type: "integer", minimum: 1, maximum: 3 } } } }
  }
};

const prompt = `You are the automated Jarvis/Alfred advisory system for a private five-year personal operating system. JARVIS is analytical and exact. ALFRED is grounded, demanding, and humane. Only use the evidence supplied. Do not give buy/sell/hold advice, price targets, position sizing, medical diagnoses, treatment plans, or instructions that conflict with clinicians. Discuss trading only as process quality, rule adherence, review, and risk discipline. Keep every message concise. Corrective missions are only for repeated/material evidence gaps and are non-negotiable. Challenge missions are optional stretch assignments. At most one corrective and two challenges. Use the exact JSON schema. The trading.authoritative_summary field is the final accounting record: never reinterpret it, never infer a perfect record from the closed-trade total, and never use a numerical trading claim that conflicts with it.`;

const sectionInstructions = `Every scan must refresh EVERY area, not only the Command Center. In sections: detective is strictly trade-log/process/risk-discipline advice; missions is prioritization and follow-through; enterprise is Special Projects / CCFX execution; recovery is clinician-safe recovery and logging; mastery is Mind/Body learning, training, and personal development; character is earned levels, evidence, streaks, and phase readiness. Jarvis and Alfred must give distinct advice in every section. Do not repeat the same message across sections.

For trading statistics, use ONLY the exact supplied values for closed trades, wins, losses, breakeven, win rate, month PnL, plan violations, current streak, longest win streak, and longest loss streak. The trading.authoritative_summary is authoritative. Never calculate a new statistic. Never call trades consecutive wins or losses unless an explicit streak value is supplied; closed-trade count is not a streak. Never describe results as perfect, loss-free, or 100% unless the authoritative summary explicitly proves it. If evidence is insufficient, say so plainly.

For mode "morning", direct the morning section toward today's plan, signal toward current attention/risk, and evening toward what should be evaluated later without claiming results that have not happened. For mode "evening", make the evening section a true review of today's evidence and make the morning section the first priority for the next operating day. Fitness evidence is for safe consistency and visible progressive-training trends only. When repeated exercise sets exist, compare load, reps, sets, and total volume, but only report visible trends. Treat food macros as rough estimates. Do not diagnose, prescribe rehab, or override clinicians. Do not create fitness-only corrective or challenge directives.

Two lanes: ROADMAP is the intentional five-year campaign toward a real-world Bruce Wayne / Tony Stark: capable body and recovery, disciplined Detective-grade trading process, intellectual range, financial independence, and useful enterprise. Return one roadmap item only when the supplied roadmap state has fewer than two active accepted items or shows a completed/obsolete item. Otherwise return []. DIRECTIVES are adaptive, not routine. Default to []. A corrective is non-negotiable only when the supplied history demonstrates a repeated meaningful pattern AND it directly repairs an accepted roadmap mission, active-phase requirement, or roadmap bottleneck. It may also impose a proportional consequence, but the consequence must reinforce the missed standard (extra evidence-based work or escalating XP loss), never be arbitrary. Escalation may rise only if that same pattern persists through past directives. A challenge is optional and only when a demonstrated strength has earned a stretch assignment; do not issue it if a recent challenge is in the supplied history. Never create a directive merely because a scan occurred. Jarvis and Alfred may each issue separate roadmap-supporting transmissions, but they must use the same active-phase priorities and must never contradict one another; if only one useful transmission exists, return only one. Deep-work logs, Director Reviews, and self-generated mastery transmissions inform advice and reflection, but must not independently trigger a corrective or challenge. At most one corrective and one challenge.`;

const curatedScanRules = `For every scan, deliberately curate every Jarvis and Alfred field from the supplied current context. Anchor each message to a specific current operation, mission, logged result, streak, training or recovery record, phase, or an explicit absence of evidence. Never use stock motivational quotes, random filler, invented details, or generic advice that could be shown to any user. If the data did not change, keep the advice precise and state which current standard still matters. Jarvis must emphasize the most material system signal and next action. Alfred must address the human standard, recovery, character, and follow-through without merely paraphrasing Jarvis. Treat activity_ledger as the reconciliation layer across pages, compare advisory_history before repeating advice, and treat generated mastery transmissions as evidence to review rather than automatic reasons to create corrective missions.`;

function easternClock() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

async function adminUser(serviceKey) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100`, { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) throw new Error("Could not resolve the AEGIS director account.");
  const body = await response.json();
  return (body.users || []).find((user) => String(user.email || "").toLowerCase() === DIRECTOR_EMAIL);
}

function rest(serviceKey, path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", ...(options.headers || {}) } });
}

function normalizedOutcome(value) {
  const supplied = String(value || "").trim().toLowerCase();
  if (supplied === "win" || supplied === "small win") return "win";
  if (supplied === "loss" || supplied === "small loss") return "loss";
  if (supplied === "b/e" || supplied === "be" || supplied === "break even" || supplied === "breakeven") return "be";
  return null;
}

// This must match Detective exactly. Scheduled scans use the same journal interpretation.
function tradeOutcome(trade) {
  if (String(trade.trade_status || "").trim().toLowerCase() === "open") return "open";
  const explicit = [trade.outcome, trade.win_loss, trade.result].map(normalizedOutcome).find(Boolean);
  if (explicit) return explicit;
  if (Number(trade.r_multiple) > 0) return "win";
  if (Number(trade.r_multiple) < 0) return "loss";
  return "be";
}

function tradeStreaks(trades) {
  const decisive = [...trades]
    .sort((left, right) => new Date(left.traded_at || left.created_at || 0) - new Date(right.traded_at || right.created_at || 0))
    .map(tradeOutcome)
    .filter((item) => item === "win" || item === "loss");
  let current_type = null, current_length = 0, longest_win = 0, longest_loss = 0;
  for (const result of decisive) {
    current_length = result === current_type ? current_length + 1 : 1;
    current_type = result;
    if (result === "win") longest_win = Math.max(longest_win, current_length);
    else longest_loss = Math.max(longest_loss, current_length);
  }
  return { current_type, current_length, longest_win, longest_loss };
}

async function buildContext(serviceKey, userId) {
  const query = (table, order, limit) => rest(serviceKey, `${table}?user_id=eq.${encodeURIComponent(userId)}&select=*&order=${order}&limit=${limit}`).then((response) => response.ok ? response.json() : []);
  const [operations, missions, trades, recovery, mastery, projects, phase, directives, roadmap, deepWork, challenges, directorReviews, trainingSessions, trainingSets, weightLogs, foodLogs, occurrences, activityEvents, accounts, advisoryHistory, contentItems, tradeReviews, progressEvents, campaign] = await Promise.all([
    query("operations", "scheduled_date.desc", 180), query("missions", "created_at.desc", 50), query("trade_debriefs", "traded_at.desc", 1000), query("recovery_logs", "logged_on.desc", 10), query("mastery_entries", "created_at.desc", 100), query("business_projects", "created_at.desc", 30), query("phase_protocols", "created_at.desc", 1), query("ai_mission_suggestions", "created_at.desc", 24), query("ai_roadmap_missions", "created_at.desc", 12), query("deep_work_logs", "created_at.desc", 60), query("mastery_challenges", "created_at.desc", 30), query("director_reviews", "updated_at.desc", 4), query("training_sessions", "logged_on.desc", 18), query("training_sets", "logged_on.desc", 120), query("health_weight_logs", "logged_on.desc", 28), query("health_food_logs", "logged_on.desc", 60), query("operation_occurrences", "occurrence_date.desc", 240), query("activity_events", "occurred_at.desc", 240), query("account_balances", "is_primary.desc", 8), query("ai_advisories", "created_at.desc", 6), query("content_items", "created_at.desc", 12), query("trade_reviews", "created_at.desc", 8), query("mission_progress_events", "occurred_at.desc", 24), query("xp_campaigns", "created_at.desc", 1)
  ]);
  const liveTrades = trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical");
  const closed = liveTrades.filter((trade) => tradeOutcome(trade) !== "open");
  const wins = closed.filter((trade) => tradeOutcome(trade) === "win").length;
  const losses = closed.filter((trade) => tradeOutcome(trade) === "loss").length;
  const streaks = tradeStreaks(closed);
  const recurringIds = new Set(operations.filter((operation) => ["daily", "weekly", "recurring"].includes(String(operation.schedule_mode || "").toLowerCase())).map((operation) => String(operation.id)));
  const occurrenceRows = occurrences.map((occurrence) => {
    const parent = operations.find((operation) => String(operation.id) === String(occurrence.operation_id)) || {};
    return { ...parent, id: `occurrence:${occurrence.id}`, operation_date: occurrence.occurrence_date, scheduled_date: occurrence.occurrence_date, completed_on: occurrence.completed_on, completed: occurrence.completed, status: occurrence.completed ? "Complete" : parent.status || "Queued" };
  });
  const effectiveOperations = [...operations.filter((operation) => !recurringIds.has(String(operation.id)) || !occurrences.some((occurrence) => String(occurrence.operation_id) === String(operation.id))), ...occurrenceRows];
  const openOperations = effectiveOperations.filter((item) => !item.completed && item.status !== "Complete");
  const activityByMetric = activityEvents.reduce((result, event) => { const key = event.metric_key || "unclassified"; result[key] = (result[key] || 0) + Number(event.quantity || 1); return result; }, {});
  return {
    active_phase: `Phase ${phase[0]?.active_phase ?? 0}`,
    operations: { open_total: openOperations.length, completed_total: effectiveOperations.length - openOperations.length, next: openOperations.slice(0, 8).map(({ title, category, status, scheduled_date, operation_date, scheduled_time }) => ({ title, category, status: status || "Queued", scheduled_date: scheduled_date || operation_date || null, scheduled_time: scheduled_time || null })) },
    missions: missions.filter((item) => !item.completed).slice(0, 8).map(({ title, category, priority, completion_definition }) => ({ title, category, priority, definition: completion_definition || null })),
    trading: { closed_trades: closed.length, wins, losses, breakeven: closed.length - wins - losses, win_rate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null, plan_violations: liveTrades.filter((trade) => trade.plan_violation).length, streaks, authoritative_summary: `${closed.length} closed trades: ${wins} wins, ${losses} losses, ${closed.length - wins - losses} break-even; win rate ${wins + losses ? Math.round((wins / (wins + losses)) * 100) : "N/A"}%.` },
    recovery: recovery.slice(0, 5), mastery: { total_entries: mastery.length, recent: mastery.slice(0, 8), deep_work: { recent_minutes: deepWork.filter((item) => Date.now() - new Date(item.created_at || item.logged_on).getTime() < 7 * 86400000).reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0), recent: deepWork.slice(0, 8).map((item) => ({ area: item.area, focus: item.focus, minutes: item.duration_minutes, output: item.output })) }, fitness: { sessions: trainingSessions.slice(0, 12).map((item) => ({ date: item.logged_on, split: item.workout_split || item.session_type, title: item.title, notes: item.notes || null })), recent_sets: trainingSets.slice(0, 60).map((item) => ({ date: item.logged_on, exercise: item.exercise_name, resistance_type: item.resistance_type || "Weights", weight_lbs: item.weight_lbs, band_resistance: item.band_resistance || null, reps: item.reps, set_number: item.set_number || 1 })), bodyweight: weightLogs.slice(0, 20).map((item) => ({ date: item.logged_on, time: item.measured_at, weight_lbs: item.weight_lbs })), nutrition: foodLogs.slice(0, 30).map((item) => ({ date: item.logged_on, food: item.food_name, quantity: item.quantity_text || null, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, fiber_g: item.fiber_g, sugar_g: item.sugar_g, estimate_source: item.estimate_source || null })) }, transmissions: { active: challenges.filter((item) => item.status === "accepted" && !item.completed_at).slice(0, 5).map((item) => ({ lane: item.lane, category: item.category, title: item.title, type: item.challenge_type, difficulty: item.difficulty })), recent_completed: challenges.filter((item) => item.completed_at).slice(0, 5).map((item) => ({ lane: item.lane, category: item.category, title: item.title, completed_at: item.completed_at })) }, director_review: directorReviews[0] ? { quarter: directorReviews[0].quarter_key, wins: directorReviews[0].wins, bottlenecks: directorReviews[0].bottlenecks, standards: directorReviews[0].standards, next_focus: directorReviews[0].next_focus } : null }, special_projects: projects.slice(0, 8),
    operation_occurrences: occurrenceRows.slice(0, 30).map(({ title, category, operation_date, completed, scheduled_time }) => ({ title, category, date: operation_date, completed: Boolean(completed), scheduled_time: scheduled_time || null })),
    activity_ledger: { total_events: activityEvents.length, by_metric: activityByMetric, recent: activityEvents.slice(0, 24).map((event) => ({ source: event.source_type, metric: event.metric_key, quantity: event.quantity || 1, occurred_at: event.occurred_at, metadata: event.metadata || {} })) },
    accounts: accounts.slice(0, 8).map((account) => ({ name: account.account_name, starting_balance: account.starting_balance, current_balance: account.current_balance, is_primary: Boolean(account.is_primary) })),
    advisory_history: advisoryHistory.slice(0, 6).map((item) => ({ type: item.advisory_type, created_at: item.created_at, signal: item.payload?.signal ? { jarvis: item.payload.signal.jarvis, alfred: item.payload.signal.alfred } : null, focus: item.payload?.evening?.tomorrow_focus || null })),
    enterprise_context: { projects: projects.slice(0, 8), content: contentItems.slice(0, 12) },
    trading_reviews: tradeReviews.slice(0, 8),
    mission_progress_events: progressEvents.slice(0, 24),
    xp_campaign: campaign[0] ? { started_at: campaign[0].started_at } : null,
    roadmap_state: { pending_or_active: roadmap.filter((item) => ["pending", "accepted"].includes(item.status)).map((item) => ({ title: item.title, phase: item.phase, category: item.category, status: item.status })), recent: roadmap.slice(0, 8).map((item) => ({ title: item.title, status: item.status, created_at: item.created_at })) },
    directive_history: directives.slice(0, 18).map((item) => ({ kind: item.mission_kind, title: item.title, status: item.status, escalation_level: item.escalation_level || 1, cadence_key: item.cadence_key || null, created_at: item.created_at, resolved_at: item.resolved_at }))
  };
}

async function askOpenAI(context, mode) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0, input: [{ role: "system", content: [{ type: "input_text", text: `${prompt}\n\n${sectionInstructions}\n\n${curatedScanRules}\n\n${CAMPAIGN_CHARTER}` }] }, { role: "user", content: [{ type: "input_text", text: `Generate the ${mode} automatic scan from this data:\n${JSON.stringify(context)}` }] }], text: { format: { type: "json_schema", name: "aegis_scheduled_advisory", strict: true, schema } } })
  });
  if (!response.ok) throw new Error("OpenAI did not return an advisory.");
  const payload = await response.json();
  const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  return JSON.parse(raw);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function scheduleMode(operation) {
  const mode = String(operation?.schedule_mode || "one_time").toLowerCase();
  return mode === "weekly" || mode === "recurring" ? "weekly" : mode === "daily" ? "daily" : "one_time";
}

function scheduledOn(operation, date) {
  const start = dateOnly(operation?.scheduled_date);
  if (!start || date < start) return false;
  const end = dateOnly(operation?.scheduled_end_date);
  if (end && date > end) return false;
  const mode = scheduleMode(operation);
  if (mode === "one_time") return date === start;
  if (mode === "daily") return true;
  return new Date(`${start}T12:00:00Z`).getUTCDay() === new Date(`${date}T12:00:00Z`).getUTCDay();
}

function operationIdentity(operation) {
  return [operation?.title, operation?.category, operation?.mission_id, operation?.metric_key, operation?.scheduled_time]
    .map((value) => String(value || "").trim().toLowerCase()).join("|");
}

function dailySeedFor(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const splits = ["Rest", "Legs", "Push", "Pull", "Rest", "Upper Body", "Lower Body"];
  const split = splits[weekday];
  const isRest = split === "Rest";
  return [
    { title: "Review charts and document one lesson", category: "Trading", brief: "Review one relevant chart or completed trade, capture one process lesson, and file it in Detective or Self Mastery.", metric_key: null },
    { title: "Conquer the morning", category: "Self Mastery", brief: "Begin the day with one deliberate first action, protect the first block from avoidable distraction, and execute the morning standard before reactive work.", metric_key: null },
    { title: "Read one chapter", category: "Self Mastery", brief: "Read one chapter from your current book without notifications, then capture one useful idea, quote, or action in Self Mastery.", metric_key: "chapters_read" },
    { title: "Journal", category: "Self Mastery", brief: "Write the facts, name what is within your control, and record one lesson or next right action.", metric_key: "mastery.entry" },
    { title: isRest ? "Recovery — rest and reset" : `Gym — ${split}`, category: isRest ? "Recovery" : "Body", brief: isRest ? "Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan." : `Complete the ${split} session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.`, metric_key: "gym_session" },
  ];
}

async function rolloverOperations(serviceKey, userId, date) {
  const response = await rest(serviceKey, `operations?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!response.ok) throw new Error("Could not load operations for the morning rollover.");
  const records = await response.json();
  const current = records.filter((operation) => dateOnly(operation.operation_date) === date || dateOnly(operation.scheduled_date) === date);
  const currentKeys = new Set(current.map(operationIdentity));
  const inserts = [];

  dailySeedFor(date).forEach((seed) => {
    if (current.some((operation) => String(operation.title || "").trim().toLowerCase() === seed.title.toLowerCase() && (dateOnly(operation.operation_date) === date || dateOnly(operation.scheduled_date) === date))) return;
    const source = records
      .filter((operation) => String(operation.title || "").trim().toLowerCase() === seed.title.toLowerCase() && Boolean(operation.is_daily))
      .sort((left, right) => String(right.operation_date || right.created_at || "").localeCompare(String(left.operation_date || left.created_at || "")))[0];
    inserts.push({
      user_id: userId,
      title: seed.title,
      category: seed.category,
      brief: seed.brief,
      metric_key: source?.metric_key || seed.metric_key,
      mission_id: source?.mission_id || null,
      mission_increment: source?.mission_increment || 1,
      status: "Queued",
      completed: false,
      scheduled_date: date,
      scheduled_time: source?.scheduled_time || null,
      schedule_mode: "one_time",
      scheduled_end_date: null,
      operation_date: date,
      is_daily: true,
    });
  });

  const customDaily = records
    .filter((operation) => Boolean(operation.is_daily) && scheduleMode(operation) === "one_time")
    .filter((operation) => dateOnly(operation.operation_date) && dateOnly(operation.operation_date) < date)
    .filter((operation) => !/^gym — |^recovery — rest and reset$/i.test(String(operation.title || "")))
    .sort((left, right) => String(right.operation_date || right.created_at || "").localeCompare(String(left.operation_date || left.created_at || "")));
  const latestDaily = new Map();
  customDaily.forEach((operation) => {
    const key = operationIdentity(operation);
    if (!latestDaily.has(key)) latestDaily.set(key, operation);
  });
  latestDaily.forEach((source, key) => {
    if (currentKeys.has(key) || inserts.some((operation) => operationIdentity(operation) === key)) return;
    inserts.push({
      user_id: userId,
      title: source.title,
      category: source.category,
      brief: source.brief || source.details || null,
      details: source.details || null,
      metric_key: source.metric_key || null,
      mission_id: source.mission_id || null,
      mission_increment: source.mission_increment || 1,
      status: "Queued",
      completed: false,
      scheduled_date: date,
      scheduled_time: source.scheduled_time || null,
      schedule_mode: "one_time",
      scheduled_end_date: null,
      operation_date: date,
      is_daily: true,
    });
  });

  let created = [];
  if (inserts.length) {
    const inserted = await rest(serviceKey, "operations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(inserts) });
    if (!inserted.ok) throw new Error("Could not create today’s operations during the morning rollover.");
    created = await inserted.json();
  }

  const recurring = records.filter((operation) => scheduleMode(operation) !== "one_time" && operation.id && scheduledOn(operation, date));
  let occurrences = 0;
  if (recurring.length) {
    const occurrenceResponse = await rest(serviceKey, `operation_occurrences?user_id=eq.${encodeURIComponent(userId)}&occurrence_date=eq.${date}&select=operation_id`);
    const existing = occurrenceResponse.ok ? await occurrenceResponse.json() : [];
    const existingIds = new Set(existing.map((row) => String(row.operation_id)));
    const missing = recurring.filter((operation) => !existingIds.has(String(operation.id))).map((operation) => ({
      user_id: userId,
      operation_id: operation.id,
      occurrence_date: date,
      scheduled_time: operation.scheduled_time || operation.recurrence_time || null,
      status: operation.scheduled_time ? "Scheduled" : "Queued",
      completed: false,
    }));
    if (missing.length) {
      const inserted = await rest(serviceKey, "operation_occurrences", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(missing) });
      if (inserted.ok) occurrences = (await inserted.json()).length;
    }
  }
  return { operations: created.length, occurrences };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.CRON_SECRET) return res.status(503).json({ error: "Scheduled intelligence is not configured." });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized scheduled request." });
  try {
    const clock = easternClock();
    const requestedMode = new URL(req.url, "https://aegis-command.local").searchParams.get("mode");
    // The only automated scan is the 5am morning pass. Bedtime debriefs are
    // initiated by the signed-in user through /api/advisory, never by cron.
    const mode = requestedMode === "morning" || (!requestedMode && clock.hour === 5) ? "morning" : null;
    if (!mode) return res.status(204).end();
    const director = await adminUser(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!director) throw new Error("Director account not found.");
    const rollover = clock.hour === 5 ? await rolloverOperations(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id, clock.date) : { operations: 0, occurrences: 0 };
    const recent = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `ai_advisories?user_id=eq.${director.id}&select=advisory_type,payload&order=created_at.desc&limit=12`).then((response) => response.ok ? response.json() : []);
    if (recent.some((item) => item.advisory_type === mode && item.payload?.schedule_date === clock.date)) return res.status(200).json({ status: "already-complete", mode, date: clock.date });
    const advisory = await askOpenAI(await buildContext(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id), mode);
    advisory.schedule_date = clock.date;
    const stored = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_advisories", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: director.id, advisory_type: mode, payload: advisory }) });
    if (!stored.ok) throw new Error("Could not store the scheduled advisory.");
    const [record] = await stored.json();
    const directives = advisory.directives || [];
    const roadmap = advisory.roadmap || [];
    if (directives.length) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_mission_suggestions", { method: "POST", body: JSON.stringify(directives.map((item) => ({ ...item, user_id: director.id, advisory_id: record.id }))) });
    if (roadmap.length) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_roadmap_missions", { method: "POST", body: JSON.stringify(roadmap.map((item) => ({ ...item, user_id: director.id, advisory_id: record.id }))) });
    const corrective = directives.filter((item) => item.mission_kind === "corrective");
    for (const item of corrective) {
      const existing = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `missions?user_id=eq.${director.id}&title=eq.${encodeURIComponent(item.title)}&completed=eq.false&select=id&limit=1`).then((response) => response.ok ? response.json() : []);
      if (!existing.length) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "missions", { method: "POST", body: JSON.stringify({ user_id: director.id, title: item.title, category: item.category, priority: "Do now", completion_type: "binary", completion_definition: `System corrective from ${item.advisor}: ${item.rationale}`, completed: false, completed_count: 0, progress: 0 }) });
    }
    return res.status(200).json({ status: "complete", mode, date: clock.date, rollover, directives: directives.length, roadmap: roadmap.length });
  } catch (error) { return res.status(500).json({ error: String(error.message || error) }); }
};
