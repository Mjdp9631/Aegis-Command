const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6knh69A_xVRQOPDotPrTcA_6_D_-RMa";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";
const { CAMPAIGN_CHARTER } = require("../campaign-charter.js");
const { sanitizeAdvisory } = require("../ai-context.js");

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["morning", "signal", "evening", "sections", "roadmap", "directives"],
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
    roadmap: { type: "array", maxItems: 1, items: { type: "object", additionalProperties: false, required: ["phase", "title", "category", "priority", "objective", "rationale", "evidence", "evidence_ids"], properties: { phase: { type: "integer", minimum: 0, maximum: 4 }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Mind"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, objective: { type: "string" }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } }, evidence_ids: { type: "array", maxItems: 6, items: { type: "string" } } } } },
    directives: { type: "array", maxItems: 2, items: { type: "object", additionalProperties: false, required: ["advisor", "mission_kind", "title", "category", "priority", "rationale", "evidence", "evidence_ids", "cadence_key", "escalation_level"], properties: { advisor: { type: "string", enum: ["Jarvis", "Alfred"] }, mission_kind: { type: "string", enum: ["corrective", "challenge"] }, title: { type: "string" }, category: { type: "string", enum: ["Recovery", "Trading", "Business", "Mind"] }, priority: { type: "string", enum: ["Do now", "Schedule"] }, rationale: { type: "string" }, evidence: { type: "array", maxItems: 3, items: { type: "string" } }, evidence_ids: { type: "array", maxItems: 6, items: { type: "string" } }, cadence_key: { type: "string" }, escalation_level: { type: "integer", minimum: 1, maximum: 3 } } } }
  }
};

const systemPrompt = `You are the dual advisory intelligence for a private five-year personal operating system named AEGIS COMMAND. You produce two distinct, evidence-based perspectives from the provided data.

JARVIS is analytical and exact: prioritization, systems, trading-process evidence, trend detection, bottlenecks, and leverage.
ALFRED is grounded and demanding but humane: recovery, sustainable standards, character, balance, and follow-through.

Never issue buy/sell/hold directions, price targets, position sizing, investment advice, diagnoses, treatment plans, or instructions that conflict with clinicians. Discuss trading only as process quality, data collection, rule adherence, risk discipline, and review. Do not invent data. Never call a single weak data point a pattern. Keep each field concise (normally 1–2 sentences). Corrective missions are for repeated or material evidence gaps; challenge missions are optional stretch assignments when consistency or evidence supports them. At most one corrective and two challenges. Use the exact JSON schema. The trading.authoritative_summary field is the final accounting record: never reinterpret it, never infer a perfect record from the closed-trade total, and never use a numerical trading claim that conflicts with it.`;

const marketRules = `Market rules: the user's primary market is Forex, open Sunday at 5:00 PM Eastern through Friday at 5:00 PM Eastern. Crypto can trade continuously, but the user trades it rarely; do not assume crypto activity without a logged crypto trade. The user does not need to trade every day, and a no-trade day is not a failure or evidence gap by itself. Do not create a trading corrective merely because no trade occurred. A complete absence of any logged evidence for two or more operating days is different from simply not taking a trade.`;

const sectionInstructions = `Every scan must refresh EVERY area, not only the Command Center. In sections: detective is strictly trade-log/process/risk-discipline advice; missions is prioritization and follow-through; enterprise is Special Projects / CCFX execution; recovery is clinician-safe recovery and logging; mastery is Mind/Body learning, training, and personal development; character is earned levels, evidence, streaks, and phase readiness. Jarvis and Alfred must give distinct advice in every section. Do not repeat the same message across sections.

For trading statistics, use ONLY the exact supplied values for closed trades, wins, losses, breakeven, win rate, month PnL, plan violations, current streak, longest win streak, and longest loss streak. The trading.authoritative_summary is authoritative. Never calculate a new statistic. Never call trades consecutive wins or losses unless an explicit streak value is supplied; closed-trade count is not a streak. Never describe results as perfect, loss-free, or 100% unless the authoritative summary explicitly proves it. If evidence is insufficient, say so plainly.

For mode "morning", direct the morning section toward today's plan, signal toward current attention/risk, and evening toward what should be evaluated later without claiming results that have not happened. For mode "evening", make the evening section a true review of today's evidence and make the morning section the first priority for the next operating day. For mode "scan", assess only the current moment.

Two lanes: ROADMAP is the intentional five-year campaign toward a real-world Bruce Wayne / Tony Stark: capable body and recovery, disciplined Detective-grade trading process, intellectual range, financial independence, and useful enterprise. Return one roadmap item only when the supplied roadmap state has fewer than two active accepted items or shows a completed/obsolete item. Otherwise return []. DIRECTIVES are adaptive, not routine. Default to []. A corrective is non-negotiable only when the supplied history demonstrates a repeated meaningful pattern AND it directly repairs an accepted roadmap mission, active-phase requirement, or roadmap bottleneck. It may also impose a proportional consequence, but the consequence must reinforce the missed standard (extra evidence-based work or escalating XP loss), never be arbitrary. Escalation may rise only if that same pattern persists through past directives. A challenge is optional and only when a demonstrated strength has earned a stretch assignment; do not issue it if a recent challenge is in the supplied history. Never create a directive merely because a scan occurred. Jarvis and Alfred may each issue separate roadmap-supporting transmissions, but they must use the same active-phase priorities and must never contradict one another; if only one useful transmission exists, return only one. Deep-work logs, Director Reviews, and self-generated mastery transmissions inform advice and reflection, but must not independently trigger a corrective or challenge. At most one corrective and one challenge.`;

async function verifyDirector(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!result.ok) return false;
  const user = await result.json();
  return String(user.email || "").toLowerCase() === DIRECTOR_EMAIL;
}

function send(res, status, body) {
  res.status(status).json(body);
}

function latestEvidenceDay(context, throughDate = "") {
  const values = [
    ...(context?.activity_ledger?.recent || []).map((item) => item.occurred_at),
    ...(context?.trading?.recent || []).map((item) => item.date || item.traded_at),
    ...(context?.mastery?.recent || []).map((item) => item.date || item.created_at),
    ...(context?.recovery || []).map((item) => item.logged_on || item.created_at),
    ...(context?.mastery?.fitness?.sessions || []).map((item) => item.date || item.logged_on),
  ].map((value) => value ? String(value).slice(0, 10) : "").filter((value) => value && (!throughDate || value <= throughDate));
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
        category: "Mind",
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
    ["Complete one focused mastery block", "Mind", "Protect 30 minutes for deliberate learning, then record the idea and how it changes your next action."],
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

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: "AI is not configured on this deployment yet." });
  try {
    if (!(await verifyDirector(req))) return send(res, 401, { error: "Secure AEGIS access is required." });
    const context = req.body?.context;
    if (!context || typeof context !== "object") return send(res, 400, { error: "No command data was provided." });
    const modeRules = req.body?.mode === "bedtime"
      ? "This is the user's Going to bed evening debrief. Review the operating day represented by evidence_date, including late activity before sleep. This is read-only: do not issue directives, missions, roadmap changes, or operation changes."
      : "This is an analytical scan. Do not turn missing context into a mission unless the evidence supports it.";
    const openai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: `${systemPrompt}\n\n${marketRules}\n\n${sectionInstructions}\n\n${modeRules}\n\n${CAMPAIGN_CHARTER}` }] },
          { role: "user", content: [{ type: "input_text", text: `Analyze this AEGIS data. Current request mode: ${String(req.body?.mode || "scan")}.\n\n${JSON.stringify(context)}` }] }
        ],
        text: { format: { type: "json_schema", name: "aegis_dual_advisory", strict: true, schema: responseSchema } }
      })
    });
    if (!openai.ok) {
      const detail = await openai.text();
      return send(res, 502, { error: "The advisory engine could not respond.", detail: detail.slice(0, 240) });
    }
    const output = await openai.json();
    const raw = output.output_text || output.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!raw) return send(res, 502, { error: "The advisory engine returned no readable briefing." });
    const generated = sanitizeAdvisory(JSON.parse(raw), context);
    // Going to bed is a read-only debrief. It can never create directives,
    // missions, roadmap rows, or operation changes.
    const advisory = req.body?.mode === "bedtime"
      ? { ...generated, directives: [], roadmap: [] }
      : addInactivityDirective(generated, context, context.operating_date || new Date().toISOString().slice(0, 10));
    return send(res, 200, { advisory });
  } catch (error) {
    return send(res, 500, { error: "Command intelligence encountered an error.", detail: String(error.message || error).slice(0, 180) });
  }
};
