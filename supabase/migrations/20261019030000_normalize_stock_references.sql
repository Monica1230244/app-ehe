drop index if exists public.idx_modeles_stock_reference_unique;

update public.modeles_stock
set reference = '__EHE_RENUMBER__' || id::text;

do $$
declare
  stock_model record;
  next_number bigint := 0;
begin
  for stock_model in
    select id
    from public.modeles_stock
    order by created_at, id
  loop
    next_number := next_number + 1;

    update public.modeles_stock
    set reference = 'EHE-' || lpad(next_number::text, 3, '0')
    where id = stock_model.id;
  end loop;

  if next_number = 0 then
    perform setval('public.modele_stock_reference_seq', 1, false);
  else
    perform setval('public.modele_stock_reference_seq', next_number, true);
  end if;
end;
$$;

create unique index if not exists idx_modeles_stock_reference_unique
on public.modeles_stock(lower(reference))
where reference is not null;

create or replace function public.set_modele_stock_reference()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_number bigint;
begin
  if nullif(btrim(new.reference), '') is null then
    perform pg_advisory_xact_lock(
      hashtextextended('modele-stock-reference-global', 0)
    );

    select coalesce(
      max((substring(reference from '^EHE-([0-9]+)$'))::bigint),
      0
    ) + 1
    into next_number
    from public.modeles_stock;

    loop
      new.reference := 'EHE-' || lpad(next_number::text, 3, '0');

      exit when not exists (
        select 1
        from public.modeles_stock
        where lower(reference) = lower(new.reference)
      );

      next_number := next_number + 1;
    end loop;
  else
    new.reference := btrim(new.reference);
  end if;

  return new;
end;
$$;

drop trigger if exists set_modele_stock_reference on public.modeles_stock;
create trigger set_modele_stock_reference
before insert on public.modeles_stock
for each row execute function public.set_modele_stock_reference();

create or replace function public.get_next_modele_stock_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number bigint;
begin
  if not public.is_manager() then
    raise exception 'Accès refusé';
  end if;

  select coalesce(
    max((substring(reference from '^EHE-([0-9]+)$'))::bigint),
    0
  ) + 1
  into next_number
  from public.modeles_stock;

  return 'EHE-' || lpad(next_number::text, 3, '0');
end;
$$;

revoke execute on function public.get_next_modele_stock_reference() from public, anon;
grant execute on function public.get_next_modele_stock_reference() to authenticated;
