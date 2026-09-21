// GET /api/conversions-report?client=<name>&year=<y>&month=<m>
// Live GA4 data for the Organic Conversions Report (conversions/revenue summary,
// device + session revenue splits, daily series, and page / traffic / geo /
// engagement breakdowns) for one property/month. Auth + role scope mirror the
// other report routes. Data layer in lib/conversions-report.js.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchConversionsReport } from "../../../lib/conversions-report";

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
  const year = parseInt(sp.get("year"), 10);
  const month = parseInt(sp.get("month"), 10);
  if (!client || !ALL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (!year || !month) return Response.json({ error: "year and month are required" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });

  try {
    const report = await fetchConversionsReport(client, year, month);
    return Response.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err) {
    console.error("[/api/conversions-report]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
