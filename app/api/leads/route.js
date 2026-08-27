// GET /api/leads?from=2026-01-01&to=2026-08-27
// Nomad Greenland's Zoho CRM leads/deals — aggregate stats only (no
// individual names/emails), see fetchZohoLeadsAndDeals in lib/leads.js.

import { fetchZohoLeadsAndDeals } from "../../../lib/leads";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });

    const data = await fetchZohoLeadsAndDeals(from, to);
    return Response.json({ ok: true, from, to, data });
  } catch (err) {
    console.error("[/api/leads]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
