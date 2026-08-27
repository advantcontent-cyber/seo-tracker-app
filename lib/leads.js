// Zoho CRM leads/deals — Nomad Greenland's Aug 2026 feedback ("Add missing
// leads from Zoho", "Connect Windsor AI to retrieve Lead and Deal data",
// "Add a Leads Analysis tab"). Live, server-side (uses WINDSOR_API_KEY),
// same pattern as lib/sem.js/lib/gsc.js — a separate file since this is a
// genuinely different data domain (CRM, not ad platforms).
//
// IMPORTANT ASSUMPTION, confirmed as far as it can be without Zoho admin
// access: unlike the ad-platform connectors (facebook/google_ads), which
// pool many clients' accounts under one Windsor account and need
// clientForAccount()-style filtering, Zoho's rows returned during live
// discovery (Aug 2026) carried NO account/org-identifying field at all —
// just person-level lead/deal fields. This Windsor account appears to have
// exactly one Zoho CRM connected, which is assumed to BE Nomad Greenland's
// own CRM (the only client whose feedback asked for this). If that
// assumption is wrong — e.g. this Zoho org actually pools leads across
// multiple clients — this whole file would need a filtering field added,
// the same way ACCOUNT_MATCH does for ad platforms. Flag to the user if
// the numbers look off for that reason.
//
// Zoho's fields are split into REPORTS (Leads / Deals / Contacts / Cases) —
// confirmed live, Aug 2026: a query mixing fields from different reports
// 400s ("can only be read from the X report and cannot be combined with
// fields outside it"), the same report-grouping gotcha already seen on
// Google Ads' ad_group_criterion vs. search_term_view reports (see
// fetchGoogleSearchTerms in lib/sem.js) — so Leads and Deals are always
// fetched as two separate windsorGet calls, never merged into one.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const BASE = "https://connectors.windsor.ai";

async function windsorGet(fields, dateFrom, dateTo) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
  });
  const res = await fetch(`${BASE}/zoho?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor zoho ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

const MONTH_KEY = (dateStr) => (dateStr || "").slice(0, 7); // "YYYY-MM"

// Aggregate-only — no individual lead/deal records (name, email) are
// returned or exposed anywhere here, per the client-facing dashboard's
// privacy scope (confirmed with the user, Aug 2026): counts and breakdowns
// only.
export async function fetchZohoLeadsAndDeals(dateFrom, dateTo) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");

  const [leadRows, dealRows] = await Promise.all([
    windsorGet(["lead_status", "leads_lead_source", "date"], dateFrom, dateTo),
    windsorGet(["deals_stage", "deals_lead_source", "deals_amount", "date"], dateFrom, dateTo),
  ]);

  const byStatus = {};
  const bySource = {};
  const byMonth = {};
  for (const row of leadRows) {
    const status = row.lead_status || "Unknown";
    const source = row.leads_lead_source || "Unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
    const mo = MONTH_KEY(row.date);
    if (mo) byMonth[mo] = (byMonth[mo] || 0) + 1;
  }

  const byStage = {};
  const valueByStage = {};
  let totalDealValue = 0;
  for (const row of dealRows) {
    const stage = row.deals_stage || "Unknown";
    const amount = Number(row.deals_amount ?? 0); // coerce — Windsor has returned numeric fields as strings before, see the Six Senses Shaharut gotcha in lib/sem.js
    byStage[stage] = (byStage[stage] || 0) + 1;
    valueByStage[stage] = (valueByStage[stage] || 0) + amount;
    totalDealValue += amount;
  }

  const toRows = (obj) => Object.entries(obj).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    totalLeads: leadRows.length,
    totalDeals: dealRows.length,
    totalDealValue,
    leadsByStatus: toRows(byStatus),
    leadsBySource: toRows(bySource),
    leadsByMonth: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([mo, value]) => ({ month: mo, value })),
    dealsByStage: toRows(byStage),
    dealValueByStage: toRows(valueByStage),
  };
}
