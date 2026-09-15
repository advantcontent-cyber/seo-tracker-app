// TEMP: verifies the from/to (+compareFrom/compareTo) refactor of the 4 SEO
// report data layers against live Windsor data, including a non-calendar-
// aligned range and a range spanning Aug/Sep. One function per request (the
// prior all-at-once version hit Vercel's function timeout) — pass ?fn=.
// Delete this route (and its middleware.js bypass) once confirmed.
import { fetchOrganicReport } from "../../../lib/organic-report";
import { fetchTrafficReport } from "../../../lib/traffic-report";
import { fetchConversionsReport } from "../../../lib/conversions-report";
import { fetchSummaryReport } from "../../../lib/summary-report";
import { fetchGeoSessions } from "../../../lib/report-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLIENT = "IC Khao Yai";
const from = "2026-08-15", to = "2026-09-15";
const compareFrom = "2026-06-01", compareTo = "2026-06-30";

export async function GET(req) {
  const fn = req.nextUrl.searchParams.get("fn");
  try {
    if (fn === "organicDefault") {
      const r = await fetchOrganicReport(CLIENT, from, to);
      return Response.json({ ok: true, summary: r.summary, deltas: r.deltas, dailyCount: r.daily.length, from: r.from, to: r.to });
    }
    if (fn === "organicCompare") {
      const r = await fetchOrganicReport(CLIENT, from, to, compareFrom, compareTo);
      return Response.json({ ok: true, summary: r.summary, deltas: r.deltas });
    }
    if (fn === "traffic") {
      const r = await fetchTrafficReport(CLIENT, from, to);
      return Response.json({ ok: true, summary: r.summary, deltas: r.deltas, dailyCount: r.daily.length });
    }
    if (fn === "conversions") {
      const r = await fetchConversionsReport(CLIENT, from, to);
      return Response.json({ ok: true, summary: r.summary, dailyCount: r.daily.length });
    }
    if (fn === "summaryDefault") {
      const r = await fetchSummaryReport(CLIENT, from, to);
      return Response.json({ ok: true, visibility: r.visibility, traffic: r.traffic, conversions: r.conversions, deltas: r.deltas });
    }
    if (fn === "geo") {
      const r = await fetchGeoSessions(CLIENT, from, to);
      return Response.json({ ok: true, geo: r.slice(0, 5) });
    }
    return Response.json({ ok: false, error: "pass ?fn=organicDefault|organicCompare|traffic|conversions|summaryDefault|geo" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
