// Organic social-content data layer — Windsor.ai "facebook_organic" (Facebook
// Page posts) + "instagram" (Instagram Business posts) connectors. Powers
// the IC Khao Yai-only "Social" tab (SERVICES["IC Khao Yai"] includes
// "social" in components/SeoTracker.jsx). Own file per the lib/leads.js
// convention — a genuinely different data domain, not pooled across
// clients like the ad connectors in lib/sem.js.
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
// is deprecated in favor of `media_views` — used below. Still unconfirmed:
// the exact ACCOUNT_MAP string values (IC Khao Yai's real page_name/
// account_name) — fetchSocialReport() is the only function that talks to
// Windsor; buildSocialData() is a pure transform (same split as buildAiData
// in lib/ai.js) so it can be exercised/adjusted without a live key.

const WINDSOR_KEY  = process.env.WINDSOR_API_KEY;
const BASE         = "https://connectors.windsor.ai";
const CONNECTOR_FB = "facebook_organic";
const CONNECTOR_IG = "instagram";

// Facebook rows are matched on `page_name`, Instagram rows on `account_name`
// (see the connector-name comment above) — both map to the same client.
// TODO confirm the real page_name/account_name strings against a live pull.
export const ACCOUNT_MAP = {
  facebook:  { "Intercontinental Khao Yai Resort": "IC Khao Yai" },
  instagram: { "Intercontinental Khao Yai Resort": "IC Khao Yai" },
};

const FIELDS_FB = [
  "page_name", "post_id", "type", "post_message", "post_created_time",
  "permalink_url", "full_picture", "post_impressions_unique",
  "post_impressions", "post_reactions_like_total", "post_comments_total",
  "post_activity_by_action_type_share", "post_clicks",
];
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

// Given a week-end date (yyyy-mm-dd, defaults to yesterday so "current week"
// is always a complete 7-day window, not a partial one), returns the current
// + previous 7-day windows — the same non-calendar-aligned "current vs
// previous 7 days" framing the sample reports use.
export function weekWindows(weekEndDate) {
  const end = weekEndDate
    ? new Date(`${weekEndDate}T00:00:00`)
    : (() => { const t = new Date(); t.setDate(t.getDate() - 1); return t; })();
  const curFrom = new Date(end); curFrom.setDate(curFrom.getDate() - 6);
  const prevTo  = new Date(curFrom); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - 6);
  return {
    current:  { from: iso(curFrom),  to: iso(end) },
    previous: { from: iso(prevFrom), to: iso(prevTo) },
  };
}

export function pctChange(value, prev) {
  if (!prev) return value ? 100 : 0;
  return ((value - prev) / prev) * 100;
}

// Same health-score formula as the sample reports' computeHealth(): counts
// how many headline metrics declined >2%, escalates on a steep engagement-
// rate or reach decline. Returned as green/amber/red, mapped onto this app's
// own C.healthy/watch/risk tokens by the component (not re-defined here).
export function computeHealth(metrics) {
  let declined = 0, erDeclinePct = 0, reachDeclinePct = 0;
  for (const m of metrics) {
    const change = pctChange(m.value, m.prev);
    const isDown = change < -2;
    if (isDown) declined++;
    if (m.key === "engagement" && isDown) erDeclinePct = change;
    if (m.key === "reach" && isDown) reachDeclinePct = change;
  }
  let status = declined <= 1 ? "green" : declined === 2 ? "amber" : "red";
  if (erDeclinePct <= -15) status = status === "green" ? "amber" : "red";
  if (reachDeclinePct <= -20 && erDeclinePct < 0) status = "red";
  return { status, declined };
}

export function fmt(value, format) {
  if (format === "pct") return `${Number(value).toFixed(2)}%`;
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export const CONTENT_PILLARS = [
  "The Heritage Stay",
  "For the Curious Traveller",
  "Design for Disconnection",
  "Memory-Making in Motion",
  "Client Post",
];

// Rough auto-guess so every post has a pillar before the analyst assigns one
// in the UI (persisted overrides come from seo_social_post_pillars).
export function defaultPillarForPost(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("client post") || t.includes("offer") || t.includes("stay for good") || t.includes("pay 2")) return "Client Post";
  if (t.includes("heritage") || t.includes("railway") || t.includes("tram")) return "The Heritage Stay";
  if (t.includes("morning") || t.includes("suite") || t.includes("pool") || t.includes("lake")) return "Design for Disconnection";
  return "For the Curious Traveller";
}

function normFbPost(row) {
  const reach        = Math.round(row.post_impressions_unique ?? 0);
  const views         = Math.round(row.post_impressions ?? 0);
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
    eng: reach ? (interactions / reach) * 100 : 0,
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
    eng: reach ? (interactions / reach) * 100 : 0,
    likes, comments, shares, saves,
    platform: "instagram",
  };
}

// Pure transform: normalised post arrays (both windows, both platforms) →
// the per-platform shape SocialReportTab consumes — metrics/account stats
// with current-vs-previous deltas, the posts table, an auto-templated
// caption (no LLM, matching lib/report-narrative.js's convention), and the
// health status. `pillarOverrides` is { [postLink]: pillar } from
// seo_social_post_pillars; falls back to defaultPillarForPost() per post.
export function buildSocialData({ fbCurrent, fbPrevious, igCurrent, igPrevious }, pillarOverrides = {}) {
  const fbCur = fbCurrent.map(normFbPost), fbPrev = fbPrevious.map(normFbPost);
  const igCur = igCurrent.map(normIgPost), igPrev = igPrevious.map(normIgPost);

  const platformData = (curPosts, prevPosts) => {
    const sum = (arr, key) => arr.reduce((a, p) => a + (p[key] || 0), 0);
    const reach = sum(curPosts, "reach"), prevReach = sum(prevPosts, "reach");
    const views = sum(curPosts, "views"), prevViews = sum(prevPosts, "views");
    const interactions = sum(curPosts, "interactions"), prevInteractions = sum(prevPosts, "interactions");
    const eng     = reach ? (interactions / reach) * 100 : 0;
    const prevEng = prevReach ? (prevInteractions / prevReach) * 100 : 0;

    const metrics = [
      { key: "reach",        label: "Reach",             value: reach,             prev: prevReach,        format: "int" },
      { key: "impressions",  label: "Views",              value: views,             prev: prevViews,        format: "int" },
      { key: "engagement",   label: "Engagement Rate",    value: eng,               prev: prevEng,          format: "pct" },
      { key: "posts",        label: "Posts Published",    value: curPosts.length,   prev: prevPosts.length, format: "int" },
    ];

    const n = curPosts.length || 1, pn = prevPosts.length || 1;
    const account = [
      { label: "Avg Reach / Post",        value: fmt(reach / n, "int"),        delta: pctChange(reach / n, prevReach / pn) },
      { label: "Avg Views / Post",        value: fmt(views / n, "int"),        delta: pctChange(views / n, prevViews / pn) },
      { label: "Avg Interactions / Post", value: fmt(interactions / n, "int"), delta: pctChange(interactions / n, prevInteractions / pn) },
      { label: "Total Interactions",      value: fmt(interactions, "int"),     delta: pctChange(interactions, prevInteractions) },
    ];

    const posts = curPosts
      .map((p) => ({
        ...p,
        pillar: pillarOverrides[p.link] || defaultPillarForPost(p.title),
        engUp: p.eng >= eng,
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const accountCaption = `${curPosts.length} platform post${curPosts.length === 1 ? "" : "s"} published vs ${prevPosts.length} previously.`;

    return {
      metrics,
      account,
      accountCaption,
      posts,
      health: computeHealth(metrics).status,
      highlightPost: posts[0] || null,
    };
  };

  return {
    overall:   platformData([...fbCur, ...igCur], [...fbPrev, ...igPrev]),
    facebook:  platformData(fbCur, fbPrev),
    instagram: platformData(igCur, igPrev),
  };
}

// Returns { weeks: {current,previous}, data: {overall,facebook,instagram} }.
// Throws if WINDSOR_API_KEY is missing, the upstream call fails, or `client`
// has no configured social data source — callers decide how to surface that.
export async function fetchSocialReport(client, weekEndDate, pillarOverrides = {}) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  if (!ACCOUNT_MAP.facebook || !Object.values(ACCOUNT_MAP.facebook).includes(client)) {
    throw new Error(`No social data source configured for ${client}`);
  }

  const { current, previous } = weekWindows(weekEndDate);

  const [fbCurrentRaw, fbPreviousRaw, igCurrentRaw, igPreviousRaw] = await Promise.all([
    windsorGet(CONNECTOR_FB, FIELDS_FB, current.from, current.to),
    windsorGet(CONNECTOR_FB, FIELDS_FB, previous.from, previous.to),
    windsorGet(CONNECTOR_IG, FIELDS_IG, current.from, current.to),
    windsorGet(CONNECTOR_IG, FIELDS_IG, previous.from, previous.to),
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

  const fbCurrent  = filterAccount(fbCurrentRaw, "facebook");
  const fbPrevious = filterAccount(fbPreviousRaw, "facebook");
  const igCurrent  = filterAccount(igCurrentRaw, "instagram");
  const igPrevious = filterAccount(igPreviousRaw, "instagram");

  return {
    weeks: { current, previous },
    data: buildSocialData({ fbCurrent, fbPrevious, igCurrent, igPrevious }, pillarOverrides),
    unmatched: { facebook: [...unmatched.facebook], instagram: [...unmatched.instagram] },
  };
}
