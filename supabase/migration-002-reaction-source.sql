-- Adds where a probe reaction came from.
--
-- "seen" means they watched the film; "trailer" means they watched the trailer
-- and went on the vibe. Both are stored, but a trailer impression is weighted at
-- about half in lib/scoring.ts. It is real signal, just weaker evidence, and
-- treating the two as equal would be the same mistake as probing with loglines.
--
-- Existing rows predate the distinction and were all "seen", which the default
-- backfills correctly. Safe to re-run.

alter table public.probe_answers
  add column if not exists source text not null default 'seen';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'probe_answers_source_check'
  ) then
    alter table public.probe_answers
      add constraint probe_answers_source_check check (source in ('seen', 'trailer'));
  end if;
end $$;
