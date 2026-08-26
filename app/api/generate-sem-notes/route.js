// POST /api/generate-sem-notes
// Drafts the SEM Summary tab's 4 analyst-notes boxes (Good Points / Things
// to Improve / What We've Done / Next Steps) via an LLM. Auth + role scope
// mirror /api/generate-report. The caller (SummaryTab / SoraSummaryTab)
// already has the period's aggregated Meta/Google/combined facts computed
// client-side (via aggregateRange) — this route doesn't re-fetch Windsor,
// it just takes those facts and writes from them.
//
// Ephemeral, same as /api/generate-report — nothing is persisted here. The
// caller keeps the draft in local state so the team can edit it; it resets
// if they navigate away or change the date range/client.

import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { generateSemNotes } from "../../../lib/sem-narrative";

export const dynamic = "force-dynamic";

const SEM_CLIENTS = ["IC Khao Yai", "Nomad Greenland", "Azerai Ke Ga Bay", "Azerai La Residence, Hue", "Sora Sukhumvit", "Six Senses Fort Barwara"];

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
  const { client, period, facts } = body || {};

  if (!client || !SEM_CLIENTS.includes(client)) return Response.json({ error: "Unknown property" }, { status: 400 });
  if (role !== "admin" && client !== roleRow?.client_name)
    return Response.json({ error: "Not authorised for this property" }, { status: 403 });
  if (!period?.from || !period?.to) return Response.json({ error: "period.from and period.to are required" }, { status: 400 });
  if (!facts) return Response.json({ error: "facts is required" }, { status: 400 });

  try {
    const notes = await generateSemNotes({ client, period, ...facts }, process.env.OPENROUTER_API_KEY);
    return Response.json({ ok: true, notes });
  } catch (err) {
    console.error("[/api/generate-sem-notes]", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
