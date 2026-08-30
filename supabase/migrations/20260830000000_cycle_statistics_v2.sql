-- Fitness Tracker V92: A/B-Varianten und Statistik pro Sechs-Tage-Zyklus.
-- Bestehende V1-Snapshots bleiben lesbar; jede nächste Aktualisierung der
-- App hebt die eigene Zeile automatisch auf V2 an.

alter table public.tracker_ai_snapshots
  drop constraint if exists tracker_ai_snapshots_schema_version_check;

alter table public.tracker_ai_snapshots
  alter column schema_version set default 2;

alter table public.tracker_ai_snapshots
  add constraint tracker_ai_snapshots_schema_version_check
  check (schema_version in (1, 2));
