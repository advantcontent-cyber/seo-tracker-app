// Report Summary data layer — headline metrics rolled up from GSC + GA4 for the
// SEO ▸ Summary sub-tab. Lightweight: 5 pulls total (vs re-running the three
// full reports) — a combined current+previous-month pull per connector (date
// dimensioned, bucketed client-side) powers the headline metrics and their
// month-over-month deltas in one round trip each, plus 3 GA4 breakdown pulls
// for recommendations. Filters every pull by account_name in JS, the reliable
// pattern (see lib/gsc.js / lib/traffic-report.js).

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE        = "https://connectors.windsor.ai";

// GSC site (account_name == site URL) + GA4 account id / account_name per client.
const GSC_SITE = {
  "Shinta Mani Wild": "https://shintamani.com/",
  "Sora Sukhumvit":   "https://www.sorahotels.com/sorasukhumvit/",
  "Nomad Greenland":  "https://www.nomadgreenland.com/",
  "IC Khao Yai":      "https://khaoyai.intercontinental.com/",
};
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

async function windsorGet(connector, fields, dateFrom, dateTo, account) {
  const params = new URLSearchParams({ api_key: WINDSOR_KEY, fields: fields.join(","), date_from: dateFrom, date_to: dateTo, accounts: account });
  const res = await fetch(`${BASE}/${connector}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 140)}`);
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

// The month immediately before (year, month), 1-based.
function prevMonth(year, month) {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

// % change cur vs prev, rounded. Null (⇒ hide the indicator) when there's no
// prior-period baseline to compare against.
const pctDelta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
const cleanDevice = (s) => { const t = String(s || "").split("/").pop().trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Other"; };

export async function fetchSummaryReport(clientName, year, month) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const site = GSC_SITE[clientName];
  const account = GA4_ACCOUNT[clientName];
  const acctName = GA4_ACCOUNT_NAME[clientName];
  if (!site || !account) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  const [pYear, pMonth] = prevMonth(year, month);
  const [pFrom] = monthBounds(pYear, pMonth);
  const onlyGsc = (rows) => rows.filter((r) => r.account_name === site);
  const onlyGa4 = (rows) => rows.filter((r) => r.account_name === acctName);
  const curPrefix = from.slice(0, 7), prevPrefix = pFrom.slice(0, 7); // "YYYY-MM"

  // Current + previous month in ONE date-dimensioned pull per connector (rather
  // than two separate single-month pulls) — halves the concurrent Windsor/GA4
  // calls fired at once, which matters since Google's Analytics Data API has
  // been flaky under bursts of concurrent runReport calls for the same
  // property. Bucketed by month client-side below.
  const [gscRangeRows, ga4RangeRows, pageRows, devRows, chanRows] = await Promise.all([
    windsorGet("searchconsole", ["account_name", "date", "clicks", "impressions", "position"], pFrom, to, site).then(onlyGsc),
    windsorGet("googleanalytics4", ["account_name", "date", "sessions", "totalusers", "newusers", "conversions", "transactions", "totalrevenue", "ecommerce_purchases", "purchase_revenue"], pFrom, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "page_path", "conversions", "totalrevenue", "engagement_rate"], from, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "platform_device_category", "totalrevenue"], from, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "session_default_channel_group", "sessions"], from, to, account).then(onlyGa4),
  ]);

  // Sums a GSC daily-rows feed for rows whose date falls in the given "YYYY-MM".
  function gscSum(rows, prefix) {
    let impr = 0, clk = 0, posW = 0;
    for (const r of rows) {
      if (!String(r.date).startsWith(prefix)) continue;
      const i = r.impressions ?? 0;
      impr += i; clk += r.clicks ?? 0; posW += (r.position ?? 0) * i;
    }
    return { impressions: Math.round(impr), clicks: Math.round(clk), avgPos: impr ? round2(posW / impr) : 0 };
  }
  // Sums a GA4 daily-rows feed for rows whose date falls in the given "YYYY-MM".
  function ga4Sum(rows, prefix) {
    const s = { sessions: 0, totalUsers: 0, newUsers: 0, conversions: 0, transactions: 0, revenue: 0, ecommercePurchases: 0, purchaseRevenue: 0 };
    for (const r of rows) {
      if (!String(r.date).startsWith(prefix)) continue;
      s.sessions += r.sessions ?? 0; s.totalUsers += r.totalusers ?? 0; s.newUsers += r.newusers ?? 0;
      s.conversions += r.conversions ?? 0; s.transactions += r.transactions ?? 0; s.revenue += r.totalrevenue ?? 0;
      s.ecommercePurchases += r.ecommerce_purchases ?? 0; s.purchaseRevenue += r.purchase_revenue ?? 0;
    }
    return {
      sessions: Math.round(s.sessions), totalUsers: Math.round(s.totalUsers), newUsers: Math.round(s.newUsers),
      conversions: Math.round(s.conversions), transactions: Math.round(s.transactions), revenue: round2(s.revenue),
      ecommercePurchases: Math.round(s.ecommercePurchases), purchaseRevenue: round2(s.purchaseRevenue),
    };
  }

  const visibility = gscSum(gscRangeRows, curPrefix);
  const a = ga4Sum(ga4RangeRows, curPrefix);
  const traffic = { sessions: a.sessions, totalUsers: a.totalUsers, newUsers: a.newUsers };
  const conversions = {
    conversions: a.conversions,
    transactions: a.transactions,
    revenue: a.revenue,
    ecommercePurchases: a.ecommercePurchases,
    purchaseRevenue: a.purchaseRevenue,
  };
  conversions.conversionRate = traffic.sessions ? conversions.conversions / traffic.sessions : 0; // ratio
  conversions.avgPurchaseRevenue = conversions.transactions ? round2(conversions.purchaseRevenue / conversions.transactions) : 0;

  // Previous-month equivalents, from the same combined pull — enough to derive deltas.
  const prevVisibility = gscSum(gscRangeRows, prevPrefix);
  const prevTraffic = ga4Sum(ga4RangeRows, prevPrefix);
  const prevConversionsRaw = { conversions: prevTraffic.conversions, revenue: prevTraffic.revenue };
  const prevConversionRate = prevTraffic.sessions ? prevConversionsRaw.conversions / prevTraffic.sessions : 0;

  const deltas = {
    visibility: {
      impressions: pctDelta(visibility.impressions, prevVisibility.impressions),
      clicks:      pctDelta(visibility.clicks, prevVisibility.clicks),
      avgPos:      prevVisibility.impressions ? round2(visibility.avgPos - prevVisibility.avgPos) : null, // points, lower is better
    },
    traffic: {
      sessions:   pctDelta(traffic.sessions, prevTraffic.sessions),
      totalUsers: pctDelta(traffic.totalUsers, prevTraffic.totalUsers),
      newUsers:   pctDelta(traffic.newUsers, prevTraffic.newUsers),
    },
    conversions: {
      conversions:    pctDelta(conversions.conversions, prevConversionsRaw.conversions),
      conversionRate: prevTraffic.sessions ? Math.round((conversions.conversionRate - prevConversionRate) * 1000) / 10 : null, // points
      revenue:        pctDelta(conversions.revenue, prevConversionsRaw.revenue),
    },
  };

  // For recommendations.
  const pageAgg = {};
  for (const r of pageRows) {
    const p = r.page_path; if (!p) continue;
    const s = 1;
    pageAgg[p] ??= { page: p, conversions: 0, revenue: 0, engSum: 0, n: 0 };
    pageAgg[p].conversions += r.conversions ?? 0;
    pageAgg[p].revenue += r.totalrevenue ?? 0;
    let er = r.engagement_rate ?? 0; if (er > 1) er = er / 100;
    pageAgg[p].engSum += er; pageAgg[p].n += s;
  }
  const topPages = Object.values(pageAgg)
    .map((p) => ({ page: p.page, conversions: Math.round(p.conversions), revenue: round2(p.revenue), engagement: p.n ? p.engSum / p.n : 0 }))
    .sort((x, y) => y.revenue - x.revenue).slice(0, 2);

  const devMap = {};
  for (const r of devRows) { const l = cleanDevice(r.platform_device_category); devMap[l] = (devMap[l] ?? 0) + (r.totalrevenue ?? 0); }
  const topDevice = Object.entries(devMap).map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value)[0] || null;

  const chanMap = {};
  for (const r of chanRows) { const l = r.session_default_channel_group || "Unassigned"; chanMap[l] = (chanMap[l] ?? 0) + (r.sessions ?? 0); }
  const topChannel = Object.entries(chanMap).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value)[0] || null;

  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return { visibility, traffic, conversions, deltas, topPages, topDevice, topChannel, from, to, days };
}
