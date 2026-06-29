// GET /api/plan-keywords
// Returns cached SEMrush metrics (global volume + local KD) keyed by lowercase
// keyword, per client (scoped to the user's allowed clients). The 12-month blog
// plan joins these onto its rows. Reads the seo_plan_keywords cache only.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALL_CLIENTS = ["Shinta Mani Wild", "Sora Sukhumvit", "IC Khao Yai"];

export async function GET() {
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
  const allowed = role === "admin" ? ALL_CLIENTS : ALL_CLIENTS.filter((n) => n === roleRow?.client_name);

  const { data: rows, error: qErr } = await admin
    .from("seo_plan_keywords")
    .select("client_name, keyword, global_volume, kd")
    .in("client_name", allowed);

  if (qErr) {
    console.error("[/api/plan-keywords]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  // Shape: { [client]: { [keyword_lowercase]: { volume, kd } } }
  const data = {};
  for (const r of rows ?? []) {
    (data[r.client_name] ??= {})[(r.keyword || "").toLowerCase()] = {
      volume: r.global_volume,
      kd:     r.kd,
    };
  }

  return Response.json({ ok: true, data });
}
