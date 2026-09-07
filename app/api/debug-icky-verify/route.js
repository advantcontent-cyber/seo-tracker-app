// TEMPORARY debug route — verifies IC Khao Yai's Advant-campaign filter
// (Sept 2026, Hung's feedback) layered on top of the already-live Outbound
// Click category fix. DELETE once confirmed.
import { NextResponse } from "next/server";
import { fetchSemData } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await fetchSemData();
    const icky = data["IC Khao Yai"];
    if (!icky) return NextResponse.json({ error: "no IC Khao Yai data" }, { status: 404 });

    const dates = Object.keys(icky.daily).sort();
    let totals = { spend: 0, clicks: 0, impressions: 0, allConversions: 0, outboundClickConversions: 0, metaClickBook: 0 };
    for (const d of dates) {
      const g = icky.daily[d].google;
      const m = icky.daily[d].meta;
      totals.spend += g.spend ?? 0;
      totals.clicks += g.clicks ?? 0;
      totals.impressions += g.impressions ?? 0;
      totals.allConversions += g.allConversions ?? 0;
      totals.outboundClickConversions += g.outboundClickConversions ?? 0;
      totals.metaClickBook += m.clickBook ?? 0;
    }
    totals.combinedClickBook = totals.outboundClickConversions + totals.metaClickBook;

    const allGoogleCampaignNames = [...new Set(
      dates.flatMap((d) => (icky.campaigns[d] || []).filter((c) => c.platform === "google").map((c) => c.name))
    )];

    return NextResponse.json({
      ok: true,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      googleTotals: totals,
      remainingGoogleCampaignNames: allGoogleCampaignNames,
      remainingCampaignCount: allGoogleCampaignNames.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
