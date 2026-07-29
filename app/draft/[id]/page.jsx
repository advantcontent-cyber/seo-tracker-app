// /draft/[id] — read-only view of an auto-generated draft stored in Supabase
// (for drafts that have body text but no Google Doc yet). Behind the auth
// middleware; additionally scoped so a client user can't view another client's
// draft. Copy into a Google Doc to edit.

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALL_CLIENTS = ["Shinta Mani Wild", "Nomad Greenland", "Sora Sukhumvit", "IC Khao Yai"];

export default async function DraftPage({ params }) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const { data: draft } = await admin
    .from("seo_blog_drafts")
    .select("client_name, keyword, title, meta, draft_body, status")
    .eq("id", id)
    .single();

  const notFound = !draft || !allowed.includes(draft.client_name);

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#f7f6f3", minHeight: "100vh" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
        <a href="/" style={{ color: "#0077c8", fontSize: 13, textDecoration: "none" }}>← Back to dashboard</a>

        {notFound ? (
          <p style={{ marginTop: 24, color: "#6b7280" }}>Draft not found, or you don't have access to it.</p>
        ) : (
          <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e5e3dd", borderRadius: 12, padding: "28px 32px" }}>
            <div style={{ fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", color: "#9aa0a6" }}>
              {draft.client_name} · {draft.status} · draft for review
            </div>
            <h1 style={{ fontFamily: "Spectral, Georgia, serif", fontSize: 26, lineHeight: 1.25, margin: "8px 0 4px", color: "#1a1a1a" }}>
              {draft.title || draft.keyword}
            </h1>
            {draft.meta ? (
              <p style={{ color: "#6b7280", fontSize: 13.5, margin: "0 0 16px" }}>{draft.meta}</p>
            ) : null}
            <hr style={{ border: "none", borderTop: "1px solid #e5e3dd", margin: "8px 0 20px" }} />
            <article style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.7, color: "#222" }}>
              {draft.draft_body || "(no draft body)"}
            </article>
            <hr style={{ border: "none", borderTop: "1px solid #e5e3dd", margin: "24px 0 12px" }} />
            <p style={{ color: "#9aa0a6", fontSize: 12.5 }}>
              This is an AI-assisted first draft. Verify all [VERIFY: …] placeholders, add internal links,
              and have a human author review before publishing. Copy into a Google Doc to edit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
