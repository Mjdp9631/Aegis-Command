const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";
const { CAMPAIGN_CHARTER } = require("../campaign-charter.js");
const { buildContext: sharedBuildContext, sanitizeAdvisory } = require("../ai-context.js");

const schema = {
  type: "object", additionalProperties: false, required: ["morning", "signal", "evening", "sections", "roadmap", "directives"],
  properties: {
    morning: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
    signal: { type: "object", additionalProperties: false, required: ["jarvis", "alfred", "market_tone", "opportunity_window", "focus_area", "risk_posture"], properties: { jarvis: { type: "string" }, alfred: { type: "string" }, market_tone: { type: "string" }, opportunity_window: { type: "string" }, focus_area: { type: "string" }, risk_posture: { type: "string" } } },
    evening: { type: "object", additionalProperties: false, required: ["key_takeaways", "what_worked", "what_to_improve", "tomorrow_focus"], properties: {
      key_takeaways: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_worked: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_to_improve: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      tomorrow_focus: { type: "object", additionalProperties: false, required: ["jarvis", "alfred", "operation_title"], properties: { jarvis: { type: "string" }, alfred: { type: "string" }, operation_title: { type: "string", minLength: 3, maxLength: 100 } } }
    } },
    sections: { type: "object", additionalProperties: false, required: ["detective", "missions", "enterprise", "recovery", "mastery", "character"], properties: {
      detective: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      missions: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      enterprise: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      recovery: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      mastery: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      character: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } }
    } },
    roadmap: { type: "array", maxItems: 1, items: { type: "object", additionalProperties: false, required: ["phase", "title", "category", "priority", "objective", "rationale", "evidence", "evidence_ids"], properties: { phase: { type: "integer", minimum: 0, maximum: 4 }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Self Mastery", "Life Admin"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, objective: { type: "string" }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } }, evidence_ids: { type: "array", maxItems: 6, items: { type: "string" } } } } },
    directives: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, required: ["advisor", "mission_kind", "title", "category", "priority", "rationale", "evidence", "evidence_ids", "cadence_key", "escalation_level"], properties: { advisor: { type: "string", enum: ["Jarvis", "Alfred"] }, mission_kind: { type: "string", enum: ["corrective", "challenge"] }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Self Mastery", "Life Admin"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } }, evidence_ids: { type: "array", maxItems: 6, items: { type: "string" } }, cadence_key: { type: "string" }, escalation_level: { type: "integer", minimum: 1, maximum: 3 } } } }
  }
};

const prompt = `You are the automated Jarvis/Alfred advisory system for a private five-year personal operating system. JARVIS is analytical and exact. ALFRED is grounded, demanding, and humane. Only use the evidence supplied. Do not give buy/sell/hold advice, price targets, position sizing, medical diagnoses, treatment plans, or instructions that conflict with clinicians. Discuss trading only as process quality, rule adherence, review, and risk discipline. Keep every message concise. Corrective missions are only for repeated/material evidence gaps and are non-negotiable. A complete absence of logged evidence for two or more operating days is itself a material evidence gap and should produce one corrective mission to re-establish the evidence loop. When recent evidence exists and no challenge was issued in the previous three operating days, issue one useful non-corrective challenge tied to the evidence. Challenge missions are optional stretch assignments, not filler. At most one corrective and two challenges. Ongoing operations roll to the current operating day until completed; if derived_insights.ongoing_operations or operations.ongoing_attention flags an item at the attention threshold, raise awareness and identify the bottleneck, but do not automatically create a mission from duration alone. Use the exact JSON schema. The trading.authoritative_summary field is the final accounting record: never reinterpret it, never infer a perfect record from the closed-trade total, and never use a numerical trading claim that conflicts with it.`;

const marketRules = `Market rules: the user's primary market is Forex, open Sunday at 5:00 PM Eastern through Friday at 5:00 PM Eastern. Crypto can trade continuously, but the user trades it rarely; do not assume crypto activity without a logged crypto trade. The user does not need to trade every day, and a no-trade day is not a failure or evidence gap by itself. Do not create a trading corrective merely because no trade occurred. A complete absence of any logged evidence for two or more operating days is different from simply not taking a trade.`;

const sectionInstructions = `Every scan must refresh EVERY area, not only the Command Center. In sections: detective is strictly trade-log/process/risk-discipline advice; missions is prioritization and follow-through; enterprise is Special Projects / CCFX execution; recovery is clinician-safe recovery and logging; mastery is Mind/Body learning, training, and personal development; character is earned levels, evidence, streaks, and phase readiness. Jarvis and Alfred must give distinct advice in every section. Do not repeat the same message across sections.

For trading statistics, use ONLY the exact supplied values for closed trades, wins, losses, breakeven, win rate, month PnL, plan violations, current streak, longest win streak, and longest loss streak. The trading.authoritative_summary is authoritative. Never calculate a new statistic. Never call trades consecutive wins or losses unless an explicit streak value is supplied; closed-trade count is not a streak. Never describe results as perfect, loss-free, or 100% unless the authoritative summary explicitly proves it. If evidence is insufficient, say so plainly.

For mode "morning", direct the morning section toward today's plan, signal toward current attention/risk, and evening toward what should be evaluated later without claiming results that have not happened. For mode "evening", make the evening section a true review of today's evidence and make the morning section the first priority for the next operating day. Fitness evidence is for safe consistency and visible progressive-training trends only. When repeated exercise sets exist, compare load, reps, sets, and total volume, but only report visible trends. Treat food macros as rough estimates. Do not diagnose, prescribe rehab, or override clinicians. Do not create fitness-only corrective or challenge directives.

Two lanes: ROADMAP is the intentional five-year campaign toward a real-world Bruce Wayne / Tony Stark: capable body and recovery, disciplined Detective-grade trading process, intellectual range, financial independence, and useful enterprise. Return one roadmap item only when the supplied roadmap state has fewer than two active accepted items or shows a completed/obsolete item. Otherwise return []. DIRECTIVES are adaptive, not routine. Default to []. A corrective is non-negotiable when the supplied history demonstrates a repeated meaningful pattern, a roadmap bottleneck, or a complete absence of logged evidence for two or more operating days. It must directly repair the gap. It may also impose a proportional consequence, but the consequence must reinforce the missed standard (extra evidence-based work or escalating XP loss), never be arbitrary. Escalation may rise only if that same pattern persists through past directives. A challenge is optional and only when a demonstrated strength has earned a stretch assignment; do not issue it if a recent challenge is in the supplied history. Never create a directive merely because a scan occurred. Jarvis and Alfred may each issue separate roadmap-supporting transmissions, but they must use the same active-phase priorities and must never contradict one another; if only one useful transmission exists, return only one. Deep-work logs, Director Reviews, and self-generated mastery transmissions inform advice and reflection, but must not independently trigger a corrective or challenge. At most one corrective and one challenge.`;

const curatedScanRules = `For every scan, deliberately curate every Jarvis and Alfred field from the supplied current context. Anchor each message to a specific current operation, mission, logged result, streak, training or recovery record, phase, or an explicit absence of evidence. Never use stock motivational quotes, random filler, invented details, or generic advice that could be shown to any user. If the data did not change, keep the advice precise and state which current standard still matters. Jarvis must emphasize the most material system signal and next action. Alfred must address the human standard, recovery, character, and follow-through without merely paraphrasing Jarvis. Treat activity_ledger as the reconciliation layer across pages, compare advisory_history before repeating advice, and treat generated mastery transmissions as evidence to review rather than automatic reasons to create corrective missions. Treat a long-running operation as an awareness signal first: name it when relevant, preserve its original start date, and do not convert elapsed time into a corrective mission without independent repeated evidence.`;
const derivedInsightRules = `Use derived_insights as the central cross-domain context builder. It contains deterministic comparisons between operations, morning readiness, recovery, learning, trading process, mission outcomes, recommendation feedback, XP reward evidence, and blind AI scenario PnL. Treat those results as associations, never causal proof. Always respect the reported sample_size and caution text; do not call a small cohort a pattern. Use capability_system to distinguish practical skills from adversarial problem-solving skills and recommend practice from the recorded gap. Use business_financial_foundation to evaluate runway, reserves, debt, income, and business revenue without giving regulated financial advice. Use special_projects to evaluate real output, next action, and progress. Use recommendation outcome_chain to evaluate whether a prior AI recommendation was accepted, completed, rated, or rejected. Use ai_scenario_ledger to report the AI's blind-call ledger separately from the user's actual PnL. Use xp_integrity only to reconcile explicitly observed reward metadata; never infer missing XP. Never replace authoritative trading totals with a derived cohort metric, and do not create a corrective mission from a single comparison.`;
const debriefRules = `For bedtime and evening debriefs, use at least two distinct references: one concrete operating-day record and one comparison or historical reference from derived_insights, mission outcomes, feedback, scenario results, or advisory_history. Do not repeat the previous debrief's wording; if a pattern is unchanged, name the new or repeated evidence and its operational implication. Return tomorrow_focus.operation_title as a concise, actionable 3–8 word operation title that can be deduplicated against the next-day queue.`;

function easternClock() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

function shiftDay(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function validOperatingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Forex closes Friday at 5 PM Eastern and reopens Sunday at 5 PM Eastern.
// The generated pre-market path therefore runs Sunday through Thursday only.
function isPreMarketAnalysisDay(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || (weekday >= 1 && weekday <= 4);
}

function isDailyPreMarket(operation) {
  return Boolean(operation?.is_daily) && String(operation?.title || "").trim().toLowerCase() === "pre-market analysis";
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
  if (Number(trade.pnl_percent) > 0) return "win";
  if (Number(trade.pnl_percent) < 0) return "loss";
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

async function buildContext(serviceKey, userId, operatingDate, mode = "morning") {
  const query = (table, order, limit) => rest(serviceKey, `${table}?user_id=eq.${encodeURIComponent(userId)}&select=*&order=${order}&limit=${limit}`).then((response) => response.ok ? response.json() : []);
  const [operations, missions, trades, recovery, mastery, projects, phase, directives, roadmap, deepWork, challenges, directorReviews, trainingSessions, trainingSets, weightLogs, foodLogs, occurrences, activityEvents, accounts, groups, withdrawals, advisoryHistory, feedback, calibrationReviews, contentItems, tradeReviews, tradeReviewCorrections, progressEvents, campaign, scenarios, capabilitySkills, capabilityLogs, financialFoundations] = await Promise.all([
    query("operations", "scheduled_date.desc", 180), query("missions", "created_at.desc", 50), query("trade_debriefs", "traded_at.desc", 1000), query("recovery_logs", "logged_on.desc", 10), query("mastery_entries", "logged_on.desc", 100), query("business_projects", "logged_on.desc", 30), query("phase_protocols", "created_at.desc", 1), query("ai_mission_suggestions", "created_at.desc", 24), query("ai_roadmap_missions", "created_at.desc", 12), query("deep_work_logs", "logged_on.desc", 60), query("mastery_challenges", "created_at.desc", 30), query("director_reviews", "updated_at.desc", 4), query("training_sessions", "logged_on.desc", 18), query("training_sets", "logged_on.desc", 120), query("health_weight_logs", "logged_on.desc", 28), query("health_food_logs", "logged_on.desc", 60), query("operation_occurrences", "occurrence_date.desc", 240), query("activity_events", "occurred_at.desc", 240), query("account_balances", "is_primary.desc", 8), query("account_groups", "created_at.desc", 24), query("account_group_withdrawals", "withdrawn_at.desc", 24), query("ai_advisories", "created_at.desc", 6), query("ai_recommendation_feedback", "created_at.desc", 60), query("ai_calibration_reviews", "week_start.desc", 4), query("content_items", "logged_on.desc", 12), query("trade_reviews", "created_at.desc", 8), query("trade_review_corrections", "created_at.desc", 100), query("mission_progress_events", "occurred_at.desc", 24), query("xp_campaigns", "created_at.desc", 1), query("ai_trade_scenarios", "created_at.desc", 100), query("capability_skills", "updated_at.desc", 40), query("capability_skill_logs", "practiced_on.desc", 120), query("financial_foundations", "updated_at.desc", 1)
  ]);
  const datedMastery = mastery.map((entry) => ({ ...entry, created_at: entry.logged_on || entry.created_at }));
  const datedDeepWork = deepWork.map((entry) => ({ ...entry, created_at: entry.logged_on || entry.created_at }));
  const datedProjects = projects.map((project) => ({ ...project, created_at: project.logged_on || project.created_at }));
  const datedContent = contentItems.map((item) => ({ ...item, created_at: item.logged_on || item.created_at }));
  return sharedBuildContext({ operations, occurrences, missions, trades, recovery, mastery: datedMastery, projects: datedProjects, capabilities: capabilitySkills, capabilityLogs, financialFoundation: financialFoundations[0] || null, phase, directives, roadmap, deepWork: datedDeepWork, challenges, directorReviews, trainingSessions, trainingSets, weightLogs, foodLogs, activityEvents, accounts, groups, withdrawals, advisoryHistory, feedback, calibration: calibrationReviews, contentItems: datedContent, tradeReviews, tradeReviewCorrections, scenarios, progressEvents, campaign }, operatingDate, mode);
  const liveTrades = trades.filter((trade) => !["theoretical", "backtest", "backtesting", "hindsight"].includes(String(trade.account || "").trim().toLowerCase()));
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
    accounts: accounts.slice(0, 8).map((account) => ({ name: account.account_name, starting_balance: account.starting_balance, balance_basis: account.current_balance != null || account.balance != null ? "reported_current_balance" : "starting_balance_only", current_balance: account.current_balance ?? account.balance ?? null, type: account.account_type || "Live", is_primary: Boolean(account.is_primary) })),
    account_groups: groups.slice(0, 12).map((group) => ({ name: group.name, type: group.account_type, payout_split_percent: group.account_type === "Prop Firm" ? group.profit_split_percent : 100 })),
    withdrawal_ledger: withdrawals.slice(0, 12).map((withdrawal) => ({ group_id: withdrawal.group_id, date: withdrawal.withdrawn_at, gross_total: withdrawal.gross_total_usd, tracked_payout_total: withdrawal.payout_total_usd, payout_split_percent: withdrawal.profit_split_percent, account_count: withdrawal.account_count })),
    advisory_history: advisoryHistory.slice(0, 6).map((item) => ({ type: item.advisory_type, created_at: item.created_at, signal: item.payload?.signal ? { jarvis: item.payload.signal.jarvis, alfred: item.payload.signal.alfred } : null, focus: item.payload?.evening?.tomorrow_focus || null })),
    enterprise_context: { projects: projects.slice(0, 8), content: contentItems.slice(0, 12) },
    trading_reviews: tradeReviews.slice(0, 8),
    mission_progress_events: progressEvents.slice(0, 24),
    xp_campaign: campaign[0] ? { started_at: campaign[0].started_at } : null,
    roadmap_state: { pending_or_active: roadmap.filter((item) => ["pending", "accepted"].includes(item.status)).map((item) => ({ title: item.title, phase: item.phase, category: item.category, status: item.status })), recent: roadmap.slice(0, 8).map((item) => ({ title: item.title, status: item.status, created_at: item.created_at })) },
    directive_history: directives.slice(0, 18).map((item) => ({ kind: item.mission_kind, title: item.title, status: item.status, escalation_level: item.escalation_level || 1, cadence_key: item.cadence_key || null, created_at: item.created_at, resolved_at: item.resolved_at }))
  };
}

function weekStart(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value.toISOString().slice(0, 10);
}

async function saveCalibrationReview(serviceKey, userId, date, context) {
  const start = weekStart(date);
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) return false;
  const existing = await rest(serviceKey, `ai_calibration_reviews?user_id=eq.${encodeURIComponent(userId)}&week_start=eq.${start}&select=id&limit=1`);
  if (existing.ok && (await existing.json()).length) return false;
  const feedback = context.recommendation_feedback || [];
  const outcomes = context.mission_outcomes || [];
  const counts = feedback.reduce((result, item) => { result[item.feedback_type] = (result[item.feedback_type] || 0) + 1; return result; }, {});
  const completed = outcomes.filter((item) => item.completed).length;
  const rated = outcomes.filter((item) => Number(item.outcome_rating) > 0);
  const averageRating = rated.length ? Number((rated.reduce((sum, item) => sum + Number(item.outcome_rating), 0) / rated.length).toFixed(1)) : null;
  const adjustments = [];
  if ((counts.irrelevant || 0) + (counts.wrong || 0) > (counts.useful || 0)) adjustments.push("Tighten evidence matching before issuing another recommendation.");
  if (counts.too_easy) adjustments.push("Increase challenge specificity and measurable finish lines.");
  if (counts.already_done) adjustments.push("Check active missions and recent evidence before proposing repeats.");
  if (!adjustments.length) adjustments.push("Maintain the current evidence-linked recommendation standard.");
  const payload = { user_id: userId, week_start: start, summary: `${feedback.length} recommendation ratings, ${completed} completed tracked missions${averageRating ? `, average mission rating ${averageRating}/5` : ""}.`, adjustments, source_counts: { feedback: counts, completed_missions: completed, rated_missions: rated.length } };
  const response = await rest(serviceKey, "ai_calibration_reviews", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(payload) });
  return response.ok;
}

async function askOpenAI(context, mode) {
  const modeRules = mode === "morning"
    ? "This is the 5am morning scan. Use evidence_date as the previous operating day. First interpret the previous day's logs, then give today's directive and operational priorities. Do not create a bedtime debrief or rewrite historical evidence."
    : "This scan is read-only and must not recommend or create operation changes.";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0, input: [{ role: "system", content: [{ type: "input_text", text: `${prompt}\n\n${marketRules}\n\n${sectionInstructions}\n\n${curatedScanRules}\n\n${derivedInsightRules}\n\n${debriefRules}\n\n${modeRules}\n\n${CAMPAIGN_CHARTER}` }] }, { role: "user", content: [{ type: "input_text", text: `Generate the ${mode} automatic scan from this data:\n${JSON.stringify(context)}` }] }], text: { format: { type: "json_schema", name: "aegis_scheduled_advisory", strict: true, schema } } })
  });
  if (!response.ok) throw new Error("OpenAI did not return an advisory.");
  const payload = await response.json();
  const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  return JSON.parse(raw);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function latestEvidenceDay(context, throughDate = "") {
  const values = [
    ...(context?.activity_ledger?.recent || []).map((item) => item.occurred_at),
    ...(context?.trading?.recent || []).map((item) => item.date || item.traded_at),
    ...(context?.mastery?.recent || []).map((item) => item.date || item.created_at),
    ...(context?.recovery || []).map((item) => item.logged_on || item.created_at),
    ...(context?.mastery?.fitness?.sessions || []).map((item) => item.date || item.logged_on),
  ].map(dateOnly).filter((value) => value && (!throughDate || value <= throughDate));
  return values.sort().at(-1) || "";
}

function addInactivityDirective(advisory, context, operatingDate) {
  const directives = advisory.directives || [];
  const history = context.directive_history || [];
  const latest = latestEvidenceDay(context, context.evidence_date || operatingDate);
  const gap = latest ? Math.floor((Date.parse(`${operatingDate}T12:00:00Z`) - Date.parse(`${latest}T12:00:00Z`)) / 86400000) : 2;
  const latestEvidenceIds = (context.evidence_catalog || []).filter((item) => item.date === latest).slice(0, 3).map((item) => item.id);
  const activeMissionTitles = new Set((context.missions || []).map((item) => item.title));
  const hasCorrective = directives.some((item) => item.mission_kind === "corrective")
    || history.some((item) => item.kind === "corrective" && ["pending", "accepted"].includes(item.status))
    || history.some((item) => item.kind === "corrective" && item.status === "acknowledged" && activeMissionTitles.has(item.title));
  if (gap >= 2 && !hasCorrective) {
    const title = "Re-establish the daily evidence loop";
    const alreadyOpen = [...(context.missions || []), ...history]
      .some((item) => item.title === title && item.status !== "declined");
    if (!alreadyOpen) return {
      ...advisory,
      directives: [{
        advisor: "Alfred",
        mission_kind: "corrective",
        title,
        category: "Self Mastery",
        priority: "Do now",
        rationale: `No meaningful AEGIS evidence has been logged for ${gap} operating days. Complete one real action today and record the evidence so the system can coach from facts again.`,
        evidence: [latest ? `Last recorded evidence: ${latest}` : "No recent evidence was found in the activity ledger."],
        evidence_ids: latestEvidenceIds,
        cadence_key: "inactivity-evidence-loop",
        escalation_level: 1,
      }, ...directives].slice(0, 2),
    };
    return advisory;
  }
  // Once the evidence loop is active, make a non-corrective transmission
  // eligible every third operating day instead of waiting for a rare model
  // decision. Never issue one while an unresolved challenge is still fresh.
  if (gap >= 2 || directives.some((item) => item.mission_kind === "challenge")) return advisory;
  const recentChallenge = history.find((item) => item.kind === "challenge" && item.status !== "declined" && item.created_at
    && Date.now() - Date.parse(item.created_at) < 3 * 86400000);
  if (recentChallenge) return advisory;
  const challengePool = [
    ["Capture one process lesson from today’s strongest signal", "Trading", "Review one current or recent decision, write the most important process lesson, and file the evidence."],
    ["Complete one focused mastery block", "Self Mastery", "Protect 30 minutes for deliberate learning, then record the idea and how it changes your next action."],
    ["Make one recovery standard visible", "Recovery", "Complete one safe recovery or preparation action and log what you did instead of leaving the standard implicit."],
  ];
  const seed = operatingDate.replace(/-/g, "").split("").reduce((sum, value) => sum + Number(value), 0);
  const [title, category, rationale] = challengePool[seed % challengePool.length];
  const alreadyOpen = [...(context.missions || []), ...history]
    .some((item) => item.title === title && item.status !== "declined");
  if (alreadyOpen) return advisory;
  return {
    ...advisory,
    directives: [{
      advisor: "Jarvis",
      mission_kind: "challenge",
      title,
      category,
      priority: "Schedule",
      rationale,
      evidence: [latest ? `Recent evidence is available through ${latest}.` : "Recent evidence is available."],
      evidence_ids: latestEvidenceIds,
      cadence_key: "three-day-challenge-cadence",
      escalation_level: 1,
    }, ...directives].slice(0, 2),
  };
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

const GYM_WEEKLY_SPLITS = ["Legs", "Push", "Pull", "Lower Body", "Upper Body"];
const GYM_REST_DAYS_PER_WEEK = 2;
const GYM_MAX_CONSECUTIVE_TRAINING_DAYS = 3;
const gymWeekStart = (date) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};
const shiftDate = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const gymSlotDate = (operation) => dateOnly(operation?.operation_date || operation?.scheduled_date);
const gymTitle = (operation) => String(operation?.title || "").trim();
const isGymTrainingSlot = (operation) => /^gym\s*(?:-|\u2013|\u2014)/i.test(gymTitle(operation));
const isGymRestSlot = (operation) => /^(?:rest\s*(?:-|\u2013|\u2014).*recovery|recovery\s*(?:-|\u2013|\u2014).*rest)/i.test(gymTitle(operation));
const isFlexibleRestDay = (operation) => /flexible rest day/i.test(String(operation?.brief || operation?.notes || ""));
const isGeneratedGymSlot = (operation) => {
  if (!operation?.is_daily) return false;
  const brief = String(operation.brief || operation.notes || "");
  return isGymTrainingSlot(operation)
    || isGymRestSlot(operation)
    || /(?:complete the (?:legs|push|pull|lower body|upper body) session selected in self mastery|protect recovery: light mobility only)/i.test(brief);
};
const isLegacyRecurringGymTemplate = (operation) => {
  const title = gymTitle(operation);
  const brief = String(operation?.brief || operation?.notes || "").trim();
  const isOldFamilyTemplate = /^gym\s*(?:-|\u2013|\u2014)\s*(legs|push|pull|lower body|upper body)$/i.test(title)
    && /^complete the (legs|push|pull|lower body|upper body) session selected in self mastery\. log every exercise, weight, reps, and completed sets\.?$/i.test(brief);
  return isGeneratedGymSlot(operation) && (scheduleMode(operation) !== "one_time" || isOldFamilyTemplate);
};

function gymSplitFromHistory(date, history = []) {
  const weekStart = gymWeekStart(date);
  const trainingDays = history.filter(isGymTrainingSlot).length;
  const restDays = history.filter(isGymRestSlot).length;
  const weekEnd = shiftDate(weekStart, 6);
  const daysRemaining = Math.floor((new Date(`${weekEnd}T12:00:00Z`) - new Date(`${date}T12:00:00Z`)) / 86400000) + 1;
  const workoutsRemaining = Math.max(0, GYM_WEEKLY_SPLITS.length - trainingDays);
  const recentSlots = history.slice(-GYM_MAX_CONSECUTIVE_TRAINING_DAYS);
  const trainingStreak = recentSlots.length === GYM_MAX_CONSECUTIVE_TRAINING_DAYS && recentSlots.every(isGymTrainingSlot);
  const mustTrainToFinishWeek = daysRemaining <= workoutsRemaining;
  const shouldRest = trainingDays >= GYM_WEEKLY_SPLITS.length
    || (!mustTrainToFinishWeek && restDays < GYM_REST_DAYS_PER_WEEK && trainingStreak);
  return shouldRest ? "Rest" : (GYM_WEEKLY_SPLITS[trainingDays] || "Rest");
}

function gymSplitForDate(date, records = []) {
  const weekStart = gymWeekStart(date);
  const usable = records.filter((operation) => isGeneratedGymSlot(operation) && !isLegacyRecurringGymTemplate(operation));
  const history = [];
  // A day without a dated generated slot still has a default place in the
  // weekly sequence. This prevents retired recurring templates from making
  // Tuesday restart at Legs instead of continuing from Monday's Legs slot.
  for (let day = weekStart; day < date; day = shiftDate(day, 1)) {
    const daySlots = usable.filter((operation) => gymSlotDate(operation) === day);
    if (daySlots.length) history.push(...daySlots);
    else {
      const split = gymSplitFromHistory(day, history);
      history.push({ is_daily: true, operation_date: day, title: split === "Rest" ? "Rest - recovery and reset" : `Gym - ${split}` });
    }
  }
  return gymSplitFromHistory(date, history);
}

function gymSeedFor(date, records = []) {
  const split = gymSplitForDate(date, records);
  const isRest = split === "Rest";
  return {
    title: isRest ? "Rest - recovery and reset" : `Gym - ${split}`,
    category: isRest ? "Recovery" : "Self Mastery",
    brief: isRest
      ? "Protect recovery: light mobility only if it feels good, hydrate, sleep on time, and do not turn rest into a missed plan."
      : `Complete the ${split} session selected in Self Mastery. Log every exercise with weight, reps, and sets so AEGIS can evaluate progressive improvement.`,
    metric_key: "gym_session",
  };
}

function dailySeedFor(date, records = []) {
  const seeds = [
    { title: "Review charts and document one lesson", category: "Trading", brief: "Review one relevant chart or completed trade, capture one process lesson, and file it in Detective or Self Mastery.", metric_key: null },
    { title: "Conquer the morning", category: "Self Mastery", brief: "Begin the day with one deliberate first action, protect the first block from avoidable distraction, and execute the morning standard before reactive work.", metric_key: null },
    { title: "Read one chapter", category: "Self Mastery", brief: "Read one chapter from your current book without notifications, then capture one useful idea, quote, or action in Self Mastery.", metric_key: "chapters_read" },
    { title: "Journal", category: "Self Mastery", brief: "Write the facts, name what is within your control, and record one lesson or next right action.", metric_key: "mastery.entry" },
    gymSeedFor(date, records),
  ];
  return isPreMarketAnalysisDay(date)
    ? [{ title: "Pre-market analysis", category: "Trading", brief: "Mark the higher-timeframe condition, key liquidity/reaction levels, and the valid setup before active price reaches the area.", metric_key: null, scheduled_time: "18:00" }, ...seeds]
    : seeds;
}

async function reconcileDailyGymSlot(serviceKey, userId, date, records) {
  const candidates = records.filter((operation) => gymSlotDate(operation) === date && isGeneratedGymSlot(operation) && !isLegacyRecurringGymTemplate(operation));
  const current = candidates.find((operation) => !operation.completed && String(operation.status || "").toLowerCase() !== "complete");
  if (!current || (isGymRestSlot(current) && isFlexibleRestDay(current))) return;
  const expected = gymSeedFor(date, records);
  if (current.title === expected.title && current.category === expected.category && current.brief === expected.brief) return;
  const response = await rest(serviceKey, `operations?id=eq.${encodeURIComponent(current.id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    // `operations` predates the application-wide audit timestamp and does
    // not have an `updated_at` column in the deployed schema. Including it
    // makes PostgREST reject the complete patch and aborts the daily rollover
    // before it reaches the Pre-market insert.
    body: JSON.stringify(expected),
  });
  if (!response.ok) throw new Error("Could not repair today's generated gym operation.");
  const [updated] = await response.json();
  if (updated) Object.assign(current, updated);
}

async function rolloverOngoingOperations(serviceKey, userId, date, records) {
  const ongoing = records.filter((operation) => !operation.completed && String(operation.status || "").toLowerCase() === "ongoing");
  let rolled = 0;
  for (const operation of ongoing) {
    const last = dateOnly(operation.last_rollover_on);
    const current = dateOnly(operation.scheduled_date || operation.operation_date);
    if (last === date && current === date) continue;
    const started = dateOnly(operation.started_on || operation.scheduled_date || operation.operation_date) || date;
    const rolloverCount = Math.max(0, Number(operation.rollover_count || 0)) + (last && last < date ? 1 : 0);
    const payload = { scheduled_date: date, operation_date: date, started_on: started, last_rollover_on: date, rollover_count: rolloverCount };
    let response = await rest(serviceKey, `operations?id=eq.${encodeURIComponent(operation.id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    // Keep the scheduled scan usable while an older project is waiting for
    // migration 059. The client will retry the durable fields after migration.
    if (!response.ok) {
      response = await rest(serviceKey, `operations?id=eq.${encodeURIComponent(operation.id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ scheduled_date: date, operation_date: date }) });
    }
    if (response.ok) rolled += 1;
  }
  return rolled;
}

async function rolloverOperations(serviceKey, userId, date) {
  const response = await rest(serviceKey, `operations?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!response.ok) throw new Error("Could not load operations for the morning rollover.");
  const records = await response.json();
  const ongoing = await rolloverOngoingOperations(serviceKey, userId, date, records);
  // Use the same in-memory date for the remainder of this pass so the
  // operation is not reintroduced as stale work by the daily repair logic.
  records.forEach((operation) => {
    if (!operation.completed && String(operation.status || "").toLowerCase() === "ongoing") {
      const last = dateOnly(operation.last_rollover_on);
      if (last !== date) {
        operation.scheduled_date = date;
        operation.operation_date = date;
        operation.last_rollover_on = date;
      }
    }
  });
  await reconcileDailyGymSlot(serviceKey, userId, date, records);
  const current = records.filter((operation) => dateOnly(operation.operation_date) === date || dateOnly(operation.scheduled_date) === date);
  const currentKeys = new Set(current.map(operationIdentity));
  const inserts = [];

  const dailySeeds = dailySeedFor(date, records);
  dailySeeds.forEach((seed) => {
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
      scheduled_time: seed.scheduled_time || source?.scheduled_time || null,
      schedule_mode: "one_time",
      scheduled_end_date: null,
      operation_date: date,
      is_daily: true,
    });
  });

  const seededDailyTitles = new Set(dailySeeds.map((seed) => String(seed.title || "").trim().toLowerCase()));
  const customDaily = records
    .filter((operation) => Boolean(operation.is_daily) && scheduleMode(operation) === "one_time")
    .filter((operation) => dateOnly(operation.operation_date) && dateOnly(operation.operation_date) < date)
    .filter((operation) => !isDailyPreMarket(operation) || isPreMarketAnalysisDay(date))
    // Canonical daily paths are already handled by dailySeeds. Cloning a
    // prior dated copy here can differ only by time or a legacy metric, which
    // created a second Pre-market analysis row.
    .filter((operation) => !seededDailyTitles.has(String(operation.title || "").trim().toLowerCase()))
    .filter((operation) => !isGeneratedGymSlot(operation))
    .sort((left, right) => String(right.operation_date || right.created_at || "").localeCompare(String(left.operation_date || left.created_at || "")));
  const latestDaily = new Map();
  customDaily.forEach((operation) => {
    const key = operationIdentity(operation);
    if (!latestDaily.has(key)) latestDaily.set(key, operation);
  });
  const currentTitles = new Set(current.map((operation) => String(operation.title || "").trim().toLowerCase()).filter(Boolean));
  latestDaily.forEach((source, key) => {
    // Rollover is append-only. If the director already has a same-title row
    // for today, leave its status and every calendar field untouched even if
    // its saved time differs from the older daily template.
    if (currentTitles.has(String(source.title || "").trim().toLowerCase()) || currentKeys.has(key) || inserts.some((operation) => operationIdentity(operation) === key)) return;
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
    // The browser's daily repair and this scheduled pass can arrive together.
    // Let the database retain the first canonical row instead of turning an
    // otherwise-successful scan into a retry that can fan out duplicate work.
    const inserted = await rest(serviceKey, "operations", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(inserts) });
    if (!inserted.ok) throw new Error("Could not create today’s operations during the morning rollover.");
    created = await inserted.json();
  }

  const recurring = records.filter((operation) => scheduleMode(operation) !== "one_time" && !isLegacyRecurringGymTemplate(operation) && operation.id && scheduledOn(operation, date));
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
  return { operations: created.length, occurrences, ongoing };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.CRON_SECRET) return res.status(503).json({ error: "Scheduled intelligence is not configured." });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized scheduled request." });
  try {
    const clock = easternClock();
    const params = new URL(req.url, "https://aegis-command.local").searchParams;
    const requestedMode = params.get("mode");
    const requestedOperatingDate = String(params.get("operating_date") || "").trim();
    if (requestedOperatingDate && !validOperatingDate(requestedOperatingDate)) return res.status(400).json({ error: "operating_date must use YYYY-MM-DD." });
    const operatingDate = requestedOperatingDate || clock.date;
    // A manual repair is intentionally limited to the immediately preceding
    // week. It restores a specific missed advisory without replaying a long
    // sequence of scans (which would create needless egress and invented
    // historical advice).
    if (operatingDate > clock.date || operatingDate < shiftDay(clock.date, -7)) return res.status(400).json({ error: "operating_date must be within the last seven days." });
    const isBackfill = Boolean(requestedOperatingDate && operatingDate !== clock.date);
    // The only automated scan is the 5am morning pass. GitHub Actions can
    // start a scheduled job late, so accept any post-5am invocation from the
    // morning workflow while still rejecting every pre-5am rollover. A
    // signed scheduler request may explicitly repair one earlier operating
    // date at any time. Bedtime debriefs remain user-triggered.
    const mode = (clock.hour >= 5 || isBackfill) && (requestedMode === "morning" || !requestedMode) ? "morning" : null;
    if (!mode) return res.status(204).end();
    const director = await adminUser(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!director) throw new Error("Director account not found.");
    // Backfills restore an advisory only. They never rewrite past operations.
    // Normal morning runs retain the existing one-day operation repair.
    const repairDate = shiftDay(clock.date, -1);
    const repaired = !isBackfill && clock.hour >= 5 ? await rolloverOperations(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id, repairDate) : { operations: 0, occurrences: 0, ongoing: 0 };
    const current = !isBackfill && clock.hour >= 5 ? await rolloverOperations(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id, clock.date) : { operations: 0, occurrences: 0, ongoing: 0 };
    const rollover = { operations: repaired.operations + current.operations, occurrences: repaired.occurrences + current.occurrences, ongoing: repaired.ongoing + current.ongoing, repaired_date: repairDate };
    const recent = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `ai_advisories?user_id=eq.${director.id}&select=advisory_type,payload&order=created_at.desc&limit=12`).then((response) => response.ok ? response.json() : []);
    if (recent.some((item) => item.advisory_type === mode && item.payload?.schedule_date === operatingDate)) return res.status(200).json({ status: "already-complete", mode, date: operatingDate, backfill: isBackfill });
    const context = await buildContext(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id, operatingDate, mode);
    const advisory = addInactivityDirective(sanitizeAdvisory(await askOpenAI(context, mode), context), context, operatingDate);
    advisory.schedule_date = operatingDate;
    let stored = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_advisories", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: director.id, advisory_type: mode, payload: advisory, scan_mode: mode, operating_date: operatingDate }) });
    if (!stored.ok) stored = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_advisories", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: director.id, advisory_type: mode, payload: advisory }) });
    if (!stored.ok) throw new Error("Could not store the scheduled advisory.");
    const [record] = await stored.json();
    const directives = advisory.directives || [];
    const roadmap = advisory.roadmap || [];
    const warnings = [];
    let savedSuggestions = [];
    if (directives.length) {
      const suggestionRows = directives.map((item) => ({ ...item, evidence_ids: item.evidence_ids || [], user_id: director.id, advisory_id: record.id }));
      let suggestionResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_mission_suggestions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(suggestionRows) });
      // Keep the scheduled scan compatible while migration 055 is being applied.
      if (!suggestionResponse.ok) suggestionResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_mission_suggestions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(suggestionRows.map(({ evidence_ids, ...row }) => row)) });
      if (!suggestionResponse.ok) {
        // The advisory is the durable morning record. A stale optional-table
        // schema must not make a saved advisory look as though it never ran.
        warnings.push("Mission suggestions were not saved; the advisory itself is complete.");
      } else savedSuggestions = await suggestionResponse.json();
    }
    if (roadmap.length) {
      const roadmapRows = roadmap.map((item) => ({ ...item, evidence_ids: item.evidence_ids || [], user_id: director.id, advisory_id: record.id }));
      let roadmapResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_roadmap_missions", { method: "POST", body: JSON.stringify(roadmapRows) });
      if (!roadmapResponse.ok) roadmapResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_roadmap_missions", { method: "POST", body: JSON.stringify(roadmapRows.map(({ evidence_ids, ...row }) => row)) });
      if (!roadmapResponse.ok) warnings.push("Roadmap follow-up was not saved; the advisory itself is complete.");
    }
    const corrective = savedSuggestions.filter((item) => item.mission_kind === "corrective");
    for (const item of corrective) {
      const existing = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `missions?user_id=eq.${director.id}&title=eq.${encodeURIComponent(item.title)}&completed=eq.false&select=id&limit=1`).then((response) => response.ok ? response.json() : []);
      if (!existing.length) {
        const missionPayload = { user_id: director.id, title: item.title, category: item.category, priority: "Do now", completion_type: "binary", completion_definition: `System corrective from ${item.advisor}: ${item.rationale}`, completed: false, completed_count: 0, progress: 0, source_suggestion_id: item.id, source_advisory_id: record.id, evidence_ids: item.evidence_ids || [], accepted_at: new Date().toISOString(), outcome_status: "accepted" };
        let missionResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "missions", { method: "POST", body: JSON.stringify(missionPayload) });
        if (!missionResponse.ok) missionResponse = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "missions", { method: "POST", body: JSON.stringify(((payload) => { const { source_suggestion_id, source_advisory_id, evidence_ids, accepted_at, outcome_status, ...legacy } = payload; return legacy; })(missionPayload)) });
        if (!missionResponse.ok) {
          warnings.push("A corrective mission was not materialized; the advisory itself is complete.");
          continue;
        }
      }
      if (item.id) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `ai_mission_suggestions?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "acknowledged", resolved_at: new Date().toISOString() }) });
    }
    if (!await saveCalibrationReview(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id, operatingDate, context)) warnings.push("Calibration review was not saved; the advisory itself is complete.");
    return res.status(200).json({ status: "complete", mode, date: operatingDate, backfill: isBackfill, rollover, directives: directives.length, roadmap: roadmap.length, warnings });
  } catch (error) { return res.status(500).json({ error: String(error.message || error) }); }
};
