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
    return [trade?.outcome, trade?.win_loss, trade?.result].map(normalizedOutcome).find(Boolean)
      || (Number(trade?.r_multiple) > 0 ? "win" : Number(trade?.r_multiple) < 0 ? "loss" : "be");
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
  const streakFor = (dates) => {
    const unique = [...new Set(dates.map(dateOnly).filter(Boolean))].sort().reverse();
    if (!unique.length) return { current: 0, best: 0, last: null };
    let best = 1, run = 1;
    for (let index = 1; index < unique.length; index += 1) {
      run = Number(new Date(`${unique[index - 1]}T12:00:00Z`) - new Date(`${unique[index]}T12:00:00Z`)) === 86400000 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return { current: unique[0] ? run : 0, best, last: unique[0] };
  };

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
    const effectiveOperations = [...operations.filter((operation) => !recurringIds.has(idOf(operation)) || !occurrences.some((occurrence) => String(occurrence.operation_id) === idOf(operation))), ...occurrenceRows];
    const liveTrades = trades.filter((trade) => String(trade.account || "").trim().toLowerCase() !== "theoretical");
    const closed = liveTrades.filter((trade) => tradeOutcome(trade) !== "open");
    const wins = closed.filter((trade) => tradeOutcome(trade) === "win").length;
    const losses = closed.filter((trade) => tradeOutcome(trade) === "loss").length;
    const currentMonth = new Date(`${operatingDate}T12:00:00Z`).getUTCMonth();
    const monthPnl = closed.filter((trade) => new Date(trade.traded_at || trade.created_at || 0).getUTCMonth() === currentMonth).reduce((sum, trade) => sum + Number(trade.pnl_percent || 0), 0);
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
    return {
      generated_on: new Date().toISOString(), scan_mode: mode, operating_date: operatingDate, evidence_date: targetDate, evidence_window: mode === "morning" ? "previous_operating_day" : mode === "bedtime" ? "current_operating_day" : "current_context",
      active_phase: `Phase ${phaseValue?.active_phase ?? 0}`,
      evidence_catalog: evidenceCatalog,
      evidence_summary: { target_date: targetDate, target_count: evidence.filter((item) => item.date === targetDate).length, total_count: evidence.length },
      streaks: { execution: streakFor(effectiveOperations.filter((operation) => operation.completed || operation.status === "Complete").map((operation) => operation.completed_on || operation.scheduled_date || operation.created_at)), trading_journal: streakFor(liveTrades.map((trade) => trade.traded_at || trade.created_at)), mastery: streakFor(mastery.map((entry) => entry.created_at)) },
      operations: { today_total: todayOperations.length, today_complete: todayOperations.filter((operation) => operation.completed || operation.status === "Complete").length, open_total: effectiveOperations.filter((operation) => !operation.completed && operation.status !== "Complete").length, next: effectiveOperations.filter((operation) => !operation.completed && operation.status !== "Complete").slice(0, 8).map((operation) => ({ id: operation.id, title: operation.title, category: operation.category, status: operation.status || "Queued", scheduled_date: operation.scheduled_date || operation.operation_date || null, scheduled_time: operation.scheduled_time || null })) },
       missions: activeMissions.slice(0, 12).map((mission) => ({ id: mission.id, title: mission.title, category: mission.category, priority: mission.priority, progress: missionProgress(mission), definition: mission.completion_definition || null, source_suggestion_id: mission.source_suggestion_id || null, source_advisory_id: mission.source_advisory_id || null, evidence_ids: mission.evidence_ids || [] })),
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
      accounts: (records.accounts || []).slice(0, 8).map((account) => ({ name: account.account_name, current_balance: account.current_balance, type: account.account_type || "Live" })),
      account_groups: (records.groups || []).slice(0, 12).map((group) => ({ name: group.name, type: group.account_type, payout_split_percent: group.account_type === "Prop Firm" ? group.profit_split_percent : 100 })),
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
    return {
      ...advisory,
      roadmap: (advisory.roadmap || []).map((item) => ({ ...item, evidence_ids: (item.evidence_ids || []).filter((id) => allowed.has(id)).slice(0, 6) })),
      directives: (advisory.directives || []).map((item) => ({ ...item, evidence_ids: (item.evidence_ids || []).filter((id) => allowed.has(id)).slice(0, 6) }))
    };
  }
  return { buildContext, evidenceId, dateOnly, sanitizeAdvisory };
}));
