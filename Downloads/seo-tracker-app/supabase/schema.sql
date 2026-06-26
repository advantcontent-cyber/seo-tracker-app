-- SEO Tracker: user roles table
-- Run this in Supabase SQL editor: https://supabase.com/dashboard/project/ahicabzyywflthxglfwv/sql

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

create policy "Users can read own role"
  on public.seo_user_roles for select
  using (auth.uid() = user_id);

-- Service role can insert/update (used by admin setup)
create policy "Service role can manage roles"
  on public.seo_user_roles for all
  using (true)
  with check (true);
