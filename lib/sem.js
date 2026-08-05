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
  "Nomad Greenland": "nomad greenland",
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
    spend: 0, clicks: 0, impressions: 0, conversions: 0, spendPending: false,
    // allConversions ("All conv.") is Google Ads' broader conversions metric —
    // distinct from `conversions` ("Conversions") above — used for the Google
    // side of Summary's combined Click Book. clickBook is the account's
    // "Offer Book Now Click" conversion action specifically, used by the
    // Google sub-tab's own Click Book KPI. Both confirmed against Windsor's
    // google_ads field reference for IC Khao Yai; other clients without a
    // same-named action will just read 0 until they have one.
    google: { spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, clickBook: 0, spendPending: false },
    // reach is Meta-only (Google Ads doesn't expose it via this connector) —
    // used by the Meta sub-tab for Reach/Frequency (frequency = impressions/reach,
    // derived rather than summed, so it stays correct however many rows roll in).
    // clickBook is IC Khao Yai's Meta Pixel "Search" event (booking-intent
    // searches on the site) — confirmed against the client's Looker Studio
    // field ID (actions_offsite_conversion_fb_pixel_search). Feeds the Meta
    // tab's own Click Book KPI and the Meta side of Summary's combined one.
    meta:   { spend: 0, clicks: 0, impressions: 0, conversions: 0, reach: 0, clickBook: 0, spendPending: false },
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
    windsorGet("google_ads", ["account_name", "year_month", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("google_ads", ["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "clicks", "impressions", "spend", "reach", "actions_offsite_conversion_fb_pixel_search", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "currency"], dateFrom, dateTo),
  ]);

  // Not every ad account here bills in USD — e.g. IC Khao Yai's Meta account
  // runs in THB, Azerai's in VND, Nomad Greenland's in EUR/DKK. There's no FX
  // conversion wired up yet (needs Windsor's exchange_rates datasource
  // connected — pending on the client's end — then a live-rate conversion
  // here). Until then, spend from a non-USD row is excluded from the totals
  // (spendPending flags it, so the UI shows "—" rather than a wrong dollar
  // figure) — but everything currency-agnostic (clicks, impressions, reach,
  // conversions, Click Book) is NOT excluded; those are correct regardless of
  // billing currency, so there's no reason to hide them too. This is checked
  // per row/currency, not per client — it stays correct if a client's billing
  // currency changes or a new non-USD account shows up.
  const isNonUsd = (currency) => !!currency && currency !== "USD";

  const result = {};

  const addMonthly = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client) continue;
      const mo = moOf(row);
      if (!MONTHS.includes(mo)) continue;
      const s = slot(result, client, mo).monthly[mo];
      const nonUsd = isNonUsd(row.currency);
      const clicks = Math.round(row.clicks ?? 0), impr = Math.round(row.impressions ?? 0),
            conv = withConv ? Math.round(row.conversions ?? 0) : 0;
      const spend = nonUsd ? 0 : round2(row.spend);
      if (nonUsd) s[platform].spendPending = true;
      s[platform].spend += spend; s[platform].clicks += clicks; s[platform].impressions += impr; s[platform].conversions += conv;
      if (platform === "meta") {
        s[platform].reach += Math.round(row.reach ?? 0);
        s[platform].clickBook += Math.round(row.actions_offsite_conversion_fb_pixel_search ?? 0);
      }
      if (platform === "google" && withConv) {
        s[platform].allConversions += Math.round(row.all_conversions ?? 0);
        s[platform].clickBook += Math.round(row.all_conversions_offer_book_now_click ?? 0);
      }
      s.spend = round2(s.spend + spend); s.clicks += clicks; s.impressions += impr; s.conversions += conv;
      if (nonUsd) s.spendPending = true;
    }
  };
  const addCampaigns = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name, row.campaign);
      if (!client || !row.campaign) continue;
      const mo = moOf(row);
      if (!MONTHS.includes(mo)) continue;
      const nonUsd = isNonUsd(row.currency);
      slot(result, client, mo).campaigns[mo].push({
        name: row.campaign, platform,
        spend: nonUsd ? null : round2(row.spend), // null = pending FX conversion, not "$0"
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        conversions: withConv ? Math.round(row.conversions ?? 0) : 0,
        allConversions: platform === "google" && withConv ? Math.round(row.all_conversions ?? 0) : 0,
        clickBook: platform === "google" && withConv ? Math.round(row.all_conversions_offer_book_now_click ?? 0) : 0,
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
          allConversions: a.allConversions + (c.allConversions ?? 0), clickBook: a.clickBook + (c.clickBook ?? 0),
        }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, clickBook: 0 });
      monthly.google = { spend: round2(g.spend), clicks: g.clicks, impressions: g.impressions, conversions: g.conversions, allConversions: g.allConversions, clickBook: g.clickBook };
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
