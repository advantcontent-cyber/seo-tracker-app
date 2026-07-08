// Organic Traffic Report data layer — GA4 via Windsor.ai "googleanalytics4".
// Powers the SEO ▸ Organic Traffic sub-tab. On-demand per property/month, same
// live server-side pattern as lib/organic-report.js. Covers all channels (like
// the template) — sessions/users/revenue summary, channel + device splits, a
// daily sessions/new-users series, and page performance.

const WINDSOR_KEY = process.env.WINDSOR_API_KEY;
const CONNECTOR   = "googleanalytics4";
const BASE        = "https://connectors.windsor.ai";

// client display name → GA4 account id (matches lib/ai.js).
const GA4_ACCOUNT = {
  "Shinta Mani Wild": "476347859",
  "Nomad Greenland":  "482173603",
  "Sora Sukhumvit":   "484664374",
  "IC Khao Yai":      "339641415",
};

async function windsorGet(fields, dateFrom, dateTo, account) {
  const params = new URLSearchParams({
    api_key:   WINDSOR_KEY,
    fields:    fields.join(","),
    date_from: dateFrom,
    date_to:   dateTo,
    accounts:  account,
  });
  const res = await fetch(`${BASE}/${CONNECTOR}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Windsor ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

function monthBounds(year, month) {
  const mm = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`];
}

// "web / mobile" → "Mobile"; falls back to "Other".
function cleanDevice(s) {
  const t = String(s || "").split("/").pop().trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Other";
}

// Collapse a sorted list to the top N, folding the remainder into "Other".
function topWithOther(list, n) {
  if (list.length <= n) return list;
  const head = list.slice(0, n - 1);
  const rest = list.slice(n - 1).reduce((a, x) => a + x.value, 0);
  return [...head, { label: "Other", value: rest }];
}

// Returns { summary, byChannel, byDevice, daily, pages, from, to, days }.
export async function fetchTrafficReport(clientName, year, month) {
  if (!WINDSOR_KEY) throw new Error("WINDSOR_API_KEY not set");
  const account = GA4_ACCOUNT[clientName];
  if (!account) throw new Error(`Unknown property: ${clientName}`);

  const [from, to] = monthBounds(year, month);
  const [sumRows, chanRows, devRows, dailyRows, pageRows] = await Promise.all([
    windsorGet(["sessions", "totalusers", "newusers", "conversions", "totalrevenue"], from, to, account),
    windsorGet(["session_default_channel_group", "sessions"], from, to, account),
    windsorGet(["platform_device_category", "sessions"], from, to, account),
    windsorGet(["date", "sessions", "newusers"], from, to, account),
    windsorGet(["page_path", "sessions", "totalusers", "newusers", "engagement_rate"], from, to, account),
  ]);

  const s0 = sumRows[0] || {};
  const summary = {
    sessions:    Math.round(s0.sessions ?? 0),
    totalUsers:  Math.round(s0.totalusers ?? 0),
    newUsers:    Math.round(s0.newusers ?? 0),
    conversions: Math.round(s0.conversions ?? 0),
    revenue:     Math.round((s0.totalrevenue ?? 0) * 100) / 100,
  };

  const byChannel = topWithOther(
    chanRows.map((r) => ({ label: r.session_default_channel_group || "Unassigned", value: Math.round(r.sessions ?? 0) }))
      .filter((c) => c.value > 0).sort((a, b) => b.value - a.value),
    7
  );

  // Device categories (merge any labels that clean to the same name).
  const devMap = {};
  for (const r of devRows) {
    const label = cleanDevice(r.platform_device_category);
    devMap[label] = (devMap[label] ?? 0) + Math.round(r.sessions ?? 0);
  }
  const byDevice = Object.entries(devMap).map(([label, value]) => ({ label, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  const byDay = {};
  for (const r of dailyRows) {
    const d = String(r.date).slice(0, 10);
    if (!d || d === "undefined") continue;
    byDay[d] ??= { date: d, sessions: 0, newUsers: 0 };
    byDay[d].sessions += r.sessions ?? 0;
    byDay[d].newUsers += r.newusers ?? 0;
  }
  const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, sessions: Math.round(d.sessions), newUsers: Math.round(d.newUsers) }));

  // Pages: session-weighted engagement, normalised to a 0-1 ratio (Windsor may
  // return the PERCENT field as 0-1 or 0-100 — handle both).
  const pageAgg = {};
  for (const r of pageRows) {
    const p = r.page_path;
    if (!p) continue;
    const s = r.sessions ?? 0;
    let er = r.engagement_rate ?? 0;
    if (er > 1) er = er / 100;
    pageAgg[p] ??= { page: p, sessions: 0, users: 0, newUsers: 0, engSum: 0, engW: 0 };
    pageAgg[p].sessions += s;
    pageAgg[p].users    += r.totalusers ?? 0;
    pageAgg[p].newUsers += r.newusers ?? 0;
    pageAgg[p].engSum   += er * s;
    pageAgg[p].engW     += s;
  }
  const pages = Object.values(pageAgg).sort((a, b) => b.sessions - a.sessions).slice(0, 10)
    .map((p) => ({ page: p.page, sessions: Math.round(p.sessions), users: Math.round(p.users), newUsers: Math.round(p.newUsers), engagement: p.engW ? p.engSum / p.engW : 0 }));

  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return { summary, byChannel, byDevice, daily, pages, from, to, days };
}
