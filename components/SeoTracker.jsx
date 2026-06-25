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
  bg: "#F6F4EF",
  surface: "#FCFBF8",
  ink: "#1A1D1C",
  muted: "#6B6F6C",
  faint: "#9A9D98",
  accent: "#1F4E4A", // deep pine
  line: "#E4E0D8",
  healthy: "#4A7C59",
  watch: "#B8893C",
  risk: "#A14B3D",
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
    name: "Cottar's Safaris",
    domain: "cottars.com",
    market: "Kenya · EN",
    status: "healthy",
    traffic: [1340, 1380, 1450, 1490, 1560, 1680],
    top10: 35, top10d: 7,
    authority: 44, authorityd: 2,
    refDomains: 410,
    health: 90, errors: 1, warnings: 4,
    buckets: { t3: 6, t10: 35, t20: 78, t100: 196, new: 11, lost: 4 },
    keywords: [
      { k: "luxury safari kenya", p: 5, d: 3, v: 3200 },
      { k: "cottars 1920s camp", p: 1, d: 0, v: 880 },
      { k: "masai mara luxury safari", p: 7, d: 4, v: 2100 },
      { k: "private conservancy safari", p: 13, d: 6, v: 640 },
      { k: "kenya safari lodge", p: 8, d: 2, v: 2900 },
      { k: "olderkesi conservancy", p: 3, d: 1, v: 320 },
      { k: "best safari camp masai mara", p: 10, d: 5, v: 1400 },
      { k: "family safari kenya", p: 12, d: 3, v: 1800 },
      { k: "honeymoon safari africa", p: 16, d: 4, v: 1300 },
      { k: "tented safari camp kenya", p: 9, d: 6, v: 880 },
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
    name: "Song Saa Private Island",
    domain: "songsaa.com",
    market: "Cambodia · EN",
    status: "healthy",
    traffic: [760, 820, 890, 950, 1020, 1140],
    top10: 23, top10d: 5,
    authority: 35, authorityd: 2,
    refDomains: 230,
    health: 87, errors: 1, warnings: 5,
    buckets: { t3: 4, t10: 23, t20: 52, t100: 144, new: 7, lost: 2 },
    keywords: [
      { k: "song saa private island", p: 1, d: 0, v: 1300 },
      { k: "cambodia private island resort", p: 5, d: 3, v: 880 },
      { k: "koh rong luxury resort", p: 9, d: 4, v: 1600 },
      { k: "private island cambodia", p: 8, d: 2, v: 990 },
      { k: "overwater villa cambodia", p: 6, d: 2, v: 480 },
      { k: "koh rong island resort", p: 11, d: 5, v: 1300 },
      { k: "private island honeymoon asia", p: 14, d: 4, v: 720 },
      { k: "cambodia beach resort", p: 12, d: 3, v: 1900 },
      { k: "luxury island resort southeast asia", p: 16, d: 6, v: 880 },
      { k: "song saa reserve", p: 3, d: 1, v: 260 },
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
  {
    name: "Six Senses Fort Barwara",
    domain: "sixsenses.com/fort-barwara",
    market: "India · EN",
    status: "watch",
    traffic: [1450, 1500, 1420, 1380, 1410, 1460],
    top10: 31, top10d: 1,
    authority: 41, authorityd: 0,
    refDomains: 320,
    health: 82, errors: 3, warnings: 7,
    buckets: { t3: 5, t10: 31, t20: 66, t100: 172, new: 5, lost: 6 },
    keywords: [
      { k: "six senses fort barwara", p: 1, d: 0, v: 1100 },
      { k: "luxury spa resort rajasthan", p: 7, d: -1, v: 1900 },
      { k: "ranthambore luxury hotel", p: 12, d: 2, v: 1400 },
      { k: "rajasthan wellness retreat", p: 16, d: -4, v: 880 },
      { k: "heritage palace hotel rajasthan", p: 9, d: -2, v: 1300 },
      { k: "luxury hotel ranthambore", p: 8, d: 1, v: 1100 },
      { k: "spa resort india", p: 15, d: -3, v: 2400 },
      { k: "destination wedding rajasthan", p: 18, d: -1, v: 1900 },
      { k: "ayurvedic retreat india", p: 14, d: -2, v: 1600 },
      { k: "fort hotel rajasthan", p: 11, d: 2, v: 880 },
    ],
  },
  {
    name: "Azerai",
    domain: "azerai.com",
    market: "Vietnam · EN/VI",
    status: "watch",
    traffic: [990, 1020, 1080, 1040, 1100, 1150],
    top10: 21, top10d: 2,
    authority: 30, authorityd: 1,
    refDomains: 142,
    health: 84, errors: 2, warnings: 6,
    buckets: { t3: 3, t10: 21, t20: 48, t100: 134, new: 6, lost: 4 },
    keywords: [
      { k: "azerai resort", p: 2, d: 0, v: 720 },
      { k: "luxury resort vietnam", p: 11, d: 3, v: 2200 },
      { k: "central vietnam beach resort", p: 14, d: -2, v: 980 },
      { k: "ke ga bay hotel", p: 8, d: 5, v: 540 },
      { k: "azerai la residence hue", p: 3, d: 1, v: 590 },
      { k: "luxury hotel hue", p: 9, d: 2, v: 1100 },
      { k: "beach resort phan thiet", p: 13, d: 4, v: 1400 },
      { k: "design hotel vietnam", p: 16, d: 3, v: 720 },
      { k: "vietnam wellness resort", p: 15, d: -1, v: 880 },
      { k: "ke ga lighthouse resort", p: 10, d: 5, v: 320 },
    ],
  },
  {
    name: "ANA IC Ishigaki",
    domain: "anaintercontinental-ishigaki.jp",
    market: "Japan · JA/EN",
    status: "watch",
    traffic: [2200, 2150, 2080, 1990, 2040, 2110],
    top10: 29, top10d: -3,
    authority: 39, authorityd: 0,
    refDomains: 356,
    health: 80, errors: 3, warnings: 8,
    buckets: { t3: 4, t10: 29, t20: 64, t100: 178, new: 4, lost: 7 },
    keywords: [
      { k: "ishigaki resort hotel", p: 6, d: -2, v: 2900 },
      { k: "ana intercontinental ishigaki", p: 1, d: 0, v: 1200 },
      { k: "okinawa luxury beach resort", p: 13, d: -4, v: 3400 },
      { k: "ishigaki island hotel", p: 10, d: 1, v: 1600 },
      { k: "石垣島 リゾートホテル", p: 5, d: -2, v: 2200 },
      { k: "okinawa family resort", p: 14, d: -3, v: 1900 },
      { k: "ishigaki beachfront hotel", p: 11, d: -1, v: 880 },
      { k: "沖縄 ラグジュアリーホテル", p: 12, d: -4, v: 1600 },
      { k: "ishigaki diving resort", p: 9, d: 2, v: 1100 },
      { k: "yaeyama islands hotel", p: 16, d: -2, v: 520 },
    ],
  },
  {
    name: "Six Senses Shaharut",
    domain: "sixsenses.com/shaharut",
    market: "Israel · EN/HE",
    status: "risk",
    traffic: [1280, 1180, 1020, 840, 720, 610],
    top10: 19, top10d: -8,
    authority: 36, authorityd: -2,
    refDomains: 268,
    health: 74, errors: 6, warnings: 11,
    buckets: { t3: 2, t10: 19, t20: 47, t100: 150, new: 3, lost: 12 },
    keywords: [
      { k: "negev desert luxury resort", p: 9, d: -5, v: 1100 },
      { k: "six senses shaharut", p: 1, d: 0, v: 880 },
      { k: "israel desert hotel", p: 18, d: -9, v: 1600 },
      { k: "camel ranch resort israel", p: 22, d: -7, v: 420 },
      { k: "luxury hotel negev", p: 12, d: -6, v: 880 },
      { k: "desert spa resort israel", p: 16, d: -5, v: 720 },
      { k: "arava valley hotel", p: 20, d: -8, v: 320 },
      { k: "מלון יוקרה מדבר", p: 14, d: -7, v: 590 },
      { k: "eco luxury resort israel", p: 17, d: -4, v: 480 },
      { k: "stargazing hotel israel", p: 15, d: -6, v: 410 },
    ],
  },
  {
    name: "ANA IC Manza",
    domain: "anaintercontinental-manza.jp",
    market: "Japan · JA/EN",
    status: "risk",
    traffic: [1980, 1880, 1760, 1690, 1620, 1580],
    top10: 24, top10d: -6,
    authority: 37, authorityd: -1,
    refDomains: 298,
    health: 77, errors: 5, warnings: 10,
    buckets: { t3: 3, t10: 24, t20: 55, t100: 164, new: 3, lost: 9 },
    keywords: [
      { k: "manza beach resort", p: 9, d: -4, v: 1900 },
      { k: "ana intercontinental manza", p: 2, d: 0, v: 1000 },
      { k: "okinawa onna village hotel", p: 17, d: -6, v: 1400 },
      { k: "manza onsen resort", p: 14, d: -5, v: 880 },
      { k: "万座ビーチリゾート", p: 8, d: -4, v: 1600 },
      { k: "okinawa resort hotel", p: 15, d: -5, v: 2900 },
      { k: "onna son luxury hotel", p: 13, d: -3, v: 880 },
      { k: "okinawa beachfront resort", p: 16, d: -6, v: 2200 },
      { k: "沖縄 高級リゾート", p: 14, d: -5, v: 1900 },
      { k: "manza onsen hotel", p: 12, d: -4, v: 720 },
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
  "Cottar's Safaris": [
    { task: "Expand Mara and conservancy content", cat: "Content", priority: "high", status: "doing", detail: "Build depth around 'masai mara luxury safari' (pos 7) and 'private conservancy safari' (pos 13) to capture rising volume." },
    { task: "Digital PR around the Olderkesi story", cat: "Off-page", priority: "high", status: "done", detail: "Pitch the conservancy and community story to safari and travel media for authority links." },
    { task: "Push 'luxury safari kenya' to top 3", cat: "On-page", priority: "med", status: "doing", detail: "At position 5. Strengthen the page title, internal links and add FAQ schema." },
    { task: "Clear remaining audit warnings", cat: "Technical", priority: "low", status: "done", detail: "Resolve the 4 warnings to hold Site Health at 90+." },
    { task: "Tidy Google Business Profile and OTA listings", cat: "Local", priority: "med", status: "done", detail: "Consistent NAP, photos and descriptions across GBP and OTA channels." },
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
  "Song Saa Private Island": [
    { task: "Expand island and marine-conservation content", cat: "Content", priority: "high", status: "doing", detail: "Target 'koh rong luxury resort' (pos 9) and build out the marine-reserve story." },
    { task: "Eco and conservation digital PR", cat: "Off-page", priority: "high", status: "done", detail: "Pitch the foundation and marine-reserve work for authority links from sustainability and travel media." },
    { task: "Push 'cambodia private island resort' to top 3", cat: "On-page", priority: "med", status: "todo", detail: "Currently position 5 — refine the page and add supporting internal links." },
    { task: "Maintain technical health and schema", cat: "Technical", priority: "low", status: "done", detail: "Hold Site Health at 87+, clear the single error, keep LodgingBusiness markup current." },
  ],
  "IC Khao Yai": [
    { task: "Clear the crawl errors first", cat: "Technical", priority: "high", status: "doing", detail: "Health is 78 with 4 errors — fix indexation and crawl issues from the audit before chasing rankings." },
    { task: "Optimise the core money pages", cat: "On-page", priority: "high", status: "todo", detail: "'khao yai resort' (pos 14, high volume) and 'khao yai luxury hotel' (pos 8) — titles, H1s and internal links to break into the top 10." },
    { task: "Build a 'things to do in Khao Yai' hub", cat: "Content", priority: "high", status: "todo", detail: "Position 19 on high volume and slipping — an informational hub recovers top-of-funnel demand." },
    { task: "Set up and validate EN/TH hreflang", cat: "International", priority: "med", status: "todo", detail: "Ensure bilingual pages are correctly paired so neither language cannibalises the other." },
    { task: "Bring Thai pages to parity", cat: "On-page", priority: "med", status: "todo", detail: "Match metadata and content depth across EN and TH versions." },
    { task: "Pursue Thai travel press and brand links", cat: "Off-page", priority: "med", status: "todo", detail: "Local press plus InterContinental brand equity to build referring domains from 138." },
  ],
  "Six Senses Fort Barwara": [
    { task: "Refresh the wellness content cluster", cat: "Content", priority: "high", status: "doing", detail: "'rajasthan wellness retreat' (pos 16, slipping) and 'luxury spa resort rajasthan' (pos 7) need refreshed, expanded pages to reverse the slide." },
    { task: "Fix audit issues and check for regression", cat: "Technical", priority: "high", status: "todo", detail: "Resolve 3 errors and 7 warnings, and investigate whether a technical change is behind the ranking slip." },
    { task: "Strengthen 'ranthambore luxury hotel' page", cat: "On-page", priority: "med", status: "todo", detail: "Position 12 — improve relevance and internal links to the Ranthambore tie-in." },
    { task: "Wellness and luxury-travel digital PR", cat: "Off-page", priority: "med", status: "todo", detail: "Authority is a healthy 41 — protect and grow it with fresh, relevant links." },
    { task: "Add heritage and safari experiential content", cat: "Content", priority: "med", status: "todo", detail: "Fort heritage and Ranthambore safari content to widen topical coverage." },
  ],
  "Azerai": [
    { task: "Audit and fix EN/VI hreflang", cat: "International", priority: "high", status: "doing", detail: "Bilingual setup is a common drop-off — confirm every EN page is paired correctly with its VI counterpart across both properties." },
    { task: "Build content for slipping beach-resort terms", cat: "Content", priority: "high", status: "todo", detail: "'central vietnam beach resort' (pos 14, slipping) and 'luxury resort vietnam' (pos 11) need stronger landing pages." },
    { task: "Push 'ke ga bay hotel' to top 3 while it's rising", cat: "On-page", priority: "med", status: "doing", detail: "Up 5 places to position 8 — press the momentum with on-page work and internal links now." },
    { task: "Resolve audit errors", cat: "Technical", priority: "med", status: "todo", detail: "Clear 2 errors and 6 warnings to lift Site Health from 84." },
    { task: "Pitch the design and architecture story for links", cat: "Off-page", priority: "med", status: "todo", detail: "Azerai's design narrative is a natural fit for design and travel press backlinks." },
  ],
  "ANA IC Ishigaki": [
    { task: "Audit post-rebrand redirects and fix errors", cat: "Technical", priority: "high", status: "doing", detail: "Verify legacy URLs redirect cleanly so the rebrand didn't shed equity; resolve 3 errors and 8 warnings." },
    { task: "Recover Okinawa terms via JA/EN hreflang", cat: "International", priority: "high", status: "todo", detail: "'okinawa luxury beach resort' (pos 13, high volume) is the recovery target; confirm JA/EN parity and pairing." },
    { task: "Reclaim 'ishigaki resort hotel' position", cat: "On-page", priority: "high", status: "todo", detail: "Down 2 to position 6 — refresh the page to win back the ranking." },
    { task: "Rebuild content changed in the rebrand", cat: "Content", priority: "med", status: "todo", detail: "Restore Okinawa and Ishigaki experience content affected during the transition." },
    { task: "Reclaim pre-rebrand backlinks", cat: "Off-page", priority: "med", status: "todo", detail: "Find links pointing at old URLs and ensure they redirect to recover lost authority." },
  ],
  "Six Senses Shaharut": [
    { task: "Run a full technical triage", cat: "Technical", priority: "high", status: "doing", detail: "Health is 74 with 6 errors — check for indexation or crawl regressions that could be driving the decline, and resolve errors first." },
    { task: "Diagnose and arrest the ranking decline", cat: "On-page", priority: "high", status: "todo", detail: "Rankings are down across the board ('israel desert hotel' -9, 'negev desert luxury resort' -5). Separate demand-driven loss from SEO-driven loss before acting." },
    { task: "Refresh core landing pages", cat: "Content", priority: "high", status: "todo", detail: "Rebuild relevance signals on primary pages and confirm nothing has been accidentally de-indexed." },
    { task: "Audit the backlink profile", cat: "Off-page", priority: "med", status: "todo", detail: "Authority slipped 2 points — check for lost or toxic links contributing to the drop." },
    { task: "Re-establish topical content", cat: "Content", priority: "med", status: "todo", detail: "Given external pressure on demand, shore up topical coverage to defend the positions that remain." },
  ],
  "ANA IC Manza": [
    { task: "Complete the rebrand migration cleanup", cat: "Technical", priority: "high", status: "doing", detail: "Redirect audit from legacy Manza URLs plus resolution of 5 errors and 10 warnings — the likely root of the decline." },
    { task: "Recover Okinawa terms via JA/EN hreflang", cat: "International", priority: "high", status: "todo", detail: "'manza beach resort' (pos 9, -4) and 'okinawa onna village hotel' (pos 17, -6) are the recovery targets; confirm hreflang pairing." },
    { task: "Reclaim pre-rebrand backlinks", cat: "Off-page", priority: "high", status: "todo", detail: "Authority dropped a point — recover links pointing at the old domain and URLs." },
    { task: "Restore titles, meta and content on top pages", cat: "On-page", priority: "med", status: "todo", detail: "Re-optimise the pages most affected by the rebrand to win back rankings." },
    { task: "Rebuild Okinawa and Onna-village content", cat: "Content", priority: "med", status: "todo", detail: "Restore local content depth lost in the transition." },
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
function Portfolio({ clients, onSelect, month }) {
  const sorted = useMemo(
    () =>
      [...clients].sort((a, b) => {
        const r = STATUS[a.status].rank - STATUS[b.status].rank;
        if (r !== 0) return r;
        return momPct(a, month) - momPct(b, month);
      }),
    [clients, month]
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
          const cur = gsc(c, month);
          const prev = month > 0 ? gsc(c, month - 1) : null;
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
                <Sparkline series={series(c).slice(0, month + 1)} />
                <div>
                  <div style={{ color: C.ink, fontSize: 15, fontVariantNumeric: "tabular-nums" }} className="font-semibold">
                    {fmt(cur.clicks)}
                  </div>
                  <Delta value={Math.round(momPct(c, month))} suffix="%" />
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
  "Cottar's Safaris": {
    Mar: { level: "low", text: "March opens Kenya's long rains — green season, lower rates, quieter camps" },
    Apr: { level: "low", text: "April sits deep in the long rains, the Mara's lowest-occupancy month" },
    May: { level: "shoulder", text: "May sees the rains easing toward the shoulder" },
    Jun: { level: "high", text: "June is the green-to-dry turn", event: "Search interest climbs ahead of the Great Migration's July–October peak." },
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
  "Song Saa Private Island": {
    Mar: { level: "peak", text: "March is peak dry season — calm seas and the island's strongest demand" },
    Apr: { level: "high", text: "April stays hot, dry and high season", event: "Khmer New Year (mid-April) adds regional interest." },
    May: { level: "shoulder", text: "May turns into wet season as demand begins to taper" },
    Jun: { level: "low", text: "June is low wet season — the quietest island months" },
  },
  "IC Khao Yai": {
    Mar: { level: "high", text: "March is hot season — still a popular cool-air weekend escape from Bangkok" },
    Apr: { level: "peak", text: "April brings Songkran and long weekends", event: "Songkran and April long weekends spike the Bangkok domestic-escape market." },
    May: { level: "shoulder", text: "May's early rains green the hills; demand steadies between holidays" },
    Jun: { level: "shoulder", text: "June is green low season — quieter midweek, weekend domestic demand holding" },
  },
  "Six Senses Fort Barwara": {
    Mar: { level: "high", text: "March closes Rajasthan's cool peak season — strong demand before the heat", event: "Holi (March) draws cultural-travel interest before the slowdown." },
    Apr: { level: "low", text: "April's rising heat pushes Rajasthan into low season" },
    May: { level: "low", text: "May is peak summer — Rajasthan's hottest, lowest-demand stretch" },
    Jun: { level: "low", text: "June's extreme heat keeps inbound leisure at its annual low" },
  },
  Azerai: {
    Mar: { level: "high", text: "March is dry and mild — a strong window for both Hue and the coast" },
    Apr: { level: "high", text: "April is warm and dry", event: "Reunification Day & Labour Day (Apr 30–May 1) drive a domestic travel surge." },
    May: { level: "high", text: "May's early-summer heat drives domestic beach demand to the coast" },
    Jun: { level: "peak", text: "June is the domestic summer peak", event: "Summer school holidays fill the coastal property." },
  },
  "ANA IC Ishigaki": {
    Mar: { level: "high", text: "March opens demand with spring travel and graduation season" },
    Apr: { level: "high", text: "April builds toward Golden Week at month's end" },
    May: { level: "peak", text: "May holds the Golden Week peak before the rains", event: "Golden Week (late April–early May) is the year's domestic peak; tsuyu rains follow." },
    Jun: { level: "low", text: "June is Okinawa's rainy season (tsuyu) ahead of the July–August peak" },
  },
  "Six Senses Shaharut": {
    Mar: { level: "peak", text: "March is ideal spring desert weather — a prime demand window" },
    Apr: { level: "peak", text: "April brings mild desert conditions and Passover", event: "Passover (early April) drives the year's strongest domestic travel peak." },
    May: { level: "shoulder", text: "May's warming desert temperatures begin to taper leisure demand" },
    Jun: { level: "low", text: "June's desert summer heat pushes the property into low season" },
  },
  "ANA IC Manza": {
    Mar: { level: "high", text: "March's spring travel season opens while post-rebrand visibility is still stabilising" },
    Apr: { level: "high", text: "April builds toward Golden Week amid the rebrand recovery" },
    May: { level: "peak", text: "May holds the Golden Week peak before the rains", event: "Golden Week (late April–early May) is the domestic peak; tsuyu follows." },
    Jun: { level: "low", text: "June's rainy season compounds the ongoing rebrand recovery" },
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
  "Cottar's Safaris": { label: "the Maasai Mara", kw: "maasai mara" },
  "Nomad Greenland": { label: "Greenland", kw: "greenland" },
  "Sora Sukhumvit": { label: "Bangkok", kw: "bangkok" },
  "Song Saa Private Island": { label: "Koh Rong", kw: "koh rong" },
  "IC Khao Yai": { label: "Khao Yai", kw: "khao yai" },
  "Six Senses Fort Barwara": { label: "Rajasthan", kw: "rajasthan" },
  Azerai: { label: "Hue", kw: "hue vietnam" },
  "ANA IC Ishigaki": { label: "Ishigaki", kw: "ishigaki" },
  "Six Senses Shaharut": { label: "the Negev", kw: "negev desert" },
  "ANA IC Manza": { label: "Okinawa", kw: "okinawa manza" },
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

function Detail({ client, onBack, month, importedPlan, onImportPlan }) {
  const cur = gsc(client, month);
  const prev = month > 0 ? gsc(client, month - 1) : null;
  const dPct = (key) => (prev ? Math.round(((cur[key] - prev[key]) / prev[key]) * 100) : 0);
  const cs = series(client);
  const chartData = cs.map((v, i) => ({ month: MONTHS[i], clicks: v }));
  const b = cur.buckets;
  const read = analystRead(client, month);
  const [tab, setTab] = useState("overview");

  // Off-page work is no longer part of the program — exclude it from plans.
  const plan = (ACTION_PLANS[client.name] || []).filter((t) => t.cat !== "Off-page");
  const { active, deliveredToDate, upcoming } = monthlyPlan(plan, month);
  const pct = plan.length ? Math.round((deliveredToDate / plan.length) * 100) : 0;

  // Content opportunities: queries with proven demand (impressions) leaking
  // clicks because they sit below the top of page 1. Gap = the extra clicks we'd
  // capture at position 3. Blog-intent picks become the month's suggested posts.
  const opps = client.keywords
    .map((kw) => {
      const pos = kwPos(kw, month);
      const impressions = kw.v;
      const curClicks = Math.round(impressions * ctrFor(pos));
      const gap = Math.max(0, Math.round(impressions * ctrFor(Math.min(pos, 3))) - curClicks);
      const intent = intentOf(kw.k);
      return { k: kw.k, pos, impressions, gap, intent, url: pageUrl(client.domain, kw.k, intent) };
    })
    .filter((o) => o.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const blogPicks = opps.filter((o) => o.intent === "blog").slice(0, 2);

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
          <div style={{ color: C.faint, fontSize: 13 }} className="mt-1.5">
            {client.domain} · {client.market}
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
          <span style={{ color: C.faint, fontSize: 12.5 }}>{client.keywords.length} tracked</span>
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
        {client.keywords.map((kw, i) => {
          const pos = kwPos(kw, month);
          const change = month > 0 ? kwPos(kw, month - 1) - pos : 0; // positive = improved
          return (
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
                {pos}
              </span>
              <span className="flex justify-end">
                {/* invert: a smaller position number is an improvement */}
                <Delta value={change} invert />
              </span>
              <span style={{ color: C.muted, fontSize: 14, fontVariantNumeric: "tabular-nums" }} className="text-right">
                {fmt(kwClicks(kw, pos))}
              </span>
            </div>
          );
        })}
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
function Login({ onAuth }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const submit = () => {
    if (!email.trim()) return setError("Enter your work email.");
    if (code !== "advant2026") return setError("That access code doesn't match.");
    setError("");
    onAuth(email.trim(), remember);
  };
  const onKey = (e) => e.key === "Enter" && submit();

  const inputStyle = {
    width: "100%",
    background: "#fff",
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    color: C.ink,
    fontFamily: "Inter, system-ui, sans-serif",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="rounded-xl p-7" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 mb-5" style={{ color: C.accent }}>
            <Lock size={15} />
            <span style={{ fontSize: 12.5, letterSpacing: "0.12em" }} className="uppercase font-semibold">
              Advant Labs
            </span>
          </div>
          <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 28, color: C.ink }} className="leading-none mb-1.5">
            SEO Progress
          </h1>
          <p style={{ color: C.muted, fontSize: 13.5 }} className="mb-6">
            Private dashboard — sign in to continue.
          </p>

          <label style={{ color: C.muted, fontSize: 12.5 }} className="block mb-1.5 font-medium">
            Work email
          </label>
          <input
            className="lf"
            style={{ ...inputStyle, marginBottom: 14 }}
            type="email"
            value={email}
            placeholder="you@advantlabs.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
          />

          <label style={{ color: C.muted, fontSize: 12.5 }} className="block mb-1.5 font-medium">
            Access code
          </label>
          <input
            className="lf"
            style={inputStyle}
            type="password"
            value={code}
            placeholder="••••••••"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKey}
          />

          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none" style={{ color: C.muted, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: C.accent, width: 15, height: 15 }}
            />
            Remember me on this device
          </label>

          {error && (
            <p style={{ color: C.risk, fontSize: 13 }} className="mt-3">
              {error}
            </p>
          )}

          <button
            onClick={submit}
            className="w-full mt-5 rounded-lg py-2.5 font-medium transition-opacity hover:opacity-90"
            style={{ background: C.accent, color: "#fff", fontSize: 14.5 }}
          >
            Sign in
          </button>
        </div>
        <p style={{ color: C.faint, fontSize: 12 }} className="text-center mt-4">
          Demo build · access code <span style={{ color: C.muted }}>advant2026</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App shell                                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(MONTHS.length - 1); // default to latest month
  const [importedPlan, setImportedPlan] = useState(null); // blog plan rows imported from a sheet (all clients)

  // Restore a remembered session, if one was saved. Stores only a flag —
  // never the access code. Real persistent sessions come with Supabase.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.storage) {
          const r = await window.storage.get("auth_session");
          if (active && r && r.value && JSON.parse(r.value).authed) setAuthed(true);
        }
      } catch (e) {
        /* storage unavailable — falls back to session-only sign-in */
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = (email, remember) => {
    setAuthed(true);
    if (!remember) return;
    try {
      if (window.storage) window.storage.set("auth_session", JSON.stringify({ authed: true, email }));
    } catch (e) {
      /* ignore — sign-in still succeeds for this session */
    }
  };

  const signOut = () => {
    setAuthed(false);
    setSelected(null);
    try {
      if (window.storage) window.storage.delete("auth_session");
    } catch (e) {
      /* ignore */
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap'); .lf:focus{outline:none;border-color:${C.accent};box-shadow:0 0 0 3px rgba(31,78,74,0.12);}`}</style>
      <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {!ready ? null : !authed ? (
          <Login onAuth={signIn} />
        ) : (
          <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
            {/* Masthead */}
            <header className="flex items-end justify-between pb-5 mb-6" style={{ borderBottom: `1px solid ${C.line}` }}>
              <div>
                <div style={{ color: C.accent, fontSize: 12.5, letterSpacing: "0.12em" }} className="uppercase font-semibold mb-1">
                  Advant Labs
                </div>
                <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 26, color: C.ink }} className="leading-none">
                  SEO Progress
                </h1>
              </div>
              <div className="flex flex-col items-end gap-2.5">
                {/* Month dropdown — drives every figure on the screen */}
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
                    {CLIENTS.length} properties · {MONTH_FULL[MONTHS[month]]} {YEAR}
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

            {selected ? (
              <Detail
                client={selected}
                onBack={() => setSelected(null)}
                month={month}
                importedPlan={importedPlan}
                onImportPlan={setImportedPlan}
              />
            ) : (
              <Portfolio clients={CLIENTS} onSelect={setSelected} month={month} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
