// AI-engine referral data layer — GA4 via Windsor.ai "googleanalytics4".
// Generative-engine referral traffic (ChatGPT, Gemini, Claude, Perplexity,
// Copilot) that lands on each property, plus Bing surfaced on its own line.
// Powers the SEO ▸ AI Search sub-tab. Same live, server-side pattern as
// lib/gsc.js (uses WINDSOR_API_KEY, 1h cache).
//
// SCOPE: this is *referral* traffic — a user clicking a citation link inside an
// AI answer, identified by the session source host. Google AI Overview
// impressions/clicks are NOT separable in GSC (Google folds them into normal
// Web search) and are deliberately out of scope here.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "googleanalytics4";
const BASE        = "https://connectors.windsor.ai";

export const YEAR   = 2026;
export const MONTHS = [3, 4, 5, 6, 7];

// GA4 account id → client display name (matches the CLIENTS names in the app).
// Keyed by id (stable) to scope the pull; the feed's account_name is reconciled
// back to the client via CLIENT_BY_ACCOUNT below.
const ACCOUNTS = {
  "476347859": "Shinta Mani Wild",
  "482173603": "Nomad Greenland",
  "484664374": "Sora Sukhumvit",
  "339641415": "IC Khao Yai",
};

// GA4 account_name (as returned by Windsor) → client display name.
const CLIENT_BY_ACCOUNT = {
  "Shinta Mani":                        "Shinta Mani Wild",
  "Nomad Greenland":                    "Nomad Greenland",
  "Sora Resort & Suites Sukhumvit":     "Sora Sukhumvit",
  "khaoyai.intercontinental.com - GA4": "IC Khao Yai",
};

// Generative engines, matched on the source host inside session_source_medium.
// Order matters — first match wins, so copilot is tested before bing (Copilot's
// host is copilot.microsoft.com, not bing.com). Matching on the raw string
// tolerates the malformed referrers GA4 sometimes records (e.g.
// "chatgpt.comhttps://…", "chatgpt.com>,"). `search: true` marks engines that
// are really search surfaces (Bing) so the UI can list them apart from chat AI.
export const ENGINES = [
  { key: "chatgpt",    label: "ChatGPT",    match: (s) => s.includes("chatgpt") || s.includes("openai") },
  { key: "gemini",     label: "Gemini",     match: (s) => s.includes("gemini") },
  { key: "claude",     label: "Claude",     match: (s) => s.includes("claude.ai") },
  { key: "perplexity", label: "Perplexity", match: (s) => s.includes("perplexity") },
  { key: "copilot",    label: "Copilot",    match: (s) => s.includes("copilot") },
  { key: "bing",       label: "Bing",       match: (s) => s.includes("bing"), search: true },
];

function classify(sourceMedium) {
  const s = (sourceMedium || "").toLowerCase();
  for (const e of ENGINES) if (e.match(s)) return e.key;
  return null;
}

async function windsorGet(fields, dateFrom, dateTo, accounts) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
    accounts:  accounts.join(","),
  });
  const res = await fetch(`${BASE}/${CONNECTOR}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

// GA4 year_month is "YYYYMM" (e.g. "202606") — no separator, unlike GSC's "YYYY|MM".
const moOf = (ym) => parseInt(String(ym).slice(4), 10);

// Returns { data, months, year }. data[client] = {
//   engines: [{ key,label,sessions,conversions,series }],   // chat AI, ordered desc, non-empty
//   search:  [{ key,label,sessions,conversions,series }],   // search surfaces (Bing)
//   totals:  { sessions, conversions, series },             // chat AI only
//   bing:    { sessions, conversions, series } | null,      // combined search surfaces
//   pages:   [{ page, sessions, conversions, engines:[{key,label,sessions}] }], // top AI landing pages
//   months:  MONTHS,
// }
// series is indexed to MONTHS (Mar…Jul). Throws if WINDSOR_API_KEY missing or
// the upstream call fails — the route decides how to surface that.
export async function fetchAiData() {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");

  const accounts = Object.keys(ACCOUNTS);
  // Cap at today for the current, still-in-progress month — requesting a range
  // that runs into the future confuses Windsor's connector.
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const dateTo = `${YEAR}-07-31` > today ? today : `${YEAR}-07-31`;
  // Two calls: monthly trend/engine roll-up, and landing-page × engine detail
  // (no year_month — aggregated over the window) for the "Top pages" table.
  const [rows, pageRows] = await Promise.all([
    windsorGet(["account_name", "year_month", "session_source_medium", "sessions", "conversions"], `${YEAR}-03-01`, dateTo, accounts),
    windsorGet(["account_name", "session_source_medium", "landing_page", "sessions", "conversions"], `${YEAR}-03-01`, dateTo, accounts),
  ]);

  return buildAiData(rows, pageRows);
}

const isSearch = (key) => !!ENGINES.find((e) => e.key === key)?.search;

// Pure transform: raw Windsor GA4 rows → the per-client shape the UI consumes.
// `rows` = monthly source roll-up; `pageRows` = landing_page × source detail.
// Split out from the fetch so it can be exercised without a live key.
export function buildAiData(rows, pageRows = []) {
  // acc[client][engineKey] = { sessions, conversions, byMonth: { 3:.., 4:.. } }
  const acc = {};
  for (const row of rows) {
    const client = CLIENT_BY_ACCOUNT[row.account_name];
    if (!client) continue;
    const key = classify(row.session_source_medium);
    if (!key) continue;
    const mo = moOf(row.year_month);
    if (!MONTHS.includes(mo)) continue;
    const s = Math.round(row.sessions ?? 0);
    const c = Math.round(row.conversions ?? 0);
    acc[client]      ??= {};
    acc[client][key] ??= { sessions: 0, conversions: 0, byMonth: {} };
    const e = acc[client][key];
    e.sessions    += s;
    e.conversions += c;
    e.byMonth[mo]  = (e.byMonth[mo] ?? 0) + s;
  }

  // pacc[client][page] = { sessions, conversions, byEngine: { chatgpt: sessions } }
  // Chat engines only (Bing excluded, as with the totals); "(not set)" pages
  // dropped since they aren't an actionable landing URL.
  const pacc = {};
  for (const row of pageRows) {
    const client = CLIENT_BY_ACCOUNT[row.account_name];
    if (!client) continue;
    const key = classify(row.session_source_medium);
    if (!key || isSearch(key)) continue;
    const page = row.landing_page;
    if (!page || page === "(not set)") continue;
    const s = Math.round(row.sessions ?? 0);
    const c = Math.round(row.conversions ?? 0);
    pacc[client]       ??= {};
    pacc[client][page] ??= { sessions: 0, conversions: 0, byEngine: {} };
    const p = pacc[client][page];
    p.sessions    += s;
    p.conversions += c;
    p.byEngine[key] = (p.byEngine[key] ?? 0) + s;
  }

  // client → top landing pages, each with its per-engine session split.
  const pagesFor = (client) =>
    Object.entries(pacc[client] || {})
      .map(([page, p]) => ({
        page,
        sessions: p.sessions,
        conversions: p.conversions,
        engines: ENGINES
          .filter((e) => !e.search && p.byEngine[e.key])
          .map((e) => ({ key: e.key, label: e.label, sessions: p.byEngine[e.key] }))
          .sort((a, b) => b.sessions - a.sessions),
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 12);

  const sumSeries = (list) => MONTHS.map((_, i) => list.reduce((a, e) => a + e.series[i], 0));

  const data = {};
  for (const [client, byKey] of Object.entries(acc)) {
    const all = ENGINES
      .filter((def) => byKey[def.key])
      .map((def) => {
        const e = byKey[def.key];
        return {
          key: def.key, label: def.label, search: !!def.search,
          sessions: e.sessions, conversions: e.conversions,
          series: MONTHS.map((m) => e.byMonth[m] ?? 0),
        };
      })
      .sort((a, b) => b.sessions - a.sessions);

    const engines = all.filter((e) => !e.search);
    const search  = all.filter((e) => e.search);

    data[client] = {
      engines,
      search,
      totals: {
        sessions:    engines.reduce((a, e) => a + e.sessions, 0),
        conversions: engines.reduce((a, e) => a + e.conversions, 0),
        series:      sumSeries(engines),
      },
      bing: search.length ? {
        sessions:    search.reduce((a, e) => a + e.sessions, 0),
        conversions: search.reduce((a, e) => a + e.conversions, 0),
        series:      sumSeries(search),
      } : null,
      pages: pagesFor(client),
      months: MONTHS,
    };
  }

  return { data, months: MONTHS, year: YEAR };
}
