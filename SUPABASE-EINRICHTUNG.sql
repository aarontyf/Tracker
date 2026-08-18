-- Fitness Tracker V80: verschlüsselter Geräte-Sync
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
