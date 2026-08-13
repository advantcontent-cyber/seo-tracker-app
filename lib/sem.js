// SEM (paid search/social) data layer — Google Ads + Meta Ads via Windsor.ai.
// Live, server-side (uses WINDSOR_API_KEY), same pattern as lib/gsc.js.
// Returns combined paid metrics per client, with a per-platform breakdown,
// at daily granularity (so the UI can filter by individual day rather than
// only by month) — same "date" dimension pattern already used by
// lib/organic-report.js / lib/traffic-report.js / lib/conversions-report.js.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE        = "https://connectors.windsor.ai";
const EXCHANGE_KEY = process.env.EXCHANGE_RATE_API_KEY;
const EXCHANGE_BASE = "https://api.apilayer.com/exchangerates_data";

// Client → a lowercase substring that uniquely identifies its ad account_name
// across both Google Ads and Meta. Tolerant match (the raw feed may or may not
// append the account id, e.g. "… Resort (116467258769018)"), so we match by
// the stable base name rather than an exact string.
const ACCOUNT_MATCH = {
  "IC Khao Yai": "intercontinental khao yai",
  "Azerai Ke Ga Bay": "ke ga bay",
  "Azerai La Residence, Hue": "azerai",
  "Nomad Greenland": "nomad greenland",
  "Sora Sukhumvit": "sukhumvit", // matches both "Sora Hotel Sukhumvit" (Meta) and "Sora Resort & Suites Sukhumvit (in use)" (Google Ads)
  "Six Senses Fort Barwara": "fort barwara", // Meta only (account 943547439793786) — confirmed via live field discovery, Aug 2026
  // Matches both "Song Saa" and "Song Saa Ad Account (Main Account)" (two
  // real Meta accounts, both with active spend — confirmed live, Aug 2026).
  // A "Song Saa Private Island 2026" Google Ads account also exists with
  // real spend, and WILL get captured into daily.google via this same
  // needle (harmless — just unused data) — the client's report is
  // deliberately Meta-only (per the client, Aug 2026; the spec doc's single
  // "Overall" tab is Meta-flavored — Telegram Link Click/Whatsapp Messages
  // have no Google equivalent), so SongSaaOverallTab never reads it.
  "Song Saa Private Island": "song saa",
};

// Clients whose report displays spend in the ad account's own billing
// currency rather than converting to USD (per their reporting spec) — e.g.
// Sora's scorecard spec calls for native THB, not a USD figure. Every other
// client gets the default USD-via-FX-conversion behavior below.
const NATIVE_CURRENCY_CLIENTS = new Set(["Sora Sukhumvit", "Six Senses Fort Barwara"]); // Six Senses bills in INR

// Clients where Meta and Google bill in DIFFERENT native currencies, but the
// report needs one consistent currency — unlike NATIVE_CURRENCY_CLIENTS
// above (where every platform already shares one native currency and no
// conversion happens at all). Azerai's Meta accounts bill in VND; its
// Google Ads accounts bill in USD (confirmed live, Aug 2026) — so Google's
// leg gets converted to VND via the same live daily-rate mechanism used to
// convert non-USD accounts to USD elsewhere in this file (just aimed at a
// different target currency), while Meta's already-VND rows pass through
// unconverted. The client's own spec doc uses a fixed "×26000" multiplier
// for this instead of a live rate — per the client (Aug 2026), the live
// rate is preferred for accuracy even though it won't match that fixed
// figure exactly.
const MIXED_CURRENCY_TARGET = {
  "Azerai Ke Ga Bay": "VND",
  "Azerai La Residence, Hue": "VND",
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

export const YEAR = 2026;

// Six Senses Fort Barwara's Campaign Performance tab splits Ad Spend by
// market (India vs. International), attributed by ad-set name — confirmed
// live against Windsor's facebook connector (field is `adset_name`; `adset`/
// `adgroup`/`ad_set_name` all 400). Within the dashboard's actual query
// window (YEAR-03-01 → today) every SSFB ad set name contains either
// "india" or "international" and nothing else — the client spec's two
// hard-to-classify names (Interest_USUKGCC_22-54, Interest_US MASS_22-54)
// only appear in 2025 history outside this window. Kept as a safety net:
// per the client (Aug 2026), the tab is about the India/International spend
// split specifically, so anything that matches neither is folded into
// International rather than given its own bucket.
function classifySsfbMarket(adsetName) {
  const n = (adsetName || "").toLowerCase();
  if (n.includes("india")) return "india";
  return "international";
}

// IG Profile Followers/Visits (client spec) live on Windsor's separate
// `instagram` connector (native Instagram Insights data), NOT `facebook`
// (Meta Ads) — this is why the original field discovery under `facebook`'s
// `actions_*` fields found nothing; those two spec metrics were never on
// that connector at all. Confirmed live, Aug 2026:
//   - `profile_views` (IG Profile Visits): valid field, but always 0 with no
//     history — genuinely no data for this account, kept as "no data".
//   - `follower_count` (singular): daily NET NEW followers gained that day
//     (not a running total) — real, non-zero data, but Instagram's own API
//     only exposes the last 30 days (excluding today) for this metric, so
//     it's fetched over a separate, narrower window than everything else in
//     this file.
//   - `followers_count` (plural): the lifetime running total (100,170 as of
//     this check) — but Windsor only returns it as a single "today" snapshot
//     regardless of the date range requested, so it can't be summed/filtered
//     like a normal daily metric. Not used here — see follower_count above.
// account_name on this connector is the bare IG handle ("sixsensesfortbarwara"),
// not the ad-account display name ACCOUNT_MATCH matches against, so it needs
// its own tiny lookup rather than reusing clientForAccount.
const IG_ACCOUNT_MATCH = {
  "Six Senses Fort Barwara": "sixsensesfortbarwara",
};
function clientForIgAccount(accountName) {
  const s = (accountName || "").toLowerCase();
  for (const [client, needle] of Object.entries(IG_ACCOUNT_MATCH)) {
    if (s.includes(needle)) return client;
  }
  return null;
}

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
const dateOf = (row) => String(row.date).slice(0, 10);

// FX conversion for ad accounts that don't bill in USD (via APILayer's
// Exchange Rates Data API, since Windsor's exchange_rates datasource isn't
// connected on the client's Windsor plan). Returns { [date]: { CURRENCY: rate } },
// rate = units of that currency per 1 USD — one rate per day, matching the
// daily spend rows above (this used to be averaged up to a monthly rate when
// the rest of this file was month-level; now that everything here is
// day-level already, the API's native per-day rates are used as-is).
// Returns {} (not a throw) on any failure — callers fall back to flagging
// spend as pending rather than guessing.
async function fetchDailyRates(dateFrom, dateTo, currencies) {
  if (!EXCHANGE_KEY || currencies.length === 0) return {};
  try {
    const params = new URLSearchParams({
      start_date: dateFrom, end_date: dateTo,
      symbols: currencies.join(","), base: "USD",
    });
    const res = await fetch(`${EXCHANGE_BASE}/timeseries?${params}`, {
      headers: { apikey: EXCHANGE_KEY },
      next: { revalidate: 3600 },
    });
    if (!res.ok) { console.error(`[lib/sem] exchange rate fetch ${res.status}`); return {}; }
    const json = await res.json();
    if (!json.success || !json.rates) return {};
    return json.rates; // already { "YYYY-MM-DD": { CURRENCY: rate } }
  } catch (err) {
    console.error("[lib/sem] exchange rate fetch failed:", err.message);
    return {};
  }
}

// Ensures the nested shape for a client/day exists.
function slot(result, client, date) {
  result[client] ??= { daily: {}, campaigns: {}, adsets: {} };
  result[client].daily[date] ??= {
    spend: 0, clicks: 0, impressions: 0, conversions: 0, spendPending: false,
    currency: "USD", // display currency for `spend` — "USD" unless the client is in NATIVE_CURRENCY_CLIENTS
    // allConversions ("All conv.") is Google Ads' broader conversions metric —
    // distinct from `conversions` ("Conversions") above — used for the Google
    // side of Summary's combined Click Book. clickBook is the account's
    // "Offer Book Now Click" conversion action specifically, used by the
    // Google sub-tab's own Click Book KPI. Both confirmed against Windsor's
    // google_ads field reference for IC Khao Yai; other clients without a
    // same-named action will just read 0 until they have one. allConversionsValue
    // is Google Ads' "All conv. value" metric (Sora's Revenue/ROAS numerator —
    // confirmed distinct from the narrower "Conv. value" against Windsor's
    // field reference for Sora Sukhumvit).
    google: { spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, allConversionsValue: 0, clickBook: 0, spendPending: false },
    // reach is Meta-only (Google Ads doesn't expose it via this connector) —
    // used by the Meta sub-tab for Reach/Frequency (frequency = impressions/reach,
    // derived rather than summed, so it stays correct however many rows roll in).
    // clickBook is IC Khao Yai's Meta Pixel "Search" event (booking-intent
    // searches on the site) — confirmed against the client's Looker Studio
    // field ID (actions_offsite_conversion_fb_pixel_search). purchases/
    // purchaseValue and addToCart/addToCartValue are Sora's Meta Pixel
    // Purchase and AddToCart events (actions_offsite_conversion_fb_pixel_purchase
    // / actions_offsite_conversion_fb_pixel_add_to_cart, and their action_values_
    // counterparts for revenue) — confirmed against Windsor's field reference
    // for Sora Hotel Sukhumvit; other clients without these actions just read 0.
    // linkClicks/landingPageViews are Six Senses Fort Barwara's spec metrics
    // (inline_link_clicks / actions_landing_page_view — confirmed distinct from
    // raw `clicks` against Windsor's field reference for that account, Aug
    // 2026). newFollowers is that same spec's Profile Followers metric — see
    // clientForIgAccount above for why it's fetched separately from
    // everything else here. IG Profile Visits is ALSO in that spec but isn't
    // fetched — confirmed genuinely no data (see clientForIgAccount comment).
    meta:   { spend: 0, clicks: 0, impressions: 0, conversions: 0, reach: 0, clickBook: 0, purchases: 0, purchaseValue: 0, addToCart: 0, addToCartValue: 0, linkClicks: 0, landingPageViews: 0, newFollowers: 0, spendPending: false },
  };
  result[client].campaigns[date] ??= [];
  result[client].adsets[date] ??= [];
  return result[client];
}

export async function fetchSemData() {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const dateFrom = `${YEAR}-03-01`;
  // Always cap at today — requesting a range that runs into the future
  // confuses Windsor's connector. (This used to cap at a hardcoded
  // "${YEAR}-07-31" instead, written back when today hadn't reached that
  // date yet; once today passed it, that ceiling silently froze the whole
  // dashboard's available range at July 31 instead of advancing into
  // August. Today should always be the cap, full stop — never a fixed date.)
  const t = new Date();
  const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

  const [gDaily, gCamp, mDaily, mCamp, mAdset] = await Promise.all([
    windsorGet("google_ads", ["account_name", "date", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_value", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("google_ads", ["account_name", "date", "campaign", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_value", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "date", "clicks", "impressions", "spend", "reach", "actions_offsite_conversion_fb_pixel_search", "actions_offsite_conversion_fb_pixel_purchase", "action_values_offsite_conversion_fb_pixel_purchase", "actions_offsite_conversion_fb_pixel_add_to_cart", "action_values_offsite_conversion_fb_pixel_add_to_cart", "inline_link_clicks", "actions_landing_page_view", "currency"], dateFrom, dateTo),
    // actions_onsite_conversion_messaging_conversation_started_7d — only
    // meaningful for Song Saa's Whatsapp Messages KPI (SongSaaOverallTab,
    // filtered to its ClicktoWhatsapp-named campaigns) but fetched
    // generically like adset_name above, confirmed live, Aug 2026.
    windsorGet("facebook",   ["account_name", "date", "campaign", "clicks", "impressions", "spend", "reach", "actions_onsite_conversion_messaging_conversation_started_7d", "currency"], dateFrom, dateTo),
    // adset_name — only meaningful for Six Senses Fort Barwara's Campaign
    // Performance tab (see classifySsfbMarket above), but fetched generically
    // like the campaign-level pulls above rather than gated to one client.
    windsorGet("facebook",   ["account_name", "date", "adset_name", "spend", "currency"], dateFrom, dateTo),
  ]);

  // follower_count (see clientForIgAccount above) is restricted by
  // Instagram's own API to the last 30 days, excluding the current day —
  // fetched over its own narrower window rather than the full dateFrom..
  // dateTo range above (requesting outside that window 400s the whole
  // call). Wrapped defensively: a failure here should cost one card's data,
  // not the entire SEM fetch for every client.
  const igDateTo = new Date(t); igDateTo.setDate(igDateTo.getDate() - 1);
  const igDateFrom = new Date(igDateTo); igDateFrom.setDate(igDateFrom.getDate() - 29);
  const igFmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let igFollowers = [];
  try {
    igFollowers = await windsorGet("instagram", ["account_name", "date", "follower_count"], igFmt(igDateFrom), igFmt(igDateTo));
  } catch (err) {
    console.error("[lib/sem] instagram follower_count fetch failed:", err.message);
  }

  // Not every ad account here bills in USD — e.g. IC Khao Yai's Meta account
  // runs in THB, Azerai's in VND, Nomad Greenland's in EUR/DKK. Windsor's own
  // exchange_rates datasource isn't connected on the client's plan, so FX
  // conversion is done here via APILayer's Exchange Rates Data API instead —
  // whatever non-USD currencies actually show up in this pull (not a
  // hardcoded list). If the rate fetch fails entirely or a currency/day
  // isn't covered, spend from those rows falls back to excluded +
  // spendPending (UI shows "—" rather than a wrong dollar figure) — but
  // everything currency-agnostic (clicks, impressions, reach, conversions,
  // Click Book) is never excluded; those are correct regardless of billing
  // currency.
  const currenciesUsed = new Set();
  for (const rows of [gDaily, gCamp, mDaily, mCamp, mAdset]) {
    for (const row of rows) if (row.currency && row.currency !== "USD") currenciesUsed.add(row.currency);
  }
  const dailyRates = await fetchDailyRates(dateFrom, dateTo, [...currenciesUsed]);

  // Converts one row's raw monetary amount (spend, or any other $ figure —
  // reused for Google's conversion VALUE too, not just spend) to USD.
  // Returns { spend, pending } — pending is true only when conversion
  // couldn't happen (no rate for that currency/day), so the caller can flag
  // it rather than record a $0. Clients in NATIVE_CURRENCY_CLIENTS skip
  // conversion entirely — their report spec calls for the account's own
  // billing currency (e.g. Sora's THB), not USD. Clients in
  // MIXED_CURRENCY_TARGET (see above) convert to THAT target currency
  // instead of USD — dailyRates is keyed off USD as the base in both cases
  // (fetchDailyRates always queries symbols against base=USD), so a mixed-
  // currency conversion from non-target-currency X to target T works out to
  // rawAmount / rate[X] * rate[T] — X is USD for every case seen so far
  // (Azerai's Google Ads accounts), which simplifies to a straight multiply.
  const convertSpend = (rawSpend, currency, date, client) => {
    const mixedTarget = MIXED_CURRENCY_TARGET[client];
    if (mixedTarget) {
      if (!currency || currency === mixedTarget) return { spend: round2(rawSpend), pending: false };
      if (currency === "USD") {
        const rate = dailyRates[date]?.[mixedTarget];
        if (rate) return { spend: round2(rawSpend * rate), pending: false };
        return { spend: 0, pending: true };
      }
      // Only USD↔target is implemented (the only case Azerai's accounts
      // actually produce) — anything else falls back to pending rather than
      // silently guessing a cross rate.
      return { spend: 0, pending: true };
    }
    if (NATIVE_CURRENCY_CLIENTS.has(client) || !currency || currency === "USD") return { spend: round2(rawSpend), pending: false };
    const rate = dailyRates[date]?.[currency];
    if (rate) return { spend: round2(rawSpend / rate), pending: false };
    return { spend: 0, pending: true };
  };

  const result = {};

  const addDaily = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      const daily = slot(result, client, date).daily[date];
      const s = daily;
      const clicks = Math.round(row.clicks ?? 0), impr = Math.round(row.impressions ?? 0),
            conv = withConv ? Math.round(row.conversions ?? 0) : 0;
      const { spend, pending } = convertSpend(row.spend, row.currency, date, client);
      if (NATIVE_CURRENCY_CLIENTS.has(client) && row.currency) daily.currency = row.currency;
      if (pending) s[platform].spendPending = true;
      s[platform].spend += spend; s[platform].clicks += clicks; s[platform].impressions += impr; s[platform].conversions += conv;
      if (platform === "meta") {
        s[platform].reach += Math.round(row.reach ?? 0);
        s[platform].clickBook += Math.round(row.actions_offsite_conversion_fb_pixel_search ?? 0);
        s[platform].purchases += Math.round(row.actions_offsite_conversion_fb_pixel_purchase ?? 0);
        s[platform].purchaseValue += row.action_values_offsite_conversion_fb_pixel_purchase ?? 0;
        s[platform].addToCart += Math.round(row.actions_offsite_conversion_fb_pixel_add_to_cart ?? 0);
        s[platform].addToCartValue += row.action_values_offsite_conversion_fb_pixel_add_to_cart ?? 0;
        s[platform].linkClicks += Math.round(row.inline_link_clicks ?? 0);
        s[platform].landingPageViews += Math.round(row.actions_landing_page_view ?? 0);
      }
      if (platform === "google" && withConv) {
        s[platform].allConversions += Math.round(row.all_conversions ?? 0);
        s[platform].allConversionsValue += row.all_conversions_value ?? 0;
        s[platform].clickBook += Math.round(row.all_conversions_offer_book_now_click ?? 0);
      }
      s.spend = round2(s.spend + spend); s.clicks += clicks; s.impressions += impr; s.conversions += conv;
      if (pending) s.spendPending = true;
    }
  };
  const addCampaigns = (rows, platform, withConv) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name, row.campaign);
      if (!client || !row.campaign) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      const { spend, pending } = convertSpend(row.spend, row.currency, date, client);
      // all_conversions_value is a $ amount like spend — needs the same
      // currency conversion (e.g. Azerai's Google Ads USD → VND), reusing
      // convertSpend rather than treating it as a plain count like
      // all_conversions. Same row/date/client, so always the same
      // pending-ness as spend's own conversion.
      const allConvValue = platform === "google" && withConv ? convertSpend(row.all_conversions_value ?? 0, row.currency, date, client).spend : 0;
      slot(result, client, date).campaigns[date].push({
        name: row.campaign, platform,
        spend: pending ? null : spend, // null = pending FX conversion, not "$0"
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        conversions: withConv ? Math.round(row.conversions ?? 0) : 0,
        allConversions: platform === "google" && withConv ? Math.round(row.all_conversions ?? 0) : 0,
        allConversionsValue: pending ? null : allConvValue,
        clickBook: platform === "google" && withConv ? Math.round(row.all_conversions_offer_book_now_click ?? 0) : 0,
        // reach is Meta-only — Google Ads doesn't expose it via this connector
        // (same as the account-level figure in slot()'s meta shape).
        reach: platform === "meta" ? Math.round(row.reach ?? 0) : undefined,
        // messagingConversations — see the mCamp windsorGet call above for
        // what this backs (Song Saa's Whatsapp Messages).
        messagingConversations: platform === "meta" ? Math.round(row.actions_onsite_conversion_messaging_conversation_started_7d ?? 0) : undefined,
      });
    }
  };

  const addAdsets = (rows) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      const { spend, pending } = convertSpend(row.spend, row.currency, date, client);
      slot(result, client, date).adsets[date].push({
        name: row.adset_name,
        market: classifySsfbMarket(row.adset_name),
        spend: pending ? null : spend,
      });
    }
  };

  // See clientForIgAccount above — follower_count is daily net NEW
  // followers gained, from a different Windsor connector (`instagram`) with
  // its own account-name scheme and its own narrower fetch window.
  const addIgFollowers = (rows) => {
    for (const row of rows) {
      const client = clientForIgAccount(row.account_name);
      if (!client) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      slot(result, client, date).daily[date].meta.newFollowers += Math.round(row.follower_count ?? 0);
    }
  };

  addDaily(gDaily, "google", true);
  addDaily(mDaily, "meta", false);
  addCampaigns(gCamp, "google", true);
  addCampaigns(mCamp, "meta", false);
  addAdsets(mAdset);
  addIgFollowers(igFollowers);

  // The two Azerai properties have no reliable account-level Google Ads
  // daily figure (see clientForAccount) — `google` never gets a
  // contribution from addDaily above, so derive it here by summing their
  // campaign-level rows instead, then roll that into the daily totals
  // alongside the (separately, reliably) account-matched `meta` figures.
  for (const client of ["Azerai Ke Ga Bay", "Azerai La Residence, Hue"]) {
    if (!result[client]) continue;
    for (const date of Object.keys(result[client].daily)) {
      const daily = result[client].daily[date];
      const googleCampaigns = (result[client].campaigns[date] || []).filter((c) => c.platform === "google");
      const g = googleCampaigns.reduce((a, c) => ({
          spend: a.spend + (c.spend ?? 0), clicks: a.clicks + c.clicks,
          impressions: a.impressions + c.impressions, conversions: a.conversions + c.conversions,
          allConversions: a.allConversions + (c.allConversions ?? 0), clickBook: a.clickBook + (c.clickBook ?? 0),
          allConversionsValue: a.allConversionsValue + (c.allConversionsValue ?? 0),
        }), { spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, clickBook: 0, allConversionsValue: 0 });
      const googlePending = googleCampaigns.some((c) => c.spend == null);
      daily.google = { spend: round2(g.spend), clicks: g.clicks, impressions: g.impressions, conversions: g.conversions, allConversions: g.allConversions, allConversionsValue: round2(g.allConversionsValue), clickBook: g.clickBook, spendPending: googlePending };
      daily.spend = round2(daily.google.spend + daily.meta.spend);
      daily.spendPending = googlePending || daily.meta.spendPending;
      daily.clicks = daily.google.clicks + daily.meta.clicks;
      daily.impressions = daily.google.impressions + daily.meta.impressions;
      daily.conversions = daily.google.conversions + daily.meta.conversions;
    }
  }

  return { data: result, dateFrom, dateTo };
}
