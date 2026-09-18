// TEMPORARY debug route — user flagged a "slight margin of error" on
// Azerai La Residence Hue's Revenue-from-GA4 figure vs their own GA4 Explore
// report (breakdown by Item brand / Month, using item_revenue). Our pipeline
// currently sums event-level purchase_revenue and splits by hotel ID parsed
// out of page_location (see GA4_HOTEL_ID_MATCH in lib/sem.js) — this route
// checks whether item_brand/item_revenue are available on Windsor's GA4
// connector as a more direct disambiguator, and compares both methods'
// monthly totals against the reference numbers.
// DELETE this route (and its middleware.js bypass) once confirmed.
const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

export const dynamic = "force-dynamic";

async function windsorGet(connector, fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key: WINDSOR_KEY,
    fields: fields.join(","),
    date_from: dateFrom,
    date_to: dateTo,
  });
  const res = await fetch(`${BASE}/${connector}?${params}`, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    return { error: `${res.status}: ${text.slice(0, 500)}` };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: `non-JSON response: ${text.slice(0, 300)}` };
  }
  return { rows: Array.isArray(json) ? json : (json.data ?? []) };
}

const GA4_HOTEL_ID_MATCH = {
  "110349": "Azerai La Residence, Hue",
  "110430": "Azerai Ke Ga Bay",
};

export async function GET() {
  const dateFrom = "2026-01-01";
  const t = new Date();
  const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

  const out = {};

  // Method A (current pipeline): event-level purchase_revenue + page_location hotel-ID split
  const a = await windsorGet(
    "googleanalytics4",
    ["account_name", "date", "page_location", "purchase_revenue", "ecommerce_purchases"],
    dateFrom,
    dateTo
  );
  out.methodA_raw_error = a.error ?? null;
  if (a.rows) {
    const byClientMonth = {};
    for (const row of a.rows) {
      const acc = (row.account_name || "").toLowerCase();
      if (!acc.includes("azerai")) continue;
      const m = /^https?:\/\/[^/]+\/(\d+)/.exec(row.page_location || "");
      const client = m && GA4_HOTEL_ID_MATCH[m[1]];
      if (!client) continue;
      const month = String(row.date).slice(0, 7);
      byClientMonth[client] ??= {};
      byClientMonth[client][month] = (byClientMonth[client][month] || 0) + Number(row.purchase_revenue ?? 0);
    }
    out.methodA_purchaseRevenue_byClientMonth = byClientMonth;
    out.methodA_rowCount = a.rows.length;
  }

  // Method B: item-level fields, if the connector supports them
  const b = await windsorGet(
    "googleanalytics4",
    ["account_name", "date", "item_brand", "item_revenue", "item_purchase_quantity"],
    dateFrom,
    dateTo
  );
  out.methodB_raw_error = b.error ?? null;
  if (b.rows) {
    out.methodB_sampleRow = b.rows[0] ?? null;
    out.methodB_rowCount = b.rows.length;
    const distinctBrands = [...new Set(b.rows.map((r) => r.item_brand))];
    out.methodB_distinctItemBrands = distinctBrands;
    const byBrandMonth = {};
    for (const row of b.rows) {
      const acc = (row.account_name || "").toLowerCase();
      if (!acc.includes("azerai")) continue;
      const brand = row.item_brand || "(none)";
      const month = String(row.date).slice(0, 7);
      byBrandMonth[brand] ??= {};
      byBrandMonth[brand][month] = (byBrandMonth[brand][month] || 0) + Number(row.item_revenue ?? 0);
    }
    out.methodB_itemRevenue_byBrandMonth = byBrandMonth;
  }

  return Response.json(out);
}
