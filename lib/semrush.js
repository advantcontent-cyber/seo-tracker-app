// Live SEMrush Analytics API client — powers the Keyword Explorer.
// Same server-side style as lib/gsc.js / lib/sem.js: reads the key from env,
// throws a clear Error if it's missing (the route turns that into a 500 rather
// than crashing). The Analytics API returns a ';'-delimited CSV with a header
// row; on an API error it returns HTTP 200 with an "ERROR ## :: message" body.

const BASE = "https://api.semrush.com/";

// Columns requested from both reports, in order: Phrase, Volume, KD, CPC, Comp.
const COLUMNS = ["Ph", "Nq", "Kd", "Cp", "Co"];

function apiKey() {
  const k = process.env.SEMRUSH_API_KEY;
  if (!k) throw new Error("SEMRUSH_API_KEY not set");
  return k;
}

// Parse a ';'-delimited SEMrush body into row objects keyed by the requested
// column codes (mapped by position — the response preserves export_columns
// order). "" / "ERROR" / "NOTHING FOUND" bodies yield [].
function parseSemrush(text, columns) {
  const body = (text || "").trim();
  if (!body || /^ERROR/i.test(body) || /NOTHING FOUND/i.test(body)) return [];
  const lines = body.split(/\r?\n/);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    columns.forEach((code, i) => { row[code] = cells[i]; });
    return row;
  });
}

async function semrushGet(params, columns) {
  const url = `${BASE}?${new URLSearchParams({ ...params, key: apiKey() })}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`SEMrush ${res.status}: ${text.slice(0, 160)}`);
  // 200 with an "ERROR ## :: message" body is an API error — surface it, except
  // "NOTHING FOUND" which is just an empty result set.
  const trimmed = text.trim();
  if (/^ERROR/i.test(trimmed) && !/NOTHING FOUND/i.test(trimmed)) {
    throw new Error(`SEMrush: ${trimmed.slice(0, 160)}`);
  }
  return parseSemrush(text, columns);
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const toKw = (r) => ({
  keyword: (r.Ph || "").trim(),
  volume:  num(r.Nq),
  kd:      num(r.Kd) != null ? Math.round(num(r.Kd)) : null,
});

// Keyword variations that CONTAIN the seed phrase (exact matches, reorderings,
// close variants), high-volume first — on-topic by construction, unlike the
// semantic drift of phrase_related. Returns [{ keyword, volume, kd }]; this
// report includes Nq + Kd directly.
export async function phraseFullsearch(seed, database = "us", limit = 25) {
  const rows = await semrushGet({
    type: "phrase_fullsearch",
    phrase: seed,
    database,
    export_columns: COLUMNS.join(","),
    display_sort: "nq_desc",
    display_limit: String(limit),
  }, COLUMNS);
  return rows.map(toKw).filter((k) => k.keyword);
}

// Batch Keyword Overview for a list of phrases (≤100, ';'-joined) — used to
// confirm volume (and KD where available). Some plans reject Kd on this report,
// so if the 5-column request errors we retry for volume only; the route
// backfills KD from phrase_related.
export async function phraseThese(phrases, database = "us") {
  const list = phrases.slice(0, 100).join(";");
  if (!list) return [];
  const base = { type: "phrase_these", phrase: list, database };
  try {
    const rows = await semrushGet({ ...base, export_columns: COLUMNS.join(",") }, COLUMNS);
    return rows.map(toKw).filter((k) => k.keyword);
  } catch {
    const cols = ["Ph", "Nq", "Cp", "Co"];
    const rows = await semrushGet({ ...base, export_columns: cols.join(",") }, cols);
    return rows.map(toKw).filter((k) => k.keyword);
  }
}
