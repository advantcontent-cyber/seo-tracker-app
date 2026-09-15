// TEMP: verifies the new per-page (no "query" dimension) Windsor call added
// in lib/gsc.js for the Top Blog Posts panel — confirms it returns real,
// sensibly-aggregated per-URL clicks/impressions before merging. Delete this
// route (and its middleware.js bypass) once confirmed.
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
        const blog = val.topPages.filter((r) => {
          try { return new URL(r.page).pathname.includes("/blog/"); } catch { return false; }
        });
        summary[client][mo] = {
          totalPagesWithData: val.topPages.length,
          blogPageCount: blog.length,
          top5Blog: blog.slice(0, 5),
          top5AnyPage: val.topPages.slice(0, 5),
        };
      }
    }
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
