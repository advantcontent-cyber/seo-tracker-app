// SEM (paid search) data layer — Windsor.ai "google_ads" connector.
// Live, server-side (uses WINDSOR_API_KEY), same pattern as lib/gsc.js.
// Only clients with a mapped Google Ads account are returned.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "google_ads";
const BASE        = "https://connectors.windsor.ai";

// Client name → Google Ads account_name (as Windsor reports it).
export const ADS_ACCOUNT_NAME = {
  "IC Khao Yai": "InterContinental Khao Yai Resort",
};

export const YEAR   = 2026;
export const MONTHS = [3, 4, 5, 6];

async function windsorGet(fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
  });
  const res = await fetch(`${BASE}/${CONNECTOR}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

// Returns { data, months, year }. data = { [client]: { monthly:{mo:{spend,clicks,impressions,conversions}},
// campaigns:{mo:[{name,spend,clicks,impressions,conversions}]}, series:[spend per month] } }.
export async function fetchSemData() {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const dateFrom = `${YEAR}-03-01`;
  const dateTo   = `${YEAR}-06-30`;
  const nameToClient = Object.fromEntries(
    Object.entries(ADS_ACCOUNT_NAME).map(([client, name]) => [name, client])
  );

  const [monthlyRows, campaignRows] = await Promise.all([
    windsorGet(["account_name", "year_month", "clicks", "impressions", "spend", "conversions"], dateFrom, dateTo),
    windsorGet(["account_name", "year_month", "campaign", "clicks", "impressions", "spend", "conversions"], dateFrom, dateTo),
  ]);

  const result = {};

  for (const row of monthlyRows) {
    const client = nameToClient[row.account_name];
    if (!client) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    (result[client] ??= { monthly: {}, campaigns: {} }).monthly[mo] = {
      spend:       Math.round((row.spend ?? 0) * 100) / 100,
      clicks:      Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      conversions: Math.round(row.conversions ?? 0),
    };
  }

  for (const row of campaignRows) {
    const client = nameToClient[row.account_name];
    if (!client || !row.campaign) continue;
    const mo = parseInt(String(row.year_month).split("|")[1]);
    if (!MONTHS.includes(mo)) continue;
    result[client] ??= { monthly: {}, campaigns: {} };
    (result[client].campaigns[mo] ??= []).push({
      name:        row.campaign,
      spend:       Math.round((row.spend ?? 0) * 100) / 100,
      clicks:      Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      conversions: Math.round(row.conversions ?? 0),
    });
  }

  for (const client of Object.keys(result)) {
    result[client].series = MONTHS.map((mo) => result[client].monthly[mo]?.spend ?? 0);
  }

  return { data: result, months: MONTHS, year: YEAR };
}
