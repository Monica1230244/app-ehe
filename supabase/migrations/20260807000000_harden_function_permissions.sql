revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_commande_numero() from public, anon, authenticated;
revoke execute on function public.add_initial_commande_status() from public, anon, authenticated;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.can_access_commande(bigint) from public, anon;
revoke execute on function public.can_manage_commande(bigint) from public, anon;
revoke execute on function public.change_commande_status(bigint, text) from public, anon;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_access_commande(bigint) to authenticated;
grant execute on function public.can_manage_commande(bigint) to authenticated;
grant execute on function public.change_commande_status(bigint, text) to authenticated;
