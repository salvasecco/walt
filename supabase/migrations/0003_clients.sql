-- Dale: client manager (clients, projects.client_id) and sample data flags.
-- Apply by hand in the Supabase SQL Editor (the network only allows HTTPS).

create table clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  factory_id uuid not null references factories(id) on delete cascade,
  name text not null,
  contact_name text,
  plan_name text not null default 'Básico',
  monthly_quota int not null default 20 check (monthly_quota >= 0),
  monthly_fee_usd numeric not null default 0 check (monthly_fee_usd >= 0),
  notes text not null default '',
  is_sample boolean not null default false
);
create index clients_factory on clients (factory_id);

alter table projects add column client_id uuid references clients(id) on delete set null;
alter table projects add column is_sample boolean not null default false;
alter table requests add column is_sample boolean not null default false;
create index projects_client on projects (client_id);

-- Same access as the other tables: the service role writes, anon only reads.
alter table clients enable row level security;
create policy anon_read_clients on clients for select to anon using (true);
grant select on clients to anon;

-- Realtime: the Atención board moves when a project or client changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table clients, projects;
  end if;
end;
$$;
