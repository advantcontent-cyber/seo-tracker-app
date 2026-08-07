// LLM-drafted analyst notes for the SEM Summary tab — Good Points / Things
// to Improve / What We've Done / Next Steps. Mirrors lib/report-narrative.js:
// the model is handed pre-computed, verified SEM facts and told to write
// from those facts only, never to invent or recompute a number.
//
// "What We've Done" is the one box the model genuinely cannot know for
// certain — it has no visibility into actual account changes (a paused ad
// set, new creative, a budget shift), only the resulting metrics. It's
// prompted to phrase this as an inference from the numbers ("Meta spend
// dropped sharply on Aug 3, consistent with a budget change") rather than
// stated as fact — the box is freely editable so the team can replace it
// with what actually happened that period.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";

const RESPONSE_SHAPE = {
  goodPoints: "an array of 3-4 short bullet strings (under 20 words each) — what's working this period. Every bullet must name Meta or Google (or both) specifically, with a concrete number from the facts given — never a vague combined-only statement",
  thingsToImprove: "an array of 3-4 short bullet strings — what's underperforming or worth watching this period. Same rule: name the platform, cite a number",
  whatWeDone: "an array of 2-3 short bullet strings INFERRING likely account changes from the metric patterns given (a spend cliff, a CTR jump, a sudden conversion drop) — phrase every bullet as an inference ('...consistent with...', '...suggesting...'), never as a stated fact, since you were not told what the team actually changed",
  nextSteps: "an array of 3-4 short bullet strings — concrete next actions for Meta and/or Google, grounded only in the facts given",
};

function buildPrompt(facts) {
  const system = [
    "You are a paid-media analyst writing a short monthly summary of a",
    "hotel client's Meta + Google Ads performance for the selected period.",
    "You are given a JSON object of VERIFIED facts, broken out by platform",
    "and combined, plus the prior period of equal length for comparison.",
    "Write ONLY from these facts — never invent, estimate, or restate a",
    "number differently than given.",
    "",
    "Voice: confident, concise analyst — short bullets, specific numbers,",
    "no fluff, no exclamation points, no generic filler.",
    "",
    "Return ONLY a JSON object with this exact shape (all leaf values are",
    "arrays of strings):",
    JSON.stringify(RESPONSE_SHAPE, null, 2),
  ].join("\n");

  const user = JSON.stringify(facts, null, 2);
  return { system, user };
}

// Generates the SEM analyst notes from a facts object. Returns the parsed
// { goodPoints, thingsToImprove, whatWeDone, nextSteps } shape. Throws on
// API/parse failure.
export async function generateSemNotes(facts, apiKey) {
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
      max_tokens: 1200,
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
    throw new Error(`Failed to parse SEM notes JSON from model response: ${content.slice(0, 300) || "(empty)"}`);
  }
}
