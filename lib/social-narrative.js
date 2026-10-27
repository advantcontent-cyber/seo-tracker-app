// LLM-drafted analyst narrative for the Social tab's Content Highlights / AI
// Insights / Content Pillar Insights / Recommendations panels, plus the
// per-post summaries. Same OpenRouter pattern as
// lib/sem-narrative.js/lib/report-narrative.js: the model is handed
// pre-computed, verified facts (metrics, account stats, the posts table) for
// the selected client/platform/week and told to write from those facts only.
//
// Nothing here writes to Supabase directly — the callers persist the result
// (the Social tab saves generated notes per client + date range + platform).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";

const RESPONSE_SHAPE = {
  contentHighlight: "an array of 2-3 short bullet strings about the standout post(s) in the period. Lead with the EXECUTION — the topic, the content idea, the hook/format/visual treatment and why it landed with the audience, using the post's summary/caption excerpt — and support it with at most one or two numbers (views, engagement rate). Never a metrics-only line",
  aiInsights: "an array of 3-5 short bullet strings. SCOPE depends on `platform`: 'overall' = the overall health of the account across all channels (how Facebook and Instagram together moved); 'facebook' = Facebook health for this client only; 'instagram' = Instagram health for this client only. Cover the change vs the previous period AND how the period sits against the 6-month baseline (normalized figures), and say what drove it",
  pillarInsights: "an array of 2-4 short bullet strings comparing what each content pillar showed vs how it performed in this period (use pillarStats: posts, avg views, avg engagement, engagement rate). Name the best and weakest pillar, say whether the idea or the execution/platform fit was the issue, and note pillars with too few posts to judge. Skip 'Unassigned' unless it is most of the posts",
  quickWins: "an array of 2-3 short bullet strings — actions that can be applied NOW with low production effort (re-sharing, re-editing a hook, Stories, caption/CTA tweaks, posting-time tweaks). Each grounded in a specific post or pattern from the facts",
  nextMonthIdeas: "an array of 2-4 short bullet strings — content ideas and format/pillar-mix changes to feed into NEXT MONTH's content-calendar planning (the calendar is planned monthly, so these cannot be applied this week). Each grounded in what worked or failed in this period",
};

function buildPrompt(facts) {
  const system = [
    "You are a social-media analyst writing the 'Client Health' report for a",
    "client's organic Facebook/Instagram content, for the selected platform",
    "tab and date range. You are given a JSON object of VERIFIED facts —",
    "metrics with deltas vs the previous period, normalized figures with",
    "deltas vs the previous-6-months baseline, per-pillar stats, and the posts",
    "of the period (with a summary/caption excerpt). Write ONLY from these",
    "facts — never invent, estimate, or restate a number differently than given.",
    "",
    "All figures are organic only (no paid). Views is the primary reach-type",
    "metric; do not mention Reach. Engagement rate is interactions ÷ views.",
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

async function chat(system, user, apiKey, maxTokens, temperature) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature, max_tokens: maxTokens, reasoning: { effort: "none" },
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

// One-line descriptive summary per post (what the post was about: the content
// and idea), so the posts table doesn't repeat whole captions. `posts` is
// [{ key, type, text }]; returns { [key]: summary }.
export async function summarizePosts(posts, apiKey) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  if (!posts.length) return {};
  const system = [
    "You summarise social-media posts for an analyst's report. For each post",
    "write ONE short sentence (max ~20 words) describing what the post was",
    "about — the content and the idea (e.g. 'Reel of the sunrise breakfast",
    "ritual on the terrace, pitching slow mornings'). Do not copy the caption,",
    "no hashtags, no emojis, no marketing fluff. Write in English even if the",
    "caption is in another language.",
    "Return ONLY a JSON object mapping each post's `key` to its summary string.",
  ].join("\n");
  const user = JSON.stringify(posts.map((p) => ({ key: p.key, type: p.type, caption: (p.text || "").slice(0, 700) })), null, 2);
  const out = await chat(system, user, apiKey, 2000, 0.3);
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => posts.some((p) => p.key === k) && typeof v === "string" && v.trim()));
}

// Generates the Social tab's narrative from a facts object. Returns
// { contentHighlight, aiInsights, pillarInsights, quickWins, nextMonthIdeas },
// each an array of bullet strings. Throws on API/parse failure.
export async function generateSocialNotes(facts, apiKey) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const { system, user } = buildPrompt(facts);
  return chat(system, user, apiKey, 2200, 0.5);
}
