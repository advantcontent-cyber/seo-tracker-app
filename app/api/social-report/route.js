// GET  /api/social-report?client=IC%20Khao%20Yai&week=2026-09-04
// POST /api/social-report  { client, week, platform?, field, value, postLink? }
//
// The Social tab (clients listed in lib/social.js's ACCOUNT_MAP — currently
// IC Khao Yai + both Azerai properties). GET merges
// the live Windsor pull (metrics/posts/health, recomputed every request) with
// the analyst-written narrative + milestones + post pillar tags stored in
// Supabase (seo_social_editable / seo_social_milestones /
// seo_social_post_pillars). POST is how the in-page Edit/Done toggles save
// those editable fields — admin-only, unlike every other read-only editable
// route in this app (seo_action_items/seo_plan_keywords are edited directly
// in the Supabase Table editor instead).

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchSocialReport, weekWindows } from "../../../lib/social";

const PLATFORMS = ["overall", "facebook", "instagram"];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Resolves { role, allowed(clientName) } for the current session user.
async function resolveRole(admin, userId) {
  const { data: roleRow } = await admin
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", userId)
    .single();
  const role = roleRow?.role ?? "admin";
  return { role, allowed: (clientName) => role === "admin" || roleRow?.client_name === clientName };
}

export const dynamic = "force-dynamic";

export async function GET(req) {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  const week   = searchParams.get("week"); // yyyy-mm-dd week-end date, optional
  if (!client) return Response.json({ error: "client is required" }, { status: 400 });

  const admin = adminClient();
  const { allowed } = await resolveRole(admin, user.id);
  if (!allowed(client)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { current } = weekWindows(week);
    const weekStart = current.from;

    const [pillarRows, editableRows, msRow] = await Promise.all([
      admin.from("seo_social_post_pillars").select("post_link, pillar").eq("client_name", client),
      admin.from("seo_social_editable")
        .select("platform, content_highlight_html, ai_overview_html, recommendations_html")
        .eq("client_name", client).eq("week_start", weekStart),
      admin.from("seo_social_milestones")
        .select("milestones_text, next_steps_text")
        .eq("client_name", client).eq("week_start", weekStart).maybeSingle(),
    ]);

    const pillarOverrides = Object.fromEntries((pillarRows.data ?? []).map((r) => [r.post_link, r.pillar]));
    const { weeks, data, unmatched } = await fetchSocialReport(client, week, pillarOverrides);

    const editableByPlatform = Object.fromEntries((editableRows.data ?? []).map((r) => [r.platform, r]));
    for (const platform of PLATFORMS) {
      const stored = editableByPlatform[platform];
      if (stored?.content_highlight_html) data[platform].highlightHtml = stored.content_highlight_html;
      if (stored?.ai_overview_html)       data[platform].aiOverviewHtml = stored.ai_overview_html;
      if (stored?.recommendations_html)   data[platform].recommendationsHtml = stored.recommendations_html;
    }

    return Response.json({
      ok: true,
      client,
      weekStart,
      weeks,
      data,
      unmatched, // { facebook: [...page_name values Windsor returned but ACCOUNT_MAP doesn't know], instagram: [...] } — non-empty means the report came back empty because of a mapping mismatch, not a real zero-post week
      milestones: {
        milestonesText: msRow.data?.milestones_text ?? "",
        nextStepsText:  msRow.data?.next_steps_text ?? "",
      },
    });
  } catch (err) {
    console.error("[/api/social-report GET]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = adminClient();
  const { role } = await resolveRole(admin, user.id);
  if (role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { client, week, platform, field, value, postLink } = body ?? {};
  if (!client || !field) return Response.json({ error: "client and field are required" }, { status: 400 });

  try {
    if (field === "pillar") {
      if (!postLink || value == null) return Response.json({ error: "postLink and value are required for field=pillar" }, { status: 400 });
      const { error: upErr } = await admin.from("seo_social_post_pillars")
        .upsert({ client_name: client, post_link: postLink, pillar: value, updated_at: new Date().toISOString() }, { onConflict: "client_name,post_link" });
      if (upErr) throw upErr;
      return Response.json({ ok: true });
    }

    const { current } = weekWindows(week);
    const weekStart = current.from;

    if (field === "milestones" || field === "nextSteps") {
      const column = field === "milestones" ? "milestones_text" : "next_steps_text";
      const { error: upErr } = await admin.from("seo_social_milestones")
        .upsert({ client_name: client, week_start: weekStart, [column]: value, updated_at: new Date().toISOString() }, { onConflict: "client_name,week_start" });
      if (upErr) throw upErr;
      return Response.json({ ok: true });
    }

    if (["highlight", "aiOverview", "recommendations"].includes(field)) {
      if (!PLATFORMS.includes(platform)) return Response.json({ error: "platform is required for this field" }, { status: 400 });
      const column = { highlight: "content_highlight_html", aiOverview: "ai_overview_html", recommendations: "recommendations_html" }[field];
      const { error: upErr } = await admin.from("seo_social_editable")
        .upsert({ client_name: client, week_start: weekStart, platform, [column]: value, updated_at: new Date().toISOString() }, { onConflict: "client_name,week_start,platform" });
      if (upErr) throw upErr;
      return Response.json({ ok: true });
    }

    return Response.json({ error: `Unknown field "${field}"` }, { status: 400 });
  } catch (err) {
    console.error("[/api/social-report POST]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
