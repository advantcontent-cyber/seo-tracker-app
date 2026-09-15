// GET /api/ai?from=<yyyy-mm-dd>&to=<yyyy-mm-dd>
//            [&compareFrom=<yyyy-mm-dd>&compareTo=<yyyy-mm-dd>]
// Live AI-engine referral traffic per connected property (GA4 via Windsor.ai),
// for the given date range. Data layer lives in lib/ai.js. See lib/ai.js for
// scope notes (referral only; Google AI Overviews are not separable and are
// excluded). compareFrom/compareTo optional — see lib/date-range.js's
// prevWindow.

import { fetchAiData } from "../../../lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const compareFrom = sp.get("compareFrom") || undefined;
  const compareTo = sp.get("compareTo") || undefined;
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });

  try {
    const { data } = await fetchAiData(from, to, compareFrom, compareTo);
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error("[/api/ai]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
