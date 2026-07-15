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
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, ArrowLeft, Minus, Lock, Check, Clock, ChevronDown, ExternalLink, PieChart, Sparkles, Search, Loader2, Eye, MousePointerClick, Percent, TrendingUp, Users, UserPlus, Target, DollarSign, Activity, ShoppingCart, Receipt, Banknote } from "lucide-react";

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

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul"];
const MONTH_FULL = { Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July" };
const YEAR = 2026;

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
const fmt = (n) => n.toLocaleString("en-US");
const fmtMoney = (n) => `$${Math.round(n ?? 0).toLocaleString("en-US")}`;
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Which services each client subscribes to. Drives sidebar badges + which
// detail tabs render. Default is SEO-only.
const SERVICES = {
  "IC Khao Yai": ["seo", "sem"],
};
const SVC_LABEL = { seo: "SEO", sem: "SEM" };
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
  const MO_NUM = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 };

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
/*  SEM (paid search) tab — Google Ads via Windsor                      */
/* ------------------------------------------------------------------ */
const MO_NUM_MAP = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 };

// Parse a market code from a campaign name. Handles both Google ("[Advant]
// HK_High intent…") and Meta ("US_Conv_Clickbook_JUN", "SG+HK+TW_Conv…").
const campaignMarket = (name) => {
  const cleaned = (name || "").replace(/^\[Advant\]\s*/, "").trim();
  const m = /^([A-Z]{2}(?:\+[A-Z]{2})*)/.exec(cleaned);
  return m ? m[1] : "Other";
};
const PLATFORM_LABEL = { google: "Google Ads", meta: "Meta" };

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

// Paid-media narrative for the month — summarises combined Google + Meta
// spend, MoM, efficiency, and platform split.
function semRead(sem, month) {
  const cur = sem?.monthly?.[MO_NUM_MAP[MONTHS[month]]];
  if (!cur || !cur.spend) return null;
  const prev = month > 0 ? sem?.monthly?.[MO_NUM_MAP[MONTHS[month - 1]]] : null;
  const mom = prev && prev.spend ? Math.round(((cur.spend - prev.spend) / prev.spend) * 100) : null;
  const cpc = cur.clicks ? cur.spend / cur.clicks : 0;
  const metaShare = cur.spend ? Math.round((cur.meta.spend / cur.spend) * 100) : 0;
  const bigger = cur.meta.spend >= cur.google.spend ? "Meta" : "Google Ads";
  const biggerShare = Math.max(metaShare, 100 - metaShare);

  const lead = mom == null
    ? `Paid media spent ${fmtMoney(cur.spend)} across Google Ads and Meta in ${MONTH_FULL[MONTHS[month]]} — the baseline for the window`
    : `Paid media spent ${fmtMoney(cur.spend)} across Google Ads and Meta in ${MONTH_FULL[MONTHS[month]]}, ${mom >= 0 ? "up" : "down"} ${Math.abs(mom)}% month-over-month`;
  const mid = `driving ${fmt(cur.clicks)} clicks at a $${cpc.toFixed(2)} blended CPC`;
  const split = `${bigger} carried the majority of spend (${biggerShare}%)`;
  const conv = cur.google.conversions
    ? `, with Google Ads logging ${fmt(cur.google.conversions)} tracked conversions at $${(cur.google.spend / cur.google.conversions).toFixed(2)} each`
    : "";
  return `${lead} — ${mid}. ${split}${conv}.`;
}

function SemTab({ client, month, semData }) {
  const [platformSel, setPlatformSel] = useState(null);
  const sem = semData?.[client.name];

  if (!sem) {
    return (
      <div className="rounded-lg p-6" style={{ border: `1px dashed ${C.line}`, background: "#fff", color: C.muted, fontSize: 13.5 }}>
        {semData ? "No paid-ads data for this property/month." : "Loading paid-ads data…"}
      </div>
    );
  }

  // Platforms that actually have spend; toggle between them.
  const available = ["google", "meta"].filter((p) => MONTHS.some((mo) => (sem.monthly?.[mo]?.[p]?.spend ?? 0) > 0));
  const platform = platformSel && available.includes(platformSel) ? platformSel : (available[0] || "google");
  const isGoogle = platform === "google";
  const accent = isGoogle ? C.accent : "#1877F2";

  const moNum = MO_NUM_MAP[MONTHS[month]];
  const cur  = sem.monthly?.[moNum]?.[platform] || null;
  const prev = month > 0 ? (sem.monthly?.[MO_NUM_MAP[MONTHS[month - 1]]]?.[platform] || null) : null;
  const campaigns = (sem.campaigns?.[moNum] || []).filter((c) => c.platform === platform);

  const dPct = (key) => (prev && prev[key] ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : null);
  const ctr  = cur && cur.impressions ? (cur.clicks / cur.impressions) * 100 : 0;
  const cpc  = cur && cur.clicks ? cur.spend / cur.clicks : 0;
  const cpa  = cur && cur.conversions ? cur.spend / cur.conversions : 0;

  const kpis = cur ? [
    { label: "Spend",       value: fmtMoney(cur.spend),  delta: dPct("spend") },
    { label: "Clicks",      value: fmt(cur.clicks),      delta: dPct("clicks") },
    { label: "Impressions", value: fmt(cur.impressions), delta: dPct("impressions") },
    ...(isGoogle ? [{ label: "Conversions", value: fmt(cur.conversions), delta: dPct("conversions") }] : []),
  ] : [];

  const trend = MONTHS.map((mo) => ({ month: mo, spend: sem.monthly?.[MO_NUM_MAP[mo]]?.[platform]?.spend ?? 0 }));

  const byMarket = (() => {
    const agg = {};
    campaigns.forEach((c) => { const k = campaignMarket(c.name); agg[k] = (agg[k] || 0) + c.spend; });
    return Object.entries(agg).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();
  const topCampaigns = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 6);
  const read = semRead(sem, month);

  return (
    <div>
      {/* Paid read — combined Google + Meta narrative for the month */}
      {read && (
        <div className="rounded-lg p-5 mb-6" style={{ background: C.accent, color: "#fff" }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 11, letterSpacing: "0.06em", opacity: 0.7 }} className="uppercase font-semibold">
              Paid read · {MONTH_FULL[MONTHS[month]]} {YEAR}
            </span>
          </div>
          <p style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 17.5, lineHeight: 1.55 }}>
            {read}
          </p>
          <p style={{ fontSize: 11.5, opacity: 0.6, marginTop: 10 }}>
            Generated from the month's Google Ads + Meta figures — a starting read, not a substitute for campaign-level review. Meta conversions aren't tracked, so conversion figures are Google-only.
          </p>
        </div>
      )}

      {/* Platform toggle */}
      <div className="inline-flex rounded-lg p-0.5 mb-5" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
        {available.map((p) => (
          <button
            key={p}
            onClick={() => setPlatformSel(p)}
            style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 13,
              fontWeight: platform === p ? 600 : 500,
              background: platform === p ? "#fff" : "transparent",
              color: platform === p ? C.ink : C.muted,
              border: platform === p ? `1px solid ${C.line}` : "1px solid transparent",
            }}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>

      {/* KPI cards */}
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

      {/* Secondary metrics */}
      {cur && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 px-1" style={{ color: C.muted, fontSize: 13 }}>
          <span>CTR <b style={{ color: C.ink }}>{ctr.toFixed(1)}%</b></span>
          <span>Avg. CPC <b style={{ color: C.ink }}>${cpc.toFixed(2)}</b></span>
          {isGoogle && <span>Cost / conversion <b style={{ color: C.ink }}>${cpa.toFixed(2)}</b></span>}
        </div>
      )}

      {/* Spend trend + spend by market */}
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Spend · {PLATFORM_LABEL[platform]}</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>{MONTHS[0]}–{MONTHS[MONTHS.length - 1]} {YEAR}</span>
          </div>
          <div style={{ height: 240 }} className="px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id={`semSpend-${platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
                <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                <Area type="monotone" dataKey="spend" stroke={accent} strokeWidth={2} fill={`url(#semSpend-${platform})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <BarBreakdown title="Spend by market" rows={byMarket} fmtVal={fmtMoney} />
      </div>

      {/* Top campaigns */}
      <div className="rounded-lg overflow-hidden mt-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Top campaigns · {PLATFORM_LABEL[platform]}</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>by spend · {MONTH_FULL[MONTHS[month]]} {YEAR}</span>
        </div>
        <div className="grid items-center px-5 py-2" style={{ gridTemplateColumns: "2.6fr 0.8fr 0.8fr 0.8fr", color: C.faint, fontSize: 11.5, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
          <span className="uppercase">Campaign</span>
          <span className="uppercase text-right">Spend</span>
          <span className="uppercase text-right">Clicks</span>
          <span className="uppercase text-right">{isGoogle ? "Conv." : "CTR"}</span>
        </div>
        {topCampaigns.length === 0 ? (
          <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13 }}>No campaigns this month.</div>
        ) : topCampaigns.map((c, i) => (
          <div key={c.name} className="grid items-center px-5 py-3" style={{ gridTemplateColumns: "2.6fr 0.8fr 0.8fr 0.8fr", borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate" title={c.name}>{c.name.replace(/^\[Advant\]\s*/, "")}</span>
            <span style={{ color: C.ink, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">{fmtMoney(c.spend)}</span>
            <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">{fmt(c.clicks)}</span>
            <span style={{ color: C.muted, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }} className="text-right">
              {isGoogle ? fmt(c.conversions) : (c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) + "%" : "—")}
            </span>
          </div>
        ))}
      </div>

      <p style={{ color: C.faint, fontSize: 11.5 }} className="mt-4">
        {isGoogle
          ? `Google Ads (via Windsor), ${MONTH_FULL[MONTHS[month]]} ${YEAR}. Conversion value isn't tracked in this account, so ROAS is omitted.`
          : `Meta Ads (via Windsor), ${MONTH_FULL[MONTHS[month]]} ${YEAR}. This connector doesn't expose conversions, so conversions/ROAS are omitted.`}
      </p>
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
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 }[MONTHS[month]];

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
  const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 }[MONTHS[month]];

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
  const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 }[MONTHS[month]];

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
const MO_NUM_BY_LABEL = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 };

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

function OrganicSummary({ client, month, gscData, actionData, blogDrafts }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 }[MONTHS[month]];

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
  const { plan, active, deliveredToDate, upcoming } = actionPlanFor(client, month, actionData);

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

      {/* Organic clicks trend, content opportunities, action plan — same
          cards as Overview, folded into Summary ahead of Overview's removal. */}
      <OrganicClicksTrendCard chartData={chartData} momValue={Math.round(momPct(client, month))} month={month} />
      <ContentOpportunitiesCard blogPicks={blogPicks} blogDrafts={blogDrafts} client={client} month={month} />
      <ActionPlanCard plan={plan} active={active} deliveredToDate={deliveredToDate} upcoming={upcoming} month={month} />

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

function AiSearch({ client, aiData }) {
  const ai = aiData?.[client.name] || null;

  if (aiData == null)
    return <div className="py-12 text-center" style={{ color: C.muted, fontSize: 13 }}>Loading AI referral data…</div>;
  if (!ai || ai.totals.sessions === 0)
    return (
      <div className="rounded-lg p-8 text-center" style={{ border: `1px dashed ${C.line}`, background: "#fff" }}>
        <Sparkles size={22} color={C.faint} className="mx-auto mb-2" />
        <div style={{ color: C.ink, fontSize: 15 }} className="font-semibold mb-1">No AI-engine referrals yet</div>
        <div style={{ color: C.muted, fontSize: 13 }}>No sessions from ChatGPT, Gemini, Claude, Perplexity or Copilot landed on this property in Mar–Jun {YEAR}.</div>
      </div>
    );

  const t = ai.totals;
  const mom = t.series[LAST - 1] ? Math.round(((t.series[LAST] - t.series[LAST - 1]) / t.series[LAST - 1]) * 100) : 0;
  const top = ai.engines[0];
  const trend = MONTHS.map((label, i) => ({ month: label, sessions: t.series[i] }));
  const share = (n) => (t.sessions ? Math.round((n / t.sessions) * 100) : 0);
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
        <AiKpi label={`AI sessions · ${MONTHS[LAST]}`} value={fmt(t.series[LAST])} sub={<Delta value={mom} suffix="%" size="lg" />} />
        <AiKpi label={`AI sessions · Mar–${MONTHS[LAST]}`} value={fmt(t.sessions)} sub={<span style={{ color: C.faint, fontSize: 12 }}>{ai.engines.length} engine{ai.engines.length > 1 ? "s" : ""}</span>} />
        <AiKpi label={`AI conversions · Mar–${MONTHS[LAST]}`} value={fmt(t.conversions)} sub={<span style={{ color: C.faint, fontSize: 12 }}>GA4 key events</span>} />
        <AiKpi label="Top engine" value={top.label} sub={<span style={{ color: C.faint, fontSize: 12 }}>{share(top.sessions)}% of AI sessions</span>} />
      </div>

      {/* Trend */}
      <div className="rounded-lg mb-6" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">AI referral sessions</h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>chat engines · monthly</span>
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
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-engine breakdown */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: GRID, color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
          <span className="uppercase">Engine</span>
          <span className="uppercase text-right">Sessions</span>
          <span className="uppercase text-right">Conv.</span>
          <span className="uppercase pl-3">Share</span>
          <span className="uppercase text-right">Mar–{MONTHS[LAST]}</span>
        </div>
        {ai.engines.map((e) => <EngineRow key={e.key} e={e} />)}
      </div>

      {/* Top landing pages from AI — combined across engines, with the per-engine
          split shown as chips (the prompt itself is never passed by AI engines). */}
      {ai.pages?.length > 0 && (
        <div className="rounded-lg overflow-hidden mt-6" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">Top pages from AI</h3>
            <span style={{ color: C.faint, fontSize: 12.5 }}>landing page · which engines sent it</span>
          </div>
          <div className="grid items-center px-5 py-2.5" style={{ gridTemplateColumns: "2.2fr 2fr 0.7fr 0.7fr", color: C.faint, fontSize: 11, letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span className="uppercase">Page</span>
            <span className="uppercase">Engines</span>
            <span className="uppercase text-right">Sess.</span>
            <span className="uppercase text-right">Conv.</span>
          </div>
          {ai.pages.map((p) => (
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
      {ai.bing && (
        <div className="rounded-lg overflow-hidden mt-4" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="px-5 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Shown separately — Bing is a search surface (and Copilot’s engine), not counted in the AI totals above.</span>
          </div>
          <div className="grid items-center px-5 py-3" style={{ gridTemplateColumns: GRID }}>
            <span className="flex items-center gap-2 min-w-0">
              <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: ENGINE_COLOR.bing }} />
              <span style={{ color: C.ink, fontSize: 13.5 }} className="truncate">Bing</span>
            </span>
            <span className="text-right" style={{ color: C.ink, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(ai.bing.sessions)}</span>
            <span className="text-right" style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmt(ai.bing.conversions)}</span>
            <span className="pl-3" />
            <span className="flex justify-end"><Sparkline series={ai.bing.series} w={96} h={26} /></span>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ client, onBack, month, importedPlan, onImportPlan, gscData, gscError, actionData, blogDrafts, semrushData, keywordIdeas, planKeywords, semData, aiData }) {
  const isLive = !!gscData?.[client.name];
  const [service, setService] = useState(servicesOf(client.name)[0] || "seo"); // main service tab
  const [seoSub, setSeoSub] = useState("summary"); // sub-tab within SEO

  // Live GSC top queries (from Windsor's searchconsole feed) for this property,
  // when connected. Each row is { q/k, clicks, impressions, position }. Used by
  // the tracked-keyword table in Organic Visibility (branded vs non-branded queries).
  const MO_NUM = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7 };
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
              {isLive ? "Live GSC" : gscData ? "GSC not connected" : gscError ? "GSC error" : "Loading…"}
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
      ) : (
        <div className="mt-6" />
      )}

      {service === "sem" && <SemTab client={client} month={month} semData={semData} />}

      {service === "seo" && seoSub === "summary" && <OrganicSummary key={`${client.name}-${month}`} client={client} month={month} gscData={gscData} actionData={actionData} blogDrafts={blogDrafts} />}

      {service === "seo" && seoSub === "visibility" && <OrganicVisibility key={`${client.name}-${month}`} client={client} month={month} gscData={gscData} queryRows={queryRows} />}

      {service === "seo" && seoSub === "traffic" && <OrganicTraffic key={`${client.name}-${month}`} client={client} month={month} />}

      {service === "seo" && seoSub === "conversions" && <OrganicConversions key={`${client.name}-${month}`} client={client} month={month} />}

      {service === "seo" && seoSub === "ai" && <AiSearch client={client} aiData={aiData} />}

      {service === "seo" && seoSub === "explorer" && <KeywordExplorer client={client} />}

      {service === "seo" && seoSub === "blog" && <BlogPlan client={client} imported={importedPlan} onImport={onImportPlan} keywordIdeas={keywordIdeas?.[client.name] || []} planKeywords={planKeywords?.[client.name] || {}} />}
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

  // Fetch live paid-search (Google Ads) metrics once on mount.
  useEffect(() => {
    fetch("/api/sem")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setSemData(json.data); })
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
              aiData={aiData}
            />
          ) : (
            <Portfolio clients={visibleClients} onSelect={setSelected} month={month} gscData={gscData} />
          )}
        </main>
      </div>
    </div>
  );
}
