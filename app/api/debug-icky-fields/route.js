// TEMPORARY debug route — verifies IC Khao Yai's campaign-filter/Click Book
// redefinition (Hung's Sep 2026 feedback) end-to-end through the real
// fetchSemData pipeline. DELETE once confirmed — see project_seo_tracker_app
// memory for this pattern.
import { NextResponse } from "next/server";
import { fetchSemData } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await fetchSemData();
    const icky = data["IC Khao Yai"];
    if (!icky) return NextResponse.json({ error: "no IC Khao Yai data" }, { status: 404 });

    const dates = Object.keys(icky.daily).sort();
    let totals = { spend: 0, clicks: 0, impressions: 0, allConversions: 0, clickBook: 0, metaClickBook: 0, combinedClickBook: 0 };
    for (const d of dates) {
      const g = icky.daily[d].google;
      const m = icky.daily[d].meta;
      totals.spend += g.spend ?? 0;
      totals.clicks += g.clicks ?? 0;
      totals.impressions += g.impressions ?? 0;
      totals.allConversions += g.allConversions ?? 0;
      totals.clickBook += g.clickBook ?? 0;
      totals.metaClickBook += m.clickBook ?? 0;
      totals.combinedClickBook += (g.clickBook ?? 0) + (m.clickBook ?? 0);
    }

    // Sample one recent date's google campaign list to eyeball the filter.
    const lastDate = dates[dates.length - 1];
    const sampleCampaigns = (icky.campaigns[lastDate] || []).filter((c) => c.platform === "google");
    const allGoogleCampaignNames = [...new Set(
      dates.flatMap((d) => (icky.campaigns[d] || []).filter((c) => c.platform === "google").map((c) => c.name))
    )];

    return NextResponse.json({
      ok: true,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      googleTotals: totals,
      remainingGoogleCampaignNames: allGoogleCampaignNames,
      lastDateSampleCampaigns: sampleCampaigns,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
