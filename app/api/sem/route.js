// GET /api/sem
// Returns daily paid-search/social (Google Ads + Meta) metrics + campaigns
// per client that has a mapped Ads account (via Windsor). Live, same pattern
// as /api/gsc. dateFrom/dateTo bound the available day-picker range in the UI.

import { fetchSemData } from "../../../lib/sem";

export async function GET() {
  try {
    const { data, dateFrom, dateTo } = await fetchSemData();
    return Response.json({ ok: true, data, dateFrom, dateTo });
  } catch (err) {
    console.error("[/api/sem]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
