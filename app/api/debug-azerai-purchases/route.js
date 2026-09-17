// TEMPORARY debug route — verifying the AZLRH Purchases fix end-to-end
// through the real fetchSemData() pipeline (not a reimplementation).
// DELETE this route (and its middleware.js bypass) once confirmed.
import { fetchSemData } from "@/lib/sem";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await fetchSemData();
    const out = {};
    for (const client of ["Azerai Ke Ga Bay", "Azerai La Residence, Hue"]) {
      const sem = data[client];
      if (!sem) { out[client] = null; continue; }
      const byMonth = {};
      for (const [date, daily] of Object.entries(sem.daily)) {
        const month = date.slice(0, 7);
        const purchase = (daily.meta?.purchases ?? 0) + (daily.google?.purchase ?? 0);
        byMonth[month] = (byMonth[month] || 0) + purchase;
      }
      out[client] = byMonth;
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
