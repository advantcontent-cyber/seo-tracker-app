// TEMP: verifies the PR2 rework of lib/gsc.js + lib/ai.js against live
// Windsor data — a range crossing the Aug/Sep boundary (the bug this PR
// fixes), the default (no from/to given), and topBlogPostsAllTime staying
// independent of the picked range. Delete this route (and its middleware.js
// bypass) once confirmed.
import { fetchGscData, gscBounds } from "../../../lib/gsc";
import { fetchAiData } from "../../../lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLIENT = "IC Khao Yai";

export async function GET(req) {
  const fn = req.nextUrl.searchParams.get("fn");
  try {
    if (fn === "bounds") {
      return Response.json({ ok: true, bounds: gscBounds() });
    }
    if (fn === "gscAugSep") {
      // Crosses the Aug/Sep boundary — the old hardcoded MONTHS=[3..7] would
      // have silently dropped this data entirely.
      const { data } = await fetchGscData("2026-08-15", "2026-09-15");
      const c = data[CLIENT];
      return Response.json({
        ok: true,
        current: c.current, compare: c.compare,
        dailyCount: c.daily.length, dailyFirst: c.daily[0], dailyLast: c.daily[c.daily.length - 1],
        topQueriesCount: c.topQueries.length, topQueriesSample: c.topQueries.slice(0, 3),
        topBlogPostsAllTimeCount: c.topBlogPostsAllTime.length,
        blogPostsRange: c.blogPostsRange,
      });
    }
    if (fn === "gscDefault") {
      const { data } = await fetchGscData();
      const c = data[CLIENT];
      return Response.json({ ok: true, current: c.current, dailyCount: c.daily.length });
    }
    if (fn === "aiAugSep") {
      const { data } = await fetchAiData("2026-08-15", "2026-09-15");
      const c = data[CLIENT];
      return Response.json({
        ok: true,
        totals: c?.totals, compareTotals: c?.compareTotals,
        engines: c?.engines?.map((e) => ({ key: e.key, sessions: e.sessions, seriesLen: e.series.length })),
        trendLen: c?.trend?.length, trendFirst: c?.trend?.[0], trendLast: c?.trend?.[c?.trend?.length - 1],
        pagesCount: c?.pages?.length,
      });
    }
    return Response.json({ ok: false, error: "pass ?fn=bounds|gscAugSep|gscDefault|aiAugSep" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 });
  }
}
