// TEMP: verifies the from/to (+compareFrom/compareTo) refactor of the 4 SEO
// report data layers against live Windsor data, including a non-calendar-
// aligned range and a range spanning Aug/Sep. Delete this route (and its
// middleware.js bypass) once confirmed.
import { fetchOrganicReport } from "../../../lib/organic-report";
import { fetchTrafficReport } from "../../../lib/traffic-report";
import { fetchConversionsReport } from "../../../lib/conversions-report";
import { fetchSummaryReport } from "../../../lib/summary-report";
import { fetchGeoSessions } from "../../../lib/report-data";

export const dynamic = "force-dynamic";

const CLIENT = "IC Khao Yai";

export async function GET() {
  try {
    // A range spanning Aug 15 - Sep 15 (crosses a calendar-month boundary,
    // and isn't aligned to any whole month) with an explicit non-adjacent
    // compare range (same dates, one year "back" conceptually — really just
    // a manually-picked earlier range to prove non-contiguous compare works).
    const from = "2026-08-15", to = "2026-09-15";
    const compareFrom = "2026-06-01", compareTo = "2026-06-30";

    const [organicDefault, organicExplicitCompare, traffic, conversions, summaryDefault, geo] = await Promise.all([
      fetchOrganicReport(CLIENT, from, to), // no compare given -> should default via prevWindow
      fetchOrganicReport(CLIENT, from, to, compareFrom, compareTo), // explicit non-adjacent compare
      fetchTrafficReport(CLIENT, from, to),
      fetchConversionsReport(CLIENT, from, to),
      fetchSummaryReport(CLIENT, from, to), // no compare given -> should default via prevWindow
      fetchGeoSessions(CLIENT, from, to),
    ]);

    return Response.json({
      ok: true,
      requestedRange: { from, to },
      organicDefault: { summary: organicDefault.summary, deltas: organicDefault.deltas, dailyCount: organicDefault.daily.length, from: organicDefault.from, to: organicDefault.to },
      organicExplicitCompare: { summary: organicExplicitCompare.summary, deltas: organicExplicitCompare.deltas },
      traffic: { summary: traffic.summary, deltas: traffic.deltas, dailyCount: traffic.daily.length },
      conversions: { summary: conversions.summary, dailyCount: conversions.daily.length },
      summaryDefault: { visibility: summaryDefault.visibility, traffic: summaryDefault.traffic, conversions: summaryDefault.conversions, deltas: summaryDefault.deltas },
      geo: geo.slice(0, 5),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
