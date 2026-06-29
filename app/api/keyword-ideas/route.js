// GET /api/keyword-ideas
// Returns cached SEMrush content-keyword opportunities per client (scoped to the
// user's allowed clients), highest search volume first. Reads the
// seo_keyword_ideas cache only — never calls SEMrush.

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
    .from("seo_keyword_ideas")
    .select("client_name, keyword, search_volume, suggested_title, database")
    .in("client_name", allowed)
    .order("search_volume", { ascending: false });

  if (qErr) {
    console.error("[/api/keyword-ideas]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  // Shape: { [client]: [ { keyword, volume, title, database } ] }
  const data = {};
  for (const r of rows ?? []) {
    (data[r.client_name] ??= []).push({
      keyword:  r.keyword,
      volume:   r.search_volume,
      title:    r.suggested_title ?? "",
      database: r.database ?? "",
    });
  }

  return Response.json({ ok: true, data });
}
