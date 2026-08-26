create or replace function public.delete_commande(p_commande_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.commandes%rowtype;
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

  delete from public.commandes
  where id = p_commande_id;
end;
$$;

revoke execute on function public.delete_commande(bigint) from public, anon;
grant execute on function public.delete_commande(bigint) to authenticated;
