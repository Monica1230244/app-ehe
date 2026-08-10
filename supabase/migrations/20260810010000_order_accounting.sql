create table if not exists public.commande_comptabilite (
  commande_id bigint primary key references public.commandes(id) on delete cascade,
  revendeur_id uuid not null references public.profiles(id) on delete restrict,
  prix_cordonnier numeric(14, 2) not null check (prix_cordonnier >= 0),
  prix_vente numeric(14, 2) not null check (prix_vente >= 0),
  benefice numeric(14, 2) generated always as (prix_vente - prix_cordonnier) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commande_comptabilite_revendeur
on public.commande_comptabilite(revendeur_id);

create or replace function public.prepare_commande_comptabilite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
begin
  select revendeur_id into order_owner
  from public.commandes
  where id = new.commande_id;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  if auth.uid() is null or (
    order_owner is distinct from auth.uid()
    and public.current_user_role() is distinct from 'admin'
  ) then
    raise exception 'Accès refusé à la comptabilité de cette commande';
  end if;

  new.revendeur_id := order_owner;
  return new;
end;
$$;

drop trigger if exists prepare_commande_comptabilite on public.commande_comptabilite;
create trigger prepare_commande_comptabilite
before insert or update on public.commande_comptabilite
for each row execute function public.prepare_commande_comptabilite();

drop trigger if exists commande_comptabilite_updated_at on public.commande_comptabilite;
create trigger commande_comptabilite_updated_at
before update on public.commande_comptabilite
for each row execute function public.update_updated_at();

alter table public.commande_comptabilite enable row level security;

drop policy if exists commande_comptabilite_select on public.commande_comptabilite;
create policy commande_comptabilite_select on public.commande_comptabilite
for select to authenticated
using (revendeur_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists commande_comptabilite_insert on public.commande_comptabilite;
create policy commande_comptabilite_insert on public.commande_comptabilite
for insert to authenticated
with check (
  public.can_manage_commande(commande_id)
  and (revendeur_id = auth.uid() or public.current_user_role() = 'admin')
);

drop policy if exists commande_comptabilite_update on public.commande_comptabilite;
create policy commande_comptabilite_update on public.commande_comptabilite
for update to authenticated
using (revendeur_id = auth.uid() or public.current_user_role() = 'admin')
with check (
  public.can_manage_commande(commande_id)
  and (revendeur_id = auth.uid() or public.current_user_role() = 'admin')
);

grant select, insert, update on public.commande_comptabilite to authenticated;
revoke execute on function public.prepare_commande_comptabilite() from public, anon, authenticated;
