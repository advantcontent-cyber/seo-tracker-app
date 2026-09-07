// TEMPORARY debug route — confirms live Windsor fields for IC Khao Yai's
// campaign-name filter + conversion action category redefinition of Click
// Book (Hung's Aug 2026 feedback). DELETE once confirmed — see
// project_seo_tracker_app memory for this pattern.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

export async function GET() {
  try {
    const dateFrom = "2026-01-01";
    const t = new Date();
    const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

    const [gConvCat, gCampaignsRaw, mCampaignsRaw] = await Promise.all([
      windsorGet("google_ads", ["account_name", "conversion_action_name", "conversion_action_category", "conversions", "all_conversions"], dateFrom, dateTo),
      windsorGet("google_ads", ["account_name", "campaign"], dateFrom, dateTo),
      windsorGet("facebook", ["account_name", "campaign"], dateFrom, dateTo),
    ]);

    const icky = (name) => (name || "").toLowerCase().includes("intercontinental khao yai");

    const convRows = gConvCat.filter((r) => icky(r.account_name));
    const categoryTotals = {};
    for (const r of convRows) {
      const cat = r.conversion_action_category ?? "(none)";
      categoryTotals[cat] ??= { conversions: 0, all_conversions: 0, actionNames: new Set() };
      categoryTotals[cat].conversions += Number(r.conversions ?? 0);
      categoryTotals[cat].all_conversions += Number(r.all_conversions ?? 0);
      categoryTotals[cat].actionNames.add(r.conversion_action_name);
    }
    const categorySummary = Object.entries(categoryTotals).map(([cat, v]) => ({
      category: cat, conversions: v.conversions, all_conversions: v.all_conversions,
      actionNames: [...v.actionNames],
    }));

    const gCampaignNames = [...new Set(gCampaignsRaw.filter((r) => icky(r.account_name)).map((r) => r.campaign))];
    const mCampaignNames = [...new Set(mCampaignsRaw.filter((r) => icky(r.account_name)).map((r) => r.campaign))];

    return NextResponse.json({
      ok: true,
      googleConversionCategorySummary: categorySummary,
      googleCampaignNames: gCampaignNames,
      metaCampaignNames: mCampaignNames,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
