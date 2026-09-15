// TEMP: checks how far back real GSC/Windsor page data actually goes for
// each property, to decide whether "Top Blog Posts, all time" is feasible.
// Delete this route (and its middleware.js bypass) once confirmed.
import { PROPERTY_MAP } from "../../../lib/gsc";

export const dynamic = "force-dynamic";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

async function windsorGet(fields, dateFrom, dateTo) {
  const params = new URLSearchParams({ api_key: WINDSOR_KEY, fields: fields.join(","), date_from: dateFrom, date_to: dateTo });
  const res = await fetch(`${BASE}/searchconsole?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

export async function GET() {
  try {
    const today = new Date();
    const dateTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Windsor caps date_from at 16 months back (matches GSC's own retention
    // window) — confirmed via a 400 on an earlier, too-early attempt.
    const sixteenMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 16, today.getDate());
    const earliestAllowed = `${sixteenMonthsAgo.getFullYear()}-${String(sixteenMonthsAgo.getMonth() + 1).padStart(2, "0")}-${String(sixteenMonthsAgo.getDate()).padStart(2, "0")}`;

    // 1) Per-month totals from the earliest allowed date, to find the
    //    earliest month with real (non-zero) data per property.
    const monthlyRows = await windsorGet(["account_name", "year_month", "clicks", "impressions"], earliestAllowed, dateTo);
    const earliestByClient = {};
    for (const row of monthlyRows) {
      const name = PROPERTY_MAP[row.account_name];
      if (!name) continue;
      const ym = String(row.year_month);
      const hasData = (row.clicks ?? 0) > 0 || (row.impressions ?? 0) > 0;
      if (!hasData) continue;
      if (!earliestByClient[name] || ym < earliestByClient[name]) earliestByClient[name] = ym;
    }

    // 2) A true all-time (no year_month) per-page roll-up, "2023-01-01" to
    //    today, to sanity-check totals look real (not just whatever Windsor
    //    happens to return for a too-early range).
    const allTimePageRows = await windsorGet(["account_name", "page", "clicks", "impressions"], earliestAllowed, dateTo);
    const totalsByClient = {};
    for (const row of allTimePageRows) {
      const name = PROPERTY_MAP[row.account_name];
      if (!name) continue;
      totalsByClient[name] ??= { pages: 0, clicks: 0, impressions: 0 };
      totalsByClient[name].pages += 1;
      totalsByClient[name].clicks += row.clicks ?? 0;
      totalsByClient[name].impressions += row.impressions ?? 0;
    }

    return Response.json({ ok: true, earliestByClient, totalsByClient, requestedRange: { from: earliestAllowed, to: dateTo } });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
