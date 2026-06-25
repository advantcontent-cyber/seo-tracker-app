// GET /api/gsc
// Fetches Google Search Console data from Windsor.ai and returns
// normalised monthly metrics + top queries per connected property.
// Runs server-side — Windsor API key never reaches the browser.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "searchconsole";

// Map GSC property URLs to dashboard client names.
// Only properties in this map get real data; others return null.
const PROPERTY_MAP = {
  "https://shintamani.com/":                   "Shinta Mani Wild",
  "https://www.sorahotels.com/sorasukhumvit/": "Sora Sukhumvit",
  "https://www.nomadgreenland.com/":           "Nomad Greenland",
  "https://khaoyai.intercontinental.com/":     "IC Khao Yai",
};

// Months the dashboard displays (Mar–Jun of current year).
// Adjust as the year rolls over.
const YEAR = 2026;
const MONTHS = [3, 4, 5, 6]; // March → June

async function fetchWindsor(fields, dateFrom, dateTo) {
  const res = await fetch("https://api.windsor.ai/v2/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WINDSOR_KEY}`,
    },
    body: JSON.stringify({
      connector: CONNECTOR,
      fields,
      date_from: dateFrom,
      date_to: dateTo,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Windsor ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function GET() {
  if (!WINDSOR_KEY) {
    return Response.json(
      { error: "WINDSOR_API_KEY not set" },
      { status: 500 }
    );
  }

  try {
    // Pull monthly site-level metrics (clicks, impressions, CTR, avg position)
    // and per-query detail in two calls to keep response size manageable.
    const dateFrom = `${YEAR}-03-01`;
    const dateTo   = `${YEAR}-06-30`;

    const [siteRows, queryRows] = await Promise.all([
      fetchWindsor(
        ["account_name", "year_month", "clicks", "impressions", "ctr", "position"],
        dateFrom, dateTo
      ),
      fetchWindsor(
        ["account_name", "year_month", "query", "clicks", "impressions", "position"],
        dateFrom, dateTo
      ),
    ]);

    // Aggregate into { clientName → { month → { metrics, topQueries } } }
    const result = {};

    // Site-level aggregation
    for (const row of siteRows) {
      const name = PROPERTY_MAP[row.account_name];
      if (!name) continue;
      const mo = parseInt(row.year_month.split("|")[1]);
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

    // Per-query aggregation — collect top 20 by clicks per property/month
    const queryBuckets = {}; // name → mo → [{q, clicks, impressions, pos}]
    for (const row of queryRows) {
      const name = PROPERTY_MAP[row.account_name];
      if (!name || !row.query) continue;
      const mo = parseInt(row.year_month.split("|")[1]);
      if (!MONTHS.includes(mo)) continue;

      if (!queryBuckets[name])     queryBuckets[name] = {};
      if (!queryBuckets[name][mo]) queryBuckets[name][mo] = [];
      queryBuckets[name][mo].push({
        q:           row.query,
        clicks:      row.clicks      ?? 0,
        impressions: row.impressions ?? 0,
        position:    row.position    ?? 0,
      });
    }

    // Sort and slice top 20 into result
    for (const [name, months] of Object.entries(queryBuckets)) {
      for (const [mo, rows] of Object.entries(months)) {
        if (result[name]?.[mo]) {
          result[name][mo].topQueries = rows
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 20);
        }
      }
    }

    // Build the 4-month traffic sparkline series per client
    for (const name of Object.keys(result)) {
      result[name].series = MONTHS.map(mo => result[name][mo]?.clicks ?? 0);
    }

    return Response.json({ ok: true, data: result, months: MONTHS, year: YEAR });
  } catch (err) {
    console.error("[/api/gsc]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
