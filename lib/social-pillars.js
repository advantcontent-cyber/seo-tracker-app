// Content-pillar assignments pulled from the client's content-calendar Google
// Sheet, so a post's pillar is whatever was planned there instead of a guess.
// The sheet URL per client lives in Supabase (seo_social_pillar_sources,
// edited in the Table editor like the other config tables); it must be
// shared "anyone with the link can view" so it can be read as CSV.
//
// Expected columns (header names matched loosely, any order): a post link
// (link / url / permalink), a date, the caption/title/copy, and the pillar.
// A post is matched by link first, then by date + the start of its caption.

export function sheetCsvUrl(url) {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(url || "");
  if (!m) return null;
  const gid = /[#&?]gid=(\d+)/.exec(url);
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid[1]}` : ""}`;
}

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, embedded newlines).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const norm = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const normLink = (u) => (u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split(/[?#]/)[0].replace(/\/+$/, "");

function toIsoDate(v) {
  const s = (v || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Turns CSV rows into [{ link, date, text, pillar }], locating columns by header.
export function parsePillarSheet(csv) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  // Names are tried in priority order (exact header first, then "contains"),
  // so e.g. a "Post Link" column is never mistaken for the caption column.
  const find = (...names) => {
    for (const n of names) { const i = header.findIndex((h) => h === n); if (i >= 0) return i; }
    for (const n of names) { const i = header.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
    return -1;
  };
  const iPillar = find("content pillar", "pillar");
  if (iPillar < 0) return [];
  const iLink = find("permalink", "post link", "link", "url");
  const iDate = find("publish date", "post date", "date");
  const iText = find("caption", "copy", "title", "topic", "idea", "post");
  return rows.slice(1).map((r) => ({
    link: iLink >= 0 ? normLink(r[iLink]) : "",
    date: iDate >= 0 ? toIsoDate(r[iDate]) : null,
    text: iText >= 0 ? norm(r[iText]) : "",
    pillar: (r[iPillar] || "").trim(),
  })).filter((r) => r.pillar);
}

export async function fetchPillarSheet(sheetUrl) {
  const url = sheetCsvUrl(sheetUrl);
  if (!url) throw new Error("Not a Google Sheets link");
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Sheet ${res.status} — is it shared as "anyone with the link can view"?`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Sheet returned a login page — share it as "anyone with the link can view"');
  return parsePillarSheet(text);
}

// (post) => pillar | null, matching a post against the sheet rows.
export function makePillarLookup(rows) {
  if (!rows?.length) return () => null;
  const byLink = new Map(rows.filter((r) => r.link).map((r) => [r.link, r.pillar]));
  return (post) => {
    const l = normLink(post.link);
    if (l && byLink.has(l)) return byLink.get(l);
    const text = norm(post.copy || post.title).slice(0, 40);
    if (!post.date || !text) return null;
    const hit = rows.find((r) => r.date === post.date && r.text && (r.text.startsWith(text.slice(0, 20)) || text.startsWith(r.text.slice(0, 20))));
    return hit ? hit.pillar : null;
  };
}
