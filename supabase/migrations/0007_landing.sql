-- Walt: landing pública (docs/LANDING.md §11 y §12).
-- 1. El plan que la agencia eligió en la landing, guardado como intención (todavía no se cobra).
-- 2. Eventos de conversión de la landing, sin datos personales: sin IP, sin mail, sin identificadores.
-- Se aplica a mano en el SQL Editor (la red solo deja salir el 443). Idempotente.

alter table factories add column if not exists plan_intent text;
alter table factories add column if not exists plan_cycle text;
alter table factories add column if not exists plan_intent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factories_plan_intent_check') then
    alter table factories add constraint factories_plan_intent_check
      check (plan_intent is null or plan_intent in ('freelancer', 'agencia', 'estudio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'factories_plan_cycle_check') then
    alter table factories add constraint factories_plan_cycle_check
      check (plan_cycle is null or plan_cycle in ('mensual', 'anual'));
  end if;
end;
$$;

create table if not exists landing_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('cta_click', 'calc_used', 'calc_shared', 'signup_started', 'signup_completed')),
  -- Solo etiquetas cortas (qué botón, qué sección, qué plan, el tramo del retorno). Nunca valores personales.
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1000)
);
create index if not exists landing_events_event_created on landing_events (event, created_at desc);

-- Solo la service role escribe y lee (la ruta /api/eventos del panel). Nadie más ve la tabla.
alter table landing_events enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on landing_events from anon';
    execute 'revoke all on sequence landing_events_id_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on landing_events from authenticated';
    execute 'revoke all on sequence landing_events_id_seq from authenticated';
  end if;
end;
$$;
