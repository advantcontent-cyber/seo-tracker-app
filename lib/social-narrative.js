// LLM-drafted analyst narrative for the Social tab's Content Highlights / AI
// Insights / Recommendations panels. Same OpenRouter pattern as
// lib/sem-narrative.js/lib/report-narrative.js: the model is handed
// pre-computed, verified facts (metrics, account stats, the posts table) for
// the selected client/platform/week and told to write from those facts only.
//
// Ephemeral by design, same as lib/sem-narrative.js's AnalystNotes: a
// "Generate with AI" click drafts all three panels into edit mode so the
// analyst reviews/edits before clicking Done, which persists through the
// existing save path — nothing here writes to Supabase directly.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";

const RESPONSE_SHAPE = {
  contentHighlight: "an array of 2-4 short bullet strings (HTML-safe, may use <strong> for emphasis) about the single standout post this week — cite its real reach/views/engagement-rate numbers from the facts given, and say specifically why the content/caption worked, not just that it performed well",
  aiInsights: "an array of 3-5 short bullet strings analyzing this platform's overall performance this week vs. the previous week — cite the real metric deltas given, call out what's driving them (a specific post, a content-mix shift, fewer/more posts published), never invent a number not in the facts",
  recommendations: "an array of 3-4 short bullet strings — concrete content-pillar ideas for next month's ideation, each grounded in what worked this week per the facts given (reference the specific pillar/post pattern that performed well)",
};

function buildPrompt(facts) {
  const system = [
    "You are a social-media analyst writing the weekly 'Client Health' report",
    "for a luxury hotel's Facebook/Instagram content, for the selected",
    "platform tab. You are given a JSON object of VERIFIED facts — metrics",
    "with current-vs-previous deltas, normalized per-post averages, and the",
    "full posts table for the current week. Write ONLY from these facts —",
    "never invent, estimate, or restate a number differently than given.",
    "",
    "Voice: confident, concise analyst — short bullets, specific numbers, no",
    "fluff, no exclamation points, no generic filler. This goes straight into",
    "a client-facing report.",
    "",
    "Return ONLY a JSON object with this exact shape (all leaf values are",
    "arrays of strings):",
    JSON.stringify(RESPONSE_SHAPE, null, 2),
  ].join("\n");

  const user = JSON.stringify(facts, null, 2);
  return { system, user };
}

// Generates the Social tab's narrative from a facts object. Returns
// { contentHighlight, aiInsights, recommendations }, each an array of bullet
// strings. Throws on API/parse failure.
export async function generateSocialNotes(facts, apiKey) {
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
      max_tokens: 1400,
      reasoning: { effort: "none" },
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
    throw new Error(`Failed to parse Social narrative JSON from model response: ${content.slice(0, 300) || "(empty)"}`);
  }
}
