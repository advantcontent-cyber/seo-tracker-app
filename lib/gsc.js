// Shared GSC data layer — Windsor.ai "searchconsole" connector.
// Used by the /api/gsc route (dashboard) and the monthly draft cron, so both
// read identical, normalised monthly metrics + per-query detail per property.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "searchconsole";
const BASE        = "https://connectors.windsor.ai";

export const PROPERTY_MAP = {
  "https://shintamani.com/":                   "Shinta Mani Wild",
  "https://www.sorahotels.com/sorasukhumvit/": "Sora Sukhumvit",
  "https://www.nomadgreenland.com/":           "Nomad Greenland",
  "https://khaoyai.intercontinental.com/":     "IC Khao Yai",
};

export const YEAR   = 2026;
export const MONTHS = [3, 4, 5, 6, 7];

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

// Returns { data, months, year }. Throws if WINDSOR_API_KEY is missing or the
// upstream call fails — callers decide how to surface that.
export async function fetchGscData() {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");

  const dateFrom = `${YEAR}-03-01`;
  // Always cap at today — requesting a range that runs into the future
  // confuses Windsor's connector. (Used to cap at a hardcoded "${YEAR}-07-31"
  // instead; once today passed that date, it silently froze the range there
  // rather than advancing. See lib/sem.js for the same fix.)
  const t = new Date();
  const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

  // Four Windsor calls: site-level monthly roll-up, per-query detail, the
  // query→page breakdown so each query links to the page GSC actually ranks,
  // and a plain per-page roll-up (clicks+impressions per URL) used for the
  // "top blog posts" table in Organic Visibility — plus each property's own
  // blog-post sitemap (see BLOG_SITEMAP_MAP above), fetched in parallel.
  const [siteRows, queryRows, pageRows, pageStatRows, blogUrlSets] = await Promise.all([
    windsorGet(["account_name", "year_month", "clicks", "impressions", "ctr", "position"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "query", "clicks", "impressions", "position"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "query", "page", "clicks"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "page", "clicks", "impressions"], dateFrom, dateTo),
    Promise.all(
      Object.keys(BLOG_SITEMAP_MAP).map(async (name) => [name, await fetchBlogPostUrlSet(name)])
    ).then((pairs) => Object.fromEntries(pairs)),
  ]);

  // Best ranking page per query/month (most clicks) — GSC's real landing URL.
  const pageMap = {};
  for (const row of pageRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.query || !row.page) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    pageMap[name]     ??= {};
    pageMap[name][mo] ??= {};
    const clicks = row.clicks ?? 0;
    const cur = pageMap[name][mo][row.query];
    if (!cur || clicks > cur.clicks) pageMap[name][mo][row.query] = { page: row.page, clicks };
  }

  const result = {};

  // Site-level
  for (const row of siteRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    if (!result[name]) result[name] = {};
    result[name][mo] = {
      clicks:      Math.round(row.clicks      ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      ctr:         row.ctr      ?? 0,
      avgPos:      row.position ?? 0,
      topQueries:    [],
      topPages:      [],
      topBlogPosts:  [],
    };
  }

  // Per-query — top 100 by impressions per property/month.
  const buckets = {};
  for (const row of queryRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.query) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    if (!buckets[name])     buckets[name] = {};
    if (!buckets[name][mo]) buckets[name][mo] = [];
    buckets[name][mo].push({
      q:           row.query,
      clicks:      row.clicks      ?? 0,
      impressions: row.impressions ?? 0,
      position:    row.position    ?? 0,
      page:        pageMap[name]?.[mo]?.[row.query]?.page ?? null,
    });
  }

  for (const [name, months] of Object.entries(buckets)) {
    for (const [mo, rows] of Object.entries(months)) {
      if (result[name]?.[mo]) {
        result[name][mo].topQueries = rows
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 100);
      }
    }
  }

  // Per-page — plain URL roll-up (not query-scoped). topPages holds every
  // page (unsliced, sorted by impressions) for general use; topBlogPosts is
  // the same rows filtered against that property's real blog-post sitemap
  // (BLOG_SITEMAP_MAP / blogUrlSets — see above) and capped at 10, for the
  // "Top Blog Posts" table in Organic Visibility.
  const pageBuckets = {};
  for (const row of pageStatRows) {
    const name = PROPERTY_MAP[row.account_name];
    if (!name || !row.page) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    if (!pageBuckets[name])     pageBuckets[name] = {};
    if (!pageBuckets[name][mo]) pageBuckets[name][mo] = [];
    pageBuckets[name][mo].push({
      page:        row.page,
      clicks:      Math.round(row.clicks      ?? 0),
      impressions: Math.round(row.impressions ?? 0),
    });
  }

  for (const [name, months] of Object.entries(pageBuckets)) {
    const blogUrls = blogUrlSets[name] ?? new Set();
    for (const [mo, rows] of Object.entries(months)) {
      if (!result[name]?.[mo]) continue;
      const sorted = rows.sort((a, b) => b.impressions - a.impressions);
      result[name][mo].topPages = sorted;
      result[name][mo].topBlogPosts = sorted
        .filter((r) => blogUrls.has(normaliseUrl(r.page)))
        .slice(0, 10);
    }
  }

  // Clicks sparkline series, one point per MONTHS entry
  for (const name of Object.keys(result)) {
    result[name].series = MONTHS.map((mo) => result[name][mo]?.clicks ?? 0);
  }

  return { data: result, months: MONTHS, year: YEAR };
}
