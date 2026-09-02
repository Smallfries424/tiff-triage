-- Festival Triage: user data schema.
--
-- The 244-film lineup is NOT here: it is fixed reference data for a ten-day
-- festival and ships as a static build-time artifact. Only per-user state lives
-- in Postgres, which keeps every row in this file trivially ownable by one user.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------- probe answers

create table if not exists public.probe_answers (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  film_title text        not null,
  reaction   text        not null check (reaction in ('love','like','meh','dislike','unseen')),
  updated_at timestamptz not null default now(),
  primary key (user_id, film_title)
);

-- ------------------------------------------------------------------ plan items

create table if not exists public.plan_items (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  film_id       integer     not null,
  screening_idx integer     not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, film_id, screening_idx)
);

-- ------------------------------------------------------------------------- RLS
--
-- The anon key is public by design: it ships in the browser bundle. These
-- policies are the only thing standing between that and every user reading every
-- other user's data, so they are written per-operation rather than as a blanket
-- "for all", and WITH CHECK is set on writes so nobody can insert a row owned by
-- someone else.

alter table public.probe_answers enable row level security;
alter table public.plan_items    enable row level security;

drop policy if exists probe_select on public.probe_answers;
drop policy if exists probe_insert on public.probe_answers;
drop policy if exists probe_update on public.probe_answers;
drop policy if exists probe_delete on public.probe_answers;

create policy probe_select on public.probe_answers
  for select using (auth.uid() = user_id);
create policy probe_insert on public.probe_answers
  for insert with check (auth.uid() = user_id);
create policy probe_update on public.probe_answers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy probe_delete on public.probe_answers
  for delete using (auth.uid() = user_id);

drop policy if exists plan_select on public.plan_items;
drop policy if exists plan_insert on public.plan_items;
drop policy if exists plan_delete on public.plan_items;

create policy plan_select on public.plan_items
  for select using (auth.uid() = user_id);
create policy plan_insert on public.plan_items
  for insert with check (auth.uid() = user_id);
create policy plan_delete on public.plan_items
  for delete using (auth.uid() = user_id);

-- Every lookup is "everything for this user", so the PK prefix already covers it;
-- no extra indexes needed at this scale.
