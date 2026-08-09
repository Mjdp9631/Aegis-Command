const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6knh69A_xVRQOPDotPrTcA_6_D_-RMa";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";

async function director(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const result = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, authorization: "Bearer " + token } });
  if (!result.ok) return false;
  return String((await result.json()).email || "").toLowerCase() === DIRECTOR_EMAIL;
}

const text = { type: "string" };
const schema = { type: "object", additionalProperties: false, required: ["accuracy_grade", "overall_assessment", "definition_assessment", "personal_meaning_assessment", "application_assessment", "strong_points", "corrections", "next_step"], properties: {
  accuracy_grade: { type: "string", enum: ["Accurate", "Mostly accurate", "Partly accurate", "Needs revision"] }, overall_assessment: text, definition_assessment: text, personal_meaning_assessment: text, application_assessment: text,
  strong_points: { type: "array", maxItems: 3, items: text }, corrections: { type: "array", maxItems: 4, items: text }, next_step: text
}};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI is not configured on this deployment yet." });
  try {
    if (!(await director(req))) return res.status(401).json({ error: "Secure AEGIS access is required." });
    const { topic = "", category = "", definition = "", personal_meaning = "", application = "" } = req.body || {};
    if (![topic, definition, personal_meaning, application].every(value => String(value).trim())) return res.status(400).json({ error: "Complete all three research prompts before requesting a review." });
    const prompt = `You are AEGIS, an exacting but fair educational reviewer. Audit the user's self-directed research synthesis about ${topic} (${category}).\n\nDefinition: ${definition}\n\nWhat it means for the user: ${personal_meaning}\n\nHow the user will apply it: ${application}\n\nCheck the definition for factual accuracy. The personal and application sections are subjective: only flag factual errors, harmful or impractical applications, or a missing connection to the topic. Do not use hype, praise for its own sake, or empty encouragement. Be candid, concise, and clear about uncertainty. Do not invent citations. Return the required JSON only.`;
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4.1-mini", input: prompt, text: { format: { type: "json_schema", name: "mastery_research_review", strict: true, schema } } }) });
    if (!response.ok) throw new Error((await response.text()).slice(0, 200));
    const result = await response.json();
    const raw = result.output_text || result.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
    if (!raw) throw new Error("The accuracy reviewer returned no readable assessment.");
    return res.status(200).json({ assessment: JSON.parse(raw) });
  } catch (error) { return res.status(500).json({ error: "AEGIS could not review this synthesis: " + (error.message || "Unknown error") }); }
};
