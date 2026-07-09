// Organic Visibility Report data layer — GSC via Windsor.ai "searchconsole".
// Powers the SEO ▸ Organic Visibility sub-tab. On-demand (per property/month),
// same live server-side pattern as lib/gsc.js. Returns the two things gscData
// doesn't already carry: a daily web-search series and a search-type breakdown,
// plus a web-search summary derived from the daily rows.

import { PROPERTY_MAP } from "./gsc";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "searchconsole";
const BASE        = "https://connectors.windsor.ai";

// client display name → GSC site (invert lib/gsc.js's account_name → client map).
const SITE_BY_CLIENT = Object.fromEntries(
  Object.entries(PROPERTY_MAP).map(([site, client]) => [client, site])
);

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

// First/last day of a 1-based month, as YYYY-MM-DD.
function monthBounds(year, month) {
  const mm = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate(); // month is 1-based → day 0 of next = last of this
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`];
}

// Returns { summary, daily, byType, from, to, days }.
//   summary = { impressions, clicks, ctr, avgPos }  (web search)
//   daily   = [{ date, clicks, impressions }]        (web search, ascending)
//   byType  = { web:{impressions,clicks}, image:{...}, video:{...}, news:{...} }
// Throws if the key is missing / property unknown / upstream fails.
export async function fetchOrganicReport(clientName, year, month) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const site = SITE_BY_CLIENT[clientName];
  if (!site) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  // Two calls: daily web series (no search_type ⇒ GSC defaults to web) and the
  // search-type split. Each carries account_name and is filtered to THIS site in
  // JS — the `accounts` URL param is not reliable on the raw connector endpoint
  // (lib/gsc.js / lib/sem.js filter the same way). For searchconsole,
  // account_name is the site URL.
  const only = (rows) => rows.filter((r) => r.account_name === site);
  const [dailyRows, typeRows] = await Promise.all([
    windsorGet(["account_name", "date", "clicks", "impressions", "position"], from, to, site).then(only),
    windsorGet(["account_name", "search_type", "impressions", "clicks"], from, to, site).then(only),
  ]);

  // Daily series + web-search summary (impression-weighted average position).
  const byDay = {};
  let totImpr = 0, totClk = 0, posW = 0;
  for (const r of dailyRows) {
    const d = String(r.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    const impr = r.impressions ?? 0;
    const clk  = r.clicks ?? 0;
    byDay[d] ??= { date: d, clicks: 0, impressions: 0 };
    byDay[d].clicks      += clk;
    byDay[d].impressions += impr;
    totImpr += impr;
    totClk  += clk;
    posW    += (r.position ?? 0) * impr;
  }
  const daily = Object.values(byDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, clicks: Math.round(d.clicks), impressions: Math.round(d.impressions) }));

  const summary = {
    impressions: Math.round(totImpr),
    clicks:      Math.round(totClk),
    ctr:         totImpr ? totClk / totImpr : 0,
    avgPos:      totImpr ? posW / totImpr : 0,
  };

  // Search-type breakdown.
  const byType = { web: { impressions: 0, clicks: 0 }, image: { impressions: 0, clicks: 0 }, video: { impressions: 0, clicks: 0 }, news: { impressions: 0, clicks: 0 } };
  for (const r of typeRows) {
    const t = (r.search_type || "web").toLowerCase();
    (byType[t] ??= { impressions: 0, clicks: 0 });
    byType[t].impressions += Math.round(r.impressions ?? 0);
    byType[t].clicks      += Math.round(r.clicks ?? 0);
  }

  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return { summary, daily, byType, from, to, days };
}
