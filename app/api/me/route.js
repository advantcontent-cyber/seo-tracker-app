// GET /api/me — returns role + allowed clients for the current session user

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

  // Look up the user's role row
  const { data: roleRow } = await adminClient
    .from("seo_user_roles")
    .select("role, client_name")
    .eq("user_id", user.id)
    .single();

  const role = roleRow?.role ?? "admin";
  const clients = role === "admin"
    ? ALL_CLIENTS
    : ALL_CLIENTS.filter((n) => n === roleRow?.client_name);

  return Response.json({ role, clients, email: user.email });
}
