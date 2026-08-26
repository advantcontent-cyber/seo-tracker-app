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

export async function GET() {
  try {
    const dateFrom = "2026-03-01";
    const dateTo = new Date().toISOString().slice(0, 10);

    const rows = await windsorGet(
      ["account_name", "campaign", "ad_group_criterion_keyword_text", "ad_group_criterion_keyword_match_type", "clicks", "impressions", "spend", "conversions", "currency"],
      dateFrom,
      dateTo
    );

    const azlrhRows = rows.filter((r) => isAzlrh(r.account_name));
    const accountNames = [...new Set(rows.map((r) => r.account_name))];
    const nonEmptyKeywordRows = azlrhRows.filter((r) => r.ad_group_criterion_keyword_text);

    return Response.json({
      ok: true,
      totalRowsAllAccounts: rows.length,
      accountNamesSeen: accountNames,
      azlrhRowCount: azlrhRows.length,
      azlrhRowsWithKeywordText: nonEmptyKeywordRows.length,
      sampleAzlrhRows: azlrhRows.slice(0, 15),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
