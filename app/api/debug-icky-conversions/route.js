// TEMPORARY debug route — same pattern as every prior field-discovery pass
// on this repo (e.g. the Sora/Azerai all_conversions bucket bug, Aug 2026).
// Fetches Google Ads' conversion_action_name breakdown for IC Khao Yai,
// Jan 1 - Aug 31 2026, to check whether Click Book's broad all_conversions
// bucket (used deliberately for this client, see GOOGLE_CONVERSION_ACTION_MATCH
// in lib/sem.js) is rolling in an unrelated conversion action that inflated
// Jan-Mar specifically. DELETE THIS ROUTE (and its middleware.js bypass)
// once confirmed — do not ship it.

export const dynamic = "force-dynamic";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

export async function GET() {
  try {
    if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
    const params = new URLSearchParams({
      api_key: WINDSOR_KEY,
      fields: "account_name,date,conversion_action_name,all_conversions,all_conversions_value",
      date_from: "2026-01-01",
      date_to: "2026-08-31",
    });
    const res = await fetch(`${BASE}/google_ads?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    const iky = rows.filter((r) => (r.account_name || "").toLowerCase().includes("intercontinental khao yai"));

    // Aggregate by month + conversion_action_name so a rogue action jumps out.
    const byMonthAction = {};
    for (const r of iky) {
      const month = (r.date || "").slice(0, 7);
      const action = r.conversion_action_name || "(none)";
      const key = `${month} | ${action}`;
      byMonthAction[key] = (byMonthAction[key] ?? 0) + Math.round(Number(r.all_conversions) || 0);
    }

    // Also the plain month totals (should match the dashboard's Google-side
    // contribution to Click Book, i.e. dayCombined's google.allConversions).
    const byMonth = {};
    for (const r of iky) {
      const month = (r.date || "").slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + Math.round(Number(r.all_conversions) || 0);
    }

    return Response.json({
      ok: true,
      totalRows: iky.length,
      distinctAccounts: [...new Set(rows.map((r) => r.account_name))],
      byMonth,
      byMonthAction,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
