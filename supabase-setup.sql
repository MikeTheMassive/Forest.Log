-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.observations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists observations_user_id_idx
  on public.observations (user_id);

alter table public.observations enable row level security;

drop policy if exists "Users can read their observations" on public.observations;
create policy "Users can read their observations"
  on public.observations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their observations" on public.observations;
create policy "Users can insert their observations"
  on public.observations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their observations" on public.observations;
create policy "Users can update their observations"
  on public.observations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their observations" on public.observations;
create policy "Users can delete their observations"
  on public.observations for delete
  using (auth.uid() = user_id);
