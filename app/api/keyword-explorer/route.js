// POST /api/keyword-explorer
// From a page URL, return ~10 general, high-volume keyword recommendations
// (keyword, volume, KD) via the live SEMrush Analytics API — the shortlist
// you'd pitch for a page's SEO strategy. Auth + role scope mirror
// /api/keyword-ideas and /api/semrush. No caching/persistence (v1).
//
// Body: { url, database } — database defaults to "us".
// Returns { ok: true, keywords: [{ keyword, volume, kd }] } sorted by volume.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { phraseFullsearch, phraseThese } from "../../../lib/semrush";

const ALL_CLIENTS = ["Shinta Mani Wild", "Sora Sukhumvit", "IC Khao Yai"];

// Known property hosts → client, for role-scope gating of the posted URL.
// A URL on one of these hosts is only allowed if the user may see that client;
// any other (arbitrary) host is open to any authenticated user.
const DOMAIN_CLIENT = [
  { host: "shintamani.com",               client: "Shinta Mani Wild" },
  { host: "sorahotels.com",               client: "Sora Sukhumvit" },
  { host: "khaoyai.intercontinental.com", client: "IC Khao Yai" },
  { host: "nomadgreenland.com",           client: "Nomad Greenland" },
];

// True function words only — content words like "hotel"/"resort" are kept,
// they're core keywords for these properties.
const STOP = new Set("the a an and or of in on at to for with your our this that".split(" "));

export async function POST(req) {
  // 1. Auth + role scope (same pattern as /api/keyword-ideas, /api/semrush)
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: roleRow } = await admin
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role ?? "admin";
  const allowed = role === "admin" ? ALL_CLIENTS : ALL_CLIENTS.filter((n) => n === roleRow?.client_name);

  // 2. Body
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const url = (body.url || "").trim();
  const database = (body.database || "us").trim() || "us";
  const providedSeeds = parseSeeds(body.seeds); // caller-supplied seeds override page extraction
  if (!url) return Response.json({ error: "A URL is required" }, { status: 400 });

  let parsed;
  try { parsed = new URL(url); } catch { return Response.json({ error: "That doesn't look like a valid URL" }, { status: 400 }); }
  if (!/^https?:$/.test(parsed.protocol)) return Response.json({ error: "URL must start with http:// or https://" }, { status: 400 });

  // Role gate: if the URL is a known client's site, require access to it.
  const host = parsed.hostname.replace(/^www\./, "");
  // Brand = the registrable domain label only (e.g. "intercontinental"), NOT
  // subdomains — for khaoyai.intercontinental.com the "khaoyai" subdomain is the
  // destination, and dropping it would nuke every "khao yai" keyword. (Assumes a
  // single-part TLD like .com, which all the properties use.)
  const labels = host.split(".");
  const brand = [(labels.length >= 2 ? labels[labels.length - 2] : labels[0]).toLowerCase()].filter((s) => s.length > 2);
  const match = DOMAIN_CLIENT.find((d) => host === d.host || host.endsWith("." + d.host));
  if (match && !allowed.includes(match.client))
    return Response.json({ error: "You're not authorised for this property" }, { status: 403 });

  // Fail fast + clearly if the SEMrush key isn't configured.
  if (!process.env.SEMRUSH_API_KEY)
    return Response.json({ error: "SEMrush is not configured (SEMRUSH_API_KEY missing)" }, { status: 500 });

  try {
    // 3. Seeds: use the caller's if provided, else extract from the page
    //    (simple heuristic, no LLM). Provided seeds skip the page fetch.
    let seeds = providedSeeds;
    if (!seeds.length) {
      seeds = await extractSeeds(parsed, brand);
      if (!seeds.length)
        return Response.json({ error: "Couldn't read any keywords from that page — type a seed keyword instead" }, { status: 422 });
    }

    // 4. Discovery: phrase_fullsearch on the seeds (up to 6) — variations
    //    containing each seed, so results stay on-topic.
    const found = (await Promise.all(seeds.slice(0, 6).map((s) => phraseFullsearch(s, database, 20)))).flat();

    // Dedupe (keep the higher-volume duplicate); drop the site's own brand terms.
    const seen = new Map();
    for (const k of found) {
      const key = k.keyword.toLowerCase();
      if (!key || isBrand(key, brand)) continue;
      const cur = seen.get(key);
      if (!cur || (k.volume ?? 0) > (cur.volume ?? 0)) seen.set(key, k);
    }
    let merged = [...seen.values()];

    // 5. Enrich: phrase_these confirms volume; KD stays from phrase_related
    //    (reliable there), with phrase_these as a fallback.
    try {
      const these = await phraseThese(merged.map((k) => k.keyword), database);
      const byKw = new Map(these.map((k) => [k.keyword.toLowerCase(), k]));
      merged = merged.map((k) => {
        const t = byKw.get(k.keyword.toLowerCase());
        return {
          keyword: k.keyword,
          volume:  t?.volume ?? k.volume ?? 0,
          kd:      k.kd ?? t?.kd ?? null,
        };
      });
    } catch { /* keep phrase_related volume/KD if enrichment fails */ }

    const keywords = merged
      .filter((k) => k.keyword && (k.volume ?? 0) > 0)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 10)
      .map((k) => ({ keyword: k.keyword, volume: Math.round(k.volume ?? 0), kd: k.kd != null ? Math.round(k.kd) : null }));

    // Echo the seeds used so the UI can show + let the analyst refine them.
    return Response.json({ ok: true, keywords, seeds });
  } catch (err) {
    console.error("[/api/keyword-explorer]", err);
    return Response.json({ error: err.message || "Keyword lookup failed" }, { status: 500 });
  }
}

/* ---------------- seed extraction (heuristic, server-side) ---------------- */

// Normalise caller-supplied seeds (string with comma/newline/semicolon
// separators, or an array) into up to 6 clean phrases. The analyst's own
// wording is respected — no brand/stopword stripping here.
function parseSeeds(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(/[,;\n]/);
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const c = (raw || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    if (out.length >= 6) break;
  }
  return out;
}

async function extractSeeds(parsed, brand) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let html;
  try {
    const res = await fetch(parsed.href, {
      signal: controller.signal,
      cache: "no-store",
      // A realistic browser UA — many site WAFs 403 non-browser agents.
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`Couldn't fetch the page (HTTP ${res.status})`);
    html = await res.text();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The page took too long to respond");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const title = grab(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc  = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || "";
  const h1s   = grabAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  const h2s   = grabAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi);

  // Candidate phrases: title's primary segment, the meta description broken
  // into short clauses (a full sentence is a poor seed; its clauses are good
  // ones), then H1s and every H2. Keep 2–6-word phrases and try up to 6 —
  // marketing-fluff headings often return nothing, so breadth matters.
  const descClauses = desc.split(/[,.;:]|\s(?:and|in|with|offering|featuring|for|at)\s/i);
  const candidates = [splitTitle(title), ...descClauses, ...h1s, ...h2s].filter(Boolean);
  const seeds = [];
  const seen = new Set();
  for (const phrase of candidates) {
    const cleaned = cleanSeed(phrase, brand);
    const words = cleaned.split(" ").filter(Boolean);
    if (words.length >= 2 && words.length <= 6 && !seen.has(cleaned)) {
      seen.add(cleaned);
      seeds.push(cleaned);
    }
    if (seeds.length >= 6) break;
  }
  return seeds;
}

const grab = (html, re) => { const m = html.match(re); return m ? decodeEntities(stripTags(m[1])) : ""; };
const grabAll = (html, re) => [...html.matchAll(re)].map((m) => decodeEntities(stripTags(m[1]))).filter(Boolean);
const stripTags = (s) => (s || "").replace(/<[^>]*>/g, " ");
const splitTitle = (t) => (t || "").split(/[|–—]/)[0].trim();

function decodeEntities(s) {
  return (s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
}

// Lowercase, strip a trailing brand segment, drop punctuation + brand tokens,
// trim leading/trailing stopwords, cap at 6 words.
function cleanSeed(s, brand) {
  let out = (s || "").toLowerCase().replace(/[|–—:].*$/, "");
  out = out.replace(/[^a-z0-9\s]/g, " ");
  for (const b of brand) out = out.split(b).join(" ");
  const words = out.split(/\s+/).filter((w) => w.length > 1);
  while (words.length && STOP.has(words[0])) words.shift();
  while (words.length && STOP.has(words[words.length - 1])) words.pop();
  return words.slice(0, 6).join(" ").trim();
}

function isBrand(keyword, brand) {
  const compact = keyword.replace(/\s+/g, "");
  return brand.some((b) => keyword.includes(b) || compact.includes(b));
}
