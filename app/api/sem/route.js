// GET /api/sem
// Returns daily paid-search/social (Google Ads + Meta) metrics + campaigns
// per client that has a mapped Ads account (via Windsor). Live, same pattern
// as /api/gsc. dateFrom/dateTo bound the available day-picker range in the UI.

import { fetchSemData } from "../../../lib/sem";

// Without this, Next.js tries to prerender this route at build time (it has
// no dynamic segments/params to disqualify it automatically) — harmless
// under the old, smaller March-onward window, but widening dateFrom to
// January (Aug 2026, AZKGB feedback) pushed the build-time fetch over some
// threshold and hung the build at "Generating static pages" indefinitely.
// Every other live-data route in app/api already has this.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, dateFrom, dateTo } = await fetchSemData();
    return Response.json({ ok: true, data, dateFrom, dateTo });
  } catch (err) {
    console.error("[/api/sem]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
