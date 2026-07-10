// Organic Conversions Report data layer — GA4 via Windsor.ai "googleanalytics4".
// Powers the SEO ▸ Organic Conversions sub-tab. On-demand per property/month.
// Conversions / revenue / transactions focus, with device + session revenue
// splits, daily series, and page / traffic / geo / engagement breakdowns.
// Filters every pull by account_name in JS (the `accounts` URL param is not
// reliable on the raw connector endpoint — see lib/gsc.js / lib/traffic-report.js).

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
  // Cap "to" at today for the current, still-in-progress month — requesting a
  // range that runs into the future confuses Windsor's GA4 connector.
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return [`${year}-${mm}-01`, to > today ? today : to];
}

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
const cleanDevice = (s) => { const t = String(s || "").split("/").pop().trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Other"; };

// Aggregate rows into a labelled breakdown [{ label, conversions, transactions, revenue }],
// sorted by conversions desc, top N.
function breakdown(rows, labelField, n = 8) {
  const agg = {};
  for (const r of rows) {
    const label = r[labelField] || "(not set)";
    agg[label] ??= { label, conversions: 0, transactions: 0, revenue: 0 };
    agg[label].conversions += r.conversions ?? 0;
    agg[label].transactions += r.transactions ?? 0;
    agg[label].revenue += r.totalrevenue ?? 0;
  }
  return Object.values(agg)
    .map((x) => ({ ...x, conversions: Math.round(x.conversions), transactions: Math.round(x.transactions), revenue: round2(x.revenue) }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, n);
}

export async function fetchConversionsReport(clientName, year, month) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const account = GA4_ACCOUNT[clientName];
  const acctName = GA4_ACCOUNT_NAME[clientName];
  if (!account) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  const only = (rows) => rows.filter((r) => r.account_name === acctName);
  const [sumRows, dailyRows, devRows, sessRows, pageRows, trafficRows, geoRows, engRows] = await Promise.all([
    windsorGet(["account_name", "conversions", "transactions", "totalrevenue", "event_count", "ecommerce_purchases", "purchase_revenue"], from, to, account).then(only),
    windsorGet(["account_name", "date", "conversions", "totalrevenue", "transactions"], from, to, account).then(only),
    windsorGet(["account_name", "platform_device_category", "totalrevenue"], from, to, account).then(only),
    windsorGet(["account_name", "session_source_medium", "totalrevenue"], from, to, account).then(only),
    windsorGet(["account_name", "page_path", "conversions", "transactions", "totalrevenue"], from, to, account).then(only),
    windsorGet(["account_name", "session_source_medium", "conversions", "transactions", "totalrevenue"], from, to, account).then(only),
    windsorGet(["account_name", "country", "conversions", "transactions", "totalrevenue"], from, to, account).then(only),
    windsorGet(["account_name", "event_name", "conversions", "transactions", "totalrevenue"], from, to, account).then(only),
  ]);

  const s0 = sumRows[0] || {};
  const summary = {
    conversions:       Math.round(s0.conversions ?? 0),
    transactions:      Math.round(s0.transactions ?? 0),
    revenue:           round2(s0.totalrevenue),
    eventCount:        Math.round(s0.event_count ?? 0),
    ecommercePurchases: Math.round(s0.ecommerce_purchases ?? 0),
    purchaseRevenue:   round2(s0.purchase_revenue),
  };

  const byDay = {};
  for (const r of dailyRows) {
    const d = String(r.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    byDay[d] ??= { date: d, conversions: 0, revenue: 0, transactions: 0 };
    byDay[d].conversions += r.conversions ?? 0;
    byDay[d].revenue += r.totalrevenue ?? 0;
    byDay[d].transactions += r.transactions ?? 0;
  }
  const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, conversions: Math.round(d.conversions), revenue: round2(d.revenue), transactions: Math.round(d.transactions) }));

  // Revenue-by device / session (pie slices).
  const devMap = {};
  for (const r of devRows) { const l = cleanDevice(r.platform_device_category); devMap[l] = (devMap[l] ?? 0) + (r.totalrevenue ?? 0); }
  const byDevice = Object.entries(devMap).map(([label, value]) => ({ label, value: round2(value) })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  const sessMap = {};
  for (const r of sessRows) { const l = r.session_source_medium || "(not set)"; sessMap[l] = (sessMap[l] ?? 0) + (r.totalrevenue ?? 0); }
  const bySession = Object.entries(sessMap).map(([label, value]) => ({ label, value: round2(value) })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 7);

  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return {
    summary,
    daily,
    byDevice,
    bySession,
    pages: breakdown(pageRows, "page_path"),
    traffic: breakdown(trafficRows, "session_source_medium"),
    geo: breakdown(geoRows, "country"),
    engagement: breakdown(engRows, "event_name"),
    from, to, days,
  };
}
