/* Shared AEGIS context contract. Browser and scheduled scans use this same
 * normalizer so they cannot drift into different definitions of evidence. */
(function attachContext(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AEGIS_AI_CONTEXT = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const dateOnly = (value) => value ? String(value).slice(0, 10) : "";
  const idOf = (row) => row?.id == null ? "" : String(row.id);
  const evidenceId = (sourceType, sourceId) => sourceId ? `evidence:${sourceType}:${sourceId}` : "";
  const shiftDay = (key, amount) => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const missionProgress = (mission) => mission?.completion_type === "units" && Number(mission.target_count) > 0
    ? Math.round(Math.min(100, (Number(mission.completed_count || 0) / Number(mission.target_count)) * 100))
    : mission?.completed ? 100 : 0;
  const normalizedOutcome = (value) => {
    const result = String(value || "").trim().toLowerCase();
    if (result === "win" || result === "small win") return "win";
    if (result === "loss" || result === "small loss") return "loss";
    if (["b/e", "be", "break even", "breakeven"].includes(result)) return "be";
    return null;
  };
  const tradeOutcome = (trade) => {
    if (String(trade?.trade_status || "").trim().toLowerCase() === "open") return "open";
    const explicit = [trade?.outcome, trade?.win_loss, trade?.result].map(normalizedOutcome).find(Boolean);
    if (explicit) return explicit;
    const r = Number(trade?.r_multiple);
    if (r > 0) return "win";
    if (r < 0) return "loss";
    const pnl = Number(trade?.pnl_percent);
    return pnl > 0 ? "win" : pnl < 0 ? "loss" : "be";
  };
  const tradeStreaks = (trades) => {
    const decisive = [...trades].sort((a, b) => new Date(a.traded_at || a.created_at || 0) - new Date(b.traded_at || b.created_at || 0)).map(tradeOutcome).filter((item) => item === "win" || item === "loss");
    let current_type = null, current_length = 0, longest_win = 0, longest_loss = 0;
    decisive.forEach((result) => {
      current_length = result === current_type ? current_length + 1 : 1;
      current_type = result;
      if (result === "win") longest_win = Math.max(longest_win, current_length);
      else longest_loss = Math.max(longest_loss, current_length);
    });
    return { current_type, current_length, longest_win, longest_loss };
  };
  const marketContext = {
    primary_market: "Forex",
    timezone: "America/New_York",
    regular_forex_session: "Sunday 5:00 PM ET through Friday 5:00 PM ET",
    forex_closed_window: "Friday 5:00 PM ET through Sunday 5:00 PM ET",
    crypto: "Crypto trades continuously, but the user trades crypto rarely. Do not assume crypto activity unless a crypto trade is logged.",
    trading_expectation: "Trading is optional. No trade is required every day, and a no-trade day is not a failure or an evidence gap by itself."
  };
  const streakFor = (dates, throughDate = "") => {
    const unique = [...new Set(dates.map(dateOnly).filter(Boolean))].sort().reverse();
    if (!unique.length) return { current: 0, best: 0, last: null };
    let best = 1, run = 1, currentRun = 1;
    for (let index = 1; index < unique.length; index += 1) {
      run = Number(new Date(`${unique[index - 1]}T12:00:00Z`) - new Date(`${unique[index]}T12:00:00Z`)) === 86400000 ? run + 1 : 1;
      best = Math.max(best, run);
      if (index === currentRun && run === index + 1) currentRun = index + 1;
      else if (index === currentRun) break;
    }
    const current = !throughDate || [throughDate, shiftDay(throughDate, -1)].includes(unique[0]) ? currentRun : 0;
    return { current, best, last: unique[0] };
  };

  const numberValue = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const complete = (row) => Boolean(row?.completed) || String(row?.status || "").toLowerCase() === "complete";
  const rowDate = (row, ...keys) => {
    for (const key of keys) {
      const value = dateOnly(row?.[key]);
      if (value) return value;
    }
    return "";
  };
  const within = (date, start, end) => Boolean(date && date >= start && date <= end);
  const windowStart = (end, days) => shiftDay(end, -(days - 1));
  const evidenceFor = (sourceType, rows, max = 12) => rows.map((row) => evidenceId(sourceType, idOf(row))).filter(Boolean).slice(0, max);
  const average = (values) => {
    const numeric = values.filter((value) => value !== null && value !== undefined && value !== "").map((value) => Number(value)).filter((value) => Number.isFinite(value));
    return numeric.length ? Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2)) : null;
  };
  const percent = (numerator, denominator) => denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
  const normalizeCategory = (value, fallback = "Self Mastery") => {
    const category = String(value || "").trim().toLowerCase();
    if (category === "recovery") return "Recovery";
    if (category === "trading" || category === "trade") return "Trading";
    if (category === "business" || category === "enterprise") return "Business";
    if (["mind", "body", "mastery", "self mastery", "self-mastery"].includes(category)) return "Self Mastery";
    if (["life admin", "day to day", "day-to-day", "personal"].includes(category)) return "Life Admin";
    if (/dentist|doctor|appointment|lunch|errand|household|personal|admin/.test(category)) return "Life Admin";
    return fallback;
  };
  const tradeSummary = (rows) => {
    const closedRows = rows.filter((row) => tradeOutcome(row) !== "open");
    const winsCount = closedRows.filter((row) => tradeOutcome(row) === "win").length;
    const lossesCount = closedRows.filter((row) => tradeOutcome(row) === "loss").length;
    const beCount = closedRows.filter((row) => tradeOutcome(row) === "be").length;
    return {
      sample_size: closedRows.length,
      wins: winsCount,
      losses: lossesCount,
      breakeven: beCount,
      win_rate: percent(winsCount, winsCount + lossesCount),
      pnl_percent: Number(closedRows.reduce((sum, row) => sum + numberValue(row.pnl_percent), 0).toFixed(2)),
      avg_r: average(closedRows.map((row) => row.r_multiple)),
      plan_violations: closedRows.filter((row) => Boolean(row.plan_violation)).length,
      violation_rate: percent(closedRows.filter((row) => Boolean(row.plan_violation)).length, closedRows.length),
      avg_mae: average(closedRows.map((row) => row.mae)),
      avg_mfe: average(closedRows.map((row) => row.mfe)),
      evidence_ids: evidenceFor("trade_debriefs", closedRows)
    };
  };
  const groupTrades = (rows, keyFn) => {
    const groups = new Map();
    rows.forEach((row) => {
      const key = String(keyFn(row) || "Unspecified");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.entries()].map(([key, grouped]) => ({ key, ...tradeSummary(grouped) })).sort((a, b) => b.sample_size - a.sample_size || a.key.localeCompare(b.key)).slice(0, 24);
  };
  const operationName = (row) => String(row?.title || row?.name || "").trim().toLowerCase();
  const operationDay = (row) => rowDate(row, "scheduled_date", "operation_date", "completed_on", "created_at");
  const operationIdentity = (row) => {
    if (row?._occurrence?.id || String(row?.id || "").startsWith("occurrence:")) return `occurrence:${row._occurrence?.id || String(row.id).slice("occurrence:".length)}`;
    return [operationName(row).replace(/\s+/g, " "), operationDay(row) || "standing", String(row?.scheduled_time || "").slice(0, 5), String(row?.mission_id || "")].join("|");
  };
  const dedupeOperations = (rows) => {
    const unique = new Map();
    rows.forEach((row) => {
      const key = operationIdentity(row);
      const existing = unique.get(key);
      const completion = complete(row) ? 1 : 0;
      const existingCompletion = existing && complete(existing) ? 1 : 0;
      const timestamp = Date.parse(row?.updated_at || row?.created_at || 0) || 0;
      const existingTimestamp = Date.parse(existing?.updated_at || existing?.created_at || 0) || 0;
      if (!existing || completion > existingCompletion || (completion === existingCompletion && timestamp >= existingTimestamp)) unique.set(key, row);
    });
    return [...unique.values()];
  };
  const operationStats = (rows, start, end) => {
    const planned = rows.filter((row) => within(operationDay(row), start, end));
    const completedRows = planned.filter(complete);
    return { planned: planned.length, completed: completedRows.length, completion_rate: percent(completedRows.length, planned.length), evidence_ids: evidenceFor(String(rows[0]?.id || "").startsWith("occurrence:") ? "operation_occurrences" : "operations", planned) };
  };
  const dailyPillar = (rows, phrase) => rows.some((row) => operationName(row).includes(phrase) && complete(row));
  const recoveryValue = (row, ...keys) => {
    for (const key of keys) {
      if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "") return numberValue(row[key], null);
    }
    return null;
  };
  const cohortComparison = (rows, predicate) => {
    const withEvidence = rows.filter(predicate);
    const withoutEvidence = rows.filter((row) => !predicate(row));
    return { with_evidence: tradeSummary(withEvidence), without_evidence: tradeSummary(withoutEvidence), caution: withEvidence.length < 5 || withoutEvidence.length < 5 ? "Small cohort; directional association only." : "Association only; this does not establish causation." };
  };

  function buildDerivedInsights({ effectiveOperations, liveTrades, recovery, mastery, deepWork, contentItems, activityEvents, missions, directives, feedback, calibration, tradeReviews, scenarios, operatingDate }) {
    const closedTrades = liveTrades.filter((row) => tradeOutcome(row) !== "open");
    const xpEvents = activityEvents.filter((row) => numberValue(row.metadata?.xp_reward ?? row.xp_reward, 0) > 0);
    const windows = [7, 30, 90].reduce((result, days) => {
      const start = windowStart(operatingDate, days);
      const scopedOperations = effectiveOperations.filter((row) => within(operationDay(row), start, operatingDate));
      const scopedTrades = closedTrades.filter((row) => within(rowDate(row, "traded_at", "created_at"), start, operatingDate));
      const scopedRecovery = recovery.filter((row) => within(rowDate(row, "logged_on", "created_at"), start, operatingDate));
      const scopedLearning = [...mastery, ...deepWork, ...contentItems].filter((row) => within(rowDate(row, "created_at", "logged_on"), start, operatingDate));
      const scopedXp = xpEvents.filter((row) => within(rowDate(row, "occurred_at", "created_at"), start, operatingDate));
      return { ...result, [`last_${days}_days`]: { date_range: { start, end: operatingDate }, operations: operationStats(scopedOperations, start, operatingDate), trading: tradeSummary(scopedTrades), recovery_logs: scopedRecovery.length, learning_records: scopedLearning.length, xp: { events: scopedXp.length, awarded: Number(scopedXp.reduce((sum, row) => sum + numberValue(row.metadata?.xp_reward ?? row.xp_reward), 0).toFixed(2)) }, evidence_ids: [...evidenceFor("recovery_logs", scopedRecovery), ...evidenceFor("trade_debriefs", scopedTrades), ...evidenceFor("mastery_entries", scopedLearning)].slice(0, 12) } };
    }, {});

    const days = [...new Set([...effectiveOperations.map(operationDay), ...closedTrades.map((row) => rowDate(row, "traded_at", "created_at")), ...recovery.map((row) => rowDate(row, "logged_on", "created_at")), ...mastery.map((row) => rowDate(row, "created_at", "logged_on")), ...deepWork.map((row) => rowDate(row, "created_at", "logged_on")), ...contentItems.map((row) => rowDate(row, "created_at", "logged_on"))].filter((day) => within(day, windowStart(operatingDate, 90), operatingDate)))].sort();
    const dayRecords = days.map((day) => {
      const dayOperations = effectiveOperations.filter((row) => operationDay(row) === day);
      const dayTrades = closedTrades.filter((row) => rowDate(row, "traded_at", "created_at") === day);
      const dayRecovery = recovery.filter((row) => rowDate(row, "logged_on", "created_at") === day);
      const dayLearning = [...mastery, ...deepWork, ...contentItems].filter((row) => rowDate(row, "created_at", "logged_on") === day);
      return { day, operations: dayOperations, trades: dayTrades, recovery: dayRecovery, learning: dayLearning, morning_completed: dailyPillar(dayOperations, "conquer the morning"), workout_completed: dailyPillar(dayOperations, "workout"), reading_completed: dailyPillar(dayOperations, "read one chapter"), journal_completed: dailyPillar(dayOperations, "journal"), evening_debrief_completed: dailyPillar(dayOperations, "evening mission debrief") };
    });
    const tradingDays = dayRecords.filter((row) => row.trades.length);
    const readyDays = tradingDays.filter((row) => row.morning_completed);
    const notReadyDays = tradingDays.filter((row) => !row.morning_completed);
    const flattenTrades = (rows) => rows.flatMap((row) => row.trades);
    const recoveryDays = tradingDays.filter((row) => row.recovery.length);
    const noRecoveryDays = tradingDays.filter((row) => !row.recovery.length);
    const readinessWith = tradeSummary(flattenTrades(readyDays));
    const readinessWithout = tradeSummary(flattenTrades(notReadyDays));
    const recoveryWith = tradeSummary(flattenTrades(recoveryDays));
    const recoveryWithout = tradeSummary(flattenTrades(noRecoveryDays));
    const readiness = { days_observed: dayRecords.length, trading_days: tradingDays.length, morning_completed_days: readyDays.length, trading_days_after_morning: readinessWith, trading_days_without_morning: readinessWithout, caution: readyDays.length < 5 || notReadyDays.length < 5 ? "Small cohort; directional association only." : "Association only; morning completion is not proof of causation.", evidence_ids: [...evidenceFor("trade_debriefs", flattenTrades(readyDays)), ...evidenceFor("operations", readyDays.flatMap((row) => row.operations))].slice(0, 12) };
    const recoveryAssociation = { trading_days_with_recovery: recoveryDays.length, trading_days_without_recovery: noRecoveryDays.length, with_recovery: recoveryWith, without_recovery: recoveryWithout, pain_on_trading_days: average(recoveryDays.flatMap((row) => row.recovery.map((item) => recoveryValue(item, "pain", "pain_level"))).filter((value) => value !== null)), rehab_completed_days: recoveryDays.filter((row) => row.recovery.some((item) => Boolean(item.rehab_completed))).length, caution: recoveryDays.length < 5 || noRecoveryDays.length < 5 ? "Small cohort; recovery and trading should be interpreted with clinical context." : "Association only; do not infer that recovery status caused trade results.", evidence_ids: [...evidenceFor("recovery_logs", recoveryDays.flatMap((row) => row.recovery)), ...evidenceFor("trade_debriefs", flattenTrades(recoveryDays))].slice(0, 12) };

    const learningDays = tradingDays.filter((row) => dayRecords.some((candidate) => candidate.learning.length && candidate.day <= row.day && candidate.day >= shiftDay(row.day, -7)));
    const noLearningDays = tradingDays.filter((row) => !learningDays.includes(row));
    const learningTransfer = { learning_activity_days: dayRecords.filter((row) => row.learning.length).length, trading_days_with_learning_in_prior_7_days: learningDays.length, after_learning: tradeSummary(flattenTrades(learningDays)), without_recent_learning: tradeSummary(flattenTrades(noLearningDays)), learning_records: dayRecords.filter((row) => row.learning.length).slice(-12).flatMap((row) => row.learning.map((item) => ({ day: row.day, type: item.area ? "deep_work" : item.category ? "mastery" : "content", evidence_id: evidenceId(item.area ? "deep_work_logs" : item.category ? "mastery_entries" : "content_items", idOf(item)) }))), caution: learningDays.length < 5 || noLearningDays.length < 5 ? "Small cohort; learning transfer is a directional association." : "Association only; a nearby learning record does not prove it changed trade quality." };

    const missionBySuggestion = new Map(missions.filter((row) => row.source_suggestion_id).map((row) => [String(row.source_suggestion_id), row]));
    const feedbackBySuggestion = feedback.reduce((map, row) => { const key = String(row.suggestion_id || ""); if (!map.has(key)) map.set(key, []); map.get(key).push(row); return map; }, new Map());
    const recommendationChain = directives.filter((row) => row.id).map((suggestion) => {
      const mission = missionBySuggestion.get(String(suggestion.id));
      const ratings = feedbackBySuggestion.get(String(suggestion.id)) || [];
      return { suggestion_id: suggestion.id, advisory_id: suggestion.advisory_id || null, title: suggestion.title, kind: suggestion.mission_kind || null, suggestion_status: suggestion.status || null, feedback: ratings.map((row) => ({ type: row.feedback_type, note: row.note || null, created_at: row.created_at })), mission: mission ? { id: mission.id, status: mission.outcome_status || (complete(mission) ? "completed" : "accepted"), completed: complete(mission), outcome_rating: mission.outcome_rating || null, outcome_note: mission.outcome_note || null, accepted_at: mission.accepted_at || null, started_at: mission.started_at || null, completed_at: mission.completed_at || null } : null, evidence_ids: [...(suggestion.evidence_ids || []), evidenceId("missions", idOf(mission)), evidenceId("ai_mission_suggestions", idOf(suggestion))].filter(Boolean).slice(0, 8) };
    });
    const useful = feedback.filter((row) => row.feedback_type === "useful").length;
    const negative = feedback.filter((row) => ["wrong", "irrelevant"].includes(row.feedback_type)).length;
    const completedRecommendations = recommendationChain.filter((row) => row.mission?.completed).length;
    const ratedMissions = recommendationChain.map((row) => numberValue(row.mission?.outcome_rating, 0)).filter((value) => value > 0);
    const missionEffectiveness = { recommendations: recommendationChain.length, converted_to_missions: recommendationChain.filter((row) => row.mission).length, completed_missions: completedRecommendations, ineffective_missions: recommendationChain.filter((row) => row.mission?.status === "ineffective").length, average_outcome_rating: average(ratedMissions), feedback: { total: feedback.length, useful, negative, useful_rate: percent(useful, feedback.length), negative_rate: percent(negative, feedback.length) }, outcome_chain: recommendationChain.slice(0, 40), calibration_reviews: calibration.slice(0, 4).map((row) => ({ week_start: row.week_start, summary: row.summary, adjustments: row.adjustments })), caution: "Feedback and mission completion measure alignment and follow-through, not causal AI accuracy." };

    const scenariosRows = scenarios || [];
    const reviewedTradeIds = new Set(tradeReviews.map((row) => String(row.trade_id || row.trade_debrief_id || "")));
    const enteredScenarios = scenariosRows.filter((row) => String(row.scenario_action || "").toLowerCase().includes("enter"));
    const passedScenarios = scenariosRows.filter((row) => String(row.scenario_action || "").toLowerCase().includes("pass"));
    const scenarioSummary = { scenarios: scenariosRows.length, ai_pnl_r: Number(scenariosRows.reduce((sum, row) => sum + numberValue(row.simulated_r_multiple), 0).toFixed(2)), ai_pnl_percent: Number(scenariosRows.reduce((sum, row) => sum + numberValue(row.simulated_pnl_percent), 0).toFixed(2)), correct_wins: scenariosRows.filter((row) => row.scenario_result === "correct_win").length, wrong_losses: scenariosRows.filter((row) => row.scenario_result === "wrong_loss").length, avoided_losses: scenariosRows.filter((row) => row.scenario_result === "avoided_loss").length, missed_winners: scenariosRows.filter((row) => row.scenario_result === "missed_winner").length, break_even: scenariosRows.filter((row) => row.scenario_result === "break_even").length, entry_call_accuracy: percent(scenariosRows.filter((row) => ["correct_win", "wrong_loss"].includes(row.scenario_result)).length - scenariosRows.filter((row) => row.scenario_result === "wrong_loss").length, enteredScenarios.length), pass_call_accuracy: percent(scenariosRows.filter((row) => row.scenario_result === "avoided_loss").length, passedScenarios.length), review_coverage: percent(scenariosRows.filter((row) => reviewedTradeIds.has(String(row.trade_id || ""))).length, scenariosRows.length), actual_r_gap: Number(scenariosRows.reduce((sum, row) => sum + numberValue(row.simulated_r_multiple) - numberValue(row.actual_r_multiple), 0).toFixed(2)), evidence_ids: evidenceFor("ai_trade_scenarios", scenariosRows) };
    const processConsistency = { by_session: groupTrades(closedTrades, (row) => row.session_time || row.session || "Unspecified"), by_setup: groupTrades(closedTrades, (row) => typeof row.setup === "string" ? row.setup : row.setup?.name || "Unspecified"), by_market_condition: groupTrades(closedTrades, (row) => row.market_condition || "Unspecified"), by_weekday: groupTrades(closedTrades, (row) => { const date = rowDate(row, "traded_at", "created_at"); return date ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Unspecified"; }) };
    const xpByMetric = xpEvents.reduce((result, row) => { const key = row.metric_key || "unclassified"; result[key] = (result[key] || 0) + numberValue(row.metadata?.xp_reward ?? row.xp_reward); return result; }, {});
    return { methodology: "Deterministic cohort comparisons from the shared activity ledger. Metrics describe association and follow-through; they do not establish causation. Small cohorts are explicitly flagged.", as_of: operatingDate, windows, morning_readiness: readiness, recovery_vs_trading: recoveryAssociation, learning_transfer: learningTransfer, process_consistency: processConsistency, mission_effectiveness: missionEffectiveness, ai_scenario_ledger: scenarioSummary, xp_integrity: { observed_reward_events: xpEvents.length, observed_rewards: Number(xpEvents.reduce((sum, row) => sum + numberValue(row.metadata?.xp_reward ?? row.xp_reward), 0).toFixed(2)), by_metric: xpByMetric, note: "XP is reconciled from activity-event reward metadata when present; missing reward metadata is not treated as zero XP." }, ai_recommendation_accuracy: { feedback_alignment: missionEffectiveness.feedback, outcome_tracking: { rated_missions: ratedMissions.length, average_outcome_rating: missionEffectiveness.average_outcome_rating }, calibration_reviews: missionEffectiveness.calibration_reviews, caution: "A recommendation is not treated as accurate solely because it was accepted or completed. Explicit feedback and outcome ratings are the available labels." } };
  }

  function buildContext(input = {}, operatingDate, mode = "scan") {
    const records = input.records || input;
    const operations = records.operations || [];
    const occurrences = records.occurrences || records.operationOccurrences || [];
    const missions = records.missions || [];
    const trades = records.trades || [];
    const recovery = records.recovery || [];
    const mastery = records.mastery || [];
    const projects = records.projects || [];
    const directives = records.directives || [];
    const roadmap = records.roadmap || [];
    const activityEvents = records.activityEvents || [];
    const trainingSessions = records.trainingSessions || [];
    const trainingSets = records.trainingSets || [];
    const weightLogs = records.weightLogs || [];
    const foodLogs = records.foodLogs || [];
    const deepWork = records.deepWork || [];
    const challenges = records.challenges || [];
    const directorReviews = records.directorReviews || [];
    const contentItems = records.contentItems || [];
    const tradeReviews = records.tradeReviews || [];
    const scenarios = records.scenarios || records.tradeScenarios || [];
    const progressEvents = records.progressEvents || [];
    const feedback = records.feedback || records.recommendationFeedback || [];
    const calibration = records.calibration || records.calibrationReviews || [];
    const phaseValue = Array.isArray(records.phase) ? records.phase[0] : records.phase;
    const targetDate = mode === "morning" ? shiftDay(operatingDate, -1) : operatingDate;
    const recurringIds = new Set(operations.filter((operation) => ["daily", "weekly", "recurring"].includes(String(operation.schedule_mode || "").toLowerCase())).map((operation) => idOf(operation)));
    const occurrenceRows = occurrences.map((occurrence) => {
      const parent = operations.find((operation) => idOf(operation) === String(occurrence.operation_id)) || {};
      return { ...parent, id: `occurrence:${occurrence.id}`, operation_id: occurrence.operation_id, operation_date: occurrence.occurrence_date, scheduled_date: occurrence.occurrence_date, completed_on: occurrence.completed_on, completed: Boolean(occurrence.completed), status: occurrence.completed ? "Complete" : occurrence.status || parent.status || "Queued", scheduled_time: occurrence.scheduled_time || parent.scheduled_time };
    });
    const effectiveOperations = dedupeOperations([...operations.filter((operation) => !recurringIds.has(idOf(operation)) || !occurrences.some((occurrence) => String(occurrence.operation_id) === idOf(operation))), ...occurrenceRows]);
    const liveTrades = trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical");
    const closed = liveTrades.filter((trade) => tradeOutcome(trade) !== "open");
    const wins = closed.filter((trade) => tradeOutcome(trade) === "win").length;
    const losses = closed.filter((trade) => tradeOutcome(trade) === "loss").length;
     const monthStart = `${operatingDate.slice(0, 8)}01`;
     const monthPnl = closed.filter((trade) => {
       const date = rowDate(trade, "traded_at", "created_at");
       return within(date, monthStart, operatingDate);
     }).reduce((sum, trade) => sum + Number(trade.pnl_percent || 0), 0);
    const evidence = [];
    const addEvidence = (sourceType, row, occurredAt, summary, metadata = {}) => {
      const id = evidenceId(sourceType, idOf(row));
      if (!id || evidence.some((item) => item.id === id)) return id;
      evidence.push({ id, source_type: sourceType, source_id: idOf(row), occurred_at: occurredAt || null, date: dateOnly(occurredAt), summary, metadata });
      return id;
    };
    activityEvents.forEach((event) => addEvidence(event.source_type || "activity_events", event, event.occurred_at, `${event.metric_key || "activity"} recorded`, event.metadata || {}));
    occurrences.forEach((item) => addEvidence("operation_occurrences", item, item.completed_on || item.occurrence_date, `${item.title || "Recurring operation"} occurrence`, { completed: Boolean(item.completed) }));
    trades.forEach((trade) => addEvidence("trade_debriefs", trade, trade.traded_at || trade.created_at, `${trade.pair || "Trade"} journaled`, { outcome: tradeOutcome(trade), plan_violation: Boolean(trade.plan_violation) }));
    tradeReviews.forEach((item) => addEvidence("trade_reviews", item, item.created_at || item.reviewed_at, "Trade review recorded"));
    scenarios.forEach((item) => addEvidence("ai_trade_scenarios", item, item.created_at || item.reviewed_at, "Blind AI scenario recorded", { result: item.scenario_result }));
    recovery.forEach((item) => addEvidence("recovery_logs", item, item.logged_on || item.created_at, "Recovery report logged"));
    mastery.forEach((item) => addEvidence("mastery_entries", item, item.created_at, item.title || "Mastery entry logged", { category: item.category }));
    trainingSessions.forEach((item) => addEvidence("training_sessions", item, item.logged_on || item.created_at, `${item.title || item.workout_split || "Training"} session logged`));
    trainingSets.forEach((item) => addEvidence("training_sets", item, item.logged_on || item.created_at, `${item.exercise_name || "Exercise"} set logged`));
    weightLogs.forEach((item) => addEvidence("health_weight_logs", item, item.logged_on || item.created_at, "Bodyweight record logged"));
    foodLogs.forEach((item) => addEvidence("health_food_logs", item, item.logged_on || item.created_at, `${item.food_name || "Food"} nutrition estimate logged`));
    deepWork.forEach((item) => addEvidence("deep_work_logs", item, item.created_at || item.logged_on, "Deep work block logged"));
    challenges.forEach((item) => addEvidence("mastery_challenges", item, item.completed_at || item.created_at, `${item.title || "Mastery challenge"} transmission`));
    directorReviews.forEach((item) => addEvidence("director_reviews", item, item.updated_at || item.created_at, "Director review recorded"));
    contentItems.forEach((item) => addEvidence("content_items", item, item.created_at, `${item.title || "Content"} record`));
    progressEvents.forEach((item) => addEvidence("mission_progress_events", item, item.occurred_at || item.created_at, "Mission progress recorded"));
    operations.forEach((item) => addEvidence("operations", item, item.completed_on || item.operation_date || item.scheduled_date || item.created_at, `${item.title || "Operation"} operation`, { status: item.status, completed: Boolean(item.completed) }));
    missions.forEach((item) => addEvidence("missions", item, item.completed_at || item.created_at, `${item.title || "Mission"} mission`, { completed: Boolean(item.completed), priority: item.priority }));
    const evidenceCatalog = evidence.filter((item) => item.date === targetDate).concat(evidence.filter((item) => item.date !== targetDate)).slice(0, 120);
    const activityByMetric = activityEvents.reduce((result, event) => { const key = event.metric_key || "unclassified"; result[key] = (result[key] || 0) + Number(event.quantity || 1); return result; }, {});
    const activeMissions = missions.filter((mission) => missionProgress(mission) < 100);
    const todayOperations = effectiveOperations.filter((operation) => dateOnly(operation.scheduled_date || operation.operation_date) === operatingDate);
    const derivedInsights = buildDerivedInsights({ effectiveOperations, liveTrades, recovery, mastery, deepWork, contentItems, activityEvents, missions, directives, feedback, calibration, tradeReviews, scenarios, operatingDate });
    return {
      generated_on: new Date().toISOString(), scan_mode: mode, operating_date: operatingDate, evidence_date: targetDate, evidence_window: mode === "morning" ? "previous_operating_day" : mode === "bedtime" ? "current_operating_day" : "current_context", market_context: marketContext,
      active_phase: `Phase ${phaseValue?.active_phase ?? 0}`,
      evidence_catalog: evidenceCatalog,
      evidence_summary: { target_date: targetDate, target_count: evidence.filter((item) => item.date === targetDate).length, total_count: evidence.length },
      derived_insights: derivedInsights,
      streaks: { execution: streakFor(effectiveOperations.filter((operation) => operation.completed || operation.status === "Complete").map((operation) => operation.completed_on || operation.scheduled_date || operation.created_at), operatingDate), trading_journal: streakFor(liveTrades.map((trade) => trade.traded_at || trade.created_at), operatingDate), mastery: streakFor(mastery.map((entry) => entry.created_at), operatingDate) },
       operations: { today_total: todayOperations.length, today_complete: todayOperations.filter((operation) => operation.completed || operation.status === "Complete").length, open_total: effectiveOperations.filter((operation) => !operation.completed && operation.status !== "Complete").length, next: effectiveOperations.filter((operation) => !operation.completed && operation.status !== "Complete").slice(0, 8).map((operation) => ({ id: operation.id, title: operation.title, category: normalizeCategory(operation.category), status: operation.status || "Queued", scheduled_date: operation.scheduled_date || operation.operation_date || null, scheduled_time: operation.scheduled_time || null })) },
       missions: activeMissions.slice(0, 12).map((mission) => ({ id: mission.id, title: mission.title, category: normalizeCategory(mission.category), priority: mission.priority, progress: missionProgress(mission), definition: mission.completion_definition || null, source_suggestion_id: mission.source_suggestion_id || null, source_advisory_id: mission.source_advisory_id || null, evidence_ids: mission.evidence_ids || [] })),
       mission_outcomes: missions.slice(0, 40).map((mission) => ({ id: mission.id, title: mission.title, completed: Boolean(mission.completed), progress: missionProgress(mission), outcome_status: mission.outcome_status || null, outcome_rating: mission.outcome_rating || null, outcome_note: mission.outcome_note || null, accepted_at: mission.accepted_at || null, started_at: mission.started_at || null, completed_at: mission.completed_at || null, source_suggestion_id: mission.source_suggestion_id || null, source_advisory_id: mission.source_advisory_id || null, evidence_ids: mission.evidence_ids || [] })),
      trading: { closed_trades: closed.length, wins, losses, breakeven: closed.length - wins - losses, win_rate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null, plan_violations: liveTrades.filter((trade) => trade.plan_violation).length, month_pnl_percent: Number(monthPnl.toFixed(2)), streaks: tradeStreaks(closed), authoritative_summary: `${closed.length} closed trades: ${wins} wins, ${losses} losses, ${closed.length - wins - losses} break-even; win rate ${wins + losses ? Math.round((wins / (wins + losses)) * 100) : "N/A"}%.`, recent: closed.slice(-12).map((trade) => ({ evidence_id: evidenceId("trade_debriefs", idOf(trade)), date: dateOnly(trade.traded_at || trade.created_at), pair: trade.pair, outcome: tradeOutcome(trade), r: Number(trade.r_multiple || 0), pnl_percent: trade.pnl_percent == null ? null : Number(trade.pnl_percent), violation: Boolean(trade.plan_violation), setup: trade.setup || null, debrief_note: trade.debrief_note || null })) },
      recovery: recovery.slice(0, 8).map((item) => ({ evidence_id: evidenceId("recovery_logs", idOf(item)), date: item.logged_on, pain: item.pain, swelling: item.swelling, rehab_completed: item.rehab_completed })),
      mastery: { total_entries: mastery.length, recent: mastery.slice(0, 10).map((entry) => ({ evidence_id: evidenceId("mastery_entries", idOf(entry)), category: entry.category, title: entry.title, date: dateOnly(entry.created_at) })) },
      activity_ledger: { total_events: activityEvents.length, by_metric: activityByMetric, recent: activityEvents.slice(0, 40).map((event) => ({ evidence_id: evidenceId(event.source_type || "activity_events", idOf(event)), source: event.source_type, metric: event.metric_key, quantity: event.quantity || 1, occurred_at: event.occurred_at, metadata: event.metadata || {} })) },
       fitness: { sessions: trainingSessions.slice(0, 12).map((item) => ({ evidence_id: evidenceId("training_sessions", idOf(item)), date: item.logged_on, split: item.workout_split || item.session_type, title: item.title })), recent_sets: trainingSets.slice(0, 60).map((item) => ({ evidence_id: evidenceId("training_sets", idOf(item)), date: item.logged_on, exercise: item.exercise_name, resistance_type: item.resistance_type || "Weights", weight_lbs: item.weight_lbs, band_resistance: item.band_resistance || null, reps: item.reps, set_number: item.set_number || 1 })) },
       nutrition: foodLogs.slice(0, 30).map((item) => ({ evidence_id: evidenceId("health_food_logs", idOf(item)), date: item.logged_on, food: item.food_name, quantity: item.quantity_text || null, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, fiber_g: item.fiber_g, estimate_source: item.estimate_source || null })),
       deep_work: deepWork.slice(0, 12).map((item) => ({ evidence_id: evidenceId("deep_work_logs", idOf(item)), date: item.created_at || item.logged_on, area: item.area, focus: item.focus, minutes: item.duration_minutes, output: item.output })),
       mastery_challenges: challenges.slice(0, 12).map((item) => ({ evidence_id: evidenceId("mastery_challenges", idOf(item)), title: item.title, status: item.status, completed_at: item.completed_at })),
       trade_reviews: tradeReviews.slice(0, 12).map((item) => ({ evidence_id: evidenceId("trade_reviews", idOf(item)), date: item.created_at || item.reviewed_at, summary: item.summary || item.review || null })),
       mission_progress_events: progressEvents.slice(0, 24).map((item) => ({ evidence_id: evidenceId("mission_progress_events", idOf(item)), mission_id: item.mission_id, metric: item.metric_key, quantity: item.quantity, occurred_at: item.occurred_at, source: item.source_type })),
       content_library: contentItems.slice(0, 12).map((item) => ({ evidence_id: evidenceId("content_items", idOf(item)), title: item.title, type: item.content_type || item.type, status: item.status })),
       director_review: directorReviews[0] ? { evidence_id: evidenceId("director_reviews", idOf(directorReviews[0])), quarter: directorReviews[0].quarter_key, wins: directorReviews[0].wins, bottlenecks: directorReviews[0].bottlenecks, standards: directorReviews[0].standards, next_focus: directorReviews[0].next_focus } : null,
      special_projects: { projects: projects.slice(0, 8).map((project) => ({ id: project.id, title: project.title, status: project.status, priority: project.priority })) },
       accounts: (records.accounts || []).slice(0, 8).map((account) => ({ name: account.account_name, starting_balance: account.starting_balance == null ? null : numberValue(account.starting_balance), balance_basis: account.current_balance != null || account.balance != null ? "reported_current_balance" : "starting_balance_only", current_balance: account.current_balance ?? account.balance ?? null, type: account.account_type || "Live" })),
       account_groups: (records.groups || []).slice(0, 12).map((group) => ({ name: group.name, type: group.account_type, prop_status: group.prop_status || "funded", payout_split_percent: group.account_type === "Prop Firm" ? group.profit_split_percent : 100 })),
      withdrawal_ledger: (records.withdrawals || []).slice(0, 12).map((item) => ({ group_id: item.group_id, date: item.withdrawn_at, gross_total: item.gross_total_usd, tracked_payout_total: item.payout_total_usd })),
      roadmap_state: { pending_or_active: roadmap.filter((item) => ["pending", "accepted"].includes(item.status)).map((item) => ({ id: item.id, title: item.title, phase: item.phase, category: item.category, status: item.status, evidence_ids: item.evidence_ids || [] })) },
      directive_history: directives.slice(0, 24).map((item) => ({ id: item.id, kind: item.mission_kind, title: item.title, status: item.status, evidence_ids: item.evidence_ids || [], escalation_level: item.escalation_level || 1, cadence_key: item.cadence_key || null, created_at: item.created_at, resolved_at: item.resolved_at })),
      recommendation_feedback: feedback.slice(0, 40).map((item) => ({ suggestion_id: item.suggestion_id, feedback_type: item.feedback_type, note: item.note || null, created_at: item.created_at })),
      calibration_reviews: calibration.slice(0, 4).map((item) => ({ id: item.id, week_start: item.week_start, summary: item.summary, adjustments: item.adjustments, created_at: item.created_at })),
      advisory_history: (records.advisoryHistory || []).slice(0, 8).map((item) => ({ id: item.id, type: item.advisory_type, created_at: item.created_at, focus: item.payload?.evening?.tomorrow_focus || null }))
    };
  }
  function sanitizeAdvisory(advisory = {}, context = {}) {
    const allowed = new Set((context.evidence_catalog || []).map((item) => item.id));
    const winRate = Number(context.trading?.win_rate);
    const unsupportedPerfectWinRate = (item) => {
      const text = `${item?.title || ""} ${item?.rationale || ""} ${(item?.evidence || []).join(" ")}`.toLowerCase();
      return winRate !== 100 && (/\bperfect\s+win\s+rate\b/.test(text) || /\b100(?:\.0+)?%\s+win\s+rate\b/.test(text));
    };
    return {
      ...advisory,
      roadmap: (advisory.roadmap || []).map((item) => ({ ...item, category: normalizeCategory(item.category), evidence_ids: (item.evidence_ids || []).filter((id) => allowed.has(id)).slice(0, 6) })),
      directives: (advisory.directives || []).filter((item) => !unsupportedPerfectWinRate(item)).map((item) => ({ ...item, category: normalizeCategory(item.category), evidence_ids: (item.evidence_ids || []).filter((id) => allowed.has(id)).slice(0, 6) }))
    };
  }
  return { buildContext, evidenceId, dateOnly, normalizeCategory, sanitizeAdvisory };
}));
