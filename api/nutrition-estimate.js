const SUPABASE_URL = "https://ifogfhaqozsyygbgwvzo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6knh69A_xVRQOPDotPrTcA_6_D_-RMa";
const DIRECTOR_EMAIL = "mat.investments.95@gmail.com";

const estimateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["food_name", "quantity", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "confidence", "assumptions"],
  properties: {
    food_name: { type: "string" },
    quantity: { type: "string" },
    calories: { type: "number", minimum: 0 },
    protein_g: { type: "number", minimum: 0 },
    carbs_g: { type: "number", minimum: 0 },
    fat_g: { type: "number", minimum: 0 },
    fiber_g: { type: "number", minimum: 0 },
    sugar_g: { type: "number", minimum: 0 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    assumptions: { type: "string" }
  }
};

async function verifyDirector(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const user = await response.json();
  return String(user.email || "").toLowerCase() === DIRECTOR_EMAIL;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Nutrition estimation is not configured on this deployment yet." });
  try {
    if (!(await verifyDirector(req))) return res.status(401).json({ error: "Secure AEGIS access is required." });
    const foodName = String(req.body?.food_name || "").trim();
    const quantity = String(req.body?.quantity || "").trim();
    if (!foodName || !quantity) return res.status(400).json({ error: "Food name and quantity are required." });
    if (foodName.length > 160 || quantity.length > 120) return res.status(400).json({ error: "Food name or quantity is too long." });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: "Estimate nutrition for a private food log. Use common nutrition references and the stated quantity. Return a rough estimate, never medical advice. Do not ask follow-up questions. If preparation, brand, or serving size is ambiguous, choose the most reasonable common assumption and state it. Keep values plausible and round calories to the nearest 5 and grams to one decimal place." }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({ food_name: foodName, quantity }) }] }
        ],
        text: { format: { type: "json_schema", name: "aegis_nutrition_estimate", strict: true, schema: estimateSchema } }
      })
    });
    if (!response.ok) return res.status(502).json({ error: "The nutrition estimator could not respond." });
    const payload = await response.json();
    const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!raw) return res.status(502).json({ error: "The nutrition estimator returned no readable estimate." });
    return res.status(200).json({ estimate: JSON.parse(raw) });
  } catch (error) {
    return res.status(500).json({ error: "Nutrition estimation encountered an error.", detail: String(error.message || error).slice(0, 180) });
  }
};
