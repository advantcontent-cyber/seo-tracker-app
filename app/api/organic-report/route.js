// GET /api/organic-report?client=<name>&year=<y>&month=<m>
// Live GSC data for the Organic Visibility Report (daily web series +
// search-type split + web summary) for one property/month. Auth + role scope
// mirror the other GSC routes. Data layer in lib/organic-report.js.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchOrganicReport } from "../../../lib/organic-report";

// The four connected GSC properties (matches lib/gsc.js PROPERTY_MAP).
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
  const year = parseInt(sp.get("year"), 10);
  const month = parseInt(sp.get("month"), 10);
  if (!client || !ALL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (!year || !month) return Response.json({ error: "year and month are required" }, { status: 400 });
  // Role gate: non-admins may only see their own client.
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });

  try {
    const report = await fetchOrganicReport(client, year, month);
    return Response.json({ ok: true, ...report });
  } catch (err) {
    console.error("[/api/organic-report]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
