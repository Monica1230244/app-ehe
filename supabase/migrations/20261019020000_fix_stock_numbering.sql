create or replace function public.set_modele_stock_reference()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_number bigint;
  reference_owner uuid;
begin
  reference_owner := new.revendeur_id;

  if nullif(btrim(new.reference), '') is null then
    perform pg_advisory_xact_lock(
      hashtextextended('modele-stock-reference:' || coalesce(reference_owner::text, 'global'), 0)
    );

    select coalesce(
      max((substring(reference from '^EHE-([0-9]+)$'))::bigint),
      0
    ) + 1
    into next_number
    from public.modeles_stock
    where revendeur_id = reference_owner;

    loop
      new.reference := 'EHE-' || lpad(next_number::text, 3, '0');

      exit when not exists (
        select 1
        from public.modeles_stock
        where revendeur_id = reference_owner
          and lower(reference) = lower(new.reference)
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

do $$
declare
  missing_model record;
  next_number bigint;
begin
  for missing_model in
    select id, revendeur_id
    from public.modeles_stock
    where nullif(btrim(reference), '') is null
    order by created_at, id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('modele-stock-reference:' || coalesce(missing_model.revendeur_id::text, 'global'), 0)
    );

    select coalesce(
      max((substring(reference from '^EHE-([0-9]+)$'))::bigint),
      0
    ) + 1
    into next_number
    from public.modeles_stock
    where revendeur_id = missing_model.revendeur_id;

    update public.modeles_stock
    set reference = 'EHE-' || lpad(next_number::text, 3, '0')
    where id = missing_model.id;
  end loop;
end;
$$;
