-- Dale: initial schema (SPEC §5).
-- All writes go through the service role (worker and panel server actions).
-- The anon key can only read: requests, events, messages, content_versions, approvals, quotes, projects, rules.
-- Pending for production: per-agency auth with RLS by factory_id.

create table factories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  assistant_name text not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factory_id uuid not null references factories(id) on delete cascade,
  name text not null,
  client_name text not null,
  repo_owner text not null,
  repo_name text not null,
  default_branch text not null default 'main',
  mode text not null default 'contenido' check (mode in ('contenido', 'codigo')),
  config_path text not null default 'dale.config.json',
  site_url text
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('cliente', 'agencia')),
  telegram_chat_id bigint not null unique
);

create table invites (
  token text primary key,
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  role text not null check (role in ('cliente', 'agencia')),
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz not null
);

create table rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  version int not null,
  policies jsonb not null,
  limits jsonb not null,
  created_by text not null default 'sistema',
  unique (project_id, version)
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  short_id text not null unique,
  project_id uuid not null references projects(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  raw_text text not null default '',
  status text not null default 'recibido' check (status in (
    'recibido', 'interpretando', 'respondido', 'cotizando', 'cotizado', 'esperando_cliente',
    'esperando_agencia', 'agente_trabajando', 'agente_listo', 'publicando', 'publicado', 'revertido',
    'rechazado', 'bloqueado', 'derivado', 'descartado', 'charla')),
  category text check (category in (
    'permitido', 'riesgoso', 'fuera_de_alcance', 'consulta', 'bloqueado', 'charla', 'derivado')),
  lane text check (lane in ('contenido', 'codigo')),
  confidence numeric,
  interpretation jsonb,
  ops jsonb,
  changes jsonb,
  gate jsonb,
  rules_version int,
  draft_version_id uuid,
  live_version_id uuid,
  parent_request_id uuid references requests(id) on delete set null,
  pr_url text,
  pr_number int,
  preview_url text,
  quote_id uuid,
  error text,
  cost_usd numeric not null default 0,
  usage jsonb
);
create index requests_project_created on requests (project_id, created_at desc);
create index requests_status on requests (status);

create table events (
  id bigserial primary key,
  request_id uuid not null references requests(id) on delete cascade,
  step text not null,
  status text not null check (status in ('inicio', 'ok', 'falla')),
  detail jsonb,
  duration_ms int,
  at timestamptz not null default now()
);
create index events_request on events (request_id, id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  contact_id uuid references contacts(id) on delete cascade,
  direction text not null check (direction in ('entrada', 'salida')),
  text text,
  media jsonb,
  at timestamptz not null default now()
);
create index messages_contact_at on messages (contact_id, at);
create index messages_request on messages (request_id);

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references projects(id) on delete cascade,
  request_id uuid references requests(id) on delete set null,
  parent_id uuid references content_versions(id) on delete set null,
  status text not null default 'borrador' check (status in ('borrador', 'viva', 'reemplazada', 'descartada')),
  content jsonb not null,
  git_commit_sha text,
  git_error text,
  published_at timestamptz
);
-- Only one live version per project.
create unique index content_versions_one_live on content_versions (project_id) where status = 'viva';
create index content_versions_project_created on content_versions (project_id, created_at desc);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  actor text not null check (actor in ('cliente', 'agencia')),
  decision text not null check (decision in ('aprobado', 'rechazado')),
  via text not null check (via in ('telegram', 'panel')),
  at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests(id) on delete cascade,
  title text not null,
  description text not null default '',
  amount_usd numeric not null default 0,
  eta_days int not null default 0,
  status text not null default 'borrador' check (status in ('borrador', 'enviado', 'aceptado', 'rechazado'))
);

create table commands (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in (
    'aprobar', 'rechazar', 'publicar', 'revertir', 'enviar_presupuesto', 'proponer', 'reintentar_commit')),
  request_id uuid references requests(id) on delete cascade,
  payload jsonb,
  status text not null default 'pendiente' check (status in ('pendiente', 'hecho', 'error')),
  error text,
  done_at timestamptz
);
create index commands_pending on commands (created_at) where status = 'pendiente';

create table processed_updates (
  update_id bigint primary key,
  at timestamptz not null default now()
);

-- Circular references, added once both tables exist.
alter table requests
  add constraint requests_draft_version_fk foreign key (draft_version_id) references content_versions(id) on delete set null,
  add constraint requests_live_version_fk foreign key (live_version_id) references content_versions(id) on delete set null,
  add constraint requests_quote_fk foreign key (quote_id) references quotes(id) on delete set null;

-- updated_at on requests.
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger requests_updated_at before update on requests
  for each row execute function set_updated_at();

-- Publishes a version atomically: the current live one becomes 'reemplazada', the new one 'viva'.
create function publish_version(p_project uuid, p_version uuid) returns void
language plpgsql as $$
declare
  v_project uuid;
begin
  select project_id into v_project from content_versions where id = p_version for update;
  if v_project is null then
    raise exception 'La versión % no existe', p_version;
  end if;
  if v_project <> p_project then
    raise exception 'La versión % no es del proyecto %', p_version, p_project;
  end if;
  update content_versions set status = 'reemplazada'
    where project_id = p_project and status = 'viva' and id <> p_version;
  update content_versions set status = 'viva', published_at = now()
    where id = p_version;
end;
$$;

-- Row level security: enabled everywhere; anon reads only what the panel and the site need.
alter table factories enable row level security;
alter table projects enable row level security;
alter table contacts enable row level security;
alter table invites enable row level security;
alter table rules enable row level security;
alter table requests enable row level security;
alter table events enable row level security;
alter table messages enable row level security;
alter table content_versions enable row level security;
alter table approvals enable row level security;
alter table quotes enable row level security;
alter table commands enable row level security;
alter table processed_updates enable row level security;

do $$
declare
  t text;
begin
  -- Supabase creates the anon role; plain Postgres (tests, CI) may not have it.
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  foreach t in array array['requests', 'events', 'messages', 'content_versions', 'approvals', 'quotes', 'projects', 'rules'] loop
    execute format('create policy %I on %I for select to anon using (true)', 'anon_read_' || t, t);
    execute format('grant select on %I to anon', t);
  end loop;
end;
$$;

-- Realtime for the panel and the site.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table requests, events, messages, content_versions, approvals, quotes;
  end if;
end;
$$;
