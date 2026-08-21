// GET /api/sem-creatives?from=2026-08-01&to=2026-08-14
// Meta ad creatives (thumbnail + name + performance) for the exact selected
// SEM date range — see fetchMetaCreatives in lib/sem.js. Returns every
// client with Meta spend (keyed by client name), read by each client's
// Meta-flavored SEM tab; fetched on-demand like /api/sem-country rather
// than baked into /api/sem's broad daily pull.

import { fetchMetaCreatives } from "../../../lib/sem";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });

    const data = await fetchMetaCreatives(from, to);
    return Response.json({ ok: true, from, to, data });
  } catch (err) {
    console.error("[/api/sem-creatives]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
