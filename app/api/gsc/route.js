// GET /api/gsc [?from=<yyyy-mm-dd>&to=<yyyy-mm-dd>]
//              [&compareFrom=<yyyy-mm-dd>&compareTo=<yyyy-mm-dd>]
// Returns normalised GSC metrics per connected property (via Windsor.ai) for
// the given date range, plus the picker's outer clamp bounds (a rolling
// 16-month window). from/to are optional — omit both for the default (last
// 30 days). compareFrom/compareTo optional — see lib/date-range.js's
// prevWindow. The data layer lives in lib/gsc.js so the monthly draft cron
// can reuse it.

import { fetchGscData, gscBounds } from "../../../lib/gsc";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || undefined;
  const to = sp.get("to") || undefined;
  const compareFrom = sp.get("compareFrom") || undefined;
  const compareTo = sp.get("compareTo") || undefined;

  try {
    const result = await fetchGscData(from, to, compareFrom, compareTo);
    return Response.json({
      ok: true,
      data: result.data,
      range: { from: result.from, to: result.to, compareFrom: result.compareFrom, compareTo: result.compareTo },
      bounds: gscBounds(),
    });
  } catch (err) {
    console.error("[/api/gsc]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
