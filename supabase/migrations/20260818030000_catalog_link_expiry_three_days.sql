alter table public.clients
alter column catalogue_token_expires_at set default (now() + interval '3 days');

update public.clients
set catalogue_token_expires_at = now() + interval '3 days'
where catalogue_token_expires_at > now() + interval '3 days';

create or replace function public.renew_client_catalogue_link(p_client_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  client_owner uuid;
  client_token uuid;
  client_expiry timestamptz;
  catalog_token uuid;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'Accès refusé';
  end if;

  select revendeur_id into client_owner
  from public.clients
  where id = p_client_id
    and (revendeur_id = auth.uid() or public.current_user_role() = 'admin');

  if client_owner is null then
    raise exception 'Client introuvable';
  end if;

  update public.clients
  set catalogue_token = gen_random_uuid(),
      catalogue_token_expires_at = now() + interval '3 days',
      updated_at = now()
  where id = p_client_id
  returning catalogue_token, catalogue_token_expires_at
  into client_token, client_expiry;

  insert into public.catalogue_partages (revendeur_id, actif)
  values (client_owner, true)
  on conflict (revendeur_id) do update
  set actif = true,
      updated_at = now()
  returning token into catalog_token;

  return jsonb_build_object(
    'token', client_token,
    'expires_at', client_expiry,
    'catalogue_token', catalog_token
  );
end;
$$;

revoke execute on function public.renew_client_catalogue_link(bigint) from public, anon;
grant execute on function public.renew_client_catalogue_link(bigint) to authenticated;
