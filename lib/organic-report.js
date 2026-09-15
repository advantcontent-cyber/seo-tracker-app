// Organic Visibility Report data layer — GSC via Windsor.ai "searchconsole".
// Powers the SEO ▸ Organic Visibility sub-tab. On-demand (per property/date
// range), same live server-side pattern as lib/gsc.js. Returns the two
// things gscData doesn't already carry: a daily web-search series and a
// search-type breakdown, plus a web-search summary derived from the daily
// rows.

import { PROPERTY_MAP } from "./gsc";
import { prevWindow, todayStr } from "./date-range";

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

// % change cur vs prev, rounded. Null (⇒ hide the indicator) when there's no
// prior-period baseline to compare against.
const pctDelta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

// Aggregates a raw GSC daily-rows feed into a web-search summary (same shape
// `fetchOrganicReport` returns for the current period).
function summarize(rows) {
  let totImpr = 0, totClk = 0, posW = 0;
  for (const r of rows) {
    const impr = r.impressions ?? 0;
    totImpr += impr;
    totClk  += r.clicks ?? 0;
    posW    += (r.position ?? 0) * impr;
  }
  return {
    impressions: Math.round(totImpr),
    clicks:      Math.round(totClk),
    ctr:         totImpr ? totClk / totImpr : 0,
    avgPos:      totImpr ? posW / totImpr : 0,
  };
}

// Returns { summary, deltas, daily, byType, from, to, days }.
//   summary = { impressions, clicks, ctr, avgPos }  (web search)
//   deltas  = { impressions, clicks, ctr, avgPos }  (% change vs the compare
//             range — defaults to the immediately preceding period of equal
//             length when compareFrom/compareTo are omitted; avgPos as point
//             change)
//   daily   = [{ date, clicks, impressions }]        (web search, ascending)
//   byType  = { web:{impressions,clicks}, image:{...}, video:{...}, news:{...} }
// Throws if the key is missing / property unknown / upstream fails.
export async function fetchOrganicReport(clientName, from, to, compareFrom, compareTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const site = SITE_BY_CLIENT[clientName];
  if (!site) throw new Error(`Unknown property: ${clientName}`);

  // Cap "to" at today — a range running into the future confuses Windsor's
  // connectors (same fix as lib/gsc.js/lib/sem.js).
  const today = todayStr();
  if (to > today) to = today;
  if (!compareFrom || !compareTo) ({ from: compareFrom, to: compareTo } = prevWindow(from, to));
  const pFrom = compareFrom, pTo = compareTo;

  // Two calls for the current period: daily web series (no search_type ⇒ GSC
  // defaults to web) and the search-type split. Each carries account_name and
  // is filtered to THIS site in JS — the `accounts` URL param is not reliable
  // on the raw connector endpoint (lib/gsc.js / lib/sem.js filter the same
  // way). For searchconsole, account_name is the site URL. Plus a lightweight
  // previous-month pull (summary only) to power the trend indicators.
  const only = (rows) => rows.filter((r) => r.account_name === site);
  const [dailyRows, typeRows, prevRows] = await Promise.all([
    windsorGet(["account_name", "date", "clicks", "impressions", "position"], from, to, site).then(only),
    windsorGet(["account_name", "search_type", "impressions", "clicks"], from, to, site).then(only),
    windsorGet(["account_name", "date", "clicks", "impressions", "position"], pFrom, pTo, site).then(only),
  ]);

  // Daily series + web-search summary (impression-weighted average position).
  const byDay = {};
  for (const r of dailyRows) {
    const d = String(r.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    byDay[d] ??= { date: d, clicks: 0, impressions: 0 };
    byDay[d].clicks      += r.clicks ?? 0;
    byDay[d].impressions += r.impressions ?? 0;
  }
  const daily = Object.values(byDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, clicks: Math.round(d.clicks), impressions: Math.round(d.impressions) }));

  const summary = summarize(dailyRows);
  const prevSummary = summarize(prevRows);
  const deltas = {
    impressions: pctDelta(summary.impressions, prevSummary.impressions),
    clicks:      pctDelta(summary.clicks, prevSummary.clicks),
    ctr:         prevSummary.impressions ? Math.round((summary.ctr - prevSummary.ctr) * 1000) / 10 : null, // points
    avgPos:      prevSummary.impressions ? Math.round((summary.avgPos - prevSummary.avgPos) * 10) / 10 : null, // points, lower is better
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
  return { summary, deltas, daily, byType, from, to, days };
}
