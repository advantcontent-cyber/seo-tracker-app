// TEMPORARY debug route — same pattern as debug-icky-conversions (Aug 2026,
// see git history af8a1b7/00b3cb8). Fetches Google Ads' conversion_action_
// category breakdown for IC Khao Yai, Aug 2026, to check what Windsor
// actually returns for that field — the Outbound Click category fix
// (lib/sem.js OUTBOUND_CLICK_CATEGORY_CLIENTS) was never verified against
// live data before shipping. DELETE THIS ROUTE (and its middleware.js
// bypass) once confirmed — do not ship it.

export const dynamic = "force-dynamic";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

export async function GET() {
  try {
    if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
    const params = new URLSearchParams({
      api_key: WINDSOR_KEY,
      fields: "account_name,date,campaign,conversion_action_name,conversion_action_category,all_conversions",
      date_from: "2026-08-01",
      date_to: "2026-08-31",
    });
    const res = await fetch(`${BASE}/google_ads?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    const iky = rows.filter((r) => (r.account_name || "").toLowerCase().includes("intercontinental khao yai"));

    // Raw category values seen, and totals by (action name, category) pair —
    // so a category that isn't literally "Outbound Click"/"OUTBOUND_CLICK"
    // (a different label Windsor uses, or missing entirely) jumps out.
    const categoriesSeen = new Set();
    const byActionCategory = {};
    let totalAllConversions = 0;
    let outboundClickNormalizedTotal = 0;
    for (const r of iky) {
      const action = r.conversion_action_name || "(none)";
      const rawCategory = r.conversion_action_category;
      categoriesSeen.add(JSON.stringify(rawCategory));
      const count = Math.round(Number(r.all_conversions) || 0);
      totalAllConversions += count;
      const key = `${action} | category=${JSON.stringify(rawCategory)}`;
      byActionCategory[key] = (byActionCategory[key] ?? 0) + count;
      const normalized = String(rawCategory || "").toLowerCase().replace(/_/g, " ").trim();
      if (normalized === "outbound click") outboundClickNormalizedTotal += count;
    }

    return Response.json({
      ok: true,
      totalRows: iky.length,
      distinctAccounts: [...new Set(rows.map((r) => r.account_name))],
      categoriesSeen: [...categoriesSeen],
      totalAllConversions,
      outboundClickNormalizedTotal,
      byActionCategory,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
