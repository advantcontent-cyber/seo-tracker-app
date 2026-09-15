// TEMP: verifies the all-time (16-month) Top Blog Posts data added in
// lib/gsc.js before merging. Delete this route (and its middleware.js
// bypass) once confirmed.
import { fetchGscData } from "../../../lib/gsc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await fetchGscData();
    const summary = {};
    for (const [client, val] of Object.entries(data)) {
      summary[client] = {
        blogPostsRange: val.blogPostsRange,
        topBlogPostsAllTime: val.topBlogPostsAllTime,
      };
    }
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
