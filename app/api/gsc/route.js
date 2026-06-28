// GET /api/gsc
// Returns normalised monthly GSC metrics per connected property (via Windsor.ai).
// The data layer lives in lib/gsc.js so the monthly draft cron can reuse it.

import { fetchGscData } from "../../../lib/gsc";

export async function GET() {
  try {
    const { data, months, year } = await fetchGscData();
    return Response.json({ ok: true, data, months, year });
  } catch (err) {
    console.error("[/api/gsc]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
