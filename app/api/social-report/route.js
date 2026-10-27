// GET  /api/social-report?client=IC%20Khao%20Yai&from=2026-10-01&to=2026-10-28
// POST /api/social-report  { client, from, to, platform?, field, value, ... }
//
// The Social tab (clients listed in lib/social.js's ACCOUNT_MAP). The report
// covers any date range (default: the 7 days ending yesterday); health is
// computed from that range against the equal-length range before it. GET
// merges the live Windsor pull (metrics/posts/health, recomputed every
// request) with what's stored in Supabase: the analyst-written panels for
// this exact range (seo_social_editable), post pillars (saved overrides in
// seo_social_post_pillars, otherwise the client's content-calendar sheet via
// seo_social_pillar_sources), cached post summaries, and milestone/next-step
// comments (seo_social_comments). POST saves those — admin-only, unlike every
// other read-only editable route in this app.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchSocialReport, rangeWindows, UNASSIGNED_PILLAR } from "../../../lib/social";
import { fetchPillarSheet, makePillarLookup } from "../../../lib/social-pillars";

const PLATFORMS = ["overall", "facebook", "instagram"];
const EDITABLE_COLUMN = {
  highlight:      "content_highlight_html",
  aiOverview:     "ai_overview_html",
  pillarInsights: "pillar_insights_html",
  quickWins:      "quick_wins_html",
  nextMonth:      "next_month_html",
};
const COMMENT_KINDS = ["milestone", "next_step"];

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

const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export const dynamic = "force-dynamic";

export async function GET(req) {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  if (!client) return Response.json({ error: "client is required" }, { status: 400 });
  const from = isoDate(searchParams.get("from"));
  // `week` (a week-end date) is still accepted from older links.
  const to = isoDate(searchParams.get("to")) || isoDate(searchParams.get("week"));

  const admin = adminClient();
  const { allowed } = await resolveRole(admin, user.id);
  if (!allowed(client)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { current } = rangeWindows(from, to);

    const [pillarRows, summaryRows, sourceRow, editableRows, commentRows, legacyMs] = await Promise.all([
      admin.from("seo_social_post_pillars").select("post_link, pillar").eq("client_name", client),
      admin.from("seo_social_post_summaries").select("post_key, summary").eq("client_name", client),
      admin.from("seo_social_pillar_sources").select("sheet_url").eq("client_name", client).maybeSingle(),
      admin.from("seo_social_editable")
        .select("platform, content_highlight_html, ai_overview_html, pillar_insights_html, quick_wins_html, next_month_html, recommendations_html")
        .eq("client_name", client).eq("week_start", current.from).eq("range_end", current.to),
      admin.from("seo_social_comments")
        .select("id, kind, anchor_date, body, author, created_at, updated_at")
        .eq("client_name", client).gte("anchor_date", current.from).lte("anchor_date", current.to)
        .order("anchor_date", { ascending: true }).order("created_at", { ascending: true }),
      admin.from("seo_social_milestones")
        .select("milestones_text, next_steps_text, week_start")
        .eq("client_name", client).gte("week_start", current.from).lte("week_start", current.to)
        .order("week_start", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Pillar sheet (best-effort): its failure never fails the report.
    let sheetRows = [], pillarSource = { configured: false };
    if (sourceRow.data?.sheet_url) {
      try {
        sheetRows = await fetchPillarSheet(sourceRow.data.sheet_url);
        pillarSource = { configured: true, ok: true, rows: sheetRows.length };
      } catch (e) {
        pillarSource = { configured: true, ok: false, error: e.message };
      }
    }

    const pillarOverrides = Object.fromEntries((pillarRows.data ?? []).map((r) => [r.post_link, r.pillar]));
    const summaries = Object.fromEntries((summaryRows.data ?? []).map((r) => [r.post_key, r.summary]));
    const { range, windows, data, unmatched, viewsSource } = await fetchSocialReport(
      client, { from, to },
      { pillarOverrides, pillarLookup: makePillarLookup(sheetRows), summaries },
    );

    // Pillars a post can be assigned to: whatever the sheet uses, plus any a
    // saved override already uses.
    const pillars = [...new Set([...sheetRows.map((r) => r.pillar), ...Object.values(pillarOverrides)])].sort();
    if (!pillars.includes(UNASSIGNED_PILLAR)) pillars.push(UNASSIGNED_PILLAR);

    const editableByPlatform = Object.fromEntries((editableRows.data ?? []).map((r) => [r.platform, r]));
    for (const platform of PLATFORMS) {
      const stored = editableByPlatform[platform];
      if (stored?.content_highlight_html) data[platform].highlightHtml = stored.content_highlight_html;
      if (stored?.ai_overview_html)       data[platform].aiOverviewHtml = stored.ai_overview_html;
      if (stored?.pillar_insights_html)   data[platform].pillarInsightsHtml = stored.pillar_insights_html;
      if (stored?.quick_wins_html)        data[platform].quickWinsHtml = stored.quick_wins_html;
      // Pre-split Recommendations text lands in next-month ideation until it's rewritten.
      if (stored?.next_month_html || stored?.recommendations_html) data[platform].nextMonthHtml = stored.next_month_html || stored.recommendations_html;
    }

    return Response.json({
      ok: true,
      client,
      range,
      windows, // { current, previous, baseline, days }
      data,
      pillars,
      pillarSource, // { configured, ok?, rows?, error? } — the content-calendar sheet pillars are read from
      viewsSource, // which figure each Views headline is (page/account-level vs post sum), and whether the 6-month baseline loaded
      unmatched, // { facebook: [...page_name values Windsor returned but ACCOUNT_MAP doesn't know], instagram: [...] } — non-empty means the report came back empty because of a mapping mismatch, not a real zero-post week
      comments: commentRows.data ?? [],
      commentsSetupNeeded: !!commentRows.error,
      legacyMilestones: legacyMs.data ? { milestonesText: legacyMs.data.milestones_text ?? "", nextStepsText: legacyMs.data.next_steps_text ?? "" } : null,
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
  const { client, from, to, platform, field, value, postLink, kind, anchor, id } = body ?? {};
  if (!client || !field) return Response.json({ error: "client and field are required" }, { status: 400 });

  try {
    if (field === "pillar") {
      if (!postLink || value == null) return Response.json({ error: "postLink and value are required for field=pillar" }, { status: 400 });
      const { error: upErr } = await admin.from("seo_social_post_pillars")
        .upsert({ client_name: client, post_link: postLink, pillar: value, updated_at: new Date().toISOString() }, { onConflict: "client_name,post_link" });
      if (upErr) throw upErr;
      return Response.json({ ok: true });
    }

    // Milestone / next-step comments: each is its own row, so adding one can
    // never overwrite another; deleting needs an explicit id.
    if (field === "comment_add") {
      const text = (value ?? "").toString().trim();
      if (!COMMENT_KINDS.includes(kind) || !text || !isoDate(anchor)) return Response.json({ error: "kind, anchor date and text are required" }, { status: 400 });
      const { data, error: insErr } = await admin.from("seo_social_comments")
        .insert({ client_name: client, kind, anchor_date: anchor, body: text, author: user.email ?? null })
        .select("id, kind, anchor_date, body, author, created_at, updated_at").single();
      if (insErr) throw insErr;
      return Response.json({ ok: true, comment: data });
    }
    if (field === "comment_edit") {
      const text = (value ?? "").toString().trim();
      if (!id || !text) return Response.json({ error: "id and text are required" }, { status: 400 });
      const { data, error: upErr } = await admin.from("seo_social_comments")
        .update({ body: text, updated_at: new Date().toISOString() })
        .eq("id", id).eq("client_name", client)
        .select("id, kind, anchor_date, body, author, created_at, updated_at").single();
      if (upErr) throw upErr;
      return Response.json({ ok: true, comment: data });
    }
    if (field === "comment_delete") {
      if (!id) return Response.json({ error: "id is required" }, { status: 400 });
      const { error: delErr } = await admin.from("seo_social_comments").delete().eq("id", id).eq("client_name", client);
      if (delErr) throw delErr;
      return Response.json({ ok: true });
    }

    if (EDITABLE_COLUMN[field]) {
      if (!PLATFORMS.includes(platform)) return Response.json({ error: "platform is required for this field" }, { status: 400 });
      const { current } = rangeWindows(isoDate(from), isoDate(to));
      const { error: upErr } = await admin.from("seo_social_editable")
        .upsert({ client_name: client, week_start: current.from, range_end: current.to, platform, [EDITABLE_COLUMN[field]]: value, updated_at: new Date().toISOString() }, { onConflict: "client_name,week_start,range_end,platform" });
      if (upErr) throw upErr;
      return Response.json({ ok: true });
    }

    return Response.json({ error: `Unknown field "${field}"` }, { status: 400 });
  } catch (err) {
    console.error("[/api/social-report POST]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
