-- Fitness Tracker V88: ausdrücklich aktivierbare, lesbare Momentaufnahme
-- für ChatGPT. Der bestehende tracker_sync bleibt unverändert verschlüsselt.

create table if not exists public.tracker_ai_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version = 1),
  payload jsonb not null,
  workout_count integer not null default 0 check (workout_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracker_ai_payload_shape check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'state'
    and jsonb_typeof(payload -> 'state') = 'object'
    and (payload -> 'state') ? 'workouts'
    and jsonb_typeof(payload -> 'state' -> 'workouts') = 'array'
    and not (payload ?| array['email', 'name', 'pin', 'syncKey', 'location'])
    and not ((payload -> 'state') ?| array['settings', 'profile'])
    and octet_length(payload::text) between 2 and 4000000
  )
);

comment on table public.tracker_ai_snapshots is
  'Opt-in Klartext-Momentaufnahme fuer read-only Fitness-Tracker-MCP; keine Geraete-Sync-Schluessel.';

alter table public.tracker_ai_snapshots enable row level security;
alter table public.tracker_ai_snapshots force row level security;

revoke all on table public.tracker_ai_snapshots from public, anon;
grant select, insert, update, delete on table public.tracker_ai_snapshots to authenticated;

-- Sowohl die normale App-Sitzung als auch ein OAuth-Client dürfen nur die
-- Zeile des angemeldeten Menschen sehen.
drop policy if exists "ai_snapshot_select_own" on public.tracker_ai_snapshots;
create policy "ai_snapshot_select_own"
on public.tracker_ai_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (
    coalesce((select auth.jwt() ->> 'client_id'), '') = ''
    or (
      (select auth.jwt() ->> 'aud') = 'https://fbvcslmulqxaxurcdyrv.supabase.co/functions/v1/gymtracker-mcp/mcp'
      and (select auth.jwt() ->> 'fitness_tracker_mcp') = 'true'
    )
  )
);

-- OAuth-Tokens tragen client_id. Damit kann ChatGPT niemals eine
-- Momentaufnahme anlegen, verändern oder löschen, selbst wenn ein Toolfehler
-- später versehentlich einen Schreibaufruf enthalten sollte.
drop policy if exists "ai_snapshot_insert_from_app" on public.tracker_ai_snapshots;
create policy "ai_snapshot_insert_from_app"
on public.tracker_ai_snapshots
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'client_id'), '') = ''
);

drop policy if exists "ai_snapshot_update_from_app" on public.tracker_ai_snapshots;
create policy "ai_snapshot_update_from_app"
on public.tracker_ai_snapshots
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'client_id'), '') = ''
)
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'client_id'), '') = ''
);

drop policy if exists "ai_snapshot_delete_from_app" on public.tracker_ai_snapshots;
create policy "ai_snapshot_delete_from_app"
on public.tracker_ai_snapshots
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'client_id'), '') = ''
);

create or replace function public.tracker_ai_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.tracker_ai_touch_updated_at() from public, anon, authenticated;

drop trigger if exists tracker_ai_touch_updated_at on public.tracker_ai_snapshots;
create trigger tracker_ai_touch_updated_at
before update on public.tracker_ai_snapshots
for each row execute function public.tracker_ai_touch_updated_at();

-- OpenAI bindet OAuth-Tokens an den konkreten MCP-Resource-Identifier.
-- Supabase verwendet ohne Hook fuer alle Sitzungen aud="authenticated".
-- Direkte App-Sitzungen bleiben so; nur OAuth-Tokens werden an diesen MCP
-- gebunden und erhalten das zusätzliche, in RLS geprüfte Nur-Lese-Merkmal.
create or replace function public.tracker_ai_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
  oauth_client_id text := coalesce(
    nullif(event ->> 'client_id', ''),
    nullif(claims ->> 'client_id', '')
  );
begin
  if oauth_client_id is not null then
    -- Supabase liefert client_id je nach Ausstellungs-/Refresh-Pfad im
    -- Hook-Ereignis oder bereits in den Claims. Im Token muss sie immer
    -- erhalten bleiben, weil Edge Function und RLS darauf schließen.
    claims := jsonb_set(claims, '{client_id}', to_jsonb(oauth_client_id), true);
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb('https://fbvcslmulqxaxurcdyrv.supabase.co/functions/v1/gymtracker-mcp/mcp'::text),
      true
    );
    claims := jsonb_set(claims, '{fitness_tracker_mcp}', 'true'::jsonb, true);
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

revoke execute on function public.tracker_ai_access_token_hook(jsonb)
from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.tracker_ai_access_token_hook(jsonb)
to supabase_auth_admin;
