// SEM (paid search/social) data layer — Google Ads + Meta Ads via Windsor.ai.
// Live, server-side (uses WINDSOR_API_KEY), same pattern as lib/gsc.js.
// Returns combined paid metrics per client, with a per-platform breakdown.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE        = "https://connectors.windsor.ai";

// Client → a lowercase substring that uniquely identifies its ad account_name
// across both Google Ads and Meta. Tolerant match (the raw feed may or may not
// append the account id, e.g. "… Resort (116467258769018)"), so we match by
// the stable base name rather than an exact string.
const ACCOUNT_MATCH = {
  "IC Khao Yai": "intercontinental khao yai",
  "Azerai Ke Ga Bay": "ke ga bay",
  "Azerai La Residence, Hue": "azerai",
};

// Azerai's Google Ads spend doesn't split cleanly by account: the account
// raw-named "Azerai Ke Ga Bay" carries campaigns for BOTH properties (legacy,
// pre-split setup), and the newer account raw-named "Azerai La Residence, Hue"
// only exists from Jul 2026 on. Both are consistently named by campaign
// though ("AZKGB / ..." / "AZLRH_..."), so route by campaign prefix instead —
// this applies regardless of which of the two accounts the row came from.
const CAMPAIGN_PREFIX_MATCH = {
  AZKGB: "Azerai Ke Ga Bay",
  AZLRH: "Azerai La Residence, Hue",
};
// Raw account_name values with no reliable account-level (no-campaign) figure
// for a single client — only their campaign-level rows can be attributed.
const SPLIT_ONLY_ACCOUNTS = ["azerai ke ga bay", "azerai la residence, hue"];

function clientForAccount(accountName, campaignName) {
  const s = (accountName || "").toLowerCase();
  if (campaignName) {
    const prefix = Object.keys(CAMPAIGN_PREFIX_MATCH).find((p) => campaignName.toUpperCase().startsWith(p));
    if (prefix) return CAMPAIGN_PREFIX_MATCH[prefix];
  }
  if (SPLIT_ONLY_ACCOUNTS.some((needle) => s.includes(needle))) return null;
  for (const [client, needle] of Object.entries(ACCOUNT_MATCH)) {
    if (s.includes(needle)) return client;
  }
  return null;
}

export const YEAR   = 2026;
export const MONTHS = [3, 4, 5, 6, 7];

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
  // Cap at today for the current, still-in-progress month — requesting a range
  // that runs into the future confuses Windsor's connector.
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const dateTo = `${YEAR}-07-31` > today ? today : `${YEAR}-07-31`;

  const [gMonthly, gCamp, mMonthly, mCamp] = await Promise.all([
    windsorGet("google_ads", ["account_name", "year_month", "clicks", "impressions", "spend", "conversions", "currency"], dateFrom, dateTo),
    windsorGet("google_ads", ["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "conversions", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "clicks", "impressions", "spend", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "currency"], dateFrom, dateTo),
  ]);

  // Azerai's Meta accounts (both properties) and the new La Residence Hue
  // Google Ads account report spend in VND, not USD — every other account in
  // this dashboard is USD, and there's no currency conversion wired up yet
  // (needs Windsor's exchange_rates datasource connected first, then a
  // live-rate conversion here). Rather than show wildly wrong dollar figures
  // in the meantime, non-USD rows for these two clients are dropped — their
  // spend/clicks/etc. from those rows just don't count yet.
  const AZERAI_CLIENTS = ["Azerai Ke Ga Bay", "Azerai La Residence, Hue"];
  const isUnconvertedNonUsd = (client, currency) =>
    AZERAI_CLIENTS.includes(client) && currency && currency !== "USD";

  const result = {};

  const addMonthly = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client || isUnconvertedNonUsd(client, row.currency)) continue;
      const mo = moOf(row);
      if (!MONTHS.includes(mo)) continue;
      const s = slot(result, client, mo).monthly[mo];
      const spend = round2(row.spend), clicks = Math.round(row.clicks ?? 0),
            impr = Math.round(row.impressions ?? 0), conv = withConv ? Math.round(row.conversions ?? 0) : 0;
      s[platform].spend += spend; s[platform].clicks += clicks; s[platform].impressions += impr; s[platform].conversions += conv;
      s.spend = round2(s.spend + spend); s.clicks += clicks; s.impressions += impr; s.conversions += conv;
    }
  };
  const addCampaigns = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name, row.campaign);
      if (!client || !row.campaign || isUnconvertedNonUsd(client, row.currency)) continue;
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

  addMonthly(gMonthly, "google", true);
  addMonthly(mMonthly, "meta", false);
  addCampaigns(gCamp, "google", true);
  addCampaigns(mCamp, "meta", false);

  // The two Azerai properties have no reliable account-level Google Ads
  // monthly figure (see clientForAccount) — `google` never gets a
  // contribution from addMonthly above, so derive it here by summing their
  // campaign-level rows instead, then roll that into the monthly totals
  // alongside the (separately, reliably) account-matched `meta` figures.
  for (const client of ["Azerai Ke Ga Bay", "Azerai La Residence, Hue"]) {
    if (!result[client]) continue;
    for (const mo of MONTHS) {
      const monthly = slot(result, client, mo).monthly[mo];
      const g = (result[client].campaigns[mo] || [])
        .filter((c) => c.platform === "google")
        .reduce((a, c) => ({
          spend: a.spend + c.spend, clicks: a.clicks + c.clicks,
          impressions: a.impressions + c.impressions, conversions: a.conversions + c.conversions,
        }), { spend: 0, clicks: 0, impressions: 0, conversions: 0 });
      monthly.google = { spend: round2(g.spend), clicks: g.clicks, impressions: g.impressions, conversions: g.conversions };
      monthly.spend = round2(monthly.google.spend + monthly.meta.spend);
      monthly.clicks = monthly.google.clicks + monthly.meta.clicks;
      monthly.impressions = monthly.google.impressions + monthly.meta.impressions;
      monthly.conversions = monthly.google.conversions + monthly.meta.conversions;
    }
  }

  for (const client of Object.keys(result)) {
    result[client].series = MONTHS.map((mo) => result[client].monthly[mo]?.spend ?? 0);
  }

  return { data: result, months: MONTHS, year: YEAR };
}
