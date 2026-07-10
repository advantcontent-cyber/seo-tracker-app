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
  const dateTo   = `${YEAR}-07-31`;

  // Three calls: site-level monthly roll-up, per-query detail, and the
  // query→page breakdown so each query links to the page GSC actually ranks.
  const [siteRows, queryRows, pageRows] = await Promise.all([
    windsorGet(["account_name", "year_month", "clicks", "impressions", "ctr", "position"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "query", "clicks", "impressions", "position"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "query", "page", "clicks"], dateFrom, dateTo),
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
      topQueries:  [],
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

  // Clicks sparkline series, one point per MONTHS entry
  for (const name of Object.keys(result)) {
    result[name].series = MONTHS.map((mo) => result[name][mo]?.clicks ?? 0);
  }

  return { data: result, months: MONTHS, year: YEAR };
}
