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
