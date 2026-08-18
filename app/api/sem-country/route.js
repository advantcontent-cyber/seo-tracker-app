// GET /api/sem-country?from=2026-08-01&to=2026-08-14
// Impressions (+ Meta's Website Purchases) broken down by country, for the
// exact selected SEM date range — see fetchMetaCountryBreakdown and
// fetchGoogleCountryBreakdown in lib/sem.js. Only Sora's Meta/Google tabs use
// this today (per the client's spec), fetched on-demand like /api/sem-reach
// rather than baked into /api/sem's broad daily pull.

import { fetchMetaCountryBreakdown, fetchGoogleCountryBreakdown } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });

    const [meta, google] = await Promise.all([
      fetchMetaCountryBreakdown(from, to),
      fetchGoogleCountryBreakdown(from, to),
    ]);
    return Response.json({ ok: true, from, to, meta, google });
  } catch (err) {
    console.error("[/api/sem-country]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
