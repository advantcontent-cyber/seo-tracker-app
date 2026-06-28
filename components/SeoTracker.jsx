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
} from "recharts";
import { ArrowUpRight, ArrowDownRight, ArrowLeft, Minus, Lock, Check, Clock, ChevronDown, ExternalLink } from "lucide-react";

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

const MONTHS = ["Mar", "Apr", "May", "Jun"];
const MONTH_FULL = { Mar: "March", Apr: "April", May: "May", Jun: "June" };
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
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
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
];
const intentOf = (k) => (INFO_HINTS.some((h) => k.toLowerCase().includes(h)) ? "blog" : "optimise");
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

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
  const MO_NUM = { Mar: 3, Apr: 4, May: 5, Jun: 6 };

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
function Stat({ label, value, delta, suffix = "", invert = false }) {
  return (
    <div className="px-5 py-4" style={{ borderRight: `1px solid ${C.line}` }}>
      <div style={{ color: C.faint, fontSize: 11.5, letterSpacing: "0.04em" }} className="uppercase mb-1.5">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span style={{ color: C.ink, fontSize: 24, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} suffix={suffix} invert={invert} size="lg" />}
      </div>
    </div>
  );
}

// ─── Destination knowledge base ──────────────────────────────────────────────
// Per-property seasonal demand context for the Mar–Jun window. `level` is the
// natural demand strength of that month (peak/high/shoulder/low) at the
// destination — independent of SEO. The read below reconciles it with the
// month's actual click movement, so a rise into a low season is correctly framed
// as SEO momentum rather than seasonal tailwind.
const CONTEXT = {
  "Shinta Mani Wild": {
    Mar: { level: "peak", text: "March is peak dry season in the Cardamoms — the prime trekking window and the property's strongest natural demand" },
    Apr: { level: "high", text: "April is the hot tail of the dry season", event: "Khmer New Year (mid-April) lifts regional and domestic interest." },
    May: { level: "shoulder", text: "May turns toward green season as the first rains arrive and Western demand softens" },
    Jun: { level: "low", text: "June is low green season — lush but wet, the quietest stretch for inbound luxury travel" },
  },
  "Nomad Greenland": {
    Mar: { level: "shoulder", text: "March is late winter — aurora and ski-touring season before the summer window opens", event: "Northern-lights demand peaks in the dark months before the summer pivot." },
    Apr: { level: "shoulder", text: "April is shoulder season as winter activities wind down and summer planning begins" },
    May: { level: "high", text: "May is the pre-season ramp as travellers book ahead of the summer" },
    Jun: { level: "peak", text: "June opens the summer season — midnight sun, open water, peak booking demand", event: "Midnight-sun season begins — the year's highest planning and booking intent." },
  },
  "Sora Sukhumvit": {
    Mar: { level: "high", text: "March is hot season in Bangkok — steady urban and corporate demand" },
    Apr: { level: "peak", text: "April is defined by Songkran", event: "Songkran (Thai New Year, mid-April) drives a sharp staycation and leisure spike." },
    May: { level: "shoulder", text: "May is the pre-monsoon lull as the hot season ends" },
    Jun: { level: "low", text: "June is green/low season — softer inbound leisure over a steady corporate base" },
  },
  "IC Khao Yai": {
    Mar: { level: "high", text: "March is hot season — still a popular cool-air weekend escape from Bangkok" },
    Apr: { level: "peak", text: "April brings Songkran and long weekends", event: "Songkran and April long weekends spike the Bangkok domestic-escape market." },
    May: { level: "shoulder", text: "May's early rains green the hills; demand steadies between holidays" },
    Jun: { level: "shoulder", text: "June is green low season — quieter midweek, weekend domestic demand holding" },
  },
};

// Compose a short analyst read: a data lead (real GSC fields), then the seasonal
// reconciliation, then the month's headline event if there is one.
function analystRead(client, month) {
  const ctx = CONTEXT[client.name];
  if (!ctx) return null;
  const n = ctx[MONTHS[month]];
  if (!n) return null;
  const cur = gsc(client, month);
  const prev = month > 0 ? gsc(client, month - 1) : null;
  const moM = prev ? Math.round(((cur.clicks - prev.clicks) / prev.clicks) * 100) : null;
  const dir = moM == null ? "base" : moM > 1 ? "up" : moM < -1 ? "down" : "flat";
  const high = n.level === "peak" || n.level === "high";
  const low = n.level === "low";
  const pos = cur.avgPos.toFixed(1);

  let posPhrase;
  if (!prev) posPhrase = `average position at ${pos}`;
  else if (cur.avgPos < prev.avgPos - 0.05) posPhrase = `average position improving from ${prev.avgPos.toFixed(1)} to ${pos}`;
  else if (cur.avgPos > prev.avgPos + 0.05) posPhrase = `average position slipping from ${prev.avgPos.toFixed(1)} to ${pos}`;
  else posPhrase = `average position holding near ${pos}`;

  let lead;
  if (moM == null) lead = `Organic clicks open the window at ${fmt(cur.clicks)} with ${posPhrase} — the ${MONTH_FULL[MONTHS[month]]} baseline.`;
  else if (dir === "flat") lead = `Organic clicks held roughly flat month-over-month at ${fmt(cur.clicks)}, ${posPhrase}.`;
  else lead = `Organic clicks ${dir === "up" ? "rose" : "eased"} ${Math.abs(moM)}% month-over-month to ${fmt(cur.clicks)}, ${posPhrase}.`;

  let verdict;
  if (dir === "base") verdict = high ? "a strong month to anchor the trend against" : low ? "a soft demand month, so steady figures read as resilient" : "a neutral month to set the baseline";
  else if (dir === "up") verdict = high ? "and the growth rides with that peak demand" : low ? "so the growth is SEO momentum working against the seasonal grain, not the calendar" : "and rising clicks point to good positioning into the season";
  else if (dir === "down") verdict = high ? "so the softening is a real concern, not a seasonal excuse" : low ? "so part of the dip is seasonal, though the underlying trend still bears watching" : "and the easing fits the shoulder-season cool-down";
  else verdict = high ? "holding in step with peak demand" : "roughly in line with seasonal demand";

  return `${lead} ${n.text} — ${verdict}.${n.event ? " " + n.event : ""}`;
}

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

function BlogPlan({ client, imported, onImport }) {
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
                <span style={{ color: C.ink, fontSize: 13 }}>{r.keyword}</span>
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

function Detail({ client, onBack, month, importedPlan, onImportPlan, gscData, gscError }) {
  // liveGsc() returns real Windsor data for this client/month when connected,
  // falling back to the mock gsc() function for unconnected properties.
  const liveGsc = (c, m) => {
    const mo = MONTHS[m]; // e.g. "Jun"
    const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6 }[mo];
    const live = gscData?.[c.name]?.[moNum];
    if (!live) return gsc(c, m); // mock fallback
    return {
      clicks:      live.clicks,
      impressions: live.impressions,
      ctr:         live.ctr,
      avgPos:      live.avgPos,
      // Index coverage not in Windsor GSC data — keep mock estimate
      indexed:     gsc(c, m).indexed,
      issues:      gsc(c, m).issues,
      buckets:     gsc(c, m).buckets,
    };
  };
  const isLive = !!gscData?.[client.name];

  const cur = liveGsc(client, month);
  const prev = month > 0 ? liveGsc(client, month - 1) : null;
  const dPct = (key) => (prev ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : 0);
  // Use real Windsor clicks series when available, fall back to mock traffic array.
  const cs = isLive
    ? MONTHS.map((mo) => { const moNum = { Mar: 3, Apr: 4, May: 5, Jun: 6 }[mo]; return gscData[client.name][moNum]?.clicks ?? 0; })
    : series(client);
  const chartData = cs.map((v, i) => ({ month: MONTHS[i], clicks: v }));
  const b = cur.buckets;
  const read = analystRead(client, month);
  const [tab, setTab] = useState("overview");

  // Off-page work is no longer part of the program — exclude it from plans.
  const plan = (ACTION_PLANS[client.name] || []).filter((t) => t.cat !== "Off-page");
  const { active, deliveredToDate, upcoming } = monthlyPlan(plan, month);
  const pct = plan.length ? Math.round((deliveredToDate / plan.length) * 100) : 0;

  // Live GSC top queries (from Windsor's searchconsole feed) for this property,
  // when connected. Each row is { q/k, clicks, impressions, position }. Shared by
  // both the tracked-keyword table and the content-opportunity finder below.
  const MO_NUM = { Mar: 3, Apr: 4, May: 5, Jun: 6 };
  const queriesFor = (m) => {
    if (m < 0) return null;
    return gscData?.[client.name]?.[MO_NUM[MONTHS[m]]]?.topQueries ?? null;
  };
  const round1 = (n) => Math.round(n * 10) / 10;
  const curQueries = queriesFor(month);

  // Content opportunities: queries with proven demand (impressions) leaking
  // clicks because they sit below the top of page 1. Gap = the extra clicks we'd
  // capture at position 3. Blog-intent picks become the month's suggested posts.
  // Uses real GSC queries when connected (impressions + position are real, clicks
  // straight from GSC), else the mock keyword set with kw.v as the demand proxy.
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
      // Prefer GSC's real ranking URL; fall back to a derived slug for mock data.
      return { k, pos: round1(pos), impressions, gap, intent, url: page || pageUrl(client.domain, k, intent) };
    })
    .filter((o) => o.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const blogPicks = opps.filter((o) => o.intent === "blog").slice(0, 2);

  // Tracked keywords: real GSC top queries when connected, else the mock set.
  // change is the query's position shift vs the previous month (positive = moved
  // up the page).
  const trackedKeywords = curQueries
    ? [...curQueries]
        .sort((a, b) => b.clicks - a.clicks) // most-clicked queries first for the table
        .slice(0, 25)
        .map((row) => {
          const prevRow = queriesFor(month - 1)?.find((p) => p.q === row.q);
          return {
            k: row.k ?? row.q,
            pos: round1(row.position),
            change: prevRow ? round1(prevRow.position - row.position) : 0,
            clicks: Math.round(row.clicks),
          };
        })
    : client.keywords.map((kw) => {
        const pos = kwPos(kw, month);
        return {
          k: kw.k,
          pos,
          change: month > 0 ? kwPos(kw, month - 1) - pos : 0,
          clicks: kwClicks(kw, pos),
        };
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

      {/* Analyst read — data interpretation with seasonal & local context */}
      {read && (
        <div
          className="rounded-lg p-5 mb-6"
          style={{ background: C.accent, color: "#fff" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 11, letterSpacing: "0.06em", opacity: 0.7 }} className="uppercase font-semibold">
              The read · {MONTH_FULL[MONTHS[month]]} {YEAR}
            </span>
          </div>
          <p style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 17.5, lineHeight: 1.55 }}>
            {read}
          </p>
          <p style={{ fontSize: 11.5, opacity: 0.6, marginTop: 10 }}>
            Generated from the month's figures and a destination knowledge base — a starting interpretation to sanity-check, not a substitute for your read.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6" style={{ borderBottom: `1px solid ${C.line}` }}>
        {[
          ["overview", "Overview"],
          ["blog", "Blog plan"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3.5 py-2.5 transition-colors"
            style={{
              fontSize: 13.5,
              fontWeight: tab === id ? 600 : 500,
              color: tab === id ? C.ink : C.muted,
              borderBottom: tab === id ? `2px solid ${C.accent}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
      {/* Action-plan progress */}
      <div className="flex items-center gap-3 mb-6">
        <span style={{ color: C.muted, fontSize: 12.5 }} className="font-medium">
          Action plan
        </span>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line, width: 200 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: C.accent }} />
        </div>
        <span style={{ color: C.ink, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }} className="font-medium">
          {deliveredToDate}/{plan.length} delivered
        </span>
        <span style={{ color: C.faint, fontSize: 12.5 }}>· through {MONTHS[month]} {YEAR}</span>
      </div>

      {/* KPI strip — Google Search Console */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-lg overflow-hidden mb-6"
        style={{ border: `1px solid ${C.line}`, background: "#fff" }}
      >
        <Stat label="Clicks" value={fmt(cur.clicks)} delta={Math.round(momPct(client, month))} suffix="%" />
        <Stat label="Impressions" value={fmt(cur.impressions)} delta={dPct("impressions")} suffix="%" />
        <Stat label="Avg CTR" value={`${(cur.ctr * 100).toFixed(1)}%`} delta={prev ? r1((cur.ctr - prev.ctr) * 100) : 0} />
        <Stat label="Avg position" value={r1(cur.avgPos)} delta={prev ? r1(cur.avgPos - prev.avgPos) : 0} invert />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Trend */}
        <div className="lg:col-span-2 rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
              Organic clicks · GSC
            </h3>
            <Delta value={Math.round(momPct(client, month))} suffix="% MoM" size="lg" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="clicks" stroke={C.accent} strokeWidth={2} fill="url(#g)" />
              <ReferenceDot x={MONTHS[month]} y={cs[month]} r={4.5} fill={C.accent} stroke="#fff" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Query positions + coverage (GSC) */}
        <div className="rounded-lg p-5" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold mb-4">
            Query positions
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              ["Top 3", b.t3],
              ["Top 10", b.t10],
              ["Top 20", b.t20],
              ["Top 100", b.t100],
            ].map(([l, v]) => (
              <div key={l} className="rounded-md px-3 py-2.5" style={{ background: C.bg }}>
                <div style={{ color: C.faint, fontSize: 11.5 }}>{l}</div>
                <div style={{ color: C.ink, fontSize: 19, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {v}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mb-5" style={{ fontSize: 13 }}>
            <span className="inline-flex items-center gap-1.5">
              <Delta value={b.new} /> <span style={{ color: C.muted }}>new</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Delta value={-b.lost} /> <span style={{ color: C.muted }}>lost</span>
            </span>
          </div>

          <div className="pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ color: C.muted, fontSize: 13 }}>Index coverage</span>
              <span style={{ color: C.faint, fontSize: 11.5 }}>GSC</span>
            </div>
            <div className="flex gap-5" style={{ fontSize: 12.5, color: C.muted }}>
              <span>
                <span style={{ color: C.healthy, fontSize: 16, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {fmt(cur.indexed)}
                </span>{" "}
                indexed
              </span>
              <span>
                <span style={{ color: cur.issues ? C.watch : C.faint, fontSize: 16, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                  {cur.issues}
                </span>{" "}
                with issues
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tracked keywords */}
      <div className="rounded-lg mt-5 overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
            Tracked keywords
          </h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>
            {trackedKeywords.length} {curQueries ? "from GSC" : "tracked"}
          </span>
        </div>
        <div
          className="grid items-center px-5 py-2"
          style={{
            gridTemplateColumns: "2.4fr 0.8fr 0.8fr 0.8fr",
            color: C.faint,
            fontSize: 11.5,
            letterSpacing: "0.04em",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <span className="uppercase">Keyword</span>
          <span className="uppercase text-right">Position</span>
          <span className="uppercase text-right">Change</span>
          <span className="uppercase text-right">Clicks</span>
        </div>
        {trackedKeywords.map((kw, i) => (
          <div
            key={kw.k}
            className="grid items-center px-5 py-3"
            style={{
              gridTemplateColumns: "2.4fr 0.8fr 0.8fr 0.8fr",
              borderTop: i ? `1px solid ${C.line}` : "none",
            }}
          >
            <span style={{ color: C.ink, fontSize: 14 }} className="truncate">
              {kw.k}
            </span>
            <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">
              {kw.pos}
            </span>
            <span className="flex justify-end">
              {/* invert: a smaller position number is an improvement */}
              <Delta value={kw.change} invert />
            </span>
            <span style={{ color: C.muted, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right">
              {fmt(kw.clicks)}
            </span>
          </div>
        ))}
      </div>

      {/* Content opportunities */}
      <div className="rounded-lg mt-5 overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ color: C.ink, fontSize: 14 }} className="font-semibold">
            Content opportunities
          </h3>
          <span style={{ color: C.faint, fontSize: 12.5 }}>High-impression queries leaking clicks</span>
        </div>

        {/* Suggested posts for the month */}
        <div className="px-5 py-4" style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ color: C.muted, fontSize: 11.5, letterSpacing: "0.04em" }} className="uppercase font-medium mb-2.5">
            Suggested posts · {MONTH_FULL[MONTHS[month]]} {YEAR} · 2 / month
          </div>
          {blogPicks.length ? (
            <div className="grid md:grid-cols-2 gap-3">
              {blogPicks.map((o) => (
                <div key={o.k} className="rounded-lg p-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
                  <span
                    className="rounded-full px-1.5 py-0.5"
                    style={{ background: "rgba(31,78,74,0.1)", color: C.accent, fontSize: 10, fontWeight: 600 }}
                  >
                    BLOG POST
                  </span>
                  <div style={{ color: C.ink, fontFamily: "Spectral, Georgia, serif", fontSize: 17 }} className="mt-2 leading-snug">
                    {titleCase(o.k)}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12.5 }} className="mt-1">
                    Targets “{o.k}” · position {o.pos} · {fmt(o.impressions)} impressions
                  </div>
                  <div style={{ color: C.healthy, fontSize: 13 }} className="mt-1.5 font-medium">
                    +{fmt(o.gap)} clicks/mo potential
                  </div>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 hover:opacity-70 transition-opacity"
                    style={{ color: C.accent, fontSize: 11.5 }}
                  >
                    <ExternalLink size={11} style={{ flexShrink: 0 }} />
                    <span className="truncate">{shortUrl(o.url)}</span>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13 }}>
              No clear blog opportunity in the tracked set this month — the full GSC query export would surface more.
            </p>
          )}
        </div>

        {/* All opportunities, ranked by click upside */}
        <div
          className="grid items-center px-5 py-2"
          style={{
            gridTemplateColumns: "2fr 1fr 0.8fr 0.5fr 0.9fr",
            color: C.faint,
            fontSize: 11.5,
            letterSpacing: "0.04em",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <span className="uppercase">Query</span>
          <span className="uppercase">Action</span>
          <span className="uppercase text-right">Impr.</span>
          <span className="uppercase text-right">Pos</span>
          <span className="uppercase text-right">+ Clicks</span>
        </div>
        {opps.slice(0, 8).map((o, i) => (
          <div
            key={o.k}
            className="grid items-center px-5 py-3"
            style={{ gridTemplateColumns: "2fr 1fr 0.8fr 0.5fr 0.9fr", borderTop: i ? `1px solid ${C.line}` : "none" }}
          >
            <a
              href={o.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 min-w-0 hover:opacity-70 transition-opacity"
              style={{ color: C.ink, fontSize: 14 }}
            >
              <span className="truncate">{o.k}</span>
              <ExternalLink size={12} style={{ color: C.faint, flexShrink: 0 }} />
            </a>
            <span>
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  background: o.intent === "blog" ? "rgba(31,78,74,0.1)" : "#fff",
                  color: o.intent === "blog" ? C.accent : C.muted,
                  border: o.intent === "blog" ? "none" : `1px solid ${C.line}`,
                }}
              >
                {o.intent === "blog" ? "Blog post" : "Optimise page"}
              </span>
            </span>
            <span style={{ color: C.muted, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right">
              {fmt(o.impressions)}
            </span>
            <span style={{ color: C.ink, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">
              {o.pos}
            </span>
            <span style={{ color: C.healthy, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right font-medium">
              +{fmt(o.gap)}
            </span>
          </div>
        ))}
        {opps.length === 0 && (
          <div className="px-5 py-6" style={{ color: C.muted, fontSize: 13.5 }}>
            Every tracked query is already near the top this month — no significant click gap to chase.
          </div>
        )}
      </div>

      {/* Action plan — scoped to the selected month */}
      <div className="rounded-lg mt-5 overflow-hidden" style={{ border: `1px solid ${C.line}`, background: "#fff" }}>
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
        </>
      )}

      {tab === "blog" && <BlogPlan client={client} imported={importedPlan} onImport={onImportPlan} />}
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

  // Fetch live GSC data once on mount.
  useEffect(() => {
    fetch("/api/gsc")
      .then((r) => r.json())
      .then((json) => { if (json.ok) setGscData(json.data); else setGscError(json.error); })
      .catch((e) => setGscError(e.message));
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
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap'); .lf:focus{outline:none;border-color:${C.accent};box-shadow:0 0 0 3px rgba(0,119,200,0.15);}`}</style>
      <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
          <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
            {/* Masthead */}
            <header className="flex items-end justify-between pb-5 mb-6" style={{ borderBottom: `1px solid ${C.line}` }}>
              <div>
                <img src="/amn_logo_blue.png" alt="the amn" style={{ height: 32, marginBottom: 6 }} />
                <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 26, color: C.ink }} className="leading-none">
                  SEO Progress
                </h1>
              </div>
              <div className="flex flex-col items-end gap-2.5">
                {/* Month dropdown */}
                <div className="relative">
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="appearance-none rounded-lg cursor-pointer"
                    style={{
                      background: "#fff",
                      border: `1px solid ${C.line}`,
                      color: C.ink,
                      fontSize: 13.5,
                      fontWeight: 500,
                      padding: "8px 34px 8px 12px",
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {MONTH_FULL[m]} {YEAR}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <span style={{ color: C.faint, fontSize: 12 }}>
                    {visibleClients.length} {visibleClients.length === 1 ? "property" : "properties"} · {MONTH_FULL[MONTHS[month]]} {YEAR}
                  </span>
                  <button
                    onClick={signOut}
                    className="transition-colors hover:opacity-70"
                    style={{ color: C.muted, fontSize: 13 }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </header>

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
              />
            ) : (
              <Portfolio clients={visibleClients} onSelect={setSelected} month={month} gscData={gscData} />
            )}
          </div>
      </div>
    </div>
  );
}
