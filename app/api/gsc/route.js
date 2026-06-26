// GET /api/gsc
// Calls Windsor.ai's Connectors REST API (GET with query params, api_key in URL)
// and returns normalised monthly GSC metrics per connected property.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "searchconsole";
const BASE        = "https://connectors.windsor.ai";

const PROPERTY_MAP = {
  "https://shintamani.com/":                   "Shinta Mani Wild",
  "https://www.sorahotels.com/sorasukhumvit/": "Sora Sukhumvit",
  "https://www.nomadgreenland.com/":           "Nomad Greenland",
  "https://khaoyai.intercontinental.com/":     "IC Khao Yai",
};

const YEAR   = 2026;
const MONTHS = [3, 4, 5, 6];

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

export async function GET() {
  if (!WINDSOR_KEY) {
    return Response.json({ error: "WINDSOR_API_KEY not set" }, { status: 500 });
  }

  try {
    const dateFrom = `${YEAR}-03-01`;
    const dateTo   = `${YEAR}-06-30`;

    // Two calls: site-level monthly roll-up, then per-query detail
    const [siteRows, queryRows] = await Promise.all([
      windsorGet(
        ["account_name", "year_month", "clicks", "impressions", "ctr", "position"],
        dateFrom, dateTo
      ),
      windsorGet(
        ["account_name", "year_month", "query", "clicks", "impressions", "position"],
        dateFrom, dateTo
      ),
    ]);

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

    // Per-query — top 20 by clicks per property/month
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
      });
    }

    for (const [name, months] of Object.entries(buckets)) {
      for (const [mo, rows] of Object.entries(months)) {
        if (result[name]?.[mo]) {
          result[name][mo].topQueries = rows
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 20);
        }
      }
    }

    // 4-month clicks sparkline series
    for (const name of Object.keys(result)) {
      result[name].series = MONTHS.map(mo => result[name][mo]?.clicks ?? 0);
    }

    return Response.json({ ok: true, data: result, months: MONTHS, year: YEAR });
  } catch (err) {
    console.error("[/api/gsc]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
