// LLM-generated analyst narrative for the "Generate Report" feature. Reuses
// the OpenRouter/Claude pattern from lib/drafting.js. The model is handed a
// JSON object of PRE-COMPUTED, verified facts and is explicitly instructed to
// write from those facts only — never to invent or recompute a number itself.
// This mirrors the EEAT-conscious approach in lib/drafting.js's blog-draft
// prompt: the model's job is phrasing, not arithmetic or invention.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-3.7-sonnet";

const RESPONSE_SHAPE = {
  summary: "1 short paragraph overview of the month, referencing the conversion rate and average position facts",
  dailyPerformance: "1 paragraph on the daily trend — must cite the exact bestDay and peakImpressionsDay facts given",
  interestNarrative: "1 paragraph comparing branded vs non-branded search interest",
  interestWarning: "1-2 sentences flagging the single most actionable item from nearPageOneQueries, or an empty string if that list is empty",
  geography: "1 paragraph on the country breakdown in the geography fact",
  aiSearch: "1 paragraph on the AI-engine referral trend, or an empty string if aiSearch is null",
  aiSearchNote: "1 sentence caveat about small sample sizes if aiSearch session totals are under ~500, else an empty string",
  nextSteps: "an array of exactly 5 objects {tag, title, body} — tag is one of 'Quick win', 'Build', 'Groundwork', title is under 8 words, body is 1-2 sentences — ordered by effort-to-impact ascending, grounded only in the facts given (nearPageOneQueries, contentOpportunities, aiSearch, actionPlanHighlights)",
};

function buildPrompt(facts) {
  const system = [
    "You are a senior SEO/analytics consultant writing a monthly performance",
    "report for a luxury hotel client. You are given a JSON object of VERIFIED",
    "facts for the month. Write ONLY from these facts — never invent, estimate,",
    "or restate a number differently than given. Your job is phrasing and",
    "narrative structure, not analysis of numbers you were not given.",
    "",
    "Voice: confident, concise analyst — short sentences, specific numbers, no",
    "fluff, no exclamation points, no generic filler ('in today's digital",
    "landscape', 'it's important to note'). Write as if to a client who reads",
    "one of these every month and wants the point made quickly.",
    "",
    "Return ONLY a JSON object with this exact shape (all leaf values are",
    "strings unless noted otherwise):",
    JSON.stringify(RESPONSE_SHAPE, null, 2),
  ].join("\n");

  const user = JSON.stringify(facts, null, 2);
  return { system, user };
}

// Generates the report narrative from a facts object. Returns the parsed
// shape described in RESPONSE_SHAPE. Throws on API/parse failure.
export async function generateReportNarrative(facts, apiKey) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const { system, user } = buildPrompt(facts);

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      max_tokens: 2200,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
  } catch {
    throw new Error("Failed to parse narrative JSON from model response");
  }
}
