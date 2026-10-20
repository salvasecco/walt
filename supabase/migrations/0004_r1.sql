-- Walt R1 (infra): taxonomía nueva, reglas por proyecto, reetiquetado, cola durable, idempotencia de
-- webhooks, locking optimista de versiones, multi-tenant con RLS, modos de IA, billetera y GitHub App.
--
-- Se pega a mano en Supabase → SQL Editor → Run (`pnpm db:migrate --copy 0004`). Es idempotente: si
-- algo falla a la mitad, se arregla y se vuelve a correr entera.
-- Es aditiva para el panel actual: la clave anon sigue leyendo lo mismo. El cierre de la anon está
-- aparte, en 0005, para aplicarlo cuando el panel use sesiones de Supabase Auth.
-- Ojo: cambia los valores de `requests.category` (ver la sección 1). El worker viejo sigue andando
-- gracias a un trigger de compatibilidad, pero conviene aplicarla junto con el worker nuevo.
-- Esquema documentado en docs/R1-CONTRATO.md, sección "Esquema 0004".

-- ─────────────────────────── 0. Extensiones, roles y auth ───────────────────────────

-- pg_trgm: similitud de textos para recuperar pedidos reetiquetados parecidos.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pg_trgm with schema extensions;
  else
    create extension if not exists pg_trgm;
  end if;
end $$;

-- Supabase ya tiene estos roles y el esquema auth. Postgres pelado (PGlite en las pruebas) no:
-- se crean con el mismo contrato (`auth.uid()` lee el `sub` del JWT del pedido).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(coalesce(
        current_setting('request.jwt.claim.sub', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      ), '')::uuid
    $f$;
    grant usage on schema auth to anon, authenticated, service_role;
  end if;
end $$;

-- ─────────────────────────── 1. Taxonomía (`requests.category`) ───────────────────────────
-- permitido → simple, riesgoso → delicado, fuera_de_alcance → nuevo (docs/R1-CONTRATO.md).

alter table requests drop constraint if exists requests_category_check;
-- Sin tocar updated_at: el panel ordena por cuánto hace que espera cada pedido.
alter table requests disable trigger requests_updated_at;
update requests set category = case category
    when 'permitido' then 'simple'
    when 'riesgoso' then 'delicado'
    when 'fuera_de_alcance' then 'nuevo'
  end
  where category in ('permitido', 'riesgoso', 'fuera_de_alcance');
alter table requests enable trigger requests_updated_at;
alter table requests add constraint requests_category_check
  check (category in ('consulta', 'simple', 'delicado', 'nuevo', 'bloqueado', 'charla', 'derivado'));

-- Compatibilidad: un worker viejo que todavía escribe las categorías de antes no falla, se traducen.
-- Se puede borrar cuando no quede ningún worker con la taxonomía vieja.
create or replace function requests_legacy_category() returns trigger language plpgsql as $$
begin
  new.category := case new.category
    when 'permitido' then 'simple'
    when 'riesgoso' then 'delicado'
    when 'fuera_de_alcance' then 'nuevo'
    else new.category
  end;
  return new;
end;
$$;
drop trigger if exists requests_legacy_category on requests;
create trigger requests_legacy_category before insert or update of category on requests
  for each row execute function requests_legacy_category();

-- ─────────────────────────── 2. Reglas por proyecto ───────────────────────────

-- Política en lenguaje natural de la agencia (entra al prompt de decisión).
alter table rules add column if not exists policy_text text not null default '';
-- `RulesConfig` de @walt/core: globs delicados/protegidos/simples, alwaysNew, template, priceWarnPct.
alter table rules add column if not exists config jsonb not null default '{}'::jsonb;

-- ─────────────────────────── 3. Reetiquetado ───────────────────────────

create table if not exists request_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests(id) on delete cascade,
  factory_id uuid not null references factories(id) on delete cascade,
  from_category text,
  to_category text not null check (to_category in ('consulta', 'simple', 'delicado', 'nuevo', 'bloqueado')),
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null
);
create index if not exists request_labels_factory on request_labels (factory_id, created_at desc);
create index if not exists request_labels_request on request_labels (request_id, created_at desc);
-- Trigramas sobre el texto del pedido: `%`, similarity() y orden por distancia (`<->`).
create index if not exists requests_raw_text_trgm on requests using gist (raw_text gist_trgm_ops);

-- Ejemplos reetiquetados de una agencia, del más parecido al menos parecido a `p_text`.
-- Última etiqueta de cada pedido. Security invoker: con la service role ve todo; con un usuario,
-- solo lo de sus agencias (RLS).
create or replace function similar_labeled_requests(p_factory uuid, p_text text, p_k int default 5)
returns table (
  request_id uuid,
  raw_text text,
  from_category text,
  to_category text,
  reason text,
  similarity real,
  labeled_at timestamptz
)
language sql stable set search_path = public, extensions as $$
  select x.request_id, x.raw_text, x.from_category, x.to_category, x.reason,
         similarity(x.raw_text, coalesce(p_text, '')) as similarity, x.created_at as labeled_at
  from (
    select distinct on (l.request_id) l.request_id, r.raw_text, l.from_category, l.to_category, l.reason, l.created_at
    from request_labels l
    join requests r on r.id = l.request_id
    where l.factory_id = p_factory and r.raw_text <> ''
    order by l.request_id, l.created_at desc
  ) x
  order by similarity(x.raw_text, coalesce(p_text, '')) desc, x.created_at desc
  limit greatest(least(coalesce(p_k, 5), 50), 0);
$$;

-- ─────────────────────────── 4. Helpers de pertenencia (multi-tenant) ───────────────────────────

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  factory_id uuid not null references factories(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  unique (user_id, factory_id)
);
create index if not exists memberships_factory on memberships (factory_id);

-- Security definer: leen memberships sin pasar por su RLS (si no, la política se llamaría a sí misma).
create or replace function is_member(p_factory uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.factory_id = p_factory and m.user_id = auth.uid());
$$;

create or replace function has_factory_role(p_factory uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m where m.factory_id = p_factory and m.user_id = auth.uid() and m.role = any(p_roles)
  );
$$;

create or replace function is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p join memberships m on m.factory_id = p.factory_id
    where p.id = p_project and m.user_id = auth.uid()
  );
$$;

create or replace function is_project_admin(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p join memberships m on m.factory_id = p.factory_id
    where p.id = p_project and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

create or replace function is_request_member(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from requests r join projects p on p.id = r.project_id join memberships m on m.factory_id = p.factory_id
    where r.id = p_request and m.user_id = auth.uid()
  );
$$;

create or replace function is_contact_member(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contacts c join projects p on p.id = c.project_id join memberships m on m.factory_id = p.factory_id
    where c.id = p_contact and m.user_id = auth.uid()
  );
$$;

-- Un comando es de un pedido o, si no tiene (`proponer`), del proyecto de `payload.project_id`.
create or replace function is_command_member(p_request uuid, p_payload jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_project uuid;
begin
  if p_request is not null then
    return is_request_member(p_request);
  end if;
  begin
    v_project := nullif(p_payload ->> 'project_id', '')::uuid;
  exception when others then
    return false;
  end;
  return v_project is not null and is_project_member(v_project);
end;
$$;

-- Alta de una agencia desde el onboarding: la crea y deja al usuario como dueño. Con sesión, el
-- dueño es el usuario; desde una acción de servidor (service role) se pasa `p_owner`.
create or replace function create_factory(p_name text, p_assistant_name text default null, p_owner uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(auth.uid(), p_owner);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta una sesión (o p_owner) para crear una agencia' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'La agencia necesita un nombre' using errcode = '22023';
  end if;
  insert into factories (name, assistant_name)
    values (trim(p_name), coalesce(nullif(trim(p_assistant_name), ''), 'el asistente de ' || trim(p_name)))
    returning id into v_id;
  insert into memberships (user_id, factory_id, role) values (v_uid, v_id, 'owner');
  return v_id;
end;
$$;

-- Reetiqueta un pedido: guarda de qué categoría a cuál, con el motivo. No toca `requests.category`
-- (queda la decisión original del sistema, para medir la precisión). Un usuario solo puede
-- reetiquetar pedidos de sus agencias; la service role (acciones de servidor) pasa `p_actor`.
create or replace function label_request(p_request uuid, p_to_category text, p_reason text default null, p_actor uuid default null)
returns request_labels
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req requests;
  v_factory uuid;
  v_row request_labels;
begin
  select * into v_req from requests where id = p_request;
  if not found then
    raise exception 'No existe el pedido %', p_request using errcode = 'P0002';
  end if;
  select factory_id into v_factory from projects where id = v_req.project_id;
  if v_uid is not null and not is_member(v_factory) then
    raise exception 'El pedido no es de tu agencia' using errcode = '42501';
  end if;
  insert into request_labels (request_id, factory_id, from_category, to_category, reason, actor_user_id)
    values (p_request, v_factory, v_req.category, p_to_category, nullif(trim(coalesce(p_reason, '')), ''), coalesce(v_uid, p_actor))
    returning * into v_row;
  return v_row;
end;
$$;

-- ─────────────────────────── 5. Cola durable ───────────────────────────
-- Un trabajo a la vez por proyecto y cola: `default` (pedidos, botones, comandos) y `agent` (el agente
-- de código, que tarda minutos y no frena los cambios simples del mismo proyecto).

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  queue text not null default 'default',
  payload jsonb not null default '{}'::jsonb,
  project_id uuid references projects(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  -- Idempotencia al encolar: un mismo update de Telegram, comando o pedido entra una sola vez.
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts >= 1),
  run_after timestamptz not null default now(),
  last_error text,
  -- Dead letter: se rindió (agotó los intentos o el error no se reintenta). Se reencola con retry_job.
  dead boolean not null default false,
  locked_at timestamptz,
  locked_by text,
  lease_until timestamptz,
  finished_at timestamptz
);
create unique index if not exists jobs_dedupe on jobs (dedupe_key);
create index if not exists jobs_pending on jobs (queue, project_id, created_at) where status = 'pending';
create index if not exists jobs_running on jobs (project_id, queue) where status = 'running';
create index if not exists jobs_request on jobs (request_id) where status in ('pending', 'running');
create index if not exists jobs_finished on jobs (finished_at) where status in ('done', 'failed');

-- Clave del advisory lock de un proyecto (y una cola o un uso). Los locks son de transacción: por
-- PostgREST cada RPC es una transacción y las conexiones se comparten, así que un lock de sesión no
-- sirve. El lock que dura todo un trabajo es el lease de `jobs`; este serializa adentro de las RPC.
create or replace function project_lock_key(p_project uuid, p_scope text default 'default') returns bigint
language sql immutable as $$
  select hashtextextended('walt:' || p_project::text || ':' || coalesce(p_scope, 'default'), 0);
$$;

-- Advisory lock de transacción por proyecto: lo usan claim_job, publish_version_v2 y la numeración de versiones.
create or replace function lock_project(p_project uuid, p_scope text default 'default') returns void
language sql volatile as $$
  select pg_advisory_xact_lock(project_lock_key(p_project, p_scope));
$$;

-- Encola (o devuelve el que ya estaba con la misma dedupe_key).
create or replace function enqueue_job(
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_project uuid default null,
  p_request uuid default null,
  p_queue text default 'default',
  p_dedupe_key text default null,
  p_run_after timestamptz default null,
  p_max_attempts int default 5
) returns table (id uuid, inserted boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into jobs (kind, payload, project_id, request_id, queue, dedupe_key, run_after, max_attempts)
    values (p_kind, coalesce(p_payload, '{}'::jsonb), p_project, p_request, coalesce(p_queue, 'default'), p_dedupe_key,
            coalesce(p_run_after, now()), greatest(coalesce(p_max_attempts, 5), 1))
    on conflict (dedupe_key) do nothing
    returning jobs.id into v_id;
  if v_id is not null then
    return query select v_id, true;
  else
    return query select j.id, false from jobs j where j.dedupe_key = p_dedupe_key;
  end if;
end;
$$;

-- Toma el próximo trabajo listo. Orden: el más viejo primero, y dentro de un proyecto en orden
-- estricto (si el primero espera su reintento, los de atrás esperan). Un proyecto con un trabajo
-- corriendo en esa cola no entrega otro. Un lease vencido (el worker se cayó) vuelve a la cola o,
-- si ya usó sus intentos, al dead letter.
create or replace function claim_job(p_worker text, p_queues text[] default array['default'], p_lease_seconds int default 120)
returns setof jobs
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v jobs;
begin
  update jobs set
      status = case when attempts >= max_attempts then 'failed' else 'pending' end,
      dead = attempts >= max_attempts,
      last_error = 'Se venció el lease: el worker se cayó o se colgó',
      locked_by = null,
      lease_until = null,
      run_after = now(),
      finished_at = case when attempts >= max_attempts then now() end
    where status = 'running' and lease_until < now() and queue = any(p_queues);

  for c in
    with heads as (
      select distinct on (j.project_id, j.queue) j.id, j.project_id, j.queue, j.run_after, j.created_at
      from jobs j
      where j.status = 'pending' and j.queue = any(p_queues) and j.project_id is not null
      order by j.project_id, j.queue, j.created_at
    ), free as (
      select j.id, j.project_id, j.queue, j.run_after, j.created_at
      from jobs j
      where j.status = 'pending' and j.queue = any(p_queues) and j.project_id is null
    )
    select x.id, x.project_id, x.queue from (select * from heads union all select * from free) x
    where x.run_after <= now()
    order by x.created_at
    limit 100
  loop
    if c.project_id is not null then
      -- Dos workers nunca eligen el mismo proyecto a la vez.
      if not pg_try_advisory_xact_lock(project_lock_key(c.project_id, 'queue:' || c.queue)) then
        continue;
      end if;
      if exists (select 1 from jobs r where r.project_id = c.project_id and r.queue = c.queue and r.status = 'running') then
        continue;
      end if;
    end if;
    perform 1 from jobs where jobs.id = c.id and status = 'pending' for update skip locked;
    if not found then
      continue;
    end if;
    update jobs set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = p_worker,
                    lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 5))
      where jobs.id = c.id
      returning * into v;
    return next v;
    return;
  end loop;
end;
$$;

-- El worker sigue vivo con el trabajo: estira el lease. False si ya no es suyo.
create or replace function heartbeat_job(p_id uuid, p_worker text, p_lease_seconds int default 120) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jobs set lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 5))
    where id = p_id and locked_by = p_worker and status = 'running';
  return found;
end;
$$;

create or replace function complete_job(p_id uuid, p_worker text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jobs set status = 'done', finished_at = now(), lease_until = null, last_error = null
    where id = p_id and locked_by = p_worker and status = 'running';
  return found;
end;
$$;

-- Falla con backoff exponencial (base · 2^(intento-1), con tope y ±25 % de jitter). Si agotó los
-- intentos o `p_retry` es false, pasa al dead letter.
create or replace function fail_job(
  p_id uuid,
  p_worker text,
  p_error text,
  p_retry boolean default true,
  p_base_seconds int default 5,
  p_max_backoff_seconds int default 600
) returns setof jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update jobs set
      last_error = left(coalesce(p_error, ''), 2000),
      locked_by = null,
      lease_until = null,
      dead = (not p_retry) or attempts >= max_attempts,
      status = case when (not p_retry) or attempts >= max_attempts then 'failed' else 'pending' end,
      finished_at = case when (not p_retry) or attempts >= max_attempts then now() end,
      run_after = now() + make_interval(secs =>
        least(p_max_backoff_seconds, p_base_seconds * power(2, greatest(attempts - 1, 0)))::double precision * (0.75 + random() * 0.5))
    where id = p_id and locked_by = p_worker and status = 'running'
    returning *;
end;
$$;

create or replace function dead_letter_job(p_id uuid, p_worker text, p_error text) returns setof jobs
language sql security definer set search_path = public as $$
  select * from fail_job(p_id, p_worker, p_error, false);
$$;

-- Reencola un trabajo del dead letter (desde el panel o a mano), con los intentos en cero.
create or replace function retry_job(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jobs set status = 'pending', dead = false, attempts = 0, run_after = now(), finished_at = null,
                  locked_by = null, lease_until = null
    where id = p_id and status = 'failed';
  return found;
end;
$$;

-- Estado de la cola para el health check y las métricas.
create or replace function jobs_summary() returns table (queue text, status text, total bigint, oldest timestamptz)
language sql stable security definer set search_path = public as $$
  select j.queue, j.status, count(*), min(j.created_at)
  from jobs j
  where j.status in ('pending', 'running') or (j.status = 'failed' and j.finished_at > now() - interval '7 days')
  group by j.queue, j.status;
$$;

-- Limpieza: trabajos terminados (7 días), dead letter (30) y updates procesados (30).
create or replace function purge_old_rows(p_done_days int default 7, p_dead_days int default 30, p_updates_days int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_done int;
  v_dead int;
  v_updates int;
begin
  delete from jobs where status = 'done' and finished_at < now() - make_interval(days => p_done_days);
  get diagnostics v_done = row_count;
  delete from jobs where status = 'failed' and finished_at < now() - make_interval(days => p_dead_days);
  get diagnostics v_dead = row_count;
  delete from processed_updates where at < now() - make_interval(days => p_updates_days);
  get diagnostics v_updates = row_count;
  return jsonb_build_object('jobs_done', v_done, 'jobs_dead', v_dead, 'processed_updates', v_updates);
end;
$$;

-- ─────────────────────────── 6. Idempotencia de webhooks ───────────────────────────
-- Telegram sigue usando `update_id`; WhatsApp y otros canales usan `key` (por ejemplo `wa:<id del mensaje>`).

alter table processed_updates add column if not exists key text;
alter table processed_updates add column if not exists source text not null default 'telegram';
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'processed_updates'::regclass and conname = 'processed_updates_pkey'
             and pg_get_constraintdef(oid) like 'PRIMARY KEY (update_id)%') then
    alter table processed_updates drop constraint processed_updates_pkey;
  end if;
end $$;
alter table processed_updates alter column update_id drop not null;
-- Índices únicos completos: sirven para `on conflict (update_id)` (el worker viejo) y `on conflict (key)`.
create unique index if not exists processed_updates_update_id on processed_updates (update_id);
create unique index if not exists processed_updates_key on processed_updates (key);
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'processed_updates'::regclass and attname = 'id' and not attisdropped) then
    alter table processed_updates add column id bigint generated by default as identity;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'processed_updates'::regclass and contype = 'p') then
    alter table processed_updates add constraint processed_updates_pkey primary key (id);
  end if;
end $$;
alter table processed_updates drop constraint if exists processed_updates_has_key;
alter table processed_updates add constraint processed_updates_has_key check (update_id is not null or key is not null);

-- ─────────────────────────── 7. Locking optimista de versiones ───────────────────────────

-- Número de versión por proyecto (1, 2, 3…), asignado al insertar.
alter table content_versions add column if not exists version int;
-- Clave de idempotencia de una publicación (por ejemplo `publish:<pedido>`): la misma clave no publica dos veces.
alter table content_versions add column if not exists publish_key text;
update content_versions cv set version = s.n
  from (select id, row_number() over (partition by project_id order by created_at, id) as n from content_versions) s
  where s.id = cv.id and cv.version is null;
create unique index if not exists content_versions_project_version on content_versions (project_id, version);
create unique index if not exists content_versions_publish_key on content_versions (publish_key);

create or replace function content_versions_assign_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.version is null then
    perform pg_advisory_xact_lock(project_lock_key(new.project_id, 'versions'));
    select coalesce(max(version), 0) + 1 into new.version from content_versions where project_id = new.project_id;
  end if;
  return new;
end;
$$;
drop trigger if exists content_versions_version on content_versions;
create trigger content_versions_version before insert on content_versions
  for each row execute function content_versions_assign_version();

-- Publica con locking optimista. La versión tiene que ser un borrador hecho sobre la viva actual
-- (`p_expected_live`, o su `parent_id` si no se pasa): si la viva cambió, falla con 40001 en vez de
-- pisar otro cambio. Publicar una versión que ya está viva, o repetir `p_key`, no hace nada
-- (`already: true`). `publish_version` (v1) queda igual hasta que no quede ningún worker viejo.
create or replace function publish_version_v2(p_project uuid, p_version uuid, p_expected_live uuid default null, p_key text default null)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v content_versions;
  v_live content_versions;
  v_expected uuid;
begin
  perform lock_project(p_project, 'publish');
  if p_key is not null then
    select * into v from content_versions where publish_key = p_key;
    if found then
      return jsonb_build_object('version_id', v.id, 'version', v.version, 'already', true);
    end if;
  end if;
  select * into v from content_versions where id = p_version for update;
  if not found then
    raise exception 'La versión % no existe', p_version using errcode = 'P0002';
  end if;
  if v.project_id <> p_project then
    raise exception 'La versión % no es del proyecto %', p_version, p_project using errcode = '22023';
  end if;
  if v.status = 'viva' then
    return jsonb_build_object('version_id', v.id, 'version', v.version, 'already', true);
  end if;
  if v.status <> 'borrador' then
    raise exception 'La versión % está %: solo se publica un borrador', p_version, v.status using errcode = '55000';
  end if;
  select * into v_live from content_versions where project_id = p_project and status = 'viva' for update;
  v_expected := coalesce(p_expected_live, v.parent_id);
  if v_expected is not null and v_live.id is distinct from v_expected then
    raise exception 'Conflicto de versión: la versión viva del proyecto % cambió', p_project using errcode = '40001';
  end if;
  update content_versions set status = 'reemplazada' where project_id = p_project and status = 'viva' and id <> p_version;
  update content_versions set status = 'viva', published_at = now(), publish_key = coalesce(p_key, publish_key) where id = p_version;
  return jsonb_build_object('version_id', v.id, 'version', v.version, 'already', false, 'replaced', v_live.id);
end;
$$;

-- ─────────────────────────── 8. Modos de IA, billetera y uso ───────────────────────────

-- Modo de IA por agencia (project_id null) o por proyecto (pisa al de la agencia). Sin fila: la
-- clave de Walt, como hasta ahora (modo `platform` en el ledger).
create table if not exists ai_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  factory_id uuid not null references factories(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  mode text not null check (mode in ('byok', 'credits', 'claude_code')),
  -- BYOK: id del secreto en Supabase Vault (nunca la clave) y sus últimos 4 caracteres para mostrar.
  secret_id uuid,
  key_hint text,
  key_validated_at timestamptz,
  -- Topes en USD (null = sin tope) y alerta al llegar a este porcentaje del tope del mes.
  monthly_cap_usd numeric(12, 2) check (monthly_cap_usd is null or monthly_cap_usd >= 0),
  request_cap_usd numeric(12, 2) check (request_cap_usd is null or request_cap_usd >= 0),
  alert_pct int not null default 80 check (alert_pct between 1 and 100),
  -- Ruteo de modelos (null = los de Walt): uno barato para clasificar y uno fuerte para código.
  model_classify text,
  model_code text,
  unique nulls not distinct (factory_id, project_id)
);
drop trigger if exists ai_settings_updated_at on ai_settings;
create trigger ai_settings_updated_at before update on ai_settings for each row execute function set_updated_at();

create table if not exists wallets (
  factory_id uuid primary key references factories(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  balance_usd numeric(12, 4) not null default 0,
  -- Margen sobre el costo del modelo en modo créditos (provisorio, lo decide Salva).
  markup_pct numeric(6, 2) not null default 30 check (markup_pct >= 0),
  low_balance_usd numeric(12, 2) not null default 5 check (low_balance_usd >= 0),
  auto_recharge boolean not null default false,
  auto_recharge_usd numeric(12, 2) check (auto_recharge_usd is null or auto_recharge_usd > 0)
);
drop trigger if exists wallets_updated_at on wallets;
create trigger wallets_updated_at before update on wallets for each row execute function set_updated_at();

-- Cada llamada al modelo (y cada recarga) deja una fila. `cost_usd` es lo que cuesta según la tabla
-- de precios; `price_usd`, lo que se le cobra a la agencia; `wallet_delta_usd`, cuánto movió la billetera.
create table if not exists usage_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factory_id uuid not null references factories(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  kind text not null default 'ai' check (kind in ('ai', 'agent', 'recharge', 'adjustment')),
  mode text not null check (mode in ('platform', 'byok', 'credits', 'claude_code')),
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  price_usd numeric(12, 6) not null default 0,
  wallet_delta_usd numeric(12, 6) not null default 0,
  balance_after_usd numeric(12, 4),
  -- Idempotencia de recargas (id del evento de Stripe o Mercado Pago).
  reference text,
  detail jsonb
);
create index if not exists usage_ledger_factory on usage_ledger (factory_id, created_at desc);
create index if not exists usage_ledger_request on usage_ledger (request_id);
create unique index if not exists usage_ledger_reference on usage_ledger (reference);

-- Registra un uso. En modo créditos descuenta `p_price_usd` de la billetera en la misma transacción
-- (puede quedar negativa: el trabajo ya se hizo; el chequeo de saldo es antes de correr).
create or replace function record_usage(
  p_factory uuid,
  p_project uuid,
  p_request uuid,
  p_kind text,
  p_mode text,
  p_model text,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_read_tokens int,
  p_cache_write_tokens int,
  p_cost_usd numeric,
  p_price_usd numeric,
  p_detail jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric := 0;
  v_balance numeric;
  v_id uuid;
begin
  if p_mode = 'credits' and coalesce(p_price_usd, 0) > 0 then
    v_delta := -p_price_usd;
    insert into wallets (factory_id) values (p_factory) on conflict (factory_id) do nothing;
    update wallets set balance_usd = balance_usd + v_delta where factory_id = p_factory returning balance_usd into v_balance;
  else
    select balance_usd into v_balance from wallets where factory_id = p_factory;
  end if;
  insert into usage_ledger (factory_id, project_id, request_id, kind, mode, model, input_tokens, output_tokens,
                            cache_read_tokens, cache_write_tokens, cost_usd, price_usd, wallet_delta_usd, balance_after_usd, detail)
    values (p_factory, p_project, p_request, coalesce(p_kind, 'ai'), p_mode, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
            coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0), coalesce(p_cost_usd, 0), coalesce(p_price_usd, 0),
            v_delta, v_balance, p_detail)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'balance_usd', v_balance, 'wallet_delta_usd', v_delta);
end;
$$;

-- Recarga (o ajuste) idempotente por `p_reference`.
create or replace function credit_wallet(p_factory uuid, p_amount_usd numeric, p_reference text, p_kind text default 'recharge', p_detail jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_id uuid;
begin
  if p_reference is not null and exists (select 1 from usage_ledger where reference = p_reference) then
    select balance_usd into v_balance from wallets where factory_id = p_factory;
    return jsonb_build_object('already', true, 'balance_usd', v_balance);
  end if;
  insert into wallets (factory_id) values (p_factory) on conflict (factory_id) do nothing;
  update wallets set balance_usd = balance_usd + p_amount_usd where factory_id = p_factory returning balance_usd into v_balance;
  insert into usage_ledger (factory_id, kind, mode, wallet_delta_usd, balance_after_usd, reference, detail)
    values (p_factory, coalesce(p_kind, 'recharge'), 'credits', p_amount_usd, v_balance, p_reference, p_detail)
    returning id into v_id;
  return jsonb_build_object('already', false, 'id', v_id, 'balance_usd', v_balance);
end;
$$;

-- Gasto desde una fecha (para los topes y el panel): por agencia y, si se pasa, por proyecto.
create or replace function usage_since(p_factory uuid, p_since timestamptz, p_project uuid default null)
returns table (cost_usd numeric, price_usd numeric, calls bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(u.cost_usd), 0), coalesce(sum(u.price_usd), 0), count(*)
  from usage_ledger u
  where u.factory_id = p_factory and u.created_at >= p_since and u.kind in ('ai', 'agent')
    and (p_project is null or u.project_id = p_project);
$$;

-- BYOK: guarda la clave de Anthropic de la agencia en Supabase Vault (cifrada en reposo) y deja en
-- ai_settings solo el id del secreto y los últimos 4 caracteres. La valida antes quien la llama
-- (una llamada barata a la API); nunca se loguea. Solo la service role puede llamarla.
create or replace function set_ai_key(p_factory uuid, p_project uuid, p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  if coalesce(length(trim(p_key)), 0) < 20 then
    raise exception 'La clave no parece una clave de API' using errcode = '22023';
  end if;
  select secret_id into v_secret from ai_settings where factory_id = p_factory and project_id is not distinct from p_project;
  if v_secret is not null and exists (select 1 from vault.secrets where id = v_secret) then
    perform vault.update_secret(v_secret, trim(p_key));
  else
    v_secret := vault.create_secret(
      trim(p_key),
      'walt_ai_key_' || p_factory::text || coalesce('_' || p_project::text, '') || '_' || gen_random_uuid()::text,
      'Clave de Anthropic de una agencia (BYOK)'
    );
  end if;
  insert into ai_settings (factory_id, project_id, mode, secret_id, key_hint, key_validated_at)
    values (p_factory, p_project, 'byok', v_secret, right(trim(p_key), 4), now())
    on conflict (factory_id, project_id) do update
      set mode = 'byok', secret_id = excluded.secret_id, key_hint = excluded.key_hint, key_validated_at = excluded.key_validated_at;
  return v_secret;
end;
$$;

-- La clave descifrada para el worker: primero la del proyecto, si no la de la agencia.
create or replace function get_ai_key(p_factory uuid, p_project uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_secret uuid;
  v_key text;
begin
  select s.secret_id into v_secret from ai_settings s
    where s.factory_id = p_factory and s.secret_id is not null and (s.project_id = p_project or s.project_id is null)
    order by s.project_id nulls last
    limit 1;
  if v_secret is null then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  return v_key;
end;
$$;

-- Borra la clave (del Vault y de ai_settings). El modo queda como estaba: sin clave, BYOK no corre.
create or replace function clear_ai_key(p_factory uuid, p_project uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  select secret_id into v_secret from ai_settings where factory_id = p_factory and project_id is not distinct from p_project;
  if v_secret is null then
    return false;
  end if;
  begin
    delete from vault.secrets where id = v_secret;
  exception when insufficient_privilege then
    -- Si el Vault no deja borrar, se pisa el secreto: la clave deja de existir igual.
    perform vault.update_secret(v_secret, 'borrada-' || gen_random_uuid()::text);
  end;
  update ai_settings set secret_id = null, key_hint = null, key_validated_at = null
    where factory_id = p_factory and project_id is not distinct from p_project;
  return true;
end;
$$;

-- ─────────────────────────── 9. GitHub App ───────────────────────────
-- Instalaciones de la GitHub App de Walt por agencia. Solo las escribe el servidor después de verificar
-- con GitHub que el usuario tiene acceso a esa instalación (si no, una agencia podría reclamar la de otra).

create table if not exists github_installations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factory_id uuid not null references factories(id) on delete cascade,
  installation_id bigint not null unique,
  account_login text not null,
  account_type text check (account_type in ('User', 'Organization')),
  suspended_at timestamptz
);
create index if not exists github_installations_factory on github_installations (factory_id, lower(account_login));

-- ─────────────────────────── 10. RLS por agencia para `authenticated` ───────────────────────────
-- El worker y las acciones de servidor usan la service role (sin RLS). Un usuario del panel con sesión
-- de Supabase Auth ve y toca solo lo de sus agencias. Roles: owner (todo, incluido el equipo),
-- admin (proyectos, clientes, reglas, contactos y equipo salvo dueños), member (el día a día: comandos,
-- reetiquetas, presupuestos e invitaciones).

alter table request_labels enable row level security;
alter table memberships enable row level security;
alter table jobs enable row level security;
alter table ai_settings enable row level security;
alter table wallets enable row level security;
alter table usage_ledger enable row level security;
alter table github_installations enable row level security;
do $$
begin
  if to_regclass('public.clients') is not null then
    execute 'alter table clients enable row level security';
  end if;
end $$;

-- Lectura para miembros en todas las tablas con dueño.
drop policy if exists member_read_factories on factories;
create policy member_read_factories on factories for select to authenticated using (is_member(id));
drop policy if exists admin_update_factories on factories;
create policy admin_update_factories on factories for update to authenticated
  using (has_factory_role(id, array['owner', 'admin'])) with check (has_factory_role(id, array['owner', 'admin']));

drop policy if exists member_read_projects on projects;
create policy member_read_projects on projects for select to authenticated using (is_member(factory_id));
drop policy if exists admin_insert_projects on projects;
create policy admin_insert_projects on projects for insert to authenticated with check (has_factory_role(factory_id, array['owner', 'admin']));
drop policy if exists admin_update_projects on projects;
create policy admin_update_projects on projects for update to authenticated
  using (has_factory_role(factory_id, array['owner', 'admin'])) with check (has_factory_role(factory_id, array['owner', 'admin']));
drop policy if exists admin_delete_projects on projects;
create policy admin_delete_projects on projects for delete to authenticated using (has_factory_role(factory_id, array['owner', 'admin']));

do $$
begin
  if to_regclass('public.clients') is not null then
    execute 'drop policy if exists member_read_clients on clients';
    execute 'create policy member_read_clients on clients for select to authenticated using (is_member(factory_id))';
    execute 'drop policy if exists admin_write_clients on clients';
    execute $p$create policy admin_write_clients on clients for all to authenticated
      using (has_factory_role(factory_id, array['owner', 'admin'])) with check (has_factory_role(factory_id, array['owner', 'admin']))$p$;
    execute 'grant select, insert, update, delete on clients to authenticated';
  end if;
end $$;

drop policy if exists member_read_contacts on contacts;
create policy member_read_contacts on contacts for select to authenticated using (is_project_member(project_id));
drop policy if exists admin_write_contacts on contacts;
create policy admin_write_contacts on contacts for all to authenticated
  using (is_project_admin(project_id)) with check (is_project_admin(project_id));

drop policy if exists member_read_invites on invites;
create policy member_read_invites on invites for select to authenticated using (is_project_member(project_id));
drop policy if exists member_insert_invites on invites;
create policy member_insert_invites on invites for insert to authenticated with check (is_project_member(project_id));
drop policy if exists member_delete_invites on invites;
create policy member_delete_invites on invites for delete to authenticated using (is_project_member(project_id));

drop policy if exists member_read_rules on rules;
create policy member_read_rules on rules for select to authenticated using (is_project_member(project_id));
drop policy if exists admin_insert_rules on rules;
create policy admin_insert_rules on rules for insert to authenticated with check (is_project_admin(project_id));

drop policy if exists member_read_requests on requests;
create policy member_read_requests on requests for select to authenticated using (is_project_member(project_id));

drop policy if exists member_read_events on events;
create policy member_read_events on events for select to authenticated using (is_request_member(request_id));

drop policy if exists member_read_messages on messages;
create policy member_read_messages on messages for select to authenticated
  using ((request_id is not null and is_request_member(request_id)) or (contact_id is not null and is_contact_member(contact_id)));

drop policy if exists member_read_content_versions on content_versions;
create policy member_read_content_versions on content_versions for select to authenticated using (is_project_member(project_id));

drop policy if exists member_read_approvals on approvals;
create policy member_read_approvals on approvals for select to authenticated using (is_request_member(request_id));

drop policy if exists member_read_quotes on quotes;
create policy member_read_quotes on quotes for select to authenticated using (is_request_member(request_id));
drop policy if exists member_update_quotes on quotes;
create policy member_update_quotes on quotes for update to authenticated
  using (is_request_member(request_id)) with check (is_request_member(request_id));

drop policy if exists member_read_commands on commands;
create policy member_read_commands on commands for select to authenticated using (is_command_member(request_id, payload));
drop policy if exists member_insert_commands on commands;
create policy member_insert_commands on commands for insert to authenticated with check (is_command_member(request_id, payload));

drop policy if exists member_read_request_labels on request_labels;
create policy member_read_request_labels on request_labels for select to authenticated using (is_member(factory_id));
drop policy if exists member_insert_request_labels on request_labels;
create policy member_insert_request_labels on request_labels for insert to authenticated
  with check (
    is_member(factory_id)
    and actor_user_id = auth.uid()
    and factory_id = (select p.factory_id from requests r join projects p on p.id = r.project_id where r.id = request_id)
  );

drop policy if exists member_read_jobs on jobs;
create policy member_read_jobs on jobs for select to authenticated using (project_id is not null and is_project_member(project_id));

drop policy if exists member_read_memberships on memberships;
create policy member_read_memberships on memberships for select to authenticated using (user_id = auth.uid() or is_member(factory_id));
drop policy if exists admin_write_memberships on memberships;
create policy admin_write_memberships on memberships for all to authenticated
  using (has_factory_role(factory_id, array['owner']) or (has_factory_role(factory_id, array['admin']) and role <> 'owner'))
  with check (has_factory_role(factory_id, array['owner']) or (has_factory_role(factory_id, array['admin']) and role <> 'owner'));

-- La configuración de IA se lee desde el panel; se escribe por la service role (la clave, solo por set_ai_key).
drop policy if exists member_read_ai_settings on ai_settings;
create policy member_read_ai_settings on ai_settings for select to authenticated using (is_member(factory_id));
drop policy if exists member_read_wallets on wallets;
create policy member_read_wallets on wallets for select to authenticated using (is_member(factory_id));
drop policy if exists member_read_usage_ledger on usage_ledger;
create policy member_read_usage_ledger on usage_ledger for select to authenticated using (is_member(factory_id));
drop policy if exists member_read_github_installations on github_installations;
create policy member_read_github_installations on github_installations for select to authenticated using (is_member(factory_id));

-- processed_updates: sin políticas para usuarios; solo la service role.

-- Permisos de tabla (Supabase ya los da por defecto; en Postgres pelado hacen falta). La RLS decide las filas.
grant usage on schema public to authenticated, service_role;
grant select on factories, projects, contacts, invites, rules, requests, events, messages, content_versions,
  approvals, quotes, commands, request_labels, jobs, memberships, ai_settings, wallets, usage_ledger, github_installations
  to authenticated;
grant update on factories, quotes to authenticated;
grant insert, update, delete on projects, contacts, memberships to authenticated;
grant insert, delete on invites to authenticated;
grant insert on rules, commands, request_labels to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ─────────────────────────── 11. Quién ejecuta cada función ───────────────────────────
-- Supabase da EXECUTE a anon y authenticated en toda función nueva: se cierra y se abre lo justo.

revoke execute on function similar_labeled_requests(uuid, text, int) from public, anon;
grant execute on function similar_labeled_requests(uuid, text, int) to authenticated, service_role;

revoke execute on function is_member(uuid), has_factory_role(uuid, text[]), is_project_member(uuid), is_project_admin(uuid),
  is_request_member(uuid), is_contact_member(uuid), is_command_member(uuid, jsonb) from public, anon;
grant execute on function is_member(uuid), has_factory_role(uuid, text[]), is_project_member(uuid), is_project_admin(uuid),
  is_request_member(uuid), is_contact_member(uuid), is_command_member(uuid, jsonb) to authenticated, service_role;

revoke execute on function create_factory(text, text, uuid) from public, anon;
grant execute on function create_factory(text, text, uuid) to authenticated, service_role;

revoke execute on function label_request(uuid, text, text, uuid) from public, anon;
grant execute on function label_request(uuid, text, text, uuid) to authenticated, service_role;

-- Solo el worker (service role): cola, publicación, billetera y claves.
revoke execute on function
  lock_project(uuid, text),
  enqueue_job(text, jsonb, uuid, uuid, text, text, timestamptz, int),
  claim_job(text, text[], int),
  heartbeat_job(uuid, text, int),
  complete_job(uuid, text),
  fail_job(uuid, text, text, boolean, int, int),
  dead_letter_job(uuid, text, text),
  retry_job(uuid),
  jobs_summary(),
  purge_old_rows(int, int, int),
  publish_version_v2(uuid, uuid, uuid, text),
  record_usage(uuid, uuid, uuid, text, text, text, int, int, int, int, numeric, numeric, jsonb),
  credit_wallet(uuid, numeric, text, text, jsonb),
  usage_since(uuid, timestamptz, uuid),
  set_ai_key(uuid, uuid, text),
  get_ai_key(uuid, uuid),
  clear_ai_key(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  lock_project(uuid, text),
  enqueue_job(text, jsonb, uuid, uuid, text, text, timestamptz, int),
  claim_job(text, text[], int),
  heartbeat_job(uuid, text, int),
  complete_job(uuid, text),
  fail_job(uuid, text, text, boolean, int, int),
  dead_letter_job(uuid, text, text),
  retry_job(uuid),
  jobs_summary(),
  purge_old_rows(int, int, int),
  publish_version_v2(uuid, uuid, uuid, text),
  record_usage(uuid, uuid, uuid, text, text, text, int, int, int, int, numeric, numeric, jsonb),
  credit_wallet(uuid, numeric, text, text, jsonb),
  usage_since(uuid, timestamptz, uuid),
  set_ai_key(uuid, uuid, text),
  get_ai_key(uuid, uuid),
  clear_ai_key(uuid, uuid)
  to service_role;

-- PostgREST: que vea las tablas y funciones nuevas sin reiniciar.
notify pgrst, 'reload schema';
