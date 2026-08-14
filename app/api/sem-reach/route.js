// GET /api/sem-reach?ranges=2026-08-01:2026-08-14,2026-07-18:2026-07-31
// True (deduplicated) Meta Reach per client for one or more EXACT date
// ranges — see fetchMetaReach in lib/sem.js for why this can't just be
// derived from the daily data /api/sem already returns. Called on-demand
// whenever the SEM date-range picker changes (current range + the
// previous-period comparison range, in one request), not fetched once
// like /api/sem.

import { fetchMetaReach } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rangesParam = searchParams.get("ranges");
    if (!rangesParam) return Response.json({ error: "ranges is required" }, { status: 400 });

    const ranges = rangesParam.split(",").map((pair) => {
      const [from, to] = pair.split(":");
      return { from, to };
    });
    if (ranges.some(({ from, to }) => !from || !to)) {
      return Response.json({ error: "each range must be from:to" }, { status: 400 });
    }

    const results = await Promise.all(
      ranges.map(async ({ from, to }) => ({ from, to, reach: await fetchMetaReach(from, to) }))
    );

    return Response.json({ ok: true, ranges: results });
  } catch (err) {
    console.error("[/api/sem-reach]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
