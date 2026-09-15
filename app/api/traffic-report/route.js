// GET /api/traffic-report?client=<name>&from=<yyyy-mm-dd>&to=<yyyy-mm-dd>
//                         [&compareFrom=<yyyy-mm-dd>&compareTo=<yyyy-mm-dd>]
// Live GA4 data for the Organic Traffic Report (summary + channel/device splits
// + daily series + page performance) for one property/date range. Auth + role
// scope mirror the other GA4/GSC routes. Data layer in lib/traffic-report.js.
// compareFrom/compareTo are optional — see lib/date-range.js's prevWindow.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchTrafficReport } from "../../../lib/traffic-report";

// Per-property, per-range — never cache the route response.
export const dynamic = "force-dynamic";

const ALL_CLIENTS = ["Shinta Mani Wild", "Sora Sukhumvit", "Nomad Greenland", "IC Khao Yai"];

export async function GET(req) {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: roleRow } = await admin
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role ?? "admin";

  const sp = req.nextUrl.searchParams;
  const client = sp.get("client");
  const from = sp.get("from");
  const to = sp.get("to");
  const compareFrom = sp.get("compareFrom") || undefined;
  const compareTo = sp.get("compareTo") || undefined;
  if (!client || !ALL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });

  try {
    const report = await fetchTrafficReport(client, from, to, compareFrom, compareTo);
    return Response.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err) {
    console.error("[/api/traffic-report]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
