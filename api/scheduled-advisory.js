const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";

const schema = {
  type: "object", additionalProperties: false, required: ["morning", "signal", "evening", "proposals"],
  properties: {
    morning: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
    signal: { type: "object", additionalProperties: false, required: ["jarvis", "alfred", "market_tone", "opportunity_window", "focus_area", "risk_posture"], properties: { jarvis: { type: "string" }, alfred: { type: "string" }, market_tone: { type: "string" }, opportunity_window: { type: "string" }, focus_area: { type: "string" }, risk_posture: { type: "string" } } },
    evening: { type: "object", additionalProperties: false, required: ["key_takeaways", "what_worked", "what_to_improve", "tomorrow_focus"], properties: {
      key_takeaways: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_worked: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      what_to_improve: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } },
      tomorrow_focus: { type: "object", additionalProperties: false, required: ["jarvis", "alfred"], properties: { jarvis: { type: "string" }, alfred: { type: "string" } } }
    } },
    proposals: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, required: ["advisor", "mission_kind", "title", "category", "priority", "rationale", "evidence"], properties: { advisor: { type: "string", enum: ["Jarvis", "Alfred"] }, mission_kind: { type: "string", enum: ["corrective", "challenge"] }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Mind"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } } } } }
  }
};

const prompt = `You are the automated Jarvis/Alfred advisory system for a private five-year personal operating system. JARVIS is analytical and exact. ALFRED is grounded, demanding, and humane. Only use the evidence supplied. Do not give buy/sell/hold advice, price targets, position sizing, medical diagnoses, treatment plans, or instructions that conflict with clinicians. Discuss trading only as process quality, rule adherence, review, and risk discipline. Keep every message concise. Corrective missions are only for repeated/material evidence gaps and are non-negotiable. Challenge missions are optional stretch assignments. At most one corrective and two challenges. Use the exact JSON schema.`;

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

function tradeOutcome(trade) {
  const raw = String(trade.outcome || trade.win_loss || trade.result || "").toLowerCase();
  if (raw.includes("win") || Number(trade.r_multiple) > 0) return "win";
  if (raw.includes("loss") || Number(trade.r_multiple) < 0) return "loss";
  return "be";
}

async function buildContext(serviceKey, userId) {
  const query = (table, order, limit) => rest(serviceKey, `${table}?user_id=eq.${encodeURIComponent(userId)}&select=*&order=${order}&limit=${limit}`).then((response) => response.ok ? response.json() : []);
  const [operations, missions, trades, recovery, mastery, projects, phase] = await Promise.all([
    query("operations", "scheduled_date.desc", 180), query("missions", "created_at.desc", 50), query("trade_debriefs", "traded_at.desc", 100), query("recovery_logs", "logged_on.desc", 10), query("mastery_entries", "created_at.desc", 100), query("business_projects", "created_at.desc", 30), query("phase_protocols", "created_at.desc", 1)
  ]);
  const closed = trades.filter((trade) => String(trade.trade_status || "").toLowerCase() !== "open");
  const wins = closed.filter((trade) => tradeOutcome(trade) === "win").length;
  const losses = closed.filter((trade) => tradeOutcome(trade) === "loss").length;
  const openOperations = operations.filter((item) => !item.completed && item.status !== "Complete");
  return {
    active_phase: `Phase ${phase[0]?.active_phase ?? 0}`,
    operations: { open_total: openOperations.length, completed_total: operations.length - openOperations.length, next: openOperations.slice(0, 8).map(({ title, category, status }) => ({ title, category, status: status || "Queued" })) },
    missions: missions.filter((item) => !item.completed).slice(0, 8).map(({ title, category, priority, completion_definition }) => ({ title, category, priority, definition: completion_definition || null })),
    trading: { closed_trades: closed.length, wins, losses, breakeven: closed.length - wins - losses, win_rate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null, plan_violations: trades.filter((trade) => trade.plan_violation).length },
    recovery: recovery.slice(0, 5), mastery: { total_entries: mastery.length, recent: mastery.slice(0, 8) }, special_projects: projects.slice(0, 8)
  };
}

async function askOpenAI(context, mode) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", input: [{ role: "system", content: [{ type: "input_text", text: prompt }] }, { role: "user", content: [{ type: "input_text", text: `Generate the ${mode} automatic scan from this data:\n${JSON.stringify(context)}` }] }], text: { format: { type: "json_schema", name: "aegis_scheduled_advisory", strict: true, schema } } })
  });
  if (!response.ok) throw new Error("OpenAI did not return an advisory.");
  const payload = await response.json();
  const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  return JSON.parse(raw);
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.CRON_SECRET) return res.status(503).json({ error: "Scheduled intelligence is not configured." });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized scheduled request." });
  try {
    const clock = easternClock();
    const requestedMode = new URL(req.url, "https://aegis-command.local").searchParams.get("mode");
    const mode = ["morning", "evening"].includes(requestedMode) ? requestedMode : clock.hour === 5 ? "morning" : clock.hour === 0 ? "evening" : null;
    if (!mode) return res.status(204).end();
    const director = await adminUser(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!director) throw new Error("Director account not found.");
    const recent = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `ai_advisories?user_id=eq.${director.id}&select=advisory_type,payload&order=created_at.desc&limit=12`).then((response) => response.ok ? response.json() : []);
    if (recent.some((item) => item.advisory_type === mode && item.payload?.schedule_date === clock.date)) return res.status(200).json({ status: "already-complete", mode, date: clock.date });
    const advisory = await askOpenAI(await buildContext(process.env.SUPABASE_SERVICE_ROLE_KEY, director.id), mode);
    advisory.schedule_date = clock.date;
    const stored = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_advisories", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: director.id, advisory_type: mode, payload: advisory }) });
    if (!stored.ok) throw new Error("Could not store the scheduled advisory.");
    const [record] = await stored.json();
    const proposals = advisory.proposals || [];
    if (proposals.length) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "ai_mission_suggestions", { method: "POST", body: JSON.stringify(proposals.map((item) => ({ ...item, user_id: director.id, advisory_id: record.id }))) });
    const corrective = proposals.filter((item) => item.mission_kind === "corrective");
    for (const item of corrective) {
      const existing = await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, `missions?user_id=eq.${director.id}&title=eq.${encodeURIComponent(item.title)}&completed=eq.false&select=id&limit=1`).then((response) => response.ok ? response.json() : []);
      if (!existing.length) await rest(process.env.SUPABASE_SERVICE_ROLE_KEY, "missions", { method: "POST", body: JSON.stringify({ user_id: director.id, title: item.title, category: item.category, priority: "Do now", completion_type: "binary", completion_definition: `System corrective from ${item.advisor}: ${item.rationale}`, completed: false, completed_count: 0, progress: 0 }) });
    }
    return res.status(200).json({ status: "complete", mode, date: clock.date, proposals: proposals.length });
  } catch (error) { return res.status(500).json({ error: String(error.message || error) }); }
};
