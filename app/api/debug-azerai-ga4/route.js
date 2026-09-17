// TEMPORARY debug route — verifying the GA4 hotel-ID split for Azerai's
// shared "azerai - GA4" property (110349 = La Residence Hue, 110430 = Ke Ga
// Bay, confirmed live against reservations.azerai.com). DELETE this route
// (and its middleware.js bypass) once confirmed.
import { fetchSemData } from "@/lib/sem";

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

export const dynamic = "force-dynamic";

async function windsorGet(connector, fields, dateFrom, dateTo) {
  const params = new URLSearchParams({ api_key: WINDSOR_KEY, fields: fields.join(","), date_from: dateFrom, date_to: dateTo });
  const res = await fetch(`${BASE}/${connector}?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

export async function GET() {
  try {
    const dateFrom = "2026-01-01";
    const t = new Date();
    const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

    const rows = await windsorGet("googleanalytics4", ["account_name", "page_location", "date", "purchase_revenue", "ecommerce_purchases"], dateFrom, dateTo);
    const azerai = rows.filter((r) => r.account_name === "azerai - GA4");

    const byHotelMonth = { "110349_AZLRH": {}, "110430_AZKGB": {}, unmatched: {} };
    let unmatchedTotal = 0;
    let grandTotal = 0;
    for (const row of azerai) {
      const rev = Number(row.purchase_revenue ?? 0);
      grandTotal += rev;
      const month = String(row.date).slice(0, 7);
      const m = /^https?:\/\/[^/]+\/(\d+)/.exec(row.page_location || "");
      const id = m ? m[1] : null;
      let bucket;
      if (id === "110349") bucket = "110349_AZLRH";
      else if (id === "110430") bucket = "110430_AZKGB";
      else { bucket = "unmatched"; unmatchedTotal += rev; }
      byHotelMonth[bucket][month] = (byHotelMonth[bucket][month] || 0) + rev;
    }

    return Response.json({
      totalRows: azerai.length,
      grandTotal,
      unmatchedTotal,
      unmatchedShare: unmatchedTotal / grandTotal,
      byHotelMonth,
    });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
