// GET /api/semrush
// Returns the latest cached SEMrush snapshot per client (scoped to the user's
// allowed clients), plus month-over-month deltas computed from the previous
// snapshot. Reads the seo_semrush_metrics cache only — never calls SEMrush.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALL_CLIENTS = ["Shinta Mani Wild", "Sora Sukhumvit", "IC Khao Yai"];

const METRICS = [
  "authority_score", "organic_keywords", "organic_traffic",
  "paid_keywords", "ref_domains", "backlinks", "semrush_rank",
];

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

  // Newest first; we take the latest two rows per client for the delta.
  const { data: rows, error: qErr } = await admin
    .from("seo_semrush_metrics")
    .select("*")
    .in("client_name", allowed)
    .order("snapshot_date", { ascending: false });

  if (qErr) {
    console.error("[/api/semrush]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  const byClient = {};
  for (const r of rows ?? []) (byClient[r.client_name] ??= []).push(r);

  // Shape: { [client]: { snapshotDate, scope, database, metrics:{...}, deltas:{ pct } } }
  const data = {};
  for (const [client, snaps] of Object.entries(byClient)) {
    const latest = snaps[0];
    const prev = snaps[1];
    const metrics = {};
    const deltas = {};
    for (const m of METRICS) {
      metrics[m] = latest[m];
      if (prev && prev[m] != null && latest[m] != null && prev[m] !== 0) {
        deltas[m] = Math.round(((latest[m] - prev[m]) / prev[m]) * 1000) / 10; // 1-dp %
      } else {
        deltas[m] = null;
      }
    }
    data[client] = { snapshotDate: latest.snapshot_date, scope: latest.scope, database: latest.database, metrics, deltas };
  }

  return Response.json({ ok: true, data });
}
