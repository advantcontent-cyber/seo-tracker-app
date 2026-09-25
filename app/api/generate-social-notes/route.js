// POST /api/generate-social-notes
// Drafts the Social tab's Content Highlights / AI Insights / Recommendations
// panels via an LLM. Auth + role scope mirror /api/generate-sem-notes. The
// caller (SocialReportTab) already has the selected platform's metrics/
// account stats/posts computed client-side (from /api/social-report) — this
// route doesn't re-fetch Windsor, it just drafts from those facts.
//
// Ephemeral, same as /api/generate-sem-notes: nothing is persisted here. The
// caller drops the draft into each editable panel's edit mode so the analyst
// can review/tweak before saving through the existing /api/social-report
// POST path.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { generateSocialNotes } from "../../../lib/social-narrative";
import { ACCOUNT_MAP } from "../../../lib/social";

const SOCIAL_CLIENTS = [...new Set(Object.values(ACCOUNT_MAP.facebook))];

export const dynamic = "force-dynamic";

export async function POST(req) {
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

  const body = await req.json().catch(() => null);
  const { client, facts } = body || {};

  if (!client || !SOCIAL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });
  if (!facts) return Response.json({ error: "facts is required" }, { status: 400 });

  try {
    const notes = await generateSocialNotes({ client, ...facts }, process.env.OPENROUTER_API_KEY);
    return Response.json({ ok: true, notes });
  } catch (err) {
    console.error("[/api/generate-social-notes]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
