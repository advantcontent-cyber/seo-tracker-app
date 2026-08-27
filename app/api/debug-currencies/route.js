// TEMPORARY debug route — surveys which currencies each client's Google/Meta
// rows actually report, to scope the "remove FX conversion, show Windsor's
// own currency" change safely (some clients may report more than one
// currency across platforms/days, which needs a different fix than a
// single-currency client). DELETE this route (and its middleware.js bypass)
// once confirmed.

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
  if (!res.ok) throw new Error(`Windsor ${connector} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

const ACCOUNT_MATCH = {
  "IC Khao Yai": "intercontinental khao yai",
  "Nomad Greenland": "nomad greenland",
  "Azerai Ke Ga Bay": "ke ga bay",
  "Azerai La Residence, Hue": "azerai",
};

function clientForAccount(accountName) {
  const s = (accountName || "").toLowerCase();
  for (const [client, needle] of Object.entries(ACCOUNT_MATCH)) {
    if (s.includes(needle)) return client;
  }
  return null;
}

export async function GET() {
  const dateFrom = "2026-01-01";
  const dateTo = new Date().toISOString().slice(0, 10);

  const [gRows, mRows] = await Promise.all([
    windsorGet("google_ads", ["account_name", "date", "currency"], dateFrom, dateTo),
    windsorGet("facebook", ["account_name", "date", "currency"], dateFrom, dateTo),
  ]);

  const summary = {};
  const record = (platform, rows) => {
    for (const row of rows) {
      const client = clientForAccount(row.account_name);
      if (!client) continue;
      summary[client] ??= { google: {}, facebook: {} };
      const cur = row.currency || "(none)";
      summary[client][platform][cur] = (summary[client][platform][cur] || 0) + 1;
    }
  };
  record("google", gRows);
  record("facebook", mRows);

  return Response.json({ summary });
}
