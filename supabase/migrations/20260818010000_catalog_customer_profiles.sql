alter table public.clients
add column if not exists catalogue_token uuid;

update public.clients
set catalogue_token = gen_random_uuid()
where catalogue_token is null;

alter table public.clients
alter column catalogue_token set default gen_random_uuid();

alter table public.clients
alter column catalogue_token set not null;

create unique index if not exists clients_catalogue_token_key
on public.clients(catalogue_token);

alter table public.demandes_catalogue
add column if not exists client_id bigint references public.clients(id) on delete set null;

create index if not exists idx_demandes_catalogue_client
on public.demandes_catalogue(client_id);

create or replace function public.sync_catalogue_request_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
  matched_client_id bigint;
begin
  normalized_phone := regexp_replace(btrim(new.telephone), '[^0-9]', '', 'g');

  perform pg_advisory_xact_lock(
    hashtextextended(new.revendeur_id::text || ':' || normalized_phone, 0)
  );

  if new.client_id is not null then
    select id into matched_client_id
    from public.clients
    where id = new.client_id and revendeur_id = new.revendeur_id;
  end if;

  if matched_client_id is null then
    select id into matched_client_id
    from public.clients
    where revendeur_id = new.revendeur_id
      and regexp_replace(telephone, '[^0-9]', '', 'g') = normalized_phone
    order by created_at
    limit 1;
  end if;

  if matched_client_id is null then
    insert into public.clients (revendeur_id, nom, telephone)
    values (new.revendeur_id, btrim(new.nom_client), btrim(new.telephone))
    returning id into matched_client_id;
  else
    update public.clients
    set nom = btrim(new.nom_client),
        telephone = btrim(new.telephone)
    where id = matched_client_id;
  end if;

  new.client_id := matched_client_id;
  return new;
end;
$$;

drop trigger if exists demandes_catalogue_sync_client on public.demandes_catalogue;
create trigger demandes_catalogue_sync_client
before insert or update of nom_client, telephone, client_id on public.demandes_catalogue
for each row execute function public.sync_catalogue_request_client();

do $$
declare
  request_row record;
  matched_client_id bigint;
  normalized_phone text;
begin
  for request_row in
    select id, revendeur_id, nom_client, telephone
    from public.demandes_catalogue
    where client_id is null
    order by id
  loop
    normalized_phone := regexp_replace(btrim(request_row.telephone), '[^0-9]', '', 'g');

    select id into matched_client_id
    from public.clients
    where revendeur_id = request_row.revendeur_id
      and regexp_replace(telephone, '[^0-9]', '', 'g') = normalized_phone
    order by created_at
    limit 1;

    if matched_client_id is null then
      insert into public.clients (revendeur_id, nom, telephone)
      values (request_row.revendeur_id, btrim(request_row.nom_client), btrim(request_row.telephone))
      returning id into matched_client_id;
    end if;

    update public.demandes_catalogue
    set client_id = matched_client_id
    where id = request_row.id;
  end loop;
end;
$$;

create or replace function public.get_catalogue_client(
  p_catalogue_token uuid,
  p_client_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nom_client', client.nom,
    'telephone', client.telephone
  )
  from public.catalogue_partages as partage
  join public.clients as client
    on client.revendeur_id = partage.revendeur_id
  where partage.token = p_catalogue_token
    and partage.actif = true
    and client.catalogue_token = p_client_token
  limit 1;
$$;

create or replace function public.submit_demande_catalogue_v2(
  p_token uuid,
  p_client_token uuid,
  p_nom_client text,
  p_telephone text,
  p_note text,
  p_articles jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  known_client_id bigint;
  created_request_id bigint;
  request_line jsonb;
  request_position bigint;
  model_id bigint;
  requested_quantity integer;
  line_count integer;
begin
  select revendeur_id into order_owner
  from public.catalogue_partages
  where token = p_token and actif = true;

  if order_owner is null then
    raise exception 'Ce lien de catalogue est invalide ou désactivé';
  end if;

  if p_client_token is not null then
    select id into known_client_id
    from public.clients
    where catalogue_token = p_client_token and revendeur_id = order_owner;
  end if;

  if char_length(btrim(coalesce(p_nom_client, ''))) < 2
    or char_length(btrim(coalesce(p_telephone, ''))) < 6 then
    raise exception 'Le nom et le téléphone sont obligatoires';
  end if;

  if jsonb_typeof(p_articles) is distinct from 'array' then
    raise exception 'Le panier est invalide';
  end if;

  line_count := jsonb_array_length(p_articles);
  if line_count < 1 or line_count > 50 then
    raise exception 'Le panier doit contenir entre 1 et 50 modèles';
  end if;

  if (
    select count(distinct (value ->> 'modele_stock_id')::bigint)
    from jsonb_array_elements(p_articles)
  ) <> line_count then
    raise exception 'Un même modèle ne peut apparaître qu’une fois dans le panier';
  end if;

  for request_line, request_position in
    select value, ordinality
    from jsonb_array_elements(p_articles) with ordinality
  loop
    model_id := (request_line ->> 'modele_stock_id')::bigint;
    requested_quantity := (request_line ->> 'quantite')::integer;

    if requested_quantity < 1 or requested_quantity > 20 then
      raise exception 'La quantité de la ligne % est invalide', request_position;
    end if;

    if not exists (
      select 1 from public.modeles_stock
      where id = model_id and revendeur_id = order_owner and is_active = true
    ) then
      raise exception 'Le modèle de la ligne % n’est plus disponible', request_position;
    end if;
  end loop;

  insert into public.demandes_catalogue (
    revendeur_id,
    client_id,
    nom_client,
    telephone,
    note
  ) values (
    order_owner,
    known_client_id,
    btrim(p_nom_client),
    btrim(p_telephone),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into created_request_id;

  for request_line, request_position in
    select value, ordinality
    from jsonb_array_elements(p_articles) with ordinality
  loop
    insert into public.demande_catalogue_articles (
      demande_id,
      modele_stock_id,
      quantite,
      pointure,
      couleur,
      position
    ) values (
      created_request_id,
      (request_line ->> 'modele_stock_id')::bigint,
      (request_line ->> 'quantite')::integer,
      nullif(btrim(coalesce(request_line ->> 'pointure', '')), ''),
      nullif(btrim(coalesce(request_line ->> 'couleur', '')), ''),
      request_position
    );
  end loop;

  insert into public.notifications (user_id, demande_catalogue_id, message)
  values (
    order_owner,
    created_request_id,
    'Nouvelle demande de ' || btrim(p_nom_client) || ' depuis le catalogue (' || line_count || ' modèle' || case when line_count > 1 then 's' else '' end || ').'
  );

  return created_request_id;
end;
$$;

revoke execute on function public.get_catalogue_client(uuid, uuid) from public;
grant execute on function public.get_catalogue_client(uuid, uuid) to anon, authenticated;

revoke execute on function public.submit_demande_catalogue_v2(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.submit_demande_catalogue_v2(uuid, uuid, text, text, text, jsonb) to anon, authenticated;
