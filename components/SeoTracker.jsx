"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  ReferenceArea,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, ArrowLeft, Minus, Lock, Check, Clock, ChevronDown, ExternalLink, PieChart, Sparkles, Search, Loader2, Eye, MousePointerClick, Percent, TrendingUp, Users, UserPlus, Target, DollarSign, Activity, ShoppingCart, Receipt, Banknote, Printer, X, FileText, BarChart3, Megaphone } from "lucide-react";

// ── Persistence shim ─────────────────────────────────────────────────────────
// In Claude's artifact runtime, window.storage is provided by the host. Outside
// it (this deployed app) back the same async get/set/delete API with localStorage
// so the "remember me" session flag still persists. Swap for Supabase Auth later.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (k) => { try { const v = window.localStorage.getItem(k); return v == null ? null : { key: k, value: v }; } catch { return null; } },
    set: async (k, v) => { try { window.localStorage.setItem(k, v); return { key: k, value: v }; } catch { return null; } },
    delete: async (k) => { try { window.localStorage.removeItem(k); return { key: k, deleted: true }; } catch { return null; } },
  };
}

/* ------------------------------------------------------------------ */
/*  Design tokens — custom palette via inline styles, since artifact   */
/*  Tailwind has no JIT for arbitrary hex values.                      */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#EFF6FF",        // very light AMN blue tint
  surface: "#FFFFFF",
  ink: "#0A1F3C",       // deep navy
  muted: "#4A6A8A",     // mid blue-grey
  faint: "#8AAEC8",     // faint blue-grey
  accent: "#0077C8",    // AMN dark blue (complements logo #38B6FF)
  line: "#C8DFF2",      // soft blue rule
  healthy: "#1A7A50",
  watch: "#B87A00",
  risk: "#B03030",
};

const STATUS = {
  healthy: { label: "Healthy", color: C.healthy, rank: 2 },
  watch: { label: "Watch", color: C.watch, rank: 1 },
  risk: { label: "At risk", color: C.risk, rank: 0 },
};

/* Action-plan priority + task-status tokens */
const PRIORITY = {
  high: { label: "High", color: C.risk, rank: 0 },
  med: { label: "Med", color: C.watch, rank: 1 },
  low: { label: "Low", color: C.faint, rank: 2 },
};
const TASK = {
  doing: { label: "In progress", color: C.watch, rank: 0 },
  todo: { label: "To do", color: C.muted, rank: 1 },
  done: { label: "Done", color: C.healthy, rank: 2 },
};

// Canonical month lookups — a single source every month-number/month-label
// reference in this file reads from, so the reporting window auto-extends
// as time passes instead of needing a hardcoded end month bumped by hand
// (this file used to have ~8 separate hand-copied `{ Mar: 3, ... }` objects
// that all silently stopped at Jul; see lib/sem.js's matching dateTo fix).
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
const MO_NUM = Object.fromEntries(MONTH_ABBR.map((m, i) => [m, i + 1])); // "Mar" → 3, etc. — all 12 months, not just the reporting window
const YEAR = 2026;
// Reporting window: March YEAR through the current month (clamped to
// December if today has moved into a later year, or to March if somehow
// run before the window opens) — recomputed on every load, so it always
// reflects "now" rather than a fixed month someone forgot to update.
const REPORT_START_MONTH = 3; // March
const _today = new Date();
const _curMonthNum = _today.getFullYear() > YEAR ? 12 : _today.getFullYear() < YEAR ? REPORT_START_MONTH : _today.getMonth() + 1;
const REPORT_END_MONTH = Math.max(REPORT_START_MONTH, Math.min(12, _curMonthNum));
const MONTHS = MONTH_ABBR.slice(REPORT_START_MONTH - 1, REPORT_END_MONTH);

/* ------------------------------------------------------------------ */
/*  Mock data — real client roster, plausible figures per market.      */
/*  Metrics are framed around Google Search Console (clicks,            */
/*  impressions, CTR, average position), the data pulled via            */
/*  Windsor.ai. The `traffic` series stands in for GSC organic clicks.  */
/* ------------------------------------------------------------------ */
const CLIENTS = [
  {
    name: "Shinta Mani Wild",
    domain: "shintamani.com/wild",
    market: "Global · EN",
    status: "healthy",
    traffic: [2100, 2380, 2520, 2900, 3450, 4120],
    top10: 48, top10d: 9,
    authority: 38, authorityd: 1,
    refDomains: 412,
    health: 91, errors: 1, warnings: 6,
    buckets: { t3: 7, t10: 48, t20: 96, t100: 240, new: 14, lost: 3 },
    keywords: [
      { k: "luxury tented camp cambodia", p: 3, d: 2, v: 1900 },
      { k: "shinta mani wild", p: 1, d: 0, v: 2400 },
      { k: "cardamom mountains lodge", p: 6, d: 4, v: 720 },
      { k: "all inclusive luxury cambodia", p: 12, d: 5, v: 1300 },
      { k: "bensley collection cambodia", p: 4, d: 1, v: 480 },
      { k: "cambodia jungle resort", p: 9, d: 3, v: 1600 },
      { k: "luxury eco resort cambodia", p: 7, d: 2, v: 1100 },
      { k: "adventure resort southeast asia", p: 15, d: 6, v: 720 },
      { k: "cambodia conservation tourism", p: 11, d: 4, v: 390 },
      { k: "best luxury hotel cambodia", p: 14, d: 5, v: 2600 },
    ],
  },
  {
    name: "Nomad Greenland",
    domain: "nomadgreenland.com",
    market: "Global · EN",
    status: "healthy",
    traffic: [320, 360, 410, 520, 640, 760],
    top10: 18, top10d: 5,
    authority: 24, authorityd: 3,
    refDomains: 96,
    health: 88, errors: 0, warnings: 3,
    buckets: { t3: 3, t10: 18, t20: 44, t100: 132, new: 9, lost: 1 },
    keywords: [
      { k: "greenland luxury travel", p: 4, d: 3, v: 1100 },
      { k: "nomad greenland", p: 1, d: 0, v: 590 },
      { k: "ilulissat tours", p: 9, d: 6, v: 880 },
      { k: "greenland arctic expedition", p: 11, d: 4, v: 720 },
      { k: "greenland adventure holidays", p: 13, d: 5, v: 880 },
      { k: "disko bay tours", p: 7, d: 4, v: 520 },
      { k: "greenland glamping", p: 10, d: 7, v: 290 },
      { k: "arctic luxury lodge", p: 14, d: 3, v: 410 },
      { k: "greenland northern lights tours", p: 12, d: 6, v: 1600 },
      { k: "east greenland travel", p: 16, d: 5, v: 480 },
    ],
  },
  {
    name: "Sora Sukhumvit",
    domain: "sorahotels.com/sorasukhumvit",
    market: "Thailand · EN",
    status: "healthy",
    traffic: [1620, 1700, 1690, 1780, 1860, 1990],
    top10: 27, top10d: 4,
    authority: 33, authorityd: 1,
    refDomains: 184,
    health: 86, errors: 2, warnings: 5,
    buckets: { t3: 4, t10: 27, t20: 61, t100: 158, new: 8, lost: 3 },
    keywords: [
      { k: "sukhumvit luxury hotel", p: 6, d: 2, v: 2600 },
      { k: "sora bangkok", p: 2, d: 1, v: 720 },
      { k: "lake view hotel bangkok", p: 10, d: 3, v: 980 },
      { k: "long stay hotel bangkok", p: 15, d: 4, v: 1400 },
      { k: "5 star hotel sukhumvit", p: 8, d: 3, v: 2400 },
      { k: "bangkok hotel near bts", p: 12, d: 2, v: 3100 },
      { k: "serviced apartment bangkok", p: 14, d: 5, v: 2200 },
      { k: "pet friendly hotel bangkok", p: 9, d: 6, v: 880 },
      { k: "bangkok staycation", p: 11, d: 4, v: 1900 },
      { k: "best hotel asoke bangkok", p: 7, d: 2, v: 720 },
    ],
  },
  {
    name: "IC Khao Yai",
    domain: "khaoyai.intercontinental.com",
    market: "Thailand · EN/TH",
    status: "watch",
    traffic: [880, 910, 860, 940, 1010, 1180],
    top10: 22, top10d: 6,
    authority: 29, authorityd: 2,
    refDomains: 138,
    health: 78, errors: 4, warnings: 9,
    buckets: { t3: 3, t10: 22, t20: 49, t100: 138, new: 10, lost: 5 },
    keywords: [
      { k: "khao yai luxury hotel", p: 8, d: 5, v: 1700 },
      { k: "intercontinental khao yai", p: 2, d: 0, v: 980 },
      { k: "khao yai resort", p: 14, d: 7, v: 2400 },
      { k: "things to do khao yai", p: 19, d: -3, v: 3100 },
      { k: "khao yai hotel with pool", p: 11, d: 4, v: 1600 },
      { k: "luxury resort near bangkok", p: 16, d: 6, v: 1400 },
      { k: "khao yai vineyard hotel", p: 9, d: 3, v: 880 },
      { k: "pet friendly resort khao yai", p: 13, d: 5, v: 520 },
      { k: "khao yai national park hotel", p: 17, d: 2, v: 2100 },
      { k: "romantic getaway khao yai", p: 15, d: 4, v: 1100 },
    ],
  },
  // SEM-only — no GSC property, no organic keyword set. `keywords: []` keeps
  // the Detail view's query-row fallback (used only if SEO ever renders) safe.
  {
    name: "Azerai Ke Ga Bay",
    domain: "azerai.com/azerai-ke-ga-bay",
    market: "Vietnam · EN/VN",
    status: "healthy",
    keywords: [],
  },
  {
    name: "Azerai La Residence, Hue",
    domain: "azerai.com/azerai-la-residence-hue",
    market: "Vietnam · EN/VN",
    status: "healthy",
    keywords: [],
  },
  // SEM-only, Meta only (no Google Ads on this account) — see lib/sem.js
  // ACCOUNT_MATCH / NATIVE_CURRENCY_CLIENTS.
  {
    name: "Six Senses Fort Barwara",
    domain: "sixsenses.com/fort-barwara",
    market: "India · EN",
    status: "healthy",
    keywords: [],
  },
  // SEM-only. Meta-only by client choice, not account limitation (a real
  // Google Ads account exists for this client too) — see lib/sem.js
  // ACCOUNT_MATCH and SongSaaOverallTab in this file.
  {
    name: "Song Saa Private Island",
    domain: "songsaaprivateisland.com",
    market: "Cambodia · EN",
    status: "healthy",
    keywords: [],
  },
  // SEM-only, Meta only (no Google Ads on this account) — same shape as
  // Six Senses Fort Barwara but USD-native and no Campaign Performance tab
  // (no India/International split in this client's spec). See lib/sem.js
  // ACCOUNT_MATCH / IG_ACCOUNT_MATCH and SsshOverallTab in this file.
  {
    name: "Six Senses Shaharut",
    domain: "sixsenses.com/shaharut",
    market: "Israel · EN",
    status: "healthy",
    keywords: [],
  },
  // SEM-only, Meta only, native VND. Single tab, no charts (the client's
  // spec doc lists none) — see lib/sem.js ACCOUNT_MATCH/NATIVE_CURRENCY_
  // CLIENTS and LeCercleOverallTab in this file.
  {
    name: "Le Cercle",
    domain: "lecerclehue.com",
    market: "Vietnam · EN/VN",
    status: "healthy",
    keywords: [],
  },
];

/* ------------------------------------------------------------------ */
/*  Action plans — one per client, derived from that client's signals.  */
/*  Kept separate from metrics because in production this is a distinct  */
/*  table (tasks the team owns), not crawl output.                       */
/*  cat: Technical · On-page · Content · Off-page · Local · International */
/* ------------------------------------------------------------------ */
const ACTION_PLANS = {
  "Shinta Mani Wild": [
    { task: "Run digital-PR push off the award wins", cat: "Off-page", priority: "high", status: "doing", detail: "Pitch the CNT Triple Crown and Tripadvisor Best of the Best wins to travel press to convert coverage into authoritative backlinks." },
    { task: "Build out experience landing pages", cat: "Content", priority: "high", status: "done", detail: "Dedicated pages for Cardamom Mountains, conservation and signature adventures to capture rising 'luxury tented camp' demand." },
    { task: "Clear the open crawl error and warnings", cat: "Technical", priority: "med", status: "done", detail: "Resolve the 1 error and 6 warnings to lift Site Health from 91 toward 95+." },
    { task: "Lift 'all inclusive luxury cambodia' into top 10", cat: "On-page", priority: "med", status: "doing", detail: "Currently position 12. Match search intent in title and H1 and add internal links from high-authority pages." },
    { task: "Add LodgingBusiness structured data", cat: "Technical", priority: "low", status: "done", detail: "Mark up rates, amenities and ratings for rich results in the SERP." },
    { task: "Earn links from conservation partners", cat: "Off-page", priority: "med", status: "todo", detail: "Relevant, high-trust links via Wildlife Alliance and sustainability partners tied to the camp's conservation story." },
  ],
  "Nomad Greenland": [
    { task: "Prioritise link-building to grow authority", cat: "Off-page", priority: "high", status: "doing", detail: "Authority is only 24 — the main ceiling on growth. Target Arctic, expedition and luxury-travel press and partners." },
    { task: "Build activity and Ilulissat content", cat: "Content", priority: "high", status: "done", detail: "Capitalise on strong content momentum; 'ilulissat tours' sits at position 9 with room to climb." },
    { task: "Refine 'greenland arctic expedition' page", cat: "On-page", priority: "med", status: "todo", detail: "Position 11 — tighten on-page targeting to break into the top 10, and push 'greenland luxury travel' (pos 4) toward top 3." },
    { task: "Add tour and experience structured data", cat: "Technical", priority: "low", status: "done", detail: "0 errors today — maintain that and add schema for tours and experiences." },
    { task: "Internal-link knowledge-base content to commercial pages", cat: "Content", priority: "med", status: "doing", detail: "Route authority from new informational chunks into booking and activity pages." },
  ],
  "Sora Sukhumvit": [
    { task: "Optimise the seven offer pages", cat: "On-page", priority: "high", status: "done", detail: "Web-exclusive, stay-longer and last-minute offers tuned for transactional queries with clean internal linking." },
    { task: "Build long-stay content", cat: "Content", priority: "high", status: "doing", detail: "'long stay hotel bangkok' sits at position 15 on strong volume — a serviced/long-stay angle is the opportunity." },
    { task: "Fix audit errors and add room schema", cat: "Technical", priority: "med", status: "done", detail: "Resolve 2 errors and 5 warnings; ensure all eight room-type pages carry hotel-room structured data." },
    { task: "Lift 'lake view hotel bangkok' from position 10", cat: "On-page", priority: "med", status: "todo", detail: "Dedicated lake-view page plus internal links to break into the top results." },
    { task: "Strengthen local signals around Sukhumvit/BTS", cat: "Local", priority: "med", status: "doing", detail: "Google Business Profile and neighbourhood content tied to the BTS line." },
  ],
  "IC Khao Yai": [
    { task: "Clear the crawl errors first", cat: "Technical", priority: "high", status: "doing", detail: "Health is 78 with 4 errors — fix indexation and crawl issues from the audit before chasing rankings." },
    { task: "Optimise the core money pages", cat: "On-page", priority: "high", status: "todo", detail: "'khao yai resort' (pos 14, high volume) and 'khao yai luxury hotel' (pos 8) — titles, H1s and internal links to break into the top 10." },
    { task: "Build a 'things to do in Khao Yai' hub", cat: "Content", priority: "high", status: "todo", detail: "Position 19 on high volume and slipping — an informational hub recovers top-of-funnel demand." },
    { task: "Set up and validate EN/TH hreflang", cat: "International", priority: "med", status: "todo", detail: "Ensure bilingual pages are correctly paired so neither language cannibalises the other." },
    { task: "Bring Thai pages to parity", cat: "On-page", priority: "med", status: "todo", detail: "Match metadata and content depth across EN and TH versions." },
    { task: "Pursue Thai travel press and brand links", cat: "Off-page", priority: "med", status: "todo", detail: "Local press plus InterContinental brand equity to build referring domains from 138." },
  ],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
// Null-safe (unlike a bare n.toLocaleString(...)) — a single missing/
// undefined field anywhere that calls fmt() would otherwise throw and take
// down the whole tab's render (React error boundary → blank "Application
// error" page), rather than just showing "0". Caught live, Aug 2026, via
// AzeraiGoogleTab (see the daily.google overwrite bug fixed in lib/sem.js).
const fmt = (n) => (n ?? 0).toLocaleString("en-US");
const fmtMoney = (n) => `$${Math.round(n ?? 0).toLocaleString("en-US")}`;
// Same, but keeps 2 decimals — for Six Senses Shaharut's Amount Spent,
// matching the client's own Looker Studio report (Aug 2026), which shows
// spend to the cent rather than rounded to a whole dollar.
const fmtMoney2 = (n) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// THB — for clients whose report spec calls for the account's native billing
// currency rather than a USD conversion (see NATIVE_CURRENCY_CLIENTS in lib/sem.js).
const fmtTHB = (n) => `฿${Math.round(n ?? 0).toLocaleString("en-US")}`;
// INR — Six Senses Fort Barwara's native billing currency (same
// NATIVE_CURRENCY_CLIENTS reasoning as fmtTHB above).
const fmtINR = (n) => `₹${Math.round(n ?? 0).toLocaleString("en-IN")}`;
// Same, but keeps 2 decimals — for small per-unit figures like CPC where
// rounding to a whole rupee (fmtINR above) would read as "₹0" for anything
// under a rupee, and for Six Senses Fort Barwara's Amount Spent, matching
// the client's own Looker Studio report (Aug 2026), which shows spend to
// the paisa rather than rounded to a whole rupee.
const fmtINR2 = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// VND — Azerai's report currency (see MIXED_CURRENCY_TARGET in lib/sem.js).
// No decimals: VND has no subunit in practical use (its smallest
// denomination in circulation is 200 ₫), so a fractional ₫ would just be noise.
const fmtVND = (n) => `₫${Math.round(n ?? 0).toLocaleString("en-US")}`;
// EUR/DKK — Nomad Greenland's two platform currencies (Meta bills EUR,
// Google bills DKK, confirmed live, Aug 2026 — see the "no live FX
// conversion for default clients" change in lib/sem.js). DKK conventionally
// suffixes "kr" rather than a prefixed symbol.
const fmtEUR = (n) => `€${Math.round(n ?? 0).toLocaleString("en-US")}`;
const fmtDKK = (n) => `${Math.round(n ?? 0).toLocaleString("en-US")} kr`;
// Dispatches to the right formatter for whatever real currency a platform's
// spend is actually denominated in (daily.google.currency/daily.meta.currency
// from lib/sem.js) — used by the generic MetaTab/GoogleTab/SummaryTab (IC
// Khao Yai, Nomad Greenland) instead of always assuming USD, now that spend
// is never converted for these clients. Falls back to fmtMoney ($) for USD
// or any currency code without a dedicated formatter yet, rather than
// crashing on an unrecognized code.
const CURRENCY_FORMATTERS = { USD: fmtMoney, THB: fmtTHB, INR: fmtINR, VND: fmtVND, EUR: fmtEUR, DKK: fmtDKK };
const currencySymbol = { USD: "$", THB: "฿", INR: "₹", VND: "₫", EUR: "€", DKK: "kr " };
const fmtByCurrency = (n, currency) => (CURRENCY_FORMATTERS[currency] || fmtMoney)(n);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Which services each client subscribes to. Drives sidebar badges + which
// detail tabs render. Default is SEO-only.
const SERVICES = {
  "IC Khao Yai": ["seo", "sem"],
  // "leads" — Nomad's Aug 2026 feedback ("Add a Leads Analysis tab"). Its
  // own top-level service tab rather than nested under sem/"Paid", since
  // the feedback item describes it as sitting next to the (still-pending,
  // chatbot-platform-unknown) Chatbot Summary tab, not inside Performance
  // Marketing. Nomad-only — see lib/leads.js for why this can't safely
  // generalize to other clients yet.
  "Nomad Greenland": ["seo", "sem", "leads"],
  "Azerai Ke Ga Bay": ["sem"],
  "Azerai La Residence, Hue": ["sem"],
  "Sora Sukhumvit": ["seo", "sem"],
  "Six Senses Fort Barwara": ["sem"],
  "Song Saa Private Island": ["sem"],
  "Six Senses Shaharut": ["sem"],
  "Le Cercle": ["sem"],
};
const SVC_LABEL = { seo: "SEO", sem: "Paid", leads: "Leads Analysis" };
const servicesOf = (name) => SERVICES[name] || ["seo"];
const hasService = (name, svc) => servicesOf(name).includes(svc);
const r1 = (x) => Math.round(x * 10) / 10; // one decimal, for position / CTR points

/* ------------------------------------------------------------------ */
/*  GSC monthly model                                                  */
/*  The latest month returns each client's stored "current" figures;   */
/*  earlier months are back-cast from the real clicks shape so every    */
/*  month is a distinct, consistent snapshot. Clicks come straight from */
/*  the series; impressions, CTR and average position are derived the   */
/*  way GSC reports them. With live data these become real GSC figures. */
/* ------------------------------------------------------------------ */
const series = (c) => c.traffic.slice(-MONTHS.length); // GSC clicks, Mar–Jun
const LAST = MONTHS.length - 1; // index of the current month

// Organic CTR as a function of average position (pos 1 ≈ high, falls off fast).
const ctrFor = (pos) => clampN(0.34 / Math.pow(pos, 0.7), 0.004, 0.5);

function gsc(c, m) {
  const s = series(c);
  const r = s[m] / s[LAST]; // share of current clicks (real shape)
  const back = LAST - m;
  const rising = s[LAST] >= s[0];
  const clicks = s[m];
  const avgPos = c.keywords.reduce((a, kw) => a + kwPos(kw, m), 0) / c.keywords.length;
  // Anchor impressions to the current month's position-based CTR, then let them
  // track visibility (clicks) gently — so impressions and CTR both move the right
  // way instead of CTR inverting impressions.
  const avgPosLast = c.keywords.reduce((a, kw) => a + kw.p, 0) / c.keywords.length;
  const imprLast = s[LAST] / ctrFor(avgPosLast);
  const impressions = Math.round(imprLast * Math.pow(r, 0.6));
  const ctr = clicks / impressions;
  const sizeBase = Math.round(s[LAST] / 8) + 40; // proxy for indexed page count
  const indexed = Math.max(20, Math.round(sizeBase * (rising ? 1 - 0.02 * back : 1 + 0.015 * back)));
  const issueRate = c.status === "risk" ? 0.09 : c.status === "watch" ? 0.05 : 0.02;
  const issues = Math.max(0, Math.round(indexed * issueRate));
  return {
    clicks,
    impressions,
    ctr,
    avgPos,
    indexed,
    issues,
    buckets: {
      t3: Math.round(c.buckets.t3 * r),
      t10: Math.round(c.buckets.t10 * r),
      t20: Math.round(c.buckets.t20 * r),
      t100: Math.round(c.buckets.t100 * r),
      new: Math.max(0, Math.round(c.buckets.new * r)),
      lost: Math.max(0, Math.round(c.buckets.lost * (2 - r))),
    },
  };
}

// Month-over-month clicks % for a given month index (0 for the first month).
const momPct = (c, m) => {
  const s = series(c);
  return m <= 0 ? 0 : ((s[m] - s[m - 1]) / s[m - 1]) * 100;
};

// Per-query GSC clicks: query demand (kw.v) filtered through CTR at its position.
const kwClicks = (kw, pos) => Math.round(kw.v * ctrFor(pos));

// Rough query-intent classifier. Informational queries want an article; the
// rest are commercial and want an optimised hotel/category page. A first pass —
// editorially overridable, exactly the kind of judgement a human refines.
const INFO_HINTS = [
  "things to do", "guide", "tips", "itinerary", "getaway", "honeymoon", "romantic",
  "family", "adventure", "vineyard", "wine", "northern lights", "staycation",
  "history", "what to", "how to", "tours",
  // Thai informational cues — places to visit, travel, reviews, how-to.
  "ที่เที่ยว", "เที่ยว", "รีวิว", "วิธี", "การเดินทาง",
];
const intentOf = (k) => (INFO_HINTS.some((h) => k.toLowerCase().includes(h)) ? "blog" : "optimise");
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Queries with real impressions that are NOT content opportunities: weather
// lookups and map/navigation intent. Substring match, EN + TH, editorially
// editable. Filtered out of the opportunity finder (kept in tracked keywords).
const NOISE_HINTS = [
  "weather", "forecast", "temperature", "humidity", "rain",
  "สภาพอากาศ", "อากาศ", "พยากรณ์", "อุณหภูมิ", "ฝนตก", // weather / forecast / temp / rain
  "map", "directions", "แผนที่", "เส้นทาง",             // maps & directions = navigational
];
const isNoiseQuery = (k) => {
  const s = k.toLowerCase();
  return NOISE_HINTS.some((h) => s.includes(h));
};

// A readable English keyword: Latin script only (drops Thai / other scripts),
// with at least two real words. Filters the non-English and single-token
// fragments that GSC's raw query export surfaces, so the tracked-keyword table
// shows only legible, relevant terms.
const isReadableQuery = (q) => {
  if (!q) return false;
  if (/[^\u0000-\u024f]/.test(q)) return false;      // non-Latin script (Thai, CJK, …)
  return /[a-z]+\s+[a-z]/i.test(q.trim());            // at least two words of letters
};

// Branded/navigational queries: the searcher already knows the property, so these
// aren't content opportunities to chase. Per-client and editable.
const BRAND_TERMS = {
  "Shinta Mani Wild": ["shinta mani", "shintamani", "bensley"],
  "Nomad Greenland":  ["nomad greenland", "nomadgreenland"],
  "Sora Sukhumvit":   ["sora sukhumvit", "sora hotel", "sorahotels"],
  "IC Khao Yai":      ["intercontinental khao yai", "ic khao yai", "intercontinental"],
};
const isBrandQuery = (clientName, k) => {
  const s = k.toLowerCase();
  return (BRAND_TERMS[clientName] || []).some((b) => s.includes(b));
};

// Build the page/post URL for a query. In production this is GSC's ranking_url
// (the page actually surfacing); here it's derived from the domain + a slug —
// existing page for "optimise", a proposed /blog/ path for "blog".
const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const pageUrl = (domain, query, intent) => {
  const base = `https://${domain.replace(/\/+$/, "")}`;
  const slug = slugify(query);
  if (!slug) return base;
  return intent === "blog" ? `${base}/blog/${slug}` : `${base}/${slug}`;
};
const shortUrl = (u) => u.replace(/^https?:\/\//, "");

// Back-cast a tracked keyword's position to month m (kw.d>0 means it improved).
const kwPos = (kw, m) => Math.max(1, kw.p + kw.d * (LAST - m));

// Each task is scheduled into a window: work begins at `start`, is delivered
// at `deliver`. This turns one backlog into a distinct plan per month — each
// month shows the work active or delivered then. In production, each month's
// scope would be its own record; here it's derived so every month is concrete.
function taskWindow(task) {
  if (task.status === "done") {
    const deliver =
      task.priority === "high" ? Math.max(0, LAST - 2) : task.priority === "med" ? Math.max(0, LAST - 1) : LAST;
    return { start: Math.max(0, deliver - 1), deliver };
  }
  if (task.status === "doing") return { start: Math.max(0, LAST - 1), deliver: LAST + 1 }; // in flight
  return { start: LAST, deliver: LAST + 2 }; // queued, enters at the current month
}

// Build the plan for one month: work in flight + delivered that month,
// plus counts of what's delivered to date and still queued.
function monthlyPlan(plan, m) {
  const active = [];
  let deliveredToDate = 0;
  let upcoming = 0;
  plan.forEach((task) => {
    const w = taskWindow(task);
    if (w.deliver <= m) deliveredToDate += 1;
    if (w.start > m) {
      upcoming += 1;
      return;
    }
    if (w.start <= m && m <= w.deliver) {
      active.push({ task, status: m >= w.deliver ? "done" : "doing" });
    }
  });
  active.sort((x, y) => {
    const d = (x.status === "done" ? 1 : 0) - (y.status === "done" ? 1 : 0);
    if (d !== 0) return d; // in-progress first, delivered after
    return PRIORITY[x.task.priority].rank - PRIORITY[y.task.priority].rank;
  });
  return { active, deliveredToDate, upcoming };
}

/* Delta chip — direction-coloured, used for every progress figure */
function Delta({ value, suffix = "", invert = false, size = "sm" }) {
  const up = value > 0;
  const flat = value === 0;
  // invert=true means "down is good" (e.g. ranking position, errors)
  const good = flat ? null : invert ? !up : up;
  const color = flat ? C.faint : good ? C.healthy : C.risk;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const px = size === "lg" ? 14 : 12;
  return (
    <span
      style={{ color, fontSize: size === "lg" ? 13 : 12, fontVariantNumeric: "tabular-nums" }}
      className="inline-flex items-center gap-0.5 font-medium"
    >
      <Icon size={px} strokeWidth={2.25} />
      {flat ? "—" : `${Math.abs(value)}${suffix}`}
    </span>
  );
}

/* Hand-rolled SVG sparkline — lighter than 11 recharts instances */
function Sparkline({ series, w = 96, h = 28 }) {
  const data = series.length > 1 ? series : [series[0] ?? 0, series[0] ?? 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const rising = data[data.length - 1] >= data[0];
  const stroke = rising ? C.healthy : C.risk;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.2} fill={stroke} />
    </svg>
  );
}

function StatusDot({ status, size = 8 }) {
  return (
    <span
      style={{ background: STATUS[status].color, width: size, height: size }}
      className="inline-block rounded-full shrink-0"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Portfolio view                                                     */
/* ------------------------------------------------------------------ */
function Portfolio({ clients, onSelect, month, gscData }) {
  // Returns real GSC figures for the given client+month when connected,
  // falls back to the mock gsc() for unconnected properties.
  const liveCur = (c, m) => {
    const moNum = MO_NUM[MONTHS[m]];
    const live = gscData?.[c.name]?.[moNum];
    if (!live) return gsc(c, m);
    return { ...gsc(c, m), clicks: live.clicks, impressions: live.impressions, ctr: live.ctr, avgPos: live.avgPos };
  };
  const livePrev = (c, m) => m > 0 ? liveCur(c, m - 1) : null;

  // Live sparkline series — real clicks per month when available, mock otherwise
  const liveSeries = (c) => {
    if (!gscData?.[c.name]) return series(c);
    return MONTHS.map(mo => gscData[c.name][MO_NUM[mo]]?.clicks ?? 0);
  };

  // MoM % using live figures
  const liveMoM = (c, m) => {
    const cur = liveCur(c, m);
    const prev = livePrev(c, m);
    if (!prev || prev.clicks === 0) return 0;
    return Math.round(((cur.clicks - prev.clicks) / prev.clicks) * 100);
  };

  const sorted = useMemo(
    () =>
      [...clients].sort((a, b) => {
        const r = STATUS[a.status].rank - STATUS[b.status].rank;
        if (r !== 0) return r;
        return liveMoM(a, month) - liveMoM(b, month);
      }),
    [clients, month, gscData]
  );

  const risk = sorted.filter((c) => c.status === "risk");
  const watch = sorted.filter((c) => c.status === "watch");

  return (
    <div>
      {/* Attention strip — the triage signature */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 mb-5 rounded-lg"
        style={{ background: C.surface, border: `1px solid ${C.line}` }}
      >
        <span style={{ color: C.muted, fontSize: 13 }} className="font-medium">
          Needs attention
        </span>
        <span style={{ color: C.faint }}>·</span>
        <span style={{ color: C.risk, fontSize: 13 }} className="font-semibold">
          {risk.length} at risk
        </span>
        <span style={{ color: C.faint }}>·</span>
        <span style={{ color: C.watch, fontSize: 13 }} className="font-semibold">
          {watch.length} to watch
        </span>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {[...risk, ...watch].map((c) => (
            <button
              key={c.name}
              onClick={() => onSelect(c)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
              style={{ border: `1px solid ${C.line}`, background: "#fff", fontSize: 12.5, color: C.ink }}
            >
              <StatusDot status={c.status} size={7} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Column header */}
      <div
        className="hidden md:grid items-center px-4 pb-2"
        style={{
          gridTemplateColumns: "1.6fr 1.1fr 0.9fr 0.7fr 0.7fr",
          color: C.faint,
          fontSize: 11.5,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span>Property</span>
        <span>Clicks · MoM</span>
        <span>Impressions</span>
        <span>Avg position</span>
        <span className="text-right">CTR</span>
      </div>

      {/* Rows */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        {sorted.map((c, i) => {
          const cur = liveCur(c, month);
          const prev = livePrev(c, month);
          return (
            <button
              key={c.name}
              onClick={() => onSelect(c)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-[1.6fr_1.1fr_0.9fr_0.7fr_0.7fr] items-center gap-y-2 px-4 py-3.5 transition-colors hover:bg-black/[0.015]"
              style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}
            >
              {/* Property */}
              <div className="flex items-center gap-3 min-w-0">
                <span
                  style={{ background: STATUS[c.status].color, width: 4, height: 30 }}
                  className="rounded-full shrink-0"
                />
                <div className="min-w-0">
                  <div
                    style={{ fontFamily: "Spectral, Georgia, serif", color: C.ink, fontSize: 16 }}
                    className="truncate leading-tight"
                  >
                    {c.name}
                  </div>
                  <div style={{ color: C.faint, fontSize: 12 }} className="truncate">
                    {c.market}
                  </div>
                </div>
              </div>

              {/* Clicks + sparkline (through selected month) */}
              <div className="flex items-center gap-3">
                <Sparkline series={liveSeries(c).slice(0, month + 1)} />
                <div>
                  <div style={{ color: C.ink, fontSize: 15, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                    {fmt(cur.clicks)}
                  </div>
                  <Delta value={liveMoM(c, month)} suffix="%" />
                </div>
              </div>

              {/* Impressions */}
              <div className="flex items-baseline gap-2">
                <span style={{ color: C.ink, fontSize: 15, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {fmt(cur.impressions)}
                </span>
                <Delta value={prev ? Math.round(((cur.impressions - prev.impressions) / prev.impressions) * 100) : 0} suffix="%" />
              </div>

              {/* Avg position (lower is better) */}
              <div className="flex items-baseline gap-2">
                <span style={{ color: C.ink, fontSize: 15, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {r1(cur.avgPos)}
                </span>
                <Delta value={prev ? r1(cur.avgPos - prev.avgPos) : 0} invert />
              </div>

              {/* CTR */}
              <div className="flex items-center md:justify-end gap-2">
                <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {(cur.ctr * 100).toFixed(1)}%
                </span>
                <Delta value={prev ? r1((cur.ctr - prev.ctr) * 100) : 0} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail view                                                        */
/* ------------------------------------------------------------------ */
// ─── 12-month blog plan ──────────────────────────────────────────────────────
// Short destination labels for templating titles/keywords.
const PLACE = {
  "Shinta Mani Wild": { label: "the Cardamoms", kw: "cardamom mountains" },
  "Nomad Greenland": { label: "Greenland", kw: "greenland" },
  "Sora Sukhumvit": { label: "Bangkok", kw: "bangkok" },
  "IC Khao Yai": { label: "Khao Yai", kw: "khao yai" },
  Azerai: { label: "Hue", kw: "hue vietnam" },
};

// 12 forward months (the plan window). Current month in the dashboard is Jun 2026.
const PLAN_MONTHS = [
  ["Jul", 2026], ["Aug", 2026], ["Sep", 2026], ["Oct", 2026], ["Nov", 2026], ["Dec", 2026],
  ["Jan", 2027], ["Feb", 2027], ["Mar", 2027], ["Apr", 2027], ["May", 2027], ["Jun", 2027],
];

// 24 content angles (2 per month). Auto-generated candidates — the part worth
// automating; a human swaps in seasonal campaigns and refines wording.
const ANGLES = [
  { kw: "best time to visit", title: (p) => `The Best Time to Visit ${p}: A Season-by-Season Guide`, meta: (p) => `When to visit ${p} for the best weather, fewer crowds, and the experiences worth planning around.` },
  { kw: "things to do in", title: (p) => `Unforgettable Things to Do in ${p}`, meta: (p) => `From signature experiences to quiet local moments, what's worth doing in ${p} on a luxury stay.` },
  { kw: "travel guide", title: (p) => `The Complete ${p} Travel Guide`, meta: (p) => `Everything you need to plan a trip to ${p}: when to go, how to get there, and where to stay.` },
  { kw: "how to get to", title: (p) => `How to Get to ${p}: Routes, Transfers & Tips`, meta: (p) => `The simplest routes, transfers, and travel tips for reaching ${p} without the guesswork.` },
  { kw: "what to pack for", title: (p) => `What to Pack for ${p}`, meta: (p) => `A practical, season-by-season packing guide for ${p} so you arrive ready for anything.` },
  { kw: "romantic getaway", title: (p) => `A Romantic Getaway in ${p}`, meta: (p) => `How to plan a romantic escape in ${p}: the suites, the settings, and the moments that matter.` },
  { kw: "honeymoon in", title: (p) => `Why ${p} Belongs on Your Honeymoon Shortlist`, meta: (p) => `The case for a ${p} honeymoon — privacy, scenery, and experiences designed for two.` },
  { kw: "family holiday in", title: (p) => `The Family Holiday Guide to ${p}`, meta: (p) => `How to plan a family trip to ${p} that works for every age, from toddlers to grandparents.` },
  { kw: "luxury experiences in", title: (p) => `Signature Luxury Experiences in ${p}`, meta: (p) => `The standout luxury experiences in ${p} worth building an entire trip around.` },
  { kw: "where to eat in", title: (p) => `A Taste of ${p}: Where to Eat`, meta: (p) => `The flavours of ${p} and where to find them, from fine dining to local discoveries.` },
  { kw: "wellness retreat", title: (p) => `Finding Stillness: A Wellness Escape in ${p}`, meta: (p) => `What a restorative wellness escape in ${p} looks like, and how to plan one.` },
  { kw: "hidden gems", title: (p) => `${p}'s Hidden Gems, Beyond the Guidebook`, meta: (p) => `The lesser-known corners of ${p} worth seeking out on a slower, more curious trip.` },
  { kw: "weekend in", title: (p) => `The Perfect Weekend in ${p}`, meta: (p) => `A two-night blueprint for ${p}: what to see, where to slow down, and how to make it count.` },
  { kw: "itinerary for", title: (p) => `A Curated Itinerary for ${p}`, meta: (p) => `A day-by-day itinerary for ${p}, balancing must-sees with room to simply be.` },
  { kw: "photography spots in", title: (p) => `The Most Photogenic Spots in ${p}`, meta: (p) => `Where to find the most striking views in ${p}, and the best light to catch them.` },
  { kw: "culture of", title: (p) => `Understanding the Culture of ${p}`, meta: (p) => `A respectful traveller's introduction to the traditions and rhythms of ${p}.` },
  { kw: "adventure activities in", title: (p) => `Adventure in ${p}: Beyond the Resort`, meta: (p) => `The adventures worth leaving the resort for in ${p}, from gentle to genuinely wild.` },
  { kw: "sustainable travel in", title: (p) => `Travelling ${p} Responsibly`, meta: (p) => `How to experience ${p} in a way that gives back to the place and the people who call it home.` },
  { kw: "first time visiting", title: (p) => `First Time in ${p}? Start Here`, meta: (p) => `The essential first-timer's guide to ${p}: what to know before you go.` },
  { kw: "where to stay in", title: (p) => `Where to Stay in ${p}`, meta: (p) => `How to choose where to stay in ${p}, and what sets a truly memorable stay apart.` },
  { kw: "day trips from", title: (p) => `The Best Day Trips from ${p}`, meta: (p) => `The most rewarding day trips within easy reach of ${p}.` },
  { kw: "nature and wildlife in", title: (p) => `Nature & Wildlife in ${p}`, meta: (p) => `What to look for in the landscapes and wildlife of ${p}, and when to see it.` },
  { kw: "seasonal events in", title: (p) => `${p} Through the Seasons: Events Worth Planning Around`, meta: (p) => `The festivals and seasonal moments that make ${p} worth timing a trip around.` },
  { kw: "slow travel in", title: (p) => `The Art of Slowing Down in ${p}`, meta: (p) => `A case for the unhurried trip — how to slow down and settle into ${p}.` },
];

const cleanHost = (d) => d.replace(/\/+$/, "");

// CSV parsing for plan import (RFC4180-ish: quoted fields, escaped quotes, newlines in quotes).
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ""); // strip BOM (Excel adds one)
  const rows = [];
  let i = 0, field = "", row = [], q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); field = ""; row = []; }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c && c.trim() !== ""));
}

// Header→value object into the table's row shape. Status is inferred from which
// link cells are filled: Published > Draft > Brief > Planned.
function normalizeRow(o) {
  const g = (k) => (o[k] || "").trim();
  const brief = g("Brief"), draft = g("Draft"), pub = g("Published");
  return {
    client: g("Client"),
    monthLabel: g("Month"),
    keyword: g("Keyword"),
    title: g("Title"),
    meta: g("SEO meta"),
    briefUrl: brief || null,
    draftUrl: draft || null,
    pubUrl: pub || null,
    status: pub ? "published" : draft ? "draft" : brief ? "brief" : "planned",
  };
}

// Parse a whole sheet into normalized rows (keeps rows that have a keyword or title).
function importPlanCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .map((r) => { const o = {}; head.forEach((h, idx) => (o[h] = r[idx] ?? "")); return normalizeRow(o); })
    .filter((r) => r.keyword || r.title);
}

// Sample generator — the old preview, now reachable only via "Load sample".
function blogPlan(client) {
  const place = PLACE[client.name] || { label: client.name, kw: slugify(client.name).replace(/-/g, " ") };
  return Array.from({ length: 24 }, (_, i) => {
    const a = ANGLES[i % ANGLES.length];
    const [mo, yr] = PLAN_MONTHS[Math.floor(i / 2)];
    const keyword = `${a.kw} ${place.kw}`.trim();
    const slug = slugify(keyword);
    const status = i < 3 ? "published" : i < 5 ? "draft" : i < 8 ? "brief" : "planned";
    const host = cleanHost(client.domain);
    return {
      client: client.name,
      monthLabel: `${mo} ${yr}`,
      keyword,
      title: a.title(place.label),
      meta: a.meta(place.label),
      status,
      briefUrl: status !== "planned" ? `https://${host}/_briefs/${slug}` : null,
      draftUrl: status === "draft" || status === "published" ? `https://${host}/_drafts/${slug}` : null,
      pubUrl: status === "published" ? `https://${host}/blog/${slug}` : null,
    };
  });
}

function exportPlanCsv(client, rows) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["Client", "Month", "Keyword", "Title", "SEO meta", "Brief", "Draft", "Published"];
  const lines = [head.map(esc).join(",")];
  rows.forEach((r) =>
    lines.push([r.client || client.name, r.monthLabel, r.keyword, r.title, r.meta, r.briefUrl || "", r.draftUrl || "", r.pubUrl || ""].map(esc).join(","))
  );
  try {
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(client.name)}-blog-plan.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    /* downloads can be blocked in a sandboxed preview */
  }
}

// Export discovered keyword ideas as CSV in the blog-plan column format, so the
// team can drop chosen rows straight into their plan sheet.
function exportIdeasCsv(client, ideas) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["Client", "Month", "Keyword", "Title", "SEO meta", "Brief", "Draft", "Published"];
  const lines = [head.map(esc).join(",")];
  ideas.forEach((o) => lines.push([client.name, "", o.keyword, o.title, "", "", "", ""].map(esc).join(",")));
  try {
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(client.name)}-keyword-ideas.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    /* downloads can be blocked in a sandboxed preview */
  }
}

// Build a 12-month plan that leads with the data-backed keyword ideas (each
// becomes a planned post with its formulated title), then fills the remaining
// slots with editorial angles — skipping any whose keyword an idea already
// covers. Scheduled 2 posts/month across the plan window.
function buildPlanFromIdeas(client, ideas) {
  // Plan is built ONLY from the data-backed SEMrush keyword ideas — each idea
  // becomes a planned post with its formulated title. No invented/editorial
  // padding, so every row traces back to a real SEMrush keyword. A client with
  // N ideas gets an N-row plan (capped at 24), scheduled 2 posts/month.
  const rows = (ideas || [])
    .slice(0, PLAN_MONTHS.length * 2)
    .map((o) => ({
      client: client.name, keyword: o.keyword, title: o.title, meta: "",
      status: "planned", briefUrl: null, draftUrl: null, pubUrl: null,
    }));
  rows.forEach((r, i) => {
    const [mo, yr] = PLAN_MONTHS[Math.floor(i / 2)] || PLAN_MONTHS[PLAN_MONTHS.length - 1];
    r.monthLabel = `${mo} ${yr}`;
  });
  return rows;
}

// Keyword-opportunities panel: SEMrush content ideas (volume-ranked) with a
// formulated title, plus a CSV export into the blog plan.
function KeywordIdeas({ client, ideas }) {
  if (!ideas || !ideas.length) return null;
  return (
    <div className="rounded-lg mb-6 overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Keyword ideas</h3>
          <div style={{ color: C.faint, fontSize: 12 }} className="mt-0.5">
            New topics to target · global search volume · difficulty (TH)
          </div>
        </div>
        <button
          onClick={() => exportIdeasCsv(client, ideas)}
          className="rounded-lg px-3.5 py-2 font-medium transition-opacity hover:opacity-90"
          style={{ background: C.accent, color: "#fff", fontSize: 13 }}
        >
          Add to plan (CSV)
        </button>
      </div>
      {ideas.map((o, i) => {
        // SEMrush KD bands: <30 easy (green), 30–59 moderate, 60+ hard (red).
        const kdColor = o.kd == null ? C.faint : o.kd >= 60 ? C.risk : o.kd >= 30 ? C.watch : C.healthy;
        return (
        <div
          key={o.keyword}
          className="flex items-center justify-between gap-4 px-5 py-3"
          style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}
        >
          <div className="min-w-0">
            <div style={{ color: C.ink, fontFamily: "Spectral, Georgia, serif", fontSize: 16 }} className="leading-snug truncate">
              {o.title}
            </div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span style={{ color: C.muted, fontSize: 12 }} className="truncate">Targets “{o.keyword}”</span>
              {o.kd != null && (
                <span
                  className="rounded-full px-1.5 py-0.5"
                  style={{ background: `${kdColor}1a`, color: kdColor, fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}
                  title="SEMrush keyword difficulty (Thailand) — 0 easy, 100 hard"
                >
                  KD {o.kd}
                </span>
              )}
            </div>
          </div>
          <div className="text-right" style={{ flexShrink: 0 }}>
            <div style={{ color: C.accent, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {fmt(o.volume)}
            </div>
            <div style={{ color: C.faint, fontSize: 10.5, letterSpacing: "0.04em" }} className="uppercase">searches/mo · global</div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function BlogPlan({ client, imported, onImport, keywordIdeas = [], planKeywords = {} }) {
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const cols = "92px 1.3fr 1.7fr 2.2fr 92px 92px 92px";

  const ingest = (text) => {
    const rows = importPlanCsv(text);
    if (!rows.length) { setErr("No rows found — make sure the header row is included."); return; }
    setErr("");
    onImport(rows);
  };
  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result));
    reader.readAsText(f);
    e.target.value = "";
  };

  const btn = { fontSize: 13, fontWeight: 500 };
  const accentBtn = { ...btn, background: C.accent, color: "#fff" };
  const ghostBtn = { ...btn, background: "#fff", color: C.ink, border: `1px solid ${C.line}` };

  // ── Import panel (nothing loaded yet) ───────────────────────────────────────
  if (!imported) {
    return (
      <div>
        <KeywordIdeas client={client} ideas={keywordIdeas} />
        <h3 style={{ fontFamily: "Spectral, Georgia, serif", color: C.ink, fontSize: 22 }} className="leading-none mb-1.5">
          12-month blog plan
        </h3>
        <p style={{ color: C.muted, fontSize: 12.5 }} className="mb-4 leading-relaxed">
          Import your plan sheet to populate this table. Columns: Client, Month, Keyword, Title, SEO meta, Brief, Draft, Published. Status is read from the links — a Published URL is Live, a Draft link is Drafting, a Brief link is Briefed, none is Planned. Rows route to each property by the Client column.
        </p>
        <div className="rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current && fileRef.current.click()} className="rounded-lg px-3.5 py-2 transition-opacity hover:opacity-90" style={accentBtn}>
              Upload CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
            <button onClick={() => onImport(CLIENTS.flatMap((c) => blogPlan(c)))} className="rounded-lg px-3.5 py-2 transition-opacity hover:opacity-90" style={ghostBtn}>
              Load sample
            </button>
            {keywordIdeas.length > 0 && (
              <button onClick={() => onImport(buildPlanFromIdeas(client, keywordIdeas))} className="rounded-lg px-3.5 py-2 transition-opacity hover:opacity-90" style={accentBtn}>
                Build plan from ideas
              </button>
            )}
          </div>
          <div style={{ color: C.faint, fontSize: 12 }} className="mt-4 mb-1.5">…or paste the sheet contents</div>
          <textarea
            className="lf"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Client,Month,Keyword,Title,SEO meta,Brief,Draft,Published&#10;…"
            style={{ width: "100%", minHeight: 110, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: C.ink, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", resize: "vertical" }}
          />
          <div className="flex items-center gap-3 mt-2.5">
            <button
              onClick={() => ingest(paste)}
              disabled={!paste.trim()}
              className="rounded-lg px-3.5 py-2 transition-opacity hover:opacity-90"
              style={{ ...accentBtn, opacity: paste.trim() ? 1 : 0.45, cursor: paste.trim() ? "pointer" : "default" }}
            >
              Import pasted CSV
            </button>
            {err && <span style={{ color: C.risk, fontSize: 12.5 }}>{err}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Loaded ──────────────────────────────────────────────────────────────────
  const rows = imported.filter((r) => r.client === client.name);
  const live = rows.filter((r) => r.status === "published").length;
  const drafting = rows.filter((r) => r.status === "draft").length;
  const briefed = rows.filter((r) => r.status === "brief").length;

  const Cell = ({ href, label, color }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color, fontSize: 12.5, fontWeight: 500 }}>
        <ExternalLink size={11} style={{ flexShrink: 0 }} /> {label}
      </a>
    ) : (
      <span style={{ color: C.faint, fontSize: 13 }}>—</span>
    );

  return (
    <div>
      <KeywordIdeas client={client} ideas={keywordIdeas} />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h3 style={{ fontFamily: "Spectral, Georgia, serif", color: C.ink, fontSize: 22 }} className="leading-none">
            12-month blog plan
          </h3>
          <div style={{ color: C.faint, fontSize: 13 }} className="mt-1.5">
            {rows.length} {rows.length === 1 ? "post" : "posts"} · {live} live, {drafting} drafting, {briefed} briefed · imported
          </div>
        </div>
        <div className="flex items-center gap-2">
          {keywordIdeas.length > 0 && (
            <button onClick={() => onImport(buildPlanFromIdeas(client, keywordIdeas))} className="rounded-lg px-3.5 py-2 font-medium transition-opacity hover:opacity-90" style={{ background: "#fff", color: C.accent, border: `1px solid ${C.line}`, fontSize: 13 }}>
              Build from ideas
            </button>
          )}
          <button onClick={() => onImport(null)} className="rounded-lg px-3.5 py-2 font-medium transition-opacity hover:opacity-90" style={{ background: "#fff", color: C.muted, border: `1px solid ${C.line}`, fontSize: 13 }}>
            Replace sheet
          </button>
          {rows.length > 0 && (
            <button onClick={() => exportPlanCsv(client, rows)} className="rounded-lg px-3.5 py-2 font-medium transition-opacity hover:opacity-90" style={{ background: C.accent, color: "#fff", fontSize: 13 }}>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
          No rows for <span style={{ color: C.ink }} className="font-medium">{client.name}</span> in the imported sheet. Check the Client column matches the property name exactly.
        </div>
      ) : (
        <div className="rounded-lg overflow-x-auto" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div style={{ minWidth: 980 }}>
            <div className="grid px-4 py-2.5" style={{ gridTemplateColumns: cols, gap: 12, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
              <span className="uppercase">Month</span>
              <span className="uppercase">Keyword</span>
              <span className="uppercase">Title</span>
              <span className="uppercase">SEO meta</span>
              <span className="uppercase">Brief</span>
              <span className="uppercase">Draft</span>
              <span className="uppercase">Published</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid px-4 py-3" style={{ gridTemplateColumns: cols, gap: 12, borderTop: i ? `1px solid ${C.line}` : "none", alignItems: "start" }}>
                <span style={{ color: C.muted, fontSize: 12.5 }} className="font-medium">{r.monthLabel}</span>
                <div className="min-w-0">
                  <div style={{ color: C.ink, fontSize: 13 }}>{r.keyword}</div>
                  {(() => {
                    const m = planKeywords[(r.keyword || "").toLowerCase()];
                    if (!m || (m.volume == null && m.kd == null)) return null;
                    const kdColor = m.kd == null ? C.faint : m.kd >= 60 ? C.risk : m.kd >= 30 ? C.watch : C.healthy;
                    return (
                      <div className="mt-0.5 flex items-center gap-1.5" style={{ fontSize: 11 }}>
                        {m.volume != null && (
                          <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }} title="Approx. global search volume">
                            {fmt(m.volume)}/mo
                          </span>
                        )}
                        {m.kd != null && (
                          <span style={{ color: kdColor, fontWeight: 600 }} title="Keyword difficulty (TH)">KD {m.kd}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <span style={{ color: C.ink, fontSize: 13 }} className="leading-snug">{r.title}</span>
                <span style={{ color: C.muted, fontSize: 12.5 }} className="leading-snug">{r.meta}</span>
                <Cell href={r.briefUrl} label="Brief" color={C.accent} />
                <Cell href={r.draftUrl} label="Draft" color={C.watch} />
                <Cell href={r.pubUrl} label="Live" color={C.healthy} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SEM (paid search/social) — shared helpers, then the Summary,        */
/*  Meta, and Google sub-tabs (Google Ads + Meta via Windsor)           */
/* ------------------------------------------------------------------ */
const MO_NUM_MAP = MO_NUM; // alias — see the canonical MO_NUM near MONTHS above

// Parse a market code from a campaign name. Handles both Google ("[Advant]
// HK_High intent…") and Meta ("US_Conv_Clickbook_JUN", "SG+HK+TW_Conv…").
const campaignMarket = (name) => {
  const cleaned = (name || "")
    .replace(/^\[Advant\]\s*/, "")
    // Azerai campaigns are named "AZKGB_VN_..." / "AZLRH / EN / ..." — strip
    // the property-code prefix so the market code below it is what's matched.
    .replace(/^AZ(?:KGB|LRH)[\s_/]+/, "")
    .trim();
  const m = /^([A-Z]{2}(?:\+[A-Z]{2})*)/.exec(cleaned);
  return m ? m[1] : "Other";
};

// Horizontal bar breakdown (like the reference "Traffic by Website").
function BarBreakdown({ title, rows, fmtVal }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {rows.length === 0 ? (
          <span style={{ color: C.muted, fontSize: 13 }}>No data this month.</span>
        ) : rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span style={{ color: C.muted, fontSize: 12.5, width: 92 }} className="shrink-0 truncate">{r.label}</span>
            <div className="flex-1 rounded-full" style={{ background: C.bg, height: 8 }}>
              <div className="rounded-full" style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, height: 8, background: C.accent }} />
            </div>
            <span style={{ color: C.ink, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }} className="shrink-0 text-right" >{fmtVal(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Day-level date helpers for the SEM tabs' date-range picker (Summary/Meta/
// Google, plus Sora's variants below). Everything else in this file still
// filters by month — only lib/sem.js (Google Ads + Meta, via Windsor) is
// fetched at daily granularity, so only these tabs slice by date range.
const addDays = (dateStr, delta) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const dateRange = (from, to) => {
  const out = [];
  if (!from || !to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const DAY_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDayShort = (dateStr) => { const [, m, d] = dateStr.split("-").map(Number); return `${DAY_MONTH_SHORT[m - 1]} ${d}`; };
const fmtDayLong  = (dateStr) => { const [y, m, d] = dateStr.split("-").map(Number); return `${DAY_MONTH_SHORT[m - 1]} ${d}, ${y}`; };
// Thins X-axis tick labels for a ~150-point daily series down to ~8 visible
// ticks — Recharts still plots every point, this only skips labels.
const dayTickInterval = (n) => Math.max(0, Math.ceil(n / 8) - 1);

// Number of days in an inclusive [from, to] range.
const rangeLen = (from, to) => dateRange(from, to).length;
// The immediately-preceding period of equal length, for the SEM range
// picker's delta comparisons (e.g. selecting Jul 8–14 compares against Jul
// 1–7) — same "prior period" convention as Search Console's date picker.
const prevWindow = (from, to) => {
  const len = rangeLen(from, to);
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(len - 1)), to: prevTo };
};

// Sums numeric fields across a list of per-day snapshot objects (any of
// dayCombined's / soraDayCombined's / the raw sem.daily[d].meta|google
// shapes — they're all flat { field: number } objects). Booleans (e.g.
// spendPending) OR together rather than summing; the first non-numeric,
// non-boolean value seen for a key (e.g. currency) wins. Missing/undefined
// inputs are skipped. Used to turn any single-day picker into a range picker
// without a bespoke aggregator per tab.
function sumDays(dayObjects) {
  const out = {};
  for (const obj of dayObjects) {
    if (!obj) continue;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
      else if (typeof v === "boolean") out[k] = !!out[k] || v;
      else if (out[k] === undefined) out[k] = v;
    }
  }
  return out;
}
// Applies `picker(sem, date)` to every day in [from, to] and sums the
// results via sumDays. Returns null if the range is empty or every day came
// back empty (so callers can fall back to their existing "no data" state).
function aggregateRange(sem, from, to, picker) {
  if (!from || !to) return null;
  const objs = dateRange(from, to).map((d) => picker(sem, d)).filter(Boolean);
  return objs.length ? sumDays(objs) : null;
}
// Merges a client's campaigns across every day in [from, to] for one
// platform, keyed by campaign name — spend/clicks/impressions/etc. summed
// per campaign, same null-means-pending-FX convention as a single day (any
// pending day in range marks the whole range's spend pending, rather than
// silently under-summing).
function campaignsInRange(sem, from, to, platform) {
  const agg = {};
  for (const d of dateRange(from, to)) {
    for (const c of (sem.campaigns?.[d] || [])) {
      if (c.platform !== platform) continue;
      const row = agg[c.name] ??= { name: c.name, platform, spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, clickBook: 0, reach: 0, messagingConversations: 0, spendPending: false, currency: c.currency };
      if (c.spend == null) row.spendPending = true;
      else row.spend += c.spend;
      row.clicks += c.clicks ?? 0;
      row.impressions += c.impressions ?? 0;
      row.conversions += c.conversions ?? 0;
      row.allConversions += c.allConversions ?? 0;
      row.clickBook += c.clickBook ?? 0;
      row.reach += c.reach ?? 0;
      row.messagingConversations += c.messagingConversations ?? 0;
    }
  }
  return Object.values(agg).map((c) => ({ ...c, spend: c.spendPending ? null : c.spend }));
}

// Six Senses Fort Barwara's Campaign Performance tab — Ad Spend by market
// (India vs. International), summed from sem.adsets[date] (see
// classifySsfbMarket in lib/sem.js for how each ad set is bucketed).
function marketSpendInRange(sem, from, to) {
  const totals = { india: 0, international: 0 };
  const pending = { india: false, international: false };
  for (const d of dateRange(from, to)) {
    for (const a of (sem.adsets?.[d] || [])) {
      if (a.spend == null) pending[a.market] = true;
      else totals[a.market] += a.spend;
    }
  }
  return {
    india: pending.india ? null : totals.india,
    international: pending.international ? null : totals.international,
  };
}

// Combined Google + Meta figures for one day, per the client-provided
// scorecard spec (formerly a Looker Studio dashboard):
//   Amount Spent = SUM(Amount Spent USD) + SUM(Cost)             → meta.spend + google.spend
//   Click Book   = SUM(All conversions) + SUM(Website Searches)  → google.allConversions + meta.clickBook
// Both sides confirmed against Windsor's field reference for IC Khao Yai:
// "All conversions" is Google Ads' all_conversions metric (broader than the
// plain `conversions` field), and "Website Searches" is the Meta Pixel
// "Search" event (same field backing the Meta tab's own Click Book KPI).
function dayCombined(sem, date) {
  const d = date && sem.daily?.[date];
  if (!d) return null;
  return {
    spend: d.spend ?? 0,
    // spendPending: for NATIVE_CURRENCY_CLIENTS/MIXED_CURRENCY_TARGET
    // clients unchanged; for every other client this is now true only when
    // Meta and Google genuinely bill in different currencies this day (see
    // lib/sem.js's reconciliation pass) — deterministic, not a live-FX
    // failure, so this label means "no combined total available" now, not
    // "waiting on a rate lookup."
    spendPending: !!d.spendPending,
    // The currency `spend` above is actually denominated in — "USD" by
    // default, the client's one shared currency for
    // NATIVE_CURRENCY_CLIENTS/MIXED_CURRENCY_TARGET, or (for every other
    // client) whichever single currency both platforms happen to share this
    // day, set by lib/sem.js's reconciliation pass. Meaningless while
    // spendPending is true.
    currency: d.currency,
    clicks: d.clicks ?? 0,
    impressions: d.impressions ?? 0,
    clickBook: (d.google?.allConversions ?? 0) + (d.meta?.clickBook ?? 0),
  };
}

// ------------------------------------------------------------------
// Sora Sukhumvit — a custom SEM report, distinct from the Click Book
// template above. Sora's is an e-commerce-shaped spec (Purchase, Add To
// Cart, Revenue, ROAS) billed and displayed in native THB rather than
// USD (see NATIVE_CURRENCY_CLIENTS in lib/sem.js). Per the client's
// scorecard doc:
//   Amount Spent = meta.spend + google.spend
//   Purchase     = google.purchase + meta.purchases
//   Add To Cart  = google.addToCart + meta.addToCart
//   Revenue      = meta.purchaseValue + google.purchaseValue
//   ROAS         = Revenue / Amount Spent
// Confirmed against Windsor's field reference for Sora Hotel Sukhumvit
// (Meta) / Sora Resort & Suites Sukhumvit (Google Ads).
//
// FIXED Aug 2026 (caught by the client — the doc's literal formula said
// "SUM(All conversions)" for Purchase, which the client meant as Google's
// one real "purchase" action, not Google's ENTIRE all_conversions bucket):
// google.allConversions/allConversionsValue sum EVERY conversion action
// configured on the account (confirmed live: view_item_list, add_to_cart,
// begin_checkout, AND purchase, all summed together) — Purchase/Add To
// Cart/Revenue previously used that same blanket bucket for both metrics
// (a real bug: Purchase showed ~202 instead of the real 1 for Aug 2026;
// Revenue was ~65x overcounted). Now isolated per-action via
// GOOGLE_CONVERSION_ACTION_MATCH in lib/sem.js — google.purchase/
// purchaseValue/addToCart/addToCartValue are each that ONE named action,
// not the whole bucket. (The old "same Google field for both — Google's
// tracking doesn't split the two" reasoning was itself the bug: Google's
// account DOES split them, into named actions, it's Windsor's
// all_conversions field that doesn't.)
// Shaded band marking the selected date range on a daily trend chart —
// replaces a single ReferenceDot now that the SEM picker selects a range
// rather than one day (a ReferenceArea can't render off a 1-day range's
// single x value, so this collapses to a thin sliver rather than a dot,
// which is fine — it still marks the spot).
function SelectionBand({ selectedRange, color }) {
  if (!selectedRange?.from || !selectedRange?.to) return null;
  return <ReferenceArea x1={fmtDayShort(selectedRange.from)} x2={fmtDayShort(selectedRange.to)} fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.3} />;
}

function soraDayCombined(sem, date) {
  const d = date && sem.daily?.[date];
  if (!d) return null;
  return {
    spend: d.spend ?? 0,
    currency: d.currency || "THB",
    clicks: d.clicks ?? 0,
    impressions: d.impressions ?? 0,
    purchase: (d.google?.purchase ?? 0) + (d.meta?.purchases ?? 0),
    addToCart: (d.google?.addToCart ?? 0) + (d.meta?.addToCart ?? 0),
    revenue: (d.meta?.purchaseValue ?? 0) + (d.google?.purchaseValue ?? 0),
    // Add To Cart Value — same combined-platform shape as Revenue above,
    // just the AddToCart pixel/conversion-action's $ value instead of
    // Purchase's. Both action_values_*/all_conversions_value fields were
    // already fetched for addToCart's count (see lib/sem.js) — just never
    // summed into a headline figure until now.
    addToCartValue: (d.meta?.addToCartValue ?? 0) + (d.google?.addToCartValue ?? 0),
    // Total Direct Revenue / Total Direct Purchases — the site's own GA4
    // ecommerce numbers (every channel, not just ad-attributed) — see
    // directRevenue/directPurchases in lib/sem.js. Confirmed against the
    // client's Looker dashboard, Aug 2026.
    directRevenue: d.directRevenue ?? 0,
    directPurchases: d.directPurchases ?? 0,
    // Item View — confirmed against the client's Looker dashboard (Aug
    // 2026) to be Google Ads' account-level all_conversions bucket, NOT an
    // isolated "view_item" action (Sora's Google Ads account has no such
    // action — only view_item_list, a different metric).
    itemView: d.google?.allConversions ?? 0,
    // Traffic — confirmed against the client's Looker dashboard (Aug 2026)
    // to be a deliberately blended, cross-platform figure: Meta's Landing
    // Page View pixel event + Google Ads' own click count (NOT the combined
    // Google+Meta `d.clicks` used elsewhere — Meta's raw clicks aren't part
    // of this figure at all, only its landing-page-view event is).
    traffic: (d.meta?.landingPageViews ?? 0) + (d.google?.clicks ?? 0),
  };
}

// Azerai (Ke Ga Bay + La Residence, Hue) — same Purchase/Add To Cart/
// Revenue shape as Sora above, per the client's spec doc, but Meta and
// Google bill in DIFFERENT native currencies (Meta VND, Google USD) rather
// than sharing one — see MIXED_CURRENCY_TARGET in lib/sem.js, which
// converts Google's leg to VND via live daily FX rates before it ever
// reaches `d.google`/`d.spend` here, so everything below is already VND.
// Unlike soraDayCombined, spendPending IS tracked — Sora's native-currency
// clients never have a failed-conversion case, but Azerai's cross-currency
// conversion genuinely can (a day with no FX rate available), and showing
// a real $0/₫0 in that case would be a silently wrong figure, not a "no
// spend that day" one.
//
// FIXED Aug 2026, same bug/fix as soraDayCombined above: Purchase/Add To
// Cart/Revenue now use google.purchase/purchaseValue/addToCart/
// addToCartValue (isolated to ONE named conversion action each — see
// GOOGLE_CONVERSION_ACTION_MATCH in lib/sem.js) instead of Google's
// blanket all_conversions/all_conversions_value bucket, which also sums
// in Begin Checkout, ClickAddRoomCheckout, hotline-call actions, etc.
// Azerai's account additionally has a second, likely-duplicate purchase-
// tracking action ("azerai - GA4 (web) purchase") alongside its native
// "Purchase" action — per the client (Aug 2026), only the native action
// is used, to avoid double-counting the same underlying purchases.
function azeraiDayCombined(sem, date) {
  const d = date && sem.daily?.[date];
  if (!d) return null;
  return {
    spend: d.spend ?? 0,
    spendPending: !!d.spendPending,
    clicks: d.clicks ?? 0,
    impressions: d.impressions ?? 0,
    purchase: (d.meta?.purchases ?? 0) + (d.google?.purchase ?? 0),
    addToCart: (d.meta?.addToCart ?? 0) + (d.google?.addToCart ?? 0),
    revenue: (d.meta?.purchaseValue ?? 0) + (d.google?.purchaseValue ?? 0),
  };
}

// Shared by SummaryTab and SoraSummaryTab — 4 analyst-notes boxes (Good
// Points / Things to Improve / What We've Done / Next Steps), AI-drafted
// via /api/generate-sem-notes from whatever `facts` the caller passes
// (each report type has different metrics — Click Book vs Purchase/Revenue/
// ROAS — so this component stays metric-agnostic and just forwards facts
// to the LLM). Freely editable afterward; NOT persisted anywhere — same
// ephemeral pattern as the existing "Generate Report" feature. The `key`
// passed by callers (client name + period) forces a remount on client/date
// change so stale notes from a different period can't linger silently.
const NOTE_BOXES = [
  { key: "goodPoints", label: "Good Points", dot: "#57A86E" },
  { key: "thingsToImprove", label: "Things to Improve", dot: "#C8A000" },
  { key: "whatWeDone", label: "What We Have Done", dot: "#1877F2" },
  { key: "nextSteps", label: "Next Steps", dot: "#0077C8" },
];
function AnalystNotes({ client, period, facts }) {
  const [notes, setNotes] = useState({ goodPoints: "", thingsToImprove: "", whatWeDone: "", nextSteps: "" });
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState(null);

  const generate = async () => {
    setLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate-sem-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: client.name, period, facts }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Generation failed");
      const toText = (arr) => (arr || []).map((b) => `• ${b}`).join("\n");
      setNotes({
        goodPoints: toText(json.notes.goodPoints),
        thingsToImprove: toText(json.notes.thingsToImprove),
        whatWeDone: toText(json.notes.whatWeDone),
        nextSteps: toText(json.notes.nextSteps),
      });
    } catch (e) {
      setGenError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Analyst Notes</h3>
        <button
          onClick={generate}
          disabled={loading || !facts}
          className="rounded-lg transition-colors"
          style={{ border: `1px solid ${C.line}`, background: loading ? "#f5f5f5" : "#fff", color: C.accent, fontSize: 12.5, fontWeight: 600, padding: "6px 12px", cursor: loading || !facts ? "default" : "pointer", opacity: !facts ? 0.5 : 1 }}
        >
          {loading ? "Generating…" : "Generate with AI"}
        </button>
      </div>
      {genError && <div style={{ color: C.risk, fontSize: 12.5 }} className="mb-2">{genError}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {NOTE_BOXES.map((b) => (
          <div key={b.key} className="rounded-lg p-4" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: b.dot }} />
              <h4 style={{ color: C.ink, fontSize: 13 }} className="font-semibold">{b.label}</h4>
            </div>
            <textarea
              value={notes[b.key]}
              onChange={(e) => setNotes((n) => ({ ...n, [b.key]: e.target.value }))}
              placeholder='Click "Generate with AI" to draft, or write your own notes here.'
              rows={5}
              className="w-full resize-none rounded-md"
              style={{ border: `1px solid ${C.line}`, fontSize: 13, color: C.ink, padding: 8, fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.5 }}
            />
          </div>
        ))}
      </div>
      <p style={{ color: C.faint, fontSize: 11 }} className="mt-2">
        AI-drafted from this period's data — "What We Have Done" is inferred from metric patterns, not actual account access, so review before sharing. Freely editable, but not saved yet — notes reset if you navigate away or change the date range.
      </p>
    </div>
  );
}

/* Meta "f" mark — inline SVG so it stays self-contained, mirroring GoogleG's
   convention below. Rendered in Facebook blue (#1877F2) since Windsor's Meta
   figures are sourced via the facebook connector, and this file already uses
   that same blue as the accent for every Meta-branded tab. */
function MetaMark({ size = 15 }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-label="Meta" style={{ display: "block", flexShrink: 0 }}>
      <circle cx="18" cy="18" r="18" fill="#1877F2" />
      <path fill="#fff" d="M20.1 28V19.6h2.8l.42-3.3h-3.22v-2.1c0-.95.26-1.6 1.63-1.6h1.74v-2.94A23.6 23.6 0 0 0 20.9 9.5c-2.7 0-4.55 1.65-4.55 4.68v2.12h-3.05v3.3h3.05V28h3.75z" />
    </svg>
  );
}

// Grouped KPI box with an icon-badge header — Sora's Summary tab spec
// ("Overall Performance" / "Brand Awareness"), matching the client's own
// reference report. `rows` is an array of KPI-row arrays: each row renders
// as its own label/value grid, with a rule between rows so a client-spec
// "extra row" (e.g. Overall Performance's Add To Cart/Total Direct Revenue/
// Total Direct Purchases/Item View row) reads as clearly grouped-but-distinct
// rather than blending into one undifferentiated 8-up grid.
function PerformanceGroupBox({ icon: Icon, iconColor, title, rows, cols = 4 }) {
  // cols=2 keeps the grid at 2-up even on wide screens (rather than
  // stretching to 4-up at the lg breakpoint) — for boxes with big/long
  // numbers that get cramped and truncated at 4-up (see Six Senses's
  // Overall Performance / Brand Awareness boxes below).
  const gridCols = cols === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4";
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <span className="rounded-md flex items-center justify-center shrink-0" style={{ width: 28, height: 28, background: iconColor }}>
          <Icon size={15} color="#fff" />
        </span>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold">{title}</h3>
      </div>
      <div className="px-5 py-4">
        {rows.map((row, ri) => (
          <div
            key={ri}
            className={`grid ${gridCols} gap-4${ri > 0 ? " mt-4 pt-4" : ""}`}
            style={ri > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}
          >
            {row.map((k) => (
              <div key={k.label} className="min-w-0">
                <div style={{ color: C.muted, fontSize: 12.5 }} className="truncate">{k.label}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span style={{ color: C.ink, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="truncate">{k.value}</span>
                  {k.delta != null && <Delta value={k.delta} suffix="%" />}
                </div>
                {k.note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1 leading-snug">{k.note}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* SEM metric card — gives paid-ads KPI tiles the same "what is this number
   from" footer the SEO tab's cards already have (see SummaryMetric further
   below: value + a bottom row naming Google Search Console / GA4). Used by
   Sora's Summary/Meta/Google SEM tabs so every card names its platform. */
function SemMetricCard({ label, value, delta, suffix = "%", invert = false, tint, accent, note, sourceIcon, sourceLabel }) {
  return (
    <div className="rounded-lg overflow-hidden flex flex-col" style={{ border: `1px solid ${C.line}`, background: tint ? `${accent}12` : "#fff" }}>
      <div className="px-5 py-4 flex-1">
        <div style={{ color: C.muted, fontSize: 12.5 }}>{label}</div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
          {delta != null && <Delta value={delta} suffix={suffix} invert={invert} />}
        </div>
        {note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1.5 leading-snug">{note}</div>}
      </div>
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        {sourceIcon}<span style={{ color: C.faint, fontSize: 11 }}>{sourceLabel}</span>
      </div>
    </div>
  );
}

// Ranked bar chart — Impressions/Website Purchases by country (Sora's Meta
// and Google tab specs; see fetchMetaCountryBreakdown/
// fetchGoogleCountryBreakdown in lib/sem.js) and All conversions by Campaign
// (Sora's Google tab). Sorts independently by its own metric (not a shared
// category order) and caps at the top 10 — matching the client's own
// reference reports, which showed at most 10 bars per chart. Long category
// names get an angled tick label past ~6 bars so they don't overlap.
function RankedBarChart({ title, rows, nameKey = "country", valueKey, color, formatValue = fmt, sourceIcon, sourceLabel }) {
  const sorted = [...rows].sort((a, b) => b[valueKey] - a[valueKey] || a[nameKey].localeCompare(b[nameKey])).slice(0, 10);
  const angled = sorted.length > 6;
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
      </div>
      <div style={{ height: 260 }} className="px-2 py-4">
        {sorted.length === 0 ? (
          <div className="h-full flex items-center justify-center" style={{ color: C.muted, fontSize: 13 }}>No data for this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} margin={{ top: 20, right: 16, left: 4, bottom: angled ? 20 : 4 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis
                dataKey={nameKey}
                tick={{ fill: C.faint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={angled ? -30 : 0}
                textAnchor={angled ? "end" : "middle"}
                height={angled ? 46 : 30}
              />
              <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip formatter={(v) => formatValue(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Bar dataKey={valueKey} fill={color} radius={[3, 3, 0, 0]}>
                <LabelList dataKey={valueKey} position="top" formatter={formatValue} style={{ fill: color, fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        {sourceIcon}<span style={{ color: C.faint, fontSize: 11 }}>{sourceLabel}</span>
      </div>
    </div>
  );
}

// Ad creatives panel — originally Sora's Meta tab spec, now shared by every
// client's Meta-flavored tab that has Meta ad spend (see fetchMetaCreatives
// in lib/sem.js, which is already keyed by client). Thumbnails come from
// Windsor's `thumbnail_url` — real Facebook CDN URLs, but SIGNED and
// time-limited (they carry an expiry param), not permanent links, so a
// broken thumbnail on an old/reloaded page is an expected occasional
// failure, not a bug — onError swaps it for a "No preview" placeholder
// rather than a broken-image icon. Ranked by CTR descending (matching
// Sora's reference report's default sort — kept as the default for every
// client absent a client-specific spec saying otherwise), capped to the
// top 18 so one busy account's ad count doesn't overwhelm the tab.
function CreativesPanel({ rows }) {
  const CAP = 18;
  const ranked = [...rows]
    .map((ad) => ({ ...ad, ctr: ad.impressions ? (ad.linkClicks / ad.impressions) * 100 : 0 }))
    .sort((a, b) => b.ctr - a.ctr);
  const shown = ranked.slice(0, CAP);
  const StatRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-0.5">
      <span style={{ color: C.faint, fontSize: 10 }} className="truncate">{label}</span>
      <span style={{ color: C.ink, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }} className="truncate pl-1.5 text-right">{value}</span>
    </div>
  );
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Creatives</h3>
        <div style={{ color: C.faint, fontSize: 11.5 }} className="mt-0.5">Ranked by CTR, descending{ranked.length > CAP ? ` · top ${CAP} of ${ranked.length}` : ""}</div>
      </div>
      {shown.length === 0 ? (
        <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No ad creatives for this range.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
          {shown.map((ad, i) => (
            <div key={ad.adName} className="rounded-lg overflow-hidden flex flex-col" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-1 px-2 py-1" style={{ borderBottom: `1px solid ${C.line}`, background: C.bg }}>
                <span style={{ color: C.faint, fontSize: 10 }} className="font-medium">{i + 1}</span>
                <MetaMark size={11} />
              </div>
              <div style={{ aspectRatio: "1 / 1", background: C.bg, position: "relative" }}>
                {ad.thumbnailUrl && (
                  <img
                    src={ad.thumbnailUrl}
                    alt={ad.adName}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling.style.display = "flex"; }}
                  />
                )}
                <div
                  className="absolute inset-0 items-center justify-center text-center px-1"
                  style={{ display: ad.thumbnailUrl ? "none" : "flex", color: C.faint, fontSize: 10 }}
                >
                  No preview
                </div>
              </div>
              <div className="px-2 py-2 flex-1">
                <div style={{ color: C.ink, fontSize: 11 }} className="font-medium truncate" title={ad.adName}>{ad.adName}</div>
                <div className="mt-1">
                  <StatRow label="Ad set" value={ad.adSetName || "—"} />
                  <StatRow label="Campaign" value={ad.campaign || "—"} />
                  <StatRow label="Impr." value={fmt(ad.impressions)} />
                  <StatRow label="Clicks" value={fmt(ad.linkClicks)} />
                  <StatRow label="CTR" value={`${ad.ctr.toFixed(2)}%`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <MetaMark size={13} /><span style={{ color: C.faint, fontSize: 11 }}>Meta Ads</span>
      </div>
    </div>
  );
}

// Campaign performance table — Sora's Google tab spec. Distinct from the
// generic CampaignPerformanceTable further below (Campaign/Amount Spent/
// Impressions/Reach/CTR/CPC, shared by MetaTab/GoogleTab) — Sora's spec asks
// for Cost/CPC/Clicks/Impressions/Conversions instead (no Reach, since this
// is Google-only; Conversions instead of CTR). Cost/Clicks/Impressions/
// Conversions come straight from campaignsInRange's per-campaign rollup
// (already fetched — no new Windsor call); CPC is derived (spend/clicks)
// rather than a separate field, since Windsor doesn't return CPC directly at
// this granularity. "Conversions" here is Google Ads' plain `conversions`
// metric — deliberately NOT `allConversions` (the broader bucket already
// used by the "All conversions by Campaign" chart above; see its comment)
// and NOT the isolated Website Purchase action either — this column mirrors
// the client's own reference report's "Conversions" column, which is
// Google's standard per-campaign metric.
function SoraCampaignTable({ rows, formatMoney }) {
  const sorted = [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  const COLS = "2fr 1fr 1fr 1fr 1fr 1fr";
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Campaign Performance</h3>
      </div>
      {sorted.length === 0 ? (
        <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No campaigns for this range.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: COLS, minWidth: 640, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span className="uppercase">Campaign name</span>
            <span className="uppercase text-right">Cost</span>
            <span className="uppercase text-right">CPC</span>
            <span className="uppercase text-right">Clicks</span>
            <span className="uppercase text-right">Impressions</span>
            <span className="uppercase text-right">Conversions</span>
          </div>
          {sorted.map((c, i) => (
            <div key={c.name} className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: COLS, minWidth: 640, borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span style={{ color: C.ink, fontSize: 13 }} className="truncate pr-3">{c.name}</span>
              <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{c.spend == null ? "—" : formatMoney(c.spend)}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{c.spend != null && c.clicks ? formatMoney(c.spend / c.clicks) : "—"}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(c.clicks)}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(c.impressions)}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(c.conversions)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <GoogleG size={13} /><span style={{ color: C.faint, fontSize: 11 }}>Google Ads</span>
      </div>
    </div>
  );
}

function SoraSummaryTab({ client, selectedRange, range, semData }) {
  const sem = semData?.[client.name];

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, soraDayCombined) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, soraDayCombined) : null;
  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);

  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm     = cur && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  const roas     = cur && cur.spend ? cur.revenue / cur.spend : null;
  const prevRoas = prev && prev.spend ? prev.revenue / prev.spend : null;

  // Per-platform breakout for the analyst-notes AI draft — the combined
  // `cur`/`prev` above don't distinguish Meta from Google, and every note
  // is required to name a specific platform.
  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const curMeta = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const curGoogle = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const notesFacts = cur ? {
    currency: cur.currency,
    combined: { spend: cur.spend, clicks: cur.clicks, impressions: cur.impressions, purchase: cur.purchase, addToCart: cur.addToCart, revenue: cur.revenue, roas, ctr },
    meta: curMeta ? { spend: curMeta.spend, clicks: curMeta.clicks, impressions: curMeta.impressions, purchases: curMeta.purchases, addToCart: curMeta.addToCart, purchaseValue: curMeta.purchaseValue } : null,
    google: curGoogle ? { spend: curGoogle.spend, clicks: curGoogle.clicks, impressions: curGoogle.impressions, purchases: curGoogle.purchase, purchaseValue: curGoogle.purchaseValue, addToCart: curGoogle.addToCart } : null,
  } : null;

  // Two titled boxes (client spec, matching their own reference report) —
  // "Overall Performance" (spend/purchase/revenue shape, row 2 added Aug
  // 2026: Add To Cart plus the three metrics below) and "Brand Awareness"
  // (impression/click shape). See soraDayCombined for where
  // directRevenue/directPurchases/itemView/traffic/addToCartValue come from.
  const overallRow1 = cur ? [
    { label: "Amount Spent", value: fmtTHB(cur.spend),   delta: dPct("spend") },
    { label: "Purchases",    value: fmt(cur.purchase),   delta: dPct("purchase") },
    { label: "Revenue",      value: fmtTHB(cur.revenue), delta: dPct("revenue") },
    { label: "ROAS",         value: roas != null ? roas.toFixed(2) : "—", delta: pctDelta(roas, prevRoas) },
  ] : [];
  const overallRow2 = cur ? [
    { label: "Add To Cart",             value: fmt(cur.addToCart),         delta: dPct("addToCart") },
    // Total Direct Revenue/Purchases — the site's own GA4 ecommerce numbers
    // (every channel, not just ad-attributed) — see soraDayCombined.
    { label: "Total Direct Revenue",    value: fmtTHB(cur.directRevenue),   delta: dPct("directRevenue") },
    { label: "Total Direct Purchases",  value: fmt(cur.directPurchases),    delta: dPct("directPurchases") },
    // Item View — Google Ads' account-level all_conversions bucket per the
    // client's own Looker dashboard, not an isolated "view_item" action
    // (Sora's account has none) — see soraDayCombined.
    { label: "Item View",               value: fmt(cur.itemView),           delta: dPct("itemView") },
  ] : [];
  const brandRow1 = cur ? [
    { label: "Total Impression", value: fmt(cur.impressions),  delta: dPct("impressions") },
    { label: "Total Avg CTR",    value: `${ctr.toFixed(2)}%`,  delta: pctDelta(ctr, prevCtr) },
    { label: "Total Avg CPM",    value: cpm != null ? fmtTHB(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Total Clicks",     value: fmt(cur.clicks),       delta: dPct("clicks") },
  ] : [];
  // Traffic — a deliberately blended, cross-platform figure (Meta Landing
  // Page Views + Google Ads clicks), per the client's Looker dashboard —
  // see soraDayCombined.
  const brandRow2 = cur ? [
    { label: "Traffic", value: fmt(cur.traffic), delta: dPct("traffic") },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const purchaseTrend = days.map((d) => ({ day: fmtDayShort(d), purchase: soraDayCombined(sem, d)?.purchase ?? 0 }));
  const revenueTrend  = days.map((d) => ({ day: fmtDayShort(d), revenue: soraDayCombined(sem, d)?.revenue ?? 0 }));
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // "Total Purchases By Month" / "Total Revenue By Month" — client spec,
  // matching their own reference report. Same Purchase/Revenue figures as
  // the daily trend charts above (isolated ad-platform conversion actions,
  // not the GA4 "Direct" numbers), just bucketed by month instead of day.
  // Uses `range` (the full available date range), not `selectedRange` —
  // same "always show the whole trend regardless of the KPI cards' date
  // filter" convention already used by SsfbOverallTab/SongSaaOverallTab's
  // identical monthly charts. Sorted chronologically (the client's own
  // reference report sorts alphabetically by month name — a Looker Studio
  // default, not a deliberate choice — so this deliberately doesn't match
  // that ordering).
  const purchaseByMonth = monthlyBuckets(sem, range?.from, range?.to, (s, d) => soraDayCombined(s, d)?.purchase ?? 0);
  const revenueByMonth  = monthlyBuckets(sem, range?.from, range?.to, (s, d) => soraDayCombined(s, d)?.revenue ?? 0);

  return (
    <div>
      {/* Add To Cart Value card removed for now (Aug 2026, client request) —
          soraDayCombined still computes cur.addToCartValue below in case
          it comes back. */}

      {/* Two grouped performance boxes */}
      <div className="grid lg:grid-cols-2 gap-5">
        <PerformanceGroupBox icon={BarChart3} iconColor={C.accent} title="Overall Performance" rows={[overallRow1, overallRow2]} />
        <PerformanceGroupBox icon={Megaphone} iconColor="#1877F2" title="Brand Awareness" rows={[brandRow1, brandRow2]} />
      </div>

      {/* Daily trend charts */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Purchase Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={purchaseTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="purchase" name="Purchase" stroke={C.accent} strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color={C.accent} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Revenue Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `฿${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip formatter={(v) => fmtTHB(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1877F2" strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color="#1877F2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Total Purchases/Revenue By Month */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Purchases By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purchaseByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Purchase" fill={C.accent} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => v.toFixed(1).replace(/\.0$/, "")} style={{ fill: C.accent, fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Revenue By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `฿${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <Tooltip formatter={(v) => fmtTHB(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Revenue" fill="#1877F2" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v))} style={{ fill: "#1877F2", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Combined Google Ads + Meta (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in {cur?.currency || "THB"} — this account's native billing currency, not converted to USD. Per-platform breakdowns live under the Meta and Google tabs. Total Direct Revenue/Total Direct Purchases are the site's own GA4 ecommerce numbers (every channel, not just ad-attributed) — distinct from the ad-platform-attributed Purchases/Revenue above. Item View is Google Ads' account-level "all conversions" figure. Traffic is a blended cross-platform figure: Meta Landing Page Views + Google Ads Clicks. Total Purchases/Revenue By Month use the same ad-platform-attributed figures as the daily trend charts above (not the GA4 "Direct" numbers), and always show the full available history (from January 2026 onward) regardless of the date-range picker.
      </p>
    </div>
  );
}

function SoraMetaTab({ client, selectedRange, range, semData, liveReach, metaCountry }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;
  const currency = (selectedRange && sem.daily?.[selectedRange.to]?.currency) || "THB";

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;
  const freq = cur && reach ? cur.impressions / reach : 0;

  const kpis = cur ? [
    { label: "Amount Spent", value: fmtTHB(cur.spend),   delta: dPct("spend") },
    { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Reach",       value: fmt(reach),        delta: reachDPct },
    { label: "Clicks",      value: fmt(cur.clicks),       delta: dPct("clicks") },
    { label: "CTR",         value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "Purchase",    value: fmt(cur.purchases),   delta: dPct("purchases") },
    // Was missing entirely — Aug 2026 client feedback ("Add missing
    // Purchase Revenue data"). purchaseValue was already fetched/summed
    // correctly (it backs Revenue on the combined Summary tab and Google's
    // own Revenue card), just never surfaced as its own card here.
    { label: "Revenue",     value: fmtTHB(cur.purchaseValue), delta: dPct("purchaseValue") },
    { label: "Add To Cart", value: fmt(cur.addToCart),   delta: dPct("addToCart") },
    { label: "Frequency",   value: freq.toFixed(2) },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const m = sem.daily?.[d]?.meta; return { day: fmtDayShort(d), spend: m?.spend ?? 0 }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // Country rows for the two breakdown charts below — see metaCountry's
  // fetch in Detail (via /api/sem-country) and fetchMetaCountryBreakdown in
  // lib/sem.js. Empty while the range-scoped fetch is in flight/unset.
  const countryData = metaCountry?.[client.name] ?? null;
  const countryRows = countryData
    ? Object.entries(countryData).map(([country, v]) => ({ country, impressions: v.impressions, purchases: v.purchases }))
    : [];

  // Campaign Performance table — Aug 2026 client feedback. Meta's tab never
  // had one (unlike Google's tab, which has its own bespoke SoraCampaignTable
  // per an earlier client spec) — reuses the generic CampaignPerformanceTable
  // instead, same as every other client's Meta tab (MetaTab, AzeraiMetaTab,
  // SSFB), rather than a new bespoke component.
  const campaigns = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "meta") : [];

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <SemMetricCard
            key={k.label}
            label={k.label}
            value={k.value}
            delta={k.delta}
            tint={i % 2 === 0}
            accent={accent}
            sourceIcon={<MetaMark size={13} />}
            sourceLabel="Meta Ads"
          />
        ))}
      </div>

      {/* Spend trend */}
      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Meta</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
        </div>
        <div style={{ height: 240 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="soraMetaSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `฿${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
              <Tooltip formatter={(v) => fmtTHB(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#soraMetaSpend)" />
              <SelectionBand selectedRange={selectedRange} color={accent} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Country breakdown */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <RankedBarChart title="Impressions by Country" rows={countryRows} valueKey="impressions" color={accent} sourceIcon={<MetaMark size={13} />} sourceLabel="Meta Ads" />
        <RankedBarChart title="Website Purchases by Country" rows={countryRows} valueKey="purchases" color={accent} sourceIcon={<MetaMark size={13} />} sourceLabel="Meta Ads" />
      </div>

      <CampaignPerformanceTable campaigns={campaigns} rangeLabel={selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""} fmtSpend={fmtTHB} fmtCpc={fmtTHB} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in {currency} — this account's native billing currency, not converted to USD. Country-breakdown charts show the top 10 countries by their own metric (Impressions / Website Purchases) for the exact selected range. Creative performance moved to its own tab, per the client's Aug 2026 feedback — see the Creative Performance tab.
      </p>
    </div>
  );
}

// Creative Performance — its own sub-tab per the client's Aug 2026 feedback
// ("Move the Creative Performance section to a separate tab"). Previously
// inline at the bottom of SoraMetaTab; just CreativesPanel on its own now,
// no new data/logic.
function SoraCreativeTab({ client, metaCreatives }) {
  return (
    <div>
      <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Ad creative thumbnails are Facebook's own signed, time-limited CDN links — an occasional broken preview after a long page session is expected, not a bug.
      </p>
    </div>
  );
}

function SoraGoogleTab({ client, selectedRange, range, semData, googleCountry }) {
  const sem = semData?.[client.name];
  const accent = C.accent;

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, googleOf) : null;
  const currency = (selectedRange && sem.daily?.[selectedRange.to]?.currency) || "THB";

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;

  const kpis = cur ? [
    { label: "Amount Spent",     value: fmtTHB(cur.spend),    delta: dPct("spend") },
    { label: "Impression",       value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Clicks",           value: fmt(cur.clicks),      delta: dPct("clicks") },
    { label: "CTR",              value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "Website Purchase", value: fmt(cur.purchase), delta: dPct("purchase") },
    { label: "Revenue",          value: fmtTHB(cur.purchaseValue), delta: dPct("purchaseValue") },
    // Was missing entirely — caught by the client, Aug 2026. The isolated
    // google.addToCart figure (see GOOGLE_CONVERSION_ACTION_MATCH in
    // lib/sem.js) was already being fetched/summed correctly (it backs
    // Add To Cart on the combined Summary tab), just never surfaced as
    // its own card here.
    { label: "Add To Cart",      value: fmt(cur.addToCart), delta: dPct("addToCart") },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const g = sem.daily?.[d]?.google; return { day: fmtDayShort(d), spend: g?.spend ?? 0 }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // Country rows for the Impressions chart below — see googleCountry's fetch
  // in Detail (via /api/sem-country) and fetchGoogleCountryBreakdown in
  // lib/sem.js. Empty while the range-scoped fetch is in flight/unset.
  const countryData = googleCountry?.[client.name] ?? null;
  const countryRows = countryData
    ? Object.entries(countryData).map(([country, v]) => ({ country, impressions: v.impressions }))
    : [];

  // Shared per-campaign rollup for the range — backs both the "All
  // conversions by Campaign" chart and the Campaign Performance table below.
  const campaignRows = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "google") : [];

  // All conversions by Campaign — this IS the blanket all_conversions bucket
  // (see the GOOGLE_CONVERSION_ACTION_MATCH gotcha in lib/sem.js, which
  // isolates Website Purchase/Add To Cart away from this same bucket for the
  // KPI cards above). This chart is a deliberate, separate diagnostic view
  // the client asked for by that literal name, not a stand-in for the
  // isolated Purchase figure — shown as-is, campaigns with 0 hidden (matches
  // the client's own reference report, which only showed non-zero campaigns).
  const campaignConversions = campaignRows
    .map((c) => ({ campaign: c.name, allConversions: Math.round(c.allConversions) }))
    .filter((c) => c.allConversions > 0);

  // Click Through Rate by month — the client's reference report plots this
  // across a full calendar year; our own data (via fetchSemData in
  // lib/sem.js) goes back to January YEAR (widened from March, Aug 2026 —
  // MONTHS below is that same canonical, auto-extending window). Months
  // with zero Google impressions (no data yet, or genuinely no spend that
  // month) are skipped rather than
  // plotted as a false 0%.
  const monthlyCtr = MONTHS.map((abbr) => {
    const moNum = MO_NUM[abbr];
    let clicks = 0, impressions = 0;
    for (const [date, day] of Object.entries(sem.daily || {})) {
      if (Number(date.slice(5, 7)) !== moNum) continue;
      clicks += day.google?.clicks ?? 0;
      impressions += day.google?.impressions ?? 0;
    }
    return { month: MONTH_FULL[abbr], ctr: impressions ? (clicks / impressions) * 100 : null };
  }).filter((m) => m.ctr != null);

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <SemMetricCard
            key={k.label}
            label={k.label}
            value={k.value}
            delta={k.delta}
            tint={i % 2 === 0}
            accent={accent}
            note={k.note}
            sourceIcon={<GoogleG size={13} />}
            sourceLabel="Google Ads"
          />
        ))}
      </div>

      {/* Spend trend */}
      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Google Ads</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
        </div>
        <div style={{ height: 240 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="soraGoogleSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `฿${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
              <Tooltip formatter={(v) => fmtTHB(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#soraGoogleSpend)" />
              <SelectionBand selectedRange={selectedRange} color={accent} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Country breakdown + All conversions by Campaign */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <RankedBarChart title="Impressions by Country" rows={countryRows} valueKey="impressions" color={accent} sourceIcon={<GoogleG size={13} />} sourceLabel="Google Ads" />
        <RankedBarChart title="All conversions by Campaign" rows={campaignConversions} nameKey="campaign" valueKey="allConversions" color={accent} sourceIcon={<GoogleG size={13} />} sourceLabel="Google Ads" />
      </div>

      {/* Click Through Rate by month */}
      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Click Through Rate</h3>
        </div>
        <div style={{ height: 260 }} className="px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyCtr} margin={{ top: 24, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => `${v.toFixed(2)}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Line type="monotone" dataKey="ctr" name="Click Through Rate" stroke={accent} strokeWidth={2} dot={{ r: 4 }}>
                <LabelList dataKey="ctr" position="top" formatter={(v) => `${v.toFixed(2)}%`} style={{ fill: accent, fontSize: 11, fontWeight: 600 }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
          <GoogleG size={13} /><span style={{ color: C.faint, fontSize: 11 }}>Google Ads</span>
        </div>
      </div>

      {/* Campaign performance table */}
      <div className="mt-5">
        <SoraCampaignTable rows={campaignRows} formatMoney={fmtTHB} />
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Google Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in {currency} — this account's native billing currency, not converted to USD. Website Purchase/Revenue and Add To Cart each read from their own specific, isolated conversion action — NOT Google's broader "All conversions" field, which also sums in view_item_list/begin_checkout and would overcount all three figures (fixed Aug 2026, caught by the client). The "All conversions by Campaign" chart is that same broader field, shown deliberately as its own diagnostic view (per the client's spec) rather than a stand-in for the isolated Purchase figure above — campaigns with 0 are hidden. Impressions by Country decodes Google Ads' numeric country_criterion_id via the ISO 3166-1 lookup in lib/sem.js (confirmed live, Aug 2026). Click Through Rate is monthly and only covers this account's tracked reporting window (March {YEAR} onward) — the client's own reference report went back to January, which our Windsor pull doesn't reach. Campaign Performance's Conversions column is Google Ads' plain "Conversions" metric (distinct from the broader All conversions bucket above and from the isolated Website Purchase action).
      </p>
    </div>
  );
}

// Azerai (Ke Ga Bay + La Residence, Hue) — same Purchase/Add To Cart/
// Revenue shape as Sora above (see azeraiDayCombined for the formulas and
// mixed-currency handling), but with real per-platform differences from
// Sora's tab shape, per the client's spec doc:
//   Overall — no ROAS (Sora's Overall has one, Azerai's doesn't).
//   Meta/Google — EACH has its own ROAS (= that platform's Purchases
//     Conversion Value / that platform's Amount Spent), which Sora's
//     Meta/Google tabs don't show at all (only Sora's combined Overall
//     does). Both tabs also list Reach/Frequency — Meta's are real, but
//     Google's aren't (Google Ads has no Reach metric at all via Windsor,
//     so Frequency = impressions/reach isn't computable either) — per the
//     client (Aug 2026), dropped from the Google tab rather than faked.
function AzeraiSummaryTab({ client, selectedRange, range, semData }) {
  const sem = semData?.[client.name];

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, azeraiDayCombined) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, azeraiDayCombined) : null;
  const dPct = (key) => (cur && !cur.spendPending && prev && prev[key]) ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null;
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);

  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm     = cur && !cur.spendPending && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && !prev.spendPending && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  const roas     = cur && !cur.spendPending && cur.spend ? cur.revenue / cur.spend : null;
  const prevRoas = prev && !prev.spendPending && prev.spend ? prev.revenue / prev.spend : null;

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const curMeta = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const curGoogle = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const notesFacts = cur ? {
    currency: "VND",
    combined: { spend: cur.spendPending ? null : cur.spend, clicks: cur.clicks, impressions: cur.impressions, purchase: cur.purchase, addToCart: cur.addToCart, revenue: cur.revenue, ctr },
    meta: curMeta ? { spend: curMeta.spend, clicks: curMeta.clicks, impressions: curMeta.impressions, purchases: curMeta.purchases, addToCart: curMeta.addToCart, purchaseValue: curMeta.purchaseValue } : null,
    google: curGoogle ? { spend: curGoogle.spendPending ? null : curGoogle.spend, clicks: curGoogle.clicks, impressions: curGoogle.impressions, purchases: curGoogle.purchase, purchaseValue: curGoogle.purchaseValue, addToCart: curGoogle.addToCart } : null,
  } : null;

  // Two titled boxes (client spec, matching their own reference report) —
  // same "Overall Performance"/"Brand Awareness" shape as Sora's Summary
  // tab, but Azerai's own reference report has only a single extra metric
  // in each box's second row (Add To Cart; no Traffic row here) rather than
  // Sora's four — no GA4 "Direct" numbers or Item View for this client.
  const overallRow1 = cur ? [
    { label: "Amount Spent", value: cur.spendPending ? "—" : fmtVND(cur.spend), delta: dPct("spend"), note: cur.spendPending ? "Pending FX conversion (Google's USD leg this range)" : undefined },
    { label: "Purchases",    value: fmt(cur.purchase),   delta: dPct("purchase") },
    { label: "Revenue",      value: fmtVND(cur.revenue), delta: dPct("revenue") },
    { label: "ROAS",         value: roas != null ? roas.toFixed(2) : "—", delta: pctDelta(roas, prevRoas) },
  ] : [];
  const overallRow2 = cur ? [
    { label: "Add To Cart", value: fmt(cur.addToCart), delta: dPct("addToCart") },
  ] : [];
  const brandRow1 = cur ? [
    { label: "Impression",     value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Total Avg. CTR", value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "CPM",            value: cpm != null ? fmtVND(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Total Click",    value: fmt(cur.clicks),      delta: dPct("clicks") },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const purchaseTrend = days.map((d) => ({ day: fmtDayShort(d), purchase: azeraiDayCombined(sem, d)?.purchase ?? 0 }));
  const revenueTrend  = days.map((d) => ({ day: fmtDayShort(d), revenue: azeraiDayCombined(sem, d)?.revenue ?? 0 }));
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // "Total Purchases/Revenue/Add To Cart By Month" — same shape as Sora's
  // identical charts (Purchases/Revenue originally; Add To Cart added per
  // AZKGB's Aug 2026 feedback). Uses `range` (the full available date
  // range), not `selectedRange` — same "always show the whole trend
  // regardless of the KPI cards' date filter" convention as Sora's.
  const purchaseByMonth  = monthlyBuckets(sem, range?.from, range?.to, (s, d) => azeraiDayCombined(s, d)?.purchase ?? 0);
  const revenueByMonth   = monthlyBuckets(sem, range?.from, range?.to, (s, d) => azeraiDayCombined(s, d)?.revenue ?? 0);
  const addToCartByMonth = monthlyBuckets(sem, range?.from, range?.to, (s, d) => azeraiDayCombined(s, d)?.addToCart ?? 0);

  return (
    <div>
      {/* Two grouped performance boxes */}
      <div className="grid lg:grid-cols-2 gap-5">
        <PerformanceGroupBox icon={BarChart3} iconColor={C.accent} title="Overall Performance" cols={2} rows={[overallRow1, overallRow2]} />
        <PerformanceGroupBox icon={Megaphone} iconColor="#1877F2" title="Brand Awareness" cols={2} rows={[brandRow1]} />
      </div>

      {/* Daily trend charts */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Purchase Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={purchaseTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="purchase" name="Purchase" stroke={C.accent} strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color={C.accent} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Revenue Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `₫${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip formatter={(v) => fmtVND(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1877F2" strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color="#1877F2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Total Purchases/Revenue By Month — placed side by side per AZKGB's
          Aug 2026 feedback ("Place the monthly Revenue chart next to the
          monthly Purchase chart"), same layout as Sora's identical pair. */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Purchases By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purchaseByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Purchase" fill={C.accent} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => v.toFixed(1).replace(/\.0$/, "")} style={{ fill: C.accent, fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Revenue By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `₫${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                <Tooltip formatter={(v) => fmtVND(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Revenue" fill="#1877F2" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v))} style={{ fill: "#1877F2", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Total Add To Cart By Month — AZKGB's Aug 2026 feedback item */}
      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Add To Cart By Month</h3>
        </div>
        <div style={{ height: 240 }} className="px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={addToCartByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Bar dataKey="value" name="Add To Cart" fill="#5FC77E" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(v) => fmt(v)} style={{ fill: "#5FC77E", fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Combined Google Ads + Meta (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in VND — Meta bills natively in VND; Google Ads bills in USD and is converted to VND via live daily FX rates (not the client's original spec doc's fixed ×26000 multiplier — per the client, Aug 2026, live rates are more accurate). Purchase/Add To Cart/Revenue read from this account's specific "Purchase"/"ClickAddRoomCheckout" conversion actions — not Google's broader "All conversions" bucket, which also sums in Begin Checkout, hotline calls, etc. and would overcount both figures (fixed Aug 2026, caught by the client). Per-platform breakdowns live under the Meta and Google tabs. Total Purchases By Month always shows the full available history (from January 2026 onward) regardless of the date-range picker.
      </p>
    </div>
  );
}

function AzeraiMetaTab({ client, selectedRange, range, semData, liveReach, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;
  const campaigns = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "meta") : [];

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr  = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const roas     = cur && cur.spend ? cur.purchaseValue / cur.spend : null;
  const prevRoas = prev && prev.spend ? prev.purchaseValue / prev.spend : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;
  const freq = cur && reach ? cur.impressions / reach : 0;

  const kpis = cur ? [
    { label: "Amount Spent",     value: fmtVND(cur.spend),        delta: dPct("spend") },
    { label: "Website Purchases", value: fmt(cur.purchases),      delta: dPct("purchases") },
    { label: "Revenue",          value: fmtVND(cur.purchaseValue), delta: dPct("purchaseValue") },
    { label: "ROAS",             value: roas != null ? roas.toFixed(2) : "—", delta: pctDelta(roas, prevRoas) },
    // Was missing entirely — caught by the client, Aug 2026, same as the
    // Google-tab gap fixed just before this. meta.addToCart (Meta Pixel
    // "Add to cart" event) was already fetched generically and already
    // backs Add To Cart on the combined Summary tab; just never shown here
    // (Sora's Meta tab has always had this card — Azerai's was missing it).
    { label: "Add To Cart",      value: fmt(cur.addToCart),        delta: dPct("addToCart") },
    { label: "Impression",       value: fmt(cur.impressions),     delta: dPct("impressions") },
    { label: "Reach",            value: fmt(reach),           delta: reachDPct },
    { label: "Click",            value: fmt(cur.clicks),          delta: dPct("clicks") },
    { label: "CTR",              value: `${ctr.toFixed(1)}%`,     delta: pctDelta(ctr, prevCtr) },
    { label: "Frequency",        value: freq.toFixed(2) },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const m = sem.daily?.[d]?.meta; return { day: fmtDayShort(d), spend: m?.spend ?? 0 }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Meta</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
        </div>
        <div style={{ height: 240 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="azeraiMetaSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `₫${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
              <Tooltip formatter={(v) => fmtVND(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#azeraiMetaSpend)" />
              <SelectionBand selectedRange={selectedRange} color={accent} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <CampaignPerformanceTable campaigns={campaigns} rangeLabel={selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""} fmtSpend={fmtVND} fmtCpc={fmtVND} />

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in VND — this account's native billing currency, not converted to USD. Revenue and ROAS use Meta's own Pixel Purchase value, not the combined Overall-tab figure.
      </p>
    </div>
  );
}

// Shared by both Azerai properties (Ke Ga Bay + La Residence, Hue). The
// Campaign Performance table below (isAzlrh) is AZLRH-only — its own Aug
// 2026 feedback item, not part of AZKGB's separate feedback list.
function AzeraiGoogleTab({ client, selectedRange, range, semData, googleSearchTerms }) {
  const sem = semData?.[client.name];
  const accent = C.accent;

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, googleOf) : null;

  const dPct = (key) => (cur && !cur.spendPending && prev && prev[key]) ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null;
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr  = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const roas     = cur && !cur.spendPending && cur.spend ? cur.purchaseValue / cur.spend : null;
  const prevRoas = prev && !prev.spendPending && prev.spend ? prev.purchaseValue / prev.spend : null;

  const kpis = cur ? [
    { label: "Amount Spent",     value: cur.spendPending ? "—" : fmtVND(cur.spend), delta: dPct("spend"), note: cur.spendPending ? "Pending FX conversion (USD → VND this range)" : undefined },
    { label: "Website Purchases", value: fmt(cur.purchase), delta: dPct("purchase") },
    { label: "Revenue",          value: fmtVND(cur.purchaseValue), delta: dPct("purchaseValue") },
    { label: "ROAS",             value: roas != null ? roas.toFixed(2) : "—", delta: pctDelta(roas, prevRoas) },
    { label: "Impression",       value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Click",            value: fmt(cur.clicks),      delta: dPct("clicks") },
    { label: "CTR",              value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    // Was missing entirely — caught by the client, Aug 2026 (same gap as
    // Sora's Google tab). The isolated google.addToCart figure (see
    // GOOGLE_CONVERSION_ACTION_MATCH in lib/sem.js — "ClickAddRoomCheckout"
    // for Azerai) was already fetched/summed correctly and already backs
    // Add To Cart on the combined Summary tab; just never shown here.
    { label: "Add To Cart",      value: fmt(cur.addToCart),   delta: dPct("addToCart") },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const g = sem.daily?.[d]?.google; return { day: fmtDayShort(d), spend: g?.spendPending ? null : (g?.spend ?? 0) }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // Campaign Performance table — AZLRH-specific feedback item (Aug 2026),
  // not AZKGB's (whose own feedback list is separate: Purchase/Add To Cart/
  // Revenue chart work). Scoped by client name rather than a shared prop
  // since this tab is shared between both Azerai properties.
  const isAzlrh = client.name === "Azerai La Residence, Hue";
  const campaigns = isAzlrh && selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "google") : [];

  // Top Performing Keywords — real keyword-level performance isn't
  // queryable via Windsor (see fetchGoogleSearchTerms in lib/sem.js); this
  // ranks the account's real triggered search terms instead, by clicks
  // descending, top 15.
  const topSearchTerms = isAzlrh
    ? [...(googleSearchTerms?.[client.name] ?? [])].sort((a, b) => b.clicks - a.clicks).slice(0, 15)
    : [];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
            {k.note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1">{k.note}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Google Ads</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
        </div>
        <div style={{ height: 240 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="azeraiGoogleSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => `₫${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
              <Tooltip formatter={(v) => (v == null ? "Pending FX conversion" : fmtVND(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#azeraiGoogleSpend)" connectNulls={false} />
              <SelectionBand selectedRange={selectedRange} color={accent} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isAzlrh && <CampaignPerformanceTable campaigns={campaigns} rangeLabel={rangeLabel} fmtSpend={fmtVND} fmtCpc={fmtVND} />}
      {isAzlrh && <TopKeywordsTable rows={topSearchTerms} rangeLabel={rangeLabel} />}

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Google Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in VND, converted from this account's native USD billing via live daily FX rates.{cur?.spendPending ? " Pending FX conversion for part of this range." : ""} Website Purchases/Revenue/ROAS read from this account's native "Purchase" conversion action specifically — not Google's broader "All conversions" bucket (which also sums in Begin Checkout, ClickAddRoomCheckout, hotline calls, etc.), and not the account's second, likely-duplicate "azerai - GA4 (web) purchase" action (fixed Aug 2026, caught by the client). Reach and Frequency are dropped from this tab — Google Ads has no Reach metric via Windsor, unlike the doc's spec (which lists both, likely carried over from the Meta tab), so neither is computable here.{isAzlrh ? " Top Performing Keywords shows the account's real triggered search terms (Google Ads' search term report) rather than configured keyword targets — Windsor's keyword-level report can't be combined with any performance metric, confirmed live, Aug 2026 — ranked by clicks." : ""}
      </p>
    </div>
  );
}

// Top Performing Keywords table — AZLRH-only, see fetchGoogleSearchTerms in
// lib/sem.js and the comment on the isAzlrh block in AzeraiGoogleTab above
// for why this shows search terms rather than literal keyword criteria.
function TopKeywordsTable({ rows, rangeLabel }) {
  return (
    <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Top Performing Keywords</h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>by clicks · {rangeLabel}</span>
      </div>
      <div
        className="grid items-center px-5 py-2"
        style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1fr", color: C.faint, fontSize: 11.5, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}
      >
        <span className="uppercase">Search Term</span>
        <span className="uppercase text-right">Clicks</span>
        <span className="uppercase text-right">Impressions</span>
        <span className="uppercase text-right">CTR</span>
        <span className="uppercase text-right">Cost</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No search terms in this range.</div>
      ) : rows.map((r, i) => {
        const ctr = r.impressions ? (r.clicks / r.impressions) * 100 : null;
        return (
          <div key={r.term} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1fr", borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate" title={r.term}>{r.term}</span>
            <span style={{ color: C.ink, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">{fmt(r.clicks)}</span>
            <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{fmt(r.impressions)}</span>
            <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{ctr != null ? `${ctr.toFixed(2)}%` : "—"}</span>
            <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{fmtVND(r.cost)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Song Saa Private Island — originally a single-tab Meta-only SEM report
// per the client's spec doc (they have a real, active Google Ads account,
// ~$1,952 spend over Mar-Aug 2026, but asked in Aug 2026 to leave it out of
// the doc's Meta-flavored "Overall" tab entirely). A later round of client
// feedback (also Aug 2026) reversed that — Google Ads is now shown in its
// own labeled section on this tab plus a full "Google" sub-tab (generic
// GoogleTab, reused as-is) — see googleOf/curGoogle/googleKpis below and the
// semSub pills. "Telegram Link Click" is the doc's literal scorecard name
// for the Meta-side metric despite actually being about WhatsApp —
// both it and Whatsapp Messages are filtered to this account's
// "ClicktoWhatsapp"-named campaigns specifically (confirmed live: clicks
// and actions_onsite_conversion_messaging_conversation_started_7d are both
// real, non-zero fields there), while Amount Spent/Impression/CTR/CPM/
// Clicks stay account-wide (every Meta campaign, not just the WhatsApp
// ones) — same "total spend, filtered sub-metric" split already used by
// SSFB's Cost Per LPV/Cost Per Link Click. Cost Per Whatsapp Message
// follows that same precedent: total account spend, not just the
// WhatsApp campaigns' own spend.
function SongSaaOverallTab({ client, selectedRange, range, semData, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;
  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm     = cur && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;

  // Google Ads — previously never read here at all (this account's Google
  // spend was intentionally excluded from the report, see the note above).
  // Per the client's Aug 2026 feedback that decision reversed; the account
  // was already flowing into daily.google via ACCOUNT_MATCH the whole time
  // (see lib/sem.js), so no data-layer change is needed — just reading it.
  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const curGoogle = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const prevGoogle = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, googleOf) : null;
  const googleDPct = (key) => (prevGoogle && prevGoogle[key] ? Math.round(((curGoogle[key] - prevGoogle[key]) / prevGoogle[key]) * 100) : null);
  const googleCtr = curGoogle && curGoogle.impressions ? (curGoogle.clicks / curGoogle.impressions) * 100 : 0;
  const prevGoogleCtr = prevGoogle && prevGoogle.impressions ? (prevGoogle.clicks / prevGoogle.impressions) * 100 : null;

  const whatsappCampaigns = (name) => (name || "").toLowerCase().includes("clicktowhatsapp");
  const wa = (from, to) => {
    if (!from || !to) return null;
    const rows = campaignsInRange(sem, from, to, "meta").filter((c) => whatsappCampaigns(c.name));
    return rows.reduce((a, c) => ({ clicks: a.clicks + (c.clicks ?? 0), messages: a.messages + (c.messagingConversations ?? 0) }), { clicks: 0, messages: 0 });
  };
  const curWa = selectedRange ? wa(selectedRange.from, selectedRange.to) : null;
  const prevWa = prevWin ? wa(prevWin.from, prevWin.to) : null;
  const waDPct = (key) => (prevWa && prevWa[key] ? Math.round(((curWa[key] - prevWa[key]) / prevWa[key]) * 100) : null);
  const costPerMessage = cur && curWa?.messages ? cur.spend / curWa.messages : null;
  const prevCostPerMessage = prev && prevWa?.messages ? prev.spend / prevWa.messages : null;

  const kpis = cur ? [
    { label: "Amount Spent",             value: fmtMoney(cur.spend), delta: dPct("spend") },
    { label: "Telegram Link Click",      value: fmt(curWa?.clicks ?? 0), delta: waDPct("clicks") },
    { label: "Whatsapp Messages",        value: fmt(curWa?.messages ?? 0), delta: waDPct("messages") },
    { label: "Cost Per Whatsapp Message", value: costPerMessage != null ? fmtMoney(costPerMessage) : "—", delta: pctDelta(costPerMessage, prevCostPerMessage) },
    { label: "Impression",               value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "CTR",                      value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "CPM",                      value: cpm != null ? fmtMoney(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Clicks",                   value: fmt(cur.clicks), delta: dPct("clicks") },
    // Meta Pixel add-to-cart — a generic field already fetched for every
    // Meta account (see lib/sem.js), just never surfaced on this tab before.
    { label: "Add To Cart",              value: fmt(cur.addToCart), delta: dPct("addToCart") },
  ] : [];

  // This account's Google Ads currency was never actually confirmed live —
  // unlike Meta (Song Saa's Meta account is USD, hence fmtMoney below for
  // `cur`), Google isn't in NATIVE_CURRENCY_CLIENTS or MIXED_CURRENCY_TARGET,
  // so its spend now passes through unconverted (see lib/sem.js) rather than
  // assumed-USD — fmtByCurrency shows whatever Windsor actually reports
  // instead of risking a mislabeled "$" on a genuinely non-USD figure.
  const googleKpis = curGoogle ? [
    { label: "Amount Spent", value: curGoogle.spendPending ? "—" : fmtByCurrency(curGoogle.spend, curGoogle.currency), delta: curGoogle.spendPending ? null : googleDPct("spend") },
    { label: "Impressions",  value: fmt(curGoogle.impressions), delta: googleDPct("impressions") },
    { label: "Clicks",       value: fmt(curGoogle.clicks), delta: googleDPct("clicks") },
    { label: "CTR",          value: `${googleCtr.toFixed(1)}%`, delta: pctDelta(googleCtr, prevGoogleCtr) },
  ] : [];

  // Two monthly bar charts from the client's live Looker Studio report
  // (not in the briefing doc's text — confirmed against a screenshot, Aug
  // 2026). "Messaging Conversation Started" is filtered to ClicktoWhatsapp
  // campaigns (same scope as the Whatsapp Messages KPI above); "Clicks" is
  // account-wide across every Meta campaign, NOT filtered — confirmed by
  // matching magnitude against real data (a WhatsApp-only monthly total
  // would be roughly 10x too small to match the chart's ~10k-20k/month
  // bars). monthlyBuckets uses `range` (the full available date range),
  // not `selectedRange` (the date-picker's filtered window) — same
  // "always show the full trend regardless of the KPI cards' date filter"
  // convention already used by SsfbOverallTab's identical charts.
  const waMessagesTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) =>
    (s.campaigns?.[d] || []).filter((c) => c.platform === "meta" && whatsappCampaigns(c.name)).reduce((a, c) => a + (c.messagingConversations ?? 0), 0)
  );
  // Same "ClicktoWhatsapp"-campaign filter as the Telegram Link Click KPI
  // card above, just bucketed monthly instead of summed for the selected
  // range — added per the client's feedback ("Add monthly Telegram Clicks
  // to the Summary table").
  const waClicksTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) =>
    (s.campaigns?.[d] || []).filter((c) => c.platform === "meta" && whatsappCampaigns(c.name)).reduce((a, c) => a + (c.clicks ?? 0), 0)
  );
  const clicksTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.clicks);
  const tickInterval = dayTickInterval(dateRange(range?.from, range?.to).length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // Analyst notes — same shared component/API as SSFB/SSSH. This account now
  // has both platforms in its facts (Google previously excluded, see above),
  // so unlike SSFB/SSSH's meta-only shape, `google` is populated too.
  const notesFacts = cur ? {
    currency: "USD",
    combined: null,
    meta: { spend: cur.spend, impressions: cur.impressions, clicks: cur.clicks, ctr, cpm, addToCart: cur.addToCart, telegramLinkClicks: curWa?.clicks ?? 0, whatsappMessages: curWa?.messages ?? 0, costPerWhatsappMessage: costPerMessage },
    google: curGoogle ? { spend: curGoogle.spendPending ? null : curGoogle.spend, impressions: curGoogle.impressions, clicks: curGoogle.clicks, ctr: googleCtr } : null,
  } : null;

  const BarBlock = ({ title, data }) => (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
      </div>
      <div style={{ height: 220 }} className="px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
            <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly bar charts */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBlock title="Messaging Conversation Started Per Month" data={waMessagesTrend} />
        <BarBlock title="Clicks Per Month" data={clicksTrend} />
      </div>
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBlock title="Telegram Link Click Per Month" data={waClicksTrend} />
      </div>

      {/* Google Ads — see the notes on googleOf/curGoogle above for why this
          wasn't here before. Kept as its own clearly-labeled section rather
          than merged into the Meta KPI grid above, so it's never mistaken
          for a combined/blended figure. */}
      <div className="mt-5">
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold mb-3">Google Ads</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {googleKpis.map((k, i) => (
            <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${C.accent}12` : "#fff", border: `1px solid ${C.line}` }}>
              <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
                {k.delta != null && <Delta value={k.delta} suffix="%" />}
              </div>
              {k.label === "Amount Spent" && curGoogle?.spendPending && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1">Pending FX conversion (billed in a non-USD currency)</div>}
            </div>
          ))}
        </div>
        <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-3">
          See the Google tab above for the full campaign-level breakdown.
        </p>
      </div>

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in USD. Telegram Link Click and Whatsapp Messages are filtered to this account's "ClicktoWhatsapp"-named campaigns specifically (the doc's own scorecard name for the first one, despite it being about WhatsApp), same scope as the Messaging Conversation Started and Telegram Link Click charts; every other figure here (including the Clicks chart) is account-wide across all Meta campaigns. Google Ads figures above are this account's real, active Google Ads spend (previously excluded from this report; re-added per the client's Aug 2026 feedback) — see the Google tab for the full breakdown.
      </p>
    </div>
  );
}

// Six Senses Fort Barwara — Meta-only custom SEM report, per the client's
// spec doc (SSFB.docx). Tab 1 "Overall": scorecards + 3 monthly bar charts.
// Tab 2 "Campaign Performance": Ad Spend split India vs. International by
// ad-set name (see SsfbCampaignTab / marketSpendInRange / classifySsfbMarket
// in lib/sem.js). Resolved with the client (Aug 2026): the real ad-set
// names are the source of truth over the spec doc's own (backwards-reading)
// filter description — Interest_India_*/Interest_IN_* is India,
// Interest_International_* is International — and since the client's real
// interest is the India/International spend split specifically, anything
// matching neither (e.g. Interest_USUKGCC_*, Interest_US MASS_* — which
// don't actually have any spend within this dashboard's active date range)
// folds into International rather than getting its own bucket.
//
// IG Profile Visits and Profile Followers are two of the doc's scorecards.
// The original field discovery pass (Aug 2026) tested Meta's `actions_*`
// fields on the `facebook` (ads) connector and found nothing for either —
// correctly, as it turned out: both metrics actually live on a separate
// Windsor connector, `instagram` (native Instagram Insights data), under a
// different account-name scheme (see clientForIgAccount in lib/sem.js).
// Re-checked directly against that connector (Aug 2026): Profile Followers
// has real data (`follower_count` — daily net new followers, shown as a
// KPI card below), but Profile Visits (`profile_views`) still comes back 0
// with no history — genuinely no data for this account, kept as
// "No data reported" below rather than dropped or a fabricated 0.
function monthlyBuckets(sem, from, to, picker) {
  const map = new Map();
  for (const d of dateRange(from, to)) {
    const key = d.slice(0, 7); // "YYYY-MM"
    map.set(key, (map.get(key) ?? 0) + (picker(sem, d) ?? 0));
  }
  return [...map.entries()].map(([key, value]) => ({
    month: `${MONTH_ABBR[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
    value,
  }));
}

function SsfbNoDataCard({ label }) {
  return (
    <div className="rounded-lg px-5 py-4" style={{ background: "#fff", border: `1px dashed ${C.line}` }}>
      <div style={{ color: C.muted, fontSize: 12.5 }}>{label}</div>
      <div className="mt-1.5" style={{ color: C.faint, fontSize: 14.5, fontWeight: 600 }}>No data reported</div>
    </div>
  );
}

function SsfbOverallTab({ client, selectedRange, range, semData, liveReach, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm = cur && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  const costPerLpv = cur && cur.landingPageViews ? cur.spend / cur.landingPageViews : null;
  const prevCostPerLpv = prev && prev.landingPageViews ? prev.spend / prev.landingPageViews : null;
  const costPerLinkClick = cur && cur.linkClicks ? cur.spend / cur.linkClicks : null;
  const prevCostPerLinkClick = prev && prev.linkClicks ? prev.spend / prev.linkClicks : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;

  const days = dateRange(range?.from, range?.to);
  const lpvTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.landingPageViews);
  const clicksTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.linkClicks);
  const igVisitsTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.igProfileVisits);
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  const BarBlock = ({ title, data, color }) => (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
      </div>
      <div style={{ height: 220 }} className="px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
            <Bar dataKey="value" fill={color || accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  // Cost-efficiency trio — a decrease is the good direction for all three,
  // so Delta gets invert=true (matches the client's reference: a falling
  // cost figure renders green with a down arrow, not red).
  // Cost per LPV/Link Click use fmtINR2 (2 decimals), not fmtINR — these are
  // sub-₹1 figures for this account (e.g. ₹0.48 Cost Per Link Click) and
  // Math.round()'d fmtINR was flooring them straight to ₹0, hiding real
  // nonzero data. Confirmed against the client's own Looker Studio
  // reference report (Aug 2026). CPM stays fmtINR — comfortably >1.
  const costRows = [
    { label: "CPM", value: cpm != null ? fmtINR(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Cost per Landing Page Views", value: costPerLpv != null ? fmtINR2(costPerLpv) : "—", delta: pctDelta(costPerLpv, prevCostPerLpv) },
    { label: "Cost per Link Clicks", value: costPerLinkClick != null ? fmtINR2(costPerLinkClick) : "—", delta: pctDelta(costPerLinkClick, prevCostPerLinkClick) },
  ];

  // Analyst notes — same shared component/API as Sora's Summary tab, but
  // this account is Meta-only (no Google leg), so `combined`/`google` stay
  // null rather than duplicating the Meta figures under "combined".
  const notesFacts = cur ? {
    currency: "INR",
    combined: null,
    meta: { spend: cur.spend, igProfileVisits: cur.igProfileVisits, linkClicks: cur.linkClicks, landingPageViews: cur.landingPageViews, impressions: cur.impressions, reach, newFollowers: cur.newFollowers, ctr, cpm, costPerLandingPageView: costPerLpv, costPerLinkClick },
    google: null,
  } : null;

  return (
    <div>
      {/* Overall Performance / Brand Awareness — same grouped-box pattern as
          Sora/Azerai's Summary tab (PerformanceGroupBox above) */}
      <div className="grid lg:grid-cols-2 gap-5">
        <PerformanceGroupBox
          icon={BarChart3}
          iconColor={C.accent}
          title="Overall Performance"
          cols={2}
          rows={[[
            { label: "Amount Spent", value: fmtINR2(cur.spend), delta: dPct("spend") },
            // Real field is instagram_profile_visits on the facebook (ads)
            // connector — NOT profile_views on the separate instagram
            // (organic) connector. Caught by the client, Aug 2026 — see lib/sem.js.
            { label: "Instagram Profile Visits", value: fmt(cur.igProfileVisits), delta: dPct("igProfileVisits") },
            { label: "Link Clicks", value: fmt(cur.linkClicks), delta: dPct("linkClicks") },
            { label: "Landing Page Views", value: fmt(cur.landingPageViews), delta: dPct("landingPageViews") },
          ]]}
        />
        <PerformanceGroupBox
          icon={Megaphone}
          iconColor="#1877F2"
          title="Brand Awareness"
          cols={2}
          rows={[[
            // Daily NET NEW followers gained, summed over the range — not a
            // running total (Windsor only exposes the lifetime total as a
            // non-historical "today" snapshot — see clientForIgAccount in
            // lib/sem.js). Limited to the last 30 days excluding today by
            // Instagram's API — a selected range older than that reads 0
            // because the data isn't available, not because there was no
            // growth — see the footnote below.
            { label: "Profile Followers (new)", value: fmt(cur.newFollowers ?? 0), delta: dPct("newFollowers") },
            { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
            { label: "Reach", value: fmt(reach), delta: reachDPct },
            { label: "CTR", value: `${ctr.toFixed(2)}%`, delta: pctDelta(ctr, prevCtr) },
          ]]}
        />
      </div>

      {/* Cost efficiency + Landing Page Views trend */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-4">
            {costRows.map((k, i) => (
              <div key={k.label} className={i > 0 ? "mt-4 pt-4" : ""} style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}>
                <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span style={{ color: C.ink, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
                  {k.delta != null && <Delta value={k.delta} suffix="%" invert />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <BarBlock title="Landing Page Views Per Month" data={lpvTrend} color="#22C1D6" />
      </div>

      {/* Clicks + IG visits trend */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBlock title="Total Clicks Per Month" data={clicksTrend} color="#A78BE0" />
        <BarBlock title="Total IG Visit Per Month" data={igVisitsTrend} color="#5FC77E" />
      </div>

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in INR — this account's native billing currency, not converted to USD. Profile Followers is daily net new followers gained (not a running total — Instagram's API only exposes a "today" snapshot for the lifetime total, not a queryable history) from Windsor's separate <code>instagram</code> connector, and is itself limited by Instagram to the last 30 days excluding today — a selected range older than that will read 0 here because the data isn't available, not because there was no growth. IG Profile Visits is <code>instagram_profile_visits</code> on the <code>facebook</code> (Meta Ads) connector — a different connector than Profile Followers, so its history isn't subject to the same 30-day window.
      </p>
    </div>
  );
}

// Tab 2 — Campaign Performance: Ad Spend by market (India vs.
// International), attributed by ad-set name via marketSpendInRange / see
// classifySsfbMarket in lib/sem.js for the bucketing rule and the resolution
// history above SsfbOverallTab — plus the full per-campaign breakdown table
// (Campaign, Amount Spent, Impressions, Reach, CTR, CPC) from the client's
// spec, reusing the same CampaignPerformanceTable built for the generic
// Meta/Google tabs (with INR formatters instead of its USD defaults).
function SsfbCampaignTab({ client, selectedRange, semData }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? marketSpendInRange(sem, selectedRange.from, selectedRange.to) : null;
  const prev = prevWin ? marketSpendInRange(sem, prevWin.from, prevWin.to) : null;
  const dPct = (key) => (cur?.[key] != null && prev?.[key]) ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null;
  const total = cur && cur.india != null && cur.international != null ? cur.india + cur.international : null;
  const share = (v) => (total ? Math.round((v / total) * 100) : null);

  const cards = [
    { label: "Ad Spend — India", key: "india" },
    { label: "Ad Spend — International", key: "international" },
  ];

  const campaigns = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "meta") : [];
  const rangeLabel = selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : "";

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-lg px-5 py-4" style={{ background: `${accent}12`, border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{c.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {cur?.[c.key] != null ? fmtINR(cur[c.key]) : "—"}
              </span>
              {dPct(c.key) != null && <Delta value={dPct(c.key)} suffix="%" />}
            </div>
            {cur?.[c.key] != null && share(cur[c.key]) != null && (
              <div className="mt-1" style={{ color: C.faint, fontSize: 12 }}>{share(cur[c.key])}% of total spend</div>
            )}
          </div>
        ))}
      </div>

      <CampaignPerformanceTable campaigns={campaigns} rangeLabel={rangeLabel} fmtSpend={fmtINR} fmtCpc={fmtINR2} maxHeight={760} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {rangeLabel}. Figures shown in INR, attributed by ad-set name (<code>adset_name</code>) — ad sets naming "India"/"IN" are bucketed as India, everything else (including "International" and the handful of US/UK/GCC-audience ad sets that predate this dashboard's date range) as International, per the client.
      </p>
    </div>
  );
}

// Six Senses Shaharut (SSSH) — same shape as SSFB's Overall tab above
// (scorecards + 3 monthly bar charts), same resolution history (IG
// Profile Followers real via Windsor's separate `instagram` connector,
// handle "sixsenses.shaharut" — see clientForIgAccount in lib/sem.js; IG
// Profile Visits confirmed genuinely no data), but priced in USD (this
// account's native currency, confirmed live) rather than INR, and with NO
// Campaign Performance tab — the client's spec doc for this client has
// only one tab, no India/International market split. A near-duplicate of
// SsfbOverallTab rather than a shared/parameterized component, matching
// this file's existing convention of one component per client even where
// the shape overlaps heavily (see Sora vs. Azerai).
function SsshOverallTab({ client, selectedRange, range, semData, liveReach, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm = cur && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  const costPerLpv = cur && cur.landingPageViews ? cur.spend / cur.landingPageViews : null;
  const prevCostPerLpv = prev && prev.landingPageViews ? prev.spend / prev.landingPageViews : null;
  const costPerLinkClick = cur && cur.linkClicks ? cur.spend / cur.linkClicks : null;
  const prevCostPerLinkClick = prev && prev.linkClicks ? prev.spend / prev.linkClicks : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;

  const days = dateRange(range?.from, range?.to);
  const lpvTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.landingPageViews);
  const clicksTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.linkClicks);
  const igVisitsTrend = monthlyBuckets(sem, range?.from, range?.to, (s, d) => s.daily?.[d]?.meta?.igProfileVisits);
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  const BarBlock = ({ title, data, color }) => (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
      </div>
      <div style={{ height: 220 }} className="px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
            <Bar dataKey="value" fill={color || accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  // Cost-efficiency trio — a decrease is the good direction for all three,
  // so Delta gets invert=true (matches the client's reference: a falling
  // cost figure renders green with a down arrow, not red).
  // Cost per LPV/Link Click use fmtMoney2 (2 decimals), not fmtMoney — same
  // rounds-to-0 bug confirmed live on this tab (Cost per Landing Page Views
  // / Cost per Link Clicks both showed $0), see the matching SSFB fix above.
  // CPM stays fmtMoney — comfortably >1.
  const costRows = [
    { label: "CPM", value: cpm != null ? fmtMoney(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Cost per Landing Page Views", value: costPerLpv != null ? fmtMoney2(costPerLpv) : "—", delta: pctDelta(costPerLpv, prevCostPerLpv) },
    { label: "Cost per Link Clicks", value: costPerLinkClick != null ? fmtMoney2(costPerLinkClick) : "—", delta: pctDelta(costPerLinkClick, prevCostPerLinkClick) },
  ];

  // Analyst notes — same shared component/API as SSFB's Overall tab, same
  // Meta-only shape (this account also has no Google leg), just USD instead
  // of INR.
  const notesFacts = cur ? {
    currency: "USD",
    combined: null,
    meta: { spend: cur.spend, igProfileVisits: cur.igProfileVisits, linkClicks: cur.linkClicks, landingPageViews: cur.landingPageViews, impressions: cur.impressions, reach, newFollowers: cur.newFollowers, ctr, cpm, costPerLandingPageView: costPerLpv, costPerLinkClick },
    google: null,
  } : null;

  return (
    <div>
      {/* Overall Performance / Brand Awareness — same grouped-box pattern as
          Sora/Azerai's Summary tab (PerformanceGroupBox above) */}
      <div className="grid lg:grid-cols-2 gap-5">
        <PerformanceGroupBox
          icon={BarChart3}
          iconColor={C.accent}
          title="Overall Performance"
          cols={2}
          rows={[[
            { label: "Amount Spent", value: fmtMoney2(cur.spend), delta: dPct("spend") },
            // Real field is instagram_profile_visits on the facebook (ads)
            // connector — NOT profile_views on the separate instagram
            // (organic) connector. Caught by the client, Aug 2026 — see lib/sem.js.
            { label: "Instagram Profile Visits", value: fmt(cur.igProfileVisits), delta: dPct("igProfileVisits") },
            { label: "Link Clicks", value: fmt(cur.linkClicks), delta: dPct("linkClicks") },
            { label: "Landing Page Views", value: fmt(cur.landingPageViews), delta: dPct("landingPageViews") },
          ]]}
        />
        <PerformanceGroupBox
          icon={Megaphone}
          iconColor="#1877F2"
          title="Brand Awareness"
          cols={2}
          rows={[[
            // Daily NET NEW followers gained, summed over the range — not a
            // running total (Windsor only exposes the lifetime total as a
            // non-historical "today" snapshot — see clientForIgAccount in
            // lib/sem.js). Limited to the last 30 days excluding today by
            // Instagram's API — a selected range older than that reads 0
            // because the data isn't available, not because there was no
            // growth — see the footnote below.
            { label: "Profile Followers (new)", value: fmt(cur.newFollowers ?? 0), delta: dPct("newFollowers") },
            { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
            { label: "Reach", value: fmt(reach), delta: reachDPct },
            { label: "CTR", value: `${ctr.toFixed(2)}%`, delta: pctDelta(ctr, prevCtr) },
          ]]}
        />
      </div>

      {/* Cost efficiency + Landing Page Views trend */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-4">
            {costRows.map((k, i) => (
              <div key={k.label} className={i > 0 ? "mt-4 pt-4" : ""} style={i > 0 ? { borderTop: `1px solid ${C.line}` } : undefined}>
                <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span style={{ color: C.ink, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
                  {k.delta != null && <Delta value={k.delta} suffix="%" invert />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <BarBlock title="Landing Page Views Per Month" data={lpvTrend} color="#22C1D6" />
      </div>

      {/* Clicks + IG visits trend */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBlock title="Total Clicks Per Month" data={clicksTrend} color="#A78BE0" />
        <BarBlock title="Total IG Visit Per Month" data={igVisitsTrend} color="#5FC77E" />
      </div>

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in USD — this account's native billing currency. Profile Followers is daily net new followers gained (not a running total), limited by Instagram's API to the last 30 days excluding today — a selected range older than that will read 0 here because the data isn't available, not because there was no growth. IG Profile Visits is <code>instagram_profile_visits</code> on the <code>facebook</code> (Meta Ads) connector — a different connector than Profile Followers, so its history isn't subject to the same 30-day window.
      </p>
    </div>
  );
}

// Le Cercle — a single-tab Meta-only SEM report in native VND. Simpler
// shape than SSFB/SSSH: no Profile Followers, no Landing Page Views/Cost
// Per LPV, and no charts at all (the client's spec doc lists none) — but
// adds Messages Conversation / Cost per Messages Conversation, ACCOUNT-
// WIDE across every Meta campaign (unlike Song Saa's identical-looking
// metric, which the client explicitly scoped to just its "ClicktoWhatsapp"
// campaigns — this doc has no such filter for Le Cercle, so every campaign
// counts). Derived from the SAME campaign-level messagingConversations
// field Song Saa's report uses (see lib/sem.js) — just summed across every
// campaign instead of filtering by name, so no new fetch was needed.
function LeCercleOverallTab({ client, selectedRange, range, semData, liveReach, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2";

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpm = cur && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;

  const messagesInRange = (from, to) => {
    if (!from || !to) return null;
    return campaignsInRange(sem, from, to, "meta").reduce((a, c) => a + (c.messagingConversations ?? 0), 0);
  };
  const curMessages = selectedRange ? messagesInRange(selectedRange.from, selectedRange.to) : null;
  const prevMessages = prevWin ? messagesInRange(prevWin.from, prevWin.to) : null;
  const messagesDPct = (prevMessages) ? Math.round(((curMessages - prevMessages) / prevMessages) * 100) : null;
  const costPerMessage = cur && curMessages ? cur.spend / curMessages : null;
  const prevCostPerMessage = prev && prevMessages ? prev.spend / prevMessages : null;

  const kpis = cur ? [
    { label: "Amount Spent",              value: fmtVND(cur.spend),   delta: dPct("spend") },
    // Real field is instagram_profile_visits on the facebook (ads)
    // connector. Caught by the client, Aug 2026 — see lib/sem.js.
    { label: "IG Profile Visits",         value: fmt(cur.igProfileVisits), delta: dPct("igProfileVisits") },
    { label: "Link Clicks",               value: fmt(cur.linkClicks), delta: dPct("linkClicks") },
    { label: "Messages Conversation",     value: fmt(curMessages ?? 0), delta: messagesDPct },
    { label: "Cost per Messages Conversation", value: costPerMessage != null ? fmtVND(costPerMessage) : "—", delta: pctDelta(costPerMessage, prevCostPerMessage) },
    { label: "Impressions",               value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Reach",                     value: fmt(reach),       delta: reachDPct },
    { label: "CTR",                       value: `${ctr.toFixed(2)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "CPM",                       value: cpm != null ? fmtVND(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
  ] : [];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
          </div>
        ))}
      </div>

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Figures shown in VND — this account's native billing currency, not converted to USD. Messages Conversation counts every Meta campaign (no campaign-name filter in this client's spec, unlike Song Saa's identically-named metric). IG Profile Visits is <code>instagram_profile_visits</code> on the <code>facebook</code> (Meta Ads) connector.
      </p>
    </div>
  );
}

function SummaryTab({ client, selectedRange, range, semData, liveReach }) {
  const sem = semData?.[client.name];

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, dayCombined) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, dayCombined) : null;
  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);

  // Derived ratios — computed from the combined totals above (not summed/averaged
  // as their own field) so each stays internally consistent. Any ratio built
  // from spend is unavailable while spendPending (a non-USD account over this
  // range) rather than silently understated.
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  const cpa     = cur && !cur.spendPending && cur.clickBook ? cur.spend / cur.clickBook : null;
  const prevCpa = prev && !prev.spendPending && prev.clickBook ? prev.spend / prev.clickBook : null;
  const cpm     = cur && !cur.spendPending && cur.impressions ? (cur.spend / cur.impressions) * 1000 : null;
  const prevCpm = prev && !prev.spendPending && prev.impressions ? (prev.spend / prev.impressions) * 1000 : null;
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);

  // Per-platform breakout for the analyst-notes AI draft — the combined
  // `cur`/`prev` above don't distinguish Meta from Google, and every note
  // is required to name a specific platform.
  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const curMeta = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const curGoogle = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  // prevMeta/prevGoogle — needed for Reach's and Google Ads Impressions'
  // own deltas (ICKY's Aug 2026 feedback), since the combined prev above
  // (via dayCombined) doesn't carry either figure.
  const prevMeta = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;
  const prevGoogle = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, googleOf) : null;
  // True (deduplicated) reach for this exact range — see the matching
  // comment in MetaTab / fetchMetaReach in lib/sem.js. Falls back to the
  // summed daily meta.reach (a real overcount) while the live fetch is in
  // flight or fails.
  const reach = liveReach?.current?.[client.name] ?? curMeta?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prevMeta?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;
  const googleImpressionsDPct = (curGoogle && prevGoogle && prevGoogle.impressions) ? Math.round(((curGoogle.impressions - prevGoogle.impressions) / prevGoogle.impressions) * 100) : null;

  const notesFacts = cur ? {
    // currency on each leg — Meta and Google can genuinely bill in
    // different currencies for this client (see lib/sem.js), so the AI
    // needs to know which currency each spend figure is actually in rather
    // than assume USD.
    combined: { spend: cur.spendPending ? null : cur.spend, currency: cur.spendPending ? null : cur.currency, clicks: cur.clicks, impressions: cur.impressions, clickBook: cur.clickBook, cpa, cpm, ctr },
    meta: curMeta ? { spend: curMeta.spendPending ? null : curMeta.spend, currency: curMeta.currency, clicks: curMeta.clicks, impressions: curMeta.impressions, clickBook: curMeta.clickBook, reach } : null,
    google: curGoogle ? { spend: curGoogle.spendPending ? null : curGoogle.spend, currency: curGoogle.currency, clicks: curGoogle.clicks, impressions: curGoogle.impressions, clickBook: curGoogle.clickBook, allConversions: curGoogle.allConversions } : null,
  } : null;

  // Combined Amount Spent/CPA/CPM only mean something when Meta and Google
  // actually share one currency this range (see dayCombined/lib/sem.js) —
  // when they don't, spendPending is deterministically true and these read
  // "—" with an explanatory note, rather than a false number. Per-platform
  // figures (MetaTab/GoogleTab) are unaffected and always show real numbers
  // in each platform's own currency.
  const fmtSpend = (v) => fmtByCurrency(v, cur?.currency);
  const spendNote = cur?.spendPending ? "Google and Meta bill in different currencies this range — see the Meta/Google tabs for real figures." : undefined;

  const kpis = cur ? [
    { label: "Amount Spent",  value: cur.spendPending ? "—" : fmtSpend(cur.spend), delta: cur.spendPending ? null : dPct("spend"), note: spendNote },
    { label: "Click Book",    value: fmt(cur.clickBook),   delta: dPct("clickBook") },
    { label: "CPA",           value: cpa != null ? fmtSpend(cpa) : "—", delta: pctDelta(cpa, prevCpa) },
    { label: "Impressions",   value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Total Avg CTR", value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "CPM",           value: cpm != null ? fmtSpend(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Total Clicks",  value: fmt(cur.clicks),      delta: dPct("clicks") },
    // Reach and Google Ads Impressions — ICKY's Aug 2026 feedback (this
    // generic template is shared with Nomad Greenland too — harmless there
    // if either figure just doesn't apply/reads 0).
    { label: "Reach",                 value: fmt(reach), delta: reachDPct },
    { label: "Google Ads Impressions", value: fmt(curGoogle?.impressions ?? 0), delta: googleImpressionsDPct },
  ] : [];

  // Grouped "Overall Performance"/"Brand Awareness" boxes with icon headers
  // — matches ICKY's own Looker Studio reference report exactly (screenshot
  // confirmed, Aug 2026), same pattern as every other custom client's
  // identical layout (SSFB, Sora, Azerai). ICKY-only — Nomad Greenland
  // shares this generic template but has no matching spec for this
  // grouped-box layout, so it keeps the flat KPI grid below (`kpis`).
  // Reach/Google Ads Impressions aren't part of the reference screenshot's
  // two boxes (3 + 4 cards) — added as Brand Awareness's second row rather
  // than dropped, since both are separate, already-confirmed Aug 2026
  // feedback items in their own right.
  const isIcky = client.name === "IC Khao Yai";
  const overallRow1 = cur ? [
    { label: "Amount Spent", value: cur.spendPending ? "—" : fmtSpend(cur.spend), delta: cur.spendPending ? null : dPct("spend"), note: spendNote },
    { label: "Click Book",   value: fmt(cur.clickBook), delta: dPct("clickBook") },
    { label: "CPA",          value: cpa != null ? fmtSpend(cpa) : "—", delta: pctDelta(cpa, prevCpa) },
  ] : [];
  const brandRow1 = cur ? [
    { label: "Impressions",   value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Total Avg CTR", value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "CPM",           value: cpm != null ? fmtSpend(cpm) : "—", delta: pctDelta(cpm, prevCpm) },
    { label: "Clicks",        value: fmt(cur.clicks), delta: dPct("clicks") },
  ] : [];
  const brandRow2 = cur ? [
    { label: "Reach",                  value: fmt(reach), delta: reachDPct },
    { label: "Google Ads Impressions", value: fmt(curGoogle?.impressions ?? 0), delta: googleImpressionsDPct },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const clickBookTrend = days.map((d) => ({ day: fmtDayShort(d), clickBook: dayCombined(sem, d)?.clickBook ?? 0 }));
  const clicksTrend    = days.map((d) => ({ day: fmtDayShort(d), clicks: sem.daily?.[d]?.clicks ?? 0 }));
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";

  // Monthly Click Book / Click bar charts — ICKY's Aug 2026 feedback. Uses
  // `range` (the full available date range), not `selectedRange` — same
  // "always show the whole trend regardless of the KPI cards' date filter"
  // convention as every other client's identical monthly charts.
  const clickBookByMonth = monthlyBuckets(sem, range?.from, range?.to, (s, d) => dayCombined(s, d)?.clickBook ?? 0);
  const clicksByMonth    = monthlyBuckets(sem, range?.from, range?.to, (s, d) => dayCombined(s, d)?.clicks ?? 0);

  // Click Book by Market / Cost per Click Book by Market — ICKY's Aug 2026
  // feedback. campaignMarket (already used by MetaTab/GoogleTab's "Spend by
  // market") parses the 2-letter market code every campaign name is
  // prefixed with; Click Book itself is combined across both platforms —
  // Meta's own clickBook field, Google's allConversions — same formula as
  // dayCombined above, just applied per campaign instead of per day.
  const campaignsAll = selectedRange
    ? [...campaignsInRange(sem, selectedRange.from, selectedRange.to, "meta"), ...campaignsInRange(sem, selectedRange.from, selectedRange.to, "google")]
    : [];
  const clickBookByMarket = (() => {
    const agg = {};
    campaignsAll.forEach((c) => {
      const k = campaignMarket(c.name);
      agg[k] = (agg[k] || 0) + (c.platform === "meta" ? (c.clickBook ?? 0) : (c.allConversions ?? 0));
    });
    return Object.entries(agg).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();
  // Cost per Click Book by Market combines Meta + Google spend per market —
  // only safe when both platforms' campaigns in that market actually share
  // one currency (they don't for IC Khao Yai/Nomad Greenland, see lib/sem.js).
  // Tracks each market's currency set alongside its spend total; a market
  // with more than one currency is DROPPED from this chart entirely (not
  // shown as a wrong blended number) — same "exclude rather than guess"
  // convention as pending-FX campaigns elsewhere in this file. The chart's
  // one shared fmtVal uses whichever currency is actually common across the
  // markets that DO end up shown.
  const costPerClickBookByMarket = (() => {
    const spendAgg = {}; // market -> { total, currencies: Set }
    campaignsAll.forEach((c) => {
      const k = campaignMarket(c.name);
      const entry = spendAgg[k] ??= { total: 0, currencies: new Set() };
      entry.total += c.spend ?? 0;
      if (c.currency) entry.currencies.add(c.currency);
    });
    const rows = clickBookByMarket
      .filter((r) => r.value && spendAgg[r.label]?.currencies.size === 1)
      .map((r) => ({ label: r.label, value: spendAgg[r.label].total / r.value }));
    return { rows, currency: rows.length ? [...spendAgg[rows[0].label].currencies][0] : undefined };
  })();

  return (
    <div>
      {/* KPI cards */}
      {isIcky ? (
        <div className="grid lg:grid-cols-2 gap-5">
          <PerformanceGroupBox icon={BarChart3} iconColor={C.accent} title="Overall Performance" rows={[overallRow1]} />
          <PerformanceGroupBox icon={Megaphone} iconColor="#1877F2" title="Brand Awareness" rows={[brandRow1, brandRow2]} />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${C.accent}12` : "#fff", border: `1px solid ${C.line}` }}>
              <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
                {k.delta != null && <Delta value={k.delta} suffix="%" />}
              </div>
              {k.note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1">{k.note}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Daily trend charts */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Click Book Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clickBookTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="clickBook" name="Click Book" stroke={C.accent} strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color={C.accent} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Clicks Per Day</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 220 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clicksTrend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#1877F2" strokeWidth={2} dot={false} />
                <SelectionBand selectedRange={selectedRange} color="#1877F2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Click Book / Clicks */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Click Book By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clickBookByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Click Book" fill={C.accent} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => fmt(v)} style={{ fill: C.accent, fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Total Clicks By Month</h3>
          </div>
          <div style={{ height: 240 }} className="px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clicksByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Bar dataKey="value" name="Clicks" fill="#1877F2" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={(v) => fmt(v)} style={{ fill: "#1877F2", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Click Book by Market / Cost per Click Book by Market */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBreakdown title="Click Book by Market" rows={clickBookByMarket} fmtVal={fmt} />
        <BarBreakdown title="Cost per Click Book by Market" rows={costPerClickBookByMarket.rows} fmtVal={(v) => fmtByCurrency(v, costPerClickBookByMarket.currency)} />
      </div>

      <AnalystNotes key={`${client.name}-${selectedRange?.from}-${selectedRange?.to}`} client={client} period={selectedRange} facts={notesFacts} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Combined Google Ads + Meta (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Per-platform breakdowns live under the Meta and Google tabs, always in that platform's own real currency. Reach is the true deduplicated Meta figure for this exact range (fetched live, not summed from daily rows). Market is parsed from each campaign's name prefix (e.g. "HK_High intent…") — campaigns that don't match this pattern fall under "Other". Click Book by Market combines both platforms (Meta's own Click Book action, Google's All Conversions) — a real count, safe to combine regardless of currency. Cost per Click Book by Market drops any market where Meta and Google spend don't share one currency, rather than show a blended figure that mixes two currencies into one number.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Meta sub-tab — Meta-only KPI set (Impressions, Reach, Clicks, CTR,  */
/*  Amount Spent, Click Book, Frequency). Sits alongside the Summary    */
/*  sub-tab (the combined Google+Meta view above, formerly "the SEM     */
/*  tab") under the SEM service tab.                                    */
/* ------------------------------------------------------------------ */
function MetaTab({ client, selectedRange, range, semData, liveReach, metaCreatives }) {
  const sem = semData?.[client.name];
  const accent = "#1877F2"; // Meta blue, matches the platform toggle in Summary

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const metaOf = (sem, d) => sem.daily?.[d]?.meta;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, metaOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, metaOf) : null;
  const campaigns = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "meta") : [];

  // This account's own real currency (Meta side) — spend is never converted
  // for this generic tab's clients anymore (IC Khao Yai bills THB here,
  // Nomad Greenland bills EUR — see lib/sem.js), so every $-shaped figure
  // below is formatted in whatever currency Windsor actually reports rather
  // than assuming USD.
  const fmtSpend = (v) => fmtByCurrency(v, cur?.currency);

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  // spendPending can't happen for this tab anymore (no cross-currency
  // mismatch within a single platform) — kept as a defensive fallback, not
  // a live code path.
  const cpcb     = cur && !cur.spendPending && cur.clickBook ? cur.spend / cur.clickBook : null;
  const prevCpcb = prev && !prev.spendPending && prev.clickBook ? prev.spend / prev.clickBook : null;
  // True (deduplicated) reach for this exact range, via the liveReach prop
  // (see fetchMetaReach in lib/sem.js) — falls back to semData's summed
  // daily reach (a real overcount, see that comment) while the live fetch
  // is in flight or fails. Frequency is derived from THIS reach, not
  // pulled as its own field, so it stays consistent with whatever reach
  // figure is actually shown.
  const reach = liveReach?.current?.[client.name] ?? cur?.reach ?? 0;
  const reachPrev = liveReach?.previous?.[client.name] ?? prev?.reach ?? null;
  const reachDPct = reachPrev ? Math.round(((reach - reachPrev) / reachPrev) * 100) : null;
  const freq = cur && reach ? cur.impressions / reach : 0;

  const kpis = cur ? [
    { label: "Amount Spent", value: cur.spendPending ? "—" : fmtSpend(cur.spend), delta: cur.spendPending ? null : dPct("spend") },
    { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Reach",       value: fmt(reach),        delta: reachDPct },
    { label: "Clicks",      value: fmt(cur.clicks),       delta: dPct("clicks") },
    { label: "CTR",         value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "Click Book",  value: fmt(cur.clickBook),   delta: dPct("clickBook") },
    { label: "Cost per Click Book", value: cpcb != null ? fmtSpend(cpcb) : "—", delta: pctDelta(cpcb, prevCpcb) },
    { label: "Frequency",   value: freq.toFixed(2) },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const m = sem.daily?.[d]?.meta; return { day: fmtDayShort(d), spend: m?.spendPending ? null : (m?.spend ?? 0) }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";
  const currencyPrefix = currencySymbol[cur?.currency] ?? "$";

  // c.spend is null only in the (now vanishingly rare) case a campaign row
  // never got a currency at all — excluded from the market/top-campaigns
  // spend numbers below (treated as 0 for the market total, sunk to the
  // bottom of the ranking) rather than shown as a misleading "0".
  const byMarket = (() => {
    const agg = {};
    campaigns.forEach((c) => { const k = campaignMarket(c.name); agg[k] = (agg[k] || 0) + (c.spend ?? 0); });
    return Object.entries(agg).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
            {k.note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1">{k.note}</div>}
          </div>
        ))}
      </div>

      {/* Spend trend + spend by market */}
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Meta</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 240 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="metaSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${currencyPrefix}${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip formatter={(v) => (v == null ? "No data" : fmtSpend(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#metaSpend)" connectNulls={false} />
                <SelectionBand selectedRange={selectedRange} color={accent} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <BarBreakdown title="Spend by market" rows={byMarket} fmtVal={fmtSpend} />
      </div>

      <CampaignPerformanceTable campaigns={campaigns} rangeLabel={selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""} fmtSpend={fmtSpend} fmtCpc={fmtSpend} />

      {/* Ad creatives */}
      <div className="mt-5">
        <CreativesPanel rows={metaCreatives?.[client.name] ?? []} />
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Meta Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Reach is the true deduplicated figure for this exact range (fetched live, not summed from daily rows — see lib/sem.js), and Frequency is derived from it. Click Book counts the Meta Pixel "Search" event (booking-intent searches on the site). Figures shown in this account's real billing currency — not converted to USD.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Google sub-tab — Google Ads-only KPI set (Impressions, Clicks,      */
/*  CTR, Amount Spent, Click Book). Sits alongside Summary and Meta      */
/*  under the SEM service tab.                                          */
/* ------------------------------------------------------------------ */
function GoogleTab({ client, selectedRange, range, semData }) {
  const sem = semData?.[client.name];
  const accent = C.accent; // matches the Google Ads accent used in Summary

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/date range." : "Loading paid-ads data…"}
      </div>
    );
  }

  const googleOf = (sem, d) => sem.daily?.[d]?.google;
  const prevWin = selectedRange ? prevWindow(selectedRange.from, selectedRange.to) : null;
  const cur  = selectedRange ? aggregateRange(sem, selectedRange.from, selectedRange.to, googleOf) : null;
  const prev = prevWin ? aggregateRange(sem, prevWin.from, prevWin.to, googleOf) : null;
  const campaigns = selectedRange ? campaignsInRange(sem, selectedRange.from, selectedRange.to, "google") : [];

  // This account's own real currency (Google side) — see the matching
  // comment on MetaTab's fmtSpend above.
  const fmtSpend = (v) => fmtByCurrency(v, cur?.currency);

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const pctDelta = (v, p) => (v != null && p ? Math.round(((v - p) / p) * 100) : null);
  const ctr     = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const prevCtr = prev && prev.impressions ? (prev.clicks / prev.impressions) * 100 : null;
  // spendPending can't happen for this tab anymore (no cross-currency
  // mismatch within a single platform) — kept as a defensive fallback, not
  // a live code path.
  const cpcb     = cur && !cur.spendPending && cur.clickBook ? cur.spend / cur.clickBook : null;
  const prevCpcb = prev && !prev.spendPending && prev.clickBook ? prev.spend / prev.clickBook : null;

  const kpis = cur ? [
    { label: "Amount Spent", value: cur.spendPending ? "—" : fmtSpend(cur.spend), delta: cur.spendPending ? null : dPct("spend") },
    { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
    { label: "Clicks",      value: fmt(cur.clicks),       delta: dPct("clicks") },
    { label: "CTR",         value: `${ctr.toFixed(1)}%`, delta: pctDelta(ctr, prevCtr) },
    { label: "Click Book",  value: fmt(cur.clickBook),   delta: dPct("clickBook") },
    { label: "Cost per Click Book", value: cpcb != null ? fmtSpend(cpcb) : "—", delta: pctDelta(cpcb, prevCpcb) },
  ] : [];

  const days = dateRange(range?.from, range?.to);
  const trend = days.map((d) => { const m = sem.daily?.[d]?.google; return { day: fmtDayShort(d), spend: m?.spendPending ? null : (m?.spend ?? 0) }; });
  const tickInterval = dayTickInterval(days.length);
  const rangeLabel = range?.from && range?.to ? `${fmtDayShort(range.from)}–${fmtDayShort(range.to)} ${YEAR}` : "";
  const currencyPrefix = currencySymbol[cur?.currency] ?? "$";

  // c.spend is null only in the (now vanishingly rare) case a campaign row
  // never got a currency at all — excluded from the market/top-campaigns
  // spend numbers below (treated as 0 for the market total, sunk to the
  // bottom of the ranking) rather than shown as a misleading "0".
  const byMarket = (() => {
    const agg = {};
    campaigns.forEach((c) => { const k = campaignMarket(c.name); agg[k] = (agg[k] || 0) + (c.spend ?? 0); });
    return Object.entries(agg).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();

  return (
    <div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
              {k.delta != null && <Delta value={k.delta} suffix="%" />}
            </div>
            {k.note && <div style={{ color: C.faint, fontSize: 11 }} className="mt-1">{k.note}</div>}
          </div>
        ))}
      </div>

      {/* Spend trend + spend by market */}
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Amount Spent · Google Ads</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{rangeLabel}</span>
          </div>
          <div style={{ height: 240 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="googleSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} interval={tickInterval} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${currencyPrefix}${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip formatter={(v) => (v == null ? "No data" : fmtSpend(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill="url(#googleSpend)" connectNulls={false} />
                <SelectionBand selectedRange={selectedRange} color={accent} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <BarBreakdown title="Spend by market" rows={byMarket} fmtVal={fmtSpend} />
      </div>

      <CampaignPerformanceTable campaigns={campaigns} rangeLabel={selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""} fmtSpend={fmtSpend} fmtCpc={fmtSpend} />

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Google Ads (via Windsor), {selectedRange ? `${fmtDayLong(selectedRange.from)} – ${fmtDayLong(selectedRange.to)}` : ""}. Click Book counts the "Offer Book Now Click" conversion action specifically — distinct from this account's broader Conversions/All conv. figures. Figures shown in this account's real billing currency — not converted to USD.
      </p>
    </div>
  );
}

// Full campaign-level breakdown for the selected date range — Campaign,
// Amount Spent, Impressions, Reach, CTR, CPC — per the client's Looker
// Studio scorecard spec. Sits on both the Meta and Google tabs (and Six
// Senses Fort Barwara's Campaign Performance tab, see SsfbCampaignTab,
// which passes INR formatters via fmtSpend/fmtCpc instead of the USD
// defaults). Reach is Meta-only (Google Ads doesn't expose it via this
// connector — same as the account-level KPI), shown as "—" there.
// maxHeight (default 420, ~5 rows) is the scrollable list's cap before it
// scrolls internally — SSFB asked for a taller view to reduce scrolling on
// its own Campaign Performance tab, see that call site's override below.
function CampaignPerformanceTable({ campaigns, rangeLabel, fmtSpend = fmtMoney, fmtCpc = fmtRevenue, maxHeight = 420 }) {
  const rows = [...campaigns].sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1));
  return (
    <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Campaign Performance</h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>by amount spent · {rangeLabel}</span>
      </div>
      <div style={{ maxHeight, overflowY: "auto" }}>
        <div
          className="grid items-center px-5 py-2"
          style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 0.8fr 0.8fr", color: C.faint, fontSize: 11.5, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: "#fff" }}
        >
          <span className="uppercase">Campaign</span>
          <span className="uppercase text-right">Amount Spent</span>
          <span className="uppercase text-right">Impressions</span>
          <span className="uppercase text-right">Reach</span>
          <span className="uppercase text-right">CTR</span>
          <span className="uppercase text-right">CPC</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No campaigns in this range.</div>
        ) : rows.map((c, i) => {
          const ctr = c.impressions ? (c.clicks / c.impressions) * 100 : null;
          const cpc = c.clicks && c.spend != null ? c.spend / c.clicks : null;
          return (
            <div key={c.name} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 0.8fr 0.8fr", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate" title={c.name}>{c.name.replace(/^\[Advant\]\s*/, "")}</span>
              <span style={{ color: C.ink, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">{c.spend == null ? "—" : fmtSpend(c.spend)}</span>
              <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{fmt(c.impressions)}</span>
              <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{c.reach ? fmt(c.reach) : "—"}</span>
              <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{ctr != null ? `${ctr.toFixed(2)}%` : "—"}</span>
              <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{cpc != null ? fmtCpc(cpc) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Google "G" mark — inline SVG so it stays self-contained (no external asset). */
function GoogleG({ size = 15 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-label="Google" style={{ display: "block", flexShrink: 0 }}>
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

/* One branded/non-branded query panel: title + description, then a GSC
   performance table (Keyword | Impressions | Clicks), sorted by impressions. */
function QueryPanel({ title, description, rows }) {
  const GRID = "2.2fr 1fr 0.8fr";
  return (
    <div className="rounded-lg overflow-hidden flex flex-col" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold">{title}</h3>
        <p style={{ color: C.muted, fontSize: 12.5 }} className="mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: GRID, color: C.faint, fontSize: 11.5, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
        <span className="uppercase">Keyword</span>
        <span className="uppercase flex items-center justify-end gap-1">Impressions <ChevronDown size={11} /></span>
        <span className="uppercase text-right">Clicks</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No queries this month.</div>
      ) : rows.map((r, i) => (
        <div key={r.k} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: GRID, borderTop: i ? `1px solid ${C.line}` : "none" }}>
          <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate pr-3">{r.k}</span>
          <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(r.impressions)}</span>
          <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(r.clicks)}</span>
        </div>
      ))}
      <div className="px-5 py-3 mt-auto flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <GoogleG size={15} />
        <span style={{ color: C.faint, fontSize: 11.5 }}>Google Search Console</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Organic Visibility Report sub-tab — comprehensive GSC report        */
/*  Live GSC (via /api/organic-report): daily web series + search-type   */
/*  split; summary/funnel/branded tables reuse gscData-derived data.     */
/* ------------------------------------------------------------------ */
const fmtReportDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTH_ABBR[m - 1]} ${d}, ${y}`; };
const fmtPct = (v) => `${(v * 100).toFixed(2)}%`;
// Search-type slice colours (app palette).
const TYPE_META = [
  { key: "web", label: "web search", color: "#0077C8" },
  { key: "image", label: "image search", color: "#1A7A50" },
  { key: "video", label: "video search", color: "#C74E7B" },
  { key: "news", label: "news", color: "#B87A00" },
];
const Hi = ({ children, color = C.accent }) => <span style={{ color, fontWeight: 600 }}>{children}</span>;

const PIE_PALETTE = ["#0077C8", "#1A7A50", "#C74E7B", "#B87A00", "#7A5AC2", "#38B6FF", "#E06C4F", "#4A6A8A"];

function ReportPie({ title, subtitle, data, source = "Google Search Console" }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const items = data.map((d, i) => ({ ...d, key: d.key ?? d.label, color: d.color ?? PIE_PALETTE[i % PIE_PALETTE.length] }));
  return (
    <div className="rounded-lg overflow-hidden flex flex-col" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
        {subtitle && <div style={{ color: C.faint, fontSize: 11.5 }} className="mt-0.5">{subtitle}</div>}
      </div>
      <div className="px-5 py-4 flex items-center gap-4">
        <div style={{ width: 128, height: 128, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie data={items} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={30} outerRadius={62} paddingAngle={1} stroke="none">
                {items.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
            </RePieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0">
          {items.length === 0 ? (
            <span style={{ color: C.muted, fontSize: 12.5 }}>No data.</span>
          ) : items.map((d) => (
            <div key={d.key} className="flex items-center justify-between py-1" style={{ fontSize: 12.5 }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: d.color }} />
                <span style={{ color: C.muted }} className="truncate">{d.label}</span>
              </span>
              <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }} className="shrink-0 pl-2">
                {fmt(d.value)} <span style={{ color: C.faint }}>({((d.value / total) * 100).toFixed(1)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-3 mt-auto flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>{source}</span>
      </div>
    </div>
  );
}

function OrganicVisibility({ client, month, gscData, queryRows }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const moNum = MO_NUM[MONTHS[month]];

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setReport(null);
    fetch(`/api/organic-report?client=${encodeURIComponent(client.name)}&year=${YEAR}&month=${moNum}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.ok) setReport(j); else setError(j.error || "Failed to load report"); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client.name, moNum]);

  if (loading) return <div className="py-16 text-center" style={{ color: C.muted, fontSize: 13 }}><Loader2 size={18} className="animate-spin inline mr-2" />Loading report…</div>;
  if (error) return <div className="rounded-lg px-4 py-3" style={{ border: `1px solid ${C.risk}`, background: "rgba(176,48,48,0.06)", color: C.risk, fontSize: 13 }}>{error}</div>;
  if (!report) return null;

  const { summary, deltas, daily, byType } = report;
  const conv = summary.impressions ? summary.clicks / summary.impressions : 0;

  // Branded / non-branded totals + top non-branded query (from live GSC queries).
  const agg = (branded) => (queryRows || []).filter((r) => isBrandQuery(client.name, r.k) === branded)
    .reduce((a, r) => ({ impr: a.impr + r.impressions, clk: a.clk + r.clicks }), { impr: 0, clk: 0 });
  const bAgg = agg(true), nbAgg = agg(false);
  const brandedRows = (queryRows || []).filter((r) => isBrandQuery(client.name, r.k)).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const nonBrandedRows = (queryRows || []).filter((r) => !isBrandQuery(client.name, r.k)).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const topIntent = [...nonBrandedRows].sort((a, b) => b.clicks - a.clicks)[0];

  // Daily peaks for the narrative.
  const peakClicks = daily.reduce((m, d) => (d.clicks > m.clicks ? d : m), { clicks: -1 });
  const peakImpr = daily.reduce((m, d) => (d.impressions > m.impressions ? d : m), { impressions: -1 });

  const imprPie = TYPE_META.map((t) => ({ ...t, value: byType[t.key]?.impressions || 0 })).filter((d) => d.value > 0);
  const clkPie = TYPE_META.map((t) => ({ ...t, value: byType[t.key]?.clicks || 0 })).filter((d) => d.value > 0);

  const SUMMARY_ROWS = [
    { icon: Eye, label: "Impressions", value: fmt(summary.impressions), delta: deltas.impressions, suffix: "%" },
    { icon: MousePointerClick, label: "Clicks", value: fmt(summary.clicks), delta: deltas.clicks, suffix: "%" },
    { icon: Percent, label: "CTR", value: fmtPct(summary.ctr), delta: deltas.ctr },
    { icon: TrendingUp, label: "Average rank", value: summary.avgPos.toFixed(2), delta: deltas.avgPos, invert: true },
  ];

  const card = { border: `1px solid ${C.line}`, background: "#fff" };
  const gfoot = (
    <div className="px-5 py-3 mt-auto flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
      <GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>Google Search Console</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Title banner */}
      <div className="rounded-lg px-6 py-6" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)` }}>
        <h2 style={{ color: "#fff", fontFamily: "Spectral, Georgia, serif", fontSize: 28 }} className="leading-none">Organic Visibility Report</h2>
      </div>

      {/* Date period · Performance Summary · Summary */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-4 flex-1">
            <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase mb-2">Date period</div>
            <div style={{ color: C.ink, fontSize: 14.5 }} className="font-medium">{fmtReportDate(report.from)} – {fmtReportDate(report.to)}</div>
            <div style={{ color: C.muted, fontSize: 13 }} className="mt-1">Duration: {report.days} days</div>
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Performance Summary</h3>
          </div>
          <div className="px-5 py-3 flex-1">
            {SUMMARY_ROWS.map((r, i) => (
              <div key={r.label} className="flex items-center justify-between py-2" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <span className="flex items-center gap-2.5" style={{ color: C.muted, fontSize: 13.5 }}>
                  <r.icon size={15} style={{ color: C.faint }} /> {r.label}
                </span>
                <span className="flex items-center gap-2">
                  <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="font-medium">{r.value}</span>
                  {r.delta != null && <Delta value={r.delta} suffix={r.suffix} invert={r.invert} />}
                </span>
              </div>
            ))}
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Summary</h3>
          </div>
          <p className="px-5 py-4 flex-1 leading-relaxed" style={{ color: C.muted, fontSize: 12.5 }}>
            Over this period the property recorded <Hi>{fmt(summary.impressions)}</Hi> impressions and <Hi>{fmt(summary.clicks)}</Hi> clicks, a <Hi color={C.healthy}>{fmtPct(summary.ctr)}</Hi> CTR at an average rank of <Hi color={summary.avgPos > 10 ? C.risk : C.healthy}>{summary.avgPos.toFixed(2)}</Hi>.
            {peakClicks.clicks >= 0 && <> Daily performance peaked at <Hi>{fmt(peakClicks.clicks)}</Hi> clicks on {fmtReportDate(peakClicks.date)} and <Hi>{fmt(peakImpr.impressions)}</Hi> impressions on {fmtReportDate(peakImpr.date)}.</>}
            {" "}Branded queries drove <Hi>{fmt(bAgg.impr)}</Hi> impressions and <Hi>{fmt(bAgg.clk)}</Hi> clicks, while non-branded queries generated <Hi>{fmt(nbAgg.impr)}</Hi> impressions and <Hi>{fmt(nbAgg.clk)}</Hi> clicks.
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-lg px-6 py-5" style={card}>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-3">Recommendations</h3>
        <ol className="flex flex-col gap-2.5" style={{ color: C.muted, fontSize: 13 }}>
          {topIntent && (
            <li><span style={{ color: C.faint }}>1.</span> Optimise content for <Hi>non-branded keywords</Hi>, especially “{topIntent.k}”, which drew <Hi color={C.healthy}>{fmt(topIntent.clicks)} clicks</Hi> from {fmt(topIntent.impressions)} impressions — a clear high-intent opportunity.</li>
          )}
          <li>
            <span style={{ color: C.faint }}>{topIntent ? 2 : 1}.</span>{" "}
            {summary.avgPos > 10
              ? <>Average rank of <Hi color={C.risk}>{summary.avgPos.toFixed(2)}</Hi> is below page one — prioritise on-page fixes and internal links on the highest-impression pages to lift visibility.</>
              : <>Average rank of <Hi color={C.healthy}>{summary.avgPos.toFixed(2)}</Hi> is strong — protect it by refreshing the top pages and monitoring for slippage.</>}
          </li>
          {(byType.image?.impressions > 0 || byType.video?.impressions > 0) && (
            <li>
              <span style={{ color: C.faint }}>{topIntent ? 3 : 2}.</span>{" "}
              {byType.image?.impressions > 0
                ? <>Image search drove <Hi color={C.healthy}>{fmt(byType.image.impressions)} impressions</Hi> and {fmt(byType.image.clicks)} clicks — optimise image alt text, filenames and captions to capture more of it.</>
                : <>Video search drove <Hi color={C.healthy}>{fmt(byType.video.impressions)} impressions</Hi> — invest in video schema and thumbnails to convert that exposure.</>}
            </li>
          )}
        </ol>
      </div>

      {/* Impressions / Clicks (web search) */}
      <div className="grid md:grid-cols-2 gap-5">
        {[
          { icon: Eye, label: "Impressions", desc: "How many links to your site a user saw on Google search results.", value: summary.impressions, color: C.accent },
          { icon: MousePointerClick, label: "Clicks", desc: "Count of clicks from a Google search result that landed the user on your property.", value: summary.clicks, color: C.risk },
        ].map((c) => (
          <div key={c.label} className="rounded-lg flex flex-col" style={card}>
            <div className="px-5 py-4 flex-1">
              <div style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{c.label} (Web search)</div>
              <div style={{ color: C.muted, fontSize: 12.5 }} className="mt-1 mb-3 leading-relaxed">{c.desc}</div>
              <div className="flex items-center gap-3">
                <span className="rounded-lg flex items-center justify-center" style={{ width: 40, height: 40, background: c.color }}><c.icon size={20} color="#fff" /></span>
                <div>
                  <div style={{ color: C.faint, fontSize: 11.5 }}>{c.label}</div>
                  <div style={{ color: C.ink, fontSize: 30, fontVariantNumeric: "tabular-nums" }} className="leading-none font-semibold">{fmt(c.value)}</div>
                </div>
              </div>
            </div>
            {gfoot}
          </div>
        ))}
      </div>

      {/* Distributions + funnel */}
      <div className="grid lg:grid-cols-3 gap-5">
        <ReportPie title="Impressions distribution" data={imprPie} />
        <ReportPie title="Clicks distribution" data={clkPie} />
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Impressions and clicks funnel</h3>
          </div>
          <div className="px-5 py-4 flex-1">
            <svg viewBox="0 0 200 74" width="100%" height="84" style={{ display: "block" }}>
              <polygon points="8,6 192,6 122,44 78,44" fill={C.risk} />
              <polygon points="78,44 122,44 108,68 92,68" fill={C.healthy} />
            </svg>
            <div className="mt-3">
              <div className="flex items-center justify-between py-1.5" style={{ fontSize: 12.5 }}>
                <span className="flex items-center gap-2"><span className="rounded-full" style={{ width: 8, height: 8, background: C.risk }} /><span style={{ color: C.muted }}>Impressions</span></span>
                <span style={{ color: C.ink }}>{fmt(summary.impressions)} <span style={{ color: C.faint }}>100.00%</span></span>
              </div>
              <div className="flex items-center justify-between py-1.5" style={{ fontSize: 12.5, borderTop: `1px solid ${C.line}` }}>
                <span className="flex items-center gap-2"><span className="rounded-full" style={{ width: 8, height: 8, background: C.healthy }} /><span style={{ color: C.muted }}>Clicks</span></span>
                <span style={{ color: C.ink }}>{fmt(summary.clicks)} <span style={{ color: C.faint }}>{fmtPct(conv)}</span></span>
              </div>
              <div className="flex items-center justify-between py-1.5" style={{ fontSize: 12.5, borderTop: `1px solid ${C.line}` }}>
                <span style={{ color: C.muted }}>Total conversion rate</span>
                <span style={{ color: C.accent }} className="font-semibold">{fmtPct(conv)}</span>
              </div>
            </div>
          </div>
          {gfoot}
        </div>
      </div>

      {/* Daily clicks & impressions (web search) */}
      <div className="rounded-lg" style={card}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Clicks and impressions (web search)</h3>
          <span className="flex items-center gap-3" style={{ fontSize: 12 }}>
            <span className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 8, height: 8, background: C.risk }} /><span style={{ color: C.muted }}>Clicks</span></span>
            <span className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 8, height: 8, background: C.healthy }} /><span style={{ color: C.muted }}>Impressions</span></span>
          </span>
        </div>
        <div style={{ height: 260 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="oviImpr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.healthy} stopOpacity={0.22} /><stop offset="100%" stopColor={C.healthy} stopOpacity={0} /></linearGradient>
                <linearGradient id="oviClk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.risk} stopOpacity={0.22} /><stop offset="100%" stopColor={C.risk} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => String(Number(d.slice(8)))} tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis yAxisId="clicks" orientation="left" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <YAxis yAxisId="impr" orientation="right" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip labelFormatter={(d) => fmtReportDate(d)} formatter={(v, n) => [fmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area yAxisId="impr" type="monotone" dataKey="impressions" stroke={C.healthy} strokeWidth={2} fill="url(#oviImpr)" />
              <Area yAxisId="clicks" type="monotone" dataKey="clicks" stroke={C.risk} strokeWidth={2} fill="url(#oviClk)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {gfoot}
      </div>

      {/* Branded / non-branded performance */}
      <div className="grid md:grid-cols-2 gap-5">
        <QueryPanel title="Branded Queries" description="Terms include your brand, product names, or any variations of them." rows={brandedRows} />
        <QueryPanel title="Non-Branded Queries" description="Terms related to your products or services that users might search for before they have a specific brand in mind." rows={nonBrandedRows} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Organic Traffic Report sub-tab — comprehensive GA4 report           */
/*  Live GA4 (via /api/traffic-report): summary, channel + device        */
/*  splits, daily sessions / new-users bars, and page performance.       */
/* ------------------------------------------------------------------ */
const GA4_SRC = "Google Analytics 4";
const fmtRevenue = (n) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function DailyBars({ title, legend, data, dataKey, color }) {
  return (
    <div className="rounded-lg" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
        <span className="flex items-center gap-1.5" style={{ fontSize: 12 }}><span className="rounded-full" style={{ width: 8, height: 8, background: color }} /><span style={{ color: C.muted }}>{legend}</span></span>
      </div>
      <div style={{ height: 236 }} className="px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => String(Number(d.slice(8)))} tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
            <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
            <Tooltip labelFormatter={(d) => fmtReportDate(d)} formatter={(v, n) => [fmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Bar dataKey={dataKey} name={legend} fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}><GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>{GA4_SRC}</span></div>
    </div>
  );
}

function OrganicTraffic({ client, month }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const moNum = MO_NUM[MONTHS[month]];

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setReport(null);
    fetch(`/api/traffic-report?client=${encodeURIComponent(client.name)}&year=${YEAR}&month=${moNum}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.ok) setReport(j); else setError(j.error || "Failed to load report"); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client.name, moNum]);

  if (loading) return <div className="py-16 text-center" style={{ color: C.muted, fontSize: 13 }}><Loader2 size={18} className="animate-spin inline mr-2" />Loading report…</div>;
  if (error) return <div className="rounded-lg px-4 py-3" style={{ border: `1px solid ${C.risk}`, background: "rgba(176,48,48,0.06)", color: C.risk, fontSize: 13 }}>{error}</div>;
  if (!report) return null;

  const { summary, deltas, byChannel, byDevice, daily, pages } = report;
  const chanTotal = byChannel.reduce((a, c) => a + c.value, 0) || 1;
  const topChan = byChannel[0] || { label: "—", value: 0 };
  const topDev = byDevice[0] || { label: "—", value: 0 };
  const engPages = [...pages].sort((a, b) => b.engagement - a.engagement).slice(0, 2);

  const card = { border: `1px solid ${C.line}`, background: "#fff" };
  const gfoot = (
    <div className="px-5 py-3 mt-auto flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
      <GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>{GA4_SRC}</span>
    </div>
  );

  const SUMMARY_ROWS = [
    { icon: Activity, label: "Sessions", value: fmt(summary.sessions), delta: deltas.sessions, suffix: "%" },
    { icon: Users, label: "Total users", value: fmt(summary.totalUsers), delta: deltas.totalUsers, suffix: "%" },
    { icon: UserPlus, label: "New users", value: fmt(summary.newUsers), delta: deltas.newUsers, suffix: "%" },
    { icon: Target, label: "Conversions", value: fmt(summary.conversions), delta: deltas.conversions, suffix: "%" },
    { icon: DollarSign, label: "Total revenue", value: fmtRevenue(summary.revenue), delta: deltas.revenue, suffix: "%" },
  ];
  const BIG = [
    { icon: Activity, label: "Sessions", value: summary.sessions, color: C.accent },
    { icon: Users, label: "Total users", value: summary.totalUsers, color: C.healthy },
    { icon: UserPlus, label: "New users", value: summary.newUsers, color: C.risk },
  ];
  const PGRID = "2.2fr 1fr 1fr 1fr 1.1fr";

  return (
    <div className="flex flex-col gap-5">
      {/* Title banner */}
      <div className="rounded-lg px-6 py-6" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)` }}>
        <h2 style={{ color: "#fff", fontFamily: "Spectral, Georgia, serif", fontSize: 28 }} className="leading-none">Organic Traffic Report</h2>
      </div>

      {/* Date period · Performance Summary · Summary */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-4 flex-1">
            <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase mb-2">Date period</div>
            <div style={{ color: C.ink, fontSize: 14.5 }} className="font-medium">{fmtReportDate(report.from)} – {fmtReportDate(report.to)}</div>
            <div style={{ color: C.muted, fontSize: 13 }} className="mt-1">Duration: {report.days} days</div>
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Performance Summary</h3>
          </div>
          <div className="px-5 py-2 flex-1">
            {SUMMARY_ROWS.map((r, i) => (
              <div key={r.label} className="flex items-center justify-between py-2" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <span className="flex items-center gap-2.5" style={{ color: C.muted, fontSize: 13.5 }}><r.icon size={15} style={{ color: C.faint }} /> {r.label}</span>
                <span className="flex items-center gap-2">
                  <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="font-medium">{r.value}</span>
                  {r.delta != null && <Delta value={r.delta} suffix={r.suffix} />}
                </span>
              </div>
            ))}
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Summary</h3>
          </div>
          <p className="px-5 py-4 flex-1 leading-relaxed" style={{ color: C.muted, fontSize: 12.5 }}>
            Over this period the property drew <Hi>{fmt(summary.sessions)}</Hi> sessions from <Hi>{fmt(summary.totalUsers)}</Hi> total users (<Hi>{fmt(summary.newUsers)}</Hi> new), producing <Hi color={C.healthy}>{fmt(summary.conversions)}</Hi> conversions and <Hi color={C.healthy}>{fmtRevenue(summary.revenue)}</Hi> in revenue. <Hi>{topChan.label}</Hi> was the leading channel at <Hi>{Math.round((topChan.value / chanTotal) * 100)}%</Hi> of sessions, and <Hi>{topDev.label}</Hi> led device categories.
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-lg px-6 py-5" style={card}>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-3">Recommendations</h3>
        <ol className="flex flex-col gap-2.5" style={{ color: C.muted, fontSize: 13 }}>
          {byChannel[1] && (
            <li><span style={{ color: C.faint }}>1.</span> The <Hi>{byChannel[0].label}</Hi> and <Hi>{byChannel[1].label}</Hi> channels drive <Hi color={C.healthy}>{fmt(byChannel[0].value + byChannel[1].value)} sessions</Hi> combined — study their sources and messaging to replicate what works.</li>
          )}
          <li><span style={{ color: C.faint }}>{byChannel[1] ? 2 : 1}.</span> <Hi>{topDev.label}</Hi> users contribute <Hi color={C.healthy}>{fmt(topDev.value)} sessions</Hi> — prioritise that device experience to lift engagement and conversions.</li>
          {engPages.length >= 2 && (
            <li><span style={{ color: C.faint }}>{byChannel[1] ? 3 : 2}.</span> High-engagement pages like <Hi>{engPages[0].page}</Hi> (<Hi color={C.healthy}>{(engPages[0].engagement * 100).toFixed(1)}%</Hi>) and <Hi>{engPages[1].page}</Hi> (<Hi color={C.healthy}>{(engPages[1].engagement * 100).toFixed(1)}%</Hi>) deserve clear calls-to-action to convert that interest.</li>
          )}
        </ol>
      </div>

      {/* Big numbers */}
      <div className="grid md:grid-cols-3 gap-5">
        {BIG.map((c) => (
          <div key={c.label} className="rounded-lg flex flex-col" style={card}>
            <div className="px-5 py-4 flex-1 flex items-center gap-3">
              <span className="rounded-lg flex items-center justify-center" style={{ width: 40, height: 40, background: c.color }}><c.icon size={20} color="#fff" /></span>
              <div>
                <div style={{ color: C.faint, fontSize: 11.5 }}>{c.label}</div>
                <div style={{ color: C.ink, fontSize: 28, fontVariantNumeric: "tabular-nums" }} className="leading-none font-semibold">{fmt(c.value)}</div>
              </div>
            </div>
            {gfoot}
          </div>
        ))}
      </div>

      {/* Channel + device pies */}
      <div className="grid md:grid-cols-2 gap-5">
        <ReportPie title="Sessions by Channel" subtitle="Sessions / Session default channel grouping" data={byChannel} source={GA4_SRC} />
        <ReportPie title="Sessions by Device Category" subtitle="Sessions / Device category" data={byDevice} source={GA4_SRC} />
      </div>

      {/* Daily bars */}
      <DailyBars title="Monthly Sessions Trend" legend="Sessions" data={daily} dataKey="sessions" color={C.accent} />
      <DailyBars title="New Users Month on Month" legend="New users" data={daily} dataKey="newUsers" color={C.accent} />

      {/* Page performance */}
      <div className="rounded-lg overflow-hidden" style={card}>
        <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Page Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 620 }}>
            <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: PGRID, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
              <span className="uppercase">Page path and screen class</span>
              <span className="uppercase text-right">Sessions</span>
              <span className="uppercase text-right">Total users</span>
              <span className="uppercase text-right">New users</span>
              <span className="uppercase text-right">Engagement rate</span>
            </div>
            {pages.length === 0 ? (
              <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No page data this month.</div>
            ) : pages.map((p, i) => (
              <div key={p.page} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: PGRID, borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <span style={{ color: C.accent, fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} className="truncate pr-3" title={p.page}>{p.page}</span>
                <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(p.sessions)}</span>
                <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(p.users)}</span>
                <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(p.newUsers)}</span>
                <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{(p.engagement * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
        {gfoot}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Organic Conversions Report sub-tab — comprehensive GA4 report        */
/*  Live GA4 (via /api/conversions-report): conversions/revenue summary,  */
/*  device + session revenue pies, daily series, and page / traffic /     */
/*  geo / engagement breakdowns.                                          */
/* ------------------------------------------------------------------ */
function ConvTable({ title, colLabel, rows, mono }) {
  const GRID = "2.2fr 1fr 1fr 1.2fr";
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }}>
          <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: GRID, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span className="uppercase">{colLabel}</span>
            <span className="uppercase text-right">Conversions</span>
            <span className="uppercase text-right">Transactions</span>
            <span className="uppercase text-right">Total revenue</span>
          </div>
          {rows.length === 0 ? (
            <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No data this month.</div>
          ) : rows.map((r, i) => (
            <div key={r.label} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: GRID, borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span className="truncate pr-3" style={{ color: mono ? C.accent : C.ink, fontSize: 12.5, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit" }} title={r.label}>{r.label}</span>
              <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(r.conversions)}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(r.transactions)}</span>
              <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtRevenue(r.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}><GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>{GA4_SRC}</span></div>
    </div>
  );
}

function OrganicConversions({ client, month }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const moNum = MO_NUM[MONTHS[month]];

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setReport(null);
    fetch(`/api/conversions-report?client=${encodeURIComponent(client.name)}&year=${YEAR}&month=${moNum}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.ok) setReport(j); else setError(j.error || "Failed to load report"); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client.name, moNum]);

  if (loading) return <div className="py-16 text-center" style={{ color: C.muted, fontSize: 13 }}><Loader2 size={18} className="animate-spin inline mr-2" />Loading report…</div>;
  if (error) return <div className="rounded-lg px-4 py-3" style={{ border: `1px solid ${C.risk}`, background: "rgba(176,48,48,0.06)", color: C.risk, fontSize: 13 }}>{error}</div>;
  if (!report) return null;

  const { summary, daily, byDevice, bySession, pages, traffic, geo, engagement } = report;
  const topSession = bySession[0], topDevice = byDevice[0];
  const revPages = [...pages].sort((a, b) => b.revenue - a.revenue).slice(0, 2);

  const card = { border: `1px solid ${C.line}`, background: "#fff" };
  const gfoot = (
    <div className="px-5 py-3 mt-auto flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
      <GoogleG size={14} /><span style={{ color: C.faint, fontSize: 11.5 }}>{GA4_SRC}</span>
    </div>
  );

  const SUMMARY_ROWS = [
    { icon: Target, label: "Conversions", value: fmt(summary.conversions) },
    { icon: Receipt, label: "Transactions", value: fmt(summary.transactions) },
    { icon: DollarSign, label: "Total revenue", value: fmtRevenue(summary.revenue) },
    { icon: Activity, label: "Event count", value: fmt(summary.eventCount) },
    { icon: ShoppingCart, label: "Ecommerce purchases", value: fmt(summary.ecommercePurchases) },
    { icon: Banknote, label: "Purchase revenue", value: fmtRevenue(summary.purchaseRevenue) },
  ];
  const BIG = [
    { icon: Target, label: "Conversions", value: fmt(summary.conversions), color: C.accent },
    { icon: DollarSign, label: "Total revenue", value: fmtRevenue(summary.revenue), color: C.healthy },
    { icon: Activity, label: "Event count", value: fmt(summary.eventCount), color: C.accent },
    { icon: ShoppingCart, label: "Ecommerce purchases", value: fmt(summary.ecommercePurchases), color: C.watch },
    { icon: Banknote, label: "Purchase revenue", value: fmtRevenue(summary.purchaseRevenue), color: C.healthy },
    { icon: Receipt, label: "Transactions", value: fmt(summary.transactions), color: C.risk },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Title banner */}
      <div className="rounded-lg px-6 py-6" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)` }}>
        <h2 style={{ color: "#fff", fontFamily: "Spectral, Georgia, serif", fontSize: 28 }} className="leading-none">Organic Conversions Report</h2>
      </div>

      {/* Date period · Performance Summary · Summary */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-4 flex-1">
            <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase mb-2">Date period</div>
            <div style={{ color: C.ink, fontSize: 14.5 }} className="font-medium">{fmtReportDate(report.from)} – {fmtReportDate(report.to)}</div>
            <div style={{ color: C.muted, fontSize: 13 }} className="mt-1">Duration: {report.days} days</div>
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Performance Summary</h3>
          </div>
          <div className="px-5 py-2 flex-1">
            {SUMMARY_ROWS.map((r, i) => (
              <div key={r.label} className="flex items-center justify-between py-2" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <span className="flex items-center gap-2.5" style={{ color: C.muted, fontSize: 13.5 }}><r.icon size={15} style={{ color: C.faint }} /> {r.label}</span>
                <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="font-medium">{r.value}</span>
              </div>
            ))}
          </div>
          {gfoot}
        </div>

        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Summary</h3>
          </div>
          <p className="px-5 py-4 flex-1 leading-relaxed" style={{ color: C.muted, fontSize: 12.5 }}>
            Over this period the property recorded <Hi>{fmt(summary.conversions)}</Hi> conversions and <Hi color={C.healthy}>{fmtRevenue(summary.revenue)}</Hi> in total revenue, from <Hi>{fmt(summary.eventCount)}</Hi> events.
            {summary.transactions > 0
              ? <> Ecommerce contributed <Hi>{fmt(summary.ecommercePurchases)}</Hi> purchases across <Hi>{fmt(summary.transactions)}</Hi> transactions ({fmtRevenue(summary.purchaseRevenue)} purchase revenue).</>
              : <> No ecommerce transactions were recorded — conversions here are engagement/lead events rather than purchases.</>}
            {topSession && <> {topSession.label} was the top revenue source at <Hi color={C.healthy}>{fmtRevenue(topSession.value)}</Hi>.</>}
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-lg px-6 py-5" style={card}>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-3">Recommendations</h3>
        <ol className="flex flex-col gap-2.5" style={{ color: C.muted, fontSize: 13 }}>
          {topSession
            ? <li><span style={{ color: C.faint }}>1.</span> Invest more in <Hi>{topSession.label}</Hi>, which generated <Hi color={C.healthy}>{fmtRevenue(topSession.value)}</Hi> in revenue — the strongest converting source this period.</li>
            : <li><span style={{ color: C.faint }}>1.</span> No revenue is attributed yet — set up GA4 ecommerce / key-event values so conversions can be tied to revenue by source.</li>}
          {topDevice && <li><span style={{ color: C.faint }}>2.</span> <Hi>{topDevice.label}</Hi> leads revenue at <Hi color={C.healthy}>{fmtRevenue(topDevice.value)}</Hi> — prioritise that device experience to protect and grow it.</li>}
          {revPages.length >= 2 && revPages[0].revenue > 0 && (
            <li><span style={{ color: C.faint }}>{topDevice ? 3 : 2}.</span> Pages <Hi>{revPages[0].label}</Hi> ({fmtRevenue(revPages[0].revenue)}) and <Hi>{revPages[1].label}</Hi> ({fmtRevenue(revPages[1].revenue)}) drive the most revenue — replicate their journeys across lower-performing pages.</li>
          )}
        </ol>
      </div>

      {/* Big numbers (6) */}
      <div className="grid md:grid-cols-3 gap-5">
        {BIG.map((c) => (
          <div key={c.label} className="rounded-lg flex flex-col" style={card}>
            <div className="px-5 py-4 flex-1 flex items-center gap-3">
              <span className="rounded-lg flex items-center justify-center" style={{ width: 40, height: 40, background: c.color }}><c.icon size={20} color="#fff" /></span>
              <div className="min-w-0">
                <div style={{ color: C.faint, fontSize: 11.5 }} className="truncate">{c.label}</div>
                <div style={{ color: C.ink, fontSize: 26, fontVariantNumeric: "tabular-nums" }} className="leading-none font-semibold truncate">{c.value}</div>
              </div>
            </div>
            {gfoot}
          </div>
        ))}
      </div>

      {/* Revenue pies */}
      <div className="grid md:grid-cols-2 gap-5">
        <ReportPie title="Revenue by Device Category" subtitle="Total revenue / Device category" data={byDevice} source={GA4_SRC} />
        <ReportPie title="Revenue by Session" subtitle="Total revenue / Source / medium" data={bySession} source={GA4_SRC} />
      </div>

      {/* Daily conversions area */}
      <div className="rounded-lg" style={card}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Conversions</h3>
          <span className="flex items-center gap-1.5" style={{ fontSize: 12 }}><span className="rounded-full" style={{ width: 8, height: 8, background: C.accent }} /><span style={{ color: C.muted }}>Conversions</span></span>
        </div>
        <div style={{ height: 220 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <defs><linearGradient id="ocvConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.22} /><stop offset="100%" stopColor={C.accent} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => String(Number(d.slice(8)))} tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip labelFormatter={(d) => fmtReportDate(d)} formatter={(v, n) => [fmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="conversions" stroke={C.accent} strokeWidth={2} fill="url(#ocvConv)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {gfoot}
      </div>

      {/* Conversions by month (daily bars) */}
      <DailyBars title="Organic Conversions by Month" legend="Conversions" data={daily} dataKey="conversions" color={C.accent} />

      {/* Revenue & transactions (dual-axis bars) */}
      <div className="rounded-lg" style={card}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Organic Revenue and Transactions Month on Month</h3>
          <span className="flex items-center gap-3" style={{ fontSize: 12 }}>
            <span className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 8, height: 8, background: C.accent }} /><span style={{ color: C.muted }}>Total revenue</span></span>
            <span className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 8, height: 8, background: C.healthy }} /><span style={{ color: C.muted }}>Transactions</span></span>
          </span>
        </div>
        <div style={{ height: 236 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => String(Number(d.slice(8)))} tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
              <YAxis yAxisId="rev" orientation="left" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <YAxis yAxisId="txn" orientation="right" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip labelFormatter={(d) => fmtReportDate(d)} formatter={(v, n) => [n === "Total revenue" ? fmtRevenue(v) : fmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar yAxisId="rev" dataKey="revenue" name="Total revenue" fill={C.accent} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="txn" dataKey="transactions" name="Transactions" fill={C.healthy} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {gfoot}
      </div>

      {/* Breakdown tables */}
      <ConvTable title="Page Paths Performance" colLabel="Page path and screen class" rows={pages} mono />
      <ConvTable title="Traffic acquisition conversions" colLabel="Session source / medium" rows={traffic} />
      <ConvTable title="Demographics conversions" colLabel="Country" rows={geo} />
      <ConvTable title="Engagement conversions" colLabel="Event name" rows={engagement} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary sub-tab — headline metrics rolled up from GSC + GA4          */
/*  Live via /api/summary-report (visibility + traffic + conversion       */
/*  headline metrics + KPI progress + recommendations).                   */
/* ------------------------------------------------------------------ */
const niceGoal = (v) => {
  if (v <= 0) return 100;
  const target = v / 0.8;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  for (const s of [1, 2, 2.5, 5]) if (s * mag >= target) return s * mag;
  return 10 * mag;
};

function SectionBanner({ title }) {
  return (
    <div className="rounded-lg px-6 py-3.5" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)` }}>
      <h2 style={{ color: "#fff", fontFamily: "Spectral, Georgia, serif", fontSize: 20 }} className="leading-none">{title}</h2>
    </div>
  );
}

function KpiBar({ label, value, color }) {
  const goal = niceGoal(value);
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ color: C.ink, fontSize: 13 }} className="font-medium">{label}</span>
        <span style={{ color: C.muted, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{fmt(value)} / {fmt(goal)}</span>
      </div>
      <div className="rounded-full" style={{ background: C.bg, height: 9 }}>
        <div className="rounded-full" style={{ width: `${Math.max(3, pct)}%`, height: 9, background: color }} />
      </div>
    </div>
  );
}

function SummaryMetric({ icon: Icon, label, desc, value, color, source, delta, suffix = "%", invert = false }) {
  return (
    <div className="rounded-lg flex flex-col" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="px-5 py-4 flex-1">
        <div style={{ color: C.ink, fontSize: 14 }} className="font-semibold">{label}</div>
        {desc && <div style={{ color: C.muted, fontSize: 12 }} className="mt-1 mb-3 leading-relaxed">{desc}</div>}
        <div className="flex items-center gap-3 mt-2">
          <span className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: color }}><Icon size={19} color="#fff" /></span>
          <div className="min-w-0">
            <div style={{ color: C.faint, fontSize: 11.5 }} className="truncate">{label}</div>
            <div className="flex items-center gap-2">
              <div style={{ color: C.ink, fontSize: 25, fontVariantNumeric: "tabular-nums" }} className="leading-none font-semibold truncate">{value}</div>
              {delta != null && <Delta value={delta} suffix={suffix} invert={invert} />}
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <GoogleG size={13} /><span style={{ color: C.faint, fontSize: 11 }}>{source}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Overview/Summary data helpers — the same GSC clicks trend,   */
/*  content-opportunity, and action-plan logic feeds both the Overview  */
/*  sub-tab and the Summary sub-tab (which will absorb Overview later). */
/* ------------------------------------------------------------------ */
const MO_NUM_BY_LABEL = MO_NUM; // alias — see the canonical MO_NUM near MONTHS above

// liveGscFor() returns real Windsor data for this client/month when connected,
// falling back to the mock gsc() function for unconnected properties.
function liveGscFor(client, month, gscData) {
  const moNum = MO_NUM_BY_LABEL[MONTHS[month]];
  const live = gscData?.[client.name]?.[moNum];
  if (!live) return gsc(client, month); // mock fallback
  return {
    clicks: live.clicks,
    impressions: live.impressions,
    ctr: live.ctr,
    avgPos: live.avgPos,
    // Index coverage not in Windsor GSC data — keep mock estimate
    indexed: gsc(client, month).indexed,
    issues: gsc(client, month).issues,
    buckets: gsc(client, month).buckets,
  };
}

// Real Windsor clicks series when available, mock traffic array otherwise.
function clicksTrendFor(client, month, gscData) {
  const isLive = !!gscData?.[client.name];
  const cs = isLive
    ? MONTHS.map((mo) => gscData[client.name][MO_NUM_BY_LABEL[mo]]?.clicks ?? 0)
    : series(client);
  const chartData = cs.map((v, i) => ({ month: MONTHS[i], clicks: v }));
  return { isLive, cs, chartData };
}

// Content opportunities: queries with proven demand (impressions) leaking
// clicks because they sit below the top of page 1. Returns the month's top 2
// blog-intent picks. Uses real GSC queries when connected, else mock keywords.
function blogPicksFor(client, month, gscData) {
  const curQueries = gscData?.[client.name]?.[MO_NUM_BY_LABEL[MONTHS[month]]]?.topQueries ?? null;
  const round1 = (n) => Math.round(n * 10) / 10;
  const opps = (curQueries
    ? curQueries.map((row) => {
        const k = row.k ?? row.q;
        const pos = row.position;
        const impressions = Math.round(row.impressions ?? 0);
        const curClicks = Math.round(row.clicks ?? 0);
        return { k, pos, impressions, curClicks, page: row.page ?? null };
      })
    : client.keywords.map((kw) => {
        const pos = kwPos(kw, month);
        const impressions = kw.v;
        return { k: kw.k, pos, impressions, curClicks: Math.round(impressions * ctrFor(pos)), page: null };
      })
  )
    .map(({ k, pos, impressions, curClicks, page }) => {
      const gap = Math.max(0, Math.round(impressions * ctrFor(Math.min(pos, 3))) - curClicks);
      const intent = intentOf(k);
      return { k, pos: round1(pos), impressions, gap, intent, url: page || pageUrl(client.domain, k, intent) };
    })
    .filter((o) => o.gap > 0 && !isNoiseQuery(o.k) && !isBrandQuery(client.name, o.k))
    .sort((a, b) => b.gap - a.gap);
  return opps.filter((o) => o.intent === "blog").slice(0, 2);
}

// Commercial/optimise-intent queries sitting just off page one (position
// 4-20) — "almost there" pages worth an on-page push. Powers the Generate
// Report feature's "Where the interest is" section. Mirrors blogPicksFor's
// shape but filtered to intent === "optimise" instead of "blog".
function nearPageOneFor(client, month, gscData) {
  const curQueries = gscData?.[client.name]?.[MO_NUM_BY_LABEL[MONTHS[month]]]?.topQueries ?? null;
  const round1 = (n) => Math.round(n * 10) / 10;
  const rows = (curQueries
    ? curQueries.map((row) => {
        const k = row.k ?? row.q;
        const pos = row.position;
        const impressions = Math.round(row.impressions ?? 0);
        return { k, pos, impressions, page: row.page ?? null };
      })
    : client.keywords.map((kw) => {
        const pos = kwPos(kw, month);
        return { k: kw.k, pos, impressions: kw.v, page: null };
      })
  )
    .map(({ k, pos, impressions, page }) => {
      const intent = intentOf(k);
      return { k, pos: round1(pos), impressions, intent, url: page || pageUrl(client.domain, k, intent) };
    })
    .filter((o) =>
      o.pos > 3 && o.pos <= 20 &&
      o.intent === "optimise" &&
      isReadableQuery(o.k) &&
      !isNoiseQuery(o.k) &&
      !isBrandQuery(client.name, o.k)
    )
    .sort((a, b) => b.impressions - a.impressions);
  return rows.slice(0, 3);
}

// Action plan for one month — active tasks plus delivered/upcoming counts.
// Off-page work is no longer part of the program — excluded from plans.
// Live tasks from Supabase (seo_action_items) when available; mock otherwise.
function actionPlanFor(client, month, actionData) {
  const planSource = actionData?.[client.name] ?? ACTION_PLANS[client.name] ?? [];
  const plan = planSource.filter((t) => t.cat !== "Off-page");
  const { active, deliveredToDate, upcoming } = monthlyPlan(plan, month);
  return { plan, active, deliveredToDate, upcoming };
}

// "Organic clicks · GSC" trend card — shared by Overview and Summary.
function OrganicClicksTrendCard({ chartData, momValue, month }) {
  return (
    <div className="rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
          Organic clicks · GSC
        </h3>
        <Delta value={momValue} suffix="% MoM" size="lg" />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gClicksTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.18} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.line} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              fontSize: 13,
              color: C.ink,
            }}
            labelStyle={{ color: C.muted }}
            formatter={(v) => [fmt(v), "Clicks"]}
          />
          <Area type="monotone" dataKey="clicks" stroke={C.accent} strokeWidth={2} fill="url(#gClicksTrend)" />
          <ReferenceDot x={MONTHS[month]} y={chartData[month]?.clicks} r={4.5} fill={C.accent} stroke="#fff" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// "Content opportunities" card — shared by Overview and Summary.
function ContentOpportunitiesCard({ blogPicks, blogDrafts, client, month }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
          Content opportunities
        </h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>High-impression queries leaking clicks</span>
      </div>

      <div className="px-5 py-4" style={{ background: C.bg }}>
        <div style={{ color: C.muted, fontSize: 11.5, letterSpacing: "0.04em" }} className="uppercase font-medium mb-2.5">
          Suggested posts · {MONTH_FULL[MONTHS[month]]} {YEAR} · 2 / month
        </div>
        {blogPicks.length ? (
          <div className="grid md:grid-cols-2 gap-3">
            {blogPicks.map((o) => {
              const draft = blogDrafts?.[client.name]?.[o.k.toLowerCase()];
              const draftLabel = draft
                ? { planned: "Draft planned", drafting: "Draft ready", live: "Published" }[draft.status] || "Draft ready"
                : null;
              return (
                <div key={o.k} className="rounded-lg p-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                  <span
                    className="rounded-full px-1.5 py-0.5"
                    style={{ background: "rgba(31,78,74,0.1)", color: C.accent, fontSize: 10, fontWeight: 600 }}
                  >
                    BLOG POST
                  </span>
                  <div style={{ color: C.ink, fontFamily: "Spectral, Georgia, serif", fontSize: 17 }} className="mt-2 leading-snug">
                    {draft?.title || titleCase(o.k)}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12.5 }} className="mt-1">
                    Write a post targeting “{o.k}” · {fmt(o.impressions)} impressions/mo
                  </div>
                  <div style={{ color: C.healthy, fontSize: 13 }} className="mt-1.5 font-medium">
                    +{fmt(o.gap)} clicks/mo potential
                  </div>
                  {draft?.url ? (
                    <a
                      href={draft.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2.5 rounded-full px-2.5 py-1 hover:opacity-80 transition-opacity"
                      style={{ background: "rgba(0,119,200,0.1)", color: C.accent, fontSize: 11.5, fontWeight: 600 }}
                    >
                      <ExternalLink size={11} style={{ flexShrink: 0 }} />
                      {draftLabel} — view
                    </a>
                  ) : (
                    <div style={{ color: C.faint, fontSize: 11.5 }} className="mt-2.5">
                      No draft yet
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: C.muted, fontSize: 13 }}>
            No clear blog opportunity in the tracked set this month — the full GSC query export would surface more.
          </p>
        )}
      </div>
    </div>
  );
}

// Action-plan card, scoped to the selected month — shared by Overview and Summary.
function ActionPlanCard({ plan, active, deliveredToDate, upcoming, month }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
          {MONTH_FULL[MONTHS[month]]} {YEAR} action plan
        </h3>
        <span style={{ color: C.faint, fontSize: 12.5 }}>
          {deliveredToDate} of {plan.length} delivered to date
        </span>
      </div>

      {active.length === 0 && (
        <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13.5 }}>
          No active work scheduled in {MONTHS[month]}.
          {upcoming > 0 && ` ${upcoming} ${upcoming === 1 ? "task is" : "tasks are"} queued to begin in later months.`}
        </div>
      )}

      {active.map(({ task: a, status: st }, row) => {
        const done = st === "done";
        const TIcon = done ? Check : Clock;
        return (
          <div
            key={a.task}
            className="flex items-start gap-3.5 px-5 py-3.5"
            style={{ borderTop: row ? `1px solid ${C.line}` : "none" }}
          >
            {/* Status for this month */}
            <span
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{
                border: `1px solid ${done ? "transparent" : C.line}`,
                background: done ? "rgba(74,124,89,0.12)" : "rgba(184,137,60,0.12)",
                color: TASK[st].color,
                fontSize: 12,
                width: 116,
                justifyContent: "center",
                fontWeight: 500,
              }}
            >
              <TIcon size={13} strokeWidth={2.25} />
              {done ? "Delivered" : "In progress"}
            </span>

            {/* Task body */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span style={{ color: PRIORITY[a.priority].color, fontSize: 11 }} className="font-semibold uppercase tracking-wide">
                  {PRIORITY[a.priority].label}
                </span>
                <span style={{ color: C.faint }}>·</span>
                <span style={{ color: C.faint, fontSize: 11, letterSpacing: "0.04em" }} className="uppercase">
                  {a.cat}
                </span>
              </div>
              <div
                style={{
                  color: done ? C.faint : C.ink,
                  fontSize: 14.5,
                  textDecoration: done ? "line-through" : "none",
                }}
                className="font-medium leading-snug"
              >
                {a.task}
              </div>
              <div style={{ color: C.muted, fontSize: 13 }} className="mt-1 leading-snug">
                {a.detail}
              </div>
            </div>
          </div>
        );
      })}

      {active.length > 0 && upcoming > 0 && (
        <div
          className="px-5 py-2.5"
          style={{ borderTop: `1px solid ${C.line}`, background: C.bg, color: C.faint, fontSize: 12.5 }}
        >
          {upcoming} more {upcoming === 1 ? "task" : "tasks"} queued for later months
        </div>
      )}
    </div>
  );
}

function OrganicSummary({ client, month, gscData, actionData, blogDrafts, aiData }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [reportView, setReportView] = useState(null);
  const moNum = MO_NUM[MONTHS[month]];

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setReport(null);
    fetch(`/api/summary-report?client=${encodeURIComponent(client.name)}&year=${YEAR}&month=${moNum}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.ok) setReport(j); else setError(j.error || "Failed to load summary"); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client.name, moNum]);

  // Close any open report view when switching client/month underneath it.
  useEffect(() => { setReportView(null); setGenError(null); }, [client.name, moNum]);

  if (loading) return <div className="py-16 text-center" style={{ color: C.muted, fontSize: 13 }}><Loader2 size={18} className="animate-spin inline mr-2" />Loading summary…</div>;
  if (error) return <div className="rounded-lg px-4 py-3" style={{ border: `1px solid ${C.risk}`, background: "rgba(176,48,48,0.06)", color: C.risk, fontSize: 13 }}>{error}</div>;
  if (!report) return null;

  const { visibility: v, traffic: t, conversions: c, deltas: d, topPages, topDevice, topChannel } = report;
  const GSC = "Google Search Console", GA4 = "Google Analytics 4";
  const card = { border: `1px solid ${C.line}`, background: "#fff" };

  // Same trend/opportunity/action-plan data as the Overview sub-tab — pulled
  // in here so Summary can absorb these cards once Overview is retired.
  const { chartData } = clicksTrendFor(client, month, gscData);
  const blogPicks = blogPicksFor(client, month, gscData);
  const nearPageOneQueries = nearPageOneFor(client, month, gscData);
  const { plan, active, deliveredToDate, upcoming } = actionPlanFor(client, month, actionData);
  const monthLabel = MONTH_FULL[MONTHS[month]];

  async function handleGenerateReport() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: client.name,
          year: YEAR,
          month: moNum,
          summary: report,
          blogPicks,
          nearPageOneQueries,
          actionPlan: { plan, active, deliveredToDate, upcoming },
          ai: aiData?.[client.name] || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to generate report");
      setReportView(json.report);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Title + Date period */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-lg px-6 flex items-center" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)`, minHeight: 120 }}>
          <h2 style={{ color: "#fff", fontFamily: "Spectral, Georgia, serif", fontSize: 26 }} className="leading-none">{client.name} · Report Summary</h2>
        </div>
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-4 flex-1">
            <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase mb-2">Date period</div>
            <div style={{ color: C.ink, fontSize: 14.5 }} className="font-medium">{fmtReportDate(report.from)} – {fmtReportDate(report.to)}</div>
            <div style={{ color: C.muted, fontSize: 13 }} className="mt-1">Duration: {report.days} days</div>
          </div>
          <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}><GoogleG size={13} /><span style={{ color: C.faint, fontSize: 11 }}>GSC + GA4</span></div>
        </div>
      </div>

      {/* Summary narrative + KPI progress */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-lg" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}><h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold">Summary</h3></div>
          <p className="px-5 py-4 leading-relaxed" style={{ color: C.muted, fontSize: 13 }}>
            This month the property recorded a conversion rate of <Hi color={C.healthy}>{fmtPct(c.conversionRate)}</Hi> ({fmt(c.conversions)} conversions across {fmt(t.sessions)} sessions), signalling {c.conversionRate >= 0.5 ? "strong" : "steady"} engagement.
            {c.revenue > 0
              ? <> Total revenue reached <Hi color={C.healthy}>{fmtRevenue(c.revenue)}</Hi> across {fmt(c.transactions)} transactions.</>
              : <> No purchase revenue is tracked for this property, so conversions reflect engagement/lead events.</>}
            {" "}Organic search sits at an average position of <Hi color={v.avgPos > 10 ? C.risk : C.healthy}>{v.avgPos.toFixed(2)}</Hi>{v.avgPos > 10 ? ", indicating room to improve keyword rankings." : "."}
          </p>
        </div>
        <div className="rounded-lg flex flex-col" style={card}>
          <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}><h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold">SEO KPIs Progress</h3></div>
          <div className="px-5 py-4 flex-1 flex flex-col justify-center gap-3.5">
            <KpiBar label="Impressions" value={v.impressions} color={C.risk} />
            <KpiBar label="Clicks" value={v.clicks} color={C.accent} />
            <KpiBar label="Sessions" value={t.sessions} color="#C74E7B" />
            <KpiBar label="Conversions" value={c.conversions} color={C.watch} />
          </div>
          <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${C.line}` }}><GoogleG size={13} /><span style={{ color: C.faint, fontSize: 11 }}>GSC + GA4</span></div>
        </div>
      </div>

      {/* Organic clicks trend — same card as Overview, folded into Summary
          ahead of Overview's removal. */}
      <OrganicClicksTrendCard chartData={chartData} momValue={Math.round(momPct(client, month))} month={month} />

      {/* Traffic Metrics */}
      <SectionBanner title="Traffic Metrics" />
      <div className="grid md:grid-cols-3 gap-5">
        <SummaryMetric icon={Activity} label="Sessions" desc="The number of sessions that began on your site or app." value={fmt(t.sessions)} color={C.accent} source={GA4} delta={d.traffic.sessions} />
        <SummaryMetric icon={Users} label="Total users" desc="Distinct users who logged at least one event." value={fmt(t.totalUsers)} color={C.healthy} source={GA4} delta={d.traffic.totalUsers} />
        <SummaryMetric icon={UserPlus} label="New users" desc="Distinct new users who logged at least one event." value={fmt(t.newUsers)} color={C.risk} source={GA4} delta={d.traffic.newUsers} />
      </div>

      {/* Visibility Metrics */}
      <SectionBanner title="Visibility Metrics" />
      <div className="grid md:grid-cols-3 gap-5">
        <SummaryMetric icon={Eye} label="Impressions" desc="How many links to your site a user saw on Google search results." value={fmt(v.impressions)} color={C.accent} source={GSC} delta={d.visibility.impressions} />
        <SummaryMetric icon={MousePointerClick} label="Clicks" desc="Clicks from a Google search result that landed on your property." value={fmt(v.clicks)} color={C.risk} source={GSC} delta={d.visibility.clicks} />
        <SummaryMetric icon={TrendingUp} label="Avg. organic position" desc="Organic Google search average position (lower is better)." value={v.avgPos.toFixed(2)} color={C.watch} source={GSC} delta={d.visibility.avgPos} suffix="" invert />
      </div>

      {/* Conversion Metrics */}
      <SectionBanner title="Conversion Metrics" />
      <div className="grid md:grid-cols-3 gap-5">
        <SummaryMetric icon={Target} label="Conversions" desc="The count of conversion events." value={fmt(c.conversions)} color={C.accent} source={GA4} delta={d.conversions.conversions} />
        <SummaryMetric icon={Percent} label="Conversion rate" desc="Conversions as a share of sessions." value={fmtPct(c.conversionRate)} color={C.healthy} source={GA4} delta={d.conversions.conversionRate} suffix="" />
        <SummaryMetric icon={DollarSign} label="Total revenue" desc="Revenue from purchases, subscriptions and advertising." value={fmtRevenue(c.revenue)} color={C.healthy} source={GA4} delta={d.conversions.revenue} />
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        <SummaryMetric icon={ShoppingCart} label="Ecommerce purchases" desc="The number of times users completed a purchase." value={fmt(c.ecommercePurchases)} color={C.watch} source={GA4} />
        <SummaryMetric icon={Banknote} label="Average purchase revenue" desc="Average revenue per transaction." value={fmtRevenue(c.avgPurchaseRevenue)} color={C.healthy} source={GA4} />
        <SummaryMetric icon={Receipt} label="Transactions" desc="The count of transaction events with purchase revenue." value={fmt(c.transactions)} color={C.risk} source={GA4} />
      </div>

      {/* Recommendations */}
      <div className="rounded-lg px-6 py-5" style={card}>
        <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-3">Recommendations</h3>
        <ol className="flex flex-col gap-2.5" style={{ color: C.muted, fontSize: 13 }}>
          {topPages.length >= 2 && (
            <li><span style={{ color: C.faint }}>1.</span> Optimise content and CTAs on <Hi>{topPages[0].page}</Hi> and <Hi>{topPages[1].page}</Hi>, given their engagement (<Hi color={C.healthy}>{(topPages[0].engagement * 100).toFixed(1)}%</Hi> and {(topPages[1].engagement * 100).toFixed(1)}%){topPages[0].revenue > 0 && <> and {fmtRevenue(topPages[0].revenue)} revenue from {topPages[0].page}</>}.</li>
          )}
          {topDevice && topDevice.value > 0 && (
            <li><span style={{ color: C.faint }}>{topPages.length >= 2 ? 2 : 1}.</span> Allocate more budget to <Hi>{topDevice.label}</Hi>-focused campaigns — it contributes the highest revenue at <Hi color={C.healthy}>{fmtRevenue(topDevice.value)}</Hi>.</li>
          )}
          {topChannel && (
            <li><span style={{ color: C.faint }}>{[topPages.length >= 2, topDevice && topDevice.value > 0].filter(Boolean).length + 1}.</span> Investigate the <Hi>{topChannel.label}</Hi> channel, which accounts for <Hi color={C.healthy}>{fmt(topChannel.value)} sessions</Hi>, to formalise or further leverage that traffic.</li>
          )}
        </ol>
      </div>

      {/* Content opportunities + action plan — same cards as Overview,
          folded into Summary ahead of Overview's removal. */}
      <ContentOpportunitiesCard blogPicks={blogPicks} blogDrafts={blogDrafts} client={client} month={month} />
      <ActionPlanCard plan={plan} active={active} deliveredToDate={deliveredToDate} upcoming={upcoming} month={month} />

      {/* Generate Report — narrative monthly report, written from this same
          data via an LLM (see lib/report-narrative.js), plus daily GSC and
          geography data fetched fresh server-side. */}
      <div className="rounded-lg px-6 py-6 flex items-center justify-between gap-4 flex-wrap" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div>
          <h3 style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-1">Generate report</h3>
          <p style={{ color: C.muted, fontSize: 13 }}>
            A narrative, printable {monthLabel} {YEAR} report for {client.name} — written fresh from this month's data.
          </p>
          {genError && <p style={{ color: C.risk, fontSize: 12.5 }} className="mt-1.5">{genError}</p>}
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          className="shrink-0 inline-flex items-center gap-2 rounded-full px-5 py-2.5 transition-opacity"
          style={{ background: C.accent, color: "#fff", fontSize: 13.5, fontWeight: 500, opacity: generating ? 0.6 : 1 }}
        >
          {generating ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          {generating ? "Writing report…" : "Generate report"}
        </button>
      </div>

      {reportView && (
        <ReportView client={client} monthLabel={monthLabel} report={reportView} onClose={() => setReportView(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Generate Report — a narrative, printable monthly report. The button   */
/*  lives at the bottom of the Summary tab; ReportView renders full-screen */
/*  over the dashboard and isolates itself for window.print() via the     */
/*  #amn-report-print / .no-print convention below.                       */
/* ------------------------------------------------------------------ */
const NEXT_STEP_TAG = {
  "Quick win":  C.healthy,
  "Build":      C.watch,
  "Groundwork": C.faint,
};

function ReportKpi({ label, value, delta, suffix = "", invert = false }) {
  return (
    <div>
      <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.04em" }} className="uppercase mb-1.5">{label}</div>
      <div style={{ color: C.ink, fontSize: 26, fontVariantNumeric: "tabular-nums" }} className="font-semibold mb-1">{value}</div>
      {delta != null && <Delta value={delta} suffix={suffix} invert={invert} size="sm" />}
    </div>
  );
}

function ReportSection({ no, title, alt, children }) {
  return (
    <section className="px-8 py-10 md:px-14 md:py-14" style={{ background: alt ? C.bg : "#fff", borderTop: `1px solid ${C.line}` }}>
      <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace" }} className="uppercase mb-3">{no}</div>
      <h2 style={{ color: C.ink, fontFamily: "Spectral, Georgia, serif", fontSize: 28 }} className="mb-4 leading-tight">{title}</h2>
      {children}
    </section>
  );
}

function ReportView({ client, monthLabel, report, onClose }) {
  const { facts, daily, geo, narrative } = report;
  const h = facts.headline;

  const dailyData = daily.map((d) => ({ date: d.date.slice(8, 10), clicks: d.clicks, impressions: d.impressions }));
  const aiTrend = facts.aiSearch ? MONTHS.map((m, i) => ({ month: m, sessions: facts.aiSearch.totals?.series?.[i] ?? 0 })) : [];

  return (
    <div
      id="amn-report-print"
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "#fff" }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #amn-report-print, #amn-report-print * { visibility: visible; }
          #amn-report-print { position: absolute; inset: 0; width: 100%; height: auto; overflow: visible; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Controls — hidden on print */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between px-6 py-3" style={{ background: C.ink, color: "#fff" }}>
        <span className="flex items-center gap-2" style={{ fontSize: 13.5 }}>
          <FileText size={15} /> {client.name} · {monthLabel} {facts.year} report
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5"
            style={{ background: C.accent, color: "#fff", fontSize: 12.5, fontWeight: 500 }}
          >
            <Printer size={13} /> Print / Save as PDF
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12.5, fontWeight: 500 }}
          >
            <X size={13} /> Close
          </button>
        </div>
      </div>

      {/* Masthead */}
      <header className="px-8 py-10 md:px-14 md:py-14" style={{ background: `linear-gradient(120deg, ${C.accent}, #003E6B)`, color: "#fff" }}>
        <div className="flex items-center gap-2 mb-6" style={{ fontSize: 13, opacity: 0.85 }}>
          <GoogleG size={14} /> {client.domain} · Organic Search · Google
        </div>
        <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 40 }} className="leading-none mb-3">{monthLabel} Search Report</h1>
        <p style={{ fontSize: 14.5, opacity: 0.85 }}>
          Organic search performance for {monthLabel} {facts.year}, measured against the prior month. Prepared by the AMN.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-8 py-8 md:px-14" style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <ReportKpi label="Visits from Google" value={fmt(h.visits)} delta={h.visitsDelta} suffix="%" />
        <ReportKpi label="Times shown in search" value={fmt(h.impressions)} delta={h.impressionsDelta} suffix="%" />
        <ReportKpi label="Look-to-visit rate" value={fmtPct(h.ctr)} />
        <ReportKpi label="Avg. position" value={h.avgPos.toFixed(2)} delta={h.avgPosDelta} invert />
      </div>

      {/* 00 — Report Summary */}
      <ReportSection no="00 — Report Summary" title={`${client.name} · Report Summary`}>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }} className="max-w-3xl">{narrative.summary}</p>
      </ReportSection>

      {/* 01 — Daily performance */}
      <ReportSection no="01 — Daily performance" title="How the month unfolded day by day" alt>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }} className="max-w-3xl mb-5">{narrative.dailyPerformance}</p>
        <div className="rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gReportDaily" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="clicks" name="Visits" stroke={C.accent} strokeWidth={2} fill="url(#gReportDaily)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {(facts.bestDay || facts.peakImpressionsDay) && (
          <div className="flex flex-wrap gap-8 mt-5">
            {facts.bestDay && (
              <div><span style={{ color: C.ink, fontSize: 20 }} className="font-semibold tabular-nums">{fmt(facts.bestDay.clicks)}</span> <span style={{ color: C.muted, fontSize: 13 }}>visits on {facts.bestDay.date}, the best day</span></div>
            )}
            {facts.peakImpressionsDay && (
              <div><span style={{ color: C.ink, fontSize: 20 }} className="font-semibold tabular-nums">{fmt(facts.peakImpressionsDay.impressions)}</span> <span style={{ color: C.muted, fontSize: 13 }}>impressions on {facts.peakImpressionsDay.date}, the peak</span></div>
            )}
          </div>
        )}
      </ReportSection>

      {/* 02 — Where the interest is */}
      <ReportSection no="02 — Where the interest is" title="Where the interest is">
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }} className="max-w-3xl mb-5">{narrative.interestNarrative}</p>
        {facts.nearPageOneQueries.length > 0 && (
          <div className="rounded-lg overflow-hidden mb-4" style={{ border: `1px solid ${C.line}` }}>
            <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.line}`, background: C.bg }}>
              <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Booking-intent searches, close to page one</h3>
            </div>
            {facts.nearPageOneQueries.map((q, i) => (
              <div key={q.k} className="flex items-center justify-between px-5 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <div>
                  <div style={{ color: C.ink, fontSize: 13.5 }} className="font-medium">{q.k}</div>
                  <div style={{ color: C.faint, fontSize: 12 }}>Shown {fmt(q.impressions)} times · position {q.pos}</div>
                </div>
                <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(0,119,200,0.1)", color: C.accent, fontSize: 11, fontWeight: 600 }}>
                  {q.pos <= 10 ? "Almost there" : "Close to page 1"}
                </span>
              </div>
            ))}
          </div>
        )}
        {narrative.interestWarning && (
          <div className="rounded-lg px-4 py-3" style={{ background: "rgba(184,122,0,0.08)", border: `1px solid rgba(184,122,0,0.3)`, color: C.watch, fontSize: 13 }}>
            <b>Worth fixing first.</b> {narrative.interestWarning}
          </div>
        )}
      </ReportSection>

      {/* 03 — Geography */}
      {geo.length > 0 && (
        <ReportSection no="03 — Where guests are searching from" title="Where guests are searching from" alt>
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={geo} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="country" tick={{ fill: C.ink, fontSize: 11.5 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="sessions" fill={C.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>{narrative.geography}</p>
          </div>
        </ReportSection>
      )}

      {/* 04 — AI search */}
      {facts.aiSearch && (
        <ReportSection no="04 — AI search" title="Fewer or more? How AI referrals moved">
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }} className="max-w-3xl mb-5">{narrative.aiSearch}</p>
          <div className="rounded-lg p-5 mb-4" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={aiTrend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="sessions" name="Sessions from AI tools" stroke={C.ink} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {narrative.aiSearchNote && (
            <div className="rounded-lg px-4 py-3" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.muted, fontSize: 13 }}>
              <b>Read with care.</b> {narrative.aiSearchNote}
            </div>
          )}
        </ReportSection>
      )}

      {/* 05 — What we'll do next */}
      <ReportSection no="05 — What we'll do next" title="What we'll do next" alt>
        <div className="grid md:grid-cols-2 gap-4">
          {(narrative.nextSteps || []).map((step, i) => (
            <div
              key={i}
              className="rounded-lg p-5"
              style={{ border: `1px solid ${C.line}`, background: "#fff", gridColumn: i === (narrative.nextSteps.length - 1) && narrative.nextSteps.length % 2 === 1 ? "1 / -1" : undefined }}
            >
              <span
                className="inline-block rounded-full px-2.5 py-1 mb-3"
                style={{ background: `${NEXT_STEP_TAG[step.tag] || C.faint}1A`, color: NEXT_STEP_TAG[step.tag] || C.faint, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em" }}
              >
                {(step.tag || "").toUpperCase()}
              </span>
              <div style={{ color: C.faint, fontSize: 12 }} className="mb-1">{i + 1}</div>
              <h3 style={{ color: C.ink, fontSize: 15.5 }} className="font-semibold mb-1.5">{step.title}</h3>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </ReportSection>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-8 py-6 md:px-14" style={{ borderTop: `1px solid ${C.line}`, color: C.faint, fontSize: 12 }}>
        <span>Prepared by the AMN</span>
        <span>{client.name} · {monthLabel} {facts.year}</span>
        <span>Source: Google Search Console + Google Analytics 4 (Windsor.ai)</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyword Explorer sub-tab — live SEMrush shortlist from a page URL   */
/*  POSTs a URL to /api/keyword-explorer, which reads seed terms from   */
/*  the page and returns ~10 high-volume keyword ideas (keyword,        */
/*  volume, KD) sorted by volume. On-demand only — no caching.          */
/* ------------------------------------------------------------------ */
function KeywordExplorer({ client }) {
  const [url, setUrl] = useState(`https://${client.domain}/`);
  const [seeds, setSeeds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keywords, setKeywords] = useState(null);
  const [usedSeeds, setUsedSeeds] = useState(null);

  // Re-prefill and clear results when switching properties.
  useEffect(() => {
    setUrl(`https://${client.domain}/`);
    setSeeds("");
    setKeywords(null);
    setError(null);
    setUsedSeeds(null);
  }, [client.domain]);

  const run = async () => {
    if (!url.trim() || loading) return;
    setLoading(true); setError(null); setKeywords(null);
    const typedSeeds = seeds.trim();
    try {
      const res = await fetch("/api/keyword-explorer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), database: "us", seeds: typedSeeds }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong");
      setKeywords(json.keywords);
      setUsedSeeds(json.seeds || []);
      // If the analyst didn't type seeds, surface the auto-detected ones so
      // they can refine and re-run.
      if (!typedSeeds && json.seeds?.length) setSeeds(json.seeds.join(", "));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // KD bands: <30 easy (green), 30–59 moderate, 60+ hard (red).
  const kdColor = (kd) => (kd == null ? C.faint : kd < 30 ? C.healthy : kd < 60 ? C.watch : C.risk);

  return (
    <div>
      <p style={{ color: C.muted, fontSize: 12.5, maxWidth: 620 }} className="leading-relaxed mb-4">
        Enter a page URL to get ~10 general, high-volume keyword ideas for its SEO strategy — pulled live from SEMrush, sorted by monthly search volume. Seed terms are auto-detected from the page; edit them to steer the results (e.g. “khao yai resort”).
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex-1" style={{ minWidth: 280 }}>
          <span style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase block mb-1.5">Page URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="https://example.com/page"
            className="w-full rounded-lg px-3 py-2 outline-none"
            style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontSize: 13.5 }}
          />
        </label>
        <label className="flex-1" style={{ minWidth: 220 }}>
          <span style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase block mb-1.5">Seed keyword(s)</span>
          <input
            value={seeds}
            onChange={(e) => setSeeds(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="auto-detected — or type your own, comma-separated"
            className="w-full rounded-lg px-3 py-2 outline-none"
            style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontSize: 13.5 }}
          />
        </label>
        <label>
          <span style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase block mb-1.5">Market</span>
          <select
            value="us"
            disabled
            className="rounded-lg px-3 py-2 outline-none"
            style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontSize: 13.5 }}
          >
            <option value="us">United States</option>
          </select>
        </label>
        <button
          onClick={run}
          disabled={loading || !url.trim()}
          className="rounded-lg px-4 py-2 font-semibold inline-flex items-center gap-2 transition-opacity"
          style={{ background: C.accent, color: "#fff", fontSize: 13.5, opacity: loading || !url.trim() ? 0.55 : 1 }}
        >
          {loading ? <><Loader2 size={15} className="animate-spin" /> Searching…</> : <><Search size={15} /> Get keywords</>}
        </button>
      </div>

      {/* Inline error */}
      {error && (
        <div className="rounded-lg px-4 py-3 mb-5" style={{ border: `1px solid ${C.risk}`, background: "rgba(176,48,48,0.06)", color: C.risk, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Empty result */}
      {keywords && keywords.length === 0 && !error && (
        <div className="rounded-lg p-6 text-center" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13 }}>
          No keyword ideas found for that page.
        </div>
      )}

      {/* Which seeds produced these results */}
      {keywords && keywords.length > 0 && usedSeeds?.length > 0 && (
        <div style={{ color: C.faint, fontSize: 12 }} className="mb-2">
          Seeds used: <span style={{ color: C.muted }}>{usedSeeds.join(", ")}</span>
        </div>
      )}

      {/* Results table */}
      {keywords && keywords.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: "2.6fr 0.9fr 0.9fr", color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span className="uppercase">Keyword</span>
            <span className="uppercase text-right">Volume</span>
            <span className="uppercase text-right" title="SEMrush keyword difficulty — 0 easy, 100 hard">KD</span>
          </div>
          {keywords.map((k, i) => (
            <div key={k.keyword} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "2.6fr 0.9fr 0.9fr", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate pr-3">{k.keyword}</span>
              <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(k.volume)}</span>
              <span className="text-right font-medium" style={{ color: kdColor(k.kd), fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{k.kd == null ? "—" : k.kd}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI Search sub-tab — generative-engine referral traffic (GA4)        */
/*  ChatGPT/Gemini/Claude/Perplexity/Copilot referrals landing on the   */
/*  property; Bing shown on its own line. Referral traffic only — Google */
/*  AI Overviews are not separable in GSC and are excluded. Live via     */
/*  /api/ai (lib/ai.js). series arrays are indexed to MONTHS (Mar–Jun).  */
/* ------------------------------------------------------------------ */
const ENGINE_COLOR = {
  chatgpt: "#10A37F", gemini: "#4285F4", claude: "#CC785C",
  perplexity: "#20808D", copilot: "#0A6ED1", bing: "#0C7DBB",
};

function AiKpi({ label, value, sub }) {
  return (
    <div className="rounded-lg p-4" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
      <div style={{ color: C.faint, fontSize: 11, letterSpacing: "0.05em" }} className="uppercase mb-1.5">{label}</div>
      <div style={{ color: C.ink, fontSize: 24, fontVariantNumeric: "tabular-nums" }} className="leading-none font-semibold truncate">{value}</div>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}

function AiSearch({ client, aiData, month }) {
  const ai = aiData?.[client.name] || null;
  const moNum = MO_NUM[MONTHS[month]];
  const monthLabel = MONTH_FULL[MONTHS[month]];

  if (aiData == null)
    return <div className="py-12 text-center" style={{ color: C.muted, fontSize: 13 }}>Loading AI referral data…</div>;

  const mo = ai?.byMonth?.[moNum] || null;

  if (!ai || !mo || mo.totals.sessions === 0)
    return (
      <div className="rounded-lg p-8 text-center" style={{ border: `1px dashed ${C.line}`, background: "#fff" }}>
        <Sparkles size={22} color={C.faint} className="mx-auto mb-2" />
        <div style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-1">No AI-engine referrals this month</div>
        <div style={{ color: C.muted, fontSize: 13 }}>No sessions from ChatGPT, Gemini, Claude, Perplexity or Copilot landed on this property in {monthLabel} {YEAR}.</div>
      </div>
    );

  const t = ai.totals; // full Mar–Jul series, kept for the trend chart only
  const prevSessions = month > 0 ? t.series[month - 1] : null;
  const mom = prevSessions ? Math.round(((t.series[month] - prevSessions) / prevSessions) * 100) : 0;
  const activeEngines = mo.engines.filter((e) => e.sessions > 0 || e.conversions > 0);
  const top = mo.engines[0];
  const trend = MONTHS.map((label, i) => ({ month: label, sessions: t.series[i] }));
  const share = (n) => (mo.totals.sessions ? Math.round((n / mo.totals.sessions) * 100) : 0);
  const GRID = "1.5fr 0.8fr 0.9fr 1.4fr 108px";

  const EngineRow = ({ e }) => (
    <div className="grid items-center px-5 py-3" style={{ gridTemplateColumns: GRID, borderTop: `1px solid ${C.line}` }}>
      <span className="flex items-center gap-2 min-w-0">
        <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: ENGINE_COLOR[e.key] || C.accent }} />
        <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate">{e.label}</span>
      </span>
      <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(e.sessions)}</span>
      <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(e.conversions)}</span>
      <span className="flex items-center gap-2 pl-3">
        <div className="flex-1 rounded-full" style={{ background: C.bg, height: 7 }}>
          <div className="rounded-full" style={{ width: `${Math.max(4, share(e.sessions))}%`, height: 7, background: ENGINE_COLOR[e.key] || C.accent }} />
        </div>
        <span style={{ color: C.faint, fontSize: 11.5, width: 30 }} className="text-right tabular-nums">{share(e.sessions)}%</span>
      </span>
      <span className="flex justify-end"><Sparkline series={e.series} w={96} h={26} /></span>
    </div>
  );

  return (
    <div>
      {/* Scope note + live badge */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <p style={{ color: C.muted, fontSize: 12.5, maxWidth: 620 }} className="leading-relaxed">
          Referral sessions from generative AI engines — visitors who clicked a citation link in an AI answer and landed on the site (GA4, by session source). Google AI Overview impressions aren’t separable in Search Console and are excluded.
        </p>
        <span className="rounded-full px-2 py-0.5 font-medium shrink-0" style={{ fontSize: 10.5, letterSpacing: "0.04em", background: "rgba(87,168,110,0.15)", color: C.healthy }}>Live GA4</span>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <AiKpi label={`AI sessions · ${monthLabel}`} value={fmt(mo.totals.sessions)} sub={<Delta value={mom} suffix="%" size="lg" />} />
        <AiKpi label={`AI conversions · ${monthLabel}`} value={fmt(mo.totals.conversions)} sub={<span style={{ color: C.faint, fontSize: 12 }}>GA4 key events</span>} />
        <AiKpi label="Top engine" value={top.label} sub={<span style={{ color: C.faint, fontSize: 12 }}>{share(top.sessions)}% of AI sessions</span>} />
        <AiKpi label="Engines active" value={activeEngines.length} sub={<span style={{ color: C.faint, fontSize: 12 }}>with referrals in {monthLabel}</span>} />
      </div>

      {/* Trend */}
      <div className="rounded-lg mb-6" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">AI referral sessions</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>chat engines · monthly trend, Mar–{MONTHS[LAST]}</span>
        </div>
        <div style={{ height: 200 }} className="px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="aiSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
              <Tooltip formatter={(v) => [fmt(v), "Sessions"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Area type="monotone" dataKey="sessions" stroke={C.accent} strokeWidth={2} fill="url(#aiSessions)" />
              <ReferenceDot x={MONTHS[month]} y={trend[month]?.sessions} r={4.5} fill={C.accent} stroke="#fff" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-engine breakdown */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: GRID, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
          <span className="uppercase">Engine</span>
          <span className="uppercase text-right">Sessions · {monthLabel}</span>
          <span className="uppercase text-right">Conv.</span>
          <span className="uppercase pl-3">Share</span>
          <span className="uppercase text-right">Mar–{MONTHS[LAST]} trend</span>
        </div>
        {activeEngines.map((e) => <EngineRow key={e.key} e={e} />)}
      </div>

      {/* Top landing pages from AI — combined across engines, with the per-engine
          split shown as chips (the prompt itself is never passed by AI engines). */}
      {mo.pages?.length > 0 && (
        <div className="rounded-lg overflow-hidden mt-6" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Top pages from AI</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>landing page · which engines sent it · {monthLabel}</span>
          </div>
          <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: "2.2fr 2fr 0.7fr 0.7fr", color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span className="uppercase">Page</span>
            <span className="uppercase">Engines</span>
            <span className="uppercase text-right">Sess.</span>
            <span className="uppercase text-right">Conv.</span>
          </div>
          {mo.pages.map((p) => (
            <div key={p.page} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "2.2fr 2fr 0.7fr 0.7fr", borderTop: `1px solid ${C.line}` }}>
              <span style={{ color: C.accent, fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} className="truncate pr-3" title={p.page}>{p.page}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-3">
                {p.engines.map((e) => (
                  <span key={e.key} className="inline-flex items-center gap-1.5" style={{ fontSize: 12 }}>
                    <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: ENGINE_COLOR[e.key] || C.accent }} />
                    <span style={{ color: C.muted }}>{e.label}</span>
                    <span style={{ color: C.faint, fontVariantNumeric: "tabular-nums" }}>{fmt(e.sessions)}</span>
                  </span>
                ))}
              </span>
              <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(p.sessions)}</span>
              <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(p.conversions)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bing — surfaced separately (search surface, not pure chat AI) */}
      {mo.bing && (
        <div className="rounded-lg overflow-hidden mt-4" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Shown separately — Bing is a search surface (and Copilot’s engine), not counted in the AI totals above.</span>
          </div>
          <div className="grid items-center px-5 py-3" style={{ gridTemplateColumns: GRID }}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: ENGINE_COLOR.bing }} />
              <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate">Bing</span>
            </span>
            <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(mo.bing.sessions)}</span>
            <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(mo.bing.conversions)}</span>
            <span className="pl-3" />
            <span className="flex justify-end">{ai.bing && <Sparkline series={ai.bing.series} w={96} h={26} />}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Nomad Greenland's Leads Analysis tab — see fetchZohoLeadsAndDeals in
// lib/leads.js. Aggregate stats only (counts/breakdowns), no individual
// lead/deal records — confirmed with the user, Aug 2026, given this is
// real customer data (names/emails) sourced from Zoho CRM.
function NomadLeadsTab({ data }) {
  if (!data) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        Loading leads data…
      </div>
    );
  }

  const winRate = data.totalDeals ? Math.round(((data.dealsByStage.find((s) => /won/i.test(s.label))?.value ?? 0) / data.totalDeals) * 100) : null;

  const kpis = [
    { label: "Total Leads", value: fmt(data.totalLeads) },
    { label: "Total Deals", value: fmt(data.totalDeals) },
    { label: "Total Deal Value", value: fmtMoney(data.totalDealValue) },
    { label: "Win Rate", value: winRate != null ? `${winRate}%` : "—" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="rounded-lg px-5 py-4" style={{ background: i % 2 === 0 ? `${C.accent}12` : "#fff", border: `1px solid ${C.line}` }}>
            <div style={{ color: C.muted, fontSize: 12.5 }}>{k.label}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span style={{ color: C.ink, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{k.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Leads By Month</h3>
        </div>
        <div style={{ height: 240 }} className="px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.leadsByMonth} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Bar dataKey="value" name="Leads" fill={C.accent} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(v) => fmt(v)} style={{ fill: C.accent, fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBreakdown title="Leads by Status" rows={data.leadsByStatus} fmtVal={fmt} />
        <BarBreakdown title="Leads by Source" rows={data.leadsBySource} fmtVal={fmt} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <BarBreakdown title="Deals by Stage" rows={data.dealsByStage} fmtVal={fmt} />
        <BarBreakdown title="Deal Value by Stage" rows={data.dealValueByStage} fmtVal={fmtMoney} />
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        Zoho CRM (via Windsor), January 2026 – today. Aggregate counts and totals only — no individual lead or deal records (names, emails) are shown here. Win Rate is deals in a stage matching "Won" out of all deals; if this account's pipeline uses a different closed-won stage name, this figure may read "—" or 0% incorrectly — worth confirming against Zoho directly.
      </p>
    </div>
  );
}

function Detail({ client, onBack, month, importedPlan, onImportPlan, gscData, gscError, actionData, blogDrafts, semrushData, keywordIdeas, planKeywords, semData, semRange, aiData }) {
  const isLive = !!gscData?.[client.name];
  const [service, setService] = useState(servicesOf(client.name)[0] || "seo"); // main service tab
  const [seoSub, setSeoSub] = useState("summary"); // sub-tab within SEO
  const [semSub, setSemSub] = useState("summary"); // sub-tab within SEM: "summary" (combined Google+Meta) | "meta" | "google" (single-platform KPI sets) — or "overall" | "campaigns" for Six Senses Fort Barwara's differently-shaped report, see below
  // Six Senses Fort Barwara's SEM sub-tabs use different ids (Overall /
  // Campaign Performance, not Summary/Meta/Google — it's Meta-only, so a
  // "Google" tab would always be empty). Reset on client change so switching
  // to/from it never leaves a stale, non-matching semSub selected.
  useEffect(() => {
    setSemSub((client.name === "Six Senses Fort Barwara" || client.name === "Six Senses Shaharut") ? "overall" : "summary");
  }, [client.name]); // Song Saa's single tab also uses the "summary" id — see the nav pills below.

  // Date-range picker for the SEM tabs (Summary/Meta/Google) — these are the
  // only tabs backed by daily-granularity data (lib/sem.js); everything else
  // still filters by the month dropdown above. Defaults to the last 7 days
  // of the available range once it loads (like Search Console's picker).
  const [semRangeSel, setSemRangeSel] = useState(null); // { from, to }
  useEffect(() => {
    if (semRange?.to && !semRangeSel) {
      const to = semRange.to;
      const wantFrom = addDays(to, -6);
      setSemRangeSel({ from: wantFrom < semRange.from ? semRange.from : wantFrom, to });
    }
  }, [semRange, semRangeSel]);
  const activeSemRange = semRangeSel || (semRange?.to ? { from: semRange.to, to: semRange.to } : null);
  // Changing one end clamps it to the available bounds, and pushes the
  // other end along if it would otherwise cross it (from can't be after to).
  const setSemFrom = (v) => {
    if (!v || !semRange) return;
    const from = v < semRange.from ? semRange.from : v > semRange.to ? semRange.to : v;
    setSemRangeSel((r) => { const to = r?.to ?? semRange.to; return { from, to: from > to ? from : to }; });
  };
  const setSemTo = (v) => {
    if (!v || !semRange) return;
    const to = v < semRange.from ? semRange.from : v > semRange.to ? semRange.to : v;
    setSemRangeSel((r) => { const from = r?.from ?? semRange.from; return { from: to < from ? to : from, to }; });
  };

  // True (deduplicated) Meta Reach for the exact selected range + its
  // previous-period comparison — see fetchMetaReach in lib/sem.js for why
  // this can't be derived from semData's daily rows. Fetched fresh
  // whenever the date-range picker changes; every tab that shows Reach/
  // Frequency (MetaTab, SoraMetaTab, AzeraiMetaTab, SsfbOverallTab,
  // SsshOverallTab, LeCercleOverallTab) reads from this via the
  // liveReach prop, falling back to the (overcounting) summed value from
  // semData while a fetch is in flight or if it fails — better to show a
  // slightly-wrong number for a moment than a blank card.
  const [liveReach, setLiveReach] = useState(null); // { current: {client: reach}, previous: {client: reach} } | null
  useEffect(() => {
    if (!activeSemRange) return;
    const prevWin = prevWindow(activeSemRange.from, activeSemRange.to);
    const rangesParam = [
      `${activeSemRange.from}:${activeSemRange.to}`,
      prevWin ? `${prevWin.from}:${prevWin.to}` : null,
    ].filter(Boolean).join(",");
    let cancelled = false;
    fetch(`/api/sem-reach?ranges=${encodeURIComponent(rangesParam)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const [cur, prev] = json.ranges;
        setLiveReach({ current: cur?.reach ?? {}, previous: prev?.reach ?? {} });
      })
      .catch(() => {}); // fall back to semData's summed reach — see comment above
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSemRange?.from, activeSemRange?.to]);

  // Impressions (+ Meta's Website Purchases) by country, for the exact
  // selected range — see fetchMetaCountryBreakdown/fetchGoogleCountryBreakdown
  // in lib/sem.js. Only Sora's Meta/Google tabs read this (client spec) via
  // the metaCountry/googleCountry props, but fetched generically here like
  // liveReach above rather than gated to one client.
  const [metaCountry, setMetaCountry] = useState(null); // { [client]: { [country]: { impressions, purchases } } } | null
  const [googleCountry, setGoogleCountry] = useState(null); // { [client]: { [country]: { impressions } } } | null
  useEffect(() => {
    if (!activeSemRange) return;
    let cancelled = false;
    fetch(`/api/sem-country?from=${activeSemRange.from}&to=${activeSemRange.to}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setMetaCountry(json.meta);
        setGoogleCountry(json.google);
      })
      .catch(() => {}); // charts just stay empty if this fails
    return () => { cancelled = true; };
  }, [activeSemRange?.from, activeSemRange?.to]);

  // Meta ad creatives (thumbnail + name + performance), for the exact
  // selected range — see fetchMetaCreatives in lib/sem.js. Fetched once here
  // (already keyed by every client with Meta spend, not just Sora) and read
  // by every client's Meta-flavored tab via the metaCreatives prop, same as
  // metaCountry/googleCountry above.
  const [metaCreatives, setMetaCreatives] = useState(null); // { [client]: [{ adName, adSetName, campaign, thumbnailUrl, impressions, linkClicks }] } | null
  useEffect(() => {
    if (!activeSemRange) return;
    let cancelled = false;
    fetch(`/api/sem-creatives?from=${activeSemRange.from}&to=${activeSemRange.to}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.ok) setMetaCreatives(json.data); })
      .catch(() => {}); // panel just stays empty if this fails
    return () => { cancelled = true; };
  }, [activeSemRange?.from, activeSemRange?.to]);

  // Top Performing Keywords (really: Google Ads search terms — see
  // fetchGoogleSearchTerms in lib/sem.js), for the exact selected range.
  // Currently only AZLRH's Google tab reads this — same on-demand,
  // fetched-here-keyed-by-every-client pattern as metaCreatives above.
  const [googleSearchTerms, setGoogleSearchTerms] = useState(null); // { [client]: [{ term, clicks, impressions, cost }] } | null
  useEffect(() => {
    if (!activeSemRange) return;
    let cancelled = false;
    fetch(`/api/sem-search-terms?from=${activeSemRange.from}&to=${activeSemRange.to}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.ok) setGoogleSearchTerms(json.data); })
      .catch(() => {}); // panel just stays empty if this fails
    return () => { cancelled = true; };
  }, [activeSemRange?.from, activeSemRange?.to]);

  // Zoho leads/deals (Nomad Greenland's Leads Analysis tab) — see
  // fetchZohoLeadsAndDeals in lib/leads.js. Nomad-only (this is a
  // single-client CRM connection, not a pooled-account feed like the ad
  // platforms), fetched over the same Jan-1-to-today window as everything
  // else once the app's canonical range is known — not tied to the SEM
  // date-range picker, since this tab isn't nested under Performance
  // Marketing.
  const [leadsData, setLeadsData] = useState(null);
  useEffect(() => {
    if (client.name !== "Nomad Greenland" || !semRange?.from || !semRange?.to) return;
    let cancelled = false;
    fetch(`/api/leads?from=${semRange.from}&to=${semRange.to}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.ok) setLeadsData(json.data); })
      .catch(() => {}); // tab just shows its own error/empty state if this fails
    return () => { cancelled = true; };
  }, [client.name, semRange?.from, semRange?.to]);

  // Live GSC top queries (from Windsor's searchconsole feed) for this property,
  // when connected. Each row is { q/k, clicks, impressions, position }. Used by
  // the tracked-keyword table in Organic Visibility (branded vs non-branded queries).
  const queriesFor = (m) => {
    if (m < 0) return null;
    return gscData?.[client.name]?.[MO_NUM[MONTHS[m]]]?.topQueries ?? null;
  };
  const curQueries = queriesFor(month);

  const queryRows = curQueries
    ? [...curQueries]
        .filter((row) => isReadableQuery(row.q ?? row.k)) // legible English terms only
        .map((row) => ({
          k: row.k ?? row.q,
          impressions: Math.round(row.impressions ?? 0),
          clicks: Math.round(row.clicks ?? 0),
        }))
    : client.keywords.map((kw) => {
        const pos = kwPos(kw, month);
        return { k: kw.k, impressions: kw.v, clicks: Math.round(kw.v * ctrFor(pos)) };
      });

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 mb-5 transition-colors"
        style={{ color: C.muted, fontSize: 13.5 }}
      >
        <ArrowLeft size={15} /> All properties
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <StatusDot status={client.status} size={9} />
            <span style={{ color: STATUS[client.status].color, fontSize: 12.5 }} className="font-semibold uppercase tracking-wide">
              {STATUS[client.status].label}
            </span>
          </div>
          <h2 style={{ fontFamily: "Spectral, Georgia, serif", color: C.ink, fontSize: 32 }} className="leading-none">
            {client.name}
          </h2>
          <div style={{ color: C.faint, fontSize: 13 }} className="mt-1.5 flex items-center gap-2.5 flex-wrap">
            <span>{client.domain} · {client.market}</span>
            <span
              className="rounded-full px-2 py-0.5 font-medium"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.04em",
                background: isLive ? "rgba(87,168,110,0.15)" : "rgba(200,160,0,0.12)",
                color: isLive ? C.healthy : C.watch,
              }}
            >
              {isLive ? "Windsor.ai" : gscData ? "GSC not connected" : gscError ? "GSC error" : "Loading…"}
            </span>
          </div>
        </div>
      </div>

      {/* Service tabs (main) — SEO / SEM / … per the client's subscriptions */}
      <div className="flex items-center gap-1" style={{ borderBottom: `1px solid ${C.line}` }}>
        {servicesOf(client.name).map((svc) => (
          <button
            key={svc}
            onClick={() => setService(svc)}
            className="px-4 py-2.5 transition-colors"
            style={{
              fontSize: 14.5,
              fontWeight: service === svc ? 700 : 500,
              color: service === svc ? C.ink : C.muted,
              borderBottom: service === svc ? `2px solid ${C.accent}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {SVC_LABEL[svc] || svc.toUpperCase()}
          </button>
        ))}
      </div>

      {/* SEO sub-tabs */}
      {service === "seo" ? (
        <div className="flex items-center gap-1.5 mt-4 mb-6">
          {[["summary", "Summary"], ["visibility", "Organic Visibility"], ["traffic", "Organic Traffic"], ["conversions", "Organic Conversions"], ["ai", "AI Search"], ["explorer", "Keyword Explorer"], ["blog", "Blog plan"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSeoSub(id)}
              className="px-3 py-1.5 rounded-full transition-colors"
              style={{
                fontSize: 13,
                fontWeight: seoSub === id ? 600 : 500,
                color: seoSub === id ? C.accent : C.muted,
                background: seoSub === id ? "rgba(0,119,200,0.10)" : "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : service === "sem" ? (
        <div className="flex items-center justify-between gap-3 mt-4 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            {(client.name === "Six Senses Fort Barwara"
              ? [["overall", "Overall"], ["campaigns", "Campaign Performance"]]
              : client.name === "Six Senses Shaharut"
              ? [["overall", "Overall"]]
              : client.name === "Song Saa Private Island"
              // Google Ads was intentionally excluded from this report until
              // the client's Aug 2026 feedback asked for it back — see
              // SongSaaOverallTab. Le Cercle stays Meta-only for real (no
              // Google Ads account exists for it), so it keeps just Overall.
              ? [["summary", "Overall"], ["google", "Google"]]
              : client.name === "Le Cercle"
              ? [["summary", "Overall"]]
              // Creative Performance split into its own tab per the client's
              // Aug 2026 feedback — was inline at the bottom of SoraMetaTab,
              // see SoraCreativeTab.
              : client.name === "Sora Sukhumvit"
              ? [["summary", "Summary"], ["meta", "Meta"], ["google", "Google"], ["creative", "Creative Performance"]]
              : [["summary", "Summary"], ["meta", "Meta"], ["google", "Google"]]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSemSub(id)}
                className="px-3 py-1.5 rounded-full transition-colors"
                style={{
                  fontSize: 13,
                  fontWeight: semSub === id ? 600 : 500,
                  color: semSub === id ? C.accent : C.muted,
                  background: semSub === id ? "rgba(0,119,200,0.10)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Date-range picker — Google/Meta ad spend is fetched daily, so
              this lets Summary/Meta/Google filter to any from–to range
              (like Search Console's date picker) instead of only a broader
              monthly view. KPI deltas compare against the immediately
              preceding period of equal length. */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={activeSemRange?.from || ""}
              min={semRange?.from}
              max={semRange?.to}
              disabled={!semRange}
              onChange={(e) => setSemFrom(e.target.value)}
              className="rounded-lg cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink, fontSize: 13, fontWeight: 500, padding: "6px 10px", fontFamily: "Inter, system-ui, sans-serif" }}
              aria-label="Range start"
            />
            <span style={{ color: C.faint, fontSize: 13 }}>–</span>
            <input
              type="date"
              value={activeSemRange?.to || ""}
              min={semRange?.from}
              max={semRange?.to}
              disabled={!semRange}
              onChange={(e) => setSemTo(e.target.value)}
              className="rounded-lg cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink, fontSize: 13, fontWeight: 500, padding: "6px 10px", fontFamily: "Inter, system-ui, sans-serif" }}
              aria-label="Range end"
            />
          </div>
        </div>
      ) : (
        <div className="mt-6" />
      )}

      {/* Six Senses Fort Barwara — Meta-only custom SEM report (Overall +
          Campaign Performance), a different shape from both the Click Book
          template and Sora's Purchase/ROAS template. See SsfbOverallTab /
          SsfbCampaignTab below. Six Senses Shaharut shares the same Overall
          shape (see SsshOverallTab) but has no Campaign Performance tab. */}
      {service === "sem" && semSub === "overall" && client.name === "Six Senses Fort Barwara" && (
        <SsfbOverallTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCreatives={metaCreatives} />
      )}
      {service === "sem" && semSub === "campaigns" && client.name === "Six Senses Fort Barwara" && (
        <SsfbCampaignTab client={client} selectedRange={activeSemRange} semData={semData} />
      )}
      {service === "sem" && semSub === "overall" && client.name === "Six Senses Shaharut" && (
        <SsshOverallTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCreatives={metaCreatives} />
      )}

      {/* Sora Sukhumvit and Azerai (both properties) each have their own
          custom SEM report (Purchase/Add To Cart/Revenue/ROAS shape) — a
          different spec from the Click Book template every other SEM
          client uses. See soraDayCombined / azeraiDayCombined above. */}
      {service === "sem" && semSub === "summary" && (
        client.name === "Sora Sukhumvit" ? <SoraSummaryTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} />
        : (client.name === "Azerai Ke Ga Bay" || client.name === "Azerai La Residence, Hue") ? <AzeraiSummaryTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} />
        : client.name === "Song Saa Private Island" ? <SongSaaOverallTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} metaCreatives={metaCreatives} />
        : client.name === "Le Cercle" ? <LeCercleOverallTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCreatives={metaCreatives} />
        : <SummaryTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} />
      )}
      {service === "sem" && semSub === "meta" && (
        client.name === "Sora Sukhumvit" ? <SoraMetaTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCountry={metaCountry} />
        : (client.name === "Azerai Ke Ga Bay" || client.name === "Azerai La Residence, Hue") ? <AzeraiMetaTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCreatives={metaCreatives} />
        : <MetaTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} liveReach={liveReach} metaCreatives={metaCreatives} />
      )}
      {service === "sem" && semSub === "google" && (
        client.name === "Sora Sukhumvit" ? <SoraGoogleTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} googleCountry={googleCountry} />
        : (client.name === "Azerai Ke Ga Bay" || client.name === "Azerai La Residence, Hue") ? <AzeraiGoogleTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} googleSearchTerms={googleSearchTerms} />
        : <GoogleTab client={client} selectedRange={activeSemRange} range={semRange} semData={semData} />
      )}
      {service === "sem" && semSub === "creative" && client.name === "Sora Sukhumvit" && (
        <SoraCreativeTab client={client} metaCreatives={metaCreatives} />
      )}

      {service === "seo" && seoSub === "summary" && <OrganicSummary key={`${client.name}-${month}`} client={client} month={month} gscData={gscData} actionData={actionData} blogDrafts={blogDrafts} aiData={aiData} />}

      {service === "seo" && seoSub === "visibility" && <OrganicVisibility key={`${client.name}-${month}`} client={client} month={month} gscData={gscData} queryRows={queryRows} />}

      {service === "seo" && seoSub === "traffic" && <OrganicTraffic key={`${client.name}-${month}`} client={client} month={month} />}

      {service === "seo" && seoSub === "conversions" && <OrganicConversions key={`${client.name}-${month}`} client={client} month={month} />}

      {service === "seo" && seoSub === "ai" && <AiSearch key={`${client.name}-${month}`} client={client} aiData={aiData} month={month} />}

      {service === "seo" && seoSub === "explorer" && <KeywordExplorer client={client} />}

      {service === "seo" && seoSub === "blog" && <BlogPlan client={client} imported={importedPlan} onImport={onImportPlan} keywordIdeas={keywordIdeas?.[client.name] || []} planKeywords={planKeywords?.[client.name] || {}} />}
      {service === "leads" && <NomadLeadsTab data={leadsData} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login gate                                                         */
/*  NOTE: this is a front-end shell, NOT real authentication. The code  */
/*  is visible client-side and there is no server to verify against.    */
/*  Real access control belongs server-side (e.g. Supabase Auth) once   */
/*  the dashboard is deployed. The check below is a placeholder.        */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Left sidebar — brand + Overview + per-property navigation          */
/* ------------------------------------------------------------------ */
function Sidebar({ clients, selected, onSelect }) {
  const item = (active) => ({
    display: "flex", alignItems: "center", gap: 9, width: "100%",
    padding: "8px 10px", borderRadius: 8, fontSize: 13.5, textAlign: "left",
    color: active ? C.ink : C.muted,
    background: active ? "rgba(0,119,200,0.10)" : "transparent",
    fontWeight: active ? 600 : 500,
  });
  return (
    <aside
      className="flex flex-col shrink-0"
      style={{ width: 248, background: "#fff", borderRight: `1px solid ${C.line}`, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <img src="/amn_logo_blue.png" alt="the amn" style={{ height: 26 }} />
        <span style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 17, color: C.ink }}>Client Dashboard</span>
      </div>
      <nav className="px-3 pb-6 flex-1">
        <button onClick={() => onSelect(null)} className="transition-colors" style={item(!selected)}>
          <PieChart size={16} /> Overview
        </button>
        <div className="px-2 pt-5 pb-1.5 uppercase" style={{ color: C.faint, fontSize: 11, letterSpacing: "0.06em" }}>
          Properties
        </div>
        {clients.map((c) => (
          <button
            key={c.name}
            onClick={() => onSelect(c)}
            className="transition-colors mt-0.5"
            style={item(selected?.name === c.name)}
          >
            <StatusDot status={c.status} size={7} />
            <span className="truncate flex-1">{c.name}</span>
            {servicesOf(c.name).map((s) => (
              <span
                key={s}
                className="rounded px-1 uppercase shrink-0"
                style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em", color: C.accent, background: "rgba(0,119,200,0.10)" }}
              >
                {s}
              </span>
            ))}
          </button>
        ))}
      </nav>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  App shell                                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const [user, setUser] = useState(null);       // { email, role, clients }
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(MONTHS.length - 1);
  const [importedPlan, setImportedPlan] = useState(null);
  const [gscData, setGscData] = useState(null);
  const [gscError, setGscError] = useState(null);
  const [actionData, setActionData] = useState(null); // live action-plan tasks per client
  const [blogDrafts, setBlogDrafts] = useState(null); // blog draft links per client/keyword
  const [keywordIdeas, setKeywordIdeas] = useState(null); // SEMrush content-keyword ideas per client
  const [planKeywords, setPlanKeywords] = useState(null); // SEMrush volume+KD for blog-plan keywords
  const [semData, setSemData] = useState(null); // live Google Ads (paid) metrics per client
  const [semRange, setSemRange] = useState(null); // { from, to } — full available range bounding the SEM date-range picker
  const [semrushData, setSemrushData] = useState(null); // cached SEMrush metrics per client
  const [aiData, setAiData] = useState(null); // live AI-engine referral traffic per client (GA4)

  // Fetch live GSC data once on mount.
  useEffect(() => {
    fetch("/api/gsc")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setGscData(json.data); else setGscError(json.error); })
      .catch((e) => setGscError(e.message));
  }, []);

  // Fetch the live action plan (team task list) once on mount.
  useEffect(() => {
    fetch("/api/action-items")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setActionData(json.data); })
      .catch(() => {});
  }, []);

  // Fetch blog-post drafts (Google Doc links) once on mount.
  useEffect(() => {
    fetch("/api/blog-drafts")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setBlogDrafts(json.data); })
      .catch(() => {});
  }, []);

  // Fetch cached SEMrush content-keyword ideas once on mount.
  useEffect(() => {
    fetch("/api/keyword-ideas")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setKeywordIdeas(json.data); })
      .catch(() => {});
  }, []);

  // Fetch cached SEMrush metrics for blog-plan keywords once on mount.
  useEffect(() => {
    fetch("/api/plan-keywords")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setPlanKeywords(json.data); })
      .catch(() => {});
  }, []);

  // Fetch cached SEMrush metrics once on mount.
  useEffect(() => {
    fetch("/api/semrush")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setSemrushData(json.data); })
      .catch(() => {});
  }, []);

  // Fetch live paid-search (Google Ads + Meta) metrics once on mount — daily
  // granularity, so dateFrom/dateTo bound the SEM tabs' date-range picker.
  useEffect(() => {
    fetch("/api/sem")
      .then((r) => r.json())
      .then((json) => { if (json.ok) { setSemData(json.data); setSemRange({ from: json.dateFrom, to: json.dateTo }); } })
      .catch(() => {});
  }, []);

  // Fetch live AI-engine referral traffic (GA4) once on mount.
  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setAiData(json.data); })
      .catch(() => {});
  }, []);

  // Fetch current user + role from /api/me (set by Supabase middleware).
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((json) => {
        if (json.role) setUser(json);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const signOut = async () => {
    const { createClient } = await import("../lib/supabase");
    await createClient().auth.signOut();
    setUser(null);
    setSelected(null);
    window.location.href = "/login";
  };

  // Filter CLIENTS to only what this user can see
  const visibleClients = user
    ? CLIENTS.filter((c) => user.clients.includes(c.name))
    : [];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink, fontFamily: "Inter, system-ui, sans-serif" }} className="flex">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap'); .lf:focus{outline:none;border-color:${C.accent};box-shadow:0 0 0 3px rgba(0,119,200,0.15);}`}</style>

      {ready && <Sidebar clients={visibleClients} selected={selected} onSelect={setSelected} />}

      <div className="flex-1 min-w-0">
        {/* Top bar — breadcrumb + month + sign out */}
        <header
          className="flex items-center justify-between gap-4 px-6 md:px-8"
          style={{ height: 60, borderBottom: `1px solid ${C.line}`, background: "#fff", position: "sticky", top: 0, zIndex: 10 }}
        >
          <div style={{ fontSize: 13.5 }} className="flex items-center gap-2 min-w-0">
            <span style={{ color: C.faint }}>Dashboards</span>
            <span style={{ color: C.faint }}>/</span>
            <span style={{ color: C.ink }} className="font-medium truncate">
              {selected ? selected.name : "Overview"}
            </span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="relative">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="appearance-none rounded-lg cursor-pointer"
                style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink, fontSize: 13, fontWeight: 500, padding: "7px 32px 7px 11px", fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{MONTH_FULL[m]} {YEAR}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            </div>
            <button onClick={signOut} className="transition-colors hover:opacity-70" style={{ color: C.muted, fontSize: 13 }}>
              Sign out
            </button>
          </div>
        </header>

        <main className="px-6 md:px-8 py-7">
          {!ready ? (
            <div style={{ color: C.faint, fontSize: 14, textAlign: "center", paddingTop: 80 }}>Loading…</div>
          ) : selected ? (
            <Detail
              client={selected}
              onBack={() => setSelected(null)}
              month={month}
              importedPlan={importedPlan}
              onImportPlan={setImportedPlan}
              gscData={gscData}
              gscError={gscError}
              actionData={actionData}
              blogDrafts={blogDrafts}
              semrushData={semrushData}
              keywordIdeas={keywordIdeas}
              planKeywords={planKeywords}
              semData={semData}
              semRange={semRange}
              aiData={aiData}
            />
          ) : (
            <Portfolio clients={visibleClients.filter((c) => hasService(c.name, "seo"))} onSelect={setSelected} month={month} gscData={gscData} />
          )}
        </main>
      </div>
    </div>
  );
}
