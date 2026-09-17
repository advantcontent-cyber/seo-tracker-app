// TEMPORARY debug route — checking GA4 direct-revenue attribution for both
// Azerai properties before building the Revenue-from-Ads-vs-Direct(GA4)
// chart. Same concern as the Purchases routing bug (PR #54): need to know
// whether GA4 has one shared property covering both, or separate ones, and
// whether clientForAccount actually attributes it correctly per-property.
// DELETE this route (and its middleware.js bypass) once confirmed.
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

    const rawGa4 = await windsorGet("googleanalytics4", ["account_name", "hostname", "date", "purchase_revenue", "ecommerce_purchases"], dateFrom, dateTo);
    const hostnamesByAccount = {};
    for (const row of rawGa4) {
      const acc = row.account_name;
      hostnamesByAccount[acc] ??= {};
      hostnamesByAccount[acc][row.hostname] = (hostnamesByAccount[acc][row.hostname] || 0) + Number(row.purchase_revenue ?? 0);
    }
    const accountNames = [...new Set(rawGa4.map((r) => r.account_name))];
    const revenueByAccountMonth = {};
    for (const row of rawGa4) {
      const acc = row.account_name;
      const month = String(row.date).slice(0, 7);
      revenueByAccountMonth[acc] ??= {};
      revenueByAccountMonth[acc][month] = (revenueByAccountMonth[acc][month] || 0) + Number(row.purchase_revenue ?? 0);
    }

    // Also run it through the real pipeline to see what actually lands on
    // each client's daily.directRevenue.
    const { data } = await fetchSemData();
    const viaPipeline = {};
    for (const client of ["Azerai Ke Ga Bay", "Azerai La Residence, Hue"]) {
      const sem = data[client];
      if (!sem) { viaPipeline[client] = null; continue; }
      const byMonth = {};
      for (const [date, daily] of Object.entries(sem.daily)) {
        const month = date.slice(0, 7);
        byMonth[month] = (byMonth[month] || 0) + (daily.directRevenue ?? 0);
      }
      viaPipeline[client] = byMonth;
    }

    return Response.json({ accountNames, hostnamesByAccount, revenueByAccountMonth, viaPipeline });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
