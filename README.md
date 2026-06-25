# SEO Progress Tracker

Internal client SEO dashboard for Advant Labs. Google Search Console–led metrics,
a seasonal "analyst read" per property, content opportunities, and a 12-month
blog plan that imports from a CSV/sheet.

Built with Next.js (App Router) + React + Recharts + Tailwind.

> **Data note:** every figure is currently mock/derived and lives in browser
> memory for the session. Nothing is wired to GSC, Windsor.ai, or Supabase yet.
> The blog-plan import reads a file you drop in; it does not read your Drive.
> See **Where the backend plugs in** below.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:3000
```

Sign-in is a front-end shell only (access code `advant2026`, any email) — not real
auth. Replace with Supabase Auth before this is anything but internal.

## Push to GitHub

```bash
git init
git add .
git commit -m "SEO progress tracker"
git branch -M main
# create the repo first at github.com/new (e.g. advant/seo-tracker), then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Or with the GitHub CLI, which creates the repo for you:

```bash
gh repo create advant/seo-tracker --private --source=. --remote=origin --push
```

## Deploy to Vercel (connect the repo)

1. Go to **vercel.com/new** and **Import** the GitHub repo.
2. Vercel auto-detects **Next.js** — leave Build & Output settings at defaults
   (`next build`, no special output dir).
3. No environment variables are needed yet.
4. **Deploy.** Pushes to `main` redeploy automatically.

## Using the blog plan

Open a property → **Blog plan** tab → **Upload CSV** (or paste), using
`blog-plan-template.csv` (shipped in this repo). Columns:

`Client, Month, Keyword, Title, SEO meta, Brief, Draft, Published`

Status is inferred from the links: a **Published** URL shows Live, a **Draft**
link shows Drafting, a **Brief** link shows Briefed, none shows Planned. Rows
route to each property by the **Client** column. **Export CSV** writes the same
format back, so it round-trips.

## Where the backend plugs in (next step)

The UI is shaped to receive real data with contained changes:

- **Auth** → swap the `Login` shell + `window.storage` shim for **Supabase Auth**
  (the shim currently backs "remember me" with `localStorage`).
- **Metrics** → replace the mock `gsc()` / `CLIENTS` data with a read from
  **Supabase** (materialised from GSC via Windsor.ai → BigQuery).
- **Blog plan** → replace the in-memory CSV import with a read of the sheet your
  pipeline pulls from Drive, persisted in Supabase. The parser, routing, status
  logic, columns, and export are already in place.

## Structure

```
app/
  layout.jsx        # root layout + metadata
  page.jsx          # loads the dashboard client-only (ssr: false)
  globals.css       # Tailwind + base
components/
  SeoTracker.jsx    # the whole dashboard (client component)
blog-plan-template.csv
```
