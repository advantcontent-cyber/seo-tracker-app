// TEMPORARY debug route — AZLRH shows Purchases in Jan/Feb/Mar/Jun but
// Revenue only in April. Checking why. DELETE this route (and its
// middleware.js bypass) once confirmed.
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
    const EXCHANGE_KEY = process.env.EXCHANGE_RATE_API_KEY;
    const EXCHANGE_BASE = "https://api.apilayer.com/exchangerates_data";
    let fxProbe;
    try {
      const params = new URLSearchParams({ start_date: "2026-01-01", end_date: "2026-01-05", symbols: "VND", base: "USD" });
      const res = await fetch(`${EXCHANGE_BASE}/timeseries?${params}`, { headers: { apikey: EXCHANGE_KEY }, cache: "no-store" });
      const text = await res.text();
      fxProbe = { status: res.status, hasKey: !!EXCHANGE_KEY, body: text.slice(0, 500) };
    } catch (err) {
      fxProbe = { error: err.message };
    }

    const dateFrom = "2026-01-01";
    const t = new Date();
    const dateTo = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

    // Raw conversion-action rows for AZLRH's campaigns, with currency, so we
    // can see exactly what all_conversions_value/currency look like per row.
    const rows = await windsorGet(
      "google_ads",
      ["account_name", "campaign", "date", "conversion_action_name", "all_conversions", "all_conversions_value", "currency"],
      dateFrom, dateTo
    );
    const azlrh = rows.filter((r) => (r.campaign || "").toUpperCase().startsWith("AZLRH") && /purchase/i.test(r.conversion_action_name || ""));

    const byMonth = {};
    for (const row of azlrh) {
      const month = String(row.date).slice(0, 7);
      byMonth[month] ??= { count: 0, value: 0, currencies: new Set() };
      byMonth[month].count += Math.round(row.all_conversions ?? 0);
      byMonth[month].value += Number(row.all_conversions_value ?? 0);
      byMonth[month].currencies.add(row.currency);
    }
    const byMonthOut = Object.fromEntries(
      Object.entries(byMonth).map(([m, v]) => [m, { count: v.count, value: v.value, currencies: [...v.currencies] }])
    );

    // Also through the real pipeline: google.purchase/purchaseValue,
    // meta.purchases/purchaseValue, and spendPending per day, aggregated by
    // month, for AZLRH.
    const { data } = await fetchSemData();
    const sem = data["Azerai La Residence, Hue"];
    const pipelineByMonth = {};
    if (sem) {
      for (const [date, daily] of Object.entries(sem.daily)) {
        const month = date.slice(0, 7);
        pipelineByMonth[month] ??= { googlePurchase: 0, googlePurchaseValue: 0, metaPurchases: 0, metaPurchaseValue: 0, anyPending: false };
        pipelineByMonth[month].googlePurchase += daily.google?.purchase ?? 0;
        pipelineByMonth[month].googlePurchaseValue += daily.google?.purchaseValue ?? 0;
        pipelineByMonth[month].metaPurchases += daily.meta?.purchases ?? 0;
        pipelineByMonth[month].metaPurchaseValue += daily.meta?.purchaseValue ?? 0;
        if (daily.spendPending) pipelineByMonth[month].anyPending = true;
      }
    }

    return Response.json({ fxProbe, rawByMonth: byMonthOut, pipelineByMonth });
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
