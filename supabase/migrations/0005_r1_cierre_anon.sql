-- Walt R1 (infra): la clave anon solo lee content_versions (lo que necesita el sitio).
-- Cierra la lectura pública de pedidos, mensajes, eventos, clientes, proyectos, reglas, presupuestos
-- y aprobaciones que daban 0001 y 0003.
--
-- Aplicar DESPUÉS de 0004 y cuando el panel ya use sesiones de Supabase Auth para el realtime: el
-- panel de hoy se suscribe con la anon a requests, events, messages, quotes, projects y clients, y
-- con esta migración deja de recibir esos cambios (las lecturas del servidor usan la service role y
-- siguen andando). `pnpm db:migrate --copy 0005`. Es idempotente.

do $$
declare
  t text;
begin
  foreach t in array array['requests', 'events', 'messages', 'approvals', 'quotes', 'projects', 'rules', 'clients'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on %I', 'anon_read_' || t, t);
    end if;
  end loop;
end $$;

-- Supabase le da todos los permisos de tabla a anon por defecto y la RLS es la única barrera: se
-- quitan también los permisos, salvo leer content_versions.
do $$
declare
  t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') loop
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
grant select on content_versions to anon;

-- Ninguna función de la API es para anon, salvo la vista previa del sitio (0006): sin ella el cliente
-- vería la versión viva en vez del cambio que tiene que aprobar. 0006 puede ir antes o después de esta.
revoke execute on all functions in schema public from anon;
do $$
begin
  if to_regprocedure('public.get_preview_version(uuid)') is not null then
    grant execute on function get_preview_version(uuid) to anon;
  end if;
end $$;

notify pgrst, 'reload schema';
