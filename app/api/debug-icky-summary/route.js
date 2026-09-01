// TEMPORARY debug route — same pattern as debug-icky-category (just
// removed, see git history). Calls the REAL fetchSemData() (not a
// reimplementation) and reproduces SummaryTab's exact aggregation
// (dayCombined + aggregateRange, isIcky=true) for IC Khao Yai, Aug 1-31
// 2026 — confirming what the Summary tab's Click Book/CPA/Amount Spent
// KPI cards actually compute to, end to end through the real production
// code path. DELETE THIS ROUTE (and its middleware.js bypass) once
// confirmed — do not ship it.

export const dynamic = "force-dynamic";

import { fetchSemData } from "../../../lib/sem";

function dateRange(from, to) {
  const out = [];
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export async function GET() {
  try {
    const { data } = await fetchSemData();
    const sem = data["IC Khao Yai"];
    if (!sem) throw new Error("No IC Khao Yai data in fetchSemData() result");

    const from = "2026-08-01", to = "2026-08-31";
    const days = dateRange(from, to);

    let spend = 0, googleOutboundClick = 0, googleAllConversions = 0, metaClickBook = 0, spendPending = false;
    const dailyBreakdown = [];
    for (const d of days) {
      const day = sem.daily?.[d];
      if (!day) { dailyBreakdown.push({ date: d, missing: true }); continue; }
      spend += day.spend ?? 0;
      if (day.spendPending) spendPending = true;
      const gOutbound = day.google?.outboundClickConversions ?? 0;
      const gAll = day.google?.allConversions ?? 0;
      const mClick = day.meta?.clickBook ?? 0;
      googleOutboundClick += gOutbound;
      googleAllConversions += gAll;
      metaClickBook += mClick;
      dailyBreakdown.push({ date: d, spend: day.spend, googleOutboundClick: gOutbound, googleAllConversions: gAll, metaClickBook: mClick });
    }

    const clickBookNew = googleOutboundClick + metaClickBook; // what the Summary tab shows NOW (isIcky=true)
    const clickBookOld = googleAllConversions + metaClickBook; // what it would show on the old blanket-bucket formula

    return Response.json({
      ok: true,
      range: { from, to },
      spend: Math.round(spend * 100) / 100,
      spendPending,
      googleOutboundClickConversionsTotal: googleOutboundClick,
      googleAllConversionsTotal: googleAllConversions,
      metaClickBookTotal: metaClickBook,
      clickBook_CURRENT_dashboard_value: clickBookNew,
      clickBook_OLD_blanket_bucket_value: clickBookOld,
      cpa_CURRENT: clickBookNew ? Math.round((spend / clickBookNew) * 100) / 100 : null,
      dailyBreakdown,
    });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
