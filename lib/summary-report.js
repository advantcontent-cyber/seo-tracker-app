// Report Summary data layer — headline metrics rolled up from GSC + GA4 for the
// SEO ▸ Summary sub-tab. Lightweight: 1 GSC pull + 4 GA4 pulls (vs re-running
// the three full reports). Filters every pull by account_name in JS, the
// reliable pattern (see lib/gsc.js / lib/traffic-report.js).

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
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`];
}

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
const cleanDevice = (s) => { const t = String(s || "").split("/").pop().trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Other"; };

export async function fetchSummaryReport(clientName, year, month) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const site = GSC_SITE[clientName];
  const account = GA4_ACCOUNT[clientName];
  const acctName = GA4_ACCOUNT_NAME[clientName];
  if (!site || !account) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  const onlyGsc = (rows) => rows.filter((r) => r.account_name === site);
  const onlyGa4 = (rows) => rows.filter((r) => r.account_name === acctName);

  const [gscRows, ga4Rows, pageRows, devRows, chanRows] = await Promise.all([
    windsorGet("searchconsole", ["account_name", "clicks", "impressions", "position"], from, to, site).then(onlyGsc),
    windsorGet("googleanalytics4", ["account_name", "sessions", "totalusers", "newusers", "conversions", "transactions", "totalrevenue", "ecommerce_purchases", "purchase_revenue"], from, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "page_path", "conversions", "totalrevenue", "engagement_rate"], from, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "platform_device_category", "totalrevenue"], from, to, account).then(onlyGa4),
    windsorGet("googleanalytics4", ["account_name", "session_default_channel_group", "sessions"], from, to, account).then(onlyGa4),
  ]);

  const g = gscRows[0] || {};
  const a = ga4Rows[0] || {};
  const visibility = { impressions: Math.round(g.impressions ?? 0), clicks: Math.round(g.clicks ?? 0), avgPos: round2(g.position) };
  const traffic = { sessions: Math.round(a.sessions ?? 0), totalUsers: Math.round(a.totalusers ?? 0), newUsers: Math.round(a.newusers ?? 0) };
  const conversions = {
    conversions: Math.round(a.conversions ?? 0),
    transactions: Math.round(a.transactions ?? 0),
    revenue: round2(a.totalrevenue),
    ecommercePurchases: Math.round(a.ecommerce_purchases ?? 0),
    purchaseRevenue: round2(a.purchase_revenue),
  };
  conversions.conversionRate = traffic.sessions ? conversions.conversions / traffic.sessions : 0; // ratio
  conversions.avgPurchaseRevenue = conversions.transactions ? round2(conversions.purchaseRevenue / conversions.transactions) : 0;

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
  return { visibility, traffic, conversions, topPages, topDevice, topChannel, from, to, days };
}
