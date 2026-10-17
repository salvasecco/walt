-- publish_version only runs with the service role (worker). Anon and authenticated cannot call it.
revoke execute on function publish_version(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function publish_version(uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function publish_version(uuid, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function publish_version(uuid, uuid) to service_role';
  end if;
end $$;
