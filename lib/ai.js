// AI-engine referral data layer — GA4 via Windsor.ai "googleanalytics4".
// Generative-engine referral traffic (ChatGPT, Gemini, Claude, Perplexity,
// Copilot) that lands on each property, plus Bing surfaced on its own line.
// Powers the SEO ▸ AI Search sub-tab. Same live, server-side pattern as
// lib/gsc.js (uses WINDSOR_API_KEY, 1h cache). On-demand per date range (+
// optional compare range for the one delta the tab shows) — see lib/gsc.js
// for why this moved off month-bucketing.
//
// SCOPE: this is *referral* traffic — a user clicking a citation link inside an
// AI answer, identified by the session source host. Google AI Overview
// impressions/clicks are NOT separable in GSC (Google folds them into normal
// Web search) and are deliberately out of scope here.

import { prevWindow, todayStr } from "./date-range";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "googleanalytics4";
const BASE        = "https://connectors.windsor.ai";

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

const isSearch = (key) => !!ENGINES.find((e) => e.key === key)?.search;

// Returns { data }. data[client] = {
//   engines: [{ key,label,sessions,conversions,series }],  // chat AI, current
//            period, ordered desc, non-empty; series = daily sessions across
//            [from,to] for the sparkline
//   search:  [{ key,label,sessions,conversions,series }],  // search surfaces (Bing), current period
//   totals:  { sessions, conversions },                    // chat AI, current period
//   compareTotals: { sessions, conversions } | null,        // chat AI, compare period — used only for the one %Δ the tab shows
//   bing:    { sessions, conversions, series } | null,      // combined search surfaces, current period
//   pages:   [{ page, sessions, conversions, engines:[{key,label,sessions}] }], // top AI landing pages, current period
//   trend:   [{ date, sessions }],                          // chat-engine daily sessions across [from,to], for the trend chart
// }
// Throws if WINDSOR_API_KEY missing or the upstream call fails — the route
// decides how to surface that.
export async function fetchAiData(from, to, compareFrom, compareTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");

  const accounts = Object.keys(ACCOUNTS);
  const today = todayStr();
  if (to > today) to = today;
  if (!compareFrom || !compareTo) ({ from: compareFrom, to: compareTo } = prevWindow(from, to));

  // The combined pull's bounding range — current and compare periods aren't
  // necessarily adjacent (a manually-picked compare range can be anywhere).
  const boundFrom = compareFrom < from ? compareFrom : from;
  const boundTo = compareTo > to ? compareTo : to;

  // Two calls: daily source-medium roll-up (bounding range, for engine
  // totals/series/compare), and landing-page × engine detail (current period
  // only — pages aren't compared).
  const [rows, pageRows] = await Promise.all([
    windsorGet(["account_name", "date", "session_source_medium", "sessions", "conversions"], boundFrom, boundTo, accounts),
    windsorGet(["account_name", "date", "session_source_medium", "landing_page", "sessions", "conversions"], from, to, accounts),
  ]);

  return buildAiData(rows, pageRows, from, to, compareFrom, compareTo);
}

// Pure transform: raw Windsor GA4 rows → the per-client shape the UI consumes.
// `rows` = daily source roll-up over the bounding range; `pageRows` = landing_page
// × source detail over [from,to] only. Split out from the fetch so it can be
// exercised without a live key.
export function buildAiData(rows, pageRows, from, to, compareFrom, compareTo) {
  // acc[client][engineKey] = { byDate: { "2026-08-01": {sessions,conversions}, .. } }
  const acc = {};
  for (const row of rows) {
    const client = CLIENT_BY_ACCOUNT[row.account_name];
    if (!client) continue;
    const key = classify(row.session_source_medium);
    if (!key) continue;
    const d = String(row.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    const s = Math.round(row.sessions ?? 0);
    const c = Math.round(row.conversions ?? 0);
    acc[client]      ??= {};
    acc[client][key] ??= { byDate: {} };
    const bd = acc[client][key].byDate;
    bd[d] ??= { sessions: 0, conversions: 0 };
    bd[d].sessions    += s;
    bd[d].conversions += c;
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

  // Sum a byDate map's sessions/conversions within [rFrom, rTo].
  const sumRange = (byDate, rFrom, rTo) => {
    let sessions = 0, conversions = 0;
    for (const [d, v] of Object.entries(byDate)) {
      if (d < rFrom || d > rTo) continue;
      sessions += v.sessions;
      conversions += v.conversions;
    }
    return { sessions, conversions };
  };
  // Daily series within [from, to], ascending — for the trend sparkline/chart.
  const dailySeries = (byDate, rFrom, rTo) => {
    const out = [];
    for (const [d, v] of Object.entries(byDate)) {
      if (d < rFrom || d > rTo) continue;
      out.push({ date: d, sessions: v.sessions });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };

  const data = {};
  for (const [client, byKey] of Object.entries(acc)) {
    const buildEngine = (def) => {
      const e = byKey[def.key];
      const cur = sumRange(e.byDate, from, to);
      return {
        key: def.key, label: def.label, search: !!def.search,
        sessions: cur.sessions, conversions: cur.conversions,
        series: dailySeries(e.byDate, from, to).map((d) => d.sessions),
      };
    };

    const all = ENGINES.filter((def) => byKey[def.key]).map(buildEngine).sort((a, b) => b.sessions - a.sessions);
    const engines = all.filter((e) => !e.search);
    const search  = all.filter((e) => e.search);

    const compareSessions = (list) => list.reduce((a, def) => {
      const e = byKey[def.key];
      return a + (e ? sumRange(e.byDate, compareFrom, compareTo).sessions : 0);
    }, 0);
    const compareConversions = (list) => list.reduce((a, def) => {
      const e = byKey[def.key];
      return a + (e ? sumRange(e.byDate, compareFrom, compareTo).conversions : 0);
    }, 0);
    const engineDefs = ENGINES.filter((def) => !def.search && byKey[def.key]);
    const searchDefs = ENGINES.filter((def) => def.search && byKey[def.key]);

    // Daily trend across [from,to] (union of every engine's dates) — one for
    // chat engines (the main trend chart), one for search surfaces (Bing row).
    const dailyTrend = (defs) => {
      const map = {};
      for (const def of defs) {
        for (const d of dailySeries(byKey[def.key].byDate, from, to)) {
          map[d.date] = (map[d.date] ?? 0) + d.sessions;
        }
      }
      return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([date, sessions]) => ({ date, sessions }));
    };
    const trend = dailyTrend(engineDefs);

    data[client] = {
      engines,
      search,
      totals: {
        sessions:    engines.reduce((a, e) => a + e.sessions, 0),
        conversions: engines.reduce((a, e) => a + e.conversions, 0),
      },
      compareTotals: {
        sessions:    compareSessions(engineDefs),
        conversions: compareConversions(engineDefs),
      },
      bing: search.length ? {
        sessions:    search.reduce((a, e) => a + e.sessions, 0),
        conversions: search.reduce((a, e) => a + e.conversions, 0),
        series:      dailyTrend(searchDefs).map((d) => d.sessions),
      } : null,
      pages: pagesFor(client),
      trend,
    };
  }

  return { data };
}
