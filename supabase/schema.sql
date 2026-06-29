-- SEO Tracker schema — Supabase SQL editor:
--   https://supabase.com/dashboard/project/ahicabzyywflthxglfwv/sql
--
-- This file is split into two sections:
--   1. seo_user_roles    — ALREADY APPLIED. Do NOT re-run (see note below).
--   2. seo_action_items  — run this section to enable the live Action plan.
-- Every statement is idempotent (if-not-exists / drop-policy-if-exists), so
-- re-running a section is safe EXCEPT for the user-role seed, which is why
-- section 1 carries no insert and is marked applied.

-- ==================================================================
-- SECTION 1 · seo_user_roles  — ALREADY APPLIED IN PRODUCTION
-- Roles + the admin user row are already seeded. Skip this section; it's
-- kept here only as the source-of-truth definition. Re-running the admin
-- seed elsewhere is what caused the "duplicate key (user_id)" error.
-- ==================================================================

-- User roles: maps a Supabase auth user to admin or a specific client
create table if not exists public.seo_user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'client')),
  client_name text, -- null for admin, exact client name for client role
  created_at  timestamptz default now(),
  unique (user_id)
);

-- RLS: users can only read their own role
alter table public.seo_user_roles enable row level security;

drop policy if exists "Users can read own role" on public.seo_user_roles;
create policy "Users can read own role"
  on public.seo_user_roles for select
  using (auth.uid() = user_id);

-- Service role can insert/update (used by admin setup)
drop policy if exists "Service role can manage roles" on public.seo_user_roles;
create policy "Service role can manage roles"
  on public.seo_user_roles for all
  using (true)
  with check (true);

-- ==================================================================
-- SECTION 2 · seo_action_items  — RUN THIS to enable the live Action plan
-- The team's own work tracker (not crawl/GSC output), edited in the
-- Supabase Table editor. The dashboard reads it live. Safe to re-run:
-- the table is if-not-exists and the seed only inserts when empty.
-- cat: Technical · On-page · Content · Off-page · Local · International
-- ==================================================================
create table if not exists public.seo_action_items (
  id          uuid primary key default gen_random_uuid(),
  client_name text not null,
  task        text not null,
  detail      text,
  category    text not null,
  priority    text not null check (priority in ('high', 'med', 'low')),
  status      text not null check (status in ('todo', 'doing', 'done')),
  sort_order  int  not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists seo_action_items_client_idx
  on public.seo_action_items (client_name, sort_order);

alter table public.seo_action_items enable row level security;

-- Admins read all; client users read only their own client's items.
drop policy if exists "Read action items for allowed clients" on public.seo_action_items;
create policy "Read action items for allowed clients"
  on public.seo_action_items for select
  to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_action_items.client_name)
    )
  );

-- Service role (the API route) can read/write everything.
drop policy if exists "Service role can manage action items" on public.seo_action_items;
create policy "Service role can manage action items"
  on public.seo_action_items for all
  using (true)
  with check (true);

-- Seed from the dashboard's original hardcoded plan. Runs only when the
-- table is empty, so re-running this file won't duplicate rows. Edit tasks
-- in the Supabase Table editor after seeding — the dashboard reads live.
insert into public.seo_action_items (client_name, task, detail, category, priority, status, sort_order)
select v.client_name, v.task, v.detail, v.category, v.priority, v.status, v.sort_order
-- Text fields use dollar-quoting ($$...$$) so apostrophes never need escaping
-- and copy/paste can't break the string literals.
from (values
  ('Shinta Mani Wild', $$Run digital-PR push off the award wins$$, $$Pitch the CNT Triple Crown and Tripadvisor Best of the Best wins to travel press to convert coverage into authoritative backlinks.$$, 'Off-page', 'high', 'doing', 0),
  ('Shinta Mani Wild', $$Build out experience landing pages$$, $$Dedicated pages for Cardamom Mountains, conservation and signature adventures to capture rising 'luxury tented camp' demand.$$, 'Content', 'high', 'done', 1),
  ('Shinta Mani Wild', $$Clear the open crawl error and warnings$$, $$Resolve the 1 error and 6 warnings to lift Site Health from 91 toward 95+.$$, 'Technical', 'med', 'done', 2),
  ('Shinta Mani Wild', $$Lift 'all inclusive luxury cambodia' into top 10$$, $$Currently position 12. Match search intent in title and H1 and add internal links from high-authority pages.$$, 'On-page', 'med', 'doing', 3),
  ('Shinta Mani Wild', $$Add LodgingBusiness structured data$$, $$Mark up rates, amenities and ratings for rich results in the SERP.$$, 'Technical', 'low', 'done', 4),
  ('Shinta Mani Wild', $$Earn links from conservation partners$$, $$Relevant, high-trust links via Wildlife Alliance and sustainability partners tied to the camp's conservation story.$$, 'Off-page', 'med', 'todo', 5),

  ('Nomad Greenland', $$Prioritise link-building to grow authority$$, $$Authority is only 24 — the main ceiling on growth. Target Arctic, expedition and luxury-travel press and partners.$$, 'Off-page', 'high', 'doing', 0),
  ('Nomad Greenland', $$Build activity and Ilulissat content$$, $$Capitalise on strong content momentum; 'ilulissat tours' sits at position 9 with room to climb.$$, 'Content', 'high', 'done', 1),
  ('Nomad Greenland', $$Refine 'greenland arctic expedition' page$$, $$Position 11 — tighten on-page targeting to break into the top 10, and push 'greenland luxury travel' (pos 4) toward top 3.$$, 'On-page', 'med', 'todo', 2),
  ('Nomad Greenland', $$Add tour and experience structured data$$, $$0 errors today — maintain that and add schema for tours and experiences.$$, 'Technical', 'low', 'done', 3),
  ('Nomad Greenland', $$Internal-link knowledge-base content to commercial pages$$, $$Route authority from new informational chunks into booking and activity pages.$$, 'Content', 'med', 'doing', 4),

  ('Sora Sukhumvit', $$Optimise the seven offer pages$$, $$Web-exclusive, stay-longer and last-minute offers tuned for transactional queries with clean internal linking.$$, 'On-page', 'high', 'done', 0),
  ('Sora Sukhumvit', $$Build long-stay content$$, $$'long stay hotel bangkok' sits at position 15 on strong volume — a serviced/long-stay angle is the opportunity.$$, 'Content', 'high', 'doing', 1),
  ('Sora Sukhumvit', $$Fix audit errors and add room schema$$, $$Resolve 2 errors and 5 warnings; ensure all eight room-type pages carry hotel-room structured data.$$, 'Technical', 'med', 'done', 2),
  ('Sora Sukhumvit', $$Lift 'lake view hotel bangkok' from position 10$$, $$Dedicated lake-view page plus internal links to break into the top results.$$, 'On-page', 'med', 'todo', 3),
  ('Sora Sukhumvit', $$Strengthen local signals around Sukhumvit/BTS$$, $$Google Business Profile and neighbourhood content tied to the BTS line.$$, 'Local', 'med', 'doing', 4),

  ('IC Khao Yai', $$Clear the crawl errors first$$, $$Health is 78 with 4 errors — fix indexation and crawl issues from the audit before chasing rankings.$$, 'Technical', 'high', 'doing', 0),
  ('IC Khao Yai', $$Optimise the core money pages$$, $$'khao yai resort' (pos 14, high volume) and 'khao yai luxury hotel' (pos 8) — titles, H1s and internal links to break into the top 10.$$, 'On-page', 'high', 'todo', 1),
  ('IC Khao Yai', $$Build a 'things to do in Khao Yai' hub$$, $$Position 19 on high volume and slipping — an informational hub recovers top-of-funnel demand.$$, 'Content', 'high', 'todo', 2),
  ('IC Khao Yai', $$Set up and validate EN/TH hreflang$$, $$Ensure bilingual pages are correctly paired so neither language cannibalises the other.$$, 'International', 'med', 'todo', 3),
  ('IC Khao Yai', $$Bring Thai pages to parity$$, $$Match metadata and content depth across EN and TH versions.$$, 'On-page', 'med', 'todo', 4),
  ('IC Khao Yai', $$Pursue Thai travel press and brand links$$, $$Local press plus InterContinental brand equity to build referring domains from 138.$$, 'Off-page', 'med', 'todo', 5)
) as v(client_name, task, detail, category, priority, status, sort_order)
where not exists (select 1 from public.seo_action_items);

-- ==================================================================
-- SECTION 3 · seo_blog_drafts  — RUN THIS to link Suggested-post drafts
-- Maps a suggested blog keyword to its Google Doc draft + status. The
-- Suggested-posts cards show a "View draft" link when a row exists for
-- that client + keyword. Keyword is stored lowercase to match GSC query
-- text. Edit/add rows in the Table editor as drafts are written.
-- status: planned · drafting · live
-- ==================================================================
create table if not exists public.seo_blog_drafts (
  id          uuid primary key default gen_random_uuid(),
  client_name text not null,
  keyword     text not null,
  title       text,
  meta        text,        -- SEO meta description (auto-drafts)
  draft_body  text,        -- full draft markdown when generated in-app (no Google Doc)
  draft_url   text,        -- Google Doc link when a doc exists
  status      text not null default 'drafting' check (status in ('planned', 'drafting', 'live')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (client_name, keyword)
);

-- For tables created before these columns existed:
alter table public.seo_blog_drafts add column if not exists meta       text;
alter table public.seo_blog_drafts add column if not exists draft_body text;

alter table public.seo_blog_drafts enable row level security;

drop policy if exists "Read blog drafts for allowed clients" on public.seo_blog_drafts;
create policy "Read blog drafts for allowed clients"
  on public.seo_blog_drafts for select
  to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_blog_drafts.client_name)
    )
  );

drop policy if exists "Service role can manage blog drafts" on public.seo_blog_drafts;
create policy "Service role can manage blog drafts"
  on public.seo_blog_drafts for all
  using (true) with check (true);

-- Seed the IC Khao Yai pilot drafts (Google Docs created June 2026).
-- Re-running is safe: on conflict updates the link/status in place.
insert into public.seo_blog_drafts (client_name, keyword, title, draft_url, status)
values
  ('IC Khao Yai', 'weekend getaways near me', $$Weekend Getaways Near Me: Why Khao Yai Is Bangkok's Best Escape$$, $$https://docs.google.com/document/d/1VvhWF4PvlIwWzwobH0sV-ScWOF_nZU71nMyH2gu0Nkg/edit$$, 'drafting'),
  ('IC Khao Yai', 'things to do in khao yai', $$Things to Do in Khao Yai: The Complete 2026 Guide$$, $$https://docs.google.com/document/d/1jBQfwT05iFxUQPs7DmJf1u59-ldlfvu8T6XcjKYmO4w/edit$$, 'drafting')
on conflict (client_name, keyword)
do update set title = excluded.title, draft_url = excluded.draft_url, status = excluded.status, updated_at = now();

-- ==================================================================
-- SECTION 4 · seo_voice_profiles  — brand voice per client
-- The drafting pipeline injects `profile` into every blog draft so the
-- output matches the property's brand voice. `doc_url` is a human-readable
-- mirror in Drive. Edit `profile` here (or via the Table editor) to tune
-- voice — that text is the source of truth the pipeline reads.
-- ==================================================================
create table if not exists public.seo_voice_profiles (
  id              uuid primary key default gen_random_uuid(),
  client_name     text not null unique,
  profile         text not null,
  doc_url         text,
  drive_folder_id text,   -- Drive folder where the cron creates this client's draft Docs
  updated_at      timestamptz default now()
);

alter table public.seo_voice_profiles add column if not exists drive_folder_id text;

alter table public.seo_voice_profiles enable row level security;

drop policy if exists "Read voice profiles for allowed clients" on public.seo_voice_profiles;
create policy "Read voice profiles for allowed clients"
  on public.seo_voice_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_voice_profiles.client_name)
    )
  );

drop policy if exists "Service role can manage voice profiles" on public.seo_voice_profiles;
create policy "Service role can manage voice profiles"
  on public.seo_voice_profiles for all
  using (true) with check (true);

-- Seed the IC Khao Yai voice profile (mirror of the Drive doc). Re-running
-- updates the text/link in place.
insert into public.seo_voice_profiles (client_name, profile, doc_url, drive_folder_id)
values (
  'IC Khao Yai',
  $$VOICE PROFILE — INTERCONTINENTAL KHAO YAI RESORT

POSITIONING: A luxury heritage resort where "classic elegance and luxury meet storytelling." Two pillars: HERITAGE (the golden age of first-class rail travel, expressed in 12 suites built from upcycled century-old North-Eastern Thai train carriages — "Unrivalled Luxury, Unbound Serenity") and NATURE (Khao Yai's tranquil lakes, forested hills and waterfalls; the resort as a "natural sanctuary"). The property is a JOURNEY and a SANCTUARY, not just a place to stay.

AUDIENCE: Affluent, experience-driven travellers — couples, families, design- and nature-lovers — from Bangkok and internationally. They value craft, story and authenticity over flash and discounts.

TONE: Sophisticated yet inviting (never cold/corporate); romantic & narrative-driven; nostalgic meets contemporary (reminiscence, bygone luxury, Victorian era); calm, restorative, aspirational; authentic over brand-speak.

VOICE PRINCIPLES: (1) Lead with story, not sell. (2) Let nature and heritage do the work. (3) Sensory and evocative but precise. (4) Warm second person — invite, don't instruct. (5) Equal weight to setting and substance.

VOCABULARY — USE: reconnect, sanctuary, immersive, heritage, curated, elegant, tranquil, serene, breathtaking, sweeping, sprawling, enchanting, distinctive, journey, storytelling, reminiscence, bygone luxury, gastronomic adventure, locally sourced, indigenous to the region, picturesque. BRANDED: Swan Lake; upcycled heritage railcar suites; InterContinental Khao Yai Resort (full name on first mention). AVOID: hype/cheap words (amazing, awesome, deal, cheap, best-ever), aggressive CTAs (BUY NOW, don't miss out), generic filler, untrue clichés.

STYLE: Mix short confident declarations with longer flowing sentences. Headings evocative but clear (benefit + place). POV "you"; "we" only as the resort's voice. Structure: subject → heritage/design story → specific detail → view/location advantage. Numbers welcome for credibility.

THEMES: Heritage storytelling (railway/golden age) · natural sanctuary & reconnection · luxury design · culinary craftsmanship (locally sourced) · lakeside living (Swan Lake).

EEAT (CRITICAL): Scaffold genuine Experience/Expertise/Authority/Trust; a human completes and verifies. Attribute to a REAL author (resort team member / local expert) — never a fabricated persona or invented experience. Invite verifiable first-hand specifics (real trail/waterfall names, seasonal notes). Link authoritative sources. No fabricated reviews/stats/awards/quotes. Drafts are for HUMAN REVIEW AND PUBLISHING — never auto-published.

DRAFTING RULES: Open with story/scene not a pitch. One target keyword used naturally in title, intro and one H2 — never stuff. Add an FAQ block where useful. End with a gentle on-brand CTA. Leave clearly-marked placeholders for facts to verify and internal links. Run the in-voice/off-voice test before finishing.

IN-VOICE EXAMPLE: "From misted morning trails to the quiet of the vineyards at dusk, Khao Yai rewards those who slow down — and there's no better base for it than a heritage sanctuary in the hills."$$,
  $$https://docs.google.com/document/d/1jlb56NeGq3lR0M8IMSda8FzrW3oeRBPGCq9UgGHKAkc/edit$$,
  $$1u_hrOM27T3r4gCvXQ-fE1FTVi9iq9Yx3$$
)
on conflict (client_name)
do update set profile = excluded.profile, doc_url = excluded.doc_url, drive_folder_id = excluded.drive_folder_id, updated_at = now();

-- ==================================================================
-- SECTION 5 · seo_semrush_metrics  — cached SEMrush snapshots
-- Monthly snapshot per client (kept as history so the dashboard can show
-- month-over-month deltas). The app NEVER calls SEMrush directly — these
-- rows are refreshed periodically via the SEMrush MCP (cheap, ~60 units/
-- client/month) and the dashboard only reads this cache.
-- ==================================================================
create table if not exists public.seo_semrush_metrics (
  id               uuid primary key default gen_random_uuid(),
  client_name      text not null,
  snapshot_date    date not null,
  database         text,                 -- SEMrush regional db (e.g. 'th')
  scope            text,                 -- 'subdomain' | 'root_domain'
  authority_score  int,
  organic_keywords int,
  organic_traffic  int,
  paid_keywords    int,
  ref_domains      int,
  backlinks        int,
  semrush_rank     int,
  created_at       timestamptz default now(),
  unique (client_name, snapshot_date)
);

alter table public.seo_semrush_metrics enable row level security;

drop policy if exists "Read semrush metrics for allowed clients" on public.seo_semrush_metrics;
create policy "Read semrush metrics for allowed clients"
  on public.seo_semrush_metrics for select
  to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_semrush_metrics.client_name)
    )
  );

drop policy if exists "Service role can manage semrush metrics" on public.seo_semrush_metrics;
create policy "Service role can manage semrush metrics"
  on public.seo_semrush_metrics for all
  using (true) with check (true);

-- Seed IC Khao Yai's June 2026 snapshot (subdomain scope, TH database).
insert into public.seo_semrush_metrics
  (client_name, snapshot_date, database, scope, authority_score, organic_keywords, organic_traffic, paid_keywords, ref_domains, backlinks, semrush_rank)
values
  ('IC Khao Yai', '2026-06-29', 'th', 'subdomain', 62, 847, 4491, 0, 558, 2765, null)
on conflict (client_name, snapshot_date)
do update set
  database = excluded.database, scope = excluded.scope, authority_score = excluded.authority_score,
  organic_keywords = excluded.organic_keywords, organic_traffic = excluded.organic_traffic,
  paid_keywords = excluded.paid_keywords, ref_domains = excluded.ref_domains,
  backlinks = excluded.backlinks, semrush_rank = excluded.semrush_rank;

-- ==================================================================
-- SECTION 6 · seo_keyword_ideas  — SEMrush content-keyword opportunities
-- Brand-new keywords to target for blog content (not yet ranked for).
-- Discovered via the SEMrush MCP (phrase_related/phrase_questions),
-- with a formulated blog title/angle. search_volume is GLOBAL (summed
-- across all SEMrush country databases via phrase_all); kd is keyword
-- difficulty in the LOCAL market (TH). Shown on the Blog plan tab;
-- exportable as CSV into the plan sheet. The app never calls SEMrush.
-- ==================================================================
create table if not exists public.seo_keyword_ideas (
  id              uuid primary key default gen_random_uuid(),
  client_name     text not null,
  keyword         text not null,
  database        text,                 -- locale for kd (e.g. 'th'); volume is global
  search_volume   int,                  -- GLOBAL search volume (sum of all databases)
  kd              int,                  -- keyword difficulty, local market (TH), 0–100
  suggested_title text,                 -- formulated blog angle
  snapshot_date   date,
  created_at      timestamptz default now(),
  unique (client_name, keyword)
);

alter table public.seo_keyword_ideas add column if not exists kd int;

alter table public.seo_keyword_ideas enable row level security;

drop policy if exists "Read keyword ideas for allowed clients" on public.seo_keyword_ideas;
create policy "Read keyword ideas for allowed clients"
  on public.seo_keyword_ideas for select to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_keyword_ideas.client_name)
    )
  );

drop policy if exists "Service role can manage keyword ideas" on public.seo_keyword_ideas;
create policy "Service role can manage keyword ideas"
  on public.seo_keyword_ideas for all using (true) with check (true);

-- Seed IC Khao Yai content ideas (June 2026). search_volume = GLOBAL (summed
-- across all country databases); kd = TH keyword difficulty. Highest volume first.
insert into public.seo_keyword_ideas (client_name, keyword, database, search_volume, kd, suggested_title, snapshot_date)
values
  ('IC Khao Yai', 'khao yai national park', 'th', 41440, 66, $$Khao Yai National Park: The Complete Visitor's Guide$$, '2026-06-29'),
  ('IC Khao Yai', 'khao yai art museum', 'th', 4800, 24, $$Art & Culture in Khao Yai: Museums and Galleries to Visit$$, '2026-06-29'),
  ('IC Khao Yai', 'khao yai waterfall', 'th', 3940, 27, $$Chasing Waterfalls in Khao Yai: The Best Falls to See$$, '2026-06-29'),
  ('IC Khao Yai', 'khao yai weather', 'th', 3700, 30, $$Best Time to Visit Khao Yai: A Season-by-Season Guide$$, '2026-06-29'),
  ('IC Khao Yai', 'bangkok to khao yai', 'th', 2930, 19, $$Bangkok to Khao Yai: How to Get There$$, '2026-06-29'),
  ('IC Khao Yai', 'khao yai attractions', 'th', 1300, 25, $$Top Attractions in Khao Yai Beyond the National Park$$, '2026-06-29'),
  ('IC Khao Yai', 'khao yai tour', 'th', 1290, 30, $$Khao Yai Tours & Day Trips: Ways to Explore$$, '2026-06-29')
on conflict (client_name, keyword) do update set
  database = excluded.database, search_volume = excluded.search_volume, kd = excluded.kd,
  suggested_title = excluded.suggested_title, snapshot_date = excluded.snapshot_date;

-- ==================================================================
-- SECTION 7 · seo_plan_keywords  — SEMrush metrics for the blog-plan keywords
-- Enriches the 12-month blog plan: each plan keyword shows GLOBAL search
-- volume (approx — summed across top markets TH/US/UK/SG/AU) + LOCAL (TH)
-- keyword difficulty. Joined to plan rows by lowercase keyword. Only
-- keywords with SEMrush data are stored; the rest render blank.
-- The app never calls SEMrush — refreshed via the MCP and cached.
-- ==================================================================
create table if not exists public.seo_plan_keywords (
  id            uuid primary key default gen_random_uuid(),
  client_name   text not null,
  keyword       text not null,        -- lowercase, matches plan keyword
  global_volume int,                  -- approx global (top-markets sum)
  kd            int,                  -- keyword difficulty, local market (TH)
  snapshot_date date,
  created_at    timestamptz default now(),
  unique (client_name, keyword)
);

alter table public.seo_plan_keywords enable row level security;

drop policy if exists "Read plan keywords for allowed clients" on public.seo_plan_keywords;
create policy "Read plan keywords for allowed clients"
  on public.seo_plan_keywords for select to authenticated
  using (
    exists (
      select 1 from public.seo_user_roles r
      where r.user_id = auth.uid()
        and (r.role = 'admin' or r.client_name = seo_plan_keywords.client_name)
    )
  );

drop policy if exists "Service role can manage plan keywords" on public.seo_plan_keywords;
create policy "Service role can manage plan keywords"
  on public.seo_plan_keywords for all using (true) with check (true);

-- Seed IC Khao Yai sample-plan keywords that have SEMrush data (June 2026).
-- (The other ~18 angles returned no measurable volume — editorial topics.)
insert into public.seo_plan_keywords (client_name, keyword, global_volume, kd, snapshot_date)
values
  ('IC Khao Yai', 'things to do in khao yai', 880, 13, '2026-06-29'),
  ('IC Khao Yai', 'where to stay in khao yai', 140, 24, '2026-06-29'),
  ('IC Khao Yai', 'best time to visit khao yai', 110, 0, '2026-06-29'),
  ('IC Khao Yai', 'how to get to khao yai', 100, 0, '2026-06-29'),
  ('IC Khao Yai', 'where to eat in khao yai', 50, 0, '2026-06-29'),
  ('IC Khao Yai', 'itinerary for khao yai', 20, null, '2026-06-29'),
  -- The Keyword-ideas keywords (data-backed) so they enrich when added to the plan.
  ('IC Khao Yai', 'khao yai national park', 41440, 66, '2026-06-29'),
  ('IC Khao Yai', 'khao yai art museum', 4800, 24, '2026-06-29'),
  ('IC Khao Yai', 'khao yai waterfall', 3940, 27, '2026-06-29'),
  ('IC Khao Yai', 'khao yai weather', 3700, 30, '2026-06-29'),
  ('IC Khao Yai', 'bangkok to khao yai', 2930, 19, '2026-06-29'),
  ('IC Khao Yai', 'khao yai attractions', 1300, 25, '2026-06-29'),
  ('IC Khao Yai', 'khao yai tour', 1290, 30, '2026-06-29')
on conflict (client_name, keyword) do update set
  global_volume = excluded.global_volume, kd = excluded.kd, snapshot_date = excluded.snapshot_date;
