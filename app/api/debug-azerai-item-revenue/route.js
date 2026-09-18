// TEMPORARY debug route — final check that the real fetchSemData pipeline
// (after switching addGa4Direct to item_brand/item_revenue) produces the
// same numbers as the client's own GA4 reference report, for both Sora and
// both Azerai properties.
// DELETE this route (and its middleware.js bypass) once confirmed.
import { fetchSemData } from "@/lib/sem";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data } = await fetchSemData();
  const out = {};
  for (const client of ["Azerai Ke Ga Bay", "Azerai La Residence, Hue", "Sora Sukhumvit"]) {
    const sem = data[client];
    if (!sem) { out[client] = null; continue; }
    const revenueByMonth = {};
    const purchasesByMonth = {};
    for (const [date, daily] of Object.entries(sem.daily)) {
      const month = date.slice(0, 7);
      revenueByMonth[month] = (revenueByMonth[month] || 0) + (daily.directRevenue ?? 0);
      purchasesByMonth[month] = (purchasesByMonth[month] || 0) + (daily.directPurchases ?? 0);
    }
    out[client] = { revenueByMonth, purchasesByMonth };
  }
  return Response.json(out);
}
