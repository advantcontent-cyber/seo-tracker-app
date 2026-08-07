// TEMPORARY — one-off field discovery for onboarding Sora Sukhumvit's SEM
// report. Queries Windsor.ai directly for Sora's Meta + Google Ads accounts,
// testing candidate revenue/value field names ONE AT A TIME (alongside known-
// good fields) so a single bad guess doesn't 400 the whole request and hide
// the others. Delete this route once confirmed — not meant to ship to main.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

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

const filterSora = (rows, needle) =>
  Array.isArray(rows) ? rows.filter((r) => (r.account_name || "").toLowerCase().includes(needle)) : rows;

export async function GET() {
  if (!WINDSOR_KEY) return Response.json({ error: "WINDSOR_API_KEY not set" }, { status: 500 });

  const dateFrom = "2026-07-01";
  const dateTo = "2026-07-31";

  const metaBase = ["account_name", "date", "spend", "clicks", "impressions", "currency"];
  const metaCandidates = [
    "action_values_offsite_conversion_fb_pixel_purchase",
    "action_values_offsite_conversion_fb_pixel_add_to_cart",
    "actions_offsite_conversion_fb_pixel_purchase",
    "actions_offsite_conversion_fb_pixel_add_to_cart",
  ];

  const googleBase = ["account_name", "date", "spend", "clicks", "impressions", "currency"];
  const googleCandidates = [
    "all_conversions",
    "all_conversions_value",
    "conversions_value",
    "conversion_value",
    "all_conversion_value",
  ];

  const metaResults = {};
  for (const field of metaCandidates) {
    const r = await windsorGet("facebook", [...metaBase, field], dateFrom, dateTo);
    metaResults[field] = r.ok ? { ok: true, sample: filterSora(r.rows, "sukhumvit").slice(0, 3) } : { ok: false, error: r.error };
  }

  const googleResults = {};
  for (const field of googleCandidates) {
    const r = await windsorGet("google_ads", [...googleBase, field], dateFrom, dateTo);
    googleResults[field] = r.ok ? { ok: true, sample: filterSora(r.rows, "sukhumvit").slice(0, 3) } : { ok: false, error: r.error };
  }

  return Response.json({ meta: metaResults, google: googleResults });
}
