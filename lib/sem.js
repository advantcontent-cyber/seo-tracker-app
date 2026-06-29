// SEM (paid search/social) data layer — Google Ads + Meta Ads via Windsor.ai.
// Live, server-side (uses WINDSOR_API_KEY), same pattern as lib/gsc.js.
// Returns combined paid metrics per client, with a per-platform breakdown.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE        = "https://connectors.windsor.ai";

// Per-platform: client name → the account_name Windsor reports.
// (Meta reports the account id inside the name.)
const GOOGLE_ACCOUNT_NAME = {
  "IC Khao Yai": "InterContinental Khao Yai Resort",
};
const META_ACCOUNT_NAME = {
  "IC Khao Yai": "InterContinental Khao Yai Resort (116467258769018)",
};

export const YEAR   = 2026;
export const MONTHS = [3, 4, 5, 6];

async function windsorGet(connector, fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
  });
  const res = await fetch(`${BASE}/${connector}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

const round2 = (n) => Math.round((n ?? 0) * 100) / 100;
const moOf = (row) => parseInt(String(row.year_month).split("|")[1]);

// Ensures the nested shape for a client/month exists.
function slot(result, client, mo) {
  result[client] ??= { monthly: {}, campaigns: {} };
  result[client].monthly[mo] ??= {
    spend: 0, clicks: 0, impressions: 0, conversions: 0,
    google: { spend: 0, clicks: 0, impressions: 0, conversions: 0 },
    meta:   { spend: 0, clicks: 0, impressions: 0, conversions: 0 },
  };
  result[client].campaigns[mo] ??= [];
  return result[client];
}

export async function fetchSemData() {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const dateFrom = `${YEAR}-03-01`;
  const dateTo   = `${YEAR}-06-30`;

  const gToClient = Object.fromEntries(Object.entries(GOOGLE_ACCOUNT_NAME).map(([c, n]) => [n, c]));
  const mToClient = Object.fromEntries(Object.entries(META_ACCOUNT_NAME).map(([c, n]) => [n, c]));

  const [gMonthly, gCamp, mMonthly, mCamp] = await Promise.all([
    windsorGet("google_ads", ["account_name", "year_month", "clicks", "impressions", "spend", "conversions"], dateFrom, dateTo),
    windsorGet("google_ads", ["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "conversions"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "clicks", "impressions", "spend"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "campaign", "clicks", "impressions", "spend"], dateFrom, dateTo),
  ]);

  const result = {};

  const addMonthly = (rows, toClient, platform, withConv) => {
    for (const row of rows) {
      const client = toClient[row.account_name];
      if (!client) continue;
      const mo = moOf(row);
      if (!MONTHS.includes(mo)) continue;
      const s = slot(result, client, mo).monthly[mo];
      const spend = round2(row.spend), clicks = Math.round(row.clicks ?? 0),
            impr = Math.round(row.impressions ?? 0), conv = withConv ? Math.round(row.conversions ?? 0) : 0;
      s[platform].spend += spend; s[platform].clicks += clicks; s[platform].impressions += impr; s[platform].conversions += conv;
      s.spend = round2(s.spend + spend); s.clicks += clicks; s.impressions += impr; s.conversions += conv;
    }
  };
  const addCampaigns = (rows, toClient, platform, withConv) => {
    for (const row of rows) {
      const client = toClient[row.account_name];
      if (!client || !row.campaign) continue;
      const mo = moOf(row);
      if (!MONTHS.includes(mo)) continue;
      slot(result, client, mo).campaigns[mo].push({
        name: row.campaign, platform,
        spend: round2(row.spend), clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        conversions: withConv ? Math.round(row.conversions ?? 0) : 0,
      });
    }
  };

  addMonthly(gMonthly, gToClient, "google", true);
  addMonthly(mMonthly, mToClient, "meta", false);
  addCampaigns(gCamp, gToClient, "google", true);
  addCampaigns(mCamp, mToClient, "meta", false);

  for (const client of Object.keys(result)) {
    result[client].series = MONTHS.map((mo) => result[client].monthly[mo]?.spend ?? 0);
  }

  return { data: result, months: MONTHS, year: YEAR };
}
