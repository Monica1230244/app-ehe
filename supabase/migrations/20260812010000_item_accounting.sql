create table if not exists public.commande_article_comptabilite (
  article_id bigint primary key references public.commande_articles(id) on delete cascade,
  commande_id bigint not null references public.commandes(id) on delete cascade,
  revendeur_id uuid not null references public.profiles(id) on delete restrict,
  prix_cordonnier_unitaire numeric(14, 2) not null check (prix_cordonnier_unitaire >= 0),
  prix_vente_unitaire numeric(14, 2) not null check (prix_vente_unitaire >= 0),
  benefice_unitaire numeric(14, 2) generated always as (prix_vente_unitaire - prix_cordonnier_unitaire) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commande_article_comptabilite_commande
on public.commande_article_comptabilite(commande_id);

create index if not exists idx_commande_article_comptabilite_revendeur
on public.commande_article_comptabilite(revendeur_id);

create or replace function public.prepare_commande_article_comptabilite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  article_order_id bigint;
  order_owner uuid;
begin
  select commande_articles.commande_id, commandes.revendeur_id
  into article_order_id, order_owner
  from public.commande_articles
  join public.commandes on commandes.id = commande_articles.commande_id
  where commande_articles.id = new.article_id;

  if not found then
    raise exception 'Article de commande introuvable';
  end if;

  if auth.uid() is null or (
    order_owner is distinct from auth.uid()
    and public.current_user_role() is distinct from 'admin'
  ) then
    raise exception 'Accès refusé à la comptabilité de cette commande';
  end if;

  new.commande_id := article_order_id;
  new.revendeur_id := order_owner;
  return new;
end;
$$;

drop trigger if exists prepare_commande_article_comptabilite on public.commande_article_comptabilite;

drop trigger if exists commande_article_comptabilite_updated_at on public.commande_article_comptabilite;
create trigger commande_article_comptabilite_updated_at
before update on public.commande_article_comptabilite
for each row execute function public.update_updated_at();

create or replace function public.refresh_commande_comptabilite(p_commande_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  total_cost numeric(14, 2);
  total_sale numeric(14, 2);
begin
  select revendeur_id into order_owner
  from public.commandes
  where id = p_commande_id;

  if order_owner is null then
    return;
  end if;

  select
    sum(accounting.prix_cordonnier_unitaire * articles.quantite),
    sum(accounting.prix_vente_unitaire * articles.quantite)
  into total_cost, total_sale
  from public.commande_article_comptabilite accounting
  join public.commande_articles articles on articles.id = accounting.article_id
  where accounting.commande_id = p_commande_id;

  if total_cost is null then
    delete from public.commande_comptabilite where commande_id = p_commande_id;
    return;
  end if;

  insert into public.commande_comptabilite (
    commande_id,
    revendeur_id,
    prix_cordonnier,
    prix_vente
  ) values (
    p_commande_id,
    order_owner,
    total_cost,
    total_sale
  )
  on conflict (commande_id) do update
  set prix_cordonnier = excluded.prix_cordonnier,
      prix_vente = excluded.prix_vente,
      updated_at = now();
end;
$$;

create or replace function public.sync_commande_article_comptabilite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_commande_comptabilite(coalesce(new.commande_id, old.commande_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_commande_article_comptabilite on public.commande_article_comptabilite;

insert into public.commande_article_comptabilite (
  article_id,
  commande_id,
  revendeur_id,
  prix_cordonnier_unitaire,
  prix_vente_unitaire
)
select
  articles.id,
  articles.commande_id,
  accounting.revendeur_id,
  accounting.prix_cordonnier / nullif(commandes.quantite, 0),
  accounting.prix_vente / nullif(commandes.quantite, 0)
from public.commande_articles articles
join public.commandes commandes on commandes.id = articles.commande_id
join public.commande_comptabilite accounting on accounting.commande_id = articles.commande_id
where not exists (
  select 1
  from public.commande_article_comptabilite existing
  where existing.article_id = articles.id
);

create trigger prepare_commande_article_comptabilite
before insert or update on public.commande_article_comptabilite
for each row execute function public.prepare_commande_article_comptabilite();

create trigger sync_commande_article_comptabilite
after insert or update or delete on public.commande_article_comptabilite
for each row execute function public.sync_commande_article_comptabilite();

alter table public.commande_article_comptabilite enable row level security;

drop policy if exists commande_article_comptabilite_select on public.commande_article_comptabilite;
create policy commande_article_comptabilite_select on public.commande_article_comptabilite
for select to authenticated
using (revendeur_id = auth.uid() or public.current_user_role() = 'admin');

grant select on public.commande_article_comptabilite to authenticated;
revoke insert, update, delete on public.commande_article_comptabilite from authenticated;

create or replace function public.save_commande_article_comptabilite(
  p_commande_id bigint,
  p_lignes jsonb
)
returns public.commande_comptabilite
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.commandes%rowtype;
  line jsonb;
  article_id_value bigint;
  cost_value numeric(14, 2);
  sale_value numeric(14, 2);
  line_count integer;
  article_count integer;
  saved_accounting public.commande_comptabilite%rowtype;
begin
  select * into current_order
  from public.commandes
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  if auth.uid() is null
    or not public.is_manager()
    or (public.current_user_role() <> 'admin' and current_order.revendeur_id is distinct from auth.uid()) then
    raise exception 'Accès refusé';
  end if;

  if jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Les montants sont invalides';
  end if;

  line_count := jsonb_array_length(p_lignes);
  select count(*) into article_count
  from public.commande_articles
  where commande_id = p_commande_id;

  if line_count <> article_count or line_count < 1 then
    raise exception 'Renseignez les montants de toutes les variantes';
  end if;

  if (
    select count(distinct (value ->> 'article_id')::bigint)
    from jsonb_array_elements(p_lignes)
  ) <> article_count then
    raise exception 'Une variante est absente ou répétée';
  end if;

  for line in select value from jsonb_array_elements(p_lignes)
  loop
    article_id_value := (line ->> 'article_id')::bigint;
    cost_value := (line ->> 'prix_cordonnier_unitaire')::numeric;
    sale_value := (line ->> 'prix_vente_unitaire')::numeric;

    if cost_value < 0 or sale_value < 0 then
      raise exception 'Les prix ne peuvent pas être négatifs';
    end if;

    if not exists (
      select 1 from public.commande_articles
      where id = article_id_value and commande_id = p_commande_id
    ) then
      raise exception 'Variante de commande invalide';
    end if;

    insert into public.commande_article_comptabilite (
      article_id,
      commande_id,
      revendeur_id,
      prix_cordonnier_unitaire,
      prix_vente_unitaire
    ) values (
      article_id_value,
      p_commande_id,
      current_order.revendeur_id,
      cost_value,
      sale_value
    )
    on conflict (article_id) do update
    set prix_cordonnier_unitaire = excluded.prix_cordonnier_unitaire,
        prix_vente_unitaire = excluded.prix_vente_unitaire,
        updated_at = now();
  end loop;

  perform public.refresh_commande_comptabilite(p_commande_id);

  select * into saved_accounting
  from public.commande_comptabilite
  where commande_id = p_commande_id;

  return saved_accounting;
end;
$$;

revoke execute on function public.prepare_commande_article_comptabilite() from public, anon, authenticated;
revoke execute on function public.refresh_commande_comptabilite(bigint) from public, anon, authenticated;
revoke execute on function public.sync_commande_article_comptabilite() from public, anon, authenticated;
revoke execute on function public.save_commande_article_comptabilite(bigint, jsonb) from public, anon;
grant execute on function public.save_commande_article_comptabilite(bigint, jsonb) to authenticated;
