// Shared server-side date-range helpers for the SEO report routes
// (organic-report, traffic-report, conversions-report, summary-report, gsc,
// ai) — mirrors the client-side addDays/prevWindow in components/
// SeoTracker.jsx (used by the Performance Marketing date-range picker) so
// "auto-follow the immediately preceding period of equal length" behaves
// identically whether the default is computed client-side (no compare dates
// picked yet) or server-side (a caller omits compareFrom/compareTo).

export const addDays = (dateStr, delta) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

// Number of days in an inclusive [from, to] range.
function rangeLen(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
}

// The immediately-preceding period of equal length — e.g. selecting Jul 8-14
// compares against Jul 1-7. Same convention Search Console's own date picker
// (and this app's SEM tab) uses.
export function prevWindow(from, to) {
  const len = rangeLen(from, to);
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(len - 1)), to: prevTo };
}

// Today, as YYYY-MM-DD — used to cap any "to" date that would otherwise run
// into the future (confuses Windsor's connectors).
export function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
