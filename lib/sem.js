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
  // real spend, captured into daily.google via this same needle. Originally
  // unused — the report was Meta-only per the client (Aug 2026: the spec
  // doc's single "Overall" tab is Meta-flavored, Telegram Link Click/
  // Whatsapp Messages have no Google equivalent) — but a later round of
  // client feedback (also Aug 2026) asked for Google Ads back in, so
  // SongSaaOverallTab now reads this too. See that function's comment.
  "Song Saa Private Island": "song saa",
  "Six Senses Shaharut": "shaharut", // Meta only (account 895266716003798) — confirmed via live field discovery, Aug 2026. Bills in USD (unlike SSFB's INR), so no NATIVE_CURRENCY_CLIENTS entry needed.
  "Le Cercle": "le cercle", // Meta only (account "Le Cercle Sportif", 290042627166117), native VND — confirmed via live field discovery, Aug 2026
};

// Clients whose report displays spend in the ad account's own billing
// currency rather than converting to USD (per their reporting spec) — e.g.
// Sora's scorecard spec calls for native THB, not a USD figure. Every other
// client gets the default USD-via-FX-conversion behavior below.
const NATIVE_CURRENCY_CLIENTS = new Set(["Sora Sukhumvit", "Six Senses Fort Barwara", "Le Cercle"]); // Six Senses bills in INR, Le Cercle in VND

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

// Google Ads' all_conversions/all_conversions_value (used generically
// elsewhere in this file, e.g. IC Khao Yai's Click Book) SUM EVERY
// conversion action configured on the account — confirmed live, Aug 2026,
// that this blanket bucket massively overcounts Purchase/Revenue for
// Sora's and Azerai's Google accounts specifically, which both sync
// several GA4/funnel actions (view_item_list, begin_checkout, hotline
// calls, etc.) alongside the real purchase action. A user caught this on
// Sora (formula literally said "SUM(All conversions)" but the client
// meant the one real "purchase" action, which was 1 in Aug 2026 — not the
// ~202 the blanket bucket produced). For clients listed here, Purchase/
// Add To Cart/Revenue are isolated to a SPECIFIC named conversion_action_
// name instead (see addGoogleConversionActions below) — exact match,
// lowercased, not a substring, since Azerai's account has a second action
// ("azerai - GA4 (web) purchase") that contains "purchase" as a substring
// but is a likely-duplicate GA4-imported tracking of the same underlying
// purchases as the native "Purchase" action — per the client (Aug 2026),
// only the native action is used, to avoid double-counting.
// IC Khao Yai/Nomad Greenland are NOT listed here — their Click Book is
// deliberately the broad multi-action bucket (a booking-intent metric, not
// a revenue one), so all_conversions/all_conversions_value stays correct
// and untouched for them.
const GOOGLE_CONVERSION_ACTION_MATCH = {
  "Sora Sukhumvit": {
    purchase: ["sora resort & suites sukhumvit (web) purchase"],
    addToCart: ["sora resort & suites sukhumvit (web) add_to_cart"],
  },
  "Azerai Ke Ga Bay": {
    purchase: ["purchase"],
    addToCart: ["clickaddroomcheckout"], // closest name match to "Website Adds to Cart" on this account — no literal "add_to_cart"-named action exists here
  },
  "Azerai La Residence, Hue": {
    purchase: ["purchase"],
    addToCart: ["clickaddroomcheckout"],
  },
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

// IG Profile Followers (client spec — NOT Profile Visits, see
// igProfileVisits in slot() above for that one) lives on Windsor's
// separate `instagram` connector (native Instagram Insights data), NOT
// `facebook` (Meta Ads). Confirmed live, Aug 2026:
//   - `follower_count` (singular): daily NET NEW followers gained that day
//     (not a running total) — real, non-zero data, but Instagram's own API
//     only exposes the last 30 days (excluding today) for this metric, so
//     it's fetched over a separate, narrower window than everything else in
//     this file.
//   - `followers_count` (plural): the lifetime running total (100,170 as of
//     this check) — but Windsor only returns it as a single "today" snapshot
//     regardless of the date range requested, so it can't be summed/filtered
//     like a normal daily metric. Not used here — see follower_count above.
//   - `profile_views` on THIS connector was the original (wrong) candidate
//     tried for Profile Visits — valid field, but always 0 with no history
//     on this connector specifically. The real data was on `facebook`'s
//     `instagram_profile_visits` all along (caught by the client, Aug 2026).
// account_name on this connector is the bare IG handle ("sixsensesfortbarwara"),
// not the ad-account display name ACCOUNT_MATCH matches against, so it needs
// its own tiny lookup rather than reusing clientForAccount.
const IG_ACCOUNT_MATCH = {
  "Six Senses Fort Barwara": "sixsensesfortbarwara",
  "Six Senses Shaharut": "sixsenses.shaharut", // confirmed live, Aug 2026 — same profile_views=0/follower_count-real split as SSFB
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
    // directRevenue/directPurchases — Sora's "Total Direct Revenue"/"Total
    // Direct Purchases" scorecards, confirmed against the client's own Looker
    // dashboard (Aug 2026): the SITE'S OWN GA4 ecommerce numbers (every
    // channel, not just ad-attributed), as opposed to the isolated Google/
    // Meta conversion-action Purchase/Revenue above — see addGa4Direct below.
    // A third data source alongside google/meta, so kept top-level rather
    // than nested under either platform.
    directRevenue: 0, directPurchases: 0,
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
    // purchase/purchaseValue/addToCart/addToCartValue are the isolated,
    // named-conversion-action figures for Sora/Azerai — see
    // GOOGLE_CONVERSION_ACTION_MATCH above. Distinct from allConversions/
    // allConversionsValue (the blanket bucket, still correct for IC Khao
    // Yai/Nomad Greenland's Click Book).
    google: { spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, allConversionsValue: 0, purchase: 0, purchaseValue: 0, addToCart: 0, addToCartValue: 0, clickBook: 0, spendPending: false },
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
    // igProfileVisits ("IG Profile Visits" in Sora/SSFB/SSSH/Le Cercle's
    // specs) — confirmed live, Aug 2026: the real field is
    // `instagram_profile_visits` on THIS connector (facebook/Meta Ads),
    // not `profile_views` on the separate `instagram` (organic) connector
    // tried during the original SSFB build — that connector genuinely has
    // no data for this metric, but the ads connector does, and had all
    // along. A raw visit COUNT (not a unique-user metric like reach), so
    // safe to sum daily.
    meta:   { spend: 0, clicks: 0, impressions: 0, conversions: 0, reach: 0, clickBook: 0, purchases: 0, purchaseValue: 0, addToCart: 0, addToCartValue: 0, linkClicks: 0, landingPageViews: 0, igProfileVisits: 0, newFollowers: 0, spendPending: false },
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

  const [gDaily, gCamp, mDaily, mCamp, mAdset, gConvActions, ga4Daily] = await Promise.all([
    windsorGet("google_ads", ["account_name", "date", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_value", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("google_ads", ["account_name", "date", "campaign", "clicks", "impressions", "spend", "conversions", "all_conversions", "all_conversions_value", "all_conversions_offer_book_now_click", "currency"], dateFrom, dateTo),
    windsorGet("facebook",   ["account_name", "date", "clicks", "impressions", "spend", "reach", "actions_offsite_conversion_fb_pixel_search", "actions_offsite_conversion_fb_pixel_purchase", "action_values_offsite_conversion_fb_pixel_purchase", "actions_offsite_conversion_fb_pixel_add_to_cart", "action_values_offsite_conversion_fb_pixel_add_to_cart", "inline_link_clicks", "actions_landing_page_view", "instagram_profile_visits", "currency"], dateFrom, dateTo),
    // actions_onsite_conversion_messaging_conversation_started_7d — only
    // meaningful for Song Saa's Whatsapp Messages KPI (SongSaaOverallTab,
    // filtered to its ClicktoWhatsapp-named campaigns) but fetched
    // generically like adset_name above, confirmed live, Aug 2026.
    windsorGet("facebook",   ["account_name", "date", "campaign", "clicks", "impressions", "spend", "reach", "actions_onsite_conversion_messaging_conversation_started_7d", "currency"], dateFrom, dateTo),
    // adset_name — only meaningful for Six Senses Fort Barwara's Campaign
    // Performance tab (see classifySsfbMarket above), but fetched generically
    // like the campaign-level pulls above rather than gated to one client.
    windsorGet("facebook",   ["account_name", "date", "adset_name", "spend", "currency"], dateFrom, dateTo),
    // conversion_action_name — the isolated Purchase/Add To Cart fix, see
    // GOOGLE_CONVERSION_ACTION_MATCH above. Account-level (no campaign
    // dimension needed — Sora/Azerai's Purchase/Revenue are account-wide
    // combined figures, same granularity as gDaily).
    windsorGet("google_ads", ["account_name", "date", "conversion_action_name", "all_conversions", "all_conversions_value", "currency"], dateFrom, dateTo),
    // Sora's "Total Direct Revenue"/"Total Direct Purchases" — the site's
    // own GA4 ecommerce numbers (see directRevenue/directPurchases comment
    // in slot() above). purchase_revenue/ecommerce_purchases confirmed
    // live, Aug 2026, against the client's Looker dashboard for Sora's GA4
    // property ("Sora Resort & Suites Sukhumvit") — exact match for the
    // reference range (10 purchases, ฿160,683.75 ≈ ฿160,684). No currency
    // field on this connector — GA4 always reports in the property's set
    // currency, which for Sora is already THB (matches NATIVE_CURRENCY_CLIENTS),
    // so no FX conversion is applied here.
    windsorGet("googleanalytics4", ["account_name", "date", "purchase_revenue", "ecommerce_purchases"], dateFrom, dateTo),
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
  for (const rows of [gDaily, gCamp, mDaily, mCamp, mAdset, gConvActions]) {
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
        // Number(...) here (not a bare += on the raw value) — confirmed live,
        // Aug 2026, that Windsor returns some accounts' numeric fields as
        // STRINGS (e.g. spend: "40.61" rather than 40.61, seen on Shaharut's
        // account specifically) rather than JSON numbers. `Math.round`/`*`
        // elsewhere in this file auto-coerce, but a bare `+=` between a
        // number and a string is JS string CONCATENATION, not addition —
        // "0" + "40.61" + "11.16" → "040.6111.16" → a garbage huge number
        // once finally rendered, not a crash, so it fails silently.
        s[platform].purchaseValue += Number(row.action_values_offsite_conversion_fb_pixel_purchase ?? 0);
        s[platform].addToCart += Math.round(row.actions_offsite_conversion_fb_pixel_add_to_cart ?? 0);
        s[platform].addToCartValue += Number(row.action_values_offsite_conversion_fb_pixel_add_to_cart ?? 0);
        s[platform].linkClicks += Math.round(row.inline_link_clicks ?? 0);
        s[platform].landingPageViews += Math.round(row.actions_landing_page_view ?? 0);
        s[platform].igProfileVisits += Math.round(row.instagram_profile_visits ?? 0);
      }
      if (platform === "google" && withConv) {
        s[platform].allConversions += Math.round(row.all_conversions ?? 0);
        s[platform].allConversionsValue += Number(row.all_conversions_value ?? 0); // see purchaseValue comment above
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

  // See GOOGLE_CONVERSION_ACTION_MATCH above — isolates a client's real
  // Purchase/Add To Cart conversion action from Google's blanket
  // all_conversions/all_conversions_value bucket. Exact (lowercased) name
  // match, not substring — see the comment on that map for why.
  const addGoogleConversionActions = (rows) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      const match = client && GOOGLE_CONVERSION_ACTION_MATCH[client];
      if (!match) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      const name = (row.conversion_action_name || "").toLowerCase();
      const { spend: value, pending } = convertSpend(row.all_conversions_value ?? 0, row.currency, date, client);
      const count = Math.round(row.all_conversions ?? 0);
      const g = slot(result, client, date).daily[date].google;
      if (match.purchase.includes(name)) {
        g.purchase += count;
        if (!pending) g.purchaseValue += value;
      } else if (match.addToCart.includes(name)) {
        g.addToCart += count;
        if (!pending) g.addToCartValue += value;
      }
    }
  };

  // See directRevenue/directPurchases comment in slot() above — the site's
  // own GA4 ecommerce numbers, matched to a client the same way every other
  // connector here is (clientForAccount against GA4's account_name, which
  // for Sora is "Sora Resort & Suites Sukhumvit" — matches the same
  // "sukhumvit" needle as its Google Ads/Meta accounts). Other clients'
  // GA4 accounts will match too where ACCOUNT_MATCH's needle happens to hit
  // — harmless, since only Sora's Summary tab reads these fields today.
  const addGa4Direct = (rows) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client) continue;
      const date = dateOf(row);
      if (date < dateFrom || date > dateTo) continue;
      const daily = slot(result, client, date).daily[date];
      daily.directRevenue += Number(row.purchase_revenue ?? 0);
      daily.directPurchases += Math.round(row.ecommerce_purchases ?? 0);
    }
  };

  addDaily(gDaily, "google", true);
  addDaily(mDaily, "meta", false);
  addCampaigns(gCamp, "google", true);
  addCampaigns(mCamp, "meta", false);
  addAdsets(mAdset);
  addIgFollowers(igFollowers);
  addGoogleConversionActions(gConvActions);
  addGa4Direct(ga4Daily);

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
      // Spread the existing daily.google first — addGoogleConversionActions
      // (above) already set purchase/purchaseValue/addToCart/addToCartValue
      // on it (Azerai IS in GOOGLE_CONVERSION_ACTION_MATCH), and overwriting
      // the whole object here without preserving them wiped those four
      // fields to undefined, which crashed AzeraiGoogleTab's render
      // (fmt(undefined) throws) — caught live, Aug 2026.
      daily.google = { ...daily.google, spend: round2(g.spend), clicks: g.clicks, impressions: g.impressions, conversions: g.conversions, allConversions: g.allConversions, allConversionsValue: round2(g.allConversionsValue), clickBook: g.clickBook, spendPending: googlePending };
      daily.spend = round2(daily.google.spend + daily.meta.spend);
      daily.spendPending = googlePending || daily.meta.spendPending;
      daily.clicks = daily.google.clicks + daily.meta.clicks;
      daily.impressions = daily.google.impressions + daily.meta.impressions;
      daily.conversions = daily.google.conversions + daily.meta.conversions;
    }
  }

  return { data: result, dateFrom, dateTo };
}

// True (deduplicated) Meta Reach for an EXACT date range — Reach is a
// unique-users metric, so the daily rows summed into `meta.reach` above
// (in slot()/addDaily) overcount anyone reached on more than one day
// within a range (confirmed live, Aug 2026: summing IC Khao Yai's daily
// reach over a 14-day window gave 37,126 vs. the true period reach of
// 26,965 — a 37.7% overcount — which by extension understates Frequency,
// impressions/reach, since the denominator is inflated).
//
// Querying Windsor WITHOUT a `date` dimension lets Meta's API deduplicate
// properly across the whole requested range, returning one row per
// account with the TRUE period reach — but that's only valid for the
// EXACT range requested, so unlike everything in fetchSemData above (one
// broad pull, cached and filtered client-side per arbitrary sub-range)
// this has to be fetched fresh whenever the date-range picker changes.
// Impressions/clicks/spend are safe to sum daily (confirmed matching
// totals with/without the date dimension) — only Reach needs this.
export async function fetchMetaReach(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const rows = await windsorGet("facebook", ["account_name", "reach"], dateFrom, dateTo);
  const result = {};
  for (const row of rows) {
    const client = clientForAccount(row.account_name);
    if (!client) continue;
    // += (not =) — some clients span more than one real Meta account (e.g.
    // Song Saa's two accounts), and Meta can't dedupe reach ACROSS separate
    // ad accounts either way, so summing those is unavoidable and correct.
    result[client] = (result[client] ?? 0) + Math.round(row.reach ?? 0);
  }
  return result;
}

// Meta Impressions + Website Purchases split by country — Sora's Meta tab
// spec. Unlike Reach above, Impressions/Purchases are plain counts (safe to
// sum daily), so this doesn't need the "exact range, no date dimension"
// treatment fetchMetaReach requires — it's still its own on-demand fetch
// (not part of fetchSemData's broad daily pull) purely because adding a
// `country` dimension there would multiply that pull's row count by every
// country Meta reports for every client, for a metric only one client's tab
// needs. `country` field confirmed against Windsor's live facebook field
// reference (COUNTRY type, "Location" report) — Aug 2026.
export async function fetchMetaCountryBreakdown(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const rows = await windsorGet("facebook", ["account_name", "country", "impressions", "actions_offsite_conversion_fb_pixel_purchase"], dateFrom, dateTo);
  const result = {};
  for (const row of rows) {
    const client = clientForAccount(row.account_name);
    if (!client || !row.country) continue;
    result[client] ??= {};
    result[client][row.country] ??= { impressions: 0, purchases: 0 };
    result[client][row.country].impressions += Math.round(row.impressions ?? 0);
    result[client][row.country].purchases += Math.round(row.actions_offsite_conversion_fb_pixel_purchase ?? 0);
  }
  return result;
}

// Google Ads reports country as `country_criterion_id` — a NUMERIC Geo
// Target Constant ID, not a name string like Meta's `country` field above.
// For country-level targets this ID is always "2" + the country's
// ISO 3166-1 numeric code (Google's own documented convention — e.g. 2764 =
// Thailand/764, 2840 = United States/840). Confirmed live against Sora's
// account, Aug 2026: every one of the 28 IDs returned decodes cleanly under
// this rule and matches the client's own reference report's country names
// exactly, so this map (keyed by the bare 3-digit ISO code) rather than a
// second guessed Windsor field. Codes outside this list fall back to a
// labeled placeholder in the UI instead of a wrong guess — see
// COUNTRY_ID_FALLBACK_PREFIX usage in components/SeoTracker.jsx.
export const ISO_NUMERIC_COUNTRY = {
  "004": "Afghanistan", "008": "Albania", "012": "Algeria", "032": "Argentina", "036": "Australia",
  "040": "Austria", "050": "Bangladesh", "056": "Belgium", "068": "Bolivia", "076": "Brazil",
  "100": "Bulgaria", "116": "Cambodia", "124": "Canada", "152": "Chile", "156": "China",
  "158": "Taiwan", "170": "Colombia", "191": "Croatia", "203": "Czechia", "208": "Denmark",
  "212": "Dominica", "214": "Dominican Republic", "218": "Ecuador", "222": "El Salvador", "231": "Ethiopia",
  "234": "Faroe Islands", "238": "Falkland Islands", "246": "Finland", "250": "France", "276": "Germany",
  "288": "Ghana", "300": "Greece", "344": "Hong Kong", "348": "Hungary", "352": "Iceland",
  "356": "India", "360": "Indonesia", "372": "Ireland", "376": "Israel", "380": "Italy",
  "392": "Japan", "398": "Kazakhstan", "400": "Jordan", "404": "Kenya", "410": "South Korea",
  "414": "Kuwait", "417": "Kyrgyzstan", "418": "Laos", "422": "Lebanon", "428": "Latvia",
  "440": "Lithuania", "442": "Luxembourg", "450": "Madagascar", "458": "Malaysia", "462": "Maldives",
  "470": "Malta", "484": "Mexico", "496": "Mongolia", "504": "Morocco", "524": "Nepal",
  "528": "Netherlands", "554": "New Zealand", "558": "Nicaragua", "566": "Nigeria", "578": "Norway",
  "586": "Pakistan", "591": "Panama", "598": "Papua New Guinea", "600": "Paraguay", "604": "Peru",
  "608": "Philippines", "616": "Poland", "620": "Portugal", "634": "Qatar", "642": "Romania",
  "643": "Russia", "682": "Saudi Arabia", "702": "Singapore", "703": "Slovakia", "705": "Slovenia",
  "710": "South Africa", "724": "Spain", "144": "Sri Lanka", "752": "Sweden", "756": "Switzerland",
  "760": "Syria", "764": "Thailand", "784": "United Arab Emirates", "792": "Turkey", "804": "Ukraine",
  "807": "North Macedonia", "818": "Egypt", "826": "United Kingdom", "834": "Tanzania", "840": "United States",
  "858": "Uruguay", "860": "Uzbekistan", "704": "Vietnam", "887": "Yemen",
};

// See ISO_NUMERIC_COUNTRY above — Google's country_criterion_id is always
// "2" + this table's 3-digit key for a country-level geo target.
function googleCountryName(criterionId) {
  const code = String(criterionId ?? "").replace(/^2/, "").padStart(3, "0");
  return ISO_NUMERIC_COUNTRY[code] ?? `Country ${criterionId}`;
}

// Google Ads Impressions by country — Sora's Google tab spec (see
// googleCountryName above for the criterion-id decoding). Its own on-demand
// fetch for the same reason fetchMetaCountryBreakdown is: adding a country
// dimension to fetchSemData's broad daily pull would multiply that pull's
// row count for every client, for a metric only one client's tab needs.
export async function fetchGoogleCountryBreakdown(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const rows = await windsorGet("google_ads", ["account_name", "country_criterion_id", "impressions"], dateFrom, dateTo);
  const result = {};
  for (const row of rows) {
    const client = clientForAccount(row.account_name);
    if (!client || row.country_criterion_id == null) continue;
    const name = googleCountryName(row.country_criterion_id);
    result[client] ??= {};
    result[client][name] ??= { impressions: 0 };
    result[client][name].impressions += Math.round(row.impressions ?? 0);
  }
  return result;
}

// Meta ad creatives (thumbnail + name + performance) — originally Sora's
// Meta tab spec, now shown on every client's Meta-flavored SEM tab that has
// Meta ad spend. `thumbnail_url` (confirmed live against Sora's account,
// Aug 2026 — real Facebook CDN URLs returned for all 8 active ads) is
// Windsor's per-ad creative thumbnail field. NOTE: these are Facebook's own
// SIGNED CDN URLs (expire after a window — the `oe=` param is the expiry
// timestamp), not permanent links — safe to render directly in an <img>
// since the dashboard re-fetches this on every date-range change and via
// the API route's force-dynamic + no caching, but a stale/reloaded page
// after the signature expires will 403 on the image specifically (not the
// whole route) — the UI should have an onError fallback rather than assume
// the URL is forever-valid. On-demand fetch (not part of fetchSemData's
// broad daily pull) for the same reason country breakdowns are: ad-level
// rows would multiply that pull's size for every client, not just the one
// being viewed.
export async function fetchMetaCreatives(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const rows = await windsorGet("facebook", ["account_name", "ad_name", "adset_name", "campaign", "thumbnail_url", "impressions", "inline_link_clicks"], dateFrom, dateTo);
  const result = {};
  for (const row of rows) {
    const client = clientForAccount(row.account_name, row.campaign);
    if (!client || !row.ad_name) continue;
    result[client] ??= {};
    // Same ad can recur across days (and occasionally across campaigns/ad
    // sets after a duplicate/relaunch) — key by ad_name, keep the most
    // recently-seen thumbnail/campaign/ad set (rows arrive in no guaranteed
    // order, but a stale thumbnail is a smaller problem than a missing one).
    const ad = result[client][row.ad_name] ??= { adName: row.ad_name, adSetName: row.adset_name, campaign: row.campaign, thumbnailUrl: row.thumbnail_url, impressions: 0, linkClicks: 0 };
    if (row.thumbnail_url) ad.thumbnailUrl = row.thumbnail_url;
    if (row.adset_name) ad.adSetName = row.adset_name;
    if (row.campaign) ad.campaign = row.campaign;
    ad.impressions += Math.round(row.impressions ?? 0);
    ad.linkClicks += Math.round(row.inline_link_clicks ?? 0);
  }
  const out = {};
  for (const [client, ads] of Object.entries(result)) out[client] = Object.values(ads);
  return out;
}

// Top Performing Keywords/Ads (AZLRH's Aug 2026 feedback item). Real
// keyword-level performance isn't queryable at all via Windsor — its
// ad_group_criterion report (which carries keyword text) rejects being
// combined with any metric field ("can only be read from the
// ad_group_criterion report and cannot be combined with fields outside
// it" — confirmed live via a temporary debug route, Aug 2026). The closest
// real substitute is Google Ads' search_term_view report instead — the
// actual queries that triggered an ad, which DOES carry clicks/impressions/
// cost_micros — a materially more useful "top performing" ranking anyway
// (real triggered queries, not just configured targeting).
//
// cost_micros' `currency` field came back "VND" on this report during
// discovery, contradicting the already-live-confirmed fact that Azerai's
// Google Ads accounts bill in USD (see MIXED_CURRENCY_TARGET above) — that
// per-row field looks unreliable specifically on this report, so it's
// ignored here in favor of the confirmed USD assumption, run through the
// same MIXED_CURRENCY_TARGET conversion used for this account's other
// Google figures rather than trusted at face value.
export async function fetchGoogleSearchTerms(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const rows = await windsorGet("google_ads", ["account_name", "date", "campaign", "search_term_view_search_term", "clicks", "impressions", "cost_micros"], dateFrom, dateTo);
  const dailyRates = await fetchDailyRates(dateFrom, dateTo, ["VND"]);

  const result = {};
  for (const row of rows) {
    const client = clientForAccount(row.account_name, row.campaign);
    const term = row.search_term_view_search_term;
    if (!client || !term) continue;
    const mixedTarget = MIXED_CURRENCY_TARGET[client];
    const rawCost = (row.cost_micros ?? 0) / 1_000_000; // always USD, see comment above
    let cost = rawCost;
    if (mixedTarget && mixedTarget !== "USD") {
      const rate = dailyRates[dateOf(row)]?.[mixedTarget];
      cost = rate ? rawCost * rate : 0; // pending FX — dropped from this term's total rather than guessed
    }
    result[client] ??= {};
    const t = result[client][term] ??= { term, clicks: 0, impressions: 0, cost: 0 };
    t.clicks += Math.round(row.clicks ?? 0);
    t.impressions += Math.round(row.impressions ?? 0);
    t.cost += cost;
  }
  const out = {};
  for (const [client, terms] of Object.entries(result)) {
    out[client] = Object.values(terms).map((t) => ({ ...t, cost: round2(t.cost) }));
  }
  return out;
}
