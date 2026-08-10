create or replace function public.update_commande_details(
  p_commande_id bigint,
  p_details jsonb
)
returns public.commandes
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.commandes%rowtype;
  updated_order public.commandes%rowtype;
  requested_client_id bigint;
  requested_cordonnier_id uuid;
  requested_modele_stock_id bigint;
  requested_quantite integer;
begin
  select * into current_order
  from public.commandes
  where id = p_commande_id
  for update;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  if not public.is_manager()
    or (public.current_user_role() <> 'admin' and current_order.revendeur_id is distinct from auth.uid()) then
    raise exception 'Accès refusé';
  end if;

  if current_order.statut <> 'en_attente' then
    raise exception 'Seule une commande en attente peut être corrigée';
  end if;

  requested_client_id := (p_details ->> 'client_id')::bigint;
  requested_cordonnier_id := (p_details ->> 'cordonnier_id')::uuid;
  requested_modele_stock_id := nullif(p_details ->> 'modele_stock_id', '')::bigint;
  requested_quantite := (p_details ->> 'quantite')::integer;

  if nullif(btrim(p_details ->> 'modele'), '') is null
    or nullif(btrim(p_details ->> 'pointure'), '') is null
    or nullif(btrim(p_details ->> 'couleur'), '') is null
    or nullif(btrim(p_details ->> 'matiere'), '') is null
    or nullif(btrim(p_details ->> 'semelle'), '') is null
    or requested_quantite < 1 then
    raise exception 'Les informations obligatoires de la commande sont invalides';
  end if;

  if not exists (
    select 1 from public.clients
    where id = requested_client_id
      and (revendeur_id = current_order.revendeur_id or public.current_user_role() = 'admin')
  ) then
    raise exception 'Client invalide';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = requested_cordonnier_id and role = 'cordonnier' and is_active = true
  ) then
    raise exception 'Cordonnier invalide';
  end if;

  if requested_modele_stock_id is not null and not exists (
    select 1 from public.modeles_stock
    where id = requested_modele_stock_id
      and (revendeur_id = current_order.revendeur_id or public.current_user_role() = 'admin')
  ) then
    raise exception 'Modèle de stock invalide';
  end if;

  update public.commandes
  set client_id = requested_client_id,
      cordonnier_id = requested_cordonnier_id,
      modele_stock_id = requested_modele_stock_id,
      modele = btrim(p_details ->> 'modele'),
      pointure = btrim(p_details ->> 'pointure'),
      couleur = btrim(p_details ->> 'couleur'),
      matiere = btrim(p_details ->> 'matiere'),
      semelle = btrim(p_details ->> 'semelle'),
      quantite = requested_quantite,
      date_souhaitee = nullif(p_details ->> 'date_souhaitee', '')::date,
      observations = nullif(btrim(p_details ->> 'observations'), '')
  where id = p_commande_id
  returning * into updated_order;

  return updated_order;
end;
$$;

revoke execute on function public.update_commande_details(bigint, jsonb) from public, anon;
grant execute on function public.update_commande_details(bigint, jsonb) to authenticated;
