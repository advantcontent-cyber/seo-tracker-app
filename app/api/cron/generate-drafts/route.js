// GET /api/cron/generate-drafts
// Monthly job (Vercel Cron): for each client with a brand voice profile, pick
// this month's top blog opportunities from GSC, generate an on-brand,
// EEAT-scaffolded draft via OpenRouter, and upsert it into seo_blog_drafts at
// status 'drafting'. Never publishes — a human reviews and promotes to 'live'.
//
// Protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <secret>`.

import { createClient } from "@supabase/supabase-js";
import { fetchGscData } from "../../../../lib/gsc";
import { selectBlogKeywords, generateDraft } from "../../../../lib/drafting";
import { getServiceAccount, createGoogleDoc } from "../../../../lib/google";

export const maxDuration = 300; // allow time for several LLM calls

export async function GET(request) {
  // --- auth ---------------------------------------------------------------
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const summary = { generated: [], skipped: [], errors: [] };

  try {
    // Google Docs creation is optional — only if a service account is configured.
    const googleEnabled = !!getServiceAccount();

    // 1. GSC data + the brand voice profiles that gate which clients we draft for.
    const [{ data: gscData }, profilesRes] = await Promise.all([
      fetchGscData(),
      admin.from("seo_voice_profiles").select("client_name, profile, drive_folder_id"),
    ]);
    const profiles = Object.fromEntries(
      (profilesRes.data ?? []).map((p) => [p.client_name, { profile: p.profile, folderId: p.drive_folder_id }])
    );

    // 2. Existing drafts — never regenerate a keyword we've already drafted.
    const { data: existing } = await admin
      .from("seo_blog_drafts")
      .select("client_name, keyword");
    const existingSet = new Set((existing ?? []).map((d) => `${d.client_name}::${(d.keyword || "").toLowerCase()}`));

    // 3. Per client (that has a voice profile), pick this month's blog keywords.
    for (const clientName of Object.keys(profiles)) {
      const monthsForClient = Object.keys(gscData?.[clientName] ?? {})
        .map(Number).filter((n) => !Number.isNaN(n));
      if (!monthsForClient.length) { summary.skipped.push(`${clientName}: no GSC data`); continue; }
      const latestMonth = Math.max(...monthsForClient); // most recent month with data

      const picks = selectBlogKeywords(gscData, clientName, latestMonth, 2);
      if (!picks.length) { summary.skipped.push(`${clientName}: no blog opportunities`); continue; }

      for (const pick of picks) {
        const key = `${clientName}::${pick.keyword.toLowerCase()}`;
        if (existingSet.has(key)) { summary.skipped.push(`${clientName}: "${pick.keyword}" already drafted`); continue; }

        try {
          const draft = await generateDraft({
            clientName,
            keyword: pick.keyword,
            voiceProfile: profiles[clientName].profile,
            rankingPage: pick.page,
            apiKey,
          });

          // Create an editable Google Doc when a service account is configured;
          // otherwise the draft lives as in-app body text (/draft/<id>).
          let draftUrl = null;
          if (googleEnabled) {
            try {
              const docText =
                `${draft.title}\n\n` +
                (draft.meta ? `META: ${draft.meta}\n\n` : "") +
                `${draft.body}`;
              draftUrl = await createGoogleDoc({
                title: `[DRAFT] ${draft.title}`,
                text: docText,
                folderId: profiles[clientName].folderId,
              });
            } catch (docErr) {
              summary.errors.push(`${clientName}: "${pick.keyword}" Doc — ${docErr.message}`);
            }
          }

          const { error: upErr } = await admin
            .from("seo_blog_drafts")
            .upsert({
              client_name: clientName,
              keyword:     pick.keyword.toLowerCase(),
              title:       draft.title,
              meta:        draft.meta,
              draft_body:  draft.body,
              ...(draftUrl ? { draft_url: draftUrl } : {}),
              status:      "drafting",
              updated_at:  new Date().toISOString(),
            }, { onConflict: "client_name,keyword" });

          if (upErr) throw upErr;
          summary.generated.push(`${clientName}: "${pick.keyword}"${draftUrl ? " (+Doc)" : ""}`);
          existingSet.add(key);
        } catch (err) {
          summary.errors.push(`${clientName}: "${pick.keyword}" — ${err.message}`);
        }
      }
    }

    return Response.json({ ok: true, summary });
  } catch (err) {
    console.error("[/api/cron/generate-drafts]", err);
    return Response.json({ error: err.message, summary }, { status: 500 });
  }
}
