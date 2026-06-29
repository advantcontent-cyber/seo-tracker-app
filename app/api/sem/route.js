// GET /api/sem
// Returns monthly paid-search (Google Ads) metrics + campaigns per client that
// has a mapped Ads account (via Windsor). Live, same pattern as /api/gsc.

import { fetchSemData } from "../../../lib/sem";

export async function GET() {
  try {
    const { data, months, year } = await fetchSemData();
    return Response.json({ ok: true, data, months, year });
  } catch (err) {
    console.error("[/api/sem]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
