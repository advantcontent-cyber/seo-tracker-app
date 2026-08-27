// TEMPORARY debug route — checks whether Windsor is actually connected to
// a Zoho CRM account at all (a real, distinct connection step done on
// Windsor's own dashboard — not something buildable from this codebase),
// and if so, what real Lead/Deal field names look like for Nomad Greenland.
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
  const res = await fetch(`${BASE}/${connector}?${params}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: res.ok, status: res.status, raw: text.slice(0, 1000), json };
}

export async function GET() {
  const dateFrom = "2026-01-01";
  const dateTo = new Date().toISOString().slice(0, 10);

  const leadAttempt = await windsorGet("zoho", ["account_name", "email", "lead_status", "firstname", "lastname", "date"], dateFrom, dateTo);

  return Response.json({ leadAttempt });
}
