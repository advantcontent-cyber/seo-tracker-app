// GET /api/keyword-volumes
// Returns cached SEMrush search volumes keyed by lowercase keyword, per client
// (scoped to the user's allowed clients). The Tracked-keywords table joins
// these onto its GSC queries. Reads the seo_keyword_volumes cache only.

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
    .from("seo_keyword_volumes")
    .select("client_name, keyword, search_volume")
    .in("client_name", allowed);

  if (qErr) {
    console.error("[/api/keyword-volumes]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  // Shape: { [client]: { [keyword_lowercase]: search_volume } }
  const data = {};
  for (const r of rows ?? []) {
    (data[r.client_name] ??= {})[(r.keyword || "").toLowerCase()] = r.search_volume;
  }

  return Response.json({ ok: true, data });
}
