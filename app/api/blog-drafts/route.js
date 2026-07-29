// GET /api/blog-drafts
// Returns blog-post drafts (Google Doc links + status) per client, scoped to the
// clients the signed-in user may see. Lets the Suggested-posts cards link
// straight to a draft when one exists for that keyword.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALL_CLIENTS = [
  "Shinta Mani Wild",
  "Nomad Greenland",
  "Sora Sukhumvit",
  "IC Khao Yai",
];

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: roleRow } = await adminClient
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", user.id)
    .single();

  const role = roleRow?.role ?? "admin";
  const allowed = role === "admin"
    ? ALL_CLIENTS
    : ALL_CLIENTS.filter((n) => n === roleRow?.client_name);

  const { data: rows, error: qErr } = await adminClient
    .from("seo_blog_drafts")
    .select("id, client_name, keyword, title, draft_url, draft_body, status")
    .in("client_name", allowed);

  if (qErr) {
    console.error("[/api/blog-drafts]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  // Shape: { [client]: { [keyword]: { id, title, url, status } } }, keyword
  // lowercased so the cards can look up by the GSC query text. `url` prefers a
  // Google Doc; otherwise the card falls back to the in-app /draft/<id> viewer.
  const data = {};
  for (const r of rows ?? []) {
    (data[r.client_name] ??= {})[(r.keyword || "").toLowerCase()] = {
      id:     r.id,
      title:  r.title ?? "",
      url:    r.draft_url || (r.draft_body ? `/draft/${r.id}` : ""),
      status: r.status ?? "drafting",
    };
  }

  return Response.json({ ok: true, data });
}
