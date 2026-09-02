-- Read-only plan sharing.
--
-- The problem: an anonymous visitor must be able to read exactly one person's
-- plan, and no one else's. RLS cannot express that on its own, because the anon key is
-- public, so any policy permissive enough to let a stranger read a shared plan
-- would let them read every plan.
--
-- The answer is a narrow SECURITY DEFINER function. plan_items stays fully locked
-- down; the function is the only way in, it takes an unguessable token, and it
-- returns nothing but film ids and screening indexes. No emails, no user ids, no
-- probe answers, nothing that identifies whose plan it is.
--
-- Safe to re-run.

create table if not exists public.plan_shares (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  token      uuid        not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.plan_shares enable row level security;

-- Owners manage their own share link. Note there is deliberately NO policy
-- allowing anyone to select by token: lookups go through the function below,
-- so the token cannot be brute-forced by querying this table.
drop policy if exists shares_select on public.plan_shares;
drop policy if exists shares_insert on public.plan_shares;
drop policy if exists shares_update on public.plan_shares;
drop policy if exists shares_delete on public.plan_shares;

create policy shares_select on public.plan_shares
  for select using (auth.uid() = user_id);
create policy shares_insert on public.plan_shares
  for insert with check (auth.uid() = user_id);
create policy shares_update on public.plan_shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy shares_delete on public.plan_shares
  for delete using (auth.uid() = user_id);

-- The only route a stranger has to a plan.
--
-- security definer runs as the owner, bypassing RLS, which is exactly why the
-- body is kept to one join and the return type carries no identifying columns.
-- search_path is pinned so the function cannot be redirected at a shadowed table.
create or replace function public.shared_plan(share_token uuid)
returns table (film_id integer, screening_idx integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.film_id, p.screening_idx
  from public.plan_items p
  join public.plan_shares s on s.user_id = p.user_id
  where s.token = share_token;
$$;

revoke all on function public.shared_plan(uuid) from public;
grant execute on function public.shared_plan(uuid) to anon, authenticated;
