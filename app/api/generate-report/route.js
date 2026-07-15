// POST /api/generate-report
// Assembles the "Generate Report" data + writes the analyst narrative via an
// LLM. Auth + role scope mirror the other report routes. The caller (Summary
// tab) already has summary-report, content opportunities, near-page-one
// queries, action plan, and AI-search data loaded client-side — this route
// only fetches the two genuinely new pieces (daily GSC series, geography by
// sessions) and turns everything into the report's narrative + payload.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { fetchOrganicReport } from "../../../lib/organic-report";
import { fetchGeoSessions } from "../../../lib/report-data";
import { generateReportNarrative } from "../../../lib/report-narrative";

export const dynamic = "force-dynamic";

const ALL_CLIENTS = ["Shinta Mani Wild", "Sora Sukhumvit", "Nomad Greenland", "IC Khao Yai"];
const MONTH_FULL = { 3: "March", 4: "April", 5: "May", 6: "June", 7: "July" };

// The single day with the most clicks (resp. impressions) in the daily series.
function peakBy(daily, key) {
  return daily.reduce((best, d) => (!best || d[key] > best[key] ? d : best), null);
}

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
  const { client, year, month, summary, blogPicks, nearPageOneQueries, actionPlan, ai } = body || {};

  if (!client || !ALL_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (!year || !month) return Response.json({ error: "year and month are required" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });
  if (!summary) return Response.json({ error: "summary is required" }, { status: 400 });

  try {
    const [organic, geo] = await Promise.all([
      fetchOrganicReport(client, year, month),
      fetchGeoSessions(client, year, month),
    ]);

    const bestDay = peakBy(organic.daily, "clicks");
    const peakImpressionsDay = peakBy(organic.daily, "impressions");

    const facts = {
      client,
      year,
      month,
      monthLabel: MONTH_FULL[month] || String(month),
      period: { from: summary.from, to: summary.to, days: summary.days },
      headline: {
        visits: summary.visibility.clicks,
        visitsDelta: summary.deltas.visibility.clicks,
        impressions: summary.visibility.impressions,
        impressionsDelta: summary.deltas.visibility.impressions,
        ctr: summary.visibility.impressions ? summary.visibility.clicks / summary.visibility.impressions : 0,
        avgPos: summary.visibility.avgPos,
        avgPosDelta: summary.deltas.visibility.avgPos,
        conversions: summary.conversions.conversions,
        conversionRate: summary.conversions.conversionRate,
        sessions: summary.traffic.sessions,
      },
      bestDay,
      peakImpressionsDay,
      topPages: summary.topPages || [],
      topDevice: summary.topDevice || null,
      topChannel: summary.topChannel || null,
      nearPageOneQueries: nearPageOneQueries || [],
      contentOpportunities: blogPicks || [],
      geography: geo,
      aiSearch: ai ? {
        totals: ai.totals,
        bing: ai.bing,
        topEngine: ai.engines?.[0] || null,
        topPage: ai.pages?.[0] || null,
      } : null,
      actionPlanHighlights: (actionPlan?.active || [])
        .filter((row) => row.status !== "done")
        .slice(0, 3)
        .map((row) => ({ task: row.task.task, priority: row.task.priority, detail: row.task.detail })),
    };

    const narrative = await generateReportNarrative(facts, process.env.OPENROUTER_API_KEY);

    return Response.json({
      ok: true,
      report: {
        facts,
        daily: organic.daily,
        byType: organic.byType,
        geo,
        narrative,
      },
    });
  } catch (err) {
    console.error("[/api/generate-report]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
