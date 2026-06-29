// GET /api/action-items
// Returns the team's SEO task list (the Action plan) per client, scoped to the
// clients the signed-in user is allowed to see. Reads the seo_action_items table
// the team edits in Supabase, so the dashboard's Action plan is live, not mock.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALL_CLIENTS = [
  "Shinta Mani Wild",
  "Sora Sukhumvit",
  "IC Khao Yai",
];

export async function GET() {
  // Authenticate the user via session cookie
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Service role client — created at request time so env vars are available
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Resolve the user's allowed clients (admin sees all, client sees one)
  const { data: roleRow } = await adminClient
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", user.id)
    .single();

  const role = roleRow?.role ?? "admin";
  const allowed = role === "admin"
    ? ALL_CLIENTS
    : ALL_CLIENTS.filter((n) => n === roleRow?.client_name);

  // Fetch the task list for the allowed clients
  const { data: rows, error: qErr } = await adminClient
    .from("seo_action_items")
    .select("client_name, task, detail, category, priority, status, sort_order")
    .in("client_name", allowed)
    .order("client_name", { ascending: true })
    .order("sort_order", { ascending: true });

  if (qErr) {
    console.error("[/api/action-items]", qErr);
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  // Group by client, shaped like the dashboard's ACTION_PLANS entries
  // ({ task, cat, priority, status, detail }).
  const data = {};
  for (const r of rows ?? []) {
    (data[r.client_name] ??= []).push({
      task:     r.task,
      cat:      r.category,
      priority: r.priority,
      status:   r.status,
      detail:   r.detail ?? "",
    });
  }

  return Response.json({ ok: true, data });
}
