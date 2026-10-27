create or replace function public.update_client_delivery_status(
  p_commande_id bigint,
  p_statut text
)
returns public.client_commande_livraisons
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  order_status text;
  saved_delivery public.client_commande_livraisons%rowtype;
begin
  if p_statut not in ('recue', 'confirmee', 'livree') then
    raise exception 'Statut de livraison invalide';
  end if;

  select revendeur_id, statut
  into order_owner, order_status
  from public.commandes
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  if auth.uid() is null or (
    order_owner is distinct from auth.uid()
    and public.current_user_role() is distinct from 'admin'
  ) then
    raise exception 'Accès refusé à la livraison de cette commande';
  end if;

  update public.client_commande_livraisons
  set statut = p_statut
  where commande_id = p_commande_id
  returning * into saved_delivery;

  if not found then
    raise exception 'Aucune information de livraison enregistrée pour cette commande';
  end if;

  if p_statut = 'livree' and order_status = 'prete' then
    perform public.change_commande_status(p_commande_id, 'livree');
  end if;

  return saved_delivery;
end;
$$;

revoke execute on function public.update_client_delivery_status(bigint, text) from public, anon;
grant execute on function public.update_client_delivery_status(bigint, text) to authenticated;
