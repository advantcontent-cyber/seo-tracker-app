// TEMPORARY debug route — checking why AZLRH's "Total Purchases By Month"
// doesn't match the client's own Looker Studio reference. Fetches Google
// Ads conversion_action_name breakdown WITH the campaign dimension (unlike
// lib/sem.js's gConvActions query, which omits it) so purchases can be
// routed by campaign prefix (AZKGB_ / AZLRH_) instead of raw account_name —
// Azerai's Google Ads account setup means account_name alone can't tell the
// two properties apart (see SPLIT_ONLY_ACCOUNTS in lib/sem.js).
// DELETE this route (and its middleware.js bypass) once confirmed.
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
  const res = await fetch(`${BASE}/${connector}?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

export async function GET() {
  try {
    const dateFrom = "2026-01-01";
    const t = new Date();
    const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

    const rows = await windsorGet(
      "google_ads",
      ["account_name", "campaign", "date", "conversion_action_name", "all_conversions", "all_conversions_value", "currency"],
      dateFrom,
      dateTo
    );

    // Raw account_name values seen, for sanity-checking the split assumption.
    const accountNames = [...new Set(rows.map((r) => r.account_name))];

    const byMonthExact = {}; // "purchase" exact match only, by prefix
    const byMonthBoth = {};  // "purchase" OR "azerai - ga4 (web) purchase", by prefix
    const byCampaignMonth = {}; // every distinct campaign name -> {month: count}, all purchase-ish actions
    const azeraiCampaignNames = new Set();

    for (const row of rows) {
      const campaign = row.campaign || "";
      const upper = campaign.toUpperCase();
      let prop = null;
      if (upper.startsWith("AZKGB")) prop = "AZKGB";
      else if (upper.startsWith("AZLRH")) prop = "AZLRH";
      const name = (row.conversion_action_name || "").toLowerCase();
      const isPurchaseish = name.includes("purchase");
      const accountIsAzerai = (row.account_name || "").toLowerCase().includes("azerai");
      if (accountIsAzerai && isPurchaseish) azeraiCampaignNames.add(campaign);
      if (!prop) continue;
      const month = String(row.date).slice(0, 7);
      const count = Math.round(row.all_conversions ?? 0);
      if (name === "purchase") {
        byMonthExact[prop] ??= {};
        byMonthExact[prop][month] = (byMonthExact[prop][month] || 0) + count;
      }
      if (isPurchaseish) {
        byMonthBoth[prop] ??= {};
        byMonthBoth[prop][month] = (byMonthBoth[prop][month] || 0) + count;

        byCampaignMonth[campaign] ??= {};
        byCampaignMonth[campaign][month] = (byCampaignMonth[campaign][month] || 0) + count;
      }
    }

    return Response.json({
      dateFrom, dateTo,
      accountNames,
      azeraiCampaignNames: [...azeraiCampaignNames],
      byMonthExact,
      byMonthBoth,
      byCampaignMonth,
      totalRows: rows.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
