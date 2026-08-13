// TEMPORARY — one-off field discovery for the SSFB Campaign Performance tab.
// Confirms the ad-set-name field on Windsor's facebook connector (candidates
// below), scoped to account 943547439793786 (Six Senses Fort Barwara).
// Delete this route once confirmed — not meant to ship to main.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";
export const dynamic = "force-dynamic";

async function windsorGet(connector, fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key: WINDSOR_KEY,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
  });
  const res = await fetch(`${BASE}/${connector}?${params}`);
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
  try {
    const json = JSON.parse(text);
    const rows = Array.isArray(json) ? json : (json.data ?? json);
    return { ok: true, rows };
  } catch {
    return { ok: false, error: `non-JSON: ${text.slice(0, 300)}` };
  }
}

const filterSsfb = (rows) =>
  Array.isArray(rows) ? rows.filter((r) => String(r.account_id) === "943547439793786" || (r.account_name || "").toLowerCase().includes("fort barwara")) : rows;

export async function GET() {
  if (!WINDSOR_KEY) return Response.json({ error: "WINDSOR_API_KEY not set" }, { status: 500 });

  const dateFrom = "2026-07-01";
  const dateTo = "2026-07-31";

  const base = ["account_id", "account_name", "date", "campaign", "spend", "clicks"];
  const candidates = ["adset", "adset_name", "ad_set_name", "ad_set", "adgroup", "adgroup_name"];

  const results = {};
  for (const field of candidates) {
    const r = await windsorGet("facebook", [...base, field], dateFrom, dateTo);
    results[field] = r.ok
      ? { ok: true, sample: filterSsfb(r.rows).slice(0, 5) }
      : { ok: false, error: r.error };
  }

  return Response.json(results);
}
