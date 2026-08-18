-- Fitness Tracker V81: verschlüsselter Geräte-Sync + 10 Wiederherstellungspunkte
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Der Publishable Key darf diese Tabelle danach nur über eine zufällige,
-- aus dem 256-Bit-Kopplungsschlüssel abgeleitete Kennung ansprechen.

create table if not exists public.tracker_sync (
  sync_id uuid primary key,
  payload text not null check (octet_length(payload) between 20 and 4000000),
  iv text not null check (char_length(iv) between 16 and 32),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.tracker_sync enable row level security;

revoke all on table public.tracker_sync from public, authenticated;
grant select, insert, update on table public.tracker_sync to anon;

drop policy if exists "sync_select_by_capability" on public.tracker_sync;
create policy "sync_select_by_capability"
on public.tracker_sync
for select
to anon
using (
  (select current_setting('request.headers', true)::jsonb ->> 'x-sync-id') = sync_id::text
);

drop policy if exists "sync_insert_by_capability" on public.tracker_sync;
create policy "sync_insert_by_capability"
on public.tracker_sync
for insert
to anon
with check (
  (select current_setting('request.headers', true)::jsonb ->> 'x-sync-id') = sync_id::text
);

drop policy if exists "sync_update_by_capability" on public.tracker_sync;
create policy "sync_update_by_capability"
on public.tracker_sync
for update
to anon
using (
  (select current_setting('request.headers', true)::jsonb ->> 'x-sync-id') = sync_id::text
)
with check (
  (select current_setting('request.headers', true)::jsonb ->> 'x-sync-id') = sync_id::text
);

-- Absichtlich keine DELETE-Freigabe: Ein verlorener Klick darf die einzige
-- Cloud-Kopie nicht physisch löschen. Ein leerer Tracker-Stand kann weiterhin
-- als neue verschlüsselte Revision gespeichert und lokal rückgängig gemacht werden.

-- Vor jedem Überschreiben wird die bisherige verschlüsselte Version archiviert.
-- Auch hier sieht Supabase nur Chiffretext; entschlüsseln kann ausschließlich
-- ein Gerät mit Aarons 256-Bit-Kopplungsschlüssel.
create table if not exists public.tracker_sync_history (
  sync_id uuid not null,
  revision bigint not null check (revision > 0),
  payload text not null check (octet_length(payload) between 20 and 4000000),
  iv text not null check (char_length(iv) between 16 and 32),
  source_updated_at timestamptz not null,
  archived_at timestamptz not null default now(),
  primary key (sync_id, revision)
);

alter table public.tracker_sync_history enable row level security;
revoke all on table public.tracker_sync_history from public, authenticated;
grant select on table public.tracker_sync_history to anon;

drop policy if exists "sync_history_select_by_capability" on public.tracker_sync_history;
create policy "sync_history_select_by_capability"
on public.tracker_sync_history
for select
to anon
using (
  (select current_setting('request.headers', true)::jsonb ->> 'x-sync-id') = sync_id::text
);

create or replace function public.tracker_sync_archive_previous()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tracker_sync_history
    (sync_id, revision, payload, iv, source_updated_at)
  values
    (old.sync_id, old.revision, old.payload, old.iv, old.updated_at)
  on conflict (sync_id, revision) do nothing;

  delete from public.tracker_sync_history h
  where h.sync_id = old.sync_id
    and h.revision not in (
      select revision from public.tracker_sync_history
      where sync_id = old.sync_id
      order by revision desc
      limit 10
    );
  return new;
end;
$$;

revoke all on function public.tracker_sync_archive_previous() from public, anon, authenticated;
drop trigger if exists tracker_sync_archive_before_update on public.tracker_sync;
create trigger tracker_sync_archive_before_update
before update on public.tracker_sync
for each row execute function public.tracker_sync_archive_previous();
