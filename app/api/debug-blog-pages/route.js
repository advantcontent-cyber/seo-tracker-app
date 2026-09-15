// TEMP: verifies the sitemap-backed Top Blog Posts data added in lib/gsc.js
// (topBlogPosts per property/month) before merging. Delete this route (and
// its middleware.js bypass) once confirmed.
import { fetchGscData } from "../../../lib/gsc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await fetchGscData();
    const summary = {};
    for (const [client, months] of Object.entries(data)) {
      summary[client] = {};
      for (const [mo, val] of Object.entries(months)) {
        if (mo === "series" || !val?.topPages) continue;
        summary[client][mo] = {
          totalPagesWithData: val.topPages.length,
          topBlogPosts: val.topBlogPosts,
        };
      }
    }
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
