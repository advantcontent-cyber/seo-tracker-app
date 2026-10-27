// POST /api/social-post-summaries  { client, posts: [{ key, type, text }] }
// Writes a one-line descriptive summary for each post (what it was about, not
// the caption) and caches it in seo_social_post_summaries, so each post is
// only ever summarised once. The Social tab calls this for posts that came
// back from /api/social-report without a summary.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { summarizePosts } from "../../../lib/social-narrative";
import { ACCOUNT_MAP } from "../../../lib/social";

const SOCIAL_CLIENTS = [...new Set(Object.values(ACCOUNT_MAP.facebook))];
const MAX_POSTS = 20;

export const dynamic = "force-dynamic";

export async function POST(req) {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleRow } = await admin.from("seo_user_roles").select("role, client_name").eq("user_id", user.id).single();
  const role = roleRow?.role ?? "admin";

  const body = await req.json().catch(() => null);
  const { client, posts } = body || {};
  if (!client || !SOCIAL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name) return Response.json({ error: "Not authorised for this property" }, { status: 403 });
  if (!Array.isArray(posts) || !posts.length) return Response.json({ ok: true, summaries: {} });

  try {
    const batch = posts.filter((p) => p?.key && p?.text).slice(0, MAX_POSTS);
    const summaries = await summarizePosts(batch, process.env.OPENROUTER_API_KEY);
    const rows = Object.entries(summaries).map(([post_key, summary]) => ({ client_name: client, post_key, summary, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error: upErr } = await admin.from("seo_social_post_summaries").upsert(rows, { onConflict: "client_name,post_key" });
      if (upErr) throw upErr;
    }
    return Response.json({ ok: true, summaries });
  } catch (err) {
    console.error("[/api/social-post-summaries]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
