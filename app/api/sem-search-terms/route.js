// GET /api/sem-search-terms?from=2026-08-01&to=2026-08-14
// Top Performing Keywords/Ads (really: Google Ads search terms — see
// fetchGoogleSearchTerms in lib/sem.js for why) for the exact selected SEM
// date range. Returns every client with Google Ads spend (keyed by client
// name), currently only read by AZLRH's Google tab; fetched on-demand like
// /api/sem-creatives rather than baked into /api/sem's broad daily pull.

import { fetchGoogleSearchTerms } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });

    const data = await fetchGoogleSearchTerms(from, to);
    return Response.json({ ok: true, from, to, data });
  } catch (err) {
    console.error("[/api/sem-search-terms]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
