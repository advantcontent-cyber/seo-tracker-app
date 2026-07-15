// Drafting pipeline helpers: pick the month's blog opportunities (same logic as
// the dashboard) and generate an on-brand, EEAT-scaffolded draft via OpenRouter.

/* ---- keyword selection (mirrors components/SeoTracker.jsx) ---------------- */

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ctrFor = (pos) => clampN(0.34 / Math.pow(pos, 0.7), 0.004, 0.5);

const INFO_HINTS = [
  "things to do", "guide", "tips", "itinerary", "getaway", "honeymoon", "romantic",
  "family", "adventure", "vineyard", "wine", "northern lights", "staycation",
  "history", "what to", "how to", "tours",
  "ที่เที่ยว", "เที่ยว", "รีวิว", "วิธี", "การเดินทาง",
];
const intentOf = (k) => (INFO_HINTS.some((h) => k.toLowerCase().includes(h)) ? "blog" : "optimise");

const NOISE_HINTS = [
  "weather", "forecast", "temperature", "humidity", "rain",
  "สภาพอากาศ", "อากาศ", "พยากรณ์", "อุณหภูมิ", "ฝนตก",
  "map", "directions", "แผนที่", "เส้นทาง",
];
const isNoiseQuery = (k) => { const s = k.toLowerCase(); return NOISE_HINTS.some((h) => s.includes(h)); };

const BRAND_TERMS = {
  "Shinta Mani Wild": ["shinta mani", "shintamani", "bensley"],
  "Nomad Greenland":  ["nomad greenland", "nomadgreenland"],
  "Sora Sukhumvit":   ["sora sukhumvit", "sora hotel", "sorahotels"],
  "IC Khao Yai":      ["intercontinental khao yai", "ic khao yai", "intercontinental"],
};
const isBrandQuery = (clientName, k) => {
  const s = k.toLowerCase();
  return (BRAND_TERMS[clientName] || []).some((b) => s.includes(b));
};

// Readable English: Latin script, at least two words (drops Thai / fragments).
const isReadableQuery = (q) => {
  if (!q) return false;
  if (/[^ -ɏ]/.test(q)) return false;
  return /[a-z]+\s+[a-z]/i.test(q.trim());
};

// Top N blog-intent opportunities for a client/month, ranked by click gap.
// gscData is the object from fetchGscData().data. Returns [{ keyword, page,
// impressions, position, gap }].
export function selectBlogKeywords(gscData, clientName, monthNum, limit = 2) {
  const rows = gscData?.[clientName]?.[monthNum]?.topQueries ?? [];
  return rows
    .map((row) => {
      const k = row.k ?? row.q;
      const pos = row.position ?? 0;
      const impressions = Math.round(row.impressions ?? 0);
      const curClicks = Math.round(row.clicks ?? 0);
      const gap = Math.max(0, Math.round(impressions * ctrFor(Math.min(pos, 3))) - curClicks);
      return { keyword: k, page: row.page ?? null, impressions, position: pos, gap, intent: intentOf(k) };
    })
    .filter((o) =>
      o.gap > 0 &&
      o.intent === "blog" &&
      isReadableQuery(o.keyword) &&
      !isNoiseQuery(o.keyword) &&
      !isBrandQuery(clientName, o.keyword)
    )
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);
}

// Commercial/optimise-intent queries sitting just off page one (position 4-20)
// — the "almost there" pages worth an on-page push rather than a new post.
// Powers the report's "Where the interest is" section. Same shape as
// selectBlogKeywords but filtered to intent === "optimise".
export function selectNearPageOneQueries(gscData, clientName, monthNum, limit = 3) {
  const rows = gscData?.[clientName]?.[monthNum]?.topQueries ?? [];
  return rows
    .map((row) => {
      const k = row.k ?? row.q;
      const pos = row.position ?? 0;
      const impressions = Math.round(row.impressions ?? 0);
      return { keyword: k, page: row.page ?? null, impressions, position: Math.round(pos * 10) / 10, intent: intentOf(k) };
    })
    .filter((o) =>
      o.position > 3 &&
      o.position <= 20 &&
      o.intent === "optimise" &&
      isReadableQuery(o.keyword) &&
      !isNoiseQuery(o.keyword) &&
      !isBrandQuery(clientName, o.keyword)
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/* ---- draft generation via OpenRouter -------------------------------------- */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Override with OPENROUTER_MODEL to whatever your OpenRouter account can access.
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-3.7-sonnet";

function buildPrompt({ clientName, keyword, voiceProfile, rankingPage }) {
  const system = [
    "You are a senior SEO content writer drafting a blog post for a luxury hotel.",
    "Write strictly in the brand voice described below. Follow Google's EEAT guidance:",
    "scaffold genuine Experience/Expertise/Authority/Trust but DO NOT fabricate facts,",
    "reviews, statistics, awards, quotes, or first-hand experiences. Where a real,",
    "verifiable detail is needed (specific place names, seasonal facts, on-property",
    "anecdotes, internal links), insert a clearly marked placeholder like",
    "[VERIFY: ...] or [INTERNAL LINK: ...] for a human to complete. Never invent them.",
    "The draft is for human review and publishing — never final.",
    "",
    "=== BRAND VOICE PROFILE ===",
    voiceProfile || "(no profile provided — use a sophisticated, inviting luxury tone)",
  ].join("\n");

  const user = [
    `Property: ${clientName}`,
    `Target keyword: "${keyword}"`,
    rankingPage ? `Page currently ranking for this query (context): ${rankingPage}` : "",
    "",
    "Write a complete first-draft blog post (~900–1200 words) targeting the keyword.",
    "Requirements:",
    "- Use the keyword naturally in the SEO title, the intro, and one H2 (no stuffing).",
    "- Open with a scene/story in brand voice, not a sales pitch.",
    "- Use clear H2/H3 headings; include an FAQ section where useful.",
    "- End with a gentle, on-brand call to action.",
    "- Add [VERIFY: ...] / [INTERNAL LINK: ...] placeholders rather than inventing facts.",
    "- Include a WRITER NOTES section at the end (facts to verify, images, internal links).",
    "",
    "Return ONLY a JSON object with this exact shape:",
    '{"title": "<SEO title>", "meta": "<meta description ~155 chars>", "body": "<full article in Markdown>"}',
  ].filter(Boolean).join("\n");

  return { system, user };
}

// Generates a draft. Returns { title, meta, body }. Throws on API/parse failure.
export async function generateDraft({ clientName, keyword, voiceProfile, rankingPage, apiKey }) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const { system, user } = buildPrompt({ clientName, keyword, voiceProfile, rankingPage });

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
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";

  // Parse the JSON object the model returns; fall back to raw text as body.
  let parsed;
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
  } catch {
    parsed = { title: keyword, meta: "", body: content };
  }

  return {
    title: parsed.title || keyword,
    meta:  parsed.meta || "",
    body:  parsed.body || "",
  };
}
