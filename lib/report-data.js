// Geography-by-sessions data layer — GA4 via Windsor.ai "googleanalytics4".
// Powers the Generate Report feature's "Where guests are searching from"
// section. Same live server-side pattern as lib/conversions-report.js, but
// aggregates SESSIONS by country rather than conversions/revenue.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "googleanalytics4";
const BASE        = "https://connectors.windsor.ai";

const GA4_ACCOUNT = {
  "Shinta Mani Wild": "476347859",
  "Nomad Greenland":  "482173603",
  "Sora Sukhumvit":   "484664374",
  "IC Khao Yai":      "339641415",
};
const GA4_ACCOUNT_NAME = {
  "Shinta Mani Wild": "Shinta Mani",
  "Nomad Greenland":  "Nomad Greenland",
  "Sora Sukhumvit":   "Sora Resort & Suites Sukhumvit",
  "IC Khao Yai":      "khaoyai.intercontinental.com - GA4",
};

async function windsorGet(fields, dateFrom, dateTo, account) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
    accounts:  account,
  });
  const res = await fetch(`${BASE}/${CONNECTOR}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

function monthBounds(year, month) {
  const mm = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${mm}-${String(last).padStart(2, "0")}`;
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return [`${year}-${mm}-01`, to > today ? today : to];
}

// Top N countries by session count for a client/month. Returns
// [{ country, sessions }], sorted descending.
export async function fetchGeoSessions(clientName, year, month, n = 8) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const account = GA4_ACCOUNT[clientName];
  const acctName = GA4_ACCOUNT_NAME[clientName];
  if (!account) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  const rows = await windsorGet(["account_name", "country", "sessions"], from, to, account);
  const only = rows.filter((r) => r.account_name === acctName);

  const agg = {};
  for (const r of only) {
    const label = r.country || "(not set)";
    agg[label] = (agg[label] ?? 0) + (r.sessions ?? 0);
  }
  return Object.entries(agg)
    .map(([country, sessions]) => ({ country, sessions: Math.round(sessions) }))
    .filter((c) => c.sessions > 0 && c.country !== "(not set)")
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, n);
}
