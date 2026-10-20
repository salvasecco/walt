-- Walt R1 (infra): la clave anon lee solo la versión viva de cada proyecto. Hasta ahora leía todas las
-- filas de content_versions (`using (true)`), o sea los borradores de todas las agencias. Las vistas
-- previas leen un borrador por su id con la RPC get_preview_version: el id es un uuid v4, no se adivina.
-- Además, el default de projects.config_path pasa de 'dale.config.json' (de 0001) a 'walt.config.json'.
--
-- `pnpm db:migrate --copy 0006` → SQL Editor → Run. Idempotente. Se puede aplicar con o sin 0004 y 0005.
-- El sitio (walt-demo, lib/supabase.ts) ya usa la RPC y, mientras no exista, lee la fila directo.

-- 1. Anon: solo la versión viva.
drop policy if exists anon_read_content_versions on content_versions;
drop policy if exists anon_read_live_content_versions on content_versions;
create policy anon_read_live_content_versions on content_versions for select to anon using (status = 'viva');
grant select on content_versions to anon;

-- 2. Vistas previas: una versión por id, cualquiera sea su estado.
create or replace function get_preview_version(p_id uuid)
returns table (id uuid, project_id uuid, status text, content jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.project_id, v.status, v.content from content_versions v where v.id = p_id;
$$;
revoke execute on function get_preview_version(uuid) from public;
grant execute on function get_preview_version(uuid) to anon, authenticated, service_role;

-- 3. El contrato de contenido de un repo se llama walt.config.json.
alter table projects alter column config_path set default 'walt.config.json';
update projects set config_path = 'walt.config.json' where config_path = 'dale.config.json';

notify pgrst, 'reload schema';
