// Organic social-content data layer — Windsor.ai "facebook_organic" (Facebook
// Page posts) + "instagram" (Instagram Business posts) connectors. Powers
// each client's "Social" tab (SERVICES[client] includes "social" in
// components/SeoTracker.jsx — currently IC Khao Yai + both Azerai
// properties). Own file per the lib/leads.js
// convention (a genuinely different data domain from the ad connectors in
// lib/sem.js) — but confirmed live 2026-09-25 that, unlike lib/leads.js's
// single-client Zoho connection, both connectors here ARE pooled across
// every one of the agency's clients (Le Cercle, Nomad Greenland, Song Saa,
// Six Senses ×2, Azerai ×2, Shinta Mani, Sora, Cottar's, Union Øye, 62Nord,
// ANA InterContinental ×2, …), same as lib/sem.js's ad platforms — so
// filterAccount() below is load-bearing, not a formality.
//
// CONNECTOR/FIELD NAMES: confirmed against Windsor's own field reference
// (windsor.ai/data-field/facebook_organic/, windsor.ai/data-field/instagram/)
// on 2026-09-25, after the first live production request 400'd on the
// initially-guessed connector name "facebook_pages" ("We don't have this
// connector yet!") — the real slug is "facebook_organic". Two gotchas from
// that same reference worth keeping in mind if this needs touching again:
// (1) Facebook's identity field is `page_name`, NOT `account_name` like
// every other connector in this app (gsc.js/ai.js/leads.js) — Instagram's
// connector does use `account_name`, so the two are inconsistent with each
// other. (2) Facebook's `post_impressions`/`post_impressions_unique` are
// still active post-June-2026-deprecation, but Instagram's `media_impressions`
// is deprecated in favor of `media_views` — used below.
//
// fetchSocialReport() is the only function that talks to Windsor;
// buildSocialData() is a pure transform (same split as buildAiData in
// lib/ai.js) so it can be exercised/adjusted without a live key.

import { clientForAccount } from "./sem.js";

const WINDSOR_KEY  = process.env.WINDSOR_API_KEY;
const BASE         = "https://connectors.windsor.ai";
const CONNECTOR_FB = "facebook_organic";
const CONNECTOR_IG = "instagram";

// Facebook rows are matched on `page_name`, Instagram rows on `account_name`
// (see the connector-name comment above) — all confirmed live 2026-09-25
// against a real Windsor pull (see the full pooled-account list in the
// file-header comment). Add more pairs here (from that same pooled list)
// if another client's Social tab is built later.
export const ACCOUNT_MAP = {
  facebook: {
    "InterContinental Khao Yai Resort": "IC Khao Yai",
    "Azerai Ke Ga Bay":                 "Azerai Ke Ga Bay",
    "Azerai La Residence, Hue":         "Azerai La Residence, Hue",
    // Added 2026-10 (Social tab roll-out) — exact `page_name` values from the
    // pooled Windsor pull. "The Song Saa Foundation" is a separate page
    // (the charity), deliberately NOT mapped to the resort.
    "Song Saa Private Island":          "Song Saa Private Island",
    "SORA Resort & Suites Sukhumvit":   "Sora Sukhumvit",
    "Six Senses Fort Barwara":          "Six Senses Fort Barwara",
    "Six Senses Shaharut":              "Six Senses Shaharut",
    "Nomad Greenland":                  "Nomad Greenland",
    "Le Cercle Hue":                    "Le Cercle",
    "Cottar's Safaris, Maasai Mara":    "Cottar's Safaris",
    "InterContinental - ANA Manza Beach Resort": "IC Manza",
    "ANA InterContinental Ishigaki Resort":      "IC Ishigaki",
    "Dr Miriam A Clinic":               "Dr. Miriam A",
  },
  instagram: {
    "intercontinental_khaoyai": "IC Khao Yai",
    "azeraikegabay":            "Azerai Ke Ga Bay",
    "azerailaresidencehue":     "Azerai La Residence, Hue",
    "songsaaprivateisland":     "Song Saa Private Island",
    "sora.resortsuitessukhumvit": "Sora Sukhumvit",
    "sixsensesfortbarwara":     "Six Senses Fort Barwara",
    "sixsenses.shaharut":       "Six Senses Shaharut",
    "nomadgreenland":           "Nomad Greenland",
    "lecerclehue":              "Le Cercle",
    "cottars.safaris":          "Cottar's Safaris",
    "anaintercontinentalmanzabeach": "IC Manza",
    "ana_ic_ishigaki_resort":   "IC Ishigaki",
    "drmiriama":                "Dr. Miriam A",
  },
};

const FIELDS_FB_LEGACY = [
  "page_name", "post_id", "type", "post_message", "post_created_time",
  "permalink_url", "full_picture", "post_impressions_unique",
  "post_impressions", "post_reactions_like_total", "post_comments_total",
  "post_activity_by_action_type_share", "post_clicks",
];
// `post_impressions_organic` excludes paid delivery of a boosted post, so
// per-post Views stay organic-only. If Windsor rejects it the pull is retried
// without it (see fbPostsGet) and Views fall back to total impressions.
const FIELDS_FB = [...FIELDS_FB_LEGACY, "post_impressions_organic"];
// Page-level (not per-post) organic views — Meta Business Suite's "Views ›
// From organic" for the date range. It counts every organic view of the
// Page's content in the window, including posts published earlier, so it
// can't be rebuilt by summing post_impressions over the week's new posts
// (that undercounted ICKY's 5–11 Oct 2026 week: 5,431 vs Meta's 9,464).
const FIELDS_FB_PAGE = ["date", "page_name", "page_impressions_organic"];
// Instagram's account-level equivalent: `views` = every play/display of the
// account's content in the window (reels, posts, stories, older posts too).
const FIELDS_IG_ACCOUNT = ["date", "account_name", "views"];
// Paid side of the split. Facebook exposes it directly (page-level paid
// impressions). Instagram's connector has NO paid/organic field, so Instagram
// paid is estimated from the Meta Ads connector: impressions delivered on the
// Instagram placement for this client's ad accounts. Instagram organic views =
// account `views` (which include ad delivery) minus that, floored at 0 — close
// to Meta Business Suite's "From organic" but an estimate, labelled as such.
const FIELDS_FB_PAGE_PAID = ["date", "page_name", "page_impressions_paid"];
const CONNECTOR_ADS = "facebook";
const FIELDS_IG_ADS = ["date", "account_name", "campaign", "publisher_platform", "impressions"];
const FIELDS_IG = [
  "account_name", "media_id", "media_caption", "media_type", "media_product_type",
  "timestamp", "media_permalink", "media_url", "media_thumbnail_url",
  "media_reach", "media_views", "media_like_count", "media_comments_count",
  "media_saved", "media_shares",
];

async function windsorGet(connector, fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
  });
  const res = await fetch(`${BASE}/${connector}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Windsor ${connector} ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shiftDate = (dateStr, delta) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return iso(d);
};
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;

// The report range is any from/to pair (inclusive). Defaults to the 7 days
// ending yesterday so the latest window is always complete. `previous` is the
// equal-length window immediately before it (headline deltas + health), and
// `baseline` is the 6 months before the range starts (Normalized Performance).
export function rangeWindows(from, to) {
  let end = to;
  if (!end) { const t = new Date(); t.setDate(t.getDate() - 1); end = iso(t); }
  let start = from || shiftDate(end, -6);
  if (start > end) start = end;
  const days = daysBetween(start, end);
  const prevTo = shiftDate(start, -1);
  const prevFrom = shiftDate(prevTo, -(days - 1));
  const base = new Date(`${start}T00:00:00`); base.setMonth(base.getMonth() - 6);
  const baseFrom = iso(base);
  return {
    current:  { from: start, to: end },
    previous: { from: prevFrom, to: prevTo },
    baseline: { from: baseFrom, to: prevTo },
    days,
  };
}

export function pctChange(value, prev) {
  if (!prev) return value ? 100 : 0;
  return ((value - prev) / prev) * 100;
}

// Same health-score formula as the sample reports' computeHealth(): counts
// how many headline metrics declined >2%, escalates on a steep engagement-
// rate or views decline (Meta is retiring Reach, so Views is the headline). Returned as green/amber/red, mapped onto this app's
// own C.healthy/watch/risk tokens by the component (not re-defined here).
export function computeHealth(metrics) {
  let declined = 0, erDeclinePct = 0, viewsDeclinePct = 0;
  for (const m of metrics) {
    const change = pctChange(m.value, m.prev);
    const isDown = change < -2;
    if (isDown) declined++;
    if (m.key === "engagement" && isDown) erDeclinePct = change;
    if (m.key === "impressions" && isDown) viewsDeclinePct = change;
  }
  let status = declined <= 1 ? "green" : declined === 2 ? "amber" : "red";
  if (erDeclinePct <= -15) status = status === "green" ? "amber" : "red";
  if (viewsDeclinePct <= -20 && erDeclinePct < 0) status = "red";
  return { status, declined };
}

export function fmt(value, format) {
  if (format === "pct") return `${Number(value).toFixed(2)}%`;
  if (format === "dec") return Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const UNASSIGNED_PILLAR = "Unassigned";

// Stable key for a post: its permalink, else platform+date+opening text. Used
// for saved pillar overrides and cached summaries, so the same post keeps
// them across every range that surfaces it.
export const postKey = (p) => p.link || `${p.platform}|${p.date}|${(p.title || "").slice(0, 40)}`;

function normFbPost(row) {
  const reach        = Math.round(row.post_impressions_unique ?? 0);
  const views         = Math.round(row.post_impressions_organic ?? row.post_impressions ?? 0);
  const likes         = Math.round(row.post_reactions_like_total ?? 0);
  const comments      = Math.round(row.post_comments_total ?? 0);
  const shares        = Math.round(row.post_activity_by_action_type_share ?? 0);
  const clicks        = row.post_clicks != null ? Math.round(row.post_clicks) : null;
  const interactions  = likes + comments + shares;
  return {
    title: (row.post_message || "").split("\n")[0].slice(0, 120) || "Untitled post",
    copy:  row.post_message || "",
    type:  /video/i.test(row.type || "") ? "FB Video" : "FB Photo",
    link:  row.permalink_url || null,
    img:   row.full_picture || null,
    date:  row.post_created_time ? row.post_created_time.slice(0, 10) : null,
    reach, views, interactions,
    eng: views ? (interactions / views) * 100 : 0,
    likes, comments, shares, clicks,
    platform: "facebook",
  };
}

function normIgPost(row) {
  const reach       = Math.round(row.media_reach ?? 0);
  const views       = Math.round(row.media_views ?? row.media_reach ?? 0);
  const likes       = Math.round(row.media_like_count ?? 0);
  const comments    = Math.round(row.media_comments_count ?? 0);
  const shares      = Math.round(row.media_shares ?? 0);
  const saves       = Math.round(row.media_saved ?? 0);
  const interactions = likes + comments + shares + saves;
  return {
    title: (row.media_caption || "").split("\n")[0].slice(0, 120) || "Untitled post",
    copy:  row.media_caption || "",
    type:  /reel/i.test(row.media_product_type || "") ? "IG Reel" : row.media_type === "CAROUSEL_ALBUM" ? "IG Carousel" : "IG Photo",
    link:  row.media_permalink || null,
    img:   row.media_thumbnail_url || row.media_url || null,
    date:  row.timestamp ? row.timestamp.slice(0, 10) : null,
    reach, views, interactions,
    eng: views ? (interactions / views) * 100 : 0,
    likes, comments, shares, saves,
    platform: "instagram",
  };
}

// Pure transform: normalised post arrays (current, previous and 6-month
// baseline windows, both platforms) → the per-platform shape SocialReportTab
// consumes — headline metrics with current-vs-previous deltas, Normalized
// Performance vs the 6-month baseline, the posts table, per-pillar stats and
// the health status.
//   pillarOverrides  { [postKey]: pillar } saved by the analyst (always wins)
//   pillarLookup     (post) => pillar | null — from the client's content-
//                    calendar sheet (lib/social-pillars.js)
//   summaries        { [postKey]: summary } cached descriptive summaries
// `fbPageViews` / `igAccountViews` / `baseline.*Views` are account-level
// views (see FIELDS_FB_PAGE / FIELDS_IG_ACCOUNT) or null when that pull
// failed — Views then falls back to the per-post sum for that platform.
export function buildSocialData(
  { fbCurrent, fbPrevious, igCurrent, igPrevious, fbPageViews = null, igAccountViews = null, fbPaidViews = null, igPaidViews = null, baseline = null, days = 7 },
  { pillarOverrides = {}, pillarLookup = () => null, summaries = {} } = {},
) {
  const fbCur = fbCurrent.map(normFbPost), fbPrev = fbPrevious.map(normFbPost);
  const igCur = igCurrent.map(normIgPost), igPrev = igPrevious.map(normIgPost);
  const base = baseline ? {
    days: baseline.days,
    fb: baseline.fb.map(normFbPost), ig: baseline.ig.map(normIgPost),
    fbViews: baseline.fbViews ?? null, igViews: baseline.igViews ?? null,
  } : null;

  const sum = (arr, key) => arr.reduce((a, p) => a + (p[key] || 0), 0);
  const perDay = (n, d) => (d ? n / d : 0);

  const platformData = (curPosts, prevPosts, viewsOverride, basePosts, baseViews, showPosts, paidViews = null) => {
    const postViews = sum(curPosts, "views"), prevPostViews = sum(prevPosts, "views");
    const views     = viewsOverride ? viewsOverride.current  : postViews;
    const prevViews = viewsOverride ? viewsOverride.previous : prevPostViews;
    const interactions = sum(curPosts, "interactions"), prevInteractions = sum(prevPosts, "interactions");
    const eng     = postViews ? (interactions / postViews) * 100 : 0;
    const prevEng = prevPostViews ? (prevInteractions / prevPostViews) * 100 : 0;

    const metrics = [
      { key: "impressions",  label: "Views",              value: views,             prev: prevViews,        format: "int" },
      { key: "interactions", label: "Engagement",         value: interactions,      prev: prevInteractions, format: "int" },
      { key: "engagement",   label: "Engagement Rate",    value: eng,               prev: prevEng,          format: "pct" },
      ...(showPosts ? [{ key: "posts", label: "Posts Published", value: curPosts.length, prev: prevPosts.length, format: "int" }] : []),
    ];

    // Normalized Performance: this range against the average of the previous
    // 6 months, so one unusual week doesn't read as a trend. Everything is
    // per-day / per-post / per-week so ranges of different length compare.
    const n = curPosts.length || 1;
    const bn = basePosts ? basePosts.length || 1 : 1;
    const baseViewsTotal = basePosts ? (baseViews ?? sum(basePosts, "views")) : 0;
    const norm = (label, value, baseValue, f = "int") => ({
      label, value: fmt(value, f),
      delta: base && basePosts ? pctChange(value, baseValue) : null,
    });
    const account = [
      norm("Views / Day",             perDay(views, days),             base ? perDay(baseViewsTotal, base.days) : 0),
      norm("Avg Views / Post",        postViews / n,                   basePosts ? sum(basePosts, "views") / bn : 0),
      norm("Avg Engagement / Post",   interactions / n,                basePosts ? sum(basePosts, "interactions") / bn : 0),
      norm("Posts / Week",            (curPosts.length * 7) / days,    base ? (basePosts.length * 7) / base.days : 0, "dec"),
    ];

    const posts = curPosts
      .map((p) => {
        const key = postKey(p);
        const pillar = pillarOverrides[key] || pillarLookup(p) || UNASSIGNED_PILLAR;
        return { ...p, key, pillar, pillarSource: pillarOverrides[key] ? "manual" : (pillarLookup(p) ? "sheet" : "none"), summary: summaries[key] || null, engUp: p.eng >= eng };
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Which pillar does best — views and engagement per post, per pillar.
    const byPillar = new Map();
    for (const p of posts) {
      const g = byPillar.get(p.pillar) || { pillar: p.pillar, posts: 0, views: 0, interactions: 0 };
      g.posts++; g.views += p.views; g.interactions += p.interactions;
      byPillar.set(p.pillar, g);
    }
    const pillarStats = [...byPillar.values()].map((g) => ({
      ...g,
      avgViews: g.views / g.posts,
      avgInteractions: g.interactions / g.posts,
      eng: g.views ? (g.interactions / g.views) * 100 : 0,
    })).sort((a, b) => b.avgViews - a.avgViews);

    // The standout post is the one with the most organic views (ties → higher
    // engagement rate), not simply the most recent one.
    const highlightPost = [...posts].sort((a, b) => (b.views - a.views) || (b.eng - a.eng))[0] || null;

    const accountCaption = `${curPosts.length} platform post${curPosts.length === 1 ? "" : "s"} published vs ${prevPosts.length} in the previous ${days} days.`
      + (base && basePosts ? " Normalized figures compare with the average of the previous 6 months." : " 6-month baseline unavailable.");

    // Views breakdown (Meta Business Suite's Total / From organic / From ads).
    // `views` above is the organic figure; null when the paid side is unknown.
    const viewsBreakdown = paidViews
      ? { organic: views, paid: paidViews.current, total: views + paidViews.current,
          prevOrganic: prevViews, prevPaid: paidViews.previous, prevTotal: prevViews + paidViews.previous }
      : null;

    return { metrics, account, accountCaption, posts, pillarStats, health: computeHealth(metrics).status, highlightPost, viewsBreakdown };
  };

  const fbViews = fbPageViews    ?? { current: sum(fbCur, "views"), previous: sum(fbPrev, "views") };
  const igViews = igAccountViews ?? { current: sum(igCur, "views"), previous: sum(igPrev, "views") };
  const overallViews = {
    current:  fbViews.current  + igViews.current,
    previous: fbViews.previous + igViews.previous,
  };
  const overallPaid = fbPaidViews && igPaidViews
    ? { current: fbPaidViews.current + igPaidViews.current, previous: fbPaidViews.previous + igPaidViews.previous }
    : null;
  const overallBaseViews = base && (base.fbViews != null || base.igViews != null)
    ? (base.fbViews ?? sum(base.fb, "views")) + (base.igViews ?? sum(base.ig, "views")) : null;

  return {
    overall:   platformData([...fbCur, ...igCur], [...fbPrev, ...igPrev], overallViews, base && [...base.fb, ...base.ig], overallBaseViews, false, overallPaid),
    facebook:  platformData(fbCur, fbPrev, fbPageViews, base && base.fb, base && base.fbViews, true, fbPaidViews),
    instagram: platformData(igCur, igPrev, igAccountViews, base && base.ig, base && base.igViews, true, igPaidViews),
  };
}

// Returns { range, windows, data, viewsSource, unmatched }.
// Throws if WINDSOR_API_KEY is missing, the upstream call fails, or `client`
// has no configured social data source — callers decide how to surface that.
export async function fetchSocialReport(client, { from, to } = {}, ctx = {}) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  if (!ACCOUNT_MAP.facebook || !Object.values(ACCOUNT_MAP.facebook).includes(client)) {
    throw new Error(`No social data source configured for ${client}`);
  }

  const w = rangeWindows(from, to);
  const { current, previous, baseline } = w;

  // Facebook post pull asks for the organic-only impressions field; if
  // Windsor rejects it, retry without so the report still loads.
  let fbOrganic = true;
  const fbPostsGet = async (win) => {
    try { return await windsorGet(CONNECTOR_FB, FIELDS_FB, win.from, win.to); }
    catch (e) {
      console.warn(`social: organic post impressions unavailable (${e.message}); retrying without`);
      fbOrganic = false;
      return windsorGet(CONNECTOR_FB, FIELDS_FB_LEGACY, win.from, win.to);
    }
  };
  // The page-level / account-level / baseline pulls are best-effort: if one
  // fails the headline falls back to the per-post sum (or the baseline is
  // dropped) instead of failing the whole report.
  const soft = (connector, fields, win, what) => windsorGet(connector, fields, win.from, win.to).catch((e) => {
    console.warn(`social: ${connector} ${what} unavailable (${e.message})`);
    return null;
  });
  const [
    fbCurrentRaw, fbPreviousRaw, igCurrentRaw, igPreviousRaw,
    fbPageCurRaw, fbPagePrevRaw, igAcctCurRaw, igAcctPrevRaw,
    fbBaseRaw, igBaseRaw, fbPageBaseRaw, igAcctBaseRaw,
    fbPaidCurRaw, fbPaidPrevRaw, fbPaidBaseRaw,
    adsCurRaw, adsPrevRaw, adsBaseRaw,
  ] = await Promise.all([
    fbPostsGet(current),
    fbPostsGet(previous),
    windsorGet(CONNECTOR_IG, FIELDS_IG, current.from, current.to),
    windsorGet(CONNECTOR_IG, FIELDS_IG, previous.from, previous.to),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE, current, "page-level views"),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE, previous, "page-level views"),
    soft(CONNECTOR_IG, FIELDS_IG_ACCOUNT, current, "account-level views"),
    soft(CONNECTOR_IG, FIELDS_IG_ACCOUNT, previous, "account-level views"),
    fbPostsGet(baseline).catch((e) => { console.warn(`social: 6-month baseline unavailable (${e.message})`); return null; }),
    soft(CONNECTOR_IG, FIELDS_IG, baseline, "6-month baseline"),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE, baseline, "6-month page views"),
    soft(CONNECTOR_IG, FIELDS_IG_ACCOUNT, baseline, "6-month account views"),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE_PAID, current, "page-level paid views"),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE_PAID, previous, "page-level paid views"),
    soft(CONNECTOR_FB, FIELDS_FB_PAGE_PAID, baseline, "6-month page paid views"),
    soft(CONNECTOR_ADS, FIELDS_IG_ADS, current, "Instagram ad impressions"),
    soft(CONNECTOR_ADS, FIELDS_IG_ADS, previous, "Instagram ad impressions"),
    soft(CONNECTOR_ADS, FIELDS_IG_ADS, baseline, "6-month Instagram ad impressions"),
  ]);

  // Facebook rows carry `page_name`, Instagram rows carry `account_name` —
  // the two connectors don't share an identity field (see the file-header
  // comment). rawKey picks the right one per kind. Unmapped raw values are
  // collected (not just console.warn'd) so the API/UI can surface them
  // directly — if ACCOUNT_MAP's guessed values are wrong, the report would
  // otherwise just silently come back with zero posts.
  const unmatched = { facebook: new Set(), instagram: new Set() };
  const filterAccount = (rows, kind) => {
    const map = ACCOUNT_MAP[kind];
    const rawKey = kind === "facebook" ? "page_name" : "account_name";
    return rows.filter((r) => {
      const raw = r[rawKey];
      const name = map[raw];
      if (!name) { if (raw) unmatched[kind].add(raw); return false; }
      return name === client;
    });
  };

  const pageViews = (rows) => filterAccount(rows, "facebook")
    .reduce((a, r) => a + Math.round(Number(r.page_impressions_organic) || 0), 0);
  const pagePaid = (rows) => filterAccount(rows, "facebook")
    .reduce((a, r) => a + Math.round(Number(r.page_impressions_paid) || 0), 0);
  const acctViewsTotal = (rows) => filterAccount(rows, "instagram")
    .reduce((a, r) => a + Math.round(Number(r.views) || 0), 0);

  // Instagram ad impressions for THIS client, matched through the same ad-
  // account matcher the SEM tab uses. `matched` stays false when no ad row in
  // any window belongs to this client — either it runs no Meta ads, or its ad
  // account isn't in lib/sem.js's ACCOUNT_MATCH; either way Instagram Views
  // can't be proven organic-only, so the UI says so instead of implying it.
  let adAccountMatched = false;
  const igAdImpressions = (rows) => rows.reduce((a, r) => {
    if (clientForAccount(r.account_name, r.campaign) !== client) return a;
    adAccountMatched = true;
    return /instagram/i.test(r.publisher_platform || "") ? a + Math.round(Number(r.impressions) || 0) : a;
  }, 0);
  const adsOk = !!(adsCurRaw && adsPrevRaw);
  const igAds = adsOk ? { current: igAdImpressions(adsCurRaw), previous: igAdImpressions(adsPrevRaw) } : null;
  const igAdsBase = adsBaseRaw ? igAdImpressions(adsBaseRaw) : null;

  // Split one window's Instagram total into organic + paid (estimate).
  const splitIg = (total, ads) => {
    const paid = Math.min(total, ads ?? 0);
    return { organic: total - paid, paid };
  };
  const fbPageViews = fbPageCurRaw && fbPagePrevRaw
    ? { current: pageViews(fbPageCurRaw), previous: pageViews(fbPagePrevRaw) }
    : null;
  const fbPaidViews = fbPaidCurRaw && fbPaidPrevRaw
    ? { current: pagePaid(fbPaidCurRaw), previous: pagePaid(fbPaidPrevRaw) }
    : null;
  let igAccountViews = null, igPaidViews = null;
  if (igAcctCurRaw && igAcctPrevRaw) {
    const cur = splitIg(acctViewsTotal(igAcctCurRaw), igAds?.current);
    const prev = splitIg(acctViewsTotal(igAcctPrevRaw), igAds?.previous);
    igAccountViews = { current: cur.organic, previous: prev.organic };
    if (igAds) igPaidViews = { current: cur.paid, previous: prev.paid };
  }

  const baselineData = fbBaseRaw && igBaseRaw ? {
    days: daysBetween(baseline.from, baseline.to),
    fb: filterAccount(fbBaseRaw, "facebook"),
    ig: filterAccount(igBaseRaw, "instagram"),
    fbViews: fbPageBaseRaw ? pageViews(fbPageBaseRaw) : null,
    igViews: igAcctBaseRaw ? splitIg(acctViewsTotal(igAcctBaseRaw), igAdsBase).organic : null,
  } : null;

  return {
    range: current,
    windows: { current, previous, baseline, days: w.days },
    data: buildSocialData({
      fbCurrent:  filterAccount(fbCurrentRaw, "facebook"),
      fbPrevious: filterAccount(fbPreviousRaw, "facebook"),
      igCurrent:  filterAccount(igCurrentRaw, "instagram"),
      igPrevious: filterAccount(igPreviousRaw, "instagram"),
      fbPageViews, igAccountViews, fbPaidViews, igPaidViews, baseline: baselineData, days: w.days,
    }, ctx),
    viewsSource: {
      facebook:  fbPageViews    ? "page_organic" : "post_sum",
      instagram: igAccountViews ? "account"      : "post_sum",
      facebookPosts: fbOrganic ? "organic" : "total",
      baseline: baselineData ? "ok" : "missing",
      // Whether the paid side could be separated: Facebook from its own paid
      // field; Instagram only as an estimate, and only if an ad account matched.
      paidSplit: {
        facebook:  fbPaidViews ? "ok" : "unavailable",
        instagram: !igAccountViews ? "unavailable" : !adsOk ? "unavailable" : adAccountMatched ? "estimated" : "no_ad_account",
      },
    },
    unmatched: { facebook: [...unmatched.facebook], instagram: [...unmatched.instagram] },
  };
}
