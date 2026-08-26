// TEMPORARY debug route — live field discovery for AZLRH's "Top Performing
// Keywords / Ads" feedback item. Confirms whether ad_group_criterion_keyword_text
// actually returns real, non-empty data for this account before building any
// UI around it. DELETE this route (and its middleware.js bypass) once confirmed.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

export const dynamic = "force-dynamic";

async function windsorGet(fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key: WINDSOR_KEY,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
  });
  const res = await fetch(`${BASE}/google_ads?${params}`);
  if (!res.ok) throw new Error(`Windsor google_ads ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

function isAzlrh(accountName) {
  const s = (accountName || "").toLowerCase();
  return s.includes("azerai") && !s.includes("ke ga bay");
}

// Trying several field combinations in one call to minimize deploy round-
// trips — the ad_group_criterion report rejects being combined with normal
// campaign-level fields (confirmed: "can only be read from the
// ad_group_criterion report and cannot be combined with fields outside it").
const ATTEMPTS = [
  { label: "search_term_view_search_term + clicks/impressions", fields: ["account_name", "search_term_view_search_term", "clicks", "impressions"] },
  { label: "search_term_view_search_term + cost_micros + campaign", fields: ["account_name", "campaign", "search_term_view_search_term", "clicks", "impressions", "cost_micros"] },
  { label: "search_term_view_search_term + match_type", fields: ["account_name", "search_term_view_search_term", "match_type", "clicks", "impressions"] },
];

export async function GET() {
  const dateFrom = "2026-03-01";
  const dateTo = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const attempt of ATTEMPTS) {
    try {
      const rows = await windsorGet(attempt.fields, dateFrom, dateTo);
      const azlrhRows = rows.filter((r) => isAzlrh(r.account_name));
      results.push({
        label: attempt.label,
        fields: attempt.fields,
        ok: true,
        totalRowsAllAccounts: rows.length,
        azlrhRowCount: azlrhRows.length,
        azlrhRowsWithKeywordText: azlrhRows.filter((r) => r.ad_group_criterion_keyword_text).length,
        sampleAzlrhRows: azlrhRows.slice(0, 10),
      });
    } catch (err) {
      results.push({ label: attempt.label, fields: attempt.fields, ok: false, error: err.message });
    }
  }

  return Response.json({ results });
}
