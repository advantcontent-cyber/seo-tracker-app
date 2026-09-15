// Shared GSC data layer — Windsor.ai "searchconsole" connector.
// Used by the /api/gsc route (dashboard) and the monthly draft cron, so both
// read identical, normalised metrics + per-query detail per property.
// On-demand per date range (+ optional compare range for KPI deltas) — see
// the Sep 2026 migration off month-bucketing (this file used to hardcode
// YEAR=2026/MONTHS=[3,4,5,6,7], which silently dropped Aug/Sep data once
// today passed July with no dynamic extension; real per-day Windsor queries
// don't have that failure mode).

import { prevWindow, todayStr, addDays } from "./date-range";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "searchconsole";
const BASE        = "https://connectors.windsor.ai";

export const PROPERTY_MAP = {
  "https://shintamani.com/":                   "Shinta Mani Wild",
  "https://www.sorahotels.com/sorasukhumvit/": "Sora Sukhumvit",
  "https://www.nomadgreenland.com/":           "Nomad Greenland",
  "https://khaoyai.intercontinental.com/":     "IC Khao Yai",
};

// Real blog-post URLs, per property, come from each site's own sitemap —
// NOT from a shared URL-path convention. Confirmed by direct inspection
// (Sep 2026): despite all 4 clients' blog-plan pubUrls assuming a `/blog/`
// path, only Nomad's site actually groups posts under one path segment
// (`/post/slug` — its `/blog/categories/*` URLs are just near-empty
// taxonomy pages, not posts). The other 3 (all WordPress/RankMath) publish
// posts at root level with no distinguishing path segment at all — e.g. IC
// Khao Yai's real "Stories" section lives at /stories/ but individual
// articles are plain root-level slugs indistinguishable from any other
// page by path shape alone. Each of these sites' `post-sitemap.xml` (or
// Wix's `blog-posts-sitemap.xml` for Nomad) is the actual authoritative,
// zero-maintenance list of real post URLs, so that's what gates the "Top
// Blog Posts" table instead of a guessed path filter.
const BLOG_SITEMAP_MAP = {
  "Shinta Mani Wild": "https://shintamani.com/post-sitemap.xml",
  "Sora Sukhumvit":   "https://www.sorahotels.com/sorasukhumvit/post-sitemap.xml",
  "Nomad Greenland":  "https://www.nomadgreenland.com/blog-posts-sitemap.xml",
  "IC Khao Yai":      "https://khaoyai.intercontinental.com/post-sitemap.xml",
};

// Normalise a URL for matching a GSC `page` value against a sitemap <loc> —
// strip protocol and trailing slash so http/https and trailing-slash
// differences between the two sources don't cause false negatives.
const normaliseUrl = (u) => (u ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

async function fetchBlogPostUrlSet(client) {
  const sitemapUrl = BLOG_SITEMAP_MAP[client];
  if (!sitemapUrl) return new Set();
  try {
    const res = await fetch(sitemapUrl, { next: { revalidate: 86400 } }); // 24h — posts don't change hourly
    if (!res.ok) return new Set();
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => normaliseUrl(m[1]));
    return new Set(urls);
  } catch {
    return new Set(); // a broken/unreachable sitemap should empty the table, not crash the report
  }
}

// The picker's outer clamp bound — a rolling 16-month window ending today,
// Windsor's (and GSC's) own hard limit. Pure date math, no Windsor call, so
// the frontend can get this on mount before any range is picked.
export function gscBounds() {
  const today = todayStr();
  const t = new Date();
  const sixteenMonthsAgo = new Date(t.getFullYear(), t.getMonth() - 16, t.getDate());
  const dateFrom = `${sixteenMonthsAgo.getFullYear()}-${String(sixteenMonthsAgo.getMonth() + 1).padStart(2, "0")}-${String(sixteenMonthsAgo.getDate()).padStart(2, "0")}`;
  return { dateFrom, dateTo: today };
}

async function windsorGet(fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key:    WINDSOR_KEY,
    fields:     fields.join(","),
    date_from:  dateFrom,
    date_to:    dateTo,
  });
  const url = `${BASE}/${CONNECTOR}?${params}`;
  const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1h
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Windsor ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  // Windsor returns { data: [...] } or just an array depending on version
  return Array.isArray(json) ? json : (json.data ?? []);
}

// Impression-weighted summary of a set of daily {clicks,impressions,position}
// rows already filtered to one period.
function summarize(rows) {
  let impr = 0, clk = 0, posW = 0;
  for (const r of rows) {
    const i = r.impressions ?? 0;
    impr += i; clk += r.clicks ?? 0; posW += (r.position ?? 0) * i;
  }
  return {
    clicks:      Math.round(clk),
    impressions: Math.round(impr),
    ctr:         impr ? clk / impr : 0,
    avgPos:      impr ? posW / impr : 0,
  };
}

// Returns { data }. data[client] = {
//   current: { clicks, impressions, ctr, avgPos },   // for [from, to]
//   compare: { clicks, impressions, ctr, avgPos },    // for [compareFrom, compareTo]
//   daily:   [{ date, clicks, impressions }],          // ascending, [from, to]
//   topQueries: [{ q/k, clicks, impressions, position, page }],  // top 100 by impressions, [from, to]
//   topBlogPostsAllTime: [{ page, clicks, impressions }],  // rolling 16-month window — NOT scoped to from/to, see below
//   blogPostsRange: { from, to },                       // the all-time window actually queried
// }
// Throws if WINDSOR_API_KEY is missing or the upstream call fails — callers
// decide how to surface that.
export async function fetchGscData(from, to, compareFrom, compareTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");

  const bounds = gscBounds();
  const today = bounds.dateTo;
  // Default range (no from/to given): last 30 days, clamped to the 16-month
  // bound — matches the date-range picker's own default on first load.
  if (!from || !to) {
    to = today;
    from = addDays(to, -29);
    if (from < bounds.dateFrom) from = bounds.dateFrom;
  }
  if (to > today) to = today;
  if (!compareFrom || !compareTo) ({ from: compareFrom, to: compareTo } = prevWindow(from, to));
  const boundFrom = compareFrom < from ? compareFrom : from;
  const boundTo = compareTo > to ? compareTo : to;

  // "All time" for the Top Blog Posts table is a rolling 16-month window —
  // Windsor (like GSC itself) rejects any date_from further back than that
  // (confirmed via a live 400: "date_from cannot be more than 16 months in
  // the past"), so this is the actual maximum, not an arbitrary choice. Real
  // data for all 4 properties happens to start Oct 2025 anyway (checked
  // directly). This table is deliberately NOT scoped to from/to — it always
  // shows all-time, per an explicit prior request — so it uses its own
  // independent range regardless of what the picker above is set to.
  const allTimeFrom = bounds.dateFrom;

  // Four Windsor calls: daily site-level rows (bounding range, for
  // current/compare summaries + the daily trend series), per-query totals
  // for [from,to] (no date dimension — Windsor aggregates the exact range
  // for us), the query→page breakdown so each query links to the page GSC
  // actually ranks, and an all-time (16-month) per-page roll-up for the Top
  // Blog Posts table — plus each property's own blog-post sitemap (see
  // BLOG_SITEMAP_MAP above), fetched in parallel.
  const [dailyRows, queryRows, pageRows, allTimePageRows, blogUrlSets] = await Promise.all([
    windsorGet(["account_name", "date", "clicks", "impressions", "position"], boundFrom, boundTo),
    windsorGet(["account_name", "query", "clicks", "impressions", "position"], from, to),
    windsorGet(["account_name", "query", "page", "clicks"], from, to),
    windsorGet(["account_name", "page", "clicks", "impressions"], allTimeFrom, today),
    Promise.all(
      Object.keys(BLOG_SITEMAP_MAP).map(async (name) => [name, await fetchBlogPostUrlSet(name)])
    ).then((pairs) => Object.fromEntries(pairs)),
  ]);

  // Best ranking page per query (most clicks) — GSC's real landing URL.
  const pageMap = {};
  for (const row of pageRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.query || !row.page) continue;
    pageMap[name] ??= {};
    const clicks = row.clicks ?? 0;
    const cur = pageMap[name][row.query];
    if (!cur || clicks > cur.clicks) pageMap[name][row.query] = { page: row.page, clicks };
  }

  const result = {};
  for (const name of Object.values(PROPERTY_MAP)) {
    result[name] = { current: summarize([]), compare: summarize([]), daily: [], topQueries: [], topBlogPostsAllTime: [], blogPostsRange: { from: allTimeFrom, to: today } };
  }

  // Site-level daily rows → per-client buckets, then current/compare summaries
  // + the ascending daily series for [from,to].
  const dailyBuckets = {};
  for (const row of dailyRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name) continue;
    const d = String(row.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    dailyBuckets[name] ??= [];
    dailyBuckets[name].push({ date: d, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, position: row.position ?? 0 });
  }
  for (const [name, rows] of Object.entries(dailyBuckets)) {
    if (!result[name]) continue;
    result[name].current = summarize(rows.filter((r) => r.date >= from && r.date <= to));
    result[name].compare = summarize(rows.filter((r) => r.date >= compareFrom && r.date <= compareTo));
    result[name].daily = rows
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, clicks: Math.round(r.clicks), impressions: Math.round(r.impressions) }));
  }

  // Per-query — top 100 by impressions, for [from,to] directly (Windsor
  // aggregates the range for us; no month-bucketing needed).
  const queryBuckets = {};
  for (const row of queryRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.query) continue;
    queryBuckets[name] ??= [];
    queryBuckets[name].push({
      q:           row.query,
      clicks:      row.clicks      ?? 0,
      impressions: row.impressions ?? 0,
      position:    row.position    ?? 0,
      page:        pageMap[name]?.[row.query]?.page ?? null,
    });
  }
  for (const [name, rows] of Object.entries(queryBuckets)) {
    if (!result[name]) continue;
    result[name].topQueries = rows.sort((a, b) => b.impressions - a.impressions).slice(0, 100);
  }

  // All-time (16-month) per-page roll-up, filtered against each property's
  // real blog-post sitemap and capped at 10 — the "Top Blog Posts" table in
  // Organic Visibility. Independent of from/to, per the note above.
  const allTimePageBuckets = {};
  for (const row of allTimePageRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.page) continue;
    allTimePageBuckets[name] ??= [];
    allTimePageBuckets[name].push({
      page:        row.page,
      clicks:      Math.round(row.clicks      ?? 0),
      impressions: Math.round(row.impressions ?? 0),
    });
  }
  for (const name of Object.keys(result)) {
    const blogUrls = blogUrlSets[name] ?? new Set();
    const rows = allTimePageBuckets[name] ?? [];
    result[name].topBlogPostsAllTime = rows
      .filter((r) => blogUrls.has(normaliseUrl(r.page)))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);
  }

  return { data: result, from, to, compareFrom, compareTo };
}
