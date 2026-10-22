create table funnel_counts (
  day text not null,
  event text not null,
  count integer not null,
  primary key (day, event)
);
alter table funnel_counts enable row level security;

do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table funnel_counts from %I', role_name);
    end if;
  end loop;
end $$;
